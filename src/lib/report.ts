/*
 * Report library. Each template builds language-aware blocks (tables, charts, key figures) once; the blocks are
 * laid out on A4 pages (PDF / HTML) here and on 16:9 slides (PowerPoint) in `slides.ts`.
 * Used by the mock back end to produce the files and by the Reports page for its sample mockups.
 */
import type { ReportFormat, ReportLanguage, ReportTemplate, TrackRecord } from '../types';
import type { MonthGrid } from './months';
import { monthEnd, ymOf } from './months';
import type { Period, Stats } from './stats';
import { cumVals, ddVals, stats, yearReturns } from './stats';
import { PRINT_CHART, REPORT_PALETTE, lineChart } from './lineChart';
import { label } from './domain';
import { num } from './format';
import { tr } from './reportI18n';

export interface TemplateInfo {
  id: ReportTemplate;
  name: string;
  desc: string;
  /** What each output looks like, for the library card. */
  layouts: { a4: string; slides: string };
  sections: string[];
  defaultSections: string[];
}

export const TEMPLATES: Record<ReportTemplate, TemplateInfo> = {
  comparison: {
    id: 'comparison', name: 'Comparison', desc: 'Side-by-side figures, cumulative chart, drawdown and calendar years for all instruments.',
    layouts: { a4: '2 A4 pages', slides: 'Cover + 1 slide per section' },
    sections: ['chart', 'dd', 'cal', 'det', 'bm'], defaultSections: ['chart', 'dd', 'cal', 'det'],
  },
  factsheet: {
    id: 'factsheet', name: 'Factsheet', desc: 'One page per instrument: key figures, chart against its benchmark, calendar years and monthly returns.',
    layouts: { a4: '1 A4 page per instrument', slides: 'Cover + 1–2 slides per instrument' },
    sections: ['chart', 'cal', 'monthly', 'det', 'bm'], defaultSections: ['chart', 'cal', 'monthly', 'det', 'bm'],
  },
};
export const TEMPLATE_ORDER: ReportTemplate[] = ['comparison', 'factsheet'];

export const SECTION_LABELS: Record<string, string> = {
  chart: 'Cumulative performance', dd: 'Drawdown', cal: 'Calendar year returns', det: 'Instrument details',
  bm: 'Benchmarks in charts and tables', monthly: 'Monthly returns table',
};

export const FORMATS: { id: ReportFormat; name: string; ext: string; layout: 'a4' | 'slides'; hint: string }[] = [
  { id: 'pdf', name: 'PDF', ext: 'pdf', layout: 'a4', hint: 'A4 pages, ready to send' },
  { id: 'html', name: 'HTML', ext: 'html', layout: 'a4', hint: 'A4 pages in the browser, printable' },
  { id: 'pptx', name: 'PowerPoint', ext: 'pptx', layout: 'slides', hint: '16:9 slides, editable tables and charts' },
];
export const layoutOf = (f: ReportFormat) => FORMATS.find(x => x.id === f)!.layout;

export interface ReportInput {
  template: ReportTemplate;
  language: ReportLanguage;
  /** Reference currency; '' = each instrument's own. */
  currency?: string;
  title: string;
  preparedFor: string;
  sections: string[];
  grid: MonthGrid;
  period: Period;
  records: TrackRecord[];
  /** Generation date, `dd.mm.yyyy`. */
  generated: string;
  sampleData?: boolean;
}

/* ---------- blocks shared by pages and slides ---------- */

export interface TCell { t: string; neg?: boolean; sw?: string; sub?: string; muted?: boolean; indent?: boolean }
export interface TModel { head: string[]; rows: TCell[][]; heat?: boolean }
export interface CSeries { name: string; color: string; dash?: boolean; area?: boolean; v: (number | null)[] }
/** Line chart over the period: one value per month end from a−1 to e. */
export interface CModel { view: 'perf' | 'dd'; series: CSeries[]; labels: string[] }
export interface Kpi { label: string; value: string; neg?: boolean }

