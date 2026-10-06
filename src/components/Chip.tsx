import type { ReactNode } from 'react';

/** Removable chip for an active criterion or a selected instrument. */
export function Chip({ children, onRemove, removeLabel, color }: { children: ReactNode; onRemove: () => void; removeLabel: string; color?: string }) {
  return (
    <span className="chip">
      {color && <span className="sw" style={{ '--c': color } as React.CSSProperties} />}
      {children}
      <button type="button" onClick={onRemove} aria-label={`Remove ${removeLabel}`} title="Remove">×</button>
    </span>
  );
}
