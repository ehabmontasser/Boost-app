// Turns raw query results into the figures each module shows. Claude only interprets these figures; it never computes them.
import * as Q from "./queries";

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

export type Ctx = {
  brandId: string;
  brandName: string;
  platforms: Q.Platform[];
  nameOf: (code: string) => string;
  skuOf: (platform: string, psid: string) => string | undefined;
  skuName: (code: string) => string;
  skus: Awaited<ReturnType<typeof Q.skus>>;
  listings: Awaited<ReturnType<typeof Q.listings>>;
  asOf: string | null;
};

export async function getCtx(): Promise<Ctx | null> {
  const brand = await Q.getBrand();
  if (!brand) return null;
  const [allPlatforms, listings, skus, asOf] = await Promise.all([
    Q.getPlatforms(), Q.listings(brand.id), Q.skus(brand.id), Q.asOfDate(brand.id),
  ]);
  const names = new Map(allPlatforms.map((p) => [p.code, p.name]));
  const bySku = new Map(listings.map((l) => [l.platform + "|" + l.platform_sku_id, l.sku_code]));
  const skuNames = new Map(skus.map((s) => [s.sku_code, shortName(s.product_name)]));
  return {
    brandId: brand.id, brandName: brand.name,
    platforms: allPlatforms.filter((p) => p.status === "active"),
    nameOf: (c) => names.get(c) ?? c,
    skuOf: (p, id) => bySku.get(p + "|" + id),
    skuName: (c) => skuNames.get(c) ?? c,
    skus, listings, asOf,
  };
}

export function shortName(n: string): string {
  return n.replace(/^Sprout\s+/, "").replace(/\s+Wipes$/, "").trim();
}

// ---------------------------------------------------------------- market
export type ShareSeries = { code: string; name: string; weeks: string[]; share: number[] };

export async function marketModel(c: Ctx) {
  const [own, cat, latestWeek] = await Promise.all([Q.ownGmvWeekly(c.brandId), Q.categoryGmvWeekly(c.brandId), Q.latestMarketWeek(c.brandId)]);
  const series = (category: string): ShareSeries[] =>
    c.platforms.map((p) => {
      const weeks = [...new Set(cat.filter((r) => r.platform === p.code && r.category === category).map((r) => r.week_start))].sort();
      const share = weeks.map((w) => {
        const o = own.filter((r) => r.platform === p.code && r.week_start === w && r.category === category).reduce((a, r) => a + num(r.gmv), 0);
        const t = cat.filter((r) => r.platform === p.code && r.week_start === w && r.category === category).reduce((a, r) => a + num(r.gmv), 0);
        return t > 0 ? o / t : 0;
      });
      return { code: p.code, name: p.name, weeks, share };
    }).filter((s) => s.weeks.length > 0);
  const wipes = series("Wipes");
  const skin = series("Skin Care");

  // sub-category share on the latest week
  const subRows: { platform: string; name: string; sub: string; share: number }[] = [];
  if (latestWeek) {
    for (const p of c.platforms) {
      const subs = [...new Set(cat.filter((r) => r.platform === p.code && r.week_start === latestWeek).map((r) => r.category + "|" + r.sub_category))];
      for (const key of subs) {
        const [category, sub] = key.split("|");
        const t = cat.filter((r) => r.platform === p.code && r.week_start === latestWeek && r.category === category && r.sub_category === sub).reduce((a, r) => a + num(r.gmv), 0);
        const o = own.filter((r) => r.platform === p.code && r.week_start === latestWeek && r.category === category && r.sub_category === sub).reduce((a, r) => a + num(r.gmv), 0);
        if (t > 0) subRows.push({ platform: p.code, name: p.name, sub: `${category}: ${sub}`, share: o / t });
      }
    }
  }

  // leaders on the latest week and the assortment gaps
  const top: Record<string, { rank: number; brand: string; product: string; sub: string; gmv: number; own: boolean; inStock: number }[]> = {};
  if (latestWeek) {
    const rows = await Q.topSkusOn(c.brandId, latestWeek);
    for (const p of c.platforms) {
      top[p.code] = rows.filter((r) => r.platform === p.code).sort((a, b) => num(b.gmv) - num(a.gmv)).slice(0, 8)
        .map((r, i) => ({ rank: i + 1, brand: r.brand, product: r.product_name, sub: r.sub_category, gmv: num(r.gmv), own: !!r.is_own_brand, inStock: num(r.in_stock_rate) }));
    }
  }
  const listed = new Map<string, Set<string>>();
  for (const l of c.listings) {
    if (!listed.has(l.platform)) listed.set(l.platform, new Set());
    listed.get(l.platform)!.add(l.sku_code);
  }
  const gaps = c.platforms.map((p) => ({
    code: p.code, name: p.name,
    missing: c.skus.filter((s) => !listed.get(p.code)?.has(s.sku_code)).map((s) => shortName(s.product_name)),
  }));
  return { latestWeek, wipes, skin, subRows, top, gaps };
}

