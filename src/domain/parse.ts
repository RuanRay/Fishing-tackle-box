import type { Category, Gear, Order } from './types';

const SIMPLIFIED: Record<string, string> = {
  钩: '鉤',
  钓: '釣',
  饵: '餌',
  线: '線',
  铅: '鉛',
  别: '別',
  针: '針',
  轮: '輪',
  杆: '竿',
  纺: '紡',
  诺: '諾',
  蚁: '蟻',
  蝇: '蠅',
  飞: '飛',
  响: '響',
  马: '馬',
  号: '號',
  环: '環',
  转: '轉',
  软: '軟',
  铁: '鐵',
  纳: '納',
  芦: '蘆',
  骚: '蓑',
  騷: '蓑',
};

export const normalize = (text: string) => [...text.toUpperCase()].map((c) => SIMPLIFIED[c] ?? c).join('');

const LURE_TYPES = ['VIB', '米諾', '亮片', 'CRANK', '波趴', 'POPPER', '鐵板', '軟餌', '硬餌', '毛鉤', '蓑羽', '飛蠅'];
const VOCAB = [
  ...LURE_TYPES,
  '微物',
  '毒蚊',
  '響尾蛇',
  '之字狗',
  '蟻',
  '馬口',
  '助投器',
  '收納',
  '配件盒',
  '腰包',
  '別針',
  '轉環',
  '太空豆',
  'PE',
  '碳線',
  '碳素',
  '路亞鉗',
  '手套',
  '竿袋',
  '水桶',
  '釣魚桶',
  '背心',
  '捲線器',
  '紡車輪',
  '路亞竿',
];

export interface Draft {
  category: Category;
  name: string;
  lureType?: string;
  weightG?: number;
  lengthCm?: number;
  hookNo?: number;
  sizeNo?: number;
  lineType?: string;
  lineM?: number;
}

function firstNumber(text: string, pattern: RegExp) {
  const m = text.match(pattern);
  return m?.[1] === undefined ? undefined : Number(m[1]);
}

function categoryOf(t: string, lureType?: string, lineType?: string): Category {
  if (lureType) return '假餌';
  if (lineType || /主線|子線|前導線/.test(t)) return '釣線';
  if (/別針|轉環|太空豆|八字環/.test(t)) return '配件';
  if (/浮標|助投器/.test(t)) return '浮標/助投器';
  if (/鉛/.test(t)) return '鉛/天秤';
  if (/鉤/.test(t)) return '鉤';
  if (/盒|包|袋|箱/.test(t)) return '收納';
  if (/鉗|剪|手套/.test(t)) return '工具';
  if (/竿|紡車輪|捲線器/.test(t)) return '竿與捲線器';
  return '配件';
}

function lineTypeOf(t: string) {
  if (/(?<![A-Z])PE(?![A-Z])/.test(t)) return 'PE';
  return /碳線|碳素(?:子|尼龍)?線|碳纖線|前導線/.test(t) ? '碳線' : undefined;
}

export function parseProduct(text: string): Draft {
  const t = normalize(text);
  const lureType = LURE_TYPES.find((k) => t.includes(k));
  const lineType = lureType ? undefined : lineTypeOf(t);
  const mm = firstNumber(t, /(\d+(?:\.\d+)?)\s*MM/);
  const category = categoryOf(t, lureType, lineType);
  const marked = firstNumber(t, /(\d+(?:\.\d+)?)\s*#/) ?? firstNumber(t, /#\s*(\d+(?:\.\d+)?)/);
  const named = firstNumber(t, /(\d+(?:\.\d+)?)\s*號/);
  return {
    category,
    name: text.trim().slice(0, 60),
    lureType,
    weightG: firstNumber(t, /(\d+(?:\.\d+)?)\s*(?:G|克)(?![A-Z])/),
    lengthCm: firstNumber(t, /(\d+(?:\.\d+)?)\s*CM/) ?? (mm === undefined ? undefined : mm / 10),
    hookNo: category === '假餌' || category === '鉤' ? (marked ?? named) : undefined,
    sizeNo: category === '假餌' || category === '鉤' ? undefined : (named ?? marked),
    lineType,
    lineM: firstNumber(t, /(\d+)\s*(?:M|米)(?![A-Z])/),
  };
}

const sharedWords = (a: string, b: string) => VOCAB.filter((w) => a.includes(w) && b.includes(w));

export function findDuplicates(draft: Draft, gear: Gear[]) {
  const name = normalize(draft.name);
  return gear.filter((g) => {
    if (g.category !== draft.category || g.status === '已不在') return false;
    const s = g.spec;
    if (g.category === '假餌') {
      const close = draft.weightG !== undefined && s.weightG !== undefined && Math.abs(draft.weightG - s.weightG) <= 1;
      return close && !!s.lureType && normalize(s.lureType) === draft.lureType;
    }
    if (g.category === '鉤') return draft.hookNo !== undefined && s.hookNo === draft.hookNo;
    if (g.category === '釣線') return s.lineType === draft.lineType && s.sizeNo === draft.sizeNo;
    return sharedWords(name, normalize(`${g.name}${g.desc ?? ''}`)).length > 0;
  });
}

/** Sizes such as 16# count as keywords too, because they are what repeats between listings. */
function keywords(text: string) {
  const t = normalize(text);
  const sizes = t.replace(/#\s*(\d+)/g, '$1#').match(/\d+(?:\.\d+)?\s*(?:#|G(?![A-Z])|克)/g) ?? [];
  return new Set([...VOCAB.filter((w) => t.includes(w)), ...sizes.map((s) => s.replace(/\s/g, '').replace('克', 'G'))]);
}

export function findCancelled(text: string, orders: Order[], minShared = 2) {
  const wanted = keywords(text);
  return orders.filter((o) => {
    if (o.counted) return false;
    const found = keywords(`${o.item} ${o.option ?? ''}`);
    return [...wanted].filter((w) => found.has(w)).length >= minShared;
  });
}
