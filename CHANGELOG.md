# Changelog

All notable changes to the SolitAir charge advice and invoicing system.
Newest first.

## [2.1.0] — 2026-09-14 — Internal warehouse booking desk

- Added export delivery and import collection appointments under existing master AWBs, with Dubai arrival windows, cargo/SHC, staff demand, coordination and optional flight/vehicle/dock details.
- Added shared daily capacity warnings, searchable booking records, recorded arrivals, rescheduling, completion, cancellation and explicit no-shows.
- Captured an optional company late policy per booking. Charges remain disabled initially; configured amounts become review proposals after actual arrival and never post to invoices or revenue. Waivers retain reasons and original assessments.
- Added pure booking commands, shared client/server validation, attributed history, backup migration and disk recovery coverage.
- Added bounded retries for temporary filesystem denials during atomic snapshot replacement, with preservation checks for persistent failures.
- Pending recovery and disk retries remain visibly unsaved until the server acknowledges the write.
- Documented dnata's public appointment model and unverified commercial terms. Added a separate ULD reconciliation exploration and proposed document-pack pilot; no email ingestion is implemented.

This is an internal local prototype. Customers do not submit bookings through a public portal, and no ERP or authority-system integration is activated.

## [2.0.0] — 2026-09-14 — Cargo workspace revamp

- Replaced the single HTML source with ES modules, separate styles/data, an esbuild bundle and a Windows build-and-open launcher.
- Added grouped navigation, overview, search, connected AWB drawers, browser history and responsive layouts.
- Added a loopback server with atomic disk snapshots, revision conflicts, exclusive workspace ownership and retained previous revisions.
- Unified invoice/settings, shipment and warehouse backups; validated restore and immediate legacy migrations; separate sandbox/recovery caches bound to workspace identity.
- Fixed invalid shipment/financial input handling, failed-save acknowledgement, manifest numeric/date errors and stale advice values after reimport.
- Added direction-aware security reconciliation, actual row selection, safer restored-content rendering and CSV formula protection.
- Added architecture/domain/product audits, a system knowledge map and a prioritized roadmap. Existing tariff values are unchanged.

The source remains a local prototype. Shared runtime/domain extraction, immutable financial history, formal acceptance, ULD inventory, authoritative customer/users and ERP integration are further work.

---

## [1.3.0] — 2026-09-11 — Bank details for payment, final bug sweep

Verified by the regression suite (106 cases).

### Added

- **Bank details for payment on every advice**, between the total charges and the
  SolitAir authorisation: the account name for both accounts, then the AED and USD
  accounts side by side (account number, IBAN, BIC / SWIFT, bank, branch) under
  AED ACCOUNT and USD ACCOUNT bars filled in company blue, which keep their fill
  when printed without background graphics. The file ships invented sample bank
  details; a counter machine enters its own under **Rates & Data → Company & Bank
  Details**, now as separate fields instead of free-text blocks. Details saved by
  earlier versions are still read. (D-16)
- Tests that a first open shows an empty Invoice Register, lying list and security
  portal, that the first invoice fills only the register and the lying list, and
  that Erase All Data leaves all three empty, including after reopening.

### Fixed

- **Export Register to Excel failed every time**: the function behind its Balances
  sheet did not exist. (A-29)
- **Erase All Data** now empties the lying list (A-28), and puts the shipped tariff,
  free hours, staff list and company and bank details back at once rather than at
  the next reload (A-36). Its warning names what is deleted.
- **Lying list:** removing an automatically added export keeps it off the list.
  (A-30)
- **Facility Security:** AWBs match their invoices whatever their dashes (A-31);
  the portal is current when opened and after an invoice is saved or deleted
  (A-32); the reception list shows the newest AWB first (A-38).
- **Advices:** the Staff chosen on the advice is the invoice's staff, and signing
  in on the header sets both advices (A-33); a blank origin or destination stays
  blank instead of becoming KHI or NBO (A-34); Ctrl+S saves the advice on screen
  (A-37).
