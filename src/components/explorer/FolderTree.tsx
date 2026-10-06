/*
 * Left folder tree. Watchlist (blue): the curated part of the universe, filled by admins; "My folders" (yellow) belong
 * to the user. Presentational: the page passes nodes and handlers.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FolderNode } from '../../hooks/useFolders';
import { Icon } from '../Icons';
import { Menu, usePopover } from '../Menu';
import { CUSTOM_ROOT } from '../../hooks/useFolders';

interface Props {
  nodes: FolderNode[];
  current: string;
  onSelect: (id: string) => void;
  /** Advanced users have their own folders. */
  canOwnFolders: boolean;
  /** watchlist.manage: create Watchlist folders, add and remove their instruments. */
  canManageWatchlist: boolean;
  loading: boolean;
  /** New folder of a kind (system: admins), optionally under a parent of the same kind. Returns the new id. */
  onCreate: (kind: 'user' | 'system' | 'custom', parentId: string | null) => Promise<string>;
  onAddInstruments: (folderId: string, anchor: HTMLElement) => void;
  /** Folder benchmark (admins on Watchlist folders, owners on their own folders). */
  onBenchmark: (folderId: string, anchor: HTMLElement) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCollapse: () => void;
  /** Custom series folder: open the custom series page (new = start a new series). */
  onCustom?: (action: 'new' | 'manage') => void;
}

