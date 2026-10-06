/* Custom series page: library, the definition being edited, live build and save / delete. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { CustomLeg, CustomSeriesDefinition } from '../types';
import { useStudio } from '../state/studio';
import type { ApiFailure } from './useCatalogue';
import { toFailure } from './useCatalogue';
import type { BuiltSeries } from '../lib/custom';
import { buildCustom, componentsOf } from '../lib/custom';
import { addMonths } from '../lib/months';
import { label } from '../lib/domain';

/** The editor works on a draft: no id/code until the server assigns them. */
export type Draft = Omit<CustomSeriesDefinition, 'id' | 'code' | 'created'> & { id: string | null; code: string | null; created: string | null };

const toDraft = (d: CustomSeriesDefinition): Draft => structuredClone(d);

export function useCustomSeries() {
  const s = useStudio();
  const cat = s.catalogue;
  const [defs, setDefs] = useState<CustomSeriesDefinition[] | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<string>(''); // JSON of the last saved state, for "unsaved changes"
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.listCustomSeries().then(d => { setDefs(d); setError(null); }, e => setError(toFailure(e, 'Loading custom series')));
  }, []);
  useEffect(load, [load]);

  const blank = useCallback((): Draft => {
    const g = cat.grid;
    const start = g ? g.key(Math.max(0, g.last - 35)) : '2023-10';
    return {
      id: null, code: null, created: null, name: '', currency: 'CHF', riskProfile: null, rebalancing: 'monthly', tags: [],
      legs: [{ start, end: null, fee: 0, components: [] }],
    };
  }, [cat.grid]);

  const open = useCallback((d: Draft) => { setDraft(d); setSaved(JSON.stringify(d)); }, []);
  const openNew = useCallback(() => open(blank()), [open, blank]);
  const openId = useCallback((id: string) => { const d = defs?.find(x => x.id === id); if (d) open(toDraft(d)); }, [defs, open]);
  const duplicate = useCallback((id: string) => {
    const d = defs?.find(x => x.id === id); if (!d) return;
    const copy: Draft = { ...toDraft(d), id: null, code: null, created: null, name: `${d.name} (copy)` };
    setDraft(copy); setSaved('');
  }, [defs]);

  const dirty = !!draft && JSON.stringify(draft) !== saved;

  // Series this one may not contain: itself and every series that (directly or not) uses it.
  const excluded = useMemo(() => {
    if (!draft?.id || !defs) return draft?.id ? [draft.id] : [];
    const out = new Set<string>([draft.id]);
    let grew = true;
    while (grew) {
      grew = false;
      defs.forEach(d => { if (!out.has(d.id) && [...componentsOf(d)].some(c => out.has(c))) { out.add(d.id); grew = true; } });
    }
    return [...out];
  }, [draft?.id, defs]);

  const lookup = useCallback((id: string) => {
    const r = cat.byId.get(id);
    return r ? { ret: r.ret, incIdx: r.incIdx, label: label(r.inst) } : undefined;
  }, [cat.byId]);

  /** Live build of the draft on the catalogue's month grid (drives validation). */
  const built: BuiltSeries | null = useMemo(() => {
    if (!draft || !cat.grid) return null;
    return buildCustom({ ...draft, id: draft.id ?? '', code: '', created: '' }, cat.grid, lookup);
  }, [draft, cat.grid, lookup]);

  const update = (p: Partial<Draft>) => setDraft(d => (d ? { ...d, ...p } : d));
  const updateLeg = (k: number, p: Partial<CustomLeg>) => setDraft(d => (d ? { ...d, legs: d.legs.map((l, j) => (j === k ? { ...l, ...p } : l)) } : d));

  const addLeg = () => setDraft(d => {
    if (!d || !cat.grid) return d;
    const legs = [...d.legs];
    const prev = legs[legs.length - 1];
    // Close an ongoing last leg one year before the latest data; the new leg takes over from there.
    const lastKey = cat.grid.key(cat.grid.last);
    const prevEnd = prev.end ?? addMonths(lastKey, -12);
    legs[legs.length - 1] = { ...prev, end: prevEnd };
    legs.push({ start: addMonths(prevEnd, 1), end: null, fee: prev.fee, components: prev.components.map(c => ({ ...c })) });
    return { ...d, legs };
  });
  const removeLeg = (k: number) => setDraft(d => {
    if (!d || d.legs.length < 2) return d;
    const legs = d.legs.filter((_, j) => j !== k);
    // Keep legs contiguous: the next leg takes over the removed leg's start; the last leg stays ongoing if it was.
    if (k < d.legs.length - 1) legs[k] = { ...legs[k], start: d.legs[k].start };
    else legs[legs.length - 1] = { ...legs[legs.length - 1], end: d.legs[k].end };
    return { ...d, legs };
  });

  const save = async () => {
    if (!draft || !built || built.issues.length) return null;
    setBusy(true);
    try {
      const body = { name: draft.name.trim(), currency: draft.currency, riskProfile: draft.riskProfile, rebalancing: draft.rebalancing, legs: draft.legs, tags: draft.tags };
      const res = draft.id
        ? await api.updateCustomSeries({ ...body, id: draft.id, code: draft.code ?? '', created: draft.created ?? '' })
        : await api.createCustomSeries(body);
      setDefs(l => (l ? (l.some(x => x.id === res.id) ? l.map(x => (x.id === res.id ? res : x)) : [...l, res]) : [res]));
      open(toDraft(res));
      setError(null);
      // The saved series and anything built on it changed.
      await cat.refresh(cat.instruments.filter(i => i.source === 'custom').map(i => i.id).concat(res.id));
      return res;
    } catch (e) {
      setError(toFailure(e, 'Saving the custom series'));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.deleteCustomSeries(id);
      setDefs(l => l?.filter(x => x.id !== id) ?? null);
      if (draft?.id === id) setDraft(null);
      s.unselect(id);
      await cat.refresh();
      return true;
    } catch (e) {
      setError(toFailure(e, 'Deleting the custom series'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    defs, error, clearError: () => setError(null), reload: load,
    draft, dirty, busy, built, excluded,
    openNew, openId, duplicate, close: () => setDraft(null),
    update, updateLeg, addLeg, removeLeg, save, remove,
  };
}
