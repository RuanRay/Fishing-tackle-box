import { LAYERS } from '../domain/types';
import type { Gear, Spec } from '../domain/types';

export interface Field {
  key: keyof Spec;
  label: string;
  options?: readonly string[];
  text?: boolean;
}

const f = (key: keyof Spec, label: string, extra: Partial<Field> = {}): Field => ({ key, label, ...extra });

const SUBTYPE = f('subtype', '子類', { options: ['竿', '捲線器'] });
const ROD = [
  f('lureMinG', '餌重下限 g'),
  f('lureMaxG', '餌重上限 g'),
  f('power', '硬度', { text: true }),
  f('lengthM', '長度 m'),
  f('maxLoadKg', '釣重 kg'),
  f('lineRange', '適用線號', { text: true }),
];
const REEL = [
  f('reelSize', '型號級數', { text: true }),
  f('dragKg', '煞車力 kg'),
  f('capacity', '繞線量', { text: true }),
  f('lineNo', '目前捲線編號'),
  f('pairRodNo', '配對竿編號'),
];
const LINE = [
  f('lineType', '種類', { text: true }),
  f('lineRole', '用途', { options: ['主線', '子線'] }),
  f('sizeNo', '號數'),
  f('strengthKg', '拉力 kg'),
  f('diameterMm', '線徑 mm'),
  f('spoolM', '線長 m'),
  f('remainM', '剩餘 m'),
];
const LURE = [
  f('weightG', '重量 g'),
  f('lengthCm', '長度 cm'),
  f('layer', '水層', { options: LAYERS }),
  f('lureType', '類型', { text: true }),
  f('hookType', '鉤種', { text: true }),
  f('hookNo', '原鉤號'),
];
const HOOK = [f('hookType', '鉤種', { text: true }), f('hookNo', '鉤號')];
const WEIGHT = [f('weightG', '重量 g')];
const PARTS = [
  f('sizeNo', '號數'),
  f('strengthKg', '拉力 kg'),
  f('lureMinG', '適用餌重下限 g'),
  f('lureMaxG', '適用餌重上限 g'),
];

const ALL = [SUBTYPE, ...ROD, ...REEL, ...LINE, ...LURE, ...PARTS];

export function lureSpec(g: Gear) {
  const parts = [g.spec.weightG && `${g.spec.weightG}g`, g.spec.lengthCm && `${g.spec.lengthCm}cm`];
  return parts.filter(Boolean).join(' · ') || '重量未登記';
}

export const fieldOf = (key: keyof Spec) => ALL.find((x) => x.key === key)!;

export function fieldsFor(g: Pick<Gear, 'category' | 'spec'>): Field[] {
  switch (g.category) {
    case '竿與捲線器':
      return [SUBTYPE, ...(g.spec.subtype === '捲線器' ? REEL : ROD)];
    case '釣線':
      return LINE;
    case '假餌':
      return LURE;
    case '鉤':
      return HOOK;
    case '浮標/助投器':
    case '鉛/天秤':
      return WEIGHT;
    case '配件':
      return PARTS;
    default:
      return [];
  }
}