/** Number formats per language: French uses a decimal comma and a narrow space before %. */
export function formats(l: ReportLanguage) {
  const dec = (s: string) => (l === 'fr' ? s.replace('.', ',') : s);
  const pc = l === 'fr' ? ' %' : '%';
  const pct = (x: number | null | undefined, d = 2, sign = true): string => {
    if (x == null || !isFinite(x)) return '—';
    let s = (x * 100).toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    if (sign && +s > 0) s = '+' + s;
    return dec(s).replace('-', '−') + pc;
  };
  const n = (x: number | null | undefined, d = 2) => (x == null || !isFinite(x) ? '—' : dec(num(x, d)).replace('-', '−'));
  return { pct, n, decimal: l === 'fr' ? ',' : '.' };
}

export const reportColor = (k: number) => REPORT_PALETTE[k % REPORT_PALETTE.length];

/** Everything the blocks need, computed once per report. */
export function reportContext(r: ReportInput) {
  const S = tr(r.language), F = formats(r.language), { grid, period: { a, e, n } } = r;
  const sec = new Set(r.sections), bm = sec.has('bm');
  const monthLbl = (k: string) => { const { y, m } = ymOf(k); return `${S.months[m - 1]} ${y}`; };
  const labels = Array.from({ length: e - a + 2 }, (_, i) => monthLbl(grid.key(a - 1 + i)));
  const title = r.title || S.defaultTitle;
  const templateName = r.template === 'factsheet' ? S.templateFactsheet : S.templateComparison;
  const periodText = `${monthEnd(grid.key(a - 1))} – ${monthEnd(grid.key(e))}`;
  const stat = new Map<TrackRecord, Stats | null>(r.records.map(s => [s, stats(s, a, e)]));
  const imported = r.records.some(s => s.inst.source === 'upload');
  const foot = `${S.footer}${imported ? ' ◇ ' + S.importedNote : ''}${r.sampleData ? ' ' + S.sample : ''}`;
  const ccyText = `${S.refCurrency} ${r.currency || S.ownCurrency}`;
  return { S, F, a, e, n, sec, bm, labels, title, templateName, periodText, stat, foot, monthLbl, ccyText };
}
export type Ctx = ReturnType<typeof reportContext>;

const nameOf = (s: TrackRecord) => label(s.inst) + (s.inst.source === 'upload' ? ' ◇' : '');

export function summaryTable(c: Ctx, records: TrackRecord[], colorOf: (s: TrackRecord) => string): TModel {
  const { S, F } = c;
  const rows: TCell[][] = [];
  records.forEach(s => {
    const st = c.stat.get(s) ?? null, i = s.inst;
    if (!st) { rows.push([{ t: nameOf(s), sw: colorOf(s) }, { t: i.currency }, { t: S.noData, muted: true }, ...Array(6).fill({ t: '' })]); return; }
    rows.push([
      { t: nameOf(s) + (st.partial ? ' ◆' : ''), sw: colorOf(s) }, { t: i.currency },
      { t: F.pct(st.cum), neg: st.cum < 0 }, { t: F.pct(st.ann), neg: (st.ann ?? 0) < 0 }, { t: F.pct(st.vol, 2, false) },
      { t: F.n(st.rr) }, { t: F.pct(st.mdd), neg: true }, { t: F.pct(st.excess), neg: (st.excess ?? 0) < 0 }, { t: F.pct(st.te, 2, false) },
    ]);
    if (c.bm && s.bm) rows.push([{ t: i.benchmarkName ?? S.benchmark, muted: true, indent: true }, { t: '' }, { t: F.pct(st.bcum), muted: true }, { t: F.pct(st.bann), muted: true }, ...Array(5).fill({ t: '' })]);
  });
  return { head: [S.thInstrument, S.thCcy, S.thReturn, S.thAnn, S.thVol, S.thRetRisk, S.thMaxDd, S.thExcess, S.thTe], rows };
}

function periodYears(c: Ctx, grid: MonthGrid, max: number): number[] {
  const ys: number[] = [];
  for (let i = c.a; i <= c.e; i++) { const y = Number(grid.key(i).slice(0, 4)); if (!ys.includes(y)) ys.push(y); }
  return ys.slice(-max);
}

