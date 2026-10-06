/* Segmented control on a --panel-2 track. */
export interface TabItem<K extends string> { key: K; label: React.ReactNode; disabled?: boolean; ariaLabel?: string }

export function Tabs<K extends string>({ items, value, onChange, ariaLabel }: { items: TabItem<K>[]; value: K; onChange: (k: K) => void; ariaLabel: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {items.map(it => (
        <button key={it.key} type="button" role="tab" aria-selected={value === it.key} disabled={it.disabled}
          aria-label={it.ariaLabel} title={it.ariaLabel} onClick={() => onChange(it.key)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
