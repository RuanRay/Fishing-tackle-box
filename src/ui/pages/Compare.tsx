import { useState } from 'preact/hooks';
import { nextNo, saveGear } from '../../data/db';
import { today } from '../../domain/date';
import { findCancelled, findDuplicates, parseProduct } from '../../domain/parse';
import type { Draft } from '../../domain/parse';
import { reels, rods } from '../../domain/rules/combo';
import { checkLureWeight } from '../../domain/rules/lureWeight';
import { checkSpool } from '../../domain/rules/spool';
import { currentQty } from '../../domain/stock';
import { CATEGORIES } from '../../domain/types';
import type { Category, Gear, Spec } from '../../domain/types';
import { config, gear, logs, orders, showToast, tab } from '../../state';
import { NumberInput } from '../components/NumberInput';
import { Check } from '../components/Tag';

const NUMBER_FIELDS: { key: keyof Draft; label: string }[] = [
  { key: 'weightG', label: '重量 g' },
  { key: 'lengthCm', label: '長度 cm' },
  { key: 'hookNo', label: '鉤號' },
  { key: 'sizeNo', label: '號數' },
  { key: 'lineM', label: '線長 m' },
];

/** Each category keeps only its own type, so a corrected draft cannot carry the old one. */
const withCategory = (draft: Draft, category: Category): Draft => ({
  ...draft,
  category,
  lureType: category === '假餌' ? draft.lureType : undefined,
  lineType: category === '釣線' ? draft.lineType : undefined,
});

function Confirm({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const line = draft.category === '釣線';
  return (
    <section class="card pad">
      <h2>確認抓到的值</h2>
      <div class="grid2">
        <label class="field">
          分類
          <select
            value={draft.category}
            onChange={(e) => onChange(withCategory(draft, e.currentTarget.value as Category))}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label class="field">
          類型
          <input
            value={(line ? draft.lineType : draft.lureType) ?? ''}
            onInput={(e) => {
              const value = e.currentTarget.value.toUpperCase() || undefined;
              onChange({ ...draft, ...(line ? { lineType: value } : { lureType: value }) });
            }}
          />
        </label>
        {NUMBER_FIELDS.map(({ key, label }) => (
          <label class={`field${draft[key] === undefined ? ' pending' : ''}`} key={key}>
            {label}
            <NumberInput
              placeholder="待補"
              value={draft[key] as number | undefined}
              onValue={(value) => onChange({ ...draft, [key]: value })}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function Fit({ draft }: { draft: Draft }) {
  if (draft.category === '假餌') {
    return (
      <section class="card list">
        <h3 class="group">適用性</h3>
        {rods(gear.value).map((rod) => (
          <Check key={rod.id} name={rod.name} verdict={checkLureWeight(draft.weightG, rod.spec, config.value)} />
        ))}
      </section>
    );
  }
  if (draft.category === '釣線') {
    const line: Spec = { sizeNo: draft.sizeNo };
    return (
      <section class="card list">
        <h3 class="group">適用性</h3>
        {reels(gear.value).map((reel) => (
          <Check key={reel.id} name={reel.name} verdict={checkSpool(line, draft.lineM, reel.spec)} />
        ))}
      </section>
    );
  }
  return null;
}

function toGear(draft: Draft, amount: number | undefined, no: number): Gear {
  const line = draft.category === '釣線';
  return {
    id: crypto.randomUUID(),
    no,
    category: draft.category,
    name: draft.name,
    qty: 1,
    status: '在途',
    consumable: line || ['假餌', '鉤', '鉛/天秤'].includes(draft.category),
    amount,
    date: today(),
    source: '網購',
    spec: {
      lureType: draft.lureType,
      weightG: draft.weightG,
      lengthCm: draft.lengthCm,
      hookNo: draft.hookNo,
      sizeNo: draft.sizeNo,
      lineType: draft.lineType,
      ...(draft.lineM !== undefined ? { spoolM: draft.lineM, remainM: draft.lineM } : {}),
    },
    specRows: [],
    updatedAt: 0,
  };
}

function AddTransit({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const [price, setPrice] = useState('');
  const [yuan, setYuan] = useState(false);
  const value = price === '' ? undefined : Number(price);
  const { rate, fee } = config.value;
  const amount = value !== undefined && yuan ? Math.round((value * rate + fee) * 10) / 10 : value;
  const add = async () => {
    await saveGear(toGear(draft, amount, await nextNo()));
    showToast('已加入在途');
    onDone();
    tab.value = '庫存';
  };
  return (
    <section class="card pad">
      <div class="grid2">
        <label class="field">
          價格（可留空）
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={price}
            onInput={(e) => setPrice(e.currentTarget.value)}
          />
        </label>
        <label class="check">
          <input type="checkbox" checked={yuan} onChange={(e) => setYuan(e.currentTarget.checked)} />
          CN¥
        </label>
      </div>
      {yuan && amount !== undefined && <p>估算 NT${amount}（到貨後可改成實付）</p>}
      <button class="primary" onClick={() => void add()}>
        加入在途
      </button>
    </section>
  );
}

export function Compare() {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<Draft>();

  const dups = draft ? findDuplicates(draft, gear.value) : [];
  const cancelled = draft ? findCancelled(text, orders.value) : [];
  return (
    <>
      <section class="form">
        <textarea
          aria-label="商品文字"
          rows={4}
          placeholder="貼上商品名稱與規格，例如 VIB 5g 14# 鉤"
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button class="primary" disabled={!text.trim()} onClick={() => setDraft(parseProduct(text))}>
          比對
        </button>
      </section>
      {draft && (
        <>
          <Confirm draft={draft} onChange={setDraft} />
          <section class="card list">
            <h3 class="group">庫存裡類似的</h3>
            {!dups.length && <p class="empty">沒有重複</p>}
            {dups.map((g) => (
              <div class="row" key={g.id}>
                <span class="info">
                  <span class="name">{g.name}</span>
                  <small>{g.desc ?? g.category}</small>
                </span>
                <span class="qty">× {currentQty(g, logs.value)}</span>
              </div>
            ))}
          </section>
          {cancelled.length > 0 && (
            <section class="card list">
              <h3 class="group">過去取消過</h3>
              {cancelled.slice(0, 5).map((o) => (
                <div class="row" key={o.id}>
                  <span class="info">
                    <span class="name">{o.item}</span>
                    <small>
                      {o.date} · {o.option}
                    </small>
                  </span>
                </div>
              ))}
            </section>
          )}
          <Fit draft={draft} />
          <AddTransit
            draft={draft}
            onDone={() => {
              setDraft(undefined);
              setText('');
            }}
          />
        </>
      )}
    </>
  );
}
