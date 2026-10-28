import { adsModel } from "@/lib/metrics";
import { canWrite } from "@/lib/auth";
import { pageCtx, type SearchParams } from "@/lib/page";
import { pctChange, periodQuery, vsShort } from "@/lib/period";
import { egp, pct } from "@/lib/format";
import { Empty, Header, Kpi, Pill, statusTone, Title } from "@/components/ui";
import AnalyzeButton from "@/components/AnalyzeButton";
import PeriodPicker from "@/components/PeriodPicker";

export const dynamic = "force-dynamic";

export default async function Ads({ searchParams }: { searchParams: SearchParams }) {
  const { s, c, p, options } = await pageCtx(searchParams);
  if (!c || !p) return (<><Header title="Performance Marketing" /><Empty admin={canWrite(s)} /></>);
  const m = await adsModel(c, p);
  const vs = vsShort(p);
  const suppressed = m.suppressed.reduce((a, x) => a + x.spend, 0);
  const scale = m.rows.filter((r) => r.flag.startsWith("Scale"));
  return (
    <>
      <Header title="Performance Marketing" sub={`${p.label}${p.prev ? ` · compared with ${p.prev.label}` : p.noPrev ? ` · ${p.noPrev}` : ""} · ROAS = attributed 7-day sales / ad spend, all values ex VAT`}>
        <PeriodPicker view={p.view} periodKey={p.key} from={p.from} to={p.to} cmp={p.cmp} options={options!} />
      </Header>
      <section className="kpis" aria-label="Key figures">
        <Kpi info="Total spent on ads on all platforms in this period, excluding VAT. The change is against the comparison you picked: the previous period or the same period last year." label="Ad spend" value={egp(m.totalSpend)} note={pctChange(m.totalSpend, m.prevSpend) ? `${pctChange(m.totalSpend, m.prevSpend)} ${vs}` : `${p.short}, all platforms`} />
        <Kpi info="ROAS = sales from ads (within 7 days of a click) divided by ad spend. A ROAS of 4 means EGP 4 of sales for every EGP 1 spent. Shown for all campaigns together." label="Blended ROAS" value={m.roas.toFixed(2)} note={`${egp(m.totalAtt)} attributed sales${m.prevRoas ? ` · was ${m.prevRoas.toFixed(2)} ${p.cmp === "yoy" ? "last year" : "in the previous period"}` : ""}`} />
        <Kpi info="Money spent in campaigns that missed their target ROAS (set per platform in the Brand Master). The % is of all ad spend." label="Spend below target ROAS" value={egp(m.belowSpend)} tone="warn" note={`${pct(m.totalSpend ? m.belowSpend / m.totalSpend : 0, 0)} of all spend`} />
        <Kpi info="Money spent on ads on days the product's listing was hidden on the platform, so shoppers could not buy it." label="Spent on suppressed listings" value={egp(suppressed)} tone={suppressed ? "bad" : "good"} note={m.suppressed.length ? m.suppressed.map((x) => x.name).join(", ") : "None"} />
      </section>
      <section className="card">
        <Title info="One row per campaign. Share of platform: the campaign's part of that platform's ad spend. Lost to budget: the share of ad views missed because the budget ran out. Signal: Below target if ROAS misses the target; Scale if it hits the target and missed 15% or more of views for lack of budget; otherwise On target.">Campaigns</Title>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Platform · campaign</th><th>Type</th><th className="r">Spend</th><th className="r">Share of platform</th><th className="r">ROAS</th><th className="r">Target</th><th className="r">Lost to budget</th><th>Signal</th></tr></thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.platform + r.id}>
                  <td><b>{r.name}</b><div className="muted">{r.campaign}</div></td>
                  <td>{r.type}<div className="muted">{r.objective}</div></td>
                  <td className="r">{egp(r.spend)}</td>
                  <td className="r">{pct(r.spendShare, 0)}</td>
                  <td className="r"><b>{r.roas.toFixed(1)}</b></td>
                  <td className="r">{r.target.toFixed(1)}</td>
                  <td className="r">{pct(r.lostShare, 0)}</td>
                  <td><Pill tone={r.flag.startsWith("Scale") ? "info" : statusTone(r.flag)}>{r.flag}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="muted">{scale.length} campaign{scale.length === 1 ? "" : "s"} beat the target but run out of budget. Money in campaigns below target is the first source of budget to move.</div>
      </section>
      {m.suppressed.length ? (
        <section className="card">
          <Title info="Ad spend and ad sales on days the product's listing was hidden on the platform, by platform.">Ad spend on suppressed listings</Title>
          <div className="tablewrap"><table>
            <thead><tr><th>Platform</th><th className="r">Spend</th><th className="r">Attributed sales</th></tr></thead>
            <tbody>{m.suppressed.map((x) => (<tr key={x.platform}><td><b>{x.name}</b></td><td className="r bad">{egp(x.spend, false)}</td><td className="r">{egp(x.att, false)}</td></tr>))}</tbody>
          </table></div>
          <div className="muted">Spend on days when the listing was suppressed on the platform. It buys nothing, so pause the campaign until the listing is back.</div>
        </section>
      ) : null}
      <AnalyzeButton key={periodQuery(p)} module="ads" query={periodQuery(p)} canRefresh={canWrite(s)} title={`Claude recommends: performance marketing, ${p.short}`} />
    </>
  );
}
