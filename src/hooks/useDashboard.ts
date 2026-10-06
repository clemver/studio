/* Dashboard: parameters, data at the chosen frequency (instruments, their benchmarks, risk-free), aligned rows and stats. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { DatedSeries, Frequency } from '../types';
import { useStudio } from '../state/studio';
import { useSticky } from './useSticky';
import { useFolders } from './useFolders';
import { useBenchmarks } from './useBenchmarks';
import type { ApiFailure } from './useCatalogue';
import { toFailure } from './useCatalogue';
import type { AlignedRow, DashPeriod, RowStats } from '../lib/series';
import { seriesFromPrices } from '../lib/sheetImport';
import { alignTo, firstIdx, indexAfter, lastIdx, relativeRow, rowStats, unionDates, windowStart } from '../lib/series';

export interface DashOptions {
  frequency: Frequency;
  period: DashPeriod;
  custom: { from: string; to: string };
  /** '' = each instrument's own currency. */
  currency: string;
  riskFree: boolean;
  commonPeriod: boolean;
  chart: 'cum' | 'idx';
  /** Draw each instrument's benchmark (dashed) in the performance chart. */
  showBench: boolean;
  /** Per element: show returns relative to each benchmark (where one exists). */
  relative: { perf: boolean; metrics: boolean; rolling: boolean; drawdown: boolean };
  tab: 'calendar' | 'cumulative' | 'annualised' | 'risk' | 'ranking' | 'peers' | 'scatter' | 'correlation';
  /** Window for Risk metrics and Risk / return: the selected period, or the last 3 / 5 years. */
  riskWindow: 'period' | '3Y' | '5Y';
  rolling: '1M' | '3M' | '6M' | '1Y';
  hidden: string[];
}
const DEFAULTS: DashOptions = {
  frequency: 'D', period: 'YTD', custom: { from: '', to: '' }, currency: '', riskFree: true, commonPeriod: false,
  chart: 'cum', showBench: false, relative: { perf: false, metrics: false, rolling: false, drawdown: false }, tab: 'cumulative', riskWindow: 'period', rolling: '1M', hidden: [],
};

const keyOf = (id: string, f: Frequency, ccy: string) => `${id}|${f}|${ccy}`;

