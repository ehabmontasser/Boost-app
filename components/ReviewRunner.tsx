"use client";
import { BriefView, StepList } from "./AgentParts";
import { useReview } from "./ReviewProvider";

/** Runs the Monday Commercial Review and shows each tool the agent uses. Admin only.
 *  The run lives in ReviewProvider (app layout), so it keeps going while other pages are open. */
export default function ReviewRunner() {
  const ctx = useReview();
  if (!ctx) return null;
  const { steps, brief, error, busy, run } = ctx;
  return (
    <section className="claude" aria-live="polite">
      <h2><span className="dot" />Run the Monday Commercial Review<span className="note" style={{ fontWeight: 400, fontSize: 13 }}>The agent chooses which screens to read; figures are computed in code</span></h2>
      {!busy && !steps.length ? <div className="note">Takes about a minute. The agent reads every screen for the latest week, compares it with last week and with the same week last year, looks for conflicts between screens, and writes a ranked brief. The brief is saved for everyone.</div> : null}
      <StepList steps={steps} busy={busy} />
      {busy ? <div className="note">You can open other pages while the agent works; the brief will be here when you come back.</div> : null}
      {error ? <div className="notice n-bad">{error}</div> : null}
      {brief ? <BriefView brief={brief} meta="Just written and saved." /> : null}
      <button className="btn" onClick={run} disabled={busy}>{busy ? "The agent is working..." : steps.length ? "Run again" : "Run weekly review"}</button>
    </section>
  );
}
