// Mirrors Forecast_12M and Forecast_3Y.

import { withDefaults } from "./inputs.js";
import { planEconomics } from "./pricing.js";

/** Launch year by month. Forecast_12M rows 5 to 24.
 *
 * The plan mix starts fully on pay as you go because nothing is contracted at
 * launch, then ramps. The ramp is back-loaded rather than linear:
 *
 *   ramp(t) = ((t - 1) / 11) ^ rampExponent
 *
 * rampExponent = 1 is a straight line. The workbook default of 2.75 is what
 * reproduces the documented 33.3% contracted share of launch-year revenue,
 * and it is the honest shape because commit deals take months to close. */
export function forecast12M(inputs) {
  const k = withDefaults(inputs);
  const pe = planEconomics(k);

  const months = [];
  let cumulative = 0;

  for (let t = 1; t <= 12; t++) {
    const volume = k.m1Volume * Math.pow(1 + k.volumeGrowth, t - 1);
    const customers = k.m1Customers * Math.pow(1 + k.customerGrowth, t - 1);

    const ramp = Math.pow((t - 1) / 11, k.rampExponent);
    const shareMonthly = k.shareCommitMonthly * ramp;
    const shareAnnual = k.shareCommitAnnual * ramp;
    const sharePayg = 1 - shareMonthly - shareAnnual;

    const rate = sharePayg * pe.payg.rate + shareMonthly * pe.monthly.rate + shareAnnual * pe.annual.rate;
    const revenue = volume * rate;
    const cogs = volume * pe.card.wholesale;
    const grossProfit = revenue - cogs;
    const fixed = k.fixedMonthly;
    const operatingProfit = grossProfit - fixed;
    cumulative += operatingProfit;

    months.push({
      month: t, volume, customers,
      sharePayg, shareMonthly, shareAnnual,
      rate, revenue, cogs, grossProfit, fixed, operatingProfit, cumulative,
      contracted: volume * (shareMonthly * pe.monthly.rate + shareAnnual * pe.annual.rate),
      grossMargin: revenue > 0 ? grossProfit / revenue : 0,
    });
  }

  const sum = (f) => months.reduce((a, m) => a + f(m), 0);
  const totals = {
    volume: sum((m) => m.volume),
    revenue: sum((m) => m.revenue),
    cogs: sum((m) => m.cogs),
    grossProfit: sum((m) => m.grossProfit),
    fixed: sum((m) => m.fixed),
    operatingProfit: sum((m) => m.operatingProfit),
    contracted: sum((m) => m.contracted),
    customers: months[11].customers,
  };
  totals.grossMargin = totals.revenue > 0 ? totals.grossProfit / totals.revenue : 0;
  totals.contractedShare = totals.revenue > 0 ? totals.contracted / totals.revenue : 0;
  totals.realizedRate = totals.volume > 0 ? totals.revenue / totals.volume : 0;

  const m12Rate = months[11].rate;
  const breakevenVolume = m12Rate > pe.card.wholesale
    ? k.fixedMonthly / (m12Rate - pe.card.wholesale)
    : Infinity;
  const firstProfitableMonth = months.find((m) => m.operatingProfit > 0)?.month ?? null;

  return { months, totals, breakevenVolume, firstProfitableMonth, planEconomics: pe };
}

/** Three-year view. Forecast_3Y rows 5 to 17.
 *  Card rate and wholesale cost deflate together, so gross margin percentage
 *  holds while dollars per token fall. Volume has to grow faster than price
 *  deflates for gross profit dollars to rise. */
export function forecast3Y(inputs) {
  const k = withDefaults(inputs);
  const y1 = forecast12M(k);
  const pe = y1.planEconomics;

  const years = [];
  let volume = y1.totals.volume;
  let rate = y1.totals.realizedRate;
  let cost = pe.card.wholesale;
  let fixed = y1.totals.fixed;
  let cumulative = 0;

  for (let y = 1; y <= 3; y++) {
    if (y === 2) {
      volume *= 1 + k.volumeGrowthY2;
      rate = y1.months[11].rate * (1 - k.priceDeflation);
      cost *= 1 - k.priceDeflation;
      fixed *= 1 + k.fixedInflation;
    } else if (y === 3) {
      volume *= 1 + k.volumeGrowthY3;
      rate *= 1 - k.priceDeflation;
      cost *= 1 - k.priceDeflation;
      fixed *= 1 + k.fixedInflation;
    }
    const revenue = y === 1 ? y1.totals.revenue : volume * rate;
    const cogs = y === 1 ? y1.totals.cogs : volume * cost;
    const grossProfit = revenue - cogs;
    const operatingProfit = grossProfit - fixed;
    cumulative += operatingProfit;
    years.push({
      year: y, volume, rate, cost, revenue, cogs, grossProfit, fixed,
      operatingProfit, cumulative,
      grossMargin: revenue > 0 ? grossProfit / revenue : 0,
      grossProfitPer1M: volume > 0 ? grossProfit / volume : 0,
    });
  }
  return years;
}

