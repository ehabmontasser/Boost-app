// Validation of an uploaded workbook against the BOOST standard (lib/spec.json, exported from the generator's spec.py).
import spec from "./spec.json";
import { Cell, Sheet, serialToIso } from "./xlsx";
import { FEED_TABLES, MARKET_CATEGORY, SETUP_TABLES, TableMap, PLATFORM_CODE } from "./mapping";

export type ColSpec = { name: string; dtype: string; required: string; allowed: string };
export type Rec = Record<string, string | number | boolean | null>;

export type Parsed = {
  errors: string[];
  warnings: string[];
  /** typed rows keyed by file column name */
  rows: Rec[];
  /** second table (MARKET category totals) */
  rows2?: Rec[];
  meta: Record<string, string>;
  periodStart?: string;
  periodEnd?: string;
};

const MAX_MSG = 6;

class Msgs {
  errors: string[] = [];
  warnings: string[] = [];
  private counts = new Map<string, number>();
  add(kind: "e" | "w", code: string, text: string) {
    const k = kind + code;
    const c = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, c);
    if (c <= MAX_MSG) (kind === "e" ? this.errors : this.warnings).push(`${code}: ${text}`);
    else if (c === MAX_MSG + 1) (kind === "e" ? this.errors : this.warnings).push(`${code}: more of the same not shown`);
  }
}

export function readMeta(sheets: Record<string, Sheet>): Record<string, string> {
  const rows = sheets["Meta"] ?? [];
  const out: Record<string, string> = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r && r[0] != null && r[1] != null) out[String(r[0]).trim()] = String(r[1]).trim();
  }
  return out;
}

function str(v: Cell): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).trim();
}

function isoDate(v: Cell): string | null {
  if (v === null || v === "") return null;
  if (typeof v === "number") return serialToIso(v);
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/** Turns a sheet (header row + data rows) into typed records, collecting rule violations. */
function parseTable(
  sheetName: string, sheet: Sheet | undefined, cols: ColSpec[], key: string[], m: Msgs,
  period?: { start: string; end: string },
): Rec[] {
  if (!sheet || sheet.length === 0) {
    m.add("e", "V02", `sheet ${sheetName} is missing or empty`);
    return [];
  }
  const header = (sheet[0] ?? []).map((h) => (h == null ? "" : String(h).trim()));
  const idx = new Map<string, number>();
  header.forEach((h, i) => { if (h) idx.set(h, i); });
  const missing = cols.filter((c) => !idx.has(c.name)).map((c) => c.name);
  if (missing.length) {
    m.add("e", "V02", `${sheetName}: missing columns ${missing.slice(0, 8).join(", ")}`);
    return [];
  }
  const extra = header.filter((h) => h && !cols.some((c) => c.name === h));
  if (extra.length) m.add("w", "V02", `${sheetName}: extra columns ignored (${extra.slice(0, 5).join(", ")})`);

  const out: Rec[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < sheet.length; r++) {
    const raw = sheet[r];
    if (!raw || raw.every((c) => c === null || c === "")) continue;
    const rec: Rec = {};
    const where = `${sheetName} row ${r + 1}`;
    for (const c of cols) {
      const v = raw[idx.get(c.name)!] ?? null;
      let val: string | number | boolean | null = null;
      if (c.dtype === "text") {
        val = str(v);
        if (val !== null && c.allowed && !c.allowed.split("|").includes(val))
          m.add("e", "V03", `${where}: ${c.name} value "${val}" not allowed`);
      } else if (c.dtype === "date") {
        val = isoDate(v);
        if (v !== null && v !== "" && val === null) m.add("e", "V03", `${where}: ${c.name} is not a date`);
        if (val && period && (c.name === "date" || c.name === "week_start") && (val < period.start || val > period.end))
          m.add("e", "V05", `${where}: ${c.name} ${val} is outside the file's period ${period.start} to ${period.end}`);
      } else if (c.dtype === "bool") {
        const s = v === null ? null : String(v).trim().toUpperCase();
        val = s === null || s === "" ? null : s === "Y" || s === "TRUE" || s === "1";
      } else {
        // int / num / pct
        if (v === null || v === "") val = null;
        else {
          const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
          if (!Number.isFinite(n)) { m.add("e", "V03", `${where}: ${c.name} is not a number`); val = null; }
          else {
            val = n;
            if (n < 0) m.add("e", "V03", `${where}: ${c.name} is negative`);
            if (c.dtype === "pct" && n > 1.0000001) m.add("e", "V03", `${where}: ${c.name} above 1 (use fractions, 0.15 = 15%)`);
            if (c.dtype === "int" && n !== Math.round(n)) m.add("e", "V03", `${where}: ${c.name} must be a whole number`);
          }
        }
      }
      if (c.required === "Y" && (val === null || val === "")) m.add("e", "V03", `${where}: ${c.name} is required`);
      rec[c.name] = val;
    }
    const k = key.map((n) => String(rec[n])).join("|");
    if (seen.has(k)) m.add("e", "V04", `${where}: duplicate key ${k}`);
    seen.add(k);
    out.push(rec);
  }
  return out;
}

export function slotPlatforms(): string[] {
  return Object.keys(spec.platforms);
}

export function parseFeedFile(sheets: Record<string, Sheet>, slotPlatform: string, slotFeed: string): Parsed {
  const m = new Msgs();
  const meta = readMeta(sheets);
  const f = (spec.feeds as Record<string, any>)[slotFeed];
  const res: Parsed = { errors: m.errors, warnings: m.warnings, rows: [], meta };
  if (!f) { m.add("e", "V01", `unknown card ${slotFeed}`); return res; }

  // V01: the file must belong in the slot it was dropped in
  const wantTpl = `BOOST-${slotFeed}-${spec.template_version}`;
  if (!meta.template_id) { m.add("e", "V01", "Meta sheet is missing or has no template_id"); return res; }
  if (meta.template_id !== wantTpl) {
    m.add("e", "V01", `this file is ${meta.template_id}, but this slot expects ${wantTpl}`);
    return res;
  }
  if (meta.platform !== slotPlatform) {
    m.add("e", "V01", `this file is for ${meta.platform ?? "an unknown platform"}, but you dropped it in ${slotPlatform}`);
    return res;
  }
  const start = meta.period_start, end = meta.period_end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? "")) {
    m.add("e", "V01", "Meta sheet needs period_start and period_end (yyyy-mm-dd)");
    return res;
  }
  res.periodStart = start; res.periodEnd = end;
  const period = { start, end };

  if (slotFeed === "MARKET") {
    res.rows2 = parseTable("Data_Category", sheets["Data_Category"], f.cols_category, f.key_category, m, period);
    res.rows = parseTable("Data_SKUs", sheets["Data_SKUs"], f.cols, ["week_start", "category", "platform_sku_id"], m, period);
  } else {
    res.rows = parseTable("Data", sheets["Data"], f.cols, f.key, m, period);
  }
  if (m.errors.length) return res;

  // cross-field checks
  for (const r of res.rows) {
    if (slotFeed === "SALES") {
      const diff = Math.abs((r.gross_gmv_ex_vat_egp as number) - (r.discount_value_ex_vat_egp as number) - (r.net_gmv_ex_vat_egp as number));
      if (diff > 0.05) m.add("e", "V08", `net_gmv is not gross minus discount for ${r.platform_sku_id} on ${r.date}`);
    }
    if (slotFeed === "PRICE_PROMO") {
      const list = r.list_price_ex_vat_egp as number, sell = r.selling_price_ex_vat_egp as number;
      if (list > 0 && Math.abs(1 - sell / list - (r.discount_depth_pct as number)) > 0.005)
        m.add("e", "V12", `discount depth does not match prices for ${r.platform_sku_id} on ${r.date}`);
    }
    if (slotFeed === "INVENTORY") {
      const oh = r.operating_hours as number;
      if (oh > 0 && Math.abs(1 - (r.oos_hours as number) / oh - (r.in_stock_rate_pct as number)) > 0.01)
        m.add("w", "V10", `in_stock_rate inconsistent with oos_hours for ${r.platform_sku_id} on ${r.date}`);
    }
  }
  return res;
}

