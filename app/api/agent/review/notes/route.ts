import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canWrite, cookieName, readToken } from "@/lib/auth";
import { getBrand } from "@/lib/queries";
import { NOTES_MAX, updateNotes } from "@/lib/agent/context";

export const runtime = "nodejs";

/** Saves the account manager's notes on a saved Business Review report. Admin only. Body: { id, notes }. */
export async function POST(req: Request) {
  const store = await cookies();
  const session = readToken(store.get(cookieName)?.value);
  if (!session) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  if (!canWrite(session)) return NextResponse.json({ ok: false, error: "Only an account manager can edit notes." }, { status: 403 });
  let body: { id?: string; notes?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (!body.id || typeof body.notes !== "string") return NextResponse.json({ ok: false, error: "Missing report or notes." }, { status: 400 });
  const brand = await getBrand();
  if (!brand) return NextResponse.json({ ok: false, error: "No brand." }, { status: 400 });
  const ok = await updateNotes(brand.id, body.id, body.notes.slice(0, NOTES_MAX));
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
}
