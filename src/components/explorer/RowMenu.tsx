/*
 * Row menu (⋮ or right-click). Standard: Add to selection, Copy ID.
 * Advanced adds: Open in dashboard, Add to report, Add to folder (own folders), Rename display name, Edit custom series.
 * Admins can also add to / remove from the Watchlist (track records only).
 */
import { useState } from 'react';
import type { Anchor } from '../Menu';
import { MenuButton, Popover } from '../Menu';
import { Icon } from '../Icons';
import type { Folder, Instrument } from '../../types';
import type { Figures } from '../../lib/stats';
import { CATEGORY_SINGULAR, label } from '../../lib/domain';
import { monthLabel } from '../../lib/months';
import { KPI_MISSING, kv } from '../../lib/format';

interface Props {
  anchor: Anchor;
  inst: Instrument;
  figures: Figures | null;
  /** Rights (config/permissions.json) for the optional entries. */
  can: { dashboard: boolean; report: boolean; rename: boolean; newFolder: boolean; editCustom: boolean };
  selected: boolean;
  selectionCount: number;
  limit: number;
  /** Folders the instrument can be added to; null while loading. */
  folders: Folder[] | null;
  canAddToFolders: boolean;
  /** Set when the grid shows a folder this user may edit. */
  removeFrom: { name: string; onRemove: () => Promise<void> } | null;
  onClose: () => void;
  onToggle: () => void;
  onOpenDashboard: () => void;
  onAddToReport: () => void;
  onAddToFolder: (folderId: string) => Promise<void>;
  onNewFolder: () => Promise<void>;
  onRename: (alias: string) => Promise<void>;
  onEditCustom: () => void;
  /** Effective benchmark and, when this user may change it, the handler (opens the benchmark picker). */
  benchmark: { name: string; sourceText: string } | null;
  onBenchmark?: () => void;
  /** Set when this user may tag the security. */
  onEditTags?: () => void;
}

