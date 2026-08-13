// Mirrors the Inputs tab of Serverless_Inference_Pricing_Model.xlsx.
// Cell references are given so any number here can be traced back to the workbook.

export const DEFAULTS = {
  // --- Derivation (Inputs!B6:B10)
  marginFloor: 0.30,        // B6  Margin floor at list
  discount: 0.45,           // B7  Negotiated wholesale discount
  mixInput: 0.60,           // B8  Workload mix, input share
  mixCached: 0.20,          // B9  Workload mix, cached share
  mixOutput: 0.20,          // B10 Workload mix, output share

  // --- Price classes (Inputs!C15:D18)
  positionScore: [0.40, 0.50, 0.55, 0.60],
  trafficShare: [0.55, 0.25, 0.12, 0.08],

  // --- Commit tier ladder (Inputs!B23:E26)
  tiers: [
    { annual: 50000, monthlyDiscount: 0.05, annualDiscount: 0.08 },
    { annual: 250000, monthlyDiscount: 0.08, annualDiscount: 0.11 },
    { annual: 1000000, monthlyDiscount: 0.12, annualDiscount: 0.15 },
    { annual: 5000000, monthlyDiscount: 0.17, annualDiscount: 0.20 },
  ],

  // --- Expected tier mix (Inputs!B30:C33)
  tierMixMonthly: [0.65, 0.27, 0.06, 0.02],
  tierMixAnnual: [0.35, 0.40, 0.22, 0.03],

  // --- Realized rate mechanics (Inputs!B38:C39)
  insideShareMonthly: 0.88,
  insideShareAnnual: 1.00,
  shortfallUpliftMonthly: 0.06,
  shortfallUpliftAnnual: 0.01,

  // --- Plan mix at month 12 (Inputs!B43:B45)
  sharePayg: 0.30,
  shareCommitMonthly: 0.25,
  shareCommitAnnual: 0.45,

  // --- Commit guards (Inputs!B50:B51)
  maxCommitDiscount: 0.20,
  commitMarginFloor: 0.15,

  // --- Forecast, launch year (Inputs!B55:B60)
  m1Volume: 60000,          // 1M-token units
  volumeGrowth: 0.22,
  m1Customers: 15,
  customerGrowth: 0.12,
  fixedMonthly: 75000,
  rampExponent: 2.75,

  // --- Forecast, three-year (Inputs!B64:B67)
  priceDeflation: 0.15,
  fixedInflation: 0.03,
  volumeGrowthY2: 1.20,
  volumeGrowthY3: 0.80,

  // --- Not in the workbook. Used by the Return board only.
  launchInvestment: 413000,
  overheadAllocVolume: 500000,
  marginBasis: "gross",     // "gross" | "loaded"
  listMode: "band",         // "band" | "floor"
  positionShift: 0,
};

export const TIER_NAMES = ["Tier 1 Small", "Tier 2 Medium", "Tier 3 Large", "Tier 4 Frontier"];

// Negotiation positions from Sensitivity!A87:A90.
export const POSITIONS = [
  { key: "walkaway", label: "Walk away", discount: 0.30, note: "No price band exists. The floor rises above the ceiling and nothing can be listed." },
  { key: "floor", label: "Absolute floor", discount: 0.35, note: "The deepest commit tier falls through the 15% commit margin floor. The ladder has to be cut short." },
  { key: "accept", label: "Accept", discount: 0.40, note: "Portfolio margin holds above 35% with roughly 4.7 points of commit-floor headroom." },
  { key: "target", label: "Target", discount: 0.50, note: "Full headroom on the commit ladder and room to sign a custom card without an exception." },
];

export function withDefaults(partial = {}) {
  return { ...DEFAULTS, ...partial };
}
