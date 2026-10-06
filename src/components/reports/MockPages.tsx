/* Report pages or slides (HTML strings) drawn at a scale: fit to the container width, or a fixed width for thumbnails. */
import { useEffect, useRef, useState } from 'react';
import { PX, SH, SW } from '../../lib/slides';

const SIZE = { a4: { w: 794, h: 1123 }, slides: { w: SW * PX, h: SH * PX } };

export function MockPages({ pages, layout, width, max }: { pages: string[]; layout: 'a4' | 'slides'; width?: number; max?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  useEffect(() => {
    if (width) return;
    const el = host.current; if (!el) return;
    const ro = new ResizeObserver(() => setFit(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const { w, h } = SIZE[layout];
  const W = width ?? Math.min(fit, max ?? Infinity);
  const k = W / w;
  return (
    <div ref={host} className="mk-pages">
      {W > 0 && pages.map((p, i) => (
        <div key={i} className="mk-pg" style={{ width: w * k, height: h * k }}>
          <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: 'top left' }} dangerouslySetInnerHTML={{ __html: p }} />
        </div>
      ))}
    </div>
  );
}