export function RowMenu(p: Props) {
  const [mode, setMode] = useState<'menu' | 'rename' | 'folders'>('menu');
  const [alias, setAlias] = useState(label(p.inst));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const i = p.inst, f = p.figures;
  const full = !p.selected && p.selectionCount >= p.limit;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); p.onClose(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  if (mode === 'rename') {
    return (
      <Popover key="rename" anchor={p.anchor} onClose={p.onClose} width={300} role="dialog" ariaLabel="Display name">
        <div className="hd"><b>Display name</b><span>Used on the dashboard and in reports. Source: {i.name}</span></div>
        <div className="form">
          <input className="inp" value={alias} maxLength={60} aria-label="Display name" onChange={ev => setAlias(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Enter') act(() => p.onRename(alias.trim())); }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="lnk" disabled={busy} onClick={() => act(() => p.onRename(''))}>Reset</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn sec" onClick={() => setMode('menu')}>Cancel</button>
            <button type="button" className="btn" disabled={busy} onClick={() => act(() => p.onRename(alias.trim()))}>Save</button>
          </div>
          {msg && <div className="msg" style={{ padding: 0 }}>{msg}</div>}
        </div>
      </Popover>
    );
  }

  if (mode === 'folders') {
    const group = (kind: Folder['kind'], title: string) => {
      const list = (p.folders ?? []).filter(f => f.kind === kind);
      if (!list.length) return null;
      return <>
        <div className="msg">{title}</div>
        {list.map(f => {
          const has = f.instrumentIds.includes(i.id);
          return (
            <MenuButton key={f.id} disabled={has || busy} icon={<Icon.folder className={`fi ${kind === 'user' ? 'usr' : 'sys'}`} style={{ width: 16, height: 16 }} />}
              hint={has ? 'added' : f.instrumentIds.length} onClick={() => act(() => p.onAddToFolder(f.id))}>{f.name}</MenuButton>
          );
        })}
      </>;
    };
    return (
      <Popover key="folders" anchor={p.anchor} onClose={p.onClose} width={300}>
        <div className="hd"><b>Add to folder</b><span>{label(i)}</span></div>
        {!p.folders ? <div className="msg">Loading folders…</div> : <>
          {group('user', 'My folders')}
          {i.source === 'custom' && group('custom', 'Custom series folders')}
          {i.source === 'api' && group('system', 'Watchlist · admin')}
        </>}
        <hr />
        {p.can.newFolder && <MenuButton icon={<Icon.plus />} disabled={busy} onClick={() => act(p.onNewFolder)}>New folder with this instrument</MenuButton>}
        <MenuButton onClick={() => setMode('menu')}>← Back</MenuButton>
        {msg && <div className="msg">{msg}</div>}
      </Popover>
    );
  }

  const fig = (l: string, v: string) => <div><small>{l}</small><strong className="num">{v}</strong></div>;
  const copy = () => {
    const done = (t: string) => setMsg(t);
    try { navigator.clipboard.writeText(i.code).then(() => done('Copied ' + i.code), () => done('Clipboard blocked. ID: ' + i.code)); }
    catch { done('Clipboard blocked. ID: ' + i.code); }
  };
  return (
    <Popover key="menu" anchor={p.anchor} onClose={p.onClose} width={300}>
      <div className="hd"><b>{label(i)}</b><span className="num">{i.code} · {CATEGORY_SINGULAR[i.category]} · {i.currency} · since {monthLabel(i.inception)}</span></div>
      <div className="figs">
        {fig('1Y', f?.y1 ? kv(f.y1.cum) : KPI_MISSING)}
        {fig('3Y p.a.', f?.y3 ? kv(f.y3.ann) : KPI_MISSING)}
        {fig('Vol. 3Y', f?.y3 ? kv(f.y3.vol, 2, false) : KPI_MISSING)}
      </div>
      <MenuButton disabled={full} icon={p.selected ? <Icon.minus /> : <Icon.plus />} hint={`${p.selectionCount}/${p.limit}`} onClick={() => { p.onToggle(); p.onClose(); }}>
        {p.selected ? 'Remove from selection' : 'Add to selection'}
      </MenuButton>
      {p.can.dashboard && <MenuButton icon={<Icon.dash />} onClick={() => { p.onClose(); p.onOpenDashboard(); }}>Open in dashboard</MenuButton>}
      {p.can.report && <MenuButton disabled={full} icon={<Icon.rep />} onClick={() => { p.onClose(); p.onAddToReport(); }}>Add to report</MenuButton>}
      {(p.can.rename || p.onEditTags || (p.can.editCustom && i.source === 'custom')) && <hr />}
      {p.can.rename && <MenuButton icon={<Icon.edit />} onClick={() => { setMsg(''); setMode('rename'); }}>Rename display name…</MenuButton>}
      {p.onEditTags && <MenuButton icon={<Icon.edit />} hint={i.tags.length || undefined} onClick={() => { p.onClose(); p.onEditTags!(); }}>Edit tags…</MenuButton>}
      {p.can.editCustom && i.source === 'custom' && <MenuButton icon={<Icon.edit />} onClick={() => { p.onClose(); p.onEditCustom(); }}>Edit custom series</MenuButton>}
      {p.onBenchmark && p.benchmark && <>
        <hr />
        <MenuButton icon={<Icon.dash />} hint={<span title={p.benchmark.sourceText}>{p.benchmark.name.length > 18 ? p.benchmark.name.slice(0, 17) + '…' : p.benchmark.name}</span>}
          onClick={() => { p.onClose(); p.onBenchmark!(); }}>Benchmark…</MenuButton>
      </>}
      {(p.canAddToFolders || p.removeFrom) && <hr />}
      {p.canAddToFolders && <MenuButton icon={<Icon.fold16 />} onClick={() => { setMsg(''); setMode('folders'); }}>Add to folder…</MenuButton>}
      {p.removeFrom && <MenuButton icon={<Icon.minus />} disabled={busy} onClick={() => act(p.removeFrom!.onRemove)}>Remove from “{p.removeFrom.name}”</MenuButton>}
      <hr />
      <MenuButton icon={<Icon.copy />} hint={<span className="num">{i.code}</span>} onClick={copy}>Copy ID</MenuButton>
      <div className="msg" role="status">{msg || (full ? `Selection is full (${p.limit}).` : '')}</div>
    </Popover>
  );
}
