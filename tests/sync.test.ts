import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  adjustStock,
  clearAll,
  consume,
  db,
  deleteGear,
  getSetting,
  importData,
  saveConfig,
  saveGear,
  setSetting,
} from '../src/data/db';
import type { SyncTable } from '../src/data/db';
import { restoreConflict, syncNow, useCloudData, useLocalData } from '../src/data/sync';
import type { Remote, RemoteDoc } from '../src/data/sync';
import { currentQty } from '../src/domain/stock';
import type { Gear } from '../src/domain/types';

class FakeCloud implements Remote {
  uid = 'owner';
  docs = new Map<string, RemoteDoc>();
  pushes = 0;
  rejectPhotos = false;
  overlap = 0;
  tick = 1000;
  times = new Map<string, number>();

  isEmpty = async () => this.docs.size === 0;
  async pull(since: number) {
    const docs = [...this.docs].filter(([k]) => (this.times.get(k) ?? 0) > since - this.overlap).map(([, d]) => d);
    return { docs: structuredClone(docs), cursor: this.tick };
  }
  async push(docs: RemoteDoc[]) {
    if (this.rejectPhotos && docs.some((d) => d.table === 'photos')) throw new Error('too large');
    this.pushes += 1;
    for (const d of docs) this.seed(d);
  }
  seed(d: RemoteDoc) {
    const key = `${d.table}/${d.id}`;
    this.docs.set(key, structuredClone(d));
    this.times.set(key, ++this.tick);
  }
  get(table: SyncTable, id: string | number) {
    return this.docs.get(`${table}/${id}`);
  }
}

const gear = (over: Partial<Gear> = {}): Gear => ({
  id: crypto.randomUUID(),
  no: 1,
  category: '鉤',
  name: 'x',
  qty: 5,
  status: '持有',
  consumable: true,
  spec: {},
  specRows: [],
  updatedAt: 100,
  ...over,
});
const remoteGear = (g: Gear): RemoteDoc => ({ table: 'gear', id: g.id, data: { ...g }, updatedAt: g.updatedAt });
const empty = { orders: [], extras: { trips: [] } };

let cloud: FakeCloud;
beforeEach(async () => {
  await clearAll();
  cloud = new FakeCloud();
});

