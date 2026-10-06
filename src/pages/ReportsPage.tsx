/*
 * Reports (/reports, Advanced). The banner holds the scope (instruments, currency, period) and the type of
 * document (PDF, HTML, PowerPoint); below, the template library. A card opens the side panel: static preview on sample
 * data (click a page to enlarge), language, title and sections, and Generate.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReportFormat, ReportTemplate } from '../types';
import { useStudio } from '../state/studio';
import { useReportBuilder } from '../hooks/useReportBuilder';
import { REPORT_CSS, SECTION_LABELS, TEMPLATES, buildReportPages, layoutOf, reportColor } from '../lib/report';
import { SLIDE_CSS, buildSlidesHtml } from '../lib/slides';
import { sampleReport } from '../lib/reportSample';
import { LANGUAGES, tr } from '../lib/reportI18n';
import { CURRENCIES, label } from '../lib/domain';
import { monthEnd } from '../lib/months';
import { ddmmyyyy, monthWindow } from '../lib/period';
import { PeriodPicker } from '../components/PeriodPicker';
import { USE_MOCK } from '../api';
import { ErrorBanner } from '../components/ErrorBanner';
import { Icon } from '../components/Icons';
import { Tabs } from '../components/Tabs';
import { StatusIcon } from '../components/StatusIcon';
import { InstrumentPicker } from '../components/InstrumentPicker';
import { MockPages } from '../components/reports/MockPages';
import { PageViewer } from '../components/reports/PageViewer';

const FORMAT_HINT: Record<ReportFormat, string> = {
  pdf: 'A4 pages, ready to send',
  html: 'A4 pages in the browser, printable',
  pptx: '16:9 slides with editable tables and charts',
};

/** Pages or slides the real file will have (benchmark rows counted when the section is on). */
function countPages(t: ReportTemplate, f: ReportFormat, n: number, sec: string[]): number {
  const has = (x: string) => sec.includes(x), rows = n * (has('bm') ? 2 : 1), ch = (r: number) => Math.max(1, Math.ceil(r / 14));
  if (layoutOf(f) === 'a4') return t === 'factsheet' ? n : 1 + (has('dd') || has('cal') || has('det') ? 1 : 0);
  if (t === 'factsheet') return 1 + n * (1 + (has('cal') || has('monthly') ? 1 : 0));
  return 1 + ch(rows) + (has('chart') ? 1 : 0) + (has('dd') ? 1 : 0) + (has('cal') ? ch(rows) : 0) + (has('det') ? ch(n) : 0);
}

