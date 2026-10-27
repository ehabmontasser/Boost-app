import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canWrite, cookieName, readToken } from "@/lib/auth";
import { newState, runSteps, verifyState, type AgentState, type ReviewTask } from "@/lib/agent/engine";
import { agentDates, NOTES_MAX, saveReport } from "@/lib/agent/context";
import { dataRange } from "@/lib/queries";
import { resolvePeriod } from "@/lib/period";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Hobby maximum with Fluid compute

/** Runs a Business Review (weekly or monthly) in steps. Admin only.
 *  Body: { start: { view, p, notes } } to begin, or { state, sig, tools } to continue. */
export async function POST(req: Request) {
  const store = await cookies();
  const session = readToken(store.get(cookieName)?.value);
  if (!session) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ ok: false, error: "Only an account manager can run a business review." }, { status: 403 });
  let body: { state?: AgentState; sig?: string; tools?: number; start?: { view?: string; p?: string; notes?: string } } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const dates = await agentDates();
  if (!dates) return NextResponse.json({ ok: false, error: "No data to review yet." });

  let state: AgentState;
  if (body.state) {
    if (!body.sig || !verifyState(body.state, body.sig) || body.state.kind !== "review") return NextResponse.json({ ok: false, error: "This run could not be verified. Start again." }, { status: 400 });
    state = body.state;
  } else {
    // a new report: resolve the chosen week or month against the data, so the label and dates are exact
    const span = await dataRange(dates.brandId);
    const view = body.start?.view === "month" ? "month" : "week";
    const p = resolvePeriod({ view, p: body.start?.p }, span.min ?? dates.dataThrough, dates.dataThrough);
    const task: ReviewTask = { view, p: p.key, label: p.label, notes: String(body.start?.notes ?? "").slice(0, NOTES_MAX) };
    state = newState("review", undefined, undefined, task);
  }
  try {
    const res = await runSteps(state, dates.dataThrough, dates.latestWeek);
    let reportId: string | undefined;
    if (res.final?.brief && res.state.task) {
      const tools = (body.tools ?? 0) + res.steps.filter((x) => x.tool !== "submit_brief").length;
      reportId = await saveReport(dates.brandId, res.final.brief, res.state.task, dates.dataThrough, tools, process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5");
    }
    return NextResponse.json({ ok: !res.error, ...res, reportId });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Review failed: ${(e as Error).message}` }, { status: 500 });
  }
}
