# FinFolio

FinFolio is a private, local financial portfolio and planning dashboard. It runs on localhost and does not require an account, database, or cloud sync.

## Start the app

From this folder:

```powershell
npm.cmd start
```

Then open [http://127.0.0.1:5173](http://127.0.0.1:5173).

If PowerShell allows npm scripts in your environment, `npm start` works too. `npm.cmd` avoids Windows PowerShell execution-policy restrictions.

## How autosave works

FinFolio stores one JSON document under the browser key `finfolio-state-v1` using `localStorage`. Inputs are saved after a short 300 ms debounce, and the header shows the last local-save time. Data is not sent to a FinFolio server. The browser origin matters: `http://127.0.0.1:5173` and `http://localhost:5173` have separate browser storage, as does `file:///...`.

Use **Settings -> Export JSON backup** to create a portable backup. Import validates the file shape before replacing the current local state. Reset requires confirmation.

## What is included

- Overview of savings, investments, total value, accounts/rates, retirement goal, and progress.
- Editable portfolio holdings for brokerage, asset class, ticker, quantity, market value, cost basis, and allocation.
- Potential growth calculator for lump sum plus monthly DCA, with nominal value, today's dollars, contributions, growth, and an SVG projection chart.
- FIRE planner using annual spending divided by withdrawal rate; the default 4% rate is shown as the 25x planning rule, not a guarantee.
- Dark mode first, with a light presentation theme.
- Official Singapore CPI refresh through the local `/api/cpi` proxy. If SingStat cannot be reached, the app remains usable and labels the reference as unavailable or saved fallback.

## Formula notes

- Monthly return: `(1 + annual return)^(1/12) - 1`.
- Lump sum: `initial * (1 + monthly return)^months`.
- Monthly DCA: `monthly contribution * (((1 + monthly return)^months - 1) / monthly return)`.
- FIRE target: `annual spending / withdrawal rate`.

## Verification

```powershell
node --check server.js
node --check calculations.js
node --check app.js
npm.cmd test
```

The CPI reference is sourced from the [Singapore Department of Statistics CPI table M213752](https://tablebuilder.singstat.gov.sg/table/TS/M213752) through the [SingStat developer API](https://tablebuilder.singstat.gov.sg/view-api/for-developers). FIRE methodology references include [Bengen's withdrawal-rate paper](https://www.ifologiapop.com/wp-content/uploads/2020/09/Determining-withdrawal-rates-using-historical-data-Bengen-1994.pdf) and the [Trinity study](https://everywhereonce.com/wp-content/uploads/2011/10/trinity-study1.pdf).

This is an educational planning aid, not financial advice. Actual returns, inflation, taxes, CPF rules, healthcare costs, and withdrawal outcomes can differ materially from the assumptions shown.
