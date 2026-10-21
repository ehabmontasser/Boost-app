"""Writes the Sprout Baby Care data pack: setup workbook, backfill + weekly update
files per platform and feed, and the upload guide. Run: python3 build_pack.py"""
import os
import shutil
import zipfile
from datetime import date, timedelta

import pandas as pd

import simulate as S
import spec

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
PACK = os.path.join(ROOT, "Sprout_Baby_Care_Data_Pack")
BACKFILL = "02_Backfill_2026-07-20_to_2026-10-11"
WEEKLY = "03_Weekly_Update_2026-10-12_to_2026-10-18"
SETUP_DIR = "01_Setup"
MENU = "Admin > Upload Center"
DATA_STATUS = "SYNTHETIC DEMO DATA. Not real sales."

NUM_FMT = {"date": "yyyy-mm-dd", "pct": "0.0%", "num": "#,##0.00", "int": "#,##0", "text": "@"}


def fmt_cols(df, cols):
    out = df[[c["name"] for c in cols]].copy()
    return out


def widths(cols):
    return {c["name"]: max(12, min(44, len(c["name"]) + 2)) for c in cols}


def write_workbook(path, sheets, meta, guide_rows, guide_title, guide_lines):
    """sheets: list of (sheet_name, df, cols). meta: list of (key, value)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with pd.ExcelWriter(path, engine="xlsxwriter",
                        engine_kwargs={"options": {"default_date_format": "yyyy-mm-dd"}},
                        date_format="yyyy-mm-dd", datetime_format="yyyy-mm-dd") as xw:
        wb = xw.book
        hdr = wb.add_format({"bold": True, "bg_color": "#0B2A3C", "font_color": "#FFFFFF", "border": 0,
                             "valign": "vcenter"})
        title = wb.add_format({"bold": True, "font_size": 14})
        bold = wb.add_format({"bold": True})
        wrap = wb.add_format({"text_wrap": True, "valign": "top"})
        fmts = {k: wb.add_format({"num_format": v}) for k, v in NUM_FMT.items()}
        for name, df, cols in sheets:
            df.to_excel(xw, sheet_name=name, index=False, header=False, startrow=1)
            ws = xw.sheets[name]
            for i, c in enumerate(cols):
                ws.write(0, i, c["name"], hdr)
                ws.set_column(i, i, widths(cols)[c["name"]], fmts.get(c["dtype"]))
            ws.freeze_panes(1, 0)
            ws.autofilter(0, 0, max(len(df), 1), len(cols) - 1)
            ws.set_row(0, 22)
        # Meta
        ws = wb.add_worksheet("Meta")
        ws.set_column(0, 0, 28); ws.set_column(1, 1, 70)
        ws.write(0, 0, "key", hdr); ws.write(0, 1, "value", hdr)
        for i, (k, v) in enumerate(meta, 1):
            ws.write(i, 0, k); ws.write(i, 1, str(v))
        # Guide
        ws = wb.add_worksheet("Guide")
        ws.write(0, 0, guide_title, title)
        r = 2
        for line in guide_lines:
            ws.write(r, 0, line); r += 1
        r += 1
        heads = ["Sheet", "Field", "Type", "Unit", "Required", "Description", "Example", "Allowed values"]
        for j, h in enumerate(heads):
            ws.write(r, j, h, hdr)
        for row in guide_rows:
            r += 1
            for j, v in enumerate(row):
                ws.write(r, j, v, wrap)
        for j, w in enumerate([16, 34, 8, 9, 9, 70, 22, 46]):
            ws.set_column(j, j, w)


def guide_rows_for(sheet, cols):
    return [(sheet, c["name"], c["dtype"], c["unit"], c["required"], c["desc"], c["example"], c["allowed"])
            for c in cols]


def meta_for(feed, platform, p0, p1, counts, tmpl_id):
    f = spec.FEEDS[feed]
    return [
        ("template_id", tmpl_id), ("template_version", spec.TEMPLATE_VERSION), ("feed", feed),
        ("platform", platform), ("brand", spec.BRAND), ("period_start", p0.isoformat()),
        ("period_end", p1.isoformat()), ("grain", f["grain"]), ("frequency", f["freq"]),
        ("key_columns", ", ".join(f["key"])), ("rows", counts), ("currency", "EGP"),
        ("vat_basis", "ex VAT"), ("generated_on", spec.GENERATED.isoformat()), ("data_status", DATA_STATUS),
    ]


def period_slice(df, col, p0, p1):
    m = (df[col] >= p0) & (df[col] <= p1)
    return df[m].reset_index(drop=True)


def main():
    if os.path.exists(PACK):
        shutil.rmtree(PACK)
    out = S.build()
    upload_map = []
    seq = 1

    # ---------------- Setup ---------------------------------------------------------------------
    setup = out["setup"]
    sheets = [(name, setup[name], spec.SETUP_SHEETS[name]["cols"]) for name in spec.SETUP_SHEETS]
    guide_rows = []
    for name, df, cols in sheets:
        guide_rows += guide_rows_for(name, cols)
    setup_file = "SETUP_00_BRAND_MASTER_v1.xlsx"
    meta = [("template_id", "BOOST-SETUP-v1.0"), ("template_version", spec.TEMPLATE_VERSION),
            ("brand", spec.BRAND), ("sheets", ", ".join(spec.SETUP_SHEETS)),
            ("rows", "; ".join(f"{n}={len(d)}" for n, d, _ in sheets)),
            ("generated_on", spec.GENERATED.isoformat()), ("data_status", DATA_STATUS)]
    write_workbook(os.path.join(PACK, SETUP_DIR, setup_file), sheets, meta, guide_rows,
                   "BOOST Brand Master (upload once, then only when something changes)",
                   ["One workbook, seven tabs. Upload it before any platform file.",
                    "Every platform file is matched to the brand through the barcode (gtin) and the platform_sku_id listed here.",
                    "Re-upload any time a price, cost, listing, node or target changes. Rows are replaced by key."])
    upload_map.append(dict(
        seq=seq, step="1. Setup (once)", period="n/a", platform="All", feed="Brand Master",
        file=setup_file, folder=f"{SETUP_DIR}/", slot=f"{MENU} > 00 Setup > Brand Master",
        frequency="Once, then on change", rows="; ".join(f"{n}={len(d)}" for n, d, _ in sheets),
        date_from="", date_to="", key="sheet-specific (see Field_Dictionary)",
        unlocks="Everything. Without it uploads cannot be matched to SKUs, nodes or targets"))
    seq += 1

    # ---------------- Feeds -----------------------------------------------------------------------
    periods = [
        ("2. Backfill (once)", BACKFILL, spec.START, spec.BACKFILL_END),
        ("3. Weekly update (demo)", WEEKLY, spec.UPDATE_START, spec.END),
    ]
    for step, folder, p0, p1 in periods:
        for P in S.PLAT_ORDER:
            code, pfolder = spec.PLATFORM_FOLDERS[P]
            d = out["platforms"][P]
            frames = {
                "SALES": [("Data", d["sales"], "date")],
                "INVENTORY": [("Data", d["inventory"], "date")],
                "PRICE_PROMO": [("Data", d["price"], "date")],
                "ADS": [("Data", d["ads"], "date")],
                "MARKET": [("Data_Category", d["market_cat"], "week_start"), ("Data_SKUs", d["market_sku"], "week_start")],
                "SERVICE": [("Data", d["service"], "week_start")],
            }
            for feed in spec.FEED_ORDER:
                f = spec.FEEDS[feed]
                sheets, guide_rows, counts = [], [], []
                for sname, df, dcol in frames[feed]:
                    cols = f["cols_category"] if sname == "Data_Category" else f["cols"]
                    if feed == "MARKET" and sname == "Data_SKUs":
                        cols = f["cols"]
                    sl = period_slice(df, dcol, p0, p1)
                    if feed in ("MARKET", "SERVICE"):
                        sl = df[(df[dcol] >= p0) & (df[dcol] <= p1)].reset_index(drop=True)
                    sl = sl[[c["name"] for c in cols]]
                    sheets.append((sname, sl, cols)); counts.append(f"{sname}={len(sl)}")
                    guide_rows += guide_rows_for(sname, cols)
                fname = f"{code}_{f['num']}_{feed}_{p0:%Y%m%d}_{p1:%Y%m%d}.xlsx"
                tmpl = f"BOOST-{feed}-{spec.TEMPLATE_VERSION}"
                meta = meta_for(feed, P, p0, p1, "; ".join(counts), tmpl)
                lines = [f"Template {tmpl}. Platform: {P}. Brand: {spec.BRAND}. Period: {p0} to {p1}.",
                         f"Grain: {f['grain']}. Frequency: {f['freq']}. Delivery: {f['delivery']}.",
                         "All values in EGP excluding VAT. Percent fields are stored as fractions (0.15 = 15%).",
                         "Data tabs start at row 1 with the exact header names below. Do not rename, reorder or add title rows.",
                         DATA_STATUS]
                write_workbook(os.path.join(PACK, folder, pfolder, fname), sheets, meta, guide_rows,
                               f"BOOST {f['title']} feed ({P})", lines)
                upload_map.append(dict(
                    seq=seq, step=step, period=f"{p0} to {p1}", platform=P, feed=f"{f['num']} {f['title']}",
                    file=fname, folder=f"{folder}/{pfolder}/",
                    slot=f"{MENU} > {P} > {f['num']} {f['title']}", frequency=f["freq"],
                    rows="; ".join(counts), date_from=p0, date_to=p1, key=", ".join(f["key"]),
                    unlocks=f["unlocks"]))
                seq += 1

    # ---------------- Upload guide -----------------------------------------------------------------
    write_upload_guide(os.path.join(PACK, "00_Upload_Guide.xlsx"), upload_map)

    # ---------------- Zip ----------------------------------------------------------------------------
    zpath = os.path.join(ROOT, "Sprout_Baby_Care_Data_Pack.zip")
    if os.path.exists(zpath):
        os.remove(zpath)
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(PACK):
            for fn in sorted(files):
                full = os.path.join(base, fn)
                z.write(full, os.path.relpath(full, ROOT))
    print("files:", len(upload_map), "| zip:", zpath, f"{os.path.getsize(zpath) / 1e6:.1f} MB")
    return out, upload_map


def write_upload_guide(path, upload_map):
    um = pd.DataFrame(upload_map)
    with pd.ExcelWriter(path, engine="xlsxwriter",
                        engine_kwargs={"options": {"default_date_format": "yyyy-mm-dd"}},
                        date_format="yyyy-mm-dd", datetime_format="yyyy-mm-dd") as xw:
        wb = xw.book
        hdr = wb.add_format({"bold": True, "bg_color": "#0B2A3C", "font_color": "#FFFFFF", "valign": "vcenter", "text_wrap": True})
        title = wb.add_format({"bold": True, "font_size": 16})
        h2 = wb.add_format({"bold": True, "font_size": 12})
        wrap = wb.add_format({"text_wrap": True, "valign": "top"})

        # Start_Here
        ws = wb.add_worksheet("Start_Here")
        ws.set_column(0, 0, 4); ws.set_column(1, 1, 120)
        ws.write(0, 0, "BOOST upload guide: Sprout Baby Care data pack", title)
        lines = [
            ("h", "What this pack is"),
            ("t", f"Synthetic 13-week data for {spec.BRAND} on Talabat Mart, Noon and Amazon ({spec.START} to {spec.END}), built to the BOOST standard templates."),
            ("t", "Six feeds per platform: Sales, Inventory, Price and Promo, Ads, Market, Service. One setup workbook (Brand Master) ties everything together."),
            ("t", "Numbers are linked: sales drive stock, stock drives lost sales and wasted ad spend, promos drive volume and margin, and the Market feed reconciles to Sales."),
            ("h", "How the folders map to the app"),
            ("t", f"Folder = upload tab. File prefix = card. Example: 02_Backfill.../Noon/NOON_01_SALES_... goes to {MENU} > Noon > 01 Sales."),
            ("t", "The exact slot for every file is in the Upload_Map tab, column 'slot'."),
            ("h", "Upload order"),
            ("t", "Step 1  Setup. Upload 01_Setup/SETUP_00_BRAND_MASTER_v1.xlsx once, first. Other files are rejected until it exists."),
            ("t", "Step 2  Backfill. Upload the 18 files in 02_Backfill (6 per platform). Any platform order; inside a platform go 01 to 06 (Sales first). Data then runs to 2026-10-11."),
            ("t", "Step 3  Check Data Freshness. Every card should read green and 'data through 11 Oct'."),
            ("t", "Step 4  Weekly update. Upload the 18 files in 03_Weekly_Update (week of 12 to 18 Oct). Dashboards move to 'data through 18 Oct'. This is the live-upload moment for the demo."),
            ("h", "Rules the importer applies"),
            ("t", "Re-uploading a file is safe: rows are replaced by key (see Upload_Map column 'key'), never duplicated."),
            ("t", "A file dropped in the wrong slot is rejected. The importer reads the Meta tab (template_id, platform, period) and compares it with the slot."),
            ("t", "Blocking errors stop the import. Warnings import the file and appear in the Ingestion Log. See Validation_Rules."),
            ("t", "Unknown platform_sku_id values are not dropped. They land in the SKU mapping queue for the account manager to match."),
            ("h", "Conventions"),
            ("t", "Currency EGP. All values ex VAT. Percentages stored as fractions (0.15 = 15%). Dates yyyy-mm-dd, Cairo time. Weeks start Monday."),
            ("t", "Barcode (gtin, 13 digits) is the cross-platform key. Platform IDs differ by platform and are mapped in Brand Master > Platform_Listings."),
            ("t", "Breadfast and Rabbit are not populated. See Platforms_Pending for how a new platform is added."),
        ]
        r = 2
        for kind, txt in lines:
            if kind == "h":
                r += 1; ws.write(r, 0, txt, h2)
            else:
                ws.write(r, 1, txt, wrap)
            r += 1

        # Upload_Map
        um_out = um.rename(columns={"seq": "Order", "step": "Step", "period": "Period", "platform": "Platform",
                                    "feed": "Feed", "file": "File name", "folder": "Folder", "slot": "Upload to (slot)",
                                    "frequency": "Ideal frequency", "rows": "Rows", "date_from": "From", "date_to": "To",
                                    "key": "Replace key", "unlocks": "Unlocks"})
        um_out.to_excel(xw, sheet_name="Upload_Map", index=False, header=False, startrow=1)
        ws = xw.sheets["Upload_Map"]
        for i, c in enumerate(um_out.columns):
            ws.write(0, i, c, hdr)
        for i, w in enumerate([7, 22, 24, 14, 18, 52, 46, 54, 18, 40, 11, 11, 44, 56]):
            ws.set_column(i, i, w)
        ws.freeze_panes(1, 6); ws.autofilter(0, 0, len(um_out), len(um_out.columns) - 1)

        # Cadence (the data-sharing spec to agree with platforms)
        rows = []
        why = {
            "SALES": ("Demand run rate, lost sales, platform and region mix", "No run rate, so no replenishment, promo or ads maths"),
            "INVENTORY": ("Days of cover, stockouts, overstock, listing health", "Replenishment is blind; ad waste on out-of-stock SKUs is invisible"),
            "PRICE_PROMO": ("Promo uplift, discount depth, margin after discount", "Cannot tell which discounts earn their cost"),
            "ADS": ("ROAS by campaign, budget caps, wasted spend", "Ad budget is allocated by habit, not return"),
            "MARKET": ("Category share, competitor ranks, must-stock list", "No view of the category, only of own sales"),
            "SERVICE": ("Real lead time, PO confirmation, lost orders by cause", "Planned lead times are used instead of real ones"),
        }
        for k in spec.FEED_ORDER:
            f = spec.FEEDS[k]
            rows.append([f"{f['num']} {f['title']}", f["grain"], f["freq"], f["delivery"], f["tier"],
                         "SFTP drop, scheduled email attachment, or direct upload", "xlsx (or csv with the same headers)",
                         f"BOOST-{k}-{spec.TEMPLATE_VERSION}", why[k][0], why[k][1]])
        ws = wb.add_worksheet("Cadence")
        heads = ["Feed", "Grain", "Frequency", "Delivery time", "Negotiation priority", "Delivery channel", "Format",
                 "Template ID", "What it enables", "What breaks without it"]
        for j, h in enumerate(heads):
            ws.write(0, j, h, hdr)
        for i, row in enumerate(rows, 1):
            for j, v in enumerate(row):
                ws.write(i, j, v, wrap)
        for j, w in enumerate([18, 32, 11, 44, 26, 40, 30, 24, 50, 54]):
            ws.set_column(j, j, w)
        ws.freeze_panes(1, 1)

        # Field_Dictionary
        ws = wb.add_worksheet("Field_Dictionary")
        heads = ["Feed", "Sheet", "Field", "Type", "Unit", "Required", "Description", "Example", "Allowed values"]
        for j, h in enumerate(heads):
            ws.write(0, j, h, hdr)
        r = 1
        for k in spec.FEED_ORDER:
            f = spec.FEEDS[k]
            sets = [("Data_Category", f["cols_category"]), ("Data_SKUs", f["cols"])] if k == "MARKET" else [("Data", f["cols"])]
            for sname, cols in sets:
                for c in cols:
                    for j, v in enumerate([f"{f['num']} {f['title']}", sname, c["name"], c["dtype"], c["unit"],
                                           c["required"], c["desc"], c["example"], c["allowed"]]):
                        ws.write(r, j, v, wrap)
                    r += 1
        for name, sd in spec.SETUP_SHEETS.items():
            for c in sd["cols"]:
                for j, v in enumerate(["00 Brand Master", name, c["name"], c["dtype"], c["unit"], c["required"],
                                       c["desc"], c["example"], c["allowed"]]):
                    ws.write(r, j, v, wrap)
                r += 1
        for j, w in enumerate([18, 20, 36, 8, 9, 9, 70, 22, 46]):
            ws.set_column(j, j, w)
        ws.freeze_panes(1, 3); ws.autofilter(0, 0, r - 1, len(heads) - 1)

        # Validation_Rules
        ws = wb.add_worksheet("Validation_Rules")
        for j, h in enumerate(["Rule", "Severity", "Applies to", "Check", "Note"]):
            ws.write(0, j, h, hdr)
        for i, row in enumerate(spec.VALIDATION_RULES, 1):
            for j, v in enumerate(row):
                ws.write(i, j, v, wrap)
        for j, w in enumerate([8, 11, 16, 80, 70]):
            ws.set_column(j, j, w)

        # Platforms_Pending
        ws = wb.add_worksheet("Platforms_Pending")
        for j, h in enumerate(["Platform", "Type", "Status", "Next step"]):
            ws.write(0, j, h, hdr)
        pend = [("Breadfast", "Quick commerce", "Awaiting data", "Share the 6 BOOST templates, agree delivery channel, send first Sales and Inventory files"),
                ("Rabbit", "Quick commerce", "Awaiting data", "Same as above"),
                ("Jumia", "Marketplace", "Not started", "Confirm vendor portal exports, map to templates")]
        for i, row in enumerate(pend, 1):
            for j, v in enumerate(row):
                ws.write(i, j, v, wrap)
        r = len(pend) + 3
        ws.write(r, 0, "Adding a platform", h2)
        steps = ["1. Add the platform row to Brand Master > Platform_Terms, plus its Nodes, Region_Node_Map, Platform_Listings and Replenishment_Params.",
                 "2. Ask the platform for the six feeds in the standard templates. If it can only give its native export, add a column-mapping adapter (config, not code) in the app.",
                 "3. Upload backfill, check Data Freshness, then the platform tab and all four modules include it automatically."]
        for i, t in enumerate(steps, r + 1):
            ws.write(i, 0, t)
        for j, w in enumerate([18, 18, 18, 110]):
            ws.set_column(j, j, w)


if __name__ == "__main__":
    main()
