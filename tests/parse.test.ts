import { describe, expect, it } from 'vitest';
import { findCancelled, findDuplicates, normalize, parseProduct } from '../src/domain/parse';
import type { Gear, Order } from '../src/domain/types';

const gear = (over: Partial<Gear>): Gear => ({
  id: 'g',
  no: 1,
  category: '假餌',
  name: 'x',
  qty: 10,
  status: '持有',
  consumable: true,
  spec: {},
  specRows: [],
  updatedAt: 0,
  ...over,
});
const order = (item: string, option: string, counted = false): Order => ({
  orderNo: 'o',
  platform: '拼多多',
  date: 'd',
  shop: 's',
  item,
  option,
  qty: 1,
  subtotal: 1,
  status: '已取消',
  counted,
});

describe('parseProduct', () => {
  it('reads a lure with hook size', () => {
    expect(parseProduct('VIB 5g 14# 鉤')).toMatchObject({ category: '假餌', lureType: 'VIB', weightG: 5, hookNo: 14 });
  });

  it('understands simplified text', () => {
    expect(normalize('钩')).toBe('鉤');
    expect(parseProduct('名犀vib路亚饵 5克 长3.6cm 配14#钩')).toMatchObject({
      lureType: 'VIB',
      weightG: 5,
      lengthCm: 3.6,
      hookNo: 14,
    });
  });

  it('reads a line', () => {
    expect(parseProduct('8编 PE线 0.8号 150米')).toMatchObject({
      category: '釣線',
      lineType: 'PE',
      sizeNo: 0.8,
      lineM: 150,
    });
  });

  it('takes the size from the category, not the symbol', () => {
    expect(parseProduct('PE 1.5# 100M')).toMatchObject({ sizeNo: 1.5, hookNo: undefined, lineM: 100 });
    expect(parseProduct('白袖鉤 5号')).toMatchObject({ category: '鉤', hookNo: 5, sizeNo: undefined });
  });

  it('does not see PE inside other words and knows carbon names', () => {
    expect(parseProduct('SUPER 別針 2#')).toMatchObject({ category: '配件', lineType: undefined });
    expect(parseProduct('POPPER 10g').lineType).toBeUndefined();
    expect(parseProduct('碳素子線 0.8號')).toMatchObject({ category: '釣線', lineType: '碳線', sizeNo: 0.8 });
    expect(parseProduct('碳素尼龍線 3號').category).toBe('釣線');
    expect(parseProduct('碳素路亞竿').category).toBe('竿與捲線器');
  });

  it('reads accessories and bags', () => {
    expect(parseProduct('增强葫芦别针 0号').category).toBe('配件');
    expect(parseProduct('防水配件盒').category).toBe('收納');
  });
});

describe('findDuplicates', () => {
  const vib = gear({ name: '名犀 VIB', spec: { lureType: 'VIB', weightG: 5 } });

  it('matches a lure of the same type within 1g', () => {
    expect(findDuplicates(parseProduct('VIB 6g'), [vib])).toEqual([vib]);
    expect(findDuplicates(parseProduct('VIB 7g'), [vib])).toEqual([]);
    expect(findDuplicates(parseProduct('米諾 5g'), [vib])).toEqual([]);
  });

  it('matches hooks by size and lines by type and size', () => {
    const hook = gear({ category: '鉤', spec: { hookNo: 8 } });
    const line = gear({ category: '釣線', spec: { lineType: 'PE', sizeNo: 0.8 } });
    expect(findDuplicates(parseProduct('翻轉鉤 #8'), [hook])).toEqual([hook]);
    expect(findDuplicates(parseProduct('PE 0.8號'), [line])).toEqual([line]);
    expect(findDuplicates(parseProduct('PE 1.0號'), [line])).toEqual([]);
  });

  it('treats a line size the listing does not state as unknown', () => {
    const line = gear({ category: '釣線', spec: { lineType: 'PE', sizeNo: 0.8 } });
    expect(findDuplicates(parseProduct('PE線 100米'), [line])).toEqual([line]);
    expect(findDuplicates(parseProduct('主線'), [line])).toEqual([]);
  });

  it('matches accessories by shared keyword and ignores gone gear', () => {
    const snap = gear({ category: '配件', name: '增強葫蘆別針' });
    expect(findDuplicates(parseProduct('快速別針'), [snap])).toEqual([snap]);
    expect(findDuplicates(parseProduct('快速別針'), [{ ...snap, status: '已不在' }])).toEqual([]);
  });
});

describe('findCancelled', () => {
  const cancelled = order('蓑羽高光炫彩蚂蚁钩飞蝇钩', '16#,混色高光蚂蚁10枚');

  it('needs two shared keywords on a cancelled order', () => {
    expect(findCancelled('騷羽 16#', [cancelled])).toEqual([cancelled]);
    expect(findCancelled('16#', [cancelled])).toEqual([]);
    expect(findCancelled('騷羽 #16', [cancelled])).toEqual([cancelled]);
  });

  it('skips orders that went through', () => {
    expect(findCancelled('騷羽 16#', [{ ...cancelled, counted: true }])).toEqual([]);
  });
});
