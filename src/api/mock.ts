/*
 * In-browser demo back end (VITE_USE_MOCK=true). Same interface as client.ts.
 * Sample data is deterministic and matches the approved prototype. Nothing is persisted: a reload resets it.
 *
 * Dev helpers (mock only), as URL parameters:
 *   ?level=standard|advanced   profile returned by getMe (config/permissions.json), remembered for the session
 *   ?admin=1|0                 admin role on top of the profile, remembered for the session
 * Rights come from config/permissions.json, enforced here like the FastAPI back end does (403).
 *   ?mock_fail=<method>        make that call fail, e.g. ?mock_fail=listInstruments
 */
import type { TimeseriesApi } from './contract';
import { ApiError } from './contract';
import type {
  Category, CustomSeriesDefinition, Instrument, Job, Level, MonthKey, ReportImportedSeries, ReportRequest, ReturnSeries, RiskProfile,
  Tag, TrackRecord, Folder,
} from '../types';
import { buildGrid, ymOf } from '../lib/months';
import type { DatedSeries, Frequency } from '../types';
import { buildCustom, componentsOf, customSummary } from '../lib/custom';
import { label } from '../lib/domain';
import { reportDocument, reportFileBase, buildReportPages, REPORT_CSS } from '../lib/report';
import type { ReportInput } from '../lib/report';
import { buildPptx } from '../lib/slides';
import { monthWindow } from '../lib/period';
import type { Permission } from '../lib/permissions';
import { PERMISSION_TEXT, PROFILE_LIST, resolvePermissions } from '../lib/permissions';

/* ---------- calendar ---------- */
const FIRST: MonthKey = '2015-01', LAST_KEY: MonthKey = '2026-09';
const grid = buildGrid(FIRST, LAST_KEY);
const N = grid.keys.length;

/* ---------- deterministic market (same seeds as the prototype) ---------- */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  return () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
}
const gF = gauss(rng(7));
const EQ: number[] = [], BD: number[] = [];
for (let i = 0; i < N; i++) { EQ.push(0.0112 + 0.032 * gF()); BD.push(0.003 + 0.009 * gF()); }
const SHOCK: Record<string, [number, number]> = {
  '2015-08': [-0.065, 0.002], '2016-01': [-0.058, 0.008], '2016-02': [-0.012, 0.006], '2016-06': [-0.03, 0.012], '2018-02': [-0.042, -0.006],
  '2018-10': [-0.072, -0.004], '2018-12': [-0.074, 0.01], '2019-01': [0.072, 0.008], '2020-02': [-0.082, 0.004], '2020-03': [-0.128, -0.022],
  '2020-04': [0.102, 0.014], '2020-11': [0.094, 0.006], '2021-01': [-0.004, -0.006], '2022-01': [-0.052, -0.018], '2022-02': [-0.028, -0.012],
  '2022-04': [-0.071, -0.026], '2022-05': [-0.004, -0.012], '2022-06': [-0.082, -0.019], '2022-08': [-0.041, -0.024], '2022-09': [-0.088, -0.031],
  '2022-10': [0.058, -0.008], '2022-11': [0.062, 0.034], '2023-11': [0.084, 0.03], '2024-08': [-0.012, 0.012], '2025-03': [-0.048, -0.004],
  '2025-04': [-0.034, 0.006], '2025-05': [0.054, -0.002],
};
grid.keys.forEach((k, i) => { const s = SHOCK[k]; if (s) { EQ[i] = s[0]; BD[i] = s[1]; } });
const CCY: Record<string, { bd: number; fx: number }> = { CHF: { bd: -0.0011, fx: -0.0003 }, EUR: { bd: -0.0004, fx: 0 }, USD: { bd: 0.0007, fx: 0.0004 }, GBP: { bd: 0.0003, fx: 0.0001 } };
const FX: Record<string, number[]> = {};
Object.keys(CCY).forEach((c, k) => { const g = gauss(rng(100 + k)); FX[c] = grid.keys.map(() => CCY[c].fx + 0.006 * g()); });
const RISK_W: Record<RiskProfile, number> = { Conservative: 0.2, Income: 0.32, Balanced: 0.5, Growth: 0.7, Equity: 0.96 };
const BM_NAME: Record<RiskProfile, string> = { Conservative: '20/80', Income: '30/70', Balanced: '50/50', Growth: '70/30', Equity: '100% equity' };
const CATS: Category[] = ['investment_grid', 'asset_allocation_fund', 'model_portfolio'];
const DEFS: [string, number, RiskProfile, string, MonthKey][] = [
  ['IG Conservative CHF', 0, 'Conservative', 'CHF', '2015-01'], ['IG Balanced CHF', 0, 'Balanced', 'CHF', '2015-01'], ['IG Growth CHF', 0, 'Growth', 'CHF', '2015-01'],
  ['IG Conservative EUR', 0, 'Conservative', 'EUR', '2015-01'], ['IG Balanced EUR', 0, 'Balanced', 'EUR', '2015-01'], ['IG Growth EUR', 0, 'Growth', 'EUR', '2016-07'],
  ['IG Conservative USD', 0, 'Conservative', 'USD', '2016-01'], ['IG Balanced USD', 0, 'Balanced', 'USD', '2015-01'], ['IG Growth USD', 0, 'Growth', 'USD', '2017-04'],
  ['Swiss Defensive Allocation Fund', 1, 'Conservative', 'CHF', '2015-01'], ['Multi-Asset Income Fund', 1, 'Income', 'CHF', '2016-04'], ['Global Balanced Fund', 1, 'Balanced', 'EUR', '2015-01'],
  ['Sterling Balanced Fund', 1, 'Balanced', 'GBP', '2018-01'], ['Dynamic Growth Fund', 1, 'Growth', 'USD', '2015-01'], ['Global Equity Allocation Fund', 1, 'Equity', 'CHF', '2019-04'],
  ['MP Swiss Income', 2, 'Income', 'CHF', '2017-01'], ['MP Sustainable Balanced', 2, 'Balanced', 'CHF', '2020-07'], ['MP Sustainable Growth', 2, 'Growth', 'CHF', '2020-07'],
  ['MP Global Balanced', 2, 'Balanced', 'EUR', '2018-10'], ['MP Fixed Income', 2, 'Conservative', 'GBP', '2019-01'], ['MP Thematic Equity', 2, 'Equity', 'EUR', '2021-03'],
  ['MP All-Equity', 2, 'Equity', 'USD', '2017-07'],
];

