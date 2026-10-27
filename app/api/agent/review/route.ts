import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieName, readToken } from "@/lib/auth";
import { newState, runSteps, verifyState, type AgentState } from "@/lib/agent/engine";
import { agentDates, saveBrief } from "@/lib/agent/context";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Runs the Monday Commercial Review in steps. Admin only. Body: {} to start, or { state, sig, tools } to continue. */
export async function POST(req: Request) {
  const store = await cookies();
  const session = readToken(store.get(cookieName)?.value);
  if (!session) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ ok: false, error: "Only the account manager can run the weekly review." }, { status: 403 });
  let body: { state?: AgentState; sig?: string; tools?: number } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const dates = await agentDates();
  if (!dates) return NextResponse.json({ ok: false, error: "No data to review yet." });
  let state: AgentState;
  if (body.state) {
    if (!body.sig || !verifyState(body.state, body.sig) || body.state.kind !== "review") return NextResponse.json({ ok: false, error: "This run could not be verified. Start again." }, { status: 400 });
    state = body.state;
  } else state = newState("review");
  try {
    const res = await runSteps(state, dates.dataThrough, dates.latestWeek);
    if (res.final?.brief) {
      const tools = (body.tools ?? 0) + res.steps.filter((x) => x.tool !== "submit_brief").length;
      await saveBrief(dates.brandId, res.final.brief, dates.dataThrough, tools, process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5");
    }
    return NextResponse.json({ ok: !res.error, ...res });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Review failed: ${(e as Error).message}` }, { status: 500 });
  }
}
