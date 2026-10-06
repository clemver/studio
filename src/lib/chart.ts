/* Axis helpers shared by every chart. */
import type { MonthGrid } from './months';
import { MN, ymOf } from './months';

export function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo || 1, raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => span / s <= count) || 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** Month ticks for a period a..e (the series starts at a-1). Labels the month end, so Dec 2024 → "2025". */
export function xTicks(grid: MonthGrid, a: number, e: number, W: number, months: string[] = MN, quarter = 'Q'): { i: number; t: string }[] {
  const L = e - a + 1, ticks: { i: number; t: string }[] = [];
  for (let i = a - 1; i <= e; i++) {
    const { y, m } = ymOf(grid.key(i));
    if (L <= 14) ticks.push({ i, t: m === 12 ? `${months[0]} ${String(y + 1).slice(2)}` : months[m] });
    else if (L <= 42) { if (m % 3 === 0) ticks.push({ i, t: m === 12 ? String(y + 1) : `${quarter}${m / 3 + 1} ${String(y).slice(2)}` }); }
    else if (m === 12) ticks.push({ i, t: String(y + 1) });
  }
  const maxT = Math.max(2, Math.floor(W / 66)), stride = Math.ceil(ticks.length / maxT);
  return ticks.filter((_, k) => k % stride === 0);
}