/* ---------- server-side state ---------- */
interface Stored { inst: Instrument; ret: (number | null)[]; bm: (number | null)[] | null; incIdx: number }
const db = new Map<string, Stored>();
const custom: CustomSeriesDefinition[] = [];
/** System folders (shared, filled by admins) and user folders; both hold explicit lists. `editable` is computed per request. */
let folders: Omit<Folder, 'editable'>[] = [];
/** Shared labels on securities (no link to folders). */
const tags: Tag[] = [
  { id: 't-core', name: 'Core-satellite' },
  { id: 't-splice', name: 'Spliced history' },
  { id: 't-proposal', name: 'Model proposals' },
  { id: 't-esg', name: 'Sustainable' },
  { id: 't-flagship', name: 'Flagship' },
];

DEFS.forEach(([name, ci, risk, ccy, inc], k) => {
  const g = gauss(rng(1000 + k * 37)), r = rng(5000 + k);
  const w = RISK_W[risk], alpha = (r() - 0.5) * 0.0022 - 0.0003, idio = ci === 0 ? 0.0028 : 0.0042;
  const incIdx = grid.idx(inc), ret: (number | null)[] = [], bm: number[] = [];
  for (let i = 0; i < N; i++) {
    const b = w * EQ[i] + (1 - w) * (BD[i] + CCY[ccy].bd) + 0.4 * FX[ccy][i];
    bm.push(b);
    ret.push(i < incIdx ? null : b + alpha + idio * g());
  }
  db.set('s' + k, {
    inst: {
      id: 's' + k, code: `TR ${String(410200 + k * 137).padStart(6, '0')} 00`, name, alias: '', category: CATS[ci], riskProfile: risk,
      currency: ccy, inception: inc, benchmarkName: `Composite ${BM_NAME[risk]} ${ccy}`, source: 'api',
      tags: [], benchmarkId: null,
    },
    ret, bm, incIdx,
  });
});
// The wider investable universe: third-party funds, mostly not on the Watchlist (fictional names).
const UNIVERSE: [string, RiskProfile, string, MonthKey][] = [
  ['Alpenrose Balanced CHF', 'Balanced', 'CHF', '2015-01'], ['Lakeside Income Fund EUR', 'Income', 'EUR', '2016-03'], ['Harbor Global Equity USD', 'Equity', 'USD', '2015-01'],
  ['Meridian Conservative CHF', 'Conservative', 'CHF', '2017-06'], ['Northwind Growth EUR', 'Growth', 'EUR', '2015-01'], ['Silverline Bond Fund CHF', 'Conservative', 'CHF', '2015-01'],
  ['Cedar Multi-Asset USD', 'Balanced', 'USD', '2018-02'], ['Thames Balanced GBP', 'Balanced', 'GBP', '2016-09'], ['Summit Dynamic Equity CHF', 'Equity', 'CHF', '2019-01'],
  ['Riviera Income EUR', 'Income', 'EUR', '2015-01'], ['Pacific Growth USD', 'Growth', 'USD', '2016-01'], ['Glacier Defensive CHF', 'Conservative', 'CHF', '2015-01'],
  ['Danube Balanced EUR', 'Balanced', 'EUR', '2017-01'], ['Atlas Global Allocation USD', 'Growth', 'USD', '2015-01'], ['Kingsway Cautious GBP', 'Conservative', 'GBP', '2018-05'],
  ['Matterhorn Equity CHF', 'Equity', 'CHF', '2015-01'], ['Lumen Sustainable Balanced EUR', 'Balanced', 'EUR', '2020-01'], ['Orion Total Return USD', 'Income', 'USD', '2016-06'],
  ['Beacon Conservative GBP', 'Conservative', 'GBP', '2015-01'], ['Juniper Growth CHF', 'Growth', 'CHF', '2017-03'], ['Seine Flexible Allocation EUR', 'Balanced', 'EUR', '2015-01'],
  ['Redwood Income USD', 'Income', 'USD', '2019-04'], ['Highland Equity GBP', 'Equity', 'GBP', '2016-01'], ['Edelweiss Income CHF', 'Income', 'CHF', '2015-01'],
  ['Rhine Growth EUR', 'Growth', 'EUR', '2018-01'], ['Prairie Balanced USD', 'Balanced', 'USD', '2015-01'], ['Windsor Growth GBP', 'Growth', 'GBP', '2017-09'],
  ['Saentis Balanced CHF', 'Balanced', 'CHF', '2016-01'], ['Baltic Defensive EUR', 'Conservative', 'EUR', '2021-01'], ['Sierra Equity USD', 'Equity', 'USD', '2015-01'],
];
UNIVERSE.forEach(([name, risk, ccy, inc], k) => {
  const g = gauss(rng(3000 + k * 53)), r = rng(7000 + k);
  const w = RISK_W[risk], alpha = (r() - 0.55) * 0.003, idio = 0.005;
  const incIdx = grid.idx(inc), ret: (number | null)[] = [], bm: number[] = [];
  for (let i = 0; i < N; i++) {
    const b = w * EQ[i] + (1 - w) * (BD[i] + CCY[ccy].bd) + 0.4 * FX[ccy][i];
    bm.push(b);
    ret.push(i < incIdx ? null : b + alpha + idio * g());
  }
  const id = 'x' + k;
  db.set(id, {
    inst: {
      id, code: `FD ${String(520100 + k * 211).padStart(6, '0')} 00`, name, alias: '', category: 'fund', riskProfile: risk,
      currency: ccy, inception: inc, benchmarkName: `Composite ${BM_NAME[risk]} ${ccy}`, source: 'api', tags: [], benchmarkId: null,
    },
    ret, bm, incIdx,
  });
});
const idByName = (n: string) => [...db.values()].find(s => s.inst.name === n)!.inst.id;

