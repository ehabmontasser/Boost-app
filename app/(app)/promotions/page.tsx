import { promoModel } from "@/lib/metrics";
import { canWrite } from "@/lib/auth";
import { pageCtx, type SearchParams } from "@/lib/page";
import { periodQuery } from "@/lib/period";
import { egp, pct } from "@/lib/format";
import { Empty, Header, Kpi, Pill, Title } from "@/components/ui";
import AnalyzeButton from "@/components/AnalyzeButton";
import PeriodPicker from "@/components/PeriodPicker";

export const dynamic = "force-dynamic";

export default async function Promotions({ searchParams }: { searchParams: SearchParams }) {
  const { s, c, p, options } = await pageCtx(searchParams);
  if (!c || !p) return (<><Header title="Deals and Promotions" /><Empty admin={canWrite(s)} /></>);
  const m = await promoModel(c, p);
  const worst = m.rows[0], best = m.rows[m.rows.length - 1];
  return (
    <>
      <Header title="Deals and Promotions" sub={`Promotions running in ${p.label} · each run compared with the 14 days before it, after platform margin, cost of goods and the brand-funded discount`}>
        <PeriodPicker view={p.view} periodKey={p.key} from={p.from} to={p.to} cmp={p.cmp} options={options!} />
      </Header>
      <section className="kpis" aria-label="Key figures">
        <Kpi info="How many promotions ran in this period. Each time a promotion ran is compared with the normal days just before it (up to 14 days without a promotion)." label="Promotions analysed" value={String(m.rows.length)} note={`${m.rows.reduce((a, r) => a + r.runs, 0)} runs, all platforms`} />
        <Kpi info="Money lost on promotions that did not pay back: the extra units sold did not make up for the discount. Profit here is what the brand keeps per unit after the platform's cut, the product cost and the brand's share of the discount." label="Profit given away" value={egp(m.dilutive)} tone="bad" note={`${m.rows.filter((r) => r.effect < 0).length} promotions lost money`} />
        <Kpi info="Extra profit from promotions that paid back: the extra units sold earned more than the discount cost. Worked out the same way as Profit given away." label="Profit added" value={egp(m.accretive)} tone="good" note={`${m.rows.filter((r) => r.effect > 0).length} promotions earned their cost`} />
        <Kpi info="Profit added minus profit given away: whether promotions made or lost money overall in this period. Worst = the promotion that lost the most." label="Net effect" value={egp(m.dilutive + m.accretive)} tone={m.dilutive + m.accretive < 0 ? "bad" : "good"} note={worst ? `Worst: ${worst.name}, ${worst.promo}` : undefined} />
      </section>
      <section className="card">
        <Title info="Depth: average discount off the list price. Brand pays: the part of the discount the brand funds. Volume lift: sales during the promotion compared with normal days (1.5x = 50% more). Profit effect: money made or lost compared with normal days, after the platform's cut, product cost and the discount the brand pays.">Every promotion, worst first</Title>
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
      <AnalyzeButton key={periodQuery(p)} module="promotions" query={periodQuery(p)} canRefresh={canWrite(s)} title={`Claude recommends: deals and promotions, ${p.short}`} />
    </>
  );
}