export function FolderTree(p: Props) {
  const [find, setFind] = useState('');
  const [openSys, setOpenSys] = useState(true);
  const [openUser, setOpenUser] = useState(true);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const menu = usePopover<string>();
  const customMenu = usePopover();

  const q = find.trim().toLowerCase();
  const childrenOf = (id: string | null) => p.nodes.filter(n => n.parentId === id);
  const matches = (n: FolderNode): boolean => !q || n.name.toLowerCase().includes(q) || childrenOf(n.id).some(matches);
  const roots = useMemo(() => p.nodes.filter(n => n.parentId == null), [p.nodes]);
  const sys = roots.filter(n => n.kind === 'system' && matches(n));
  const mine = roots.filter(n => n.kind === 'user' && matches(n));
  const customs = roots.filter(n => n.kind === 'custom' && matches(n));
  const [openCustom, setOpenCustom] = useState(true);

  /** Under a parent, "Model portfolios EUR" shows as "EUR". */
  const shortName = (n: FolderNode) => {
    const parent = n.parentId ? p.nodes.find(x => x.id === n.parentId) : undefined;
    return parent && n.name.startsWith(parent.name + ' ') ? n.name.slice(parent.name.length + 1) : n.name;
  };

  const commitRename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    setEditing(null);
    if (name) await p.onRename(editing.id, name);
  };

  const node = (n: FolderNode, depth: number): React.ReactNode => {
    const kids = childrenOf(n.id).filter(matches);
    const open = !!q || !collapsed.includes(n.id);
    const isEditing = editing?.id === n.id;
    const tip = n.kind === 'system' && !n.virtual ? (p.canManageWatchlist ? 'Watchlist · you can add and remove instruments' : 'Watchlist · maintained by admins') : undefined;
    return (
      <div key={n.id} role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={p.current === n.id}>
        <div className="tnode" style={{ '--d': depth } as CSSProperties} aria-current={p.current === n.id} tabIndex={0} title={tip}
          onClick={() => !isEditing && p.onSelect(n.id)}
          onKeyDown={ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); p.onSelect(n.id); } }}>
          {kids.length ? (
            <button type="button" className="tch" aria-expanded={open} aria-label={open ? `Collapse ${n.name}` : `Expand ${n.name}`}
              onClick={ev => { ev.stopPropagation(); setCollapsed(c => (c.includes(n.id) ? c.filter(x => x !== n.id) : [...c, n.id])); }}>
              <Icon.chev />
            </button>
          ) : <span className="tch none" />}
          {n.home ? <Icon.homeSm className="fi home" /> : <Icon.folder className={`fi ${n.kind === 'system' ? 'sys' : 'usr'}`} />}
          {isEditing ? (
            <input className="inp" autoFocus onFocus={ev => ev.currentTarget.select()} value={editing.name} maxLength={60} aria-label="Folder name"
              onClick={ev => ev.stopPropagation()} onChange={ev => setEditing({ id: n.id, name: ev.target.value })}
              onBlur={commitRename} onKeyDown={ev => { if (ev.key === 'Enter') commitRename(); if (ev.key === 'Escape') setEditing(null); }} />
          ) : confirm === n.id ? (
            <span className="confirm" onClick={ev => ev.stopPropagation()}>
              Delete “{n.name}”?
              <button type="button" className="lnk danger" onClick={async () => { setConfirm(null); await p.onDelete(n.id); }}>Delete</button>
              <button type="button" className="lnk" onClick={() => setConfirm(null)}>Cancel</button>
            </span>
          ) : (
            <>
              <span className="nm" title={n.name}>{shortName(n)}</span>
              <span className="ct num">{n.ids.size}</span>
              <span className="acts">
              {n.id === CUSTOM_ROOT && p.onCustom && <>
                <button type="button" className="ib sm" aria-label="New custom series" data-tip="New custom series"
                  onClick={ev => { ev.stopPropagation(); p.onCustom!('new'); }}>
                  <Icon.plus />
                </button>
                <button type="button" className="ib sm" aria-haspopup="menu" aria-expanded="false" aria-label="Custom series actions" title="Custom series actions"
                  onClick={ev => { ev.stopPropagation(); customMenu.show({ el: ev.currentTarget, align: 'right' }); }}>
                  <Icon.dots />
                </button>
              </>}
              {!n.virtual && n.editable && (
                <button type="button" className="ib sm" aria-haspopup="menu" aria-expanded="false" aria-label={`Actions for ${n.name}`} title="Folder actions"
                  onClick={ev => { ev.stopPropagation(); menu.show({ el: ev.currentTarget, align: 'right' }, n.id); }}>
                  <Icon.dots />
                </button>
              )}
              </span>
            </>
          )}
        </div>
        {kids.length > 0 && open && <div role="group">{kids.map(k => node(k, depth + 1))}</div>}
      </div>
    );
  };

  const menuNode = menu.open ? p.nodes.find(n => n.id === menu.open!.data) : undefined;

  return (
    <aside className="ux-tree" aria-label="Folders">
      {p.canOwnFolders && (
        <button type="button" className="btn" onClick={async () => { const id = await p.onCreate('user', null); setEditing({ id, name: 'New folder' }); setOpenUser(true); }}>
          <Icon.plus />New folder
        </button>
      )}
      <input className="inp" type="search" placeholder="Find folder" aria-label="Find folder" value={find} onChange={ev => setFind(ev.target.value)} />
      <div className="tree" role="tree" aria-label="Folders">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button type="button" className="tree-sec" aria-expanded={openSys} onClick={() => setOpenSys(o => !o)}>
            Watchlist<span className="sp" /><Icon.chev />
          </button>
          {p.canManageWatchlist && (
            <button type="button" className="ib sm" aria-label="New watchlist folder" title="New watchlist folder (admin)"
              onClick={async () => { const id = await p.onCreate('system', null); setOpenSys(true); setEditing({ id, name: 'New folder' }); }}>
              <Icon.plus />
            </button>
          )}
        </div>
        {openSys && (p.loading && sys.length <= 1 ? <div className="tree-note">Loading folders…</div> : sys.map(n => node(n, 0)))}
        {p.canOwnFolders && <>
          <button type="button" className="tree-sec" aria-expanded={openUser} onClick={() => setOpenUser(o => !o)}>
            My folders<span className="sp" /><Icon.chev />
          </button>
          {openUser && (mine.length ? mine.map(n => node(n, 0))
            : <div className="tree-note">{q ? 'No folder matches.' : 'No folders yet. Use New folder, then add instruments from the row menu.'}</div>)}
        </>}
        {customs.length > 0 && <>
          <button type="button" className="tree-sec" aria-expanded={openCustom} onClick={() => setOpenCustom(o => !o)}>
            Custom series<span className="sp" /><Icon.chev />
          </button>
          {openCustom && customs.map(n => node(n, 0))}
        </>}
        {q && !sys.length && !mine.length && !customs.length && <div className="tree-note">No folder matches.</div>}
      </div>
      <div className="tree-foot">
        <button type="button" className="ib sm" aria-label="Hide folders" title="Hide folders" onClick={p.onCollapse}><Icon.left /></button>
      </div>
      {customMenu.open && p.onCustom && (
        <Menu anchor={customMenu.open.anchor} onClose={customMenu.close} items={[
          { label: 'New custom series', icon: <Icon.plus />, onSelect: () => p.onCustom!('new') },
          {
            label: 'New sub-folder', icon: <Icon.folder className="fi usr" style={{ width: 16, height: 16 }} />,
            onSelect: async () => { const id = await p.onCreate('custom', null); setCollapsed(c => c.filter(x => x !== CUSTOM_ROOT)); setEditing({ id, name: 'New folder' }); },
          },
          { label: 'Manage custom series', icon: <Icon.custom style={{ width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }} />, onSelect: () => p.onCustom!('manage') },
        ]} />
      )}
      {menu.open && menuNode && (
        <Menu anchor={menu.open.anchor} onClose={menu.close} head={menuNode.kind === 'system' ? <span className="dim">Watchlist · admin</span> : undefined} items={[
          { label: 'Add instruments…', icon: <Icon.plus />, onSelect: () => { const el = menu.open?.anchor; if (el && 'el' in el) p.onAddInstruments(menuNode.id, el.el); } },
          ...(!menuNode.parentId && menuNode.kind !== 'custom' ? [{
            label: 'New sub-folder', icon: <Icon.folder className={`fi ${menuNode.kind === 'system' ? 'sys' : 'usr'}`} style={{ width: 16, height: 16 }} />,
            onSelect: async () => { const id = await p.onCreate(menuNode.kind, menuNode.id); setCollapsed(c => c.filter(x => x !== menuNode.id)); setEditing({ id, name: 'New folder' }); },
          }] : []),
          { label: 'Set folder benchmark…', icon: <Icon.dash />, onSelect: () => { const el = menu.open?.anchor; if (el && 'el' in el) p.onBenchmark(menuNode.id, el.el); } },
          { label: 'Rename', icon: <Icon.edit />, onSelect: () => setEditing({ id: menuNode.id, name: menuNode.name }) },
          { label: 'Delete', icon: <Icon.trash />, onSelect: () => setConfirm(menuNode.id) },
        ]} />
      )}
    </aside>
  );
}
