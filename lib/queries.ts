// Read queries. Written in portable SQL (no vendor functions) so they run on Postgres and on the in-memory test database.
import { q } from "./db";
import type { Range } from "./period";

export type Platform = { code: string; name: string; channel_type: string; status: string; sort: number };
export type Brand = { id: string; name: string };

/** The brand the signed-in user is working on (see lib/access.ts). Outside a web request (test scripts) there is no
 *  user, so the first brand is used; any other error is raised, never answered with another brand's data. */
export async function getBrand(): Promise<Brand | null> {
  try {
    const { currentBrand } = await import("./access");
    const b = await currentBrand();
    return b ? { id: b.id, name: b.name } : null;
  } catch (e) {
    if (!/outside a request scope|request scope/i.test((e as Error).message)) throw e;
    const r = await q<Brand>("SELECT id, name FROM brands ORDER BY created_at LIMIT 1");
    return r[0] ?? null;
  }
}

export async function getPlatforms(): Promise<Platform[]> {
  return q<Platform>("SELECT code, name, channel_type, status, sort FROM platforms ORDER BY sort");
}

/** First and last day of daily data: the span the period picker can choose from. */
export async function dataRange(b: string): Promise<{ min: string | null; max: string | null }> {
  const r = await q<{ mn: string | null; mx: string | null }>("SELECT MIN(date) AS mn, MAX(date) AS mx FROM sales_daily WHERE brand_id = $1", [b]);
  return { min: r[0]?.mn ?? null, max: r[0]?.mx ?? null };
}

/** Latest date for which every platform that has inventory data has a row (the "data through" date). */
export async function asOfDate(b: string): Promise<string | null> {
  const r = await q<{ d: string | null }>("SELECT MAX(date) AS d FROM inventory_daily WHERE brand_id = $1", [b]);
  return r[0]?.d ?? null;
}

export async function salesByPlatform(b: string, r: Range) {
  return q<{ platform: string; net: number; gross: number; units: number; orders: number }>(
    `SELECT platform, SUM(net_gmv) AS net, SUM(gross_gmv) AS gross, SUM(units_sold) AS units, SUM(orders) AS orders
     FROM sales_daily WHERE brand_id = $1 AND date >= $2 AND date <= $3 GROUP BY platform`, [b, r.from, r.to]);
}

export async function salesDaily(b: string) {
  return q<{ platform: string; date: string; net: number; units: number }>(
    `SELECT platform, date, SUM(net_gmv) AS net, SUM(units_sold) AS units
     FROM sales_daily WHERE brand_id = $1 GROUP BY platform, date ORDER BY date`, [b]);
}

export async function adsByPlatform(b: string, r: Range) {
  return q<{ platform: string; spend: number; att: number; impressions: number; clicks: number; orders: number }>(
    `SELECT platform, SUM(ad_spend) AS spend, SUM(attributed_sales_7d) AS att, SUM(impressions) AS impressions, SUM(clicks) AS clicks,
            SUM(attributed_orders_7d) AS orders
     FROM ads_daily WHERE brand_id = $1 AND date >= $2 AND date <= $3 GROUP BY platform`, [b, r.from, r.to]);
}

/** Demand that could not be served because of stockouts, valued at the selling price of the day. */
export async function lostByPlatform(b: string, r: Range) {
  return q<{ platform: string; units: number; value: number }>(
    `SELECT i.platform, SUM(i.unfilled_demand_units) AS units, SUM(i.unfilled_demand_units * p.selling_price) AS value
     FROM inventory_daily i
     JOIN price_promo_daily p ON p.brand_id = i.brand_id AND p.platform = i.platform
       AND p.date = i.date AND p.platform_sku_id = i.platform_sku_id
     WHERE i.brand_id = $1 AND i.date >= $2 AND i.date <= $3 GROUP BY i.platform`, [b, r.from, r.to]);
}

