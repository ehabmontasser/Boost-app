// Claude analysis layer. The figures are computed in code (lib/metrics.ts); Claude only interprets them.
import { createHash } from "node:crypto";
import { q } from "./db";
import { adsModel, getCtx, marketModel, overviewModel, promoModel, replenishmentModel } from "./metrics";
import { resolvePeriod, type PeriodQuery } from "./period";

export const MODULES = ["overview", "replenishment", "ads", "promotions", "market"] as const;
export type ModuleName = (typeof MODULES)[number];

export type Insight = {
  headline: string;
  actions: { title: string; why: string; do: string; impact: string }[];
  watch: string[];
};
export type AnalysisResult = { ok: true; insight: Insight | null; raw?: string; cached: boolean; model: string } | { ok: false; error: string };

const r = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

async function payload(module: ModuleName, query: PeriodQuery): Promise<{ brandId: string; data: unknown } | null> {
  const c = await getCtx();
  if (!c || !c.asOf || !c.minDate) return null;
  const p = resolvePeriod(query, c.minDate, c.asOf);
  const period = { label: p.label, from: p.from, to: p.to, days: p.days, comparison: p.cmp === "yoy" ? "same period last year" : "previous period", comparedWith: p.prev ? `${p.prev.label}, ${p.prev.from} to ${p.prev.to}` : p.noPrev };
  switch (module) {
    case "overview": {
      const m = await overviewModel(c, p);
      return { brandId: c.brandId, data: {
        brand: c.brandName, period, currency: "EGP ex VAT",
        note: "All figures cover the period only. wipesSegmentShare = Sprout's share of all wipes sales on that platform, all brands included (a fraction, 0.188 = 18.8%). It is market share, not a share of Sprout's own sales. wipesSegmentShareBefore = the previous period (or the period's first week).",
        totals: { netSales: r(m.totalNet), adSpend: r(m.totalSpend), adSpendPct: r(m.spendPct, 3), lostDemand: r(m.totalLost), lostDemandPct: r(m.lostPct, 3) },
        previousPeriodTotals: m.prevTotals ? { netSales: r(m.prevTotals.net), adSpend: r(m.prevTotals.spend), lostDemand: r(m.prevTotals.lost) } : null,
        platforms: m.rows.map((x) => ({ platform: x.name, platformType: x.channel, netSales: r(x.net), netSalesPreviousPeriod: x.prevNet === null ? null : r(x.prevNet), adSpend: r(x.spend), roas: r(x.roas, 2), lostDemand: r(x.lostValue), lostPct: r(x.lostPct, 3), wipesSegmentShareBefore: x.wipesBase === null ? null : r(x.wipesBase, 3), wipesSegmentShare: x.wipesNow === null ? null : r(x.wipesNow, 3) })),
      } };
    }
    case "replenishment": {
      const m = await replenishmentModel(c, p);
      if (!m) return null;
      return { brandId: c.brandId, data: {
        brand: c.brandName, period, stockPositionOn: m.asOf, currency: "EGP ex VAT", note: "Stock position is on the last day of the period. cover = on hand / average daily units of the 14 days up to that day. gapDays = days a node is expected to be empty before the next PO lands. Lost demand and PO figures cover the period.",
        atRisk: m.atRisk.slice(0, 10).map((x) => ({ platform: x.platformName, node: x.nodeName, sku: x.skuName, onHand: x.onHand, coverDays: r(x.cover, 1), nextPoEta: x.eta, gapDays: r(x.gapDays, 1), unitsAtRisk: r(x.unitsAtRisk) })),
        overstock: m.overstock.slice(0, 5).map((x) => ({ platform: x.name, sku: x.skuName, onHand: x.onHand, coverDays: r(x.cover), openPoUnits: x.openPo, nextPoEta: x.eta, maxCoverDays: x.maxCover })),
        lostDemandByPlatform: m.channel.map((x) => ({ platform: x.name, lostDemandEgp: r(x.lostValue), lostPctOfSales: r(x.lostPct, 3) })),
        topLostSkus: m.lostTop.slice(0, 6).map((x) => ({ platform: x.name, sku: x.skuName, lostDemandEgp: r(x.value), inStockRate: r(x.inStock, 3) })),
        lowestPoConfirmation: m.lowestConfirm.map((x) => ({ platform: x.name, sku: x.skuName, confirmRate: r(x.confirmRate ?? 0, 2), avgLeadTimeDays: r(x.lead, 1) })),
      } };
    }
    case "ads": {
      const m = await adsModel(c, p);
      return { brandId: c.brandId, data: {
        brand: c.brandName, period, currency: "EGP ex VAT", note: "ROAS = attributed 7-day sales / ad spend. lostShareBudget = share of impressions lost to budget. All figures cover the period.",
        totals: { adSpend: r(m.totalSpend), attributedSales: r(m.totalAtt), roas: r(m.roas, 2), spendInCampaignsBelowTargetRoas: r(m.belowSpend), adSpendPreviousPeriod: m.prevSpend === null ? null : r(m.prevSpend), roasPreviousPeriod: m.prevRoas === null ? null : r(m.prevRoas, 2) },
        campaigns: m.rows.slice(0, 14).map((x) => ({ platform: x.name, campaign: x.campaign, type: x.type, objective: x.objective, spend: r(x.spend), roas: r(x.roas, 2), targetRoas: x.target, shareOfPlatformSpend: r(x.spendShare, 3), lostShareBudget: r(x.lostShare, 3), flag: x.flag })),
        spendOnSuppressedListings: m.suppressed.map((x) => ({ platform: x.name, spend: r(x.spend), attributedSales: r(x.att) })),
      } };
    }
    case "promotions": {
      const m = await promoModel(c, p);
      return { brandId: c.brandId, data: {
        brand: c.brandName, period, currency: "EGP ex VAT", method: "Each run of a promotion is compared with the SKU's non-promo days in the 14 days before it. Estimated profit effect = (promo daily units x promo margin - baseline daily units x normal margin) x promo days, after platform margin, COGS and the vendor-funded discount. Runs that overlap the period are counted in full.",
        totals: { dilutive: r(m.dilutive), accretive: r(m.accretive) },
        promotions: m.rows.map((x) => ({ platform: x.name, promo: x.promo, type: x.type, funding: x.funding, runs: x.runs, depth: r(x.depth, 3), vendorFundedShare: r(x.vendorShare, 2), volumeUplift: r(x.uplift, 2), estimatedProfitEffect: r(x.effect), skus: x.skus, skuDays: x.days })),
      } };
    }
    case "market": {
      const m = await marketModel(c, p);
      return { brandId: c.brandId, data: {
        brand: c.brandName, period, latestWeekInPeriod: m.latestWeek,
        note: "Segment share = Sprout's share of all sales in that category on that platform, all brands included (a fraction, 0.188 = 18.8%), for the weeks in the period. 'before' is the previous period (or the period's first week).",
        wipesSegmentShare: m.wipesNow.map((x) => ({ platform: x.name, before: x.base === null ? null : r(x.base, 3), now: x.now === null ? null : r(x.now, 3) })),
        skinCareSegmentShare: m.skinNow.map((x) => ({ platform: x.name, before: x.base === null ? null : r(x.base, 3), now: x.now === null ? null : r(x.now, 3) })),
        topWipesSkusLatestWeek: Object.fromEntries(Object.entries(m.top).map(([k, v]) => [c.nameOf(k), v.slice(0, 5).map((x) => ({ rank: x.rank, brand: x.brand, product: x.product, subCategory: x.sub, own: x.own }))])),
        brandSkusNotListed: m.gaps.map((g) => ({ platform: g.name, missing: g.missing })),
      } };
    }
  }
}

