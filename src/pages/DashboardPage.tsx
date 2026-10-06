/* Dashboard (/dashboard, Advanced): compare any number of securities at daily, weekly or monthly frequency. */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudio } from '../state/studio';
import { useDashboard } from '../hooks/useDashboard';
import type { DashOptions } from '../hooks/useDashboard';
import type { ReportSeed } from '../hooks/useReportBuilder';
import type { Frequency } from '../types';
import { baseDate, drawdowns, firstIdx, growth, lastIdx, rollingReturns } from '../lib/series';
import type { AlignedRow } from '../lib/series';
import { CURRENCIES, label } from '../lib/domain';
import { KPI_MISSING, kv, num } from '../lib/format';
import { USE_MOCK } from '../api';
import { ErrorBanner } from '../components/ErrorBanner';
import { Icon } from '../components/Icons';
import { Tabs } from '../components/Tabs';
import { Switch } from '../components/Switch';
import { ModeTabs } from '../components/ModeTabs';
import { InstrumentPicker } from '../components/InstrumentPicker';
import { PeriodPicker } from '../components/PeriodPicker';
import type { PickPeriod } from '../lib/period';
import { DateChart } from '../components/dashboard/DateChart';
import { Metrics } from '../components/dashboard/Metrics';

const FREQS: { key: Frequency; label: string }[] = [{ key: 'D', label: 'Daily' }, { key: 'W', label: 'Weekly' }, { key: 'M', label: 'Monthly' }];
/** Rolling windows in periods per frequency. */
const ROLL: Record<DashOptions['rolling'], Record<Frequency, number>> = {
  '1M': { D: 21, W: 4, M: 1 }, '3M': { D: 63, W: 13, M: 3 }, '6M': { D: 126, W: 26, M: 6 }, '1Y': { D: 252, W: 52, M: 12 },
};
/** 20 series colours (tokens --s1..--s20), repeating beyond. */
const colorAt = (k: number) => `var(--s${(k % 20) + 1})`;
const pct1 = (v: number) => `${num(v, Math.abs(v) < 10 ? 1 : 0)}%`;
const ddmmyyyy = (d: string) => d.split('-').reverse().join('.');

