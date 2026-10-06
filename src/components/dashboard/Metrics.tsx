/* Metrics & statistics tabs. Presentational: rows, period and stats come from useDashboard. */
import type { CSSProperties } from 'react';
import type { Frequency } from '../../types';
import type { AlignedRow, RowStats } from '../../lib/series';
import { annualise, baseDate, compoundBetween, correlation, daysBetween, rankPaths, windowStart, yearReturns } from '../../lib/series';
import { CELL_MISSING, a2, g2, num } from '../../lib/format';
import type { DashOptions } from '../../hooks/useDashboard';
import { Tabs } from '../Tabs';
import { ModeTabs } from '../ModeTabs';
import { StatusIcon } from '../StatusIcon';
import { DateChart } from './DateChart';
import { ScatterChart } from './ScatterChart';

interface Props {
  dates: string[];
  /** Rows for return tabs (relative when the panel is switched to Relative). */
  rows: AlignedRow[];
  /** Absolute rows: Risk metrics, Risk / return and Correlation always use these. */
  absRows: AlignedRow[];
  relative: boolean;
  onRelative: (v: boolean) => void;
  /** Instruments left out in relative mode (no benchmark). */
  noBench: number;
  a: number;
  e: number;
  asOf: string;
  frequency: Frequency;
  stats: Map<string, RowStats | null>;
  statsIn: (w: DashOptions['riskWindow']) => Map<string, RowStats | null>;
  tab: DashOptions['tab'];
  onTab: (t: DashOptions['tab']) => void;
  riskWindow: DashOptions['riskWindow'];
  onRiskWindow: (w: DashOptions['riskWindow']) => void;
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
  benchName: (id: string) => string;
  hidden: string[];
}

const TABS: { key: DashOptions['tab']; label: string }[] = [
  { key: 'calendar', label: 'Calendar years' }, { key: 'cumulative', label: 'Cumulative returns' }, { key: 'annualised', label: 'Annualised returns' },
  { key: 'risk', label: 'Risk metrics' }, { key: 'ranking', label: 'Ranking' }, { key: 'peers', label: 'Peer group' },
  { key: 'scatter', label: 'Risk / return' }, { key: 'correlation', label: 'Correlation' },
];
const CUM_WINDOWS = ['MTD', 'QTD', 'YTD', '1M', '3M', '6M', '1Y', '2Y', '3Y', '5Y', '10Y'] as const;
const ANN_WINDOWS = ['1Y', '3Y', '5Y', '10Y'] as const;

/** Instrument name with its benchmark underneath, so every figure says what it is compared with. */
const Name = ({ id, p }: { id: string; p: Props }) => (
  <td className="l" style={{ whiteSpace: 'normal', minWidth: 180 }}>
    <span className="sw" style={{ '--c': p.colorOf(id) } as CSSProperties} /><b>{p.nameOf(id)}</b>
    <small className="bm-sub">vs {p.benchName(id)}</small>
  </td>
);

