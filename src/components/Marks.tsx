/* Small inline marks used in grids: currency flag, risk dots, source tag, excess bar. */
import { RISK_LEVEL } from '../lib/domain';
import type { RiskProfile, Source } from '../types';

const EU_STARS = Array.from({ length: 12 }, (_, k) => {
  const t = (k / 12) * 2 * Math.PI;
  return <circle key={k} cx={(8 + 3.6 * Math.cos(t)).toFixed(2)} cy={(6 + 3.6 * Math.sin(t)).toFixed(2)} r=".55" />;
});
const FLAGS: Record<string, React.ReactNode> = {
  CHF: <><rect width="16" height="12" fill="#e5252a" /><rect x="7" y="2.5" width="2" height="7" fill="#fff" /><rect x="4.5" y="5" width="7" height="2" fill="#fff" /></>,
  EUR: <><rect width="16" height="12" fill="#1f4fbf" /><g fill="#ffd400">{EU_STARS}</g></>,
  USD: <><rect width="16" height="12" fill="#fff" />{[0, 2, 4, 6, 8, 10].map(y => <rect key={y} y={y} width="16" height="1" fill="#c8202f" />)}<rect width="7" height="6" fill="#2b3f8f" /></>,
  GBP: <><rect width="16" height="12" fill="#1f3a8a" /><path d="M0 0L16 12M16 0L0 12" stroke="#fff" strokeWidth="2.4" /><path d="M0 0L16 12M16 0L0 12" stroke="#d0202f" strokeWidth=".9" /><rect x="6.2" width="3.6" height="12" fill="#fff" /><rect y="4.2" width="16" height="3.6" fill="#fff" /><rect x="7" width="2" height="12" fill="#d0202f" /><rect y="5" width="16" height="2" fill="#d0202f" /></>,
};
export const Flag = ({ ccy }: { ccy: string }) => (
  <span className="flag-i" aria-hidden="true">{FLAGS[ccy] && <svg viewBox="0 0 16 12">{FLAGS[ccy]}</svg>}</span>
);

export const RiskDots = ({ risk }: { risk: RiskProfile }) => (
  <span className="risk" aria-hidden="true">
    {[1, 2, 3, 4, 5].map(k => <i key={k} className={k <= RISK_LEVEL[risk] ? 'on' : ''} />)}
  </span>
);

export const SourceTag = ({ source }: { source: Source }) =>
  source === 'custom' ? <span className="tag">Custom</span> : source === 'upload' ? <span className="tag">Excel</span> : null;

/**
 * 64px drift bar around a centre axis. Capped at ±3 points so bars compare across rows.
 * Red when more than 1 point behind the benchmark, blue otherwise; axis only when ~0.
 */
export function ExcessBar({ value, tip }: { value: number | null; tip: string }) {
  if (value == null || !isFinite(value)) return <span className="bar64" aria-hidden="true" />;
  const w = Math.min(1, Math.abs(value) / 0.03) * 32;
  if (Math.abs(value) < 0.0005) return <span className="bar64" data-tip={tip} />;
  const breach = value < -0.01;
  return (
    <span className="bar64" data-tip={tip}>
      <i className={breach ? 'br' : 'in'} style={value >= 0 ? { left: 32, width: w } : { left: 32 - w, width: w }} />
    </span>
  );
}
