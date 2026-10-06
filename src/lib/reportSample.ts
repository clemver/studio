/* Fictional data for the Reports library mockups: same layout as the real file, never the user's figures. */
import type { Instrument, ReportLanguage, ReportTemplate, RiskProfile, TrackRecord } from '../types';
import { buildGrid } from './months';
import { periodOf } from './stats';
import type { ReportInput } from './report';
import { tr } from './reportI18n';

const grid = buildGrid('2019-01', '2026-09');

/** Small deterministic generator so the mockup never changes between renders. */
function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
function gauss(r: () => number) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }

const SPECS: { code: string; ccy: string; risk: RiskProfile; mu: number; vol: number; seed: number }[] = [
  { code: 'SMP 001', ccy: 'CHF', risk: 'Balanced', mu: 0.0045, vol: 0.021, seed: 11 },
  { code: 'SMP 002', ccy: 'EUR', risk: 'Growth', mu: 0.006, vol: 0.031, seed: 23 },
  { code: 'SMP 003', ccy: 'USD', risk: 'Income', mu: 0.0035, vol: 0.014, seed: 37 },
];

const market = (() => { const r = rng(5); return grid.keys.map(() => gauss(r)); })();

function sampleRecords(l: ReportLanguage, count: number): TrackRecord[] {
  const S = tr(l);
  return SPECS.slice(0, count).map((p, k) => {
    const r = rng(p.seed);
    const bm = market.map(z => p.mu * 0.9 + p.vol * 0.95 * z);
    const ret = bm.map(b => b + 0.0006 + p.vol * 0.3 * gauss(r));
    const inst: Instrument = {
      id: 'sample-' + k, code: p.code, name: S.sampleNames[k], alias: '', category: 'model_portfolio', riskProfile: p.risk,
      currency: p.ccy, inception: grid.key(0), benchmarkName: S.sampleBench[k], source: 'api', tags: [], benchmarkId: null,
    };
    return { inst, ret, bm, incIdx: 0 };
  });
}

const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };

/** Mockup input: the user's template, language, title and sections on sample instruments over the last 3 years. */
export function sampleReport(o: { template: ReportTemplate; language: ReportLanguage; title: string; preparedFor: string; sections: string[]; currency?: string }): ReportInput {
  return {
    ...o,
    preparedFor: o.preparedFor || tr(o.language).sampleClient,
    grid, period: periodOf(grid, '3Y'), records: sampleRecords(o.language, o.template === 'factsheet' ? 2 : 3),
    generated: today(), sampleData: true,
  };
}
