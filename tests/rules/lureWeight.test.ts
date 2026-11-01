import { expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from '../../src/domain/rules/common';
import { checkLureWeight } from '../../src/domain/rules/lureWeight';

const ultraLight = { lureMinG: 1.5, lureMaxG: 9 };
const medium = { lureMinG: 5, lureMaxG: 25 };

it('classifies against the rod range with 20% tolerance', () => {
  expect(checkLureWeight(7, ultraLight, cfg).level).toBe('ok');
  expect(checkLureWeight(10, ultraLight, cfg).level).toBe('warn');
  expect(checkLureWeight(10, medium, cfg).level).toBe('ok');
  expect(checkLureWeight(15, ultraLight, cfg).level).toBe('bad');
});

it('includes the exact tolerance edges despite float rounding', () => {
  expect(checkLureWeight(10.8, ultraLight, cfg).level).toBe('warn');
  expect(checkLureWeight(1.2, ultraLight, cfg).level).toBe('warn');
  expect(checkLureWeight(1.1, ultraLight, cfg).level).toBe('bad');
});

it('never guesses a missing value', () => {
  expect(checkLureWeight(undefined, ultraLight, cfg).level).toBe('pending');
  expect(checkLureWeight(5, {}, cfg).level).toBe('pending');
});
