/*
 * 16:9 slides (PowerPoint). Slides are laid out once in inches; the same layout is drawn as HTML for the mockup
 * preview and written to a .pptx with native, editable tables and charts.
 */
import type { TrackRecord } from '../types';
import type { CModel, Ctx, Kpi, ReportInput, TModel } from './report';
import {
  calendarTable, chartHtml, detailsTable, esc, factDetails, factFigures, factKpis, legendHtml, monthlyTable,
  perfChart, reportColor, reportContext, summaryTable, tableHtml,
} from './report';
import { label } from './domain';

export const SW = 13.333, SH = 7.5;
/** Preview pixels per inch: a slide is 960 × 540 px. */
export const PX = 72;

type Block =
  | { kind: 'table'; t: TModel; note?: string }
  | { kind: 'chart'; m: CModel }
  | { kind: 'kpis'; k: Kpi[] }
  | { kind: 'kv'; title: string; kv: [string, string][] };
interface Placed { b: Block; x: number; y: number; w: number; h: number }

export interface Slide {
  cover?: { title: string; lines: string[] };
  title?: string;
  kicker?: string;
  placed: Placed[];
}

const X0 = 0.5, CW = SW - 1, Y0 = 1.38, Y1 = 6.78, GAP = 0.22;
const ROW = (t: TModel) => (t.heat ? 0.27 : 0.3);
const tableH = (t: TModel, note?: string) => (t.rows.length + 1) * ROW(t) + (note ? 0.25 : 0);
const kvH = (kv: [string, string][]) => 0.32 + kv.length * 0.27;

/** Stack blocks top-down in a column; charts take whatever height is left. */
function stack(blocks: Block[], x: number, w: number, y = Y0, y1 = Y1): Placed[] {
  const fixed = (b: Block) => (b.kind === 'table' ? tableH(b.t, b.note) : b.kind === 'kpis' ? 0.82 : b.kind === 'kv' ? kvH(b.kv) : 0);
  const charts = blocks.filter(b => b.kind === 'chart').length;
  const free = y1 - y - blocks.reduce((s, b) => s + fixed(b), 0) - GAP * (blocks.length - 1);
  return blocks.map(b => {
    const h = b.kind === 'chart' ? Math.max(1.6, free / charts) : fixed(b);
    const p = { b, x, y, w, h };
    y += h + GAP;
    return p;
  });
}

/** Split a long table over several slides. */
function chunks(t: TModel, max: number): TModel[] {
  if (t.rows.length <= max) return [t];
  const out: TModel[] = [];
  for (let i = 0; i < t.rows.length; i += max) out.push({ ...t, rows: t.rows.slice(i, i + max) });
  return out;
}

