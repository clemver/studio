/* Explorer (/explorer, both levels): folder tree | grid | detail card. */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudio } from '../state/studio';
import { CRITERIA, GROUP_FIELDS, useExplorer } from '../hooks/useExplorer';
import type { CritKey, GroupField, Row } from '../hooks/useExplorer';
import { ALL, useFolders } from '../hooks/useFolders';
import { useReportJob } from '../hooks/useReportJob';
import { useBenchmarks } from '../hooks/useBenchmarks';
import { benchmarkSourceText, inheritedBenchmark } from '../lib/benchmark';
import type { ResolvedBenchmark } from '../lib/benchmark';
import { BenchmarkPicker } from '../components/BenchmarkPicker';
import type { BenchmarkLevel } from '../components/BenchmarkPicker';
import { monthEndIso } from '../lib/period';
import type { ReportFormat, RiskProfile } from '../types';
import { CATEGORY_SINGULAR, CURRENCIES, RISKS, label } from '../lib/domain';
import { monthEnd } from '../lib/months';
import { saveBlob } from '../lib/download';
import { USE_MOCK } from '../api';
import { Icon } from '../components/Icons';
import { ErrorBanner } from '../components/ErrorBanner';
import { Chip } from '../components/Chip';
import { Switch } from '../components/Switch';
import { Menu, Popover, usePopover } from '../components/Menu';
import type { Anchor } from '../components/Menu';
import { FolderTree } from '../components/explorer/FolderTree';
import { CatalogueGrid } from '../components/explorer/CatalogueGrid';
import type { RowClickMods } from '../components/explorer/CatalogueGrid';
import { DetailCard } from '../components/explorer/DetailCard';
import type { CardAction } from '../components/explorer/DetailCard';
import { RowMenu } from '../components/explorer/RowMenu';
import { InstrumentPicker } from '../components/InstrumentPicker';
import { TagPicker } from '../components/TagPicker';

const PAGE_SIZES = [20, 50, 100];

