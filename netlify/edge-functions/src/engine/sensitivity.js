// Mirrors the Sensitivity tab.

import { withDefaults, POSITIONS } from "./inputs.js";
import { buildRateCard, planEconomics } from "./pricing.js";
import { forecast12M } from "./forecast.js";

/** Discount ladder. Sensitivity rows 31 to 39 and the solver ladder at 101 to 146. */
export function discountLadder(inputs, from = 0.25, to = 0.70, step = 0.01) {
  const k = withDefaults(inputs);
  const base = forecast12M(k);
  const rows = [];

  for (let d = from; d <= to + 1e-9; d += step) {
    const discount = Math.round(d * 10000) / 10000;
    const card = buildRateCard({ ...k, discount });
    const pe = planEconomics({ ...k, discount });

    // Launch-year figures rescaled from the base volume path, holding demand fixed
    // so the ladder isolates the pricing effect.
    const revenue = base.totals.volume * base.totals.realizedRate * (card.cardRate / base.planEconomics.card.cardRate);
    const grossProfit = revenue - base.totals.volume * card.wholesale;

    rows.push({
      discount,
      bandExists: card.bandExists,
      cardRate: card.cardRate,
      wholesale: card.wholesale,
      grossProfitPer1M: card.cardRate - card.wholesale,
      portfolioMargin: card.grossMargin,
      worstModelMargin: card.worstModelMargin,
      worstAtDeepestCommit: pe.commitGuard.atDeepest,
      commitGuardHolds: pe.commitGuard.holds,
      launchYearRevenue: revenue,
      launchYearGrossProfit: grossProfit,
      launchYearOperatingProfit: grossProfit - base.totals.fixed,
    });
  }
  return rows;
}

/** The discount required to reach a target portfolio gross margin.
 *  Sensitivity rows 21 to 26. */
export function discountForTargetMargin(targetMargin, inputs) {
  const ladder = discountLadder(inputs, 0.25, 0.70, 0.01);
  const hit = ladder.find((r) => r.portfolioMargin >= targetMargin);
  return hit ?? null;
}

/** The four negotiation positions. Sensitivity rows 87 to 90.
 *  These are the numbers to walk into a term sheet conversation with. */
export function negotiationPositions(inputs) {
  const k = withDefaults(inputs);
  return POSITIONS.map((p) => {
    const card = buildRateCard({ ...k, discount: p.discount });
    const pe = planEconomics({ ...k, discount: p.discount });
    return {
      ...p,
      cardRate: card.cardRate,
      portfolioMargin: card.grossMargin,
      worstModelMargin: card.worstModelMargin,
      worstAtDeepestCommit: pe.commitGuard.atDeepest,
      bandExists: card.bandExists,
      commitGuardHolds: pe.commitGuard.holds,
    };
  });
}

/** What one point of discount is worth. Sensitivity rows 94 to 97.
 *  Gross profit rises and revenue falls, because the method is cost-anchored
 *  and passes a better wholesale price to the customer as a lower list price. */
export function valuePerPoint(inputs) {
  const ladder = discountLadder(inputs, 0.25, 0.70, 0.01);
  const lo = ladder[0], hi = ladder[ladder.length - 1];
  const span = (hi.discount - lo.discount) * 100;
  return {
    marginPoints: ((hi.portfolioMargin - lo.portfolioMargin) * 100) / span,
    grossProfitPer1M: (hi.grossProfitPer1M - lo.grossProfitPer1M) / span,
    launchYearGrossProfit: (hi.launchYearGrossProfit - lo.launchYearGrossProfit) / span,
    launchYearRevenue: (hi.launchYearRevenue - lo.launchYearRevenue) / span,
  };
}

/** Two-way grid helper. Used for discount x positioning (rows 45 to 51),
 *  discount x annual commit adoption (rows 57 to 61), and any other pair. */
export function grid(rowValues, colValues, compute) {
  return rowValues.map((r) => ({
    row: r,
    cells: colValues.map((c) => ({ col: c, value: compute(r, c) })),
  }));
}

export function marginByDiscountAndPosition(inputs, discounts, shifts) {
  const k = withDefaults(inputs);
  return grid(discounts, shifts, (discount, positionShift) =>
    buildRateCard({ ...k, discount, positionShift }).grossMargin);
}

export function marginByDiscountAndAnnualShare(inputs, discounts, annualShares) {
  const k = withDefaults(inputs);
  return grid(discounts, annualShares, (discount, shareCommitAnnual) => {
    const sharePayg = Math.max(0, 1 - shareCommitAnnual - k.shareCommitMonthly);
    return planEconomics({ ...k, discount, shareCommitAnnual, sharePayg }).blended.grossMargin;
  });
}

/** Card rate and margin against cached-token share. Sensitivity rows 77 to 82.
 *  Margin is effectively immune because both sides deflate together. Revenue
 *  is not, which makes cached share a forecasting risk rather than a margin one. */
export function workloadMixLadder(inputs, cachedShares) {
  const k = withDefaults(inputs);
  const base = buildRateCard(k);
  return cachedShares.map((mixCached) => {
    const mixInput = 1 - mixCached - k.mixOutput;
    const card = buildRateCard({ ...k, mixCached, mixInput });
    return {
      mixCached, mixInput, mixOutput: k.mixOutput,
      cardRate: card.cardRate,
      wholesale: card.wholesale,
      grossMargin: card.grossMargin,
      changeInCardRate: card.cardRate / base.cardRate - 1,
    };
  });
}
