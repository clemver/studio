/*
 * Right-hand card, shown only while something is selected. One instrument: header, tabs (Overview · Performance · Calendar years), KPI row, chart,
 * key facts, action cards. Several instruments: the same structure for the selection.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { PeriodPreset, Tag, TrackRecord } from '../../types';
import type { MonthGrid } from '../../lib/months';
import { monthEnd, monthLabel } from '../../lib/months';
import type { Figures, Period, Stats } from '../../lib/stats';
import { cumVals, mean, stats, yearReturns } from '../../lib/stats';
import { CELL_MISSING, KPI_MISSING, a2, g2, ix, kv, num } from '../../lib/format';
import { CATEGORY_SINGULAR, CURRENCY_NAMES, SOURCE_LABEL, label } from '../../lib/domain';
import { LineChart } from '../LineChart';
import type { NamedSeries } from '../LineChart';
import { Flag, RiskDots, SourceTag } from '../Marks';
import { Icon } from '../Icons';
import { Chip } from '../Chip';
import { StatusIcon } from '../StatusIcon';
import type { Status } from '../StatusIcon';
import type { BenchmarkInfo } from '../../hooks/useBenchmarks';

export interface CardAction { eyebrow: string; title: string; onClick: () => void; disabled?: boolean; tip?: string }

interface Props {
  grid: MonthGrid;
  period: Period;
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
  records: TrackRecord[];
  limit: number;
  colorOf: (id: string) => string;
  figuresOf: (id: string) => Figures | null;
  /** Up to two, depending on the user's rights. */
  actions: CardAction[];
  job: { kind: Status; text: string } | null;
  onClear: () => void;
  onRemove: (id: string) => void;
  onCopyId: (code: string) => void;
  tags: Tag[];
  /** Effective benchmark in the folder being viewed. */
  benchOf: (id: string) => BenchmarkInfo | null;
  /** Set when this user may change the benchmark here (opens the benchmark picker). */
  onChangeBenchmark?: (id: string, anchor: HTMLElement) => void;
  /** Set when this user may tag the security. */
  onEditTags?: (id: string, anchor: HTMLElement) => void;
}

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: 'YTD', label: 'YTD' }, { key: '1Y', label: '12M' }, { key: '3Y', label: '3Y' }, { key: '5Y', label: '5Y' }, { key: 'MAX', label: 'Max' },
];

function UTabs<K extends string>({ items, value, onChange, small, ariaLabel }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; small?: boolean; ariaLabel: string }) {
  return (
    <div className={`utabs${small ? ' sm' : ''}`} role="tablist" aria-label={ariaLabel}>
      {items.map(t => <button key={t.key} type="button" role="tab" aria-selected={t.key === value} onClick={() => onChange(t.key)}>{t.label}</button>)}
    </div>
  );
}
const KpiCell = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="dc-kpi"><small>{label}</small><b>{value}</b><span>{sub ?? ' '}</span></div>
);
const sw = (c: string) => <span className="sw" style={{ '--c': c } as CSSProperties} />;

