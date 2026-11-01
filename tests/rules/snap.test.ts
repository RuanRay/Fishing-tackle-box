import { expect, it } from 'vitest';
import { checkSnapLure, checkSnapStrength } from '../../src/domain/rules/snap';

const snap = { strengthKg: 13, lureMinG: 1, lureMaxG: 7 };

it('compares against the main line without a leader', () => {
  expect(checkSnapStrength(snap, { strengthKg: 7.8 }).label).toBe('正常');
  expect(checkSnapStrength({ strengthKg: 5 }, { strengthKg: 7.8 }).label).toBe('提醒');
});

it('compares against the leader when there is one', () => {
  expect(checkSnapStrength({ strengthKg: 5 }, { strengthKg: 7.8 }, { strengthKg: 3 }).label).toBe('正常');
  expect(checkSnapStrength({ strengthKg: 5 }, { strengthKg: 7.8 }, {}).level).toBe('pending');
});

it('warns when the lure is outside the snap rating', () => {
  expect(checkSnapLure(snap, 10)?.label).toBe('提醒');
  expect(checkSnapLure(snap, 5)?.label).toBe('正常');
  expect(checkSnapLure({}, 10)).toBeUndefined();
});