// ---------------------------------------------------------------- overview
export async function overviewModel(c: Ctx) {
  const [sales, ads, lost, market] = await Promise.all([
    Q.salesByPlatform(c.brandId), Q.adsByPlatform(c.brandId), Q.lostByPlatform(c.brandId), marketModel(c),
  ]);
  const rows = c.platforms.map((p) => {
    const s = sales.find((r) => r.platform === p.code), a = ads.find((r) => r.platform === p.code), l = lost.find((r) => r.platform === p.code);
    const net = num(s?.net), spend = num(a?.spend), att = num(a?.att), lostValue = num(l?.value);
    const w = market.wipes.find((m) => m.code === p.code);
    return {
      code: p.code, name: p.name, channel: p.channel_type, net, units: num(s?.units), spend,
      spendPct: net ? spend / net : 0, roas: spend ? att / spend : 0, lostValue, lostPct: net ? lostValue / net : 0,
      wipesFirst: w ? w.share[0] : null, wipesLast: w ? w.share[w.share.length - 1] : null,
    };
  });
  const totalNet = rows.reduce((a, r) => a + r.net, 0);
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  const totalLost = rows.reduce((a, r) => a + r.lostValue, 0);
  return { rows, totalNet, totalSpend, totalLost, spendPct: totalNet ? totalSpend / totalNet : 0, lostPct: totalNet ? totalLost / totalNet : 0, market };
}

// ---------------------------------------------------------------- replenishment
export type NodeStock = {
  platform: string; platformName: string; node: string; nodeName: string; sku: string; skuName: string;
  onHand: number; rate: number; cover: number; eta: string | null; etaDays: number | null; openPo: number;
  status: "At risk" | "Watch" | "Overstock" | "Healthy" | "Suppressed"; lead: number | null; maxCover: number | null;
  /** days the node is expected to be empty before the next PO lands, and the units that implies */
  gapDays: number; unitsAtRisk: number;
};