describe('first link', () => {
  it('uploads a device when the cloud is empty', async () => {
    const g = gear();
    await importData({ gear: [g], ...empty });
    await saveConfig({ tolerance: 0.1, hookDiff: 2, rate: 5, fee: 10 });
    expect(await syncNow(cloud)).toEqual({ result: 'done', failed: 0 });
    expect(cloud.get('gear', g.id)?.data?.name).toBe('x');
    expect(cloud.get('settings', 'config')).toBeDefined();
    expect(await db.outbox.count()).toBe(0);
  });

  it('downloads into an empty device', async () => {
    const g = gear();
    cloud.seed(remoteGear(g));
    await syncNow(cloud);
    expect((await db.gear.get(g.id))?.name).toBe('x');
    expect(cloud.pushes).toBe(0);
  });

  it('stops and asks when both sides have data', async () => {
    await importData({ gear: [gear()], ...empty });
    cloud.seed(remoteGear(gear()));
    expect((await syncNow(cloud)).result).toBe('choose');
    expect(await db.gear.count()).toBe(1);
    expect(cloud.docs.size).toBe(1);
  });

  it('asks again for a different account instead of mixing data', async () => {
    await importData({ gear: [gear()], ...empty });
    await syncNow(cloud);
    const other = new FakeCloud();
    other.uid = 'someone-else';
    other.seed(remoteGear(gear()));
    expect((await syncNow(other)).result).toBe('choose');
  });

  it('can replace the device with the cloud', async () => {
    await importData({ gear: [gear({ name: 'local' })], ...empty });
    const g = gear({ name: 'cloud' });
    cloud.seed(remoteGear(g));
    await useCloudData(cloud);
    expect((await db.gear.toArray()).map((x) => x.name)).toEqual(['cloud']);
  });

  it('replacing the cloud keeps local rows that share an id with the cloud', async () => {
    const g = gear({ name: 'local', updatedAt: Date.now() });
    await importData({
      gear: [g],
      orders: [
        {
          orderNo: 'o',
          platform: 'p',
          date: 'd',
          shop: 's',
          item: 'mine',
          qty: 1,
          subtotal: 1,
          status: 's',
          counted: true,
        },
      ],
      extras: { trips: [] },
    });
    await saveConfig({ tolerance: 0.1, hookDiff: 2, rate: 5, fee: 10 });
    const order = (await db.orders.toArray())[0]!;
    cloud.seed({ ...remoteGear(g), data: { ...g, name: 'cloud' }, device: 'other', updatedAt: 1 });
    cloud.seed({
      table: 'orders',
      id: String(order.id),
      data: { ...order, item: 'cloud' },
      updatedAt: 1,
      device: 'other',
    });
    cloud.seed({
      table: 'settings',
      id: 'config',
      data: { key: 'config', value: '{}' },
      updatedAt: 1,
      device: 'other',
    });
    const stale = gear({ name: 'only in cloud' });
    cloud.seed({ ...remoteGear(stale), device: 'other' });
    cloud.tick = Date.now();
    cloud.overlap = 60_000;
    await useLocalData(cloud);

    expect((await db.gear.get(g.id))?.name).toBe('local');
    expect((await db.orders.get(order.id!))?.item).toBe('mine');
    expect(cloud.get('gear', g.id)?.data?.name).toBe('local');
    expect(cloud.get('orders', order.id!)?.data?.item).toBe('mine');
    expect(cloud.get('settings', 'config')?.data?.value).not.toBe('{}');
    const tombstone = cloud.get('gear', stale.id);
    expect(tombstone?.data).toBeNull();
    expect(tombstone?.device).toBe(await getSetting('deviceId'));
  });

  it('can replace the cloud with the device', async () => {
    const mine = gear({ name: 'local' });
    await importData({ gear: [mine], ...empty });
    const old = gear({ name: 'cloud' });
    cloud.seed(remoteGear(old));
    await useLocalData(cloud);
    expect(cloud.get('gear', old.id)?.data).toBeNull();
    expect(cloud.get('gear', mine.id)?.data?.name).toBe('local');
    expect((await db.gear.toArray()).map((x) => x.name)).toEqual(['local']);
  });
});

