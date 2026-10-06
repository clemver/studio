/*
 * Line / area chart on a date axis (daily, weekly or monthly points), many series, hover read-out.
 * Presentational: values come in ready to plot, one per date in `dates`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { niceTicks } from '../../lib/chart';
import { MN } from '../../lib/months';

/** `dash`: drawn dashed (e.g. a benchmark next to its instrument). */
export interface DateSeries { id: string; name: string; color: string; v: (number | null)[]; dash?: boolean }

interface Props {
  dates: string[];
  series: DateSeries[];
  height: number;
  /** Axis and read-out formats. */
  format: (v: number) => string;
  ariaLabel: string;
  area?: boolean;
  /** Rank charts: 1 at the top. */
  invert?: boolean;
  domain?: [number, number];
  /** Horizontal background bands in value units (e.g. quartiles). */
  bands?: { from: number; to: number; color: string }[];
  zeroLine?: boolean;
}

const ML = 52, MR = 14, MT = 10, MB = 26;
const ddmmyyyy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/** Month / year ticks that fit the width. */
function xTicks(dates: string[], W: number): { k: number; t: string }[] {
  if (dates.length < 2) return [];
  const days = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000;
  const out: { k: number; t: string }[] = [];
  for (let k = 1; k < dates.length; k++) {
    const p = dates[k - 1], d = dates[k];
    if (days > 1100) { if (d.slice(0, 4) !== p.slice(0, 4)) out.push({ k, t: d.slice(0, 4) }); }
    else if (days > 70) { if (d.slice(5, 7) !== p.slice(5, 7)) out.push({ k, t: `${MN[+d.slice(5, 7) - 1]} ${d.slice(2, 4)}` }); }
    else if (new Date(d).getUTCDay() < new Date(p).getUTCDay()) out.push({ k, t: `${d.slice(8, 10)} ${MN[+d.slice(5, 7) - 1]}` });
  }
  const max = Math.max(2, Math.floor((W - ML - MR) / 70)), stride = Math.ceil(out.length / max);
  return out.filter((_, i) => i % stride === 0);
}

export function DateChart({ dates, series, height: H, format, ariaLabel, area, invert, domain, bands, zeroLine }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  const [hover, setHover] = useState<{ k: number; x: number } | null>(null);
  useEffect(() => {
    const el = host.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    if (W < 80 || dates.length < 2) return null;
    let lo = Infinity, hi = -Infinity;
    series.forEach(s => s.v.forEach(v => { if (v != null && isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
    if (domain) [lo, hi] = domain;
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (!domain) { const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += area ? 0 : pad; if (area) hi = Math.max(hi, 0); }
    const yt = domain ? niceTicks(lo, hi, 6).filter(t => t >= lo && t <= hi) : niceTicks(lo, hi, 5);
    if (!domain) { lo = Math.min(lo, yt[0]); hi = Math.max(hi, yt[yt.length - 1]); }
    const n = dates.length;
    const xs = (k: number) => ML + (k / (n - 1)) * (W - ML - MR);
    const ys = (v: number) => (invert ? MT + ((v - lo) / (hi - lo)) * (H - MT - MB) : MT + (1 - (v - lo) / (hi - lo)) * (H - MT - MB));
    const paths = series.map(s => {
      let d = '', open = false;
      s.v.forEach((v, k) => { if (v == null || !isFinite(v)) { open = false; return; } d += (open ? 'L' : 'M') + xs(k).toFixed(1) + ' ' + ys(v).toFixed(1); open = true; });
      let fill = '';
      if (area && d) {
        const first = s.v.findIndex(v => v != null); let last = s.v.length - 1; while (last > 0 && s.v[last] == null) last--;
        fill = `${d}L${xs(last).toFixed(1)} ${ys(0).toFixed(1)}L${xs(first).toFixed(1)} ${ys(0).toFixed(1)}Z`;
      }
      return { ...s, d, fill };
    });
    return { xs, ys, yt, lo, hi, paths, ticks: xTicks(dates, W) };
  }, [W, H, dates, series, domain, invert, area, zeroLine]);

  const move = (clientX: number) => {
    const el = host.current; if (!el || !geo) return;
    const r = el.getBoundingClientRect(), x = clientX - r.left;
    const k = Math.max(0, Math.min(dates.length - 1, Math.round(((x - ML) / (W - ML - MR)) * (dates.length - 1))));
    setHover({ k, x });
  };

  const rows = hover ? series.map(s => ({ s, v: s.v[hover.k] })).filter(x => x.v != null).sort((p, q) => (invert ? p.v! - q.v! : q.v! - p.v!)) : [];

  return (
    <div className="dchart" ref={host} style={{ height: H }} onMouseMove={ev => move(ev.clientX)} onMouseLeave={() => setHover(null)}
      onTouchStart={ev => move(ev.touches[0].clientX)} onTouchMove={ev => move(ev.touches[0].clientX)} onTouchEnd={() => setHover(null)}>
      {geo && (
        <svg width={W} height={H} role="img" aria-label={ariaLabel}>
          {bands?.map((b, i) => {
            const y1 = geo.ys(b.from), y2 = geo.ys(b.to);
            return <rect key={i} x={ML} width={W - ML - MR} y={Math.min(y1, y2)} height={Math.abs(y2 - y1)} fill={b.color} />;
          })}
          {geo.yt.map(t => (
            <g key={t}>
              <line x1={ML} x2={W - MR} y1={geo.ys(t)} y2={geo.ys(t)} stroke="var(--line-soft)" />
              <text x={ML - 8} y={geo.ys(t) + 4} textAnchor="end" className="dc-ax">{format(t)}</text>
            </g>
          ))}
          {zeroLine && geo.lo < 0 && geo.hi > 0 && <line x1={ML} x2={W - MR} y1={geo.ys(0)} y2={geo.ys(0)} stroke="var(--dim)" strokeDasharray="3 3" />}
          {geo.ticks.map(t => (
            <text key={t.k} x={geo.xs(t.k)} y={H - 8} textAnchor="middle" className="dc-ax">{t.t}</text>
          ))}
          {geo.paths.map(p => p.fill && <path key={p.id + 'f'} d={p.fill} fill={p.color} fillOpacity={0.14} stroke="none" />)}
          {geo.paths.map(p => <path key={p.id} d={p.d} fill="none" stroke={p.color} strokeWidth={p.dash ? 1.2 : 1.4} strokeLinejoin="round"
            strokeDasharray={p.dash ? '5 4' : undefined} strokeOpacity={p.dash ? 0.85 : 1} />)}
          {hover && <line x1={geo.xs(hover.k)} x2={geo.xs(hover.k)} y1={MT} y2={H - MB} stroke="var(--dim)" strokeDasharray="3 3" />}
        </svg>
      )}
      {hover && rows.length > 0 && (
        <div className="ctip" style={{ left: hover.x + 260 > W ? Math.max(4, hover.x - 254) : hover.x + 14, top: 8 }}>
          <div className="d num">{ddmmyyyy(dates[hover.k])}</div>
          {rows.slice(0, 12).map(({ s, v }) => (
            <div className={`l${s.dash ? ' dim' : ''}`} key={s.id}><span><span className="sw" style={{ '--c': s.color } as CSSProperties} />{s.name}</span><span className="num">{format(v!)}</span></div>
          ))}
          {rows.length > 12 && <div className="l"><span className="dim">+{rows.length - 12} more</span></div>}
        </div>
      )}
    </div>
  );
}
