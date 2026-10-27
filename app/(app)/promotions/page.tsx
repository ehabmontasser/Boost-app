import { promoModel } from "@/lib/metrics";
import { pageCtx, type SearchParams } from "@/lib/page";
import { periodQuery } from "@/lib/period";
import { egp, pct } from "@/lib/format";
import { Empty, Header, Kpi, Pill, Title } from "@/components/ui";
import AnalyzeButton from "@/components/AnalyzeButton";
import PeriodPicker from "@/components/PeriodPicker";

export const dynamic = "force-dynamic";

export default async function Promotions({ searchParams }: { searchParams: SearchParams }) {
  const { s, c, p, options } = await pageCtx(searchParams);
  if (!c || !p) return (<><Header title="Promotions" /><Empty admin={s.role === "admin"} /></>);
  const m = await promoModel(c, p);
  const worst = m.rows[0], best = m.rows[m.rows.length - 1];
  return (
    <>
      <Header title="Promotions" sub={`Promotions running in ${p.label} · each run compared with the 14 days before it, after platform margin, cost of goods and the brand-funded discount`}>
        <PeriodPicker view={p.view} periodKey={p.key} from={p.from} to={p.to} cmp={p.cmp} options={options!} />
      </Header>
      <section className="kpis" aria-label="Key figures">
        <Kpi info="Promotions running in the selected period. Each run (consecutive promotion days) is compared with the product's non-promotion days in the 14 days before it; runs need at least 5 such days. A run that overlaps the period is counted in full." label="Promotions analysed" value={String(m.rows.length)} note={`${m.rows.reduce((a, r) => a + r.runs, 0)} runs, all platforms`} />
        <Kpi info="Sum of the profit effect of every promotion that lost money. Profit effect = (daily units during x margin with the discount - normal daily units in the 14 days before x normal margin) x promotion days, added up over every run in the period. Margin = list price after the platform margin, minus cost of goods, minus the brand-funded part of the discount." label="Profit given away" value={egp(m.dilutive)} tone="bad" note={`${m.rows.filter((r) => r.effect < 0).length} promotions lost money`} />
        <Kpi info="Sum of the profit effect of every promotion that earned more than it cost, using the same method as Profit given away." label="Profit added" value={egp(m.accretive)} tone="good" note={`${m.rows.filter((r) => r.effect > 0).length} promotions earned their cost`} />
        <Kpi info="Profit added plus profit given away. 'Worst' is the promotion with the lowest profit effect." label="Net effect" value={egp(m.dilutive + m.accretive)} tone={m.dilutive + m.accretive < 0 ? "bad" : "good"} note={worst ? `Worst: ${worst.name}, ${worst.promo}` : undefined} />
      </section>
      <section className="card">
        <Title info="Depth = average discount. Brand pays = the brand's share of the discount. Runs = how many times it ran in the period. Volume lift = average daily units during / normal daily units in the 14 days before each run. Profit effect = extra margin earned minus margin given away, after platform margin, cost of goods and the brand-funded discount.">Every promotion, worst first</Title>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Platform · promotion</th><th>Funding</th><th className="r">Depth</th><th className="r">Brand pays</th><th className="r">Volume lift</th><th className="r">Profit effect</th><th>Verdict</th></tr></thead>
            <tbody>
              {m.rows.length === 0 ? <tr><td colSpan={7} className="muted">No promotion ran in this period.</td></tr> : m.rows.map((r) => (
                <tr key={r.platform + r.promo}>
                  <td><b>{r.name}</b><div className="muted">{r.promo} · {r.skus} SKU{r.skus === 1 ? "" : "s"}{r.runs > 1 ? ` · ${r.runs} runs` : ""}</div></td>
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
      <AnalyzeButton key={periodQuery(p)} module="promotions" query={periodQuery(p)} canRefresh={s.role === "admin"} title={`Claude recommends: promotions and discounts, ${p.short}`} />
    </>
  );
}
