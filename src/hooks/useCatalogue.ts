import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { Instrument, Level, ReturnSeries, TrackRecord } from '../types';
import type { MonthGrid } from '../lib/months';
import { buildGrid } from '../lib/months';
import type { Figures } from '../lib/stats';
import { figures } from '../lib/stats';

export interface ApiFailure { call: string; detail: string }
export const toFailure = (e: unknown, call: string): ApiFailure =>
  e instanceof ApiError ? { call: e.call, detail: e.detail } : { call, detail: e instanceof Error ? e.message : String(e) };

/** Run promises with a small concurrency limit. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/** Puts a returns series on the shared month grid. `bm` starts as the API's composite (`defaultBm`). */
export function alignOnGrid(inst: Instrument, s: ReturnSeries, grid: MonthGrid): TrackRecord {
  const ret: (number | null)[] = new Array(grid.keys.length).fill(null);
  const bm: (number | null)[] | null = s.benchmark ? new Array(grid.keys.length).fill(null) : null;
  s.dates.forEach((d, k) => { const i = grid.idx(d); if (i < 0) return; ret[i] = s.returns[k]; if (bm && s.benchmark) bm[i] = s.benchmark[k]; });
  const first = ret.findIndex(v => v != null);
  return { inst, ret, bm, defaultBm: bm, incIdx: first < 0 ? grid.last + 1 : first };
}

export interface Catalogue {
  instruments: Instrument[];
  byId: Map<string, TrackRecord>;
  figuresOf: (id: string) => Figures | null;
  grid: MonthGrid | null;
  loading: boolean;
  error: ApiFailure | null;
  clearError: () => void;
  reload: () => void;
  /** Save a display name (empty resets to the source name). */
  setAlias: (id: string, alias: string) => Promise<string>;
  /**
   * Re-read the instrument list (names, tags, new or deleted series) and the returns of `ids`
   * plus any new instrument, without the full reload. Used after saving a custom series.
   */
  refresh: (ids?: string[]) => Promise<void>;
  /** Save a security's tags (admins: any security; users: their own custom series). */
  setTags: (id: string, tagIds: string[]) => Promise<void>;
  /** Replace one instrument's metadata (e.g. after its security-level benchmark changed). */
  patchInstrument: (inst: Instrument) => void;
}

/** Loads every instrument the user can see and its monthly returns, aligned on one month grid. */
export function useCatalogue(level: Level | null): Catalogue {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [series, setSeries] = useState<Map<string, ReturnSeries>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [tick, setTick] = useState(0);
  const run = useRef(0);

  useEffect(() => {
    if (!level) return;
    const me = ++run.current;
    setLoading(true);
    (async () => {
      try {
        const list = await api.listInstruments();
        const ret = await pool(list, 6, i => api.getReturns(i.id));
        if (me !== run.current) return;
        setInstruments(list);
        setSeries(new Map(list.map((i, k) => [i.id, ret[k]])));
        setError(null);
      } catch (e) {
        if (me === run.current) setError(toFailure(e, 'Loading instruments'));
      } finally {
        if (me === run.current) setLoading(false);
      }
    })();
  }, [level, tick]);

  const { grid, byId } = useMemo(() => {
    const keys = [...series.values()].flatMap(s => (s.dates.length ? [s.dates[0], s.dates[s.dates.length - 1]] : [])).sort();
    const byId = new Map<string, TrackRecord>();
    if (!keys.length) return { grid: null, byId };
    const grid = buildGrid(keys[0], keys[keys.length - 1]);
    instruments.forEach(inst => {
      const s = series.get(inst.id); if (!s) return;
      byId.set(inst.id, alignOnGrid(inst, s, grid));
    });
    return { grid, byId };
  }, [instruments, series]);

  // Figures depend on returns only, not on the display name, so cache them per series.
  const figCache = useMemo(() => new Map<string, Figures>(), [series, grid]);
  const figuresOf = useCallback((id: string) => {
    const r = byId.get(id); if (!r || !grid) return null;
    let f = figCache.get(id);
    if (!f) { f = figures(r, grid); figCache.set(id, f); }
    return f;
  }, [byId, grid, figCache]);

  const setAlias = useCallback(async (id: string, alias: string) => {
    const res = await api.setAlias(id, alias);
    setInstruments(list => list.map(i => (i.id === id ? { ...i, alias: res.alias } : i)));
    return res.alias;
  }, []);

  const refresh = useCallback(async (ids: string[] = []) => {
    const list = await api.listInstruments();
    const known = new Set(series.keys());
    const need = list.filter(i => ids.includes(i.id) || !known.has(i.id)).map(i => i.id);
    const fresh = await pool(need, 6, id => api.getReturns(id));
    setInstruments(list);
    setSeries(prev => {
      const next = new Map([...prev].filter(([id]) => list.some(i => i.id === id)));
      need.forEach((id, k) => next.set(id, fresh[k]));
      return next;
    });
  }, [series]);

  return {
    instruments, byId, figuresOf, grid, loading, error, refresh,
    patchInstrument: (inst: Instrument) => setInstruments(list => list.map(i => (i.id === inst.id ? inst : i))),
    setTags: async (id: string, tagIds: string[]) => {
      const inst = await api.setInstrumentTags(id, tagIds);
      setInstruments(list => list.map(i => (i.id === inst.id ? inst : i)));
    },
    clearError: () => setError(null),
    reload: () => setTick(t => t + 1),
    setAlias,
  };
}
