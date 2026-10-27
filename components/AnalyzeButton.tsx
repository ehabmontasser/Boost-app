"use client";
import { useState } from "react";

type Insight = { headline: string; actions: { title: string; why: string; do: string; impact: string }[]; watch: string[] };

// canRefresh: only the admin may force a new (paid) Claude call; others see the saved answer.
export default function AnalyzeButton({ module, title, canRefresh, view, periodKey }: { module: string; title: string; canRefresh: boolean; view: string; periodKey: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [meta, setMeta] = useState<string>("");

  async function run(force: boolean) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ module, force, view, p: periodKey }) });
      const j = await res.json();
      if (!j.ok) { setErr(j.error ?? "Analysis failed."); setInsight(null); setRaw(null); }
      else { setInsight(j.insight); setRaw(j.raw ?? null); setMeta(`${j.model}${j.cached ? " · saved result, data unchanged" : ""}`); }
    } catch (e) { setErr("Could not reach the server. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <section className="claude" aria-live="polite">
      <h2><span className="dot" />{title}<span className="note" style={{ fontWeight: 400, fontSize: 13 }}>Figures are computed in code; Claude explains them</span></h2>
      {!insight && !raw && !err ? (
        <div className="note">Press the button to have Claude read the figures on this page and recommend actions, ranked by money impact.</div>
      ) : null}
      {err ? <div className="notice n-bad">{err}</div> : null}
      {insight ? (
        <>
          <div style={{ fontSize: 17, lineHeight: 1.45, fontWeight: 500 }}>{insight.headline}</div>
          <div className="grid">
            {insight.actions.map((a, i) => (
              <div className="item" key={i}>
                <div className="tag">Action {i + 1}</div>
                <p><b>{a.title}</b></p>
                <p>{a.do}</p>
                <p className="note">Why: {a.why}</p>
                <p className="note">Impact: {a.impact}</p>
              </div>
            ))}
          </div>
          {insight.watch.length ? <div className="note">Watch: {insight.watch.join(" · ")}</div> : null}
          <div className="note">{meta}</div>
        </>
      ) : null}
      {raw ? <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{raw}</div> : null}
      {insight || raw ? (
        canRefresh ? (
          <button className="btn" onClick={() => run(true)} disabled={busy}>
            {busy ? "Claude is reading the data..." : "Refresh from Claude"}
          </button>
        ) : null
      ) : (
        <button className="btn" onClick={() => run(false)} disabled={busy}>
          {busy ? "Claude is reading the data..." : "Analyse with Claude"}
        </button>
      )}
    </section>
  );
}