- A dialog stays open when its action finds an error, such as a zero handover
  amount. (A-35)
- Sample data times are local, not four hours off. (A-39)

### Changed

- Bank details now print for every payment mode, not only Bank Transfer, Credit
  and CASS.

---

## [1.2.1] — 2026-09-11 — Sample shipments on first open

Verified by the regression suite (93 cases).

### Changed

- **The Shipment Database opens with the sample shipments.** The first time the
  application is opened in a browser, it loads the ten sample shipments, so an AWB
  typed on an advice fills in straight away instead of the tab being blank. This
  happens once per browser: shipments removed with **Clear Loaded Shipments** stay
  removed on the next open, and a pasted manifest is added alongside the samples.
  **Load Sample Shipments** still reloads them. (D-15)

---

## [1.2.0] — 2026-09-11 — Shipment Database, AWB-first advices, billing party

The advice tabs now start from the AWB. The day's manifest is pasted into a new
Shipment Database tab, and typing an AWB on an advice fills in that shipment. The
company invoiced is chosen separately from the company the AWB is booked under.

Verified by the regression suite (92 cases).

### Added

- **Shipment Database tab**, first in the tab bar. Paste the manifest from Excel,
  heading row included, or load a CSV. Columns are matched by heading, in any
  order. A preview lists every row with its departure or RCF time written out in
  words, the export/import split, and a note for anything that needs attention: an
  unknown SHC code, an owner not in the customer master, a missing gross weight,
  an unreadable time. A sheet with no gross weights at all is flagged up front,
  and weight is read from its usual headings (Gross Weight, Gross Wt, GW, Weight,
  KGS) but never from a chargeable or volume weight column. Also **Load Sample Shipments**, a searchable list of what is
  loaded, and **Clear Loaded Shipments**.
- **Customer Database tab**, second in the tab bar: the demo customer master the
  advices use for the AWB owner, the billing party and its TRN and address,
  searchable by name, TRN, city, country or email. Every demo customer now has a
  fake TRN and a full address, and both the AWB owner and billing party pickers
  list exactly these customers. Names held in a browser's saved data from earlier
  use are never offered.
- **Date order detection** for manifest dates. Any number above 12 settles
  day-first or month-first; when every date is ambiguous, the reading with the
  shorter span wins and the preview says it is not certain. The order can be set
  before importing. Excel serial dates and 12-hour times are read.
- **AWB-first advice forms.** The AWB is the first field. Typing it fills the AWB
  owner, origin, destination, flight number, SHC code, nature of goods, pieces,
  gross weight, and the departure time (export) or RCF time (import). Every field
  stays editable.
  - Suggests loaded shipments from the third digit typed - AWBs starting with the
    digits first, then those containing them - showing owner, route, flight and
    time. Click one, or use the arrow keys and Enter, to complete the AWB and fill
    it in.
  - Matches on digits, so hyphens and spaces do not matter, and never fills on a
    prefix while typing.
  - Changing the AWB to one that is not loaded clears the details filled in for the
    previous shipment.
  - An AWB for the other direction is **blocked**: it is not filled in, the
    advice cannot be previewed, printed or saved while it is on the form, the AWB
    field turns red, and the form offers to open it on the right tab.
- **Billing party** section at the bottom of the shipment details, picked from the
  same customer master, with its TRN and address beside it. **Same as AWB owner**
  copies the owner. The TRN and address are cleared if the name changes to one
  outside the master. Required to preview, print and save.
- Migration **M3**: invoices saved before the billing party existed are billed to
  their customer.
- `tests/specs/10-awb-first.spec.js` (28 cases), `tests/specs/11-customer-database.spec.js`
  (3 cases), and a migration case in `09-migrations.spec.js`.
- `.gitignore` and CI block `.csv`, `.tsv`, `.xlsx` and `.xls` files, because
  shipment manifests name customers and shipments.

### Changed

- The customer TRN and address fields at the top of the advice are gone. The only
  TRN and address on the form are the billing party's.