export async function replenishmentModel(c: Ctx) {
  if (!c.asOf) return null;
  const since = addDays(c.asOf, -13);
  const [inv, rate, rmap, nodeRows, params, po, lostSku, sales, lostP] = await Promise.all([
    Q.inventoryOn(c.brandId, c.asOf), Q.salesRateSince(c.brandId, since), Q.regionNodeMap(c.brandId), Q.nodes(c.brandId),
    Q.replenishmentParams(c.brandId), Q.poPerformance(c.brandId), Q.lostBySku(c.brandId), Q.salesByPlatform(c.brandId), Q.lostByPlatform(c.brandId),
  ]);
  const nodeName = new Map(nodeRows.map((n) => [n.platform + "|" + n.node_id, n.node_name]));
  const prm = new Map(params.map((p) => [p.platform + "|" + p.sku_code, p]));
  // daily demand per node = sum over regions of (region daily units x share of region served by the node)
  const nodeRate = new Map<string, number>();
  for (const r of rate) {
    for (const m of rmap.filter((x) => x.platform === r.platform && x.region === r.region)) {
      const k = r.platform + "|" + r.platform_sku_id + "|" + m.node_id;
      nodeRate.set(k, (nodeRate.get(k) ?? 0) + (num(r.units) / 14) * num(m.share));
    }
  }
  const rows: NodeStock[] = [];
  for (const i of inv) {
    const sku = c.skuOf(i.platform, i.platform_sku_id);
    if (!sku) continue;
    const rt = nodeRate.get(i.platform + "|" + i.platform_sku_id + "|" + i.node_id) ?? 0;
    if (rt < 0.05) continue;
    const onHand = num(i.on_hand_units);
    const cover = onHand / rt;
    const prms = prm.get(i.platform + "|" + sku);
    const etaDays = i.next_po_eta ? Math.max(0, daysBetween(c.asOf, i.next_po_eta)) : null;
    let status: NodeStock["status"] = "Healthy";
    const lead = prms ? prms.planned_lead_time_days : null;
    // without an open PO the earliest possible restock is a new PO: lead time plus one review cycle
    const restockIn = etaDays !== null ? etaDays : lead !== null ? lead + (prms?.review_cycle_days ?? 0) : null;
    const gapDays = restockIn !== null ? Math.max(0, restockIn - cover) : 0;
    if (i.listing_status === "SUPPRESSED") status = "Suppressed";
    else if (gapDays >= 1.5 && gapDays * rt >= 10) status = "At risk";
    else if (prms && cover > prms.max_cover_days) status = "Overstock";
    else if (prms && cover < prms.target_cover_days * 0.5) status = "Watch";
    rows.push({
      platform: i.platform, platformName: c.nameOf(i.platform), node: i.node_id, nodeName: nodeName.get(i.platform + "|" + i.node_id) ?? i.node_id,
      sku, skuName: c.skuName(sku), onHand, rate: rt, cover, eta: i.next_po_eta, etaDays, openPo: num(i.open_po_units), status, lead,
      maxCover: prms ? prms.max_cover_days : null, gapDays, unitsAtRisk: gapDays * rt,
    });
  }
  const order = { "At risk": 0, Overstock: 1, Watch: 2, Suppressed: 3, Healthy: 4 } as const;
  const action = rows.filter((r) => r.status === "At risk" || r.status === "Watch")
    .sort((a, b) => order[a.status] - order[b.status] || (a.status === "At risk" ? b.unitsAtRisk - a.unitsAtRisk : a.status === "Overstock" ? b.cover - a.cover : a.cover - b.cover));

  // overstock is judged per platform and SKU (all nodes together), not per node
  const agg = new Map<string, { platform: string; sku: string; onHand: number; rate: number; maxCover: number | null; openPo: number; eta: string | null }>();
  for (const r of rows) {
    const k = r.platform + "|" + r.sku;
    const a = agg.get(k) ?? { platform: r.platform, sku: r.sku, onHand: 0, rate: 0, maxCover: r.maxCover, openPo: 0, eta: r.eta };
    a.onHand += r.onHand; a.rate += r.rate; a.openPo += r.openPo;
    if (r.eta && (!a.eta || r.eta < a.eta)) a.eta = r.eta;
    agg.set(k, a);
  }
  const overstock = [...agg.values()].map((a) => ({ ...a, name: c.nameOf(a.platform), skuName: c.skuName(a.sku), cover: a.onHand / Math.max(a.rate, 0.01) }))
    .filter((a) => a.maxCover !== null && a.cover > a.maxCover).sort((x, y) => y.cover - x.cover);

  const channel = c.platforms.map((p) => {
    const net = num(sales.find((s) => s.platform === p.code)?.net), lv = num(lostP.find((l) => l.platform === p.code)?.value);
    return { code: p.code, name: p.name, net, lostValue: lv, lostPct: net ? lv / net : 0 };
  });
  const lostTop = lostSku.map((l) => ({ platform: l.platform, name: c.nameOf(l.platform), sku: c.skuOf(l.platform, l.platform_sku_id) ?? l.platform_sku_id, value: num(l.value), units: num(l.units), inStock: num(l.op_hours) ? 1 - num(l.oos_hours) / num(l.op_hours) : 1 }))
    .map((l) => ({ ...l, skuName: c.skuName(l.sku) })).sort((a, b) => b.value - a.value).slice(0, 8);
  const poRows = po.map((p) => ({ platform: p.platform, name: c.nameOf(p.platform), sku: c.skuOf(p.platform, p.platform_sku_id) ?? p.platform_sku_id,
    confirmRate: num(p.requested) ? num(p.confirmed) / num(p.requested) : null, lead: num(p.lead), requested: num(p.requested) }))
    .filter((p) => p.confirmRate !== null && p.requested > 0).map((p) => ({ ...p, skuName: c.skuName(p.sku) }));
  const lowestConfirm = [...poRows].sort((a, b) => (a.confirmRate ?? 1) - (b.confirmRate ?? 1)).slice(0, 5);
  return {
    asOf: c.asOf, atRisk: rows.filter((r) => r.status === "At risk"), action: action.slice(0, 14), overstock, channel, lostTop, lowestConfirm,
    totalLost: channel.reduce((a, x) => a + x.lostValue, 0), totalNet: channel.reduce((a, x) => a + x.net, 0),
  };
}

