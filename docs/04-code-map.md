# Code Map

Navigation aid for `app/solitair-invoicing.html` (5,836 lines).

> Line numbers verified against the file on 11 September 2026.

**Use this instead of reading the file.** Find your region here, then read only
that range:

```bash
sed -n '3583,3716p' app/solitair-invoicing.html   # collectAdvice()
grep -n "^function renderRegister" app/solitair-invoicing.html
```

> Line numbers drift as the file is edited. If a range looks wrong, re-locate with
> `grep -n "^function <name>"` and please update this table in the same PR.

---

## Do not read these regions

| Lines | What | Why |
|---|---|---|
| 317 - 2208 | `CUSTOMERS` master (1,892 demo records) | 32% of the file, pure data, will consume your context for nothing |
| 4428 | `LOGO_LIGHT` | One single line of 55,954 characters (base64 PNG) |

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
| 1 - 203 | Head + CSS | All styling, including `@media print`. The AWB status line, billing party band and scrolling data tables (`.awbstatus`, `.awbsuggest`, `.billband`, `.billgrid`, `.scrolltable`) sit with the form fields. No responsive breakpoints (A-10); the header's tab padding and gaps tighten on narrower screens. |
| 204 - 247 | Body markup | Header, brand logo, the ten tab buttons (Shipment Database and Customer Database first), ten empty `.page` divs, `#modal`, `#toast`, `#printarea` |
| 248 | `<script>` opens | Everything below is one inline script |
| 256 - 311 | `APP_VERSION` + `CFG` | Version string, company details, **bank block (placeholders only)**, staff, pay modes, SHC code table, free-storage hours, VAT rate |
| 312 - 2208 | `CUSTOMERS` | Demo customer master. **Do not read** - use `fixtures/customers.demo.json`. |
| 2210 - 2320 | Customer helpers | `seedCustomers`, `refreshCustList`, `resolveCustomer`, the Customer Database tab (`buildCustomers`), and the billing party picker: `fillBilling`, `wireBillingParty` |
| 2321 - 2363 | Core utilities | `$`, `$$`, `esc`, `num`, `pad`, `ymd`, `nowLocalDT`, `money`, `fmtD`, `fmtDT`, `toast`, `stamp`, `refFor`, `previewRef`, `shcLabel`, `shcClass`, `calcStorageDays` |
| 2364 - 2403 | Form + storage helpers | `fld`, `sel`, `save`, `load` (**contains all three migrations**) |
| 2404 - 2431 | Modal + cash | `modal`, `closeModal`, `refreshChip`, `cashOnHand` |
| 2432 - 3097 | **Shipment Database** | The `SH` store (`shLoad`, `shSave`), `awbKey`, `shFind`, `shDirection`, `shMasterName`; reading a manifest (`parseDelimited`, `SH_COLUMNS`, `shMapHeader`, `shDateParts`, `shDateValue`, `shDateOrder`, `shParseManifest`); `shImport`, `shDemoItems`; the AWB field on the advices (`wireAwbLookup`); the tab (`buildShipments`) |
| 3102 - 3547 | **`buildAdvice(mode)`** | The largest function. Builds both advice forms - AWB first, shipment details, billing party - fills both pickers, wires every listener, contains the `applyAutoQty()` auto-charge engine |
| 3548 - 3582 | Line maths | `recalcLine` (per-row charge), `recalcAll` (tab total) |
| 3583 - 3716 | **`collectAdvice(mode)`** | Turns the form into the saved invoice record |
| 3717 - 3772 | `adviceProblem`, `saveAdvice(mode)` | The check shared by preview, print and save - required fields, and the block on an AWB of the other direction; validation, ref allocation, push to `DB.entries`, downstream refresh |
| 3773 - 3974 | Invoice register | `buildRegister`, `filteredEntries`, `renderRegister`, `handoverDialog`, `openingDialog` |
| 3975 - 4114 | Dashboard | `buildDash`, `dashRange`, `renderDash`, `kpi`, `pctOf`, `bars` |
| 4115 - 4220 | Printable advice | `billingOf`, `docCopy` (the invoice layout), `row2`, `printAdvice`. Prints the CGS-GND-F037/F038 form codes in the footer. |
| 4221 - 4410 | Exports | `regRows`, a dependency-free XLSX writer (`crc32`, `zipBuild`, `sheetXml`, `buildXlsx`), `exportExcel`, `exportCsv` |
| 4411 - 4429 | State + logo | `DB` initial shape (including `company` / `bank` site config), `LOGO_LIGHT` (**line 4428, do not read**), `LOGO_PRINT` |
| 4433 - 4521 | **Rate tables** | `EXPORT_LINES`, `EXPORT_OPTIONAL`, `IMPORT_LINES`, `IMPORT_OPTIONAL`. See `03-business-rules.md` |
| 4522 - 4725 | Rates & Data tab | `buildAdmin`, `rateTable`, `applyRateOverrides`, **Company & Bank Details card**, logo upload, staff list, backup/restore |
| 4726 - 4783 | Sample data | `seedDemo` (its customers are drawn from `CUSTOMERS`) |
| 4784 - 5244 | Shift handover | `EQUIP_DEFAULT`, `SHIFTS`, `buildHandover`, held-shipment panels, equipment table, `syncShiftWindow`, `handoverFigures` (the calculation), `renderHandover`, `handoverData`, `saveHandover`, `renderSavedReports`, `printHandover`, lying-list band |
| 5245 - 5415 | Lying list | `LL` state, `llLoad`/`llSave`, `buildLying`, `llCommit`, `llSyncFromRegister`, `llSweep`, `llCountdown`, `renderLying` |
| 5416 - 5728 | Facility security | `buildSecurity`, `secAdd`, `addOneAwb`, `loadSample`, backup/restore, `secFind`, `renderSecurity`, `findInvoiceByAWB`, `scanMissing`, `ackSelected`, `addBlock`, `confirmLookup` |
| 5729 - 5836 | Boot | `fillStaff`, `applyLogo`, `applySiteOverrides`, `boot()` (loads shipments and builds the Shipment Database and Customer Database tabs before the advices), tab wiring, the 30s lying-list timer, Ctrl+S / Ctrl+P / Esc handlers (Ctrl+S is dead - audit A-06) |

