/* One line-chart engine for the page and the reports: returns SVG markup plus the geometry needed for hover. */
import type { MonthGrid } from './months';
import { niceTicks, xTicks } from './chart';
import { num } from './format';

export interface LineSeries { v: (number | null)[]; color: string; dash?: boolean; area?: boolean }
export interface ChartTheme { grid: string; muted: string; font: string; badgeInk: string }

export const PAGE_CHART: ChartTheme = { grid: 'var(--line-soft)', muted: 'var(--dim)', font: 'Inter, Segoe UI, sans-serif', badgeInk: 'var(--badge-ink)' };
export const PRINT_CHART: ChartTheme = { grid: '#e3e9ef', muted: '#5b6c7d', font: 'Inter, Helvetica, sans-serif', badgeInk: '#fff' };
/** Series colours on white report pages. */
export const REPORT_PALETTE = ['#1f8ccc', '#e08c0b', '#7a5ce0', '#1f9a5c', '#d4475b', '#a08d1c', '#16a3a0', '#e0662b', '#b34fd0', '#5d7387'];

export interface LineChartOptions extends ChartTheme {
  W: number; H: number; a: number; e: number; grid_: MonthGrid;
  series: LineSeries[];
  unit: 'idx' | '%';
  /** Reference line (100 for rebased levels, 0 for returns). */
  ref?: number;
  gid?: string;
  aria?: string;
  interactive?: boolean;
  /** Vertical dashed markers at series positions (e.g. where a new leg starts). */
  markers?: { k: number; label: string }[];
  /** Report language: month names on the axis and the decimal mark. */
  months?: string[];
  quarter?: string;
  decimal?: string;
}
export interface ChartGeometry { xs: (k: number) => number; ml: number; mr: number; L: number }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function lineChart(o: LineChartOptions): { svg: string } & ChartGeometry {
  const { W, H, a, e, series } = o;
  const ml = 10, mr = 62, mt = 14, mb = 28, L = e - a + 2;
  const xs = (k: number) => ml + (k / (L - 1)) * (W - ml - mr);
  let lo = Infinity, hi = -Infinity;
  series.forEach(s => s.v.forEach(x => { if (x != null) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }));
  const ref = o.ref;
  if (!isFinite(lo)) { lo = (ref ?? 0) - 10; hi = (ref ?? 0) + 10; }
  if (ref != null) { lo = Math.min(lo, ref); hi = Math.max(hi, ref); }
  const pad = (hi - lo) * 0.07 || 1; hi += pad; lo -= pad;
  const yt = niceTicks(lo, hi, 5); lo = Math.min(lo, yt[0]); hi = Math.max(hi, yt[yt.length - 1]);
  const ys = (v: number) => mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb);
  const dec = (x: string) => (o.decimal && o.decimal !== '.' ? x.replace('.', o.decimal) : x);
  const fmt = (t: number) => dec(o.unit === '%' ? num(t, t % 1 ? 1 : 0) + '%' : num(t, t % 1 ? 1 : 0));
  const txt = (x: number | string, y: number | string, s: string, anchor = 'start', weight = 600, fill = o.muted) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" font-size="11" font-weight="${weight}" font-family="${o.font}">${s}</text>`;

  let g = '';
  yt.forEach(t => {
    const y = ys(t).toFixed(1);
    g += `<line x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}" stroke="${o.grid}" stroke-width="1"/><line x1="${W - mr}" x2="${W - mr + 4}" y1="${y}" y2="${y}" stroke="${o.muted}"/>` + txt(W - mr + 8, +y + 4, fmt(t));
  });
  g += `<line x1="${W - mr}" x2="${W - mr}" y1="${mt}" y2="${H - mb}" stroke="${o.muted}" stroke-opacity=".6"/>`;
  if (ref != null) g += `<line x1="${ml}" x2="${W - mr}" y1="${ys(ref).toFixed(1)}" y2="${ys(ref).toFixed(1)}" stroke="${o.muted}" stroke-opacity=".8"/>`;
  xTicks(o.grid_, a, e, W, o.months, o.quarter).forEach(t => {
    const x = xs(t.i - (a - 1));
    if (x > W - mr - 8 || x < ml + 16) return;
    g += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${H - mb}" y2="${H - mb + 4}" stroke="${o.muted}"/>` + txt(x.toFixed(1), H - mb + 17, t.t, 'middle');
  });

  (o.markers ?? []).forEach(m => {
    if (m.k <= 0 || m.k >= L) return;
    const x = xs(m.k).toFixed(1);
    g += `<line x1="${x}" x2="${x}" y1="${mt}" y2="${H - mb}" stroke="${o.muted}" stroke-dasharray="2 3" stroke-opacity=".9"/>` + txt(+x + 4, mt + 10, m.label, 'start', 700);
  });
  let p = '', defs = '';
  const gid = 'g' + (o.gid || 'x');
  series.forEach((s, si) => {
    let d = '', open = false;
    s.v.forEach((v, k) => { if (v == null) { open = false; return; } d += (open ? 'L' : 'M') + xs(k).toFixed(1) + ' ' + ys(v).toFixed(1); open = true; });
    if (!d) return;
    if (s.area) {
      const first = s.v.findIndex(v => v != null), base = ref != null ? ys(ref) : H - mb;
      let lastK = s.v.length - 1; while (lastK > 0 && s.v[lastK] == null) lastK--;
      defs += `<linearGradient id="${gid}${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:.36"/><stop offset="1" style="stop-color:${s.color};stop-opacity:.02"/></linearGradient>`;
      p += `<path d="${d}L${xs(lastK).toFixed(1)} ${base.toFixed(1)}L${xs(first).toFixed(1)} ${base.toFixed(1)}Z" fill="url(#${gid}${si})" stroke="none"/>`;
    }
    p += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.dash ? 1.3 : 1.8}" ${s.dash ? 'stroke-dasharray="4 3" stroke-opacity=".8"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
  });

  // End-value badges on the right axis, nudged apart so they don't overlap.
  const ends = series.filter(s => !s.dash && s.v[s.v.length - 1] != null).map(s => ({ y: ys(s.v[s.v.length - 1]!), v: s.v[s.v.length - 1]!, c: s.color }));
  ends.sort((x, y) => x.y - y.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 17) ends[k].y = ends[k - 1].y + 17;
  const over = ends.length ? ends[ends.length - 1].y - (H - mb) : 0;
  if (over > 0) ends.forEach(x => (x.y -= over));
  ends.forEach(x => {
    p += `<rect x="${W - mr + 3}" y="${(x.y - 8).toFixed(1)}" width="${mr - 5}" height="16" rx="3" fill="${x.c}"/>` +
      txt(W - mr + 3 + (mr - 5) / 2, +(x.y + 4).toFixed(1), dec(o.unit === '%' ? num(x.v, 1) + '%' : num(x.v, 2)), 'middle', 800, o.badgeInk);
  });
  series.filter(s => !s.dash).forEach(s => {
    const k = s.v.length - 1;
    if (s.v[k] != null) p += `<circle cx="${xs(k).toFixed(1)}" cy="${ys(s.v[k]!).toFixed(1)}" r="3" fill="${s.color}"/>`;
  });
  const extra = o.interactive
    ? `<line class="hx" x1="0" x2="0" y1="${mt}" y2="${H - mb}" stroke="${o.muted}" stroke-dasharray="3 3" visibility="hidden"/><rect class="hit" x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}" fill="transparent"/>`
    : '';
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(o.aria || 'Chart')}"><defs>${defs}</defs>${g}${p}${extra}</svg>`;
  return { svg, xs, ml, mr, L };
}