const lookup = (id: string) => { const s = db.get(id); return s ? { ret: s.ret, incIdx: s.incIdx, label: label(s.inst) } : undefined; };

/** Rebuilds the stored series from its definition; returns the first problem, or ''. */
function rebuildCustom(d: CustomSeriesDefinition): string {
  const b = buildCustom(d, grid, lookup);
  if (b.issues.length) return b.issues[0].message;
  const prev = db.get(d.id);
  db.set(d.id, {
    inst: {
      id: d.id, code: d.code, name: d.name, alias: prev?.inst.alias ?? '', category: 'custom_series', riskProfile: d.riskProfile,
      currency: d.currency, inception: grid.key(b.incIdx), benchmarkName: customSummary(d), source: 'custom', tags: [...d.tags],
      benchmarkId: prev?.inst.benchmarkId ?? null,
    },
    ret: b.ret, bm: null, incIdx: b.incIdx,
  });
  return '';
}
const usesSeries = (d: CustomSeriesDefinition, id: string) => componentsOf(d).has(id);
/** Rebuild every custom series that depends (directly or not) on `id`. */
function rebuildDependents(id: string, seen = new Set<string>()) {
  custom.filter(d => usesSeries(d, id) && !seen.has(d.id)).forEach(d => { seen.add(d.id); rebuildCustom(d); rebuildDependents(d.id, seen); });
}
/** True when `id` is used, directly or not, by `by` (blocks cycles). */
function dependsOn(by: string, id: string, seen = new Set<string>()): boolean {
  const d = custom.find(x => x.id === by); if (!d || seen.has(by)) return false;
  seen.add(by);
  return [...componentsOf(d)].some(c => c === id || dependsOn(c, id, seen));
}

let csSeq = 1;
const seeds: Omit<CustomSeriesDefinition, 'id' | 'code' | 'created'>[] = [
  {
    name: 'Core-Satellite CHF', currency: 'CHF', riskProfile: 'Balanced', rebalancing: 'monthly', tags: ['t-core'],
    legs: [{ start: '2019-04', end: null, fee: 0.5, components: [{ id: idByName('IG Balanced CHF'), weight: 70 }, { id: idByName('Global Equity Allocation Fund'), weight: 30 }] }],
  },
  {
    name: 'CHF Balanced (spliced history)', currency: 'CHF', riskProfile: 'Balanced', rebalancing: 'fixed', tags: ['t-splice'],
    legs: [
      { start: '2015-01', end: '2020-06', fee: 0, components: [{ id: idByName('Swiss Defensive Allocation Fund'), weight: 100 }] },
      { start: '2020-07', end: null, fee: 0, components: [{ id: idByName('MP Sustainable Balanced'), weight: 100 }] },
    ],
  },
  {
    name: 'USD Growth blend', currency: 'USD', riskProfile: 'Growth', rebalancing: 'yearly', tags: ['t-proposal'],
    legs: [
      { start: '2017-07', end: '2020-12', fee: 0.8, components: [{ id: idByName('Dynamic Growth Fund'), weight: 60 }, { id: idByName('MP All-Equity'), weight: 40 }] },
      { start: '2021-01', end: null, fee: 0.6, components: [{ id: idByName('IG Growth USD'), weight: 50 }, { id: idByName('MP All-Equity'), weight: 50 }] },
    ],
  },
];
seeds.forEach(p => {
  const d: CustomSeriesDefinition = { ...p, id: 'c' + csSeq, code: `CS ${String(csSeq).padStart(4, '0')}`, created: '28.09.2026' };
  csSeq++;
  custom.push(d);
  const err = rebuildCustom(d);
  if (err) console.warn('Sample custom series', d.name, err);
});