export function buildSlides(r: ReportInput): { c: Ctx; slides: Slide[] } {
  const c = reportContext(r), { S, sec } = c;
  const lines = [
    `${S.period} ${c.periodText} · ${c.n} ${S.months_} · ${c.ccyText}`,
    r.template === 'factsheet' ? r.records.map(s => label(s.inst)).join(' · ') : `${r.records.length} ${r.records.length === 1 ? S.instrument : S.instruments}`,
    ...(r.preparedFor ? [`${S.preparedFor} ${r.preparedFor}`] : []),
  ];
  const slides: Slide[] = [{ cover: { title: c.title, lines }, placed: [] }];
  const add = (title: string, placed: Placed[], kicker?: string) => slides.push({ title, kicker, placed });

  if (r.template === 'comparison') {
    const recs = r.records, colorOf = (s: TrackRecord) => reportColor(recs.indexOf(s));
    const sum = chunks(summaryTable(c, recs, colorOf), 14);
    sum.forEach((t, i) => add(S.riskReturn + (sum.length > 1 ? ` (${i + 1}/${sum.length})` : ''), stack([{ kind: 'table', t }], X0, CW), c.periodText));
    if (sec.has('chart')) add(S.cumulative, stack([{ kind: 'chart', m: perfChart(c, recs, 'perf', colorOf) }], X0, CW), c.periodText);
    if (sec.has('dd')) add(S.drawdown, stack([{ kind: 'chart', m: perfChart(c, recs, 'dd', colorOf) }], X0, CW), c.periodText);
    if (sec.has('cal')) chunks(calendarTable(c, r, recs, colorOf), 14).forEach(t => add(S.calendar, stack([{ kind: 'table', t, note: S.partialNote }], X0, CW), c.periodText));
    if (sec.has('det')) chunks(detailsTable(c, recs, colorOf), 14).forEach(t => add(S.details, stack([{ kind: 'table', t }], X0, CW)));
  } else {
    r.records.forEach(s => {
      const colorOf = () => reportColor(0), i = s.inst;
      const kicker = `${i.code} · ${S.category[i.category]} · ${i.currency}`;
      const top = stack([{ kind: 'kpis', k: factKpis(c, s) }], X0, CW);
      const yc = Y0 + 0.82 + GAP, LW = 7.9, RX = X0 + LW + 0.4, RWd = CW - LW - 0.4;
      const right: Block[] = [{ kind: 'kv', title: S.keyFigures, kv: factFigures(c, s) }];
      if (sec.has('det')) right.push({ kind: 'kv', title: S.details, kv: factDetails(c, s) });
      const left: Block[] = sec.has('chart') ? [{ kind: 'chart', m: perfChart(c, [s], 'perf', colorOf) }] : [];
      add(label(i), [...top, ...(left.length ? stack(left, X0, LW, yc) : []), ...stack(right, left.length ? RX : X0, left.length ? RWd : CW, yc)], kicker);
      const second: Block[] = [];
      if (sec.has('cal')) second.push({ kind: 'table', t: calendarTable(c, r, [s], colorOf, 8), note: S.partialNote });
      if (sec.has('monthly')) second.push({ kind: 'table', t: monthlyTable(c, r, s, sec.has('cal') ? 5 : 8) });
      if (second.length) add(`${label(i)} · ${sec.has('monthly') ? S.monthly : S.calendar}`, stack(second, X0, CW), kicker);
    });
  }
  return { c, slides };
}

/* ---------- HTML (mockup preview) ---------- */

const px = (v: number) => `${(v * PX).toFixed(1)}px`;
const box = (p: { x: number; y: number; w: number; h?: number }) => `left:${px(p.x)};top:${px(p.y)};width:${px(p.w)};${p.h != null ? `height:${px(p.h)};` : ''}`;

