// The tools the BOOST agents can call. All read-only: they return figures computed in code, never raw rows.
import * as Q from "../queries";
import { payload, type ModuleName } from "../analyze";
import { getCtx, promoModel, replenishmentModel } from "../metrics";
import { resolvePeriod, type PeriodQuery } from "../period";

const PERIOD_SCHEMA = {
  type: "object",
  description: "Reporting period and comparison. Weeks run Monday to Sunday.",
  properties: {
    view: { type: "string", enum: ["week", "month", "quarter", "ytd", "custom", "year"], description: "week, month, quarter, ytd (year to date), custom (needs from and to) or year (the full data span)" },
    p: { type: "string", description: "Which week (its Monday, yyyy-mm-dd), month (yyyy-mm) or quarter (yyyy-Qn). Omit for the latest one." },
    from: { type: "string", description: "Custom range start, yyyy-mm-dd" },
    to: { type: "string", description: "Custom range end, yyyy-mm-dd" },
    cmp: { type: "string", enum: ["pp", "yoy"], description: "Compare with the previous period (pp, default) or the same period last year (yoy)" },
  },
  required: ["view"],
};

const screen = (name: string, description: string) => ({
  name, description,
  input_schema: { type: "object", properties: { period: PERIOD_SCHEMA }, required: ["period"] },
});

export const DATA_TOOLS = [
  screen("get_overview", "Overview screen: net sales, ad spend, ROAS, lost demand and wipes segment share per platform for the period, with the comparison period's totals."),
  screen("get_replenishment", "Inventory Management screen: stock position on the last day of the period (nodes at risk with cover days, next PO date and units short; overstocked lines), lost demand per platform and SKU, lowest PO confirmation rates."),
  screen("get_ads", "Performance Marketing screen: spend, ROAS vs target, budget-limited campaigns, spend below target and spend on suppressed listings, with the comparison period's spend and ROAS."),
  screen("get_promotions", "Deals and Promotions screen: every promotion running in the period with funding, depth, volume lift and estimated profit effect (each run compared with the 14 days before it)."),
  screen("get_market", "Market Share screen: Sprout's wipes and skin care share per platform vs the comparison, top wipes products on each platform, and Sprout SKUs not listed."),
  screen("get_product_view", "One row per platform and Sprout product joining the screens: net sales and change vs the comparison, ad spend and attributed sales with campaign names, stock status on the period's last day (at risk or watch with the worst node, cover days, units short, next PO; or overstock days), promotions running and their profit effect, and lost demand. Use it to find conflicts between screens, e.g. ads or promotions on products that are about to run out or are overstocked."),
];

const r = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** Runs one tool and returns its result as JSON text (or an error message the model can read). */
export async function runTool(name: string, input: unknown): Promise<{ text: string; summary: string; isError?: boolean }> {
  const q = ((input as { period?: PeriodQuery })?.period ?? {}) as PeriodQuery;
  const screens: Record<string, ModuleName> = { get_overview: "overview", get_replenishment: "replenishment", get_ads: "ads", get_promotions: "promotions", get_market: "market" };
  try {
    if (screens[name]) {
      const p = await payload(screens[name], q);
      if (!p) return { text: "No data loaded yet.", summary: "no data", isError: true };
      const period = (p.data as { period?: { label?: string; comparedWith?: string | null } }).period;
      // these screens show the chosen period only: add the comparison period's figures so the agent can compare
      let comparison: unknown = undefined;
      if (["get_promotions", "get_ads", "get_replenishment"].includes(name)) {
        const c = await getCtx();
        const rp = c?.minDate && c.asOf ? resolvePeriod(q, c.minDate, c.asOf) : null;
        if (rp?.prev) {
          const cp = await payload(screens[name], { view: "custom", from: rp.prev.from, to: rp.prev.to });
          if (cp) { const { period: _p, ...rest } = cp.data as Record<string, unknown>; comparison = { period: `${rp.prev.label}, ${rp.prev.from} to ${rp.prev.to}`, ...rest }; }
        }
      }
      return { text: JSON.stringify(comparison ? { ...(p.data as object), comparisonPeriodFigures: comparison } : p.data), summary: describe(period) };
    }
    if (name === "get_product_view") {
      const out = await productView(q);
      if (!out) return { text: "No data loaded yet.", summary: "no data", isError: true };
      return { text: JSON.stringify(out), summary: describe(out.period) };
    }
    return { text: `Unknown tool ${name}`, summary: "unknown tool", isError: true };
  } catch (e) {
    return { text: `Tool failed: ${(e as Error).message}`, summary: "failed", isError: true };
  }
}