// Folders hold explicit lists: blue ones filled by admins, yellow ones by their owner.
// Benchmarks: blue folder level (admins, sub-folders inherit), yellow folder level + per-instrument overrides (owner).
const NO_BM = { benchmarkId: null, benchmarkOverrides: {} };
const apiIds = (pred: (i: Instrument) => boolean) => [...db.values()].filter(x => x.inst.source === 'api' && x.inst.category !== 'fund' && pred(x.inst)).map(x => x.inst.id);
folders = [
  { id: 'sys-ig', name: 'Investment grids', kind: 'system', parentId: null, instrumentIds: apiIds(i => i.category === 'investment_grid'), ...NO_BM },
  { id: 'sys-aaf', name: 'Asset allocation funds', kind: 'system', parentId: null, instrumentIds: apiIds(i => i.category === 'asset_allocation_fund'), ...NO_BM },
  { id: 'sys-mp', name: 'Model portfolios', kind: 'system', parentId: null, instrumentIds: [], benchmarkId: idByName('IG Balanced CHF'), benchmarkOverrides: {} },
  ...['EUR', 'CHF', 'GBP', 'USD'].map(c => ({
    id: `sys-mp-${c.toLowerCase()}`, name: `Model portfolios ${c}`, kind: 'system' as const, parentId: 'sys-mp',
    instrumentIds: apiIds(i => i.category === 'model_portfolio' && i.currency === c), ...NO_BM,
  })),
  // The user's own folders (the brief's watchlists).
  { id: 'f1', name: 'CHF mandates', kind: 'user', parentId: null, benchmarkId: 'c2', benchmarkOverrides: {}, instrumentIds: ['IG Conservative CHF', 'IG Balanced CHF', 'IG Growth CHF', 'Swiss Defensive Allocation Fund', 'Multi-Asset Income Fund'].map(idByName) },
  { id: 'f2', name: 'Sustainable model portfolios', kind: 'user', parentId: null, ...NO_BM, instrumentIds: ['MP Sustainable Balanced', 'MP Sustainable Growth'].map(idByName) },
  { id: 'f3', name: 'Custom & external', kind: 'user', parentId: null, ...NO_BM, instrumentIds: ['c1', 'c2'] },
  // A personal folder can hold instruments that are not on the Watchlist.
  { id: 'f4', name: 'Competitor review Q4', kind: 'user', parentId: null, ...NO_BM, instrumentIds: ['Alpenrose Balanced CHF', 'Saentis Balanced CHF', 'Glacier Defensive CHF'].map(idByName) },
  { id: 'f1a', name: 'Conservative', kind: 'user', parentId: 'f1', ...NO_BM, instrumentIds: ['IG Conservative CHF', 'Swiss Defensive Allocation Fund'].map(idByName) },
  // The user's sub-folders of Custom series (custom series only).
  { id: 'cf1', name: 'CHF ideas', kind: 'custom', parentId: null, ...NO_BM, instrumentIds: ['c1', 'c2'] },
  { id: 'cf2', name: 'Client proposals', kind: 'custom', parentId: null, ...NO_BM, instrumentIds: ['c3'] },
];
// A few tags on track records.
['MP Sustainable Balanced', 'MP Sustainable Growth', 'Lumen Sustainable Balanced EUR'].forEach(n => db.get(idByName(n))!.inst.tags.push('t-esg'));
['IG Balanced CHF', 'Global Balanced Fund'].forEach(n => db.get(idByName(n))!.inst.tags.push('t-flagship'));
// Security-level benchmark (admin, all users): Core-Satellite CHF measured against IG Balanced CHF.
db.get('c1')!.inst.benchmarkId = idByName('IG Balanced CHF');

const membersOf = (f: Omit<Folder, 'editable'>) => f.instrumentIds;

/* ---------- plumbing ---------- */
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const isProfile = (p: unknown): p is Level => PROFILE_LIST.some(x => x.id === p);
function readLevel(): Level {
  const p = params.get('level');
  if (isProfile(p)) { try { sessionStorage.setItem('ts-mock-level', p); } catch { /* storage blocked */ } return p; }
  try { const s = sessionStorage.getItem('ts-mock-level'); if (isProfile(s)) return s; } catch { /* storage blocked */ }
  return 'advanced';
}
let level: Level = readLevel();
function readRoles(): string[] {
  const p = params.get('admin');
  if (p === '1' || p === '0') { try { sessionStorage.setItem('ts-mock-admin', p); } catch { /* storage blocked */ } return p === '1' ? ['admin'] : []; }
  try { return sessionStorage.getItem('ts-mock-admin') === '1' ? ['admin'] : []; } catch { return []; }
}
let roles: string[] = readRoles();

/** Mock-only: grant or remove a role (the Settings menu offers it in sample-data mode). */
export function setMockRole(role: string, on: boolean) {
  roles = on ? [...new Set([...roles, role])] : roles.filter(r => r !== role);
  if (role === 'admin') try { sessionStorage.setItem('ts-mock-admin', on ? '1' : '0'); } catch { /* storage blocked */ }
}

/** The caller's rights, resolved from config/permissions.json on every call (like the server). */
const has = (p: Permission) => resolvePermissions(level, roles).permissions.includes(p);
function need(callName: string, p: Permission) {
  if (!has(p)) throw new ApiError(callName, `Your profile does not allow this (${PERMISSION_TEXT[p].toLowerCase()}).`, 403);
}
/** Who may see and change each kind of folder. */
const folderVisible = (f: { kind: string }) => f.kind === 'system' || (f.kind === 'user' ? has('folders.personal') : has('custom.view'));
const FOLDER_EDIT: Record<string, Permission> = { system: 'watchlist.manage', user: 'folders.personal', custom: 'custom.manage' };

/** Mock-only: switch the access level (the Settings menu offers it in sample-data mode). */
export function setMockLevel(l: Level) {
  level = l;
  try { sessionStorage.setItem('ts-mock-level', l); } catch { /* storage blocked */ }
}

