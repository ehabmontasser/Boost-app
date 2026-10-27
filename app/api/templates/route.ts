import { NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { canWrite, getSession } from "@/lib/auth";
import { getBrand } from "@/lib/queries";
import { readZip, writeZip } from "@/lib/xlsx";

export const runtime = "nodejs";

// Brand-neutral templates written by `python datapack/build_templates.py --app`.
const DIR = path.join(process.cwd(), "templates");
const PLACEHOLDER = "BOOST_BRAND_NAME";

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** GET: a zip of all upload templates with the working brand's name filled in on every Meta tab. Writers only. */
export async function GET() {
  const s = await getSession();
  if (!canWrite(s)) return NextResponse.json({ ok: false, error: "Only an account manager can download templates." }, { status: 403 });
  const brand = await getBrand();
  if (!brand) return NextResponse.json({ ok: false, error: "Choose a brand first." }, { status: 400 });
  const name = xmlEscape(brand.name);
  const folder = `${brand.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "Brand"}_Upload_Templates`;
  const out: [string, Buffer][] = [];
  for (const sub of (await readdir(DIR)).sort()) {
    for (const file of (await readdir(path.join(DIR, sub))).filter((f) => f.endsWith(".xlsx")).sort()) {
      const parts = readZip(await readFile(path.join(DIR, sub, file)));
      const patched: [string, Buffer][] = [...parts].map(([n, b]) => [n, n === "xl/sharedStrings.xml" ? Buffer.from(b.toString("utf8").split(PLACEHOLDER).join(name), "utf8") : b]);
      out.push([`${folder}/${sub}/${file}`, writeZip(patched)]);
    }
  }
  return new NextResponse(new Uint8Array(writeZip(out)), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${folder}.zip"`, "cache-control": "no-store" },
  });
}
