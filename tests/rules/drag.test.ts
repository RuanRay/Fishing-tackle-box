import { expect, it } from 'vitest';
import { checkDrag } from '../../src/domain/rules/drag';

it('warns when the drag exceeds the rod rating', () => {
  expect(checkDrag({ dragKg: 7 }, { maxLoadKg: 1.5 }).label).toBe('提醒');
  expect(checkDrag({ dragKg: 1 }, { maxLoadKg: 1.5 }).label).toBe('正常');
});

it('is pending when the rod rating is unknown', () => {
  expect(checkDrag({ dragKg: 6 }, {}).level).toBe('pending');
});
