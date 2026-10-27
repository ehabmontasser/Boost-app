import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { canWrite, cookieName, readToken } from "@/lib/auth";
import { allowedBrands } from "@/lib/access";
import { importAuto, importFeed, importSetup } from "@/lib/importer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const store = await cookies();
  const s = readToken(store.get(cookieName)?.value);
  if (!s) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  if (!canWrite(s)) return NextResponse.json({ ok: false, error: "Only an account manager can upload data." }, { status: 403 });
  // the owner may load any Brand Master (and so create a brand); an account manager only those of their brands
  const opts = { allowedBrandCodes: s.role === "owner" ? null : (await allowedBrands(s)).map((b) => b.code) };
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ ok: false, error: "The upload could not be read." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file received." }, { status: 400 });
  if (file.size > 4_000_000) return NextResponse.json({ ok: false, error: "File is larger than 4 MB." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const platform = String(form.get("platform") ?? "");
  const feed = String(form.get("feed") ?? "");
  try {
    let result;
    if (platform && feed === "SETUP") result = { ...(await importSetup(buf, file.name, opts)), slot: "Brand Master" };
    else if (platform && feed) result = { ...(await importFeed(buf, file.name, platform, feed)), slot: `${platform} · ${feed}` };
    else result = await importAuto(buf, file.name, opts);
    return NextResponse.json({ ok: true, file: file.name, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, file: file.name, error: `Unexpected error, nothing was imported: ${(e as Error).message}` }, { status: 500 });
  }
}
