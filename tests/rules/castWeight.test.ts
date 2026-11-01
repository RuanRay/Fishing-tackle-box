import { expect, it } from 'vitest';
import { checkCastWeight } from '../../src/domain/rules/castWeight';
import { DEFAULT_CONFIG as cfg } from '../../src/domain/rules/common';

const rod = { lureMinG: 5, lureMaxG: 25 };

it('adds sinker, float and bait', () => {
  const result = checkCastWeight({ sinkerG: 20, floatG: 3, baitG: 1 }, rod, cfg);
  expect(result.level).toBe('ok');
  expect(result.reason).toContain('24g');
});

it('uses the lure thresholds', () => {
  expect(checkCastWeight({ sinkerG: 28 }, rod, cfg).level).toBe('warn');
  expect(checkCastWeight({ sinkerG: 40 }, rod, cfg).level).toBe('bad');
});

it('is pending when a picked float has no weight', () => {
  expect(checkCastWeight({ sinkerG: 20, floatG: null }, rod, cfg).level).toBe('pending');
});

it('is pending without a sinker weight', () => {
  expect(checkCastWeight({ floatG: 3 }, rod, cfg).level).toBe('pending');
});
