/* Pure performance maths on monthly returns (decimals). Period = month end before start → end month. */
import type { PeriodPreset, TrackRecord } from '../types';
import type { MonthGrid } from './months';

export const mean = (x: number[]) => (x.length ? x.reduce((p, c) => p + c, 0) / x.length : null);
export function sd(x: number[]): number | null {
  if (x.length < 2) return null;
  const m = mean(x)!;
  return Math.sqrt(x.reduce((p, c) => p + (c - m) ** 2, 0) / (x.length - 1));
}
export const compound = (x: number[]) => x.reduce((p, c) => p * (1 + c), 1) - 1;

export interface Stats {
  /** First grid index actually used (later than the period start when the instrument launched after it). */
  st: number;
  n: number;
  partial: boolean;
  cum: number;
  bcum: number | null;
  /** Annualised only for ≥ 12 months. */
  ann: number | null;
  bann: number | null;
  vol: number | null;
  /** Return / risk with 0 % risk-free. */
  rr: number | null;
  mdd: number;
  best: number;
  worst: number;
  pos: number;
  excess: number | null;
  te: number | null;
  ir: number | null;
}

export function stats(s: TrackRecord, a: number, e: number): Stats | null {
  const st = Math.max(a, s.incIdx);
  if (st > e) return null;
  const raw = s.ret.slice(st, e + 1);
  if (!raw.length || raw.some(v => v == null)) return null;
  const r = raw as number[], n = r.length;
  const braw = s.bm ? s.bm.slice(st, e + 1) : null;
  const b = braw && !braw.some(v => v == null) ? (braw as number[]) : null;
  const cum = compound(r), bcum = b ? compound(b) : null;
  const ann = n >= 12 ? Math.pow(1 + cum, 12 / n) - 1 : null;
  const bann = b && bcum != null && n >= 12 ? Math.pow(1 + bcum, 12 / n) - 1 : null;
  const vsd = sd(r), vol = vsd != null && n >= 3 ? vsd * Math.sqrt(12) : null;
  let pk = 1, v = 1, mdd = 0;
  r.forEach(x => { v *= 1 + x; pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); });
  const tsd = b ? sd(r.map((x, i) => x - b[i])) : null;
  const te = tsd != null && n >= 3 ? tsd * Math.sqrt(12) : null;
  return {
    st, n, partial: st > a, cum, bcum, ann, bann, vol,
    rr: ann != null && vol ? ann / vol : null, mdd,
    best: Math.max(...r), worst: Math.min(...r), pos: r.filter(x => x > 0).length / n,
    excess: bcum != null ? cum - bcum : null, te,
    ir: ann != null && bann != null && te ? (ann - bann) / te : null,
  };
}

/** Index levels rebased to 100 at the month end before the period start; one value per month from a-1 to e. */
export function cumVals(arr: (number | null)[], a: number, e: number, inc: number): (number | null)[] {
  const out: (number | null)[] = [], st = Math.max(a, inc);
  let v = 100;
  for (let i = a - 1; i <= e; i++) {
    if (i < st - 1 || (i >= st && arr[i] == null)) out.push(null);
    else if (i === st - 1) out.push(100);
    else { v *= 1 + (arr[i] as number); out.push(v); }
  }
  return out;
}

export interface Period { a: number; e: number; n: number }

export function periodOf(grid: MonthGrid, preset: PeriodPreset, from?: string, to?: string): Period {
  let a: number, e = grid.last;
  const lastYear = grid.key(grid.last).slice(0, 4);
  switch (preset) {
    case 'YTD': a = Math.max(0, grid.idx(`${lastYear}-01`)); break;
    case '1Y': a = grid.last - 11; break;
    case '3Y': a = grid.last - 35; break;
    case '5Y': a = grid.last - 59; break;
    case 'MAX': a = 0; break;
    default: {
      a = Math.max(0, from ? grid.idx(from) : 0);
      e = to ? grid.idx(to) : grid.last;
      if (e < 0) e = grid.last;
      if (a > e) [a, e] = [e, a];
    }
  }
  a = Math.max(0, a);
  return { a, e, n: e - a + 1 };
}

/** Grid figures: YTD, 1Y, 3Y, 5Y only when the full window is covered; since inception always. */
export interface Figures { ytd: Stats | null; y1: Stats | null; y3: Stats | null; y5: Stats | null; itd: Stats | null }

export function figures(s: TrackRecord, grid: MonthGrid): Figures {
  const full = (p: PeriodPreset) => { const { a, e } = periodOf(grid, p); const st = stats(s, a, e); return st && !st.partial ? st : null; };
  return { ytd: full('YTD'), y1: full('1Y'), y3: full('3Y'), y5: full('5Y'), itd: stats(s, s.incIdx, grid.last) };
}

/** Drawdown from running peak, in % (for charts). */
export function ddVals(vals: (number | null)[]): (number | null)[] {
  let pk: number | null = null;
  return vals.map(v => { if (v == null) return null; pk = pk == null ? v : Math.max(pk, v); return (v / pk - 1) * 100; });
}

/** Rolling window return or annualised volatility, in %, one value per month from a-1 to e. */
export function rolling(arr: (number | null)[], a: number, e: number, inc: number, w: number, kind: 'ret' | 'vol'): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = a - 1; i <= e; i++) {
    if (i - w + 1 < inc || i < 0) { out.push(null); continue; }
    const win = arr.slice(i - w + 1, i + 1);
    if (win.some(v => v == null)) { out.push(null); continue; }
    const x = win as number[];
    out.push(kind === 'vol' ? sd(x)! * Math.sqrt(12) * 100 : compound(x) * 100);
  }
  return out;
}

export interface YearReturn { v: number; bv: number | null; partial: boolean }
/** Calendar-year returns inside a..e, keyed by year. */
export function yearReturns(s: TrackRecord, grid: MonthGrid, a: number, e: number): Record<number, YearReturn> {
  const acc: Record<number, { r: number[]; b: number[] }> = {};
  for (let i = Math.max(a, s.incIdx); i <= e; i++) {
    const v = s.ret[i]; if (v == null) continue;
    const y = Number(grid.key(i).slice(0, 4));
    (acc[y] ??= { r: [], b: [] }).r.push(v);
    if (s.bm && s.bm[i] != null) acc[y].b.push(s.bm[i] as number);
  }
  const out: Record<number, YearReturn> = {};
  Object.entries(acc).forEach(([y, o]) => { out[+y] = { v: compound(o.r), bv: s.bm && o.b.length === o.r.length ? compound(o.b) : null, partial: o.r.length < 12 }; });
  return out;
}

export function corr(x: number[], y: number[]): number | null {
  const mx = mean(x)!, my = mean(y)!;
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < x.length; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; }
  return b && c ? a / Math.sqrt(b * c) : null;
}
