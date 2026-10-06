import type {
  CustomSeriesDefinition, DownloadedFile, Instrument, InstrumentFilter, Job, Me, ReportRequest,
  Folder, ReturnSeries, Tag, DatedSeries, Frequency,
} from '../types';

/**
 * Every call the UI makes. `client.ts` implements it against FastAPI, `mock.ts` in the browser.
 * Pick one with VITE_USE_MOCK (see ./index.ts).
 */
export interface TimeseriesApi {
  /** GET /api/me */
  getMe(): Promise<Me>;

  /** GET /api/instruments?category&currency&risk&q */
  listInstruments(filter?: InstrumentFilter): Promise<Instrument[]>;
  /** GET /api/instruments/{id}/returns (monthly; the Explorer). */
  getReturns(id: string): Promise<ReturnSeries>;
  /**
   * GET /api/instruments/{id}/returns?frequency=D|W|M&currency=CHF: returns dated by period end (Dashboard).
   * `currency` asks the server to convert; omitted = the instrument's own currency.
   */
  getSeries(id: string, opts: { frequency: Frequency; currency?: string }): Promise<DatedSeries>;
  /** GET /api/risk-free?currency=CHF&frequency=D: risk-free returns per period (e.g. SARON, €STR, SOFR, SONIA). */
  getRiskFree(currency: string, frequency: Frequency): Promise<{ dates: string[]; returns: number[] }>;
  /** POST /api/instruments/{id}/alias. Empty alias resets to the source name. */
  setAlias(id: string, alias: string): Promise<{ alias: string }>;
  /** GET /api/instruments/{id}: also serves instruments used as a benchmark the caller can see (e.g. a private custom series). */
  getInstrument(id: string): Promise<Instrument>;
  /** PUT /api/instruments/{id}/tags: admins on any security; users on their own custom series (403 otherwise). */
  setInstrumentTags(id: string, tagIds: string[]): Promise<Instrument>;
  /** PUT /api/instruments/{id}/benchmark: security-level benchmark for all users (admin only, 403 otherwise). Null resets. */
  setSecurityBenchmark(id: string, benchmarkId: string | null): Promise<Instrument>;

  /** GET /api/folders: the Watchlist folders (kind system, all users) + the user's own folders. */
  listFolders(): Promise<Folder[]>;
  /** POST /api/folders: an own folder (Watchlist folders: admins only). */
  createFolder(body: { name: string; instrumentIds: string[]; kind?: Folder['kind']; parentId?: string | null }): Promise<Folder>;
  /**
   * PATCH /api/folders/{id}. Changing a Watchlist folder's instruments or benchmark needs admin rights (403 otherwise); the Watchlist holds track records only (422).
   * `benchmarkOverrides` only exists on the caller's own (yellow) folders.
   */
  updateFolder(id: string, patch: Partial<Pick<Folder, 'name' | 'instrumentIds' | 'benchmarkId' | 'benchmarkOverrides'>>): Promise<Folder>;
  /** DELETE /api/folders/{id} */
  deleteFolder(id: string): Promise<void>;

  /** GET /api/tags */
  listTags(): Promise<Tag[]>;
  /** POST /api/tags: returns the existing tag when the name exists (case-insensitive). */
  createTag(name: string): Promise<Tag>;

  /** GET /api/custom-series */
  listCustomSeries(): Promise<CustomSeriesDefinition[]>;
  /** POST /api/custom-series (id and code assigned by the server) */
  createCustomSeries(def: Omit<CustomSeriesDefinition, 'id' | 'code' | 'created'>): Promise<CustomSeriesDefinition>;
  /** PUT /api/custom-series/{id}. Rebuilds every custom series that uses this one. 422 with `detail` when invalid. */
  updateCustomSeries(def: CustomSeriesDefinition): Promise<CustomSeriesDefinition>;
  /** DELETE /api/custom-series/{id}. Fails with 409 while other series depend on it. */
  deleteCustomSeries(id: string): Promise<void>;

  /** POST /api/reports → job; poll getJob, then downloadReport. */
  startReport(req: ReportRequest): Promise<{ jobId: string }>;
  /** GET /api/jobs/{id} */
  getJob(jobId: string): Promise<Job>;
  /** GET /api/reports/{jobId}/file. File name from Content-Disposition. */
  downloadReport(jobId: string): Promise<DownloadedFile>;
}

/** Error raised by every implementation: names the call and carries the API's `detail`. */
export class ApiError extends Error {
  readonly call: string;
  readonly detail: string;
  readonly status: number;
  constructor(call: string, detail: string, status = 0) {
    super(`${call} failed: ${detail}`);
    this.call = call;
    this.detail = detail;
    this.status = status;
  }
}
