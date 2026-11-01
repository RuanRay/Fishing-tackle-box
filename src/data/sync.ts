import { ALL, db, getSetting, highestNo, queue, queueEverything, setSetting, setSynced } from './db';
import type { Outbox, SyncTable } from './db';

type Row = Record<string, unknown>;

export interface RemoteDoc {
  table: SyncTable;
  id: string;
  data: Row | null; // null is a tombstone: documents are never hard-deleted, so other devices learn of it
  updatedAt: number;
  device?: string; // which device wrote it, so a device can ignore its own uploads
}

export interface Remote {
  uid: string;
  isEmpty(): Promise<boolean>;
  pull(since: number): Promise<{ docs: RemoteDoc[]; cursor: number }>;
  push(docs: RemoteDoc[]): Promise<void>;
}

export type SyncResult = 'done' | 'choose';

const BATCH_SIZE = 200;
const table = (name: SyncTable) => db[name];
const rowKey = (name: SyncTable, id: string) => (name === 'orders' ? Number(id) : id);

function stamp(name: SyncTable, row: Row) {
  const time = name === 'stockLog' || name === 'trips' ? row.at : row.updatedAt;
  return typeof time === 'number' ? time : 0;
}

const getRow = (name: SyncTable, id: string) => table(name).get(rowKey(name, id) as never) as Promise<Row | undefined>;

async function isLocalEmpty() {
  const counts = await Promise.all([db.gear.count(), db.orders.count(), db.trips.count()]);
  return counts.every((n) => n === 0);
}

/** Two devices can each create the next number offline; the local row moves aside. */
async function freeNumber(incoming: Row) {
  const holder = await db.gear
    .where('no')
    .equals(incoming.no as number)
    .first();
  if (!holder || holder.id === incoming.id) return;
  const no = (await highestNo()) + 1;
  const updatedAt = Date.now();
  await db.gear.update(holder.id, { no, updatedAt });
  await queue('gear', holder.id);
  await setSynced('lastNo', no);
  for (const order of await db.orders.where('gearNo').equals(holder.no).toArray()) {
    await db.orders.update(order.id!, { gearNo: no, updatedAt });
    await queue('orders', order.id!);
  }
  for (const g of await db.gear.toArray()) {
    const lineNo = g.spec.lineNo === holder.no ? no : g.spec.lineNo;
    const pairRodNo = g.spec.pairRodNo === holder.no ? no : g.spec.pairRodNo;
    if (lineNo === g.spec.lineNo && pairRodNo === g.spec.pairRodNo) continue;
    await db.gear.update(g.id, { spec: { ...g.spec, lineNo, pairRodNo }, updatedAt });
    await queue('gear', g.id);
  }
}

async function write(doc: RemoteDoc) {
  if (!doc.data) return table(doc.table).delete(rowKey(doc.table, doc.id) as never);
  if (doc.table === 'gear') await freeNumber(doc.data);
  return table(doc.table).put(doc.data as never);
}

/** Logs and trips are never edited, and photos are too large to keep twice. */
const EDITABLE: SyncTable[] = ['gear', 'orders', 'settings'];

/** The id comes from the content, so re-reading the same document cannot pile up copies. */
async function keepConflict(name: SyncTable, rowId: string, data: Row | null) {
  if (!data || !EDITABLE.includes(name)) return;
  const id = `${name}/${rowId}/${stamp(name, data)}`;
  await db.conflicts.put({ id, table: name, rowId, data, at: Date.now() });
}

/** A counter must only move forward, so the larger value wins rather than the newer one. */
async function applyLastNo(doc: RemoteDoc, local: Row | undefined) {
  const mine = Number(local?.value) || 0;
  const theirs = Number(doc.data?.value) || 0;
  if (theirs > mine) {
    await write(doc);
    await db.outbox.delete('settings/lastNo');
  } else if (mine > theirs) {
    await queue('settings', 'lastNo');
  }
}

async function deviceId() {
  const known = await getSetting('deviceId');
  if (typeof known === 'string') return known;
  const id = crypto.randomUUID();
  await setSetting('deviceId', id);
  return id;
}

async function apply(doc: RemoteDoc) {
  const key = `${doc.table}/${doc.id}`;
  const [local, pending] = await Promise.all([getRow(doc.table, doc.id), db.outbox.get(key)]);
  if (key === 'settings/lastNo') return applyLastNo(doc, local);
  if (!pending) {
    if (local ? stamp(doc.table, local) !== doc.updatedAt || !doc.data : doc.data) await write(doc);
    return;
  }
  // No row means it was deleted here, so the queue entry carries the time of that delete.
  const mine = local ? stamp(doc.table, local) : pending.at;
  if (mine === doc.updatedAt) return;
  if (doc.updatedAt > mine) {
    await keepConflict(doc.table, doc.id, local ?? null);
    await write(doc);
    await db.outbox.delete(key);
  } else {
    await keepConflict(doc.table, doc.id, doc.data);
  }
}