export function calendarTable(c: Ctx, r: ReportInput, records: TrackRecord[], colorOf: (s: TrackRecord) => string, max = 8): TModel {
  const years = periodYears(c, r.grid, max);
  const row = (name: string, s: TrackRecord, sw?: string, muted?: boolean): TCell[] => {
    const yr = yearReturns(s, r.grid, c.a, c.e);
    return [{ t: name, sw, muted, indent: muted }, ...years.map(y => (yr[y] ? { t: c.F.pct(yr[y].v, 1) + (yr[y].partial ? '*' : ''), neg: yr[y].v < 0, muted } : { t: '—', muted }))];
  };
  const rows: TCell[][] = [];
  records.forEach(s => {
    rows.push(row(nameOf(s), s, colorOf(s)));
    if (c.bm && s.bm) rows.push(row(s.inst.benchmarkName ?? c.S.benchmark, { ...s, ret: s.bm }, undefined, true));
  });
  return { head: [c.S.thInstrument, ...years.map(String)], rows };
}

export function detailsTable(c: Ctx, records: TrackRecord[], colorOf: (s: TrackRecord) => string): TModel {
  const { S } = c;
  return {
    head: [S.thInstrument, S.thId, S.thCategory, S.thRisk, S.thCcy, S.thInception, S.thBenchmark],
    rows: records.map(s => {
      const i = s.inst;
      return [{ t: nameOf(s), sw: colorOf(s), sub: i.alias ? i.name : undefined }, { t: i.code }, { t: S.category[i.category] },
        { t: i.riskProfile ? S.risk[i.riskProfile] : '—' }, { t: i.currency }, { t: c.monthLbl(i.inception) }, { t: i.benchmarkName ?? '—' }];
    }),
  };
}

export function perfChart(c: Ctx, records: TrackRecord[], view: 'perf' | 'dd', colorOf: (s: TrackRecord) => string): CModel {
  const series = records.flatMap(s => {
    const cv = cumVals(s.ret, c.a, c.e, s.incIdx);
    const out: CSeries[] = [{ name: label(s.inst), v: view === 'perf' ? cv : ddVals(cv), color: colorOf(s), area: records.length <= 2 && s === records[0] }];
    if (c.bm && s.bm) { const bv = cumVals(s.bm, c.a, c.e, s.incIdx); out.push({ name: s.inst.benchmarkName ?? c.S.benchmark, v: view === 'dd' ? ddVals(bv) : bv, color: records.length === 1 ? '#5b6c7d' : colorOf(s), dash: true }); }
    return out;
  });
  return { view, series, labels: c.labels };
}

/** Factsheet key figures: the four headline numbers, then the details list. */
export function factKpis(c: Ctx, s: TrackRecord): Kpi[] {
  const st = c.stat.get(s), { S, F } = c;
  return [
    { label: S.periodReturn, value: F.pct(st?.cum), neg: (st?.cum ?? 0) < 0 },
    { label: S.annualised, value: F.pct(st?.ann), neg: (st?.ann ?? 0) < 0 },
    { label: S.volatility, value: F.pct(st?.vol, 2, false) },
    { label: S.maxDrawdown, value: F.pct(st?.mdd), neg: true },
  ];
}
export function factFigures(c: Ctx, s: TrackRecord): [string, string][] {
  const st = c.stat.get(s), { S, F } = c;
  const out: [string, string][] = [];
  if (c.bm && s.bm) out.push([S.benchmark, s.inst.benchmarkName ?? '—'], [S.benchmark + ' · ' + S.periodReturn.toLowerCase(), F.pct(st?.bcum)], [S.excessReturn, F.pct(st?.excess)], [S.trackingError, F.pct(st?.te, 2, false)], [S.infoRatio, F.n(st?.ir)]);
  out.push([S.bestMonth, F.pct(st?.best)], [S.worstMonth, F.pct(st?.worst)], [S.positiveMonths, F.pct(st?.pos, 0, false)]);
  return out;
}
export function factDetails(c: Ctx, s: TrackRecord): [string, string][] {
  const { S } = c, i = s.inst;
  return [[S.thId, i.code], [S.thCategory, S.category[i.category]], [S.riskProfile, i.riskProfile ? S.risk[i.riskProfile] : '—'], [S.currency, i.currency], [S.thInception, c.monthLbl(i.inception)]];
}

