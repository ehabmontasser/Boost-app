import type { ReactNode } from "react";
import InfoTip from "./InfoTip";
import { pct } from "@/lib/format";

export function Kpi({ label, value, note, tone, info }: { label: string; value: string; note?: ReactNode; tone?: "bad" | "good" | "warn" | "info"; info?: string }) {
  return (
    <div className="kpi">
      <div className="l">{label}{info ? <InfoTip label={label} text={info} /> : null}</div>
      <div className="v">{value}</div>
      {note ? <div className={"d " + (tone ?? "")}>{note}</div> : null}
    </div>
  );
}

/** Card heading with an info icon that explains the figures in the card. */
export function Title({ children, info }: { children: string; info: string }) {
  return <h2 className="title-info">{children}<InfoTip label={children} text={info} /></h2>;
}

export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "info" | "mute"; children: ReactNode }) {
  return <span className={"pill p-" + tone}>{children}</span>;
}

export function Header({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="head">
      <div>
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{children}</div>
    </header>
  );
}

export function Empty({ admin }: { admin: boolean }) {
  return (
    <div className="card">
      <h2>No data loaded yet</h2>
      <div className="muted" style={{ fontSize: 15 }}>
        {admin ? "Open Admin > Upload center, then upload the Brand Master first and the platform files after it." : "The account manager has not uploaded data yet."}
      </div>
    </div>
  );
}

export const platformColor: Record<string, string> = {
  TALABAT: "var(--c-talabat)", NOON: "var(--c-noon)", AMAZON: "var(--c-amazon)", AMAZON_NOW: "var(--c-amazonnow)", BREADFAST: "var(--c-breadfast)", RABBIT: "#66717e",
};

export function statusTone(s: string): "good" | "warn" | "bad" | "info" | "mute" {
  if (s === "At risk" || s === "Below target" || s === "Rejected") return "bad";
  if (s === "Watch" || s === "Suppressed") return "warn";
  if (s === "Overstock") return "info";
  if (s === "Healthy" || s === "On target") return "good";
  return "mute";
}

/** Brand share per sub-segment with the change against the comparison, biggest drop first. */
export function SubSegmentTable({ rows, withPlatform }: { rows: { name: string; sub: string; share: number; base: number | null }[]; withPlatform?: boolean }) {
  const pts = (r: { share: number; base: number | null }) => (r.base === null ? null : (r.share - r.base) * 100);
  const sorted = [...rows].sort((a, b) => (pts(a) ?? 0) - (pts(b) ?? 0) || a.share - b.share);
  const cols = withPlatform ? 4 : 3;
  return (
    <div className="tablewrap"><table className="fit">
      <thead><tr>{withPlatform ? <th>Platform</th> : null}<th>Sub-segment</th><th className="r">Share</th><th className="r">Change</th></tr></thead>
      <tbody>{sorted.length === 0 ? <tr><td colSpan={cols} className="muted">No sales in any sub-segment in this period.</td></tr> : sorted.map((r, i) => {
        const d = pts(r);
        return (
          <tr key={i}>{withPlatform ? <td>{r.name}</td> : null}<td>{r.sub}</td><td className="r">{pct(r.share)}</td>
            <td className={"r " + (d === null ? "muted" : d <= -0.05 ? "bad" : d >= 0.05 ? "good" : "")}>{d === null ? "-" : `${d > 0 ? "+" : ""}${d.toFixed(1)} pts`}</td></tr>
        );
      })}</tbody>
    </table></div>
  );
}
