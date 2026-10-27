import { requireSession, canWrite } from "@/lib/auth";
import { getCtx } from "@/lib/metrics";
import { freshness } from "@/lib/queries";
import spec from "@/lib/spec.json";
import { dateLabel } from "@/lib/format";
import { Empty, Header, Pill } from "@/components/ui";
import { addDays, daysBetween } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const FEEDS = spec.feed_order as string[];
const TITLES = spec.feeds as Record<string, { title: string; freq: string }>;

export default async function Freshness() {
  const s = await requireSession();
  const c = await getCtx();
  if (!c) return (<><Header title="Data freshness" /><Empty admin={canWrite(s)} /></>);
  const rows = await freshness(c.brandId);
  const newest = rows.reduce((m, r) => (r.through_date > m ? r.through_date : m), "");
  return (
    <>
      <Header title="Data freshness" sub="How recent the data is on every platform and card. Green is current, amber is a week or more behind the newest data." />
      <section className="card">
        <div className="tablewrap"><table>
          <thead><tr><th>Platform</th>{FEEDS.map((f) => (<th key={f}>{TITLES[f].title}</th>))}</tr></thead>
          <tbody>
            {c.platforms.map((p) => (
              <tr key={p.code}>
                <td><b>{p.name}</b></td>
                {FEEDS.map((f) => {
                  const r = rows.find((x) => x.platform === p.code && x.feed === f);
                  if (!r) return (<td key={f}><Pill tone="bad">No data</Pill></td>);
                  const behind = newest ? daysBetween(r.through_date, newest) : 0;
                  return (<td key={f}><Pill tone={behind >= 7 ? "warn" : "good"}>Through {dateLabel(r.through_date)}</Pill><div className="muted">{r.n.toLocaleString("en-US")} rows</div></td>);
                })}
              </tr>
            ))}
          </tbody>
        </table></div>
        <div className="muted">{newest ? `Newest data in the system: ${dateLabel(newest)}.` : ""} Daily cards (Sales, Inventory, Price and promo, Ads) are expected every day; Market and Service weekly.</div>
      </section>
    </>
  );
}