/** Bottom-up return model used by the Return board.
 *  Not a workbook tab. Volume is built from customers x tokens per customer
 *  rather than seeded as a single number, so leadership can move the two
 *  independently, and a one-time launch investment is carried so the model
 *  reports payback and peak funding need rather than only operating profit. */
export function returnModel(inputs) {
  const k = withDefaults(inputs);
  const pe = planEconomics(k);
  const horizon = k.horizon ?? 36;

  const rows = [];
  let cumulative = -k.launchInvestment;
  let peak = cumulative;
  let breakevenMonth = null;
  let paybackMonth = null;

  for (let t = 1; t <= horizon; t++) {
    const customers = k.m1Customers * Math.pow(1 + k.customerGrowth, t - 1);
    const perCustomer = (k.tokensPerCustomer ?? 4000) * Math.pow(1 + (k.usageGrowth ?? 0.09), t - 1);
    const volume = customers * perCustomer;

    const ramp = Math.pow(Math.min(1, (t - 1) / 11), k.rampExponent);
    const shareMonthly = k.shareCommitMonthly * ramp;
    const shareAnnual = k.shareCommitAnnual * ramp;
    const sharePayg = 1 - shareMonthly - shareAnnual;

    const rate = sharePayg * pe.payg.rate + shareMonthly * pe.monthly.rate + shareAnnual * pe.annual.rate;
    const revenue = volume * rate;
    const cogs = volume * pe.card.wholesale;
    const grossProfit = revenue - cogs;
    const fixed = k.fixedMonthly * Math.pow(1 + k.fixedInflation, Math.floor((t - 1) / 12));
    const operatingProfit = grossProfit - fixed;

    cumulative += operatingProfit;
    if (cumulative < peak) peak = cumulative;
    if (breakevenMonth === null && operatingProfit > 0) breakevenMonth = t;
    if (paybackMonth === null && cumulative >= 0) paybackMonth = t;

    rows.push({
      month: t, customers, perCustomer, volume, rate, revenue, cogs,
      grossProfit, fixed, operatingProfit, cumulative,
      contracted: volume * (shareMonthly * pe.monthly.rate + shareAnnual * pe.annual.rate),
    });
  }

  const years = [];
  for (let y = 0; y < Math.ceil(horizon / 12); y++) {
    const seg = rows.slice(y * 12, y * 12 + 12);
    if (!seg.length) break;
    const revenue = seg.reduce((a, r) => a + r.revenue, 0);
    const grossProfit = seg.reduce((a, r) => a + r.grossProfit, 0);
    years.push({
      year: y + 1,
      customers: seg[seg.length - 1].customers,
      volume: seg.reduce((a, r) => a + r.volume, 0),
      revenue, grossProfit,
      operatingProfit: seg.reduce((a, r) => a + r.operatingProfit, 0),
      cumulative: seg[seg.length - 1].cumulative,
      grossMargin: revenue > 0 ? grossProfit / revenue : 0,
    });
  }

  return {
    rows, years, peakFunding: peak, breakevenMonth, paybackMonth,
    totalRevenue: rows.reduce((a, r) => a + r.revenue, 0),
    totalGrossProfit: rows.reduce((a, r) => a + r.grossProfit, 0),
    finalCumulative: cumulative,
    roi: k.launchInvestment > 0 ? cumulative / k.launchInvestment : null,
    monthlyBreakevenVolume: pe.card.cardRate > pe.card.wholesale
      ? k.fixedMonthly / (pe.card.cardRate - pe.card.wholesale)
      : Infinity,
    planEconomics: pe,
  };
}
