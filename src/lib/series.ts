/*
 * Frequency-agnostic analytics for the Dashboard (daily, weekly or monthly returns on a shared date axis).
 *
 * - Period = from the date before the first included date to the end date.
 * - Returns compound; annualised (geometric) only for spans of 365 days or more.
 * - Volatility = stdev × √(periods per year). Sharpe = mean excess over the risk-free rate × ppy / volatility.
 * - Relative: excess p.a. = mean(r − b) × ppy, TE = stdev(r − b) × √ppy, IR = excess / TE, beta = cov / var(b),
 *   up / down capture = mean(r) / mean(b) over periods where b > 0 / b < 0.
 * - After an instrument's first return, a missing period (e.g. a holiday) counts as 0 %.
 */
import type { Frequency } from '../types';

export const PPY: Record<Frequency, number> = { D: 252, W: 52, M: 12 };
const DAY = 86400000;

export interface AlignedRow {
  id: string;
  /** Returns on the shared axis; null before the first return. */
  ret: (number | null)[];
  /** Benchmark returns on the same axis (null when unknown). */
  bm: (number | null)[] | null;
  /** Risk-free returns per period on the same axis. */
  rf: number[];
  /** Index of the first return; ret.length when none. */
  start: number;
  /** Index of the last return. */
  end: number;
}

/** Union of all dates, sorted. */
export function unionDates(series: { dates: string[] }[]): string[] {
  const set = new Set<string>();
  series.forEach(s => s.dates.forEach(d => set.add(d)));
  return [...set].sort();
}

/** Put a dated series on the shared axis. Gaps after the start are treated as 0 % (no trading that day). */
export function alignTo(dates: string[], s: { dates: string[]; returns: (number | null)[] } | null | undefined): (number | null)[] {
  const out: (number | null)[] = new Array(dates.length).fill(null);
  if (!s) return out;
  const pos = new Map(dates.map((d, i) => [d, i]));
  let first = Infinity, last = -1;
  s.dates.forEach((d, k) => { const i = pos.get(d); if (i == null || s.returns[k] == null) return; out[i] = s.returns[k]; first = Math.min(first, i); last = Math.max(last, i); });
  for (let i = first; i <= last; i++) if (out[i] == null) out[i] = 0;
  return out;
}

export const firstIdx = (x: (number | null)[]) => { const i = x.findIndex(v => v != null); return i < 0 ? x.length : i; };
export const lastIdx = (x: (number | null)[]) => { let i = x.length - 1; while (i >= 0 && x[i] == null) i--; return i; };

/* ---------- dates & periods ---------- */
export const toTime = (d: string) => Date.parse(d + 'T00:00:00Z');
export function addMonthsIso(d: string, n: number): string {
  const t = new Date(toTime(d)), y = t.getUTCFullYear(), m = t.getUTCMonth() + n, day = t.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
}
/** First index whose date is strictly after `d`. */
export const indexAfter = (dates: string[], d: string) => { let lo = 0, hi = dates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) lo = m + 1; else hi = m; } return lo; };

export type DashPeriod = 'MTD' | 'QTD' | 'YTD' | '1M' | '3M' | '6M' | '1Y' | '2Y' | '3Y' | '5Y' | '10Y' | 'MAX' | 'CUSTOM';

/** Window start for a preset ending at `asOf`: the first date included. */
export function windowStart(dates: string[], asOf: string, p: DashPeriod, custom?: { from: string; to: string }): number {
  const y = asOf.slice(0, 4), m = Number(asOf.slice(5, 7));
  switch (p) {
    case 'MTD': return indexAfter(dates, `${asOf.slice(0, 7)}-00`);
    case 'QTD': return indexAfter(dates, `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-00`);
    case 'YTD': return indexAfter(dates, `${y}-00-00`);
    case 'MAX': return 0;
    case 'CUSTOM': return custom?.from ? indexAfter(dates, addDays(custom.from, -1)) : 0;
    default: {
      const n = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '2Y': 24, '3Y': 36, '5Y': 60, '10Y': 120 }[p];
      return indexAfter(dates, addMonthsIso(asOf, -n));
    }
  }
}
export const addDays = (d: string, n: number) => new Date(toTime(d) + n * DAY).toISOString().slice(0, 10);