export async function lostBySku(b: string, r: Range) {
  return q<{ platform: string; platform_sku_id: string; units: number; value: number; oos_hours: number; op_hours: number }>(
    `SELECT i.platform, i.platform_sku_id, SUM(i.unfilled_demand_units) AS units,
            SUM(i.unfilled_demand_units * p.selling_price) AS value,
            SUM(i.oos_hours) AS oos_hours, SUM(i.operating_hours) AS op_hours
     FROM inventory_daily i
     JOIN price_promo_daily p ON p.brand_id = i.brand_id AND p.platform = i.platform
       AND p.date = i.date AND p.platform_sku_id = i.platform_sku_id
     WHERE i.brand_id = $1 AND i.date >= $2 AND i.date <= $3 GROUP BY i.platform, i.platform_sku_id`, [b, r.from, r.to]);
}

export async function listings(b: string) {
  return q<{ platform: string; sku_code: string; platform_sku_id: string; platform_title: string }>(
    "SELECT platform, sku_code, platform_sku_id, platform_title FROM platform_listings WHERE brand_id = $1", [b]);
}

export async function skus(b: string) {
  return q<{ sku_code: string; product_name: string; category: string; sub_category: string; pack_size: string; list_price_ex_vat: number; unit_cogs_ex_vat: number; case_pack_units: number }>(
    `SELECT sku_code, product_name, category, sub_category, pack_size, list_price_ex_vat, unit_cogs_ex_vat, case_pack_units
     FROM skus WHERE brand_id = $1 ORDER BY sku_code`, [b]);
}

export async function platformTerms(b: string) {
  return q<{ platform: string; platform_margin: number; target_in_stock_rate: number; target_roas: number; monthly_ad_budget: number; min_vendor_margin: number }>(
    `SELECT platform, platform_margin, target_in_stock_rate, target_roas, monthly_ad_budget, min_vendor_margin
     FROM platform_terms WHERE brand_id = $1`, [b]);
}

// ---------- replenishment ----------
export async function inventoryOn(b: string, date: string) {
  return q<{ platform: string; platform_sku_id: string; node_id: string; listing_status: string; on_hand_units: number; in_transit_units: number; open_po_units: number; next_po_eta: string | null; oos_hours: number; operating_hours: number }>(
    `SELECT platform, platform_sku_id, node_id, listing_status, on_hand_units, in_transit_units, open_po_units, next_po_eta, oos_hours, operating_hours
     FROM inventory_daily WHERE brand_id = $1 AND date = $2`, [b, date]);
}

export async function salesRateSince(b: string, since: string, until: string) {
  return q<{ platform: string; platform_sku_id: string; region: string; units: number; oos_cancel: number }>(
    `SELECT platform, platform_sku_id, region, SUM(units_sold) AS units, SUM(cancelled_units_oos) AS oos_cancel
     FROM sales_daily WHERE brand_id = $1 AND date >= $2 AND date <= $3 GROUP BY platform, platform_sku_id, region`, [b, since, until]);
}

export async function regionNodeMap(b: string) {
  return q<{ platform: string; region: string; node_id: string; share: number }>(
    "SELECT platform, region, node_id, share FROM region_node_map WHERE brand_id = $1", [b]);
}

export async function nodes(b: string) {
  return q<{ platform: string; node_id: string; node_name: string; node_type: string }>(
    "SELECT platform, node_id, node_name, node_type FROM nodes WHERE brand_id = $1", [b]);
}

export async function replenishmentParams(b: string) {
  return q<{ platform: string; sku_code: string; planned_lead_time_days: number; review_cycle_days: number; safety_stock_days: number; target_cover_days: number; max_cover_days: number; moq_units_per_node: number }>(
    `SELECT platform, sku_code, planned_lead_time_days, review_cycle_days, safety_stock_days, target_cover_days, max_cover_days, moq_units_per_node
     FROM replenishment_params WHERE brand_id = $1`, [b]);
}

