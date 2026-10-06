import type { Permission, Profile } from './lib/permissions';
/* Front-end types (camelCase). Only src/api/adapters.ts knows the FastAPI JSON shape. */

/** User profile: an id from config/permissions.json. */
export type Level = Profile;

/** Month on the month-end grid, `YYYY-MM` (the wire uses the month-end date, e.g. `2026-09-30`). */
export type MonthKey = string;

/** `fund`: third-party funds from the investable universe (mostly outside the Watchlist). */
export type Category = 'investment_grid' | 'asset_allocation_fund' | 'model_portfolio' | 'fund' | 'custom_series' | 'uploaded';
export type RiskProfile = 'Conservative' | 'Income' | 'Balanced' | 'Growth' | 'Equity';
export type Source = 'api' | 'custom' | 'upload';

export interface Me {
  user: string;
  /** Profile (config/permissions.json). */
  level: Level;
  /** Extra roles on top of the profile, e.g. `admin`. */
  roles: string[];
  /** Resolved rights: what the UI shows and the API allows. */
  permissions: Permission[];
  limits: { selection: number };
}

export interface Instrument {
  id: string;
  code: string;
  /** Source name. Stays visible in tooltips and secondary lines. */
  name: string;
  /** Display name. Overrides `name` everywhere in the UI and reports when not empty. */
  alias: string;
  category: Category;
  riskProfile: RiskProfile | null;
  currency: string;
  /** First month with a return. */
  inception: MonthKey;
  /** Benchmark name for track records; a summary line for custom series and uploads. */
  benchmarkName: string | null;
  source: Source;
  /** Uploads only: months missing in the file that were carried forward (0 % return). */
  carriedForwardMonths?: number;
  /** Tag ids (see Tag). */
  tags: string[];
  /** Security-level benchmark (an instrument id), set by admins for all users. Null = see folder / API default. */
  benchmarkId: string | null;
}

export interface InstrumentFilter {
  category?: Category;
  currency?: string;
  risk?: RiskProfile;
  q?: string;
}

/** Sampling of a returns series. Annualisation uses 252 / 52 / 12 periods a year. */
export type Frequency = 'D' | 'W' | 'M';

/** Returns at any frequency, dated by period end (ISO `YYYY-MM-DD`), decimals. */
export interface DatedSeries {
  dates: string[];
  returns: (number | null)[];
  /** The API's own composite benchmark, same dates. */
  benchmark: (number | null)[] | null;
}

/** Monthly returns as decimals (0.0123 = 1.23 %), one per month end. */
export interface ReturnSeries {
  dates: MonthKey[];
  returns: (number | null)[];
  benchmark: (number | null)[] | null;
}

/**
 * `system` (blue): the Watchlist, a curated subset of the investable universe; shared, filled by admins with track records. `user` (yellow): the user's own (the brief's watchlists).
 * `custom`: the user's own sub-folders of Custom series, holding custom series (shown in blue).
 * All hold explicit lists; one level of sub-folders (parentId).
 */
export type FolderKind = 'system' | 'user' | 'custom';

export interface Folder {
  id: string;
  name: string;
  kind: FolderKind;
  /** Parent folder id (e.g. Model portfolios → EUR). */
  parentId: string | null;
  instrumentIds: string[];
  /** Whether this user may add or remove instruments (server decides: own folders, or Watchlist folders for admins). */
  editable: boolean;
  /** Folder-level benchmark (instrument id). Blue: admins; own folders: the owner. Sub-folders inherit their parent's. */
  benchmarkId: string | null;
  /** Own folders (user, custom) only: per-instrument benchmark overrides (instrument id → benchmark id), visible to the owner only. */
  benchmarkOverrides: Record<string, string>;
}

/**
 * fixed: weights reset to target every month · drift: buy & hold within a leg ·
 * monthly: back to target at each month end · yearly: drift during the year, back to target at each year end.
 * Every leg starts at its target weights.
 */
export type Rebalancing = 'fixed' | 'drift' | 'monthly' | 'yearly';

export interface CustomComponent {
  id: string;
  /** Weight in percent (70 = 70 %). Weights in a leg must total 100. */
  weight: number;
}

/** A period with its own composition. Legs follow each other without gaps. */
export interface CustomLeg {
  /** First month included. */
  start: MonthKey;
  /** Last month included; null = ongoing (latest data). Only the last leg can be ongoing. */
  end: MonthKey | null;
  /** Annual fees in percent (0.5 = 0.50 % p.a.), deducted monthly. */
  fee: number;
  components: CustomComponent[];
}

export interface CustomSeriesDefinition {
  id: string;
  code: string;
  name: string;
  currency: string;
  riskProfile: RiskProfile | null;
  rebalancing: Rebalancing;
  legs: CustomLeg[];
  /** Tag ids. */
  tags: string[];
  created: string;
}

/** A shared label for classifying and filtering securities. Not linked to folders. */
export interface Tag {
  id: string;
  name: string;
}

/**
 * A series imported from Excel for this browser session only: never sent to or stored on the server.
 * `inst.source` is 'upload'; prices are levels in date order.
 */
export interface ImportedSeries {
  inst: Instrument;
  prices: { date: string; value: number }[];
  file: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Job<R = unknown> {
  id: string;
  status: JobStatus;
  /** 0–100. */
  progress: number;
  result: R | null;
  detail: string | null;
}

export type ReportTemplate = 'comparison' | 'factsheet';
/** pdf / html: A4 pages; pptx: 16:9 PowerPoint slides. */
export type ReportFormat = 'pdf' | 'html' | 'pptx';
export type ReportLanguage = 'en' | 'fr' | 'de';

/** A session-only Excel import sent with the report request (the server never stores it). Monthly returns, decimals. */
export interface ReportImportedSeries {
  id: string;
  name: string;
  currency: string;
  returns: { month: MonthKey; value: number }[];
}

export interface ReportRequest {
  template: ReportTemplate;
  format: ReportFormat;
  language: ReportLanguage;
  /** Reference currency for all figures; '' = each instrument's own. */
  currency: string;
  title: string;
  preparedFor: string;
  /** ISO dates: `from` is the base (the period starts the day after), `to` the last day included. */
  period: { from: string; to: string };
  sections: string[];
  instrumentIds: string[];
  /** Effective benchmark per instrument as shown on screen (null = API default), so the file matches the UI. */
  benchmarks?: Record<string, string | null>;
  /** Excel imports among `instrumentIds`: their data travels with the request. */
  imported?: ReportImportedSeries[];
}

export interface DownloadedFile {
  filename: string;
  blob: Blob;
}

/* ---------- derived, front-end only ---------- */

/** An instrument's returns aligned on the shared month grid (index = month). */
export interface TrackRecord {
  inst: Instrument;
  ret: (number | null)[];
  /** Effective benchmark returns (what every calculation uses). */
  bm: (number | null)[] | null;
  /** The track record API's own composite benchmark, kept as the default. */
  defaultBm?: (number | null)[] | null;
  /** Grid index of the first return. */
  incIdx: number;
}

export type PeriodPreset = 'YTD' | '1Y' | '3Y' | '5Y' | 'MAX' | 'CUSTOM';