/** Decorative sparkline for the action cards, drawn from the selection's cumulative series. */
function Spark({ series }: { series: { v: (number | null)[]; color: string }[] }) {
  const vals = series.flatMap(s => s.v.filter((x): x is number => x != null));
  if (!vals.length) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals), W = 100, H = 40;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {series.map((s, k) => {
        const n = s.v.length - 1;
        const d = s.v.map((v, i) => (v == null ? '' : `${i ? 'L' : 'M'}${((i / n) * W).toFixed(1)} ${(H - ((v - lo) / (hi - lo || 1)) * H).toFixed(1)}`)).join('');
        return <path key={k} d={d} fill="none" stroke={s.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

export function DetailCard(p: Props) {
  const [tab, setTab] = useState<'overview' | 'perf' | 'cal'>('overview');
  const { grid, period: { a, e }, records } = p;
  const single = records.length === 1 ? records[0] : null;

  const series: NamedSeries[] = useMemo(() => {
    const out: NamedSeries[] = records.map((r, i) => ({ name: label(r.inst), v: cumVals(r.ret, a, e, r.incIdx), color: p.colorOf(r.inst.id), area: i === 0 }));
    if (records.length === 1 && records[0].bm) {
      const r = records[0];
      out.push({ name: p.benchOf(r.inst.id)?.name ?? 'Benchmark', v: cumVals(r.bm!, a, e, r.incIdx), color: 'var(--muted)', dash: true });
    }
    return out;
  }, [records, a, e, p.colorOf, p.benchOf]);

  const rows = records.map(r => ({ r, st: stats(r, a, e) }));
  const periodLine = `${monthEnd(grid.key(a - 1))} → ${monthEnd(grid.key(e))}`;

  const chart = (
    <>
      <div className="dc-sec">
        <h3>Performance · rebased to 100</h3>
        <UTabs small ariaLabel="Period" items={PRESETS} value={p.preset === 'CUSTOM' ? ('' as PeriodPreset) : p.preset} onChange={p.onPreset} />
      </div>
      <LineChart grid={grid} a={a} e={e} series={series} height={200} unit="idx" ref100={100} gid="dc" ariaLabel={`Cumulative performance, ${periodLine}`} format={ix} />
      <div className="note" style={{ paddingTop: 0 }}>Period <span className="num">{periodLine}</span>{single?.bm ? ' · dashed: benchmark' : ''}</div>
    </>
  );

  const actions = (
    <>
      {p.job && <div className="dc-status msgline"><StatusIcon kind={p.job.kind} message={p.job.text} />{p.job.text}</div>}
      <div className="dc-acts">
        {p.actions.map(act => (
          <button key={act.title} type="button" className="acard" disabled={act.disabled} data-tip={act.tip} onClick={act.onClick}>
            <span className="art"><Spark series={series.filter(s => !s.dash)} /></span>
            <span className="tx"><span><small>{act.eyebrow}</small><b>{act.title}</b></span><Icon.arrow className="arr" /></span>
          </button>
        ))}
      </div>
    </>
  );

  /* ---------- one instrument ---------- */
  if (single) {
    const i = single.inst, f = p.figuresOf(i.id), st = rows[0].st;
    const months = grid.last - single.incIdx + 1;
    const per: [string, Stats | null | undefined, 'cum' | 'ann'][] = [
      ['YTD', f?.ytd, 'cum'], ['1 year', f?.y1, 'cum'], ['3 years p.a.', f?.y3, 'ann'], ['5 years p.a.', f?.y5, 'ann'], ['Since inception p.a.', f?.itd, 'ann'],
    ];
    const yr = yearReturns(single, grid, single.incIdx, grid.last);
    const years = Object.keys(yr).map(Number).sort((x, y) => y - x).slice(0, 10);
    return (
      <aside className="ux-panel ux-card" aria-label={`Details for ${label(i)}`}>
        <div className="dc-hd">
          <h2>
            <span style={{ minWidth: 0 }}>{label(i)}<small>{i.alias ? `Source: ${i.name} · ` : ''}{i.code}</small></span>
          </h2>
          <button type="button" className="ib" aria-label="Close details" title="Close" onClick={p.onClear}><Icon.close /></button>
        </div>
        <UTabs ariaLabel="Details" value={tab} onChange={setTab} items={[{ key: 'overview', label: 'Overview' }, { key: 'perf', label: 'Performance' }, { key: 'cal', label: 'Calendar years' }]} />
        {tab === 'overview' && <>
          <div className="dc-kpis">
            <KpiCell label="Currency" value={<><Flag ccy={i.currency} />{i.currency}</>} sub={CURRENCY_NAMES[i.currency] ?? i.currency} />
            <KpiCell label="YTD" value={f?.ytd ? kv(f.ytd.cum) : KPI_MISSING} sub={`since ${monthEnd(grid.key(grid.idx(grid.key(grid.last).slice(0, 4) + '-01') - 1))}`} />
            <KpiCell label="1 year" value={f?.y1 ? kv(f.y1.cum) : KPI_MISSING} sub={f?.y1?.bcum != null ? `Benchmark ${kv(f.y1.bcum)}` : '12 months'} />
            <KpiCell label="3 years p.a." value={f?.y3 ? kv(f.y3.ann) : KPI_MISSING} sub={f?.y3 ? `Vol. ${kv(f.y3.vol, 2, false)}` : 'not enough history'} />
          </div>
          {chart}
          <dl className="dc-kv">
            <dt>Category</dt><dd>{CATEGORY_SINGULAR[i.category]}<SourceTag source={i.source} /></dd>
            <dt>ID</dt><dd><button type="button" className="lnk num" data-tip="Copy ID" onClick={() => p.onCopyId(i.code)}>{i.code}</button></dd>
            <dt>Risk profile</dt><dd>{i.riskProfile ? <><RiskDots risk={i.riskProfile} />{i.riskProfile}</> : KPI_MISSING}</dd>
            {(() => {
              const b = p.benchOf(i.id);
              return <>
                <dt>Benchmark</dt>
                <dd style={{ flexWrap: 'wrap' }}>
                  <span>{b?.name ?? KPI_MISSING}{b?.warning && <> <StatusIcon kind="warn" message={b.warning} /></>}</span>
                  {p.onChangeBenchmark && <button type="button" className="lnk" onClick={ev => p.onChangeBenchmark!(i.id, ev.currentTarget)}>Change…</button>}
                  {b && <span className="dim" style={{ fontWeight: 500, fontSize: 12, flexBasis: '100%' }}>{b.sourceText}</span>}
                </dd>
              </>;
            })()}
            {i.source !== 'api' && <><dt>Construction</dt><dd>{i.benchmarkName ?? KPI_MISSING}</dd></>}
            <dt>Inception</dt><dd className="num">{monthLabel(i.inception)}</dd>
            <dt>Track record</dt>
            <dd className="num">{months} months{months < 36 && <StatusIcon kind="warn" message={`Short track record: ${months} months`} />}</dd>
            <dt>Max drawdown</dt><dd className="num">{st ? kv(st.mdd) : KPI_MISSING}<span className="dim" style={{ fontWeight: 500 }}>in period</span></dd>
            <dt>Return / risk</dt><dd className="num">{st?.rr != null ? num(st.rr) : KPI_MISSING}</dd>
            {(i.tags.length > 0 || p.onEditTags) && <><dt>Tags</dt><dd style={{ flexWrap: 'wrap' }}>
              {i.tags.map(t => <span key={t} className="tg-pill">{p.tags.find(y => y.id === t)?.name ?? t}</span>)}
              {!i.tags.length && <span className="dim" style={{ fontWeight: 500 }}>None</span>}
              {p.onEditTags && <button type="button" className="lnk" onClick={ev => p.onEditTags!(i.id, ev.currentTarget)}>Edit…</button>}
            </dd></>}
            <dt>Source</dt><dd>{SOURCE_LABEL[i.source]}{i.carriedForwardMonths ? <StatusIcon kind="warn" message={`${i.carriedForwardMonths} missing months carried forward`} /> : null}</dd>
            <dt>Data as of</dt><dd className="num">{monthEnd(grid.key(grid.last))}</dd>
          </dl>
        </>}
        {tab === 'perf' && <>
          <table className="g dc-tbl">
            <thead><tr><th className="l">Period</th><th>Instrument</th><th>Benchmark</th><th>Excess</th></tr></thead>
            <tbody>{per.map(([l, x, k]) => {
              const v = x ? x[k] : null, b = x ? (k === 'ann' ? x.bann : x.bcum) : null;
              return <tr key={l}><td className="l">{l}</td><td className="num">{g2(v)}</td><td className="num">{g2(b)}</td><td className="num">{v != null && b != null ? g2(v - b) : CELL_MISSING}</td></tr>;
            })}</tbody>
          </table>
          <div className="dc-sec"><h3>Risk · {periodLine}</h3></div>
          <dl className="dc-kv">
            <dt>Volatility p.a.</dt><dd className="num">{st ? kv(st.vol, 2, false) : KPI_MISSING}</dd>
            <dt>Max drawdown</dt><dd className="num">{st ? kv(st.mdd) : KPI_MISSING}</dd>
            <dt>Tracking error</dt><dd className="num">{st ? kv(st.te, 2, false) : KPI_MISSING}</dd>
            <dt>Information ratio</dt><dd className="num">{st?.ir != null ? num(st.ir) : KPI_MISSING}</dd>
            <dt>Best / worst month</dt><dd className="num">{st ? `${kv(st.best)} / ${kv(st.worst)}` : KPI_MISSING}</dd>
            <dt>Positive months</dt><dd className="num">{st ? kv(st.pos, 0, false) : KPI_MISSING}</dd>
          </dl>
          <div className="note">Returns in %. Annualised for periods of 12 months or more.</div>
        </>}
        {tab === 'cal' && <>
          <table className="g dc-tbl">
            <thead><tr><th className="l">Year</th><th>Instrument</th><th>Benchmark</th><th>Excess</th></tr></thead>
            <tbody>{years.map(y => (
              <tr key={y}><td className="l num">{y}{yr[y].partial ? ' *' : ''}</td><td className="num">{g2(yr[y].v)}</td><td className="num">{g2(yr[y].bv)}</td><td className="num">{yr[y].bv != null ? g2(yr[y].v - yr[y].bv!) : CELL_MISSING}</td></tr>
            ))}</tbody>
          </table>
          <div className="note">Returns in %. * partial year.</div>
        </>}
        {actions}
      </aside>
    );
  }

  /* ---------- several instruments ---------- */
  const ok = rows.filter((x): x is { r: TrackRecord; st: Stats } => !!x.st);
  const best = ok.length ? ok.reduce((b, x) => (x.st.cum > b.st.cum ? x : b)) : null;
  const worst = ok.length ? ok.reduce((b, x) => (x.st.cum < b.st.cum ? x : b)) : null;
  const vols = ok.map(x => x.st.vol).filter((v): v is number => v != null);
  let years: number[] = [];
  for (let k = a; k <= e; k++) { const y = Number(grid.key(k).slice(0, 4)); if (!years.includes(y)) years.push(y); }
  years = years.slice(-5);

  return (
    <aside className="ux-panel ux-card" aria-label="Selection details">
      <div className="dc-hd">
        <h2><span>{records.length} instruments<small>Selection · {records.length} of {p.limit}</small></span></h2>
        <button type="button" className="ib" aria-label="Clear selection" title="Clear selection" onClick={p.onClear}><Icon.close /></button>
      </div>
      <UTabs ariaLabel="Details" value={tab} onChange={setTab} items={[{ key: 'overview', label: 'Overview' }, { key: 'perf', label: 'Risk & return' }, { key: 'cal', label: 'Calendar years' }]} />
      {tab === 'overview' && <>
        <div className="dc-kpis">
          <KpiCell label="Selected" value={`${records.length} / ${p.limit}`} sub="instruments" />
          <KpiCell label="Best" value={best ? kv(best.st.cum) : KPI_MISSING} sub={best ? label(best.r.inst) : ''} />
          <KpiCell label="Worst" value={worst ? kv(worst.st.cum) : KPI_MISSING} sub={worst ? label(worst.r.inst) : ''} />
          <KpiCell label="Avg. volatility" value={vols.length ? kv(mean(vols), 2, false) : KPI_MISSING} sub="annualised" />
        </div>
        <div className="dc-legend">
          {records.map(r => <Chip key={r.inst.id} color={p.colorOf(r.inst.id)} removeLabel={label(r.inst)} onRemove={() => p.onRemove(r.inst.id)}>{label(r.inst)}</Chip>)}
        </div>
        {chart}
        <table className="g dc-tbl">
          <thead><tr><th className="l">Instrument</th><th>Perf.</th><th>Vol.</th><th>Max DD</th></tr></thead>
          <tbody>{rows.map(({ r, st }) => (
            <tr key={r.inst.id}>
              <td className="l" style={{ whiteSpace: 'normal' }}>{sw(p.colorOf(r.inst.id))}<b>{label(r.inst)}</b>
                <small className="bm-sub" data-tip={p.benchOf(r.inst.id)?.sourceText}>vs {p.benchOf(r.inst.id)?.name ?? '–'}</small></td>
              {st ? <>
                <td className="num">{g2(st.cum)}{st.partial && <> <StatusIcon kind="warn" message={`Launched ${monthLabel(r.inst.inception)}, after the period start`} /></>}</td>
                <td className="num">{a2(st.vol, 1)}</td><td className="num">{g2(st.mdd, 1)}</td>
              </> : <td colSpan={3} className="num dim">No data in this period</td>}
            </tr>
          ))}</tbody>
        </table>
      </>}
      {tab === 'perf' && <>
        <div className="dc-sec"><h3>{periodLine}</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="g dc-tbl">
            <thead><tr><th className="l">Instrument</th><th>Ann.</th><th>Vol.</th><th>Ret/Risk</th><th>Max DD</th><th>Excess</th><th>TE</th></tr></thead>
            <tbody>{rows.map(({ r, st }) => (
              <tr key={r.inst.id}>
                <td className="l" style={{ whiteSpace: 'normal' }}>{sw(p.colorOf(r.inst.id))}<b>{label(r.inst)}</b>
                  <small className="bm-sub" data-tip={p.benchOf(r.inst.id)?.sourceText}>vs {p.benchOf(r.inst.id)?.name ?? '–'}</small></td>
                {st ? <>
                  <td className="num">{g2(st.ann ?? st.cum)}</td><td className="num">{a2(st.vol)}</td><td className="num">{st.rr != null ? num(st.rr) : CELL_MISSING}</td>
                  <td className="num">{g2(st.mdd)}</td><td className="num">{g2(st.excess)}</td><td className="num">{a2(st.te)}</td>
                </> : <td colSpan={6} className="num dim">No data in this period</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="note">Returns in %. Ann. shows the cumulative return for periods under 12 months.</div>
      </>}
      {tab === 'cal' && <>
        <div style={{ overflowX: 'auto' }}>
          <table className="g dc-tbl">
            <thead><tr><th className="l">Instrument</th>{years.map(y => <th key={y}>{y}</th>)}</tr></thead>
            <tbody>{records.map(r => {
              const yr = yearReturns(r, grid, a, e);
              return <tr key={r.inst.id}><td className="l" style={{ whiteSpace: 'normal' }}>{sw(p.colorOf(r.inst.id))}<b>{label(r.inst)}</b></td>{years.map(y => <td key={y} className="num">{yr[y] ? g2(yr[y].v, 1) + (yr[y].partial ? '*' : '') : CELL_MISSING}</td>)}</tr>;
            })}</tbody>
          </table>
        </div>
        <div className="note">Returns in %, within the selected period. * partial year.</div>
      </>}
      {actions}
    </aside>
  );
}
