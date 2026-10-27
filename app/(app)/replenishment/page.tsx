import { replenishmentModel } from "@/lib/metrics";
import { pageCtx, type SearchParams } from "@/lib/page";
import { dateLabel, egp, int, pct } from "@/lib/format";
import { Empty, Header, Kpi, Pill, statusTone, Title } from "@/components/ui";
import AnalyzeButton from "@/components/AnalyzeButton";
import PeriodPicker from "@/components/PeriodPicker";

export const dynamic = "force-dynamic";

export default async function Replenishment({ searchParams }: { searchParams: SearchParams }) {
  const { s, c, p, options } = await pageCtx(searchParams);
  const m = c && p ? await replenishmentModel(c, p) : null;
  if (!c || !p || !m) return (<><Header title="Replenishment" /><Empty admin={s.role === "admin"} /></>);
  const worstOver = m.overstock[0];
  const unitsAtRisk = m.atRisk.reduce((a, r) => a + r.unitsAtRisk, 0);
  return (
    <>
      <Header title="Replenishment" sub={`Stock position on ${dateLabel(m.asOf)} (last day of ${p.view === "year" ? "the period" : p.short}) · lost demand and POs for ${p.label} · cover = on hand / average daily sales of the 14 days before`}>
        <PeriodPicker view={p.view} periodKey={p.key} options={options!} />
      </Header>
      <section className="kpis" aria-label="Key figures">
        <Kpi info="Store or warehouse and product combinations expected to run out before stock arrives, judged on the last day of the selected period. At risk when the gap is 1.5 days or more and at least 10 units. Gap = days until the next PO lands (or lead time + review cycle if no PO is open) minus days of cover. Units short = gap x daily units sold." label="Nodes at risk" value={String(m.atRisk.length)} tone={m.atRisk.length ? "bad" : "good"} note={`about ${int(unitsAtRisk)} units short before the next PO lands`} />
        <Kpi info="Platform and product lines whose stock cover, all nodes together, is above the maximum cover days set in the Brand Master. Cover = units on hand / average daily units sold over the 14 days up to the last day of the selected period." label="Overstocked lines" value={String(m.overstock.length)} tone="info" note={worstOver ? `${worstOver.name}, ${worstOver.skuName}: ${int(worstOver.cover)} days` : "None above max cover"} />
        <Kpi info="Sales missed because products were out of stock: demand units the platform could not fill (Inventory files) x that day's selling price (Price and Promo files). The % is lost demand divided by net sales over the selected period." label={`Demand lost, ${p.short}`} value={egp(m.totalLost)} note={`${pct(m.totalNet ? m.totalLost / m.totalNet : 0)} of sales`} />
        <Kpi info="Units the platform confirmed on its purchase orders / units requested, for weeks in the selected period (Service files). Shows the platform and product with the lowest rate." label="Lowest PO confirmation" value={m.lowestConfirm[0] ? pct(m.lowestConfirm[0].confirmRate ?? 0, 0) : "-"} tone="warn" note={m.lowestConfirm[0] ? `${m.lowestConfirm[0].name}, ${m.lowestConfirm[0].skuName}` : undefined} />
      </section>
      <section className="card">
        <Title info="At risk and Watch lines by node, most units short first. Cover = on hand / average daily units of the last 14 days. Watch = cover below half of the target cover days. Short by = gap days x daily units.">Needs action</Title>
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
          <Title info="Platform and product lines with cover above the maximum cover days in the Brand Master, all nodes added together, plus any open PO still to arrive.">Overstock</Title>
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
          <Title info="For each platform over the selected period: unfilled demand units x that day's selling price, and the same as a % of the platform's net sales.">Demand lost to stockouts</Title>
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
          <Title info="Platform and product lines that lost the most sales value to stockouts over the selected period. In stock = 1 - out-of-stock hours / operating hours.">Biggest lost-demand lines</Title>
          <div className="tablewrap"><table>
            <thead><tr><th>Platform · SKU</th><th className="r">Lost</th><th className="r">In stock</th></tr></thead>
            <tbody>{m.lostTop.length === 0 ? <tr><td colSpan={3} className="muted">No demand lost in this period.</td></tr> : m.lostTop.slice(0, 6).map((x, i) => (
              <tr key={i}><td><b>{x.name}</b><div className="muted">{x.skuName}</div></td><td className="r">{egp(x.value)}</td><td className="r">{pct(x.inStock)}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
        <section className="card">
          <Title info="PO confirmed = units confirmed / units requested on purchase orders. Lead time = average days from PO to receipt (Service files), for weeks in the selected period. Lowest confirmation first.">Weakest supplier performance</Title>
          <div className="tablewrap"><table>
            <thead><tr><th>Platform · SKU</th><th className="r">PO confirmed</th><th className="r">Lead time</th></tr></thead>
            <tbody>{m.lowestConfirm.length === 0 ? <tr><td colSpan={3} className="muted">No purchase orders in this period.</td></tr> : m.lowestConfirm.map((x, i) => (
              <tr key={i}><td><b>{x.name}</b><div className="muted">{x.skuName}</div></td><td className="r">{pct(x.confirmRate ?? 0, 0)}</td><td className="r">{x.lead.toFixed(1)} days</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      </div>
      <AnalyzeButton key={p.view + p.key} module="replenishment" view={p.view} periodKey={p.key} canRefresh={s.role === "admin"} title={`Claude recommends: stock, ${p.short}`} />
    </>
  );
}