export function slideHtml(r: ReportInput, c: Ctx, s: Slide, k: number, n: number): string {
  if (s.cover) {
    return `<div class="rsl rsl-cover"><div class="rsl-eb">GX · Timeseries Studio</div><div class="rsl-ct">${esc(s.cover.title)}</div><div class="rsl-tn">${esc(c.templateName)}</div>${s.cover.lines.map(l => `<div class="rsl-cl">${esc(l)}</div>`).join('')}<div class="rsl-cg">${c.S.generated} ${r.generated}</div></div>`;
  }
  const blocks = s.placed.map(({ b, ...p }, i) => {
    if (b.kind === 'chart') {
      const lg = 0.3;
      return `<div class="rsl-b" style="${box(p)}">${chartHtml(c, r, b.m, p.w * PX, (p.h - lg) * PX, `s${k}_${i}`)}${legendHtml(b.m, c.S.dashedBenchmark)}</div>`;
    }
    if (b.kind === 'table') {
      return `<div class="rsl-b${b.t.heat ? ' rsl-heat' : ''}" style="${box(p)}">${tableHtml(b.t, 'rsl-tbl')}${b.note ? `<div class="rsl-note">${esc(b.note)}</div>` : ''}</div>`;
    }
    if (b.kind === 'kpis') return `<div class="rsl-b rsl-kpis" style="${box(p)}">${b.k.map(x => `<div><small>${esc(x.label)}</small><b class="${x.neg ? 'rp-neg' : ''}">${esc(x.value)}</b></div>`).join('')}</div>`;
    return `<div class="rsl-b" style="${box(p)}"><div class="rsl-kvt">${esc(b.title)}</div><dl class="rp-kv">${b.kv.map(([a, v]) => `<dt>${esc(a)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
  }).join('');
  return `<div class="rsl"><div class="rsl-eb">GX · Timeseries Studio<span>${esc(c.templateName)}</span></div><div class="rsl-t">${esc(s.title ?? '')}</div>${s.kicker ? `<div class="rsl-k">${esc(s.kicker)}</div>` : ''}<div class="rsl-rule"></div>${blocks}<div class="rsl-f"><span>${esc(c.foot)}</span><span>${k + 1} / ${n}</span></div></div>`;
}

export function buildSlidesHtml(r: ReportInput): string[] {
  const { c, slides } = buildSlides(r);
  return slides.map((s, k) => slideHtml(r, c, s, k, slides.length));
}

export const SLIDE_CSS = `
.rsl{width:960px;height:540px;background:#fff;color:#16222a;font-family:Inter,Helvetica,Arial,sans-serif;position:relative;overflow:hidden;font-size:10px;line-height:1.3;box-shadow:0 6px 24px rgba(0,0,0,.35)}
.rsl-eb{position:absolute;left:36px;top:18px;right:36px;font-weight:800;font-style:italic;font-size:10px;display:flex;justify-content:space-between}
.rsl-eb span{font-style:normal;color:#6a7882;font-weight:700}
.rsl-t{position:absolute;left:36px;top:38px;right:36px;font-size:22px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rsl-k{position:absolute;left:36px;top:68px;font-size:11px;color:#5b6c7d;font-weight:600}
.rsl-rule{position:absolute;left:36px;top:88px;width:40px;height:3px;background:#1f8ccc}
.rsl-b{position:absolute}
.rsl-f{position:absolute;left:36px;right:36px;bottom:12px;display:flex;justify-content:space-between;gap:24px;font-size:7px;color:#7a8791;border-top:1px solid #dbe3ea;padding-top:4px}
.rsl-f span:last-child{white-space:nowrap;font-weight:700}
.rsl .rp-t{font-size:10px}
.rsl .rp-t td,.rsl .rp-t th{height:21.6px;padding:0 5px}
.rsl-heat .rp-t td,.rsl-heat .rp-t th{height:19.4px;font-size:9px}
.rsl-note{font-size:8px;color:#5b6c7d;margin-top:4px}
.rsl-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.rsl-kpis>div{border:1px solid #dbe3ea;border-radius:4px;padding:8px 12px}
.rsl-kpis small{display:block;color:#5b6c7d;font-weight:700;font-size:8.5px;text-transform:uppercase;letter-spacing:.04em}
.rsl-kpis b{font-size:19px}
.rsl-kvt{font-size:12px;font-weight:800;border-left:3px solid #1f8ccc;padding-left:7px;margin-bottom:6px}
.rsl .rp-kv{font-size:10px;gap:0 12px}
.rsl .rp-kv dt,.rsl .rp-kv dd{height:19.4px;line-height:19.4px;border-bottom:1px solid #eef2f5}
.rsl .rp-lg{font-size:9px}
.rsl-cover{background:#16222a;color:#fff}
.rsl-cover .rsl-eb{color:#fff}
.rsl-ct{position:absolute;left:64px;top:170px;right:64px;font-size:36px;font-weight:800;line-height:1.15}
.rsl-tn{position:absolute;left:64px;top:128px;font-size:12px;font-weight:700;color:#7cc4ee;text-transform:uppercase;letter-spacing:.08em}
.rsl-cover .rsl-cl{position:relative;left:64px;top:300px;font-size:13px;color:#c9d4dc;margin-bottom:6px;width:830px}
.rsl-cg{position:absolute;left:64px;bottom:40px;font-size:10px;color:#8ea0ad}
`;

/* ---------- PowerPoint ---------- */

const hex = (c: string) => c.replace('#', '').toUpperCase();
const FONT = 'Arial';

export async function buildPptx(r: ReportInput): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const { c, slides } = buildSlides(r);
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'GX · Timeseries Studio';
  pptx.title = c.title;
  const n = slides.length;

  slides.forEach((s, k) => {
    const sl = pptx.addSlide();
    const text = (t: string, o: Record<string, unknown>) => sl.addText(t, { fontFace: FONT, margin: 0, color: '16222A', ...o });
    if (s.cover) {
      sl.background = { color: '16222A' };
      text('GX · Timeseries Studio', { x: 0.5, y: 0.25, w: 6, h: 0.3, fontSize: 11, bold: true, italic: true, color: 'FFFFFF' });
      text(c.templateName.toUpperCase(), { x: 0.9, y: 1.7, w: 11, h: 0.35, fontSize: 12, bold: true, color: '7CC4EE', charSpacing: 1 });
      text(s.cover.title, { x: 0.9, y: 2.25, w: 11.5, h: 1.3, fontSize: 36, bold: true, color: 'FFFFFF', valign: 'top' });
      s.cover.lines.forEach((l, i) => text(l, { x: 0.9, y: 4.15 + i * 0.36, w: 11.5, h: 0.32, fontSize: 13, color: 'C9D4DC' }));
      text(`${c.S.generated} ${r.generated}`, { x: 0.9, y: 6.75, w: 6, h: 0.3, fontSize: 10, color: '8EA0AD' });
      return;
    }
    text('GX · Timeseries Studio', { x: 0.5, y: 0.22, w: 6, h: 0.22, fontSize: 10, bold: true, italic: true });
    text(c.templateName, { x: SW - 6.5, y: 0.22, w: 6, h: 0.22, fontSize: 10, bold: true, color: '6A7882', align: 'right' });
    text(s.title ?? '', { x: 0.5, y: 0.5, w: CW, h: 0.4, fontSize: 22, bold: true });
    if (s.kicker) text(s.kicker, { x: 0.5, y: 0.93, w: CW, h: 0.22, fontSize: 11, color: '5B6C7D' });
    sl.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.2, w: 0.55, h: 0.04, fill: { color: '1F8CCC' }, line: { color: '1F8CCC', width: 0 } });

    s.placed.forEach(({ b, x, y, w, h }) => {
      if (b.kind === 'table') addTable(sl, b.t, x, y, w);
      if (b.kind === 'table' && b.note) text(b.note, { x, y: y + h - 0.2, w, h: 0.2, fontSize: 8, color: '5B6C7D' });
      if (b.kind === 'chart') addChart(pptx, sl, b.m, x, y, w, h);
      if (b.kind === 'kpis') {
        const kw = (w - 3 * 0.14) / 4;
        b.k.forEach((kp, i) => {
          const kx = x + i * (kw + 0.14);
          sl.addShape(pptx.ShapeType.roundRect, { x: kx, y, w: kw, h, fill: { color: 'FFFFFF' }, line: { color: 'DBE3EA', width: 0.75 }, rectRadius: 0.05 });
          text(kp.label.toUpperCase(), { x: kx + 0.15, y: y + 0.1, w: kw - 0.3, h: 0.2, fontSize: 8.5, bold: true, color: '5B6C7D' });
          text(kp.value, { x: kx + 0.15, y: y + 0.33, w: kw - 0.3, h: 0.38, fontSize: 19, bold: true, color: kp.neg ? 'C43B3B' : '16222A' });
        });
      }
      if (b.kind === 'kv') {
        text(b.title, { x, y, w, h: 0.26, fontSize: 12, bold: true });
        sl.addTable(b.kv.map(([a, v]) => [
          { text: a, options: { color: '5B6C7D' } },
          { text: v, options: { bold: true, align: 'right' as const } },
        ]), { x, y: y + 0.32, w, colW: [w * 0.55, w * 0.45], rowH: 0.27, fontFace: FONT, fontSize: 10, margin: [0, 4, 0, 0], valign: 'middle', border: [{ type: 'none' }, { type: 'none' }, { pt: 0.5, color: 'EEF2F5' }, { type: 'none' }] });
      }
    });
    text(c.foot, { x: 0.5, y: 7.1, w: CW - 0.8, h: 0.28, fontSize: 7, color: '7A8791', valign: 'top' });
    text(`${k + 1} / ${n}`, { x: SW - 1.3, y: 7.1, w: 0.8, h: 0.2, fontSize: 8, bold: true, color: '7A8791', align: 'right' });
  });
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

