// Parity test. Every expected value below was read out of
// Serverless_Inference_Pricing_Model.xlsx after a full recalculation.
//
// If this test fails, the app and the workbook have diverged. Fix whichever
// one is wrong before shipping either. Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildRateCard, planEconomics, planMultipliers, weightedDiscounts,
         tierLadder, monthlyCommitInvoice, annualCommitTerm } from "../src/engine/pricing.js";
import { forecast12M, forecast3Y } from "../src/engine/forecast.js";
import { negotiationPositions, valuePerPoint, workloadMixLadder } from "../src/engine/sensitivity.js";

const near = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol,
    `${label}: got ${actual}, workbook says ${expected}, tolerance ${tol}`);

/* ---------------------------------------------- Rate_Card */

test("Rate_Card: 26 model families across 2 providers", () => {
  const card = buildRateCard();
  assert.equal(card.models.length, 26);
  assert.equal(card.models.filter((m) => m.source === "Baseten").length, 2);
  assert.equal(card.models.filter((m) => m.source === "DeepInfra").length, 24);
});

test("Rate_Card: class rollup matches rows 36 to 39", () => {
  const { classes } = buildRateCard();
  const expected = [
    { count: 7, avgList: 0.2004, avgCost: 0.1265, gm: 0.369 },
    { count: 9, avgList: 0.6474, avgCost: 0.3988, gm: 0.384 },
    { count: 7, avgList: 1.1518, avgCost: 0.7011, gm: 0.391 },
    { count: 3, avgList: 2.1443, avgCost: 1.2899, gm: 0.398 },
  ];
  classes.forEach((c, i) => {
    assert.equal(c.count, expected[i].count, `tier ${i + 1} model count`);
    near(c.avgList, expected[i].avgList, 0.0002, `tier ${i + 1} avg list`);
    near(c.avgCost, expected[i].avgCost, 0.0002, `tier ${i + 1} avg cost`);
    near(c.grossMargin, expected[i].gm, 0.001, `tier ${i + 1} gross margin`);
  });
});

test("Rate_Card: portfolio block matches rows 42 to 46", () => {
  const card = buildRateCard();
  near(card.cardRate, 0.5818, 0.0002, "portfolio card rate");
  near(card.wholesale, 0.3566, 0.0002, "portfolio wholesale");
  near(card.grossMargin, 0.3871, 0.0005, "portfolio gross margin");
  near(card.worstModelMargin, 0.3689, 0.0005, "worst single model margin");
});

test("Rate_Card: guards hold at the default discount", () => {
  const card = buildRateCard();
  assert.ok(card.bandExists, "band must exist when discount exceeds the margin floor");
  assert.ok(card.models.every((m) => m.withinCeiling), "no model may list above partner retail");
  assert.ok(card.models.every((m) => m.grossMargin >= 0.30 - 1e-9), "no model below the 30% margin floor");
});

test("Rate_Card: the band collapses at or below the margin floor", () => {
  assert.equal(buildRateCard({ discount: 0.30 }).bandExists, false);
  assert.equal(buildRateCard({ discount: 0.25 }).bandExists, false);
  assert.equal(buildRateCard({ discount: 0.31 }).bandExists, true);
});

/* ------------------------------------------ Plan_Economics */

test("Plan_Economics: weighted discounts match B16 and B17", () => {
  const wd = weightedDiscounts();
  near(wd.monthly, 0.065, 0.0005, "monthly weighted discount");
  near(wd.annual, 0.111, 0.0005, "annual weighted discount");
});

test("Plan_Economics: effective multipliers match row 27", () => {
  const m = planMultipliers();
  near(m.payg, 1.000, 0.0005, "pay as you go multiplier");
  near(m.monthly, 1.000, 0.0015, "monthly multiplier");
  near(m.annual, 0.898, 0.0015, "annual multiplier");
});

test("Plan_Economics: unit economics match rows 33 and 36", () => {
  const pe = planEconomics();
  near(pe.payg.rate, 0.5818, 0.0003, "payg realized rate");
  near(pe.monthly.rate, 0.5816, 0.0003, "monthly realized rate");
  near(pe.annual.rate, 0.5224, 0.0003, "annual realized rate");
  near(pe.blended.rate, 0.5550, 0.0003, "blended realized rate");
  near(pe.blended.grossMargin, 0.358, 0.001, "blended gross margin");
});

test("Plan_Economics: commit floor guard matches rows 42 to 46", () => {
  const g = planEconomics().commitGuard;
  near(g.worst, 0.3689, 0.0005, "worst model margin");
  near(g.atDeepest, 0.2111, 0.0005, "worst model at deepest commit");
  near(g.headroomPoints, 6.1, 0.15, "headroom in points");
  assert.ok(g.holds, "commit guard must hold at the default discount");
});

/* -------------------------------------------- Plan tabs */

test("Commit_Monthly: a commitment is stated in discounted dollars", () => {
  const t = tierLadder()[1];
  near(t.monthlyMinimum, 20833.33, 0.5, "tier 2 monthly minimum");
  near(t.listToFillMonthly, 22645.0, 1.0, "list usage to fill tier 2 minimum");
});

test("Commit_Monthly: a light month bills to the minimum, a heavy month pays overage", () => {
  const light = monthlyCommitInvoice(15000, 2);
  assert.equal(light.invoice, light.minimum, "light month must invoice at the minimum");
  assert.ok(light.effectiveDiscount < 0, "a light month pays more than it consumed");

  const heavy = monthlyCommitInvoice(60000, 2);
  assert.ok(heavy.overage > 0, "heavy month must produce overage");
  assert.ok(heavy.effectiveDiscount < heavy.headlineDiscount,
    "overage at full card rate means the realized discount is below the headline");
});