/** Date the period's growth is measured from (the period end before the first included one). */
export function baseDate(dates: string[], a: number, f: Frequency): string {
  if (a > 0) return dates[a - 1];
  return f === 'M' ? addMonthsIso(dates[0], -1) : addDays(dates[0], f === 'W' ? -7 : -1);
}

/* ---------- statistics ---------- */
const mean = (x: number[]) => (x.length ? x.reduce((p, c) => p + c, 0) / x.length : NaN);
function sd(x: number[]) { if (x.length < 2) return NaN; const m = mean(x); return Math.sqrt(x.reduce((p, c) => p + (c - m) ** 2, 0) / (x.length - 1)); }
const fin = (v: number) => (Number.isFinite(v) ? v : null);

export interface RowStats {
  /** First index used (later than the period start when the instrument starts later). */
  st: number;
  partial: boolean;
  n: number;
  cum: number;
  ann: number | null;
  vol: number | null;
  sharpe: number | null;
  mdd: number;
  excessPa: number | null;
  te: number | null;
  ir: number | null;
  beta: number | null;
  upCapture: number | null;
  downCapture: number | null;
}

export function rowStats(r: AlignedRow, dates: string[], a: number, e: number, f: Frequency, useRf: boolean): RowStats | null {
  const st = Math.max(a, r.start), en = Math.min(e, r.end);
  if (st > en) return null;
  const x = r.ret.slice(st, en + 1).map(v => v ?? 0), n = x.length, ppy = PPY[f];
  let v = 1, pk = 1, mdd = 0;
  x.forEach(q => { v *= 1 + q; pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); });
  const cum = v - 1;
  const days = (toTime(dates[en]) - toTime(baseDate(dates, st, f))) / DAY;
  const ann = days >= 365 ? Math.pow(1 + cum, 365.25 / days) - 1 : null;
  const vol = n >= 3 ? sd(x) * Math.sqrt(ppy) : NaN;
  const rf = useRf ? r.rf.slice(st, en + 1) : x.map(() => 0);
  const sharpe = n >= 3 ? (mean(x.map((q, k) => q - rf[k])) * ppy) / vol : NaN;

  let excessPa = NaN, te = NaN, ir = NaN, beta = NaN, up = NaN, down = NaN;
  if (r.bm) {
    const pairs = x.map((q, k) => [q, r.bm![st + k]] as const).filter((p): p is readonly [number, number] => p[1] != null);
    if (pairs.length >= 3) {
      const d = pairs.map(([q, b]) => q - b), bs = pairs.map(p => p[1]), qs = pairs.map(p => p[0]);
      excessPa = mean(d) * ppy; te = sd(d) * Math.sqrt(ppy); ir = excessPa / te;
      const mb = mean(bs), mq = mean(qs);
      beta = pairs.reduce((p, [q, b]) => p + (q - mq) * (b - mb), 0) / bs.reduce((p, b) => p + (b - mb) ** 2, 0);
      const ups = pairs.filter(p => p[1] > 0), dns = pairs.filter(p => p[1] < 0);
      up = mean(ups.map(p => p[0])) / mean(ups.map(p => p[1]));
      down = mean(dns.map(p => p[0])) / mean(dns.map(p => p[1]));
    }
  }
  return {
    st, partial: st > a, n, cum, ann, vol: fin(vol), sharpe: fin(sharpe), mdd,
    excessPa: fin(excessPa), te: fin(te), ir: fin(ir), beta: fin(beta), upCapture: fin(up), downCapture: fin(down),
  };
}

/**
 * The instrument relative to its benchmark: per-period (1 + r) / (1 + b) − 1, so compounding gives the
 * geometric excess (1 + R) / (1 + B) − 1. Null when the row has no benchmark.
 */
export function relativeRow(r: AlignedRow): AlignedRow | null {
  if (!r.bm) return null;
  const ret = r.ret.map((v, i) => (v == null || r.bm![i] == null ? null : (1 + v) / (1 + (r.bm![i] as number)) - 1));
  const start = firstIdx(ret), end = lastIdx(ret);
  if (start > end) return null;
  return { id: r.id, ret, bm: null, rf: r.rf.map(() => 0), start, end };
}

