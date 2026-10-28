import { replenishmentModel } from "@/lib/metrics";
import { canWrite } from "@/lib/auth";
import { pageCtx, type SearchParams } from "@/lib/page";
import { periodQuery } from "@/lib/period";
import { dateLabel, egp, int, pct } from "@/lib/format";
import { Empty, Header, Kpi, Pill, statusTone, Title } from "@/components/ui";
import AnalyzeButton from "@/components/AnalyzeButton";
import PeriodPicker from "@/components/PeriodPicker";

export const dynamic = "force-dynamic";

export default async function Replenishment({ searchParams }: { searchParams: SearchParams }) {
  const { s, c, p, options } = await pageCtx(searchParams);
  const m = c && p ? await replenishmentModel(c, p) : null;
  if (!c || !p || !m) return (<><Header title="Inventory Management" /><Empty admin={canWrite(s)} /></>);
  const worstOver = m.overstock[0];
  const unitsAtRisk = m.atRisk.reduce((a, r) => a + r.unitsAtRisk, 0);
  return (
    <>
      <Header title="Inventory Management" sub={`Stock position on ${dateLabel(m.asOf)} (last day of ${p.view === "year" ? "the period" : p.short}) · lost demand and POs for ${p.label} · cover = on hand / average daily sales of the 14 days before`}>
        <PeriodPicker view={p.view} periodKey={p.key} from={p.from} to={p.to} cmp={p.cmp} options={options!} />
      </Header>
      <section className="kpis" aria-label="Key figures">
        <Kpi info="Stores or warehouses where a product will run out before the next delivery arrives, judged on the last day of the period. Flagged when the shortage lasts at least 1.5 days and is at least 10 units. Units short = days without stock x normal daily sales." label="Nodes at risk" value={String(m.atRisk.length)} tone={m.atRisk.length ? "bad" : "good"} note={`about ${int(unitsAtRisk)} units short before the next PO lands`} />
        <Kpi info="Products holding more stock than they need on a platform: cover (all stores together) is above the maximum days set in the Brand Master. Cover = how many days the stock on hand lasts at the average daily sales of the last 14 days." label="Overstocked lines" value={String(m.overstock.length)} tone="info" note={worstOver ? `${worstOver.name}, ${worstOver.skuName}: ${int(worstOver.cover)} days` : "None above max cover"} />
        <Kpi info="Sales missed because products were out of stock: the units shoppers wanted but could not buy, valued at that day's price. The % is compared with net sales in this period." label={`Demand lost, ${p.short}`} value={egp(m.totalLost)} note={`${pct(m.totalNet ? m.totalLost / m.totalNet : 0)} of sales`} />
        <Kpi info="The share of ordered units the platform confirmed on its purchase orders in this period. Shows the product with the lowest rate." label="Lowest PO confirmation" value={m.lowestConfirm[0] ? pct(m.lowestConfirm[0].confirmRate ?? 0, 0) : "-"} tone="warn" note={m.lowestConfirm[0] ? `${m.lowestConfirm[0].name}, ${m.lowestConfirm[0].skuName}` : undefined} />
      </section>
      <section className="card">
        <Title info="Stores and products that need action, most units short first. Cover = how many days the stock on hand lasts at the average daily sales of the last 14 days. At risk: will run out before the next delivery. Watch: cover below half of the target.">Needs action</Title>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Platform · node</th><th>SKU</th><th className="r">On hand</th><th className="r">Cover</th><th>Next PO lands</th><th className="r">Short by</th><th>Status</th></tr></thead>
            <tbody>
              {m.action.length === 0 ? <tr><td colSpan={7} className="muted">Nothing needs action on {dateLabel(m.asOf)}.</td></tr> : m.action.map((r, i) => (
                <tr key={i}>
                  <td><b>{r.platformName}</b><div className="muted">{r.nodeName}</div></td>
                  <td>{r.skuName}</td>
                  <td className="r">{int(r.onHand)}</td>
                  <td className="r"><b>{r.cover.toFixed(1)} days</b></td>
                  <td>{r.eta ? dateLabel(r.eta) : "No open PO"}</td>
                  <td className="r">{r.unitsAtRisk >= 1 ? `${int(r.unitsAtRisk)} units` : "-"}</td>
                  <td><Pill tone={statusTone(r.status)}>{r.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="row">
        <section className="card">
          <Title info="Products with more stock than the maximum cover days in the Brand Master, all stores together, plus any open purchase order still to arrive.">Overstock</Title>
          {m.overstock.length === 0 ? <div className="muted">No SKU is above its maximum cover.</div> : (
            <div className="tablewrap"><table>
              <thead><tr><th>Platform · SKU</th><th className="r">On hand</th><th className="r">Cover</th><th className="r">Open PO</th></tr></thead>
              <tbody>{m.overstock.slice(0, 6).map((o, i) => (
                <tr key={i}><td><b>{o.name}</b><div className="muted">{o.skuName}</div></td><td className="r">{int(o.onHand)}</td>
                  <td className="r"><Pill tone="info">{int(o.cover)} days</Pill></td>
                  <td className="r">{o.openPo ? `${int(o.openPo)} on ${dateLabel(o.eta)}` : "-"}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
        <section className="card">
          <Title info="Sales missed because products were out of stock: the units shoppers wanted but could not buy, valued at that day's price. Shown for each platform, also as a % of its net sales.">Demand lost to stockouts</Title>
          <div className="tablewrap"><table>
            <thead><tr><th>Platform</th><th className="r">Lost</th><th className="r">% of sales</th></tr></thead>
            <tbody>{[...m.channel].sort((a, b) => b.lostPct - a.lostPct).map((x) => (
              <tr key={x.code}><td><b>{x.name}</b></td><td className="r">{egp(x.lostValue)}</td><td className={"r " + (x.lostPct > 0.03 ? "bad" : "")}>{pct(x.lostPct)}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="muted">Amazon Core (e-commerce) and Amazon Now (quick commerce) are two separate platforms. Dark stores hold less shelf stock, so they run out more often.</div>
        </section>
      </div>
      <div className="row">
        <section className="card">
          <Title info="Products that lost the most sales to stockouts in this period. In stock = the share of opening hours the product was available.">Biggest lost-demand lines</Title>
          <div className="tablewrap"><table>
            <thead><tr><th>Platform · SKU</th><th className="r">Lost</th><th className="r">In stock</th></tr></thead>
            <tbody>{m.lostTop.length === 0 ? <tr><td colSpan={3} className="muted">No demand lost in this period.</td></tr> : m.lostTop.slice(0, 6).map((x, i) => (
              <tr key={i}><td><b>{x.name}</b><div className="muted">{x.skuName}</div></td><td className="r">{egp(x.value)}</td><td className="r">{pct(x.inStock)}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
        <section className="card">
          <Title info="PO confirmed: the share of ordered units the platform confirmed on its purchase orders. Lead time: average days from order to delivery. Lowest confirmation first.">Weakest supplier performance</Title>
          <div className="tablewrap"><table>
            <thead><tr><th>Platform · SKU</th><th className="r">PO confirmed</th><th className="r">Lead time</th></tr></thead>
            <tbody>{m.lowestConfirm.length === 0 ? <tr><td colSpan={3} className="muted">No purchase orders in this period.</td></tr> : m.lowestConfirm.map((x, i) => (
              <tr key={i}><td><b>{x.name}</b><div className="muted">{x.skuName}</div></td><td className="r">{pct(x.confirmRate ?? 0, 0)}</td><td className="r">{x.lead.toFixed(1)} days</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      </div>
      <AnalyzeButton key={periodQuery(p)} module="replenishment" query={periodQuery(p)} canRefresh={canWrite(s)} title={`Claude recommends: inventory management, ${p.short}`} />
    </>
  );
}
