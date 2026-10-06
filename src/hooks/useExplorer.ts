/* Explorer page: filters, criteria, sorting, grouping and the server-side filter call. */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Instrument, RiskProfile, TrackRecord } from '../types';
import { useStudio } from '../state/studio';
import { useSticky } from './useSticky';
import type { ApiFailure } from './useCatalogue';
import { toFailure } from './useCatalogue';
import type { Figures } from '../lib/stats';
import { CATEGORIES, CATEGORY_PLURAL, RISK_LEVEL, label } from '../lib/domain';
import { ALL } from './useFolders';

export type SortKey = 'name' | 'ytd' | 'y1' | 'y3' | 'y5' | 'itd' | 'vol' | 'ex';
export type CritKey = 'minHist' | 'maxVol';

export const CRITERIA: Record<CritKey, { label: string; options: [string, string][]; chip: (v: string) => string }> = {
  minHist: { label: 'Minimum history', options: [['', 'Any'], ['36', '3 years'], ['60', '5 years'], ['120', '10 years']], chip: v => `${+v / 12} years` },
  maxVol: { label: 'Max. volatility 3Y', options: [['', 'Any'], ['0.05', '5%'], ['0.08', '8%'], ['0.12', '12%']], chip: v => `${Math.round(+v * 100)}%` },
};

/** Fields rows can be grouped by (the "Drag here to set row groups" zone). */
export type GroupField = 'category' | 'currency' | 'riskProfile';
export const GROUP_FIELDS: Record<GroupField, string> = { category: 'Category', currency: 'Currency', riskProfile: 'Risk profile' };

export interface ExplorerFilters {
  /** Folder shown in the grid (ALL = every instrument). */
  folder: string;
  q: string;
  currency: string;
  risk: RiskProfile | '';
  /** Tag id ('' = any). */
  tag: string;
  criteria: Record<CritKey, string>;
  /** Criteria fields shown in the filter row, in the order they were added. */
  criteriaOn: CritKey[];
  selectedOnly: boolean;
}
export interface ExplorerView {
  groupBy: GroupField[];
  /** Collapsed group keys. */
  collapsed: string[];
  showBenchmarkLine: boolean;
  showExcess: boolean;
  sort: SortKey;
  pageSize: number;
  showFolders: boolean;
}
export interface Row { rec: TrackRecord; f: Figures }
export interface Group { key: string; label: string; rows: Row[] }

const EMPTY: ExplorerFilters = { folder: ALL, q: '', currency: '', risk: '', tag: '', criteria: { minHist: '', maxVol: '' }, criteriaOn: [], selectedOnly: false };
const VIEW: ExplorerView = { groupBy: [], collapsed: [], showBenchmarkLine: true, showExcess: true, sort: 'name', pageSize: 20, showFolders: true };

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/**
 * `membersOf`: instruments in a folder (null when unknown, e.g. while folders load).
 * `figuresOf`: figures with the benchmark that applies in that folder.
 */
