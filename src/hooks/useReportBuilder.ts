/* Reports page: template, output, language and options, the instruments to report on, and the export job. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ReportFormat, ReportImportedSeries, ReportLanguage, ReportTemplate } from '../types';
import { useStudio } from '../state/studio';
import { useSticky } from './useSticky';
import { useFolders } from './useFolders';
import { useBenchmarks } from './useBenchmarks';
import { useReportJob } from './useReportJob';
import { FORMATS, TEMPLATES, TEMPLATE_ORDER } from '../lib/report';
import type { Permission } from '../lib/permissions';
import type { DateRange, PickPeriod } from '../lib/period';
import { monthEndIso, rangeOf } from '../lib/period';
import { seriesFromPrices } from '../lib/sheetImport';
import { tr } from '../lib/reportI18n';

export interface ReportOptions {
  template: ReportTemplate;
  format: ReportFormat;
  language: ReportLanguage;
  title: string;
  preparedFor: string;
  /** Sections per template, so switching templates keeps each one's choice. */
  sections: Record<ReportTemplate, string[]>;
  /** Same selector and meaning as the Dashboard; custom dates are ISO. */
  period: PickPeriod;
  custom: DateRange;
  /** '' = each instrument's own currency. */
  currency: string;
}
/** Sent by other pages (e.g. the Dashboard's Create report) as router state: the report starts from this scope. */
export interface ReportSeed {
  ids: string[];
  currency?: string;
  period?: { period: PickPeriod; custom: DateRange };
}

const DEFAULTS: ReportOptions = {
  template: 'comparison', format: 'pdf', language: 'en', title: '', preparedFor: '',
  sections: { comparison: TEMPLATES.comparison.defaultSections, factsheet: TEMPLATES.factsheet.defaultSections },
  period: 'YTD', custom: { from: '', to: '' }, currency: '',
};

export function useReportBuilder() {
  const s = useStudio();
  const cat = s.catalogue;
  const fo = useFolders(cat.instruments, s.can('custom.view'), s.me?.permissions.join() ?? '', !!s.me && !cat.loading);
  const bm = useBenchmarks(cat, fo);
  const [raw, setO] = useSticky<ReportOptions>('reports.options.v2', DEFAULTS);
  // Only the templates and formats this profile may use (config/permissions.json).
  const templates = TEMPLATE_ORDER.filter(t => s.can(`reports.template.${t}` as Permission));
  const formats = FORMATS.filter(f => s.can(`reports.format.${f.id}` as Permission));
  const merged: ReportOptions = { ...DEFAULTS, ...raw, sections: { ...DEFAULTS.sections, ...(raw.sections ?? {}) } };
  const o: ReportOptions = {
    ...merged,
    template: templates.includes(merged.template) ? merged.template : templates[0] ?? merged.template,
    format: formats.some(f => f.id === merged.format) ? merged.format : formats[0]?.id ?? merged.format,
  };
  const set = useCallback((p: Partial<ReportOptions>) => setO(x => ({ ...x, ...p })), [setO]);
  const sections = o.sections[o.template];
  const setSections = (list: string[]) => set({ sections: { ...o.sections, [o.template]: TEMPLATES[o.template].sections.filter(x => list.includes(x)) } });

  // Starts from the scope another page sent (Dashboard), else the Explorer selection ("Add to report").
  const loc = useLocation(), navigate = useNavigate();
  const seed = (loc.state as { report?: ReportSeed } | null)?.report;
  const [rawIds, setIds] = useState<string[]>(() => seed?.ids ?? s.selection);
  useEffect(() => {
    if (!seed) return;
    set({
      ...(seed.currency !== undefined ? { currency: seed.currency } : {}),
      ...(seed.period ? { period: seed.period.period, custom: seed.period.custom } : {}),
    });
    // Apply once: a reload or Back must not reset what the user changed since.
    navigate(loc.pathname, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const imported = useMemo(() => new Map(s.imports.map(x => [x.inst.id, x])), [s.imports]);
  const ids = useMemo(() => rawIds.filter(id => cat.byId.has(id) || imported.has(id)), [rawIds, cat.byId, imported]);

  // Calendar dates of the period, as on the Dashboard; data ends at the last month end of the grid.
  const range = useMemo(() => {
    if (!cat.grid) return null;
    const asOf = monthEndIso(cat.grid.key(cat.grid.last)), first = monthEndIso(cat.grid.key(-1));
    return rangeOf(o.period, o.custom, asOf, first);
  }, [cat.grid, o.period, o.custom]);

  const job = useReportJob(useCallback((f: string) => s.notify('done', `${f} downloaded`), [s.notify]));

  const issues: string[] = [];
  if (!templates.length || !formats.length) issues.push('Your profile has no report template or format.');
  if (!ids.length) issues.push('Add at least one instrument.');

  const generate = () => {
    if (!cat.grid || !range || issues.length) return;
    const imp: ReportImportedSeries[] = ids.filter(id => imported.has(id)).map(id => {
      const x = imported.get(id)!, m = seriesFromPrices(x.prices, 'M');
      return { id, name: x.inst.name, currency: x.inst.currency, returns: m.dates.map((d, k) => ({ month: d.slice(0, 7), value: m.returns[k] })) };
    });
    job.run({
      template: o.template, format: o.format, language: o.language, currency: o.currency,
      title: o.title.trim() || tr(o.language).defaultTitle, preparedFor: o.preparedFor.trim(),
      period: range,
      sections, instrumentIds: ids,
      // Outside a folder: security level, else the track record's own benchmark (as in the Dashboard).
      benchmarks: Object.fromEntries(ids.filter(id => !imported.has(id)).map(id => [id, bm.resolve(id, null)?.id ?? null])),
      ...(imp.length ? { imported: imp } : {}),
    });
  };

  return {
    o, set, templates, formats, sections, setSections, ids, setIds, imported, range, grid: cat.grid,
    benchName: (id: string) => (imported.has(id) ? 'no benchmark' : bm.resolve(id, null)?.name ?? 'no benchmark'),
    issues, generate, job,
    reset: () => { setO(DEFAULTS); setIds([]); },
  };
}
