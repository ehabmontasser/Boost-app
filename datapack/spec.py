"""BOOST data-sharing standard v1.0: single source of truth for feed templates.

Used by the pack generator (to write templates and the field dictionary) and by
the validator (to check files). The same definitions will drive the upload
validation inside the app.
"""
from datetime import date

BRAND = "Sprout Baby Care"
BRAND_CODE = "SBC"
START = date(2026, 7, 20)          # Monday
END = date(2026, 10, 18)           # Sunday
BACKFILL_END = date(2026, 10, 11)  # Sunday
UPDATE_START = date(2026, 10, 12)  # Monday
TEMPLATE_VERSION = "v1.0"
GENERATED = date(2026, 10, 20)

REGIONS = ["Cairo", "Giza", "Alexandria", "Delta", "Upper Egypt"]

# platform -> (file code, folder name, menu label)
PLATFORM_FOLDERS = {
    "Talabat Mart": ("TALABAT", "Talabat_Mart"),
    "Noon": ("NOON", "Noon"),
    "Amazon": ("AMAZON", "Amazon"),
}


def F(name, dtype, unit, req, desc, example, allowed=""):
    return dict(name=name, dtype=dtype, unit=unit, required=req, desc=desc,
                example=example, allowed=allowed)


FEEDS = {
    "SALES": dict(
        num="01", title="Sales", grain="day x platform SKU x region", freq="Daily",
        sheets=["Data"], key=["date", "platform_sku_id", "region"],
        unlocks="Overview, Replenishment, Promo, Must-stock, Ads",
        delivery="By 08:00 Cairo time, covering the previous day (T+1)",
        tier="Tier 1 (must have)",
        cols=[
            F("date", "date", "", "Y", "Calendar day, Cairo time", "2026-09-14"),
            F("platform_sku_id", "text", "", "Y", "Platform's own product ID (Mart item ID, Noon SKU config or ASIN)", "B0XXXXXXXX"),
            F("gtin", "text", "", "Y", "13-digit barcode. The common key across platforms", "6229000000013"),
            F("region", "text", "", "Y", "Customer delivery region", "Cairo", "Cairo|Giza|Alexandria|Delta|Upper Egypt"),
            F("orders", "int", "count", "Y", "Distinct customer orders containing the SKU", "42"),
            F("units_sold", "int", "units", "Y", "Units on non-cancelled orders", "55"),
            F("gross_gmv_ex_vat_egp", "num", "EGP", "Y", "units_sold x list price, ex VAT", "6820.00"),
            F("discount_value_ex_vat_egp", "num", "EGP", "Y", "All discounts given to the customer (promo, deal, coupon), ex VAT", "682.00"),
            F("net_gmv_ex_vat_egp", "num", "EGP", "Y", "gross minus discount. The headline sales number", "6138.00"),
            F("vendor_funded_discount_ex_vat_egp", "num", "EGP", "Y", "Part of the discount paid by the brand, ex VAT", "341.00"),
            F("cancelled_units_oos", "int", "units", "Y", "Units on orders cancelled because stock ran out", "3"),
            F("cancelled_units_other", "int", "units", "Y", "Units on orders cancelled for other reasons (customer, undeliverable)", "1"),
            F("returned_units", "int", "units", "Y", "Units returned by customers, booked on the sale date", "0"),
        ]),
    "INVENTORY": dict(
        num="02", title="Inventory", grain="day x platform SKU x node", freq="Daily",
        sheets=["Data"], key=["date", "platform_sku_id", "node_id"],
        unlocks="Replenishment, Must-stock, Ads (spend on out-of-stock SKUs)",
        delivery="By 08:00 Cairo time, end-of-day snapshot of the previous day",
        tier="Tier 1 (must have)",
        cols=[
            F("date", "date", "", "Y", "Snapshot day (end of day), Cairo time", "2026-09-14"),
            F("platform_sku_id", "text", "", "Y", "Platform's own product ID", "B0XXXXXXXX"),
            F("gtin", "text", "", "Y", "13-digit barcode", "6229000000013"),
            F("node_id", "text", "", "Y", "Warehouse, fulfilment centre or dark-store cluster. Must exist in Brand Master > Nodes", "TLB-GIZ"),
            F("listing_status", "text", "", "Y", "Status of the listing at the node", "ACTIVE", "ACTIVE|SUPPRESSED|DELISTED"),
            F("on_hand_units_sellable", "int", "units", "Y", "Sellable units at end of day", "540"),
            F("in_transit_units", "int", "units", "Y", "Units on inbound shipments arriving within 3 days", "0"),
            F("open_po_units", "int", "units", "Y", "Units on confirmed purchase orders not yet received (includes in transit)", "600"),
            F("next_po_eta_date", "date", "", "N", "Earliest expected arrival of an open PO", "2026-10-24"),
            F("unhealthy_units", "int", "units", "Y", "Unsellable, damaged or within 90 days of expiry", "6"),
            F("oos_hours", "num", "hours", "Y", "Hours the SKU could not be bought during operating hours (no sellable stock, or listing suppressed)", "0"),
            F("operating_hours", "num", "hours", "Y", "Hours the node sells that day", "18"),
            F("in_stock_rate_pct", "pct", "fraction", "Y", "1 - oos_hours / operating_hours, stored as 0 to 1", "1.0"),
            F("unfilled_demand_units", "int", "units", "Y", "Platform estimate of units demanded but not fillable because of stock", "0"),
        ]),
    "PRICE_PROMO": dict(
        num="03", title="Price and Promo", grain="day x platform SKU", freq="Daily",
        sheets=["Data"], key=["date", "platform_sku_id"],
        unlocks="Promo and Discount, Overview (price index)",
        delivery="By 08:00 Cairo time, prices that applied on the previous day",
        tier="Tier 2 (should have)",
        cols=[
            F("date", "date", "", "Y", "Calendar day, Cairo time", "2026-09-14"),
            F("platform_sku_id", "text", "", "Y", "Platform's own product ID", "B0XXXXXXXX"),
            F("gtin", "text", "", "Y", "13-digit barcode", "6229000000013"),
            F("list_price_ex_vat_egp", "num", "EGP", "Y", "Regular shelf price before any promotion, ex VAT", "124.00"),
            F("selling_price_ex_vat_egp", "num", "EGP", "Y", "Price the customer paid on the day, ex VAT", "105.40"),
            F("discount_depth_pct", "pct", "fraction", "Y", "1 - selling / list, stored as 0 to 1", "0.15"),
            F("promo_id", "text", "", "N", "Platform promotion ID. Blank if none", "NOON-D02"),
            F("promo_name", "text", "", "N", "Promotion or event name. Blank if none", "Back To School Sale"),
            F("promo_type", "text", "", "Y", "Mechanic", "DEAL_EVENT", "NONE|PRICE_OFF|BUNDLE|COUPON|DEAL_EVENT|LIGHTNING_DEAL"),
            F("funding", "text", "", "Y", "Who pays for the discount", "SHARED", "NONE|VENDOR|PLATFORM|SHARED"),
            F("vendor_funding_share_pct", "pct", "fraction", "Y", "Brand's share of the discount, stored as 0 to 1", "0.5"),
            F("promo_start_date", "date", "", "N", "First day of the promotion", "2026-08-24"),
            F("promo_end_date", "date", "", "N", "Last day of the promotion", "2026-09-06"),
            F("featured_placement", "text", "", "Y", "Featured on a deal page, banner or homepage", "Y", "Y|N"),
        ]),
    "ADS": dict(
        num="04", title="Ads", grain="day x campaign x advertised SKU", freq="Daily",
        sheets=["Data"], key=["date", "campaign_id", "platform_sku_id"],
        unlocks="Ads Budget Allocation, Overview",
        delivery="By 08:00 Cairo time, previous day. Attribution restated at 7 days",
        tier="Tier 2 (should have)",
        cols=[
            F("date", "date", "", "Y", "Calendar day, Cairo time", "2026-09-14"),
            F("campaign_id", "text", "", "Y", "Platform campaign ID", "NOON-C02"),
            F("campaign_name", "text", "", "Y", "Campaign name as shown in the ads console", "SP | Generic Baby Wipes"),
            F("ad_type", "text", "", "Y", "Ad format", "Search", "Search|Display|Banner|Sponsored Brands"),
            F("objective", "text", "", "Y", "Campaign intent", "Conquest", "Defend|Conquest|Awareness|Retarget"),
            F("platform_sku_id", "text", "", "Y", "Advertised product ID", "B0XXXXXXXX"),
            F("gtin", "text", "", "Y", "13-digit barcode", "6229000000013"),
            F("impressions", "int", "count", "Y", "Ad impressions", "18000"),
            F("clicks", "int", "count", "Y", "Ad clicks", "310"),
            F("ad_spend_ex_vat_egp", "num", "EGP", "Y", "Media cost, ex VAT", "620.00"),
            F("attributed_orders_7d", "int", "count", "Y", "Orders attributed within 7 days of click", "24"),
            F("attributed_units_7d", "int", "units", "Y", "Units attributed within 7 days of click", "29"),
            F("attributed_sales_7d_ex_vat_egp", "num", "EGP", "Y", "Sales attributed within 7 days of click, ex VAT", "1054.00"),
            F("daily_budget_egp", "num", "EGP", "Y", "Campaign daily budget (repeated on each row of the campaign)", "800.00"),
            F("impression_share_lost_budget_pct", "pct", "fraction", "Y", "Share of eligible impressions lost because budget ran out, 0 to 1", "0.05"),
        ]),
    "MARKET": dict(
        num="05", title="Market", grain="week x category and week x SKU", freq="Weekly",
        sheets=["Data_Category", "Data_SKUs"], key=["week_start", "platform_sku_id"],
        unlocks="Overview (share), Must-stock",
        delivery="Monday 12:00 Cairo time for the previous Monday to Sunday week",
        tier="Tier 3 (nice to have, hardest ask)",
        key_category=["week_start", "category", "sub_category"],
        cols_category=[
            F("week_start", "date", "", "Y", "Monday of the week", "2026-09-07"),
            F("category", "text", "", "Y", "Category", "Wipes", "Wipes|Skin Care"),
            F("sub_category", "text", "", "Y", "Sub-category", "Baby", "Baby|Fresh|Antibacterial|Shampoo|Rash cream|Lotion"),
            F("category_gmv_ex_vat_egp", "num", "EGP", "Y", "Total sales value of the sub-category on the platform, all brands, ex VAT", "1250000.00"),
            F("category_units", "int", "units", "Y", "Total units of the sub-category on the platform, all brands", "10400"),
            F("active_brands", "int", "count", "N", "Brands with sales in the week", "9"),
            F("active_skus", "int", "count", "N", "SKUs with sales in the week", "52"),
        ],
        cols=[
            F("week_start", "date", "", "Y", "Monday of the week", "2026-09-07"),
            F("category", "text", "", "Y", "Category", "Wipes", "Wipes|Skin Care"),
            F("sub_category", "text", "", "Y", "Sub-category", "Baby", "Baby|Fresh|Antibacterial|Shampoo|Rash cream|Lotion"),
            F("brand", "text", "", "Y", "Brand name", "Nuvo Baby"),
            F("product_name", "text", "", "Y", "Product title as listed", "Nuvo Baby Pure Water Wipes 2x64"),
            F("platform_sku_id", "text", "", "Y", "Platform product ID", "B0XXXXXXXX"),
            F("gtin", "text", "", "Y", "13-digit barcode", "6221000000019"),
            F("is_own_brand", "text", "", "Y", "Y if the brand is the sharing brand", "N", "Y|N"),
            F("units", "int", "units", "Y", "Units sold in the week", "820"),
            F("gmv_ex_vat_egp", "num", "EGP", "Y", "Net sales value in the week, ex VAT", "96760.00"),
            F("avg_price_ex_vat_egp", "num", "EGP", "Y", "gmv / units", "118.00"),
            F("rank_by_value", "int", "rank", "Y", "Rank within the category by value (1 = best)", "1"),
            F("in_stock_rate_pct", "pct", "fraction", "Y", "Average in-stock rate in the week, 0 to 1", "0.98"),
            F("share_of_search_pct", "pct", "fraction", "N", "Share of first-page search impressions for the category keywords, 0 to 1", "0.06"),
            F("avg_rating", "num", "stars", "N", "Average customer rating", "4.4"),
            F("review_count", "int", "count", "N", "Total reviews to date", "1280"),
        ]),
    "SERVICE": dict(
        num="06", title="Service", grain="week x platform SKU", freq="Weekly",
        sheets=["Data"], key=["week_start", "platform_sku_id"],
        unlocks="Replenishment (lead time, PO confirmation, lost orders)",
        delivery="Monday 12:00 Cairo time for the previous Monday to Sunday week",
        tier="Tier 1 (must have)",
        cols=[
            F("week_start", "date", "", "Y", "Monday of the week", "2026-09-07"),
            F("platform_sku_id", "text", "", "Y", "Platform product ID", "B0XXXXXXXX"),
            F("gtin", "text", "", "Y", "13-digit barcode", "6229000000013"),
            F("customer_orders", "int", "count", "Y", "Customer orders containing the SKU (non-cancelled)", "310"),
            F("fully_filled_orders_pct", "pct", "fraction", "Y", "Share of placed orders delivered complete, 0 to 1", "0.96"),
            F("lost_orders_oos", "int", "count", "Y", "Orders cancelled because of stock", "9"),
            F("lost_orders_other", "int", "count", "Y", "Orders cancelled for other reasons", "7"),
            F("return_rate_pct", "pct", "fraction", "Y", "Returned units / units sold, 0 to 1", "0.01"),
            F("po_units_requested", "int", "units", "Y", "Units on purchase orders raised in the week", "1200"),
            F("po_units_confirmed", "int", "units", "Y", "Units the platform confirmed on those POs", "1100"),
            F("po_units_received", "int", "units", "Y", "Units received into the platform in the week", "1000"),
            F("avg_lead_time_days", "num", "days", "N", "Average PO placement to receipt, for POs received in the week. Blank if none", "5.2"),
            F("on_time_receipt_pct", "pct", "fraction", "N", "Share of POs received within planned lead time + 1 day, 0 to 1. Blank if none", "0.9"),
        ]),
}

