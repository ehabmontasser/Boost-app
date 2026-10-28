import Link from "next/link";
import { canWrite } from "@/lib/auth";
import { overviewModel } from "@/lib/metrics";
import { pageCtx, type SearchParams } from "@/lib/page";
import { dayLabel, pctChange, periodQuery, trendLabel, vsShort } from "@/lib/period";
import { egp, pct } from "@/lib/format";
import { Bars, ShareLines } from "@/components/charts";
import { Empty, Header, Kpi, Title } from "@/components/ui";
import AnalyzeButton from "@/components/AnalyzeButton";
import PeriodPicker from "@/components/PeriodPicker";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: SearchParams }) {
  const { s, c, p, options } = await pageCtx(searchParams);
  if (!c || !p) return (<><Header title="Overview" /><Empty admin={canWrite(s)} /></>);
  const m = await overviewModel(c, p);
  const vs = vsShort(p);
  const change = (now: number, before: number | null | undefined) => { const t = pctChange(now, before); return t ? `${t} ${vs}` : ""; };
  const worst = [...m.rows].sort((a, b) => b.lostPct - a.lostPct)[0];
  // blended wipes share across all platforms, and its move against the comparison period
  const wb = m.market.wipesBlended;
  const movePts = wb.now !== null && wb.base !== null ? (wb.now - wb.base) * 100 : null;
  const base = p.prev ? vs : "since the first week";
  const trendNote = { week: "by week, last 13 weeks", month: "by month, last 12 months", quarter: "by quarter, last 8 quarters", ytd: "by week, year to date", custom: "over the selected dates", year: "by month" }[p.view];
  return (
    <>
      <Header title="Overview" sub={`${c.brandName} · ${m.rows.length} platforms · ${p.label}${p.prev ? ` · compared with ${p.prev.label}` : p.noPrev ? ` · ${p.noPrev}` : ""} · data through ${dayLabel(c.asOf!)}`}>
        <PeriodPicker view={p.view} periodKey={p.key} from={p.from} to={p.to} cmp={p.cmp} options={options!} />
      </Header>
      <section className="kpis" aria-label="Key figures">
        <Kpi info="What shoppers paid after discounts, excluding VAT, on all platforms in this period. The change is against the comparison you picked: the previous period or the same period last year." label="Net sales ex VAT" value={egp(m.totalNet)} note={change(m.totalNet, m.prevTotals?.net) || `${m.rows.length} platforms, ${p.short}`} />
        <Kpi info="Total spent on ads on all platforms in this period, excluding VAT. The % is ad spend as a share of net sales." label="Ad spend" value={egp(m.totalSpend)} note={`${pct(m.spendPct)} of sales${m.prevTotals ? ` · ${change(m.totalSpend, m.prevTotals.spend)}` : ""}`} />
        <Kpi info="Sales missed because products were out of stock: the units shoppers wanted but could not buy, valued at that day's price. The % is compared with net sales. Worst = the platform losing the biggest share of its sales." label="Demand lost to stockouts" value={egp(m.totalLost)} tone="bad" note={`${pct(m.lostPct)} of sales${worst ? ` · worst: ${worst.name} ${pct(worst.lostPct)}` : ""}`} />
        {wb.now !== null ? <Kpi info="Sprout's share of all wipes sold on the 5 platforms together (all brands). Bigger platforms count more, so it is not a simple average of the platform shares. The line below shows the change against the comparison period." label="Wipes share, all platforms" value={pct(wb.now)} tone={movePts === null ? undefined : movePts < 0 ? "bad" : "good"} note={movePts === null ? "Blended across 5 platforms" : Math.abs(movePts) < 0.05 ? `Flat ${base}` : `${movePts < 0 ? "Down" : "Up"} ${Math.abs(movePts).toFixed(1)} pts ${base}`} /> : null}
      </section>
      <div className="row">
        <section className="card wide">
          <Title info="Net sales of each platform in this period, excluding VAT. The longest bar is the biggest platform.">Net sales by platform</Title>
          <Bars rows={[...m.rows].sort((a, b) => b.net - a.net).map((r) => ({ code: r.code, label: r.name, value: r.net }))} format={(n) => egp(n)} />
          <div className="muted">All values ex VAT, EGP. Bar length is relative to the largest platform.</div>
        </section>
        <section className="card">
          <Title info="Sprout's share of all wipes sold on each platform (all brands). Weekly view: the last 13 weeks. Monthly: the last 12 months. Quarterly: the last 8 quarters. YTD, custom and full period: each week or month in the range.">Wipes share of the platform segment</Title>
          <ShareLines series={m.market.wipes} label={`Wipes share by platform, ${trendNote}`} start={trendLabel(m.market.trendStart)} end={trendLabel(m.market.trendEnd)} />
          <div className="muted">Sprout's share of wipes sales on each platform, {trendNote}.</div>
        </section>
      </div>
      <section className="card">
        <Title info="One row per platform for this period. Ad spend %: ad spend as a share of net sales. ROAS = sales from ads (within 7 days of a click) divided by ad spend. A ROAS of 4 means EGP 4 of sales for every EGP 1 spent. Lost to stockouts turns red above 3% of sales.">Platform scorecard</Title>
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
        <div className="muted">Go deeper: <Link href={`/replenishment?${periodQuery(p)}`} className="info">Inventory Management</Link> · <Link href={`/ads?${periodQuery(p)}`} className="info">Performance Marketing</Link> · <Link href={`/promotions?${periodQuery(p)}`} className="info">Deals and Promotions</Link> · <Link href={`/market?${periodQuery(p)}`} className="info">Market Share</Link></div>
      </section>
      <AnalyzeButton key={periodQuery(p)} module="overview" query={periodQuery(p)} canRefresh={canWrite(s)} title={`What Claude flags across all platforms, ${p.short}`} />
    </>
  );
}
