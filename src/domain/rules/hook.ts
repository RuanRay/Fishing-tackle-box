import type { Spec } from '../types';
import { pending } from './common';
import type { RuleConfig, Verdict } from './common';

export function checkHook(hook: Spec, lure: Spec, config: RuleConfig): Verdict {
  if (hook.hookNo === undefined || lure.hookNo === undefined) return pending('鉤號未登記');
  if (!hook.hookType || !lure.hookType) return pending('鉤種未登記');
  if (hook.hookType !== lure.hookType) {
    return { level: 'bad', label: '不合用', reason: `鉤種不同（${hook.hookType}／${lure.hookType}）` };
  }
  return Math.abs(hook.hookNo - lure.hookNo) <= config.hookDiff
    ? { level: 'ok', label: '合用', reason: `原鉤 ${lure.hookNo}#，相差 ${config.hookDiff} 號內` }
    : { level: 'bad', label: '不合用', reason: `原鉤 ${lure.hookNo}#，相差超過 ${config.hookDiff} 號` };
}
