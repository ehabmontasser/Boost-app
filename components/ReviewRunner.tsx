"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Brief, Step } from "@/lib/agent/engine";
import { BriefView, StepList } from "./AgentParts";

/** Runs the Monday Commercial Review step by step and shows each tool the agent uses. Admin only. */
export default function ReviewRunner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true); setErr(null); setSteps([]); setBrief(null);
    let body: Record<string, unknown> = {};
    let all: Step[] = [];
    try {
      for (let i = 0; i < 12; i++) {
        const res = await fetch("/api/agent/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const j = await res.json();
        if (j.steps) { all = [...all, ...j.steps]; setSteps(all); }
        if (j.error || !j.state) { setErr(j.error ?? "The review stopped."); break; }
        if (j.final?.brief) { setBrief(j.final.brief); router.refresh(); break; }
        if (j.state.done) { setErr("The review finished without a brief."); break; }
        body = { state: j.state, sig: j.sig, tools: all.length };
      }
    } catch { setErr("Could not reach the server. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <section className="claude" aria-live="polite">
      <h2><span className="dot" />Run the Monday Commercial Review<span className="note" style={{ fontWeight: 400, fontSize: 13 }}>The agent chooses which screens to read; figures are computed in code</span></h2>
      {!busy && !steps.length ? <div className="note">Takes about a minute. The agent reads every screen for the latest week, compares it with last week and with the same week last year, looks for conflicts between screens, and writes a ranked brief. The brief is saved for everyone.</div> : null}
      <StepList steps={steps} busy={busy} />
      {err ? <div className="notice n-bad">{err}</div> : null}
      {brief ? <BriefView brief={brief} meta="Just written and saved." /> : null}
      <button className="btn" onClick={run} disabled={busy}>{busy ? "The agent is working..." : steps.length ? "Run again" : "Run weekly review"}</button>
    </section>
  );
}
