/* App-wide state shared by every page: session, catalogue, selection, period, toasts and notifications. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import type { ImportedSeries, Instrument, Level, Me, PeriodPreset, Tag } from '../types';
import type { Permission } from '../lib/permissions';
import type { ApiFailure, Catalogue } from '../hooks/useCatalogue';
import { toFailure, useCatalogue } from '../hooks/useCatalogue';
import type { Period } from '../lib/stats';
import { periodOf } from '../lib/stats';

export interface Notification { kind: 'done' | 'warn' | 'error' | 'queued'; text: string; time: Date }

interface Studio {
  me: Me | null;
  meError: ApiFailure | null;
  level: Level;
  /** Rights from config/permissions.json, as resolved by the server for this user. */
  can: (p: Permission) => boolean;
  reloadMe: () => void;

  catalogue: Catalogue;
  /** Shared tags (labels on securities, not linked to folders). */
  tags: Tag[];
  tagName: (id: string) => string;
  /** Tag id → number of securities (visible to this user) that carry it. */
  tagCounts: Map<string, number>;
  /** Finds a tag by name (case-insensitive) or creates a user tag. */
  ensureTag: (name: string) => Promise<Tag>;

  /** Selected instrument ids, in selection order. */
  selection: string[];
  limit: number;
  /** CSS colour for a selected instrument (stable while it stays selected). */
  colorOf: (id: string) => string;
  /** Adds when there is room; returns false when the selection is full. */
  select: (id: string) => boolean;
  unselect: (id: string) => void;
  toggle: (id: string) => boolean;
  setSelection: (ids: string[]) => void;

  preset: PeriodPreset;
  setPreset: (p: PeriodPreset) => void;
  customRange: { from: string; to: string };
  setCustomRange: (r: { from: string; to: string }) => void;
  period: Period | null;

  /** Series imported from Excel in this browser session (never stored on the server; lost on reload). */
  imports: ImportedSeries[];
  addImports: (list: ImportedSeries[]) => void;
  removeImport: (id: string) => void;
  /** Catalogue instrument or session import. */
  instrumentOf: (id: string) => Instrument | undefined;

  /** Dashboard securities (no limit) and the folder whose benchmark rules apply (null = none). */
  dashboard: { ids: string[]; folderId: string | null };
  setDashboard: (d: { ids: string[]; folderId: string | null }) => void;
  /** Open the Dashboard with these securities. */
  openDashboard: (ids: string[], folderId?: string | null) => void;

  toast: string | null;
  showToast: (t: string) => void;
  notifications: Notification[];
  unseen: number;
  notify: (kind: Notification['kind'], text: string) => void;
  markSeen: () => void;
}

