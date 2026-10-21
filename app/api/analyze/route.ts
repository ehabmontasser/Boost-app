import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieName, readToken } from "@/lib/auth";
import { analyze, MODULES, ModuleName } from "@/lib/analyze";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const store = await cookies();
  if (!readToken(store.get(cookieName)?.value)) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  let body: { module?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body.module || !(MODULES as readonly string[]).includes(body.module))
    return NextResponse.json({ ok: false, error: "Unknown module." }, { status: 400 });
  try {
    const res = await analyze(body.module as ModuleName, !!body.force);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Analysis failed: ${(e as Error).message}` }, { status: 500 });
  }
}
