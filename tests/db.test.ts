import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  adjustStock,
  clearAll,
  consume,
  db,
  deleteGear,
  importData,
  photoBlob,
  markArrived,
  nextNo,
  undoConsume,
} from '../src/data/db';
import { currentQty } from '../src/domain/stock';
import type { Gear } from '../src/domain/types';

const gear = (over: Partial<Gear> = {}): Gear => ({
  id: crypto.randomUUID(),
  no: 1,
  category: '鉤',
  name: 'x',
  qty: 2,
  status: '持有',
  consumable: true,
  spec: {},
  specRows: [],
  updatedAt: 0,
  ...over,
});
const fresh = async (g: Gear) => (await db.gear.get(g.id))!;

beforeEach(clearAll);

describe('db', () => {
  it('does not count an import as a backup', async () => {
    await importData({ gear: [gear()], orders: [], extras: { trips: [] } });
    expect(await db.settings.get('lastBackupAt')).toBeUndefined();
    expect(await db.settings.get('importedAt')).toBeDefined();
  });

  it('refuses to import over existing data', async () => {
    await importData({ gear: [gear()], orders: [], extras: { trips: [] } });
    await expect(importData({ gear: [gear({ no: 2 })], orders: [], extras: { trips: [] } })).rejects.toThrow(
      '已有資料',
    );
    expect(await db.gear.count()).toBe(1);
  });

  it('marks the item used up at zero and refuses to go below', async () => {
    const g = gear();
    await importData({ gear: [g], orders: [], extras: { trips: [] } });
    await consume(g, 'qty', 1);
    await consume(g, 'qty', 1);
    const after = await fresh(g);
    expect(after.status).toBe('用完');
    expect(currentQty(after, await db.stockLog.toArray())).toBe(0);
    expect(await consume(after, 'qty', 1)).toBeUndefined();
  });

  it('marks a line used up when what is left rounds to zero', async () => {
    const line = gear({ category: '釣線', qty: 1, spec: { remainM: 10 } });
    await importData({ gear: [line], orders: [], extras: { trips: [] } });
    await consume(line, 'm', 9.96);
    expect((await fresh(line)).status).toBe('用完');
  });

  it('undo restores both the amount and the status', async () => {
    const g = gear({ qty: 1 });
    await importData({ gear: [g], orders: [], extras: { trips: [] } });
    const logId = await consume(g, 'qty', 1);
    await undoConsume(logId!, g);
    expect((await fresh(g)).status).toBe('持有');
    expect(await db.stockLog.count()).toBe(0);
  });

  it('never reuses the number of deleted gear', async () => {
    const g = gear({ no: 5 });
    await importData({ gear: [g], orders: [], extras: { trips: [] } });
    expect(await nextNo()).toBe(6);
    await deleteGear(g.id);
    expect(await nextNo()).toBe(7);
  });

  it('derives new numbers from orders and links after a restore', async () => {
    const order = {
      orderNo: 'o',
      platform: '網購',
      date: 'd',
      shop: 's',
      item: 'i',
      qty: 1,
      subtotal: 1,
      status: '已完成',
      counted: true,
      gearNo: 70,
    };
    const reel = gear({ no: 2, spec: { lineNo: 80 } });
    await importData({ gear: [reel], orders: [order], extras: { trips: [] } });
    expect(await nextNo()).toBe(81);
  });

  it('refuses to import when only orders or trips remain', async () => {
    const trip = { id: 't', name: '浮釣', at: 1, items: [] };
    await importData({ gear: [], orders: [], extras: { trips: [trip] } });
    await expect(importData({ gear: [gear()], orders: [], extras: { trips: [] } })).rejects.toThrow('已有資料');
  });

  it('restores settings and trips from a backup', async () => {
    const trips = [{ id: 't', name: '浮釣', at: 1, items: [] }];
    await importData({ gear: [gear()], orders: [], extras: { config: '{"rate":5}', templates: '[]', trips } });
    expect(await db.trips.count()).toBe(1);
    expect((await db.settings.get('config'))?.value).toBe('{"rate":5}');
  });

  it('reads photos stored as bytes and as older Blobs', () => {
    const fromBytes = photoBlob({ gearId: 'a', bytes: new Uint8Array([1, 2]).buffer, type: 'image/jpeg' });
    expect([fromBytes.type, fromBytes.size]).toEqual(['image/jpeg', 2]);
    expect(photoBlob({ gearId: 'b', blob: new Blob(['abc']) }).size).toBe(3);
  });

  it('a recount is appended as a stock change', async () => {
    const g = gear({ qty: 10 });
    await importData({ gear: [g], orders: [], extras: { trips: [] } });
    await consume(g, 'qty', 1);
    await adjustStock(g.id, 'qty', 3);
    await adjustStock(g.id, 'qty', 0);
    const rows = await db.stockLog.toArray();
    expect(rows).toHaveLength(2);
    expect(currentQty(g, rows)).toBe(12);
  });

  it('arrival moves gear to held and updates its order', async () => {
    const g = gear({ status: '在途', no: 7 });
    const order = {
      orderNo: 'o',
      platform: '網購',
      date: 'd',
      shop: 's',
      item: 'i',
      qty: 1,
      subtotal: 1,
      status: '運送中',
      counted: true,
      gearNo: 7,
    };
    await importData({ gear: [g], orders: [order], extras: { trips: [] } });
    await markArrived(g);
    expect((await fresh(g)).status).toBe('持有');
    expect((await db.orders.toArray())[0]?.status).toBe('已到貨');
  });
});