export function ReportsPage() {
  const s = useStudio();
  const r = useReportBuilder();
  const navigate = useNavigate();
  const { o, set } = r;
  const [pick, setPick] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const layout = layoutOf(o.format);
  const unit = layout === 'a4' ? 'page' : 'slide';
  const S = tr(o.language);

  // Static previews on sample data: card thumbnails follow the document type; the panel also follows the options.
  const thumbs = useMemo(() => Object.fromEntries(r.templates.map(t => {
    const input = sampleReport({ template: t, language: o.language, title: '', preparedFor: '', sections: TEMPLATES[t].defaultSections });
    return [t, layout === 'a4' ? buildReportPages(input)[0] : buildSlidesHtml(input)[1]];
  })), [r.templates, o.language, layout]);
  const mock = useMemo(() => {
    if (!open) return [];
    const input = sampleReport({ template: o.template, language: o.language, title: o.title, preparedFor: o.preparedFor, sections: r.sections, currency: o.currency });
    return layout === 'a4' ? buildReportPages(input) : buildSlidesHtml(input);
  }, [open, o.template, o.language, o.title, o.preparedFor, o.currency, r.sections, layout]);

  const range = r.range, grid = r.grid;
  const periodText = range ? `${ddmmyyyy(range.from)} → ${ddmmyyyy(range.to)}` : '–';
  // Sample data only has month ends: say which months the file will use when the dates fall mid-month.
  const win = range && grid ? monthWindow(grid, range) : null;
  const roundNote = USE_MOCK && win?.rounded && grid ? `Sample data is monthly: the file uses ${monthEnd(grid.key(win.a - 1))} → ${monthEnd(grid.key(win.e))}` : undefined;
  const nameOf = (id: string) => { const i = s.instrumentOf(id); return i ? label(i) : id; };
  const pages = countPages(o.template, o.format, r.ids.length || 1, r.sections);
  const T = TEMPLATES[o.template];
  const fmt = r.formats.find(f => f.id === o.format);

  return (
    <section className="page rep">
      <style>{REPORT_CSS + SLIDE_CSS}</style>
      <ErrorBanner error={r.job.error} onDismiss={r.job.clearError} />

      {/* ---------- banner: instruments · currency · period · type of document ---------- */}
      <div className="dash-hd rep-scope">
        <div className="fld dh-n"><span className="lb">Instruments</span><b className="num">{r.ids.length}</b></div>
        <div className="fld">
          <label htmlFor="rCcy">Currency</label>
          <select id="rCcy" className="sel" value={o.currency} onChange={ev => set({ currency: ev.target.value })}
            data-tip={o.currency && USE_MOCK ? 'Sample data is not converted; the server will convert.' : undefined}>
            <option value="">Own currency</option>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <PeriodPicker value={o.period} custom={o.custom} label={periodText} tip={roundNote}
          onChange={p => set({ ...(p.period ? { period: p.period } : {}), ...(p.custom ? { custom: p.custom } : {}) })} />
        <div className="fld">
          <span className="lb">Document · <span className="dim">{FORMAT_HINT[o.format]}</span></span>
          <Tabs ariaLabel="Type of document" value={o.format} onChange={v => set({ format: v })}
            items={r.formats.map(f => ({ key: f.id, label: f.name }))} />
        </div>
        <button type="button" className="btn dh-go" aria-haspopup="dialog" onClick={ev => setPick(ev.currentTarget)}><Icon.search16 />Select instruments</button>
      </div>

      {r.ids.length > 0 ? (
        <div className="chiprow dash-chips">
          {r.ids.map((id, k) => (
            <span key={id} className="dchip" style={{ '--c': o.template === 'comparison' ? reportColor(k) : 'var(--blue)' } as CSSProperties}>
              <button type="button" className="t" data-tip={r.imported.has(id) ? 'Imported from Excel · this session' : `vs ${r.benchName(id)}`}>{nameOf(id)}</button>
              <button type="button" className="x" aria-label={`Remove ${nameOf(id)}`} title="Remove" onClick={() => r.setIds(r.ids.filter(x => x !== id))}>×</button>
            </span>
          ))}
          <button type="button" className="lnk" onClick={() => r.setIds([])}>Clear</button>
        </div>
      ) : <div className="rep-none">No instruments yet. Use <b>Select instruments</b>, or <b>Add to report</b> in the Explorer.</div>}

      <div className="rep-body open">
        <div className="rep-main">
          {/* ---------- template library ---------- */}
          <div className="rep-grid" role="list" aria-label="Report templates">
            {r.templates.map(t => {
              const D = TEMPLATES[t], on = open && o.template === t;
              return (
                <button key={t} type="button" role="listitem" className="tcard" aria-pressed={on} aria-haspopup="dialog"
                  onClick={() => { set({ template: t }); setOpen(true); }}>
                  <span className={`tc-thumb ${layout}`} aria-hidden="true">
                    <MockPages pages={[thumbs[t]]} layout={layout} width={layout === 'a4' ? 96 : 196} />
                  </span>
                  <span className="tc-tx">
                    <b>{D.name}</b>
                    <span className="tc-d">{D.desc}</span>
                    <span className="tc-o">{layout === 'a4' ? D.layouts.a4 : D.layouts.slides} · EN · FR · DE</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- side panel: preview + configuration (an empty state until a report is picked) ---------- */}
        {!open && (
          <aside className="ux-panel rep-panel rep-empty" aria-label="Report settings">
            <Icon.reports />
            <b>Please select a report</b>
            <span>Pick a template in the list to see its preview and settings.</span>
          </aside>
        )}
        {open && (
          <aside className="ux-panel rep-panel" aria-label={`${T.name} settings`}>
            <div className="gx-hd">
              <h2>{T.name}</h2><span className="dim">{fmt?.name} · {r.ids.length ? `${pages} ${unit}${pages === 1 ? '' : 's'}` : `${unit}s`}</span>
              <button type="button" className="ib rt" aria-label="Close" title="Close" onClick={() => setOpen(false)}><Icon.close /></button>
            </div>
            <div className="ux-scroll">
              <div className="rep-strip">
                <div className="rep-strip-hd"><span className="pill">Sample data</span><span>Static preview · click a {unit} to enlarge</span></div>
                <div className={`rep-thumbs ${layout}`}>
                  {mock.map((p, i) => (
                    <button key={i} type="button" className="rep-th" aria-label={`Enlarge ${unit} ${i + 1}`} onClick={() => setZoom(i)}>
                      <MockPages pages={[p]} layout={layout} width={layout === 'a4' ? 112 : 176} />
                      <small className="num">{i + 1}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rep-form">
                <div className="fld"><span className="lb">Language</span>
                  <Tabs ariaLabel="Language" value={o.language} onChange={v => set({ language: v })} items={LANGUAGES.map(l => ({ key: l.id, label: l.name }))} />
                </div>
                <div className="fld"><label htmlFor="rTitle">Title</label>
                  <input id="rTitle" className="inp" value={o.title} placeholder={S.defaultTitle} onChange={ev => set({ title: ev.target.value })} />
                </div>
                <div className="fld"><label htmlFor="rFor">Prepared for</label>
                  <input id="rFor" className="inp" value={o.preparedFor} placeholder={`e.g. ${S.sampleClient}`} onChange={ev => set({ preparedFor: ev.target.value })} />
                </div>
                <fieldset className="fld rep-secs">
                  <legend className="lb">Sections</legend>
                  {T.sections.map(x => (
                    <label key={x} className="chk"><input type="checkbox" checked={r.sections.includes(x)}
                      onChange={ev => r.setSections(ev.target.checked ? [...r.sections, x] : r.sections.filter(y => y !== x))} />{SECTION_LABELS[x]}</label>
                  ))}
                  <span className="hint">{o.template === 'comparison' ? 'Risk & return table always included.' : 'Key figures always included.'}</span>
                </fieldset>
              </div>
            </div>
            <div className="rep-go">
              {r.job.job && <div className="msgline"><StatusIcon kind={r.job.job.kind} message={r.job.job.text} />{r.job.job.text}</div>}
              {r.issues.length > 0 && <div className="hint">{r.issues[0]}</div>}
              <button type="button" className="btn" disabled={!!r.issues.length || r.job.running} onClick={r.generate}>
                <Icon.download />Generate {fmt?.name}{r.ids.length ? ` · ${pages} ${unit}${pages === 1 ? '' : 's'}` : ''}
              </button>
            </div>
          </aside>
        )}
      </div>

      {zoom != null && mock.length > 0 && (
        <PageViewer pages={mock} layout={layout} index={Math.min(zoom, mock.length - 1)} onIndex={setZoom} onClose={() => setZoom(null)}
          caption={`${T.name} · ${fmt?.name} · ${LANGUAGES.find(l => l.id === o.language)!.name} · sample data`} />
      )}

      {pick && (
        <InstrumentPicker anchor={{ el: pick }} title="Instruments in the report"
          instruments={[...s.catalogue.instruments.filter(i => i.source === 'api' || s.can('custom.view')), ...(s.can('import.excel') ? s.imports.map(x => x.inst) : [])]}
          taken={r.ids} onImport={s.can('import.excel') ? () => navigate('/upload') : undefined} onClose={() => setPick(null)} onAdd={ids => r.setIds([...r.ids, ...ids])} />
      )}
    </section>
  );
}
