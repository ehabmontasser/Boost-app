// Turns raw query results into the figures each module shows. Claude only interprets these figures; it never computes them.
// Every model works on a reporting period (a week, a month or the full span) chosen with the period picker.
import * as Q from "./queries";
import { addDays, daysBetween, monday, type Period, type Range } from "./period";

export { addDays, daysBetween };
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
  /** last day of data ("data through"), and the first day of data */
  asOf: string | null;
  minDate: string | null;
};

export async function getCtx(): Promise<Ctx | null> {
  const brand = await Q.getBrand();
  if (!brand) return null;
  const [allPlatforms, listings, skus, asOf, span] = await Promise.all([
    Q.getPlatforms(), Q.listings(brand.id), Q.skus(brand.id), Q.asOfDate(brand.id), Q.dataRange(brand.id),
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
    skus, listings, asOf, minDate: span.min ?? asOf,
  };
}

export function shortName(n: string): string {
  return n.replace(/^Sprout\s+/, "").replace(/\s+Wipes$/, "").trim();
}

/** Weekly feeds are keyed by the Monday of the week: a week belongs to the period its Monday falls in. */
export function weekRange(p: Range & { view?: string; key?: string }): Range {
  return { from: p.view === "week" && p.key ? p.key : p.from, to: p.to };
}

// ---------------------------------------------------------------- market
/** A share line for the trend charts. */
export type ShareSeries = { code: string; name: string; share: number[] };
/** Share in the chosen period, and the share it is compared with (previous period, or the period's first week). */
export type ShareNow = { code: string; name: string; now: number | null; base: number | null };

export async function marketModel(c: Ctx, p: Period) {
  const [own, cat] = await Promise.all([Q.ownGmvWeekly(c.brandId), Q.categoryGmvWeekly(c.brandId)]);
  const wr = weekRange(p);
  const weeksIn = (r: Range) => [...new Set(cat.filter((x) => x.week_start >= r.from && x.week_start <= r.to).map((x) => x.week_start))].sort();
  const periodWeeks = weeksIn(wr);
  const latestWeek = periodWeeks[periodWeeks.length - 1] ?? null;
  const shareOf = (code: string, category: string, weeks: string[], sub?: string) => {
    const ws = new Set(weeks);
    const pick = (r: { platform: string; week_start: string; category: string; sub_category: string }) =>
      r.platform === code && ws.has(r.week_start) && r.category === category && (sub === undefined || r.sub_category === sub);
    const t = cat.filter(pick).reduce((a, r) => a + num(r.gmv), 0);
    const o = own.filter(pick).reduce((a, r) => a + num(r.gmv), 0);
    return t > 0 ? o / t : null;
  };
  const prevWeeks = p.prev ? weeksIn(weekRange({ ...p.prev, view: p.view, key: p.view === "week" ? monday(p.prev.from) : undefined })) : [];
  // week / month: the period's share against the previous period. Full period: the last week against the first week.
  const now = (category: string): ShareNow[] => c.platforms.map((pl) => ({
    code: pl.code, name: pl.name,
    now: p.view === "year" ? shareOf(pl.code, category, periodWeeks.slice(-1)) : shareOf(pl.code, category, periodWeeks),
    base: p.prev ? shareOf(pl.code, category, prevWeeks) : periodWeeks.length > 1 ? shareOf(pl.code, category, periodWeeks.slice(0, 1)) : null,
  })).filter((s) => s.now !== null);

  // trend charts: 13 weeks for a week, 12 months for a month, every week for the full period
  const allWeeks = [...new Set(cat.map((x) => x.week_start))].sort().filter((w) => w <= p.to);
  let buckets: { label: string; weeks: string[] }[];
  if (p.view === "month") {
    const months = [...new Set(allWeeks.map((w) => w.slice(0, 7)))].slice(-12);
    buckets = months.map((m) => ({ label: m, weeks: allWeeks.filter((w) => w.startsWith(m)) }));
  } else {
    const ws = p.view === "week" ? allWeeks.slice(-13) : allWeeks.filter((w) => w >= wr.from);
    buckets = ws.map((w) => ({ label: w, weeks: [w] }));
  }
  const trend = (category: string): ShareSeries[] => c.platforms.map((pl) => ({
    code: pl.code, name: pl.name, share: buckets.map((b) => shareOf(pl.code, category, b.weeks) ?? 0),
  })).filter((s) => s.share.some((v) => v > 0));

  // sub-segment share over the period
  const subRows: { platform: string; name: string; sub: string; share: number }[] = [];
  for (const pl of c.platforms) {
    const subs = [...new Set(cat.filter((r) => r.platform === pl.code && periodWeeks.includes(r.week_start)).map((r) => r.category + "|" + r.sub_category))];
    for (const key of subs) {
      const [category, sub] = key.split("|");
      const s = shareOf(pl.code, category, periodWeeks, sub);
      if (s !== null) subRows.push({ platform: pl.code, name: pl.name, sub: `${category}: ${sub}`, share: s });
    }
  }

  // leaders on the period's last week, and the assortment gaps
  const top: Record<string, { rank: number; brand: string; product: string; sub: string; gmv: number; own: boolean; inStock: number }[]> = {};
  if (latestWeek) {
    const rows = await Q.topSkusOn(c.brandId, latestWeek);
    for (const pl of c.platforms) {
      top[pl.code] = rows.filter((r) => r.platform === pl.code).sort((a, b) => num(b.gmv) - num(a.gmv)).slice(0, 8)
        .map((r, i) => ({ rank: i + 1, brand: r.brand, product: r.product_name, sub: r.sub_category, gmv: num(r.gmv), own: !!r.is_own_brand, inStock: num(r.in_stock_rate) }));
    }
  }
  const listed = new Map<string, Set<string>>();
  for (const l of c.listings) {
    if (!listed.has(l.platform)) listed.set(l.platform, new Set());
    listed.get(l.platform)!.add(l.sku_code);
  }
  const gaps = c.platforms.map((pl) => ({
    code: pl.code, name: pl.name,
    missing: c.skus.filter((s) => !listed.get(pl.code)?.has(s.sku_code)).map((s) => shortName(s.product_name)),
  }));
  return {
    latestWeek, weeks: periodWeeks.length, wipesNow: now("Wipes"), skinNow: now("Skin Care"),
    wipes: trend("Wipes"), skin: trend("Skin Care"),
    trendStart: buckets[0]?.label ?? null, trendEnd: buckets[buckets.length - 1]?.label ?? null, trendView: p.view,
    subRows, top, gaps,
  };
}

// ---------------------------------------------------------------- overview
export async function overviewModel(c: Ctx, p: Period) {
  const prev = p.prev;
  const [sales, ads, lost, market, pSales, pAds, pLost] = await Promise.all([
    Q.salesByPlatform(c.brandId, p), Q.adsByPlatform(c.brandId, p), Q.lostByPlatform(c.brandId, p), marketModel(c, p),
    prev ? Q.salesByPlatform(c.brandId, prev) : Promise.resolve([]), prev ? Q.adsByPlatform(c.brandId, prev) : Promise.resolve([]),
    prev ? Q.lostByPlatform(c.brandId, prev) : Promise.resolve([]),
  ]);
  const rows = c.platforms.map((pl) => {
    const s = sales.find((r) => r.platform === pl.code), a = ads.find((r) => r.platform === pl.code), l = lost.find((r) => r.platform === pl.code);
    const net = num(s?.net), spend = num(a?.spend), att = num(a?.att), lostValue = num(l?.value);
    const w = market.wipesNow.find((m) => m.code === pl.code);
    return {
      code: pl.code, name: pl.name, channel: pl.channel_type, net, units: num(s?.units), spend,
      spendPct: net ? spend / net : 0, roas: spend ? att / spend : 0, lostValue, lostPct: net ? lostValue / net : 0,
      wipesBase: w ? w.base : null, wipesNow: w ? w.now : null,
      prevNet: prev ? num(pSales.find((r) => r.platform === pl.code)?.net) : null,
    };
  });
  const sum = (xs: { platform: string }[], f: (x: any) => number) => xs.reduce((acc, x) => acc + (c.platforms.some((pl) => pl.code === x.platform) ? f(x) : 0), 0);
  const totalNet = rows.reduce((a, r) => a + r.net, 0);
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  const totalLost = rows.reduce((a, r) => a + r.lostValue, 0);
  const prevTotals = prev ? {
    net: sum(pSales, (x) => num(x.net)), spend: sum(pAds, (x) => num(x.spend)), lost: sum(pLost, (x) => num(x.value)),
  } : null;
  return { rows, totalNet, totalSpend, totalLost, spendPct: totalNet ? totalSpend / totalNet : 0, lostPct: totalNet ? totalLost / totalNet : 0, market, prevTotals };
}

// ---------------------------------------------------------------- replenishment
export type NodeStock = {
  platform: string; platformName: string; node: string; nodeName: string; sku: string; skuName: string;
  onHand: number; rate: number; cover: number; eta: string | null; etaDays: number | null; openPo: number;
  status: "At risk" | "Watch" | "Overstock" | "Healthy" | "Suppressed"; lead: number | null; maxCover: number | null;
  /** days the node is expected to be empty before the next PO lands, and the units that implies */
  gapDays: number; unitsAtRisk: number;
};

/** Stock position on the last day of the period; lost demand and supplier performance within the period. */
export async function replenishmentModel(c: Ctx, p: Period) {
  if (!c.asOf) return null;
  const asOf = p.to;
  const since = addDays(asOf, -13);
  const [inv, rate, rmap, nodeRows, params, po, lostSku, sales, lostP] = await Promise.all([
    Q.inventoryOn(c.brandId, asOf), Q.salesRateSince(c.brandId, since, asOf), Q.regionNodeMap(c.brandId), Q.nodes(c.brandId),
    Q.replenishmentParams(c.brandId), Q.poPerformance(c.brandId, weekRange(p)), Q.lostBySku(c.brandId, p), Q.salesByPlatform(c.brandId, p), Q.lostByPlatform(c.brandId, p),
  ]);
  const nodeName = new Map(nodeRows.map((n) => [n.platform + "|" + n.node_id, n.node_name]));
  const prm = new Map(params.map((x) => [x.platform + "|" + x.sku_code, x]));
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
    const etaDays = i.next_po_eta ? Math.max(0, daysBetween(asOf, i.next_po_eta)) : null;
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

  const channel = c.platforms.map((pl) => {
    const net = num(sales.find((s) => s.platform === pl.code)?.net), lv = num(lostP.find((l) => l.platform === pl.code)?.value);
    return { code: pl.code, name: pl.name, net, lostValue: lv, lostPct: net ? lv / net : 0 };
  });
  const lostTop = lostSku.map((l) => ({ platform: l.platform, name: c.nameOf(l.platform), sku: c.skuOf(l.platform, l.platform_sku_id) ?? l.platform_sku_id, value: num(l.value), units: num(l.units), inStock: num(l.op_hours) ? 1 - num(l.oos_hours) / num(l.op_hours) : 1 }))
    .filter((l) => l.value > 0).map((l) => ({ ...l, skuName: c.skuName(l.sku) })).sort((a, b) => b.value - a.value).slice(0, 8);
  const poRows = po.map((x) => ({ platform: x.platform, name: c.nameOf(x.platform), sku: c.skuOf(x.platform, x.platform_sku_id) ?? x.platform_sku_id,
    confirmRate: num(x.requested) ? num(x.confirmed) / num(x.requested) : null, lead: num(x.lead), requested: num(x.requested) }))
    .filter((x) => x.confirmRate !== null && x.requested > 0).map((x) => ({ ...x, skuName: c.skuName(x.sku) }));
  const lowestConfirm = [...poRows].sort((a, b) => (a.confirmRate ?? 1) - (b.confirmRate ?? 1)).slice(0, 5);
  return {
    asOf, atRisk: rows.filter((r) => r.status === "At risk"), action: action.slice(0, 14), overstock, channel, lostTop, lowestConfirm,
    totalLost: channel.reduce((a, x) => a + x.lostValue, 0), totalNet: channel.reduce((a, x) => a + x.net, 0),
  };
}

// ---------------------------------------------------------------- ads
export async function adsModel(c: Ctx, p: Period) {
  const [camp, terms, supp, prevAds] = await Promise.all([
    Q.adsByCampaign(c.brandId, p), Q.platformTerms(c.brandId), Q.adSpendOnSuppressed(c.brandId, p),
    p.prev ? Q.adsByPlatform(c.brandId, p.prev) : Promise.resolve([]),
  ]);
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
  }).filter((r) => r.spend > 0).sort((a, b) => b.spend - a.spend);
  const below = rows.filter((r) => r.flag === "Below target");
  const suppressed = supp.map((s) => ({ platform: s.platform, name: c.nameOf(s.platform), spend: num(s.spend), att: num(s.att) }));
  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  const totalAtt = rows.reduce((a, r) => a + r.att, 0);
  const prevSpend = p.prev ? prevAds.reduce((a, r) => a + num(r.spend), 0) : null;
  const prevAtt = p.prev ? prevAds.reduce((a, r) => a + num(r.att), 0) : null;
  return {
    rows, totalSpend, totalAtt, roas: totalSpend ? totalAtt / totalSpend : 0, belowSpend: below.reduce((a, r) => a + r.spend, 0), suppressed,
    prevSpend, prevRoas: prevSpend ? (prevAtt ?? 0) / prevSpend : null,
  };
}

