import { expect, it } from 'vitest';
import { DEFAULT_CONFIG as cfg } from '../../src/domain/rules/common';
import { checkHook } from '../../src/domain/rules/hook';

const lure = { hookType: '三本鉤', hookNo: 14 };

it('accepts two sizes either way', () => {
  for (const hookNo of [12, 14, 16]) expect(checkHook({ hookType: '三本鉤', hookNo }, lure, cfg).label).toBe('合用');
  expect(checkHook({ hookType: '三本鉤', hookNo: 10 }, lure, cfg).label).toBe('不合用');
});

it('refuses a different hook type at the same size', () => {
  expect(checkHook({ hookType: '翻轉鉤', hookNo: 14 }, lure, cfg).label).toBe('不合用');
});

it('is pending without sizes', () => {
  expect(checkHook({}, lure, cfg).level).toBe('pending');
});
