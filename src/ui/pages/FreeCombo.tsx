import { useState } from 'preact/hooks';
import { checkCastWeight } from '../../domain/rules/castWeight';
import { comboChecks, lureRows, reels, rods } from '../../domain/rules/combo';
import { checkLeader } from '../../domain/rules/leader';
import { checkSnapStrength } from '../../domain/rules/snap';
import { isHidden } from '../../domain/stock';
import type { Gear } from '../../domain/types';
import { config, gear, logs } from '../../state';
import { Check, Tag } from '../components/Tag';
import { lureSpec } from '../fields';

function Pick(props: { label: string; options: Gear[]; value?: string; onPick: (id?: string) => void }) {
  return (
    <label class="field">
      {props.label}
      <select value={props.value ?? ''} onChange={(e) => props.onPick(e.currentTarget.value || undefined)}>
        <option value="">未選</option>
        {props.options.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
            {g.desc ? `（${g.desc.slice(0, 16)}）` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function Grams(props: { label: string; value: string; onInput: (v: string) => void }) {
  return (
    <label class="field">
      {props.label}
      <input
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </label>
  );
}

const grams = (raw: string, fallback?: number) => (raw === '' ? fallback : Number(raw));

export function FreeCombo({ onLure }: { onLure: (g: Gear) => void }) {
  const [picked, setPicked] = useState<Record<string, string | undefined>>({});
  const [bait, setBait] = useState('');
  const [sinkerG, setSinkerG] = useState('');
  const live = gear.value.filter((g) => !isHidden(g));
  const find = (key: string) => live.find((g) => g.id === picked[key]);
  const pick = (key: string) => (id?: string) => setPicked({ ...picked, [key]: id });

  const lines = live.filter((g) => g.category === '釣線');
  const mains = lines.filter((g) => g.spec.lineRole !== '子線');
  const leaders = lines.filter((g) => g.spec.lineRole === '子線');
  const snaps = live.filter((g) => g.category === '配件' && g.name.includes('別針'));
  const sinkers = live.filter((g) => g.category === '鉛/天秤');
  const floats = live.filter((g) => g.category === '浮標/助投器');

  const [rod, reel, line, leader, snap, sinker, float] = [
    'rod',
    'reel',
    'line',
    'leader',
    'snap',
    'sinker',
    'float',
  ].map(find);

  const checks = rod && reel ? comboChecks({ rod, reel, line }, logs.value) : [];
  if (leader && line) checks.push({ name: '子線', verdict: checkLeader(leader.spec, line.spec) });
  if (snap && line) {
    checks.push({ name: '別針', verdict: checkSnapStrength(snap.spec, line.spec, leader?.spec) });
  }
  if (rod && (sinker || sinkerG)) {
    const parts = {
      sinkerG: grams(sinkerG, sinker?.spec.weightG),
      floatG: float ? (float.spec.weightG ?? null) : undefined,
      baitG: grams(bait),
    };
    checks.push({ name: '鉛重', verdict: checkCastWeight(parts, rod.spec, config.value) });
  }

  return (
    <>
      <section class="card pad">
        <div class="grid2">
          <Pick label="竿" options={rods(live)} value={picked.rod} onPick={pick('rod')} />
          <Pick label="捲線器" options={reels(live)} value={picked.reel} onPick={pick('reel')} />
          <Pick label="主線" options={mains} value={picked.line} onPick={pick('line')} />
          <Pick label="子線" options={leaders} value={picked.leader} onPick={pick('leader')} />
          <Pick label="別針" options={snaps} value={picked.snap} onPick={pick('snap')} />
          <Pick label="鉛" options={sinkers} value={picked.sinker} onPick={pick('sinker')} />
          <Pick label="浮標" options={floats} value={picked.float} onPick={pick('float')} />
          <Grams label="鉛重 g（覆寫）" value={sinkerG} onInput={setSinkerG} />
          <Grams label="餌重 g" value={bait} onInput={setBait} />
        </div>
      </section>
      {checks.length > 0 && (
        <section class="card list">
          {checks.map((c) => (
            <Check key={c.name} {...c} />
          ))}
        </section>
      )}
      {rod && (
        <section class="card list">
          {lureRows(rod, live, config.value).map(({ g, verdict }) => (
            <button class="row" key={g.id} onClick={() => onLure(g)}>
              <span class="info">
                <span class="name">{g.name}</span>
                <small>{lureSpec(g)}</small>
              </span>
              <Tag verdict={verdict} />
            </button>
          ))}
        </section>
      )}
    </>
  );
}