/** Monthly returns: one row per calendar year (latest `max` years in the period), months + year total. */
export function monthlyTable(c: Ctx, r: ReportInput, s: TrackRecord, max = 5): TModel {
  const years = periodYears(c, r.grid, max), yr = yearReturns(s, r.grid, c.a, c.e);
  const rows = years.map(y => {
    const cells: TCell[] = [{ t: String(y) }];
    for (let m = 1; m <= 12; m++) {
      const i = r.grid.idx(`${y}-${String(m).padStart(2, '0')}`);
      const v = i >= Math.max(c.a, s.incIdx) && i <= c.e ? s.ret[i] : null;
      cells.push(v == null ? { t: '' } : { t: c.F.pct(v, 1, false), neg: v < 0 });
    }
    cells.push(yr[y] ? { t: c.F.pct(yr[y].v, 1) + (yr[y].partial ? '*' : ''), neg: yr[y].v < 0 } : { t: '—' });
    return cells;
  });
  return { head: [c.S.thYear, ...c.S.months, c.S.thYearTotal], rows, heat: true };
}

/* ---------- HTML rendering of blocks (pages and slide previews) ---------- */

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export function tableHtml(t: TModel, cls = ''): string {
  const cell = (x: TCell, k: number) => {
    const style = x.indent && k === 0 ? ' style="padding-left:20px"' : '';
    const c = [x.neg ? 'rp-neg' : '', x.muted ? 'rp-mut' : ''].filter(Boolean).join(' ');
    return `<td${c ? ` class="${c}"` : ''}${style}>${x.sw ? `<i style="background:${x.sw}"></i>` : ''}${esc(x.t)}${x.sub ? `<br><span class="rp-sub">${esc(x.sub)}</span>` : ''}</td>`;
  };
  return `<table class="rp-t${t.heat ? ' rp-heat' : ''}${cls ? ' ' + cls : ''}"><thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table>`;
}

export function chartHtml(c: Ctx, r: ReportInput, m: CModel, W: number, H: number, gid: string): string {
  const svg = lineChart({
    ...PRINT_CHART, W, H, a: c.a, e: c.e, grid_: r.grid, months: c.S.months, quarter: c.S.quarter, decimal: c.F.decimal,
    series: m.series.map(s => ({ v: s.v, color: s.color, dash: s.dash, area: s.area })),
    unit: m.view === 'perf' ? 'idx' : '%', ref: m.view === 'perf' ? 100 : 0, gid,
  }).svg;
  return `<div class="rp-svg">${svg}</div>`;
}

export function legendHtml(m: CModel, dashedNote: string): string {
  const main = m.series.filter(s => !s.dash);
  return `<div class="rp-lg">${main.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}${m.series.some(s => s.dash) ? `<span>${esc(dashedNote)}</span>` : ''}</div>`;
}

