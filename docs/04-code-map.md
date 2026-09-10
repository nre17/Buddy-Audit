# Code Map

Navigation aid for `app/solitair-invoicing.html` (5,653 lines).

> Line numbers verified against the file on 11 September 2026.

**Use this instead of reading the file.** Find your region here, then read only
that range:

```bash
sed -n '3415,3544p' app/solitair-invoicing.html   # collectAdvice()
grep -n "^function renderRegister" app/solitair-invoicing.html
```

> Line numbers drift as the file is edited. If a range looks wrong, re-locate with
> `grep -n "^function <name>"` and please update this table in the same PR.

---

## Do not read these regions

| Lines | What | Why |
|---|---|---|
| 307 - 2198 | `CUSTOMERS` master (1,892 demo records) | 33% of the file, pure data, will consume your context for nothing |
| 4254 | `LOGO_LIGHT` | One single line of 55,954 characters (base64 PNG) |

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
| 1 - 195 | Head + CSS | All styling, including `@media print`. The AWB status line, billing party band and manifest tables (`.awbstatus`, `.billband`, `.billgrid`, `.manifest-preview`) sit with the form fields. No responsive breakpoints (A-10); the tab padding tightens on narrower screens. |
| 196 - 237 | Body markup | Header, brand logo, the nine tab buttons (Shipment Database first), nine empty `.page` divs, `#modal`, `#toast`, `#printarea` |
| 238 | `<script>` opens | Everything below is one inline script |
| 246 - 301 | `APP_VERSION` + `CFG` | Version string, company details, **bank block (placeholders only)**, staff, pay modes, SHC code table, free-storage hours, VAT rate |
| 302 - 2198 | `CUSTOMERS` | Demo customer master. **Do not read** - use `fixtures/customers.demo.json`. |
| 2200 - 2265 | Customer helpers | `seedCustomers`, `refreshCustList`, `resolveCustomer`, and the billing party picker: `fillBilling`, `wireBillingParty` |
| 2266 - 2308 | Core utilities | `$`, `$$`, `esc`, `num`, `pad`, `ymd`, `nowLocalDT`, `money`, `fmtD`, `fmtDT`, `toast`, `stamp`, `refFor`, `previewRef`, `shcLabel`, `shcClass`, `calcStorageDays` |
| 2309 - 2348 | Form + storage helpers | `fld`, `sel`, `save`, `load` (**contains all three migrations**) |
| 2349 - 2376 | Modal + cash | `modal`, `closeModal`, `refreshChip`, `cashOnHand` |
| 2377 - 2937 | **Shipment Database** | The `SH` store (`shLoad`, `shSave`), `awbKey`, `shFind`, `shDirection`, `shMasterName`; reading a manifest (`parseDelimited`, `SH_COLUMNS`, `shMapHeader`, `shDateParts`, `shDateValue`, `shDateOrder`, `shParseManifest`); `shImport`, `shDemoItems`; the AWB field on the advices (`wireAwbLookup`); the tab (`buildShipments`) |
| 2942 - 3379 | **`buildAdvice(mode)`** | The largest function. Builds both advice forms - AWB first, shipment details, billing party - wires every listener, contains the `applyAutoQty()` auto-charge engine |
| 3380 - 3414 | Line maths | `recalcLine` (per-row charge), `recalcAll` (tab total) |
| 3415 - 3544 | **`collectAdvice(mode)`** | Turns the form into the saved invoice record |
| 3545 - 3598 | `adviceMissing`, `saveAdvice(mode)` | The required-field check shared by preview, print and save; validation, ref allocation, push to `DB.entries`, downstream refresh |
| 3599 - 3800 | Invoice register | `buildRegister`, `filteredEntries`, `renderRegister`, `handoverDialog`, `openingDialog` |
| 3801 - 3940 | Dashboard | `buildDash`, `dashRange`, `renderDash`, `kpi`, `pctOf`, `bars` |
| 3941 - 4046 | Printable advice | `billingOf`, `docCopy` (the invoice layout), `row2`, `printAdvice`. Prints the CGS-GND-F037/F038 form codes in the footer. |
| 4047 - 4236 | Exports | `regRows`, a dependency-free XLSX writer (`crc32`, `zipBuild`, `sheetXml`, `buildXlsx`), `exportExcel`, `exportCsv` |
| 4237 - 4255 | State + logo | `DB` initial shape (including `company` / `bank` site config), `LOGO_LIGHT` (**line 4254, do not read**), `LOGO_PRINT` |
| 4259 - 4347 | **Rate tables** | `EXPORT_LINES`, `EXPORT_OPTIONAL`, `IMPORT_LINES`, `IMPORT_OPTIONAL`. See `03-business-rules.md` |
| 4348 - 4551 | Rates & Data tab | `buildAdmin`, `rateTable`, `applyRateOverrides`, **Company & Bank Details card**, logo upload, staff list, backup/restore |
| 4552 - 4601 | Sample data | `seedDemo` |
| 4602 - 5062 | Shift handover | `EQUIP_DEFAULT`, `SHIFTS`, `buildHandover`, held-shipment panels, equipment table, `syncShiftWindow`, `handoverFigures` (the calculation), `renderHandover`, `handoverData`, `saveHandover`, `renderSavedReports`, `printHandover`, lying-list band |
| 5063 - 5233 | Lying list | `LL` state, `llLoad`/`llSave`, `buildLying`, `llCommit`, `llSyncFromRegister`, `llSweep`, `llCountdown`, `renderLying` |
| 5234 - 5546 | Facility security | `buildSecurity`, `secAdd`, `addOneAwb`, `loadSample`, backup/restore, `secFind`, `renderSecurity`, `findInvoiceByAWB`, `scanMissing`, `ackSelected`, `addBlock`, `confirmLookup` |
| 5547 - 5653 | Boot | `fillStaff`, `applyLogo`, `applySiteOverrides`, `boot()` (loads shipments and builds the Shipment Database tab before the advices), tab wiring, the 30s lying-list timer, Ctrl+S / Ctrl+P / Esc handlers (Ctrl+S is dead - audit A-06) |

