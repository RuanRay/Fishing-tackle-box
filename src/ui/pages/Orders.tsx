import { useState } from 'preact/hooks';
import { orders } from '../../state';

const money = (n?: number) => (n === undefined ? '' : `NT$${n}`);

export function Orders() {
  const [cancelled, setCancelled] = useState(false);
  const rows = [...orders.value].filter((o) => cancelled || o.counted).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <label class="check">
        <input type="checkbox" checked={cancelled} onChange={(e) => setCancelled(e.currentTarget.checked)} />
        顯示已取消
      </label>
      <div class="card list">
        {rows.map((o) => (
          <div class={`row${o.counted ? '' : ' dim'}`} key={o.id}>
            <span class="info">
              <span class="name">{o.item}</span>
              <small>
                {o.date} · {o.platform} · {o.shop}
              </small>
              <small>{o.status}</small>
            </span>
            <span>{money(o.subtotal)}</span>
          </div>
        ))}
        {!rows.length && <p class="empty">沒有訂單</p>}
      </div>
    </>
  );
}
