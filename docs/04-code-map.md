# Code Map

Navigation aid for `app/solitair-invoicing.html` (5,715 lines).

> Line numbers verified against the file on 11 September 2026.

**Use this instead of reading the file.** Find your region here, then read only
that range:

```bash
sed -n '3469,3598p' app/solitair-invoicing.html   # collectAdvice()
grep -n "^function renderRegister" app/solitair-invoicing.html
```

> Line numbers drift as the file is edited. If a range looks wrong, re-locate with
> `grep -n "^function <name>"` and please update this table in the same PR.

---

## Do not read these regions

| Lines | What | Why |
|---|---|---|
| 309 - 2200 | `CUSTOMERS` master (1,892 demo records) | 33% of the file, pure data, will consume your context for nothing |
| 4307 | `LOGO_LIGHT` | One single line of 55,954 characters (base64 PNG) |

Avoiding the master is about context budget, not secrecy - it holds demo data
(see `08-data-protection.md`). Query it rather than reading it:

```bash
grep -c '{"no":' app/solitair-invoicing.html               # record count
node -e "console.log(require('./fixtures/customers.demo.json')[12])"
```

`fixtures/customers.demo.json` holds the same records as readable JSON and is
what the test harness resolves `h.SAMPLE_CUSTOMER` from.

---

## Region map

| Lines | Region | Contents |
|---:|---|---|
| 1 - 195 | Head + CSS | All styling, including `@media print`. The AWB status line, billing party band and scrolling data tables (`.awbstatus`, `.billband`, `.billgrid`, `.scrolltable`) sit with the form fields. No responsive breakpoints (A-10); the header's tab padding and gaps tighten on narrower screens. |
| 196 - 239 | Body markup | Header, brand logo, the ten tab buttons (Shipment Database and Customer Database first), ten empty `.page` divs, `#modal`, `#toast`, `#printarea` |
| 240 | `<script>` opens | Everything below is one inline script |
| 248 - 303 | `APP_VERSION` + `CFG` | Version string, company details, **bank block (placeholders only)**, staff, pay modes, SHC code table, free-storage hours, VAT rate |
| 304 - 2200 | `CUSTOMERS` | Demo customer master. **Do not read** - use `fixtures/customers.demo.json`. |
| 2202 - 2312 | Customer helpers | `seedCustomers`, `refreshCustList`, `resolveCustomer`, the Customer Database tab (`buildCustomers`), and the billing party picker: `fillBilling`, `wireBillingParty` |
| 2313 - 2355 | Core utilities | `$`, `$$`, `esc`, `num`, `pad`, `ymd`, `nowLocalDT`, `money`, `fmtD`, `fmtDT`, `toast`, `stamp`, `refFor`, `previewRef`, `shcLabel`, `shcClass`, `calcStorageDays` |
| 2356 - 2395 | Form + storage helpers | `fld`, `sel`, `save`, `load` (**contains all three migrations**) |
| 2396 - 2423 | Modal + cash | `modal`, `closeModal`, `refreshChip`, `cashOnHand` |
| 2424 - 2984 | **Shipment Database** | The `SH` store (`shLoad`, `shSave`), `awbKey`, `shFind`, `shDirection`, `shMasterName`; reading a manifest (`parseDelimited`, `SH_COLUMNS`, `shMapHeader`, `shDateParts`, `shDateValue`, `shDateOrder`, `shParseManifest`); `shImport`, `shDemoItems`; the AWB field on the advices (`wireAwbLookup`); the tab (`buildShipments`) |
| 2989 - 3433 | **`buildAdvice(mode)`** | The largest function. Builds both advice forms - AWB first, shipment details, billing party - fills both pickers, wires every listener, contains the `applyAutoQty()` auto-charge engine |
| 3434 - 3468 | Line maths | `recalcLine` (per-row charge), `recalcAll` (tab total) |
| 3469 - 3598 | **`collectAdvice(mode)`** | Turns the form into the saved invoice record |
| 3599 - 3651 | `adviceMissing`, `saveAdvice(mode)` | The required-field check shared by preview, print and save; validation, ref allocation, push to `DB.entries`, downstream refresh |
| 3652 - 3853 | Invoice register | `buildRegister`, `filteredEntries`, `renderRegister`, `handoverDialog`, `openingDialog` |
| 3854 - 3993 | Dashboard | `buildDash`, `dashRange`, `renderDash`, `kpi`, `pctOf`, `bars` |
| 3994 - 4099 | Printable advice | `billingOf`, `docCopy` (the invoice layout), `row2`, `printAdvice`. Prints the CGS-GND-F037/F038 form codes in the footer. |
| 4100 - 4289 | Exports | `regRows`, a dependency-free XLSX writer (`crc32`, `zipBuild`, `sheetXml`, `buildXlsx`), `exportExcel`, `exportCsv` |
| 4290 - 4308 | State + logo | `DB` initial shape (including `company` / `bank` site config), `LOGO_LIGHT` (**line 4307, do not read**), `LOGO_PRINT` |
| 4312 - 4400 | **Rate tables** | `EXPORT_LINES`, `EXPORT_OPTIONAL`, `IMPORT_LINES`, `IMPORT_OPTIONAL`. See `03-business-rules.md` |
| 4401 - 4604 | Rates & Data tab | `buildAdmin`, `rateTable`, `applyRateOverrides`, **Company & Bank Details card**, logo upload, staff list, backup/restore |
| 4605 - 4662 | Sample data | `seedDemo` (its customers are drawn from `CUSTOMERS`) |
| 4663 - 5123 | Shift handover | `EQUIP_DEFAULT`, `SHIFTS`, `buildHandover`, held-shipment panels, equipment table, `syncShiftWindow`, `handoverFigures` (the calculation), `renderHandover`, `handoverData`, `saveHandover`, `renderSavedReports`, `printHandover`, lying-list band |
| 5124 - 5294 | Lying list | `LL` state, `llLoad`/`llSave`, `buildLying`, `llCommit`, `llSyncFromRegister`, `llSweep`, `llCountdown`, `renderLying` |
| 5295 - 5607 | Facility security | `buildSecurity`, `secAdd`, `addOneAwb`, `loadSample`, backup/restore, `secFind`, `renderSecurity`, `findInvoiceByAWB`, `scanMissing`, `ackSelected`, `addBlock`, `confirmLookup` |
| 5608 - 5715 | Boot | `fillStaff`, `applyLogo`, `applySiteOverrides`, `boot()` (loads shipments and builds the Shipment Database and Customer Database tabs before the advices), tab wiring, the 30s lying-list timer, Ctrl+S / Ctrl+P / Esc handlers (Ctrl+S is dead - audit A-06) |

