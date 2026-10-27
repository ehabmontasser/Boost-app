"use client";
import { useState } from "react";
import { AgentText, StepList } from "./AgentParts";
import { useAsk } from "./AskProvider";

const EXAMPLES = [
  "Which platform grew fastest vs the same week last year, and why?",
  "Are we spending on ads for products that are about to run out?",
  "How did promotions perform in Q3 2026 compared with Q3 2025?",
  "Where is Sprout losing wipes share this month?",
];

/** Ask BOOST: questions in plain English; the agent decides which screens and periods to query.
 *  The conversation lives in AskProvider (app layout), so it keeps running while other pages are open. */
export default function AskChat() {
  const ctx = useAsk();
  const [text, setText] = useState("");
  if (!ctx) return null;
  const { turns, busy, remaining, ask, reset } = ctx;
  const out = remaining !== null && remaining <= 0;
  const send = (q: string) => { if (!q.trim() || busy || out) return; ask(q); setText(""); };
  return (
    <section className="claude ask" aria-live="polite">
      <h2><span className="dot" />Ask BOOST<span className="note" style={{ fontWeight: 400, fontSize: 13 }}>The agent picks the screens and periods it needs; figures are computed in code</span></h2>
      {turns.length === 0 ? (
        <div className="ask-examples">
          <div className="note">Try one of these, or type your own:</div>
          {EXAMPLES.map((e) => <button key={e} type="button" className="chip" disabled={busy || out} onClick={() => send(e)}>{e}</button>)}
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
      {busy ? <div className="note">You can open other pages while the agent works; the answer will be here when you come back.</div> : null}
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={turns.length ? "Ask a follow-up question" : "Ask about sales, stock, ads, promotions or share"} aria-label="Your question" maxLength={600} disabled={busy || out} />
        <button className="btn" type="submit" disabled={busy || out || !text.trim()}>{busy ? "Working..." : "Ask"}</button>
      </form>
      <div className="note">
        {turns.length ? <button type="button" className="linkbtn" disabled={busy} onClick={reset}>Start a new conversation</button> : null}
        {remaining !== null ? <span>{turns.length ? " · " : ""}{out ? "Demo limit reached for this visit." : `${remaining} demo question${remaining === 1 ? "" : "s"} left in this visit.`}</span> : null}
      </div>
    </section>
  );
}
