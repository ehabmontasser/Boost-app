import spec from "./spec.json";
import { q, withTx } from "./db";
import { getBrand } from "./queries";
import { readWorkbook } from "./xlsx";
import { readMeta, parseFeedFile, parseSetupFile, toDbRows } from "./validate";
import { FEED_TABLES, MARKET_CATEGORY, SETUP_ORDER, SETUP_TABLES, upsertSql, TableMap, platformCode } from "./mapping";

export type ImportResult = {
  status: "imported" | "imported_with_warnings" | "rejected";
  rows: number;
  errors: string[];
  warnings: string[];
  message: string;
};

const CHUNK = 1000;

async function upsertAll(
  c: { query: (sql: string, p: unknown[]) => Promise<unknown> },
  map: TableMap, brandId: string, platform: string | null, rows: Record<string, unknown>[],
) {
  const sql = upsertSql(map);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const json = JSON.stringify(rows.slice(i, i + CHUNK));
    await c.query(sql, map.platformConst ? [brandId, platform, json] : [brandId, json]);
  }
}

async function logIngestion(
  slotPlatform: string, slotFeed: string, fileName: string, templateId: string | null,
  start: string | null, end: string | null, status: ImportResult["status"], rows: number,
  errors: string[], warnings: string[], brandId: string | null,
) {
  try {
    await q(
      `INSERT INTO ingestion_log (brand_id, slot_platform, slot_feed, file_name, template_id, period_start, period_end,
        status, rows_imported, errors, warnings) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)`,
      [brandId, slotPlatform, slotFeed, fileName, templateId, start, end, status, rows, JSON.stringify(errors), JSON.stringify(warnings)],
    );
  } catch {
    // logging must never break an import; a rejected file with no brand yet cannot be logged
  }
}

/** Uploads go to the brand the user is working on. */
export async function getBrandId(): Promise<string | null> {
  return (await getBrand())?.id ?? null;
}

/** Who may load which Brand Master: null = any brand, including a new one (the owner); otherwise these brand codes. */
export type ImportOptions = { allowedBrandCodes: string[] | null };

export async function importFeed(buf: Buffer, fileName: string, slotPlatform: string, slotFeed: string): Promise<ImportResult> {
  let sheets;
  try { sheets = readWorkbook(buf); }
  catch (e) { return rejected(slotPlatform, slotFeed, fileName, null, [`V00: could not read the file as .xlsx (${(e as Error).message})`]); }

  const parsed = parseFeedFile(sheets, slotPlatform, slotFeed);
  const brandId = await getBrandId();
  if (parsed.errors.length) return rejected(slotPlatform, slotFeed, fileName, brandId, parsed.errors, parsed.warnings, parsed.meta, parsed);
  if (!brandId) return rejected(slotPlatform, slotFeed, fileName, null, ["Upload the Brand Master (00 Setup) first. Other files are rejected until it exists."]);
  // a file meant for another brand must never land in this one
  const current = await getBrand();
  if (current && parsed.meta.brand && parsed.meta.brand.trim() !== current.name)
    return rejected(slotPlatform, slotFeed, fileName, brandId, [`V01: this file is for ${parsed.meta.brand}, but you are working on ${current.name}. Switch brand in the sidebar, then upload it again.`], parsed.warnings, parsed.meta, parsed);

  // V06: platform_sku_id must exist in Brand Master > Platform_Listings (unknown ids go to the mapping queue, file still imports)
  const warnings = [...parsed.warnings];
  const listed = new Set((await q<{ platform_sku_id: string }>(
    "SELECT platform_sku_id FROM platform_listings WHERE brand_id = $1 AND platform = $2", [brandId, platformCode(slotPlatform)],
  )).map((r) => r.platform_sku_id));
  if (listed.size === 0)
    return rejected(slotPlatform, slotFeed, fileName, brandId, [`Brand Master has no listings for ${slotPlatform}. Upload the Brand Master first.`]);
  const unknown = new Map<string, string | null>();
  for (const r of parsed.rows) {
    const id = r.platform_sku_id as string;
    if (!listed.has(id) && !unknown.has(id)) unknown.set(id, (r.gtin as string) ?? null);
  }
  if (unknown.size) warnings.push(`V06: ${unknown.size} platform_sku_id not in Brand Master, sent to the SKU mapping queue (${[...unknown.keys()].slice(0, 3).join(", ")})`);

  const map = FEED_TABLES[slotFeed];
  const main = toDbRows(map, parsed.rows);
  const second = slotFeed === "MARKET" && parsed.rows2 ? toDbRows(MARKET_CATEGORY, parsed.rows2) : null;
  try {
    await withTx(async (c) => {
      await upsertAll(c, map, brandId, platformCode(slotPlatform), main);
      if (second) await upsertAll(c, MARKET_CATEGORY, brandId, platformCode(slotPlatform), second);
      for (const [id, gtin] of unknown)
        await c.query(
          `INSERT INTO sku_mapping_queue (brand_id, platform, platform_sku_id, gtin, first_seen_file)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (brand_id, platform, platform_sku_id) DO NOTHING`,
          [brandId, platformCode(slotPlatform), id, gtin, fileName],
        );
    });
  } catch (e) {
    return rejected(slotPlatform, slotFeed, fileName, brandId, [`Database error, nothing was imported: ${(e as Error).message}`], warnings, parsed.meta, parsed);
  }
  const total = main.length + (second?.length ?? 0);
  const status = warnings.length ? "imported_with_warnings" : "imported";
  await logIngestion(slotPlatform, slotFeed, fileName, parsed.meta.template_id ?? null, parsed.periodStart ?? null, parsed.periodEnd ?? null, status, total, [], warnings, brandId);
  return {
    status, rows: total, errors: [], warnings,
    message: `${fileName}: ${total.toLocaleString("en-US")} rows replaced by key, 0 blocking errors, ${warnings.length} warnings.`,
  };
}

