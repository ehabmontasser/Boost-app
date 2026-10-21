// Dry run: parses and validates every file of the data pack with the app's own importer code (no database).
// Usage: npx tsx scripts/selftest.ts [packDir]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readWorkbook } from "../lib/xlsx";
import { parseFeedFile, parseSetupFile } from "../lib/validate";
import spec from "../lib/spec.json";

const pack = process.argv[2] ?? join(__dirname, "..", "datapack", "out", "Sprout_Baby_Care_Data_Pack");
const codeToPlatform = Object.fromEntries(Object.entries(spec.platforms).map(([name, v]) => [v.code, name]));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".xlsx") ? [p] : [];
  });
}

let bad = 0, files = 0, rows = 0;
const perFeed: Record<string, number> = {};
for (const f of walk(pack).sort()) {
  const base = f.split("/").pop()!.replace(".xlsx", "");
  if (base.startsWith("00_Upload_Guide")) continue;
  const sheets = readWorkbook(readFileSync(f));
  files++;
  if (base.startsWith("SETUP_")) {
    const r = parseSetupFile(sheets);
    const n = Object.values(r.tables).reduce((a, t) => a + t.length, 0);
    console.log(`SETUP ${base}: ${Object.keys(r.tables).length} tables, ${n} rows, ${r.errors.length} errors, ${r.warnings.length} warnings`);
    r.errors.forEach((e) => console.log("   E", e));
    bad += r.errors.length;
    continue;
  }
  const [code, num, ...rest] = base.split("_");
  const feed = rest.slice(0, rest.length - 2).join("_");
  const r = parseFeedFile(sheets, codeToPlatform[code], feed);
  const n = r.rows.length + (r.rows2?.length ?? 0);
  rows += n; perFeed[feed] = (perFeed[feed] ?? 0) + n;
  if (r.errors.length || r.warnings.length) {
    console.log(`${base}: ${r.errors.length} errors, ${r.warnings.length} warnings`);
    r.errors.concat(r.warnings).slice(0, 5).forEach((e) => console.log("   ", e));
  }
  bad += r.errors.length;
}
console.log(`\nfiles ${files}, data rows ${rows}`, perFeed, `blocking errors: ${bad}`);
process.exit(bad ? 1 : 0);
