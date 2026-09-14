# Tests

A Playwright regression suite that drives the built HTTP application in isolated browser contexts, plus Node tests for booking rules and the disk server. Browser-only sandbox storage is separate from the working disk cache; disk tests use temporary directories.

Run meaningful targeted checks during development and the full verification before delivery. Build first when invoking the browser runner directly.

```bash
pnpm install --frozen-lockfile
pnpm test            # build + domain/server tests + all browser specs
node tests/run-all.js 03-charges     # one spec by filename substring
```

## What is covered

| Spec | Covers |
|---|---|
| `01-boot.spec.js` | Clean boot, all ten tabs build, embedded logo, local-time defaults, an empty register, lying list and security portal on a first open and after Erase All Data |
| `02-advice-form.spec.js` | Field defaults, HAWB qty, print action, modal close, the advice's Staff choice, no invented origin or destination, Ctrl+S |
| `03-charges.spec.js` | **The tariff.** Auto-applied fees, minimums, cargo class for every SHC code on both advices (and several or unknown codes), storage days, free-hour rules, DG, late acceptance, optional charges, zero-line suppression |
| `04-payments.spec.js` | Payment-mode fields, blank amount = full total, an amount that differs needs a reason (register vs printed advice), Cash + Card split |
| `05-register-cash.spec.js` | Register listing, filters, `type` tagging, cash on hand, handover (and its dialog kept open on an invalid amount), delete, Excel export, sample data times |
| `06-lying-list.spec.js` | Export auto-join, import exclusion, manual add, departure sweep, delete-and-re-add, a removed auto-added export stays removed |
| `07-security.spec.js` | Invoiced detection, missing-invoice alert, id-based delete under filter, block paste, AWBs matched by digits, current status when opened, newest first |
| `08-dashboard-handover.spec.js` | Dashboard KPIs and filters, shift window figures, equipment table |
| `09-migrations.spec.js` | All three legacy-data backfills, seeded with the old shapes |
| `10-awb-first.spec.js` | Shipment Database paste and CSV import, column matching, date-order detection and override, AWB suggestions (prefix and tail matching, click, keyboard, closing), gross weight headings and weightless sheets, the AWB lookup and its guards (prefix, changed AWB, wrong direction blocked from saving), sample shipments on a browser's first open, manifest SHC codes that are unknown or combined, billing party autofill and validation, the saved record, the printed advice's content, company colours and bank details for payment (shipped, site-entered and earlier-format details), and the live animals charge name, mandatory dates and times |
| `11-customer-database.spec.js` | The Customer Database tab: position, the capped list and search; every customer has a TRN and an address; both pickers list exactly the database, never names held in the browser's saved data |
| `12-uae-dates.spec.js` | Day-first dates: typing and showing dd/mm/yyyy, unreadable dates, every date field and dialog, the printout, register and exports, the calendar picker |
| `13-workspace.spec.js` | Navigation/history, search-to-advice, accessible dismissal, mobile containment |
| `14-domain-integrity.spec.js` | Input validation, write failure rollback, staged import validation, retained older manifests and same-AWB source refresh |
| `15-workspace-storage.spec.js` | Full restore, migrations, malformed data, disk failure, conflict rollback, identity binding, sandbox isolation, lost acknowledgements and unchanged reloads |
| `16-security-boundaries.spec.js` | Direction-aware matching, selection, restore validation, failed security saves, escaped output and CSV protection |
| `17-bookings.spec.js` | Internal booking creation, explicit samples, shared capacity, rescheduling/cancellation, arrival/late-policy snapshot/waiver, no-show, failed-save drafts, mobile form reopening and persistence |
| `bookings.test.js` | Pure commands, Dubai time, cargo/date validation, immutable direction, overlapping AWBs, lifecycle, no-show, frozen policy and shared workload calculations |
| `server.test.js` | Atomic persistence/restart, failed writes, concurrent revision checks, backup retention, origin/host/body guards and static-serving isolation |

Many cases record previously reported bugs or defects found during this audit.
Preserve that behavioral coverage when changing the implementation.

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

`.github/workflows/ci.yml` runs verification on pull requests and pushes to
`main`, `audit/**` and `codex/**`. Whether a failed check blocks merging depends
on the repository's branch protection settings.

The harness owns each test browser through Playwright's `launchServer`. It closes
contexts and the connection, then allows five seconds for shutdown. If Windows
Chrome stalls, it terminates only that fixture's child process and reports the
fallback. If Playwright's cleanup notification also stalls, the contexts and
connection must already be closed, the owned PID must no longer exist, and its
server endpoint must refuse connections. This verifies process/socket isolation,
not temporary-profile deletion. Unconfirmed isolation fails the case. A filter
that matches no spec also fails rather than reporting zero tests as a pass.
