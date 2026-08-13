// Mirrors Rate_Card, PAYG_Model, Commit_Monthly, Commit_Annual and Plan_Economics.
// Every function below names the workbook column or cell it reproduces.

import { CATALOG } from "./catalog.js";
import { withDefaults } from "./inputs.js";

const COMPONENTS = ["input", "cached", "output"];

/** Blended rate. Rate_Card columns Q and R.
 *  blended = mixInput x input + mixCached x cached + mixOutput x output */
export function blend(parts, k) {
  return k.mixInput * parts.input + k.mixCached * parts.cached + k.mixOutput * parts.output;
}

/** One model through the 4-step derivation. Rate_Card columns H to U.
 *
 *   cost    = retail x (1 - discount)                       cols H,I,J
 *   floor   = cost / (1 - marginFloor)                      cols K,L,M
 *   ceiling = retail                                        cols E,F,G
 *   list    = floor + position x (ceiling - floor)          cols N,O,P
 */
export function priceModel(model, inputs) {
  const k = withDefaults(inputs);
  const position = Math.min(1, Math.max(0,
    k.positionScore[model.tier - 1] + (k.positionShift || 0)));

  // Overhead allocation. Not a workbook concept. When marginBasis is "loaded"
  // the floor is set on fully loaded cost rather than wholesale cost alone, so
  // the target margin becomes a contribution margin. The per-1M overhead is
  // added to every component, and because the workload mix weights sum to 1
  // the blended cost rises by exactly that amount.
  const overhead = k.marginBasis === "loaded"
    ? (k.overheadAllocVolume > 0 ? k.fixedMonthly / k.overheadAllocVolume : 0)
    : 0;

  const cost = {}, loaded = {}, floor = {}, list = {};
  for (const c of COMPONENTS) {
    cost[c] = model.retail[c] * (1 - k.discount);
    loaded[c] = cost[c] + overhead;
    floor[c] = loaded[c] / (1 - k.marginFloor);
    list[c] = k.listMode === "floor"
      ? floor[c]
      : floor[c] + position * (model.retail[c] - floor[c]);
  }

  const blendedList = blend(list, k);
  const blendedCost = blend(cost, k);
  const blendedLoaded = blend(loaded, k);
  const blendedCeiling = blend(model.retail, k);
  const blendedFloor = blend(floor, k);

  return {
    ...model,
    position, overhead,
    cost, loaded, floor, list,
    blendedList, blendedCost, blendedLoaded, blendedCeiling, blendedFloor,
    // Gross margin is always measured against wholesale cost, whichever basis
    // set the floor, so this figure stays comparable to the workbook.
    grossMargin: blendedList > 0 ? (blendedList - blendedCost) / blendedList : 0,
    contributionMargin: blendedList > 0 ? (blendedList - blendedLoaded) / blendedList : 0,
    // Rate_Card col T. The guard that can actually fire.
    bandExists: k.discount > k.marginFloor,
    // Rate_Card col U. Guaranteed by construction unless listMode overrides.
    withinCeiling: blendedList <= blendedCeiling + 1e-9,
  };
}

/** Full rate card plus class rollups and the portfolio blend.
 *  Reproduces Rate_Card rows 7 to 32, the class rollup at rows 36 to 39,
 *  and the portfolio block at rows 42 to 46. */
