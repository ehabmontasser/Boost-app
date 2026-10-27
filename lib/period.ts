// Reporting periods for the week / month / full-period picker. Weeks run Monday to Sunday.
// All dates are yyyy-mm-dd strings; periods are clipped to the dates that have data.

export type View = "week" | "month" | "year";
export type Range = { from: string; to: string };
export type Period = Range & {
  view: View; key: string; label: string; short: string;
  /** previous week or month of the same view, when there is data for it */
  prev: (Range & { label: string }) | null;
  partial: boolean; days: number;
};
export type PeriodOption = { key: string; label: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const d = (iso: string) => new Date(iso + "T00:00:00Z");
const iso = (x: Date) => x.toISOString().slice(0, 10);
export function addDays(s: string, n: number): string { const x = d(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); }
export function daysBetween(a: string, b: string): number { return Math.round((d(b).getTime() - d(a).getTime()) / 86400000); }
const max = (a: string, b: string) => (a > b ? a : b);
const min = (a: string, b: string) => (a < b ? a : b);
export const monday = (s: string) => addDays(s, -((d(s).getUTCDay() + 6) % 7));
const monthStart = (s: string) => s.slice(0, 7) + "-01";
const monthEnd = (s: string) => { const x = d(monthStart(s)); x.setUTCMonth(x.getUTCMonth() + 1); x.setUTCDate(0); return iso(x); };
export const dayLabel = (s: string, year = true) => { const x = d(s); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}${year ? " " + x.getUTCFullYear() : ""}`; };
const monthLabel = (s: string) => `${MONTHS_LONG[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;

/** The weeks and months that have at least one day of data, newest first. */
export function periodOptions(minDate: string, maxDate: string): { week: PeriodOption[]; month: PeriodOption[] } {
  const week: PeriodOption[] = [];
  for (let w = monday(maxDate); w >= monday(minDate); w = addDays(w, -7)) {
    const f = max(w, minDate), t = min(addDays(w, 6), maxDate);
    week.push({ key: w, label: `Week of ${dayLabel(w)}${t < addDays(w, 6) || f > w ? ` (${dayLabel(f, false)} to ${dayLabel(t, false)})` : ""}` });
  }
  const month: PeriodOption[] = [];
  for (let m = monthStart(maxDate); m >= monthStart(minDate); m = monthStart(addDays(m, -1))) {
    const f = max(m, minDate), t = min(monthEnd(m), maxDate);
    month.push({ key: m.slice(0, 7), label: `${monthLabel(m)}${f > m || t < monthEnd(m) ? ` (${dayLabel(f, false)} to ${dayLabel(t, false)})` : ""}` });
  }
  return { week, month };
}

/** Turns the URL choice (?view=week&p=2026-10-19, ?view=month&p=2026-10, ?view=year) into a period. Defaults to the latest week. */
export function resolvePeriod(viewIn: string | undefined, keyIn: string | undefined, minDate: string, maxDate: string): Period {
  const view: View = viewIn === "month" || viewIn === "year" ? viewIn : "week";
  if (view === "year") {
    const days = daysBetween(minDate, maxDate) + 1;
    return { view, key: "all", from: minDate, to: maxDate, label: `Full period, ${dayLabel(minDate)} to ${dayLabel(maxDate)}`,
      short: `${Math.round(days / 7)} weeks`, prev: null, partial: false, days };
  }
  if (view === "month") {
    let m = keyIn && /^\d{4}-\d{2}$/.test(keyIn) ? keyIn + "-01" : monthStart(maxDate);
    if (m > maxDate || monthEnd(m) < minDate) m = monthStart(maxDate);
    const from = max(m, minDate), to = min(monthEnd(m), maxDate);
    const pm = monthStart(addDays(m, -1));
    const prev = monthEnd(pm) >= minDate ? { from: max(pm, minDate), to: monthEnd(pm), label: monthLabel(pm) } : null;
    const partial = from > m || to < monthEnd(m);
    return { view, key: m.slice(0, 7), from, to, label: monthLabel(m) + (partial ? ` (${dayLabel(from, false)} to ${dayLabel(to, false)})` : ""),
      short: monthLabel(m), prev, partial, days: daysBetween(from, to) + 1 };
  }
  let w = keyIn && /^\d{4}-\d{2}-\d{2}$/.test(keyIn) ? monday(keyIn) : monday(maxDate);
  if (w > maxDate || addDays(w, 6) < minDate) w = monday(maxDate);
  const from = max(w, minDate), to = min(addDays(w, 6), maxDate);
  const pw = addDays(w, -7);
  const prev = addDays(pw, 6) >= minDate ? { from: max(pw, minDate), to: addDays(pw, 6), label: `week of ${dayLabel(pw)}` } : null;
  const partial = from > w || to < addDays(w, 6);
  return { view, key: w, from, to, label: `Week of ${dayLabel(w)}` + (partial ? ` (${dayLabel(from, false)} to ${dayLabel(to, false)})` : ""),
    short: `week of ${dayLabel(w, false)}`, prev, partial, days: daysBetween(from, to) + 1 };
}

/** Axis label for a trend bucket: a week's Monday ("19 Oct") or a month ("Oct 2026"). */
export function trendLabel(bucket: string | null): string {
  if (!bucket) return "";
  return bucket.length === 7 ? `${MONTHS[+bucket.slice(5, 7) - 1]} ${bucket.slice(0, 4)}` : dayLabel(bucket, false);
}

/** "vs previous week", "vs September 2026", or "" for the full period. */
export function vsLabel(p: Period): string {
  return p.prev ? (p.view === "week" ? "vs previous week" : `vs ${p.prev.label}`) : "";
}

/** Change between two values as "+4.2%" / "-1.0%", or "" when there is nothing to compare. */
export function pctChange(now: number, before: number | null | undefined): string {
  if (before === null || before === undefined || !before) return "";
  const c = (now - before) / Math.abs(before);
  return `${c >= 0 ? "+" : ""}${(c * 100).toFixed(1)}%`;
}
