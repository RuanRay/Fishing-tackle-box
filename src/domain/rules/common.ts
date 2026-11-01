export type Level = 'ok' | 'warn' | 'bad' | 'pending';

export interface Verdict {
  level: Level;
  label: string;
  reason: string;
}

export interface RuleConfig {
  tolerance: number;
  hookDiff: number;
  rate: number;
  fee: number;
}

export const DEFAULT_CONFIG: RuleConfig = { tolerance: 0.2, hookDiff: 2, rate: 4.91, fee: 10 };

export const pending = (reason: string): Verdict => ({ level: 'pending', label: '待補', reason });
