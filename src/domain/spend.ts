import type { Gear } from './types';

export interface Bucket {
  label: string;
  amount: number;
}

function groupBy(gear: Gear[], key: (g: Gear) => string) {
  const totals = new Map<string, number>();
  for (const g of gear) {
    if (g.amount) totals.set(key(g), (totals.get(key(g)) ?? 0) + g.amount);
  }
  return [...totals].map(([label, amount]) => ({ label, amount: Math.round(amount * 10) / 10 }));
}

const UNKNOWN_DATE = '未標日期';

export function byMonth(gear: Gear[]): Bucket[] {
  return groupBy(gear, (g) => g.date?.slice(0, 7) ?? UNKNOWN_DATE).sort((a, b) =>
    a.label === UNKNOWN_DATE ? 1 : b.label === UNKNOWN_DATE ? -1 : a.label.localeCompare(b.label),
  );
}

export const byCategory = (gear: Gear[]): Bucket[] =>
  groupBy(gear, (g) => g.category).sort((a, b) => b.amount - a.amount);

export function byShop(gear: Gear[], top = 8): Bucket[] {
  const sorted = groupBy(gear, (g) => g.shop ?? '未標賣場').sort((a, b) => b.amount - a.amount);
  const rest = sorted.slice(top).reduce((n, b) => n + b.amount, 0);
  const head = sorted.slice(0, top);
  return rest ? [...head, { label: '其他', amount: Math.round(rest * 10) / 10 }] : head;
}
