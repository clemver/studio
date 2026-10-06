import type { ReactNode } from 'react';

/** KPI strip item: label above, icon + value below. Pass '-' when there is no data. */
export function Kpi({ label, icon, value, sub }: { label: string; icon?: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <span className="k">{label}</span>
      <span className="v">{icon}<span className="num">{value}</span></span>
      {sub !== undefined && <span className="s">{sub || ' '}</span>}
    </div>
  );
}
export const KpiStrip = ({ children }: { children: ReactNode }) => <div className="kpis">{children}</div>;
