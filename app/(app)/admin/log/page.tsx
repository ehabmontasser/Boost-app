import { requireAdmin } from "@/lib/auth";
import { getBrand, ingestionLog, mappingQueue } from "@/lib/queries";
import { Header, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } }
  return [];
}

export default async function Log() {
  await requireAdmin();
  const brand = await getBrand();
  const log = brand ? await ingestionLog(brand.id) : [];
  const queue = brand ? await mappingQueue(brand.id) : [];
  return (
    <>
      <Header title="Ingestion log" sub="Every file received, what happened to it, and why it was rejected if it was." />
      <section className="card">
        <h2>Latest 40 files</h2>
        {log.length === 0 ? <div className="muted">No files received yet.</div> : (
          <div className="tablewrap"><table>
            <thead><tr><th>When</th><th>File</th><th>Slot</th><th className="r">Rows</th><th>Result</th></tr></thead>
            <tbody>{log.map((r) => {
              const notes = [...list(r.errors), ...list(r.warnings)];
              return (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{r.file_name}</td>
                  <td>{r.slot_platform} · {r.slot_feed}</td>
                  <td className="r">{r.rows_imported.toLocaleString("en-US")}</td>
                  <td>
                    <Pill tone={r.status === "imported" ? "good" : r.status === "rejected" ? "bad" : "warn"}>{r.status.replace(/_/g, " ")}</Pill>
                    {notes.slice(0, 3).map((n, i) => (<div key={i} className="muted">{n}</div>))}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
      <section className="card">
        <h2>SKU mapping queue</h2>
        {queue.length === 0 ? <div className="muted">Empty. Every platform SKU in the uploads matches the Brand Master.</div> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Platform</th><th>Platform SKU</th><th>GTIN</th><th>First seen in</th></tr></thead>
            <tbody>{queue.map((r, i) => (<tr key={i}><td>{r.platform}</td><td>{r.platform_sku_id}</td><td>{r.gtin ?? "-"}</td><td>{r.first_seen_file}</td></tr>))}</tbody>
          </table></div>
        )}
        <div className="muted">Add these SKUs to the Brand Master Platform_Listings tab and upload it again.</div>
      </section>
    </>
  );
}
