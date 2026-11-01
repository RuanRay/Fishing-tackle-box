import { expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from '../src/domain/rules/common';
import { buildTrip, DEFAULT_TEMPLATES } from '../src/domain/trip';
import type { Gear } from '../src/domain/types';

let no = 0;
const gear = (over: Partial<Gear>): Gear => ({
  id: String(++no),
  no,
  category: '配件',
  name: 'x',
  qty: 1,
  status: '持有',
  consumable: false,
  spec: {},
  specRows: [],
  updatedAt: 0,
  ...over,
});
const rodA = gear({ category: '竿與捲線器', name: 'A', spec: { subtype: '竿', lureMinG: 1, lureMaxG: 9 } });
const rodB = gear({ category: '竿與捲線器', name: 'B', spec: { subtype: '竿', lureMinG: 5, lureMaxG: 25 } });
const reelA = gear({ category: '竿與捲線器', name: 'RA', spec: { subtype: '捲線器', pairRodNo: rodA.no } });
const reelB = gear({ category: '竿與捲線器', name: 'RB', spec: { subtype: '捲線器', pairRodNo: rodB.no } });
const light = gear({ category: '假餌', name: 'L', spec: { weightG: 3 } });
const heavy = gear({ category: '假餌', name: 'H', spec: { weightG: 20 } });
const all = [rodA, rodB, reelA, reelB, light, heavy];

it('every template yields a list', () => {
  for (const t of DEFAULT_TEMPLATES) expect(buildTrip(t, all, cfg).length).toBeGreaterThan(0);
});

it('light picks the lighter rod and only its suitable lures', () => {
  const labels = buildTrip(DEFAULT_TEMPLATES[0]!, all, cfg).map((i) => i.label);
  expect(labels).toEqual(expect.arrayContaining(['A', 'RA', 'L']));
  expect(labels).not.toContain('H');
  expect(labels).not.toContain('B');
});

it('marks what the template needs but the box lacks', () => {
  const items = buildTrip(DEFAULT_TEMPLATES[2]!, all, cfg);
  expect(items.find((i) => i.label === '缺浮標')?.missing).toBe(true);
  expect(items.filter((i) => i.group === '假餌')).toEqual([]);
});

it('does not pack gear that is gone or in transit', () => {
  const snap = gear({ name: '別針', status: '在途' });
  const items = buildTrip(DEFAULT_TEMPLATES[0]!, [...all, snap], cfg);
  expect(items.find((i) => i.gearId === snap.id)).toBeUndefined();
});
