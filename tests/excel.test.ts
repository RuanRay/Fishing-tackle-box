import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook, parseWorkbook, workbookBytes } from '../src/data/excel';
import { summary } from '../src/domain/stock';
import type { Gear, Order } from '../src/domain/types';

const gear = (over: Partial<Gear>): Gear => ({
  id: crypto.randomUUID(),
  no: 1,
  category: '假餌',
  name: '測試餌',
  qty: 3,
  status: '持有',
  consumable: true,
  spec: {},
  specRows: [],
  updatedAt: 0,
  ...over,
});

describe('export round trip', () => {
  const lure = gear({ no: 1, amount: 10.5, spec: { weightG: 5, layer: '水面' } });
  const line = gear({
    no: 2,
    category: '釣線',
    name: '測試線',
    qty: 1,
    threshold: 30,
    spec: { remainM: 100, sizeNo: 0.8 },
  });
  const reel = gear({
    no: 3,
    category: '竿與捲線器',
    name: '測試輪',
    qty: 1,
    spec: { subtype: '捲線器', pairRodNo: 9 },
    specRows: [{ label: '輪', item: '速比', value: '5.2:1', note: '備註' }],
  });
  const gone = gear({ no: 4, status: '已不在', amount: 2 });
  const order: Order = {
    orderNo: 'A1',
    platform: '網購',
    date: '2026-01-01',
    shop: '店',
    item: '品',
    qty: 1,
    subtotal: 5,
    paid: 4,
    status: '已完成',
    counted: true,
    gearNo: 1,
  };
  const logs = [
    { id: 'a', gearId: lure.id, kind: 'qty' as const, delta: -1, at: 1 },
    { id: 'b', gearId: line.id, kind: 'm' as const, delta: -20, at: 1 },
  ];
  const all = [lure, line, reel, gone];

  it('bakes stock changes into the exported values', () => {
    const again = parseWorkbook(workbookBytes(buildWorkbook(all, [order], logs)));
    expect(summary(again.gear, [])).toEqual({ rows: 4, items: 3, pieces: 4, amount: 12.5 });
    expect(again.gear[0]?.qty).toBe(2);
    expect(again.gear[1]?.spec).toEqual({ remainM: 80, sizeNo: 0.8 });
  });

  it('keeps specs, spec rows and orders', () => {
    const again = parseWorkbook(workbookBytes(buildWorkbook(all, [order], [])));
    expect(again.gear[2]?.spec.pairRodNo).toBe(9);
    expect(again.gear[2]?.specRows).toEqual(reel.specRows);
    expect(again.gear[1]?.threshold).toBe(30);
    expect(again.orders[0]).toMatchObject(order);
  });

  it('keeps settings, templates and trips', () => {
    const extras = {
      config: '{"rate":5}',
      templates: '[]',
      trips: [{ id: 't', name: '浮釣', at: 1, items: [] }],
    };
    const again = parseWorkbook(workbookBytes(buildWorkbook(all, [order], [], extras)));
    expect(again.extras).toEqual(extras);
  });

  it('keeps a trip too long for one Excel cell', () => {
    const items = Array.from({ length: 800 }, (_, i) => ({
      key: `k${i}`,
      group: '  假餌  ',
      label: `很長的器材名稱 🎣 ${i} 帶空白  `,
      missing: false,
      checked: false,
    }));
    const trip = { id: 't', name: '長清單', at: 1, items };
    expect(JSON.stringify(trip).length).toBeGreaterThan(65_000);
    const again = parseWorkbook(workbookBytes(buildWorkbook(all, [order], [], { trips: [trip] })));
    expect(again.extras.trips).toEqual([trip]);
  });

  it('splits on a character boundary when an emoji straddles the cell limit', () => {
    const trip = { id: 't', name: 'x', at: 1, items: [] };
    let straddled = false;
    for (const pad of [29_975, 29_976, 29_977, 29_978]) {
      const long = { ...trip, name: `${'字'.repeat(pad)}🎣🎣🎣🎣` };
      const cut = JSON.stringify(long).charCodeAt(29_999);
      straddled ||= cut >= 0xd800 && cut <= 0xdbff;
      const again = parseWorkbook(workbookBytes(buildWorkbook(all, [order], [], { trips: [long] })));
      expect(again.extras.trips).toEqual([long]);
    }
    expect(straddled).toBe(true);
  });

  it('keeps gear ids so saved trips stay linked after a restore', () => {
    const again = parseWorkbook(workbookBytes(buildWorkbook(all, [order], [])));
    expect(again.gear.map((g) => g.id)).toEqual(all.map((g) => g.id));
  });

  it('keeps blank order cells blank', () => {
    const again = parseWorkbook(workbookBytes(buildWorkbook(all, [{ ...order, shop: '' }], [])));
    expect(again.orders[0]?.shop).toBe('');
  });

  it('rejects a backup whose App data was damaged', () => {
    const bad = buildWorkbook(all, [order], [], { templates: '[]', trips: [] });
    bad.Sheets['App資料']!['B2'] = { t: 's', v: 'null' };
    expect(() => parseWorkbook(workbookBytes(bad))).toThrow('內容不正確');
  });

  it('reads dates that Excel converted to serial numbers', () => {
    const wb = buildWorkbook([{ ...lure, date: undefined }], [], []);
    wb.Sheets['器材清單']!['I2'] = { t: 'n', v: 46000 };
    expect(parseWorkbook(workbookBytes(wb)).gear[0]?.date).toBe('2025-12-09');
  });

  it('writes an overview with live formulas', () => {
    const ws = buildWorkbook(all, [order], []).Sheets['總覽']!;
    expect(ws['B13']).toMatchObject({ v: 3 });
    expect(ws['E13']).toMatchObject({ v: 12.5 });
    expect(ws['C4']?.f).toContain('SUMIFS');
  });
});

describe('import validation', () => {
  const bytes = (sheets: Record<string, unknown[][]>) => {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    }
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  };

  it('rejects the legacy workbook shape', () => {
    expect(() => parseWorkbook(bytes({ 器材清單: [['編號']] }))).toThrow('找不到');
  });

  it('rejects a sheet missing its columns', () => {
    const wb = { 竿與捲線器規格: [['器材'], ['x']] };
    expect(() => parseWorkbook(bytes(wb))).toThrow('缺少欄位');
  });
});
