/* Folder tree for the explorer: the Watchlist (blue, admin-maintained), the user's folders (yellow) and Custom series. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Folder, Instrument } from '../types';
import type { ApiFailure } from './useCatalogue';
import { toFailure } from './useCatalogue';

export const ALL = 'all';
export const CUSTOM_ROOT = 'smart-custom';
const SMART_CUSTOM = CUSTOM_ROOT;

export interface FolderNode {
  id: string;
  name: string;
  kind: Folder['kind'];
  parentId: string | null;
  /** May add or remove instruments here. */
  editable: boolean;
  /** Built by the UI (Whole watchlist, All custom series): no stored membership. */
  virtual: boolean;
  home?: boolean;
  /** Instruments in this folder, including sub-folders. */
  ids: Set<string>;
}

/** `showCustom`: custom series folders (permission custom.view). `access` changes when the user's rights change (reload). */
export function useFolders(instruments: Instrument[], showCustom: boolean, access: string, ready: boolean) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    api.listFolders().then(f => { if (live) { setFolders(f); setError(null); } }, e => { if (live) setError(toFailure(e, 'Loading folders')); });
    return () => { live = false; };
  }, [ready, access, tick]);

  const nodes = useMemo(() => {
    // Folders never list imported (uploaded) series.
    const visible = new Set(instruments.filter(i => i.source !== 'upload').map(i => i.id));
    const list = folders ?? [];
    const own = (f: Folder): string[] => [...f.instrumentIds, ...list.filter(c => c.parentId === f.id).flatMap(own)];
    const out: FolderNode[] = [
      // The default view: everything on the Watchlist (instruments in any Watchlist folder).
      { id: ALL, name: 'Whole watchlist', kind: 'system', parentId: null, editable: false, virtual: true, home: true,
        ids: new Set(list.filter(f => f.kind === 'system').flatMap(f => f.instrumentIds).filter(id => visible.has(id))) },
      // Top-level custom folders sit under the Custom series root.
      ...list.filter(f => f.kind !== 'custom' || showCustom).map(f => ({
        id: f.id, name: f.name, kind: f.kind, editable: f.editable, virtual: false,
        parentId: f.kind === 'custom' && !f.parentId ? CUSTOM_ROOT : f.parentId,
        ids: new Set(own(f).filter(id => visible.has(id))),
      })),
    ];
    if (showCustom) {
      const by = (src: Instrument['source']) => new Set(instruments.filter(i => i.source === src).map(i => i.id));
      out.push({ id: SMART_CUSTOM, name: 'All custom series', kind: 'custom', parentId: null, editable: false, virtual: true, ids: by('custom') });
    }
    return out;
  }, [folders, instruments, showCustom]);

  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const save = useCallback(async (id: string, patch: Partial<Pick<Folder, 'name' | 'instrumentIds' | 'benchmarkId' | 'benchmarkOverrides'>>) => {
    const saved = await api.updateFolder(id, patch);
    setFolders(l => l?.map(f => (f.id === id ? saved : f)) ?? null);
    return saved;
  }, []);
  const stored = (id: string) => folders?.find(f => f.id === id);

  return {
    loading: folders == null && !error,
    error, clearError: () => setError(null), reload: () => setTick(t => t + 1),
    nodes, byId,
    /** Folders as stored by the server (with benchmarks); virtual folders are not included. */
    stored: folders ?? [],
    update: save,
    /** Folders an instrument can be added to (own folders; Watchlist folders too for admins). Parents hold their own list too. */
    targets: (folders ?? []).filter(f => f.editable),
    addInstrument: (folderId: string, id: string) => save(folderId, { instrumentIds: [...(stored(folderId)?.instrumentIds ?? []), id] }),
    addInstruments: (folderId: string, ids: string[]) => save(folderId, { instrumentIds: [...new Set([...(stored(folderId)?.instrumentIds ?? []), ...ids])] }),
    removeInstrument: async (folderId: string, id: string) => {
      // Removing from a parent removes it from the sub-folder that holds it.
      const f = stored(folderId); if (!f) return;
      const holder = f.instrumentIds.includes(id) ? f : (folders ?? []).find(c => c.parentId === folderId && c.instrumentIds.includes(id));
      if (holder) await save(holder.id, { instrumentIds: holder.instrumentIds.filter(x => x !== id) });
    },
    create: async (name: string, instrumentIds: string[] = [], kind: Folder['kind'] = 'user', parentId: string | null = null) => {
      const f = await api.createFolder({ name, instrumentIds, kind, parentId });
      setFolders(l => [...(l ?? []), f]);
      return f;
    },
    rename: (id: string, name: string) => save(id, { name }),
    remove: async (id: string) => {
      await api.deleteFolder(id);
      setFolders(l => l?.filter(f => f.id !== id && f.parentId !== id) ?? null);
    },
  };
}
