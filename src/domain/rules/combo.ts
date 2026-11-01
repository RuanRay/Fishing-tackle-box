import { currentMetres, isHidden } from '../stock';
import type { Gear, StockLog } from '../types';
import type { RuleConfig, Verdict } from './common';
import { checkDrag } from './drag';
import { checkLureWeight } from './lureWeight';
import { checkSpool } from './spool';

export interface Combo {
  rod: Gear;
  reel: Gear;
  line?: Gear;
}

export const byNo = (gear: Gear[], no?: number) => gear.find((g) => g.no === no);
export const rods = (gear: Gear[]) => gear.filter((g) => g.spec.subtype === '竿' && !isHidden(g));
export const reels = (gear: Gear[]) => gear.filter((g) => g.spec.subtype === '捲線器' && !isHidden(g));
export const lures = (gear: Gear[]) => gear.filter((g) => g.category === '假餌' && !isHidden(g));

export function fixedCombos(gear: Gear[]): Combo[] {
  const live = gear.filter((g) => !isHidden(g));
  return reels(live).flatMap((reel) => {
    const rod = byNo(live, reel.spec.pairRodNo);
    return rod ? [{ rod, reel, line: byNo(live, reel.spec.lineNo) }] : [];
  });
}

const RANK = { ok: 0, warn: 1, pending: 2, bad: 3 };

export function lureRows(rod: Pick<Gear, 'spec'>, gear: Gear[], config: RuleConfig) {
  return lures(gear)
    .map((g) => ({ g, verdict: checkLureWeight(g.spec.weightG, rod.spec, config) }))
    .sort((a, b) => RANK[a.verdict.level] - RANK[b.verdict.level]);
}

export function comboChecks({ rod, reel, line }: Combo, logs: StockLog[]): { name: string; verdict: Verdict }[] {
  const checks = [{ name: '煞車', verdict: checkDrag(reel.spec, rod.spec) }];
  if (line) {
    checks.push({ name: '線杯', verdict: checkSpool(line.spec, currentMetres(line, logs), reel.spec) });
  }
  return checks;
}
