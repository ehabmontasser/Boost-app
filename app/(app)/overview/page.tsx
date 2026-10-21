import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getCtx, overviewModel } from "@/lib/metrics";
import { egp, pct } from "@/lib/format";
import { Bars, ShareLines } from "@/components/charts";
import { Empty, Header, Kpi } from "@/components/ui";
import AnalyzeButton from "@/components/AnalyzeButton";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const s = await requireSession();
  const c = await getCtx();
  if (!c || !c.asOf) return (<><Header title="Overview" /><Empty admin={s.role === "admin"} /></>);
  const m = await overviewModel(c);
  const worst = [...m.rows].sort((a, b) => b.lostPct - a.lostPct)[0];
  const talabat = m.rows.find((r) => r.wipesFirst !== null && r.wipesLast !== null && r.wipesFirst - r.wipesLast > 0.01);
  return (
    <>
      <Header title="Overview" sub={`${c.brandName} · ${m.rows.length} channels · data through ${new Date(c.asOf + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`} />
      <section className="kpis" aria-label="Key figures">
        <Kpi label="Net sales ex VAT" value={egp(m.totalNet)} note={`${m.rows.length} channels, 13 weeks`} />
        <Kpi label="Ad spend" value={egp(m.totalSpend)} note={`${pct(m.spendPct)} of sales`} />
        <Kpi label="Demand lost to stockouts" value={egp(m.totalLost)} tone="bad" note={`${pct(m.lostPct)} of sales${worst ? ` · worst: ${worst.name} ${pct(worst.lostPct)}` : ""}`} />
        {talabat ? <Kpi label={`Wipes share, ${talabat.name}`} value={pct(talabat.wipesLast ?? 0)} tone="bad" note={`Down ${(((talabat.wipesFirst ?? 0) - (talabat.wipesLast ?? 0)) * 100).toFixed(1)} pts since week 1`} /> : null}
      </section>
      <div className="row">
        <section className="card wide">
          <h2>Net sales by channel</h2>
          <Bars rows={[...m.rows].sort((a, b) => b.net - a.net).map((r) => ({ code: r.code, label: r.name, value: r.net }))} format={(n) => egp(n)} />
          <div className="muted">All values ex VAT, EGP. Bar length is relative to the largest channel.</div>
        </section>
        <section className="card">
          <h2>Wipes share of the platform segment</h2>
          <ShareLines series={m.market.wipes} label="Wipes share by channel from week 1 to the latest week" />
          <div className="muted">Sprout's share of wipes sales on each platform, by week.</div>
        </section>
      </div>
      <section className="card">
        <h2>Channel scorecard</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Channel</th><th className="r">Net sales</th><th className="r">Ad spend</th><th className="r">ROAS</th><th className="r">Lost to stockouts</th><th className="r">Wipes share</th></tr></thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.code}>
                  <td><b>{r.name}</b><div className="muted">{r.channel}</div></td>
                  <td className="r">{egp(r.net)}</td>
                  <td className="r">{egp(r.spend)} <span className="muted">({pct(r.spendPct)})</span></td>
                  <td className="r">{r.roas.toFixed(1)}</td>
                  <td className={"r " + (r.lostPct > 0.03 ? "bad" : "")}>{egp(r.lostValue)} <span className="muted">({pct(r.lostPct)})</span></td>
                  <td className="r">{r.wipesLast === null ? "-" : pct(r.wipesLast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted">Go deeper: <Link href="/replenishment" className="info">Replenishment</Link> · <Link href="/ads" className="info">Ads budget</Link> · <Link href="/promotions" className="info">Promotions</Link> · <Link href="/market" className="info">Market segment share</Link></div>
      </section>
      <AnalyzeButton module="overview" title="What Claude flags across all channels" />
    </>
  );
}
