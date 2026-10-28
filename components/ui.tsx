import type { ReactNode } from "react";
import InfoTip from "./InfoTip";
import { egp, pct } from "@/lib/format";

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

type CampaignRow = { platform: string; name: string; id: string; campaign: string; type: string; objective: string; spend: number; roas: number; target: number; lostShare: number; spendShare: number; flag: string };
/** What to do with a campaign, in plain words (the model's flag stays the same for Claude). */
export const campaignAction = (flag: string) => (flag.startsWith("Scale") ? "Add budget" : flag === "Below target" ? "Fix or cut" : "Keep");

/** Campaign table for Performance Marketing and Platform Analysis, biggest spend first, with a key under it. */
export function CampaignTable({ rows, withPlatform }: { rows: CampaignRow[]; withPlatform?: boolean }) {
  return (
    <>
      <div className="tablewrap"><table className="camp">
        <thead><tr><th>{withPlatform ? "Platform · campaign" : "Campaign"}</th><th className="r">Spend</th><th className="r">Share of platform</th><th className="r">ROAS</th><th className="r">Target</th><th className="r">Views missed</th><th>Action</th></tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={7} className="muted">No ad spend in this period.</td></tr> : rows.map((r) => (
          <tr key={r.platform + r.id}>
            <td>{withPlatform ? <><b>{r.name}</b><div>{r.campaign}</div></> : <b>{r.campaign}</b>}<div className="muted">{r.type} · {r.objective}</div></td>
            <td className="r">{egp(r.spend)}</td>
            <td className="r">{pct(r.spendShare, 0)}</td>
            <td className={"r " + (r.roas < r.target ? "bad" : "good")}><b>{r.roas.toFixed(2)}</b></td>
            <td className="r">{r.target.toFixed(2)}</td>
            <td className="r">{pct(r.lostShare, 0)}</td>
            <td><Pill tone={r.flag.startsWith("Scale") ? "info" : statusTone(r.flag)}>{campaignAction(r.flag)}</Pill></td>
          </tr>
        ))}</tbody>
      </table></div>
      <ul className="table-key">
        <li><b>Order:</b> biggest spend first.</li>
        <li><b>ROAS:</b> sales from the ads (within 7 days of a click) divided by ad spend. 4.0 means EGP 4 of sales for every EGP 1 spent. Green when it meets the target, red when it misses.</li>
        <li><b>Target:</b> the target ROAS, the minimum return agreed for each platform, set by the account manager in the Brand Master (Platform terms tab). It is the same for every campaign on a platform.</li>
        <li><b>Views missed:</b> out of all the times the platform could have shown the ad, the share it did not, because the daily budget was used up (reported by the platform). A high figure means the campaign could sell more with more budget.</li>
        <li><b>Action:</b> <i>Fix or cut</i> when ROAS is below target. <i>Add budget</i> when ROAS meets the target and 15% or more of ad views were missed. <i>Keep</i> when ROAS meets the target and the budget is not holding it back.</li>
      </ul>
    </>
  );
}
