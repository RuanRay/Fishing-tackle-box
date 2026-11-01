import { useState } from 'preact/hooks';
import { comboChecks, fixedCombos, lureRows, rods } from '../../domain/rules/combo';
import type { Combo } from '../../domain/rules/combo';
import { checkHook } from '../../domain/rules/hook';
import { checkLureWeight } from '../../domain/rules/lureWeight';
import { checkSnapLure } from '../../domain/rules/snap';
import { isOnHand } from '../../domain/stock';
import type { Gear } from '../../domain/types';
import { config, editing, gear, logs } from '../../state';
import { Modal } from '../components/Modal';
import { Check, Tag } from '../components/Tag';
import { lureSpec } from '../fields';
import { FreeCombo } from './FreeCombo';
import { Pending } from './Pending';

function lineSummary(line?: Gear) {
  if (!line) return '線材未設定';
  return `${line.spec.lineType ?? ''} ${line.spec.sizeNo ?? '?'} 號 ${line.spec.spoolM ?? '?'}m`;
}

export function LureDetail({ lure, onClose }: { lure: Gear; onClose: () => void }) {
  const snaps = gear.value.filter((g) => isOnHand(g) && g.spec.lureMaxG !== undefined && g.category === '配件');
  const hooks = gear.value.filter((g) => g.category === '鉤' && isOnHand(g) && g.spec.hookType === lure.spec.hookType);
  return (
    <Modal title={lure.name} onClose={onClose}>
      <div class="form">
        <div class="card list">
          {rods(gear.value).map((rod) => (
            <Check key={rod.id} name={rod.name} verdict={checkLureWeight(lure.spec.weightG, rod.spec, config.value)} />
          ))}
          {snaps.flatMap((snap) => {
            const verdict = checkSnapLure(snap.spec, lure.spec.weightG);
            return verdict ? [<Check key={snap.id} name={snap.name} verdict={verdict} />] : [];
          })}
          {lure.spec.hookNo !== undefined &&
            hooks.map((hook) => (
              <Check key={hook.id} name={hook.name} verdict={checkHook(hook.spec, lure.spec, config.value)} />
            ))}
          {lure.spec.hookNo !== undefined && !hooks.length && <p class="empty">庫存沒有同鉤種的替換鉤</p>}
        </div>
        <button
          class="primary"
          onClick={() => {
            onClose();
            editing.value = lure;
          }}
        >
          編輯規格
        </button>
      </div>
    </Modal>
  );
}

function ComboCard({ combo, onLure }: { combo: Combo; onLure: (g: Gear) => void }) {
  const { rod, reel, line } = combo;
  const range = `餌重 ${rod.spec.lureMinG ?? '?'}–${rod.spec.lureMaxG ?? '?'}g`;
  const notes = comboChecks(combo, logs.value).filter((c) => c.verdict.level !== 'ok');
  const rows = lureRows(rod, gear.value, config.value);
  return (
    <section class="card">
      <header class="card-head">
        <b>
          {rod.name} × {reel.name}
        </b>
        <span>
          {range} · {lineSummary(line)}
        </span>
      </header>
      {rows.map(({ g, verdict }) => (
        <button class="row" key={g.id} onClick={() => onLure(g)}>
          <span class="info">
            <span class="name">{g.name}</span>
            <small>{lureSpec(g)}</small>
          </span>
          <Tag verdict={verdict} />
        </button>
      ))}
      {notes.map(({ name, verdict }) => (
        <p class="note" key={name}>
          {name}：{verdict.reason}
        </p>
      ))}
    </section>
  );
}

export function Equipment() {
  const [view, setView] = useState<'fixed' | 'free' | 'pending'>('fixed');
  const [lure, setLure] = useState<Gear>();
  const combos = fixedCombos(gear.value);
  const seg = (key: typeof view, label: string) => (
    <button class={view === key ? 'on' : ''} onClick={() => setView(key)}>
      {label}
    </button>
  );
  return (
    <>
      <div class="seg">
        {seg('fixed', '固定套組')}
        {seg('free', '自由組合')}
        {seg('pending', '待補')}
      </div>
      {view === 'pending' && <Pending />}
      {view === 'free' && <FreeCombo onLure={setLure} />}
      {view === 'fixed' && combos.map((combo) => <ComboCard key={combo.reel.id} combo={combo} onLure={setLure} />)}
      {view === 'fixed' && !combos.length && <p class="empty">還沒有套組。到捲線器的編輯頁填「配對竿編號」。</p>}
      {lure && <LureDetail lure={lure} onClose={() => setLure(undefined)} />}
    </>
  );
}