const wait = (ms = 120 + Math.random() * 220) => new Promise(r => setTimeout(r, ms));
async function call<T>(method: string, callName: string, fn: () => T | Promise<T>): Promise<T> {
  await wait();
  if (params.get('mock_fail') === method) throw new ApiError(callName, 'Sample failure requested with ?mock_fail.', 500);
  return fn();
}
const clone = <T,>(x: T): T => structuredClone(x);
const visibleTo = (s: Stored) => s.inst.source === 'api' || has('custom.view');
/** Instruments the caller may read because they are a benchmark of something the caller sees. */
function benchmarkRefs(): Set<string> {
  const out = new Set<string>();
  db.forEach(x => { if (visibleTo(x) && x.inst.benchmarkId) out.add(x.inst.benchmarkId); });
  folders.filter(folderVisible).forEach(f => {
    if (f.benchmarkId) out.add(f.benchmarkId);
    Object.values(f.benchmarkOverrides).forEach(b => out.add(b));
  });
  return out;
}
const readable = (s: Stored) => visibleTo(s) || benchmarkRefs().has(s.inst.id);
/** Every place an instrument is used as a benchmark, for the delete check. */
function benchmarkUses(id: string): string[] {
  const out: string[] = [];
  db.forEach(x => { if (x.inst.benchmarkId === id) out.push(`benchmark of ${label(x.inst)}`); });
  folders.forEach(f => {
    if (f.benchmarkId === id) out.push(`benchmark of folder “${f.name}”`);
    if (Object.values(f.benchmarkOverrides).includes(id)) out.push(`benchmark override in “${f.name}”`);
  });
  return out;
}
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };

/* ---------- jobs ---------- */
interface MockJob { id: string; started: number; duration: number; kind: 'report'; req: ReportRequest; error?: string }
const jobs = new Map<string, MockJob>();
let jobSeq = 1;

function jobState(j: MockJob): Job {
  const t = Date.now() - j.started;
  if (t < 500) return { id: j.id, status: 'queued', progress: 0, result: null, detail: null };
  if (j.error) return { id: j.id, status: 'error', progress: 100, result: null, detail: j.error };
  if (t < j.duration) return { id: j.id, status: 'running', progress: Math.round(((t - 500) / (j.duration - 500)) * 100), result: null, detail: null };
  return { id: j.id, status: 'done', progress: 100, result: { file: `/api/reports/${j.id}/file` }, detail: null };
}

function reportInput(req: ReportRequest): ReportInput {
  // Use the benchmark the user saw on screen (resolved in their folder); null / missing = API default.
  // Session-only Excel imports arrive with their monthly returns and are placed on the same month grid.
  const records: TrackRecord[] = req.instrumentIds.map((id): TrackRecord | null => {
    const x = req.imported?.find(m => m.id === id);
    if (x) return importedRecord(x);
    const s = db.get(id);
    if (!s) return null;
    const bid = req.benchmarks?.[s.inst.id];
    const b = bid ? db.get(bid) : undefined;
    return b ? { ...s, inst: { ...s.inst, benchmarkName: label(b.inst) }, bm: b.ret } : { ...s };
  }).filter((s): s is TrackRecord => !!s);
  // Sample data is monthly: the dates round to whole months (the server uses the exact dates).
  const period = monthWindow(grid, req.period);
  return { template: req.template, language: req.language ?? 'en', currency: req.currency, title: req.title, preparedFor: req.preparedFor, sections: req.sections, grid, period, records, generated: today(), sampleData: true };
}

function importedRecord(x: ReportImportedSeries): TrackRecord | null {
  const ret: (number | null)[] = grid.keys.map(() => null);
  x.returns.forEach(o => { const i = grid.idx(o.month); if (i >= 0) ret[i] = o.value; });
  const incIdx = ret.findIndex(v => v != null);
  if (incIdx < 0) return null;
  return {
    inst: { id: x.id, code: 'Excel', name: x.name, alias: '', category: 'uploaded', riskProfile: null, currency: x.currency, inception: grid.key(incIdx), benchmarkName: null, source: 'upload', tags: [], benchmarkId: null },
    ret, bm: null, incIdx,
  };
}

/** Renders the A4 pages off-screen and captures them, like the server-side renderer would. */
async function renderPdf(req: ReportRequest): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = `<style>${REPORT_CSS}</style>` + buildReportPages(reportInput(req)).join('');
  document.body.appendChild(host);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const pages = [...host.querySelectorAll<HTMLElement>('.rp-page')];
    for (let i = 0; i < pages.length; i++) {
      const cv = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, width: 794, height: 1123, windowWidth: 794 });
      if (i) doc.addPage();
      doc.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    }
    return doc.output('blob');
  } finally {
    host.remove();
  }
}

/* ---------- daily / weekly series ---------- */
// Business days (Mon–Fri) of every month on the grid, as ISO dates.
const DAYS: { d: string; m: number }[] = [];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
grid.keys.forEach((k, i) => {
  const { y, m } = ymOf(k), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) { const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); if (wd >= 1 && wd <= 5) DAYS.push({ d: iso(y, m, d), m: i }); }
});
const monthEndIso = (i: number) => { const { y, m } = ymOf(grid.key(i)); return iso(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()); };
const hashSeed = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
const sdOf = (x: (number | null)[]) => { const v = x.filter((y): y is number => y != null); if (v.length < 3) return 0.01; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };

