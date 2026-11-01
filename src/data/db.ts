import Dexie from 'dexie';
import type { EntityTable } from 'dexie';
import { canConsume, currentMetres, currentQty } from '../domain/stock';
import type { RuleConfig } from '../domain/rules/common';
import type { Template, Trip } from '../domain/trip';
import type { Gear, Order, StockLog } from '../domain/types';
import type { Parsed } from './excel';

/** Bytes rather than a Blob: WebKit can refuse to store Blobs in IndexedDB. */
export interface Photo {
  gearId: string;
  bytes?: ArrayBuffer;
  type?: string;
  blob?: Blob;
  updatedAt?: number;
}

export const photoBlob = (p: Photo) => p.blob ?? new Blob([p.bytes ?? new ArrayBuffer(0)], { type: p.type });

export interface Setting {
  key: string;
  value: string | number;
  updatedAt?: number;
}

export const SYNC_TABLES = ['gear', 'orders', 'stockLog', 'photos', 'settings', 'trips'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** A row waiting for upload; rev tells whether it changed again while the upload ran. */
export interface Outbox {
  key: string;
  table: SyncTable;
  id: string;
  rev: string;
  at: number;
}

/** The losing side of a two-device edit, kept so it can be restored. */
export interface Conflict {
  id: string;
  table: SyncTable;
  rowId: string;
  data: Record<string, unknown>;
  at: number;
}

export const db = new Dexie('tackle-box') as Dexie & {
  gear: EntityTable<Gear, 'id'>;
  orders: EntityTable<Order, 'id'>;
  stockLog: EntityTable<StockLog, 'id'>;
  photos: EntityTable<Photo, 'gearId'>;
  settings: EntityTable<Setting, 'key'>;
  trips: EntityTable<Trip, 'id'>;
  outbox: EntityTable<Outbox, 'key'>;
  conflicts: EntityTable<Conflict, 'id'>;
};

db.version(1).stores({
  gear: 'id, &no, category, status',
  orders: '++id, gearNo',
  stockLog: 'id, gearId',
  photos: 'gearId',
  settings: 'key',
  trips: 'id, at',
});
db.version(2).stores({ outbox: 'key', conflicts: 'id, at' });

const DATA = [db.gear, db.orders, db.stockLog, db.photos, db.settings, db.trips];
export const ALL = [...DATA, db.outbox, db.conflicts];

/** Settings that travel between devices; the rest describe this device only. */
export const SYNCED_SETTINGS = ['config', 'templates', 'lastNo'];

export const queue = (table: SyncTable, id: string | number) =>
  db.outbox.put({ key: `${table}/${id}`, table, id: String(id), rev: crypto.randomUUID(), at: Date.now() });

const queueAll = (table: SyncTable, ids: (string | number)[]) =>
  db.outbox.bulkPut(
    ids.map((id) => ({ key: `${table}/${id}`, table, id: String(id), rev: crypto.randomUUID(), at: Date.now() })),
  );

export async function queueEverything() {
  await db.transaction('rw', ALL, async () => {
    await queueAll('gear', await db.gear.toCollection().primaryKeys());
    await queueAll('orders', (await db.orders.toCollection().primaryKeys()) as number[]);
    await queueAll('stockLog', await db.stockLog.toCollection().primaryKeys());
    await queueAll('photos', await db.photos.toCollection().primaryKeys());
    await queueAll('trips', await db.trips.toCollection().primaryKeys());
    const present = await db.settings.where('key').anyOf(SYNCED_SETTINGS).primaryKeys();
    await queueAll('settings', present);
  });
}

export const getSetting = async (key: string) => (await db.settings.get(key))?.value;
export const setSetting = (key: string, value: string | number) => db.settings.put({ key, value });

export function setSynced(key: string, value: string | number) {
  return db.transaction('rw', db.settings, db.outbox, async () => {
    await db.settings.put({ key, value, updatedAt: Date.now() });
    await queue('settings', key);
  });
}

export async function importData({ gear, orders, extras }: Parsed) {
  await db.transaction('rw', ALL, async () => {
    const existing = await Promise.all([db.gear.count(), db.orders.count(), db.trips.count()]);
    if (existing.some(Boolean)) throw new Error('裝置上已有資料，請先清空再匯入');
    await db.gear.bulkAdd(gear);
    await db.orders.bulkAdd(orders);
    await db.trips.bulkAdd(extras.trips);
    if (extras.config) await setSynced('config', extras.config);
    if (extras.templates) await setSynced('templates', extras.templates);
    await setSetting('importedAt', Date.now());
    await queueEverything();
  });
}

export const saveConfig = (config: RuleConfig) => setSynced('config', JSON.stringify(config));
export const saveTemplates = (list: Template[]) => setSynced('templates', JSON.stringify(list));

export const saveTrip = (trip: Trip) =>
  db.transaction('rw', db.trips, db.outbox, async () => {
    await db.trips.put(trip);
    await queue('trips', trip.id);
  });

/** This device only: the cloud copy stays, and returns on the next sync. */
export const clearAll = () => db.transaction('rw', ALL, () => Promise.all(ALL.map((t) => t.clear())));

export const saveGear = (g: Gear) =>
  db.transaction('rw', db.gear, db.outbox, async () => {
    await db.gear.put({ ...g, updatedAt: Date.now() });
    await queue('gear', g.id);
  });

export async function deleteGear(id: string) {
  await db.transaction('rw', [db.gear, db.stockLog, db.photos, db.outbox], async () => {
    const logs = await db.stockLog.where('gearId').equals(id).primaryKeys();
    await db.gear.delete(id);
    await db.stockLog.bulkDelete(logs);
    await db.photos.delete(id);
    await queue('gear', id);
    await queue('photos', id);
    await queueAll('stockLog', logs);
  });
}

export async function highestNo() {
  const [gear, orders, issued] = await Promise.all([db.gear.toArray(), db.orders.toArray(), getSetting('lastNo')]);
  const used = [
    ...gear.flatMap((g) => [g.no, g.spec.lineNo ?? 0, g.spec.pairRodNo ?? 0]),
    ...orders.map((o) => o.gearNo ?? 0),
  ];
  return Math.max(0, Number(issued) || 0, ...used);
}

/** Numbers are never reused: combos and orders point at them, even after a delete. */
export async function nextNo() {
  const no = (await highestNo()) + 1;
  await setSynced('lastNo', no);
  return no;
}

/** Appends a stock change; running out marks the item 用完. Returns the log id for undo. */
export async function consume(gear: Gear, kind: StockLog['kind'], amount: number) {
  if (!canConsume(gear) || !(amount > 0)) return undefined;
  const entry: StockLog = { id: crypto.randomUUID(), gearId: gear.id, kind, delta: -amount, at: Date.now() };
  await db.transaction('rw', [db.gear, db.stockLog, db.outbox], async () => {
    const logs = await db.stockLog.where('gearId').equals(gear.id).toArray();
    const left = kind === 'm' ? currentMetres(gear, logs) : currentQty(gear, logs);
    if (left === undefined || left < amount) throw new Error(`庫存只剩 ${left ?? 0}`);
    await db.stockLog.add(entry);
    await queue('stockLog', entry.id);
    const remaining = Math.round((left - amount) * 10) / 10;
    if (remaining > 0) return;
    await db.gear.update(gear.id, { status: '用完', updatedAt: Date.now() });
    await queue('gear', gear.id);
  });
  return entry.id;
}

export async function adjustStock(gearId: string, kind: StockLog['kind'], delta: number) {
  if (!delta) return;
  const id = crypto.randomUUID();
  await db.transaction('rw', db.stockLog, db.outbox, async () => {
    await db.stockLog.add({ id, gearId, kind, delta, at: Date.now() });
    await queue('stockLog', id);
  });
}

export async function undoConsume(logId: string, gear: Gear) {
  await db.transaction('rw', [db.gear, db.stockLog, db.outbox], async () => {
    await db.stockLog.delete(logId);
    await db.gear.update(gear.id, { status: gear.status, updatedAt: Date.now() });
    await queue('stockLog', logId);
    await queue('gear', gear.id);
  });
}

export async function markArrived(gear: Gear) {
  await db.transaction('rw', [db.gear, db.orders, db.outbox], async () => {
    const updatedAt = Date.now();
    await db.gear.update(gear.id, { status: '持有', updatedAt });
    await queue('gear', gear.id);
    const orders = db.orders.where('gearNo').equals(gear.no);
    await queueAll('orders', (await orders.primaryKeys()) as number[]);
    await orders.modify({ status: '已到貨', updatedAt });
  });
}

/** Firestore documents stop at 1 MiB, and photos sync as documents. */
export const MAX_PHOTO_BYTES = 700_000;

/** Longest side 1280px, re-encoded as JPEG so a phone photo stays small. */
export async function savePhoto(gearId: string, file: Blob) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let blob: Blob | null = null;
  for (const quality of [0.8, 0.65, 0.5, 0.35]) {
    blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_PHOTO_BYTES) break;
  }
  if (!blob) throw new Error('照片處理失敗');
  if (blob.size > MAX_PHOTO_BYTES) throw new Error('照片太大，請換一張');
  const bytes = await blob.arrayBuffer();
  await db.transaction('rw', db.photos, db.outbox, async () => {
    await db.photos.put({ gearId, bytes, type: blob.type, updatedAt: Date.now() });
    await queue('photos', gearId);
  });
}
