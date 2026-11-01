import type { Verdict } from '../../domain/rules/common';

const ICON = { ok: '✓', warn: '△', bad: '✕', pending: '…' };

export const Tag = ({ verdict }: { verdict: Verdict }) => (
  <span class={`tag ${verdict.level}`}>
    {ICON[verdict.level]} {verdict.label}
  </span>
);

export const Check = ({ name, verdict }: { name: string; verdict: Verdict }) => (
  <div class="row">
    <span class="info">
      <span class="name">{name}</span>
      <small class="wrap">{verdict.reason}</small>
    </span>
    <Tag verdict={verdict} />
  </div>
);