- "Customer Name" is now **AWB Owner** on the form.
- The printed advice names only the **Billing Party**, with its **TRN** and
  **Address**. The AWB owner is shown on the form but not printed.
- The saved record keeps `cust` as the AWB owner, so the Register, Dashboard, Shift
  Handover and exports are unchanged. New fields `billTo`, `billTrn` and
  `billAddr`; `acct` and `addr` now mirror the billing TRN and address, so a backup
  still prints correctly if restored into 1.1.0.
- `APP_VERSION` is 1.2.0.
- **The printed advice is white, in the company blue** `#1042FF` (RGB 16, 66,
  255) for the title, headings, labels, total and table lines. The dark filled
  bars are gone. Colour is carried by lines rather than fills, so it prints even
  with background graphics turned off. The shift handover report keeps its
  previous style.
- **Amounts and reasons on the Payment Breakdown, for every payment method.** Each
  mode shows its amount (blank means the full total) and a reason box. An amount
  that differs from the total, for example to settle an earlier overcharge, needs
  a reason before the advice saves. The printed advice always shows the full
  charges; the Invoice Register records the amount typed, with the reason in
  Remarks and in the Excel and CSV exports. Cash + Card can no longer be saved
  with both amounts blank.
- **A payment that does not add up is no longer saved silently.** It used to show
  a warning that the "Invoice saved" message replaced at once; it now needs its
  reason.
- The export charge "Aviation / Live Animals (AVI) Handling" is now **Live
  Animals (AVI) Handling**. Rate, minimum and VAT are unchanged.
- **Dates and times are mandatory** on both advices and marked with an asterisk:
  acceptance and departure on the Export Advice, RCF and delivery on the Import
  Advice. An advice cannot be previewed, printed or saved without them. A
  departure or RCF time missing from the manifest is left blank to be entered,
  rather than defaulting to the current time.
- **This is a prototype on demo customer data** (decision D-11). Customer TRNs and
  addresses exist only for the demo companies, so builds from 1.1.0 are not for
  counter rollout; the real customer master belongs in the ERP. Recorded as audit
  A-22, accepted.

### Fixed — final audit

- **Dates are day-first, the UAE way.** Every date is shown and typed as
  `dd/mm/yyyy`, and `dd/mm/yyyy hh:mm` for times: the advice time fields, the
  register and dashboard filters, the handover and lying list, the dialogs, the
  printed advice, the register and the Excel and CSV exports. The browser's own
  date inputs, which read month-first on a US-English browser, are replaced by
  day-first fields with a calendar button; a date that cannot be read turns the
  field red. Stored dates stay ISO and references stay `YYYY-MM-DD/NN`. (A-25, D-13)
- **Cargo class follows the tariff for every SHC code.** GEN and ELI are general;
  any perishable code is perishable; every other code is special, including one
  not in the list, which used to bill as general. A manifest with several codes on
  one shipment ("PER COL", "DGR ELI") keeps them on the form and bills by the same
  rule, and DGR among them raises the Dangerous Goods Inspection. (A-24, D-14)
- **Free-hour rules can be set to zero**, and the SHC reference under Rates & Data
  shows the hours in force instead of fixed text. (A-26)
- **The import storage readout counts from RCF**, not "acceptance". (A-27)

### Known, still open

- **A-23:** the import tariff's storage manual override line cannot be used, so an
  adjusted storage charge is never marked as one.

- **A-21** *new.* Restore from Backup does not run the data migrations until the
  next reload. Printing is covered by `billingOf()`.
- **A-06**, a confirmed live instance: the Ctrl+S save shortcut does nothing. The
  Save button works.

---

## [1.1.0] — 2026-09-10 — Site configuration, demo data tooling, code audit

Prepared the project for source control and for handover to an ERP
implementation team. Adds the tooling and governance that let the repository be
shared, and closes seven audit findings.

Verified by the 50-case regression suite and a pixel-level screenshot comparison
of all eight tabs before and after. Rendering is byte-identical.

### Added

