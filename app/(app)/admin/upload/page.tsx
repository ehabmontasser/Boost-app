import { requireAdmin } from "@/lib/auth";
import { getBrand, getPlatforms, freshness } from "@/lib/queries";
import spec from "@/lib/spec.json";
import { dateLabel } from "@/lib/format";
import { Header, Pill } from "@/components/ui";
import UploadCenter from "@/components/UploadCenter";

export const dynamic = "force-dynamic";

const FEEDS = spec.feed_order as string[];
const TITLES = spec.feeds as Record<string, { title: string; freq: string }>;

export default async function Upload() {
  await requireAdmin();
  const brand = await getBrand();
  const platforms = (await getPlatforms()).filter((p) => p.status === "active");
  const rows = brand ? await freshness(brand.id) : [];
  return (
    <>
      <Header title="Upload center" sub="Load the Brand Master once, then the platform files. Upload order: Brand Master, then backfill, then each weekly update." />
      <section className="card">
        <h2>Order of work</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Brand Master (SETUP_00_BRAND_MASTER_v1.xlsx). Nothing else loads until this exists.</li>
          <li>The 30 backfill files (20 Jul to 11 Oct). Select a whole platform folder at once.</li>
          <li>Check Data freshness reads &quot;through 11 Oct&quot; on every card.</li>
          <li>The 30 weekly files (12 to 18 Oct). Same steps.</li>
        </ol>
        <div className="muted">Brand Master status: {brand ? <Pill tone="good">Loaded for {brand.name}</Pill> : <Pill tone="warn">Not loaded</Pill>}</div>
      </section>
      <UploadCenter setupDone={!!brand} />
      <section className="card">
        <h2>What is loaded</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Platform</th>{FEEDS.map((f) => (<th key={f}>{TITLES[f].title}</th>))}</tr></thead>
          <tbody>{platforms.map((p) => (
            <tr key={p.code}>
              <td><b>{p.name}</b></td>
              {FEEDS.map((f) => {
                const r = rows.find((x) => x.platform === p.code && x.feed === f);
                return (<td key={f}>{r ? (<><Pill tone="good">{dateLabel(r.from_date)} to {dateLabel(r.through_date)}</Pill><div className="muted">{r.n.toLocaleString("en-US")} rows</div></>) : <Pill tone="mute">Empty</Pill>}</td>);
              })}
            </tr>
          ))}</tbody>
        </table></div>
        <div className="muted">Refresh the page after an upload to update this table.</div>
      </section>
    </>
  );
}