/** Weekly service rows whose week starts inside the range. */
export async function poPerformance(b: string, r: Range) {
  return q<{ platform: string; platform_sku_id: string; requested: number; confirmed: number; received: number; lead: number; orders: number; lost_oos: number }>(
    `SELECT platform, platform_sku_id, SUM(po_units_requested) AS requested, SUM(po_units_confirmed) AS confirmed,
            SUM(po_units_received) AS received, AVG(avg_lead_time_days) AS lead,
            SUM(customer_orders) AS orders, SUM(lost_orders_oos) AS lost_oos
     FROM service_weekly WHERE brand_id = $1 AND week_start >= $2 AND week_start <= $3 GROUP BY platform, platform_sku_id`, [b, r.from, r.to]);
}

// ---------- ads ----------
export async function adsByCampaign(b: string, r: Range) {
  return q<{ platform: string; campaign_id: string; campaign_name: string; ad_type: string; objective: string; spend: number; att: number; clicks: number; impressions: number; orders: number; lost_w: number; budget_days: number }>(
    `SELECT platform, campaign_id, MAX(campaign_name) AS campaign_name, MAX(ad_type) AS ad_type, MAX(objective) AS objective,
            SUM(ad_spend) AS spend, SUM(attributed_sales_7d) AS att, SUM(clicks) AS clicks, SUM(impressions) AS impressions, SUM(attributed_orders_7d) AS orders,
            SUM(impression_share_lost_budget * ad_spend) AS lost_w, COUNT(*) AS budget_days
     FROM ads_daily WHERE brand_id = $1 AND date >= $2 AND date <= $3 GROUP BY platform, campaign_id`, [b, r.from, r.to]);
}

export async function adSpendOnSuppressed(b: string, r: Range) {
  return q<{ platform: string; spend: number; att: number }>(
    `SELECT a.platform, SUM(a.ad_spend) AS spend, SUM(a.attributed_sales_7d) AS att
     FROM ads_daily a
     WHERE a.brand_id = $1 AND a.date >= $2 AND a.date <= $3 AND EXISTS (
       SELECT 1 FROM inventory_daily i
       WHERE i.brand_id = a.brand_id AND i.platform = a.platform AND i.date = a.date
         AND i.platform_sku_id = a.platform_sku_id AND i.listing_status = 'SUPPRESSED')
     GROUP BY a.platform`, [b, r.from, r.to]);
}

// ---------- promotions ----------
export async function promoDays(b: string) {
  return q<{ platform: string; platform_sku_id: string; date: string; promo_id: string; promo_name: string; promo_type: string; funding: string; vendor_funding_share: number; list_price: number; discount_depth: number }>(
    `SELECT platform, platform_sku_id, date, promo_id, promo_name, promo_type, funding, vendor_funding_share, list_price, discount_depth
     FROM price_promo_daily WHERE brand_id = $1 AND promo_id IS NOT NULL ORDER BY date`, [b]);
}

export async function unitsDaily(b: string) {
  return q<{ platform: string; platform_sku_id: string; date: string; units: number }>(
    `SELECT platform, platform_sku_id, date, SUM(units_sold) AS units
     FROM sales_daily WHERE brand_id = $1 GROUP BY platform, platform_sku_id, date`, [b]);
}

// ---------- market ----------
export async function ownGmvWeekly(b: string) {
  return q<{ platform: string; week_start: string; category: string; sub_category: string; gmv: number }>(
    `SELECT platform, week_start, category, sub_category, SUM(gmv) AS gmv
     FROM market_sku_weekly WHERE brand_id = $1 AND is_own_brand = true
     GROUP BY platform, week_start, category, sub_category`, [b]);
}

export async function categoryGmvWeekly(b: string) {
  return q<{ platform: string; week_start: string; category: string; sub_category: string; gmv: number }>(
    `SELECT platform, week_start, category, sub_category, SUM(category_gmv) AS gmv
     FROM market_category_weekly WHERE brand_id = $1 GROUP BY platform, week_start, category, sub_category`, [b]);
}