---

## The functions that matter most

Changing any of these has wide blast radius. Read the whole function first.

| Function | Line | Why it matters |
|---|---:|---|
| `buildAdvice(mode)` | 2989 | Builds **both** advice forms from one code path (`isExp` flag). A change to Export is automatically a change to Import. |
| `applyAutoQty()` | inside `buildAdvice` (3266) | The auto-charge engine. Decides which tariff lines get a quantity from weight, SHC, HAWB qty and the two timestamps. |
| `wireAwbLookup(mode, recalc)` | 2755 | The AWB-first lookup. Fills a shipment into the form and re-runs the auto-charge engine; owns the guards against filling on a prefix, leaving details under a changed AWB, and filling across export and import. |
| `shDateOrder(parts)` | 2609 | Decides whether an import's dates are day-first or month-first. **Every storage charge on a filled advice depends on it.** |
| `shParseManifest(text, order)` | 2633 | Reads pasted or uploaded manifest text: delimiter, heading match, dates, per-row notes. |
| `recalcLine(tr)` | 3434 | The charge formula: `qty > 0 ? max(rate*qty, min) : 0`, then VAT. |
| `collectAdvice(mode)` | 3469 | **Reimplements the same charge formula** to build the saved record. If you change `recalcLine`, you must change this too, or the screen and the invoice will disagree. This has caused a production bug before. |
| `billingOf(e)` | 4001 | The billing party of any record, legacy ones included. What the printed advice shows. |
| `renderRegister()` | 3726 | The ledger and the running cash balance. |
| `cashOnHand()` | 2413 | Opening float + cash collected − cash handed over. Feeds the header chip, the dashboard and the handover validation. |
| `handoverFigures()` | 4812 | Independently recomputes shift cash. Does **not** call `cashOnHand()`. |
| `llSyncFromRegister()` | 5211 | Auto-joins export invoices to the lying list. Dedupes by AWB across live **and** cleared. |
| `findInvoiceByAWB(awb)` | 5513 | The invoiced / not-invoiced check behind Facility Security. |
| `load()` | 2361 | Contains all three legacy backfills. Any new persisted field needs one here. |
| `applySiteOverrides()` | 5641 | Applies the per-machine company and bank details from `DB` over `CFG`. The reason no bank details are in the source. |
| `previewRef(mode)` | 2340 | The reference the next saved invoice would get. The single place to fix A-02. |

---

## Naming conventions

- Export form element IDs are prefixed `a_`, Import form IDs `i_`
  (`a_mawb` / `i_mawb`, `a_total` / `i_total`).
- On the advice forms, `<p>_cust` is the AWB owner, whose picker lists
  `<p>_custlist` (the customer master plus owners typed by hand). `<p>_bill`,
  `<p>_bill_trn` and `<p>_bill_addr` are the billing party, whose picker lists
  `<p>_billlist` (exactly the Customer Database). The AWB status line is
  `<p>_awbstatus`.
- Shipment Database tab element IDs are prefixed `sh_` (`sh_paste`, `sh_preview`,
  `sh_order`, `sh_import`, `sh_filter`, `sh_loaded`); Customer Database tab IDs
  are prefixed `cu_` (`cu_filter`, `cu_count`, `cu_list`).
- Charge rows carry `data-lid="<line id>"`; cells carry `data-f="rate|qty|min|charge|total|vat"`.
- Optional tariff lines added from the picker also carry `data-catid="<catalogue id>"`, used for deduping.
- Lying-list entries auto-created from an invoice use the id `"LLA" + invoiceId`. That link is what lets invoice deletion clean them up.
