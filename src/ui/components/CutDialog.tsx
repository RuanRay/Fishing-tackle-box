import { useState } from 'preact/hooks';
import { currentMetres } from '../../domain/stock';
import type { Gear } from '../../domain/types';
import { cutting, logs, use } from '../../state';
import { Modal } from './Modal';

export function CutDialog({ g }: { g: Gear }) {
  const [metres, setMetres] = useState('');
  const left = currentMetres(g, logs.value) ?? 0;
  const amount = Number(metres);
  const valid = amount > 0 && amount <= left;
  const submit = async (e: Event) => {
    e.preventDefault();
    if (!valid) return;
    await use(g, 'm', amount);
    cutting.value = null;
  };
  return (
    <Modal title="剪掉幾公尺" onClose={() => (cutting.value = null)}>
      <form class="form" onSubmit={submit}>
        <p>
          {g.name}，目前剩 {left}m
        </p>
        <label class="field">
          公尺
          <input
            autoFocus
            required
            type="number"
            inputMode="decimal"
            min="0.1"
            max={left}
            step="any"
            value={metres}
            onInput={(e) => setMetres(e.currentTarget.value)}
          />
        </label>
        <button class="primary" type="submit" disabled={!valid}>
          扣掉
        </button>
      </form>
    </Modal>
  );
}