export function useExplorer(membersOf: (folderId: string) => Set<string> | null, figuresOf: (id: string, folderId: string) => Figures | null) {
  const s = useStudio();
  const { catalogue } = s;
  const showCustom = s.can('custom.view');
  const [filters, setFilters] = useSticky<ExplorerFilters>('explorer.filters', EMPTY);
  const [view, setView] = useSticky<ExplorerView>('explorer.view', VIEW);
  const q = useDebounced(filters.q, 250);
  const members = membersOf(filters.folder);


  // Filters go to the API and are also applied client-side, so the UI behaves even if the backend ignores them.
  const [serverIds, setServerIds] = useState<Set<string> | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  useEffect(() => {
    const f = { currency: filters.currency || undefined, risk: filters.risk || undefined, q: q.trim() || undefined };
    if (!f.currency && !f.risk && !f.q) { setServerIds(null); return; }
    let live = true;
    api.listInstruments(f).then(
      list => { if (live) { setServerIds(new Set(list.map(i => i.id))); setError(null); } },
      e => { if (live) { setServerIds(null); setError(toFailure(e, 'Filtering instruments')); } },
    );
    return () => { live = false; };
  }, [filters.currency, filters.risk, q]);

  // Imported (uploaded) series are for the Dashboard and reports only, never listed in the Explorer.
  const visible = useMemo(() => catalogue.instruments.filter(i => i.source !== 'upload' && (showCustom || i.source === 'api')), [catalogue.instruments, showCustom]);

  const rows: Row[] = useMemo(() => {
    const grid = catalogue.grid; if (!grid) return [];
    const needle = q.trim().toLowerCase(), c = filters.criteria;
    const keep = (i: Instrument, f: Figures, rec: TrackRecord) => {
      if (members && !members.has(i.id)) return false;
      if (filters.currency && i.currency !== filters.currency) return false;
      if (filters.risk && i.riskProfile !== filters.risk) return false;
      if (filters.tag && !i.tags.includes(filters.tag)) return false;
      if (needle && !`${label(i)} ${i.name} ${i.benchmarkName ?? ''} ${i.riskProfile ?? ''} ${i.currency} ${i.code} ${i.tags.map(s.tagName).join(' ')}`.toLowerCase().includes(needle)) return false;
      if (c.minHist && grid.last - rec.incIdx + 1 < +c.minHist) return false;
      if (c.maxVol && (!f.y3 || f.y3.vol == null || f.y3.vol > +c.maxVol)) return false;
      if (filters.selectedOnly && !s.selection.includes(i.id)) return false;
      if (serverIds && !serverIds.has(i.id)) return false;
      return true;
    };
    const out: Row[] = [];
    visible.forEach(i => {
      const rec = catalogue.byId.get(i.id), f = figuresOf(i.id, filters.folder);
      if (rec && f && keep(i, f, rec)) out.push({ rec, f });
    });
    const k = view.sort;
    const val = (r: Row): number => {
      const f = r.f;
      if (k === 'vol') return f.y3?.vol != null ? -f.y3.vol : -9;
      if (k === 'ex') return f.y1?.excess ?? -9;
      if (k === 'ytd' || k === 'y1') return f[k]?.cum ?? -9;
      if (k === 'name') return 0;
      return f[k] ? (f[k]!.ann ?? f[k]!.cum) : -9;
    };
    out.sort((x, y) => (k === 'name'
      ? ((x.rec.inst.riskProfile ? RISK_LEVEL[x.rec.inst.riskProfile] : 9) - (y.rec.inst.riskProfile ? RISK_LEVEL[y.rec.inst.riskProfile] : 9)) || label(x.rec.inst).localeCompare(label(y.rec.inst))
      : val(y) - val(x)));
    return out;
  }, [catalogue, visible, filters, q, view.sort, serverIds, s.selection, s.tagName, members, figuresOf]);

  // Row groups: sort by group (stable, keeps the column sort inside a group), then paginate.
  const groupOf = useMemo(() => {
    const part = (r: Row, g: GroupField) => (g === 'category' ? CATEGORY_PLURAL[r.rec.inst.category] : g === 'currency' ? r.rec.inst.currency : r.rec.inst.riskProfile ?? 'No risk profile');
    const rank = (r: Row, g: GroupField) => (g === 'category' ? CATEGORIES.indexOf(r.rec.inst.category) : g === 'riskProfile' ? (r.rec.inst.riskProfile ? RISK_LEVEL[r.rec.inst.riskProfile] : 9) : 0);
    return (r: Row) => ({ key: view.groupBy.map(g => part(r, g)).join(' · '), order: view.groupBy.flatMap(g => [rank(r, g), part(r, g)]) });
  }, [view.groupBy]);
  const ordered = useMemo(() => {
    if (!view.groupBy.length) return rows;
    const cmp = (x: (string | number)[], y: (string | number)[]) => { for (let k = 0; k < x.length; k++) { if (x[k] < y[k]) return -1; if (x[k] > y[k]) return 1; } return 0; };
    return rows.map((r, i) => ({ r, i, o: groupOf(r).order })).sort((x, y) => cmp(x.o, y.o) || x.i - y.i).map(x => x.r);
  }, [rows, view.groupBy, groupOf]);

  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(ordered.length / view.pageSize));
  useEffect(() => { setPage(0); }, [filters, q, view.pageSize, view.groupBy, members]);
  const current = Math.min(page, pages - 1);
  const pageRows = useMemo(() => ordered.slice(current * view.pageSize, (current + 1) * view.pageSize), [ordered, current, view.pageSize]);

  const groups: Group[] = useMemo(() => {
    if (!view.groupBy.length) return [];
    const out: Group[] = [];
    pageRows.forEach(r => {
      const { key } = groupOf(r);
      const last = out[out.length - 1];
      if (last?.key === key) last.rows.push(r); else out.push({ key, label: key, rows: [r] });
    });
    return out;
  }, [pageRows, view.groupBy, groupOf]);

  const update = (p: Partial<ExplorerFilters>) => setFilters(f => ({ ...f, ...p }));
  return {
    filters, view, rows, pageRows, groups,
    page: current, pages, setPage,
    total: visible.length,
    error, clearError: () => setError(null),
    setFolder: (folder: string) => update({ folder }),
    setQuery: (q: string) => update({ q }),
    setCurrency: (currency: string) => update({ currency }),
    setRisk: (risk: RiskProfile | '') => update({ risk }),
    setTag: (tag: string) => update({ tag }),
    addCriterion: (k: CritKey) => setFilters(f => ({ ...f, criteriaOn: f.criteriaOn.includes(k) ? f.criteriaOn : [...f.criteriaOn, k] })),
    setCriterion: (k: CritKey, v: string) => setFilters(f => ({ ...f, criteria: { ...f.criteria, [k]: v } })),
    removeCriterion: (k: CritKey) => setFilters(f => ({ ...f, criteria: { ...f.criteria, [k]: '' }, criteriaOn: f.criteriaOn.filter(x => x !== k) })),
    setSelectedOnly: (selectedOnly: boolean) => update({ selectedOnly }),
    /** Clears search and criteria; keeps the folder. */
    reset: () => setFilters(f => ({ ...EMPTY, folder: f.folder })),
    setSort: (sort: SortKey) => setView(v => ({ ...v, sort })),
    addGroup: (g: GroupField) => setView(v => ({ ...v, groupBy: v.groupBy.includes(g) ? v.groupBy : [...v.groupBy, g] })),
    removeGroup: (g: GroupField) => setView(v => ({ ...v, groupBy: v.groupBy.filter(x => x !== g), collapsed: [] })),
    toggleGroup: (key: string) => setView(v => ({ ...v, collapsed: v.collapsed.includes(key) ? v.collapsed.filter(x => x !== key) : [...v.collapsed, key] })),
    expandAll: () => setView(v => ({ ...v, collapsed: [] })),
    collapseAll: () => setView(v => ({ ...v, collapsed: groups.map(g => g.key) })),
    setPageSize: (pageSize: number) => setView(v => ({ ...v, pageSize })),
    setShowFolders: (showFolders: boolean) => setView(v => ({ ...v, showFolders })),
    toggleBenchmarkLine: () => setView(v => ({ ...v, showBenchmarkLine: !v.showBenchmarkLine })),
    toggleExcess: () => setView(v => ({ ...v, showExcess: !v.showExcess })),
  };
}
