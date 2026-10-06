/*
 * Catalogue grid: Description · ID · Risk profile · Ccy · YTD · 1Y · 3Y p.a. · 5Y p.a. · Incep. p.a.
 * · Vol. 3Y · Excess 1Y · ⋮. Risk profile and Ccy headers can be dragged into the row-group zone.
 */
import type { CSSProperties } from 'react';
import type { TrackRecord } from '../../types';
import type { MonthGrid } from '../../lib/months';
import { monthLabel } from '../../lib/months';
import { label } from '../../lib/domain';
import { CELL_MISSING, a2, g2, tp } from '../../lib/format';
import type { Group, GroupField, Row, SortKey } from '../../hooks/useExplorer';
import { Icon } from '../Icons';
import { ExcessBar, Flag, RiskDots, SourceTag } from '../Marks';
import { StatusIcon } from '../StatusIcon';
import type { BenchmarkInfo } from '../../hooks/useBenchmarks';

interface Props {
  grid: MonthGrid;
  rows: Row[];
  groups: Group[] | null;
  collapsed: string[];
  showBenchmarkLine: boolean;
  showExcess: boolean;
  sort: SortKey;
  selection: string[];
  limit: number;
  openMenuId: string | null;
  colorOf: (id: string) => string;
  onSort: (k: SortKey) => void;
  onToggleGroup: (key: string) => void;
  /** Row click with modifiers: ctrl/⌘ adds or removes, shift selects a range, touch taps toggle. */
  onRowClick: (id: string, mods: RowClickMods) => void;
  onMenu: (id: string, anchor: HTMLElement) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  /** Effective benchmark in the folder being viewed. */
  benchOf: (id: string) => BenchmarkInfo | null;
}

/** Warning when history < 36 months, or for uploads with carried-forward months. */
function historyStatus(rec: TrackRecord, grid: MonthGrid) {
  const months = grid.last - rec.incIdx + 1, i = rec.inst;
  if (i.source === 'upload' && i.carriedForwardMonths) return <StatusIcon kind="warn" message={`${i.carriedForwardMonths} missing months carried forward from the file`} />;
  if (months < 36) return <StatusIcon kind="warn" message={`Short track record: ${months} months since ${monthLabel(i.inception)}`} />;
  return null;
}

const COLS = 12;

export interface RowClickMods { ctrl: boolean; shift: boolean; touch: boolean }

