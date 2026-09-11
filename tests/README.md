# Tests

A Playwright regression suite that drives a real headless Chromium against the
actual application file and asserts on behaviour, not on source text.

This is the only safety net this project has. There is no type system and no
framework. **Run it before and after every change.**

```bash
npm install          # one-time
npm test             # everything, ~120s, exits non-zero on failure
node tests/run-all.js 03-charges     # one spec by filename substring
```

## What is covered

| Spec | Covers |
|---|---|
| `01-boot.spec.js` | Clean boot, all ten tabs build, embedded logo, local-time defaults |
| `02-advice-form.spec.js` | Field defaults, HAWB qty, print action, modal close |
| `03-charges.spec.js` | **The tariff.** Auto-applied fees, minimums, cargo class for every SHC code on both advices (and several or unknown codes), storage days, free-hour rules, DG, late acceptance, optional charges, zero-line suppression |
| `04-payments.spec.js` | Payment-mode fields, blank amount = full total, an amount that differs needs a reason (register vs printed advice), Cash + Card split |
| `05-register-cash.spec.js` | Register listing, filters, `type` tagging, cash on hand, handover, delete |
| `06-lying-list.spec.js` | Export auto-join, import exclusion, manual add, departure sweep, delete-and-re-add |
| `07-security.spec.js` | Invoiced detection, missing-invoice alert, id-based delete under filter, block paste |
| `08-dashboard-handover.spec.js` | Dashboard KPIs and filters, shift window figures, equipment table |
| `09-migrations.spec.js` | All three legacy-data backfills, seeded with the old shapes |
| `10-awb-first.spec.js` | Shipment Database paste and CSV import, column matching, date-order detection and override, AWB suggestions (prefix and tail matching, click, keyboard, closing), gross weight headings and weightless sheets, the AWB lookup and its guards (prefix, changed AWB, wrong direction blocked from saving), sample shipments on a browser's first open, manifest SHC codes that are unknown or combined, billing party autofill and validation, the saved record, the printed advice's content and company colours, and the live animals charge name, mandatory dates and times |
| `11-customer-database.spec.js` | The Customer Database tab: position, the capped list and search; every customer has a TRN and an address; both pickers list exactly the database, never names held in the browser's saved data |
| `12-uae-dates.spec.js` | Day-first dates: typing and showing dd/mm/yyyy, unreadable dates, every date field and dialog, the printout, register and exports, the calendar picker |

Many cases are labelled as regressions. Each one corresponds to a bug that reached
production. Do not delete them.

## Writing a spec

A spec exports a name and a map of cases. Each case opens and closes its own app
instance, so cases are fully isolated and start with empty `localStorage`.

```js
module.exports = {
  name: "My area",
  tests: {
    "does the thing": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { wt: 500, shc: "PER" });
        h.eqMoney((await h.chargeRow(app.page, "ex_handling_per")).charge, 120);
        app.assertNoErrors();
      } finally { await app.close(); }
    },
  },
};
```

Helpers in `harness.js`: `openApp({timezoneId, seed})`, `tab`, `fillAdvice`,
`chargeRow`, `payMode`, `saveAdvice`, `db`, `lyingList`, `modalClick`, `localDT`,
and assertions `assert`, `eq`, `eqMoney`, `contains`, `notContains`.

## Conventions

- **Always `try/finally` with `app.close()`**, or a failing case leaks a browser.
- **Call `app.assertNoErrors()`** on anything that exercises a full flow. Several
  past bugs threw nothing and simply did nothing.
- **Use `eqMoney`** for amounts. It compares to 2dp and tolerates `"84.00"` vs `84`.
- **Pin the timezone** for anything touching acceptance or departure times. The app
  writes local, not UTC, datetimes. The harness defaults to `Asia/Dubai`.
- **Assert behaviour, not markup.** Check the computed charge, not the HTML string.
- **A new fix needs a case that fails without it.** That is what stops it regressing.

## CI

`.github/workflows/ci.yml` runs the suite on every push and pull request. A red
suite blocks the merge.
