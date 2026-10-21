import { requireSession } from "@/lib/auth";
import { getCtx, marketModel } from "@/lib/metrics";
import { dateLabel, egp, pct } from "@/lib/format";
import { Empty, Header, Kpi, Pill } from "@/components/ui";
import { ShareLines } from "@/components/charts";
import AnalyzeButton from "@/components/AnalyzeButton";

export const dynamic = "force-dynamic";

export default async function Market() {
  const s = await requireSession();
  const c = await getCtx();
  if (!c || !c.asOf) return (<><Header title="Market segment share" /><Empty admin={s.role === "admin"} /></>);
  const m = await marketModel(c);
  const move = (x: { share: number[] }) => (x.share[x.share.length - 1] ?? 0) - (x.share[0] ?? 0);
  const falling = m.wipes.filter((x) => move(x) < -0.005);
  const worst = [...m.wipes].sort((a, b) => move(a) - move(b))[0];
  return (
    <>
      <Header title="Market segment share" sub={`Sprout's share of each platform's segment sales · latest week starting ${dateLabel(m.latestWeek)}`} />
      <section className="kpis" aria-label="Key figures">
        <Kpi label="Channels losing wipes share" value={`${falling.length} of ${m.wipes.length}`} tone={falling.length ? "bad" : "good"} note="since week 1" />
        {worst ? <Kpi label={`Biggest drop: ${worst.name}`} value={`${(move(worst) * 100).toFixed(1)} pts`} tone="bad" note={`${pct(worst.share[0])} to ${pct(worst.share[worst.share.length - 1])}`} /> : null}
        <Kpi label="Channels with listing gaps" value={String(m.gaps.filter((g) => g.missing.length).length)} tone="warn" note="Sprout SKUs not listed" />
      </section>
      <div className="row">
        <section className="card">
          <h2>Wipes share by channel</h2>
          <ShareLines series={m.wipes} label="Wipes share by channel from week 1 to the latest week" />
        </section>
        <section className="card">
          <h2>Skin care share by channel</h2>
          <ShareLines series={m.skin} label="Skin care share by channel from week 1 to the latest week" />
        </section>
      </div>
      <section className="card">
        <h2>Who leads each channel (wipes, latest week)</h2>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Channel</th><th>#1</th><th>#2</th><th>#3</th><th>Sprout's best rank</th></tr></thead>
            <tbody>
              {c.platforms.map((p) => {
                const t = m.top[p.code] ?? [];
                const mine = t.find((x) => x.own);
                return (
                  <tr key={p.code}>
                    <td><b>{p.name}</b></td>
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
          <h2>Share by sub-segment (latest week)</h2>
          <div className="tablewrap"><table>
            <thead><tr><th>Channel</th><th>Sub-segment</th><th className="r">Sprout share</th></tr></thead>
            <tbody>{[...m.subRows].sort((a, b) => a.share - b.share).slice(0, 12).map((r, i) => (
              <tr key={i}><td>{r.name}</td><td>{r.sub}</td><td className="r">{pct(r.share)}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="muted">Lowest shares first. A sub-segment with zero share is one where Sprout has no listing or no sales.</div>
        </section>
        <section className="card">
          <h2>Assortment gaps</h2>
          <div className="tablewrap"><table>
            <thead><tr><th>Channel</th><th>Sprout SKUs not listed</th></tr></thead>
            <tbody>{m.gaps.map((g) => (
              <tr key={g.code}><td><b>{g.name}</b></td><td>{g.missing.length ? g.missing.join(", ") : <Pill tone="good">Full range</Pill>}</td></tr>
            ))}</tbody>
          </table></div>
          <div className="muted">Quick-commerce channels carry a small-pack range by design, so gaps there are shelf-driven, not mistakes.</div>
        </section>
      </div>
      <AnalyzeButton module="market" title="Claude recommends: segment share" />
    </>
  );
}