FEED_ORDER = ["SALES", "INVENTORY", "PRICE_PROMO", "ADS", "MARKET", "SERVICE"]

SETUP_SHEETS = {
    "SKU_Master": dict(key=["sku_code"], cols=[
        F("sku_code", "text", "", "Y", "Brand's internal SKU code", "SBC-W02"),
        F("product_name", "text", "", "Y", "Product name", "Sprout Water Wipes Baby 2x60 Wipes"),
        F("brand", "text", "", "Y", "Brand", "Sprout Baby Care"),
        F("category", "text", "", "Y", "Category", "Wipes", "Wipes|Skin Care"),
        F("sub_category", "text", "", "Y", "Sub-category", "Baby", "Baby|Fresh|Antibacterial|Shampoo|Rash cream|Lotion"),
        F("pack_size", "text", "", "Y", "Pack description", "2x60"),
        F("gtin", "text", "", "Y", "13-digit barcode", "6229000000013"),
        F("list_price_ex_vat_egp", "num", "EGP", "Y", "Current regular shelf price, ex VAT", "124.00"),
        F("unit_cogs_ex_vat_egp", "num", "EGP", "Y", "Landed cost per unit, ex VAT", "62.00"),
        F("shelf_life_months", "int", "months", "Y", "Shelf life at production", "36"),
        F("case_pack_units", "int", "units", "Y", "Units per case (PO quantities round to this)", "12"),
        F("status", "text", "", "Y", "Lifecycle status", "ACTIVE", "ACTIVE|PHASING_OUT"),
    ]),
    "Platform_Listings": dict(key=["platform", "sku_code"], cols=[
        F("platform", "text", "", "Y", "Platform name", "Noon", "Talabat Mart|Noon|Amazon"),
        F("sku_code", "text", "", "Y", "Brand SKU code", "SBC-W02"),
        F("platform_sku_id", "text", "", "Y", "Platform's product ID", "N12345678A"),
        F("gtin", "text", "", "Y", "Barcode on the platform listing", "6229000000013"),
        F("platform_title", "text", "", "Y", "Listing title on the platform", "Sprout Water Wipes Baby 2x60"),
        F("listed_since", "date", "", "Y", "Date the listing went live", "2025-03-01"),
    ]),
    "Nodes": dict(key=["platform", "node_id"], cols=[
        F("platform", "text", "", "Y", "Platform name", "Talabat Mart"),
        F("node_id", "text", "", "Y", "Node ID used in the Inventory feed", "TLB-GIZ"),
        F("node_name", "text", "", "Y", "Readable name", "Giza dark stores"),
        F("node_type", "text", "", "Y", "Node type", "Dark store cluster", "Dark store cluster|Fulfilment centre"),
        F("operating_hours", "num", "hours", "Y", "Daily selling hours", "18"),
    ]),
    "Region_Node_Map": dict(key=["platform", "region", "node_id"], cols=[
        F("platform", "text", "", "Y", "Platform name", "Noon"),
        F("region", "text", "", "Y", "Customer region", "Delta"),
        F("node_id", "text", "", "Y", "Node that serves the region", "NOON-ALX-FC"),
        F("share_pct", "pct", "fraction", "Y", "Share of the region's orders served by the node, 0 to 1", "0.6"),
    ]),
    "Replenishment_Params": dict(key=["platform", "sku_code"], cols=[
        F("platform", "text", "", "Y", "Platform name", "Noon"),
        F("sku_code", "text", "", "Y", "Brand SKU code", "SBC-W02"),
        F("planned_lead_time_days", "int", "days", "Y", "Planned days from PO to receipt", "6"),
        F("review_cycle_days", "int", "days", "Y", "Days between PO reviews", "7"),
        F("safety_stock_days", "int", "days", "Y", "Safety cover held on top of lead time and review cycle", "7"),
        F("target_cover_days", "int", "days", "Y", "Cover the brand aims to hold", "21"),
        F("max_cover_days", "int", "days", "Y", "Above this cover the SKU is flagged as overstock", "60"),
        F("moq_units_per_node", "int", "units", "Y", "Minimum PO quantity per node", "240"),
    ]),
    "Platform_Terms": dict(key=["platform"], cols=[
        F("platform", "text", "", "Y", "Platform name", "Noon"),
        F("channel_type", "text", "", "Y", "Channel type", "Marketplace", "Quick commerce|Marketplace|Vendor central"),
        F("platform_margin_pct", "pct", "fraction", "Y", "Platform's trade margin on net sales ex VAT, 0 to 1", "0.25"),
        F("payment_terms_days", "int", "days", "Y", "Days to payment", "45"),
        F("vat_rate", "pct", "fraction", "Y", "VAT rate (reference only, all feeds are ex VAT)", "0.14"),
        F("target_in_stock_rate_pct", "pct", "fraction", "Y", "Availability target, 0 to 1", "0.97"),
        F("monthly_sales_target_egp", "num", "EGP", "Y", "Monthly net sales target, ex VAT", "600000"),
        F("monthly_ad_budget_egp", "num", "EGP", "Y", "Approved monthly ad budget, ex VAT", "54000"),
        F("target_roas", "num", "x", "Y", "Minimum acceptable return on ad spend (attributed sales / spend)", "4.0"),
        F("min_vendor_margin_pct", "pct", "fraction", "Y", "Floor for the brand's margin after discount, 0 to 1", "0.10"),
    ]),
    "Competitor_Brands": dict(key=["brand"], cols=[
        F("brand", "text", "", "Y", "Competitor brand", "Nuvo Baby"),
        F("tier", "text", "", "Y", "Position", "Leader", "Leader|Challenger|Niche"),
        F("focus", "text", "", "Y", "Where it competes", "Baby water wipes"),
    ]),
}

