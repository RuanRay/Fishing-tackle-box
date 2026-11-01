import { expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../src/data/excel';
import { sampleFile } from '../src/data/sample';
import { fixedCombos, lureRows } from '../src/domain/rules/combo';
import { DEFAULT_CONFIG as cfg } from '../src/domain/rules/common';
import { isLow, missingFields, summary } from '../src/domain/stock';
import { buildTrip, DEFAULT_TEMPLATES } from '../src/domain/trip';

const parsed = () => parseWorkbook(sampleFile());

it('is a valid v2 workbook with a guide sheet', () => {
  const { gear, orders } = parsed();
  expect(summary(gear, []).rows).toBe(15);
  expect(new Set(gear.map((g) => g.no)).size).toBe(15);
  expect(orders).toHaveLength(3);
  expect(XLSX.read(sampleFile(), { type: 'array' }).SheetNames).toContain('說明');
});

it('demonstrates every feature on import', () => {
  const { gear } = parsed();
  const combos = fixedCombos(gear);
  expect(combos.map((c) => [c.rod.no, c.reel.no, c.line?.no])).toEqual([
    [1, 3, 5],
    [2, 4, 6],
  ]);
  const levels = new Set(lureRows(combos[1]!.rod, gear, cfg).map((r) => r.verdict.level));
  expect(levels).toEqual(new Set(['ok', 'pending']));
  expect(gear.some((g) => g.status === '在途')).toBe(true);
  expect(gear.flatMap(missingFields).length).toBeGreaterThan(0);
  expect(gear.filter((g) => isLow(g, [])).map((g) => g.no)).toEqual([7]);
  for (const t of DEFAULT_TEMPLATES) expect(buildTrip(t, gear, cfg).length).toBeGreaterThan(3);
});

it('links orders to gear that exists', () => {
  const { gear, orders } = parsed();
  for (const o of orders) {
    if (o.gearNo) expect(gear.find((g) => g.no === o.gearNo)?.name).toBe(o.item);
  }
});

it('leaves ids blank so a copied row stays importable', () => {
  const wb = XLSX.read(sampleFile(), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['器材清單']!);
  expect(rows.some((r) => r['內部ID'])).toBe(false);
});

it('generates fresh ids each time', () => {
  expect(parsed().gear[0]?.id).not.toBe(parsed().gear[0]?.id);
});
