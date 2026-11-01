export const STATUSES = ['持有', '存放他處', '在途', '用完', '已不在'] as const;
export type Status = (typeof STATUSES)[number];

export const CATEGORIES = [
  '竿與捲線器',
  '釣線',
  '鉤',
  '假餌',
  '浮標/助投器',
  '鉛/天秤',
  '配件',
  '工具',
  '收納',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const LAYERS = ['水面', '中層', '沉水', '沉底'] as const;

export interface Spec {
  subtype?: string;
  lureMinG?: number;
  lureMaxG?: number;
  power?: string;
  lengthM?: number;
  maxLoadKg?: number;
  lineRange?: string;
  reelSize?: string;
  dragKg?: number;
  capacity?: string;
  lineNo?: number;
  pairRodNo?: number;
  lineType?: string;
  lineRole?: string;
  sizeNo?: number;
  strengthKg?: number;
  diameterMm?: number;
  spoolM?: number;
  remainM?: number;
  weightG?: number;
  lengthCm?: number;
  layer?: string;
  lureType?: string;
  hookType?: string;
  hookNo?: number;
}

export interface SpecRow {
  label: string;
  item: string;
  value: string;
  note?: string;
}

export interface Gear {
  id: string;
  no: number;
  category: Category;
  name: string;
  desc?: string;
  qty: number;
  unit?: string;
  status: Status;
  source?: string;
  date?: string;
  shop?: string;
  amount?: number;
  note?: string;
  consumable: boolean;
  threshold?: number;
  spec: Spec;
  specRows: SpecRow[];
  updatedAt: number;
}

export interface Order {
  id?: number;
  orderNo: string;
  platform: string;
  date: string;
  shop: string;
  item: string;
  option?: string;
  category?: string;
  qty: number;
  subtotal: number;
  paid?: number;
  status: string;
  counted: boolean;
  gearNo?: number;
  updatedAt?: number;
}

/** Stock changes are appended, never overwritten, so a later sync can merge them. */
export interface StockLog {
  id: string;
  gearId: string;
  kind: 'qty' | 'm';
  delta: number;
  at: number;
}