/** One market factor shared by every daily series, so instruments move together day to day. */
const Z_MKT = (() => { const g = gauss(rng(424242)); return DAYS.map(() => g()); })();
/**
 * Splits monthly returns into daily ones that compound exactly to each month (log-space bridge),
 * with daily noise matching the monthly volatility: `rho` of it from the shared market factor,
 * `mix` (benchmarks) from the instrument's own noise.
 */
function bridge(monthly: (number | null)[], seed: number, zIn?: number[], mix = 0, rho = 0.85): { r: (number | null)[]; z: number[] } {
  const g = gauss(rng(seed)), z = DAYS.map((_, k) => rho * Z_MKT[k] + Math.sqrt(1 - rho * rho) * g());
  if (zIn) for (let k = 0; k < z.length; k++) z[k] = mix * zIn[k] + Math.sqrt(1 - mix * mix) * z[k];
  const r: (number | null)[] = new Array(DAYS.length).fill(null);
  const sd = sdOf(monthly);
  let k = 0;
  for (let i = 0; i < N; i++) {
    const start = k; while (k < DAYS.length && DAYS[k].m === i) k++;
    const R = monthly[i]; if (R == null) continue;
    const n = k - start, sdD = sd / Math.sqrt(n), zbar = z.slice(start, k).reduce((a, b) => a + b, 0) / n;
    for (let j = start; j < k; j++) r[j] = Math.exp(Math.log(1 + R) / n + sdD * (z[j] - zbar)) - 1;
  }
  return { r, z };
}
// Rebuilt when the monthly series changes (e.g. a custom series was saved).
const dailyCache = new Map<string, { src: (number | null)[]; r: (number | null)[]; b: (number | null)[] | null }>();
function daily(s: Stored) {
  let c = dailyCache.get(s.inst.id);
  if (!c || c.src !== s.ret) {
    const a = bridge(s.ret, hashSeed(s.inst.id));
    c = { src: s.ret, r: a.r, b: s.bm ? bridge(s.bm, hashSeed(s.inst.id + ':bm'), a.z, 0.8).r : null };
    dailyCache.set(s.inst.id, c);
  }
  return c;
}
/** Compound daily returns into weeks ending on the week's last business day. */
function weekly(r: (number | null)[]): { dates: string[]; returns: (number | null)[]; ends: number[] } {
  const dates: string[] = [], returns: (number | null)[] = [], ends: number[] = [];
  let acc: number | null = null;
  for (let k = 0; k < DAYS.length; k++) {
    if (r[k] != null) acc = (acc ?? 1) * (1 + (r[k] as number));
    const next = DAYS[k + 1];
    const weekEnds = !next || new Date(next.d).getUTCDay() <= new Date(DAYS[k].d).getUTCDay();
    if (weekEnds) { dates.push(DAYS[k].d); returns.push(acc == null ? null : acc - 1); ends.push(k); acc = null; }
  }
  return { dates, returns, ends };
}
function seriesAt(s: Stored, f: Frequency): DatedSeries {
  if (f === 'M') {
    const out = { dates: [] as string[], returns: [] as (number | null)[], benchmark: s.bm ? [] as (number | null)[] : null };
    for (let i = s.incIdx; i < N; i++) { if (s.ret[i] == null) break; out.dates.push(monthEndIso(i)); out.returns.push(s.ret[i]); out.benchmark?.push(s.bm![i]); }
    return out;
  }
  const d = daily(s);
  const first = d.r.findIndex(v => v != null); let last = d.r.length - 1; while (last > first && d.r[last] == null) last--;
  if (f === 'D') return { dates: DAYS.slice(first, last + 1).map(x => x.d), returns: d.r.slice(first, last + 1), benchmark: d.b ? d.b.slice(first, last + 1) : null };
  const w = weekly(d.r), wb = d.b ? weekly(d.b) : null;
  const keep = w.ends.map((e, j) => (e >= first && e <= last ? j : -1)).filter(j => j >= 0);
  return { dates: keep.map(j => w.dates[j]), returns: keep.map(j => w.returns[j]), benchmark: wb ? keep.map(j => wb.returns[j]) : null };
}
/** Sample risk-free rates p.a. (constant): stand-ins for SARON, €STR, SOFR, SONIA. */
const RF: Record<string, number> = { CHF: 0.005, EUR: 0.02, USD: 0.04, GBP: 0.0425 };

