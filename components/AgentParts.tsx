import type { ReactNode } from "react";
import type { Brief, Step } from "@/lib/agent/engine";

const TOOL_NAMES: Record<string, string> = {
  get_overview: "Read Overview", get_replenishment: "Checked Inventory Management", get_ads: "Checked Performance Marketing",
  get_promotions: "Checked Deals and Promotions", get_market: "Checked Market share", get_product_view: "Joined products across screens",
  submit_brief: "Wrote the brief",
};

/** The agent's visible trail: which tool it used, for which period. */
export function StepList({ steps, busy }: { steps: Step[]; busy?: boolean }) {
  if (!steps.length && !busy) return null;
  return (
    <ol className="agent-steps" aria-label="Agent steps">
      {steps.map((s, i) => (
        <li key={i}><span className="tick" aria-hidden="true">✓</span><b>{TOOL_NAMES[s.tool] ?? s.tool}</b>{s.summary ? <span className="muted"> · {s.summary}</span> : null}</li>
      ))}
      {busy ? <li className="working"><span className="spin" aria-hidden="true" />Claude is deciding the next step...</li> : null}
    </ol>
  );
}

/** Light formatting for agent text: paragraphs, "- " bullet lines and **bold**. */
export function AgentText({ text }: { text: string }) {
  const bold = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{bold(l)}</li>)}</ul>); list = []; } };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^[-*] /.test(line)) { list.push(line.slice(2)); continue; }
    flush();
    if (!line) continue;
    if (/^#+ /.test(line)) blocks.push(<p key={blocks.length}><b>{line.replace(/^#+ /, "")}</b></p>);
    else blocks.push(<p key={blocks.length}>{bold(line)}</p>);
  }
  flush();
  return <div className="agent-text">{blocks}</div>;
}

/** The Monday Commercial Review brief. */
export function BriefView({ brief, meta }: { brief: Brief; meta?: string }) {
  return (
    <div className="brief">
      <div className="brief-period muted">{brief.period}</div>
      <div className="brief-headline">{brief.headline}</div>
      {brief.summary.length ? <ul className="brief-summary">{brief.summary.map((s, i) => <li key={i}>{s}</li>)}</ul> : null}
      {brief.conflicts.length ? (
        <>
          <h3>Conflicts between screens</h3>
          <div className="grid">
            {brief.conflicts.map((c, i) => (
              <div className="item conflict" key={i}>
                <div className="tag">Conflict {i + 1}</div>
                <p><b>{c.title}</b></p>
                <p className="note">Evidence: {c.evidence}</p>
                <p>{c.action}</p>
                <p className="note">Impact: {c.impact}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <h3>Actions, ranked by money impact</h3>
      <div className="grid">
        {brief.actions.map((a, i) => (
          <div className="item" key={i}>
            <div className="tag">Action {i + 1}</div>
            <p><b>{a.title}</b></p>
            <p>{a.do}</p>
            <p className="note">Why: {a.why}</p>
            <p className="note">Impact: {a.impact}</p>
          </div>
        ))}
      </div>
      {brief.watch.length ? <div className="note">Watch: {brief.watch.join(" · ")}</div> : null}
      {meta ? <div className="note">{meta}</div> : null}
    </div>
  );
}
