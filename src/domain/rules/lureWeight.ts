import type { Spec } from '../types';
import { pending } from './common';
import type { RuleConfig, Verdict } from './common';

const EPSILON = 1e-9;

export function checkLureWeight(weightG: number | undefined, rod: Spec, config: RuleConfig): Verdict {
  const { lureMinG: min, lureMaxG: max } = rod;
  if (weightG === undefined) return pending('重量未登記');
  if (min === undefined || max === undefined) return pending('竿子餌重未登記');
  const range = `竿子 ${min}–${max}g`;
  if (weightG >= min && weightG <= max) return { level: 'ok', label: '適合', reason: `${weightG}g 在${range}內` };
  const near = weightG >= min * (1 - config.tolerance) - EPSILON && weightG <= max * (1 + config.tolerance) + EPSILON;
  return near
    ? { level: 'warn', label: '勉強', reason: `${weightG}g 超出${range}，在寬容範圍內` }
    : { level: 'bad', label: '不適合', reason: `${weightG}g 超出${range}太多` };
}
