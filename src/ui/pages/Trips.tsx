import { useState } from 'preact/hooks';
import { saveTrip } from '../../data/db';
import { buildTrip, refreshItems } from '../../domain/trip';
import type { Trip, TripItem } from '../../domain/trip';
import { config, gear, showToast, templates, trips } from '../../state';

interface Draft {
  name: string;
  items: TripItem[];
}

function Checklist({ draft, onChange, onDone }: { draft: Draft; onChange: (d: Draft) => void; onDone: () => void }) {
  const groups = [...new Set(draft.items.map((i) => i.group))];
  const done = draft.items.filter((i) => i.checked).length;
  const missing = draft.items.filter((i) => i.missing).length;
  const toggle = (key: string) =>
    onChange({ ...draft, items: draft.items.map((i) => (i.key === key ? { ...i, checked: !i.checked } : i)) });
  const save = async () => {
    await saveTrip({ id: crypto.randomUUID(), name: draft.name, at: Date.now(), items: draft.items });
    showToast('已儲存清單');
    onDone();
  };
  return (
    <>
      <h2 class="sec">
        {draft.name}
        <small>
          {done}／{draft.items.length}
          {missing > 0 && `，缺 ${missing} 項`}
        </small>
      </h2>
      {groups.map((group) => (
        <section class="card list" key={group}>
          <h3 class="group">{group}</h3>
          {draft.items
            .filter((i) => i.group === group)
            .map((i) => (
              <label class={`check row${i.missing ? ' missing' : ''}`} key={i.key}>
                <input type="checkbox" checked={i.checked} disabled={i.missing} onChange={() => toggle(i.key)} />
                {i.missing ? `✕ ${i.label}` : i.label}
              </label>
            ))}
        </section>
      ))}
      <button class="primary" onClick={() => void save()}>
        存檔
      </button>
      <button class="ghost" onClick={onDone}>
        返回
      </button>
    </>
  );
}

export function Trips() {
  const [draft, setDraft] = useState<Draft>();
  if (draft) return <Checklist draft={draft} onChange={setDraft} onDone={() => setDraft(undefined)} />;
  const copy = (t: Trip) => {
    const template = templates.value.find((x) => x.name === t.name);
    const items = template ? buildTrip(template, gear.value, config.value) : refreshItems(t.items, gear.value);
    setDraft({ name: t.name, items });
  };
  return (
    <>
      <section class="choices">
        {templates.value.map((t) => (
          <button
            class="primary"
            key={t.name}
            onClick={() => setDraft({ name: t.name, items: buildTrip(t, gear.value, config.value) })}
          >
            {t.name}
          </button>
        ))}
      </section>
      <h2 class="sec">
        上次清單<small>點一下複製</small>
      </h2>
      {!trips.value.length && <p class="empty">還沒有存過清單</p>}
      {trips.value.length > 0 && (
        <div class="card list">
          {trips.value.slice(0, 5).map((t) => (
            <button class="row" key={t.id} onClick={() => copy(t)}>
              <span class="info">
                <span class="name">{t.name}</span>
                <small>{new Date(t.at).toLocaleDateString('zh-TW')}</small>
              </span>
              <span>
                {t.items.filter((i) => i.checked).length}／{t.items.length}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
