import { fixedCombos, lureRows } from './rules/combo';
import type { RuleConfig } from './rules/common';
import { isSnap } from './stock';
import type { Category, Gear } from './types';

export interface Requirement {
  label: string;
  category?: Category;
  keyword?: string;
}

export interface Template {
  name: string;
  rod: 'light' | 'heavy';
  lures: boolean;
  required: Requirement[];
}

export interface TripItem {
  key: string;
  group: string;
  label: string;
  gearId?: string;
  missing: boolean;
  checked: boolean;
}

export interface Trip {
  id: string;
  name: string;
  at: number;
  items: TripItem[];
}

const SNAP = { label: '別針', keyword: '別針' };
const PLIERS = { label: '路亞鉗', keyword: '鉗' };
const SCISSORS = { label: '剪刀', keyword: '剪' };
const POUCH = { label: '腰包', keyword: '腰包' };
const LEADER = { label: '子線', keyword: '碳素' };
const HOOKS: Requirement = { label: '鉤', category: '鉤' };
const SINKERS: Requirement = { label: '鉛', category: '鉛/天秤' };
const FLOATS: Requirement = { label: '浮標', category: '浮標/助投器' };

export const DEFAULT_TEMPLATES: Template[] = [
  { name: '溪流微物', rod: 'light', lures: true, required: [SNAP, LEADER, PLIERS, SCISSORS, POUCH] },
  { name: '池塘／河川路亞', rod: 'heavy', lures: true, required: [SNAP, LEADER, PLIERS, SCISSORS, POUCH] },
  {
    name: '浮釣',
    rod: 'heavy',
    lures: false,
    required: [FLOATS, HOOKS, SINKERS, { label: '太空豆', keyword: '太空豆' }, LEADER, SCISSORS],
  },
  { name: '沉底釣', rod: 'heavy', lures: false, required: [SINKERS, HOOKS, LEADER, SNAP, SCISSORS] },
];

const matches = (g: Gear, r: Requirement) =>
  (!r.category || g.category === r.category) &&
  (!r.keyword || g.name.includes(r.keyword)) &&
  (r.keyword !== SNAP.keyword || isSnap(g));

const item = (group: string, label: string, gearId: string | undefined, missing = false): TripItem => ({
  key: `${group}:${gearId ?? label}`,
  group,
  label,
  gearId,
  missing,
  checked: false,
});

/** For a template that no longer exists: keep the list, but mark what can't be packed now. */
export function refreshItems(items: TripItem[], gear: Gear[]): TripItem[] {
  return items.map((i) => {
    const held = gear.some((g) => g.id === i.gearId && g.status === '持有');
    return { ...i, checked: false, missing: !held };
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export const isTemplateList = (v: unknown): v is Template[] =>
  Array.isArray(v) && v.every((t) => isRecord(t) && typeof t.name === 'string' && Array.isArray(t.required));

export const isTrip = (v: unknown): v is Trip =>
  isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string' && Array.isArray(v.items);

export function buildTrip(template: Template, gear: Gear[], config: RuleConfig): TripItem[] {
  const owned = gear.filter((g) => g.status === '持有');
  const combos = fixedCombos(owned);
  const rated = combos
    .filter((c) => c.rod.spec.lureMaxG !== undefined)
    .sort((a, b) => a.rod.spec.lureMaxG! - b.rod.spec.lureMaxG!);
  const pool = rated.length ? rated : combos;
  const combo = template.rod === 'light' ? pool[0] : pool.at(-1);
  const items: TripItem[] = [];
  if (combo) {
    items.push(item('竿輪', combo.rod.name, combo.rod.id), item('竿輪', combo.reel.name, combo.reel.id));
    if (combo.line) items.push(item('竿輪', combo.line.name, combo.line.id));
    if (template.lures) {
      for (const { g, verdict } of lureRows(combo.rod, owned, config)) {
        if (verdict.level === 'ok') items.push(item('假餌', g.name, g.id));
      }
    }
  } else {
    items.push(item('竿輪', '沒有可用的竿輪組合', undefined, true));
  }
  for (const r of template.required) {
    const found = owned.filter((g) => matches(g, r));
    if (found.length) items.push(...found.map((g) => item(r.label, g.name, g.id)));
    else items.push(item(r.label, `缺${r.label}`, undefined, true));
  }
  return items;
}