export function buildRateCard(inputs) {
  const k = withDefaults(inputs);
  const models = CATALOG.map((m) => priceModel(m, k));

  const classes = [0, 1, 2, 3].map((i) => {
    const rows = models.filter((m) => m.tier === i + 1);
    const n = rows.length;
    const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / n;
    const avgList = avg((r) => r.blendedList);
    const avgCost = avg((r) => r.blendedCost);
    const avgLoaded = avg((r) => r.blendedLoaded);
    return {
      tier: i + 1,
      count: n,
      avgRetail: avg((r) => r.blendedCeiling),
      avgList,
      avgCost,
      avgLoaded,
      position: rows[0]?.position ?? k.positionScore[i],
      grossMargin: avgList > 0 ? (avgList - avgCost) / avgList : 0,
      contributionMargin: avgList > 0 ? (avgList - avgLoaded) / avgList : 0,
      minList: Math.min(...rows.map((r) => r.blendedList)),
      maxList: Math.max(...rows.map((r) => r.blendedList)),
      trafficShare: k.trafficShare[i],
      models: rows,
    };
  });

  const cardRate = classes.reduce((a, c) => a + c.trafficShare * c.avgList, 0);
  const wholesale = classes.reduce((a, c) => a + c.trafficShare * c.avgCost, 0);
  const loadedCost = classes.reduce((a, c) => a + c.trafficShare * c.avgLoaded, 0);

  for (const c of classes) {
    c.spread = c.minList > 0 ? c.maxList / c.minList : 0;
    c.revenueShare = cardRate > 0 ? (c.trafficShare * c.avgList) / cardRate : 0;
  }

  return {
    models, classes, cardRate, wholesale, loadedCost,
    overheadPer1M: models[0]?.overhead ?? 0,
    grossProfit: cardRate - wholesale,
    grossMargin: cardRate > 0 ? (cardRate - wholesale) / cardRate : 0,
    contributionMargin: cardRate > 0 ? (cardRate - loadedCost) / cardRate : 0,
    anyBandBreach: models.some((m) => m.blendedFloor > m.blendedCeiling),
    worstModelMargin: Math.min(...models.map((m) => m.grossMargin)),
    bandExists: k.discount > k.marginFloor,
  };
}

/** Weighted discount by term. Plan_Economics!B16:B17.
 *  The tier discount weighted by where committed tokens actually land. */
export function weightedDiscounts(inputs) {
  const k = withDefaults(inputs);
  const monthly = k.tiers.reduce((a, t, i) => a + t.monthlyDiscount * k.tierMixMonthly[i], 0);
  const annual = k.tiers.reduce((a, t, i) => a + t.annualDiscount * k.tierMixAnnual[i], 0);
  return { monthly, annual, delta: annual - monthly };
}

/** Effective multiplier against the card rate. Plan_Economics row 27.
 *
 *   multiplier = (insideShare x (1 - discount) + overageShare) x (1 + shortfallUplift)
 *
 * Pay as you go is 1.000 by construction. The monthly term also lands on
 * 1.000 once overage and forfeited minimums are counted, which is the
 * finding that makes it nearly free to offer. Only the annual term trades
 * real margin. */
export function planMultipliers(inputs) {
  const k = withDefaults(inputs);
  const wd = weightedDiscounts(k);

  const mult = (discount, inside, uplift) =>
    (inside * (1 - discount) + (1 - inside)) * (1 + uplift);

  return {
    payg: 1,
    monthly: mult(wd.monthly, k.insideShareMonthly, k.shortfallUpliftMonthly),
    annual: mult(wd.annual, k.insideShareAnnual, k.shortfallUpliftAnnual),
    weighted: wd,
  };
}

/** Unit economics per 1M tokens for all 3 plans plus the blend.
 *  Plan_Economics rows 32 to 37. */
