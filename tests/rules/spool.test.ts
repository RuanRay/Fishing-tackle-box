import { expect, it } from 'vitest';
import { capacityFor, checkSpool } from '../../src/domain/rules/spool';

const shallow = { capacity: 'PE:1.0/100;1.5/80;2.0/60' };
const metal = { capacity: 'mm:0.20/240;0.25/200;0.37/100' };

it('uses the tightest entry of a non-proportional table', () => {
  expect(capacityFor({ sizeNo: 0.8 }, shallow)).toEqual({ metres: 125, estimated: false });
});

it('flags the 150m PE 0.8 and accepts 120m PE 0.6', () => {
  expect(checkSpool({ sizeNo: 0.8 }, 150, shallow).label).toBe('超量');
  expect(checkSpool({ sizeNo: 0.6 }, 120, shallow).label).toBe('正常');
});

it('estimates from diameter for nylon-rated spools', () => {
  const result = checkSpool({ sizeNo: 1.5 }, 300, metal);
  expect(result.label).toBe('超量');
  expect(result.reason).toContain('估算');
});

it('treats a malformed table as unknown', () => {
  expect(checkSpool({ sizeNo: 1 }, 100, { capacity: 'PE:abc' }).level).toBe('pending');
});

it('is pending without a table', () => {
  expect(checkSpool({ sizeNo: 1 }, 100, {}).level).toBe('pending');
});