export function CatalogueGrid(p: Props) {
  const th = (k: SortKey, text: string, cls: string, tip?: string) => (
    <th className={cls} data-tip={tip}>
      <button type="button" onClick={() => p.onSort(k)} aria-label={`Sort by ${text}`}>{text}{p.sort === k ? ' ↓' : ''}</button>
    </th>
  );
  const dragTh = (field: GroupField, text: string, cls: string) => (
    <th className={`l ${cls}`} draggable data-tip="Drag to the row-group zone to group by this column"
      onDragStart={ev => { ev.dataTransfer.setData('text/x-group', field); ev.dataTransfer.effectAllowed = 'copy'; }}>
      {text}
    </th>
  );

  const row = ({ rec, f }: Row) => {
    const i = rec.inst, on = p.selection.includes(i.id);
    const ex = f.y1?.excess ?? null;
    const exTip = f.y1 && f.y1.bcum != null ? `Strategy ${tp(f.y1.cum)} → ${p.benchOf(i.id)?.name ?? 'Benchmark'} ${tp(f.y1.bcum)}` : 'No benchmark for the full year';
    const cell = (v: string, cls: string) => <td className={`num ${cls}`}>{v}</td>;
    return (
      <tr key={i.id} className={`row${on ? ' on' : ''}${p.openMenuId === i.id ? ' open' : ''}`} data-id={i.id} tabIndex={0}
        aria-selected={on} style={on ? ({ '--c': p.colorOf(i.id) } as CSSProperties) : undefined}
        // Shift-click must not select page text.
        onMouseDown={ev => { if (ev.shiftKey) ev.preventDefault(); }}
        onClick={ev => p.onRowClick(i.id, { ctrl: ev.ctrlKey || ev.metaKey, shift: ev.shiftKey, touch: (ev.nativeEvent as PointerEvent).pointerType === 'touch' })}
        onContextMenu={ev => { ev.preventDefault(); p.onContextMenu(i.id, ev.clientX, ev.clientY); }}
        onKeyDown={ev => {
          if (ev.target !== ev.currentTarget) return;
          // Enter = click, Space = ctrl-click (add / remove); shift works with both.
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); p.onRowClick(i.id, { ctrl: ev.key === ' ' || ev.ctrlKey || ev.metaKey, shift: ev.shiftKey, touch: false }); }
          if (ev.key === 'ContextMenu') { ev.preventDefault(); const b = ev.currentTarget.querySelector<HTMLElement>('.kb .ib'); if (b) p.onMenu(i.id, b); }
        }}>
        <td className="nm">
          <span className="n">{label(i)}<SourceTag source={i.source} />{historyStatus(rec, p.grid)}</span>
          {p.showBenchmarkLine && (() => {
            const b = p.benchOf(i.id);
            // Custom series and uploads without a benchmark keep their construction / file line.
            const line = b && (b.id || i.source === 'api') ? `vs ${b.name}` : i.benchmarkName ?? '';
            return (
              <small data-tip={b && (b.id || i.source === 'api') ? `Benchmark: ${b.name} · ${b.sourceText}${b.warning ? ` · ${b.warning}` : ''}` : undefined}>
                {i.alias ? `Source: ${i.name} · ` : ''}{line}
                <span className="since"> · since {monthLabel(i.inception)}</span>
              </small>
            );
          })()}
        </td>
        <td className="l c-id"><span className="idl num">{i.code}</span></td>
        <td className="l c-risk">{i.riskProfile ? <><RiskDots risk={i.riskProfile} />{i.riskProfile}</> : CELL_MISSING}</td>
        <td className="l c-ccy"><Flag ccy={i.currency} />{i.currency}</td>
        {cell(f.ytd ? g2(f.ytd.cum) : CELL_MISSING, 'c-ytd')}
        {cell(f.y1 ? g2(f.y1.cum) : CELL_MISSING, 'c-y1')}
        {cell(f.y3 ? g2(f.y3.ann) : CELL_MISSING, 'c-y3')}
        {cell(f.y5 ? g2(f.y5.ann) : CELL_MISSING, 'c-y5')}
        {cell(f.itd?.ann != null ? g2(f.itd.ann) : CELL_MISSING, 'c-itd')}
        {cell(f.y3 ? a2(f.y3.vol) : CELL_MISSING, 'c-vol')}
        {p.showExcess
          ? <td className="num c-ex">{ex == null ? CELL_MISSING : <>{g2(ex)}<ExcessBar value={ex} tip={exTip} /></>}</td>
          : <td className="c-ex" />}
        <td className="kb">
          <button type="button" className="ib sm" aria-haspopup="menu" aria-expanded={p.openMenuId === i.id} aria-label={`Actions for ${label(i)}`} title="Actions"
            onClick={ev => { ev.stopPropagation(); p.onMenu(i.id, ev.currentTarget); }}>
            <Icon.dots />
          </button>
        </td>
      </tr>
    );
  };

  return (
    <table className="g">
      <thead>
        <tr>
          <th className="l"><button type="button" onClick={() => p.onSort('name')}>Description{p.sort === 'name' ? ' ↓' : ''}</button></th>
          <th className="l c-id">ID</th>
          {dragTh('riskProfile', 'Risk profile', 'c-risk')}
          {dragTh('currency', 'Ccy', 'c-ccy')}
          {th('ytd', 'YTD', 'c-ytd')}{th('y1', '1Y', 'c-y1')}{th('y3', '3Y p.a.', 'c-y3')}{th('y5', '5Y p.a.', 'c-y5')}{th('itd', 'Incep. p.a.', 'c-itd')}{th('vol', 'Vol. 3Y', 'c-vol')}
          {p.showExcess ? th('ex', 'Excess 1Y', 'c-ex', 'vs benchmark · red bar: more than 1 point behind') : <th className="c-ex" />}
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {p.groups
          ? p.groups.flatMap(g => {
            const open = !p.collapsed.includes(g.key);
            return [
              <tr key={'g-' + g.key} className="grp">
                <td colSpan={COLS}>
                  <button type="button" aria-expanded={open} onClick={() => p.onToggleGroup(g.key)}>
                    <Icon.chev />{g.label} <span className="dim num">({g.rows.length})</span>
                  </button>
                </td>
              </tr>,
              ...(open ? g.rows.map(row) : []),
            ];
          })
          : p.rows.map(row)}
      </tbody>
    </table>
  );
}
