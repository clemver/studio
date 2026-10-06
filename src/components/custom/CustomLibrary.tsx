/* Library of the user's custom series: search, tag filter, open, duplicate, delete. */
import { useState } from 'react';
import type { CustomSeriesDefinition, Tag } from '../../types';
import { customSummary } from '../../lib/custom';
import { monthLabel } from '../../lib/months';
import { Icon } from '../Icons';
import { Menu, usePopover } from '../Menu';

interface Props {
  defs: CustomSeriesDefinition[] | null;
  tags: Tag[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<boolean>;
}

export function CustomLibrary({ defs, tags, currentId, onOpen, onNew, onDuplicate, onSelect, onDelete }: Props) {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const menu = usePopover<string>();
  const needle = q.trim().toLowerCase();
  const list = (defs ?? []).filter(d => (!tag || d.tags.includes(tag)) && (!needle || `${d.name} ${d.code}`.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const used = tags.filter(t => (defs ?? []).some(d => d.tags.includes(t.id)));

  return (
    <aside className="ux-panel cs-lib" aria-label="Custom series library">
      <div className="gx-hd">
        <h2>Custom series</h2><span className="cnt num">{defs ? defs.length : ''}</span>
        <span className="rt"><button type="button" className="btn" onClick={onNew}><Icon.plus />New</button></span>
      </div>
      <div className="tools">
        <input className="inp" type="search" placeholder="Search name or ID" aria-label="Search custom series" value={q} onChange={ev => setQ(ev.target.value)} />
        <select className="sel" aria-label="Filter by tag" value={tag} onChange={ev => setTag(ev.target.value)}>
          <option value="">All tags</option>
          {used.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="ux-scroll">
        {!defs ? <div className="loading">Loading custom series…</div>
          : !list.length ? <div className="empty">{defs.length ? 'No custom series matches.' : 'No custom series yet. Use New to build one.'}</div>
            : list.map(d => (
              <div key={d.id} className="lib-item" role="button" tabIndex={0} aria-current={currentId === d.id}
                onClick={() => onOpen(d.id)} onKeyDown={ev => { if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onOpen(d.id); } }}>
                <span className="tx">
                  <b>{d.name}</b>
                  <small>{d.code} · {d.currency} · since {d.legs[0] ? monthLabel(d.legs[0].start) : '?'}</small>
                  <small>{customSummary(d)}</small>
                  {d.tags.length > 0 && (
                    <span className="tg">
                      {d.tags.map(t => { const x = tags.find(y => y.id === t); return <span key={t} className="tg-pill">{x?.name ?? t}</span>; })}
                    </span>
                  )}
                  {confirm === d.id && (
                    <span className="confirm" onClick={ev => ev.stopPropagation()}>
                      Delete “{d.name}”?
                      <button type="button" className="lnk" style={{ color: '#ffb3b8' }} onClick={async () => { setConfirm(null); await onDelete(d.id); }}>Delete</button>
                      <button type="button" className="lnk" onClick={() => setConfirm(null)}>Cancel</button>
                    </span>
                  )}
                </span>
                <button type="button" className="ib sm" aria-haspopup="menu" aria-expanded="false" aria-label={`Actions for ${d.name}`} title="Actions"
                  onClick={ev => { ev.stopPropagation(); menu.show({ el: ev.currentTarget, align: 'right' }, d.id); }}>
                  <Icon.dots />
                </button>
              </div>
            ))}
      </div>
      {menu.open && (
        <Menu anchor={menu.open.anchor} onClose={menu.close} items={[
          { label: 'Edit', icon: <Icon.edit />, onSelect: () => onOpen(menu.open!.data) },
          { label: 'Duplicate', icon: <Icon.dup />, onSelect: () => onDuplicate(menu.open!.data) },
          { label: 'Add to selection', icon: <Icon.plus />, onSelect: () => onSelect(menu.open!.data) },
          { kind: 'sep' },
          { label: 'Delete', icon: <Icon.trash />, onSelect: () => setConfirm(menu.open!.data) },
        ]} />
      )}
    </aside>
  );
}