/* ---------- the API ---------- */
export const mockApi: TimeseriesApi = {
  getMe: () => call('getMe', 'Loading your profile', () => ({ user: 'Sample user', level, roles: [...roles], ...resolvePermissions(level, roles) })),

  listInstruments: (f = {}) => call('listInstruments', 'Loading instruments', () => {
    const q = f.q?.trim().toLowerCase();
    return [...db.values()].filter(visibleTo).filter(s => {
      const i = s.inst;
      if (f.category && i.category !== f.category) return false;
      if (f.currency && i.currency !== f.currency) return false;
      if (f.risk && i.riskProfile !== f.risk) return false;
      if (q && !`${i.alias} ${i.name} ${i.code} ${i.benchmarkName ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    }).map(s => clone(s.inst));
  }),

  getReturns: id => call('getReturns', 'Loading returns', (): ReturnSeries => {
    const s = db.get(id);
    if (!s || !readable(s)) throw new ApiError('Loading returns', `Instrument ${id} not found.`, 404);
    let last = N - 1; while (last > s.incIdx && s.ret[last] == null) last--;
    return {
      dates: grid.keys.slice(s.incIdx, last + 1),
      returns: s.ret.slice(s.incIdx, last + 1),
      benchmark: s.bm ? s.bm.slice(s.incIdx, last + 1) : null,
    };
  }),

  getInstrument: id => call('getInstrument', 'Loading the benchmark', () => {
    const s = db.get(id);
    if (!s || !readable(s)) throw new ApiError('Loading the benchmark', `Instrument ${id} not found.`, 404);
    return clone(s.inst);
  }),
  setInstrumentTags: (id, tagIds) => call('setInstrumentTags', 'Saving the tags', () => {
    const s = db.get(id);
    if (!s || !visibleTo(s)) throw new ApiError('Saving the tags', `Instrument ${id} not found.`, 404);
    // Admins tag any security; users tag their own custom series.
    if (!has('tags.manage')) need('Saving the tags', s.inst.source === 'custom' ? 'custom.manage' : 'tags.manage');
    s.inst.tags = [...new Set(tagIds.filter(t => tags.some(x => x.id === t)))];
    const d = custom.find(x => x.id === id); if (d) d.tags = [...s.inst.tags];
    return clone(s.inst);
  }),
  setSecurityBenchmark: (id, benchmarkId) => call('setSecurityBenchmark', 'Saving the benchmark', () => {
    need('Saving the benchmark', 'benchmarks.security');
    const s = db.get(id);
    if (!s) throw new ApiError('Saving the benchmark', `Instrument ${id} not found.`, 404);
    if (benchmarkId && (benchmarkId === id || !db.has(benchmarkId))) throw new ApiError('Saving the benchmark', 'Pick another instrument as the benchmark.', 422);
    s.inst.benchmarkId = benchmarkId;
    return clone(s.inst);
  }),
  getSeries: (id, { frequency }) => call('getSeries', 'Loading returns', () => {
    // `currency` is accepted but sample data is not converted (the UI says so).
    const s = db.get(id);
    if (!s || !readable(s)) throw new ApiError('Loading returns', `Instrument ${id} not found.`, 404);
    return seriesAt(s, frequency);
  }),
  getRiskFree: (currency, frequency) => call('getRiskFree', 'Loading the risk-free rate', () => {
    const ppy = frequency === 'D' ? 252 : frequency === 'W' ? 52 : 12, r = Math.pow(1 + (RF[currency] ?? 0.02), 1 / ppy) - 1;
    const dates = frequency === 'M' ? grid.keys.map((_, i) => monthEndIso(i)) : frequency === 'D' ? DAYS.map(x => x.d) : weekly(DAYS.map(() => 0)).dates;
    return { dates, returns: dates.map(() => r) };
  }),
  setAlias: (id, alias) => call('setAlias', 'Saving the display name', () => {
    need('Saving the display name', 'instruments.rename');
    const s = db.get(id);
    if (!s) throw new ApiError('Saving the display name', `Instrument ${id} not found.`, 404);
    const v = alias.trim();
    s.inst.alias = v && v !== s.inst.name ? v : '';
    return { alias: s.inst.alias };
  }),

  listFolders: () => call('listFolders', 'Loading folders', () =>
    // Folder kinds follow the caller's rights; everyone only sees instruments they can access.
    folders.filter(folderVisible).map(f => ({
      ...clone(f),
      instrumentIds: membersOf(f).filter(id => { const s = db.get(id); return !!s && visibleTo(s); }),
      editable: has(FOLDER_EDIT[f.kind]),
    }))),
  createFolder: f => call('createFolder', 'Creating the folder', () => {
    const kind = f.kind ?? 'user';
    need('Creating the folder', FOLDER_EDIT[kind]);
    if (f.parentId) {
      // One level of sub-folders, same kind as the parent.
      const parent = folders.find(x => x.id === f.parentId);
      if (!parent || parent.parentId || parent.kind !== kind) throw new ApiError('Creating the folder', 'Sub-folders go one level deep, inside a folder of the same kind.', 422);
    }
    const nf = { id: 'f' + Date.now(), name: f.name.trim() || 'New folder', kind, parentId: f.parentId ?? null, instrumentIds: [...new Set(f.instrumentIds)], benchmarkId: null, benchmarkOverrides: {} };
    folders.push(nf);
    return { ...clone(nf), editable: true };
  }),
  updateFolder: (id, patch) => call('updateFolder', 'Saving the folder', () => {
    const f = folders.find(x => x.id === id);
    if (!f) throw new ApiError('Saving the folder', 'Folder not found.', 404);
    need('Saving the folder', FOLDER_EDIT[f.kind]);
    if (patch.name !== undefined) f.name = patch.name.trim() || f.name;
    if (patch.benchmarkId !== undefined) {
      if (patch.benchmarkId && !db.has(patch.benchmarkId)) throw new ApiError('Saving the folder', 'Benchmark not found.', 422);
      f.benchmarkId = patch.benchmarkId;
    }
    if (patch.benchmarkOverrides !== undefined) {
      if (f.kind === 'system') throw new ApiError('Saving the folder', 'Per-instrument benchmarks exist in your own folders only.', 422);
      f.benchmarkOverrides = Object.fromEntries(Object.entries(patch.benchmarkOverrides).filter(([k, v]) => v && v !== k && db.has(v)));
    }
    if (patch.instrumentIds !== undefined) {
      if (f.kind === 'system' && patch.instrumentIds.some(i => db.get(i)?.inst.source !== 'api')) throw new ApiError('Saving the folder', 'The Watchlist holds track records only.', 422);
      if (f.kind === 'custom' && patch.instrumentIds.some(i => db.get(i)?.inst.source !== 'custom')) throw new ApiError('Saving the folder', 'Custom series folders hold custom series only.', 422);
      f.instrumentIds = [...new Set(patch.instrumentIds)];
    }
    return { ...clone(f), instrumentIds: membersOf(f), editable: true };
  }),
  deleteFolder: id => call('deleteFolder', 'Deleting the folder', () => {
    const f = folders.find(x => x.id === id);
    if (!f) return;
    need('Deleting the folder', FOLDER_EDIT[f.kind]);
    const gone = folders.filter(x => x.id === id || x.parentId === id);
    folders = folders.filter(x => !gone.includes(x));
  }),

  listTags: () => call('listTags', 'Loading tags', () => clone(tags)),
  createTag: name => call('createTag', 'Creating the tag', () => {
    if (!has('tags.manage')) need('Creating the tag', 'custom.manage');
    const n = name.trim();
    if (!n) throw new ApiError('Creating the tag', 'Enter a tag name.', 422);
    const existing = tags.find(t => t.name.toLowerCase() === n.toLowerCase());
    if (existing) return clone(existing);
    const t: Tag = { id: 't' + Date.now(), name: n };
    tags.push(t);
    return clone(t);
  }),

  listCustomSeries: () => call('listCustomSeries', 'Loading custom series', () => clone(custom)),
  createCustomSeries: d => call('createCustomSeries', 'Saving the custom series', () => {
    need('Saving the custom series', 'custom.manage');
    while (db.has('c' + csSeq)) csSeq++;
    const nd: CustomSeriesDefinition = { ...clone(d), id: 'c' + csSeq, code: `CS ${String(csSeq).padStart(4, '0')}`, created: today() };
    const err = rebuildCustom(nd);
    if (err) throw new ApiError('Saving the custom series', err, 422);
    custom.push(nd);
    return clone(nd);
  }),
  updateCustomSeries: d => call('updateCustomSeries', 'Saving the custom series', () => {
    need('Saving the custom series', 'custom.manage');
    const i = custom.findIndex(x => x.id === d.id);
    if (i < 0) throw new ApiError('Saving the custom series', 'Custom series not found.', 404);
    const cyc = [...componentsOf(d)].find(c => c === d.id || dependsOn(c, d.id));
    if (cyc) throw new ApiError('Saving the custom series', `${label(db.get(cyc)!.inst)} already uses this series.`, 422);
    const err = rebuildCustom(d);
    if (err) throw new ApiError('Saving the custom series', err, 422);
    custom[i] = clone(d);
    rebuildDependents(d.id);
    return clone(d);
  }),
  deleteCustomSeries: id => call('deleteCustomSeries', 'Deleting the custom series', () => {
    need('Deleting the custom series', 'custom.manage');
    const asBench = benchmarkUses(id);
    if (asBench.length) throw new ApiError('Deleting the custom series', `Used as ${asBench.join(', ')}. Change those benchmarks first.`, 409);
    const deps = custom.filter(d => usesSeries(d, id));
    if (deps.length) throw new ApiError('Deleting the custom series', `Used by ${deps.map(d => d.name).join(', ')}. Remove it there first.`, 409);
    custom.splice(custom.findIndex(d => d.id === id), 1);
    db.delete(id);
    folders.forEach(f => (f.instrumentIds = f.instrumentIds.filter(x => x !== id)));
  }),

  startReport: req => call('startReport', 'Report export', () => {
    if (!req.instrumentIds.length) throw new ApiError('Report export', 'Select at least one instrument.', 422);
    if (!['comparison', 'factsheet'].includes(req.template)) throw new ApiError('Report export', `Unknown template “${req.template}”.`, 422);
    if (!['en', 'fr', 'de'].includes(req.language)) throw new ApiError('Report export', `Unsupported language “${req.language}”. Use en, fr or de.`, 422);
    if (!has('reports.view')) need('Report export', 'reports.quick');
    need('Report export', `reports.template.${req.template}` as Permission);
    need('Report export', `reports.format.${req.format}` as Permission);
    if (req.imported?.length) need('Report export', 'import.excel');
    const hidden = req.instrumentIds.filter(id => { const x = db.get(id); return x && !readable(x); });
    if (hidden.length) throw new ApiError('Report export', `Instrument${hidden.length === 1 ? '' : 's'} not found: ${hidden.join(', ')}.`, 404);
    const missing = req.instrumentIds.filter(id => !db.has(id) && !req.imported?.some(x => x.id === id));
    if (missing.length) throw new ApiError('Report export', `Unknown instrument${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`, 404);
    const j: MockJob = { id: 'j' + jobSeq++, started: Date.now(), duration: 1800, kind: 'report', req };
    jobs.set(j.id, j);
    return { jobId: j.id };
  }),
  getJob: id => call('getJob', 'Checking job status', () => {
    const j = jobs.get(id);
    if (!j) throw new ApiError('Checking job status', `Job ${id} not found.`, 404);
    return jobState(j);
  }),
  downloadReport: id => call('downloadReport', 'Downloading the report', async () => {
    const j = jobs.get(id);
    if (!j || jobState(j).status !== 'done') throw new ApiError('Downloading the report', 'The report is not ready.', 409);
    const input = reportInput(j.req);
    const base = reportFileBase(input);
    if (j.req.format === 'html') return { filename: base + '.html', blob: new Blob([reportDocument(input)], { type: 'text/html' }) };
    if (j.req.format === 'pptx') {
      return { filename: base + '.pptx', blob: await buildPptx(input) };
    }
    return { filename: base + '.pdf', blob: await renderPdf(j.req) };
  }),
};