type PSlide = ReturnType<InstanceType<typeof import('pptxgenjs').default>['addSlide']>;

function addTable(sl: PSlide, t: TModel, x: number, y: number, w: number) {
  const cols = t.head.length;
  const colW = t.heat
    ? [0.7, ...Array(cols - 2).fill((w - 1.5) / (cols - 2)), 0.8]
    : cols <= 3 ? Array(cols).fill(w / cols) : [w * 0.3, ...Array(cols - 1).fill((w * 0.7) / (cols - 1))];
  const fs = t.heat ? 9 : 10;
  const line = (color: string, pt: number) => [{ type: 'none' as const }, { type: 'none' as const }, { pt, color }, { type: 'none' as const }];
  const head = t.head.map((h, i) => ({
    text: h.toUpperCase(),
    options: { bold: true, color: '5B6C7D', fontSize: fs - 1.5, align: (i === 0 ? 'left' : t.heat ? 'center' : 'right') as 'left' | 'center' | 'right', border: line('16222A', 1) },
  }));
  const rows = t.rows.map(row => row.map((cell, i) => ({
    text: (cell.sw ? '■ ' : '') + (cell.indent ? '    ' : '') + cell.t,
    options: {
      bold: !cell.muted, align: (i === 0 ? 'left' : t.heat ? 'center' : 'right') as 'left' | 'center' | 'right',
      color: cell.neg ? 'C43B3B' : cell.muted ? '5B6C7D' : '16222A', border: line('E1E7EC', 0.5),
    },
  })));
  // Colour swatch: the leading ■ takes the series colour.
  t.rows.forEach((row, ri) => { if (row[0].sw) (rows[ri][0] as { text: unknown }).text = [{ text: '■ ', options: { color: hex(row[0].sw) } }, { text: row[0].t, options: {} }]; });
  sl.addTable([head, ...rows] as never, { x, y, w, colW, rowH: ROW(t), fontFace: FONT, fontSize: fs, margin: [0, 4, 0, 4], valign: 'middle' });
}

