"use client";
import { useRef, useState } from "react";
import type { Step } from "@/lib/agent/engine";
import { AgentText, StepList } from "./AgentParts";

type Turn = { question: string; steps: Step[]; answer: string | null; error: string | null };

const EXAMPLES = [
  "Which platform grew fastest vs the same week last year, and why?",
  "Are we spending on ads for products that are about to run out?",
  "How did promotions perform in Q3 2026 compared with Q3 2025?",
  "Where is Sprout losing wipes share this month?",
];

/** Ask BOOST: questions in plain English; the agent decides which screens and periods to query. */
export default function AskChat({ admin, perSession }: { admin: boolean; perSession: number }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [remaining, setRemaining] = useState<number | null>(admin ? null : perSession);
  const conv = useRef<{ state: unknown; sig: string } | null>(null);

  const update = (i: number, patch: Partial<Turn>) => setTurns((t) => t.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function ask(question: string) {
    const qn = question.trim();
    if (!qn || busy) return;
    setBusy(true); setText("");
    const i = turns.length;
    setTurns((t) => [...t, { question: qn, steps: [], answer: null, error: null }]);
    let body: Record<string, unknown> = { question: qn, ...(conv.current ?? {}) };
    let steps: Step[] = [];
    try {
      for (let n = 0; n < 12; n++) {
        const res = await fetch("/api/agent/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const j = await res.json();
        if (j.remaining !== undefined && j.remaining !== null) setRemaining(j.remaining);
        if (j.steps) { steps = [...steps, ...j.steps]; update(i, { steps }); }
        if (j.state) conv.current = { state: j.state, sig: j.sig };
        if (j.error || !j.state) { update(i, { error: j.error ?? "No answer." }); break; }
        if (j.final?.text !== undefined) { update(i, { answer: j.final.text || "No answer." }); break; }
        body = { state: j.state, sig: j.sig };
      }
    } catch { update(i, { error: "Could not reach the server. Check your connection and try again." }); }
    finally { setBusy(false); }
  }

  const out = remaining !== null && remaining <= 0;
  return (
    <section className="claude ask" aria-live="polite">
      <h2><span className="dot" />Ask BOOST<span className="note" style={{ fontWeight: 400, fontSize: 13 }}>The agent picks the screens and periods it needs; figures are computed in code</span></h2>
      {turns.length === 0 ? (
        <div className="ask-examples">
          <div className="note">Try one of these, or type your own:</div>
          {EXAMPLES.map((e) => <button key={e} type="button" className="chip" disabled={busy || out} onClick={() => ask(e)}>{e}</button>)}
        </div>
      ) : null}
      {turns.map((t, i) => (
        <div className="ask-turn" key={i}>
          <div className="ask-q">{t.question}</div>
          <StepList steps={t.steps} busy={busy && i === turns.length - 1 && !t.answer && !t.error} />
          {t.answer ? <AgentText text={t.answer} /> : null}
          {t.error ? <div className="notice n-bad">{t.error}</div> : null}
        </div>
      ))}
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={turns.length ? "Ask a follow-up question" : "Ask about sales, stock, ads, promotions or share"} aria-label="Your question" maxLength={600} disabled={busy || out} />
        <button className="btn" type="submit" disabled={busy || out || !text.trim()}>{busy ? "Working..." : "Ask"}</button>
      </form>
      <div className="note">
        {turns.length ? <button type="button" className="linkbtn" disabled={busy} onClick={() => { setTurns([]); conv.current = null; }}>Start a new conversation</button> : null}
        {remaining !== null ? <span>{turns.length ? " · " : ""}{out ? "Demo limit reached for this visit." : `${remaining} demo question${remaining === 1 ? "" : "s"} left in this visit.`}</span> : null}
      </div>
    </section>
  );
}