const SYSTEM = `You are a senior e-commerce and quick-commerce analyst advising a brand's commercial team in Egypt. You are given pre-computed figures for one module of a multi-platform analytics tool.

Method:
1. Use only the figures provided. Never invent numbers, never estimate figures that are not given. If something cannot be concluded from the data, say so in "watch".
2. The figures cover one reporting period (see "period"). Say which period you are talking about, and use the comparison figures (previous period or same period last year, see "period.comparison") when given to say what changed. Lead with what matters most in money terms (EGP, ex VAT). Rank actions by size of impact.
3. Every action must cite the specific figures that justify it, name the platform and SKU or campaign, and say exactly what to do and by when if a date is given.
4. Separate facts (from the data) from judgement (your recommendation). Flag assumptions and uncertainty plainly.
5. Treat each platform on its own economics. Call Talabat Mart, Noon, Amazon Core, Amazon Now and Breadfast "platforms", never "channels". Amazon Core (large fulfilment centres, no shelf limit) and Amazon Now (dark stores with limited shelf space) are two separate platforms.
6. Write plainly, no jargon, no emojis, no em dashes. Short sentences.

Return ONLY a JSON object, no markdown, with this shape:
{"headline": "one sentence with the single most important finding",
 "actions": [ {"title": "short imperative", "why": "evidence with figures", "do": "the concrete step", "impact": "expected effect in EGP or days, stated as an estimate if it is one"} ],
 "watch": ["risks, data gaps or things to monitor"] }
Give 3 to 5 actions and at most 3 watch items.`;

