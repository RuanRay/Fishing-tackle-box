import type { Spec } from '../types';
import { pending } from './common';
import type { Verdict } from './common';

export function checkLeader(leader: Spec, main: Spec): Verdict {
  if (leader.strengthKg === undefined) return pending('子線拉力未登記');
  if (main.strengthKg === undefined) return pending('主線拉力未登記');
  return leader.strengthKg < main.strengthKg
    ? { level: 'ok', label: '正常', reason: `會先斷在子線（${leader.strengthKg}kg）` }
    : { level: 'warn', label: '提醒', reason: `子線 ${leader.strengthKg}kg 不低於主線 ${main.strengthKg}kg` };
}