export async function importSetup(buf: Buffer, fileName: string, opts: ImportOptions = { allowedBrandCodes: null }): Promise<ImportResult> {
  let sheets;
  try { sheets = readWorkbook(buf); }
  catch (e) { return rejected("All", "SETUP", fileName, null, [`V00: could not read the file as .xlsx (${(e as Error).message})`]); }
  const parsed = parseSetupFile(sheets);
  if (parsed.errors.length) return rejected("All", "SETUP", fileName, await getBrandId(), parsed.errors, parsed.warnings, parsed.meta);

  const brandName = parsed.meta.brand || "Brand";
  const code = brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";
  if (opts.allowedBrandCodes && !opts.allowedBrandCodes.includes(code))
    return rejected("All", "SETUP", fileName, await getBrandId(), [`This Brand Master is for ${brandName}, which is not one of your brands. Only the owner can add a new brand.`], parsed.warnings, parsed.meta);
  let total = 0;
  let loadedId: string | null = null;
  try {
    await withTx(async (c) => {
      const r = (await c.query(
        `INSERT INTO brands (code, name) VALUES ($1,$2) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [code, brandName],
      )) as { rows: { id: string }[] };
      const brandId = r.rows[0].id;
      loadedId = brandId;
      for (const sheet of SETUP_ORDER) {
        const rows = parsed.tables[sheet] ?? [];
        if (!rows.length) continue;
        await upsertAll(c, SETUP_TABLES[sheet], brandId, null, toDbRows(SETUP_TABLES[sheet], rows));
        total += rows.length;
      }
    });
  } catch (e) {
    return rejected("All", "SETUP", fileName, await getBrandId(), [`Database error, nothing was imported: ${(e as Error).message}`], parsed.warnings, parsed.meta);
  }
  const brandId = loadedId;
  const status = parsed.warnings.length ? "imported_with_warnings" : "imported";
  await logIngestion("All", "SETUP", fileName, parsed.meta.template_id ?? null, null, null, status, total, [], parsed.warnings, brandId);
  return { status, rows: total, errors: [], warnings: parsed.warnings, message: `${fileName}: Brand Master loaded for ${brandName} (${total} rows across ${Object.keys(parsed.tables).length} tabs).` };
}

async function rejected(
  slotPlatform: string, slotFeed: string, fileName: string, brandId: string | null, errors: string[],
  warnings: string[] = [], meta: Record<string, string> = {}, parsed?: { periodStart?: string; periodEnd?: string },
): Promise<ImportResult> {
  await logIngestion(slotPlatform, slotFeed, fileName, meta.template_id ?? null, parsed?.periodStart ?? null, parsed?.periodEnd ?? null, "rejected", 0, errors, warnings, brandId);
  return { status: "rejected", rows: 0, errors, warnings, message: `Rejected. ${errors[0] ?? ""}` };
}

export const platformNames = Object.keys(spec.platforms);

/** Routes a file by its Meta tab: the Brand Master, or a platform card. Used by the bulk upload. */
export async function importAuto(buf: Buffer, fileName: string, opts: ImportOptions = { allowedBrandCodes: null }): Promise<ImportResult & { slot: string }> {
  let sheets;
  try { sheets = readWorkbook(buf); }
  catch (e) {
    return { status: "rejected", rows: 0, warnings: [], slot: "Unknown", errors: [`V00: could not read the file as .xlsx (${(e as Error).message})`], message: "Rejected. This is not a readable .xlsx file." };
  }
  const meta = readMeta(sheets);
  const tid = meta.template_id ?? "";
  if (tid === "BOOST-SETUP-v1.0") return { ...(await importSetup(buf, fileName, opts)), slot: "Brand Master" };
  const m = /^BOOST-([A-Z_]+)-v1\.0$/.exec(tid);
  const feed = m?.[1];
  const platform = meta.platform;
  if (!feed || !(feed in (spec.feeds as Record<string, unknown>)) || !platform || !(platform in (spec.platforms as Record<string, unknown>))) {
    const msg = `V01: Meta tab is missing or not a BOOST template (template_id "${tid || "empty"}", platform "${platform ?? "empty"}"). Use the files from the data pack without changing the Meta tab.`;
    return { status: "rejected", rows: 0, warnings: [], slot: "Unknown", errors: [msg], message: "Rejected. " + msg };
  }
  return { ...(await importFeed(buf, fileName, platform, feed)), slot: `${platform} · ${feed}` };
}
