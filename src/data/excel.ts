import * as XLSX from 'xlsx';
import { currentMetres, currentQty, summary } from '../domain/stock';
import { isTemplateList, isTrip } from '../domain/trip';
import type { Trip } from '../domain/trip';
import { CATEGORIES, STATUSES } from '../domain/types';
import type { Category, Gear, Order, Spec, SpecRow, Status, StockLog } from '../domain/types';

type Cell = string | number | undefined;
type Row = Record<string, Cell>;

const GEAR_BASE = [
  '編號',
  '分類',
  '品名',
  '規格/描述',
  '數量',
  '單位',
  '狀態',
  '來源',
  '購入日期',
  '賣場',
  '購入金額(NT$)',
  '備註',
];
const SPEC_COLUMNS: [string, keyof Spec][] = [
  ['子類', 'subtype'],
  ['餌重下限g', 'lureMinG'],
  ['餌重上限g', 'lureMaxG'],
  ['硬度', 'power'],
  ['長度m', 'lengthM'],
  ['釣重kg', 'maxLoadKg'],
  ['適用線號', 'lineRange'],
  ['型號級數', 'reelSize'],
  ['煞車力kg', 'dragKg'],
  ['繞線量', 'capacity'],
  ['目前捲線編號', 'lineNo'],
  ['配對竿編號', 'pairRodNo'],
  ['線種', 'lineType'],
  ['線用途', 'lineRole'],
  ['號數', 'sizeNo'],
  ['拉力kg', 'strengthKg'],
  ['線徑mm', 'diameterMm'],
  ['線長m', 'spoolM'],
  ['剩餘m', 'remainM'],
  ['重量g', 'weightG'],
  ['長度cm', 'lengthCm'],
  ['水層', 'layer'],
  ['假餌類型', 'lureType'],
  ['鉤種', 'hookType'],
  ['鉤號', 'hookNo'],
];
const ID_COLUMN = '內部ID'; // optional: keeps saved trips linked to their gear across a restore
const GEAR_HEAD = [...GEAR_BASE, '子類', '消耗品', '低庫存門檻', ...SPEC_COLUMNS.slice(1).map(([h]) => h)];
const SPEC_HEAD = ['器材', '項目', '參數', '來源/備註', '器材編號'];
const ORDER_HEAD = [
  '訂單編號',
  '平台',
  '下單日期',
  '賣場',
  '品項',
  '規格',
  '分類',
  '數量',
  '小計(NT$)',
  '訂單實付(NT$)',
  '訂單狀態',
  '計入',
  '器材編號',
];
const TEXT_SPECS = new Set<keyof Spec>([
  'subtype',
  'power',
  'lineRange',
  'reelSize',
  'capacity',
  'lineType',
  'lineRole',
  'layer',
  'lureType',
  'hookType',
]);

export interface Extras {
  config?: string;
  templates?: string;
  trips: Trip[];
}

export interface Parsed {
  gear: Gear[];
  orders: Order[];
  extras: Extras;
}

const EXTRA_SHEET = 'App資料';
const CONTINUED = '接續';
const CELL_LIMIT = 30_000; // Excel cells hold 32,767 characters

/** Long values span several rows so a big trip can never make the whole backup fail. */
function extraRows(type: string, value: string) {
  const rows: { 類型: string; 內容: string }[] = [];
  for (let start = 0; start < value.length;) {
    const last = value.charCodeAt(start + CELL_LIMIT - 1);
    const isHighSurrogate = last >= 0xd800 && last <= 0xdbff;
    const end = start + CELL_LIMIT - (isHighSurrogate ? 1 : 0);
    rows.push({ 類型: rows.length ? CONTINUED : type, 內容: value.slice(start, end) });
    start = end;
  }
  return rows;
}
const NO_EXTRAS: Extras = { trips: [] };

function sheetRows(wb: XLSX.WorkBook, name: string, head: string[]): Row[] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`找不到「${name}」分頁，這不是 v2 Excel`);
  const [firstRow] = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
  const missing = head.filter((h) => !firstRow?.includes(h));
  if (missing.length) throw new Error(`「${name}」缺少欄位：${missing.join('、')}`);
  return XLSX.utils.sheet_to_json<Row>(ws, { raw: true });
}

/** Excel turns typed dates into serial numbers; keep them as ISO text. */
function dateText(v: Cell) {
  return typeof v === 'number' ? (XLSX.SSF.format('yyyy-mm-dd', v) as string) : text(v);
}

const blank = (v: Cell) => text(v) ?? '';

