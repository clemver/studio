/*
 * Which benchmark applies to an instrument, depending on the folder being viewed.
 *
 *   Own folder F    : F per-instrument override → parent's override → F folder benchmark → parent's → no-folder rule
 *                     (own = yellow folders and the user's Custom series sub-folders)
 *   Watchlist F     : security level → F folder benchmark → F's parent's benchmark → API default
 *   No folder       : security level → API default
 *
 * Security level is set by admins and shared by every user. A null result means the API's own composite.
 */
import type { Folder, Instrument } from '../types';

export type BenchmarkSource = 'personal-instrument' | 'personal-folder' | 'security' | 'folder' | 'parent-folder' | 'default';

export interface ResolvedBenchmark {
  /** Instrument id of the benchmark; null = the track record API's default composite. */
  id: string | null;
  source: BenchmarkSource;
  /** Folder the benchmark comes from, for folder sources. */
  folder?: Pick<Folder, 'id' | 'name'>;
}

/** The folder being viewed and, for blue sub-folders, its parent. Null outside folders. */
export interface BenchmarkContext {
  folder: Folder | null;
  parent: Folder | null;
}

export function resolveBenchmark(inst: Pick<Instrument, 'id' | 'benchmarkId'>, ctx: BenchmarkContext | null): ResolvedBenchmark {
  const ok = (id: string | null | undefined): id is string => !!id && id !== inst.id; // never its own benchmark
  const outside = (): ResolvedBenchmark => (ok(inst.benchmarkId) ? { id: inst.benchmarkId, source: 'security' } : { id: null, source: 'default' });
  const f = ctx?.folder;
  if (!f) return outside();

  if (f.kind !== 'system') {
    const p = ctx.parent;
    const o = f.benchmarkOverrides[inst.id], po = p?.benchmarkOverrides[inst.id];
    if (ok(o)) return { id: o, source: 'personal-instrument', folder: f };
    if (p && ok(po)) return { id: po, source: 'personal-instrument', folder: p };
    if (ok(f.benchmarkId)) return { id: f.benchmarkId, source: 'personal-folder', folder: f };
    if (p && ok(p.benchmarkId)) return { id: p.benchmarkId, source: 'personal-folder', folder: p };
    return outside();
  }

  if (ok(inst.benchmarkId)) return { id: inst.benchmarkId, source: 'security' };
  if (ok(f.benchmarkId)) return { id: f.benchmarkId, source: 'folder', folder: f };
  if (ctx.parent && ok(ctx.parent.benchmarkId)) return { id: ctx.parent.benchmarkId, source: 'parent-folder', folder: ctx.parent };
  return { id: null, source: 'default' };
}

/** One line explaining where the benchmark comes from. */
export function benchmarkSourceText(r: ResolvedBenchmark): string {
  switch (r.source) {
    case 'personal-instrument': return `Your override in “${r.folder?.name}”`;
    case 'personal-folder': return `Your benchmark for “${r.folder?.name}”`;
    case 'security': return 'Set on this instrument · all users';
    case 'folder': return `From folder “${r.folder?.name}”`;
    case 'parent-folder': return `From folder “${r.folder?.name}”`;
    default: return 'Track record default';
  }
}

/** What the instrument would use if the override at this level were removed (for "Reset to inherited"). */
export function inheritedBenchmark(inst: Pick<Instrument, 'id' | 'benchmarkId'>, ctx: BenchmarkContext | null, level: 'personal-instrument' | 'security'): ResolvedBenchmark {
  if (level === 'security') return resolveBenchmark({ ...inst, benchmarkId: null }, ctx);
  if (!ctx?.folder) return resolveBenchmark(inst, null);
  const { [inst.id]: _drop, ...rest } = ctx.folder.benchmarkOverrides;
  void _drop;
  return resolveBenchmark(inst, { ...ctx, folder: { ...ctx.folder, benchmarkOverrides: rest } });
}
