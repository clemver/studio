/* Excel import: read a workbook in the browser, map it, and add the series to this session (nothing is stored). */
import { useCallback, useMemo, useState } from 'react';
import type { ImportedSeries, RiskProfile } from '../types';
import { useStudio } from '../state/studio';
import type { Cell, SheetAnalysis, ValueKind } from '../lib/sheetImport';
import { analyseSheet, findDateColumn, findHeaderRow, toPrices } from '../lib/sheetImport';
import { saveBlob } from '../lib/download';

/** Session counter for import ids (xl-1, xl-2…). */
let seq = 0;

export interface ColumnChoice { include: boolean; name: string; currency: string; riskProfile: RiskProfile | null }
type Workbook = { SheetNames: string[]; Sheets: Record<string, unknown> };

const xlsx = () => import('xlsx');

export function useUpload() {
  const s = useStudio();
  const [file, setFile] = useState<File | null>(null);
  const [wb, setWb] = useState<Workbook | null>(null);
  const [sheet, setSheet] = useState('');
  const [rows, setRows] = useState<Cell[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [dateColumn, setDateColumn] = useState(0);
  const [kind, setKind] = useState<ValueKind>('price');
  const [choices, setChoices] = useState<Record<number, ColumnChoice>>({});
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ids: string[]; warnings: string[] } | null>(null);

  /** Sheet rows → detect the date column and header row, default the column choices. */
  const useSheet = useCallback(async (book: Workbook, name: string) => {
    const X = await xlsx();
    const r = X.utils.sheet_to_json<Cell[]>(book.Sheets[name] as never, { header: 1, raw: true, defval: null });
    const dc = findDateColumn(r), hr = findHeaderRow(r, dc);
    setSheet(name); setRows(r); setDateColumn(dc); setHeaderRow(hr); setChoices({});
  }, []);

  const pickFile = useCallback(async (f: File) => {
    setReadError(null); setResult(null);
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(f.name)) { setReadError('Use an Excel (.xlsx, .xls) or CSV file.'); return; }
    try {
      const X = await xlsx();
      const book = X.read(await f.arrayBuffer(), { cellDates: true }) as unknown as Workbook;
      // Start on the first sheet that has data.
      const first = book.SheetNames.find(n => X.utils.sheet_to_json(book.Sheets[n] as never, { header: 1 }).length > 2) ?? book.SheetNames[0];
      setFile(f); setWb(book);
      await useSheet(book, first);
    } catch (e) {
      setReadError(`This file could not be read: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [useSheet]);

  const analysis: SheetAnalysis | null = useMemo(() => (rows.length ? analyseSheet(rows, headerRow, dateColumn) : null), [rows, headerRow, dateColumn]);

  /** Per-column choice, defaulting to what was detected. */
  const choiceOf = useCallback((index: number): ColumnChoice => {
    const c = analysis?.columns.find(x => x.index === index);
    return choices[index] ?? { include: !!c && c.obs.length >= 2, name: c?.name ?? '', currency: c?.currency ?? '', riskProfile: null };
  }, [analysis, choices]);
  const setChoice = (index: number, p: Partial<ColumnChoice>) => setChoices(m => ({ ...m, [index]: { ...choiceOf(index), ...p } }));

  const included = analysis ? analysis.columns.filter(c => choiceOf(c.index).include) : [];
  const issues: string[] = [];
  if (analysis) {
    if (!included.length) issues.push('Tick at least one column to import.');
    const noCcy = included.filter(c => !choiceOf(c.index).currency);
    if (noCcy.length) issues.push(`Set a currency for ${noCcy.map(c => `“${choiceOf(c.index).name || c.header}”`).join(', ')}.`);
    const noName = included.filter(c => !choiceOf(c.index).name.trim());
    if (noName.length) issues.push('Every imported column needs a name.');
    // Returns in % are small numbers; levels like 100 or 1'000 mean the file holds prices.
    if (kind === 'return') {
      const big = included.filter(c => { const v = c.obs.map(o => Math.abs(o.value)).sort((x, y) => x - y); return v.length && v[Math.floor(v.length / 2)] > 30; });
      if (big.length) issues.push(`${big.map(c => `“${c.header}”`).join(', ')} look${big.length === 1 ? 's' : ''} like prices, not returns in %. Choose Prices / NAV.`);
    }
    const thin = included.filter(c => c.obs.length < 2);
    if (thin.length) issues.push(`${thin.map(c => `“${c.header}”`).join(', ')} ha${thin.length === 1 ? 's' : 've'} fewer than two values.`);
  }

  /** Add the ticked columns to this session as price series. Nothing leaves the browser. */
  const submit = () => {
    if (!file || !analysis || issues.length) return;
    const warnings: string[] = [], list: ImportedSeries[] = [];
    for (const c of included) {
      const ch = choiceOf(c.index);
      const prices = toPrices(c.obs, kind, c.frequency);
      if (prices.some(p => !(p.value > 0))) { warnings.push(`${ch.name}: zero or negative prices, not added.`); continue; }
      const n = ++seq, id = `xl-${n}`;
      list.push({
        file: file.name, prices,
        inst: {
          id, code: `XLS ${String(n).padStart(3, '0')}`, name: ch.name.trim(), alias: '', category: 'uploaded', riskProfile: ch.riskProfile,
          currency: ch.currency, inception: prices[0].date.slice(0, 7), benchmarkName: `${file.name} · imported this session`,
          source: 'upload', tags: [], benchmarkId: null, ...(c.gapMonths ? { carriedForwardMonths: c.gapMonths } : {}),
        },
      });
      if (c.gapMonths) warnings.push(`${ch.name}: ${c.gapMonths} month${c.gapMonths === 1 ? '' : 's'} without data carried forward.`);
      if (c.skipped) warnings.push(`${ch.name}: ${c.skipped} unreadable value${c.skipped === 1 ? '' : 's'} skipped.`);
    }
    s.addImports(list);
    setResult({ ids: list.map(x => x.inst.id), warnings });
  };

  const reset = () => { setFile(null); setWb(null); setRows([]); setChoices({}); setResult(null); setReadError(null); setKind('price'); };

  /** Sample workbook: Date column + two price columns (one currency in the name, one without). */
  const exampleWorkbook = async () => {
    const X = await xlsx();
    const rowsOut: (string | number | Date)[][] = [['Date', 'Example Balanced Fund CHF', 'Example Global Equity (USD)', 'Peer fund without currency']];
    let a = 100, b = 100, c = 100;
    for (let m = 0; m < 48; m++) {
      const d = new Date(Date.UTC(2022, 9 + m + 1, 0));
      a *= 1 + 0.004 + 0.02 * Math.sin(m / 2.3); b *= 1 + 0.007 + 0.04 * Math.sin(m / 1.7 + 1); c *= 1 + 0.005 + 0.025 * Math.cos(m / 2);
      rowsOut.push([d, +a.toFixed(2), +b.toFixed(2), +c.toFixed(2)]);
    }
    const book = X.utils.book_new();
    X.utils.book_append_sheet(book, X.utils.aoa_to_sheet(rowsOut, { cellDates: true }), 'Prices');
    return new Blob([X.write(book, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  return {
    file, sheets: wb?.SheetNames ?? [], sheet, rows, headerRow, dateColumn, kind, analysis, included, issues,
    readError, result,
    pickFile, setKind, choiceOf, setChoice, submit, reset,
    setSheet: (n: string) => wb && useSheet(wb, n),
    setHeaderRow: (r: number) => { setHeaderRow(Math.max(0, r)); setChoices({}); },
    setDateColumn: (c: number) => { setDateColumn(c); setChoices({}); },
    downloadTemplate: async () => saveBlob('timeseries_upload_template.xlsx', await exampleWorkbook()),
    tryExample: async () => pickFile(new File([await exampleWorkbook()], 'example_prices.xlsx')),
  };
}
