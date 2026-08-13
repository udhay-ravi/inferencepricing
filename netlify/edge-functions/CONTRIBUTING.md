# Changing the model

The workbook `Serverless_Inference_Pricing_Model.xlsx` is the record of decision.
This repo has to agree with it. The parity test enforces that, and CI runs it on
every push and pull request.

## Changing an assumption

1. Edit the value in `src/engine/inputs.js`. Each entry names the workbook cell it
   mirrors.
2. Make the same change in the workbook.
3. Update the expected value in `test/parity.test.mjs` if the change moves a number
   the test asserts.
4. Run `npm test`.

If you change one and not the other, the test fails. That is the whole point.

## Refreshing the partner catalog

Overwrite the retail values in `src/engine/catalog.js` with the published partner
rates. Everything else re-derives. Then rebuild the workbook's `Rate_Card` columns
E to G from the same source and rerun the test.

## Adding a formula

It goes in `src/engine/`, never in `src/App.jsx`. The board reads the engine and owns
no arithmetic, so that a number on screen can always be traced to one function with a
workbook cell named in its comment.

Any new formula that exists in the workbook needs an assertion in the parity test
before it ships.

## Reviewing a change

The question to ask is not whether the code is correct. It is whether the code and the
workbook still say the same thing, and whether the parity test would have caught it if
they did not.
