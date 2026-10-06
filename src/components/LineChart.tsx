/* Responsive line chart with a hover read-out (date + one line per series). Presentational only. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LineSeries } from '../lib/lineChart';
import { PAGE_CHART, lineChart } from '../lib/lineChart';
import type { MonthGrid } from '../lib/months';
import { monthEnd } from '../lib/months';

export interface NamedSeries extends LineSeries { name: string }

interface Props {
  grid: MonthGrid;
  a: number;
  e: number;
  series: NamedSeries[];
  height: number;
  unit: 'idx' | '%';
  ref100?: number;
  gid: string;
  ariaLabel: string;
  format: (v: number) => string;
  markers?: { k: number; label: string }[];
}

export function LineChart({ grid, a, e, series, height, unit, ref100, gid, ariaLabel, format, markers }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ k: number; left: number } | null>(null);

  useEffect(() => {
    const el = host.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth - 16)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chart = useMemo(
    () => (width > 40 ? lineChart({ ...PAGE_CHART, W: width, H: height, a, e, grid_: grid, series, unit, ref: ref100, gid, aria: ariaLabel, interactive: true, markers }) : null),
    [width, height, a, e, grid, series, unit, ref100, gid, ariaLabel, markers],
  );

  const move = (clientX: number) => {
    const svg = host.current?.querySelector('svg'); if (!svg || !chart) return;
    const r = svg.getBoundingClientRect(), x = (clientX - r.left) * (width / r.width);
    const k = Math.max(0, Math.min(chart.L - 1, Math.round(((x - chart.ml) / (width - chart.ml - chart.mr)) * (chart.L - 1))));
    const hb = host.current!.getBoundingClientRect();
    setHover({ k, left: clientX - hb.left });
  };

  // Move the dashed cursor line inside the generated SVG.
  useEffect(() => {
    const line = host.current?.querySelector('.hx'); if (!line || !chart) return;
    if (hover) { const x = String(chart.xs(hover.k)); line.setAttribute('x1', x); line.setAttribute('x2', x); line.setAttribute('visibility', 'visible'); }
    else line.setAttribute('visibility', 'hidden');
  }, [hover, chart]);

  const tipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = tipRef.current, h = host.current; if (!t || !h || !hover) return;
    let left = hover.left + 14;
    if (left + t.offsetWidth > h.clientWidth - 6) left = hover.left - t.offsetWidth - 14;
    t.style.left = Math.max(4, left) + 'px';
  }, [hover]);

  return (
    <div className="chartbox" ref={host}
      onMouseMove={ev => { if ((ev.target as Element).classList?.contains('hit')) move(ev.clientX); else setHover(null); }}
      onMouseLeave={() => setHover(null)}
      onTouchStart={ev => move(ev.touches[0].clientX)} onTouchMove={ev => move(ev.touches[0].clientX)} onTouchEnd={() => setHover(null)}>
      {chart && <div dangerouslySetInnerHTML={{ __html: chart.svg }} />}
      {hover && (
        <div className="ctip" ref={tipRef}>
          <div className="d num">{monthEnd(grid.key(a - 1 + hover.k))}</div>
          {series.map((s, i) => (
            <div className="l" key={i}>
              <span><span className="sw" style={{ '--c': s.color } as React.CSSProperties} />{s.name}</span>
              <span className="num">{s.v[hover.k] == null ? '—' : format(s.v[hover.k]!)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
