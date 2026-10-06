/*
 * The ONLY file that knows the FastAPI JSON shape (snake_case, see fastapi_contract/schemas.py).
 * Readers accept snake_case and camelCase so small backend differences don't break the UI.
 */
import type {
  Category, CustomSeriesDefinition, Instrument, Job, JobStatus, Level, Me, MonthKey, Rebalancing,
  ReportRequest, ReturnSeries, RiskProfile, Source, Tag, Folder, DatedSeries,
} from '../types';
import { PROFILE_LIST, isPermission, resolvePermissions } from '../lib/permissions';

type Raw = Record<string, unknown>;

/** Read `snake_case` or `camelCase`. */
function pick(o: Raw, snake: string): unknown {
  if (o[snake] !== undefined) return o[snake];
  const camel = snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return o[camel];
}
const str = (v: unknown, d = ''): string => (v == null ? d : String(v));
const strOrNull = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
const numOrNull = (v: unknown): number | null => (v == null || v === '' || !isFinite(Number(v)) ? null : Number(v));

/** `2026-09-30`, `2026-09` or `30.09.2026` → `2026-09`. */
export function toMonthKey(v: unknown): MonthKey {
  const s = str(v).trim();
  const ch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (ch) return `${ch[3]}-${ch[2]}`;
  return s.slice(0, 7);
}
/** `2026-09` → `2026-09-30` (month-end date on the wire). */
export function toMonthEndDate(k: MonthKey): string {
  const [y, m] = k.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${k}-${String(d).padStart(2, '0')}`;
}

const CATEGORY_ALIASES: Record<string, Category> = {
  investment_grid: 'investment_grid', 'investment grid': 'investment_grid', 'investment grids': 'investment_grid',
  asset_allocation_fund: 'asset_allocation_fund', 'asset allocation fund': 'asset_allocation_fund', 'asset allocation funds': 'asset_allocation_fund',
  model_portfolio: 'model_portfolio', 'model portfolio': 'model_portfolio', 'model portfolios': 'model_portfolio',
  fund: 'fund', funds: 'fund', 'third-party fund': 'fund',
  custom_series: 'custom_series', 'custom series': 'custom_series', custom: 'custom_series',
  uploaded: 'uploaded', upload: 'uploaded', 'uploaded data': 'uploaded',
};
export const toCategory = (v: unknown): Category => CATEGORY_ALIASES[str(v).toLowerCase()] ?? 'investment_grid';

const RISKS: RiskProfile[] = ['Conservative', 'Income', 'Balanced', 'Growth', 'Equity'];
export const toRisk = (v: unknown): RiskProfile | null => RISKS.find(r => r.toLowerCase() === str(v).toLowerCase()) ?? null;

const toSource = (v: unknown): Source => (v === 'custom' || v === 'upload' ? v : 'api');
const toLevel = (v: unknown): Level => (PROFILE_LIST.some(p => p.id === v) ? (v as Level) : 'standard');

/** The server sends the resolved permissions; older payloads (level + is_admin only) are resolved from the config. */
export function readMe(o: Raw): Me {
  const level = toLevel(pick(o, 'profile') ?? pick(o, 'level'));
  const rawRoles = pick(o, 'roles');
  const roles = Array.isArray(rawRoles) ? rawRoles.map(x => str(x)) : pick(o, 'is_admin') === true ? ['admin'] : [];
  const fallback = resolvePermissions(level, roles);
  const rawPerms = pick(o, 'permissions');
  const limits = pick(o, 'limits') as Raw | undefined;
  return {
    user: str(pick(o, 'user')), level, roles,
    permissions: Array.isArray(rawPerms) ? rawPerms.map(x => str(x)).filter(isPermission) : fallback.permissions,
    limits: { selection: Number(limits && pick(limits, 'selection')) || fallback.limits.selection },
  };
}

export function readInstrument(o: Raw): Instrument {
  const cf = numOrNull(pick(o, 'carried_forward_months'));
  return {
    id: str(pick(o, 'id')),
    code: str(pick(o, 'code')),
    name: str(pick(o, 'name')),
    alias: str(pick(o, 'alias')),
    category: toCategory(pick(o, 'category')),
    riskProfile: toRisk(pick(o, 'risk_profile')),
    currency: str(pick(o, 'currency')).toUpperCase(),
    inception: toMonthKey(pick(o, 'inception')),
    benchmarkName: strOrNull(pick(o, 'benchmark_name')),
    source: toSource(pick(o, 'source')),
    ...(cf != null ? { carriedForwardMonths: cf } : {}),
    tags: ((pick(o, 'tags') as unknown[]) ?? []).map(x => str(x)),
    benchmarkId: strOrNull(pick(o, 'benchmark_id')),
  };
}

export function readTag(o: Raw): Tag {
  return { id: str(pick(o, 'id')), name: str(pick(o, 'name')) };
}

export function readReturns(o: Raw): ReturnSeries {
  const dates = ((pick(o, 'dates') as unknown[]) ?? []).map(toMonthKey);
  const returns = ((pick(o, 'returns') as unknown[]) ?? []).map(numOrNull);
  const bm = pick(o, 'benchmark') as unknown[] | null | undefined;
  return { dates, returns, benchmark: bm ? bm.map(numOrNull) : null };
}

/** Any date form → ISO `YYYY-MM-DD` (month keys become the month end). */
export function toIsoDate(v: unknown): string {
  const s = str(v).trim();
  const ch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (ch) return `${ch[3]}-${ch[2]}-${ch[1]}`;
  if (/^\d{4}-\d{2}$/.test(s)) return toMonthEndDate(s);
  return s.slice(0, 10);
}
export function readDatedSeries(o: Raw): DatedSeries {
  const bm = pick(o, 'benchmark') as unknown[] | null | undefined;
  return {
    dates: ((pick(o, 'dates') as unknown[]) ?? []).map(toIsoDate),
    returns: ((pick(o, 'returns') as unknown[]) ?? []).map(numOrNull),
    benchmark: bm ? bm.map(numOrNull) : null,
  };
}

export function readFolder(o: Raw): Folder {
  const k = str(pick(o, 'kind'));
  const kind: Folder['kind'] = k === 'system' || k === 'watchlist' ? 'system' : k === 'custom' ? 'custom' : 'user';
  const ed = pick(o, 'editable');
  return {
    id: str(pick(o, 'id')),
    name: str(pick(o, 'name')),
    kind,
    parentId: strOrNull(pick(o, 'parent_id')),
    instrumentIds: ((pick(o, 'instrument_ids') as unknown[]) ?? []).map(x => str(x)),
    editable: typeof ed === 'boolean' ? ed : kind !== 'system',
    benchmarkId: strOrNull(pick(o, 'benchmark_id')),
    benchmarkOverrides: Object.fromEntries(Object.entries((pick(o, 'benchmark_overrides') as Record<string, unknown> | null) ?? {}).map(([k, v]) => [k, str(v)])),
  };
}
export function writeFolder(f: Partial<Pick<Folder, 'name' | 'instrumentIds' | 'kind' | 'parentId' | 'benchmarkId' | 'benchmarkOverrides'>>): Raw {
  const out: Raw = {};
  if (f.name !== undefined) out.name = f.name;
  if (f.instrumentIds !== undefined) out.instrument_ids = f.instrumentIds;
  if (f.kind !== undefined) out.kind = f.kind;
  if (f.parentId !== undefined) out.parent_id = f.parentId;
  if (f.benchmarkId !== undefined) out.benchmark_id = f.benchmarkId;
  if (f.benchmarkOverrides !== undefined) out.benchmark_overrides = f.benchmarkOverrides;
  return out;
}

const REBALS: Rebalancing[] = ['fixed', 'drift', 'monthly', 'yearly'];
const toRebal = (v: unknown): Rebalancing => (REBALS.includes(str(v) as Rebalancing) ? (str(v) as Rebalancing) : 'monthly');

export function readCustomSeries(o: Raw): CustomSeriesDefinition {
  const legs = (pick(o, 'legs') as Raw[] | undefined) ?? [];
  return {
    id: str(pick(o, 'id')),
    code: str(pick(o, 'code')),
    name: str(pick(o, 'name')),
    currency: str(pick(o, 'currency')).toUpperCase(),
    riskProfile: toRisk(pick(o, 'risk_profile')),
    rebalancing: toRebal(pick(o, 'rebalancing')),
    legs: legs.map(l => {
      const end = pick(l, 'end');
      return {
        start: toMonthKey(pick(l, 'start')),
        end: end ? toMonthKey(end) : null,
        fee: Number(pick(l, 'fee')) || 0,
        components: ((pick(l, 'components') as Raw[] | undefined) ?? []).map(c => ({ id: str(pick(c, 'id')), weight: Number(pick(c, 'weight')) || 0 })),
      };
    }),
    tags: ((pick(o, 'tags') as unknown[]) ?? []).map(x => str(x)),
    created: str(pick(o, 'created')),
  };
}
export function writeCustomSeries(d: Partial<CustomSeriesDefinition>): Raw {
  return {
    ...(d.id ? { id: d.id } : {}),
    name: d.name,
    currency: d.currency,
    risk_profile: d.riskProfile,
    rebalancing: d.rebalancing,
    legs: (d.legs ?? []).map(l => ({
      start: toMonthEndDate(l.start),
      end: l.end ? toMonthEndDate(l.end) : null,
      fee: l.fee,
      components: l.components.map(c => ({ id: c.id, weight: c.weight })),
    })),
    tags: d.tags ?? [],
  };
}

const STATUSES: JobStatus[] = ['queued', 'running', 'done', 'error'];
export function readJob(o: Raw): Job {
  const s = str(pick(o, 'status'));
  return {
    id: str(pick(o, 'id') ?? pick(o, 'job_id')),
    status: STATUSES.includes(s as JobStatus) ? (s as JobStatus) : 'queued',
    progress: Number(pick(o, 'progress')) || 0,
    result: (pick(o, 'result') as unknown) ?? null,
    detail: strOrNull(pick(o, 'detail')),
  };
}
export const readJobId = (o: Raw): { jobId: string } => ({ jobId: str(pick(o, 'job_id') ?? pick(o, 'id')) });

export function writeReportRequest(r: ReportRequest): Raw {
  return {
    template: r.template,
    format: r.format,
    language: r.language,
    currency: r.currency || null,
    title: r.title,
    prepared_for: r.preparedFor,
    period: { from: r.period.from, to: r.period.to },
    sections: r.sections,
    instrument_ids: r.instrumentIds,
    ...(r.benchmarks ? { benchmarks: r.benchmarks } : {}),
    ...(r.imported?.length
      ? { imported: r.imported.map(x => ({ id: x.id, name: x.name, currency: x.currency, returns: x.returns.map(o => ({ date: toMonthEndDate(o.month), value: o.value })) })) }
      : {}),
  };
}

/** FastAPI errors: `{ detail: "..." }` or `{ detail: [{ msg }] }` (validation). */
export function readErrorDetail(o: unknown, fallback: string): string {
  if (!o || typeof o !== 'object') return fallback;
  const d = (o as Raw).detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(x => str((x as Raw)?.msg ?? x)).join('; ');
  return fallback;
}

/** `attachment; filename="report.pdf"` → `report.pdf`. */
export function readFilename(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : fallback;
}
