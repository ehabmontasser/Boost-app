"""Reads the written pack and prints the headline numbers behind each demo storyline."""
import glob, os
import numpy as np, pandas as pd
import spec
PACK=os.path.join(os.path.dirname(os.path.abspath(__file__)),"out","Sprout_Baby_Care_Data_Pack")
pd.set_option("display.width",220); pd.set_option("display.max_columns",40)
def load(P,feed,sheet="Data"):
    code=spec.PLATFORM_FOLDERS[P][0]
    fs=sorted(glob.glob(f"{PACK}/0[23]_*/*/{code}_*_{feed}_*.xlsx"))
    return pd.concat([pd.read_excel(f,sheet_name=sheet,dtype={"gtin":str,"platform_sku_id":str}) for f in fs],ignore_index=True)
setup=os.path.join(PACK,"01_Setup","SETUP_00_BRAND_MASTER_v1.xlsx")
skum=pd.read_excel(setup,"SKU_Master",dtype={"gtin":str}); lst=pd.read_excel(setup,"Platform_Listings",dtype={"gtin":str,"platform_sku_id":str})
terms=pd.read_excel(setup,"Platform_Terms").set_index("platform")
name=dict(zip(skum.sku_code,skum.product_name)); cogs=dict(zip(skum.sku_code,skum.unit_cogs_ex_vat_egp))
sid={(r.platform,r.sku_code):r.platform_sku_id for r in lst.itertuples()}; rev={(r.platform,r.platform_sku_id):r.sku_code for r in lst.itertuples()}
D={}
for P in spec.PLATFORM_FOLDERS:
    for f in ["SALES","INVENTORY","PRICE_PROMO","ADS","SERVICE"]: D[(P,f)]=load(P,f)
    D[(P,"MKT")]=load(P,"MARKET","Data_SKUs"); D[(P,"CAT")]=load(P,"MARKET","Data_Category")
    for f in ["SALES","INVENTORY","PRICE_PROMO","ADS"]: D[(P,f)]["date"]=pd.to_datetime(D[(P,f)]["date"])
    D[(P,"SALES")]["sku"]=D[(P,"SALES")].platform_sku_id.map(lambda x:rev[(P,x)])
T="Talabat Mart"
print("=== 1 PLATFORM TOTALS (net sales ex VAT) ===")
for P in spec.PLATFORM_FOLDERS:
    s=D[(P,"SALES")]; m=s.groupby(s.date.dt.to_period("M"))["net_gmv_ex_vat_egp"].sum().round(0)
    print(P, f"total {s.net_gmv_ex_vat_egp.sum():,.0f}", {str(k):int(v) for k,v in m.items()})
print("\n=== 2 REPLENISHMENT ===")
inv=D[(T,"INVENTORY")]; s2=sid[(T,"SBC-02")]; x=inv[inv.platform_sku_id==s2]
for n in ["TLB-GIZ","TLB-CAI-E"]:
    y=x[x.node_id==n].sort_values("date"); last=y.iloc[-1]
    rr=D[(T,"SALES")]; rr=rr[(rr.sku=="SBC-02")&(rr.date>"2026-10-04")]
    reg={"TLB-GIZ":["Giza"],"TLB-CAI-E":["Cairo"]}[n]; rate=rr[rr.region.isin(reg)].units_sold.sum()/14*(1 if n=="TLB-GIZ" else .55)
    sep=y[(y.date>="2026-09-10")&(y.date<="2026-09-30")&(y.oos_hours>0)]
    print(f"Talabat S02 {n}: last on_hand {last.on_hand_units_sellable}, open PO {last.open_po_units} ETA {str(last.next_po_eta_date)[:10]}, ~run rate {rate:.0f}/day -> cover {last.on_hand_units_sellable/max(rate,1):.1f} days | Sept OOS days {len(sep)} ({sep.date.dt.day.tolist()})")
