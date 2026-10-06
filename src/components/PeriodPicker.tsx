/* Period selector shared by the Dashboard and Reports: preset tabs and a Custom popover with two dates. */
import type { PickPeriod, DateRange } from '../lib/period';
import { PERIOD_TABS } from '../lib/period';
import { Popover, usePopover } from './Menu';
import { Icon } from './Icons';

interface Props {
  value: PickPeriod;
  custom: DateRange;
  onChange: (p: { period?: PickPeriod; custom?: DateRange }) => void;
  /** Shown above the tabs, e.g. `31.12.2025 → 30.09.2026`. */
  label: string;
  /** Short note in the label tooltip (e.g. rounding to month ends). */
  tip?: string;
}

export function PeriodPicker({ value, custom, onChange, label, tip }: Props) {
  const pop = usePopover();
  return (
    <div className="fld">
      <span className="lb num" data-tip={tip}>{label}</span>
      <div className="tabs" role="tablist" aria-label="Period">
        {PERIOD_TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={value === k} aria-haspopup={k === 'CUSTOM' ? 'dialog' : undefined}
            onClick={ev => { onChange({ period: k }); if (k === 'CUSTOM') pop.show({ el: ev.currentTarget }); }}>
            {l}{k === 'CUSTOM' && <Icon.down style={{ width: 10, height: 10, marginLeft: 6, fill: 'none', stroke: 'currentColor', strokeWidth: 2 }} />}
          </button>
        ))}
      </div>
      {pop.open && (
        <Popover anchor={pop.open.anchor} onClose={pop.close} width={300} role="dialog" ariaLabel="Custom period">
          <div className="hd"><b>Custom period</b><span>From is the first day included, To the last one</span></div>
          <div className="form">
            <div className="fld"><label htmlFor="pFrom">From</label><input id="pFrom" className="inp" type="date" value={custom.from} onChange={ev => onChange({ custom: { ...custom, from: ev.target.value } })} /></div>
            <div className="fld"><label htmlFor="pTo">To</label><input id="pTo" className="inp" type="date" value={custom.to} onChange={ev => onChange({ custom: { ...custom, to: ev.target.value } })} /></div>
            <button type="button" className="btn" onClick={pop.close}>Done</button>
          </div>
        </Popover>
      )}
    </div>
  );
}
