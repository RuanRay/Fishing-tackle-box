import { expect, it } from 'vitest';
import { checkLeader } from '../../src/domain/rules/leader';

it('wants the leader to be the weak link', () => {
  expect(checkLeader({ strengthKg: 3 }, { strengthKg: 7.8 }).label).toBe('正常');
  expect(checkLeader({ strengthKg: 8 }, { strengthKg: 7.8 }).label).toBe('提醒');
  expect(checkLeader({ strengthKg: 7.8 }, { strengthKg: 7.8 }).label).toBe('提醒');
});

it('is pending when the leader strength is unknown', () => {
  expect(checkLeader({}, { strengthKg: 7.8 }).level).toBe('pending');
});
