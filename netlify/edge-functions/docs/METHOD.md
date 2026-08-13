# Method

How a published price is produced, what stops it going wrong, and the questions
that are still open. This mirrors sections 4, 5 and 6 of the Pricing Model document.

## Why a mechanical method

Akamai resells a partner's inference engine over open-weight models. Three constraints
apply at once.

The catalog is public. Both the partner and the provider undercutting them publish
per-token rates for the same weights, so any customer can verify Akamai's price in
under a minute.

The cost is contractual, not operational. Akamai pays per token at a negotiated
discount off partner retail. Cost does not fall with utilization, scale or engineering
effort during the partner phase. The only lever on cost is the term sheet.

The price must survive a margin review per model, not only in the blend, because a
portfolio average can hide a model priced below the floor.

Pricing by judgment does not survive a catalog that changes monthly. Pricing at a fixed
multiple of cost cannot see the ceiling. So the derivation is mechanical.

## The four steps

Run per component. Input, cached input and output each carry their own floor,
ceiling and list.

| Step | Formula | Purpose |
|---|---|---|
| Partner cost | `retail x (1 - discount)` | What Akamai pays per token. |
| Floor | `cost / (1 - margin floor)` | Lowest price satisfying the margin policy. At a 30% floor this is a 1.4286x markup. |
| Ceiling | `retail` | The arbitrage limit. Above it the customer buys the same weights directly. |
| List | `floor + position x (ceiling - floor)` | Where inside the band the model lists. |

Components are combined for comparison using the workload mix:

```
blended = 0.60 x input + 0.20 x cached + 0.20 x output
```

## Position score

Runs 0 to 1 and decides where inside the band a model sits. It is scored from four
stored inputs rather than chosen: host count, days since release, price spread across
hosts, and delivered quality against the class median.

At launch the score is applied at class level as a placeholder while the per-model
inputs are collected. This is the largest single accuracy improvement available to the
model, and it is worth up to 1.4 points of portfolio margin.

## The three guards

Run on every rate card build. A model failing any of them does not publish.

**Band existence.** The discount won must exceed the margin floor. This is the guard
that can actually fire, and it is the reason the negotiated discount has a hard floor
rather than a soft target. At a 30% margin floor, a 25% discount means the floor price
rises above the ceiling and not one model in the catalog can be listed at any price.

**Margin floor.** No model publishes below 30% gross margin at list. Guaranteed by
construction, since list is never below floor.

**Arbitrage ceiling.** No model publishes above partner retail. Guaranteed by
construction, since list is never above ceiling.

## The plan multipliers

Three plans, one wholesale cost. The partner is paid per token whatever the customer
contract says, so the plan choice moves revenue only.

```
multiplier = (inside share x (1 - discount) + overage share) x (1 + shortfall uplift)
```

Pay as you go is 1.000 by construction. The monthly commit term also lands on 1.000
once overage and forfeited minimums are counted, which is the finding that makes it
nearly free to offer and the reason it should be the default commercial motion. Only
the annual term trades real margin, at 0.898, giving up 7.0 points in exchange for
contracted revenue and a rate lock.

## The commit ladder floor

The maximum permissible commit discount is set where gross margin on the worst single
model reaches the commit floor.

At the current assumption the worst model lists at 36.9% gross margin, falls to 21.1%
at the deepest 20% commit discount, and clears the 15% floor with 6.1 points of
headroom. That headroom is the room available to sign a negotiated custom card without
an exception.

This is why the practical accept-floor on the term sheet is 40% rather than 35%. At a
35% wholesale discount the deepest commit tier lands at 15.1% against a 15% floor,
which prices but leaves nothing for a negotiation.

## An open decision

Because the floor is anchored to cost, improving the wholesale price lowers the list
price at the same time as it raises the margin. A 5 point improvement moves the
portfolio card rate from $0.5818 to $0.5596 and moves gross margin from 38.7% to 42.1%.
Gross profit rises by $28,951 across the launch year while revenue falls by $58,329.

This is correct behavior for a cost-anchored method. It is also a commercial choice
nobody has made explicitly. If the intent is that a better term sheet should accrue to
Akamai rather than be passed to the customer, then either the position score has to
rise as the discount improves, or the ceiling has to become the anchor instead of the
floor. Either is a change to this method, and it should be decided before the term
sheet is signed rather than after the first rate card refresh reprices the catalog
downward.

The board lets you see the effect directly. Switch "How list is set" between
"Position in band" and "At the floor" and compare.

## Open items

Tier 1 spans more than 4x internally while carrying 55% of assumed traffic. The blended
rate is an internal planning figure until the class is split.

One provider wins 24 of 26 families and every contested one. The dual-provider position
was adopted to create sourcing choice and is not currently delivering any.

Traffic shares are assumptions. Every portfolio figure depends on four assumed numbers,
and one full billing period of tech preview telemetry resolves them.
