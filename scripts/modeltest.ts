// Loads the data pack into an in-memory SQLite database through the app's own parser and mapping,
// then runs the app's queries and module models. Usage: npx tsx scripts/modeltest.ts
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { readWorkbook } from "../lib/xlsx";
import { parseFeedFile, parseSetupFile, toDbRows } from "../lib/validate";
import { FEED_TABLES, MARKET_CATEGORY, SETUP_TABLES, TableMap, platformCode } from "../lib/mapping";
import { setExecutor } from "../lib/db";
import spec from "../lib/spec.json";
import { getCtx, overviewModel, replenishmentModel, adsModel, promoModel, marketModel } from "../lib/metrics";
import { resolvePeriod, type Period } from "../lib/period";

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
  const base = basename(f, ".xlsx");
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
  console.log("data", c.minDate, "to", c.asOf, "| platforms", c.platforms.map((p) => p.name).join(", "));
  // full period first (the headline numbers), then the latest week and month
  const full = resolvePeriod({ view: "year" }, c.minDate!, c.asOf!);
  await report(c, full, true);
  for (const q of [{ view: "week" }, { view: "week", cmp: "yoy" }, { view: "month", cmp: "yoy" }, { view: "quarter", p: "2026-Q3", cmp: "yoy" }, { view: "ytd", cmp: "yoy" }, { view: "ytd" }, { view: "custom", from: "2026-09-01", to: "2026-09-30", cmp: "yoy" }])
    await report(c, resolvePeriod(q, c.minDate!, c.asOf!), false);
})().catch((e) => { console.error(e); process.exit(1); });

async function report(c: NonNullable<Awaited<ReturnType<typeof getCtx>>>, p: Period, detail: boolean) {
  console.log(`
================ ${p.label}${p.prev ? ` (vs ${p.prev.label})` : ""} ================`);
  const ov = await overviewModel(c, p);
  console.log(`OVERVIEW net ${f0(ov.totalNet)}${ov.prevTotals ? ` (prev ${f0(ov.prevTotals.net)})` : ""} | ad spend ${f0(ov.totalSpend)} (${(ov.spendPct * 100).toFixed(1)}%) | lost ${f0(ov.totalLost)} (${(ov.lostPct * 100).toFixed(1)}%)`);
  for (const r of ov.rows)
    console.log(` ${r.name.padEnd(13)} net ${f0(r.net).padStart(10)} spend ${f0(r.spend).padStart(9)} roas ${r.roas.toFixed(2)} lost ${f0(r.lostValue).padStart(7)} (${(r.lostPct * 100).toFixed(1)}%) wipes ${((r.wipesBase ?? 0) * 100).toFixed(1)} -> ${((r.wipesNow ?? 0) * 100).toFixed(1)}`);
  const rep = (await replenishmentModel(c, p))!;
  console.log(`REPLENISHMENT as of ${rep.asOf}: at risk ${rep.atRisk.length}, overstock ${rep.overstock.length}, lost ${f0(rep.totalLost)}`);
  for (const r of rep.action.slice(0, detail ? 6 : 3)) console.log(` ${r.status.padEnd(9)} ${r.platformName} | ${r.nodeName} | ${r.skuName} | on hand ${r.onHand} | cover ${r.cover.toFixed(1)}d | eta ${r.eta ?? "-"} | gap ${r.gapDays.toFixed(1)}d ~${r.unitsAtRisk.toFixed(0)} units`);
  for (const r of rep.overstock.slice(0, 2)) console.log(` OVERSTOCK ${r.name} | ${r.skuName} | ${f0(r.onHand)} units | ${r.cover.toFixed(0)} days | open PO ${r.openPo}`);
  console.log(" lowest PO confirmation:", rep.lowestConfirm.slice(0, 3).map((x) => `${x.name} ${x.skuName} ${(100 * (x.confirmRate ?? 0)).toFixed(0)}%`).join("; "));
  const ads = await adsModel(c, p);
  console.log(`ADS spend ${f0(ads.totalSpend)} roas ${ads.roas.toFixed(2)} below-target ${f0(ads.belowSpend)} | suppressed: ${ads.suppressed.map((x) => `${x.name} ${f0(x.spend)}`).join("; ") || "none"}`);
  if (detail) for (const r of ads.rows.slice(0, 5)) console.log(` ${r.name.padEnd(13)} ${r.campaign.padEnd(34)} spend ${f0(r.spend).padStart(7)} roas ${r.roas.toFixed(1)} lost ${(r.lostShare * 100).toFixed(0)}% ${r.flag}`);
  const pr = await promoModel(c, p);
  console.log(`PROMO ${pr.rows.length} promotions, ${pr.rows.reduce((a, r) => a + r.runs, 0)} runs | dilutive ${f0(pr.dilutive)} accretive ${f0(pr.accretive)}`);
  for (const r of detail ? pr.rows.slice(0, 4).concat(pr.rows.slice(-3)) : pr.rows.slice(0, 2)) console.log(` ${r.name.padEnd(13)} ${r.promo.padEnd(24)} runs ${String(r.runs).padStart(2)} depth ${(r.depth * 100).toFixed(0)}% uplift ${r.uplift.toFixed(2)}x effect ${f0(r.effect)}`);
  const mk = await marketModel(c, p);
  console.log(`MARKET last week ${mk.latestWeek} | wipes share ${mk.wipesNow.map((x) => `${x.name} ${((x.base ?? 0) * 100).toFixed(1)}->${((x.now ?? 0) * 100).toFixed(1)}`).join(", ")}`);
  console.log(` trend ${mk.trendStart} .. ${mk.trendEnd} (${mk.wipes[0]?.share.length ?? 0} points)`);
}
