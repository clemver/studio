/* Excel import (/upload, Advanced): price series from Excel / CSV for this session only (dates in rows, instruments in columns). */
import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudio } from '../state/studio';
import { useUpload } from '../hooks/useUpload';
import type { RiskProfile } from '../types';
import { RISKS } from '../lib/domain';
import type { AnalysedColumn, Cell } from '../lib/sheetImport';
import { UPLOAD_CURRENCIES, parseDate, toPrices } from '../lib/sheetImport';
import { num } from '../lib/format';
import { Icon } from '../components/Icons';
import { Tabs } from '../components/Tabs';
import { StatusIcon } from '../components/StatusIcon';
import { Flag } from '../components/Marks';
import { DateChart } from '../components/dashboard/DateChart';

const ddmmyyyy = (d: string | null) => (d ? d.split('-').reverse().join('.') : '–');
const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', irregular: 'Irregular' } as const;
const colorAt = (k: number) => `var(--s${(k % 20) + 1})`;
const colName = (i: number) => { let s = '', n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const show = (c: Cell) => (c instanceof Date ? ddmmyyyy(parseDate(c)) : c == null ? '' : String(c));

export function UploadPage() {
  const s = useStudio();
  const u = useUpload();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const a = u.analysis;

  /** Preview: included columns as prices rebased to 100 at their first value, on the union of dates. */
  const preview = useMemo(() => {
    if (!a) return null;
    const cols = a.columns.filter(c => u.choiceOf(c.index).include && c.obs.length > 1);
    const series = cols.map(c => ({ c, p: toPrices(c.obs, u.kind, c.frequency) }));
    const dates = [...new Set(series.flatMap(x => x.p.map(o => o.date)))].sort();
    if (dates.length < 2) return null;
    return {
      dates,
      series: series.map(({ c, p }, k) => {
        const m = new Map(p.map(o => [o.date, o.value])), base = p[0].value;
        let last: number | null = null;
        return {
          id: String(c.index), name: u.choiceOf(c.index).name || c.header, color: colorAt(k),
          v: dates.map(d => { const v = m.get(d); if (v != null) last = v; return d < p[0].date || d > p[p.length - 1].date || last == null ? null : (last / base) * 100; }),
        };
      }),
    };
  }, [a, u.kind, u.choiceOf]);

  const colRow = (c: AnalysedColumn) => {
    const ch = u.choiceOf(c.index), need = ch.include && !ch.currency;
    const notes: string[] = [];
    if (c.skipped) notes.push(`${c.skipped} unreadable value${c.skipped === 1 ? '' : 's'} skipped`);
    if (c.duplicates) notes.push(`${c.duplicates} duplicate date${c.duplicates === 1 ? '' : 's'} (last value kept)`);
    if (c.gapMonths) notes.push(`${c.gapMonths} month${c.gapMonths === 1 ? '' : 's'} without data (carried forward)`);
    if (c.currencyNote) notes.push(c.currencyNote);
    return (
      <tr key={c.index} className={ch.include ? '' : 'off'}>
        <td className="c"><input type="checkbox" checked={ch.include} aria-label={`Import ${c.header}`} onChange={ev => u.setChoice(c.index, { include: ev.target.checked })} /></td>
        <td className="l"><span className="colref">{colName(c.index)}</span>{c.header}</td>
        <td className="l"><input className="inp" value={ch.name} disabled={!ch.include} aria-label={`Name for ${c.header}`} onChange={ev => u.setChoice(c.index, { name: ev.target.value })} /></td>
        <td className="l">
          <span className="ccy">
            <select className={`sel${need ? ' need' : ''}`} value={ch.currency} disabled={!ch.include} aria-label={`Currency for ${c.header}`} onChange={ev => u.setChoice(c.index, { currency: ev.target.value })}>
              <option value="">Choose…</option>
              {UPLOAD_CURRENCIES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            {c.currency && ch.currency === c.currency && <span className="tag" data-tip="Found in the column name">detected</span>}
          </span>
        </td>
        <td className="l">
          <select className="sel" value={ch.riskProfile ?? ''} disabled={!ch.include} aria-label={`Risk profile for ${c.header}`} onChange={ev => u.setChoice(c.index, { riskProfile: (ev.target.value || null) as RiskProfile | null })}>
            <option value="">None</option>
            {RISKS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </td>
        <td className="l num up-data">{ddmmyyyy(c.first)} → {ddmmyyyy(c.last)}<small>{c.obs.length} values · {FREQ_LABEL[c.frequency]}</small></td>
        <td className="c">{notes.length ? <StatusIcon kind="warn" message={notes.join(' · ')} /> : c.obs.length > 1 ? <StatusIcon kind="done" message="Ready" /> : <StatusIcon kind="error" message="Fewer than two values" />}</td>
      </tr>
    );
  };

  return (
    <section className="page">
      <div className="ux cs">
        {/* ---------- this session's imports ---------- */}
        <aside className="ux-panel cs-lib" aria-label="Imported this session">
          <div className="gx-hd"><h2>This session</h2><span className="cnt num">{s.imports.length || ''}</span></div>
          <div className="ux-scroll">
            {!s.imports.length ? <div className="empty">Nothing imported yet.</div>
              : s.imports.map(({ inst: x, prices, file }) => (
                <div key={x.id} className="lib-item">
                  <span className="tx">
                    <b>{x.name}</b>
                    <small><Flag ccy={x.currency} />{x.currency} · {x.code}{x.carriedForwardMonths ? <> · <StatusIcon kind="warn" message={`${x.carriedForwardMonths} months carried forward`} /></> : null}</small>
                    <small className="num">{ddmmyyyy(prices[0].date)} → {ddmmyyyy(prices[prices.length - 1].date)} · {prices.length} values</small>
                    <small>{file}</small>
                    {confirm === x.id
                      ? <span className="confirm">Remove “{x.name}”?
                        <button type="button" className="lnk" style={{ color: '#ffb3b8' }} onClick={() => { setConfirm(null); s.removeImport(x.id); s.showToast('Removed from this session'); }}>Remove</button>
                        <button type="button" className="lnk" onClick={() => setConfirm(null)}>Cancel</button></span>
                      : <span className="confirm">
                        <button type="button" className="lnk" onClick={() => { s.openDashboard([...s.dashboard.ids, x.id], s.dashboard.folderId); navigate('/dashboard'); }}>Add to dashboard</button>
                        <button type="button" className="lnk" style={{ color: 'var(--muted)' }} onClick={() => setConfirm(x.id)}>Remove</button></span>}
                  </span>
                </div>
              ))}
          </div>
          <div className="note">Imported data stays in this browser session only. Nothing is saved: a reload clears it. Use it in the Dashboard like any security.</div>
        </aside>

        {/* ---------- import ---------- */}
        <div className="ux-panel cs-ed" aria-label="Import">
          {u.result ? (
            <div className="cs-empty">
              <StatusIcon kind="done" message="Imported" />
              <b style={{ color: 'var(--text)', fontSize: 16 }}>{u.result.ids.length} series added to this session from {u.file?.name}</b>
              <span>Pick them in the Dashboard's Select securities, under “Imported from Excel”. They are not saved.</span>
              {u.result.warnings.length > 0 && <ul className="up-warn">{u.result.warnings.map((w, k) => <li key={k}><StatusIcon kind="warn" message="Warning" />{w}</li>)}</ul>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn sec" onClick={u.reset}>Import another file</button>
                <button type="button" className="btn" disabled={!u.result.ids.length} onClick={() => { s.openDashboard([...s.dashboard.ids, ...u.result!.ids], s.dashboard.folderId); navigate('/dashboard'); }}>Open in dashboard</button>
              </div>
            </div>
          ) : !a ? (
            <div className="up-start">
              <div className={`drop${over ? ' over' : ''}`} role="button" tabIndex={0} onClick={() => input.current?.click()}
                onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') input.current?.click(); }}
                onDragOver={ev => { ev.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                onDrop={ev => { ev.preventDefault(); setOver(false); const f = ev.dataTransfer.files[0]; if (f) u.pickFile(f); }}>
                <Icon.upload />
                <b>Drop an Excel or CSV file here</b>
                <span>or click to browse · .xlsx, .xls, .csv</span>
                <input ref={input} type="file" hidden accept=".xlsx,.xlsm,.xls,.csv" onChange={ev => { const f = ev.target.files?.[0]; if (f) u.pickFile(f); ev.target.value = ''; }} />
              </div>
              {u.readError && <div className="msgline" style={{ color: '#ffb3b8' }}><StatusIcon kind="error" message="Error" />{u.readError}</div>}
              <div className="up-help">
                <b>Expected layout</b>
                <span>Dates in the first column, one instrument per column, names in the header row. Put the currency in the name (e.g. “Fund A EUR”, “Fund B (USD)”) or choose it after reading the file. The file is read in your browser and nothing is uploaded or saved.</span>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <button type="button" className="btn sec" onClick={u.downloadTemplate}><Icon.download />Download template</button>
                  <button type="button" className="btn ghost" onClick={u.tryExample}>Try an example</button>
                </div>
              </div>
            </div>
          ) : <>
            <div className="gx-hd">
              <h2>{u.file?.name}</h2>
              <span className="cnt num">{a.dataRows} rows · {a.columns.length} columns</span>
              <span className="rt"><button type="button" className="btn ghost" onClick={u.reset}>Change file</button></span>
            </div>
            <div className="ux-scroll">
              <div className="cs-sec">
                <div className="filters" style={{ padding: 0 }}>
                  {u.sheets.length > 1 && (
                    <div className="fld"><label htmlFor="upSheet">Sheet</label>
                      <select id="upSheet" className="sel" value={u.sheet} onChange={ev => u.setSheet(ev.target.value)}>{u.sheets.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                  )}
                  <div className="fld"><label htmlFor="upHdr">Header row</label>
                    <input id="upHdr" className="inp num" type="number" min={1} style={{ width: 90 }} value={u.headerRow + 1} onChange={ev => u.setHeaderRow(Number(ev.target.value) - 1)} /></div>
                  <div className="fld"><label htmlFor="upDate">Date column</label>
                    <select id="upDate" className="sel" value={u.dateColumn} onChange={ev => u.setDateColumn(Number(ev.target.value))}>
                      {Array.from({ length: Math.max(1, ...u.rows.slice(0, 50).map(r => r?.length ?? 0)) }, (_, i) => <option key={i} value={i}>{colName(i)}{u.rows[u.headerRow]?.[i] ? ` · ${String(u.rows[u.headerRow][i]).slice(0, 24)}` : ''}</option>)}
                    </select></div>
                  <div className="fld"><span className="lb">Values are</span>
                    <Tabs ariaLabel="Values" value={u.kind} onChange={u.setKind} items={[{ key: 'price', label: 'Prices / NAV' }, { key: 'return', label: 'Returns in %' }]} /></div>
                </div>
                {a.badDateRows > 0 && <div className="msgline" style={{ marginTop: 8 }}><StatusIcon kind="warn" message="Warning" />{a.badDateRows} row{a.badDateRows === 1 ? '' : 's'} without a readable date will be skipped.</div>}
              </div>

              <div className="cs-sec">
                <h3>Columns <span className="dim num">({u.included.length} of {a.columns.length} to import)</span></h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="g up-cols">
                    <thead><tr><th className="c">Import</th><th className="l">Column</th><th className="l">Name</th><th className="l">Currency</th><th className="l">Risk profile</th><th className="l">Data</th><th className="c">Status</th></tr></thead>
                    <tbody>{a.columns.map(colRow)}</tbody>
                  </table>
                </div>
              </div>

              {preview && (
                <div className="cs-sec">
                  <h3>Preview <span className="dim" style={{ fontWeight: 500 }}>· rebased to 100 at each first value</span></h3>
                  <DateChart dates={preview.dates} series={preview.series} height={240} format={v => num(v, 0)} ariaLabel="Preview of the imported series" />
                </div>
              )}

              <div className="cs-sec">
                <h3>First rows</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="g up-raw">
                    <thead><tr><th className="c">#</th>{(u.rows[u.headerRow] ?? []).map((h, i) => <th key={i} className={i === u.dateColumn ? 'l' : ''} style={{ '--c': 'x' } as CSSProperties}>{colName(i)} · {show(h)}</th>)}</tr></thead>
                    <tbody>{u.rows.slice(u.headerRow + 1, u.headerRow + 9).map((r, k) => (
                      <tr key={k}><td className="c dim num">{u.headerRow + k + 2}</td>{(u.rows[u.headerRow] ?? r).map((_, i) => <td key={i} className={`num${i === u.dateColumn ? ' l' : ''}`}>{show(r?.[i])}</td>)}</tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="cs-foot">
              {u.issues.length ? <span className="msgline"><StatusIcon kind="error" message="To fix" />{u.issues[0]}</span>
                : <span className="msgline"><StatusIcon kind="done" message="Ready" />Ready: {u.included.length} series for this session (not saved)</span>}
              <span className="sp" />
              <button type="button" className="btn" disabled={u.issues.length > 0} onClick={u.submit}>Add {u.included.length || ''} series to this session</button>
            </div>
          </>}
        </div>
      </div>
    </section>
  );
}
