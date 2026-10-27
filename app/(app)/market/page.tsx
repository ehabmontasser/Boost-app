import { marketModel } from "@/lib/metrics";
import { canWrite } from "@/lib/auth";
import { pageCtx, type SearchParams } from "@/lib/page";
import { periodQuery, trendLabel, vsShort } from "@/lib/period";
import { dateLabel, egp, pct } from "@/lib/format";
import { Empty, Header, Kpi, Pill, Title } from "@/components/ui";
import { ShareLines } from "@/components/charts";
import AnalyzeButton from "@/components/AnalyzeButton";
import PeriodPicker from "@/components/PeriodPicker";

export const dynamic = "force-dynamic";

export default async function Market({ searchParams }: { searchParams: SearchParams }) {
  const { s, c, p, options } = await pageCtx(searchParams);
  if (!c || !p) return (<><Header title="Market segment share" /><Empty admin={canWrite(s)} /></>);
  const m = await marketModel(c, p);
  // movement against the previous period (or the period's first week, for the full period)
  const move = (x: { now: number | null; base: number | null }) => (x.now ?? 0) - (x.base ?? 0);
  const comparable = m.wipesNow.filter((x) => x.base !== null);
  const falling = comparable.filter((x) => move(x) < -0.005);
  const worst = [...comparable].sort((a, b) => move(a) - move(b))[0];
  const since = p.prev ? vsShort(p) : p.view === "year" ? "since the first week" : p.noPrev ?? "";
  const trendNote = { week: "by week, last 13 weeks", month: "by month, last 12 months", quarter: "by quarter, last 8 quarters", ytd: "by week, year to date", custom: "over the selected dates", year: "by month" }[p.view];
  const latest = m.latestWeek ? `week of ${dateLabel(m.latestWeek)}` : "latest week";
  return (
    <>
      <Header title="Market segment share" sub={`Sprout's share of each platform's segment sales · ${p.label}${p.prev ? ` · compared with ${p.prev.label}` : p.noPrev ? ` · ${p.noPrev}` : ""}`}>
        <PeriodPicker view={p.view} periodKey={p.key} from={p.from} to={p.to} cmp={p.cmp} options={options!} />
      </Header>
      <section className="kpis" aria-label="Key figures">
        <Kpi info="Platforms where Sprout's wipes share in the selected period is more than 0.5 points below the comparison period (previous period or same period last year), or below the first week for the full period. Share = Sprout wipes sales / wipes sales of all brands on the platform (Market files)." label="Platforms losing wipes share" value={`${falling.length} of ${comparable.length}`} tone={falling.length ? "bad" : "good"} note={since} />
        {worst ? <Kpi info="The platform whose wipes share moved down the most against the comparison period, in percentage points." label={`Biggest ${move(worst) < 0 ? "drop" : "change"}: ${worst.name}`} value={`${(move(worst) * 100).toFixed(1)} pts`} tone={move(worst) < 0 ? "bad" : "good"} note={`${pct(worst.base ?? 0)} to ${pct(worst.now ?? 0)}`} /> : null}
        <Kpi info="Platforms where at least one Sprout product in the SKU master has no listing (Brand Master, Platform_Listings)." label="Platforms with listing gaps" value={String(m.gaps.filter((g) => g.missing.length).length)} tone="warn" note="Sprout SKUs not listed" />
      </section>
      <div className="row">
        <section className="card">
          <Title info="Sprout wipes sales / wipes sales of all brands on each platform (Market files). Weekly: the 13 weeks up to the selected week. Monthly: the 12 months up to it. Quarterly: the 8 quarters up to it. YTD and custom: each week in the range (by month for long ranges). Full period: by month.">Wipes share by platform</Title>
          <ShareLines series={m.wipes} label={`Wipes share by platform, ${trendNote}`} start={trendLabel(m.trendStart)} end={trendLabel(m.trendEnd)} />
        </section>
        <section className="card">
          <Title info="Sprout skin care sales / skin care sales of all brands on each platform (Market files), over the same weeks or months as the wipes chart.">Skin care share by platform</Title>
          <ShareLines series={m.skin} label={`Skin care share by platform, ${trendNote}`} start={trendLabel(m.trendStart)} end={trendLabel(m.trendEnd)} />
        </section>
      </div>
      <section className="card">
        <Title info="The top wipes products by sales value on each platform in the last week of the selected period (Market files). Sprout's best rank is its highest product within the top 8.">{`Who leads each platform (wipes, ${latest})`}</Title>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Platform</th><th>#1</th><th>#2</th><th>#3</th><th>Sprout's best rank</th></tr></thead>
            <tbody>
              {c.platforms.map((pl) => {
                const t = m.top[pl.code] ?? [];
                const mine = t.find((x) => x.own);
                return (
                  <tr key={pl.code}>
                    <td><b>{pl.name}</b></td>
                    {[0, 1, 2].map((i) => (<td key={i}>{t[i] ? (<><span className={t[i].own ? "good" : ""}>{t[i].brand}</span><div className="muted">{t[i].sub} · {egp(t[i].gmv)}</div></>) : "-"}</td>))}
                    <td>{mine ? `#${mine.rank}` : <span className="muted">outside top 8</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="row">
        <section className="card">
          <Title info="Sprout sales / sales of all brands in each sub-segment over the weeks in the selected period, lowest first. 0% means Sprout has no listing or no sales there.">Share by sub-segment</Title>
          <div className="tablewrap"><table>
            <thead><tr><th>Platform</th><th>Sub-segment</th><th className="r">Sprout share</th></tr></thead>
            <tbody>{[...m.subRows].sort((a, b) => a.share - b.share).slice(0, 12).map((r, i) => (
              <tr key={i}><td>{r.name}</td><td>{r.sub}</td><td className="r">{pct(r.share)}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="muted">Lowest shares first, {p.label}. A sub-segment with zero share is one where Sprout has no listing or no sales.</div>
        </section>
        <section className="card">
          <Title info="Sprout products in the SKU master that have no listing on the platform (Brand Master, Platform_Listings).">Assortment gaps</Title>
          <div className="tablewrap"><table>
            <thead><tr><th>Platform</th><th>Sprout SKUs not listed</th></tr></thead>
            <tbody>{m.gaps.map((g) => (
              <tr key={g.code}><td><b>{g.name}</b></td><td>{g.missing.length ? g.missing.join(", ") : <Pill tone="good">Full range</Pill>}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="muted">Quick-commerce platforms carry a small-pack range by design, so gaps there are shelf-driven, not mistakes.</div>
        </section>
      </div>
      <AnalyzeButton key={periodQuery(p)} module="market" query={periodQuery(p)} canRefresh={canWrite(s)} title={`Claude recommends: segment share, ${p.short}`} />
    </>
  );
}
