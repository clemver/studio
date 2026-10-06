/* Full-screen view of one preview page or slide: arrows / ← → to browse, Esc or the backdrop to close. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MockPages } from './MockPages';
import { Icon } from '../Icons';
import { PX, SH, SW } from '../../lib/slides';

interface Props { pages: string[]; layout: 'a4' | 'slides'; index: number; onIndex: (i: number) => void; onClose: () => void; caption: string }

export function PageViewer({ pages, layout, index, onIndex, onClose, caption }: Props) {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const resize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < pages.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('keydown', key); };
  }, [index, pages.length, onIndex, onClose]);

  const [w, h] = layout === 'a4' ? [794, 1123] : [SW * PX, SH * PX];
  // Fit inside the viewport with room for the bar and the arrows; never above 1.4× natural size.
  const width = Math.min((vp.w - 120) , ((vp.h - 110) * w) / h, w * 1.4);

  return createPortal(
    <div className="pv-ov" role="dialog" aria-modal="true" aria-label="Page preview" onClick={onClose}>
      <div className="pv-bar" onClick={e => e.stopPropagation()}>
        <span>{caption}</span>
        <span className="num">{index + 1} / {pages.length}</span>
        <button type="button" className="ib" aria-label="Close" title="Close (Esc)" onClick={onClose}><Icon.close /></button>
      </div>
      <div className="pv-stage" onClick={e => e.stopPropagation()}>
        <button type="button" className="ib pv-nav" aria-label="Previous" disabled={index === 0} onClick={() => onIndex(index - 1)}><Icon.left /></button>
        <MockPages pages={[pages[index]]} layout={layout} width={Math.max(200, width)} />
        <button type="button" className="ib pv-nav" aria-label="Next" disabled={index === pages.length - 1} onClick={() => onIndex(index + 1)}><Icon.right /></button>
      </div>
    </div>,
    document.body,
  );
}
