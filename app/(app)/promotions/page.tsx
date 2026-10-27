import { requireSession } from "@/lib/auth";
import { getCtx, promoModel } from "@/lib/metrics";
import { egp, pct } from "@/lib/format";
import { Empty, Header, Kpi, Pill, Title } from "@/components/ui";
import AnalyzeButton from "@/components/AnalyzeButton";

export const dynamic = "force-dynamic";

export default async function Promotions() {
  const s = await requireSession();
  const c = await getCtx();
  if (!c || !c.asOf) return (<><Header title="Promotions" /><Empty admin={s.role === "admin"} /></>);
  const m = await promoModel(c);
  const worst = m.rows[0], best = m.rows[m.rows.length - 1];
  return (
    <>
      <Header title="Promotions" sub="Estimated profit effect against the 14 days before each promotion, after platform margin, cost of goods and the brand-funded discount" />
      <section className="kpis" aria-label="Key figures">
        <Kpi info="Promotions with at least 7 days of sales in the 14 days before they started, so there is a fair before-and-after comparison." label="Promotions analysed" value={String(m.rows.length)} note="across all platforms" />
        <Kpi info="Sum of the profit effect of every promotion that lost money. Profit effect = (daily units during x margin with the discount - daily units in the 14 days before x normal margin) x promotion days. Margin = list price after the platform margin, minus cost of goods, minus the brand-funded part of the discount." label="Profit given away" value={egp(m.dilutive)} tone="bad" note={`${m.rows.filter((r) => r.effect < 0).length} promotions lost money`} />
        <Kpi info="Sum of the profit effect of every promotion that earned more than it cost, using the same method as Profit given away." label="Profit added" value={egp(m.accretive)} tone="good" note={`${m.rows.filter((r) => r.effect > 0).length} promotions earned their cost`} />
        <Kpi info="Profit added plus profit given away. 'Worst' is the promotion with the lowest profit effect." label="Net effect" value={egp(m.dilutive + m.accretive)} tone={m.dilutive + m.accretive < 0 ? "bad" : "good"} note={worst ? `Worst: ${worst.name}, ${worst.promo}` : undefined} />
      </section>
      <section className="card">
        <Title info="Depth = average discount. Brand pays = the brand's share of the discount. Volume lift = average daily units during / in the 14 days before. Profit effect = extra margin earned minus margin given away, after platform margin, cost of goods and the brand-funded discount.">Every promotion, worst first</Title>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Platform · promotion</th><th>Funding</th><th className="r">Depth</th><th className="r">Brand pays</th><th className="r">Volume lift</th><th className="r">Profit effect</th><th>Verdict</th></tr></thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.platform + r.promo}>
                  <td><b>{r.name}</b><div className="muted">{r.promo} · {r.skus} SKU{r.skus === 1 ? "" : "s"}</div></td>
                  <td>{r.funding}</td>
                  <td className="r">{pct(r.depth, 0)}</td>
                  <td className="r">{pct(r.vendorShare, 0)}</td>
                  <td className="r">{r.uplift.toFixed(2)}x</td>
                  <td className={"r " + (r.effect < 0 ? "bad" : "good")}><b>{egp(r.effect, false)}</b></td>
                  <td><Pill tone={r.effect < 0 ? "bad" : "good"}>{r.effect < 0 ? "Lost money" : "Earned its cost"}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {best ? <div className="muted">Best: {best.name}, {best.promo}, {egp(best.effect, false)}. Deep discounts paid fully by the brand lift volume but cost more than the extra units earn. Shared or platform-funded deals pay.</div> : null}
      </section>
      <AnalyzeButton module="promotions" canRefresh={s.role === "admin"} title="Claude recommends: promotions and discounts" />
    </>
  );
}
