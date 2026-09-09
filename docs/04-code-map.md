# Code Map

Navigation aid for `app/solitair-invoicing.html` (5,039 lines).

> Line numbers verified against the file on 10 September 2026.

**Use this instead of reading the file.** Find your region here, then read only
that range:

```bash
sed -n '2831,2949p' app/solitair-invoicing.html   # collectAdvice()
grep -n "^function renderRegister" app/solitair-invoicing.html
```

> Line numbers drift as the file is edited. If a range looks wrong, re-locate with
> `grep -n "^function <name>"` and please update this table in the same PR.

---

## Do not read these regions

| Lines | What | Why |
|---|---|---|
| 297 - 2188 | `CUSTOMERS` master (1,892 demo records) | 38% of the file, pure data, will consume your context for nothing |
| 3643 | `LOGO_LIGHT` | One single line of 55,954 characters (base64 PNG) |

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
| 1 - 186 | Head + CSS | All styling, including `@media print` at ~141. No responsive breakpoints (A-10). |
| 187 - 235 | Body markup | Header, brand logo, the eight tab buttons, eight empty `.page` divs, `#modal`, `#toast`, `#printarea` |
| 236 | `<script>` opens | Everything below is one inline script |
| 242 - 296 | `APP_VERSION` + `CFG` | Version string, company details, **bank block (placeholders only)**, staff, pay modes, SHC code table, free-storage hours, VAT rate |
| 297 - 2188 | `CUSTOMERS` | Demo customer master. **Do not read** - use `fixtures/customers.demo.json`. |
| 2190 - 2248 | Customer helpers | `seedCustomers`, `refreshCustList`, `resolveCustomer`, `onCustInput` (autofill) |
| 2253 - 2280 | Core utilities | `$`, `$$`, `esc`, `num`, `pad`, `ymd`, `nowLocalDT`, `money`, `fmtD`, `fmtDT`, `toast`, `stamp`, `refFor`, `previewRef`, `shcLabel`, `shcClass`, `calcStorageDays` |
| 2281 - 2312 | Form + storage helpers | `fld`, `sel`, `save`, `load` (**contains both migrations**) |
| 2313 - 2341 | Modal + cash | `modal`, `closeModal`, `refreshChip`, `cashOnHand` |
| 2345 - 2795 | **`buildAdvice(mode)`** | The largest function. Builds both advice forms, wires every listener, contains the `applyAutoQty()` auto-charge engine |
| 2796 - 2830 | Line maths | `recalcLine` (per-row charge), `recalcAll` (tab total) |
| 2831 - 2949 | **`collectAdvice(mode)`** | Turns the form into the saved invoice record |
| 2950 - 2998 | `saveAdvice(mode)` | Validation, ref allocation, push to `DB.entries`, downstream refresh |
| 3003 - 3200 | Invoice register | `buildRegister`, `filteredEntries`, `renderRegister`, `handoverDialog`, `openingDialog` |
| 3204 - 3340 | Dashboard | `buildDash`, `dashRange`, `renderDash`, `kpi`, `pctOf`, `bars` |
| 3344 - 3436 | Printable advice | `docCopy` (the invoice layout), `row2`, `printAdvice`. Prints the CGS-GND-F037/F038 form codes in the footer. |
| 3440 - 3627 | Exports | `regRows`, a dependency-free XLSX writer (`crc32`, `zipBuild`, `sheetXml`, `buildXlsx`), `exportExcel`, `exportCsv` |
| 3631 - 3644 | State + logo | `DB` initial shape (including `company` / `bank` site config), `LOGO_LIGHT` (**line 3643, do not read**), `LOGO_PRINT` |
| 3648 - 3737 | **Rate tables** | `EXPORT_LINES`, `EXPORT_OPTIONAL`, `IMPORT_LINES`, `IMPORT_OPTIONAL`. See `03-business-rules.md` |
| 3741 - 3941 | Rates & Data tab | `buildAdmin`, `rateTable`, `applyRateOverrides`, **Company & Bank Details card**, logo upload, staff list, backup/restore |
| 3945 - 4001 | Sample data | `seedDemo`, `EQUIP_DEFAULT`, `SHIFTS` |
| 4003 - 4452 | Shift handover | `buildHandover`, held-shipment panels, equipment table, `syncShiftWindow`, `handoverFigures` (the calculation), `renderHandover`, `handoverData`, `saveHandover`, `renderSavedReports`, `printHandover`, lying-list band |
| 4456 - 4623 | Lying list | `LL` state, `llLoad`/`llSave`, `buildLying`, `llCommit`, `llSyncFromRegister`, `llSweep`, `llCountdown`, `renderLying` |
| 4627 - 4936 | Facility security | `buildSecurity`, `secAdd`, `addOneAwb`, `loadSample`, backup/restore, `secFind`, `renderSecurity`, `findInvoiceByAWB`, `scanMissing`, `ackSelected`, `addBlock`, `confirmLookup` |
| 4940 - 5039 | Boot | `fillStaff`, `applyLogo`, `applySiteOverrides`, `boot()`, tab wiring, the 30s lying-list timer, Ctrl+S / Ctrl+P / Esc handlers |

---

## The functions that matter most

Changing any of these has wide blast radius. Read the whole function first.

| Function | Line | Why it matters |
|---|---:|---|
| `buildAdvice(mode)` | 2345 | Builds **both** advice forms from one code path (`isExp` flag). A change to Export is automatically a change to Import. |
| `applyAutoQty()` | inside `buildAdvice` (~2446) | The auto-charge engine. Decides which tariff lines get a quantity from weight, SHC, HAWB qty and the two timestamps. |
| `recalcLine(tr)` | 2796 | The charge formula: `qty > 0 ? max(rate*qty, min) : 0`, then VAT. |
| `collectAdvice(mode)` | 2831 | **Reimplements the same charge formula** to build the saved record. If you change `recalcLine`, you must change this too, or the screen and the invoice will disagree. This has caused a production bug before. |
| `renderRegister()` | 3072 | The ledger and the running cash balance. |
| `cashOnHand()` | 2330 | Opening float + cash collected − cash handed over. Feeds the header chip, the dashboard and the handover validation. |
| `handoverFigures()` | 4140 | Independently recomputes shift cash. Does **not** call `cashOnHand()`. |
| `llSyncFromRegister()` | 4539 | Auto-joins export invoices to the lying list. Dedupes by AWB across live **and** cleared. |
| `findInvoiceByAWB(awb)` | 4841 | The invoiced / not-invoiced check behind Facility Security. |
| `load()` | 2286 | Contains both legacy backfills. Any new persisted field needs one here. |
| `applySiteOverrides()` | 4969 | Applies the per-machine company and bank details from `DB` over `CFG`. The reason no real bank details are in the source. |
| `previewRef(mode)` | 2265 | The reference the next saved invoice would get. The single place to fix A-02. |

---

## Naming conventions

- Export form element IDs are prefixed `a_`, Import form IDs `i_`
  (`a_cust` / `i_cust`, `a_total` / `i_total`).
- Charge rows carry `data-lid="<line id>"`; cells carry `data-f="rate|qty|min|charge|total|vat"`.
- Optional tariff lines added from the picker also carry `data-catid="<catalogue id>"`, used for deduping.
- Lying-list entries auto-created from an invoice use the id `"LLA" + invoiceId`. That link is what lets invoice deletion clean them up.
