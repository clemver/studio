/*
 * Periods chosen with the shared period selector (Dashboard, Reports): a preset or a custom range of dates.
 * A range's `from` is the base date (the period starts the day after), `to` the last date included, both ISO.
 * In the Custom popover, From is the first day included (as on the Dashboard): the base is the business day before.
 */
import type { DashPeriod } from './series';
import type { MonthGrid } from './months';
import { addMonthsIso } from './series';

export type PickPeriod = Extract<DashPeriod, 'YTD' | 'QTD' | '1Y' | '3Y' | '5Y' | 'MAX' | 'CUSTOM'>;
export const PERIOD_TABS: [PickPeriod, string][] = [['YTD', 'YTD'], ['QTD', 'QTD'], ['1Y', '12M'], ['3Y', '3Y'], ['5Y', '5Y'], ['MAX', 'MAX'], ['CUSTOM', 'Custom']];
export interface DateRange { from: string; to: string }

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const monthEndIso = (k: string) => { const [y, m] = k.split('-').map(Number); return iso(y, m, lastDay(y, m)); };
/** The weekday before an ISO date (Friday for a Monday). */
export function prevBusinessDay(d: string): string {
  const t = new Date(d + 'T00:00:00Z');
  do t.setUTCDate(t.getUTCDate() - 1); while (t.getUTCDay() === 0 || t.getUTCDay() === 6);
  return t.toISOString().slice(0, 10);
}
export const ddmmyyyy = (d: string) => (d ? d.split('-').reverse().join('.') : '–');

/** Calendar range of a period ending at `asOf`; MAX starts at `first` (the base before the first data). */
export function rangeOf(p: PickPeriod, custom: DateRange, asOf: string, first: string): DateRange {
  const y = Number(asOf.slice(0, 4)), m = Number(asOf.slice(5, 7));
  switch (p) {
    case 'YTD': return { from: iso(y - 1, 12, 31), to: asOf };
    case 'QTD': { const q = Math.floor((m - 1) / 3) * 3; return { from: q ? iso(y, q, lastDay(y, q)) : iso(y - 1, 12, 31), to: asOf }; }
    case 'MAX': return { from: first, to: asOf };
    case 'CUSTOM': return { from: custom.from ? prevBusinessDay(custom.from) : first, to: custom.to && custom.to < asOf ? custom.to : asOf };
    default: return { from: addMonthsIso(asOf, -{ '1Y': 12, '3Y': 36, '5Y': 60 }[p]), to: asOf };
  }
}

/**
 * Month window on a month-end grid for a date range (monthly data): first month after the base month end,
 * last month whose end is on or before `to`. Mid-month dates round to whole months.
 */
export function monthWindow(grid: MonthGrid, r: DateRange): { a: number; e: number; n: number; rounded: boolean } {
  const fk = r.from.slice(0, 7), tk = r.to.slice(0, 7);
  const baseIsEnd = r.from === monthEndIso(fk), toIsEnd = r.to === monthEndIso(tk);
  let a = grid.idx(fk) + (baseIsEnd ? 1 : 0);
  if (grid.idx(fk) < 0) a = fk < grid.keys[0] ? 0 : grid.last;
  let e = toIsEnd ? grid.idx(tk) : grid.idx(tk) - 1;
  if (grid.idx(tk) < 0) e = tk > grid.keys[grid.last] ? grid.last : 0;
  a = Math.max(0, Math.min(a, grid.last)); e = Math.max(a, Math.min(e, grid.last));
  return { a, e, n: e - a + 1, rounded: !baseIsEnd || !toIsEnd };
}
