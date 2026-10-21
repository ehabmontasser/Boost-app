// Maps the BOOST file standard (field names in the Excel templates) to database tables.
// [fileColumn, dbColumn, postgresType]
export type ColMap = [string, string, string];

export type TableMap = {
  table: string;
  /** primary key columns after brand_id (and platform for feed tables), in database names */
  pk: string[];
  /** feed tables get platform from the upload slot; setup tables carry platform in each row */
  platformConst: boolean;
  cols: ColMap[];
};

/** The database stores the platform code (platforms.code); files and the UI use the display name. */
export const PLATFORM_CODE: Record<string, string> = {
  "Talabat Mart": "TALABAT", "Noon": "NOON", "Amazon Core": "AMAZON", "Amazon Now": "AMAZON_NOW", "Breadfast": "BREADFAST", "Rabbit": "RABBIT",
};
export function platformCode(name: string): string {
  const c = PLATFORM_CODE[name];
  if (!c) throw new Error(`Unknown platform ${name}`);
  return c;
}

const t = "text", d = "date", i = "integer", n = "numeric", b = "boolean";

export const FEED_TABLES: Record<string, TableMap> = {
  SALES: {
    table: "sales_daily", pk: ["date", "platform_sku_id", "region"], platformConst: true,
    cols: [
      ["date", "date", d], ["platform_sku_id", "platform_sku_id", t], ["gtin", "gtin", t], ["region", "region", t],
      ["orders", "orders", i], ["units_sold", "units_sold", i],
      ["gross_gmv_ex_vat_egp", "gross_gmv", n], ["discount_value_ex_vat_egp", "discount_value", n],
      ["net_gmv_ex_vat_egp", "net_gmv", n], ["vendor_funded_discount_ex_vat_egp", "vendor_funded_discount", n],
      ["cancelled_units_oos", "cancelled_units_oos", i], ["cancelled_units_other", "cancelled_units_other", i],
      ["returned_units", "returned_units", i],
    ],
  },
  INVENTORY: {
    table: "inventory_daily", pk: ["date", "platform_sku_id", "node_id"], platformConst: true,
    cols: [
      ["date", "date", d], ["platform_sku_id", "platform_sku_id", t], ["gtin", "gtin", t], ["node_id", "node_id", t],
      ["listing_status", "listing_status", t], ["on_hand_units_sellable", "on_hand_units", i],
      ["in_transit_units", "in_transit_units", i], ["open_po_units", "open_po_units", i],
      ["next_po_eta_date", "next_po_eta", d], ["unhealthy_units", "unhealthy_units", i],
      ["oos_hours", "oos_hours", n], ["operating_hours", "operating_hours", n],
      ["in_stock_rate_pct", "in_stock_rate", n], ["unfilled_demand_units", "unfilled_demand_units", i],
    ],
  },
  PRICE_PROMO: {
    table: "price_promo_daily", pk: ["date", "platform_sku_id"], platformConst: true,
    cols: [
      ["date", "date", d], ["platform_sku_id", "platform_sku_id", t], ["gtin", "gtin", t],
      ["list_price_ex_vat_egp", "list_price", n], ["selling_price_ex_vat_egp", "selling_price", n],
      ["discount_depth_pct", "discount_depth", n], ["promo_id", "promo_id", t], ["promo_name", "promo_name", t],
      ["promo_type", "promo_type", t], ["funding", "funding", t],
      ["vendor_funding_share_pct", "vendor_funding_share", n], ["promo_start_date", "promo_start", d],
      ["promo_end_date", "promo_end", d], ["featured_placement", "featured_placement", b],
    ],
  },
  ADS: {
    table: "ads_daily", pk: ["date", "campaign_id", "platform_sku_id"], platformConst: true,
    cols: [
      ["date", "date", d], ["campaign_id", "campaign_id", t], ["campaign_name", "campaign_name", t],
      ["ad_type", "ad_type", t], ["objective", "objective", t], ["platform_sku_id", "platform_sku_id", t],
      ["gtin", "gtin", t], ["impressions", "impressions", i], ["clicks", "clicks", i],
      ["ad_spend_ex_vat_egp", "ad_spend", n], ["attributed_orders_7d", "attributed_orders_7d", i],
      ["attributed_units_7d", "attributed_units_7d", i], ["attributed_sales_7d_ex_vat_egp", "attributed_sales_7d", n],
      ["daily_budget_egp", "daily_budget", n], ["impression_share_lost_budget_pct", "impression_share_lost_budget", n],
    ],
  },
  MARKET: {
    table: "market_sku_weekly", pk: ["week_start", "platform_sku_id"], platformConst: true,
    cols: [
      ["week_start", "week_start", d], ["category", "category", t], ["sub_category", "sub_category", t],
      ["brand", "brand", t], ["product_name", "product_name", t], ["platform_sku_id", "platform_sku_id", t],
      ["gtin", "gtin", t], ["is_own_brand", "is_own_brand", b], ["units", "units", i],
      ["gmv_ex_vat_egp", "gmv", n], ["avg_price_ex_vat_egp", "avg_price", n], ["rank_by_value", "rank_by_value", i],
      ["in_stock_rate_pct", "in_stock_rate", n], ["share_of_search_pct", "share_of_search", n],
      ["avg_rating", "avg_rating", n], ["review_count", "review_count", i],
    ],
  },
  SERVICE: {
    table: "service_weekly", pk: ["week_start", "platform_sku_id"], platformConst: true,
    cols: [
      ["week_start", "week_start", d], ["platform_sku_id", "platform_sku_id", t], ["gtin", "gtin", t],
      ["customer_orders", "customer_orders", i], ["fully_filled_orders_pct", "fully_filled_orders", n],
      ["lost_orders_oos", "lost_orders_oos", i], ["lost_orders_other", "lost_orders_other", i],
      ["return_rate_pct", "return_rate", n], ["po_units_requested", "po_units_requested", i],
      ["po_units_confirmed", "po_units_confirmed", i], ["po_units_received", "po_units_received", i],
      ["avg_lead_time_days", "avg_lead_time_days", n], ["on_time_receipt_pct", "on_time_receipt", n],
    ],
  },
};