---

## The functions that matter most

Changing any of these has wide blast radius. Read the whole function first.

| Function | Line | Why it matters |
|---|---:|---|
| `buildAdvice(mode)` | 2942 | Builds **both** advice forms from one code path (`isExp` flag). A change to Export is automatically a change to Import. |
| `applyAutoQty()` | inside `buildAdvice` (3212) | The auto-charge engine. Decides which tariff lines get a quantity from weight, SHC, HAWB qty and the two timestamps. |
| `wireAwbLookup(mode, recalc)` | 2708 | The AWB-first lookup. Fills a shipment into the form and re-runs the auto-charge engine; owns the guards against filling on a prefix, leaving details under a changed AWB, and filling across export and import. |
| `shDateOrder(parts)` | 2562 | Decides whether an import's dates are day-first or month-first. **Every storage charge on a filled advice depends on it.** |
| `shParseManifest(text, order)` | 2586 | Reads pasted or uploaded manifest text: delimiter, heading match, dates, per-row notes. |
| `recalcLine(tr)` | 3380 | The charge formula: `qty > 0 ? max(rate*qty, min) : 0`, then VAT. |
| `collectAdvice(mode)` | 3415 | **Reimplements the same charge formula** to build the saved record. If you change `recalcLine`, you must change this too, or the screen and the invoice will disagree. This has caused a production bug before. |
| `billingOf(e)` | 3948 | The billing party of any record, legacy ones included. What the printed advice shows. |
| `renderRegister()` | 3673 | The ledger and the running cash balance. |
| `cashOnHand()` | 2366 | Opening float + cash collected − cash handed over. Feeds the header chip, the dashboard and the handover validation. |
| `handoverFigures()` | 4751 | Independently recomputes shift cash. Does **not** call `cashOnHand()`. |
| `llSyncFromRegister()` | 5150 | Auto-joins export invoices to the lying list. Dedupes by AWB across live **and** cleared. |
| `findInvoiceByAWB(awb)` | 5452 | The invoiced / not-invoiced check behind Facility Security. |
| `load()` | 2314 | Contains all three legacy backfills. Any new persisted field needs one here. |
| `applySiteOverrides()` | 5580 | Applies the per-machine company and bank details from `DB` over `CFG`. The reason no bank details are in the source. |
| `previewRef(mode)` | 2293 | The reference the next saved invoice would get. The single place to fix A-02. |

---

## Naming conventions

- Export form element IDs are prefixed `a_`, Import form IDs `i_`
  (`a_mawb` / `i_mawb`, `a_total` / `i_total`).
- On the advice forms, `<p>_cust` is the AWB owner and `<p>_bill`, `<p>_bill_trn`,
  `<p>_bill_addr` are the billing party; both pickers share the `<p>_custlist`
  datalist. The AWB status line is `<p>_awbstatus`.
- Shipment Database tab element IDs are prefixed `sh_` (`sh_paste`, `sh_preview`,
  `sh_order`, `sh_import`, `sh_filter`, `sh_loaded`).
- Charge rows carry `data-lid="<line id>"`; cells carry `data-f="rate|qty|min|charge|total|vat"`.
- Optional tariff lines added from the picker also carry `data-catid="<catalogue id>"`, used for deduping.
- Lying-list entries auto-created from an invoice use the id `"LLA" + invoiceId`. That link is what lets invoice deletion clean them up.
