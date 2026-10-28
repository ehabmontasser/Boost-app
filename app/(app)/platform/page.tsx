import Link from "next/link";
import { adsModel, marketModel, overviewModel, promoModel, replenishmentModel } from "@/lib/metrics";
import { canWrite } from "@/lib/auth";
import { pageCtx, type SearchParams } from "@/lib/page";
import { pctChange, periodQuery, vsShort } from "@/lib/period";
import { dateLabel, egp, int, pct } from "@/lib/format";
import { Empty, Header, Kpi, Pill, statusTone, SubSegmentTable, Title } from "@/components/ui";
import AnalyzeButton from "@/components/AnalyzeButton";
import PeriodPicker from "@/components/PeriodPicker";
import PlatformPicker from "@/components/PlatformPicker";

export const dynamic = "force-dynamic";

/** One platform across the four pillars: Inventory Management, Performance Marketing, Deals and Promotions, Market Share. */
export default async function PlatformAnalysis({ searchParams }: { searchParams: SearchParams }) {
  const { s, c, p, options } = await pageCtx(searchParams);
  if (!c || !p || !c.platforms.length) return (<><Header title="Platform Analysis" /><Empty admin={canWrite(s)} /></>);
  const wanted = ((await searchParams) as { platform?: string }).platform;
  const pl = c.platforms.find((x) => x.code === wanted) ?? c.platforms[0];
  const [o, rp, ad, pr, mk] = await Promise.all([overviewModel(c, p), replenishmentModel(c, p), adsModel(c, p), promoModel(c, p), marketModel(c, p)]);
  const mine = <T extends { platform: string }>(xs: T[]) => xs.filter((x) => x.platform === pl.code);
  const ov = o.rows.find((x) => x.code === pl.code)!;
  const vs = vsShort(p);
  const pq = periodQuery(p);
  const full = (href: string) => `${href}${pq ? `?${pq}` : ""}`;

  const action = rp ? mine(rp.actionAll) : [];
  const atRisk = action.filter((x) => x.status === "At risk");
  const over = rp ? mine(rp.overstock) : [];
  const lost = rp ? mine(rp.lostAll) : [];
  const po = rp ? mine(rp.poAll) : [];
  const camps = mine(ad.rows);
  const below = camps.filter((x) => x.roas < x.target).reduce((a, x) => a + x.spend, 0);
  const supp = mine(ad.suppressed)[0];
  const promos = mine(pr.rows);
  const promoNet = promos.reduce((a, x) => a + x.effect, 0);
  const shareOf = (xs: { code: string; now: number | null; base: number | null }[]) => xs.find((x) => x.code === pl.code);
  const wipes = shareOf(mk.wipesNow), skin = shareOf(mk.skinNow);
  const moveNote = (x?: { now: number | null; base: number | null }) =>
    x && x.base !== null && x.now !== null ? `${((x.now - x.base) * 100 >= 0 ? "+" : "")}${((x.now - x.base) * 100).toFixed(1)} pts ${p.prev ? vs : "since the first week"}` : undefined;
  const top = mk.top[pl.code] ?? [];
  const best = top.find((x) => x.own);
  const subs = mine(mk.subRows).sort((a, b) => a.share - b.share);
  const gaps = mk.gaps.find((g) => g.code === pl.code)?.missing ?? [];

  return (
    <>
      <Header title="Platform Analysis" sub={`${pl.name} (${pl.channel_type}) · ${p.label}${p.prev ? ` · compared with ${p.prev.label}` : p.noPrev ? ` · ${p.noPrev}` : ""} · all values ex VAT`}>
        <PlatformPicker value={pl.code} platforms={c.platforms.map((x) => ({ code: x.code, name: x.name }))} />
        <PeriodPicker view={p.view} periodKey={p.key} from={p.from} to={p.to} cmp={p.cmp} options={options!} />
      </Header>
      <section className="kpis" aria-label="Key figures">
        <Kpi info="Net sales on this platform over the selected period, ex VAT, after discounts (Sales files). The share is this platform's part of the brand's net sales on all platforms." label="Net sales" value={egp(ov.net)} note={`${pctChange(ov.net, ov.prevNet) ? `${pctChange(ov.net, ov.prevNet)} ${vs} · ` : ""}${pct(o.totalNet ? ov.net / o.totalNet : 0, 0)} of all platforms`} />
        <Kpi info="Ad spend on this platform over the selected period, ex VAT, and its ROAS: sales attributed within 7 days of a click / ad spend." label="Ad spend · ROAS" value={egp(ov.spend)} note={`ROAS ${ov.roas.toFixed(2)} · ${pct(ov.spendPct)} of sales`} />
        <Kpi info="Sales missed on this platform because products were out of stock: unfilled demand units x that day's selling price. The % is of the platform's net sales." label="Demand lost" value={egp(ov.lostValue)} tone={ov.lostPct > 0.03 ? "bad" : undefined} note={`${pct(ov.lostPct)} of sales`} />
        <Kpi info="The brand's wipes sales / wipes sales of all brands on this platform (Market files), for the weeks in the selected period, with the change in percentage points against the comparison." label="Wipes share" value={wipes?.now === null || !wipes ? "-" : pct(wipes.now)} tone={wipes && wipes.base !== null && wipes.now !== null && wipes.now - wipes.base < -0.0005 ? "bad" : undefined} note={moveNote(wipes)} />
      </section>

      <div className="pillar"><span className="pillar-n">1</span><h2>Inventory Management</h2><Link href={full("/replenishment")} className="info">All platforms</Link></div>
      <section className="kpis" aria-label="Inventory Management figures">
        <Kpi info="Store or warehouse and product combinations on this platform expected to run out before stock arrives, judged on the last day of the selected period (same rule as the Inventory Management page)." label="Nodes at risk" value={String(atRisk.length)} tone={atRisk.length ? "bad" : "good"} note={rp ? `on ${dateLabel(rp.asOf)}` : undefined} />
        <Kpi info="Products whose cover on this platform, all nodes together, is above the maximum cover days in the Brand Master." label="Overstocked lines" value={String(over.length)} tone="info" note={over[0] ? `${over[0].skuName}: ${int(over[0].cover)} days` : "None above max cover"} />
        <Kpi info="Units the platform confirmed on its purchase orders / units requested, for weeks in the selected period. Shows the product with the lowest rate." label="Lowest PO confirmation" value={po[0] ? pct(po[0].confirmRate ?? 0, 0) : "-"} tone={po[0] && (po[0].confirmRate ?? 1) < 0.85 ? "warn" : undefined} note={po[0]?.skuName} />
      </section>
      <section className="card">
          <Title info="At risk and Watch lines on this platform by node, most units short first. Cover = on hand / average daily units of the last 14 days.">Needs action</Title>
          <div className="tablewrap"><table>
            <thead><tr><th>Node · SKU</th><th className="r">Cover</th><th>Next PO</th><th className="r">Short by</th><th>Status</th></tr></thead>
            <tbody>{action.length === 0 ? <tr><td colSpan={5} className="muted">Nothing needs action{rp ? ` on ${dateLabel(rp.asOf)}` : ""}.</td></tr> : action.slice(0, 8).map((r, i) => (
              <tr key={i}><td><b>{r.nodeName}</b><div className="muted">{r.skuName}</div></td><td className="r">{r.cover.toFixed(1)} days</td><td>{r.eta ? dateLabel(r.eta) : "No open PO"}</td>
                <td className="r">{r.unitsAtRisk >= 1 ? `${int(r.unitsAtRisk)} units` : "-"}</td><td><Pill tone={statusTone(r.status)}>{r.status}</Pill></td></tr>
            ))}</tbody>
          </table></div>
        </section>
      <div className="row">
        <section className="card">
          <Title info="Products on this platform that lost the most sales value to stockouts over the selected period. In stock = 1 - out-of-stock hours / operating hours.">Biggest lost-demand lines</Title>
          <div className="tablewrap"><table className="fit">
            <thead><tr><th>SKU</th><th className="r">Lost</th><th className="r">In stock</th></tr></thead>
            <tbody>{lost.length === 0 ? <tr><td colSpan={3} className="muted">No demand lost in this period.</td></tr> : lost.slice(0, 6).map((x, i) => (
              <tr key={i}><td>{x.skuName}</td><td className="r">{egp(x.value)}</td><td className="r">{pct(x.inStock)}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
        <section className="card">
          <Title info="PO confirmed = units confirmed / units requested on this platform's purchase orders. Lead time = average days from PO to receipt (Service files), for weeks in the selected period. Lowest confirmation first.">Weakest supplier performance</Title>
          <div className="tablewrap"><table className="fit">
            <thead><tr><th>SKU</th><th className="r">PO confirmed</th><th className="r">Lead time</th></tr></thead>
            <tbody>{po.length === 0 ? <tr><td colSpan={3} className="muted">No purchase orders in this period.</td></tr> : po.slice(0, 6).map((x, i) => (
              <tr key={i}><td>{x.skuName}</td><td className="r">{pct(x.confirmRate ?? 0, 0)}</td><td className="r">{x.lead.toFixed(1)} days</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      </div>

      <div className="pillar"><span className="pillar-n">2</span><h2>Performance Marketing</h2><Link href={full("/ads")} className="info">All platforms</Link></div>
      <section className="kpis" aria-label="Performance Marketing figures">
        <Kpi info="Spend in this platform's campaigns whose ROAS is below their target ROAS (Brand Master, Platform_Terms)." label="Spend below target ROAS" value={egp(below)} tone={below ? "warn" : "good"} note={`${pct(ov.spend ? below / ov.spend : 0, 0)} of the platform's spend`} />
        <Kpi info="Campaigns on target that lost 15% or more of impressions because the budget ran out: candidates for more budget." label="Campaigns to scale" value={String(camps.filter((x) => x.flag.startsWith("Scale")).length)} tone="info" note={`of ${camps.length} campaigns`} />
        <Kpi info="Ad spend on days when the advertised listing was suppressed on this platform, so the ad could not sell it." label="Spent on suppressed listings" value={egp(supp?.spend ?? 0)} tone={supp?.spend ? "bad" : "good"} />
      </section>
      <section className="card">
        <Title info="Every campaign on this platform over the selected period. Share of platform = campaign spend / the platform's ad spend. Lost to budget = share of impressions lost because the budget ran out.">Campaigns</Title>
        <div className="tablewrap"><table>
          <thead><tr><th>Campaign</th><th>Type</th><th className="r">Spend</th><th className="r">Share of platform</th><th className="r">ROAS</th><th className="r">Target</th><th className="r">Lost to budget</th><th>Signal</th></tr></thead>
          <tbody>{camps.length === 0 ? <tr><td colSpan={8} className="muted">No ad spend on this platform in this period.</td></tr> : camps.map((r) => (
            <tr key={r.id}><td><b>{r.campaign}</b></td><td>{r.type}<div className="muted">{r.objective}</div></td><td className="r">{egp(r.spend)}</td><td className="r">{pct(r.spendShare, 0)}</td>
              <td className="r"><b>{r.roas.toFixed(1)}</b></td><td className="r">{r.target.toFixed(1)}</td><td className="r">{pct(r.lostShare, 0)}</td>
              <td><Pill tone={r.flag.startsWith("Scale") ? "info" : statusTone(r.flag)}>{r.flag}</Pill></td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <div className="pillar"><span className="pillar-n">3</span><h2>Deals and Promotions</h2><Link href={full("/promotions")} className="info">All platforms</Link></div>
      <section className="card">
        <Title info="Promotions on this platform running in the selected period. Each run is compared with the product's non-promotion days in the 14 days before it, after platform margin, cost of goods and the brand-funded discount. Volume lift = daily units during / normal daily units.">{`Every promotion, worst first · net effect ${egp(promoNet, false)}`}</Title>
        <div className="tablewrap"><table>
          <thead><tr><th>Promotion</th><th>Funding</th><th className="r">Depth</th><th className="r">Brand pays</th><th className="r">Volume lift</th><th className="r">Profit effect</th><th>Verdict</th></tr></thead>
          <tbody>{promos.length === 0 ? <tr><td colSpan={7} className="muted">No promotion ran on this platform in this period.</td></tr> : promos.map((r) => (
            <tr key={r.promo}><td><b>{r.promo}</b><div className="muted">{r.skus} SKU{r.skus === 1 ? "" : "s"}{r.runs > 1 ? ` · ${r.runs} runs` : ""}</div></td><td>{r.funding}</td>
              <td className="r">{pct(r.depth, 0)}</td><td className="r">{pct(r.vendorShare, 0)}</td><td className="r">{r.uplift.toFixed(2)}x</td>
              <td className={"r " + (r.effect < 0 ? "bad" : "good")}><b>{egp(r.effect, false)}</b></td>
              <td><Pill tone={r.effect < 0 ? "bad" : "good"}>{r.effect < 0 ? "Lost money" : "Earned its cost"}</Pill></td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <div className="pillar"><span className="pillar-n">4</span><h2>Market Share</h2><Link href={full("/market")} className="info">All platforms</Link></div>
      <section className="kpis" aria-label="Market Share figures">
        <Kpi info="The brand's skin care sales / skin care sales of all brands on this platform (Market files), for the weeks in the selected period." label="Skin care share" value={skin?.now === null || !skin ? "-" : pct(skin.now)} note={moveNote(skin)} />
        <Kpi info="The brand's highest-ranked wipes product on this platform by sales value in the last week of the period, within the top 8." label="Best wipes rank" value={best ? `#${best.rank}` : "Outside top 8"} tone={best && best.rank <= 3 ? "good" : "warn"} note={best?.product} />
        <Kpi info="Products in the SKU master with no listing on this platform (Brand Master, Platform_Listings)." label="SKUs not listed" value={String(gaps.length)} tone={gaps.length ? "warn" : "good"} note={gaps.length ? gaps.slice(0, 2).join(", ") + (gaps.length > 2 ? "..." : "") : "Full range"} />
      </section>
      <div className="row">
        <section className="card">
          <Title info="The top wipes products by sales value on this platform in the last week of the selected period (Market files).">{`Who leads wipes${mk.latestWeek ? `, week of ${dateLabel(mk.latestWeek)}` : ""}`}</Title>
          <div className="tablewrap"><table className="fit">
            <thead><tr><th className="r">#</th><th>Brand · product</th><th className="r">Sales</th></tr></thead>
            <tbody>{top.length === 0 ? <tr><td colSpan={3} className="muted">No market data for this week.</td></tr> : top.slice(0, 5).map((x) => (
              <tr key={x.rank}><td className="r">{x.rank}</td><td><b className={x.own ? "good" : ""}>{x.brand}</b><div className="muted">{x.product}</div></td><td className="r">{egp(x.gmv)}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
        <section className="card">
          <Title info="The brand's sales / sales of all brands in each sub-segment on this platform where the brand sells, over the weeks in the selected period (full period: the last week). Change = share now minus the share in the comparison period, in percentage points. Biggest drop first.">Share by sub-segment</Title>
          <SubSegmentTable rows={subs} />
        </section>
      </div>

      <AnalyzeButton key={`${pq}|${pl.code}`} module="platform" query={`${pq}${pq ? "&" : ""}platform=${pl.code}`} canRefresh={canWrite(s)} title={`Claude recommends: ${pl.name}, ${p.short}`} />
    </>
  );
}
