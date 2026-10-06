import type { MonthKey } from '../types';

export const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const ymOf = (k: MonthKey) => { const [y, m] = k.split('-').map(Number); return { y, m }; };
export const keyOf = (y: number, m: number): MonthKey => `${y}-${String(m).padStart(2, '0')}`;
export function addMonths(k: MonthKey, n: number): MonthKey {
  const { y, m } = ymOf(k); const t = y * 12 + (m - 1) + n;
  return keyOf(Math.floor(t / 12), (t % 12) + 1);
}
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  const x = ymOf(a), y = ymOf(b); return (y.y - x.y) * 12 + (y.m - x.m);
}
/** `2026-09` → `30.09.2026` */
export function monthEnd(k: MonthKey): string {
  const { y, m } = ymOf(k); const d = new Date(y, m, 0).getDate();
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}
/** `2026-09` → `Sep 2026` */
export const monthLabel = (k: MonthKey) => { const { y, m } = ymOf(k); return `${MN[m - 1]} ${y}`; };

/** Contiguous month-end grid shared by every series on screen. */
export interface MonthGrid {
  keys: MonthKey[];
  /** Grid index of a month, -1 when outside. */
  idx(k: MonthKey): number;
  /** Month key for an index; -1 gives the month end before the first month. */
  key(i: number): MonthKey;
  last: number;
}
export function buildGrid(first: MonthKey, last: MonthKey): MonthGrid {
  const n = Math.max(0, monthsBetween(first, last)) + 1;
  const keys = Array.from({ length: n }, (_, i) => addMonths(first, i));
  return {
    keys,
    idx: k => { const i = monthsBetween(first, k); return i >= 0 && i < n ? i : -1; },
    key: i => addMonths(first, i),
    last: n - 1,
  };
}
