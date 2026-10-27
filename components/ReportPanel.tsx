"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Brief } from "@/lib/agent/engine";
import { AgentText, BriefView } from "./AgentParts";
import { dayLabel } from "@/lib/period";

type Item = { id: string; view: "week" | "month"; label: string; createdAt: string };

/** A saved Business Review report: choose from the history, download as PDF, and (admin) edit the account manager notes. */
export default function ReportPanel({ report, items, admin, brand, notesMax }: {
  report: { id: string; view: "week" | "month"; label: string; brief: Brief; notes: string; dataThrough: string; tools: number; model: string; createdAt: string };
  items: Item[]; admin: boolean; brand: string; notesMax: number;
}) {
  const router = useRouter();
  const path = usePathname();
  const [notes, setNotes] = useState(report.notes);
  const [saved, setSaved] = useState(report.notes);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const created = new Date(report.createdAt);
  const when = `${created.getUTCDate()} ${created.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${created.getUTCFullYear()}`;
  const type = report.view === "month" ? "Monthly Business Review" : "Weekly Business Review";

  async function saveNotes() {
    setStatus("Saving...");
    try {
      const res = await fetch("/api/agent/review/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: report.id, notes }) });
      const j = await res.json();
      if (j.ok) { setSaved(notes); setEditing(false); setStatus("Notes saved."); router.refresh(); } else setStatus(j.error ?? "Could not save.");
    } catch { setStatus("Could not reach the server."); }
  }

  return (
    <section className="card report">
      <div className="report-toolbar no-print">
        <label className="review-field">Report
          <select value={report.id} onChange={(e) => router.push(`${path}?report=${e.target.value}`)}>
            {items.map((i) => {
              const d = new Date(i.createdAt);
              return <option key={i.id} value={i.id}>{i.view === "month" ? "Monthly" : "Weekly"} · {i.label} · created {d.getUTCDate()} {d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}</option>;
            })}
          </select>
        </label>
        <button type="button" className="btn ghost" onClick={() => window.print()}>Download PDF</button>
      </div>
      {/* BOOST brand bar and footer: shown only in the PDF */}
      <div className="print-only print-bar" aria-hidden="true">
        <span className="pb-logo"><svg width="16" height="16" viewBox="0 0 22 22"><path d="M3 17 L9 10 L13 13 L19 4" fill="none" stroke="#101923" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <span className="pb-name">BOOST</span>
        <span className="pb-right">{type} · {brand}</span>
      </div>
      <div className="print-only print-foot" aria-hidden="true">Prepared with BOOST · {brand} · {type}, {report.label} · Confidential, for {brand} only</div>
      <div className="report-head">
        <div className="report-kicker">{brand} · {type}</div>
        <h2 className="report-title">{report.label}</h2>
        <div className="muted">Prepared with BOOST on {when} · data through {report.dataThrough ? dayLabel(report.dataThrough) : "-"} · all figures EGP excluding VAT · synthetic demo data</div>
      </div>
      <div className="report-notes">
        <h3>Account manager notes</h3>
        {editing ? (
          <div className="no-print">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={notesMax} rows={5} />
            <div className="report-note-actions">
              <button type="button" className="btn" onClick={saveNotes}>Save notes</button>
              <button type="button" className="btn ghost" onClick={() => { setNotes(saved); setEditing(false); setStatus(null); }}>Cancel</button>
              <span className="note">{notes.length}/{notesMax}</span>
            </div>
          </div>
        ) : saved.trim() ? <AgentText text={saved} /> : <div className="muted">{admin ? "No notes yet." : "No notes from the account manager for this period."}</div>}
        {admin && !editing ? <button type="button" className="linkbtn dark no-print" onClick={() => { setEditing(true); setStatus(null); }}>{saved.trim() ? "Edit notes" : "Add notes"}</button> : null}
        {status ? <div className="note no-print">{status}</div> : null}
      </div>
      <BriefView brief={report.brief} meta={`${report.tools} tool calls · ${report.model}`} />
    </section>
  );
}