const Ctx = createContext<Studio | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<ApiFailure | null>(null);
  const [meTick, setMeTick] = useState(0);
  useEffect(() => {
    let live = true;
    api.getMe().then(m => { if (live) { setMe(m); setMeError(null); } }, e => { if (live) setMeError(toFailure(e, 'Loading your profile')); });
    return () => { live = false; };
  }, [meTick]);

  const level: Level = me?.level ?? 'standard';
  const catalogue = useCatalogue(me ? level : null);
  const limit = me?.limits.selection ?? 6;
  const perms = useMemo(() => new Set(me?.permissions ?? []), [me]);
  const can = useCallback((p: Permission) => perms.has(p), [perms]);

  const [tags, setTags] = useState<Tag[]>([]);
  useEffect(() => {
    if (!me) return;
    let live = true;
    api.listTags().then(t => { if (live) setTags(t); }, () => { /* tags are optional decoration; the explorer still works */ });
    return () => { live = false; };
  }, [me]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    catalogue.instruments.forEach(i => i.tags.forEach(t => m.set(t, (m.get(t) ?? 0) + 1)));
    return m;
  }, [catalogue.instruments]);
  const tagName = useCallback((id: string) => tags.find(t => t.id === id)?.name ?? id, [tags]);
  const ensureTag = useCallback(async (name: string) => {
    const hit = tags.find(t => t.name.toLowerCase() === name.trim().toLowerCase());
    if (hit) return hit;
    const t = await api.createTag(name);
    setTags(l => (l.some(x => x.id === t.id) ? l : [...l, t]));
    return t;
  }, [tags]);

  const [selection, setSel] = useState<string[]>([]);
  const [slots, setSlots] = useState<Record<string, number>>({});

  const setSelection = useCallback((ids: string[]) => {
    const next = [...new Set(ids)].slice(0, limit);
    setSel(next);
    setSlots(prev => {
      const out: Record<string, number> = {};
      next.forEach(id => { if (prev[id] != null) out[id] = prev[id]; });
      const used = new Set(Object.values(out));
      next.forEach(id => { if (out[id] == null) { let k = 0; while (used.has(k)) k++; out[id] = k; used.add(k); } });
      return out;
    });
  }, [limit]);
  const selRef = useRef(selection); selRef.current = selection;
  const select = useCallback((id: string) => {
    const cur = selRef.current;
    if (cur.includes(id)) return true;
    if (cur.length >= limit) return false;
    setSelection([...cur, id]);
    return true;
  }, [limit, setSelection]);
  const unselect = useCallback((id: string) => setSelection(selRef.current.filter(x => x !== id)), [setSelection]);
  const toggle = useCallback((id: string) => (selRef.current.includes(id) ? (unselect(id), true) : select(id)), [select, unselect]);
  const colorOf = useCallback((id: string) => `var(--s${((slots[id] ?? 0) % 10) + 1})`, [slots]);

  // Keep the selection valid when the level or the catalogue changes (limit per profile, custom series only with custom.view).
  useEffect(() => {
    if (catalogue.loading) return;
    const ok = selRef.current.filter(id => catalogue.byId.has(id)).slice(0, limit);
    if (ok.length !== selRef.current.length) setSelection(ok);
  }, [catalogue.loading, catalogue.byId, limit, setSelection]);

  const [preset, setPreset] = useState<PeriodPreset>('3Y');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const period = useMemo(
    () => (catalogue.grid ? periodOf(catalogue.grid, preset, customRange.from, customRange.to) : null),
    [catalogue.grid, preset, customRange],
  );

  const [imports, setImports] = useState<ImportedSeries[]>([]);
  const addImports = useCallback((list: ImportedSeries[]) => setImports(l => [...l, ...list]), []);
  const instrumentOf = useCallback((id: string) => catalogue.byId.get(id)?.inst ?? imports.find(x => x.inst.id === id)?.inst, [catalogue.byId, imports]);

  const [dashboard, setDashboard] = useState<{ ids: string[]; folderId: string | null }>({ ids: [], folderId: null });
  const openDashboard = useCallback((ids: string[], folderId: string | null = null) => setDashboard({ ids: [...new Set(ids)], folderId }), []);

  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef<number | undefined>(undefined);
  const showToast = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unseen, setUnseen] = useState(0);
  const notify = useCallback((kind: Notification['kind'], text: string) => {
    setNotifications(n => [{ kind, text, time: new Date() }, ...n].slice(0, 20));
    setUnseen(u => u + 1);
  }, []);

  const value: Studio = {
    me, meError, level, can, reloadMe: () => setMeTick(t => t + 1),
    catalogue, tags, tagName, tagCounts, ensureTag,
    selection, limit, colorOf, select, unselect, toggle, setSelection,
    preset, setPreset, customRange, setCustomRange, period,
    dashboard, setDashboard, openDashboard,
    imports, addImports, instrumentOf,
    removeImport: (id: string) => { setImports(l => l.filter(x => x.inst.id !== id)); setDashboard(dsh => ({ ...dsh, ids: dsh.ids.filter(x => x !== id) })); },
    toast, showToast, notifications, unseen, notify, markSeen: () => setUnseen(0),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio(): Studio {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStudio must be used inside <StudioProvider>');
  return s;
}
