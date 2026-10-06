import type { TimeseriesApi } from './contract';
import { httpApi } from './client';
import { mockApi } from './mock';

/** VITE_USE_MOCK=true serves in-browser sample data so the UI works before the backend exists. */
export const USE_MOCK = String(import.meta.env.VITE_USE_MOCK ?? 'true').toLowerCase() === 'true';

export const api: TimeseriesApi = USE_MOCK ? mockApi : httpApi;

export { ApiError } from './contract';
export type { TimeseriesApi } from './contract';
