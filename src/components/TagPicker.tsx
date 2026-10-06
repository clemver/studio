/*
 * Tag picker: every tag with a checkbox and how many securities use it, most used first.
 * Search filters the list and offers to create a missing tag. Done applies, × closes without changes.
 */
import { useMemo, useState } from 'react';
import type { Tag } from '../types';
import type { Anchor } from './Menu';
import { Popover } from './Menu';
import { Icon } from './Icons';

interface Props {
  anchor: Anchor;
  /** What is being tagged (shown under the title). */
  subtitle: string;
  value: string[];
  tags: Tag[];
  /** Tag id → number of securities using it. */
  counts: Map<string, number>;
  onCreate: (name: string) => Promise<Tag>;
  /** Apply the selection; may throw (the message is shown). */
  onDone: (ids: string[]) => Promise<void> | void;
  onClose: () => void;
}

export function TagPicker({ anchor, subtitle, value, tags, counts, onCreate, onDone, onClose }: Props) {
  const [ids, setIds] = useState(value);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Frequency order is taken from the saved counts, so rows don't jump while ticking.
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tags.filter(t => !needle || t.name.toLowerCase().includes(needle))
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, [tags, counts, q]);
  const exact = tags.some(t => t.name.toLowerCase() === q.trim().toLowerCase());
  const toggle = (id: string) => setIds(v => (v.includes(id) ? v.filter(x => x !== id) : [...v, id]));

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e instanceof Error && 'detail' in e ? (e as { detail: string }).detail : String(e)); } finally { setBusy(false); }
  };
  const create = () => run(async () => { const t = await onCreate(q.trim()); setIds(v => [...v, t.id]); setQ(''); });
  const done = () => run(async () => { await onDone(ids); onClose(); });

  return (
    <Popover anchor={anchor} onClose={onClose} width={320} className="tagpick" role="dialog" ariaLabel="Tags" autoFocus={false}>
      <div className="tp-hd">
        <span><b>Tags</b><small>{subtitle}</small></span>
        <button type="button" className="ib sm" aria-label="Close" title="Close" onClick={onClose}><Icon.close /></button>
      </div>
      <div className="tp-tools">
        <button type="button" className="lnk" disabled={!ids.length} onClick={() => setIds([])}>Reset</button>
        <span className="vsep" />
        {searching
          ? <input className="inp" type="search" autoFocus placeholder="Find or create a tag" aria-label="Find or create a tag" value={q}
            onChange={ev => setQ(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Enter' && q.trim()) { ev.preventDefault(); if (!exact) create(); else if (list[0]) toggle(list[0].id); } }} />
          : <button type="button" className="ib sm" aria-label="Search tags" title="Search" onClick={() => setSearching(true)}><Icon.search16 /></button>}
      </div>
      <div className="tp-list">
        {list.map(t => {
          const on = ids.includes(t.id);
          return (
            <button key={t.id} type="button" className="tp-row" role="checkbox" aria-checked={on} onClick={() => toggle(t.id)}>
              <span className={`box${on ? ' on' : ''}`} />
              <span className="nm">{t.name}</span>
              <span className="ct num">{counts.get(t.id) ?? 0}</span>
            </button>
          );
        })}
        {q.trim() && !exact && (
          <button type="button" className="tp-row" disabled={busy} onClick={create}>
            <Icon.plus style={{ width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }} />
            <span className="nm">Create “{q.trim()}”</span>
          </button>
        )}
        {!list.length && !q.trim() && <div className="msg">No tags yet. Use 🔍 to create one.</div>}
      </div>
      {err && <div className="msg" style={{ color: '#ffb3b8' }}>{err}</div>}
      <div className="tp-ft">
        <button type="button" className="btn sec" disabled={busy} onClick={done}>{busy ? 'Saving…' : 'Done'}</button>
      </div>
    </Popover>
  );
}
