// Loads the data pack into an in-memory SQLite database through the app's own parser and mapping,
// then runs the app's queries and module models. Usage: npx tsx scripts/modeltest.ts
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readWorkbook } from "../lib/xlsx";
import { parseFeedFile, parseSetupFile, toDbRows } from "../lib/validate";
import { FEED_TABLES, MARKET_CATEGORY, SETUP_TABLES, TableMap, platformCode } from "../lib/mapping";
import { setExecutor } from "../lib/db";
import spec from "../lib/spec.json";
import { getCtx, overviewModel, replenishmentModel, adsModel, promoModel, marketModel } from "../lib/metrics";

const pack = process.argv[2] ?? join(__dirname, "..", "datapack", "out", "Sprout_Baby_Care_Data_Pack");
const db = new DatabaseSync(":memory:");
const sqlType = (t: string) => (t === "integer" || t === "boolean" ? "INTEGER" : t === "numeric" ? "REAL" : "TEXT");

function createTable(m: TableMap) {
  const cols = ["brand_id TEXT", ...(m.platformConst ? ["platform TEXT"] : []), ...m.cols.map((c) => `"${c[1]}" ${sqlType(c[2])}`)];
  db.exec(`CREATE TABLE IF NOT EXISTS ${m.table} (${cols.join(", ")})`);
}
function insert(m: TableMap, brandId: string, platform: string | null, rows: Record<string, unknown>[]) {
  const names = ["brand_id", ...(m.platformConst ? ["platform"] : []), ...m.cols.map((c) => c[1])];
  const stmt = db.prepare(`INSERT INTO ${m.table} (${names.map((n) => `"${n}"`).join(",")}) VALUES (${names.map(() => "?").join(",")})`);
  for (const r of rows) {
    const vals = [brandId, ...(m.platformConst ? [platform] : []), ...m.cols.map((c) => {
      const v = r[c[1]];
      return v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : (v as any);
    })];
    stmt.run(...(vals as any[]));
  }
}

for (const m of [...Object.values(FEED_TABLES), MARKET_CATEGORY, ...Object.values(SETUP_TABLES)]) createTable(m);
db.exec("CREATE TABLE brands (id TEXT, name TEXT, created_at TEXT)");
db.exec("CREATE TABLE platforms (code TEXT, name TEXT, channel_type TEXT, status TEXT, sort INTEGER)");
for (const [i, [name, code, type, st]] of ([
  ["Talabat Mart", "TALABAT", "Quick commerce", "active"], ["Noon", "NOON", "Marketplace", "active"], ["Amazon Core", "AMAZON", "Vendor central", "active"],
  ["Amazon Now", "AMAZON_NOW", "Quick commerce", "active"], ["Breadfast", "BREADFAST", "Quick commerce", "active"], ["Rabbit", "RABBIT", "Quick commerce", "awaiting_data"],
] as const).entries())
  db.prepare("INSERT INTO platforms VALUES (?,?,?,?,?)").run(code, name, type, st, i + 1);
db.prepare("INSERT INTO brands VALUES ('b1','Sprout Baby Care','2026-10-20')").run();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".xlsx") ? [p] : []; });
}
const codeToPlatform = Object.fromEntries(Object.entries(spec.platforms).map(([name, v]) => [v.code, name]));
for (const f of walk(pack).sort()) {
  const base = f.split("/").pop()!.replace(".xlsx", "");
  if (base.startsWith("00_Upload_Guide")) continue;
  const sheets = readWorkbook(readFileSync(f));
  if (base.startsWith("SETUP_")) {
    const r = parseSetupFile(sheets);
    for (const [sheet, rows] of Object.entries(r.tables)) insert(SETUP_TABLES[sheet], "b1", null, toDbRows(SETUP_TABLES[sheet], rows));
    continue;
  }
  const [code, , ...rest] = base.split("_");
  const feed = rest.slice(0, rest.length - 2).join("_");
  const platform = codeToPlatform[code];
  const r = parseFeedFile(sheets, platform, feed);
  if (r.errors.length) throw new Error(base + " " + r.errors[0]);
  insert(FEED_TABLES[feed], "b1", platformCode(platform), toDbRows(FEED_TABLES[feed], r.rows));
  if (r.rows2) insert(MARKET_CATEGORY, "b1", platformCode(platform), toDbRows(MARKET_CATEGORY, r.rows2));
}

