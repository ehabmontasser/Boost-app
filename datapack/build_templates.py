"""Writes blank upload templates (no data) for the account manager: the Brand Master plus
six feeds per platform, each with a "How to use" tab first. Built from spec.py, the same
standard the app validates against. Run: python build_templates.py"""
import os
import shutil
import zipfile

import xlsxwriter

import spec

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
OUT = os.path.join(ROOT, "BOOST_Upload_Templates")
MENU = "Admin > Upload center"
DATA_ROWS = 50000  # rows that get number formats and drop-down lists

NUM_FMT = {"date": "yyyy-mm-dd", "pct": "0.00", "num": "#,##0.00", "int": "#,##0", "text": "@"}

# Brand Master columns in the standard that the app does not store (it warns and ignores them).
SETUP_SKIP_COLS = {"SKU_Master": ["brand"], "Platform_Terms": ["parent_platform"]}
# Brand Master tabs the app ignores.
SETUP_SKIP_SHEETS = ["Shelf_Capacity"]

# Feed-specific checks the app runs today (lib/validate.ts).
FEED_CHECKS = {
    "SALES": ["Rejected if net_gmv is not gross_gmv minus discount_value (within EGP 0.05)."],
    "INVENTORY": ["Warning if in_stock_rate_pct is not 1 - oos_hours / operating_hours (within 0.01)."],
    "PRICE_PROMO": ["Rejected if discount_depth_pct is not 1 - selling price / list price (within 0.005)."],
    "ADS": [],
    "MARKET": [],
    "SERVICE": [],
}

# Rules in the standard that the app does not check automatically: the account manager checks them.
SELF_CHECKS = {
    "SALES": ["Every active SKU and region has a row for every day of the period (a missing day reads as zero sales).",
              "gtin on each row matches the barcode in the Brand Master."],
    "INVENTORY": ["Every node_id exists in the Brand Master Nodes tab.",
                  "gtin on each row matches the barcode in the Brand Master."],
    "PRICE_PROMO": ["gtin on each row matches the barcode in the Brand Master."],
    "ADS": ["Attributed sales for a SKU on a day are not above its net sales that day in the Sales file (a sign of a scaling error)."],
    "MARKET": ["Sprout's own rows (is_own_brand = Y) are within about 2% of the Sales file for the same week."],
    "SERVICE": ["fully_filled_orders_pct is consistent with customer_orders and the lost orders columns."],
}

UPLOAD_CADENCE = {
    "SALES": "Every Monday: one file for the previous Monday to Sunday (7 days of daily rows).",
    "INVENTORY": "Every Monday: one file for the previous Monday to Sunday (7 daily end-of-day snapshots).",
    "PRICE_PROMO": "Every Monday: one file for the previous Monday to Sunday (7 days of daily rows).",
    "ADS": ("Every Monday: one file for the previous 14 days. Platforms keep updating 7-day attributed sales "
            "for about a week, so re-sending the earlier week replaces those rows with the final numbers."),
    "MARKET": "Every Monday afternoon: one file for the previous week (one week_start = that Monday).",
    "SERVICE": "Every Monday afternoon: one file for the previous week (one week_start = that Monday).",
}


def formats(wb):
    return dict(
        title=wb.add_format({"bold": True, "font_size": 16, "font_color": "#101923"}),
        h2=wb.add_format({"bold": True, "font_size": 12, "font_color": "#2354E8", "top": 1, "top_color": "#DDE2E7"}),
        text=wb.add_format({"text_wrap": True, "valign": "top"}),
        bold=wb.add_format({"bold": True, "text_wrap": True, "valign": "top"}),
        warn=wb.add_format({"text_wrap": True, "valign": "top", "font_color": "#B3261E", "bold": True}),
        hdr=wb.add_format({"bold": True, "bg_color": "#101923", "font_color": "#FFFFFF", "valign": "vcenter"}),
        hdr_opt=wb.add_format({"bold": True, "bg_color": "#8A94A0", "font_color": "#FFFFFF", "valign": "vcenter"}),
        key=wb.add_format({"bold": True}),
        fill=wb.add_format({"bg_color": "#FFF4C2", "num_format": "@", "border": 1, "border_color": "#A85A00"}),
        locked=wb.add_format({"font_color": "#5B6670"}),
        note=wb.add_format({"italic": True, "font_color": "#5B6670", "text_wrap": True}),
        wrap=wb.add_format({"text_wrap": True, "valign": "top"}),
        cols={k: wb.add_format({"num_format": v}) for k, v in NUM_FMT.items()},
    )


