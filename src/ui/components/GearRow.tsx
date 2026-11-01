import { Anchor, Cable, Circle, Fish, Package, Paperclip, Scissors, Slash, Weight, Wrench } from 'lucide-preact';
import { canConsume, currentMetres, currentQty, isHidden, isLine, isLow } from '../../domain/stock';
import type { Category, Gear } from '../../domain/types';
import { cutting, editing, logs, photos, use } from '../../state';

const ICONS: Record<Category, typeof Fish> = {
  竿與捲線器: Slash,
  釣線: Cable,
  鉤: Anchor,
  假餌: Fish,
  '浮標/助投器': Circle,
  '鉛/天秤': Weight,
  配件: Paperclip,
  工具: Wrench,
  收納: Package,
};

export function Thumb({ g }: { g: Gear }) {
  const url = photos.value.get(g.id);
  const Icon = ICONS[g.category];
  return (
    <span class="thumb">{url ? <img src={url} alt="" /> : <Icon size={24} strokeWidth={2} aria-hidden="true" />}</span>
  );
}

export function GearRow({ g }: { g: Gear }) {
  const metres = currentMetres(g, logs.value);
  const qty = metres === undefined ? currentQty(g, logs.value) : `${metres}m`;
  const low = isLow(g, logs.value);
  return (
    <div class={`item${isHidden(g) ? ' dim' : ''}`}>
      <button class="item-main" onClick={() => (editing.value = g)}>
        <Thumb g={g} />
        <span class="info">
          <span class="name">{g.name}</span>
          <small>{g.desc ?? g.category}</small>
          {g.status !== '持有' && <small class="status">{g.status}</small>}
        </span>
      </button>
      <span class={`qty${low ? ' low' : ''}`}>
        {qty}
        {low && <small>偏低</small>}
      </span>
      {canConsume(g) &&
        (isLine(g) ? (
          <button class="minus" aria-label={`剪掉 ${g.name}`} onClick={() => (cutting.value = g)}>
            <Scissors size={22} aria-hidden="true" />
          </button>
        ) : (
          <button class="minus" aria-label={`${g.name} 減一`} onClick={() => void use(g, 'qty', 1)}>
            −1
          </button>
        ))}
    </div>
  );
}
