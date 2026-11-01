import { saveGear } from '../../data/db';
import { missingFields } from '../../domain/stock';
import type { Gear, Spec } from '../../domain/types';
import { gear } from '../../state';
import { Thumb } from '../components/GearRow';
import { fieldOf } from '../fields';

function fill(g: Gear, key: keyof Spec, raw: string) {
  if (raw === '') return;
  const field = fieldOf(key);
  const value = field.text || field.options ? raw : Number(raw);
  if (typeof value === 'number' && !Number.isFinite(value)) return;
  void saveGear({ ...g, spec: { ...g.spec, [key]: value } });
}

function PendingInput({ g, specKey }: { g: Gear; specKey: keyof Spec }) {
  const field = fieldOf(specKey);
  return (
    <label class="pending-field">
      {field.label}
      {field.options ? (
        <select value="" onChange={(e) => fill(g, specKey, e.currentTarget.value)}>
          <option value="">… 待補</option>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type={(field.text ? 'text' : 'number') as 'number'}
          inputMode={field.text ? 'text' : 'decimal'}
          step="any"
          placeholder="… 待補"
          onChange={(e) => fill(g, specKey, e.currentTarget.value)}
        />
      )}
    </label>
  );
}

export function Pending() {
  const rows = gear.value.map((g) => ({ g, keys: missingFields(g) })).filter((r) => r.keys.length);
  const cells = rows.reduce((n, r) => n + r.keys.length, 0);
  return (
    <>
      <h2 class="sec">
        待補清單
        <small>
          {rows.length} 件、{cells} 格
        </small>
      </h2>
      {!rows.length && <p class="empty">規格都補齊了</p>}
      <div class="card list">
        {rows.map(({ g, keys }) => (
          <div class="pending" key={g.id}>
            <div class="pending-head">
              <Thumb g={g} />
              <span class="info">
                <span class="name">{g.name}</span>
                <small>{g.desc ?? g.category}</small>
              </span>
            </div>
            <div class="pending-fields">
              {keys.map((k) => (
                <PendingInput key={k} g={g} specKey={k} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