// ---------------------------------------------------------------- promotions
/** Each run of a promotion (consecutive promo days for one SKU) is compared with that SKU's own non-promo days
 *  in the 14 days before the run. Runs that overlap the period are counted in full. */
export async function promoModel(c: Ctx, p: Period) {
  const [days, daily, terms] = await Promise.all([Q.promoDays(c.brandId), Q.unitsDaily(c.brandId), Q.platformTerms(c.brandId)]);
  const margin = new Map(terms.map((t) => [t.platform, num(t.platform_margin)]));
  const cogs = new Map(c.skus.map((s) => [s.sku_code, num(s.unit_cogs_ex_vat)]));
  const unitsBy = new Map<string, number>();
  for (const d of daily) unitsBy.set(d.platform + "|" + d.platform_sku_id + "|" + d.date, num(d.units));
  const promoDay = new Set(days.map((d) => d.platform + "|" + d.platform_sku_id + "|" + d.date));
  // split each promo x SKU into runs of consecutive days
  const series = new Map<string, typeof days>();
  for (const d of days) {
    const k = [d.platform, d.promo_id, d.promo_name, d.platform_sku_id].join("|");
    if (!series.has(k)) series.set(k, []);
    series.get(k)!.push(d);
  }
  type Agg = { platform: string; promo: string; type: string; funding: string; depthW: number; vsW: number; w: number; during: number; base: number; effect: number; skus: Set<string>; days: number; runs: number };
  const aggs = new Map<string, Agg>();
  for (const [key, all] of series) {
    const [platform, , promo, psid] = key.split("|");
    const sku = c.skuOf(platform, psid);
    if (!sku) continue;
    const sorted = [...all].sort((a, b) => (a.date < b.date ? -1 : 1));
    const runs: (typeof days)[] = [];
    for (const d of sorted) {
      const last = runs[runs.length - 1];
      if (last && daysBetween(last[last.length - 1].date, d.date) === 1) last.push(d); else runs.push([d]);
    }
    for (const g of runs) {
      const d0 = g[0].date, d1 = g[g.length - 1].date;
      if (d1 < p.from || d0 > p.to) continue;
      const baseVals: number[] = [];
      for (let k = 1; k <= 14; k++) {
        const day = addDays(d0, -k), id = platform + "|" + psid + "|" + day;
        const v = unitsBy.get(id);
        if (v !== undefined && !promoDay.has(id)) baseVals.push(v);
      }
      if (baseVals.length < 5) continue;
      const b = baseVals.reduce((a, x) => a + x, 0) / baseVals.length;
      const dur = g.map((x) => unitsBy.get(platform + "|" + psid + "|" + x.date)).filter((v): v is number => v !== undefined);
      if (!dur.length) continue;
      const during = dur.reduce((a, x) => a + x, 0) / dur.length;
      const lp = g.reduce((a, x) => a + num(x.list_price), 0) / g.length;
      const depth = g.reduce((a, x) => a + num(x.discount_depth), 0) / g.length;
      const vs = g.reduce((a, x) => a + num(x.vendor_funding_share), 0) / g.length;
      const pm = margin.get(platform) ?? 0.28, cg = cogs.get(sku) ?? 0;
      const m0 = lp * (1 - pm) - cg, m1 = lp * (1 - pm) - vs * lp * depth - cg;
      const effect = (during * m1 - b * m0) * dur.length;
      const ak = platform + "|" + promo;
      const a = aggs.get(ak) ?? { platform, promo, type: g[0].promo_type, funding: g[0].funding, depthW: 0, vsW: 0, w: 0, during: 0, base: 0, effect: 0, skus: new Set<string>(), days: 0, runs: 0 };
      a.depthW += depth * dur.length; a.vsW += vs * dur.length; a.w += dur.length; a.during += during * dur.length; a.base += b * dur.length;
      a.effect += effect; a.skus.add(sku); a.days += dur.length; a.runs += 1;
      aggs.set(ak, a);
    }
  }
  const rows = [...aggs.values()].map((a) => ({
    platform: a.platform, name: c.nameOf(a.platform), promo: a.promo, type: a.type, funding: a.funding,
    depth: a.w ? a.depthW / a.w : 0, vendorShare: a.w ? a.vsW / a.w : 0, uplift: a.base ? a.during / a.base : 0,
    effect: a.effect, skus: a.skus.size, days: a.days, runs: a.runs,
  })).sort((x, y) => x.effect - y.effect);
  return {
    rows, dilutive: rows.filter((r) => r.effect < 0).reduce((a, r) => a + r.effect, 0), accretive: rows.filter((r) => r.effect > 0).reduce((a, r) => a + r.effect, 0),
  };
}

export { round };
