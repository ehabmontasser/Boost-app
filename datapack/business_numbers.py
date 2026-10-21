import glob, os
import numpy as np, pandas as pd
import spec
exec(open("storylines.py").read().split('T="Talabat Mart"')[0])   # reuse loaders
T="Talabat Mart"
tot_sales=0; tot_ad=0
print("PLATFORM | net sales | ad spend | spend % | attributed ROAS | share of ad spend below target ROAS | unfilled-demand value | wipes share wk1->wk13")
for P in spec.PLATFORM_FOLDERS:
    s=D[(P,"SALES")]; a=D[(P,"ADS")]; inv=D[(P,"INVENTORY")]; pr=D[(P,"PRICE_PROMO")]
    ns=s.net_gmv_ex_vat_egp.sum(); sp=a.ad_spend_ex_vat_egp.sum(); at=a.attributed_sales_7d_ex_vat_egp.sum()
    g=a.groupby("campaign_name").agg(sp=("ad_spend_ex_vat_egp","sum"),att=("attributed_sales_7d_ex_vat_egp","sum")); g["r"]=g.att/g.sp
    below=g[g.r<terms.loc[P,"target_roas"]].sp.sum()/sp
    px=pr[["date","platform_sku_id","selling_price_ex_vat_egp"]].copy(); px["date"]=pd.to_datetime(px["date"])
    iv=inv.merge(px,on=["date","platform_sku_id"],how="left"); uv=(iv.unfilled_demand_units*iv.selling_price_ex_vat_egp).sum()
    print(f"{P} | {ns:,.0f} | {sp:,.0f} | {sp/ns:.1%} | {at/sp:.2f} | {below:.0%} | {uv:,.0f} ({uv/ns:.1%} of sales)")
    tot_sales+=ns; tot_ad+=sp
print(f"TOTAL net sales {tot_sales:,.0f}; ad spend {tot_ad:,.0f} ({tot_ad/tot_sales:.1%})")
s=D[("Talabat Mart","SALES")]; wk=s.groupby(s.date.dt.to_period("W").dt.start_time).net_gmv_ex_vat_egp.sum()
print("Talabat unfilled demand by SKU (value):")
inv=D[(T,"INVENTORY")]; px=D[(T,"PRICE_PROMO")][["date","platform_sku_id","selling_price_ex_vat_egp"]].copy(); px["date"]=pd.to_datetime(px["date"])
iv=inv.merge(px,on=["date","platform_sku_id"]); iv["v"]=iv.unfilled_demand_units*iv.selling_price_ex_vat_egp; iv["sku"]=iv.platform_sku_id.map(lambda x:rev[(T,x)])
print(iv.groupby("sku").v.sum().round(0).sort_values(ascending=False).head(4).to_dict())
# promo total profit effect
tot={}
for P in spec.PLATFORM_FOLDERS:
    pr=D[(P,"PRICE_PROMO")]; s=D[(P,"SALES")]; pm=terms.loc[P,"platform_margin_pct"]
    daily=s.groupby(["sku","date"]).units_sold.sum()
    sub=pr[pr.promo_id.notna()].copy(); sub["sku"]=sub.platform_sku_id.map(lambda x:rev[(P,x)]); sub["date"]=pd.to_datetime(sub["date"])
    for (pid,pname,sk),g in sub.groupby(["promo_id","promo_name","sku"]):
        d0,d1=g.date.min(),g.date.max(); days=len(g)
        dd=daily.loc[sk]
        base=dd.reindex(pd.date_range(d0-pd.Timedelta(days=14),d0-pd.Timedelta(days=1))).dropna()
        if len(base)<7: continue
        during=dd.reindex(g.date).mean(); b=base.mean(); lp=g.list_price_ex_vat_egp.mean(); depth=g.discount_depth_pct.mean(); vs=g.vendor_funding_share_pct.mean(); c=cogs[sk]
        m0=lp*(1-pm)-c; m1=lp*(1-pm)-vs*lp*depth-c
        tot[(P,pname)]=tot.get((P,pname),0)+(during*m1-b*m0)*days
for k,v in sorted(tot.items(), key=lambda x:x[1]): print(k, round(v))
neg=sum(v for v in tot.values() if v<0); pos=sum(v for v in tot.values() if v>0)
print("promo profit effect: dilutive",round(neg),"accretive",round(pos))
