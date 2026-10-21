import pandas as pd, numpy as np
import simulate as S, spec
pd.set_option("display.width",200); pd.set_option("display.max_columns",30)
o=S.build()
for P in S.PLAT_ORDER:
    d=o["platforms"][P]; s=d["sales"]; a=d["ads"]
    s["m"]=[S.DAYS[t].strftime("%Y-%m") for t in s["_t"]]
    print(f"\n==== {P}: sales rows {len(s)} inv {len(d['inventory'])} price {len(d['price'])} ads {len(a)} svc {len(d['service'])} mkt_sku {len(d['market_sku'])}")
    print(s.groupby("m")["net_gmv_ex_vat_egp"].sum().round(0).to_dict())
    cs=a.groupby("campaign_name")[["ad_spend_ex_vat_egp","attributed_sales_7d_ex_vat_egp"]].sum()
    cs["roas"]=(cs.attributed_sales_7d_ex_vat_egp/cs.ad_spend_ex_vat_egp).round(2)
    print(cs.round(0).to_string())
    tot=s.net_gmv_ex_vat_egp.sum()
    print(f"ad spend {100*a.ad_spend_ex_vat_egp.sum()/tot:.1f}% of net sales; attributed {100*a.attributed_sales_7d_ex_vat_egp.sum()/tot:.1f}%")
    # lost
    lost=s.groupby("_s")[["_lost","_ful"]].sum(); lost["lost_pct"]=(lost._lost/(lost._lost+lost._ful)*100).round(1)
    print("lost-demand % by sku:", lost["lost_pct"].to_dict())
# planted stories
t=o["platforms"]["Talabat Mart"]; inv=t["inventory"]; ps=t["psid"]
g=inv[(inv.platform_sku_id==ps[("Talabat Mart","SBC-02")])]
for n in ["TLB-GIZ","TLB-CAI-E","TLB-CAI-W","TLB-ALX"]:
    x=g[g.node_id==n].set_index("_t")
    oosdays=(x.oos_hours>=x.operating_hours*0.5).sum()
    last=x.iloc[-1]
    print(n,"S02 OOS days:",oosdays,"| last: on_hand",last.on_hand_units_sellable,"open_po",last.open_po_units,"eta",last.next_po_eta_date,"| days with OOS in Sep:", [S.DAYS[i].day for i in x.index if S.DAYS[i].month==9 and x.loc[i].oos_hours>0][:20])
# daily run rate last 14d for S02 Giza
sl=t["sales"]; r=sl[(sl._s=="SBC-02")&(sl.region=="Giza")&(sl._t>=S.NT-14)]["units_sold"].sum()/14
print("S02 Giza last-14d run rate/day:",round(r,1))
am=o["platforms"]["Amazon"]; ia=am["inventory"]; pa=am["psid"][("Amazon","SBC-05")]
x=ia[ia.platform_sku_id==pa]; last=x[x._t==S.NT-1]
sa=am["sales"]; rr=sa[(sa._s=="SBC-05")&(sa._t>=S.NT-14)]["units_sold"].sum()/14
print("Amazon S05 last day on_hand",last.on_hand_units_sellable.sum(),"open_po",last.open_po_units.sum(),"unhealthy",last.unhealthy_units.sum(),"run rate/day",round(rr,1),"cover days",round(last.on_hand_units_sellable.sum()/rr))
no=o["platforms"]["Noon"]; svc=no["service"]; p9=no["psid"][("Noon","SBC-09")]
print(svc[svc.platform_sku_id==p9][["week_start","customer_orders","fully_filled_orders_pct","lost_orders_oos","po_units_requested","po_units_confirmed","po_units_received","avg_lead_time_days"]].to_string())