ia=D[("Amazon Core","INVENTORY")]; a5=ia[(ia.platform_sku_id==sid[("Amazon Core","SBC-05")])&(ia.date=="2026-10-18")]
sa=D[("Amazon Core","SALES")]; r5=sa[(sa.sku=="SBC-05")&(sa.date>"2026-10-04")].units_sold.sum()/14
print(f"Amazon S05 Aloe: on_hand {a5.on_hand_units_sellable.sum()}, open PO {a5.open_po_units.sum()} (ETA {str(a5.next_po_eta_date.dropna().iloc[0])[:10]}), unhealthy {a5.unhealthy_units.sum()}, run rate {r5:.1f}/day -> cover {a5.on_hand_units_sellable.sum()/r5:.0f} days, with PO {(a5.on_hand_units_sellable.sum()+a5.open_po_units.sum())/r5:.0f} days")
sv=D[("Noon","SERVICE")]; v=sv[sv.platform_sku_id==sid[("Noon","SBC-09")]]
print("Noon S09 weekly fill:", v.fully_filled_orders_pct.round(2).tolist()); print("   conf/req:", f"{v.po_units_confirmed.sum()/v.po_units_requested.sum():.0%}", " avg lead time (planned 6):", round(v.avg_lead_time_days.dropna().mean(),1))
others=sv[sv.platform_sku_id!=sid[("Noon","SBC-09")]]; print("   Noon other SKUs conf/req:", f"{others.po_units_confirmed.sum()/others.po_units_requested.sum():.0%}")
print("\n=== 3 ADS ===")
for P in spec.PLATFORM_FOLDERS:
    a=D[(P,"ADS")]; g=a.groupby("campaign_name").agg(spend=("ad_spend_ex_vat_egp","sum"),att=("attributed_sales_7d_ex_vat_egp","sum"),lost=("impression_share_lost_budget_pct","mean"))
    g["roas"]=g.att/g.spend; tr=terms.loc[P,"target_roas"]; print(P,"target ROAS",tr); print(g.round(2).to_string())
a=D[(T,"ADS")]; a9=a[(a.platform_sku_id==sid[(T,"SBC-09")])&(a.date>="2026-09-08")&(a.date<="2026-09-28")]
print(f"Talabat spend on SUPPRESSED Antibacterial (Sep 8-28): EGP {a9.ad_spend_ex_vat_egp.sum():,.0f}, attributed EGP {a9.attributed_sales_7d_ex_vat_egp.sum():,.0f}")
print("\n=== 4 PROMO ===")
rows=[]
for P in spec.PLATFORM_FOLDERS:
    pr=D[(P,"PRICE_PROMO")]; s=D[(P,"SALES")]; pm=terms.loc[P,"platform_margin_pct"]
    daily=s.groupby(["sku","date"]).units_sold.sum().reset_index()
    for (pid,pname,sk),g in pr[pr.promo_id.notna()].assign(sku=lambda d:d.platform_sku_id.map(lambda x:rev[(P,x)])).groupby(["promo_id","promo_name","sku"]):
        d0,d1=pd.to_datetime(g.date.min()),pd.to_datetime(g.date.max())
        if (d1-d0).days+1<len(g)-1 and False: continue
        dd=daily[daily.sku==sk].set_index("date").units_sold
        base_idx=pd.date_range(d0-pd.Timedelta(days=14),d0-pd.Timedelta(days=1)); base=dd.reindex(base_idx).dropna()
        if len(base)<7 or dd.reindex(pd.date_range(d0,d1)).isna().any(): continue
        during=dd.reindex(pd.date_range(d0,d1)).mean(); b=base.mean()
        depth=g.discount_depth_pct.mean(); vs=g.vendor_funding_share_pct.mean(); lp=g.list_price_ex_vat_egp.mean(); c=cogs[sk]
        m0=lp*(1-pm)-c; m1=lp*(1-pm)-vs*lp*depth-c
        rows.append(dict(plat=P,promo=pname,sku=sk,depth=depth,vs=vs,base=b,during=during,uplift=during/b if b else np.nan,unit_margin_base=m0,unit_margin_promo=m1,profit_delta_per_day=during*m1-b*m0))
pdx=pd.DataFrame(rows)
for P in spec.PLATFORM_FOLDERS:
    g=pdx[pdx.plat==P].groupby("promo").agg(depth=("depth","mean"),uplift=("uplift","mean"),profit_delta_day=("profit_delta_per_day","sum"),skus=("sku","count")); print(P); print(g.round(2).to_string())
print("\n=== 5 MARKET SEGMENT SHARE (final week) ===")
for P in spec.PLATFORM_FOLDERS:
    mk=D[(P,"MKT")]; mk=mk[pd.to_datetime(mk.week_start)=="2026-10-12"]; w=mk[mk.category=="Wipes"].sort_values("rank_by_value")
    print(P,"top wipes:"); print(w[["rank_by_value","brand","product_name","sub_category","gmv_ex_vat_egp","is_own_brand","in_stock_rate_pct"]].head(8).to_string(index=False))
    own=set(mk[mk.is_own_brand=="Y"].product_name); allown=set(skum.product_name)
    print("   Sprout SKUs not on", P, ":", sorted(allown-own))
