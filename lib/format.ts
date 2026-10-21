export function egp(n: number, compact = true): string {
  const v = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (compact && v >= 1_000_000) return `${sign}EGP ${(v / 1_000_000).toFixed(2)}M`;
  if (compact && v >= 10_000) return `${sign}EGP ${Math.round(v / 1000)}k`;
  return `${sign}EGP ${Math.round(v).toLocaleString("en-US")}`;
}
export const int = (n: number) => Math.round(n).toLocaleString("en-US");
export const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
export const days = (n: number) => `${n.toFixed(1)} days`;
export function dateLabel(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