---

## The functions that matter most

Changing any of these has wide blast radius. Read the whole function first.

| Function | Line | Why it matters |
|---|---:|---|
| `buildAdvice(mode)` | 3102 | Builds **both** advice forms from one code path (`isExp` flag). A change to Export is automatically a change to Import. |
| `applyAutoQty()` | inside `buildAdvice` (3380) | The auto-charge engine. Decides which tariff lines get a quantity from weight, SHC, HAWB qty and the two timestamps. |
| `wireAwbLookup(mode, recalc)` | 2777 | The AWB-first lookup and its suggestion list. Fills a shipment into the form and re-runs the auto-charge engine; owns the guards against filling on a prefix, leaving details under a changed AWB, and filling across export and import. |
| `shDateOrder(parts)` | 2622 | Decides whether an import's dates are day-first or month-first. **Every storage charge on a filled advice depends on it.** |
| `shParseManifest(text, order)` | 2646 | Reads pasted or uploaded manifest text: delimiter, heading match, dates, per-row notes. |
| `recalcLine(tr)` | 3548 | The charge formula: `qty > 0 ? max(rate*qty, min) : 0`, then VAT. |
| `collectAdvice(mode)` | 3583 | **Reimplements the same charge formula** to build the saved record. If you change `recalcLine`, you must change this too, or the screen and the invoice will disagree. This has caused a production bug before. |
| `billingOf(e)` | 4122 | The billing party of any record, legacy ones included. What the printed advice shows. |
| `renderRegister()` | 3847 | The ledger and the running cash balance. |
| `cashOnHand()` | 2421 | Opening float + cash collected − cash handed over. Feeds the header chip, the dashboard and the handover validation. |
| `handoverFigures()` | 4933 | Independently recomputes shift cash. Does **not** call `cashOnHand()`. |
| `llSyncFromRegister()` | 5332 | Auto-joins export invoices to the lying list. Dedupes by AWB across live **and** cleared. |
| `findInvoiceByAWB(awb)` | 5634 | The invoiced / not-invoiced check behind Facility Security. |
| `load()` | 2369 | Contains all three legacy backfills. Any new persisted field needs one here. |
| `applySiteOverrides()` | 5762 | Applies the per-machine company and bank details from `DB` over `CFG`. The reason no bank details are in the source. |
| `previewRef(mode)` | 2348 | The reference the next saved invoice would get. The single place to fix A-02. |

---

## Naming conventions

- Export form element IDs are prefixed `a_`, Import form IDs `i_`
  (`a_mawb` / `i_mawb`, `a_total` / `i_total`).
- On the advice forms, `<p>_cust` is the AWB owner, whose picker lists
  `<p>_custlist` (the customer master plus owners typed by hand). `<p>_bill`,
  `<p>_bill_trn` and `<p>_bill_addr` are the billing party, whose picker lists
  `<p>_billlist` (exactly the Customer Database). The AWB status line is
  `<p>_awbstatus` and its suggestion list `<p>_awbsuggest`.
- Shipment Database tab element IDs are prefixed `sh_` (`sh_paste`, `sh_preview`,
  `sh_order`, `sh_import`, `sh_filter`, `sh_loaded`); Customer Database tab IDs
  are prefixed `cu_` (`cu_filter`, `cu_count`, `cu_list`).
- Charge rows carry `data-lid="<line id>"`; cells carry `data-f="rate|qty|min|charge|total|vat"`.
- Optional tariff lines added from the picker also carry `data-catid="<catalogue id>"`, used for deduping.
- Lying-list entries auto-created from an invoice use the id `"LLA" + invoiceId`. That link is what lets invoice deletion clean them up.
