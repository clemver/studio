/* Effective benchmarks in a folder context: resolution, benchmark-only instruments, records, figures and edits. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Folder, TrackRecord } from '../types';
import type { Catalogue } from './useCatalogue';
import { alignOnGrid } from './useCatalogue';
import type { useFolders } from './useFolders';
import type { BenchmarkContext, ResolvedBenchmark } from '../lib/benchmark';
import { benchmarkSourceText, resolveBenchmark } from '../lib/benchmark';
import type { Figures } from '../lib/stats';
import { figures } from '../lib/stats';
import { label } from '../lib/domain';
import { monthLabel } from '../lib/months';

export interface BenchmarkInfo extends ResolvedBenchmark {
  /** Display name: the benchmark instrument's label, or the API composite's name. */
  name: string;
  /** Where it comes from, in words. */
  sourceText: string;
  currency: string | null;
  /** Caveats worth a warning icon (currency mismatch, starts later). */
  warning: string | null;
}

type Folders = ReturnType<typeof useFolders>;

export function useBenchmarks(cat: Catalogue, fo: Folders) {
  const stored = fo.stored;
  const storedById = useMemo(() => new Map(stored.map(f => [f.id, f])), [stored]);

  /** Folder context; virtual folders (Whole watchlist, All custom series) have none. */
  const contextOf = useCallback((folderId: string | null): BenchmarkContext | null => {
    const f = folderId ? storedById.get(folderId) : undefined;
    if (!f) return null;
    return { folder: f, parent: f.parentId ? storedById.get(f.parentId) ?? null : null };
  }, [storedById]);

  // Benchmarks the user can't list (e.g. an admin's private custom series) are loaded on their own.
  const [extra, setExtra] = useState<Map<string, TrackRecord>>(new Map());
  const referenced = useMemo(() => {
    const ids = new Set<string>();
    cat.instruments.forEach(i => { if (i.benchmarkId) ids.add(i.benchmarkId); });
    stored.forEach(f => { if (f.benchmarkId) ids.add(f.benchmarkId); Object.values(f.benchmarkOverrides).forEach(b => ids.add(b)); });
    return ids;
  }, [cat.instruments, stored]);
  useEffect(() => {
    const grid = cat.grid; if (!grid || cat.loading) return;
    const missing = [...referenced].filter(id => !cat.byId.has(id) && !extra.has(id));
    if (!missing.length) return;
    let live = true;
    Promise.all(missing.map(async id => {
      try { const [inst, ret] = await Promise.all([api.getInstrument(id), api.getReturns(id)]); return alignOnGrid(inst, ret, grid); }
      catch { return null; } // shown as "benchmark unavailable"
    })).then(recs => {
      if (!live) return;
      setExtra(m => { const n = new Map(m); recs.forEach(r => { if (r) n.set(r.inst.id, r); }); return n; });
    });
    return () => { live = false; };
  }, [referenced, cat.byId, cat.grid, cat.loading, extra]);

  const benchRecord = useCallback((id: string) => cat.byId.get(id) ?? extra.get(id), [cat.byId, extra]);

  const resolve = useCallback((instId: string, folderId: string | null): BenchmarkInfo | null => {
    const rec = cat.byId.get(instId); if (!rec) return null;
    const r = resolveBenchmark(rec.inst, contextOf(folderId));
    const b = r.id ? benchRecord(r.id) : undefined;
    let warning: string | null = null;
    if (r.id && !b) warning = 'Benchmark unavailable';
    else if (b && b.inst.currency !== rec.inst.currency) warning = `Benchmark in ${b.inst.currency}, instrument in ${rec.inst.currency}. The server converts currencies; sample data does not.`;
    else if (b && b.incIdx > rec.incIdx) warning = `Benchmark starts in ${monthLabel(b.inst.inception)}: no excess before.`;
    return {
      ...r,
      // Only track records come with an API benchmark; custom series and uploads have none by default.
      name: r.id ? (b ? label(b.inst) : 'Unavailable benchmark') : rec.inst.source === 'api' ? rec.inst.benchmarkName ?? 'No benchmark' : 'No benchmark',
      sourceText: benchmarkSourceText(r),
      currency: b ? b.inst.currency : null,
      warning,
    };
  }, [cat.byId, contextOf, benchRecord]);

  // Records with the effective benchmark, cached per instrument × benchmark.
  const recCache = useMemo(() => new Map<string, TrackRecord>(), [cat.byId, extra]);
  const figCache = useMemo(() => new Map<string, Figures>(), [cat.byId, extra, cat.grid]);
  const keyOf = (instId: string, folderId: string | null) => {
    const rec = cat.byId.get(instId); if (!rec) return null;
    return `${instId}|${resolveBenchmark(rec.inst, contextOf(folderId)).id ?? 'default'}`;
  };

  const record = useCallback((instId: string, folderId: string | null): TrackRecord | undefined => {
    const rec = cat.byId.get(instId); if (!rec) return undefined;
    const k = keyOf(instId, folderId)!;
    let out = recCache.get(k);
    if (!out) {
      const id = k.split('|')[1];
      out = id === 'default' ? { ...rec, bm: rec.defaultBm ?? null } : { ...rec, bm: benchRecord(id)?.ret ?? null };
      recCache.set(k, out);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat.byId, contextOf, benchRecord, recCache]);

  const figuresIn = useCallback((instId: string, folderId: string | null): Figures | null => {
    if (!cat.grid) return null;
    const k = keyOf(instId, folderId); if (!k) return null;
    let f = figCache.get(k);
    if (!f) { f = figures(record(instId, folderId)!, cat.grid); figCache.set(k, f); }
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat.grid, figCache, record]);

  return {
    contextOf, resolve, record, figures: figuresIn,
    /** Label of any benchmark candidate. */
    nameOf: (id: string | null) => (id ? (benchRecord(id) ? label(benchRecord(id)!.inst) : 'Unavailable benchmark') : null),
    /** Admins: security level, shared by all users. Null resets to folder / default. */
    setSecurity: async (instId: string, benchmarkId: string | null) => { cat.patchInstrument(await api.setSecurityBenchmark(instId, benchmarkId)); },
    /** Watchlist folder (admins) or own folder. */
    setFolder: (folderId: string, benchmarkId: string | null) => fo.update(folderId, { benchmarkId }),
    /** Own yellow folder: one instrument. Null resets to the folder / inherited benchmark. */
    setPersonal: (folder: Folder, instId: string, benchmarkId: string | null) => {
      const { [instId]: _old, ...rest } = folder.benchmarkOverrides;
      void _old;
      return fo.update(folder.id, { benchmarkOverrides: benchmarkId ? { ...rest, [instId]: benchmarkId } : rest });
    },
  };
}
