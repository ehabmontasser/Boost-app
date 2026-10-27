"use client";
import { useState } from "react";
import type { PeriodOption } from "@/lib/period";
import { StepList } from "./AgentParts";
import { useReview } from "./ReviewProvider";

/** Starts a Business Review (weekly or monthly) for a chosen period, with the account manager's notes. Admin only.
 *  The run lives in ReviewProvider (app layout), so it keeps going while other pages are open. */
export default function ReviewRunner({ weeks, months, notesMax }: { weeks: PeriodOption[]; months: PeriodOption[]; notesMax: number }) {
  const ctx = useReview();
  const [view, setView] = useState<"week" | "month">("week");
  const [p, setP] = useState(weeks[0]?.key ?? "");
  const [notes, setNotes] = useState("");
  if (!ctx) return null;
  const { steps, error, busy, run, label } = ctx;
  const list = view === "week" ? weeks : months;
  const pick = (v: "week" | "month") => { setView(v); setP((v === "week" ? weeks : months)[0]?.key ?? ""); };
  const start = () => run({ view, p, notes, label: list.find((o) => o.key === p)?.label ?? p });
  return (
    <section className="claude no-print" aria-live="polite">
      <h2><span className="dot" />Create a Business Review<span className="note" style={{ fontWeight: 400, fontSize: 13 }}>The agent chooses which screens to read; figures are computed in code</span></h2>
      <div className="review-form">
        <div className="seg dark" role="group" aria-label="Report type">
          <button type="button" className={view === "week" ? "on" : ""} aria-pressed={view === "week"} onClick={() => pick("week")} disabled={busy}>Weekly review</button>
          <button type="button" className={view === "month" ? "on" : ""} aria-pressed={view === "month"} onClick={() => pick("month")} disabled={busy}>Monthly review</button>
        </div>
        <label className="review-field">{view === "week" ? "Week" : "Month"}
          <select value={p} onChange={(e) => setP(e.target.value)} disabled={busy}>
            {list.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <div className="note">{view === "week" ? "Weekly reports are shared every Monday for the week before." : "Monthly reports are shared at month close for the month just ended."} Compared with the previous {view} and the same {view} last year.</div>
      </div>
      <label className="review-field wide">Account manager notes (optional)
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={notesMax} rows={4} disabled={busy}
          placeholder="Anecdotes and market dynamics the data cannot show: competitor launches, platform changes, buyer feedback, supply issues..." />
        <span className="note">The agent reads these as context, not as figures. They appear in the report and can be edited after it is created. {notes.length}/{notesMax}</span>
      </label>
      <StepList steps={steps} busy={busy} />
      {busy ? <div className="note">Writing the {label}. You can open other pages while the agent works; the report will open here when it is ready.</div> : null}
      {error ? <div className="notice n-bad">{error}</div> : null}
      <button className="btn" onClick={start} disabled={busy || !p}>{busy ? "The agent is working..." : `Create ${view === "week" ? "weekly" : "monthly"} review`}</button>
    </section>
  );
}
