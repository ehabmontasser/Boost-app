"use client";
import { usePathname, useRouter } from "next/navigation";
import type { PeriodOption } from "@/lib/period";

/** Week / month / full-period selector. The choice lives in the URL (?view=week&p=2026-10-19), so it survives reloads and links. */
export default function PeriodPicker({ view, periodKey, options }: { view: string; periodKey: string; options: { week: PeriodOption[]; month: PeriodOption[] } }) {
  const router = useRouter();
  const path = usePathname();
  const go = (v: string, k?: string) => router.push(`${path}?view=${v}${k ? `&p=${k}` : ""}`);
  const list = view === "month" ? options.month : view === "week" ? options.week : [];
  return (
    <div className="picker" role="group" aria-label="Reporting period">
      <div className="seg">
        {[["week", "Weekly"], ["month", "Monthly"], ["year", "Full period"]].map(([v, label]) => (
          <button key={v} type="button" className={view === v ? "on" : ""} aria-pressed={view === v}
            onClick={() => go(v, v === "week" ? options.week[0]?.key : v === "month" ? options.month[0]?.key : undefined)}>{label}</button>
        ))}
      </div>
      {list.length ? (
        <select aria-label={view === "month" ? "Month" : "Week"} value={periodKey} onChange={(e) => go(view, e.target.value)}>
          {list.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      ) : null}
    </div>
  );
}