async function pullChanges(remote: Remote) {
  const since = Number(await getSetting('syncCursor')) || 0;
  const { docs, cursor } = await remote.pull(since);
  const me = await deviceId();
  await db.transaction('rw', ALL, async () => {
    for (const doc of docs) if (doc.device !== me) await apply(doc);
    await setSetting('syncCursor', cursor);
  });
}

async function toDoc({ table: name, id, at }: Outbox, device: string): Promise<RemoteDoc> {
  const row = await getRow(name, id);
  if (!row) return { table: name, id, data: null, updatedAt: at, device }; // at is when it was deleted
  const data = { ...row };
  if (name === 'photos' && data.blob instanceof Blob) {
    data.bytes = await data.blob.arrayBuffer();
    delete data.blob;
  }
  return { table: name, id, data, updatedAt: stamp(name, row), device };
}

async function sent(entries: { key: string; rev: string }[]) {
  await db.transaction('rw', db.outbox, async () => {
    for (const { key, rev } of entries) {
      if ((await db.outbox.get(key))?.rev === rev) await db.outbox.delete(key);
    }
  });
}

/** Returns how many photos could not be uploaded; they stay queued without blocking the rest. */
async function pushChanges(remote: Remote) {
  const entries = await db.outbox.toArray();
  const me = await deviceId();
  const light = entries.filter((e) => e.table !== 'photos');
  for (let i = 0; i < light.length; i += BATCH_SIZE) {
    const chunk = light.slice(i, i + BATCH_SIZE);
    await remote.push(await Promise.all(chunk.map((e) => toDoc(e, me))));
    await sent(chunk);
  }
  let failed = 0;
  for (const entry of entries.filter((e) => e.table === 'photos')) {
    try {
      await remote.push([await toDoc(entry, me)]);
      await sent([entry]);
    } catch {
      failed += 1;
    }
  }
  return failed;
}

async function link(uid: string) {
  await setSetting('syncUser', uid);
  await setSetting('syncCursor', 0);
}

let running: Promise<{ result: SyncResult; failed: number }> | undefined;

async function run(remote: Remote): Promise<{ result: SyncResult; failed: number }> {
  if ((await getSetting('syncUser')) !== remote.uid) {
    const [cloudEmpty, localEmpty] = await Promise.all([remote.isEmpty(), isLocalEmpty()]);
    if (!cloudEmpty && !localEmpty) return { result: 'choose', failed: 0 };
    if (cloudEmpty) await queueEverything();
    await link(remote.uid);
  }
  await pullChanges(remote);
  const failed = await pushChanges(remote);
  return { result: 'done', failed };
}

/** Pull first: uploading blindly could overwrite a newer edit from the other device. */
export function syncNow(remote: Remote) {
  running ??= run(remote).finally(() => (running = undefined));
  return running;
}

/** First link with data on both sides. The cloud version replaces this device. */
export async function useCloudData(remote: Remote) {
  await db.transaction('rw', ALL, () => Promise.all(ALL.map((t) => t.clear())));
  await link(remote.uid);
  return syncNow(remote);
}

/** First link with data on both sides. This device replaces the cloud version. */
export async function useLocalData(remote: Remote) {
  const { docs } = await remote.pull(0);
  const device = await deviceId();
  const kept = await Promise.all(docs.map((d) => getRow(d.table, d.id)));
  const stale = docs.filter((d, i) => d.data && !kept[i]);
  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    const updatedAt = Date.now();
    await remote.push(stale.slice(i, i + BATCH_SIZE).map((d) => ({ ...d, data: null, updatedAt, device })));
  }
  await queueEverything();
  await link(remote.uid);
  await setSetting('syncCursor', Date.now());
  return syncNow(remote);
}

export async function restoreConflict(id: string) {
  await db.transaction('rw', ALL, async () => {
    const conflict = await db.conflicts.get(id);
    if (!conflict) return;
    const data = { ...conflict.data, updatedAt: Date.now() };
    if (conflict.table === 'gear') await freeNumber(data);
    await table(conflict.table).put(data as never);
    await queue(conflict.table, conflict.rowId);
    await db.conflicts.delete(id);
  });
}

export const dropConflict = (id: string) => db.conflicts.delete(id);
