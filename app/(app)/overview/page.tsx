import Link from "next/link";
import { overviewModel } from "@/lib/metrics";
import { pageCtx, type SearchParams } from "@/lib/page";
import { dayLabel, pctChange, trendLabel, vsLabel } from "@/lib/period";
import { egp, pct } from "@/lib/format";
import { Bars, ShareLines } from "@/components/charts";
import { Empty, Header, Kpi, Title } from "@/components/ui";
import AnalyzeButton from "@/components/AnalyzeButton";
import PeriodPicker from "@/components/PeriodPicker";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: SearchParams }) {
  const { s, c, p, options } = await pageCtx(searchParams);
  if (!c || !p) return (<><Header title="Overview" /><Empty admin={s.role === "admin"} /></>);
  const m = await overviewModel(c, p);
  const vs = vsLabel(p);
  const change = (now: number, before: number | null | undefined) => { const t = pctChange(now, before); return t ? `${t} ${vs}` : ""; };
  const worst = [...m.rows].sort((a, b) => b.lostPct - a.lostPct)[0];
  // the platform whose wipes share fell most against the comparison period
  const drop = [...m.rows].filter((r) => r.wipesNow !== null && r.wipesBase !== null).sort((a, b) => ((a.wipesNow ?? 0) - (a.wipesBase ?? 0)) - ((b.wipesNow ?? 0) - (b.wipesBase ?? 0)))[0];
  const dropPts = drop ? ((drop.wipesNow ?? 0) - (drop.wipesBase ?? 0)) * 100 : 0;
  const base = p.prev ? vs : "since the first week";
  const trendNote = p.view === "month" ? "by month, last 12 months" : p.view === "week" ? "by week, last 13 weeks" : "by week";
  return (
    <>
      <Header title="Overview" sub={`${c.brandName} · ${m.rows.length} platforms · ${p.label}${p.prev ? ` · compared with ${p.prev.label}` : ""} · data through ${dayLabel(c.asOf!)}`}>
        <PeriodPicker view={p.view} periodKey={p.key} options={options!} />
      </Header>
      <section className="kpis" aria-label="Key figures">
        <Kpi info="What customers paid after all discounts, excluding VAT, summed across all platforms over the selected period. Net sales = gross sales minus discounts (Sales files). The change compares with the previous week or month." label="Net sales ex VAT" value={egp(m.totalNet)} note={change(m.totalNet, m.prevTotals?.net) || `${m.rows.length} platforms, ${p.short}`} />
        <Kpi info="Total media cost on all platforms over the selected period, excluding VAT (Ads files). The % below is ad spend divided by net sales." label="Ad spend" value={egp(m.totalSpend)} note={`${pct(m.spendPct)} of sales${m.prevTotals ? ` · ${change(m.totalSpend, m.prevTotals.spend)}` : ""}`} />
        <Kpi info="Sales missed because products were out of stock: demand units the platform could not fill (Inventory files) x that day's selling price (Price and Promo files), over the selected period. The % is lost demand divided by net sales. 'Worst' is the platform with the highest %." label="Demand lost to stockouts" value={egp(m.totalLost)} tone="bad" note={`${pct(m.lostPct)} of sales${worst ? ` · worst: ${worst.name} ${pct(worst.lostPct)}` : ""}`} />
        {drop ? <Kpi info="Sprout's share of all wipes sales on the platform whose share moved down the most: Sprout wipes sales / wipes sales of all brands (Market files), for the weeks in the selected period. The line below compares it with the previous period (or the first week, for the full period)." label={`Wipes share, ${drop.name}`} value={pct(drop.wipesNow ?? 0)} tone={dropPts < 0 ? "bad" : "good"} note={`${dropPts < 0 ? "Down" : "Up"} ${Math.abs(dropPts).toFixed(1)} pts ${base}`} /> : null}
      </section>
      <div className="row">
        <section className="card wide">
          <Title info="Net sales excluding VAT for each platform over the selected period. Bar length is relative to the largest platform.">Net sales by platform</Title>
          <Bars rows={[...m.rows].sort((a, b) => b.net - a.net).map((r) => ({ code: r.code, label: r.name, value: r.net }))} format={(n) => egp(n)} />
          <div className="muted">All values ex VAT, EGP. Bar length is relative to the largest platform.</div>
        </section>
        <section className="card">
          <Title info="Sprout wipes sales / wipes sales of all brands on each platform (Market files). Weekly view: the 13 weeks up to the selected week. Monthly view: the 12 months up to the selected month. Full period: every week.">Wipes share of the platform segment</Title>
          <ShareLines series={m.market.wipes} label={`Wipes share by platform, ${trendNote}`} start={trendLabel(m.market.trendStart)} end={trendLabel(m.market.trendEnd)} />
          <div className="muted">Sprout's share of wipes sales on each platform, {trendNote}.</div>
        </section>
      </div>
      <section className="card">
        <Title info="One row per platform over the selected period. Ad spend % = spend / net sales. ROAS = 7-day attributed sales / ad spend. Lost to stockouts = unfilled demand x selling price, red above 3% of net sales. Wipes share = the selected period.">Platform scorecard</Title>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Platform</th><th className="r">Net sales</th>{p.prev ? <th className="r">Change</th> : null}<th className="r">Ad spend</th><th className="r">ROAS</th><th className="r">Lost to stockouts</th><th className="r">Wipes share</th></tr></thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.code}>
                  <td><b>{r.name}</b><div className="muted">{r.channel}</div></td>
                  <td className="r">{egp(r.net)}</td>
                  {p.prev ? <td className={"r " + (r.prevNet && r.net < r.prevNet ? "bad" : "good")}>{pctChange(r.net, r.prevNet) || "-"}</td> : null}
                  <td className="r">{egp(r.spend)} <span className="muted">({pct(r.spendPct)})</span></td>
                  <td className="r">{r.roas.toFixed(1)}</td>
                  <td className={"r " + (r.lostPct > 0.03 ? "bad" : "")}>{egp(r.lostValue)} <span className="muted">({pct(r.lostPct)})</span></td>
                  <td className="r">{r.wipesNow === null ? "-" : pct(r.wipesNow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted">Go deeper: <Link href={`/replenishment?view=${p.view}&p=${p.key}`} className="info">Replenishment</Link> · <Link href={`/ads?view=${p.view}&p=${p.key}`} className="info">Ads budget</Link> · <Link href={`/promotions?view=${p.view}&p=${p.key}`} className="info">Promotions</Link> · <Link href={`/market?view=${p.view}&p=${p.key}`} className="info">Market segment share</Link></div>
      </section>
      <AnalyzeButton key={p.view + p.key} module="overview" view={p.view} periodKey={p.key} canRefresh={s.role === "admin"} title={`What Claude flags across all platforms, ${p.short}`} />
    </>
  );
}
