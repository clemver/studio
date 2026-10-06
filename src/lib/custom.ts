/*
 * Custom series engine: builds monthly returns from legs (also used by the mock back end).
 *
 * Within a leg, each month:
 *   fixed   r = Σ wₖ·rₖ with target weights
 *   monthly same as fixed on monthly data (weights back to target at each month end)
 *   drift   component values drift from the leg start (buy & hold)
 *   yearly  values drift and go back to target weights after each December
 * Every leg starts at its target weights. Fees: r_net = (1 + r) / (1 + fee)^(1/12) − 1.
 */
import type { CustomSeriesDefinition, MonthKey } from '../types';
import type { MonthGrid } from './months';
import { addMonths, monthLabel, ymOf } from './months';
import { num } from './format';
import { REBALANCING } from './domain';

export interface SeriesOnGrid { ret: (number | null)[]; incIdx: number; label: string }
/** A problem in the definition; `leg` is the 0-based leg index when it belongs to one. */
export interface Issue { leg: number | null; message: string }
export interface BuiltSeries {
  ret: (number | null)[];
  incIdx: number;
  /** Grid index ranges per leg (inclusive), for charts and summaries. */
  legs: { s: number; e: number }[];
  issues: Issue[];
}

const lastData = (s: SeriesOnGrid) => { let i = s.ret.length - 1; while (i >= 0 && s.ret[i] == null) i--; return i; };

export function validateCustom(d: Pick<CustomSeriesDefinition, 'name' | 'legs'> & { id?: string }, grid: MonthGrid, lookup: (id: string) => SeriesOnGrid | undefined): { issues: Issue[]; ranges: { s: number; e: number }[] } {
  const issues: Issue[] = [], ranges: { s: number; e: number }[] = [];
  if (!d.name.trim()) issues.push({ leg: null, message: 'Give the series a name.' });
  if (!d.legs.length) issues.push({ leg: null, message: 'Add at least one leg.' });

  d.legs.forEach((leg, k) => {
    const L = `Leg ${k + 1}`;
    const s = leg.start ? grid.idx(leg.start) : -1;
    if (s < 0) { issues.push({ leg: k, message: `${L}: pick a start month between ${monthLabel(grid.keys[0])} and ${monthLabel(grid.keys[grid.last])}.` }); ranges.push({ s: -1, e: -1 }); return; }
    if (leg.end == null && k < d.legs.length - 1) issues.push({ leg: k, message: `${L}: only the last leg can be ongoing. Set an end month.` });
    let e = leg.end ? grid.idx(leg.end) : grid.last;
    if (leg.end && e < 0) { issues.push({ leg: k, message: `${L}: the end month is outside the data (${monthLabel(grid.keys[0])} – ${monthLabel(grid.keys[grid.last])}).` }); e = -1; }
    if (e >= 0 && e < s) issues.push({ leg: k, message: `${L}: the end month is before the start month.` });
    if (k > 0 && d.legs[k - 1].end && leg.start !== addMonths(d.legs[k - 1].end as MonthKey, 1)) {
      issues.push({ leg: k, message: `${L} must start in ${monthLabel(addMonths(d.legs[k - 1].end as MonthKey, 1))}, the month after leg ${k} ends.` });
    }
    if (!(leg.fee >= 0 && leg.fee <= 10)) issues.push({ leg: k, message: `${L}: fees must be between 0% and 10% p.a.` });

    const comps = leg.components;
    if (!comps.length) issues.push({ leg: k, message: `${L}: add at least one instrument.` });
    const tw = comps.reduce((p, c) => p + (Number(c.weight) || 0), 0);
    if (comps.length && Math.abs(tw - 100) > 0.005) issues.push({ leg: k, message: `${L}: weights add up to ${num(tw, 2)}%. They must total 100%.` });
    if (comps.some(c => !(c.weight > 0))) issues.push({ leg: k, message: `${L}: every instrument needs a weight above 0%.` });
    const seen = new Set<string>();
    comps.forEach(c => {
      if (seen.has(c.id)) issues.push({ leg: k, message: `${L}: an instrument is listed twice.` });
      seen.add(c.id);
      if (d.id && c.id === d.id) { issues.push({ leg: k, message: `${L}: a series cannot contain itself.` }); return; }
      const src = lookup(c.id);
      if (!src) { issues.push({ leg: k, message: `${L}: an instrument is no longer available.` }); return; }
      if (src.incIdx > s) issues.push({ leg: k, message: `${L}: ${src.label} starts in ${monthLabel(grid.key(src.incIdx))}, after the leg start (${monthLabel(grid.key(s))}).` });
      const ld = lastData(src);
      if (leg.end && e >= 0 && ld < e) issues.push({ leg: k, message: `${L}: ${src.label} has no data after ${monthLabel(grid.key(ld))}.` });
    });
    // Ongoing leg: runs until the last month every component has data.
    if (leg.end == null && comps.length) {
      const ends = comps.map(c => lookup(c.id)).filter((x): x is SeriesOnGrid => !!x).map(lastData);
      if (ends.length) e = Math.min(e, ...ends);
    }
    ranges.push({ s, e });
  });
  return { issues, ranges };
}

export function buildCustom(d: CustomSeriesDefinition, grid: MonthGrid, lookup: (id: string) => SeriesOnGrid | undefined): BuiltSeries {
  const ret: (number | null)[] = new Array(grid.keys.length).fill(null);
  const { issues, ranges } = validateCustom(d, grid, lookup);
  if (issues.length) return { ret, incIdx: 0, legs: ranges, issues };

  d.legs.forEach((leg, k) => {
    const { s, e } = ranges[k];
    const comps = leg.components.map(c => ({ w: c.weight / 100, src: lookup(c.id)! }));
    const feeM = Math.pow(1 + leg.fee / 100, 1 / 12);
    let v = comps.map(c => c.w); // drifting values, start at targets
    for (let i = s; i <= e; i++) {
      let r: number;
      if (d.rebalancing === 'fixed' || d.rebalancing === 'monthly') {
        r = comps.reduce((p, c) => p + c.w * (c.src.ret[i] as number), 0);
      } else {
        const before = v.reduce((p, x) => p + x, 0);
        v = v.map((x, j) => x * (1 + (comps[j].src.ret[i] as number)));
        const after = v.reduce((p, x) => p + x, 0);
        r = after / before - 1;
        if (d.rebalancing === 'yearly' && ymOf(grid.key(i)).m === 12) v = comps.map(c => c.w * after);
      }
      ret[i] = (1 + r) / feeM - 1;
    }
  });
  return { ret, incIdx: ranges[0].s, legs: ranges, issues: [] };
}

/** One-line description used as the "benchmark" line in grids. */
export function customSummary(d: CustomSeriesDefinition): string {
  const n = d.legs.length, comps = new Set(d.legs.flatMap(l => l.components.map(c => c.id))).size;
  return `${n} leg${n === 1 ? '' : 's'} · ${comps} instrument${comps === 1 ? '' : 's'} · ${REBALANCING[d.rebalancing].label.toLowerCase()}`;
}

/** Instruments a definition uses (any leg). */
export const componentsOf = (d: Pick<CustomSeriesDefinition, 'legs'>) => new Set(d.legs.flatMap(l => l.components.map(c => c.id)));