setExecutor(async (sql, params = []) => {
  const lite = sql.replace(/\$(\d+)(::\w+)?/g, "?$1");
  return db.prepare(lite).all(...(params as any[])) as any[];
});

const f0 = (n: number) => Math.round(n).toLocaleString("en-US");
(async () => {
  const c = (await getCtx())!;
  console.log("asOf", c.asOf, "| platforms", c.platforms.map((p) => p.name).join(", "));
  const ov = await overviewModel(c);
  console.log(`\nOVERVIEW total net ${f0(ov.totalNet)} | ad spend ${f0(ov.totalSpend)} (${(ov.spendPct * 100).toFixed(1)}%) | lost ${f0(ov.totalLost)} (${(ov.lostPct * 100).toFixed(1)}%)`);
  for (const r of ov.rows)
    console.log(` ${r.name.padEnd(13)} net ${f0(r.net).padStart(10)} spend ${f0(r.spend).padStart(8)} roas ${r.roas.toFixed(2)} lost ${f0(r.lostValue).padStart(7)} (${(r.lostPct * 100).toFixed(1)}%) wipes ${((r.wipesFirst ?? 0) * 100).toFixed(1)} -> ${((r.wipesLast ?? 0) * 100).toFixed(1)}`);
  const rep = (await replenishmentModel(c))!;
  console.log(`\nREPLENISHMENT as of ${rep.asOf}: at risk nodes ${rep.atRisk.length}, overstock lines ${rep.overstock.length}`);
  for (const r of rep.action.slice(0, 10)) console.log(` ${r.status.padEnd(9)} ${r.platformName} | ${r.nodeName} | ${r.skuName} | on hand ${r.onHand} | cover ${r.cover.toFixed(1)}d | eta ${r.eta ?? "-"} | gap ${r.gapDays.toFixed(1)}d ~${r.unitsAtRisk.toFixed(0)} units`);
  for (const r of rep.overstock.slice(0, 4)) console.log(` OVERSTOCK ${r.name} | ${r.skuName} | ${f0(r.onHand)} units | ${r.cover.toFixed(0)} days | open PO ${r.openPo}`);
  console.log(" lowest PO confirmation:", rep.lowestConfirm.map((p) => `${p.name} ${p.skuName} ${(100 * (p.confirmRate ?? 0)).toFixed(0)}%`).join("; "));
  const ads = await adsModel(c);
  console.log(`\nADS total spend ${f0(ads.totalSpend)} roas ${ads.roas.toFixed(2)} below-target spend ${f0(ads.belowSpend)}`);
  for (const r of ads.rows.slice(0, 8)) console.log(` ${r.name.padEnd(13)} ${r.campaign.padEnd(34)} spend ${f0(r.spend).padStart(7)} roas ${r.roas.toFixed(1)} lost ${(r.lostShare * 100).toFixed(0)}% ${r.flag}`);
  console.log(" suppressed:", ads.suppressed.map((s) => `${s.name} ${f0(s.spend)}`).join("; "));
  const pr = await promoModel(c);
  console.log(`\nPROMO dilutive ${f0(pr.dilutive)} accretive ${f0(pr.accretive)}`);
  for (const r of pr.rows.slice(0, 5).concat(pr.rows.slice(-3))) console.log(` ${r.name.padEnd(13)} ${r.promo.padEnd(24)} depth ${(r.depth * 100).toFixed(0)}% uplift ${r.uplift.toFixed(2)}x effect ${f0(r.effect)}`);
  const mk = await marketModel(c);
  console.log(`\nMARKET latest week ${mk.latestWeek}`);
  for (const [p, rows] of Object.entries(mk.top)) console.log(` ${p}: ${rows.slice(0, 3).map((x) => `${x.rank}.${x.brand}${x.own ? "*" : ""}`).join(" ")}`);
  for (const g of mk.gaps) console.log(` gaps ${g.name}: ${g.missing.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
