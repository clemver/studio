/*
 * One tooltip layer for the whole app: any element with `data-tip` shows a white bubble, grey 12px text,
 * one line, arrow pointing down (flips below when there is no room above).
 */
import { useEffect, useRef, useState } from 'react';

export function TooltipLayer() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);

  useEffect(() => {
    const show = (ev: Event) => {
      const el = (ev.target as Element | null)?.closest?.('[data-tip]');
      const text = el?.getAttribute('data-tip');
      setTip(el && text ? { text, rect: el.getBoundingClientRect() } : null);
    };
    const hide = () => setTip(null);
    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    return () => {
      document.removeEventListener('mouseover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', hide, { capture: true });
    };
  }, []);

  useEffect(() => {
    const el = ref.current; if (!el || !tip) return;
    const r = tip.rect, w = el.offsetWidth, h = el.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    let top = r.top - h - 9, below = false;
    if (top < 8) { top = r.bottom + 9; below = true; }
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.setProperty('--ax', r.left + r.width / 2 - left + 'px');
    el.classList.toggle('below', below);
  }, [tip]);

  return <div ref={ref} className="tip" role="tooltip" hidden={!tip}>{tip?.text}</div>;
}
