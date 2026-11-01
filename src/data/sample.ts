import * as XLSX from 'xlsx';
import { CATEGORIES, LAYERS, STATUSES } from '../domain/types';
import type { Gear, Order } from '../domain/types';
import { buildWorkbook, workbookBytes } from './excel';

// No id: each row gets its own on import, so copying a row to add gear is safe.
const gear = (over: Partial<Gear> & Pick<Gear, 'no' | 'category' | 'name'>): Gear => ({
  id: '',
  qty: 1,
  status: '持有',
  consumable: false,
  spec: {},
  specRows: [],
  updatedAt: 0,
  ...over,
});

function sampleGear(): Gear[] {
  return [
    gear({
      no: 1,
      category: '竿與捲線器',
      name: '範例微物竿',
      desc: '1.8m UL',
      unit: '支',
      amount: 800,
      date: '2026-01-10',
      shop: '範例釣具店',
      source: '網購',
      spec: { subtype: '竿', lureMinG: 1, lureMaxG: 7, power: 'UL', lengthM: 1.8, maxLoadKg: 2 },
      specRows: [{ label: '範例竿 1', item: '導環', value: '7 個' }],
    }),
    gear({
      no: 2,
      category: '竿與捲線器',
      name: '範例路亞竿',
      desc: '2.1m M',
      unit: '支',
      amount: 1200,
      date: '2026-01-10',
      shop: '範例釣具店',
      source: '網購',
      spec: { subtype: '竿', lureMinG: 5, lureMaxG: 25, power: 'M', lengthM: 2.1 },
    }),
    gear({
      no: 3,
      category: '竿與捲線器',
      name: '範例紡車輪 1000',
      unit: '顆',
      amount: 900,
      date: '2026-01-12',
      shop: '範例釣具店',
      source: '網購',
      spec: {
        subtype: '捲線器',
        reelSize: '1000',
        dragKg: 3,
        capacity: 'PE:0.6/150;0.8/120;1.0/100',
        lineNo: 5,
        pairRodNo: 1,
      },
    }),
    gear({
      no: 4,
      category: '竿與捲線器',
      name: '範例紡車輪 3000',
      unit: '顆',
      amount: 1100,
      date: '2026-01-12',
      shop: '範例釣具店',
      source: '網購',
      spec: {
        subtype: '捲線器',
        reelSize: '3000',
        dragKg: 5,
        capacity: 'mm:0.20/240;0.25/200',
        lineNo: 6,
        pairRodNo: 2,
      },
    }),
    gear({
      no: 5,
      category: '釣線',
      name: '範例 PE 線 0.6 號',
      unit: '卷',
      amount: 300,
      consumable: true,
      threshold: 30,
      spec: { lineType: 'PE', lineRole: '主線', sizeNo: 0.6, strengthKg: 6, spoolM: 120, remainM: 120 },
    }),
    gear({
      no: 6,
      category: '釣線',
      name: '範例 PE 線 1.5 號',
      unit: '卷',
      amount: 400,
      consumable: true,
      threshold: 30,
      spec: { lineType: 'PE', lineRole: '主線', sizeNo: 1.5, spoolM: 150, remainM: 150 },
    }),
    gear({
      no: 7,
      category: '釣線',
      name: '範例碳素子線 1 號',
      unit: '卷',
      amount: 200,
      consumable: true,
      threshold: 10,
      spec: { lineType: '碳線', lineRole: '子線', sizeNo: 1, strengthKg: 2, spoolM: 50, remainM: 8 },
    }),
    gear({
      no: 8,
      category: '假餌',
      name: '範例 VIB',
      desc: '5g 3.5cm',
      qty: 3,
      unit: '個',
      amount: 150,
      consumable: true,
      spec: { lureType: 'VIB', weightG: 5, lengthCm: 3.5, layer: '中層', hookType: '三本鉤', hookNo: 14 },
    }),
    gear({
      no: 9,
      category: '假餌',
      name: '範例亮片（重量待補）',
      unit: '個',
      consumable: true,
      spec: { lureType: '亮片' },
    }),
    gear({
      no: 10,
      category: '鉤',
      name: '範例三本鉤',
      desc: '#12',
      qty: 10,
      unit: '支',
      amount: 50,
      consumable: true,
      threshold: 2,
      spec: { hookType: '三本鉤', hookNo: 12 },
    }),
    gear({
      no: 11,
      category: '配件',
      name: '範例別針',
      desc: '0 號 13kg',
      qty: 20,
      unit: '個',
      amount: 60,
      consumable: true,
      threshold: 3,
      spec: { sizeNo: 0, strengthKg: 13, lureMinG: 1, lureMaxG: 7 },
    }),
    gear({
      no: 12,
      category: '鉛/天秤',
      name: '中通鉛（範例）',
      qty: 5,
      unit: '顆',
      consumable: true,
      spec: { weightG: 3 },
    }),
    gear({ no: 13, category: '工具', name: '範例路亞鉗', unit: '把', amount: 250 }),
    gear({ no: 14, category: '工具', name: '範例剪刀', unit: '把', amount: 80 }),
    gear({ no: 15, category: '收納', name: '範例腰包', unit: '個', amount: 350, status: '在途', date: '2026-02-01' }),
  ];
}

const order = (over: Partial<Order> & Pick<Order, 'orderNo' | 'item' | 'subtotal'>): Order => ({
  platform: '網購',
  date: '2026-01-10',
  shop: '範例釣具店',
  qty: 1,
  status: '已完成',
  counted: true,
  ...over,
});

const sampleOrders = (): Order[] => [
  order({ orderNo: 'SAMPLE-001', item: '範例微物竿', subtotal: 800, paid: 800, gearNo: 1 }),
  order({ orderNo: 'SAMPLE-002', item: '範例腰包', subtotal: 350, paid: 350, status: '運送中', gearNo: 15 }),
  order({ orderNo: 'SAMPLE-003', item: '範例米諾 7g 12#', subtotal: 120, status: '已取消', counted: false }),
];

const GUIDE: [string, string][] = [
  ['這是什麼', '虛構資料的範例檔，可直接匯入試用，也可刪掉資料列後填入自己的器材'],
  ['必要分頁', '竿與捲線器規格、器材清單、訂單；總覽會在匯出時重新計算'],
  ['分類', CATEGORIES.join('、')],
  ['狀態', STATUSES.join('、')],
  ['水層', LAYERS.join('、')],
  ['編號', '每件器材一個不重複的數字；竿子子類填「竿」，捲線器填「捲線器」'],
  ['內部ID', '留空即可，匯入時會自動產生；複製別的列時不要連同內容一起複製'],
  ['配對竿編號', '填在捲線器那一列，指向竿子的編號，會組成固定套組'],
  ['目前捲線編號', '填在捲線器那一列，指向線材的編號'],
  ['繞線量', 'PE 表寫成 PE:號數/公尺;號數/公尺，線徑表寫成 mm:線徑/公尺;線徑/公尺'],
  ['線材', '剪線按鈕需要「剩餘m」有值、消耗品填「是」，且狀態為持有或存放他處；用途填主線或子線'],
  ['消耗品', '填「是」或「否」；低庫存門檻留空就不提醒，線材的門檻單位是公尺'],
  ['規格留空', 'App 會標成「待補」，不會猜測'],
  ['訂單', '同一張訂單多列時，訂單實付每列都填相同金額；計入填「是」或「否」'],
];

export function sampleFile() {
  const wb = buildWorkbook(sampleGear(), sampleOrders(), []);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['項目', '說明'], ...GUIDE]), '說明');
  return workbookBytes(wb);
}