function text(v: Cell) {
  return v === undefined || v === '' ? undefined : String(v);
}

function num(v: Cell, where: string) {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${where} 不是數字：${v}`);
  return n;
}

function parseGear(row: Row, specRows: SpecRow[]): Gear {
  const no = num(row['編號'], '編號');
  const where = `第 ${no} 筆器材`;
  const category = row['分類'] as Category;
  const status = row['狀態'] as Status;
  const qty = num(row['數量'], `${where}的數量`);
  if (!no || qty === undefined || !text(row['品名'])) throw new Error(`${where}缺少編號、品名或數量`);
  if (!CATEGORIES.includes(category)) throw new Error(`${where}的分類不正確：${category}`);
  if (!STATUSES.includes(status)) throw new Error(`${where}的狀態不正確：${status}`);

  const spec: Spec = {};
  for (const [head, key] of SPEC_COLUMNS) {
    const value = TEXT_SPECS.has(key) ? text(row[head]) : num(row[head], `${where}的${head}`);
    if (value !== undefined) (spec as Record<string, unknown>)[key] = value;
  }
  return {
    id: text(row[ID_COLUMN]) ?? crypto.randomUUID(),
    no,
    category,
    name: String(row['品名']),
    desc: text(row['規格/描述']),
    qty,
    unit: text(row['單位']),
    status,
    source: text(row['來源']),
    date: dateText(row['購入日期']),
    shop: text(row['賣場']),
    amount: num(row['購入金額(NT$)'], `${where}的金額`),
    note: text(row['備註']),
    consumable: row['消耗品'] === '是',
    threshold: num(row['低庫存門檻'], `${where}的門檻`),
    spec,
    specRows,
    updatedAt: Date.now(),
  };
}

function parseOrder(row: Row): Order {
  const where = `訂單 ${row['訂單編號']}`;
  const subtotal = num(row['小計(NT$)'], `${where}的小計`);
  const qty = num(row['數量'], `${where}的數量`);
  if (!text(row['訂單編號']) || subtotal === undefined || qty === undefined) throw new Error(`${where}資料不完整`);
  return {
    orderNo: String(row['訂單編號']),
    platform: blank(row['平台']),
    date: dateText(row['下單日期']) ?? '',
    shop: blank(row['賣場']),
    item: blank(row['品項']),
    option: text(row['規格']),
    category: text(row['分類']),
    qty,
    subtotal,
    paid: num(row['訂單實付(NT$)'], `${where}的實付`),
    status: blank(row['訂單狀態']),
    counted: row['計入'] === '是',
    gearNo: num(row['器材編號'], `${where}的器材編號`),
  };
}

function readJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseExtras(wb: XLSX.WorkBook): Extras {
  const ws = wb.Sheets[EXTRA_SHEET];
  if (!ws) return NO_EXTRAS;
  const extras: Extras = { trips: [] };
  const entries: { type: unknown; value: string }[] = [];
  for (const row of XLSX.utils.sheet_to_json<Row>(ws, { raw: true })) {
    const previous = entries.at(-1);
    if (row['類型'] === CONTINUED && previous) previous.value += String(row['內容']);
    else entries.push({ type: row['類型'], value: String(row['內容']) });
  }
  for (const { type, value } of entries) {
    const data = readJson(value);
    if (type === '設定' && typeof data === 'object' && data !== null && !Array.isArray(data)) {
      extras.config = value;
    } else if (type === '模板' && isTemplateList(data)) {
      extras.templates = value;
    } else if (type === '釣行' && isTrip(data)) {
      extras.trips.push(data);
    } else {
      throw new Error(`${EXTRA_SHEET}分頁的「${String(type)}」內容不正確`);
    }
  }
  return extras;
}

export function parseWorkbook(data: ArrayBuffer): Parsed {
  const wb = XLSX.read(data, { type: 'array' });
  const specs = new Map<number, SpecRow[]>();
  for (const r of sheetRows(wb, '竿與捲線器規格', SPEC_HEAD)) {
    const no = num(r['器材編號'], '規格分頁的器材編號');
    if (!no) throw new Error('規格分頁有一列沒有器材編號');
    const rows = specs.get(no) ?? [];
    rows.push({
      label: blank(r['器材']),
      item: blank(r['項目']),
      value: blank(r['參數']),
      note: text(r['來源/備註']),
    });
    specs.set(no, rows);
  }
  const gear = sheetRows(wb, '器材清單', GEAR_HEAD).map((r) => parseGear(r, specs.get(Number(r['編號'])) ?? []));
  if (new Set(gear.map((g) => g.no)).size !== gear.length) throw new Error('器材編號有重複');
  if (new Set(gear.map((g) => g.id)).size !== gear.length) throw new Error('內部ID 有重複，請清空該欄後再匯入');
  return { gear, orders: sheetRows(wb, '訂單', ORDER_HEAD).map(parseOrder), extras: parseExtras(wb) };
}

function overviewSheet(gear: Gear[], logs: StockLog[]) {
  const end = gear.length + 1;
  const range = (col: string) => `器材清單!$${col}$2:$${col}$${end}`;
  const f = (v: number, formula: string): XLSX.CellObject => ({ t: 'n', v, f: formula });
  const rows: (string | XLSX.CellObject | null)[][] = [
    ['釣具盤點總覽'],
    [],
    ['分類', '品項數(不含已不在)', '總數量(不含已不在)', '已不在品項數', '購入金額合計(NT$，全部)'],
  ];
  CATEGORIES.forEach((cat, i) => {
    const row = i + 4;
    const of = gear.filter((g) => g.category === cat);
    const s = summary(of, logs);
    rows.push([
      cat,
      f(s.items, `COUNTIFS(${range('B')},A${row},${range('G')},"<>已不在")`),
      f(s.pieces, `SUMIFS(${range('E')},${range('B')},A${row},${range('G')},"<>已不在")`),
      f(s.rows - s.items, `COUNTIFS(${range('B')},A${row},${range('G')},"已不在")`),
      f(s.amount, `SUMIFS(${range('K')},${range('B')},A${row})`),
    ]);
  });
  const s = summary(gear, logs);
  const total = (col: string) => `SUM(${col}4:${col}${3 + CATEGORIES.length})`;
  rows.push([
    '合計',
    f(s.items, total('B')),
    f(s.pieces, total('C')),
    f(s.rows - s.items, total('D')),
    f(s.amount, total('E')),
  ]);
  rows.push([], ['狀態', '品項數']);
  for (const status of STATUSES) {
    const row = rows.length + 1;
    rows.push([status, f(gear.filter((g) => g.status === status).length, `COUNTIF(${range('G')},A${row})`)]);
  }
  return XLSX.utils.aoa_to_sheet(rows);
}

export function buildWorkbook(
  gear: Gear[],
  orders: Order[],
  logs: StockLog[],
  extras: Extras = NO_EXTRAS,
): XLSX.WorkBook {
  const sorted = [...gear].sort((a, b) => a.no - b.no);
  const gearRows = sorted.map((g) => {
    const spec: Spec = { ...g.spec, remainM: currentMetres(g, logs) };
    const row: Row = {
      編號: g.no,
      [ID_COLUMN]: g.id || undefined,
      分類: g.category,
      品名: g.name,
      '規格/描述': g.desc,
      數量: currentQty(g, logs),
      單位: g.unit,
      狀態: g.status,
      來源: g.source,
      購入日期: g.date,
      賣場: g.shop,
      '購入金額(NT$)': g.amount,
      備註: g.note,
      消耗品: g.consumable ? '是' : '否',
      低庫存門檻: g.threshold,
    };
    for (const [head, key] of SPEC_COLUMNS) row[head] = spec[key];
    return row;
  });
  const specRows = sorted.flatMap((g) =>
    g.specRows.map((r) => ({ 器材: r.label, 項目: r.item, 參數: r.value, '來源/備註': r.note, 器材編號: g.no })),
  );
  const orderRows = orders.map((o) => ({
    訂單編號: o.orderNo,
    平台: o.platform,
    下單日期: o.date,
    賣場: o.shop,
    品項: o.item,
    規格: o.option,
    分類: o.category,
    數量: o.qty,
    '小計(NT$)': o.subtotal,
    '訂單實付(NT$)': o.paid,
    訂單狀態: o.status,
    計入: o.counted ? '是' : '否',
    器材編號: o.gearNo,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, overviewSheet(sorted, logs), '總覽');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(specRows, { header: SPEC_HEAD }), '竿與捲線器規格');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(gearRows, { header: [...GEAR_HEAD, ID_COLUMN] }),
    '器材清單',
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows, { header: ORDER_HEAD }), '訂單');
  const extra = [
    ...extraRows('設定', extras.config ?? ''),
    ...extraRows('模板', extras.templates ?? ''),
    ...extras.trips.flatMap((t) => extraRows('釣行', JSON.stringify(t))),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(extra, { header: ['類型', '內容'] }), EXTRA_SHEET);
  return wb;
}

export const workbookBytes = (wb: XLSX.WorkBook) => XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