function describe(period?: { label?: string; comparedWith?: string | null }) {
  if (!period) return "";
  return `${period.label ?? ""}${period.comparedWith ? ` vs ${period.comparedWith.replace(/, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/, "")}` : ""}`;
}

/** Platform x product view joining sales, ads, stock status, promotions and lost demand. */
async function productView(query: PeriodQuery) {
  const c = await getCtx();
  if (!c || !c.asOf || !c.minDate) return null;
  const p = resolvePeriod(query, c.minDate, c.asOf);
  const [sales, prevSales, ads, lost, rep, promo] = await Promise.all([
    Q.salesBySku(c.brandId, p), p.prev ? Q.salesBySku(c.brandId, p.prev) : Promise.resolve([]), Q.adsBySku(c.brandId, p),
    Q.lostBySku(c.brandId, p), replenishmentModel(c, p), promoModel(c, p),
  ]);
  type Row = { platform: string; product: string; netSales: number; netSalesBefore: number | null; adSpend: number; adAttributedSales: number; campaigns: string[];
    stock: string | null; promotions: { name: string; profitEffect: number }[]; lostDemand: number };
  const rows = new Map<string, Row>();
  const row = (platform: string, sku: string): Row => {
    const k = platform + "|" + sku;
    if (!rows.has(k)) rows.set(k, { platform: c.nameOf(platform), product: c.skuName(sku), netSales: 0, netSalesBefore: p.prev ? 0 : null, adSpend: 0, adAttributedSales: 0, campaigns: [], stock: null, promotions: [], lostDemand: 0 });
    return rows.get(k)!;
  };
  const sku = (platform: string, psid: string) => c.skuOf(platform, psid);
  for (const s of sales) { const k = sku(s.platform, s.platform_sku_id); if (k) row(s.platform, k).netSales += Number(s.net); }
  for (const s of prevSales) { const k = sku(s.platform, s.platform_sku_id); if (k) { const x = row(s.platform, k); x.netSalesBefore = (x.netSalesBefore ?? 0) + Number(s.net); } }
  for (const a of ads) {
    const k = sku(a.platform, a.platform_sku_id); if (!k) continue;
    const x = row(a.platform, k); x.adSpend += Number(a.spend); x.adAttributedSales += Number(a.att);
    if (Number(a.spend) > 0 && !x.campaigns.includes(a.campaign_name)) x.campaigns.push(a.campaign_name);
  }
  for (const l of lost) { const k = sku(l.platform, l.platform_sku_id); if (k) row(l.platform, k).lostDemand += Number(l.value); }
  if (rep) {
    // worst node per platform and product: At risk before Watch, then the most units short
    for (const n of [...rep.action].reverse()) {
      row(n.platform, n.sku).stock = `${n.status} at ${n.nodeName}: ${r(n.cover, 1)} days of cover, ${n.eta ? `next PO ${n.eta}` : "no open PO"}${n.unitsAtRisk >= 1 ? `, about ${r(n.unitsAtRisk)} units short` : ""}`;
    }
    for (const o of rep.overstock) row(o.platform, o.sku).stock = `Overstock: ${r(o.cover)} days of cover (all nodes), open PO ${o.openPo} units`;
  }
  for (const pr of promo.rows) {
    const share = pr.skuCodes.length ? pr.effect / pr.skuCodes.length : 0;
    for (const s of pr.skuCodes) row(pr.platform, s).promotions.push({ name: pr.promo, profitEffect: r(share) });
  }
  return {
    period: { label: p.label, from: p.from, to: p.to, comparedWith: p.prev ? `${p.prev.label}` : p.noPrev },
    note: "EGP ex VAT. stock describes the position on the period's last day (null = healthy). A promotion's profit effect is split evenly over its SKUs.",
    rows: [...rows.values()].filter((x) => x.netSales > 0 || x.adSpend > 0 || x.stock).sort((a, b) => b.netSales - a.netSales)
      .map((x) => ({ ...x, netSales: r(x.netSales), netSalesBefore: x.netSalesBefore === null ? null : r(x.netSalesBefore), adSpend: r(x.adSpend), adAttributedSales: r(x.adAttributedSales), lostDemand: r(x.lostDemand) })),
  };
}
