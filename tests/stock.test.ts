import { describe, expect, it } from 'vitest';
import { canConsume, currentMetres, currentQty, isLow, missingFields, statusAfterRecount } from '../src/domain/stock';
import type { Gear, StockLog } from '../src/domain/types';

const gear = (over: Partial<Gear> = {}): Gear => ({
  id: 'g',
  no: 1,
  category: '鉤',
  name: 'x',
  qty: 5,
  status: '持有',
  consumable: true,
  spec: {},
  specRows: [],
  updatedAt: 0,
  ...over,
});
const log = (delta: number, kind: StockLog['kind'] = 'qty', gearId = 'g'): StockLog => ({
  id: String(delta),
  gearId,
  kind,
  delta,
  at: 0,
});

describe('stock', () => {
  it('two devices consuming once each subtracts twice', () => {
    expect(currentQty(gear(), [log(-1), { ...log(-1), id: 'other' }])).toBe(3);
  });

  it('ignores logs of other gear', () => {
    expect(currentQty(gear(), [log(-1, 'qty', 'other')])).toBe(5);
  });

  it('tracks metres for lines and uses them for low stock', () => {
    const line = gear({ category: '釣線', qty: 1, threshold: 30, spec: { remainM: 100 } });
    expect(currentMetres(line, [log(-20.5, 'm')])).toBe(79.5);
    expect(isLow(line, [log(-69, 'm')])).toBe(false);
    expect(isLow(line, [log(-70, 'm')])).toBe(true);
  });

  it('low stock is inclusive and skips items without a threshold', () => {
    expect(isLow(gear({ threshold: 5 }), [])).toBe(true);
    expect(isLow(gear({ threshold: 4 }), [])).toBe(false);
    expect(isLow(gear(), [])).toBe(false);
  });

  it('in-transit items are neither low nor consumable', () => {
    const g = gear({ status: '在途', threshold: 9 });
    expect(isLow(g, [])).toBe(false);
    expect(canConsume(g)).toBe(false);
  });

  it('a recount only moves the status when the amount changed', () => {
    expect(statusAfterRecount('用完', 3, 3)).toBe('用完');
    expect(statusAfterRecount('用完', 0, 2)).toBe('持有');
    expect(statusAfterRecount('持有', 2, 0)).toBe('用完');
    expect(statusAfterRecount('已不在', 2, 0)).toBe('已不在');
  });

  it('asks for rule fields only, never for gone gear', () => {
    expect(missingFields(gear({ category: '假餌', spec: { weightG: 5 } }))).toEqual(['lengthCm', 'layer']);
    expect(missingFields(gear({ category: '假餌', status: '已不在' }))).toEqual([]);
    expect(missingFields(gear({ category: '竿與捲線器', spec: { subtype: '捲線器' } }))).toEqual([]);
  });
});
