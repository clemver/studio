/* Risk / return scatter: volatility on x, (annualised) return on y, labelled dots. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { niceTicks } from '../../lib/chart';

export interface ScatterPoint { id: string; name: string; color: string; x: number; y: number }

export function ScatterChart({ points, yLabel, height: H }: { points: ScatterPoint[]; yLabel: string; height: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => { const el = host.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); return () => ro.disconnect(); }, []);
  const ML = 56, MR = 24, MT = 14, MB = 40;
  const g = useMemo(() => {
    if (W < 120 || !points.length) return null;
    let xh = Math.max(...points.map(p => p.x)) * 1.12 || 1, yl = Math.min(0, ...points.map(p => p.y)), yh = Math.max(0, ...points.map(p => p.y));
    const yp = (yh - yl) * 0.12 || 1; yl -= yp; yh += yp;
    const xt = niceTicks(0, xh, 6), yt = niceTicks(yl, yh, 5);
    xh = Math.max(xh, xt[xt.length - 1]); yl = Math.min(yl, yt[0]); yh = Math.max(yh, yt[yt.length - 1]);
    const X = (v: number) => ML + (v / xh) * (W - ML - MR), Y = (v: number) => MT + (1 - (v - yl) / (yh - yl)) * (H - MT - MB);
    // Nudge labels that would overlap.
    const lab = points.map(p => ({ p, cx: X(p.x), cy: Y(p.y), ly: Y(p.y) })).sort((a, b) => a.cy - b.cy);
    for (let k = 1; k < lab.length; k++) if (lab[k].ly - lab[k - 1].ly < 13 && Math.abs(lab[k].cx - lab[k - 1].cx) < 150) lab[k].ly = lab[k - 1].ly + 13;
    return { X, Y, xt, yt, lab };
  }, [W, H, points]);
  return (
    <div ref={host} className="dchart" style={{ height: H }}>
      {g && (
        <svg width={W} height={H} role="img" aria-label="Risk and return">
          {g.yt.map(t => <g key={'y' + t}><line x1={ML} x2={W - MR} y1={g.Y(t)} y2={g.Y(t)} stroke="var(--line-soft)" /><text x={ML - 8} y={g.Y(t) + 4} textAnchor="end" className="dc-ax">{(t * 100).toFixed(t * 100 % 1 ? 1 : 0)}</text></g>)}
          {g.xt.map(t => <g key={'x' + t}><line x1={g.X(t)} x2={g.X(t)} y1={MT} y2={H - MB} stroke="var(--line-soft)" /><text x={g.X(t)} y={H - MB + 16} textAnchor="middle" className="dc-ax">{(t * 100).toFixed(t * 100 % 1 ? 1 : 0)}</text></g>)}
          <line x1={ML} x2={W - MR} y1={g.Y(0)} y2={g.Y(0)} stroke="var(--dim)" />
          <text x={(ML + W - MR) / 2} y={H - 4} textAnchor="middle" className="dc-ax b">Volatility p.a. (%)</text>
          <text transform={`translate(14 ${(MT + H - MB) / 2}) rotate(-90)`} textAnchor="middle" className="dc-ax b">{yLabel}</text>
          {g.lab.map(({ p, cx, cy, ly }) => {
            const right = cx < W - 180;
            return (
              <g key={p.id}>
                <circle cx={cx} cy={cy} r={5.5} fill={p.color} stroke="var(--panel)" strokeWidth={2}><title>{`${p.name}: ${(p.y * 100).toFixed(2)} / ${(p.x * 100).toFixed(2)}`}</title></circle>
                <text x={right ? cx + 9 : cx - 9} y={ly + 4} textAnchor={right ? 'start' : 'end'} className="dc-lbl">{p.name}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
