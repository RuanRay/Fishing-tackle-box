import { LayoutGrid, List, Plus } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { markArrived } from '../../data/db';
import { isHidden, isLow, missingFields } from '../../domain/stock';
import { CATEGORIES } from '../../domain/types';
import type { Gear } from '../../domain/types';
import { editing, gear, logs } from '../../state';
import { GearRow, Thumb } from '../components/GearRow';
import { Orders } from './Orders';
import { Spend } from './Spend';

async function arrive(g: Gear) {
  await markArrived(g);
  if (missingFields(g).length) editing.value = { ...g, status: '持有' };
}

function InTransit({ items }: { items: Gear[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <div class="banner">
        在途 {items.length} 件<button onClick={() => setOpen(!open)}>{open ? '收合' : '查看'}</button>
      </div>
      {open && (
        <div class="card list">
          {items.map((g) => (
            <div class="item" key={g.id}>
              <Thumb g={g} />
              <span class="info">
                <span class="name">{g.name}</span>
                <small>{g.desc}</small>
              </span>
              <button class="small" onClick={() => void arrive(g)}>
                已到貨
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const matches = (g: Gear, q: string) => [g.name, g.desc, g.note, g.shop].some((v) => v?.toLowerCase().includes(q));

function GearList() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [hidden, setHidden] = useState(false);
  const [grid, setGrid] = useState(false);
  const q = query.trim().toLowerCase();
  const rows = gear.value.filter(
    (g) => (hidden || !isHidden(g)) && (!category || g.category === category) && (!q || matches(g, q)),
  );
  return (
    <>
      <div class="filters">
        <input
          type="search"
          placeholder="搜尋品名、規格、賣場"
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <select aria-label="分類" value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
          <option value="">全部分類</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div class="toolbar">
        <label class="check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.currentTarget.checked)} />
          顯示已不在／用完
        </label>
        <button class="icon" aria-label={grid ? '切換清單' : '切換卡片網格'} onClick={() => setGrid(!grid)}>
          {grid ? <List size={24} aria-hidden="true" /> : <LayoutGrid size={24} aria-hidden="true" />}
        </button>
        <button class="icon" aria-label="新增器材" onClick={() => (editing.value = 'new')}>
          <Plus size={24} aria-hidden="true" />
        </button>
      </div>
      <div class={`card list${grid ? ' grid' : ''}`}>
        {rows.map((g) => (
          <GearRow key={g.id} g={g} />
        ))}
        {!rows.length && <p class="empty">沒有符合的器材</p>}
      </div>
    </>
  );
}

export function Inventory() {
  const [view, setView] = useState<'list' | 'spend' | 'orders'>('list');
  const transit = gear.value.filter((g) => g.status === '在途');
  const low = gear.value.filter((g) => isLow(g, logs.value));
  return (
    <>
      {transit.length > 0 && <InTransit items={transit} />}
      <div class="seg" role="tablist">
        <button class={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
          器材
        </button>
        <button class={view === 'spend' ? 'on' : ''} onClick={() => setView('spend')}>
          花費
        </button>
        <button class={view === 'orders' ? 'on' : ''} onClick={() => setView('orders')}>
          訂單
        </button>
      </div>
      {view === 'spend' && <Spend />}
      {view === 'orders' && <Orders />}
      {view === 'list' && (
        <>
          {low.length > 0 && (
            <section>
              <h2 class="sec">
                低庫存<small>{low.length} 項</small>
              </h2>
              <div class="card list">
                {low.map((g) => (
                  <GearRow key={g.id} g={g} />
                ))}
              </div>
            </section>
          )}
          <GearList />
        </>
      )}
    </>
  );
}
