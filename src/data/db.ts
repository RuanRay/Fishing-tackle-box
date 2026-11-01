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
}

export const photoBlob = (p: Photo) => p.blob ?? new Blob([p.bytes ?? new ArrayBuffer(0)], { type: p.type });

export interface Setting {
  key: string;
  value: string | number;
}

export const db = new Dexie('tackle-box') as Dexie & {
  gear: EntityTable<Gear, 'id'>;
  orders: EntityTable<Order, 'id'>;
  stockLog: EntityTable<StockLog, 'id'>;
  photos: EntityTable<Photo, 'gearId'>;
  settings: EntityTable<Setting, 'key'>;
  trips: EntityTable<Trip, 'id'>;
};

db.version(1).stores({
  gear: 'id, &no, category, status',
  orders: '++id, gearNo',
  stockLog: 'id, gearId',
  photos: 'gearId',
  settings: 'key',
  trips: 'id, at',
});

const ALL = [db.gear, db.orders, db.stockLog, db.photos, db.settings, db.trips];

export const getSetting = async (key: string) => (await db.settings.get(key))?.value;
export const setSetting = (key: string, value: string | number) => db.settings.put({ key, value });

export async function importData({ gear, orders, extras }: Parsed) {
  await db.transaction('rw', ALL, async () => {
    const existing = await Promise.all([db.gear.count(), db.orders.count(), db.trips.count()]);
    if (existing.some(Boolean)) throw new Error('裝置上已有資料，請先清空再匯入');
    await db.gear.bulkAdd(gear);
    await db.orders.bulkAdd(orders);
    await db.trips.bulkAdd(extras.trips);
    if (extras.config) await setSetting('config', extras.config);
    if (extras.templates) await setSetting('templates', extras.templates);
    await setSetting('lastBackupAt', Date.now());
  });
}

export const saveConfig = (config: RuleConfig) => setSetting('config', JSON.stringify(config));
export const saveTemplates = (list: Template[]) => setSetting('templates', JSON.stringify(list));
export const saveTrip = (trip: Trip) => db.trips.put(trip);

export const clearAll = () => db.transaction('rw', ALL, () => Promise.all(ALL.map((t) => t.clear())));

export const saveGear = (g: Gear) => db.gear.put({ ...g, updatedAt: Date.now() });

export async function deleteGear(id: string) {
  await db.transaction('rw', [db.gear, db.stockLog, db.photos], async () => {
    await db.gear.delete(id);
    await db.stockLog.where('gearId').equals(id).delete();
    await db.photos.delete(id);
  });
}

/** Numbers are never reused: combos and orders point at them, even after a delete. */
export async function nextNo() {
  const [gear, orders, issued] = await Promise.all([db.gear.toArray(), db.orders.toArray(), getSetting('lastNo')]);
  const used = [
    ...gear.flatMap((g) => [g.no, g.spec.lineNo ?? 0, g.spec.pairRodNo ?? 0]),
    ...orders.map((o) => o.gearNo ?? 0),
  ];
  const no = Math.max(0, Number(issued) || 0, ...used) + 1;
  await setSetting('lastNo', no);
  return no;
}

/** Appends a stock change; running out marks the item 用完. Returns the log id for undo. */
export async function consume(gear: Gear, kind: StockLog['kind'], amount: number) {
  if (!canConsume(gear) || !(amount > 0)) return undefined;
  const entry: StockLog = { id: crypto.randomUUID(), gearId: gear.id, kind, delta: -amount, at: Date.now() };
  await db.transaction('rw', [db.gear, db.stockLog], async () => {
    const logs = await db.stockLog.where('gearId').equals(gear.id).toArray();
    const left = kind === 'm' ? currentMetres(gear, logs) : currentQty(gear, logs);
    if (left === undefined || left < amount) throw new Error(`庫存只剩 ${left ?? 0}`);
    await db.stockLog.add(entry);
    const remaining = Math.round((left - amount) * 10) / 10;
    if (remaining <= 0) await db.gear.update(gear.id, { status: '用完', updatedAt: Date.now() });
  });
  return entry.id;
}

export async function adjustStock(gearId: string, kind: StockLog['kind'], delta: number) {
  if (delta) await db.stockLog.add({ id: crypto.randomUUID(), gearId, kind, delta, at: Date.now() });
}

export async function undoConsume(logId: string, gear: Gear) {
  await db.transaction('rw', [db.gear, db.stockLog], async () => {
    await db.stockLog.delete(logId);
    await db.gear.update(gear.id, { status: gear.status, updatedAt: Date.now() });
  });
}

export async function markArrived(gear: Gear) {
  await db.transaction('rw', [db.gear, db.orders], async () => {
    await db.gear.update(gear.id, { status: '持有', updatedAt: Date.now() });
    await db.orders.where('gearNo').equals(gear.no).modify({ status: '已到貨' });
  });
}

/** Longest side 1280px, re-encoded as JPEG so a phone photo stays small. */
export async function savePhoto(gearId: string, file: Blob) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.8));
  if (!blob) throw new Error('照片處理失敗');
  await db.photos.put({ gearId, bytes: await blob.arrayBuffer(), type: blob.type });
}
