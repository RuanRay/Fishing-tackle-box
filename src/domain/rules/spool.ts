import type { Spec } from '../types';
import { pending } from './common';
import type { Verdict } from './common';

const PE_ONE_DIAMETER_MM = 0.165;

/** Spool tables are not proportional, so the tightest entry gives a safe capacity. */
function tightest(table: string, square: boolean) {
  return Math.min(
    ...table.split(';').map((entry) => {
      const [size = NaN, metres = NaN] = entry.split('/').map(Number);
      return (square ? size ** 2 : size) * metres;
    }),
  );
}

export function capacityFor(line: Spec, reel: Spec) {
  const [unit, table] = (reel.capacity ?? '').split(':');
  if (!table || !Number.isFinite(tightest(table, false))) return undefined;
  if (unit === 'PE') {
    return line.sizeNo ? { metres: Math.floor(tightest(table, false) / line.sizeNo), estimated: false } : undefined;
  }
  if (unit !== 'mm') return undefined;
  const diameter = line.diameterMm ?? (line.sizeNo ? PE_ONE_DIAMETER_MM * Math.sqrt(line.sizeNo) : undefined);
  return diameter ? { metres: Math.floor(tightest(table, true) / diameter ** 2), estimated: true } : undefined;
}

export function checkSpool(line: Spec, lengthM: number | undefined, reel: Spec): Verdict {
  const capacity = capacityFor(line, reel);
  if (!capacity) return pending('繞線量或線號未登記');
  if (lengthM === undefined) return pending('線長未登記');
  const note = capacity.estimated ? '（估算）' : '';
  return lengthM <= capacity.metres
    ? { level: 'ok', label: '正常', reason: `${lengthM}m，線杯約可捲 ${capacity.metres}m${note}` }
    : { level: 'warn', label: '超量', reason: `${lengthM}m 超過線杯約 ${capacity.metres}m${note}，要剪短或打底` };
}