export async function topSkusOn(b: string, week: string) {
  return q<{ platform: string; platform_sku_id: string; category: string; sub_category: string; brand: string; product_name: string; gmv: number; rank_by_value: number; is_own_brand: boolean; in_stock_rate: number }>(
    `SELECT platform, platform_sku_id, category, sub_category, brand, product_name, gmv, rank_by_value, is_own_brand, in_stock_rate
     FROM market_sku_weekly WHERE brand_id = $1 AND week_start = $2 AND category = 'Wipes'`, [b, week]);
}

export async function latestMarketWeek(b: string): Promise<string | null> {
  const r = await q<{ d: string | null }>("SELECT MAX(week_start) AS d FROM market_sku_weekly WHERE brand_id = $1", [b]);
  return r[0]?.d ?? null;
}

// ---------- admin ----------
export async function freshness(b: string) {
  return q<{ platform: string; feed: string; from_date: string; through_date: string; n: number }>(
    `SELECT platform, 'SALES' AS feed, MIN(date) AS from_date, MAX(date) AS through_date, COUNT(*) AS n FROM sales_daily WHERE brand_id = $1 GROUP BY platform
     UNION ALL SELECT platform, 'INVENTORY', MIN(date), MAX(date), COUNT(*) FROM inventory_daily WHERE brand_id = $1 GROUP BY platform
     UNION ALL SELECT platform, 'PRICE_PROMO', MIN(date), MAX(date), COUNT(*) FROM price_promo_daily WHERE brand_id = $1 GROUP BY platform
     UNION ALL SELECT platform, 'ADS', MIN(date), MAX(date), COUNT(*) FROM ads_daily WHERE brand_id = $1 GROUP BY platform
     UNION ALL SELECT platform, 'MARKET', MIN(week_start), MAX(week_start), COUNT(*) FROM market_sku_weekly WHERE brand_id = $1 GROUP BY platform
     UNION ALL SELECT platform, 'SERVICE', MIN(week_start), MAX(week_start), COUNT(*) FROM service_weekly WHERE brand_id = $1 GROUP BY platform`, [b]);
}

export async function ingestionLog(b: string) {
  return q<{ id: string; created_at: string; slot_platform: string; slot_feed: string; file_name: string; status: string; rows_imported: number; errors: any; warnings: any }>(
    `SELECT id, created_at, slot_platform, slot_feed, file_name, status, rows_imported, errors, warnings
     FROM ingestion_log WHERE brand_id = $1 ORDER BY created_at DESC LIMIT 40`, [b]);
}

export async function mappingQueue(b: string) {
  return q<{ platform: string; platform_sku_id: string; gtin: string | null; first_seen_file: string; status: string }>(
    `SELECT platform, platform_sku_id, gtin, first_seen_file, status FROM sku_mapping_queue
     WHERE brand_id = $1 AND status = 'open' ORDER BY platform, platform_sku_id`, [b]);
}

// ---------- agent: product-level views ----------
export async function salesBySku(b: string, r: Range) {
  return q<{ platform: string; platform_sku_id: string; net: number; units: number }>(
    `SELECT platform, platform_sku_id, SUM(net_gmv) AS net, SUM(units_sold) AS units
     FROM sales_daily WHERE brand_id = $1 AND date >= $2 AND date <= $3 GROUP BY platform, platform_sku_id`, [b, r.from, r.to]);
}

export async function adsBySku(b: string, r: Range) {
  return q<{ platform: string; platform_sku_id: string; campaign_name: string; spend: number; att: number }>(
    `SELECT platform, platform_sku_id, campaign_name, SUM(ad_spend) AS spend, SUM(attributed_sales_7d) AS att
     FROM ads_daily WHERE brand_id = $1 AND date >= $2 AND date <= $3 GROUP BY platform, platform_sku_id, campaign_name`, [b, r.from, r.to]);
}
