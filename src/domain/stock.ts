import type { Gear, Spec, Status, StockLog } from './types';

const sum = (logs: StockLog[], gearId: string, kind: StockLog['kind']) =>
  logs.reduce((n, l) => (l.gearId === gearId && l.kind === kind ? n + l.delta : n), 0);

export const currentQty = (g: Gear, logs: StockLog[]) => g.qty + sum(logs, g.id, 'qty');

export const currentMetres = (g: Gear, logs: StockLog[]) =>
  g.spec.remainM === undefined ? undefined : Math.round((g.spec.remainM + sum(logs, g.id, 'm')) * 10) / 10;

export const isLine = (g: Gear) => g.spec.remainM !== undefined;

export const isHidden = (g: Gear) => g.status === '已不在' || g.status === '用完';

export const isOnHand = (g: Gear) => !isHidden(g) && g.status !== '在途';

/** Float stops are called 別針 too, but they carry no load. */
export const isSnap = (g: Gear) => g.category === '配件' && g.name.includes('別針') && !g.name.includes('浮標');

export function statusAfterRecount(status: Status, before: number, after: number): Status {
  if (before === after) return status;
  if (after <= 0 && status !== '已不在') return '用完';
  return status === '用完' ? '持有' : status;
}

export function isLow(g: Gear, logs: StockLog[]) {
  if (g.threshold === undefined || isHidden(g) || g.status === '在途') return false;
  return (currentMetres(g, logs) ?? currentQty(g, logs)) <= g.threshold;
}

export const canConsume = (g: Gear) => g.consumable && (g.status === '持有' || g.status === '存放他處');

/** Fields the rules need but are not filled in yet; shown as 待補, never guessed. */
export function missingFields(g: Gear): (keyof Spec)[] {
  if (g.status === '已不在') return [];
  const needs: (keyof Spec)[] = [];
  if (g.spec.subtype === '竿') needs.push('maxLoadKg');
  if (g.category === '釣線') needs.push('strengthKg', 'remainM');
  if (g.category === '假餌') needs.push('weightG', 'lengthCm', 'layer');
  if (g.category === '浮標/助投器') needs.push('weightG');
  if (g.category === '鉛/天秤' && g.name.startsWith('中通')) needs.push('weightG');
  if (isSnap(g)) needs.push('strengthKg');
  return needs.filter((k) => g.spec[k] === undefined);
}

export function summary(gear: Gear[], logs: StockLog[]) {
  const live = gear.filter((g) => g.status !== '已不在');
  return {
    rows: gear.length,
    items: live.length,
    pieces: live.reduce((n, g) => n + currentQty(g, logs), 0),
    amount: Math.round(gear.reduce((n, g) => n + (g.amount ?? 0), 0) * 10) / 10,
  };
}