- **Company & Bank Details** card in Rates & Data, with `applySiteOverrides()`
  applying `DB.company` / `DB.bank` over `CFG` at boot. The company tax number
  and bank account blocks are now site configuration entered once per counter
  machine, so they are not carried in the application file.
- `tools/generate-customers.py` — a seeded, self-contained generator producing
  1,892 fictional companies for the customer master. Emails use the RFC 2606
  reserved `.example` TLD; telephone numbers use the 555 convention.
- `tools/pii-scan.js` — repository guard, five structural rules, wired into CI.
  It carries no denylist and no hashes, so the guard holds nothing sensitive.
- `APP_VERSION`, shown under Rates & Data, so a counter machine can be checked
  against the released version (audit A-16).
- `h.SAMPLE_CUSTOMER` / `h.OTHER_CUSTOMER` in the test harness, resolved from
  the demo master, so specs never carry a customer name.
- `docs/08-data-protection.md` — data classification, demo-data policy, the
  automated controls, and the incident procedure.
- `docs/09-governance.md` — roles, change classes, release and rollback, quality
  gates, risk register, decision log.
- CI steps: the repository guard, and a check that the committed demo master
  still matches its generator.
- `npm run scan`, `npm run verify` and `npm run customers`.

### Changed

- **The form codes `CGS-GND-F037` / `CGS-GND-F038` no longer appear as badges on
  the Export and Import advice panel headings.** They remain on the printed
  advice footer, where they are required for document control.
- Counter staff default to `Counter 1` … `Counter 6`, replaced with real names
  during machine setup.
- Fixtures draw their customers from the demo master; air waybills use the
  reserved `780-3090xxxx` band.

### Fixed — audit findings

- **A-11** duplicate `stamp()` definition removed.
- **A-12** dead globals `REGF` and `llTimer` removed.
- **A-13** three `<h3>` elements were closed with `</h2>`.
- **A-14** `saveAdvice()` was called with a surplus second argument.
- **A-16** no version identifier in the application.
- **A-18** `dayKey()` was a no-op returning its argument, wrapping a reference
  expression duplicated at four call sites. Replaced by `refFor()` and
  `previewRef()` — which also gives the still-open A-02 a single place to be
  fixed.
- **A-19** `YYYY-MM-DD` was constructed inline in seven places besides `fmtD()`;
  consolidated into one `ymd()` helper. Six CSS rules were defined and never
  used (`.minhit`, `.btn.offbtn`, `.splitbox`, `.span4`, `.totrow`); removed.
  `.mono` was defined but unused while its declaration was inlined on six cells;
  the class is now applied. 57 call sites written `$ (x)` normalised to `$(x)`.

### Known, still open

- **A-20** *new, P1.* Chrome treats every local file as one origin, so every copy
  of the application opened in the same browser profile shares one data store.
  Replacing the file during an upgrade is therefore safe, but a second copy
  opened in the counter's browser writes into the live register. Documentation
  previously stated the opposite and has been corrected.
- **A-02** invoice references do not restart daily. Now isolated to `refFor()`
  and `previewRef()`.
- **A-15** *new.* 22 form controls carry inline styles that override the
  stylesheet rule already covering them. Not fixed here: removing them changes
  the visible padding and radius of every field, which deserves its own PR.

---

## [1.0.0] — 2026-09-09 — Handover baseline

First version under version control. Everything below was built, fixed and verified
in a browser before this baseline was cut.

### Added

- **HAWB data entry fee.** Optional HAWB Qty field on both advice forms, billing
  50.00 per HAWB (1 = 50.00, 2 = 100.00). Blank or zero bills nothing. Prints
  alongside the HAWB number on the advice.
- **Direct Print action** on both advice forms, printing all required copies without
  going through the preview modal.
- **Live storage readout** above the storage lines: elapsed hours since acceptance,
  the free period for the current cargo class, and the resulting chargeable days.
- **Tariff charge picker.** 11 export and 21 import optional charges, selectable
  when they apply, added on selection, deduplicated.
- **Late Acceptance of Cargo** (export), auto-applied when acceptance falls within
  five hours of departure, at 0.53/kg with a 68.00 minimum and 5% VAT.
