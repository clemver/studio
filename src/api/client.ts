import type { TimeseriesApi } from './contract';
import { ApiError } from './contract';
import * as A from './adapters';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

/** All routes in one place. */
export const ENDPOINTS = {
  me: () => `${BASE}/me`,
  instruments: () => `${BASE}/instruments`,
  returns: (id: string) => `${BASE}/instruments/${encodeURIComponent(id)}/returns`,
  alias: (id: string) => `${BASE}/instruments/${encodeURIComponent(id)}/alias`,
  instrument: (id: string) => `${BASE}/instruments/${encodeURIComponent(id)}`,
  instrumentTags: (id: string) => `${BASE}/instruments/${encodeURIComponent(id)}/tags`,
  securityBenchmark: (id: string) => `${BASE}/instruments/${encodeURIComponent(id)}/benchmark`,
  folders: () => `${BASE}/folders`,
  folder: (id: string) => `${BASE}/folders/${encodeURIComponent(id)}`,
  tags: () => `${BASE}/tags`,
  riskFree: () => `${BASE}/risk-free`,
  customSeries: () => `${BASE}/custom-series`,
  customSeriesOne: (id: string) => `${BASE}/custom-series/${encodeURIComponent(id)}`,
  job: (id: string) => `${BASE}/jobs/${encodeURIComponent(id)}`,
  reports: () => `${BASE}/reports`,
  reportFile: (jobId: string) => `${BASE}/reports/${encodeURIComponent(jobId)}/file`,
};

async function request(call: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError(call, 'The server could not be reached.');
  }
  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    throw new ApiError(call, A.readErrorDetail(body, `${res.status} ${res.statusText}`), res.status);
  }
  return res;
}
async function json<T = Record<string, unknown>>(call: string, url: string, init?: RequestInit): Promise<T> {
  const res = await request(call, url, init);
  return (res.status === 204 ? null : await res.json()) as T;
}
const body = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
type Raw = Record<string, unknown>;

export const httpApi: TimeseriesApi = {
  async getMe() {
    return A.readMe(await json('Loading your profile', ENDPOINTS.me()));
  },

  async listInstruments(f = {}) {
    const qs = new URLSearchParams();
    if (f.category) qs.set('category', f.category);
    if (f.currency) qs.set('currency', f.currency);
    if (f.risk) qs.set('risk', f.risk);
    if (f.q) qs.set('q', f.q);
    const url = ENDPOINTS.instruments() + (qs.size ? `?${qs}` : '');
    return (await json<Raw[]>('Loading instruments', url)).map(A.readInstrument);
  },
  async getReturns(id) {
    return A.readReturns(await json('Loading returns', ENDPOINTS.returns(id)));
  },
  async getSeries(id, { frequency, currency }) {
    const qs = new URLSearchParams({ frequency });
    if (currency) qs.set('currency', currency);
    return A.readDatedSeries(await json('Loading returns', `${ENDPOINTS.returns(id)}?${qs}`));
  },
  async getRiskFree(currency, frequency) {
    const r = await json('Loading the risk-free rate', `${ENDPOINTS.riskFree()}?${new URLSearchParams({ currency, frequency })}`);
    const d = A.readDatedSeries(r);
    return { dates: d.dates, returns: d.returns.map(x => x ?? 0) };
  },
  async setAlias(id, alias) {
    const r = await json('Saving the display name', ENDPOINTS.alias(id), body('POST', { alias }));
    return { alias: String(r?.alias ?? alias) };
  },

  async getInstrument(id) {
    return A.readInstrument(await json('Loading the benchmark', ENDPOINTS.instrument(id)));
  },
  async setInstrumentTags(id, tagIds) {
    return A.readInstrument(await json('Saving the tags', ENDPOINTS.instrumentTags(id), body('PUT', { tags: tagIds })));
  },
  async setSecurityBenchmark(id, benchmarkId) {
    return A.readInstrument(await json('Saving the benchmark', ENDPOINTS.securityBenchmark(id), body('PUT', { benchmark_id: benchmarkId })));
  },

  async listFolders() {
    return (await json<Raw[]>('Loading folders', ENDPOINTS.folders())).map(A.readFolder);
  },
  async createFolder(f) {
    return A.readFolder(await json('Creating the folder', ENDPOINTS.folders(), body('POST', A.writeFolder(f))));
  },
  async updateFolder(id, patch) {
    return A.readFolder(await json('Saving the folder', ENDPOINTS.folder(id), body('PATCH', A.writeFolder(patch))));
  },
  async deleteFolder(id) {
    await request('Deleting the folder', ENDPOINTS.folder(id), { method: 'DELETE' });
  },

  async listTags() {
    return (await json<Raw[]>('Loading tags', ENDPOINTS.tags())).map(A.readTag);
  },
  async createTag(name) {
    return A.readTag(await json('Creating the tag', ENDPOINTS.tags(), body('POST', { name })));
  },

  async listCustomSeries() {
    return (await json<Raw[]>('Loading custom series', ENDPOINTS.customSeries())).map(A.readCustomSeries);
  },
  async createCustomSeries(d) {
    return A.readCustomSeries(await json('Saving the custom series', ENDPOINTS.customSeries(), body('POST', A.writeCustomSeries(d))));
  },
  async updateCustomSeries(d) {
    return A.readCustomSeries(await json('Saving the custom series', ENDPOINTS.customSeriesOne(d.id), body('PUT', A.writeCustomSeries(d))));
  },
  async deleteCustomSeries(id) {
    await request('Deleting the custom series', ENDPOINTS.customSeriesOne(id), { method: 'DELETE' });
  },

  async startReport(req) {
    return A.readJobId(await json('Report export', ENDPOINTS.reports(), body('POST', A.writeReportRequest(req))));
  },
  async getJob(jobId) {
    return A.readJob(await json('Checking job status', ENDPOINTS.job(jobId)));
  },
  async downloadReport(jobId) {
    const res = await request('Downloading the report', ENDPOINTS.reportFile(jobId));
    return { filename: A.readFilename(res.headers.get('Content-Disposition'), `report-${jobId}`), blob: await res.blob() };
  },
};