export function DashboardPage() {
  const s = useStudio();
  const d = useDashboard();
  const navigate = useNavigate();
  const cat = s.catalogue;
  const { o, set } = d;
  const [pick, setPick] = useState<HTMLElement | null>(null);

  const colorOf = useMemo(() => { const m = new Map(d.ids.map((id, k) => [id, colorAt(k)])); return (id: string) => m.get(id) ?? 'var(--muted)'; }, [d.ids]);
  const nameOf = (id: string) => { const i = s.instrumentOf(id); return i ? label(i) : id; };
  const benchName = (id: string) => d.benchOf.get(id)?.name ?? 'no benchmark';

  const data = d.data, per = d.period;
  // Each element can switch to Relative; then instruments without a benchmark are left out.
  const R = o.relative;
  const rowsFor = (rel: boolean) => (rel ? d.relRows : data?.rows ?? []).filter(r => !o.hidden.includes(r.id));
  const noBench = data ? data.rows.length - d.relRows.length : 0;
  const relSwitch = (k: keyof typeof R) => <span className="rt"><ModeTabs relative={R[k]} onChange={v => d.setRelative(k, v)} /></span>;
  const relNote = (on: boolean) => (on && noBench ? ` · ${noBench} without a benchmark not shown` : '');
  // Charts plot from the period base (one point before the first included date) when it exists.
  const axis = data && per ? data.dates.slice(Math.max(0, per.a - 1), per.e + 1) : [];
  const trim = (v: (number | null)[]) => (per && per.a > 0 ? v : v.slice(1));
  /** The benchmark as a row starting with its instrument, so both grow from the same base. */
  const benchRow = (r: AlignedRow): AlignedRow | null => (r.bm ? { ...r, ret: r.bm, start: Math.max(r.start, firstIdx(r.bm)), end: Math.min(r.end, lastIdx(r.bm)) } : null);

  /** Open Reports with this scope: securities, currency and the same period. */
  const createReport = () => {
    const report: ReportSeed = { ids: d.ids, currency: o.currency, period: { period: o.period as PickPeriod, custom: o.custom } };
    navigate('/reports', { state: { report } });
  };

  const card = (title: string, c: { top: { id: string; v: number }; worst: { id: string; v: number } } | null, fmt: (v: number) => string, topLabel = 'Top') => (
    <div className="bw-card">
      <small>{title}</small>
      {c ? <>
        <div className="bw-row"><span className="up" aria-hidden="true">▲</span><span className="k">{topLabel}</span><span className="nm" title={nameOf(c.top.id)}>{nameOf(c.top.id)}</span><b className="num">{fmt(c.top.v)}</b></div>
        <div className="bw-row"><span className="dn" aria-hidden="true">▼</span><span className="k">Worst</span><span className="nm" title={nameOf(c.worst.id)}>{nameOf(c.worst.id)}</span><b className="num">{fmt(c.worst.v)}</b></div>
      </> : <div className="bw-row"><span className="dim">{KPI_MISSING}</span></div>}
    </div>
  );

  return (
    <section className="page">
      <ErrorBanner error={d.error} onDismiss={d.clearError} />
      {/* ---------- header: instruments · period · currency · frequency · options · Select securities ---------- */}
      <div className="dash-hd">
        <div className="fld dh-n">
          <span className="lb">Instruments</span>
          <b className="num">{d.ids.length}</b>
        </div>
        <PeriodPicker value={o.period as PickPeriod} custom={o.custom} onChange={p => set({ ...(p.period ? { period: p.period } : {}), ...(p.custom ? { custom: p.custom } : {}) })}
          label={per && data ? `${ddmmyyyy(baseDate(data.dates, per.a, o.frequency))} → ${ddmmyyyy(data.dates[per.e])}` : 'Period'} />
        <div className="fld">
          <label htmlFor="dCcy">Currency</label>
          <select id="dCcy" className="sel" value={o.currency} onChange={ev => set({ currency: ev.target.value })}
            data-tip={o.currency && USE_MOCK ? 'Sample data is not converted; the server will convert.' : undefined}>
            <option value="">Own currency</option>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="fld">
          <span className="lb">Frequency</span>
          <Tabs ariaLabel="Frequency" value={o.frequency} onChange={v => set({ frequency: v })} items={FREQS} />
        </div>
        <div className="dh-sws">
          <span data-tip={`Sharpe uses ${o.currency || "each currency's"} short rate${USE_MOCK ? ' (sample: constant)' : ''}`}>
            <Switch checked={o.riskFree} onChange={v => set({ riskFree: v })} label="Risk-free rate" />
          </span>
          <span data-tip="Start when every security has data, end at the earliest last date">
            <Switch checked={o.commonPeriod} onChange={v => set({ commonPeriod: v })} label="Common period" />
          </span>
        </div>
        <span className="dh-acts">
          {s.can('reports.view') && (
            <button type="button" className="btn sec" disabled={!d.ids.length} onClick={createReport}
              data-tip={d.ids.length ? `Report on these ${d.ids.length} securities, same currency and period` : 'Select securities first'}><Icon.rep />Create report</button>
          )}
          <button type="button" className="btn dh-go" aria-haspopup="dialog" onClick={ev => setPick(ev.currentTarget)}><Icon.search16 />Select securities</button>
        </span>
      </div>

      {d.ids.length > 0 && (
        <div className="chiprow dash-chips">
          {d.ids.map(id => {
            const off = o.hidden.includes(id);
            return (
              <span key={id} className={`dchip${off ? ' off' : ''}`} style={{ '--c': colorOf(id) } as CSSProperties}>
                <button type="button" className="t" aria-pressed={!off} data-tip={`vs ${benchName(id)} · click to ${off ? 'show in' : 'hide from'} charts`} onClick={() => d.toggleHidden(id)}>{nameOf(id)}</button>
                <button type="button" className="x" aria-label={`Remove ${nameOf(id)}`} title="Remove" onClick={() => d.setIds(d.ids.filter(x => x !== id))}>×</button>
              </span>
            );
          })}
          <button type="button" className="lnk" onClick={() => d.setIds([], null)}>Clear</button>
        </div>
      )}

      <div className="ux dash">
        {/* ---------- results ---------- */}
        <div className="dash-main">
          {!d.ids.length ? (
            <div className="ux-panel cs-empty">
              <span>Pick securities to compare with <b>Select securities</b> (search instruments or load a folder), or use <b>Open in dashboard</b> in the Explorer.</span>
              <button type="button" className="btn" onClick={() => navigate('/explorer')}>Go to the Explorer</button>
            </div>
          ) : <>
            {d.loading && !data ? <div className="ux-panel"><div className="loading">Loading {FREQS.find(f => f.key === o.frequency)!.label.toLowerCase()} returns…</div></div>
              : data && per && <>
                <div className="bw-cards">
                  {card('Performance', d.cards.performance, v => kv(v))}
                  {card('Volatility', d.cards.volatility, v => kv(v, 2, false), 'Lowest')}
                  {card('Sharpe ratio', d.cards.sharpe, v => num(v))}
                  {card('Max drawdown', d.cards.drawdown, v => kv(v), 'Least')}
                </div>

                <section className="ux-panel dash-sec" aria-label="Performance chart">
                  <div className="phd"><h2>Performance</h2>
                    <Tabs ariaLabel="Chart" value={o.chart} onChange={v => set({ chart: v })} items={[{ key: 'cum', label: 'Cumulative' }, { key: 'idx', label: 'Normalized' }]} />
                    <span className="sub">{R.perf
                      ? (o.chart === 'cum' ? 'Excess return vs benchmark, in %' : 'Instrument / benchmark, rebased to 100') + relNote(true)
                      : (o.chart === 'cum' ? 'Cumulative return in %' : 'Rebased to 100') + (o.showBench ? ' · dashed: benchmark' : '')}{d.loading ? ' · updating…' : ''}</span>
                    <span className="rt dash-sws">
                      {!R.perf && <Switch checked={o.showBench} onChange={v => set({ showBench: v })} label="Benchmarks" />}
                      <ModeTabs relative={R.perf} onChange={v => d.setRelative('perf', v)} />
                    </span>
                  </div>
                  <DateChart dates={axis} height={340} format={o.chart === 'cum' ? pct1 : v => num(v, 1)} zeroLine={o.chart === 'cum'} ariaLabel={R.perf ? 'Relative performance' : 'Performance'}
                    series={rowsFor(R.perf).flatMap(r => {
                      const main = { id: r.id, name: nameOf(r.id), color: colorOf(r.id), v: trim(growth(r, per.a, per.e, o.chart)) };
                      const b = o.showBench && !R.perf ? benchRow(r) : null;
                      return b ? [main, { id: r.id + ':bm', name: `↳ ${benchName(r.id)}`, color: colorOf(r.id), dash: true, v: trim(growth(b, per.a, per.e, o.chart)) }] : [main];
                    })} />
                </section>

                <Metrics dates={data.dates} rows={R.metrics ? d.relRows : data.rows} absRows={data.rows} relative={R.metrics} onRelative={v => d.setRelative('metrics', v)} noBench={noBench} a={per.a} e={per.e} asOf={per.asOf} frequency={o.frequency} stats={R.metrics ? d.relStats : d.stats} statsIn={d.statsIn}
                  tab={o.tab} onTab={t => set({ tab: t })} riskWindow={o.riskWindow} onRiskWindow={w => set({ riskWindow: w })}
                  nameOf={nameOf} colorOf={colorOf} benchName={benchName} hidden={o.hidden} />

                <section className="ux-panel dash-sec" aria-label="Rolling performance">
                  <div className="phd"><h2>Rolling performance</h2>
                    <Tabs ariaLabel="Window" value={o.rolling} onChange={v => set({ rolling: v })} items={(['1M', '3M', '6M', '1Y'] as const).map(k => ({ key: k, label: k }))} />
                    <span className="sub">{R.rolling ? 'Relative return' : 'Return'} over the trailing {o.rolling}, in %{relNote(R.rolling)}</span>
                    {relSwitch('rolling')}
                  </div>
                  {(() => {
                    const w = ROLL[o.rolling][o.frequency];
                    const series = rowsFor(R.rolling).map(r => ({ id: r.id, name: nameOf(r.id), color: colorOf(r.id), v: trim(rollingReturns(r, per.a, per.e, w)) }));
                    return series.some(x => x.v.some(v => v != null))
                      ? <DateChart dates={axis} height={260} format={pct1} zeroLine ariaLabel={`Rolling ${o.rolling} return`} series={series} />
                      : <div className="empty">Not enough data for a rolling {o.rolling} return in this period.</div>;
                  })()}
                </section>

                <section className="ux-panel dash-sec" aria-label="Drawdown">
                  <div className="phd"><h2>{R.drawdown ? 'Relative drawdown' : 'Drawdown'}</h2>
                    <span className="sub">{R.drawdown ? 'Of instrument / benchmark from its running peak, in %' : 'From the running peak, in %'}{relNote(R.drawdown)}</span>
                    {relSwitch('drawdown')}
                  </div>
                  <DateChart dates={axis} height={240} area format={pct1} ariaLabel="Drawdown"
                    series={rowsFor(R.drawdown).map(r => ({ id: r.id, name: nameOf(r.id), color: colorOf(r.id), v: trim(drawdowns(r, per.a, per.e)) }))} />
                </section>
              </>}
          </>}
        </div>
      </div>

      {pick && (
        <InstrumentPicker anchor={{ el: pick }} title="Securities to compare" instruments={[...cat.instruments, ...s.imports.map(x => x.inst)]} taken={d.ids} onImport={s.can('import.excel') ? () => navigate('/upload') : undefined}
          onClose={() => setPick(null)} onAdd={ids => d.setIds([...d.ids, ...ids])}
          header={
            <select className="sel" aria-label="Load a folder" value="" onChange={ev => {
              const n = d.fo.nodes.find(x => x.id === ev.target.value); if (!n) return;
              d.setIds([...n.ids], n.virtual ? null : n.id); setPick(null);
            }}>
              <option value="">Load a folder (replaces the selection)…</option>
              {d.fo.nodes.filter(n => n.ids.size).map(n => <option key={n.id} value={n.id}>{n.parentId ? '\u00a0\u00a0› ' : ''}{n.name} ({n.ids.size})</option>)}
            </select>
          } />
      )}
    </section>
  );
}
