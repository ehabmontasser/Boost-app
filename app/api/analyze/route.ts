import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieName, readToken } from "@/lib/auth";
import { analyze, MODULES, ModuleName } from "@/lib/analyze";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const store = await cookies();
  const session = readToken(store.get(cookieName)?.value);
  if (!session) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  let body: { module?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body.module || !(MODULES as readonly string[]).includes(body.module))
    return NextResponse.json({ ok: false, error: "Unknown module." }, { status: 400 });
  try {
    // Only the admin can force a fresh (paid) call; everyone else gets the saved answer when there is one.
    const res = await analyze(body.module as ModuleName, !!body.force && session.role === "admin");
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Analysis failed: ${(e as Error).message}` }, { status: 500 });
  }
}
