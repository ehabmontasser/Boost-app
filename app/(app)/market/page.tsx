import { marketModel } from "@/lib/metrics";
import { canWrite } from "@/lib/auth";
import { pageCtx, type SearchParams } from "@/lib/page";
import { periodQuery, trendLabel, vsShort } from "@/lib/period";
import { dateLabel, egp, pct } from "@/lib/format";
import { Empty, Header, Kpi, Pill, SubSegmentTable, Title } from "@/components/ui";
import { ShareLines } from "@/components/charts";
import AnalyzeButton from "@/components/AnalyzeButton";
import PeriodPicker from "@/components/PeriodPicker";

export const dynamic = "force-dynamic";

export default async function Market({ searchParams }: { searchParams: SearchParams }) {
  const { s, c, p, options } = await pageCtx(searchParams);
  if (!c || !p) return (<><Header title="Market Share" /><Empty admin={canWrite(s)} /></>);
  const m = await marketModel(c, p);
  // movement against the previous period (or the period's first week, for the full period)
  const move = (x: { now: number | null; base: number | null }) => (x.now ?? 0) - (x.base ?? 0);
  const comparable = m.wipesNow.filter((x) => x.base !== null);
  // every platform whose share went down (by at least 0.05 pts, the smallest change the page shows)
  const falling = comparable.filter((x) => move(x) < -0.0005);
  const worst = [...comparable].sort((a, b) => move(a) - move(b))[0];
  const since = p.prev ? vsShort(p) : p.view === "year" ? "since the first week" : p.noPrev ?? "";
  const trendNote = { week: "by week, last 13 weeks", month: "by month, last 12 months", quarter: "by quarter, last 8 quarters", ytd: "by week, year to date", custom: "over the selected dates", year: "by month" }[p.view];
  const latest = m.latestWeek ? `week of ${dateLabel(m.latestWeek)}` : "latest week";
  return (
    <>
      <Header title="Market Share" sub={`Sprout's share of each platform's segment sales · ${p.label}${p.prev ? ` · compared with ${p.prev.label}` : p.noPrev ? ` · ${p.noPrev}` : ""}`}>
        <PeriodPicker view={p.view} periodKey={p.key} from={p.from} to={p.to} cmp={p.cmp} options={options!} />
      </Header>
      <section className="kpis" aria-label="Key figures">
        <Kpi info="Platforms where Sprout's share of all wipes sold went down against the comparison period (previous period or same period last year). Full period: the last week against the first." label="Platforms losing wipes share" value={`${falling.length} of ${comparable.length}`} tone={falling.length ? "bad" : "good"} note={falling.length ? `${falling.map((x) => x.name).join(", ")} · ${since}` : since} />
        {worst ? <Kpi info="The platform where Sprout's wipes share fell the most, in percentage points (pts): 12.4% to 11.8% is -0.6 pts." label={`Biggest ${move(worst) < 0 ? "drop" : "change"}: ${worst.name}`} value={`${(move(worst) * 100).toFixed(1)} pts`} tone={move(worst) < 0 ? "bad" : "good"} note={`${pct(worst.base ?? 0)} to ${pct(worst.now ?? 0)}`} /> : null}
        <Kpi info="Platforms where at least one Sprout product is not listed (from the Brand Master)." label="Platforms with listing gaps" value={String(m.gaps.filter((g) => g.missing.length).length)} tone="warn" note="Sprout SKUs not listed" />
      </section>
      <div className="row">
        <section className="card">
          <Title info="Sprout's share of all wipes sold on each platform (all brands). Weekly view: the last 13 weeks. Monthly: the last 12 months. Quarterly: the last 8 quarters. YTD, custom and full period: each week or month in the range.">Wipes share by platform</Title>
          <ShareLines series={m.wipes} label={`Wipes share by platform, ${trendNote}`} start={trendLabel(m.trendStart)} end={trendLabel(m.trendEnd)} />
        </section>
        <section className="card">
          <Title info="Sprout's share of all skin care sold on each platform (all brands), over the same weeks or months as the wipes chart.">Skin care share by platform</Title>
          <ShareLines series={m.skin} label={`Skin care share by platform, ${trendNote}`} start={trendLabel(m.trendStart)} end={trendLabel(m.trendEnd)} />
        </section>
      </div>
      <section className="card">
        <Title info="The best-selling wipes products on each platform in the last week of the period. Sprout's best rank is its highest product in the top 8.">{`Who leads each platform (wipes, ${latest})`}</Title>
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
          <Title info="Sprout's share of each sub-segment where it sells, in this period, and the change in percentage points against the comparison period. Full period: the last week against the first. Biggest drop first.">Share by sub-segment</Title>
          <SubSegmentTable rows={m.subRows} withPlatform />
          <div className="muted">Sub-segments where Sprout sells, {p.label}{since ? `, change ${since}` : ""}. Biggest drop first.</div>
        </section>
        <section className="card">
          <Title info="Sprout products that are not listed on the platform (from the Brand Master).">Assortment gaps</Title>
          <div className="tablewrap"><table>
            <thead><tr><th>Platform</th><th>Sprout SKUs not listed</th></tr></thead>
            <tbody>{m.gaps.map((g) => (
              <tr key={g.code}><td><b>{g.name}</b></td><td>{g.missing.length ? g.missing.join(", ") : <Pill tone="good">Full range</Pill>}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="muted">Quick-commerce platforms carry a small-pack range by design, so gaps there are shelf-driven, not mistakes.</div>
        </section>
      </div>
      <AnalyzeButton key={periodQuery(p)} module="market" query={periodQuery(p)} canRefresh={canWrite(s)} title={`Claude recommends: market share, ${p.short}`} />
    </>
  );
}
