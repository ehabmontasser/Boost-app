import { platformColor } from "./ui";

/** Horizontal bars, one per row, scaled to the largest value. */
export function Bars({ rows, format }: { rows: { code: string; label: string; value: number }[]; format: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((r) => (
        <div className="barrow" key={r.code}>
          <span>{r.label}</span>
          <div className="bartrack"><div className="barfill" style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: platformColor[r.code] ?? "var(--ink)" }} /></div>
          <b style={{ textAlign: "right" }}>{format(r.value)}</b>
        </div>
      ))}
    </div>
  );
}

/** Multi-series line chart with direct end labels. Values are fractions (0.18 = 18%). */
export function ShareLines({ series, label }: { series: { code: string; name: string; share: number[] }[]; label: string }) {
  const W = 420, H = 220, L = 44, R = 96, T = 14, B = 26;
  const all = series.flatMap((s) => s.share);
  if (!all.length) return <div className="muted">No market data yet.</div>;
  const lo = Math.max(0, Math.floor((Math.min(...all) * 100 - 1) / 2) * 2) / 100;
  const hi = Math.ceil((Math.max(...all) * 100 + 1) / 2) * 2 / 100;
  const n = Math.max(...series.map((s) => s.share.length));
  const x = (i: number) => L + (n > 1 ? (i / (n - 1)) * (W - L - R) : 0);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  // avoid overlapping end labels: sort by last value and push apart
  const ends = series.map((s) => ({ s, y: y(s.share[s.share.length - 1] ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  const labelY = new Map(ends.map((e) => [e.s.code, e.y]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: "100%", height: "auto" }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 6} y={y(t) + 4} fontSize="11" textAnchor="end" fill="var(--muted)">{(t * 100).toFixed(0)}%</text>
        </g>
      ))}
      <text x={L} y={H - 6} fontSize="11" fill="var(--muted)">week 1</text>
      <text x={W - R} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="end">latest</text>
      {series.map((s) => (
        <g key={s.code}>
          <polyline fill="none" stroke={platformColor[s.code] ?? "var(--ink)"} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
            points={s.share.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />
          <text x={W - R + 8} y={(labelY.get(s.code) ?? 0) + 4} fontSize="11" fontWeight="600" fill={platformColor[s.code] ?? "var(--ink)"}>
            {s.name} {((s.share[s.share.length - 1] ?? 0) * 100).toFixed(1)}%
          </text>
        </g>
      ))}
    </svg>
  );
}
