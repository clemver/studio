/* Instrument search picker (popover): search, grouped by category; multi-select with Add, or single pick. */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Instrument } from '../types';
import type { Anchor } from './Menu';
import { Popover } from './Menu';
import { CATEGORIES, CATEGORY_PLURAL, label } from '../lib/domain';
import { monthLabel } from '../lib/months';

interface Props {
  anchor: Anchor;
  title: string;
  instruments: Instrument[];
  /** Already chosen: shown ticked and disabled. */
  taken?: string[];
  /** Not offered at all (e.g. the series itself, or series that use it). */
  exclude?: string[];
  okLabel?: string;
  /** Single pick: a click picks and closes; `current` is shown ticked. */
  single?: boolean;
  current?: string | null;
  /** Extra content under the title (e.g. level tabs, "use inherited"). */
  header?: ReactNode;
  /** Shows "Not in the list? Import from Excel". */
  onImport?: () => void;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}

export function InstrumentPicker({ anchor, title, instruments, taken = [], exclude = [], okLabel = 'Add', single, current, header, onImport, onClose, onAdd }: Props) {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return instruments.filter(i => !exclude.includes(i.id) &&
      (!needle || `${label(i)} ${i.name} ${i.code} ${i.currency} ${i.riskProfile ?? ''}`.toLowerCase().includes(needle)));
  }, [instruments, exclude, q]);
  const toggle = (id: string) => setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));

  return (
    <Popover anchor={anchor} onClose={onClose} width={360} className="picker" role="dialog" ariaLabel={title}>
      <div className="top">
        <b>{title}</b>
        {header}
        <input className="inp" type="search" placeholder="Search name, ID or currency" aria-label="Search instruments" value={q} onChange={ev => setQ(ev.target.value)}
          onKeyDown={ev => { if (ev.key === 'Enter' && chosen.length && !single) { onAdd(chosen); onClose(); } }} />
      </div>
      <div className="lst">
        {list.length ? CATEGORIES.map(c => {
          const g = list.filter(i => i.category === c);
          if (!g.length) return null;
          return (
            <div key={c}>
              <div className="gl">{CATEGORY_PLURAL[c]}</div>
              {g.map(i => {
                const isTaken = taken.includes(i.id), on = single ? current === i.id : isTaken || chosen.includes(i.id);
                return (
                  <button key={i.id} type="button" className="it" disabled={isTaken} aria-pressed={on}
                    onClick={() => { if (single) { onAdd([i.id]); onClose(); } else toggle(i.id); }}>
                    <span className={`box${on ? ' on' : ''}`} />
                    <span className="tx">{label(i)}<small>{i.currency} · {i.riskProfile ?? CATEGORY_PLURAL[i.category]} · since {monthLabel(i.inception)}{isTaken ? ' · already added' : ''}</small></span>
                  </button>
                );
              })}
            </div>
          );
        }) : <div className="empty">No instrument matches this search.</div>}
        {onImport && <div className="msg" style={{ padding: '10px 14px' }}>Not in the list? <button type="button" className="lnk" onClick={() => { onClose(); onImport(); }}>Import from Excel</button></div>}
      </div>
      {!single && <div className="bot">
        <span>{chosen.length} selected</span>
        <button type="button" className="btn sec" onClick={onClose}>Cancel</button>
        <button type="button" className="btn" disabled={!chosen.length} onClick={() => { onAdd(chosen); onClose(); }}>{okLabel}</button>
      </div>}
    </Popover>
  );
}
