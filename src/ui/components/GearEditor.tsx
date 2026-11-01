import { Camera } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { adjustStock, deleteGear, nextNo, saveGear, savePhoto } from '../../data/db';
import { currentMetres, currentQty, isLine, statusAfterRecount } from '../../domain/stock';
import { CATEGORIES, STATUSES } from '../../domain/types';
import type { Category, Gear, Spec, Status } from '../../domain/types';
import { editing, logs, photos } from '../../state';
import { fieldsFor } from '../fields';
import type { Field } from '../fields';
import { Modal } from './Modal';
import { NumberInput } from './NumberInput';

const blank = (): Gear => ({
  id: crypto.randomUUID(),
  no: 0,
  category: '配件',
  name: '',
  qty: 1,
  status: '持有',
  consumable: false,
  spec: {},
  specRows: [],
  updatedAt: 0,
});

function SpecInput({ field, draft, set }: { field: Field; draft: Gear; set: (s: Spec) => void }) {
  const value = draft.spec[field.key];
  const change = (raw: string) => {
    set({ ...draft.spec, [field.key]: raw || undefined });
  };
  return (
    <label class={`field${value === undefined ? ' pending' : ''}`}>
      {field.label}
      {!field.text && !field.options ? (
        <NumberInput
          placeholder="待補"
          value={value as number | undefined}
          onValue={(next) => set({ ...draft.spec, [field.key]: next })}
        />
      ) : field.options ? (
        <select value={value ?? ''} onChange={(e) => change(e.currentTarget.value)}>
          <option value="">待補</option>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input placeholder="待補" value={value ?? ''} onInput={(e) => change(e.currentTarget.value)} />
      )}
    </label>
  );
}

export function GearEditor({ source }: { source: Gear | 'new' }) {
  const isNew = source === 'new';
  const line = !isNew && isLine(source);
  const [draft, setDraft] = useState<Gear>(isNew ? blank() : source);
  const stockBefore = isNew ? 1 : ((line ? currentMetres(source, logs.value) : currentQty(source, logs.value)) ?? 0);
  const [stock, setStock] = useState<number | undefined>(stockBefore);
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const close = () => (editing.value = null);
  const patch = (p: Partial<Gear>) => setDraft({ ...draft, ...p });

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const save = async (e: Event) => {
    e.preventDefault();
    try {
      if (isNew) {
        await saveGear({ ...draft, qty: stock ?? 0, no: await nextNo() });
      } else {
        // A recount is appended like any other stock change, so history stays additive.
        const counted = stock ?? 0;
        await saveGear({ ...draft, status: statusAfterRecount(draft.status, stockBefore, counted) });
        await adjustStock(draft.id, line ? 'm' : 'qty', counted - stockBefore);
      }
      if (photo) await savePhoto(draft.id, photo);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    }
  };

  const remove = async () => {
    await deleteGear(draft.id);
    close();
  };

  const shown = preview ?? photos.value.get(draft.id);
  return (
    <Modal title={isNew ? '新增器材' : `#${draft.no} 編輯`} onClose={close}>
      <form class="form" onSubmit={save}>
        <label class="photo">
          {shown ? <img src={shown} alt="" /> : <Camera size={32} aria-hidden="true" />}
          <span>{shown ? '更換照片' : '拍照或上傳'}</span>
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.currentTarget.files?.[0])} />
        </label>
        <label class="field">
          品名
          <input required value={draft.name} onInput={(e) => patch({ name: e.currentTarget.value })} />
        </label>
        <label class="field">
          規格／描述
          <input value={draft.desc ?? ''} onInput={(e) => patch({ desc: e.currentTarget.value || undefined })} />
        </label>
        <div class="grid2">
          <label class="field">
            分類
            <select value={draft.category} onChange={(e) => patch({ category: e.currentTarget.value as Category })}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label class="field">
            狀態
            <select value={draft.status} onChange={(e) => patch({ status: e.currentTarget.value as Status })}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label class="field">
            {line ? '目前剩餘 m' : '目前數量'}
            <NumberInput required min="0" value={stock} onValue={setStock} />
          </label>
          <label class="field">
            金額 NT$
            <NumberInput value={draft.amount} onValue={(amount) => patch({ amount })} />
          </label>
          <label class="field">
            購入日期
            <input
              type="date"
              value={draft.date ?? ''}
              onInput={(e) => patch({ date: e.currentTarget.value || undefined })}
            />
          </label>
          <label class="field">
            賣場
            <input value={draft.shop ?? ''} onInput={(e) => patch({ shop: e.currentTarget.value || undefined })} />
          </label>
          {fieldsFor(draft)
            .filter((field) => !line || field.key !== 'remainM')
            .map((field) => (
              <SpecInput key={field.key} field={field} draft={draft} set={(spec) => patch({ spec })} />
            ))}
        </div>
        <label class="check">
          <input
            type="checkbox"
            checked={draft.consumable}
            onChange={(e) => patch({ consumable: e.currentTarget.checked })}
          />
          消耗品（顯示 −1 或剪線按鈕）
        </label>
        <label class="field">
          低庫存門檻（留空不提醒）
          <NumberInput min="0" value={draft.threshold} onValue={(threshold) => patch({ threshold })} />
        </label>
        <label class="field">
          備註
          <input value={draft.note ?? ''} onInput={(e) => patch({ note: e.currentTarget.value || undefined })} />
        </label>
        {draft.specRows.length > 0 && (
          <details>
            <summary>完整規格表</summary>
            <table>
              <tbody>
                {draft.specRows.map((r) => (
                  <tr key={r.item}>
                    <th scope="row">{r.item}</th>
                    <td>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
        {error && <p class="error">{error}</p>}
        <button class="primary" type="submit">
          儲存
        </button>
        {!isNew &&
          (confirming ? (
            <button class="danger" type="button" onClick={() => void remove()}>
              確定刪除？紀錄與照片都會消失
            </button>
          ) : (
            <button class="ghost" type="button" onClick={() => setConfirming(true)}>
              刪除這筆
            </button>
          ))}
      </form>
    </Modal>
  );
}