export function parseSetupFile(sheets: Record<string, Sheet>): { errors: string[]; warnings: string[]; tables: Record<string, Rec[]>; meta: Record<string, string> } {
  const m = new Msgs();
  const meta = readMeta(sheets);
  const tables: Record<string, Rec[]> = {};
  if (meta.template_id !== "BOOST-SETUP-v1.0") {
    m.add("e", "V01", `this file is ${meta.template_id ?? "not a BOOST file"}, but this slot expects BOOST-SETUP-v1.0 (the Brand Master)`);
    return { errors: m.errors, warnings: m.warnings, tables, meta };
  }
  for (const [name, def] of Object.entries(spec.setup as Record<string, { key: string[]; cols: ColSpec[] }>)) {
    if (!(name in SETUP_TABLES)) continue; // e.g. Shelf_Capacity: accepted and ignored
    // the file may carry columns the database does not store (parent_platform, brand): only the stored ones are required
    const stored = SETUP_TABLES[name].cols.map((c) => c[0]);
    const cols = def.cols.filter((c) => stored.includes(c.name));
    tables[name] = parseTable(name, sheets[name], cols, def.key, m);
  }
  return { errors: m.errors, warnings: m.warnings, tables, meta };
}

/** Converts parsed rows into JSON-ready objects keyed by database column names. */
export function toDbRows(map: TableMap, rows: Rec[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [fileCol, dbCol, pgType] of map.cols) {
      const v = r[fileCol] ?? null;
      o[dbCol] =
        pgType === "boolean" && typeof v === "string" ? v.toUpperCase() === "Y"
        : dbCol === "platform" && typeof v === "string" ? (PLATFORM_CODE[v] ?? v)
        : v;
    }
    return o;
  });
}

export { FEED_TABLES, MARKET_CATEGORY, SETUP_TABLES };