/** Growth from the period base: cumulative % (0 at base) or index rebased to 100. One value per index a-1..e. */
export function growth(r: AlignedRow, a: number, e: number, mode: 'cum' | 'idx'): (number | null)[] {
  const out: (number | null)[] = [], st = Math.max(a, r.start);
  let v = 1;
  for (let i = a - 1; i <= e; i++) {
    if (i < st - 1 || i > r.end) { out.push(null); continue; }
    if (i >= st) v *= 1 + (r.ret[i] ?? 0);
    out.push(mode === 'cum' ? (v - 1) * 100 : v * 100);
  }
  return out;
}

/** Drawdown from the running peak in %, one value per index a-1..e. */
export function drawdowns(r: AlignedRow, a: number, e: number): (number | null)[] {
  let pk = 1;
  return growth(r, a, e, 'idx').map(x => { if (x == null) return null; const v = x / 100; pk = Math.max(pk, v); return (v / pk - 1) * 100; });
}

/** Rolling compounded return over `w` periods in %, one value per index a-1..e. */
export function rollingReturns(r: AlignedRow, a: number, e: number, w: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = a - 1; i <= e; i++) {
    if (i - w + 1 < r.start || i > r.end || i < 0) { out.push(null); continue; }
    let v = 1; for (let k = i - w + 1; k <= i; k++) v *= 1 + (r.ret[k] ?? 0);
    out.push((v - 1) * 100);
  }
  return out;
}

/** Rank (1 = best cumulative return since the base) per index a-1..e among rows with data. */
export function rankPaths(rows: AlignedRow[], a: number, e: number): (number | null)[][] {
  const g = rows.map(r => growth(r, a, e, 'idx'));
  const out = rows.map(() => [] as (number | null)[]);
  for (let k = 0; k < e - a + 2; k++) {
    const live = rows.map((_, j) => j).filter(j => g[j][k] != null).sort((x, y) => (g[y][k] as number) - (g[x][k] as number));
    rows.forEach((_, j) => out[j].push(null));
    live.forEach((j, pos) => { out[j][k] = pos + 1; });
  }
  return out;
}

/** Correlation of returns over the overlap inside a..e. */
export function correlation(x: AlignedRow, y: AlignedRow, a: number, e: number): number | null {
  const s = Math.max(a, x.start, y.start), en = Math.min(e, x.end, y.end);
  if (en - s < 2) return null;
  const p = x.ret.slice(s, en + 1).map(v => v ?? 0), q = y.ret.slice(s, en + 1).map(v => v ?? 0);
  const mp = mean(p), mq = mean(q);
  let c = 0, vp = 0, vq = 0;
  for (let k = 0; k < p.length; k++) { c += (p[k] - mp) * (q[k] - mq); vp += (p[k] - mp) ** 2; vq += (q[k] - mq) ** 2; }
  return vp && vq ? c / Math.sqrt(vp * vq) : null;
}

/** Compounded return between two indexes (inclusive), or null when the row doesn't cover them. */
export function compoundBetween(r: AlignedRow, a: number, e: number): number | null {
  if (a < r.start || e > r.end || a > e) return null;
  let v = 1; for (let i = a; i <= e; i++) v *= 1 + (r.ret[i] ?? 0);
  return v - 1;
}

/** Calendar-year returns inside a..e. */
export function yearReturns(r: AlignedRow, dates: string[], a: number, e: number): Map<number, { v: number; partial: boolean }> {
  const out = new Map<number, { v: number; partial: boolean }>();
  const s = Math.max(a, r.start), en = Math.min(e, r.end);
  for (let i = s; i <= en; i++) {
    const y = Number(dates[i].slice(0, 4)), cur = out.get(y);
    out.set(y, { v: ((cur?.v ?? 0) + 1) * (1 + (r.ret[i] ?? 0)) - 1, partial: false });
  }
  // A year is partial when the data doesn't cover it from its first to its last period.
  out.forEach((o, y) => {
    const first = indexAfter(dates, `${y - 1}-12-31`), last = indexAfter(dates, `${y}-12-31`) - 1;
    o.partial = s > first || en < last || dates[last]?.slice(5) < '12-20';
  });
  return out;
}

/** Annualise a cumulative return over a span in days (≥ 365), else null. */
export const annualise = (cum: number, days: number) => (days >= 365 ? Math.pow(1 + cum, 365.25 / days) - 1 : null);
export const daysBetween = (a: string, b: string) => (toTime(b) - toTime(a)) / DAY;
