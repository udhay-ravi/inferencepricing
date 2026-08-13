# Serverless Inference Price and Return Board

An interactive board for the Akamai Serverless Inference pricing model. Move the partner
discount, the target unit margin, the overhead, the ramp and the customer assumptions, and
watch the list price and the return move with them.

This is the same set of formulas as `Serverless_Inference_Pricing_Model.xlsx`. The workbook
is the record of decision. This repo is how you interrogate it without editing cells, and a
[parity test](test/parity.test.mjs) fails the build if the two ever drift apart.

**Live board:** enable GitHub Pages on this repo (Settings, Pages, Source: GitHub Actions)
and it publishes on every push to `main`.

---

## The one-minute version

Cost sets the floor, partner retail sets the ceiling, and the list price sits inside that band.

```
partner cost  = partner retail x (1 - discount won)
floor price   = partner cost / (1 - target margin)
ceiling price = partner retail
list price    = floor + position score x (ceiling - floor)
```

When the target margin rises above the partner discount, the floor crosses the ceiling and no
price exists at all. That is the constraint the board is built to make visible. Drag the two
top sliders past each other and watch the band invert.

At the current assumptions the catalog lists at a traffic-blended **$0.5818 per 1M tokens**
against a wholesale cost of **$0.3566**, a **38.7% gross margin**.

## The discount question

The partner discount is the only input a negotiation can change, and it governs everything
downstream. Four positions matter.

| Position | Discount | Portfolio GM | What breaks below it |
|---|---|---|---|
| Target | 50% | 42.1% | Nothing. Full headroom on the commit ladder. |
| Accept | 40% | 35.6% | Margin falls under 35%, commit headroom under 3 points. |
| Absolute floor | 35% | 32.7% | The deepest commit tier falls through the 15% commit margin floor. |
| Walk away | 30% | 30.0% | No price band exists. Nothing can be listed. |

A point of discount is worth about **0.69 points** of portfolio gross margin and **$5,790** of
launch-year gross profit, and it costs **$11,666** of launch-year revenue. Gross profit rises
while the top line falls, because the method is anchored to cost and passes a better wholesale
price to the customer as a lower list price. See [`docs/METHOD.md`](docs/METHOD.md) for why
that is a decision rather than a bug.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parity against the workbook, 19 assertions
npm run build    # production bundle into dist/
```

Node 18 or newer. No other setup.

## Changing an assumption

Every assumption lives in one file: [`src/engine/inputs.js`](src/engine/inputs.js). Each entry
carries the workbook cell it mirrors, so `marginFloor` is annotated `Inputs!B6` and so on.
Change it there, run `npm test`, and the parity test tells you whether you have moved the model
or broken it.

Partner rates live in [`src/engine/catalog.js`](src/engine/catalog.js), 26 model families with
per-component retail. When the partner republishes, overwrite that file. Everything else
re-derives.

## Layout

```
src/engine/
  catalog.js       26 model families, partner retail per component
  inputs.js        every assumption, annotated with its workbook cell
  pricing.js       Rate_Card, PAYG_Model, Commit_Monthly, Commit_Annual, Plan_Economics
  forecast.js      Forecast_12M, Forecast_3Y, and the bottom-up return model
  sensitivity.js   the Sensitivity tab, including the four negotiation positions
src/App.jsx        the board itself. Reads the engine, owns no formulas.
test/parity.test.mjs   asserts the engine reproduces the workbook
docs/METHOD.md     the derivation, the guards, and the open questions
```

The split matters. `App.jsx` contains no pricing arithmetic. If a number on screen looks wrong,
it is wrong in the engine, and the engine is 5 short files with the workbook cells named
throughout.

## Where the two boards differ from the workbook

Three things exist here that the workbook does not carry, all of them on the Return board.

Volume is built bottom-up from customers times tokens per customer, with separate growth rates
for new logos and for existing accounts consuming more, because those are different sales
problems and leadership tends to have a view on each. The workbook seeds volume as a single
number.

A one-time launch investment is carried, so the board reports payback month, return on
investment and peak funding need. Peak funding is usually the number that matters more than the
launch investment on its own.

The overhead-loaded margin basis lets the target margin be set on fully loaded cost rather than
wholesale cost alone, which turns the target into a contribution margin. Watch what happens at
low allocation volume: overhead swamps the wholesale cost and the band collapses even at a
generous partner discount.

Everything else matches the workbook to the tolerances in the parity test.

## What is still an assumption

Named honestly, because these move the answer more than any slider.

The negotiated discount is not a signed term. Position scores are class-level placeholders
standing in for a per-model derivation. Traffic shares are assumptions awaiting a full billing
period of tech preview telemetry. Tier 1 spans more than 4x internally while carrying 55% of
assumed traffic, so its class average is an internal planning figure and not a number to quote
externally.

## Status

Planning estimates, not approved prices. The approved artifacts are the Pricing Model document
and the Inference Billing Requirements document.
