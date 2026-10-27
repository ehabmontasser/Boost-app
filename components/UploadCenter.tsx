"use client";
import { useRef, useState } from "react";

type Result = { name: string; status: "imported" | "imported_with_warnings" | "rejected" | "error"; slot: string; message: string; details: string[] };

function order(a: File, b: File) {
  const rank = (f: File) => (f.name.toUpperCase().startsWith("SETUP") ? 0 : 1);
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

export default function UploadCenter({ setupDone }: { setupDone: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  async function send(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    const sorted = [...files].sort(order);
    const out: Result[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      setProgress(`Uploading ${i + 1} of ${sorted.length}: ${f.name}`);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        let j: any = null;
        try { j = await res.json(); } catch { /* not json */ }
        if (!j) out.push({ name: f.name, status: "error", slot: "-", message: `Server answered ${res.status} without details. Try this file again.`, details: [] });
        else if (!j.ok) out.push({ name: f.name, status: "error", slot: "-", message: j.error ?? "Upload failed.", details: [] });
        else out.push({ name: f.name, status: j.status, slot: j.slot, message: j.message, details: [...(j.errors ?? []), ...(j.warnings ?? [])] });
      } catch {
        out.push({ name: f.name, status: "error", slot: "-", message: "Could not reach the server. Check your connection and try this file again.", details: [] });
      }
      setResults([...out].reverse());
    }
    setProgress("");
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  const ok = results.filter((r) => r.status === "imported" || r.status === "imported_with_warnings").length;
  const bad = results.length - ok;

  return (
    <section className="card">
      <h2>Upload files</h2>
      {!setupDone ? (
        <div className="notice n-warn">No Brand Master yet. Upload SETUP_00_BRAND_MASTER first. It is sent first automatically when you select it together with other files.</div>
      ) : null}
      <div className="dz">
        <div><b>Select one or many .xlsx files.</b> Each file is checked, routed to its platform and card from its Meta tab, and replaced by key if it was loaded before. Safe to repeat.</div>
        <input ref={input} type="file" accept=".xlsx" multiple disabled={busy} aria-label="Choose xlsx files"
          onChange={(e) => send(Array.from(e.target.files ?? []))} />
        {busy ? <div className="muted" role="status">{progress}</div> : null}
      </div>
      {results.length ? (
        <>
          <div className={"notice " + (bad ? "n-warn" : "n-good")} role="status">{ok} of {results.length} files imported{bad ? `, ${bad} rejected or failed. Open a row to see why.` : "."}</div>
          <div className="tablewrap"><table>
            <thead><tr><th>File</th><th>Routed to</th><th>Result</th></tr></thead>
            <tbody>{results.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.slot}</td>
                <td>
                  <span className={r.status === "imported" ? "good" : r.status === "imported_with_warnings" ? "warn" : "bad"}>{r.status === "imported" ? "Imported" : r.status === "imported_with_warnings" ? "Imported with warnings" : r.status === "rejected" ? "Rejected" : "Failed"}</span>
                  <div className="muted">{r.message}</div>
                  {r.details.slice(0, 4).map((d, k) => (<div key={k} className="muted">{d}</div>))}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        </>
      ) : null}
    </section>
  );
}