describe('ongoing sync', () => {
  beforeEach(async () => {
    await setSetting('syncUser', 'owner');
    await setSetting('syncCursor', 0);
  });

  it('keeps device-only settings out of the cloud', async () => {
    await setSetting('lastBackupAt', 1);
    await saveConfig({ tolerance: 0.1, hookDiff: 2, rate: 5, fee: 10 });
    await syncNow(cloud);
    expect([...cloud.docs.keys()]).toEqual(['settings/config']);
  });

  it('counts consumption from both devices', async () => {
    const g = gear();
    await saveGear(g);
    await consume(g, 'qty', 1);
    cloud.seed({
      table: 'stockLog',
      id: 'other-device',
      data: { id: 'other-device', gearId: g.id, kind: 'qty', delta: -1, at: 5 },
      updatedAt: 5,
    });
    await syncNow(cloud);
    expect(currentQty(g, await db.stockLog.toArray())).toBe(3);
    expect([...cloud.docs.keys()].filter((k) => k.startsWith('stockLog'))).toHaveLength(2);
  });

  it('spreads deletes through tombstones', async () => {
    const g = gear();
    await saveGear(g);
    await adjustStock(g.id, 'qty', 1);
    await syncNow(cloud);
    await deleteGear(g.id);
    await syncNow(cloud);
    expect(cloud.get('gear', g.id)?.data).toBeNull();
    expect([...cloud.docs.values()].filter((d) => d.table === 'stockLog').every((d) => d.data === null)).toBe(true);
  });

  it('does not treat its own upload as a conflict when edited again', async () => {
    const g = gear();
    await saveGear(g);
    await syncNow(cloud);
    await saveGear({ ...g, name: 'second edit' });
    await syncNow(cloud);
    expect(await db.conflicts.count()).toBe(0);
    expect(cloud.get('gear', g.id)?.data?.name).toBe('second edit');
  });

  it('an edit from another device beats an older local delete', async () => {
    const g = gear();
    await saveGear(g);
    await syncNow(cloud);
    await deleteGear(g.id);
    cloud.seed(remoteGear({ ...g, name: 'kept', updatedAt: Date.now() + 60_000 }));
    await syncNow(cloud);
    expect((await db.gear.get(g.id))?.name).toBe('kept');
  });

  it('removes a row another device deleted', async () => {
    const g = gear();
    await saveGear(g);
    await syncNow(cloud);
    cloud.seed({ table: 'gear', id: g.id, data: null, updatedAt: Date.now() + 1000 });
    await syncNow(cloud);
    expect(await db.gear.get(g.id)).toBeUndefined();
  });

  it('newer remote edit wins and the local version is kept for restore', async () => {
    const g = gear();
    await saveGear({ ...g, name: 'mine' });
    cloud.seed(remoteGear({ ...g, name: 'theirs', updatedAt: Date.now() + 60_000 }));
    await syncNow(cloud);
    expect((await db.gear.get(g.id))?.name).toBe('theirs');
    const [conflict] = await db.conflicts.toArray();
    expect(conflict?.data.name).toBe('mine');
    await restoreConflict(conflict!.id);
    expect((await db.gear.get(g.id))?.name).toBe('mine');
    await syncNow(cloud);
    expect(cloud.get('gear', g.id)?.data?.name).toBe('mine');
  });

  it('newer local edit wins and the remote version is kept', async () => {
    const g = gear();
    cloud.seed(remoteGear({ ...g, name: 'theirs', updatedAt: 5 }));
    await saveGear({ ...g, name: 'mine' });
    await syncNow(cloud);
    expect(cloud.get('gear', g.id)?.data?.name).toBe('mine');
    expect((await db.conflicts.toArray())[0]?.data.name).toBe('theirs');
  });

  it('does not lose an edit made while uploading', async () => {
    const g = gear();
    await saveGear(g);
    const push = cloud.push.bind(cloud);
    cloud.push = async (docs) => {
      await push(docs);
      await saveGear({ ...g, name: 'edited during upload' });
    };
    await syncNow(cloud);
    expect(await db.outbox.count()).toBe(1);
    cloud.push = push;
    await syncNow(cloud);
    expect(cloud.get('gear', g.id)?.data?.name).toBe('edited during upload');
  });

  it('a rejected photo stays queued without blocking the rest', async () => {
    const g = gear();
    await saveGear(g);
    await db.photos.put({ gearId: g.id, bytes: new ArrayBuffer(4), type: 'image/jpeg', updatedAt: 1 });
    await db.outbox.put({ key: `photos/${g.id}`, table: 'photos', id: g.id, rev: 'r', at: 1 });
    cloud.rejectPhotos = true;
    expect((await syncNow(cloud)).failed).toBe(1);
    expect(cloud.get('gear', g.id)).toBeDefined();
    expect(await db.outbox.count()).toBe(1);
  });

  it('keeps everything queued when the network fails', async () => {
    const g = gear();
    await saveGear(g);
    cloud.push = () => Promise.reject(new Error('offline'));
    await expect(syncNow(cloud)).rejects.toThrow('offline');
    expect(await db.outbox.count()).toBe(1);
    expect(await db.gear.get(g.id)).toBeDefined();
  });

  it('renumbers when two devices used the same number offline', async () => {
    const mine = gear({ no: 7, name: 'mine' });
    await saveGear(mine);
    const theirs = gear({ no: 7, name: 'theirs' });
    cloud.seed(remoteGear(theirs));
    await syncNow(cloud);
    const rows = await db.gear.toArray();
    expect(new Set(rows.map((r) => r.no)).size).toBe(2);
    expect(rows.find((r) => r.id === theirs.id)?.no).toBe(7);
  });

  it('moves references along when a number is reassigned', async () => {
    const mine = gear({ no: 7, name: 'mine' });
    const reel = gear({ no: 2, spec: { lineNo: 7, pairRodNo: 7 } });
    await saveGear(mine);
    await saveGear(reel);
    await db.orders.add({
      orderNo: 'o',
      platform: 'p',
      date: 'd',
      shop: 's',
      item: 'i',
      qty: 1,
      subtotal: 1,
      status: 's',
      counted: true,
      gearNo: 7,
    });
    await db.settings.put({ key: 'lastNo', value: 20 });
    cloud.seed(remoteGear(gear({ no: 7, name: 'theirs' })));
    await syncNow(cloud);
    const moved = (await db.gear.get(mine.id))!.no;
    expect(moved).toBe(21);
    expect((await db.orders.toArray())[0]?.gearNo).toBe(21);
    expect((await db.gear.get(reel.id))?.spec).toEqual({ lineNo: 21, pairRodNo: 21 });
    expect(cloud.get('orders', 1)?.data?.gearNo ?? (await db.orders.toArray())[0]?.gearNo).toBe(21);
  });

  it('dates a tombstone by the delete, not the upload', async () => {
    const g = gear();
    await saveGear(g);
    await syncNow(cloud);
    await deleteGear(g.id);
    const deletedAt = (await db.outbox.get(`gear/${g.id}`))!.at;
    await new Promise((done) => setTimeout(done, 5));
    await syncNow(cloud);
    expect(cloud.get('gear', g.id)?.updatedAt).toBe(deletedAt);
  });

  it('does not pile up copies when a push keeps failing', async () => {
    const g = gear();
    cloud.seed(remoteGear({ ...g, name: 'theirs', updatedAt: 5 }));
    await saveGear({ ...g, name: 'mine' });
    cloud.overlap = 1e9;
    cloud.push = () => Promise.reject(new Error('rejected'));
    for (let i = 0; i < 3; i += 1) await syncNow(cloud).catch(() => undefined);
    expect(await db.conflicts.count()).toBe(1);
  });

  it('restores a version whose number was taken since', async () => {
    const g = gear({ no: 3, name: 'old' });
    const other = gear({ no: 3, name: 'holder' });
    await saveGear(other);
    await db.conflicts.put({ id: 'c', table: 'gear', rowId: g.id, data: { ...g }, at: 1 });
    await restoreConflict('c');
    expect((await db.gear.get(g.id))?.no).toBe(3);
    expect((await db.gear.get(other.id))?.no).toBe(4);
  });

  it('keeps the higher issued number from either device, with no conflict', async () => {
    await db.settings.put({ key: 'lastNo', value: 12, updatedAt: 1 });
    await db.outbox.put({ key: 'settings/lastNo', table: 'settings', id: 'lastNo', rev: 'r', at: 1 });
    cloud.seed({ table: 'settings', id: 'lastNo', data: { key: 'lastNo', value: 10, updatedAt: 99 }, updatedAt: 99 });
    await syncNow(cloud);
    expect(await getSetting('lastNo')).toBe(12);
    expect(cloud.get('settings', 'lastNo')?.data?.value).toBe(12);
    expect(await db.conflicts.count()).toBe(0);

    cloud.seed({ table: 'settings', id: 'lastNo', data: { key: 'lastNo', value: 30, updatedAt: 1 }, updatedAt: 1 });
    await syncNow(cloud);
    expect(await getSetting('lastNo')).toBe(30);
  });

  it('moves the cursor so unchanged data is not applied again', async () => {
    cloud.seed(remoteGear(gear()));
    await syncNow(cloud);
    expect(Number(await getSetting('syncCursor'))).toBe(cloud.tick);
  });

  it('clearing a device keeps the cloud copy and restores on next sync', async () => {
    const g = gear();
    await saveGear(g);
    await syncNow(cloud);
    await clearAll();
    expect(cloud.get('gear', g.id)?.data).not.toBeNull();
    await syncNow(cloud);
    expect((await db.gear.get(g.id))?.name).toBe('x');
  });
});
