"""Sprout Baby Care: 13-week simulation across Talabat Mart, Noon and Amazon.

Everything is synthetic. The structure mirrors what real platform exports contain,
and the numbers are linked: sales drive stock, stock drives lost sales and ad
waste, promos drive volume and margin, and the market feed reconciles to sales.
"""
import math
import zlib
from datetime import date, timedelta

import numpy as np
import pandas as pd

import spec

SEED = 20261020
NT = (spec.END - spec.START).days + 1
DAYS = [spec.START + timedelta(days=i) for i in range(NT)]
WEEKS = [spec.START + timedelta(days=7 * i) for i in range(NT // 7)]


def idx(d):
    if isinstance(d, str):
        d = date.fromisoformat(d)
    return (d - spec.START).days


def ean13(p12):
    s = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(p12))
    return p12 + str((10 - s % 10) % 10)


# ----------------------------------------------------------------------------
# Brand: SKUs. code, name, category, sub, pack, list price ex VAT (current), cogs, shelf life, case
# ----------------------------------------------------------------------------
SKUS = [
    ("SBC-01", "Sprout Water Wipes Baby 60 Wipes", "Wipes", "Baby", "1x60", 66, 33, 36, 12),
    ("SBC-02", "Sprout Water Wipes Baby 2x60 Wipes", "Wipes", "Baby", "2x60", 124, 62, 36, 12),
    ("SBC-03", "Sprout Water Wipes Baby 3x60 Wipes", "Wipes", "Baby", "3x60", 182, 91, 36, 12),
    ("SBC-04", "Sprout Sensitive Baby Wipes 3x80 Wipes", "Wipes", "Baby", "3x80", 175, 89, 36, 12),
    ("SBC-05", "Sprout Aloe Vera Baby Wipes 3x80 Wipes", "Wipes", "Baby", "3x80", 188, 106, 36, 12),
    ("SBC-06", "Sprout Cleansing Baby Wipes 2x60 Wipes", "Wipes", "Baby", "2x60", 100, 52, 36, 12),
    ("SBC-07", "Sprout Sensitive Baby Wipes 80 Wipes", "Wipes", "Baby", "1x80", 62, 33, 36, 12),
    ("SBC-08", "Sprout Fresh Cool Mist Wipes 3x80 Wipes", "Wipes", "Fresh", "3x80", 165, 92, 30, 12),
    ("SBC-09", "Sprout Antibacterial Wipes 2x50 Wipes", "Wipes", "Antibacterial", "2x50", 80, 41, 30, 12),
    ("SBC-10", "Sprout Baby Shampoo 300ml", "Skin Care", "Shampoo", "300ml", 118, 60, 30, 24),
    ("SBC-11", "Sprout Diaper Rash Cream 100g", "Skin Care", "Rash cream", "100g", 92, 38, 30, 24),
    ("SBC-12", "Sprout Baby Lotion 200ml", "Skin Care", "Lotion", "200ml", 110, 55, 30, 24),
]
COGS = {"SBC-01": 29, "SBC-02": 54, "SBC-03": 79, "SBC-04": 78, "SBC-05": 98, "SBC-06": 45, "SBC-07": 28,
        "SBC-08": 83, "SBC-09": 36, "SBC-10": 54, "SBC-11": 34, "SBC-12": 50}
SKU = {s[0]: dict(code=s[0], name=s[1], cat=s[2], sub=s[3], pack=s[4], price=float(s[5]),
                  cogs=float(COGS[s[0]]), shelf=s[7], case=s[8], idx=i) for i, s in enumerate(SKUS)}
SKU_CODES = [s[0] for s in SKUS]
PRICE_STEP = date(2026, 9, 1)     # +6% list price increase on all platforms
PRICE_STEP_PCT = 0.06

# Per-platform SKU price elasticity multipliers (relative to platform elasticity)
ELAST_MULT = {
    ("Noon", "SBC-05"): 0.6, ("Noon", "SBC-06"): 0.7, ("Noon", "SBC-10"): 0.6,
    ("Amazon Core", "SBC-05"): 0.7,
    ("*", "SBC-11"): 0.5,
    ("Talabat Mart", "SBC-08"): 1.2, ("Talabat Mart", "SBC-09"): 1.2,
}

PLAT = {
    "Talabat Mart": dict(
        code="TLB", ptype="Quick commerce", margin=0.28, pay=45, upo=1.30, elast=3.0,
        units=345, growth=0.010, dow_amp=1.0, payday=1.10, oh=18, cancel_other=0.020,
        ret=0.005, lt=4, review=3, safety=3, moq=48, tcover=14, maxcover=45, confirm=0.98,
        pauses=False, instock_t=0.97, roas_t=4.0, sales_t=1_350_000, budget=105_000,
        regions={"Cairo": 0.50, "Giza": 0.28, "Alexandria": 0.22},
        nodes={"TLB-CAI-E": ("Cairo East dark stores", "Dark store cluster"),
               "TLB-CAI-W": ("Cairo West dark stores", "Dark store cluster"),
               "TLB-GIZ": ("Giza dark stores", "Dark store cluster"),
               "TLB-ALX": ("Alexandria dark stores", "Dark store cluster")},
        rmap={"Cairo": {"TLB-CAI-E": 0.55, "TLB-CAI-W": 0.45}, "Giza": {"TLB-GIZ": 1.0},
              "Alexandria": {"TLB-ALX": 1.0}},
        mix={"SBC-01": .17, "SBC-02": .30, "SBC-04": .10, "SBC-05": .09, "SBC-06": .08,
             "SBC-07": .07, "SBC-08": .07, "SBC-09": .06, "SBC-11": .06}),
    "Noon": dict(
        code="NOON", ptype="Marketplace", margin=0.25, pay=60, upo=1.25, elast=1.5,
        units=150, growth=0.002, dow_amp=0.5, payday=1.04, oh=24, cancel_other=0.050,
        ret=0.012, lt=6, review=7, safety=7, moq=120, tcover=21, maxcover=60, confirm=0.96,
        pauses=False, instock_t=0.95, roas_t=4.0, sales_t=620_000, budget=54_000,
        regions={"Cairo": 0.34, "Giza": 0.16, "Alexandria": 0.17, "Delta": 0.20, "Upper Egypt": 0.13},
        nodes={"NOON-CAI-FC": ("Cairo fulfilment centre", "Fulfilment centre"),
               "NOON-ALX-FC": ("Alexandria fulfilment centre", "Fulfilment centre")},
        rmap={"Cairo": {"NOON-CAI-FC": 1.0}, "Giza": {"NOON-CAI-FC": 1.0},
              "Upper Egypt": {"NOON-CAI-FC": 1.0}, "Alexandria": {"NOON-ALX-FC": 1.0},
              "Delta": {"NOON-ALX-FC": 0.6, "NOON-CAI-FC": 0.4}},
        mix={"SBC-01": .10, "SBC-02": .20, "SBC-03": .09, "SBC-04": .09, "SBC-05": .06,
             "SBC-06": .07, "SBC-07": .05, "SBC-08": .05, "SBC-09": .08, "SBC-10": .07,
             "SBC-11": .08, "SBC-12": .06}),
    "Amazon Core": dict(
        code="AMZ", ptype="Vendor central", margin=0.30, pay=60, upo=1.10, elast=1.9,
        units=190, growth=0.005, dow_amp=0.5, payday=1.04, oh=24, cancel_other=0.030,
        ret=0.018, lt=7, review=7, safety=7, moq=180, tcover=28, maxcover=75, confirm=0.93,
        pauses=True, instock_t=0.96, roas_t=4.5, sales_t=880_000, budget=69_000,
        regions={"Cairo": 0.38, "Giza": 0.17, "Alexandria": 0.15, "Delta": 0.18, "Upper Egypt": 0.12},
        nodes={"AMZ-CAI1": ("Cairo fulfilment centre", "Fulfilment centre"),
               "AMZ-ALX1": ("Alexandria fulfilment centre", "Fulfilment centre")},
        rmap={"Cairo": {"AMZ-CAI1": 1.0}, "Giza": {"AMZ-CAI1": 1.0},
              "Upper Egypt": {"AMZ-CAI1": 1.0}, "Alexandria": {"AMZ-ALX1": 1.0},
              "Delta": {"AMZ-ALX1": 0.5, "AMZ-CAI1": 0.5}},
        mix={"SBC-01": .08, "SBC-02": .26, "SBC-03": .14, "SBC-04": .17, "SBC-05": .05,
             "SBC-06": .08, "SBC-10": .10, "SBC-11": .12}),
    "Amazon Now": dict(
        code="AMN", ptype="Quick commerce", margin=0.30, pay=60, upo=1.35, elast=2.6,
        units=110, growth=0.015, dow_amp=1.0, payday=1.10, oh=18, cancel_other=0.020,
        ret=0.006, lt=2, review=2, safety=2, moq=24, tcover=7, maxcover=14, confirm=0.95,
        pauses=False, instock_t=0.96, roas_t=4.0, sales_t=380_000, budget=30_000,
        regions={"Cairo": 0.52, "Giza": 0.27, "Alexandria": 0.21},
        nodes={"AMN-CAI-N": ("Cairo North dark stores", "Dark store cluster"),
               "AMN-CAI-S": ("Cairo South dark stores", "Dark store cluster"),
               "AMN-GIZ": ("Giza dark stores", "Dark store cluster"),
               "AMN-ALX": ("Alexandria dark stores", "Dark store cluster")},
        rmap={"Cairo": {"AMN-CAI-N": 0.5, "AMN-CAI-S": 0.5}, "Giza": {"AMN-GIZ": 1.0},
              "Alexandria": {"AMN-ALX": 1.0}},
        mix={"SBC-01": .20, "SBC-02": .32, "SBC-06": .12, "SBC-07": .14, "SBC-09": .08, "SBC-11": .14}),
    "Breadfast": dict(
        code="BRF", ptype="Quick commerce", margin=0.27, pay=45, upo=1.45, elast=2.8,
        units=125, growth=0.008, dow_amp=1.0, payday=1.08, oh=18, cancel_other=0.020,
        ret=0.004, lt=3, review=3, safety=2, moq=36, tcover=10, maxcover=30, confirm=0.97,
        pauses=False, instock_t=0.96, roas_t=4.0, sales_t=420_000, budget=33_000,
        regions={"Cairo": 0.55, "Giza": 0.27, "Alexandria": 0.18},
        nodes={"BRF-CAI": ("Cairo dark stores", "Dark store cluster"),
               "BRF-GIZ": ("Giza dark stores", "Dark store cluster"),
               "BRF-ALX": ("Alexandria dark stores", "Dark store cluster")},
        rmap={"Cairo": {"BRF-CAI": 1.0}, "Giza": {"BRF-GIZ": 1.0}, "Alexandria": {"BRF-ALX": 1.0}},
        mix={"SBC-01": .16, "SBC-02": .28, "SBC-04": .12, "SBC-06": .10, "SBC-07": .10, "SBC-09": .10, "SBC-11": .14}),
}
PLAT_ORDER = ["Talabat Mart", "Noon", "Amazon Core", "Amazon Now", "Breadfast"]
PARENT = {"Talabat Mart": "Talabat", "Noon": "Noon", "Amazon Core": "Amazon", "Amazon Now": "Amazon",
          "Breadfast": "Breadfast"}

# ----------------------------------------------------------------------------
# Promotions. depth = discount depth, vs = vendor funding share
# ----------------------------------------------------------------------------
PROMOS = {
    "Talabat Mart": [
        dict(id="TLB-PR-01", name="Mart Monthly Saver", type="PRICE_OFF",
             windows=[("2026-08-01", "2026-08-05"), ("2026-09-01", "2026-09-05"), ("2026-10-01", "2026-10-05")],
             skus=["SBC-02", "SBC-04", "SBC-07", "SBC-11"], depth=0.10, vs=0.5, feat=True),
        dict(id="TLB-PR-02", name="Weekend Wipes Bundle", type="BUNDLE", weekend=True,
             skus=["SBC-04", "SBC-05"], depth=0.12, vs=1.0, feat=False),
        dict(id="TLB-PR-03", name="Back To School Basket", type="PRICE_OFF",
             windows=[("2026-09-14", "2026-09-27")], skus=["SBC-01", "SBC-02", "SBC-06"],
             depth=0.15, vs=1.0, feat=True),
        dict(id="TLB-PR-04", name="Pay Week", type="DEAL_EVENT",
             windows=[("2026-08-25", "2026-08-31"), ("2026-09-25", "2026-09-30")],
             skus="ALL", depth=0.05, vs=0.0, feat=False),
    ],
    "Noon": [
        dict(id="NOON-D01", name="Summer Deals", type="DEAL_EVENT", windows=[("2026-07-27", "2026-08-02")],
             skus=["SBC-01", "SBC-02", "SBC-03", "SBC-04"], depth=0.12, vs=0.5, feat=True),
        dict(id="NOON-D02", name="Back To School Sale", type="DEAL_EVENT", windows=[("2026-08-24", "2026-09-06")],
             skus=["SBC-01", "SBC-02", "SBC-03", "SBC-04", "SBC-06", "SBC-07", "SBC-10"],
             depth=0.15, vs=0.5, feat=True),
        dict(id="NOON-D03", name="Mega Deals", type="DEAL_EVENT", windows=[("2026-09-08", "2026-09-14")],
             skus=["SBC-05", "SBC-06", "SBC-10"], depth=0.25, vs=1.0, feat=True),
        dict(id="NOON-D04", name="10.10 Sale", type="DEAL_EVENT", windows=[("2026-10-08", "2026-10-12")],
             skus=["SBC-02", "SBC-04", "SBC-09", "SBC-11"], depth=0.18, vs=0.5, feat=True),
        dict(id="NOON-CP01", name="SAVE10 Coupon", type="COUPON",
             windows=[("2026-08-03", "2026-08-16"), ("2026-09-21", "2026-09-30")],
             skus="ALL", depth=0.10, vs=0.0, feat=False),
    ],
    "Amazon Core": [
        dict(id="AMZ-LD01", name="Lightning Deal", type="LIGHTNING_DEAL", windows=[("2026-08-12", "2026-08-12")],
             skus=["SBC-02"], depth=0.30, vs=1.0, feat=True),
        dict(id="AMZ-D02", name="Back To School Deals", type="DEAL_EVENT", windows=[("2026-08-20", "2026-09-10")],
             skus=["SBC-01", "SBC-02", "SBC-04", "SBC-06"], depth=0.10, vs=1.0, feat=True),
        dict(id="AMZ-D03", name="Autumn Sale", type="DEAL_EVENT", windows=[("2026-10-01", "2026-10-07")],
             skus=["SBC-02", "SBC-03", "SBC-04", "SBC-10"], depth=0.12, vs=1.0, feat=True),
    ],
}

# ----------------------------------------------------------------------------
# Ad campaigns. roas = intended attributed sales / spend before caps
# ----------------------------------------------------------------------------
CAMPAIGNS = {
    "Talabat Mart": [
        dict(id="TLB-C01", name="Mart Search | Core Wipes", ad_type="Search", obj="Defend",
             skus=["SBC-02", "SBC-01", "SBC-04"], budget=1700, roas=5.5, cpc=2.4, ctr=0.022, capped=0.28),
        dict(id="TLB-C02", name="Mart Home Banner | Brand Awareness", ad_type="Banner", obj="Awareness",
             skus=["SBC-02", "SBC-05"], budget=1100, roas=2.2, cpc=0.9, ctr=0.0035, capped=0.0),
        dict(id="TLB-C03", name="Mart Category Sponsored | Fresh & Antibac", ad_type="Search", obj="Conquest",
             skus=["SBC-08", "SBC-09"], budget=700, roas=3.5, cpc=2.4, ctr=0.020, capped=0.0),
    ],
    "Noon": [
        dict(id="NOON-C01", name="SP | Brand Defence", ad_type="Search", obj="Defend",
             skus=["SBC-02", "SBC-04", "SBC-01"], budget=400, roas=9.0, cpc=1.4, ctr=0.030, capped=0.22),
        dict(id="NOON-C02", name="SP | Generic Baby Wipes", ad_type="Search", obj="Conquest",
             skus=["SBC-04", "SBC-05", "SBC-06", "SBC-07"], budget=800, roas=1.7, cpc=2.0, ctr=0.018, capped=0.0),
        dict(id="NOON-C03", name="Display | Retargeting", ad_type="Display", obj="Retarget",
             skus=["SBC-02", "SBC-03"], budget=350, roas=3.2, cpc=1.1, ctr=0.0045, capped=0.0),
        dict(id="NOON-C04", name="SP | Skin Care", ad_type="Search", obj="Conquest",
             skus=["SBC-10", "SBC-11", "SBC-12"], budget=250, roas=4.0, cpc=1.8, ctr=0.019, capped=0.0),
    ],
    "Amazon Core": [
        dict(id="AMZ-C01", name="SP | Auto", ad_type="Search", obj="Conquest",
             skus=["SBC-01", "SBC-02", "SBC-03", "SBC-04", "SBC-05", "SBC-06", "SBC-10", "SBC-11"],
             budget=1000, roas=4.8, cpc=2.8, ctr=0.017, capped=0.0),
        dict(id="AMZ-C02", name="SP | Manual Exact Brand", ad_type="Search", obj="Defend",
             skus=["SBC-01", "SBC-02", "SBC-04"], budget=300, roas=11.0, cpc=1.6, ctr=0.035, capped=0.31),
        dict(id="AMZ-C03", name="SB | Brand Video", ad_type="Sponsored Brands", obj="Awareness",
             skus=["SBC-01", "SBC-02", "SBC-03", "SBC-04", "SBC-05", "SBC-06", "SBC-10", "SBC-11"],
             budget=700, roas=2.0, cpc=3.1, ctr=0.006, capped=0.0),
        dict(id="AMZ-C04", name="SP | Aloe Push", ad_type="Search", obj="Conquest",
             skus=["SBC-05"], budget=300, roas=1.1, cpc=2.6, ctr=0.016, capped=0.0),
    ],
}

PROMOS["Amazon Now"] = [
    dict(id="AMN-D01", name="Weekend Fresh Deals", type="PRICE_OFF", weekend=True,
         skus=["SBC-01", "SBC-02", "SBC-07"], depth=0.10, vs=0.5, feat=True),
    dict(id="AMN-D02", name="Back To School Basket", type="DEAL_EVENT", windows=[("2026-09-14", "2026-09-27")],
         skus=["SBC-01", "SBC-02", "SBC-06"], depth=0.12, vs=1.0, feat=True),
]
PROMOS["Breadfast"] = [
    dict(id="BRF-PR-01", name="Weekly Offers", type="PRICE_OFF", weekend=True,
         skus=["SBC-02", "SBC-04", "SBC-07"], depth=0.08, vs=0.5, feat=True),
    dict(id="BRF-PR-02", name="Monthly Bonanza", type="DEAL_EVENT",
         windows=[("2026-08-01", "2026-08-03"), ("2026-09-01", "2026-09-03"), ("2026-10-01", "2026-10-03")],
         skus=["SBC-02", "SBC-11"], depth=0.10, vs=0.5, feat=True),
    dict(id="BRF-PR-03", name="Back To School Basket", type="DEAL_EVENT", windows=[("2026-09-14", "2026-09-27")],
         skus=["SBC-01", "SBC-02", "SBC-06"], depth=0.12, vs=1.0, feat=True),
]
CAMPAIGNS["Amazon Now"] = [
    dict(id="AMN-C01", name="Now | Sponsored Products", ad_type="Search", obj="Defend",
         skus=["SBC-02", "SBC-01", "SBC-07"], budget=400, roas=4.4, cpc=2.2, ctr=0.020, capped=0.18),
    dict(id="AMN-C02", name="Now | Homepage Banner", ad_type="Banner", obj="Awareness",
         skus=["SBC-02", "SBC-06", "SBC-11"], budget=200, roas=2.0, cpc=0.9, ctr=0.0035, capped=0.0),
]
CAMPAIGNS["Breadfast"] = [
    dict(id="BRF-C01", name="Search | Baby Care", ad_type="Search", obj="Defend",
         skus=["SBC-02", "SBC-01", "SBC-04"], budget=450, roas=4.6, cpc=2.2, ctr=0.020, capped=0.0),
    dict(id="BRF-C02", name="Home Banner | Brand", ad_type="Banner", obj="Awareness",
         skus=["SBC-02", "SBC-06"], budget=300, roas=2.0, cpc=0.9, ctr=0.0035, capped=0.0),
    dict(id="BRF-C03", name="Category Sponsored | Hygiene", ad_type="Search", obj="Conquest",
         skus=["SBC-09", "SBC-11", "SBC-07"], budget=200, roas=3.1, cpc=2.2, ctr=0.018, capped=0.0),
]

# Shelf capacity in cover days per node (quick commerce dark stores have limited shelf space).
# Enforced in the simulation for the channels below. Amazon Now is tight on the hero SKUs.
CAP_DAYS = {("Amazon Now", "SBC-02"): 3.0, ("Amazon Now", "SBC-01"): 3.5, ("Amazon Now", "SBC-06"): 5.5,
            ("Amazon Now", "SBC-07"): 5.5, ("Amazon Now", "SBC-09"): 5.5, ("Amazon Now", "SBC-11"): 7.0,
            ("Breadfast", "SBC-02"): 4.5}
CAP_DEFAULT = {"Amazon Now": 5.5, "Breadfast": 7.0}
SMALL_PACK_CHANNELS = ("Amazon Now", "Breadfast")

# Listing suppression windows (physical stock exists but the SKU cannot be bought)
SUPPRESSION = {("Talabat Mart", "SBC-09"): ("2026-09-08", "2026-09-28")}

# Initial cover overrides in days
INIT_COVER = {("Amazon Core", "SBC-05"): 340, ("Amazon Core", "SBC-01"): 85, ("Noon", "SBC-09"): 7}

# Lead time shocks: (platform, sku, node or '*') -> list of (placed_from, placed_to, extra_days)
LT_SHOCK = {
    ("Talabat Mart", "SBC-02", "TLB-GIZ"): [("2026-09-05", "2026-09-13", 12), ("2026-10-05", "2026-10-17", 13)],
    ("Talabat Mart", "SBC-02", "TLB-CAI-E"): [("2026-10-08", "2026-10-17", 10)],
    ("Noon", "SBC-09", "*"): [("2026-08-25", "2026-10-18", 3)],
}
# PO confirmation (share of requested units the platform confirms): (platform, sku) -> [(from, to, rate)]
CONFIRM_SHOCK = {
    ("Noon", "SBC-09"): [("2026-08-25", "2026-10-18", 0.70)],
    ("Amazon Core", "SBC-02"): [("2026-07-20", "2026-10-18", 0.88)],
}
# Forced PO events (automatic reorders that should not have happened)
FORCED_PO = {
    ("Amazon Core", "SBC-05", "AMZ-CAI1"): [("2026-10-06", 1500, "2026-10-27")],
    ("Amazon Core", "SBC-05", "AMZ-ALX1"): [("2026-10-06", 900, "2026-10-27")],
}

# ----------------------------------------------------------------------------
# Market: competitor catalog. brand, product, category, sub, price, weight, weekly trend
# ----------------------------------------------------------------------------
COMP = [
    ("Nuvo Baby", "Nuvo Baby Pure Water Wipes 2x64", "Wipes", "Baby", 118, 10, 0.025),
    ("Nuvo Baby", "Nuvo Baby Sensitive Wipes 3x80", "Wipes", "Baby", 170, 9, 0.025),
    ("Nuvo Baby", "Nuvo Baby Water Wipes 64", "Wipes", "Baby", 62, 8, 0.02),
    ("Nuvo Baby", "Nuvo Baby Fragrance Free Wipes 3x70", "Wipes", "Baby", 150, 5, 0.02),
    ("SoftTouch", "SoftTouch Baby Wipes 100 Sheets", "Wipes", "Baby", 60, 8, -0.01),
    ("SoftTouch", "SoftTouch Baby Wipes 2x72", "Wipes", "Baby", 105, 6, -0.01),
    ("SoftTouch", "SoftTouch Aloe Baby Wipes 3x80", "Wipes", "Baby", 160, 4, 0.0),
    ("Pureo", "Pureo Baby Water Wipes 2x60", "Wipes", "Baby", 120, 5, 0.0),
    ("Pureo", "Pureo Sensitive Baby Wipes 72", "Wipes", "Baby", 58, 3, 0.0),
    ("Lilybee", "Lilybee Baby Wipes 80", "Wipes", "Baby", 52, 3, 0.0),
    ("Lilybee", "Lilybee Baby Wipes Value 3x80", "Wipes", "Baby", 150, 3, 0.0),
    ("Maple Kids", "Maple Kids Gentle Baby Wipes 2x60", "Wipes", "Baby", 98, 2.5, 0.0),
    ("CleanPal", "CleanPal Antibacterial Lemon Wipes 2x50", "Wipes", "Antibacterial", 72, 12, 0.02),
    ("CleanPal", "CleanPal Antibacterial Wipes 100", "Wipes", "Antibacterial", 50, 7, 0.02),
    ("CleanPal", "CleanPal Multi-purpose Fresh Wipes 3x80", "Wipes", "Fresh", 150, 8, 0.02),
    ("CleanPal", "CleanPal Fresh Cool Wipes 80", "Wipes", "Fresh", 58, 5, 0.02),
    ("ZestFresh", "ZestFresh Multi-purpose Wipes 2x80", "Wipes", "Fresh", 105, 5, 0.0),
    ("ZestFresh", "ZestFresh Antibacterial Wipes 3x40", "Wipes", "Antibacterial", 88, 4, 0.0),
    ("BabyBloom", "BabyBloom Baby Shampoo 400ml", "Skin Care", "Shampoo", 125, 10, 0.0),
    ("BabyBloom", "BabyBloom Baby Lotion 300ml", "Skin Care", "Lotion", 115, 8, 0.0),
    ("BabyBloom", "BabyBloom Rash Cream 100g", "Skin Care", "Rash cream", 98, 7, 0.0),
    ("Cuddlo", "Cuddlo Tear-free Shampoo 300ml", "Skin Care", "Shampoo", 105, 7, 0.01),
    ("Cuddlo", "Cuddlo Moisturising Lotion 250ml", "Skin Care", "Lotion", 120, 6, 0.0),
    ("Cuddlo", "Cuddlo Zinc Rash Cream 75g", "Skin Care", "Rash cream", 80, 6, 0.0),
    ("TinyCare", "TinyCare Shampoo & Wash 500ml", "Skin Care", "Shampoo", 150, 5, 0.0),
    ("TinyCare", "TinyCare Baby Oil 200ml", "Skin Care", "Lotion", 85, 4, 0.0),
    ("TinyCare", "TinyCare Diaper Cream 125g", "Skin Care", "Rash cream", 105, 5, 0.0),
]
COMP_BRANDS = [
    ("Nuvo Baby", "Leader", "Baby water wipes and sensitive range"),
    ("SoftTouch", "Challenger", "Value baby wipes"),
    ("Pureo", "Challenger", "Baby water wipes"),
    ("Lilybee", "Niche", "Entry-price baby wipes"),
    ("Maple Kids", "Niche", "Gentle baby wipes"),
    ("CleanPal", "Leader", "Antibacterial and multi-purpose fresh wipes"),
    ("ZestFresh", "Challenger", "Multi-purpose and antibacterial wipes"),
    ("BabyBloom", "Leader", "Baby skin care"),
    ("Cuddlo", "Challenger", "Baby skin care"),
    ("TinyCare", "Niche", "Baby skin care"),
]
SUB_MULT = {
    "Talabat Mart": {"Baby": 1.0, "Fresh": 1.4, "Antibacterial": 3.0, "Shampoo": 0.6, "Rash cream": 0.7, "Lotion": 0.5},
    "Noon": {"Baby": 1.0, "Fresh": 0.8, "Antibacterial": 1.0, "Shampoo": 1.0, "Rash cream": 1.0, "Lotion": 1.0},
    "Amazon Core": {"Baby": 1.0, "Fresh": 2.2, "Antibacterial": 0.7, "Shampoo": 1.0, "Rash cream": 1.0, "Lotion": 1.0},
}
TARGET_SHARE = {
    ("Talabat Mart", "Wipes"): 0.21, ("Talabat Mart", "Skin Care"): 0.09,
    ("Noon", "Wipes"): 0.11, ("Noon", "Skin Care"): 0.10,
    ("Amazon Core", "Wipes"): 0.12, ("Amazon Core", "Skin Care"): 0.125,
}
CAT_GROWTH = {"Talabat Mart": 0.022, "Noon": 0.010, "Amazon Core": 0.015}
NAMED_SHARE_OF_POOL = 0.72
SUB_MULT["Amazon Now"] = {"Baby": 1.0, "Fresh": 1.3, "Antibacterial": 1.8, "Shampoo": 0.5, "Rash cream": 0.7, "Lotion": 0.4}
SUB_MULT["Breadfast"] = {"Baby": 1.0, "Fresh": 1.6, "Antibacterial": 2.0, "Shampoo": 0.5, "Rash cream": 0.6, "Lotion": 0.4}
TARGET_SHARE.update({("Amazon Now", "Wipes"): 0.13, ("Amazon Now", "Skin Care"): 0.10,
                     ("Breadfast", "Wipes"): 0.15, ("Breadfast", "Skin Care"): 0.08})
CAT_GROWTH.update({"Amazon Now": 0.020, "Breadfast": 0.018})


def dow_factors(amp):
    base = np.array([0.96, 0.94, 0.97, 1.06, 1.12, 1.04, 0.91])
    f = 1 + (base - 1) * amp
    return f / f.mean()


import zlib
def hash_(k): return zlib.crc32(("amn" + k).encode())


def build(seed=SEED):
    rng = np.random.default_rng(seed)
    idrng = np.random.default_rng(7)

    # ---- IDs -----------------------------------------------------------------
    gtin = {c: ean13("622900" + f"{SKU[c]['idx'] + 1:06d}") for c in SKU_CODES}
    alnum = list("ABCDEFGHJKLMNPQRSTUVWXYZ0123456789")
    psid = {}
    for P in PLAT_ORDER:
        for k in PLAT[P]["mix"]:
            if P == "Talabat Mart":
                psid[(P, k)] = "TLB-" + "".join(idrng.choice(list("0123456789"), 6))
            elif P == "Noon":
                psid[(P, k)] = "N" + "".join(idrng.choice(list("0123456789"), 8)) + "A"
            elif P == "Amazon Core":
                psid[(P, k)] = "B0" + "".join(idrng.choice(alnum, 8))
            elif P == "Amazon Now":
                psid[(P, k)] = psid.get(("Amazon Core", k)) or "B0" + "".join(np.random.default_rng(abs(hash_(k))).choice(alnum, 8))
            else:
                psid[(P, k)] = "BRF-" + "".join(idrng.choice(list("0123456789"), 5))

    # ---- Price path ------------------------------------------------------------
    step_t = idx(PRICE_STEP)
    LP = np.zeros((NT, len(SKU_CODES)))
    for k in SKU_CODES:
        p = SKU[k]["price"]
        for t in range(NT):
            LP[t, SKU[k]["idx"]] = round(p / (1 + PRICE_STEP_PCT), 2) if t < step_t else p

    caps = {}
    out = {"platforms": {}, "diag": {}}
    all_sales = {}

    for P in PLAT_ORDER:
        cfg = PLAT[P]
        mix = {k: v / sum(cfg["mix"].values()) for k, v in cfg["mix"].items()}
        skus = list(mix)
        K = len(skus)
        kx = {k: i for i, k in enumerate(skus)}
        regs = list(cfg["regions"])

        # promo arrays (single promo per sku-day, deepest wins)
        depth = np.zeros((NT, K)); vshare = np.zeros((NT, K)); feat = np.zeros((NT, K), bool)
        meta = [[None] * K for _ in range(NT)]
        for pr in PROMOS[P]:
            wins = []
            if pr.get("weekend"):
                for d in DAYS:
                    if d.weekday() == 4:
                        wins.append((d, d + timedelta(days=1)))
            else:
                wins = [(date.fromisoformat(a), date.fromisoformat(b)) for a, b in pr["windows"]]
            targets = skus if pr["skus"] == "ALL" else [s for s in pr["skus"] if s in kx]
            for a, b in wins:
                for t in range(max(0, idx(a)), min(NT - 1, idx(b)) + 1):
                    for s in targets:
                        j = kx[s]
                        if pr["depth"] > depth[t, j]:
                            depth[t, j] = pr["depth"]; vshare[t, j] = pr["vs"]
                            feat[t, j] = pr["feat"]; meta[t][j] = (pr, a, b)
        # elasticities
        eps = np.array([cfg["elast"] * ELAST_MULT.get((P, s), ELAST_MULT.get(("*", s), 1.0)) for s in skus])
        promo_mult = (1 - depth) ** (-eps[None, :]) * np.where(feat, 1.18, 1.0)
        # post-promo dip for meaningful promos
        dip = np.ones((NT, K))
        for j in range(K):
            ends = [t for t in range(NT - 1) if depth[t, j] >= 0.10 and depth[t + 1, j] == 0]
            for e in ends:
                for n_, f in enumerate([0.90, 0.93, 0.95, 0.97, 0.98]):
                    if e + 1 + n_ < NT and depth[e + 1 + n_, j] == 0:
                        dip[e + 1 + n_, j] = f
        # suppression
        supp = np.zeros((NT, K), bool)
        for (pp, s), (a, b) in SUPPRESSION.items():
            if pp == P and s in kx:
                supp[idx(a):idx(b) + 1, kx[s]] = True

        # ad spend plan (campaign x day) and its weak link to demand
        camps = CAMPAIGNS[P]
        spend_c = {}
        for c in camps:
            lo, hi = (0.97, 1.0) if c["capped"] > 0 else (0.80, 0.97)
            spend_c[c["id"]] = np.round(c["budget"] * rng.uniform(lo, hi, NT), 2)
        sku_spend = np.zeros((NT, K))
        w_ck = {}
        for c in camps:
            ws = np.array([mix[s] ** 0.8 for s in c["skus"]]); ws = ws / ws.sum()
            for s, w in zip(c["skus"], ws):
                w_ck[(c["id"], s)] = w
                sku_spend[:, kx[s]] += spend_c[c["id"]] * w
        spend_idx = np.where(sku_spend.mean(0) > 0, sku_spend / np.maximum(sku_spend.mean(0), 1e-9), 1.0)
        ad_mult = np.clip(1 + 0.12 * (spend_idx - 1), 0.92, 1.12)

        # demand
        dow = dow_factors(cfg["dow_amp"])
        shock = rng.lognormal(0, 0.05, NT)
        D = {s: {} for s in skus}
        base_t = np.array([(1 + cfg["growth"]) ** (t / 7) for t in range(NT)])
        pay_t = np.array([cfg["payday"] if (DAYS[t].day >= 25 or DAYS[t].day <= 3) else 1.0 for t in range(NT)])
        dow_t = np.array([dow[DAYS[t].weekday()] for t in range(NT)])
        price_t = np.array([(1 + PRICE_STEP_PCT) ** (-0.5) if t >= step_t else 1.0 for t in range(NT)])
        gen_t = base_t * pay_t * dow_t * shock * price_t
        for s in skus:
            j = kx[s]
            for r in regs:
                mu = cfg["units"] * mix[s] * cfg["regions"][r] * gen_t * promo_mult[:, j] * dip[:, j] * ad_mult[:, j]
                mu = np.where(supp[:, j], 0.0, mu)
                D[s][r] = rng.poisson(mu).astype(int)

        # region -> node pair demand
        pairD = {}
        for s in skus:
            for r in regs:
                rem = D[s][r].copy(); remp = 1.0
                items = list(cfg["rmap"][r].items())
                for i, (n, share) in enumerate(items):
                    if i == len(items) - 1:
                        part = rem
                    else:
                        part = rng.binomial(rem, min(1.0, share / remp))
                    rem = rem - part; remp -= share
                    pairD.setdefault((s, n), {})[r] = part

        # ---- node simulation ---------------------------------------------------------
        ful = {(s, r): np.zeros(NT, int) for s in skus for r in regs}
        lost = {(s, r): np.zeros(NT, int) for s in skus for r in regs}
        inv_rows, po_rows = [], []
        for (s, n), Dp in pairD.items():
            regs_n = list(Dp)
            case = SKU[s]["case"]
            lt, review, safety, moq = cfg["lt"], cfg["review"], cfg["safety"], cfg["moq"]
            mu0 = max(1.0, sum(Dp[r][:14].mean() for r in regs_n))
            capd = CAP_DAYS.get((P, s), CAP_DEFAULT.get(P))
            cap = max(2 * case, int(math.ceil(capd * mu0 / case)) * case) if capd else None
            caps[(P, s, n)] = cap
            on_hand = int(round(INIT_COVER.get((P, s), cfg["tcover"]) * mu0))
            if cap:
                on_hand = min(on_hand, cap)
            pipe = []   # dict(arr, qty, placed, lt)
            phase = zlib.crc32(f"{P.replace('Amazon Core','Amazon')}{s}{n}".encode()) % review
            hist = []
            forced = {idx(a): (q, idx(e)) for a, q, e in FORCED_PO.get((P, s, n), [])}
            for t in range(NT):
                arrived = [p for p in pipe if p["arr"] == t]
                pipe = [p for p in pipe if p["arr"] > t]
                on_hand += sum(p["qty"] for p in arrived)
                for p in arrived:
                    po_rows.append(dict(P=P, s=s, n=n, placed=p["placed"], req=p["req"], conf=p["qty"],
                                        arr=t, lt=p["lt"], recv=True))
                if t in forced:
                    q, e = forced[t]
                    pipe.append(dict(arr=e, qty=q, placed=t, lt=e - t, req=q))
                    po_rows.append(dict(P=P, s=s, n=n, placed=t, req=q, conf=q, arr=e, lt=e - t, recv=False))
                d = [int(Dp[r][t]) for r in regs_n]
                tot = sum(d); start = on_hand
                if tot <= on_hand:
                    f = d
                elif on_hand == 0:
                    f = [0] * len(d)
                elif len(d) == 1:
                    f = [on_hand]
                else:
                    f = [int(x) for x in rng.multivariate_hypergeometric(np.array(d), on_hand)]
                ftot = sum(f); on_hand -= ftot; lost_t = tot - ftot
                for r, fv, dv in zip(regs_n, f, d):
                    ful[(s, r)][t] += fv; lost[(s, r)][t] += dv - fv
                hist.append(tot)
                is_supp = supp[t, kx[s]]
                if is_supp or start == 0:
                    oos = cfg["oh"]
                elif tot > start:
                    oos = cfg["oh"] * (1 - start / tot)
                else:
                    oos = 0.0
                # PO review
                fc = float(np.mean(hist[-14:])) if len(hist) >= 7 else mu0
                if (t - phase) % review == 0 and not is_supp:
                    pos = on_hand + sum(p["qty"] for p in pipe)
                    qty = max(0.0, fc * (lt + review + safety) - pos)
                    if cap:
                        lim = max(0.0, cap + fc * lt - pos)
                        qty = min(qty, lim)
                        qty = round(qty / case) * case
                        if qty == 0 and pos < fc * (lt + review):
                            qty = case
                    elif qty > 0:
                        qty = math.ceil(qty / case) * case
                        if qty < moq:
                            qty = moq if pos < fc * (lt + review) else 0
                    if qty > 0:
                        cr = cfg["confirm"]
                        for (a, b, rate) in CONFIRM_SHOCK.get((P, s), []):
                            if idx(a) <= t <= idx(b):
                                cr = rate
                        conf = int(qty * float(np.clip(rng.normal(cr, 0.02), 0.5, 1.0)) // case * case)
                        if cap and conf == 0 and cr >= 0.9:
                            conf = int(qty // case * case)      # a one-case PO is confirmed in full
                        extra = 0
                        for key in ((P, s, n), (P, s, "*")):
                            for a, b, ex in LT_SHOCK.get(key, []):
                                if idx(a) <= t <= idx(b):
                                    extra += ex
                        lt_act = max(1, int(round(lt + rng.normal(0, 0.7))) + extra)
                        if conf > 0:
                            pipe.append(dict(arr=t + lt_act, qty=conf, placed=t, lt=lt_act, req=int(qty)))
                        po_rows.append(dict(P=P, s=s, n=n, placed=t, req=int(qty), conf=conf,
                                            arr=t + lt_act, lt=lt_act, recv=False))
                open_po = sum(p["qty"] for p in pipe)
                eta = (spec.START + timedelta(days=min(p["arr"] for p in pipe))) if pipe else None
                in_tr = sum(p["qty"] for p in pipe if p["arr"] - t <= 3)
                cover = on_hand / max(fc, 0.5)
                h = min(0.12, 0.006 + 0.0003 * max(0.0, cover - 45))
                unh = int(round(on_hand * h))
                inv_rows.append(dict(
                    date=DAYS[t], platform_sku_id=psid[(P, s)], gtin=gtin[s], node_id=n,
                    listing_status="SUPPRESSED" if is_supp else "ACTIVE",
                    on_hand_units_sellable=int(on_hand), in_transit_units=int(in_tr), open_po_units=int(open_po),
                    next_po_eta_date=eta, unhealthy_units=unh, oos_hours=round(float(oos), 1),
                    operating_hours=float(cfg["oh"]),
                    in_stock_rate_pct=round(1 - oos / cfg["oh"], 4),
                    unfilled_demand_units=int(round(lost_t * rng.uniform(0.9, 1.1))) if lost_t > 0 else 0,
                    _s=s, _t=t))
        inv = pd.DataFrame(inv_rows)

        # ---- sales ----------------------------------------------------------------------------
        sales_rows = []
        for s in skus:
            j = kx[s]
            for r in regs:
                f = ful[(s, r)]; l = lost[(s, r)]
                rate_other = cfg["cancel_other"] * (1.5 if (P == "Noon" and r in ("Delta", "Upper Egypt")) else 1.0)
                c_other = rng.binomial(f, rate_other)
                units = f - c_other
                c_oos = rng.binomial(l, 0.35)
                ret = rng.binomial(units, cfg["ret"])
                for t in range(NT):
                    u = int(units[t])
                    lp = LP[t, SKU[s]["idx"]]
                    sp = round(lp * (1 - depth[t, j]), 2)
                    gross = round(u * lp, 2); disc = round(u * (lp - sp), 2); net = round(gross - disc, 2)
                    orders = 0
                    if u > 0:
                        orders = int(min(u, max(1, round(u / cfg["upo"] * rng.uniform(0.96, 1.04)))))
                    sales_rows.append(dict(
                        date=DAYS[t], platform_sku_id=psid[(P, s)], gtin=gtin[s], region=r, orders=orders,
                        units_sold=u, gross_gmv_ex_vat_egp=gross, discount_value_ex_vat_egp=disc,
                        net_gmv_ex_vat_egp=net, vendor_funded_discount_ex_vat_egp=round(disc * vshare[t, j], 2),
                        cancelled_units_oos=int(c_oos[t]), cancelled_units_other=int(c_other[t]),
                        returned_units=int(ret[t]), _s=s, _t=t, _lost=int(l[t]), _ful=int(f[t])))
        sales = pd.DataFrame(sales_rows)

        # ---- price and promo -----------------------------------------------------------------
        price_rows = []
        for s in skus:
            j = kx[s]
            for t in range(NT):
                lp = LP[t, SKU[s]["idx"]]; sp = round(lp * (1 - depth[t, j]), 2)
                m = meta[t][j]
                if m is None:
                    price_rows.append(dict(date=DAYS[t], platform_sku_id=psid[(P, s)], gtin=gtin[s],
                                           list_price_ex_vat_egp=lp, selling_price_ex_vat_egp=sp,
                                           discount_depth_pct=0.0, promo_id=None, promo_name=None,
                                           promo_type="NONE", funding="NONE", vendor_funding_share_pct=0.0,
                                           promo_start_date=None, promo_end_date=None, featured_placement="N"))
                else:
                    pr, a, b = m
                    fund = "PLATFORM" if pr["vs"] == 0 else ("VENDOR" if pr["vs"] == 1 else "SHARED")
                    price_rows.append(dict(date=DAYS[t], platform_sku_id=psid[(P, s)], gtin=gtin[s],
                                           list_price_ex_vat_egp=lp, selling_price_ex_vat_egp=sp,
                                           discount_depth_pct=round(1 - sp / lp, 4), promo_id=pr["id"],
                                           promo_name=pr["name"], promo_type=pr["type"], funding=fund,
                                           vendor_funding_share_pct=pr["vs"], promo_start_date=a, promo_end_date=b,
                                           featured_placement="Y" if pr["feat"] else "N"))
        price = pd.DataFrame(price_rows)

        # ---- ads ---------------------------------------------------------------------------------
        net_sk = sales.groupby(["_s", "_t"])["net_gmv_ex_vat_egp"].sum()
        ful_sk = sales.groupby(["_s", "_t"])["_ful"].sum(); lost_sk = sales.groupby(["_s", "_t"])["_lost"].sum()
        raw = []
        seas = 1.0 + 0.10 * (dow_t - 1)
        for c in camps:
            for s in c["skus"]:
                j = kx[s]
                for t in range(NT):
                    sp_ = spend_c[c["id"]][t] * w_ck[(c["id"], s)]
                    fl, ls = ful_sk.get((s, t), 0), lost_sk.get((s, t), 0)
                    fill = 0.0 if supp[t, j] else (fl / (fl + ls) if (fl + ls) > 0 else 1.0)
                    if cfg["pauses"] and fill < 0.25:
                        sp_ *= 0.1
                    att = sp_ * c["roas"] * seas[t] * rng.lognormal(0, 0.18) * (fill ** 1.5) * (1 + 0.5 * depth[t, j])
                    raw.append(dict(c=c, s=s, t=t, spend=sp_, att=att))
        rdf = pd.DataFrame([dict(cid=r["c"]["id"], s=r["s"], t=r["t"], spend=r["spend"], att=r["att"]) for r in raw])
        tot_att = rdf.groupby(["s", "t"])["att"].transform("sum")
        netv = np.array([net_sk.get((r.s, r.t), 0.0) for r in rdf.itertuples()])
        scale = np.where(tot_att > 0.55 * netv, 0.55 * netv / np.maximum(tot_att, 1e-9), 1.0)
        rdf["att"] = rdf["att"] * scale
        cmap = {c["id"]: c for c in camps}
        ads_rows = []
        for r in rdf.itertuples():
            c = cmap[r.cid]; s = r.s; t = r.t; j = kx[s]
            sp_ = round(float(r.spend), 2)
            clicks = int(max(0, round(sp_ / (c["cpc"] * rng.uniform(0.92, 1.08)))))
            impr = int(round(clicks / (c["ctr"] * rng.uniform(0.9, 1.1)))) if clicks else 0
            sell = round(LP[t, SKU[s]["idx"]] * (1 - depth[t, j]), 2)
            att_sales = round(float(r.att), 2)
            units = int(round(att_sales / sell)) if att_sales > 0 else 0
            orders = min(units, max(1, int(round(units / cfg["upo"])))) if units > 0 else 0
            clicks = max(clicks, orders * 3)
            lost_share = c["capped"] * rng.uniform(0.85, 1.15) if c["capped"] > 0 else rng.uniform(0, 0.03)
            ads_rows.append(dict(
                date=DAYS[t], campaign_id=c["id"], campaign_name=c["name"], ad_type=c["ad_type"],
                objective=c["obj"], platform_sku_id=psid[(P, s)], gtin=gtin[s], impressions=impr,
                clicks=clicks, ad_spend_ex_vat_egp=sp_, attributed_orders_7d=orders,
                attributed_units_7d=units, attributed_sales_7d_ex_vat_egp=att_sales,
                daily_budget_egp=float(c["budget"]),
                impression_share_lost_budget_pct=round(float(min(0.6, lost_share)), 3)))
        ads = pd.DataFrame(ads_rows)

        # ---- service (weekly) --------------------------------------------------------------------------
        po = pd.DataFrame(po_rows)
        svc_rows = []
        sales["_w"] = sales["_t"] // 7
        for s in skus:
            for w in range(len(WEEKS)):
                ss = sales[(sales["_s"] == s) & (sales["_w"] == w)]
                orders = int(ss["orders"].sum()); units = int(ss["units_sold"].sum())
                lo_oos = int(round(ss["cancelled_units_oos"].sum() / cfg["upo"]))
                lo_oth = int(round(ss["cancelled_units_other"].sum() / cfg["upo"]))
                tot_orders = orders + lo_oos + lo_oth
                ret = float(ss["returned_units"].sum()) / units if units else 0.0
                req = conf = recv = 0; lts = []; ontime = []
                if len(po):
                    pp = po[(po["P"] == P) & (po["s"] == s)]
                    placed = pp[(~pp["recv"]) & (pp["placed"] // 7 == w)]
                    req = int(placed["req"].sum()); conf = int(placed["conf"].sum())
                    got = pp[(pp["recv"]) & (pp["arr"] // 7 == w)]
                    recv = int(got["conf"].sum())
                    lts = list(got["lt"]); ontime = [1 if lt_ <= cfg["lt"] + 1 else 0 for lt_ in lts]
                svc_rows.append(dict(
                    week_start=WEEKS[w], platform_sku_id=psid[(P, s)], gtin=gtin[s], customer_orders=orders,
                    fully_filled_orders_pct=round(orders / tot_orders, 4) if tot_orders else 1.0,
                    lost_orders_oos=lo_oos, lost_orders_other=lo_oth, return_rate_pct=round(ret, 4),
                    po_units_requested=req, po_units_confirmed=conf, po_units_received=recv,
                    avg_lead_time_days=round(float(np.mean(lts)), 1) if lts else None,
                    on_time_receipt_pct=round(float(np.mean(ontime)), 2) if ontime else None))
        service = pd.DataFrame(svc_rows)

        out["platforms"][P] = dict(sales=sales, inventory=inv, price=price, ads=ads, service=service,
                                   po=po, psid=psid, skus=skus, depth=depth, supp=supp, kx=kx)
        all_sales[P] = sales

    # ---- market ----------------------------------------------------------------------------------------------
    mrng = np.random.default_rng(99)
    comp_ids = {}
    for P in PLAT_ORDER:
        for i, c in enumerate(COMP):
            if P == "Talabat Mart":
                comp_ids[(P, i)] = "TLB-" + "".join(mrng.choice(list("0123456789"), 6))
            elif P == "Noon":
                comp_ids[(P, i)] = "N" + "".join(mrng.choice(list("0123456789"), 8)) + "A"
            elif P == "Amazon Core":
                comp_ids[(P, i)] = "B0" + "".join(mrng.choice(alnum, 8))
            elif P == "Amazon Now":
                comp_ids[(P, i)] = comp_ids.get(("Amazon Core", i)) or "B0" + "".join(np.random.default_rng(hash_(str(i))).choice(alnum, 8))
            else:
                comp_ids[(P, i)] = "BRF-" + "".join(mrng.choice(list("0123456789"), 5))
    comp_gtin = [ean13("6221" + f"{i + 1:08d}") for i in range(len(COMP))]
    for P in PLAT_ORDER:
        d = out["platforms"][P]
        sales = d["sales"]; inv = d["inventory"]
        inv["_w"] = inv["_t"] // 7
        wk_sku = sales.groupby(["_s", "_w"]).agg(units=("units_sold", "sum"), gmv=("net_gmv_ex_vat_egp", "sum")).reset_index()
        stock_wk = inv.groupby(["_s", "_w"])["in_stock_rate_pct"].mean()
        cat_rows, sku_rows = [], []
        # category totals
        for cat in ["Wipes", "Skin Care"]:
            sp_cat = wk_sku[wk_sku["_s"].map(lambda x: SKU[x]["cat"] == cat)].groupby("_w")["gmv"].sum()
            c0 = float(sp_cat.iloc[0]) / TARGET_SHARE[(P, cat)]
            comps = [(i, c) for i, c in enumerate(COMP) if c[2] == cat and not (P in SMALL_PACK_CHANNELS and ("3x" in c[1] or "500ml" in c[1]))]
            for w in range(len(WEEKS)):
                total = c0 * (1 + CAT_GROWTH[P]) ** w * mrng.lognormal(0, 0.015)
                sprout = float(sp_cat.get(w, 0.0))
                pool = max(total - sprout, 0.5 * total)
                total = sprout + pool
                wts = np.array([c[5] * SUB_MULT[P][c[3]] * (1 + c[6]) ** w * mrng.lognormal(0, 0.05) for _, c in comps])
                named = pool * NAMED_SHARE_OF_POOL * wts / wts.sum()
                tail = pool * (1 - NAMED_SHARE_OF_POOL)
                rows = []   # (brand, product, sub, price, value, units, id, gtin, own, instock, sku_code)
                for (i, c), v in zip(comps, named):
                    pr_ = c[4] * (1 + mrng.normal(0, 0.01)) * (1.0 if WEEKS[w] < PRICE_STEP else 1.03)
                    rows.append(dict(brand=c[0], product=c[1], sub=c[3], price=pr_, gmv=float(v),
                                     units=int(round(v / pr_)), id=comp_ids[(P, i)], gtin=comp_gtin[i], own="N",
                                     instock=float(np.clip(mrng.normal(0.985 if c[0] == "Nuvo Baby" else 0.955, 0.02), 0.85, 1.0)),
                                     sos=0.0, rating=round(3.9 + (zlib.crc32(c[1].encode()) % 8) / 10, 1), reviews=int(300 + c[5] * 120 + w * c[5] * 3)))
                for s in d["skus"]:
                    if SKU[s]["cat"] != cat:
                        continue
                    r_ = wk_sku[(wk_sku["_s"] == s) & (wk_sku["_w"] == w)]
                    gmv = float(r_["gmv"].iloc[0]); un = int(r_["units"].iloc[0])
                    rows.append(dict(brand=spec.BRAND, product=SKU[s]["name"], sub=SKU[s]["sub"],
                                     price=(gmv / un if un else SKU[s]["price"]), gmv=round(gmv, 2), units=un,
                                     id=d["psid"][(P, s)], gtin=gtin[s], own="Y",
                                     instock=float(stock_wk.get((s, w), 1.0)), sos=0.0,
                                     rating=round(4.1 + (SKU[s]["idx"] % 5) / 10, 1), reviews=int(180 + SKU[s]["idx"] * 60 + w * 14)))
                named_sub = {}
                for r_ in rows:
                    named_sub[r_["sub"]] = named_sub.get(r_["sub"], 0.0) + r_["gmv"] if r_["own"] == "N" else named_sub.get(r_["sub"], 0.0)
                comp_named_total = sum(named_sub.values())
                for sub in sorted({r_["sub"] for r_ in rows}):
                    sub_rows = [r_ for r_ in rows if r_["sub"] == sub]
                    sub_val = sum(r_["gmv"] for r_ in sub_rows) + tail * (named_sub.get(sub, 0.0) / comp_named_total if comp_named_total else 0)
                    sub_units = sum(r_["units"] for r_ in sub_rows)
                    avg_p = (sum(r_["gmv"] for r_ in sub_rows) / sub_units) if sub_units else 100
                    tail_units = (tail * (named_sub.get(sub, 0.0) / comp_named_total if comp_named_total else 0)) / avg_p
                    cat_rows.append(dict(week_start=WEEKS[w], category=cat, sub_category=sub,
                                         category_gmv_ex_vat_egp=round(sub_val, 2),
                                         category_units=int(round(sub_units + tail_units)),
                                         active_brands=int(mrng.integers(5, 12)),
                                         active_skus=int(mrng.integers(18, 70))))
                for r_ in rows:
                    r_["share"] = r_["gmv"] / total
                    r_["sos"] = float(np.clip(r_["share"] * mrng.uniform(0.7, 1.4), 0.002, 0.2))
                rows.sort(key=lambda x: -x["gmv"])
                for rank, r_ in enumerate(rows, 1):
                    if rank <= 20 or r_["own"] == "Y":
                        sku_rows.append(dict(
                            week_start=WEEKS[w], category=cat, sub_category=r_["sub"], brand=r_["brand"],
                            product_name=r_["product"], platform_sku_id=r_["id"], gtin=r_["gtin"],
                            is_own_brand=r_["own"], units=r_["units"], gmv_ex_vat_egp=round(r_["gmv"], 2),
                            avg_price_ex_vat_egp=round(r_["price"], 2), rank_by_value=rank,
                            in_stock_rate_pct=round(r_["instock"], 4), share_of_search_pct=round(r_["sos"], 4),
                            avg_rating=r_["rating"], review_count=r_["reviews"]))
        d["market_cat"] = pd.DataFrame(cat_rows); d["market_sku"] = pd.DataFrame(sku_rows)

    # ---- setup tables --------------------------------------------------------------------------------------------------
    setup = {}
    setup["SKU_Master"] = pd.DataFrame([dict(
        sku_code=c, product_name=SKU[c]["name"], brand=spec.BRAND, category=SKU[c]["cat"], sub_category=SKU[c]["sub"],
        pack_size=SKU[c]["pack"], gtin=gtin[c], list_price_ex_vat_egp=SKU[c]["price"],
        unit_cogs_ex_vat_egp=SKU[c]["cogs"], shelf_life_months=SKU[c]["shelf"], case_pack_units=SKU[c]["case"],
        status="ACTIVE") for c in SKU_CODES])
    setup["Platform_Listings"] = pd.DataFrame([dict(
        platform=P, sku_code=s, platform_sku_id=out["platforms"][P]["psid"][(P, s)], gtin=gtin[s],
        platform_title=SKU[s]["name"].replace("Sprout ", "Sprout | "),
        listed_since=date(2025, 3, 1) if SKU[s]["idx"] < 6 else date(2025, 9, 1))
        for P in PLAT_ORDER for s in out["platforms"][P]["skus"]])
    setup["Nodes"] = pd.DataFrame([dict(platform=P, node_id=n, node_name=v[0], node_type=v[1],
                                        operating_hours=float(PLAT[P]["oh"]))
                                   for P in PLAT_ORDER for n, v in PLAT[P]["nodes"].items()])
    setup["Region_Node_Map"] = pd.DataFrame([dict(platform=P, region=r, node_id=n, share_pct=sh)
                                             for P in PLAT_ORDER for r, m in PLAT[P]["rmap"].items()
                                             for n, sh in m.items()])
    setup["Replenishment_Params"] = pd.DataFrame([dict(
        platform=P, sku_code=s, planned_lead_time_days=PLAT[P]["lt"], review_cycle_days=PLAT[P]["review"],
        safety_stock_days=PLAT[P]["safety"], target_cover_days=PLAT[P]["tcover"], max_cover_days=PLAT[P]["maxcover"],
        moq_units_per_node=PLAT[P]["moq"]) for P in PLAT_ORDER for s in out["platforms"][P]["skus"]])
    setup["Platform_Terms"] = pd.DataFrame([dict(
        platform=P, parent_platform=PARENT[P], channel_type=PLAT[P]["ptype"], platform_margin_pct=PLAT[P]["margin"], payment_terms_days=PLAT[P]["pay"], vat_rate=0.14, target_in_stock_rate_pct=PLAT[P]["instock_t"],
        monthly_sales_target_egp=float(PLAT[P]["sales_t"]), monthly_ad_budget_egp=float(PLAT[P]["budget"]),
        target_roas=PLAT[P]["roas_t"], min_vendor_margin_pct=0.10) for P in PLAT_ORDER])
    cap_rows = []
    for P in PLAT_ORDER:
        if PLAT[P]["ptype"] != "Quick commerce":
            continue
        d = out["platforms"][P]; inv_ = d["inventory"]; rv = {v: k for (pp, k), v in d["psid"].items() if pp == P}
        mx = inv_.groupby(["platform_sku_id", "node_id"])["on_hand_units_sellable"].max()
        for (pid, n), v in mx.items():
            sk = rv[pid]; c_ = caps.get((P, sk, n))
            if not c_:
                c_ = int(math.ceil(v * 1.15 / SKU[sk]["case"])) * SKU[sk]["case"]   # not binding: sized above observed peak
            cap_rows.append(dict(platform=P, sku_code=sk, node_id=n, shelf_capacity_units=int(c_)))
    setup["Shelf_Capacity"] = pd.DataFrame(cap_rows)
    setup["Competitor_Brands"] = pd.DataFrame([dict(brand=b, tier=t, focus=f) for b, t, f in COMP_BRANDS])
    out["setup"] = setup
    return out
