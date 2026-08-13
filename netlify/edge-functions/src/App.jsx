import React, { useState, useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";

import { DEFAULTS, TIER_NAMES } from "./engine/inputs.js";
import { buildRateCard } from "./engine/pricing.js";
import { returnModel } from "./engine/forecast.js";
import { negotiationPositions } from "./engine/sensitivity.js";

/* ------------------------------------------------------------------ tokens */
const C = {
  ink: "#0B2545", inkSoft: "#3D5A80", paper: "#F4F6F9", panel: "#FFFFFF",
  rule: "#D6DDE6", signal: "#F26722", clear: "#1B7F79", warn: "#C9860A", dim: "#7A8899",
};
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/* ------------------------------------------------------------------ format */
const usd = (v, d = 4) =>
  (v < 0 ? "-" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const usd0 = (v) =>
  (v < 0 ? "(" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("en-US") + (v < 0 ? ")" : "");
const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
const num = (v) => Math.round(v).toLocaleString("en-US");

/* ------------------------------------------------------------- primitives */
function Micro({ children, color = C.dim }) {
  return <div style={{ fontFamily: SANS, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color, fontWeight: 700 }}>{children}</div>;
}

function Slider({ label, value, min, max, step, onChange, display, hint, accent = C.ink }) {
  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between mb-1">
        <Micro>{label}</Micro>
        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: accent, fontVariantNumeric: "tabular-nums" }}>{display}</div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full" style={{ accentColor: accent, color: accent }} aria-label={label} />
      {hint && <div style={{ fontFamily: SANS, fontSize: 11, color: C.dim, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Toggle({ label, options, value, onChange }) {
  return (
    <div className="mb-5">
      <Micro>{label}</Micro>
      <div className="flex mt-1" style={{ border: `1px solid ${C.rule}` }} role="group" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.v)} onClick={() => onChange(o.v)} aria-pressed={value === o.v}
            className="flex-1 py-2 px-2"
            style={{
              fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
              background: value === o.v ? C.ink : "transparent",
              color: value === o.v ? "#fff" : C.inkSoft, border: "none", cursor: "pointer",
            }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  const color = tone === "bad" ? C.signal : tone === "good" ? C.clear : tone === "warn" ? C.warn : C.ink;
  return (
    <div className="px-4 py-3" style={{ background: C.panel, border: `1px solid ${C.rule}`, borderTop: `3px solid ${color}` }}>
      <Micro>{label}</Micro>
      <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color, lineHeight: 1.15, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: 11, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, note, children }) {
  return (
    <section className="mb-6" style={{ background: C.panel, border: `1px solid ${C.rule}` }}>
      <div className="px-5 pt-4 pb-2" style={{ borderBottom: `1px solid ${C.rule}` }}>
        <Micro color={C.inkSoft}>{title}</Micro>
        {note && <div style={{ fontFamily: SANS, fontSize: 12, color: C.dim, marginTop: 4 }}>{note}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------ the band */
function BandRail({ card, inputs }) {
  const ceiling = card.classes.reduce((a, c) => a + c.trafficShare * c.avgRetail, 0);
  const cost = card.wholesale;
  const loaded = card.loadedCost;
  const floorBasis = inputs.marginBasis === "loaded" ? loaded : cost;
  const floor = floorBasis / (1 - inputs.marginFloor);
  const breach = floor > ceiling;
  const list = card.cardRate;

  const scale = Math.max(ceiling * 1.15, floor * 1.12);
  const X = (v) => `${Math.min(100, Math.max(0, (v / scale) * 100))}%`;

  const markers = [
    { v: cost, label: "Wholesale cost", color: C.inkSoft, val: usd(cost), up: true },
    ...(inputs.marginBasis === "loaded"
      ? [{ v: loaded, label: "Loaded cost", color: C.warn, val: usd(loaded), up: false }] : []),
    { v: floor, label: breach ? "Floor, above ceiling" : "Floor", color: breach ? C.signal : C.ink, val: usd(floor), up: inputs.marginBasis === "loaded" },
    { v: ceiling, label: "Ceiling, partner retail", color: C.ink, val: usd(ceiling), up: true },
  ];

  return (
    <div>
      <div className="relative" style={{ height: 104, marginTop: 30, marginBottom: 38 }}>
        <div className="absolute" style={{ left: 0, right: 0, top: 38, height: 26, background: "#E8EDF3" }} />
        {!breach && (
          <div className="absolute" style={{ left: X(floor), width: X(ceiling - floor), top: 38, height: 26, background: C.ink, opacity: 0.14 }} />
        )}
        {breach && (
          <div className="absolute" style={{ left: X(ceiling), width: X(floor - ceiling), top: 38, height: 26, background: C.signal, opacity: 0.28 }} />
        )}
        <div className="absolute" style={{ left: 0, width: X(cost), top: 38, height: 26, background: C.inkSoft, opacity: 0.5 }} />

        {markers.map((m, i) => (
          <div key={i} className="absolute" style={{ left: X(m.v), top: m.up ? 4 : 70 }}>
            <div style={{ width: 2, height: 30, background: m.color, position: "absolute", top: m.up ? 24 : -26 }} />
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: m.color, whiteSpace: "nowrap", transform: "translateX(-50%)" }}>{m.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.dim, whiteSpace: "nowrap", transform: "translateX(-50%)" }}>{m.val}</div>
          </div>
        ))}

        {!breach && (
          <div className="absolute" style={{ left: X(list), top: 32 }}>
            <div style={{ width: 4, height: 38, background: C.signal, transform: "translateX(-2px)" }} />
            <div style={{ position: "absolute", top: 42, transform: "translateX(-50%)", whiteSpace: "nowrap", textAlign: "center" }}>
              <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.signal }}>List</div>
              <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.signal }}>{usd(list)}</div>
            </div>
          </div>
        )}
      </div>

      {breach ? (
        <div className="px-4 py-3" style={{ background: "#FDF0E8", border: `1px solid ${C.signal}` }}>
          <div style={{ fontFamily: SANS, fontSize: 13, color: C.ink, fontWeight: 700 }}>No price band exists.</div>
          <div style={{ fontFamily: SANS, fontSize: 12, color: C.inkSoft, marginTop: 3 }}>
            The floor sits {pct(floor / ceiling - 1, 1)} above partner retail, so nothing can be listed at any price.
            Either the target margin comes down, the partner discount goes up, or the overhead gets spread over more volume.
          </div>
        </div>
      ) : (
        <div style={{ fontFamily: SANS, fontSize: 12, color: C.inkSoft }}>
          The band is {pct(1 - floor / ceiling, 1)} of partner retail wide. Every point of discount you win widens it.
          Every point of target margin you add narrows it.
        </div>
      )}
    </div>
  );
}

/* ================================================================= APP */
export default function App() {
  const [tab, setTab] = useState("band");

  // Price levers. Names match the Inputs tab of the workbook.
  const [discount, setDiscount] = useState(DEFAULTS.discount);
  const [marginFloor, setMarginFloor] = useState(DEFAULTS.marginFloor);
  const [listMode, setListMode] = useState(DEFAULTS.listMode);
  const [marginBasis, setMarginBasis] = useState(DEFAULTS.marginBasis);
  const [positionShift, setPositionShift] = useState(0);
  const [fixedMonthly, setFixedMonthly] = useState(DEFAULTS.fixedMonthly);
  const [overheadAllocVolume, setOverheadAllocVolume] = useState(DEFAULTS.overheadAllocVolume);

  // Return levers.
  const [m1Customers, setM1Customers] = useState(DEFAULTS.m1Customers);
  const [tokensPerCustomer, setTokensPerCustomer] = useState(4000);
  const [customerGrowth, setCustomerGrowth] = useState(DEFAULTS.customerGrowth);
  const [usageGrowth, setUsageGrowth] = useState(0.09);
  const [shareCommitAnnual, setShareCommitAnnual] = useState(DEFAULTS.shareCommitAnnual);
  const [shareCommitMonthly, setShareCommitMonthly] = useState(DEFAULTS.shareCommitMonthly);
  const [rampExponent, setRampExponent] = useState(DEFAULTS.rampExponent);
  const [launchInvestment, setLaunchInvestment] = useState(DEFAULTS.launchInvestment);
  const [fixedInflation, setFixedInflation] = useState(DEFAULTS.fixedInflation);
  const [horizon, setHorizon] = useState(36);

  const inputs = useMemo(() => ({
    ...DEFAULTS,
    discount, marginFloor, listMode, marginBasis, positionShift,
    fixedMonthly, overheadAllocVolume,
    m1Customers, tokensPerCustomer, customerGrowth, usageGrowth,
    shareCommitAnnual, shareCommitMonthly,
    sharePayg: Math.max(0, 1 - shareCommitAnnual - shareCommitMonthly),
    rampExponent, launchInvestment, fixedInflation, horizon,
  }), [discount, marginFloor, listMode, marginBasis, positionShift, fixedMonthly,
       overheadAllocVolume, m1Customers, tokensPerCustomer, customerGrowth, usageGrowth,
       shareCommitAnnual, shareCommitMonthly, rampExponent, launchInvestment,
       fixedInflation, horizon]);

  const card = useMemo(() => buildRateCard(inputs), [inputs]);
  const ret = useMemo(() => returnModel(inputs), [inputs]);
  const positions = useMemo(() => negotiationPositions(inputs), [inputs]);

  const chartData = ret.rows.map((r) => ({
    label: `M${r.month}`,
    Revenue: Math.round(r.revenue),
    "Gross profit": Math.round(r.grossProfit),
    "Cumulative cash": Math.round(r.cumulative),
  }));

  const lastRow = ret.rows[ret.rows.length - 1];
  const avgPosition = card.classes.reduce((a, c) => a + c.trafficShare * c.position, 0);

  return (
    <div style={{ background: C.paper, minHeight: "100%", fontFamily: SANS, color: C.ink }}>
      <header className="px-6 pt-6 pb-4" style={{ background: C.ink }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Micro color="#8FA8C4">Akamai Serverless Inference</Micro>
            <h1 style={{ fontFamily: SANS, fontSize: 30, fontWeight: 800, letterSpacing: "-0.025em", color: "#fff", lineHeight: 1.05, marginTop: 4, marginBottom: 0 }}>
              Price and Return Board
            </h1>
          </div>
          <div className="flex" style={{ border: "1px solid #2E4A70" }} role="tablist">
            {[{ v: "band", l: "Rate band" }, { v: "roi", l: "Return" }].map((o) => (
              <button key={o.v} onClick={() => setTab(o.v)} role="tab" aria-selected={tab === o.v}
                className="py-2 px-5"
                style={{
                  fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  background: tab === o.v ? C.signal : "transparent", color: "#fff", border: "none", cursor: "pointer",
                }}>{o.l}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row">
        <aside className="p-5 lg:w-80 lg:shrink-0" style={{ background: "#EAEEF4", borderRight: `1px solid ${C.rule}` }}>
          {tab === "band" ? (
            <>
              <div className="mb-5 pb-3" style={{ borderBottom: `1px solid ${C.rule}` }}>
                <Micro color={C.inkSoft}>What you control</Micro>
              </div>
              <Slider label="Partner discount off retail" value={discount} min={0.20} max={0.70} step={0.01}
                onChange={setDiscount} display={pct(discount, 0)} accent={C.signal}
                hint="The only input a negotiation can change." />
              <Slider label="Target unit margin" value={marginFloor} min={0.10} max={0.65} step={0.01}
                onChange={setMarginFloor} display={pct(marginFloor, 0)}
                hint="Sets the floor. Must stay below the partner discount or the band collapses." />
              <Toggle label="Margin basis" value={marginBasis} onChange={setMarginBasis}
                options={[{ v: "gross", label: "Wholesale only" }, { v: "loaded", label: "Incl. overhead" }]} />
              <Toggle label="How list is set" value={listMode} onChange={setListMode}
                options={[{ v: "band", label: "Position in band" }, { v: "floor", label: "At the floor" }]} />
              {listMode === "band" && (
                <Slider label="Position shift" value={positionShift} min={-0.30} max={0.35} step={0.01}
                  onChange={setPositionShift} display={(positionShift >= 0 ? "+" : "") + positionShift.toFixed(2)}
                  hint={`Effective score ${avgPosition.toFixed(2)}. Higher lists nearer the ceiling.`} />
              )}
              <div className="my-5 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
                <Micro color={C.inkSoft}>Overhead</Micro>
              </div>
              <Slider label="Fixed cost per month" value={fixedMonthly} min={20000} max={400000} step={5000}
                onChange={setFixedMonthly} display={usd0(fixedMonthly)}
                hint="Gateway, control plane, storage, launch team." />
              <Slider label="Volume it is spread over" value={overheadAllocVolume} min={50000} max={3000000} step={25000}
                onChange={setOverheadAllocVolume} display={num(overheadAllocVolume)}
                hint={`1M-token units per month. Overhead lands at ${usd(fixedMonthly / overheadAllocVolume)} per 1M.`} />
            </>
          ) : (
            <>
              <div className="mb-5 pb-3" style={{ borderBottom: `1px solid ${C.rule}` }}>
                <Micro color={C.inkSoft}>Ramp</Micro>
              </div>
              <Slider label="Customers at month 1" value={m1Customers} min={2} max={80} step={1}
                onChange={setM1Customers} display={num(m1Customers)} accent={C.signal} />
              <Slider label="Customer growth per month" value={customerGrowth} min={0} max={0.30} step={0.005}
                onChange={setCustomerGrowth} display={pct(customerGrowth, 1)}
                hint={`${num(lastRow.customers)} customers by month ${horizon}.`} />
              <Slider label="Tokens per customer per month" value={tokensPerCustomer} min={200} max={40000} step={100}
                onChange={setTokensPerCustomer} display={num(tokensPerCustomer)} hint="In 1M-token units." />
              <Slider label="Usage growth per customer" value={usageGrowth} min={0} max={0.25} step={0.005}
                onChange={setUsageGrowth} display={pct(usageGrowth, 1)}
                hint="Existing accounts consuming more, separate from new logos." />
              <div className="my-5 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
                <Micro color={C.inkSoft}>Plan mix at maturity</Micro>
              </div>
              <Slider label="Commit annual share" value={shareCommitAnnual} min={0} max={0.85} step={0.01}
                onChange={setShareCommitAnnual} display={pct(shareCommitAnnual, 0)}
                hint={`Realizes ${ret.planEconomics.multipliers.annual.toFixed(3)}x of card rate.`} />
              <Slider label="Commit monthly share" value={shareCommitMonthly} min={0} max={0.85} step={0.01}
                onChange={setShareCommitMonthly} display={pct(shareCommitMonthly, 0)}
                hint={`Realizes ${ret.planEconomics.multipliers.monthly.toFixed(3)}x. Pay as you go takes the remaining ${pct(Math.max(0, 1 - shareCommitAnnual - shareCommitMonthly), 0)}.`} />
              <Slider label="Commit adoption ramp" value={rampExponent} min={1} max={5} step={0.05}
                onChange={setRampExponent} display={rampExponent.toFixed(2)}
                hint="1.00 is a straight line. Higher is back-loaded, which is what a real commit pipeline looks like." />
              <div className="my-5 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
                <Micro color={C.inkSoft}>Investment</Micro>
              </div>
              <Slider label="One-time launch investment" value={launchInvestment} min={0} max={2000000} step={25000}
                onChange={setLaunchInvestment} display={usd0(launchInvestment)} />
              <Slider label="Fixed cost per month" value={fixedMonthly} min={20000} max={400000} step={5000}
                onChange={setFixedMonthly} display={usd0(fixedMonthly)} />
              <Slider label="Fixed cost inflation per year" value={fixedInflation} min={0} max={0.15} step={0.005}
                onChange={setFixedInflation} display={pct(fixedInflation, 1)} />
              <Toggle label="Horizon" value={horizon} onChange={setHorizon}
                options={[{ v: 12, label: "12 mo" }, { v: 24, label: "24 mo" }, { v: 36, label: "36 mo" }]} />
            </>
          )}
        </aside>

        <main className="flex-1 p-5 lg:p-6" style={{ minWidth: 0 }}>
          {tab === "band" ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <Stat label="List price, blended" value={usd(card.cardRate)} sub="Per 1M tokens, traffic-weighted"
                  tone={card.anyBandBreach ? "bad" : undefined} />
                <Stat label="Wholesale cost" value={usd(card.wholesale)}
                  sub={marginBasis === "loaded" ? `Loaded ${usd(card.loadedCost)}` : "Partner cost per 1M tokens"} />
                <Stat label="Gross margin" value={pct(card.grossMargin)} sub="Against wholesale only"
                  tone={card.grossMargin >= 0.35 ? "good" : card.grossMargin >= 0.30 ? "warn" : "bad"} />
                <Stat label="Contribution margin" value={pct(card.contributionMargin)} sub="After overhead allocation"
                  tone={card.contributionMargin >= 0.25 ? "good" : card.contributionMargin > 0 ? "warn" : "bad"} />
              </div>

              <Panel title="The band"
                note="Cost sets the floor, partner retail sets the ceiling, and list sits inside. Drag the target margin above the partner discount and watch the floor cross the ceiling.">
                <BandRail card={card} inputs={inputs} />
              </Panel>

              <Panel title="By price class" note="Per 1M tokens, blended across input, cached input and output.">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    <thead>
                      <tr style={{ background: C.ink }}>
                        {["Class", "Models", "Retail", "Cost", "Floor", "List", "Gross", "Contrib", "Spread", "Traffic"].map((h) => (
                          <th key={h} className="px-2 py-2" style={{ color: "#fff", fontFamily: SANS, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: h === "Class" ? "left" : "right" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {card.classes.map((c, i) => {
                        const floor = c.models.reduce((a, m) => a + m.blendedFloor, 0) / c.count;
                        const breach = floor > c.avgRetail;
                        return (
                          <tr key={c.tier} style={{ background: i % 2 ? "#F7F9FB" : "transparent" }}>
                            <td className="px-2 py-2" style={{ fontFamily: SANS, fontWeight: 700 }}>{TIER_NAMES[i]}</td>
                            <td className="px-2 py-2 text-right" style={{ color: C.dim }}>{c.count}</td>
                            <td className="px-2 py-2 text-right">{usd(c.avgRetail)}</td>
                            <td className="px-2 py-2 text-right">{usd(c.avgCost)}</td>
                            <td className="px-2 py-2 text-right" style={{ color: breach ? C.signal : "inherit" }}>{usd(floor)}</td>
                            <td className="px-2 py-2 text-right" style={{ fontWeight: 700 }}>{breach ? "—" : usd(c.avgList)}</td>
                            <td className="px-2 py-2 text-right">{breach ? "—" : pct(c.grossMargin)}</td>
                            <td className="px-2 py-2 text-right" style={{ color: c.contributionMargin < 0 ? C.signal : "inherit" }}>{breach ? "—" : pct(c.contributionMargin)}</td>
                            <td className="px-2 py-2 text-right" style={{ color: c.spread > 3 ? C.warn : C.dim }}>{c.spread.toFixed(2)}x</td>
                            <td className="px-2 py-2 text-right" style={{ color: C.dim }}>{pct(c.trafficShare, 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: C.dim, marginTop: 10 }}>
                  Spread is the widest list price in the class over the narrowest. Tier 1 carries most of the traffic
                  and spans more than 4x internally, so its class average is an internal planning figure rather than a
                  number to quote.
                </div>
              </Panel>

              <Panel title="Where this sits against the negotiation"
                note="The four positions the term sheet conversation turns on.">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {positions.map((p) => {
                    const here = Math.abs(discount - p.discount) < 0.005;
                    return (
                      <div key={p.key} className="px-4 py-3"
                        style={{ border: `1px solid ${here ? C.signal : C.rule}`, background: here ? "#FDF4EE" : "transparent" }}>
                        <div className="flex items-baseline justify-between">
                          <Micro color={here ? C.signal : C.inkSoft}>{p.label}</Micro>
                          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14 }}>{pct(p.discount, 0)}</div>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, marginTop: 6, color: p.bandExists ? C.ink : C.signal }}>
                          {p.bandExists ? pct(p.portfolioMargin) : "No band"}
                        </div>
                        <div style={{ fontFamily: SANS, fontSize: 11, color: C.dim, marginTop: 4 }}>{p.note}</div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <Stat label={`Revenue, ${horizon} months`} value={usd0(ret.totalRevenue)}
                  sub={`Gross profit ${usd0(ret.totalGrossProfit)}`} />
                <Stat label="Cumulative cash" value={usd0(ret.finalCumulative)}
                  sub={`After ${usd0(launchInvestment)} launch investment`}
                  tone={ret.finalCumulative > 0 ? "good" : "bad"} />
                <Stat label="Return on investment" value={ret.roi === null ? "n/a" : pct(ret.roi, 0)}
                  sub="Cumulative cash over investment"
                  tone={ret.roi > 0.5 ? "good" : ret.roi > 0 ? "warn" : "bad"} />
                <Stat label="Payback" value={ret.paybackMonth ? `Month ${ret.paybackMonth}` : "Beyond horizon"}
                  sub={ret.breakevenMonth ? `Monthly breakeven at month ${ret.breakevenMonth}` : "Never turns monthly-positive"}
                  tone={ret.paybackMonth ? "good" : "bad"} />
              </div>

              <Panel title="Revenue, gross profit and cumulative cash"
                note="Bars are monthly. The line is cumulative cash including the one-time launch investment, so it starts below zero.">
                <div style={{ width: "100%", height: 320 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={C.rule} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.dim, fontFamily: MONO }}
                        interval={Math.max(0, Math.floor(horizon / 12) - 1)} tickLine={false} axisLine={{ stroke: C.rule }} />
                      <YAxis tick={{ fontSize: 10, fill: C.dim, fontFamily: MONO }} tickLine={false}
                        axisLine={false} tickFormatter={(v) => "$" + Math.round(v / 1000) + "k"} />
                      <Tooltip contentStyle={{ fontFamily: MONO, fontSize: 12, border: `1px solid ${C.rule}`, borderRadius: 0 }}
                        formatter={(v) => usd0(v)} />
                      <Legend wrapperStyle={{ fontFamily: SANS, fontSize: 11 }} />
                      <ReferenceLine y={0} stroke={C.ink} />
                      <Bar dataKey="Revenue" fill={C.inkSoft} />
                      <Bar dataKey="Gross profit" fill={C.clear} />
                      <Line type="monotone" dataKey="Cumulative cash" stroke={C.signal} strokeWidth={2.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="By year">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    <thead>
                      <tr style={{ background: C.ink }}>
                        {["Year", "Customers", "Volume 1M tok", "Revenue", "Gross profit", "Gross margin", "Operating profit", "Cumulative cash"].map((h) => (
                          <th key={h} className="px-2 py-2" style={{ color: "#fff", fontFamily: SANS, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: h === "Year" ? "left" : "right" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ret.years.map((y, i) => (
                        <tr key={y.year} style={{ background: i % 2 ? "#F7F9FB" : "transparent" }}>
                          <td className="px-2 py-2" style={{ fontFamily: SANS, fontWeight: 700 }}>Year {y.year}</td>
                          <td className="px-2 py-2 text-right">{num(y.customers)}</td>
                          <td className="px-2 py-2 text-right">{num(y.volume)}</td>
                          <td className="px-2 py-2 text-right">{usd0(y.revenue)}</td>
                          <td className="px-2 py-2 text-right">{usd0(y.grossProfit)}</td>
                          <td className="px-2 py-2 text-right">{pct(y.grossMargin)}</td>
                          <td className="px-2 py-2 text-right" style={{ color: y.operatingProfit < 0 ? C.signal : C.clear, fontWeight: 700 }}>{usd0(y.operatingProfit)}</td>
                          <td className="px-2 py-2 text-right" style={{ color: y.cumulative < 0 ? C.signal : C.clear }}>{usd0(y.cumulative)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Funding and mix">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="px-4 py-3" style={{ border: `1px solid ${C.rule}` }}>
                    <Micro color={C.inkSoft}>Peak funding need</Micro>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, marginTop: 6, color: C.signal }}>{usd0(ret.peakFunding)}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11, color: C.dim, marginTop: 4 }}>
                      The deepest the cumulative cash line goes. This is the cheque, not the launch investment on its own.
                    </div>
                  </div>
                  <div className="px-4 py-3" style={{ border: `1px solid ${C.rule}` }}>
                    <Micro color={C.inkSoft}>Contracted at month {horizon}</Micro>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                      {pct(lastRow.revenue > 0 ? lastRow.contracted / lastRow.revenue : 0, 0)}
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 11, color: C.dim, marginTop: 4 }}>
                      Share of the final month sitting on a commit plan.
                    </div>
                  </div>
                  <div className="px-4 py-3" style={{ border: `1px solid ${C.rule}` }}>
                    <Micro color={C.inkSoft}>Monthly breakeven volume</Micro>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                      {Number.isFinite(ret.monthlyBreakevenVolume) ? num(ret.monthlyBreakevenVolume) : "n/a"}
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 11, color: C.dim, marginTop: 4 }}>
                      1M-token units per month at the current list price, before any commit discount.
                    </div>
                  </div>
                </div>
                <div className="mt-4 px-4 py-3" style={{ background: "#EEF2F7" }}>
                  <div style={{ fontFamily: SANS, fontSize: 12, color: C.inkSoft, lineHeight: 1.6 }}>
                    Both boards share one list price. Change the partner discount on the rate band and every number here
                    moves. Watch revenue as the discount improves, because the method is cost-anchored and passes a
                    better wholesale price to the customer as a lower list price.
                  </div>
                </div>
              </Panel>
            </>
          )}
        </main>
      </div>

      <footer className="px-6 py-4" style={{ borderTop: `1px solid ${C.rule}`, background: "#EAEEF4" }}>
        <div style={{ fontFamily: SANS, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
          Every figure is computed by the engine in <code>src/engine/</code>, which carries the same formulas as
          Serverless_Inference_Pricing_Model.xlsx and is checked against it by the parity test. Position scores are
          class-level launch placeholders. Traffic shares are assumptions pending tech preview telemetry. Planning
          estimates, not approved prices.
        </div>
      </footer>
    </div>
  );
}