test("Commit_Annual: shortfall rolls forward and reconciles once at term end", () => {
  // 24,000 a month clears the $250,000 Tier 2 commitment on usage alone.
  const flat = Array(12).fill(24000);
  const term = annualCommitTerm(flat, 2);
  assert.equal(term.months.length, 12);
  assert.ok(term.clearedOnUsage, "this usage level must clear the commitment");
  near(term.effectiveDiscount, term.headlineDiscount, 1e-9,
    "a term that clears on usage realizes the full headline discount");

  // A term that falls short reconciles once, and never mid-term.
  const short = annualCommitTerm(Array(12).fill(10000), 2);
  assert.ok(!short.clearedOnUsage, "this usage level must fall short");
  assert.ok(short.reconciliation > 0, "a short term must reconcile at term end");
  assert.ok(short.months.slice(0, 11).every((m) => m.invoice === m.usage * (1 - short.headlineDiscount)),
    "no month before the last may be charged for the shortfall");

  const lumpy = [5000, 5000, 5000, 5000, 5000, 5000, 40000, 40000, 40000, 40000, 40000, 40000];
  const t2 = annualCommitTerm(lumpy, 2);
  assert.ok(t2.months[3].balance > 0, "an early light month must carry a memo balance");
  assert.ok(t2.months[11].balance < t2.months[5].balance,
    "a heavy month must draw the rolling balance back down");
});

/* ---------------------------------------------- Forecast */

test("Forecast_12M: launch year matches the workbook totals", () => {
  const f = forecast12M();
  near(f.totals.volume, 2692422, 500, "launch-year volume");
  near(f.totals.revenue, 1530634, 1500, "launch-year revenue");
  near(f.totals.grossProfit, 570558, 1500, "launch-year gross profit");
  near(f.totals.operatingProfit, -329442, 1500, "launch-year operating profit");
  near(f.totals.grossMargin, 0.373, 0.002, "launch-year gross margin");
  near(f.totals.contractedShare, 0.333, 0.004, "contracted share of launch-year revenue");
});

test("Forecast_12M: breakeven and first profitable month", () => {
  const f = forecast12M();
  near(f.breakevenVolume, 377928, 400, "monthly breakeven volume");
  assert.equal(f.firstProfitableMonth, 10, "first month in operating profit");
});

test("Forecast_12M: the mix ramp is back-loaded, not linear", () => {
  const backLoaded = forecast12M();
  const linear = forecast12M({ rampExponent: 1 });
  assert.ok(linear.totals.contractedShare > backLoaded.totals.contractedShare + 0.10,
    "a linear ramp would overstate contracted revenue by more than 10 points");
});

test("Forecast_3Y: margin holds while dollars per token fall", () => {
  const y = forecast3Y();
  assert.equal(y.length, 3);
  near(y[0].revenue, 1530634, 1500, "year 1 revenue");
  near(y[1].revenue, 2794506, 4000, "year 2 revenue");
  near(y[2].revenue, 4275594, 6000, "year 3 revenue");
  assert.ok(y[2].cumulative > 0, "cumulative operating profit turns positive during year 3");
  assert.ok(y[0].grossProfitPer1M > y[1].grossProfitPer1M &&
            y[1].grossProfitPer1M > y[2].grossProfitPer1M,
    "gross profit per 1M tokens falls every year even though margin percentage holds");
  near(y[1].grossMargin, y[2].grossMargin, 0.005,
    "margin percentage holds because card and wholesale deflate together");
});

/* ------------------------------------------- Sensitivity */

test("Sensitivity: the four negotiation positions match rows 87 to 90", () => {
  const p = Object.fromEntries(negotiationPositions().map((r) => [r.key, r]));
  near(p.walkaway.portfolioMargin, 0.300, 0.002, "walk away portfolio margin");
  assert.equal(p.walkaway.bandExists, false, "no band exists at the walk-away discount");

  near(p.floor.portfolioMargin, 0.327, 0.002, "absolute floor portfolio margin");
  near(p.floor.worstAtDeepestCommit, 0.151, 0.002, "absolute floor, worst model at deepest commit");

  near(p.accept.portfolioMargin, 0.356, 0.002, "accept portfolio margin");
  near(p.target.portfolioMargin, 0.421, 0.002, "target portfolio margin");
});

test("Sensitivity: a point of discount raises gross profit and lowers revenue", () => {
  const v = valuePerPoint();
  near(v.marginPoints, 0.694, 0.03, "portfolio margin points per point of discount");
  near(v.launchYearGrossProfit, 5790, 200, "launch-year gross profit per point");
  assert.ok(v.launchYearRevenue < 0,
    "the method is cost-anchored, so a better wholesale price lowers the list price");
  near(v.launchYearRevenue, -11666, 400, "launch-year revenue per point");
});

test("Sensitivity: margin is immune to workload mix, revenue is not", () => {
  const rows = workloadMixLadder(null, [0.10, 0.20, 0.30, 0.40, 0.50]);
  const margins = rows.map((r) => r.grossMargin);
  assert.ok(Math.max(...margins) - Math.min(...margins) < 0.001,
    "gross margin must move less than a tenth of a point across the range");
  near(rows[1].changeInCardRate, 0, 1e-9, "the assumed mix is the baseline");
  assert.ok(rows[4].changeInCardRate < -0.14,
    "a 50% cached share removes more than 14% of revenue on unchanged volume");
});
