/*
 * Pick a benchmark (any instrument or custom series) at one of the levels this user may edit:
 * this personal folder, a folder, or the instrument for all users (admins). "Use inherited" clears the level.
 */
import { useState } from 'react';
import type { Instrument } from '../types';
import type { Anchor } from './Menu';
import { InstrumentPicker } from './InstrumentPicker';
import { Tabs } from './Tabs';

export interface BenchmarkLevel {
  key: string;
  label: string;
  /** Benchmark set at this level (null = not set here). */
  current: string | null;
  /** What applies when nothing is set at this level. */
  inheritedName: string;
  help: string;
}

interface Props {
  anchor: Anchor;
  title: string;
  levels: BenchmarkLevel[];
  instruments: Instrument[];
  /** Not offered (the instrument itself). */
  exclude: string[];
  onClose: () => void;
  onPick: (level: string, benchmarkId: string | null) => void;
}

export function BenchmarkPicker({ anchor, title, levels, instruments, exclude, onClose, onPick }: Props) {
  const [lv, setLv] = useState(levels[0].key);
  const level = levels.find(l => l.key === lv) ?? levels[0];
  return (
    <InstrumentPicker anchor={anchor} title={title} instruments={instruments} exclude={exclude} single current={level.current}
      onClose={onClose} onAdd={ids => onPick(level.key, ids[0])}
      header={<>
        {levels.length > 1 && <Tabs ariaLabel="Benchmark level" value={lv} onChange={setLv} items={levels.map(l => ({ key: l.key, label: l.label }))} />}
        <span className="dim" style={{ fontSize: 12 }}>{level.help}</span>
        <button type="button" className="it" aria-pressed={level.current == null} onClick={() => { onPick(level.key, null); onClose(); }}>
          <span className={`box${level.current == null ? ' on' : ''}`} />
          <span className="tx">Use inherited<small>{level.inheritedName}</small></span>
        </button>
      </>} />
  );
}
