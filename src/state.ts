import { signal } from '@preact/signals';
import { liveQuery } from 'dexie';
import { consume, db, undoConsume } from './data/db';
import { DEFAULT_CONFIG } from './domain/rules/common';
import type { RuleConfig } from './domain/rules/common';
import { DEFAULT_TEMPLATES, isTemplateList } from './domain/trip';
import type { Template, Trip } from './domain/trip';
import type { Gear, Order, StockLog } from './domain/types';

export type Tab = '裝備' | '出發' | '比對' | '庫存' | '設定';
export type Theme = 'auto' | 'light' | 'dark';

const THEME_KEY = 'theme';
const readTheme = (): Theme => {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'auto';
  } catch {
    return 'auto';
  }
};

export const tab = signal<Tab>('裝備');
export const gear = signal<Gear[]>([]);
export const logs = signal<StockLog[]>([]);
export const orders = signal<Order[]>([]);
export const photos = signal<Map<string, string>>(new Map());
export const lastBackupAt = signal<number | undefined>(undefined);
export const loaded = signal(false);
export const config = signal<RuleConfig>(DEFAULT_CONFIG);
export const templates = signal<Template[]>(DEFAULT_TEMPLATES);
export const trips = signal<Trip[]>([]);
export const theme = signal<Theme>(readTheme());
export const editing = signal<Gear | 'new' | null>(null);
export const cutting = signal<Gear | null>(null);
export const toast = signal<{ text: string; undo?: () => void } | null>(null);

function parsed<T>(raw: unknown, fallback: T): T {
  try {
    return typeof raw === 'string' ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const fail = (e: unknown) => showToast(e instanceof Error ? e.message : '資料讀取失敗');

export function startLiveData() {
  liveQuery(() => db.gear.orderBy('no').toArray()).subscribe((rows) => {
    gear.value = rows;
    loaded.value = true;
  }, fail);
  liveQuery(() => db.stockLog.toArray()).subscribe((rows) => (logs.value = rows), fail);
  liveQuery(() => db.orders.toArray()).subscribe((rows) => (orders.value = rows), fail);
  liveQuery(() => db.settings.get('lastBackupAt')).subscribe((s) => {
    lastBackupAt.value = s?.value as number | undefined;
  }, fail);
  liveQuery(() => db.settings.get('config')).subscribe((s) => {
    config.value = { ...DEFAULT_CONFIG, ...parsed<Partial<RuleConfig>>(s?.value, {}) };
  }, fail);
  liveQuery(() => db.settings.get('templates')).subscribe((s) => {
    const list = parsed<unknown>(s?.value, DEFAULT_TEMPLATES);
    templates.value = isTemplateList(list) ? list : DEFAULT_TEMPLATES;
  }, fail);
  liveQuery(() => db.trips.orderBy('at').reverse().toArray()).subscribe((rows) => (trips.value = rows), fail);
  liveQuery(() => db.photos.toArray()).subscribe((rows) => {
    photos.value.forEach((url) => URL.revokeObjectURL(url));
    photos.value = new Map(rows.map((p) => [p.gearId, URL.createObjectURL(p.blob)]));
  }, fail);
}

export function applyTheme(next: Theme) {
  theme.value = next;
  if (next === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Private mode: the choice just lasts for this session.
  }
}

let toastTimer: ReturnType<typeof setTimeout>;
export function showToast(text: string, undo?: () => void) {
  clearTimeout(toastTimer);
  toast.value = { text, undo };
  toastTimer = setTimeout(() => (toast.value = null), 6000);
}

export async function use(g: Gear, kind: StockLog['kind'], amount: number) {
  try {
    const logId = await consume(g, kind, amount);
    if (!logId) return;
    const text = kind === 'm' ? `已剪 ${amount}m` : '已扣 1';
    showToast(`${g.name}：${text}`, () => void undoConsume(logId, g));
  } catch (e) {
    fail(e);
  }
}