/** CSV of the rows in view (all pages). Values in %, 2 decimals. */
function toCsv(rows: Row[]): Blob {
  const pc = (x: number | null | undefined) => (x == null || !isFinite(x) ? '' : (x * 100).toFixed(2));
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = ['Display name', 'Source name', 'ID', 'Category', 'Risk profile', 'Currency', 'YTD %', '1Y %', '3Y p.a. %', '5Y p.a. %', 'Incep. p.a. %', 'Vol. 3Y %', 'Excess 1Y %'];
  const lines = rows.map(({ rec: { inst: i }, f }) => [
    q(label(i)), q(i.name), q(i.code), q(CATEGORY_SINGULAR[i.category]), q(i.riskProfile ?? ''), i.currency,
    pc(f.ytd?.cum), pc(f.y1?.cum), pc(f.y3?.ann), pc(f.y5?.ann), pc(f.itd?.ann), pc(f.y3?.vol), pc(f.y1?.excess),
  ].join(';'));
  return new Blob(['﻿' + [head.map(q).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export function ExplorerPage() {
  const s = useStudio();
  const navigate = useNavigate();
  const { catalogue: cat, selection, limit, can } = s;
  const showCustom = can('custom.view'), manageWatchlist = can('watchlist.manage');

  const fo = useFolders(cat.instruments, showCustom, s.me?.permissions.join() ?? '', !!s.me && !cat.loading);
  const bm = useBenchmarks(cat, fo);
  const ex = useExplorer(id => (fo.byId.get(id) ?? fo.byId.get(ALL))?.ids ?? null, bm.figures);
  // A deleted or hidden folder falls back to the whole watchlist.
  const currentId = fo.byId.has(ex.filters.folder) ? ex.filters.folder : ALL;
  const folder = fo.byId.get(currentId);

  const filterPop = usePopover();
  const colsPop = usePopover();
  const groupPop = usePopover();
  const [search, setSearch] = useState(!!ex.filters.q);
  const [over, setOver] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ id: string; anchor: Anchor } | null>(null);
  const [addTo, setAddTo] = useState<{ id: string; anchor: Anchor } | null>(null);
  const [tagEdit, setTagEdit] = useState<{ id: string; anchor: Anchor } | null>(null);
  const [benchPick, setBenchPick] = useState<{ kind: 'instrument' | 'folder'; id: string; anchor: Anchor } | null>(null);

  const report = useReportJob(useCallback((f: string) => s.notify('done', `${f} downloaded`), [s.notify]));
  const download = (format: ReportFormat) => {
    if (!cat.grid || !s.period || !selection.length) return;
    s.showToast(format === 'pdf' ? 'Building the PDF…' : 'Building the HTML report…');
    report.run({
      template: 'comparison', format, language: 'en', currency: '', title: 'Strategy performance review', preparedFor: '',
      period: { from: monthEndIso(cat.grid.key(s.period.a - 1)), to: monthEndIso(cat.grid.key(s.period.e)) },
      sections: ['chart', 'dd', 'cal', 'det'], instrumentIds: selection,
      // The benchmarks shown in this folder, so the file matches the screen.
      benchmarks: Object.fromEntries(selection.map(id => [id, bm.resolve(id, currentId)?.id ?? null])),
    });
  };
  // Selection like a file list: click = only this row, ctrl/⌘ = add or remove, shift = range from the last click.
  const [anchor, setAnchor] = useState<string | null>(null);
  const clickRow = (id: string, m: RowClickMods, visibleIds: string[]) => {
    if (m.shift && anchor && visibleIds.includes(anchor)) {
      const [i, j] = [visibleIds.indexOf(anchor), visibleIds.indexOf(id)].sort((x, y) => x - y);
      const range = visibleIds.slice(i, j + 1);
      const next = m.ctrl ? [...selection, ...range.filter(x => !selection.includes(x))] : range;
      if (next.length > limit) s.showToast(`Selection is limited to ${limit}. The first ${limit} are selected.`);
      s.setSelection(next);
      return;
    }
    setAnchor(id);
    if (m.ctrl || m.touch) { toggleRow(id); return; }
    s.setSelection(selection.length === 1 && selection[0] === id ? [] : [id]);
  };
  const toggleRow = (id: string) => {
    if (!selection.includes(id) && selection.length >= limit) { s.showToast(`Selection is full (${limit}). Untick one first.`); return; }
    s.toggle(id);
  };
  const copyId = (code: string) => {
    navigator.clipboard?.writeText(code).then(() => s.showToast(`Copied ${code}`), () => s.showToast(`Clipboard blocked. ID: ${code}`));
  };
  const guard = async (fn: () => Promise<unknown>, what: string) => {
    try { await fn(); } catch (e) { s.showToast(`${what} failed: ${e instanceof Error && 'detail' in e ? (e as { detail: string }).detail : String(e)}`); }
  };

  const f = ex.filters, n = selection.length;
  const records = selection.map(id => bm.record(id, currentId)).filter(r => r != null);
  const menuRec = rowMenu ? cat.byId.get(rowMenu.id) : undefined;
  const storedCurrent = folder && !folder.virtual ? folder : null;
  const storedFolder = fo.stored.find(x => x.id === currentId) ?? null; // with benchmark fields
  const benchOf = (id: string) => bm.resolve(id, currentId);
  /** tags.manage: any security; custom.manage: custom series. */
  const canTag = (id: string) => { const i = cat.byId.get(id)?.inst; return !!i && (can('tags.manage') || (can('custom.manage') && i.source === 'custom')); };

  /* ---------- benchmark levels this user may change ---------- */
  const nameOfResolved = (r: ResolvedBenchmark, instId: string) => {
    const inst = cat.byId.get(instId)?.inst;
    const name = r.id ? bm.nameOf(r.id) : inst?.source === 'api' ? inst.benchmarkName : 'No benchmark';
    return `${name ?? 'No benchmark'} · ${benchmarkSourceText(r)}`;
  };
  const instrumentLevels = (instId: string): BenchmarkLevel[] => {
    const inst = cat.byId.get(instId)?.inst; if (!inst) return [];
    const ctx = bm.contextOf(currentId);
    const out: BenchmarkLevel[] = [];
    if (storedFolder && storedFolder.kind !== 'system' && storedFolder.editable) out.push({
      key: 'personal', label: 'This folder only', current: storedFolder.benchmarkOverrides[instId] ?? null,
      inheritedName: nameOfResolved(inheritedBenchmark(inst, ctx, 'personal-instrument'), instId),
      help: `Only you see it, and only in “${storedFolder.name}”.`,
    });
    if (can('benchmarks.security')) out.push({
      key: 'security', label: 'All users', current: inst.benchmarkId,
      inheritedName: nameOfResolved(inheritedBenchmark(inst, storedFolder?.kind === 'system' ? ctx : null, 'security'), instId),
      help: 'Set on the instrument for every user, in every Watchlist folder. Overrides folder benchmarks.',
    });
    return out;
  };
  const folderLevel = (folderId: string): BenchmarkLevel[] => {
    const fd = fo.stored.find(x => x.id === folderId); if (!fd) return [];
    const parent = fd.parentId ? fo.stored.find(x => x.id === fd.parentId) : undefined;
    const inherited = parent?.benchmarkId ? `${bm.nameOf(parent.benchmarkId)} · from folder “${parent.name}”` : 'Each instrument keeps its own benchmark';
    return [{
      key: 'folder', label: fd.name, current: fd.benchmarkId, inheritedName: inherited,
      help: fd.kind !== 'system'
        ? `Only you see it. Applies to instruments in this folder unless you override one.${fd.parentId ? '' : ' Sub-folders inherit it.'}`
        : 'Applies to instruments without a benchmark of their own. Sub-folders inherit it.',
    }];
  };
  const canEditFolderBench = !!storedFolder && storedFolder.editable;
  const folderBenchLine = (() => {
    if (!storedFolder) return null;
    const parent = storedFolder.parentId ? fo.stored.find(x => x.id === storedFolder.parentId) : undefined;
    if (storedFolder.benchmarkId) return { name: bm.nameOf(storedFolder.benchmarkId), src: storedFolder.kind !== 'system' ? 'your folder benchmark' : 'folder benchmark' };
    if (parent?.benchmarkId) return { name: bm.nameOf(parent.benchmarkId), src: `from “${parent.name}”` };
    return { name: null, src: "each instrument's own" };
  })();
  const pickBenchmark = async (level: string, id: string | null) => {
    if (!benchPick) return;
    const t = benchPick;
    await guard(async () => {
      if (t.kind === 'folder') await bm.setFolder(t.id, id);
      else if (level === 'security') await bm.setSecurity(t.id, id);
      else if (storedFolder) await bm.setPersonal(storedFolder, t.id, id);
      s.showToast(id ? `Benchmark set to “${bm.nameOf(id)}”` : 'Benchmark reset to inherited');
    }, 'Saving the benchmark');
  };
  const activeFilters = (f.currency ? 1 : 0) + (f.risk ? 1 : 0) + (f.tag ? 1 : 0) + f.criteriaOn.filter(k => f.criteria[k]).length + (f.selectedOnly ? 1 : 0);

  const chips: { key: string; node: React.ReactNode; label: string; remove: () => void }[] = [];
  if (f.q.trim()) chips.push({ key: 'q', label: 'search', node: <>Search: <b>“{f.q.trim()}”</b></>, remove: () => ex.setQuery('') });
  if (f.currency) chips.push({ key: 'ccy', label: 'currency', node: <>Currency: <b>{f.currency}</b></>, remove: () => ex.setCurrency('') });
  if (f.risk) chips.push({ key: 'risk', label: 'risk profile', node: <>Risk profile: <b>{f.risk}</b></>, remove: () => ex.setRisk('') });
  if (f.tag) chips.push({ key: 'tag', label: 'tag', node: <>Tag: <b>{s.tagName(f.tag)}</b></>, remove: () => ex.setTag('') });
  (Object.keys(CRITERIA) as CritKey[]).forEach(k => {
    if (f.criteria[k]) chips.push({ key: k, label: CRITERIA[k].label, node: <>{CRITERIA[k].label}: <b>{CRITERIA[k].chip(f.criteria[k])}</b></>, remove: () => ex.removeCriterion(k) });
  });
  if (f.selectedOnly) chips.push({ key: 'sel', label: 'selected only', node: <b>Selected only</b>, remove: () => ex.setSelectedOnly(false) });

  // Card buttons by rights, most useful first; the card shows two.
  const quick = can('reports.quick') && can('reports.template.comparison');
  const openDash = () => { s.openDashboard(selection, storedFolder?.id ?? null); navigate('/dashboard'); };
  const actions: CardAction[] = [
    ...(can('dashboard.view') ? [{ eyebrow: 'Dashboard', title: 'Open in dashboard', onClick: openDash }] : []),
    ...(can('reports.view') ? [{ eyebrow: 'Reports', title: 'Create report', onClick: () => navigate('/reports'), tip: 'Build a report from the selection' }] : []),
    ...(quick && can('reports.format.pdf') ? [{ eyebrow: 'Comparison report', title: 'Download PDF report', onClick: () => download('pdf'), disabled: report.running, tip: 'Comparison template · period from the chart' }] : []),
    ...(quick && can('reports.format.html') ? [{ eyebrow: 'Comparison report', title: 'Download HTML', onClick: () => download('html'), disabled: report.running }] : []),
  ].slice(0, 2);

  const from = ex.page * ex.view.pageSize;
  const groupsLeft = (Object.keys(GROUP_FIELDS) as GroupField[]).filter(g => !ex.view.groupBy.includes(g));

  return (
    <section className="page">
      <ErrorBanner error={cat.error} onDismiss={cat.clearError} onRetry={cat.reload} />
      <ErrorBanner error={fo.error} onDismiss={fo.clearError} onRetry={fo.reload} />
      <ErrorBanner error={ex.error} onDismiss={ex.clearError} />
      <ErrorBanner error={report.error} onDismiss={report.clearError} />

      <div className={`ux${ex.view.showFolders ? '' : ' notree'}${records.length ? '' : ' nocard'}`}>
        {ex.view.showFolders && (
          <FolderTree nodes={fo.nodes} current={currentId} onSelect={ex.setFolder} canOwnFolders={can('folders.personal')} canManageWatchlist={manageWatchlist} loading={fo.loading}
            onCreate={async (kind, parentId) => {
              const nf = await fo.create('New folder', [], kind, parentId);
              ex.setFolder(nf.id);
              return nf.id;
            }}
            onAddInstruments={(id, el) => setAddTo({ id, anchor: { el, align: 'right' } })}
            onBenchmark={(id, el) => setBenchPick({ kind: 'folder', id, anchor: { el, align: 'right' } })}
            onRename={(id, name) => guard(() => fo.rename(id, name), 'Renaming the folder')}
            onDelete={id => guard(async () => {
              await fo.remove(id);
              if (currentId === id) ex.setFolder(ALL);
              s.showToast('Folder deleted');
            }, 'Deleting the folder')}
            onCollapse={() => ex.setShowFolders(false)}
            onCustom={can('custom.manage') ? a => navigate(a === 'new' ? '/custom?new=1' : '/custom') : undefined} />
        )}

        <div className="ux-panel" aria-label="Instruments">
          <div className="gx-hd">
            {!ex.view.showFolders && (
              <button type="button" className="ib" aria-label="Show folders" title="Show folders" onClick={() => ex.setShowFolders(true)}><Icon.folder className="fi sys" /></button>
            )}
            <select className="sel only-narrow" aria-label="Folder" value={currentId} onChange={ev => ex.setFolder(ev.target.value)}>
              {fo.nodes.map(nd => <option key={nd.id} value={nd.id}>{nd.parentId ? '  ' : ''}{nd.name}</option>)}
            </select>
            <h2 title={folder?.name}>{folder?.name ?? 'Whole watchlist'}</h2>
            {folderBenchLine && (
              <span className="gx-bench" data-tip="Instruments with a benchmark of their own (set by admins) keep it">
                Benchmark: <b>{folderBenchLine.name ?? 'per instrument'}</b>{folderBenchLine.name ? ` · ${folderBenchLine.src}` : ''}
                {canEditFolderBench && <button type="button" className="lnk" onClick={ev => setBenchPick({ kind: 'folder', id: storedFolder!.id, anchor: { el: ev.currentTarget } })}>Change</button>}
              </span>
            )}
            <span className="cnt num">{cat.loading ? 'Loading…' : `${ex.rows.length}${folder && ex.rows.length !== folder.ids.size ? ` of ${folder.ids.size}` : ''} instrument${ex.rows.length === 1 ? '' : 's'}`}</span>
            {search
              ? <input className="inp gx-search" id="cq" type="search" autoFocus placeholder="Name, ID or benchmark" aria-label="Search instruments" value={f.q}
                onChange={ev => ex.setQuery(ev.target.value)} onBlur={() => { if (!f.q) setSearch(false); }} onKeyDown={ev => { if (ev.key === 'Escape') { ex.setQuery(''); setSearch(false); } }} />
              : <button type="button" className="ib" aria-label="Search instruments" title="Search" onClick={() => setSearch(true)}><Icon.search16 /></button>}
            <span className="rt">
              {USE_MOCK && <span className="pill" style={{ marginRight: 6 }}>Sample data</span>}
              <span className="seln num" data-tip={`Data as of ${cat.grid ? monthEnd(cat.grid.key(cat.grid.last)) : '-'}`}>{n} / {limit} selected</span>
              <button type="button" className="ib" aria-label="Download the list as CSV" title="Download the list (CSV)" disabled={!ex.rows.length}
                onClick={() => saveBlob(`${(folder?.name ?? 'instruments').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_')}.csv`, toCsv(ex.rows))}>
                <Icon.download />
              </button>
              <button type="button" className="ib" aria-label={`Filters${activeFilters ? ` (${activeFilters} active)` : ''}`} title="Filters" aria-pressed={activeFilters > 0}
                aria-haspopup="dialog" aria-expanded="false" onClick={ev => filterPop.show({ el: ev.currentTarget, align: 'right' })}>
                <Icon.filter />
              </button>
              <button type="button" className="ib" aria-label="Columns and groups" title="Columns and groups" aria-haspopup="menu" aria-expanded="false"
                onClick={ev => colsPop.show({ el: ev.currentTarget, align: 'right' })}>
                <Icon.dots />
              </button>
            </span>
          </div>

          <div className={`zone${over ? ' over' : ''}`}
            onDragOver={ev => { if (ev.dataTransfer.types.includes('text/x-group')) { ev.preventDefault(); setOver(true); } }}
            onDragLeave={() => setOver(false)}
            onDrop={ev => { ev.preventDefault(); setOver(false); const g = ev.dataTransfer.getData('text/x-group') as GroupField; if (g in GROUP_FIELDS) ex.addGroup(g); }}>
            <Icon.rows />
            {ex.view.groupBy.length
              ? ex.view.groupBy.map(g => <Chip key={g} onRemove={() => ex.removeGroup(g)} removeLabel={`group by ${GROUP_FIELDS[g]}`}>{GROUP_FIELDS[g]}</Chip>)
              : <span>Drag here to set row groups</span>}
            {groupsLeft.length > 0 && (
              <button type="button" className="ib sm" aria-label="Add a row group" title="Add a row group" aria-haspopup="menu" aria-expanded="false"
                onClick={ev => groupPop.show({ el: ev.currentTarget })}><Icon.plus /></button>
            )}
            {chips.length > 0 && <span className="vsep" />}
            {chips.map(c => <Chip key={c.key} onRemove={c.remove} removeLabel={c.label}>{c.node}</Chip>)}
          </div>

          <div className="ux-scroll tw cat-table">
            {cat.loading && !cat.grid ? <div className="loading">Loading track records…</div>
              : !cat.grid ? <div className="empty">No track records to show. Retry, or check back once data is available.</div>
                : !ex.rows.length
                  ? <div className="empty">{folder && !folder.ids.size
                    ? (folder.editable ? 'This folder is empty. Add instruments with ⋮ → Add to folder.' : 'This folder is empty.')
                    : 'No instrument matches these criteria. Remove a criterion or reset the filters.'}</div>
                  : (
                    <CatalogueGrid grid={cat.grid} rows={ex.pageRows} groups={ex.view.groupBy.length ? ex.groups : null} collapsed={ex.view.collapsed}
                      showBenchmarkLine={ex.view.showBenchmarkLine} showExcess={ex.view.showExcess} sort={ex.view.sort}
                      selection={selection} limit={limit} openMenuId={rowMenu?.id ?? null} colorOf={s.colorOf}
                      onSort={ex.setSort} onToggleGroup={ex.toggleGroup}
                      onRowClick={(id, m) => clickRow(id, m, (ex.view.groupBy.length ? ex.groups.filter(g => !ex.view.collapsed.includes(g.key)).flatMap(g => g.rows) : ex.pageRows).map(r => r.rec.inst.id))}
                      onMenu={(id, el) => setRowMenu(m => (m?.id === id ? null : { id, anchor: { el, align: 'right' } }))}
                      onContextMenu={(id, cx, cy) => setRowMenu({ id, anchor: { x: cx, y: cy } })} benchOf={benchOf} />
                  )}
          </div>

          <div className="gx-foot">
            <label htmlFor="pgSize">Items per page:</label>
            <select id="pgSize" className="sel" value={ex.view.pageSize} onChange={ev => ex.setPageSize(Number(ev.target.value))}>
              {PAGE_SIZES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <span className="vsep" />
            <span className="num">{ex.rows.length ? `${from + 1}-${Math.min(from + ex.view.pageSize, ex.rows.length)} of ${ex.rows.length} items` : '0 items'}</span>
            <span className="sp" />
            <select className="sel" aria-label="Page" value={ex.page} onChange={ev => ex.setPage(Number(ev.target.value))}>
              {Array.from({ length: ex.pages }, (_, k) => <option key={k} value={k}>{k + 1}</option>)}
            </select>
            <span className="num">of {ex.pages} page{ex.pages === 1 ? '' : 's'}</span>
            <span className="vsep" />
            <button type="button" className="ib" aria-label="Previous page" title="Previous page" disabled={ex.page === 0} onClick={() => ex.setPage(ex.page - 1)}><Icon.left /></button>
            <button type="button" className="ib" aria-label="Next page" title="Next page" disabled={ex.page >= ex.pages - 1} onClick={() => ex.setPage(ex.page + 1)}><Icon.right /></button>
          </div>
        </div>

        {cat.grid && s.period && records.length > 0 && (
          <DetailCard key={records.length === 1 ? 'one' : 'many'} grid={cat.grid} period={s.period} preset={s.preset} onPreset={s.setPreset}
            records={records} limit={limit} colorOf={s.colorOf} figuresOf={cat.figuresOf} actions={actions} job={report.job}
            onClear={() => s.setSelection([])} onRemove={s.unselect} onCopyId={copyId} tags={s.tags} benchOf={benchOf}
            onEditTags={selection.length === 1 && canTag(selection[0]) ? (id, el) => setTagEdit({ id, anchor: { el } }) : undefined}
            onChangeBenchmark={selection.length === 1 && instrumentLevels(selection[0]).length ? (id, el) => setBenchPick({ kind: 'instrument', id, anchor: { el } }) : undefined} />
        )}
      </div>

      {/* Below 1180px the card is hidden and replaced by this bar. */}
      <div className={`bbar${n ? ' on' : ''}`}>
        <span className="cnt num">{n} selected</span>
        <button type="button" className="btn sec" onClick={() => s.setSelection([])}>Clear</button>
        {actions[0] && <button type="button" className="btn" disabled={actions[0].disabled} onClick={actions[0].onClick}>{actions[0].title}</button>}
      </div>

      {filterPop.open && (
        <Popover anchor={filterPop.open.anchor} onClose={filterPop.close} width={280} role="dialog" ariaLabel="Filters">
          <div className="hd"><b>Filters</b><span>Applied to the grid and sent to the API</span></div>
          <div className="form">
            <div className="fld"><label htmlFor="fCcy">Currency</label>
              <select className="sel" id="fCcy" value={f.currency} onChange={ev => ex.setCurrency(ev.target.value)}>
                <option value="">All</option>{CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div className="fld"><label htmlFor="fRisk">Risk profile</label>
              <select className="sel" id="fRisk" value={f.risk} onChange={ev => ex.setRisk(ev.target.value as RiskProfile | '')}>
                <option value="">All</option>{RISKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select></div>
            <div className="fld"><label htmlFor="fTag">Tag</label>
              <select className="sel" id="fTag" value={f.tag} onChange={ev => ex.setTag(ev.target.value)}>
                <option value="">Any</option>
                {[...s.tags].sort((a, b) => a.name.localeCompare(b.name)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            {(Object.keys(CRITERIA) as CritKey[]).map(k => (
              <div className="fld" key={k}><label htmlFor={`cr_${k}`}>{CRITERIA[k].label}</label>
                <select className="sel" id={`cr_${k}`} value={f.criteria[k]} onChange={ev => { ex.addCriterion(k); ex.setCriterion(k, ev.target.value); }}>
                  {CRITERIA[k].options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
            ))}
            <Switch checked={f.selectedOnly} onChange={ex.setSelectedOnly} label="Selected only" />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" className="lnk" onClick={ex.reset}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Reset filters</span></button>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn" onClick={filterPop.close}>Done</button>
            </div>
          </div>
        </Popover>
      )}
      {colsPop.open && (
        <Menu anchor={colsPop.open.anchor} onClose={colsPop.close} width={260} items={[
          { kind: 'note', text: 'Columns' },
          { label: 'Benchmark under the name', check: ex.view.showBenchmarkLine, onSelect: ex.toggleBenchmarkLine },
          { label: 'Excess vs benchmark (1Y)', check: ex.view.showExcess, onSelect: ex.toggleExcess },
          { kind: 'sep' },
          { label: 'Show folders', check: ex.view.showFolders, onSelect: () => ex.setShowFolders(!ex.view.showFolders) },
          { label: 'Expand all groups', onSelect: ex.expandAll, disabled: !ex.view.groupBy.length },
          { label: 'Collapse all groups', onSelect: ex.collapseAll, disabled: !ex.view.groupBy.length },
        ]} />
      )}
      {groupPop.open && (
        <Menu anchor={groupPop.open.anchor} onClose={groupPop.close} head={<b>Group rows by</b>}
          items={groupsLeft.map(g => ({ label: GROUP_FIELDS[g], onSelect: () => ex.addGroup(g) }))} />
      )}
      {addTo && (
        <InstrumentPicker anchor={addTo.anchor} title={`Add to “${fo.byId.get(addTo.id)?.name ?? ''}”`} onClose={() => setAddTo(null)}
          // Watchlist: track records from the universe; custom folders: custom series; own folders: anything.
          instruments={cat.instruments.filter(i => {
            const k = fo.byId.get(addTo.id)?.kind;
            return k === 'system' ? i.source === 'api' : k === 'custom' ? i.source === 'custom' : i.source !== 'upload' && (showCustom || i.source === 'api');
          })}
          taken={[...(fo.byId.get(addTo.id)?.ids ?? [])]}
          onAdd={ids => guard(async () => {
            const f = await fo.addInstruments(addTo.id, ids);
            s.showToast(`${ids.length} added to “${f.name}”`);
          }, 'Adding instruments')} />
      )}
      {tagEdit && cat.byId.get(tagEdit.id) && (
        <TagPicker anchor={tagEdit.anchor} subtitle={label(cat.byId.get(tagEdit.id)!.inst)} value={cat.byId.get(tagEdit.id)!.inst.tags}
          tags={s.tags} counts={s.tagCounts} onCreate={s.ensureTag} onClose={() => setTagEdit(null)}
          onDone={async ids => { await cat.setTags(tagEdit.id, ids); s.showToast('Tags saved'); }} />
      )}
      {benchPick && (() => {
        const levels = benchPick.kind === 'folder' ? folderLevel(benchPick.id) : instrumentLevels(benchPick.id);
        if (!levels.length) return null;
        const target = benchPick.kind === 'folder' ? fo.byId.get(benchPick.id)?.name : cat.byId.get(benchPick.id) ? label(cat.byId.get(benchPick.id)!.inst) : '';
        return (
          <BenchmarkPicker anchor={benchPick.anchor} title={`Benchmark · ${target ?? ''}`} levels={levels}
            instruments={cat.instruments.filter(i => showCustom || i.source === 'api')} exclude={benchPick.kind === 'instrument' ? [benchPick.id] : []}
            onClose={() => setBenchPick(null)} onPick={pickBenchmark} />
        );
      })()}
      {rowMenu && menuRec && (
        <RowMenu key={rowMenu.id} anchor={rowMenu.anchor} inst={menuRec.inst} figures={cat.figuresOf(rowMenu.id)}
          can={{ dashboard: can('dashboard.view'), report: can('reports.view'), rename: can('instruments.rename'), newFolder: can('folders.personal'), editCustom: can('custom.manage') }}
          selected={selection.includes(rowMenu.id)} selectionCount={n} limit={limit}
          folders={fo.loading ? null : fo.targets} canAddToFolders={can('folders.personal') || manageWatchlist || can('custom.manage')}
          removeFrom={storedCurrent?.editable ? {
            name: storedCurrent.name,
            onRemove: async () => {
              await fo.removeInstrument(storedCurrent.id, rowMenu.id);
              s.showToast(`Removed from “${storedCurrent.name}”`);
            },
          } : null}
          onClose={() => setRowMenu(null)}
          onToggle={() => toggleRow(rowMenu.id)}
          onOpenDashboard={() => { s.openDashboard([...selection, rowMenu.id], storedFolder?.id ?? null); navigate('/dashboard'); }}
          onAddToReport={() => { s.select(rowMenu.id); navigate('/reports'); }}
          onAddToFolder={async id => {
            const saved = await fo.addInstrument(id, rowMenu.id);
            s.showToast(`Added to “${saved.name}”`);
          }}
          onNewFolder={async () => { const nf = await fo.create('New folder', [rowMenu.id]); ex.setFolder(nf.id); s.showToast('Folder created. Rename it from the folder list.'); }}
          onRename={async alias => {
            const saved = await cat.setAlias(rowMenu.id, alias);
            s.showToast(saved ? `Displayed as “${saved}”` : `Display name reset to “${menuRec.inst.name}”`);
          }}
          onEditCustom={() => navigate(`/custom?edit=${encodeURIComponent(rowMenu.id)}`)}
          benchmark={benchOf(rowMenu.id)}
          onEditTags={canTag(rowMenu.id) ? () => setTagEdit({ id: rowMenu.id, anchor: rowMenu.anchor }) : undefined}
          onBenchmark={instrumentLevels(rowMenu.id).length ? () => setBenchPick({ kind: 'instrument', id: rowMenu.id, anchor: rowMenu.anchor }) : undefined} />
      )}
    </section>
  );
}