// ---------------------------------------------------------------- ads
export async function adsModel(c: Ctx) {
  const [camp, terms, supp] = await Promise.all([Q.adsByCampaign(c.brandId), Q.platformTerms(c.brandId), Q.adSpendOnSuppressed(c.brandId)]);
  const target = new Map(terms.map((t) => [t.platform, num(t.target_roas)]));
  const totals = new Map<string, number>();
  for (const r of camp) totals.set(r.platform, (totals.get(r.platform) ?? 0) + num(r.spend));
  const rows = camp.map((r) => {
    const spend = num(r.spend), roas = spend ? num(r.att) / spend : 0, tgt = target.get(r.platform) ?? 4;
    const lostShare = spend ? num(r.lost_w) / spend : 0;
    const flag = roas < tgt ? "Below target" : lostShare >= 0.15 ? "Scale: budget-limited" : "On target";
    return {
      platform: r.platform, name: c.nameOf(r.platform), id: r.campaign_id, campaign: r.campaign_name, type: r.ad_type, objective: r.objective,
      spend, att: num(r.att), roas, target: tgt, lostShare, spendShare: totals.get(r.platform) ? spend / totals.get(r.platform)! : 0, flag,
      ctr: num(r.impressions) ? num(r.clicks) / num(r.impressions) : 0,
    };
  }).sort((a, b) => b.spend - a.spend);
  const below = rows.filter((r) => r.flag === "Below target");
  const suppressed = supp.map((s) => ({ platform: s.platform, name: c.nameOf(s.platform), spend: num(s.spend), att: num(s.att) }));
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  const totalAtt = rows.reduce((a, r) => a + r.att, 0);
  return { rows, totalSpend, totalAtt, roas: totalSpend ? totalAtt / totalSpend : 0, belowSpend: below.reduce((a, r) => a + r.spend, 0), suppressed };
}

// ---------------------------------------------------------------- promotions
export async function promoModel(c: Ctx) {
  const [days, daily, terms] = await Promise.all([Q.promoDays(c.brandId), Q.unitsDaily(c.brandId), Q.platformTerms(c.brandId)]);
  const margin = new Map(terms.map((t) => [t.platform, num(t.platform_margin)]));
  const cogs = new Map(c.skus.map((s) => [s.sku_code, num(s.unit_cogs_ex_vat)]));
  const unitsBy = new Map<string, number>();
  for (const d of daily) unitsBy.set(d.platform + "|" + d.platform_sku_id + "|" + d.date, num(d.units));
  const groups = new Map<string, typeof days>();
  for (const d of days) {
    const k = [d.platform, d.promo_id, d.promo_name, d.platform_sku_id].join("|");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }
  type Agg = { platform: string; promo: string; type: string; funding: string; depthW: number; vsW: number; w: number; during: number; base: number; effect: number; skus: Set<string>; days: number };
  const aggs = new Map<string, Agg>();
  for (const [key, g] of groups) {
    const [platform, , promo, psid] = key.split("|");
    const sku = c.skuOf(platform, psid);
    if (!sku) continue;
    const dates = g.map((x) => x.date).sort();
    const d0 = dates[0];
    const baseVals: number[] = [];
    for (let k = 1; k <= 14; k++) {
      const v = unitsBy.get(platform + "|" + psid + "|" + addDays(d0, -k));
      if (v !== undefined) baseVals.push(v);
    }
    if (baseVals.length < 7) continue;
    const b = baseVals.reduce((a, x) => a + x, 0) / baseVals.length;
    const dur = dates.map((d) => unitsBy.get(platform + "|" + psid + "|" + d)).filter((v): v is number => v !== undefined);
    if (!dur.length) continue;
    const during = dur.reduce((a, x) => a + x, 0) / dur.length;
    const lp = g.reduce((a, x) => a + num(x.list_price), 0) / g.length;
    const depth = g.reduce((a, x) => a + num(x.discount_depth), 0) / g.length;
    const vs = g.reduce((a, x) => a + num(x.vendor_funding_share), 0) / g.length;
    const pm = margin.get(platform) ?? 0.28, cg = cogs.get(sku) ?? 0;
    const m0 = lp * (1 - pm) - cg, m1 = lp * (1 - pm) - vs * lp * depth - cg;
    const effect = (during * m1 - b * m0) * g.length;
    const ak = platform + "|" + promo;
    const a = aggs.get(ak) ?? { platform, promo, type: g[0].promo_type, funding: g[0].funding, depthW: 0, vsW: 0, w: 0, during: 0, base: 0, effect: 0, skus: new Set<string>(), days: 0 };
    a.depthW += depth * g.length; a.vsW += vs * g.length; a.w += g.length; a.during += during; a.base += b; a.effect += effect; a.skus.add(sku); a.days += g.length;
    aggs.set(ak, a);
  }
  const rows = [...aggs.values()].map((a) => ({
    platform: a.platform, name: c.nameOf(a.platform), promo: a.promo, type: a.type, funding: a.funding,
    depth: a.w ? a.depthW / a.w : 0, vendorShare: a.w ? a.vsW / a.w : 0, uplift: a.base ? a.during / a.base : 0,
    effect: a.effect, skus: a.skus.size, days: a.days,
  })).sort((x, y) => x.effect - y.effect);
  return {
    rows, dilutive: rows.filter((r) => r.effect < 0).reduce((a, r) => a + r.effect, 0), accretive: rows.filter((r) => r.effect > 0).reduce((a, r) => a + r.effect, 0),
  };
}

export { round };
