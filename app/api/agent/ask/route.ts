import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { cookieName, readToken } from "@/lib/auth";
import { newState, runSteps, verifyState, type AgentState } from "@/lib/agent/engine";
import { agentDates, demoQuestionsToday, DEMO_PER_DAY, DEMO_PER_SESSION, logQuestion } from "@/lib/agent/context";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Hobby maximum with Fluid compute

const ASK_COOKIE = "boost_asks";
const secret = () => process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16 ? process.env.SESSION_SECRET : "dev-only-secret-change-me";
const signCount = (n: number, session: string) => `${n}.${createHmac("sha256", secret()).update(`${n}|${session}`).digest("base64url")}`;
const readCount = (v: string | undefined, session: string) => {
  const n = Number((v ?? "").split(".")[0]);
  return Number.isInteger(n) && v === signCount(n, session) ? n : 0;
};

/** Ask BOOST. Body: { question, state?, sig? } to ask (a follow-up keeps the conversation), or { state, sig } to continue a run. */
export async function POST(req: Request) {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  const session = readToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  let body: { question?: string; state?: AgentState; sig?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const dates = await agentDates();
  if (!dates) return NextResponse.json({ ok: false, error: "No data loaded yet." });
  if (body.state && (!body.sig || !verifyState(body.state, body.sig) || body.state.kind !== "ask"))
    return NextResponse.json({ ok: false, error: "This conversation could not be verified. Start a new one." }, { status: 400 });

  let state: AgentState;
  let asked = readCount(store.get(ASK_COOKIE)?.value, token ?? "");
  const question = (body.question ?? "").trim();
  if (question) {
    if (body.state && !body.state.done) return NextResponse.json({ ok: false, error: "Wait for the current answer first." }, { status: 400 });
    if (session.role !== "admin") {
      if (asked >= DEMO_PER_SESSION) return NextResponse.json({ ok: false, error: `The demo allows ${DEMO_PER_SESSION} questions per visit.` }, { status: 429 });
      if ((await demoQuestionsToday(dates.brandId)) >= DEMO_PER_DAY) return NextResponse.json({ ok: false, error: "The demo has reached today's question limit. Please try again tomorrow." }, { status: 429 });
      asked += 1;
      await logQuestion(dates.brandId, session.role, question);
    }
    state = newState("ask", question, body.state);
  } else if (body.state) state = body.state;
  else return NextResponse.json({ ok: false, error: "Type a question." }, { status: 400 });

  try {
    const res = await runSteps(state, dates.dataThrough, dates.latestWeek);
    const out = NextResponse.json({ ok: !res.error, ...res, remaining: session.role === "admin" ? null : DEMO_PER_SESSION - asked });
    if (question && session.role !== "admin") out.cookies.set(ASK_COOKIE, signCount(asked, token ?? ""), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
    return out;
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Ask failed: ${(e as Error).message}` }, { status: 500 });
  }
}
