/*
 * Dark popover menus (#242426, 1px border, soft shadow). Close on outside click and Escape, arrow keys move
 * between items, focus returns to the anchor. Rendered in a portal with fixed positioning.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type Anchor =
  | { el: HTMLElement; align?: 'left' | 'right' | 'side' }
  | { x: number; y: number };

interface PopoverProps {
  anchor: Anchor;
  onClose: () => void;
  width?: number;
  className?: string;
  role?: string;
  ariaLabel?: string;
  children: ReactNode;
  /** Focus the first item on open (default true). */
  autoFocus?: boolean;
}

export function Popover({ anchor, onClose, width = 220, className = '', role = 'menu', ariaLabel, children, autoFocus = true }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const opened = useRef(performance.now());

  // Position against the anchor; flip above when there is no room below.
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, vw = innerWidth, vh = innerHeight;
    let x: number, y: number, flipY: number | null = null;
    if ('el' in anchor) {
      const r = anchor.el.getBoundingClientRect();
      if (anchor.align === 'side') { x = r.right + 8; y = Math.max(8, Math.min(r.top, vh - h - 8)); }
      else { x = anchor.align === 'right' ? r.right - w : r.left; y = r.bottom + 4; flipY = r.top; }
    } else { x = anchor.x; y = anchor.y; }
    if (y + h > vh - 8) y = Math.max(8, (flipY ?? y) - h - 4);
    el.style.left = Math.max(8, Math.min(x, vw - w - 8)) + 'px';
    el.style.top = y + 'px';
  });

  useEffect(() => {
    const anchorEl = 'el' in anchor ? anchor.el : null;
    anchorEl?.setAttribute('aria-expanded', 'true');
    if (autoFocus) {
      const first = ref.current?.querySelector<HTMLElement>('input, .mi:not(:disabled)');
      first?.focus({ preventScroll: true });
      if (first instanceof HTMLInputElement) first.select();
    }
    const down = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (ref.current?.contains(t) || anchorEl?.contains(t)) return;
      onClose();
    };
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { onClose(); anchorEl?.focus(); } };
    const scroll = (ev: Event) => {
      if (performance.now() - opened.current < 300) return;
      if (ref.current && ev.target instanceof Node && ref.current.contains(ev.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', scroll, { capture: true, passive: true });
    return () => {
      anchorEl?.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', scroll, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('.mi:not(:disabled)') ?? [])];
    if (!items.length) return;
    ev.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[ev.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length].focus();
  };

  return createPortal(
    <div ref={ref} className={`pop ${className}`} role={role} aria-label={ariaLabel} style={{ left: -9999, top: -9999, minWidth: width } as CSSProperties} onKeyDown={onKeyDown}>
      {children}
    </div>,
    document.body,
  );
}

/* ---------- simple menu built from items ---------- */
export type MenuItem =
  | { kind?: 'item'; label: ReactNode; onSelect: () => void; icon?: ReactNode; check?: boolean; disabled?: boolean; hint?: ReactNode }
  | { kind: 'sep' }
  | { kind: 'note'; text: ReactNode };

export function Menu({ anchor, items, onClose, width, head }: { anchor: Anchor; items: MenuItem[]; onClose: () => void; width?: number; head?: ReactNode }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={width}>
      {head && <div className="hd">{head}</div>}
      {items.map((it, k) => {
        if (it.kind === 'sep') return <hr key={k} />;
        if (it.kind === 'note') return <div key={k} className="msg">{it.text}</div>;
        return (
          <MenuButton key={k} icon={it.icon} check={it.check} disabled={it.disabled} hint={it.hint}
            onClick={() => { onClose(); it.onSelect(); }}>
            {it.label}
          </MenuButton>
        );
      })}
    </Popover>
  );
}

export function MenuButton({ children, onClick, icon, check, disabled, hint }: { children: ReactNode; onClick: () => void; icon?: ReactNode; check?: boolean; disabled?: boolean; hint?: ReactNode }) {
  return (
    <button type="button" className="mi" role={check != null ? 'menuitemcheckbox' : 'menuitem'} aria-checked={check ?? undefined}
      disabled={disabled} onClick={onClick}>
      {check != null && <span className="ck">{check ? '✓' : ''}</span>}
      {icon}
      <span>{children}</span>
      {hint != null && <span className="k">{hint}</span>}
    </button>
  );
}

/** Hook for a button that toggles a popover. */
export function usePopover<T = true>() {
  const [open, setOpen] = useState<{ anchor: Anchor; data: T } | null>(null);
  return {
    open,
    show: (anchor: Anchor, data: T = true as T) => setOpen(o => (o && 'el' in o.anchor && 'el' in anchor && o.anchor.el === anchor.el ? null : { anchor, data })),
    close: () => setOpen(null),
  };
}