export function planEconomics(inputs) {
  const k = withDefaults(inputs);
  const card = buildRateCard(k);
  const mult = planMultipliers(k);

  const build = (share, m) => {
    const rate = card.cardRate * m;
    return {
      share, multiplier: m, rate,
      cost: card.wholesale,
      grossProfit: rate - card.wholesale,
      grossMargin: rate > 0 ? (rate - card.wholesale) / rate : 0,
    };
  };

  const payg = build(k.sharePayg, mult.payg);
  const monthly = build(k.shareCommitMonthly, mult.monthly);
  const annual = build(k.shareCommitAnnual, mult.annual);

  const blendedRate = payg.share * payg.rate + monthly.share * monthly.rate + annual.share * annual.rate;

  return {
    card, multipliers: mult, payg, monthly, annual,
    blended: {
      share: payg.share + monthly.share + annual.share,
      rate: blendedRate,
      cost: card.wholesale,
      grossProfit: blendedRate - card.wholesale,
      grossMargin: blendedRate > 0 ? (blendedRate - card.wholesale) / blendedRate : 0,
    },
    // Plan_Economics rows 42 to 46. The guard that sets the practical accept-floor.
    commitGuard: (() => {
      const worst = card.worstModelMargin;
      const atDeepest = 1 - (1 - worst) / (1 - k.maxCommitDiscount);
      return {
        worst, atDeepest,
        floor: k.commitMarginFloor,
        headroomPoints: (atDeepest - k.commitMarginFloor) * 100,
        holds: atDeepest >= k.commitMarginFloor,
      };
    })(),
  };
}

/** Commitment denomination. Commit_Monthly!E14:E17 and Commit_Annual!E15:E18.
 *  A commitment is stated in discounted dollars, so the list usage needed to
 *  reach it is always larger than the commitment itself. */
export function tierLadder(inputs) {
  const k = withDefaults(inputs);
  return k.tiers.map((t, i) => ({
    tier: i + 1,
    annual: t.annual,
    monthlyMinimum: t.annual / 12,
    monthlyDiscount: t.monthlyDiscount,
    annualDiscount: t.annualDiscount,
    listToFillMonthly: (t.annual / 12) / (1 - t.monthlyDiscount),
    listToFillAnnual: t.annual / (1 - t.annualDiscount),
    extraPointsOnAnnual: (t.annualDiscount - t.monthlyDiscount) * 100,
    shareMonthly: k.tierMixMonthly[i],
    shareAnnual: k.tierMixAnnual[i],
  }));
}

/** One month on the monthly commit term. Commit_Monthly rows 37 to 46.
 *  Invoice = greater of the contractual minimum or actual rated usage. */
export function monthlyCommitInvoice(listUsage, tier, inputs) {
  const t = tierLadder(inputs)[tier - 1];
  const inside = Math.min(listUsage, t.listToFillMonthly);
  const overage = Math.max(0, listUsage - t.listToFillMonthly);
  const rated = inside * (1 - t.monthlyDiscount) + overage;
  const shortfall = Math.max(0, t.monthlyMinimum - rated);
  const invoice = rated + shortfall;
  return {
    listUsage, inside, overage, rated, shortfall, invoice,
    minimum: t.monthlyMinimum,
    effectiveDiscount: listUsage > 0 ? 1 - invoice / listUsage : 0,
    headlineDiscount: t.monthlyDiscount,
  };
}

/** A full annual term with the rolling shortfall balance.
 *  Commit_Annual rows 41 to 47. The balance is a memo on the invoice, never
 *  charged, and reconciles once at term end. */
export function annualCommitTerm(monthlyListUsage, tier, inputs) {
  const t = tierLadder(inputs)[tier - 1];
  let cumInvoiced = 0;
  const months = monthlyListUsage.map((usage, i) => {
    const invoice = usage * (1 - t.annualDiscount);
    cumInvoiced += invoice;
    const owedToDate = t.monthlyMinimum * (i + 1);
    const balance = Math.max(0, owedToDate - cumInvoiced);
    return { month: i + 1, usage, invoice, cumInvoiced, owedToDate, balance };
  });
  const last = months[months.length - 1];
  const reconciliation = last ? last.balance : 0;
  const totalList = monthlyListUsage.reduce((a, v) => a + v, 0);
  const totalInvoiced = cumInvoiced + reconciliation;
  return {
    months, reconciliation, totalList, totalInvoiced,
    commitment: t.annual,
    headlineDiscount: t.annualDiscount,
    effectiveDiscount: totalList > 0 ? 1 - totalInvoiced / totalList : 0,
    clearedOnUsage: cumInvoiced >= t.annual,
  };
}
