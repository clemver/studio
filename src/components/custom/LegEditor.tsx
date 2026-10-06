/* One leg: start / end month, annual fees, instruments with weights. Presentational. */
import type { CustomLeg, TrackRecord } from '../../types';
import type { MonthGrid } from '../../lib/months';
import { monthLabel, monthsBetween } from '../../lib/months';
import { label } from '../../lib/domain';
import { num } from '../../lib/format';
import type { Issue } from '../../lib/custom';
import { Icon } from '../Icons';
import { NumInput } from '../NumInput';
import { StatusIcon } from '../StatusIcon';
import { Flag } from '../Marks';

interface Props {
  index: number;
  leg: CustomLeg;
  isLast: boolean;
  canRemove: boolean;
  grid: MonthGrid;
  currency: string;
  /** Last month the ongoing leg actually reaches (latest data of its instruments). */
  ongoingUntil: string | null;
  issues: Issue[];
  recordOf: (id: string) => TrackRecord | undefined;
  onChange: (p: Partial<CustomLeg>) => void;
  onRemove: () => void;
  onPick: (anchor: HTMLElement) => void;
}

export function LegEditor({ index, leg, isLast, canRemove, grid, currency, ongoingUntil, issues, recordOf, onChange, onRemove, onPick }: Props) {
  const min = grid.keys[0], max = grid.keys[grid.last];
  const total = leg.components.reduce((p, c) => p + (Number(c.weight) || 0), 0);
  const ok = Math.abs(total - 100) <= 0.005;
  const end = leg.end ?? ongoingUntil;
  const months = leg.start && end ? monthsBetween(leg.start, end) + 1 : null;

  const setWeight = (id: string, w: number) => onChange({ components: leg.components.map(c => (c.id === id ? { ...c, weight: w } : c)) });
  const equal = () => {
    const n = leg.components.length; if (!n) return;
    const base = Math.floor(10000 / n) / 100, rest = Math.round((100 - base * n) * 100) / 100;
    onChange({ components: leg.components.map((c, j) => ({ ...c, weight: j === 0 ? Math.round((base + rest) * 100) / 100 : base })) });
  };

  return (
    <section className={`leg${issues.length ? ' bad' : ''}`} aria-label={`Leg ${index + 1}`}>
      <div className="leg-hd">
        <b>Leg {index + 1}</b>
        <span className="rng num">
          {leg.start ? monthLabel(leg.start) : '?'} → {leg.end ? monthLabel(leg.end) : `ongoing${ongoingUntil ? ` (${monthLabel(ongoingUntil)})` : ''}`}
          {months != null && months > 0 ? ` · ${months} months` : ''}
        </span>
        <span className="sp" />
        {canRemove && <button type="button" className="ib sm" aria-label={`Remove leg ${index + 1}`} title="Remove leg" onClick={onRemove}><Icon.trash /></button>}
      </div>

      <div className="leg-fields">
        <div className="fld">
          <label htmlFor={`lg${index}s`}>Start month</label>
          <input id={`lg${index}s`} className="inp" type="month" min={min} max={max} value={leg.start} onChange={ev => onChange({ start: ev.target.value })} />
        </div>
        <div className="fld">
          <label htmlFor={`lg${index}e`}>End month</label>
          <input id={`lg${index}e`} className="inp" type="month" min={min} max={max} value={leg.end ?? ''} disabled={leg.end == null}
            onChange={ev => onChange({ end: ev.target.value || null })} />
        </div>
        {isLast && (
          <label className="cbx">
            <input type="checkbox" checked={leg.end == null} onChange={ev => onChange({ end: ev.target.checked ? null : (ongoingUntil ?? max) })} />
            Ongoing
          </label>
        )}
        <div className="fld">
          <label htmlFor={`lg${index}f`}>Ann. fees %</label>
          <NumInput id={`lg${index}f`} className="inp num fee" value={leg.fee} onChange={v => onChange({ fee: v })} aria-describedby={`lg${index}fh`} />
        </div>
        <span className="help" id={`lg${index}fh`}>p.a., deducted monthly</span>
      </div>

      {leg.components.length > 0 && (
        <table className="g comps">
          <thead><tr><th className="l">Instrument</th><th>Weight %</th><th aria-label="Remove" /></tr></thead>
          <tbody>
            {leg.components.map(c => {
              const r = recordOf(c.id), i = r?.inst;
              return (
                <tr key={c.id}>
                  <td className="l nm">
                    <span className="n">
                      {i ? label(i) : <span className="dim">Unavailable instrument</span>}
                      {i && i.currency !== currency && <StatusIcon kind="warn" message={`Returns in ${i.currency}, the series is in ${currency}. The server converts currencies; sample data does not.`} />}
                    </span>
                    {i && <small><Flag ccy={i.currency} />{i.currency} · {i.code} · since {monthLabel(i.inception)}</small>}
                  </td>
                  <td><NumInput aria-label={`Weight of ${i ? label(i) : c.id} in %`} value={c.weight} onChange={v => setWeight(c.id, v)} /></td>
                  <td className="kb">
                    <button type="button" className="ib sm" aria-label={`Remove ${i ? label(i) : c.id}`} title="Remove" onClick={() => onChange({ components: leg.components.filter(x => x.id !== c.id) })}>
                      <Icon.close />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="leg-ft">
        <button type="button" className="btn" aria-haspopup="dialog" aria-expanded="false" onClick={ev => onPick(ev.currentTarget)}><Icon.search16 />Add instruments</button>
        {leg.components.length > 1 && <button type="button" className="lnk" onClick={equal}>Equal weights</button>}
        <span className="sp" />
        {leg.components.length > 0 && (
          <span className={`tot num${ok ? '' : ' bad'}`}>
            {ok ? <StatusIcon kind="done" message="Weights total 100%" /> : <StatusIcon kind="error" message="Weights must total 100%" />}
            Total {num(total, 2)}%
          </span>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((x, k) => <li key={k}><StatusIcon kind="error" message="Issue" />{x.message.replace(/^Leg \d+: (.)/, (_, c: string) => c.toUpperCase())}</li>)}
        </ul>
      )}
    </section>
  );
}