// Structured output: the API guarantees the reply matches this shape.
const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, why: { type: "string" }, do: { type: "string" }, impact: { type: "string" } },
        required: ["title", "why", "do", "impact"],
        additionalProperties: false,
      },
    },
    watch: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "actions", "watch"],
  additionalProperties: false,
};

// Bump when the prompt or request settings change, so saved results from older settings are not reused.
const PROMPT_VERSION = "4";

function parseInsight(text: string): Insight | null {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(text.slice(a, b + 1));
    if (typeof o.headline !== "string" || !Array.isArray(o.actions)) return null;
    return {
      headline: o.headline,
      actions: o.actions.slice(0, 6).map((x: any) => ({ title: String(x.title ?? ""), why: String(x.why ?? ""), do: String(x.do ?? ""), impact: String(x.impact ?? "") })),
      watch: Array.isArray(o.watch) ? o.watch.slice(0, 4).map(String) : [],
    };
  } catch { return null; }
}

export async function analyze(module: ModuleName, force = false, query: PeriodQuery = {}): Promise<AnalysisResult> {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  const p = await payload(module, query);
  if (!p) return { ok: false, error: "No data to analyse yet. Upload the Brand Master and the platform files first." };
  const body = JSON.stringify(p.data);
  const hash = createHash("sha256").update(PROMPT_VERSION + module + model + body).digest("hex");
  if (!force) {
    const hit = await q<{ result: any }>("SELECT result FROM analysis_cache WHERE brand_id = $1 AND module = $2 AND scope = 'all' AND data_hash = $3", [p.brandId, module, hash]);
    if (hit[0]) {
      const res = typeof hit[0].result === "string" ? JSON.parse(hit[0].result) : hit[0].result;
      return { ok: true, insight: res.insight ?? null, raw: res.raw, cached: true, model };
    }
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "ANTHROPIC_API_KEY is not set. Add it in Vercel > Settings > Environment Variables and redeploy." };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50_000);
  let text = "";
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctrl.signal,
      headers: {
        "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
        // On a safety decline the API retries the same request on a fallback model it picks.
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        // Thinking is on by default and counts toward max_tokens, so leave room for it.
        model, max_tokens: 16000, system: SYSTEM,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        fallbacks: "default",
        messages: [{ role: "user", content: `Module: ${module}\nFigures (JSON):\n${body}` }],
      }),
    });
    const j: any = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: `Claude API error ${resp.status}: ${j?.error?.message ?? "request failed"}` };
    if (j.stop_reason === "max_tokens") return { ok: false, error: "Claude's answer was cut off before it finished. Try again." };
    if (j.stop_reason === "refusal") return { ok: false, error: "Claude declined to analyse this page. Try again later." };
    text = (j.content ?? []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("");
  } catch (e) {
    return { ok: false, error: (e as Error).name === "AbortError" ? "Claude took too long to answer. Try again." : `Could not reach the Claude API: ${(e as Error).message}` };
  } finally { clearTimeout(timer); }
  const insight = parseInsight(text);
  // Only save good results, so a bad answer is not served again from the cache.
  if (!insight) return { ok: true, insight: null, raw: text, cached: false, model };
  const result = { insight };
  try {
    await q(
      `INSERT INTO analysis_cache (brand_id, module, scope, data_hash, result, model) VALUES ($1,$2,'all',$3,$4::jsonb,$5)
       ON CONFLICT (brand_id, module, scope, data_hash) DO UPDATE SET result = EXCLUDED.result, model = EXCLUDED.model, created_at = now()`,
      [p.brandId, module, hash, JSON.stringify(result), model],
    );
  } catch { /* caching is best effort */ }
  return { ok: true, insight, raw: insight ? undefined : text, cached: false, model };
}