def write_how_to(ws, f, title, sections):
    """sections: list of (heading, [lines]). A line starting with '!' is shown as a warning."""
    ws.set_column(0, 0, 4)
    ws.set_column(1, 1, 120)
    ws.hide_gridlines(2)
    ws.write(0, 1, title, f["title"])
    r = 2
    for heading, lines in sections:
        ws.write(r, 1, heading, f["h2"]); r += 1
        for i, line in enumerate(lines, 1):
            fmt = f["text"]
            if line.startswith("!"):
                line, fmt = line[1:], f["warn"]
            if line.startswith("#"):
                ws.write(r, 0, str(i), f["key"]); line = line[1:]
            ws.write(r, 1, line, fmt)
            ws.set_row(r, 15 * max(1, len(line) // 115 + 1))
            r += 1
        r += 1
    ws.activate()


def write_meta(ws, f, rows):
    """rows: list of (key, value, note). value None = the account manager fills it in."""
    ws.set_column(0, 0, 22); ws.set_column(1, 1, 30); ws.set_column(2, 2, 80)
    ws.write(0, 0, "key", f["hdr"]); ws.write(0, 1, "value", f["hdr"]); ws.write(0, 2, "note", f["hdr"])
    for i, (k, v, note) in enumerate(rows, 1):
        ws.write(i, 0, k, f["key"])
        if v is None:
            ws.write_blank(i, 1, None, f["fill"])
        else:
            ws.write_string(i, 1, str(v), f["locked"])
        ws.write(i, 2, note, f["note"])
    ws.freeze_panes(1, 0)


def write_data(ws, f, cols):
    for i, c in enumerate(cols):
        ws.write(0, i, c["name"], f["hdr"] if c["required"] == "Y" else f["hdr_opt"])
        ws.set_column(i, i, max(12, min(40, len(c["name"]) + 3)), f["cols"].get(c["dtype"]))
        if c["allowed"]:
            ws.data_validation(1, i, DATA_ROWS, i, {
                "validate": "list", "source": c["allowed"].split("|"),
                "error_title": "Value not allowed", "error_message": f"Use one of: {c['allowed'].replace('|', ', ')}"})
        if c["dtype"] == "pct":
            ws.data_validation(1, i, DATA_ROWS, i, {
                "validate": "decimal", "criteria": "between", "minimum": 0, "maximum": 1,
                "error_title": "Use a fraction", "error_message": "Percent fields are fractions from 0 to 1 (0.15 = 15%)."})
    ws.set_row(0, 22)
    ws.freeze_panes(1, 0)


def write_guide(ws, f, title, guide_rows):
    ws.write(0, 0, title, f["title"])
    heads = ["Tab", "Column", "Type", "Unit", "Required", "Description", "Example", "Allowed values"]
    for j, h in enumerate(heads):
        ws.write(2, j, h, f["hdr"])
    for i, row in enumerate(guide_rows, 3):
        for j, v in enumerate(row):
            ws.write(i, j, v, f["wrap"])
    for j, w in enumerate([16, 34, 8, 9, 9, 70, 22, 46]):
        ws.set_column(j, j, w)
    ws.freeze_panes(3, 0)


def guide_rows_for(sheet, cols):
    return [(sheet, c["name"], c["dtype"], c["unit"], "Yes" if c["required"] == "Y" else "No",
             c["desc"], c["example"], c["allowed"].replace("|", ", ")) for c in cols]


def common_rules(where):
    return [
        f"#Paste or type rows into {where}, starting on row 2. Keep row 1 (the column headers) exactly as it is: "
        "do not rename, reorder or delete columns, and do not add title rows above the headers.",
        "#Dark headers are required columns. Grey headers are optional: leave the cell empty if the platform does not give it.",
        "#Dates as yyyy-mm-dd (for example 2026-10-19). Money in EGP excluding VAT, no currency symbols.",
        "#Percent columns are fractions from 0 to 1: write 0.15 for 15%, not 15.",
        "#Columns with a fixed list (region, status, promo type and so on) have a drop-down. Use those exact spellings.",
        "#One row per key (see the Meta tab, key_columns). The same key twice in one file is rejected.",
        "#No negative numbers. Product IDs and barcodes (gtin) are text: keep leading zeros.",
    ]


def feed_file(platform, code, feed):
    fd = spec.FEEDS[feed]
    tmpl = f"BOOST-{feed}-{spec.TEMPLATE_VERSION}"
    path = os.path.join(OUT, spec.PLATFORM_FOLDERS[platform][1], f"{code}_{fd['num']}_{feed}_TEMPLATE.xlsx")
    data_tabs = ["Data_Category", "Data_SKUs"] if feed == "MARKET" else ["Data"]
    tabs_txt = " and ".join(data_tabs)
    period_word = "week_start" if fd["freq"] == "Weekly" else "date"
    wb = xlsxwriter.Workbook(path)
    f = formats(wb)

    how = wb.add_worksheet("How to use")
    sections = [
        ("What this file is", [
            f"The {fd['title']} feed for {platform}. Template {tmpl}.",
            f"Priority: {fd['tier']}.",
            f"One row per {fd['grain']}.",
            f"It feeds these BOOST screens: {fd['unlocks']}.",
        ]),
        ("Cadence", [
            f"Rows in the file: {fd['freq'].lower()} ({'one row per day' if fd['freq'] == 'Daily' else 'one row per Monday-to-Sunday week'}).",
            f"When the platform should send it: {fd['delivery']}.",
            f"When to upload to BOOST: {UPLOAD_CADENCE[feed]}",
            "First time only: upload a backfill file covering as much history as the platform can give "
            "(ideally 13 weeks), so trends and the 14-day averages have enough data.",
        ]),
        ("Where the data comes from", [
            f"Ask the {platform} account team for this report, or export it from the {platform} seller or vendor portal.",
            "The platform's export will use its own column names. Match each one to the BOOST column with the same meaning, "
            "using the Guide tab (descriptions and examples for every column).",
            "If the platform cannot provide an optional column, leave it empty. If it cannot provide a required column, "
            "tell the BOOST admin before uploading.",
        ]),
        ("Step by step", [
            f"#Save a copy of this template. Suggested name: {code}_{fd['num']}_{feed}_yyyymmdd_yyyymmdd.xlsx "
            "(first and last day of the period).",
            "#Meta tab: fill in the two yellow cells, period_start and period_end, as yyyy-mm-dd. "
            "Do not change any other cell on the Meta tab.",
            f"#{tabs_txt} tab: paste the rows for that period. Every {period_word} must fall inside the period you entered.",
            f"#Brand Master first: BOOST only accepts platform files after the Brand Master (SETUP_00_BRAND_MASTER) has been uploaded once.",
            f"#Upload: sign in to BOOST as admin, open {MENU}, click Choose files and select this file "
            "(you can select several files at once). The file is routed by its Meta tab.",
            "#Read the result line for the file: Imported, Imported with warnings, or Rejected with the reason and row number.",
            "#Open Data freshness and check this platform and feed now shows the new end date.",
            "#Made a mistake? Fix the file and upload it again. Rows with the same key are replaced, so repeats are safe.",
        ]),
        ("Format rules", common_rules(f"the {tabs_txt} tab{'s' if len(data_tabs) > 1 else ''}")),
        ("Checks BOOST runs on upload", [
            "Rejected (nothing is loaded): wrong template or platform on the Meta tab, missing or renamed columns, "
            "wrong types or values outside the allowed list, percent above 1, negative numbers, duplicate keys, "
            "dates outside the Meta period.",
            f"Also rejected: any file before the Brand Master is uploaded, or when the Brand Master has no "
            f"Platform_Listings rows for {platform}.",
            "Warning (the file loads, but check it): a platform_sku_id that is not in the Brand Master. The rows are "
            "loaded and the ID is listed in the SKU mapping queue. Expected for competitor products in the Market file; "
            "for Sprout products, add the listing to the Brand Master and upload it again.",
        ] + FEED_CHECKS[feed]),
        ("Check yourself before uploading (BOOST does not check these)", SELF_CHECKS[feed]),
        ("Do not", [
            "!Do not rename the tabs (How to use, Meta, " + ", ".join(data_tabs) + ", Guide) or change the template_id or platform on the Meta tab.",
            "!Do not mix platforms in one file, or put two feeds in one file.",
        ]),
    ]
    write_how_to(how, f, f"How to use this file: {fd['title']} feed for {platform}", sections)

    write_meta(wb.add_worksheet("Meta"), f, [
        ("template_id", tmpl, "Do not change. Tells BOOST which feed this is."),
        ("template_version", spec.TEMPLATE_VERSION, "Do not change."),
        ("feed", feed, "Do not change."),
        ("platform", platform, "Do not change. Must match the platform the rows come from."),
        ("brand", spec.BRAND, "Do not change."),
        ("period_start", None, "FILL IN: first day of the data in this file, yyyy-mm-dd" +
         (" (a Monday)" if fd["freq"] == "Weekly" else "")),
        ("period_end", None, "FILL IN: last day of the data in this file, yyyy-mm-dd" +
         (" (a Sunday)" if fd["freq"] == "Weekly" else "")),
        ("grain", fd["grain"], "For information."),
        ("frequency", fd["freq"], "For information."),
        ("key_columns", ", ".join(fd["key"]), "For information: one row per combination of these columns."),
        ("currency", "EGP", "For information."),
        ("vat_basis", "ex VAT", "For information: all money columns exclude VAT."),
    ])

    guide = []
    if feed == "MARKET":
        write_data(wb.add_worksheet("Data_Category"), f, fd["cols_category"])
        write_data(wb.add_worksheet("Data_SKUs"), f, fd["cols"])
        guide = guide_rows_for("Data_Category", fd["cols_category"]) + guide_rows_for("Data_SKUs", fd["cols"])
    else:
        write_data(wb.add_worksheet("Data"), f, fd["cols"])
        guide = guide_rows_for("Data", fd["cols"])
    write_guide(wb.add_worksheet("Guide"), f, f"Column guide: {fd['title']} feed", guide)
    wb.close()
    return path


def setup_file():
    path = os.path.join(OUT, "00_Brand_Master", "SETUP_00_BRAND_MASTER_TEMPLATE.xlsx")
    platforms = "|".join(spec.PLATFORM_FOLDERS)
    sheets = {n: [dict(c, allowed=c["allowed"] or (platforms if c["name"] == "platform" else ""))
                  for c in d["cols"] if c["name"] not in SETUP_SKIP_COLS.get(n, [])]
              for n, d in spec.SETUP_SHEETS.items() if n not in SETUP_SKIP_SHEETS}
    wb = xlsxwriter.Workbook(path)
    f = formats(wb)
    how = wb.add_worksheet("How to use")
    tab_lines = {
        "SKU_Master": "every Sprout product: code, barcode (gtin), category, list price, cost, case pack.",
        "Platform_Listings": "each product's ID on each platform (Mart item ID, Noon SKU, ASIN). This is how platform files are matched to products.",
        "Nodes": "each platform's warehouses, fulfilment centres and dark-store clusters, with daily selling hours.",
        "Region_Node_Map": "which node serves which customer region, and the share of orders it serves.",
        "Replenishment_Params": "lead time, review cycle, safety stock, target and maximum cover per platform and product.",
        "Platform_Terms": "trade margin, payment terms, availability target, sales target, ad budget and target ROAS per platform.",
        "Competitor_Brands": "the competitor brands to track in the Market feed.",
    }
    sections = [
        ("What this file is", [
            "The Brand Master: the reference lists every other BOOST file is matched against. Template BOOST-SETUP-v1.0.",
            "It has one tab per list:",
        ] + [f"#{n}: {t}" for n, t in tab_lines.items()]),
        ("Cadence", [
            "Upload once, before any platform file. BOOST rejects platform files until a Brand Master exists.",
            "Upload again whenever something in it changes: a new product or listing, a price or cost change, a new node, "
            "or new targets and budgets (typically monthly, when targets are set).",
        ]),
        ("Where the data comes from", [
            "Mostly from the brand's own records: product master, price list and costs (finance), targets and ad budgets "
            "(commercial plan), replenishment settings (supply planning).",
            "Platform IDs, nodes and the region map come from each platform's account team or seller portal.",
        ]),
        ("Step by step", [
            "#Save a copy of this template. Suggested name: SETUP_00_BRAND_MASTER_yyyymmdd.xlsx.",
            "#Fill in every tab, starting on row 2. Keep row 1 (the headers) exactly as it is.",
            "#Use the same sku_code everywhere. Every sku_code in Platform_Listings and Replenishment_Params must exist in SKU_Master.",
            "#Platform names must be exactly: Talabat Mart, Noon, Amazon Core, Amazon Now, Breadfast (drop-down provided).",
            "#Every node_id in Region_Node_Map must exist in Nodes. The Inventory files must use the same node_id values.",
            f"#Upload: sign in to BOOST as admin, open {MENU}, click Choose files and select this file.",
            "#Check the result line: Imported, or Rejected with the reason and row number.",
            "#Re-uploading updates rows with the same key. It does not delete rows you leave out of the file.",
        ]),
        ("Format rules", common_rules("each tab")[:-2] + [
            "#One row per key: SKU_Master by sku_code, Platform_Listings and Replenishment_Params by platform + sku_code, "
            "Nodes by platform + node_id, Region_Node_Map by platform + region + node_id, Platform_Terms by platform, "
            "Competitor_Brands by brand.",
            "#No negative numbers. Product IDs and barcodes (gtin) are text: keep leading zeros.",
        ]),
        ("Do not", [
            "!Do not rename the tabs or change the template_id on the Meta tab.",
        ]),
    ]
    write_how_to(how, f, "How to use this file: Brand Master", sections)
    write_meta(wb.add_worksheet("Meta"), f, [
        ("template_id", "BOOST-SETUP-v1.0", "Do not change. Tells BOOST this is the Brand Master."),
        ("template_version", spec.TEMPLATE_VERSION, "Do not change."),
        ("brand", spec.BRAND, "Do not change."),
        ("sheets", ", ".join(sheets), "For information."),
    ])
    guide = []
    for name, cols in sheets.items():
        write_data(wb.add_worksheet(name), f, cols)
        guide += guide_rows_for(name, cols)
    write_guide(wb.add_worksheet("Guide"), f, "Column guide: Brand Master", guide)
    wb.close()
    return path


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "00_Brand_Master"))
    for _, folder in spec.PLATFORM_FOLDERS.values():
        os.makedirs(os.path.join(OUT, folder))
    paths = [setup_file()]
    for platform, (code, _) in spec.PLATFORM_FOLDERS.items():
        for feed in spec.FEED_ORDER:
            paths.append(feed_file(platform, code, feed))
    zpath = OUT + ".zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            z.write(p, os.path.relpath(p, ROOT))
    print(f"{len(paths)} templates in {OUT}")
    print(f"zip: {zpath}")


if __name__ == "__main__":
    main()
