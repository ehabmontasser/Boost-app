"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PeriodOptions } from "@/lib/period";

const VIEWS = [["week", "Weekly"], ["month", "Monthly"], ["quarter", "Quarterly"], ["ytd", "YTD"], ["custom", "Custom"], ["year", "Full period"]] as const;

/** Period picker: the view, the period within it (or a custom date range), and what to compare with.
 *  The choice lives in the URL, so it survives reloads, links and page changes. */
export default function PeriodPicker({ view, periodKey, from, to, cmp, options }: {
  view: string; periodKey: string; from: string; to: string; cmp: string; options: PeriodOptions;
}) {
  const router = useRouter();
  const path = usePathname();
  // pages with their own choice in the URL (Platform Analysis) keep it when the period changes
  const platform = useSearchParams().get("platform");
  const [cf, setCf] = useState(from);
  const [ct, setCt] = useState(to);
  const go = (v: string, extra: Record<string, string | undefined>, c = cmp) => {
    const q = new URLSearchParams({ view: v });
    for (const [k, x] of Object.entries(extra)) if (x) q.set(k, x);
    if (c === "yoy") q.set("cmp", "yoy");
    if (platform) q.set("platform", platform);
    router.push(`${path}?${q.toString()}`);
  };
  const latest = (v: string) => (v === "week" ? options.week[0]?.key : v === "month" ? options.month[0]?.key : v === "quarter" ? options.quarter[0]?.key : undefined);
  const pickView = (v: string) => (v === "custom" ? go(v, { from, to }) : go(v, { p: latest(v) }));
  const here = (c: string) => (view === "custom" ? go(view, { from, to }, c) : go(view, { p: view === "ytd" || view === "year" ? undefined : periodKey }, c));
  const list = view === "week" ? options.week : view === "month" ? options.month : view === "quarter" ? options.quarter : [];
  const name = view === "week" ? "Week" : view === "month" ? "Month" : "Quarter";
  return (
    <div className="picker" role="group" aria-label="Reporting period">
      <div className="seg" role="group" aria-label="Period type">
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" className={view === v ? "on" : ""} aria-pressed={view === v} onClick={() => pickView(v)}>{label}</button>
        ))}
      </div>
      <div className="picker-row">
        {list.length ? (
          <select aria-label={name} value={periodKey} onChange={(e) => go(view, { p: e.target.value })}>
            {list.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ) : null}
        {view === "custom" ? (
          <form className="custom" onSubmit={(e) => { e.preventDefault(); go("custom", { from: cf, to: ct }); }}>
            <label>From <input type="date" value={cf} min={options.minDate} max={options.maxDate} onChange={(e) => setCf(e.target.value)} required /></label>
            <label>To <input type="date" value={ct} min={options.minDate} max={options.maxDate} onChange={(e) => setCt(e.target.value)} required /></label>
            <button type="submit" className="apply">Apply</button>
          </form>
        ) : null}
        {view !== "year" ? (
          <div className="seg" role="group" aria-label="Compare with">
            {[["pp", "vs Previous period"], ["yoy", "vs Last year"]].map(([c, label]) => (
              <button key={c} type="button" className={cmp === c ? "on" : ""} aria-pressed={cmp === c} onClick={() => here(c)}>{label}</button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