function addChart(pptx: InstanceType<typeof import('pptxgenjs').default>, sl: PSlide, m: CModel, x: number, y: number, w: number, h: number) {
  const main = m.series.filter(s => !s.dash), bms = m.series.filter(s => s.dash);
  const toData = (ss: typeof m.series) => ss.map(s => ({ name: s.name, labels: m.labels, values: s.v.map(v => (v == null ? null : +v.toFixed(2))) as number[] }));
  const types = [{ type: pptx.ChartType.line, data: toData(main), options: { chartColors: main.map(s => hex(s.color)), lineSize: 2 } }];
  if (bms.length) types.push({ type: pptx.ChartType.line, data: toData(bms), options: { chartColors: bms.map(s => hex(s.color)), lineSize: 1.25, lineDash: 'dash' } as never });
  sl.addChart(types as never, {
    x, y, w, h, fontFace: FONT,
    lineDataSymbol: 'none', displayBlanksAs: 'gap',
    showLegend: true, legendPos: 'b', legendFontSize: 9, legendFontFace: FONT,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, catAxisLabelColor: '5B6C7D', valAxisLabelColor: '5B6C7D',
    catAxisLabelFrequency: String(Math.max(1, Math.ceil(m.labels.length / 8))), catAxisLineShow: true, catAxisLineColor: 'B8C4CE',
    valAxisLabelFormatCode: m.view === 'perf' ? '0' : '0"%"', valAxisLineShow: false,
    valGridLine: { color: 'E3E9EF', size: 0.5 }, catGridLine: { style: 'none' },
    catAxisOrientation: 'minMax',
  } as never);
}
