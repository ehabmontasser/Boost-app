import { requireWriter } from "@/lib/auth";
import { getBrand, getPlatforms, freshness } from "@/lib/queries";
import { q } from "@/lib/db";
import spec from "@/lib/spec.json";
import { dateLabel } from "@/lib/format";
import { Header, Pill } from "@/components/ui";
import UploadCenter from "@/components/UploadCenter";

export const dynamic = "force-dynamic";

const FEEDS = spec.feed_order as string[];
const TITLES = spec.feeds as Record<string, { title: string; freq: string }>;

export default async function Upload() {
  await requireWriter();
  const brand = await getBrand();
  const platforms = (await getPlatforms()).filter((p) => p.status === "active");
  const rows = brand ? await freshness(brand.id) : [];
  // a brand added on the Users page exists before its Brand Master is loaded
  const loaded = brand ? (await q("SELECT 1 FROM skus WHERE brand_id = $1 LIMIT 1", [brand.id])).length > 0 : false;
  return (
    <>
      <Header title="Upload center" sub="Load the Brand Master once, then the platform files. Upload order: Brand Master, then backfill, then each weekly update." />
      <section className="card">
        <h2>Order of work</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Brand Master (SETUP_00_BRAND_MASTER_v1.xlsx). Nothing else loads until this exists.</li>
          <li>The 30 backfill files (28 Oct 2024 to 18 Oct 2026). Select a whole platform folder at once.</li>
          <li>Check Data freshness reads &quot;through 18 Oct&quot; on every daily card.</li>
          <li>The 30 weekly files (19 to 25 Oct). Same steps.</li>
        </ol>
        <div className="muted">Brand Master status: {loaded ? <Pill tone="good">Loaded for {brand!.name}</Pill> : <Pill tone="warn">Not loaded{brand ? ` for ${brand.name}` : ""}</Pill>}</div>
      </section>
      {brand ? (
        <section className="card">
          <h2>Blank templates for {brand.name}</h2>
          <div className="muted">All 31 files (Brand Master plus six per platform), each with a &quot;How to use&quot; tab, and {brand.name} already filled in on the Meta tab so the upload matches this brand.</div>
          <div><a className="btn alt" href="/api/templates" download>Download templates for {brand.name}</a></div>
        </section>
      ) : null}
      <UploadCenter setupDone={loaded} />
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
