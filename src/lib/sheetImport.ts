/*
 * Reading price sheets: dates in rows, one instrument per column. Pure helpers, used by the upload page
 * (preview and mapping) and by the mock server (the real server parses the file again).
 */

export type Cell = string | number | boolean | Date | null | undefined;
export type ValueKind = 'price' | 'return';

/** Currencies recognised in column names. */
export const UPLOAD_CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'HKD', 'SGD', 'CNY', 'NZD', 'ZAR'];
const SYMBOLS: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};
const monthEnd = (y: number, m: number) => isoOf(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A cell → ISO date, or null. Excel serials, Date objects, ISO, dd.mm.yyyy, dd/mm/yyyy (mm/dd when unambiguous), "Jan 2024", "2024-01". */
export function parseDate(v: Cell): string | null {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const t = new Date(v.getTime() + 12 * 3600 * 1000); // avoid time-zone edges around midnight
    return isoOf(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  if (typeof v === 'number') {
    if (v < 10000 || v > 90000) return null; // Excel serial range ~1927–2146
    const t = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return isoOf(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (b > 12 && a <= 12) [a, b] = [b, a]; // mm/dd/yyyy when the day is obviously second
    return isoOf(y, b, a);
  }
  m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) return monthEnd(+m[1], +m[2]);
  m = /^([A-Za-z]{3})[a-z]*[ -](\d{2,4})$/.exec(s);
  if (m) { const k = MONTHS.indexOf(m[1].toLowerCase()); let y = +m[2]; if (y < 100) y += 2000; return k >= 0 ? monthEnd(y, k + 1) : null; }
  return null;
}

/** A cell → number, or null. Handles 1'234.5, 1 234,5, 1.234,5, 1,234.5, "4.2%". */
export function parseNumber(v: Cell): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/[\s'’]/g, '').replace(/%$/, '');
  if (!s || !/^[-+]?[\d.,]+$/.test(s)) return null;
  const dots = (s.match(/\./g) ?? []).length, commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    // The last separator is the decimal one: 1.234,5 or 1,234.5
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (commas) {
    // 1,234,567 and 1,234 are thousands; 12,5 or 0,123 are decimals.
    s = commas > 1 || /^[-+]?[1-9]\d{0,2},\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (dots > 1) {
    s = s.replace(/\./g, ''); // 1.234.567
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/** Currency named in a column header ("Fund A EUR", "Fund B (USD)", "US$ fund"), or null; `note` when ambiguous. */
export function detectCurrency(header: string): { code: string | null; note: string | null } {
  const found = new Set<string>();
  for (const c of UPLOAD_CURRENCIES) if (new RegExp(`(^|[^A-Za-z])${c}([^A-Za-z]|$)`, 'i').test(header)) found.add(c);
  for (const [sym, c] of Object.entries(SYMBOLS)) if (header.includes(sym)) found.add(c);
  if (found.size === 1) return { code: [...found][0], note: null };
  if (found.size > 1) return { code: null, note: `Several currencies in the name (${[...found].join(', ')})` };
  return { code: null, note: null };
}

/** Header without the currency token and leftover brackets / separators. */
export function cleanName(header: string, code: string | null): string {
  let s = header;
  if (code) s = s.replace(new RegExp(`[\\[(]?\\b${code}\\b[\\])]?`, 'i'), ' ');
  return s.replace(/[$€£¥]/g, ' ').replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/[\s_\-–·|,]+$/g, '').replace(/^[\s_\-–·|,]+/g, '').replace(/\s{2,}/g, ' ').trim() || header.trim();
}

export interface Observation { date: string; value: number }
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'irregular';

export interface AnalysedColumn {
  index: number;
  header: string;
  /** Suggested instrument name (header without the currency). */
  name: string;
  currency: string | null;
  currencyNote: string | null;
  obs: Observation[];
  /** Data rows with a date but no readable number in this column. */
  skipped: number;
  /** Dates appearing more than once (the last value is kept). */
  duplicates: number;
  first: string | null;
  last: string | null;
  frequency: Frequency;
  /** Months between the first and last date with no observation (carried forward). */
  gapMonths: number;
}

export interface SheetAnalysis {
  headerRow: number;
  dateColumn: number;
  dataRows: number;
  /** Rows after the header whose date can't be read. */
  badDateRows: number;
  columns: AnalysedColumn[];
}

/** First row (within 25) that looks like a header: text cells beyond the date column, and a date right below. */
export function findHeaderRow(rows: Cell[][], dateColumn = 0): number {
  for (let r = 0; r < Math.min(25, rows.length - 1); r++) {
    const row = rows[r] ?? [];
    const texts = row.filter((c, i) => i !== dateColumn && typeof c === 'string' && c.trim() && parseNumber(c) == null).length;
    if (texts >= 1 && parseDate(rows[r + 1]?.[dateColumn]) != null) return r;
  }
  return 0;
}

/** Column that holds dates: the first one where most of the first 20 data rows parse as dates. */
export function findDateColumn(rows: Cell[][]): number {
  const width = Math.max(0, ...rows.slice(0, 30).map(r => r?.length ?? 0));
  for (let c = 0; c < width; c++) {
    const vals = rows.slice(0, 30).map(r => r?.[c]).filter(v => v != null && v !== '');
    if (vals.length >= 3 && vals.filter(v => parseDate(v) != null).length / vals.length >= 0.6) return c;
  }
  return 0;
}

const median = (x: number[]) => { const s = [...x].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export function analyseSheet(rows: Cell[][], headerRow: number, dateColumn: number): SheetAnalysis {
  const header = rows[headerRow] ?? [];
  const data = rows.slice(headerRow + 1).filter(r => r && r.some(c => c != null && c !== ''));
  const dates = data.map(r => parseDate(r[dateColumn]));
  const width = Math.max(header.length, ...data.slice(0, 200).map(r => r.length));
  const columns: AnalysedColumn[] = [];
  for (let c = 0; c < width; c++) {
    if (c === dateColumn) continue;
    const h = String(header[c] ?? '').trim();
    const byDate = new Map<string, number>();
    let skipped = 0, duplicates = 0, any = false;
    data.forEach((r, k) => {
      const d = dates[k]; if (!d) return;
      const v = parseNumber(r[c]);
      if (r[c] != null && r[c] !== '') any = true;
      if (v == null) { if (r[c] != null && r[c] !== '') skipped++; return; }
      if (byDate.has(d)) duplicates++;
      byDate.set(d, v);
    });
    if (!h && !any) continue;
    const obs = [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1));
    const gaps = obs.slice(1).map((o, k) => (Date.parse(o.date) - Date.parse(obs[k].date)) / 86400000);
    const g = median(gaps);
    const frequency: Frequency = !gaps.length ? 'irregular' : g <= 4 ? 'daily' : g <= 9 ? 'weekly' : g >= 25 && g <= 35 ? 'monthly' : 'irregular';
    let gapMonths = 0;
    if (obs.length > 1) {
      const have = new Set(obs.map(o => o.date.slice(0, 7)));
      let y = +obs[0].date.slice(0, 4), m = +obs[0].date.slice(5, 7);
      const endKey = obs[obs.length - 1].date.slice(0, 7);
      while (`${y}-${pad(m)}` < endKey) { m++; if (m > 12) { m = 1; y++; } if (!have.has(`${y}-${pad(m)}`)) gapMonths++; }
    }
    const det = detectCurrency(h);
    columns.push({
      index: c, header: h || `Column ${c + 1}`, name: cleanName(h || `Column ${c + 1}`, det.code), currency: det.code, currencyNote: det.note,
      obs, skipped, duplicates, first: obs[0]?.date ?? null, last: obs[obs.length - 1]?.date ?? null, frequency, gapMonths,
    });
  }
  return { headerRow, dateColumn, dataRows: data.length, badDateRows: dates.filter(d => !d).length, columns };
}

/**
 * Price levels → returns at a frequency, dated by period end: business days (D), weeks ending on the last
 * business day (W) or month ends (M). Each period uses the last price on or before its end (carried forward).
 */
export function seriesFromPrices(prices: Observation[], f: 'D' | 'W' | 'M'): { dates: string[]; returns: number[] } {
  if (prices.length < 2) return { dates: [], returns: [] };
  const DAY = 86400000, start = Date.parse(prices[0].date + 'T00:00:00Z'), end = Date.parse(prices[prices.length - 1].date + 'T00:00:00Z');
  const ends: string[] = [];
  for (let t = start; t <= end; t += DAY) {
    const d = new Date(t), wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    if (f === 'D') { ends.push(iso); continue; }
    // Is this the last business day of its week / month (or the last day of data)?
    let n = t + DAY; while ([0, 6].includes(new Date(n).getUTCDay())) n += DAY;
    const next = new Date(n), last = n > end;
    if (f === 'W' ? last || next.getUTCDay() < wd : last || next.getUTCMonth() !== d.getUTCMonth()) ends.push(iso);
  }
  const dates: string[] = [], returns: number[] = [];
  let j = 0, prev: number | null = null;
  for (const e of ends) {
    while (j < prices.length && prices[j].date <= e) j++;
    const p = j > 0 ? prices[j - 1].value : null;
    if (p == null) continue;
    if (prev != null) { dates.push(e); returns.push(p / prev - 1); }
    prev = p;
  }
  return { dates, returns };
}

/** Observations → price levels. Returns in % are chained from 100 (the base sits one period before the first return). */
export function toPrices(obs: Observation[], kind: ValueKind, frequency: Frequency): Observation[] {
  if (kind === 'price' || !obs.length) return obs;
  const first = new Date(obs[0].date + 'T00:00:00Z');
  const step = frequency === 'monthly' ? -28 : frequency === 'weekly' ? -7 : -1;
  first.setUTCDate(first.getUTCDate() + step);
  const out: Observation[] = [{ date: first.toISOString().slice(0, 10), value: 100 }];
  let lv = 100;
  obs.forEach(o => { lv *= 1 + o.value / 100; out.push({ date: o.date, value: lv }); });
  return out;
}