export function Metrics(p: Props) {
  const { dates, rows, a, e, asOf, frequency: f } = p;
  const last = dates.length - 1;
  const windowRadio = (
    <div className="dash-radio" role="radiogroup" aria-label="Window">
      {([['period', 'Selected period'], ['3Y', '3 years'], ['5Y', '5 years']] as const).map(([k, l]) => (
        <label key={k} className="cbx"><input type="radio" name="riskWindow" checked={p.riskWindow === k} onChange={() => p.onRiskWindow(k)} />{l}</label>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (p.tab === 'calendar') {
    const years = [...new Set(dates.slice(a, e + 1).map(d => Number(d.slice(0, 4))))];
    body = (
      <table className="g mtab"><thead><tr><th className="l">Instrument</th>{years.map(y => <th key={y}>{y}</th>)}</tr></thead>
        <tbody>{rows.map(r => { const yr = yearReturns(r, dates, a, e); return (
          <tr key={r.id}><Name id={r.id} p={p} />{years.map(y => { const v = yr.get(y); return <td key={y} className="num">{v ? g2(v.v) + (v.partial ? '*' : '') : CELL_MISSING}</td>; })}</tr>
        ); })}</tbody></table>
    );
  } else if (p.tab === 'cumulative' || p.tab === 'annualised') {
    const cols = p.tab === 'cumulative' ? [...CUM_WINDOWS, 'SI'] : [...ANN_WINDOWS, 'SI'];
    const value = (r: AlignedRow, w: string): number | null => {
      if (r.end !== last && w !== 'SI') return null;
      const ws = w === 'SI' ? r.start : windowStart(dates, asOf, w as typeof CUM_WINDOWS[number]);
      if (ws < r.start) return null; // full window only
      const c = compoundBetween(r, ws, r.end);
      if (c == null || p.tab === 'cumulative') return c;
      return annualise(c, daysBetween(baseDate(dates, ws, f), dates[r.end]));
    };
    body = (
      <table className="g mtab"><thead><tr><th className="l">Instrument</th>{cols.map(c => <th key={c}>{c === 'SI' ? 'Since incep.' : c}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><Name id={r.id} p={p} />{cols.map(c => <td key={c} className="num">{g2(value(r, c))}</td>)}</tr>)}</tbody></table>
    );
  } else if (p.tab === 'risk') {
    const rows = p.absRows;
    const st = p.statsIn(p.riskWindow);
    body = <>
      {windowRadio}
      <table className="g mtab"><thead><tr><th className="l">Instrument</th><th>Sharpe</th><th>Vol.</th><th>Max DD</th><th>Excess p.a.</th><th>TE</th><th>IR</th><th>Beta</th><th>Up capture</th><th>Down capture</th></tr></thead>
        <tbody>{rows.map(r => { const x = st.get(r.id); return (
          <tr key={r.id}><Name id={r.id} p={p} />
            {x ? <>
              <td className="num">{x.sharpe == null ? CELL_MISSING : num(x.sharpe)}</td><td className="num">{a2(x.vol)}</td><td className="num">{g2(x.mdd)}</td>
              <td className="num">{g2(x.excessPa)}</td><td className="num">{a2(x.te)}</td><td className="num">{x.ir == null ? CELL_MISSING : num(x.ir)}</td>
              <td className="num">{x.beta == null ? CELL_MISSING : num(x.beta)}</td><td className="num">{a2(x.upCapture)}</td><td className="num">{a2(x.downCapture)}</td>
            </> : <td colSpan={9} className="num dim">No data in this window</td>}
          </tr>
        ); })}</tbody></table>
    </>;
  } else if (p.tab === 'ranking') {
    const list = rows.map(r => ({ r, st: p.stats.get(r.id) })).filter((x): x is { r: AlignedRow; st: RowStats } => !!x.st).sort((x, y) => y.st.cum - x.st.cum);
    const n = list.length;
    body = (
      <table className="g mtab" style={{ maxWidth: 640 }}><thead><tr><th className="c">Rank</th><th className="l">Instrument</th><th className="c">Quartile</th><th>Return</th></tr></thead>
        <tbody>{list.map(({ r, st }, k) => { const q = Math.min(4, Math.floor((k / n) * 4) + 1); return (
          <tr key={r.id}><td className="c num">{k + 1}</td><Name id={r.id} p={p} /><td className={`c q${q}`}>Q{q}</td>
            <td className="num">{g2(st.cum)}{st.partial && <> <StatusIcon kind="warn" message="Starts after the period start" /></>}</td></tr>
        ); })}</tbody></table>
    );
  } else if (p.tab === 'peers') {
    const shown = rows.filter(r => !p.hidden.includes(r.id));
    const ranks = rankPaths(rows, a, e), n = rows.length;
    const q = (k: number) => 1 + (n - 1) * k / 4;
    body = (
      <DateChart dates={dates.slice(Math.max(0, a - 1), e + 1)} height={340} invert domain={[1, Math.max(2, n)]} format={v => String(Math.round(v))}
        ariaLabel="Rank over time within the selection"
        bands={n >= 4 ? [{ from: 1, to: q(1), color: 'rgba(79,209,197,.10)' }, { from: q(3), to: n, color: 'rgba(239,75,85,.10)' }] : undefined}
        series={shown.map(r => ({ id: r.id, name: p.nameOf(r.id), color: p.colorOf(r.id), v: ranks[rows.indexOf(r)].slice(a > 0 ? 0 : 1) }))} />
    );
  } else if (p.tab === 'scatter') {
    const rows = p.absRows;
    const st = p.statsIn(p.riskWindow);
    const pts = rows.filter(r => !p.hidden.includes(r.id)).map(r => ({ r, x: st.get(r.id) })).filter(v => v.x && v.x.vol != null)
      .map(({ r, x }) => ({ id: r.id, name: p.nameOf(r.id), color: p.colorOf(r.id), x: x!.vol!, y: x!.ann ?? x!.cum }));
    const annual = rows.some(r => st.get(r.id)?.ann != null);
    body = <>{windowRadio}<ScatterChart points={pts} height={380} yLabel={annual ? 'Return p.a. (%)' : 'Return (%)'} /></>;
  } else {
    const rows = p.absRows;
    body = (
      <div style={{ overflowX: 'auto' }}>
        <table className="g heat"><thead><tr><th className="l" />{rows.map(r => <th key={r.id} title={p.nameOf(r.id)}><span className="sw" style={{ '--c': p.colorOf(r.id) } as CSSProperties} />{p.nameOf(r.id)}</th>)}</tr></thead>
          <tbody>{rows.map(x => (
            <tr key={x.id}><Name id={x.id} p={p} />{rows.map(y => {
              const c = x.id === y.id ? 1 : correlation(x, y, a, e);
              const al = c == null ? 0 : Math.max(0, c) * 0.8;
              return <td key={y.id} className="num" style={{ background: `rgba(79,200,240,${al.toFixed(2)})`, color: al > 0.45 ? 'var(--badge-ink)' : undefined }}>{c == null ? CELL_MISSING : num(c)}</td>;
            })}</tr>
          ))}</tbody></table>
      </div>
    );
  }

  return (
    <section className="ux-panel dash-sec" aria-label="Metrics and statistics">
      <div className="phd"><h2>Metrics &amp; statistics</h2><span className="sub">
        {(() => {
          const absOnly = p.tab === 'risk' || p.tab === 'scatter' || p.tab === 'correlation';
          const base = p.tab === 'correlation' ? 'Correlation of returns in the period' : p.tab === 'peers' ? 'Rank within the selection (1 = best since the period start)' : p.tab === 'cumulative' || p.tab === 'annualised' ? `Returns in %, to ${asOf.split('-').reverse().join('.')}` : 'Returns and risk in %';
          return p.relative && !absOnly ? `${base} · relative to each benchmark${p.noBench ? ` · ${p.noBench} without a benchmark not shown` : ''}` : base;
        })()}
      </span>
        {!(p.tab === 'risk' || p.tab === 'scatter' || p.tab === 'correlation') && (
          <span className="rt"><ModeTabs relative={p.relative} onChange={p.onRelative} /></span>
        )}
      </div>
      <div className="dash-tabs"><Tabs ariaLabel="Metrics" value={p.tab} onChange={p.onTab} items={TABS} /></div>
      <div className="dash-body">{body}</div>
      {p.tab === 'calendar' && <div className="note">* partial year</div>}
    </section>
  );
}
