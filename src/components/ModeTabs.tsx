import { Tabs } from './Tabs';

/** Absolute | Relative (to each benchmark) selector for a chart or table. */
export function ModeTabs({ relative, onChange }: { relative: boolean; onChange: (relative: boolean) => void }) {
  return (
    <span data-tip="Relative: returns vs each benchmark, (1 + r) / (1 + b) − 1">
      <Tabs ariaLabel="Absolute or relative" value={relative ? 'rel' : 'abs'} onChange={v => onChange(v === 'rel')}
        items={[{ key: 'abs', label: 'Absolute' }, { key: 'rel', label: 'Relative' }]} />
    </span>
  );
}
