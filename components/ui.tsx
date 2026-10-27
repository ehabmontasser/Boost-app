import type { ReactNode } from "react";
import InfoTip from "./InfoTip";

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