- **Dangerous Goods Inspection**, auto-applied on SHC = DGR with a per-line
  "reject / not required" override.
- **Company logo embedded** in the file as a data URI, so it appears in the header
  and on every printed advice without configuration.
- **Regression suite**: 50 Playwright cases across nine specs, plus CI.
- **Documentation set**: architecture, data model, business rules, code map, audit
  findings, operations runbook, ERP handover specification.

### Fixed

- **Invoice Register displayed nothing at all.** `renderRegister()` looked up its
  table body with `$("#regtbl tbody")`; the `$` helper only does `getElementById`,
  so it returned `null` and the function exited before rendering. Same root cause
  fixed in the facility security table (twice), the handover equipment table, and
  the preview modal sizing.
- **Dashboard, lying list and facility security ignored every invoice.**
  `saveAdvice()` never set `type: "invoice"` on saved records, so every view that
  filters on `type` silently saw nothing. Added the tag plus a migration that
  backfills existing records.
- **Cash on Hand never moved.** `cashOnHand()` read `e.pm`, `e.cashAmt` and
  `e.cardAmt` — fields no invoice has ever had — so it always returned just the
  opening balance, and handovers to accounts were rejected as exceeding cash on
  hand. Rewritten to match the register: opening float + cash collected − cash
  handed over.
- **Facility security deleted the wrong record.** Rows were addressed by their index
  in a filtered and sorted copy of the list. Applying a direction filter, or having
  any acknowledged record present, shifted the indices. Records now carry stable ids,
  with a migration for existing ones.
- **Inapplicable charges were billed.** Every "each" line billed its minimum even at
  zero quantity. Corrected to `qty > 0 ? max(total, min) : 0`, and the same rule
  applied in `collectAdvice()`, which had its own unsynchronised copy of the formula
  and was still billing minimums on saved invoices after the on-screen fix.
- **Zero-charge lines appeared on invoices.** `collectAdvice()` now omits them
  entirely, so an advice shows only what is actually charged.
- **The invoice preview could not be closed.** Modal buttons without a callback got
  no click handler at all.
- **Totals did not update while editing.** Recalculation only ran on adding or
  removing a line.
- **Edits on the Import tab updated the Export total.** `recalcAll()` resolved its
  table by "whichever exists", which always found Export because both tabs are built
  at boot. It now takes an explicit prefix.
- **Deleting an invoice orphaned its lying-list entry**, and because the sync
  deduplicates by AWB, a corrected re-entry for the same AWB could never rejoin.
  Deletion now clears the linked entry from both the live list and the cleared
  history.
- **Customer autofill populated the account field with a phone number** instead of
  the TRN.
- **Payment mode was asked twice**, via a dropdown and the Payment Breakdown buttons.
- **Deselected payment buttons turned white on white**; the deselect loop reset the
  background but not the text colour.
- **Acceptance and departure times defaulted to UTC**, showing four hours behind
  Dubai local time.

### Changed

- **VAT is applied per line** from the rate sheet, not as a blanket 5%.
- **Member rates adopted** throughout, falling back to the standard rate where the
  member column is blank.
- **Cash mode no longer asks for an amount** — the invoice total is the amount. The
  cash field now appears only for Cash + Card, where the split must be entered.
- **Optional charges add on selection**; the separate "Add Selected Charge" button
  was removed.
- Origin defaults to DWC on export, destination defaults to DWC on import.
- Removed the redundant Flight Date field, the duplicate Cash/Card portion fields,
  and the hardcopy checkbox on the advice form (still toggled from the register).
- Header now reads "Imports/Exports" next to the logo.
- Advice form regrouped into a symmetric two-column layout.

### Removed

- Dead `wirePayMode()`, a never-called duplicate of the payment button wiring.
- A duplicate top-level `CFG` declaration that silently overwrote the first.

### Known issues

Open findings are catalogued in `docs/05-audit-findings.md`. The two that matter
most are **A-01** (no automatic backup) and **A-02** (invoice references do not
restart daily).
