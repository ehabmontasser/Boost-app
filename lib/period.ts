// Reporting periods for the period picker: week, month, quarter, year to date, a custom range or the full span,
// each compared with the previous period (PP) or the same period last year (YoY). Weeks run Monday to Sunday.
// All dates are yyyy-mm-dd strings; periods are clipped to the dates that have data.

export type View = "week" | "month" | "quarter" | "ytd" | "custom" | "year";
export type Compare = "pp" | "yoy";
export type Range = { from: string; to: string };
export type Period = Range & {
  view: View; key: string; label: string; short: string; cmp: Compare;
  /** the comparison period (previous period or same period last year), when the data covers it */
  prev: (Range & { label: string }) | null;
  /** why there is no comparison, when there is none */
  noPrev: string | null;
  partial: boolean; days: number;
};
export type PeriodOption = { key: string; label: string };
export type PeriodOptions = { week: PeriodOption[]; month: PeriodOption[]; quarter: PeriodOption[]; minDate: string; maxDate: string };
export type PeriodQuery = { view?: string; p?: string; from?: string; to?: string; cmp?: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const d = (iso: string) => new Date(iso + "T00:00:00Z");
const iso = (x: Date) => x.toISOString().slice(0, 10);
export function addDays(s: string, n: number): string { const x = d(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); }
export function daysBetween(a: string, b: string): number { return Math.round((d(b).getTime() - d(a).getTime()) / 86400000); }
const max = (a: string, b: string) => (a > b ? a : b);
const min = (a: string, b: string) => (a < b ? a : b);
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(d(s).getTime());
export const monday = (s: string) => addDays(s, -((d(s).getUTCDay() + 6) % 7));
const monthStart = (s: string) => s.slice(0, 7) + "-01";
const monthEnd = (s: string) => { const x = d(monthStart(s)); x.setUTCMonth(x.getUTCMonth() + 1); x.setUTCDate(0); return iso(x); };
const quarterStart = (s: string) => `${s.slice(0, 4)}-${String(Math.floor((+s.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
const quarterEnd = (s: string) => monthEnd(addMonths(quarterStart(s), 2));
const quarterKey = (s: string) => `${s.slice(0, 4)}-Q${Math.floor((+s.slice(5, 7) - 1) / 3) + 1}`;
function addMonths(s: string, n: number): string { const x = d(monthStart(s)); x.setUTCMonth(x.getUTCMonth() + n); return iso(x); }
/** Same calendar date one year earlier (29 Feb becomes 28 Feb). */
export function lastYear(s: string): string { const y = +s.slice(0, 4) - 1; const md = s.slice(5); return md === "02-29" ? `${y}-02-28` : `${y}-${md}`; }
export const dayLabel = (s: string, year = true) => { const x = d(s); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}${year ? " " + x.getUTCFullYear() : ""}`; };
const monthLabel = (s: string) => `${MONTHS_LONG[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
const quarterLabel = (s: string) => `Q${Math.floor((+s.slice(5, 7) - 1) / 3) + 1} ${s.slice(0, 4)}`;
const rangeLabel = (f: string, t: string) => `${dayLabel(f, f.slice(0, 4) !== t.slice(0, 4))} to ${dayLabel(t)}`;

/** The weeks, months and quarters that have at least one day of data, newest first. */
export function periodOptions(minDate: string, maxDate: string): PeriodOptions {
  const clip = (f: string, t: string) => ({ f: max(f, minDate), t: min(t, maxDate) });
  const week: PeriodOption[] = [];
  for (let w = monday(maxDate); w >= monday(minDate); w = addDays(w, -7)) {
    const { f, t } = clip(w, addDays(w, 6));
    week.push({ key: w, label: `Week of ${dayLabel(w)}${t < addDays(w, 6) || f > w ? ` (${dayLabel(f, false)} to ${dayLabel(t, false)})` : ""}` });
  }
  const month: PeriodOption[] = [];
  for (let m = monthStart(maxDate); m >= monthStart(minDate); m = addMonths(m, -1)) {
    const { f, t } = clip(m, monthEnd(m));
    month.push({ key: m.slice(0, 7), label: `${monthLabel(m)}${f > m || t < monthEnd(m) ? ` (${dayLabel(f, false)} to ${dayLabel(t, false)})` : ""}` });
  }
  const quarter: PeriodOption[] = [];
  for (let q = quarterStart(maxDate); q >= quarterStart(minDate); q = addMonths(q, -3)) {
    const { f, t } = clip(q, quarterEnd(q));
    quarter.push({ key: quarterKey(q), label: `${quarterLabel(q)}${f > q || t < quarterEnd(q) ? ` (${dayLabel(f, false)} to ${dayLabel(t, false)})` : ""}` });
  }
  return { week, month, quarter, minDate, maxDate };
}

/** Turns the URL choice into a period and its comparison. Defaults to the latest week, compared with the previous week. */
export function resolvePeriod(q: PeriodQuery, minDate: string, maxDate: string): Period {
  const views: View[] = ["week", "month", "quarter", "ytd", "custom", "year"];
  const view: View = views.includes(q.view as View) ? (q.view as View) : "week";
  const cmp: Compare = q.cmp === "yoy" ? "yoy" : "pp";
  let start: string, end: string, key: string, label: string, short: string;
  let pp: { from: string; to: string; label: string };
  let yoy: { from: string; to: string; label: string };

  if (view === "month" || view === "quarter") {
    const isQ = view === "quarter";
    const fromKey = isQ ? (q.p && /^\d{4}-Q[1-4]$/.test(q.p) ? `${q.p.slice(0, 4)}-${String((+q.p.slice(6) - 1) * 3 + 1).padStart(2, "0")}-01` : null)
      : (q.p && /^\d{4}-\d{2}$/.test(q.p) ? q.p + "-01" : null);
    let s0 = fromKey ?? (isQ ? quarterStart(maxDate) : monthStart(maxDate));
    const e0 = (x: string) => (isQ ? quarterEnd(x) : monthEnd(x));
    if (s0 > maxDate || e0(s0) < minDate) s0 = isQ ? quarterStart(maxDate) : monthStart(maxDate);
    start = s0; end = e0(s0);
    key = isQ ? quarterKey(s0) : s0.slice(0, 7);
    const name = isQ ? quarterLabel : monthLabel;
    label = name(s0); short = name(s0);
    const ps = addMonths(s0, isQ ? -3 : -1);
    pp = { from: ps, to: e0(ps), label: name(ps) };
    const ys = lastYear(s0);
    yoy = { from: ys, to: e0(ys), label: name(ys) };
  } else if (view === "ytd") {
    start = maxDate.slice(0, 4) + "-01-01"; end = maxDate; key = maxDate.slice(0, 4);
    label = `Year to date ${maxDate.slice(0, 4)} (1 Jan to ${dayLabel(maxDate, false)})`; short = `YTD ${maxDate.slice(0, 4)}`;
    const n = daysBetween(start, end) + 1;
    pp = { from: addDays(start, -n), to: addDays(start, -1), label: `the ${n} days before (${rangeLabel(addDays(start, -n), addDays(start, -1))})` };
    yoy = { from: lastYear(start), to: lastYear(end), label: `YTD ${+maxDate.slice(0, 4) - 1} (1 Jan to ${dayLabel(lastYear(end), false)})` };
  } else if (view === "custom") {
    let f = isDate(q.from) ? q.from! : addDays(maxDate, -27), t = isDate(q.to) ? q.to! : maxDate;
    if (f > t) [f, t] = [t, f];
    f = max(f, minDate); t = min(t, maxDate);
    if (f > t) { f = addDays(maxDate, -27); t = maxDate; }
    start = f; end = t; key = `${f}_${t}`;
    label = rangeLabel(f, t); short = `${dayLabel(f, false)} to ${dayLabel(t, false)}`;
    const n = daysBetween(f, t) + 1;
    pp = { from: addDays(f, -n), to: addDays(f, -1), label: `the ${n} days before (${rangeLabel(addDays(f, -n), addDays(f, -1))})` };
    yoy = { from: lastYear(f), to: lastYear(t), label: `the same dates last year (${rangeLabel(lastYear(f), lastYear(t))})` };
  } else if (view === "year") {
    start = minDate; end = maxDate; key = "all";
    const days = daysBetween(minDate, maxDate) + 1;
    label = `Full period, ${rangeLabel(minDate, maxDate)}`; short = `${Math.round(days / 7)} weeks`;
    pp = { from: addDays(minDate, -days), to: addDays(minDate, -1), label: "the period before" };
    yoy = { from: lastYear(minDate), to: lastYear(maxDate), label: "the same dates last year" };
  } else {
    let w = isDate(q.p) ? monday(q.p!) : monday(maxDate);
    if (w > maxDate || addDays(w, 6) < minDate) w = monday(maxDate);
    start = w; end = addDays(w, 6); key = w;
    label = `Week of ${dayLabel(w)}`; short = `week of ${dayLabel(w, false)}`;
    pp = { from: addDays(w, -7), to: addDays(w, -1), label: `previous week (week of ${dayLabel(addDays(w, -7))})` };
    // 52 weeks earlier keeps Monday to Sunday aligned
    yoy = { from: addDays(w, -364), to: addDays(w, -358), label: `same week last year (week of ${dayLabel(addDays(w, -364))})` };
  }

  const from = max(start, minDate), to = min(end, maxDate);
  const partial = from > start || to < end;
  if (partial && view !== "year" && view !== "custom" && view !== "ytd") label += ` (${dayLabel(from, false)} to ${dayLabel(to, false)})`;
  // the comparison covers the same span: for a partial period, the matching part of the comparison period
  const base = cmp === "yoy" ? yoy : pp;
  const shift = daysBetween(start, base.from);
  const cmpFrom = view === "month" || view === "quarter" ? addDays(base.from, daysBetween(start, from)) : addDays(from, shift);
  const cmpTo = view === "month" || view === "quarter" ? min(addDays(base.from, daysBetween(start, to)), base.to) : addDays(to, shift);
  const covered = cmpFrom >= minDate && cmpTo <= maxDate;
  const prev = covered ? { from: cmpFrom, to: cmpTo, label: base.label } : null;
  const noPrev = covered || view === "year" ? null : cmp === "yoy" ? "No data for the same period last year" : "No data for the previous period";
  return { view, key, from, to, label, short, cmp, prev, noPrev, partial, days: daysBetween(from, to) + 1 };
}

/** The URL query for a period, used by links, the picker and the Claude analysis. */
export function periodQuery(p: Period): string {
  const base = p.view === "custom" ? `view=custom&from=${p.from}&to=${p.to}` : p.view === "ytd" || p.view === "year" ? `view=${p.view}` : `view=${p.view}&p=${p.key}`;
  return `${base}${p.cmp === "yoy" ? "&cmp=yoy" : ""}`;
}

/** Axis label for a trend bucket: a week's Monday ("19 Oct"), a month ("Oct 2026") or a quarter ("Q3 2026"). */
export function trendLabel(bucket: string | null): string {
  if (!bucket) return "";
  if (/Q\d$/.test(bucket)) return `${bucket.slice(5)} ${bucket.slice(0, 4)}`;
  return bucket.length === 7 ? `${MONTHS[+bucket.slice(5, 7) - 1]} ${bucket.slice(0, 4)}` : dayLabel(bucket, false);
}

/** "vs previous week (week of 12 Oct 2026)", "vs September 2025", or "" when there is nothing to compare with. */
export function vsLabel(p: Period): string {
  return p.prev ? `vs ${p.prev.label}` : "";
}

/** Short comparison name for tight spaces: "vs prev. week", "vs last year". */
export function vsShort(p: Period): string {
  if (!p.prev) return "";
  if (p.cmp === "yoy") return "vs last year";
  return { week: "vs prev. week", month: "vs prev. month", quarter: "vs prev. quarter", ytd: "vs period before", custom: "vs period before", year: "vs period before" }[p.view];
}

/** Change between two values as "+4.2%" / "-1.0%", or "" when there is nothing to compare. */
export function pctChange(now: number, before: number | null | undefined): string {
  if (before === null || before === undefined || !before) return "";
  const c = (now - before) / Math.abs(before);
  if (Math.abs(c) < 0.0005) return "0.0%";
  return `${c >= 0 ? "+" : ""}${(c * 100).toFixed(1)}%`;
}