export function useDashboard() {
  const s = useStudio();
  const cat = s.catalogue;
  const fo = useFolders(cat.instruments, s.can('custom.view'), s.me?.permissions.join() ?? '', !!s.me && !cat.loading);
  const bm = useBenchmarks(cat, fo);
  const [raw, setO] = useSticky<DashOptions>('dashboard.options', DEFAULTS);
  const o: DashOptions = typeof raw.relative === 'object' && raw.relative ? raw : { ...raw, relative: DEFAULTS.relative };
  const set = (p: Partial<DashOptions>) => setO(x => ({ ...x, ...p }));

  // Session imports (Excel) are computed here from their prices; everything else comes from the API.
  const imported = useMemo(() => new Map(s.imports.map(x => [x.inst.id, x])), [s.imports]);
  const ids = useMemo(() => s.dashboard.ids.filter(id => cat.byId.has(id) || imported.has(id)), [s.dashboard.ids, cat.byId, imported]);
  const folderId = s.dashboard.folderId;
  const resolve = bm.resolve;
  const benchOf = useMemo(() => new Map(ids.map(id => [id, resolve(id, folderId)])), [ids, resolve, folderId]);

  /* ---------- loading ---------- */
  const [cache, setCache] = useState<Map<string, DatedSeries>>(new Map());
  const [rfCache, setRfCache] = useState<Map<string, { dates: string[]; returns: number[] }>>(new Map());
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<ApiFailure | null>(null);
  const ccyOf = (id: string) => o.currency || s.instrumentOf(id)?.currency || 'CHF';

  // Requests in flight are tracked (not cancelled) so a re-render never drops their results.
  const inflight = useRef(new Set<string>());
  useEffect(() => {
    const need = new Set<string>();
    ids.forEach(id => { if (!imported.has(id)) need.add(id); const b = benchOf.get(id)?.id; if (b) need.add(b); });
    const missing = [...need].filter(id => { const k = keyOf(id, o.frequency, o.currency); return !cache.has(k) && !inflight.current.has(k); });
    const rfNeed = [...new Set(ids.map(ccyOf))].filter(c => { const k = `rf|${c}|${o.frequency}`; return !rfCache.has(`${c}|${o.frequency}`) && !inflight.current.has(k); });
    if (!missing.length && !rfNeed.length) return;
    const keys = [...missing.map(id => keyOf(id, o.frequency, o.currency)), ...rfNeed.map(c => `rf|${c}|${o.frequency}`)];
    keys.forEach(k => inflight.current.add(k));
    const f = o.frequency, ccy = o.currency;
    setPending(p => p + 1);
    (async () => {
      try {
        const got = await Promise.all(missing.map(id => api.getSeries(id, { frequency: f, currency: ccy || undefined })));
        const rfs = await Promise.all(rfNeed.map(c => api.getRiskFree(c, f)));
        setCache(m => { const n = new Map(m); missing.forEach((id, k) => n.set(keyOf(id, f, ccy), got[k])); return n; });
        setRfCache(m => { const n = new Map(m); rfNeed.forEach((c, k) => n.set(`${c}|${f}`, rfs[k])); return n; });
        setError(null);
      } catch (e) {
        setError(toFailure(e, 'Loading returns'));
      } finally {
        keys.forEach(k => inflight.current.delete(k));
        setPending(p => p - 1);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, benchOf, imported, o.frequency, o.currency, cache, rfCache]);

  /* ---------- aligned rows ---------- */
  const data = useMemo(() => {
    const series = ids.map(id => {
      const imp = imported.get(id);
      if (imp) { const r = seriesFromPrices(imp.prices, o.frequency); return { dates: r.dates, returns: r.returns, benchmark: null } as DatedSeries; }
      return cache.get(keyOf(id, o.frequency, o.currency));
    });
    if (!ids.length || series.some(x => !x)) return null;
    const dates = unionDates(series as DatedSeries[]);
    if (!dates.length) return null;
    const rows: AlignedRow[] = ids.map((id, k) => {
      const ser = series[k]!;
      const b = benchOf.get(id);
      const bSer = b?.id ? cache.get(keyOf(b.id, o.frequency, o.currency)) : ser.benchmark ? { dates: ser.dates, returns: ser.benchmark } : null;
      const rf = rfCache.get(`${ccyOf(id)}|${o.frequency}`);
      const ret = alignTo(dates, ser);
      return {
        id, ret,
        bm: bSer ? alignTo(dates, bSer) : null,
        rf: alignTo(dates, rf ?? null).map(v => v ?? 0),
        start: firstIdx(ret), end: lastIdx(ret),
      };
    });
    return { dates, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, cache, rfCache, benchOf, imported, o.frequency, o.currency]);

  /* ---------- period ---------- */
  const period = useMemo(() => {
    if (!data) return null;
    const { dates, rows } = data, asOf = dates[dates.length - 1];
    let a = windowStart(dates, asOf, o.period, o.custom);
    let e = o.period === 'CUSTOM' && o.custom.to ? indexAfter(dates, o.custom.to) - 1 : dates.length - 1;
    if (o.commonPeriod && rows.length) {
      a = Math.max(a, ...rows.map(r => r.start));
      e = Math.min(e, ...rows.map(r => r.end));
    }
    a = Math.max(0, Math.min(a, dates.length - 1));
    if (e < a) e = a;
    return { a, e, asOf };
  }, [data, o.period, o.custom, o.commonPeriod]);

  const stats = useMemo(() => {
    const m = new Map<string, RowStats | null>();
    if (data && period) data.rows.forEach(r => m.set(r.id, rowStats(r, data.dates, period.a, period.e, o.frequency, o.riskFree)));
    return m;
  }, [data, period, o.frequency, o.riskFree]);

  /* ---------- relative rows: (1 + r) / (1 + b) − 1, instruments without a benchmark left out ---------- */
  const relRows = useMemo(() => (data ? data.rows.map(relativeRow).filter((r): r is AlignedRow => !!r) : []), [data]);
  const relStats = useMemo(() => {
    const m = new Map<string, RowStats | null>();
    if (data && period) relRows.forEach(r => m.set(r.id, rowStats(r, data.dates, period.a, period.e, o.frequency, false)));
    return m;
  }, [relRows, data, period, o.frequency]);

  /** Stats over the window chosen for Risk metrics / Risk-return. */
  const statsIn = (w: DashOptions['riskWindow']) => {
    if (w === 'period' || !data || !period) return stats;
    const a = windowStart(data.dates, period.asOf, w), m = new Map<string, RowStats | null>();
    data.rows.forEach(r => m.set(r.id, rowStats(r, data.dates, a, data.dates.length - 1, o.frequency, o.riskFree)));
    return m;
  };

  /* ---------- best / worst ---------- */
  const cards = useMemo(() => {
    const list = ids.map(id => ({ id, st: stats.get(id) })).filter((x): x is { id: string; st: RowStats } => !!x.st);
    const pick = (f: (x: RowStats) => number | null, higherIsBetter: boolean) => {
      const v = list.filter(x => f(x.st) != null).sort((p, q) => (f(q.st)! - f(p.st)!) * (higherIsBetter ? 1 : -1));
      return v.length ? { top: { id: v[0].id, v: f(v[0].st)! }, worst: { id: v[v.length - 1].id, v: f(v[v.length - 1].st)! } } : null;
    };
    return {
      performance: pick(x => x.cum, true),
      volatility: pick(x => x.vol, false),
      sharpe: pick(x => x.sharpe, true),
      drawdown: pick(x => x.mdd, true),
    };
  }, [ids, stats]);

  return {
    o, set, ids, folderId, fo, benchOf, data, period, stats, statsIn, cards,
    /** Rows and stats relative to each benchmark (for elements switched to Relative). */
    relRows, relStats,
    setRelative: (k: keyof DashOptions['relative'], v: boolean) => set({ relative: { ...o.relative, [k]: v } }),
    loading: pending > 0 || (ids.length > 0 && !data), error, clearError: () => setError(null),
    setIds: (next: string[], fid: string | null = folderId) => s.setDashboard({ ids: [...new Set(next)], folderId: fid }),
    /** Back to the default parameters (keeps the securities). */
    resetOptions: () => setO(DEFAULTS),
    toggleHidden: (id: string) => set({ hidden: o.hidden.includes(id) ? o.hidden.filter(x => x !== id) : [...o.hidden, id] }),
  };
}
