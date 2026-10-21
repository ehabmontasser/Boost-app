"""Independent validator: reads the pack back from disk (not from the generator) and
checks every file against the BOOST standard (spec.py). Run: python3 validate_pack.py"""
import glob
import os
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd

import spec

PACK = os.environ.get("BOOST_PACK") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "Sprout_Baby_Care_Data_Pack")
errors, warnings = [], []


def err(f, m): errors.append(f"{os.path.basename(f)}: {m}")
def warn(f, m): warnings.append(f"{os.path.basename(f)}: {m}")


def read(path, sheet, cols):
    dt = {c["name"]: str for c in cols if c["dtype"] == "text"}
    return pd.read_excel(path, sheet_name=sheet, dtype=dt)


def check_types(path, df, cols, p0=None, p1=None):
    names = [c["name"] for c in cols]
    missing = [n for n in names if n not in df.columns]
    if missing:
        err(path, f"missing columns {missing}"); return False
    extra = [c for c in df.columns if c not in names]
    if extra:
        warn(path, f"extra columns {extra}")
    for c in cols:
        s = df[c["name"]]
        if c["required"] == "Y" and s.isna().any():
            err(path, f"{c['name']}: {int(s.isna().sum())} blanks in a required field")
        nn = s.dropna()
        if c["dtype"] in ("int", "num", "pct"):
            if not pd.api.types.is_numeric_dtype(nn):
                err(path, f"{c['name']}: not numeric"); continue
            if (nn < 0).any():
                err(path, f"{c['name']}: negative values")
            if c["dtype"] == "pct" and (nn > 1.0000001).any():
                err(path, f"{c['name']}: pct above 1")
            if c["dtype"] == "int" and (nn != nn.round()).any():
                err(path, f"{c['name']}: non-integer values")
        if c["dtype"] == "date":
            try:
                d = pd.to_datetime(nn)
            except Exception:
                err(path, f"{c['name']}: unparseable dates"); continue
            if c["name"] in ("date", "week_start") and p0 is not None:
                if (d.dt.date < p0).any() or (d.dt.date > p1).any():
                    err(path, f"{c['name']}: dates outside period {p0}..{p1}")
        if c["allowed"] and c["dtype"] == "text":
            ok = set(c["allowed"].split("|"))
            bad = set(nn.unique()) - ok
            if bad:
                err(path, f"{c['name']}: values not allowed {sorted(bad)[:5]}")
    return True