export const kpisHtml = (k: Kpi[]) => `<div class="rp-kpis">${k.map(x => `<div class="rp-kpi"><small>${esc(x.label)}</small><b class="${x.neg ? 'rp-neg' : ''}">${esc(x.value)}</b></div>`).join('')}</div>`;
export const kvHtml = (kv: [string, string][]) => `<dl class="rp-kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

/* ---------- A4 pages ---------- */

const RW = 698; // printable width in px

export function buildReportPages(r: ReportInput): string[] {
  const c = reportContext(r);
  const pages = r.template === 'factsheet' ? factsheetPages(c, r) : comparisonPages(c, r);
  const { S } = c;
  return pages.map((p, i) => `<div class="rp-page"><div class="rp-eb">GX · Timeseries Studio<span>${esc(c.templateName)}${pages.length > 1 ? ` · ${S.page} ${i + 1}/${pages.length}` : ''}</span></div>${p}<div class="rp-foot"><span>${esc(c.foot)}</span><span>${S.generated} ${r.generated}</span></div></div>`);
}

function comparisonPages(c: Ctx, r: ReportInput): string[] {
  const { S, sec } = c, recs = r.records;
  const colorOf = (s: TrackRecord) => reportColor(recs.indexOf(s));
  const head = `<div class="rp-h1">${esc(c.title)}</div><div class="rp-meta">${r.preparedFor ? `${S.preparedFor} ${esc(r.preparedFor)} · ` : ''}${S.generated} ${r.generated}</div>`;
  const band = `<div class="rp-band"><span>${S.period} <b>${c.periodText}</b></span><span><b>${c.n}</b> ${S.months_}</span><span><b>${recs.length}</b> ${recs.length === 1 ? S.instrument : S.instruments}</span><span>${esc(c.ccyText)}</span>${r.preparedFor ? `<span>${S.preparedFor} <b>${esc(r.preparedFor)}</b></span>` : ''}</div>`;
  const perf = perfChart(c, recs, 'perf', colorOf);
  let p1 = head + band + `<div class="rp-h2">${esc(S.riskReturn)}</div>` + tableHtml(summaryTable(c, recs, colorOf));
  if (sec.has('chart')) p1 += `<div class="rp-h2">${esc(S.cumulative)}</div>` + chartHtml(c, r, perf, RW, recs.length > 6 ? 300 : 330, 'rp') + legendHtml(perf, S.dashedBenchmark);
  const pages = [p1];
  let p2 = '';
  if (sec.has('dd')) { const dd = perfChart(c, recs, 'dd', colorOf); p2 += `<div class="rp-h2">${esc(S.drawdown)}</div>` + chartHtml(c, r, dd, RW, 230, 'rd') + (sec.has('chart') ? '' : legendHtml(dd, S.dashedBenchmark)); }
  if (sec.has('cal')) p2 += `<div class="rp-h2">${esc(S.calendar)}</div>` + tableHtml(calendarTable(c, r, recs, colorOf)) + `<div class="rp-meta" style="margin-top:4px">${esc(S.partialNote)}</div>`;
  if (sec.has('det')) p2 += `<div class="rp-h2">${esc(S.details)}</div>` + tableHtml(detailsTable(c, recs, colorOf));
  if (p2) pages.push(p2);
  return pages;
}

function factsheetPages(c: Ctx, r: ReportInput): string[] {
  const { S, sec } = c;
  return r.records.map((s, k) => {
    const colorOf = () => reportColor(0);
    const i = s.inst;
    const cover = `<div class="rp-cover"><div class="rp-meta">${esc(c.title)}${r.preparedFor ? ` · ${S.preparedFor} ${esc(r.preparedFor)}` : ''}</div><div class="rp-h1">${esc(label(i))}</div><div class="rp-meta">${esc(i.code)} · ${esc(S.category[i.category])} · ${esc(i.currency)}${i.riskProfile ? ' · ' + esc(S.risk[i.riskProfile]) : ''}</div></div>`;
    const band = `<div class="rp-band" style="margin-top:0"><span>${S.period} <b>${c.periodText}</b></span><span><b>${c.n}</b> ${S.months_}</span>${c.bm && s.bm ? `<span>${S.benchmark} <b>${esc(i.benchmarkName ?? '—')}</b></span>` : ''}</div>`;
    let h = cover + band + kpisHtml(factKpis(c, s));
    if (sec.has('chart')) { const m = perfChart(c, [s], 'perf', colorOf); h += `<div class="rp-h2">${esc(S.cumulative)}</div>` + chartHtml(c, r, m, RW, 250, 'f' + k) + legendHtml(m, S.dashedBenchmark); }
    const right = `<div class="rp-h2">${esc(S.keyFigures)}</div>` + kvHtml(factFigures(c, s)) + (sec.has('det') ? `<div class="rp-h2">${esc(S.details)}</div>` + kvHtml(factDetails(c, s)) : '');
    const left = sec.has('cal') ? `<div class="rp-h2">${esc(S.calendar)}</div>` + tableHtml(calendarTable(c, r, [s], colorOf, 6)) + `<div class="rp-meta" style="margin-top:4px">${esc(S.partialNote)}</div>` : '';
    h += left ? `<div class="rp-cols"><div>${left}</div><div>${right}</div></div>` : right;
    if (sec.has('monthly')) h += `<div class="rp-h2">${esc(S.monthly)}</div>` + tableHtml(monthlyTable(c, r, s));
    return h;
  });
}

export function reportDocument(r: ReportInput): string {
  return `<!doctype html><html lang="${r.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.title || tr(r.language).defaultTitle)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"><style>body{margin:0;background:#e8edf1;display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px 0}${REPORT_CSS}@page{size:A4;margin:0}@media print{body{background:#fff;padding:0;gap:0}.rp-page{box-shadow:none;page-break-after:always;width:210mm;height:297mm}}</style></head><body>${buildReportPages(r).join('')}</body></html>`;
}

