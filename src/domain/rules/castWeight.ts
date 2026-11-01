import type { Spec } from '../types';
import { pending } from './common';
import type { RuleConfig, Verdict } from './common';
import { checkLureWeight } from './lureWeight';

export function checkCastWeight(
  parts: { sinkerG?: number; floatG?: number | null; baitG?: number },
  rod: Spec,
  config: RuleConfig,
): Verdict {
  const { sinkerG, floatG = 0, baitG = 0 } = parts;
  if (sinkerG === undefined) return pending('鉛重未登記');
  if (floatG === null) return pending('浮標重量未登記');
  const total = Math.round((sinkerG + floatG + baitG) * 100) / 100;
  const result = checkLureWeight(total, rod, config);
  return { ...result, reason: `拋投重量 ${total}g：${result.reason}` };
}