def main():
    setup_path = glob.glob(os.path.join(PACK, "01_Setup", "*.xlsx"))[0]
    S = {n: pd.read_excel(setup_path, sheet_name=n, dtype={"gtin": str, "platform_sku_id": str})
         for n in spec.SETUP_SHEETS}
    for n, sd in spec.SETUP_SHEETS.items():
        check_types(setup_path, S[n], sd["cols"])
        if S[n].duplicated(sd["key"]).any():
            err(setup_path, f"{n}: duplicate keys")
    listings = S["Platform_Listings"]
    sku_gtin = S["SKU_Master"].set_index("sku_code")["gtin"].to_dict()
    lst = {(r.platform, r.platform_sku_id): r.gtin for r in listings.itertuples()}
    for r in listings.itertuples():
        if sku_gtin.get(r.sku_code) != r.gtin:
            err(setup_path, f"listing {r.platform} {r.sku_code} gtin differs from SKU_Master")
    nodes = set(zip(S["Nodes"].platform, S["Nodes"].node_id))
    for (p, n), g in S["Region_Node_Map"].groupby(["platform", "region"]):
        pass
    for (p, rg), g in S["Region_Node_Map"].groupby(["platform", "region"]):
        if abs(g.share_pct.sum() - 1) > 1e-6:
            err(setup_path, f"Region_Node_Map shares for {p}/{rg} sum to {g.share_pct.sum():.3f}")

    data = {}   # (platform, feed) -> list of dfs across periods
    files = sorted(glob.glob(os.path.join(PACK, "0[23]_*", "*", "*.xlsx")))
    print(f"files found: {len(files)} (+ guide + setup)")
    for path in files:
        base = os.path.basename(path)[:-5]
        code, num, *rest = base.split("_")
        feed = "_".join(rest[:-2]); p0 = pd.to_datetime(rest[-2]).date(); p1 = pd.to_datetime(rest[-1]).date()
        P = [k for k, v in spec.PLATFORM_FOLDERS.items() if v[0] == code][0]
        f = spec.FEEDS[feed]
        meta = pd.read_excel(path, sheet_name="Meta").set_index("key")["value"].to_dict()
        if meta.get("template_id") != f"BOOST-{feed}-{spec.TEMPLATE_VERSION}":
            err(path, "V01 template_id mismatch")
        if meta.get("platform") != P:
            err(path, "V01 platform mismatch")
        if meta.get("period_start") != p0.isoformat() or meta.get("period_end") != p1.isoformat():
            err(path, "V01 period mismatch")
        if feed == "MARKET":
            dfc = read(path, "Data_Category", f["cols_category"]); dfs = read(path, "Data_SKUs", f["cols"])
            check_types(path, dfc, f["cols_category"], p0, p1); check_types(path, dfs, f["cols"], p0, p1)
            if dfc.duplicated(f["key_category"]).any(): err(path, "V04 duplicate keys in Data_Category")
            if dfs.duplicated(["week_start", "category", "platform_sku_id"]).any(): err(path, "V04 duplicate keys in Data_SKUs")
            data.setdefault((P, feed), []).append((dfc, dfs))
        else:
            df = read(path, "Data", f["cols"])
            if not check_types(path, df, f["cols"], p0, p1):
                continue
            if df.duplicated(f["key"]).any():
                err(path, f"V04 duplicate keys ({int(df.duplicated(f['key']).sum())})")
            # V06 / V07
            if "platform_sku_id" in df.columns:
                ids = set(df.platform_sku_id.unique())
                unknown = [i for i in ids if (P, i) not in lst]
                if unknown:
                    warn(path, f"V06 unknown platform_sku_id {unknown[:3]}")
                g = df.drop_duplicates("platform_sku_id")
                bad = [r.platform_sku_id for r in g.itertuples() if lst.get((P, r.platform_sku_id)) not in (None, r.gtin)]
                if bad:
                    warn(path, f"V07 gtin mismatch {bad[:3]}")
            if feed == "SALES":
                if ((df.gross_gmv_ex_vat_egp - df.discount_value_ex_vat_egp - df.net_gmv_ex_vat_egp).abs() > 0.05).any():
                    err(path, "V08 net != gross - discount")
                days = (p1 - p0).days + 1
                cnt = df.groupby(["platform_sku_id", "region"]).size()
                if (cnt != days).any():
                    warn(path, f"V09 gaps: {int((cnt != days).sum())} sku-regions not complete")
            if feed == "INVENTORY":
                calc = 1 - df.oos_hours / df.operating_hours
                if ((calc - df.in_stock_rate_pct).abs() > 0.01).any():
                    warn(path, "V10 in_stock_rate inconsistent")
                bad_nodes = set(df.node_id) - {n for (p, n) in nodes if p == P}
                if bad_nodes:
                    warn(path, f"V11 unknown node {bad_nodes}")
            if feed == "PRICE_PROMO":
                calc = 1 - df.selling_price_ex_vat_egp / df.list_price_ex_vat_egp
                if ((calc - df.discount_depth_pct).abs() > 0.005).any():
                    err(path, "V12 depth != 1 - selling/list")
            if feed == "SERVICE":
                tot = df.customer_orders + df.lost_orders_oos + df.lost_orders_other
                calc = np.where(tot > 0, df.customer_orders / tot, 1.0)
                if (np.abs(calc - df.fully_filled_orders_pct) > 0.02).any():
                    warn(path, "V15 fully_filled inconsistent")
            data.setdefault((P, feed), []).append(df)

    # cross-period and cross-feed checks
    for P in spec.PLATFORM_FOLDERS:
        sales = pd.concat(data[(P, "SALES")]); sales["date"] = pd.to_datetime(sales["date"])
        if sales.duplicated(["date", "platform_sku_id", "region"]).any():
            err(P, "overlap between backfill and weekly files (sales)")
        span = sales["date"].nunique()
        if span != (spec.END - spec.START).days + 1:
            err(P, f"sales days {span}, expected 91")
        # V13 ads vs sales
        ads = pd.concat(data[(P, "ADS")]); ads["date"] = pd.to_datetime(ads["date"])
        a = ads.groupby(["date", "platform_sku_id"])["attributed_sales_7d_ex_vat_egp"].sum()
        s = sales.groupby(["date", "platform_sku_id"])["net_gmv_ex_vat_egp"].sum()
        j = pd.concat([a, s], axis=1, keys=["att", "net"]).dropna()
        over = j[j.att > j.net + 0.01]
        if len(over):
            warn(P + "_ADS", f"V13 attributed > net sales on {len(over)} sku-days")
        # V14 market reconciliation
        mk = pd.concat([x[1] for x in data[(P, "MARKET")]])
        mk["week_start"] = pd.to_datetime(mk["week_start"])
        own = mk[mk.is_own_brand == "Y"].groupby(["week_start", "platform_sku_id"])["gmv_ex_vat_egp"].sum()
        sw = sales.copy(); sw["week_start"] = sw["date"] - pd.to_timedelta(sw["date"].dt.weekday, unit="D")
        sg = sw.groupby(["week_start", "platform_sku_id"])["net_gmv_ex_vat_egp"].sum()
        jj = pd.concat([own, sg], axis=1, keys=["mkt", "sales"]).dropna()
        dev = ((jj.mkt - jj.sales).abs() / jj.sales.replace(0, np.nan)).max()
        if dev > 0.02:
            warn(P + "_MARKET", f"V14 own-brand vs sales deviation {dev:.1%}")
        # share of category sanity
        cat = pd.concat([x[0] for x in data[(P, "MARKET")]]); cat["week_start"] = pd.to_datetime(cat["week_start"])
        c = cat.groupby(["week_start", "category"])["category_gmv_ex_vat_egp"].sum()
        sprout = mk[mk.is_own_brand == "Y"].groupby(["week_start", "category"])["gmv_ex_vat_egp"].sum()
        share = (sprout / c).dropna()
        if (share > 0.6).any() or (share < 0.02).any():
            warn(P + "_MARKET", "own share outside 2%..60%")
        print(f"{P:13s} sales EGP {sales.net_gmv_ex_vat_egp.sum():>12,.0f} | ad spend {ads.ad_spend_ex_vat_egp.sum():>9,.0f} | "
              f"wipes share wk1 {share.xs('Wipes', level=1).iloc[0]:.1%} -> wk13 {share.xs('Wipes', level=1).iloc[-1]:.1%} | max reconcile dev {dev:.2%}")

    print(f"\nERRORS: {len(errors)}")
    for e in errors[:40]: print("  -", e)
    print(f"WARNINGS: {len(warnings)}")
    for w in warnings[:40]: print("  -", w)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
