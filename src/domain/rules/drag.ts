import type { Spec } from '../types';
import { pending } from './common';
import type { Verdict } from './common';

export function checkDrag(reel: Spec, rod: Spec): Verdict {
  if (reel.dragKg === undefined) return pending('煞車力未登記');
  if (rod.maxLoadKg === undefined) return pending('竿子釣重未登記');
  return reel.dragKg > rod.maxLoadKg
    ? { level: 'warn', label: '提醒', reason: `煞車力 ${reel.dragKg}kg 大於釣重 ${rod.maxLoadKg}kg，煞車要調鬆` }
    : { level: 'ok', label: '正常', reason: `煞車力 ${reel.dragKg}kg 不超過釣重` };
}
