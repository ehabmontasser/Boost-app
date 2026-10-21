"use client";
import { useState } from "react";

type Insight = { headline: string; actions: { title: string; why: string; do: string; impact: string }[]; watch: string[] };

export default function AnalyzeButton({ module, title }: { module: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [meta, setMeta] = useState<string>("");

  async function run(force: boolean) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ module, force }) });
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
      <button className="btn" onClick={() => run(!!(insight || raw))} disabled={busy}>
        {busy ? "Claude is reading the data..." : insight || raw ? "Refresh from Claude" : "Analyse with Claude"}
      </button>
    </section>
  );
}