/** MARKET carries a second tab with category totals. */
export const MARKET_CATEGORY: TableMap = {
  table: "market_category_weekly", pk: ["week_start", "category", "sub_category"], platformConst: true,
  cols: [
    ["week_start", "week_start", d], ["category", "category", t], ["sub_category", "sub_category", t],
    ["category_gmv_ex_vat_egp", "category_gmv", n], ["category_units", "category_units", i],
    ["active_brands", "active_brands", i], ["active_skus", "active_skus", i],
  ],
};

/** Sheets of the Brand Master workbook. Sheets not listed here (e.g. Shelf_Capacity) are accepted and ignored. */
export const SETUP_TABLES: Record<string, TableMap> = {
  SKU_Master: {
    table: "skus", pk: ["sku_code"], platformConst: false,
    cols: [
      ["sku_code", "sku_code", t], ["product_name", "product_name", t], ["category", "category", t],
      ["sub_category", "sub_category", t], ["pack_size", "pack_size", t], ["gtin", "gtin", t],
      ["list_price_ex_vat_egp", "list_price_ex_vat", n], ["unit_cogs_ex_vat_egp", "unit_cogs_ex_vat", n],
      ["shelf_life_months", "shelf_life_months", i], ["case_pack_units", "case_pack_units", i], ["status", "status", t],
    ],
  },
  Platform_Listings: {
    table: "platform_listings", pk: ["platform", "platform_sku_id"], platformConst: false,
    cols: [
      ["platform", "platform", t], ["sku_code", "sku_code", t], ["platform_sku_id", "platform_sku_id", t],
      ["gtin", "gtin", t], ["platform_title", "platform_title", t], ["listed_since", "listed_since", d],
    ],
  },
  Nodes: {
    table: "nodes", pk: ["platform", "node_id"], platformConst: false,
    cols: [
      ["platform", "platform", t], ["node_id", "node_id", t], ["node_name", "node_name", t],
      ["node_type", "node_type", t], ["operating_hours", "operating_hours", n],
    ],
  },
  Region_Node_Map: {
    table: "region_node_map", pk: ["platform", "region", "node_id"], platformConst: false,
    cols: [["platform", "platform", t], ["region", "region", t], ["node_id", "node_id", t], ["share_pct", "share", n]],
  },
  Replenishment_Params: {
    table: "replenishment_params", pk: ["platform", "sku_code"], platformConst: false,
    cols: [
      ["platform", "platform", t], ["sku_code", "sku_code", t], ["planned_lead_time_days", "planned_lead_time_days", i],
      ["review_cycle_days", "review_cycle_days", i], ["safety_stock_days", "safety_stock_days", i],
      ["target_cover_days", "target_cover_days", i], ["max_cover_days", "max_cover_days", i],
      ["moq_units_per_node", "moq_units_per_node", i],
    ],
  },
  Platform_Terms: {
    table: "platform_terms", pk: ["platform"], platformConst: false,
    cols: [
      ["platform", "platform", t], ["channel_type", "channel_type", t], ["platform_margin_pct", "platform_margin", n],
      ["payment_terms_days", "payment_terms_days", i], ["vat_rate", "vat_rate", n],
      ["target_in_stock_rate_pct", "target_in_stock_rate", n], ["monthly_sales_target_egp", "monthly_sales_target", n],
      ["monthly_ad_budget_egp", "monthly_ad_budget", n], ["target_roas", "target_roas", n],
      ["min_vendor_margin_pct", "min_vendor_margin", n],
    ],
  },
  Competitor_Brands: {
    table: "competitor_brands", pk: ["brand"], platformConst: false,
    cols: [["brand", "brand", t], ["tier", "tier", t], ["focus", "focus", t]],
  },
};

export const SETUP_ORDER = [
  "SKU_Master", "Platform_Listings", "Nodes", "Region_Node_Map",
  "Replenishment_Params", "Platform_Terms", "Competitor_Brands",
];

/** Builds the upsert statement. $1 = brand_id, $2 = platform (feed tables only), last param = rows as JSON. */
export function upsertSql(m: TableMap): string {
  const dbCols = m.cols.map((c) => c[1]);
  const q = (s: string) => `"${s}"`;
  const insertCols = ["brand_id", ...(m.platformConst ? ["platform"] : []), ...dbCols];
  const selectCols = ["$1::uuid", ...(m.platformConst ? ["$2::text"] : []), ...dbCols.map((c) => "r." + q(c))];
  const jsonParam = m.platformConst ? "$3" : "$2";
  const recordset = m.cols.map((c) => `${q(c[1])} ${c[2]}`).join(", ");
  const conflict = ["brand_id", ...(m.platformConst ? ["platform"] : []), ...m.pk];
  const updatable = dbCols.filter((c) => !conflict.includes(c));
  const set = updatable.length
    ? "DO UPDATE SET " + updatable.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(", ")
    : "DO NOTHING";
  return (
    `INSERT INTO ${m.table} (${insertCols.map(q).join(", ")}) ` +
    `SELECT ${selectCols.join(", ")} FROM jsonb_to_recordset(${jsonParam}::jsonb) AS r(${recordset}) ` +
    `ON CONFLICT (${conflict.map(q).join(", ")}) ${set}`
  );
}