export function reportFileBase(r: Pick<ReportInput, 'title' | 'template' | 'grid' | 'period' | 'language'>): string {
  const S = tr(r.language);
  const t = (r.title || S.defaultTitle).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
  const name = r.template === 'factsheet' ? S.templateFactsheet : S.templateComparison;
  return `${t}_${name.normalize('NFD').replace(/[^\w]+/g, '')}_${r.language.toUpperCase()}_${r.grid.key(r.period.a)}_${r.grid.key(r.period.e)}`;
}

/** Report pages on white; also injected when pages are rendered in the app (preview, PDF capture). */
export const REPORT_CSS = `
.rp-page{width:794px;height:1123px;background:#fff;color:#16222a;font-family:Inter,Helvetica,Arial,sans-serif;padding:44px 48px 40px;position:relative;overflow:hidden;font-size:11.5px;line-height:1.4;box-shadow:0 6px 24px rgba(0,0,0,.35)}
.rp-page *,.rsl *{box-sizing:border-box}
.rp-eb{font-weight:800;font-style:italic;font-size:13px;letter-spacing:-.03em;color:#16222a;display:flex;justify-content:space-between}
.rp-eb span{font-style:normal;font-weight:700;color:#6a7882;letter-spacing:0;font-size:10.5px}
.rp-h1{font-size:23px;font-weight:800;margin:10px 0 2px;color:#16222a}
.rp-meta{color:#5b6c7d;font-size:11px}
.rp-band{display:flex;flex-wrap:wrap;gap:4px 20px;border-top:2px solid #16222a;border-bottom:1px solid #c8d3dd;padding:7px 0;margin:14px 0 4px;font-size:11px}
.rp-h2{font-size:13.5px;font-weight:800;margin:18px 0 7px;color:#16222a;border-left:3px solid #1f8ccc;padding-left:8px}
.rp-t{width:100%;border-collapse:collapse;font-size:10.5px}
.rp-t th{text-align:right;font-weight:700;color:#5b6c7d;font-size:9px;letter-spacing:.04em;text-transform:uppercase;padding:5px 5px;border-bottom:1px solid #16222a}
.rp-t td{text-align:right;padding:5px 5px;border-bottom:1px solid #e1e7ec;font-variant-numeric:tabular-nums;font-weight:600}
.rp-t th:first-child,.rp-t td:first-child{text-align:left}
.rp-t td:last-child{white-space:normal}
.rp-t i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.rp-sub{color:#7a8791;font-weight:600;padding-left:15px}
.rp-neg{color:#c43b3b}
.rp-mut{color:#5b6c7d}
.rp-svg svg{width:100%;height:auto;display:block}
.rp-lg{display:flex;flex-wrap:wrap;gap:3px 12px;font-size:10px;color:#5b6c7d;margin-top:3px}
.rp-lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px}
.rp-kv{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:11px;margin:0}
.rp-kv dt{color:#5b6c7d;font-weight:600}
.rp-kv dd{margin:0;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}
.rp-cols{display:grid;grid-template-columns:1.25fr 1fr;gap:24px}
.rp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 4px}
.rp-kpi{border:1px solid #dbe3ea;border-radius:4px;padding:7px 9px}
.rp-kpi small{display:block;color:#5b6c7d;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em}
.rp-kpi b{font-size:16px}
.rp-foot{position:absolute;left:48px;right:48px;bottom:22px;display:flex;justify-content:space-between;gap:20px;font-size:8.5px;color:#7a8791;border-top:1px solid #dbe3ea;padding-top:6px}
.rp-foot span:last-child{white-space:nowrap}
.rp-heat td{text-align:center!important;font-size:9.5px;padding:4px 2px!important}
.rp-heat th{text-align:center!important;padding:5px 2px!important}
.rp-heat td:first-child,.rp-heat td:last-child{font-weight:800}
.rp-cover{background:#16222a;color:#fff;margin:14px -48px 0;padding:22px 48px 20px}
.rp-cover .rp-h1{color:#fff;font-size:26px;margin:4px 0}
.rp-cover .rp-meta{color:#b9c6cf}
`;