VALIDATION_RULES = [
    ("V01", "Blocking", "All", "Meta sheet template_id and platform match the upload slot", "A Noon Sales file dropped in the Talabat Inventory slot is rejected with a clear message"),
    ("V02", "Blocking", "All", "All required columns are present with the exact header names", "Extra columns are ignored with a warning"),
    ("V03", "Blocking", "All", "Types and ranges: no negatives; pct fields between 0 and 1; dates parse", ""),
    ("V04", "Blocking", "All", "Key uniqueness per feed (see Upload_Map key column)", "Duplicate keys inside one file are rejected"),
    ("V05", "Blocking", "All", "All dates fall inside the period declared on the Meta sheet", ""),
    ("V06", "Warning", "All", "platform_sku_id exists in Brand Master > Platform_Listings", "Unknown IDs go to the SKU mapping queue instead of being dropped"),
    ("V07", "Warning", "All", "gtin on the row matches the gtin in Platform_Listings for that ID", ""),
    ("V08", "Blocking", "Sales", "net_gmv = gross_gmv - discount_value (tolerance EGP 0.05)", ""),
    ("V09", "Warning", "Sales", "Every active SKU-region has a row for every day in the period", "Gaps are reported by SKU and date"),
    ("V10", "Warning", "Inventory", "in_stock_rate = 1 - oos_hours / operating_hours (tolerance 0.01)", ""),
    ("V11", "Warning", "Inventory", "node_id exists in Brand Master > Nodes", ""),
    ("V12", "Blocking", "Price and Promo", "discount_depth = 1 - selling / list (tolerance 0.005)", ""),
    ("V13", "Warning", "Ads", "attributed sales do not exceed 100% of the SKU's net sales that day on the same platform", "Catches mis-scaled uploads"),
    ("V14", "Warning", "Market", "Own-brand rows reconcile to the Sales feed within 2% per week", "Tells the platform data and the sales feed use the same definitions"),
    ("V15", "Warning", "Service", "fully_filled_orders_pct consistent with lost orders and customer orders (tolerance 0.02)", ""),
]
