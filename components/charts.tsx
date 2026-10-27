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

type Series = { code: string; name: string; share: number[] };
const endText = (s: Series) => `${s.name} ${((s.share[s.share.length - 1] ?? 0) * 100).toFixed(1)}%`;

/** Multi-series line chart. Values are fractions (0.18 = 18%). Wide screens label the line ends;
 *  phones get a compact chart with larger axis text and a legend underneath, so labels stay readable. */
export function ShareLines({ series, label, start = "first week", end = "latest" }: { series: Series[]; label: string; start?: string; end?: string }) {
  if (!series.some((s) => s.share.length)) return <div className="muted">No market data yet.</div>;
  return (
    <div className="chart-box">
      <div className="chart-wide"><ShareLinesPlot series={series} label={label} compact={false} start={start} end={end} /></div>
      <div className="chart-compact">
        <ShareLinesPlot series={series} label={label} compact start={start} end={end} />
        <ul className="chart-legend">
          {[...series].sort((a, b) => (b.share[b.share.length - 1] ?? 0) - (a.share[a.share.length - 1] ?? 0)).map((s) => (
            <li key={s.code}><span className="dot" style={{ background: platformColor[s.code] ?? "var(--ink)" }} />{endText(s)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ShareLinesPlot({ series, label, compact, start, end }: { series: Series[]; label: string; compact: boolean; start: string; end: string }) {
  const all = series.flatMap((s) => s.share);
  // wide: right margin sized to the longest end label (about 7 units per character at 11px semibold), so labels are never cut off
  const R = compact ? 12 : Math.ceil(Math.max(...series.map((s) => endText(s).length)) * 7) + 12;
  const fs = compact ? 14 : 11; // compact charts are drawn smaller, so their axis text is set larger
  const W = 340 + (compact ? 0 : R), H = 220, L = compact ? 48 : 44, T = 14, B = compact ? 30 : 26;
  const lo = Math.max(0, Math.floor((Math.min(...all) * 100 - 1) / 2) * 2) / 100;
  const hi = Math.ceil((Math.max(...all) * 100 + 1) / 2) * 2 / 100;
  const n = Math.max(...series.map((s) => s.share.length));
  const x = (i: number) => L + (n > 1 ? (i / (n - 1)) * (W - L - R) : 0);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const ticks = [lo, (lo + hi) / 2, hi];
  // avoid overlapping end labels: sort by last value and push apart
  const ends = series.map((s) => ({ s, y: y(s.share[s.share.length - 1] ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  // keep the stack inside the plot: shift up if the lowest label falls below the axis, then down if the top one is cut
  const over = (ends[ends.length - 1]?.y ?? 0) - (H - B);
  if (over > 0) ends.forEach((e) => { e.y -= over; });
  const under = T + 4 - (ends[0]?.y ?? T);
  if (under > 0) ends.forEach((e) => { e.y += under; });
  const labelY = new Map(ends.map((e) => [e.s.code, e.y]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: "100%", height: "auto" }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 6} y={y(t) + fs / 3} fontSize={fs} textAnchor="end" fill="var(--muted)">{(t * 100).toFixed(0)}%</text>
        </g>
      ))}
      <text x={L} y={H - 6} fontSize={fs} fill="var(--muted)">{start}</text>
      <text x={W - R} y={H - 6} fontSize={fs} fill="var(--muted)" textAnchor="end">{end}</text>
      {series.map((s) => (
        <g key={s.code}>
          <polyline fill="none" stroke={platformColor[s.code] ?? "var(--ink)"} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
            points={s.share.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />
          {compact ? null : (
            <text x={W - R + 8} y={(labelY.get(s.code) ?? 0) + 4} fontSize="11" fontWeight="600" fill={platformColor[s.code] ?? "var(--ink)"}>
              {endText(s)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
