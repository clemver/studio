/* Number formats from the GX style guide §2. Inputs are decimals (0.0471 = 4.71 %). */

const ok = (x: number | null | undefined): x is number => x != null && isFinite(x);
/** Never show `-0.00`. */
const clean0 = (s: string) => (/^-0(\.0+)?$/.test(s) ? s.slice(1) : s);

export const CELL_MISSING = '–';
export const KPI_MISSING = '-';

/** Grid, relative values: signed, 2 decimals → `+4.71`, `-0.14`, `0.00`. */
export function g2(x: number | null | undefined, d = 2): string {
  if (!ok(x)) return CELL_MISSING;
  let s = clean0((x * 100).toFixed(d));
  if (+s > 0) s = '+' + s;
  return s;
}
/** Grid, absolute values: 2 decimals → `6.59`. */
export function a2(x: number | null | undefined, d = 2): string {
  if (!ok(x)) return CELL_MISSING;
  return clean0((x * 100).toFixed(d));
}
/** Tooltips: Swiss percent → `4,89%`. */
export function tp(x: number | null | undefined, d = 2): string {
  if (!ok(x)) return CELL_MISSING;
  return clean0((x * 100).toFixed(d)).replace('.', ',') + '%';
}
/** KPI values: `+4.89%`, missing `-`. */
export function kv(x: number | null | undefined, d = 2, sign = true): string {
  if (!ok(x)) return KPI_MISSING;
  let s = clean0((x * 100).toFixed(d));
  if (sign && +s > 0) s = '+' + s;
  return s + '%';
}
/** Index level (rebased to 100): `110.25`. */
export const ix = (v: number | null | undefined) => (ok(v) ? clean0(v.toFixed(2)) : CELL_MISSING);
/** Plain number for axes / labels. */
export const num = (x: number | null | undefined, d = 2) => (ok(x) ? clean0(x.toFixed(d)) : CELL_MISSING);
/** Amounts: de-CH grouping, no decimals → `41'600`. */
export const amount = (x: number | null | undefined) => (ok(x) ? new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 }).format(x) : KPI_MISSING);
