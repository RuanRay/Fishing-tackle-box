import type { Spec } from '../types';
import { pending } from './common';
import type { Verdict } from './common';

/** The snap ties to the leader when there is one, so that is the line it must outlast. */
export function checkSnapStrength(snap: Spec, main: Spec, leader?: Spec): Verdict {
  const line = leader ?? main;
  const name = leader ? '子線' : '主線';
  if (snap.strengthKg === undefined) return pending('別針拉力未登記');
  if (line.strengthKg === undefined) return pending(`${name}拉力未登記`);
  return snap.strengthKg >= line.strengthKg
    ? { level: 'ok', label: '正常', reason: `別針 ${snap.strengthKg}kg ≥ ${name} ${line.strengthKg}kg` }
    : { level: 'warn', label: '提醒', reason: `會先斷在別針（${snap.strengthKg}kg < ${name} ${line.strengthKg}kg）` };
}

export function checkSnapLure(snap: Spec, weightG: number | undefined): Verdict | undefined {
  const { lureMinG: min, lureMaxG: max } = snap;
  if (min === undefined || max === undefined || weightG === undefined) return undefined;
  return weightG >= min && weightG <= max
    ? { level: 'ok', label: '正常', reason: `別針適合 ${min}–${max}g` }
    : { level: 'warn', label: '提醒', reason: `別針標示適合 ${min}–${max}g，${weightG}g 超出` };
}
