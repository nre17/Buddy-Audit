# Data Model

Two objects, two `localStorage` keys. Everything else is derived at render time.

---

## `DB` — key `solitair_db`

```js
{
  openingBalance: 0,        // counter cash float
  openingNote:    "",
  openingDate:    "",       // "YYYY-MM-DD"
  entries:        [],       // THE LEDGER. invoices and cash handovers. see below
  seq:            { export: 0, import: 0 },   // invoice reference counters
  customers:      [],       // names only, seeded from the CUSTOMERS master
  staff:          "Counter 1",  // currently signed-in counter staff
  rates:          {},       // per-line rate overrides from the Rates & Data tab
  logo:           null,     // data: URI if a custom logo was uploaded, else null
  staffList:      ["Counter 1", ... "Counter 6"],
  freeHours:      { general: 48, special: 48, perishable: 8 },
  company:        null,     // site config: {name, addr, contact, trn}. see below
  bank:           null,     // site config: {aed:[...lines], usd:[...lines]}
  sec:            []        // facility security reception records
}
```

### `DB.company` and `DB.bank` — per-machine site configuration

Both are `null` until someone fills in **Rates & Data → Company & Bank Details**.

```js
company: { name: "...", addr: "...", contact: "...", trn: "..." }
bank:    { aed: ["Acc Name: ...", "IBAN: ...", ...],
           usd: ["Acc Name: ...", "IBAN: ...", ...] }
```

`applySiteOverrides()` copies whatever is present over `CFG.company` / `CFG.bank`
at boot, the same way `DB.staffList`, `DB.freeHours` and `DB.rates` override their
`CFG` counterparts.

**These fields exist so that the real tax number and bank account details are
never held in the application source.** A fresh copy of the file prints
`Not configured` in their place. They are per-machine, they are included in the
JSON backup, and they must never be written back into
`app/solitair-invoicing.html`. See
[`08-data-protection.md`](08-data-protection.md).

---

### `DB.entries` — invoice row (`type: "invoice"`)

The record produced by `collectAdvice()` and stamped by `saveAdvice()`.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `"INV_" + Date.now() + "_" + random`. Stable key for delete/print. |
| `type` | string | **Always `"invoice"`.** Set in `saveAdvice()`. Views filter on it. |
| `mode` | string | `"Export"` or `"Import"` |
| `ref` | string | `"YYYY-MM-DD/NN"`. See audit **A-02** — `NN` does not reset daily. |
| `date` | string | `"YYYY-MM-DD"`, used by every date filter |
| `ts` | string | ISO timestamp, used by the handover shift window |
| `cust` | string | **The AWB owner**: the company the AWB is booked under. Filled from the Shipment Database or typed. The Register, Dashboard, Shift Handover and exports report on this. |
| `cust_trn`, `cust_country`, `cust_paymode` | string | The AWB owner's values from the customer master |
| `billTo` | string | **The billing party**: who the advice is invoiced to, chosen from the same customer master. Required. |
| `billTrn` | string | Billing party TRN, as printed on the advice |
| `billAddr` | string | Billing party address, as printed on the advice |
| `acct` | string | Mirror of `billTrn`. Before 1.2.0 it held the customer TRN as printed; it is still written so a backup from 1.2.0 prints the right TRN if restored into an earlier version. |
| `addr` | string | Mirror of `billAddr`, for the same reason |
| `mawb`, `hawb` | string | Uppercased air waybill numbers |
| `hawbqty` | number | Optional. Drives the per-HAWB data entry fee. |
| `org`, `dst` | string | Origin / destination. Default `DWC` on the relevant side. |
| `nog` | string | Nature of goods |
| `shc` | string | IATA special handling code. Determines cargo class and free hours. |
| `fltno` | string | Flight number |
| `t1` | string | Export: acceptance (RCS). Import: RCF at facility. `datetime-local`, **local time**. |
| `t2` | string | Export: departure. Import: delivery. |
| `ata` | string | Import flight ATA. Currently always `""`. |
| `wt`, `pcs` | number | Gross weight (kg), pieces |
| `items` | array | Charge lines actually billed. **Zero-charge lines are excluded.** |
| `total` | number | Sum of `items[].charge`, VAT included |
| `payMode` | string | One of `CFG.payModes` |
| `pay` | object | `{cash, card, credit, cass, bank, prepaid}`, all numbers |
| `txn` | string | Card/transfer reference |
| `rem` | string | Remarks |
| `rcvby` | string | Person who received or accepted the cargo |
| `cls` | string | `"general" \| "special" \| "perishable"`, derived from `shc` |
| `storageOverride`, `ovReason` | bool, string | Reserved. Currently always `false` / `""`. |
| `hardcopy` | bool | Hard copy handed over. Always `false` on save; toggled from the register. |
| `staff` | string | Counter staff who raised it |

`items[]` entry:

```js
{ d: "General Cargo Handling (per kg)",  // description as printed
  kind: "qty",                            // "qty" | "days" | "misc"
  qty: 500, rate: 0.15, total: 75,        // total = rate * qty, before minimum
  min: 34, charge: 75,                    // charge = max(total, min), + VAT
  minApplied: false, vat: 0, rem: "" }
```

### `DB.entries` — cash handover row (`type: "handover"`)

```js
{ id: "HO" + Date.now(), type: "handover",
  amount: 500,            // AED handed to accounts
  staff: "Counter 1", note: "receiver name / voucher no.",
  date: "YYYY-MM-DD", ts: "<ISO>" }
```

Handover rows have no `mawb`, `pay` or `total`. Any code iterating `DB.entries`
must branch on `type` before touching invoice-only fields.

### `DB.sec` — facility security reception record

```js
{ id: "SEC" + Date.now() + "_" + random,   // stable key; rows are addressed by it
  awb: "780-30100001",                      // digits and hyphens only (trimAwb)
  dir: "Export" | "Import",
  by:  "ACC",                               // receiving section
  ts:  "<ISO>",
  ack: false }                              // true = acknowledged, hidden from the active list
```

---

## `LL` — key `solitair_lying_v1`

```js
{ items:   [],   // cargo currently lying in the warehouse
  cleared: []    // history, newest first, capped at 300
}
```

Lying-list entry:

```js
{ id: "LL"+Date.now()          // manually added
      | "LLA"+invoiceId,       // auto-added from an export invoice
  awb, pcs, wt,
  dir: "Export" | "Import",
  loc: "TO NBO" | "FROM JFK",  // prefix is derived from dir
  fltno, dep,                  // dep is a datetime-local string
  addedBy, addedTs,
  auto: true | false,
  clearedAt }                  // only once swept into `cleared`
```

The `"LLA" + invoiceId` convention is load-bearing: it is the only link back to the
originating invoice, and it is what lets invoice deletion remove the matching
lying-list entry from both `items` and `cleared`.

---

## `SH` — key `solitair_shipments_v1`

The Shipment Database: the day's manifest, loaded on the Shipment Database tab and
looked up by AWB on both advice forms. Deliberately **not** part of `DB`. It is a
copy of a document that exists elsewhere, so it is not rewritten on every invoice
save and it is **not in the JSON backup**. After a restore, paste the manifest
again.

```js
{
  items: [{
    awb:   "780-30901001",       // as written on the manifest, upper-cased
    key:   "78030901001",        // digits only: what every lookup compares
    org:   "DWC", dst: "ISU",    // upper-cased
    fltno: "ZZ 901",
    dep:   "2026-09-10T02:15",   // departure, datetime-local; "" when absent
    rcf:   "",                   // received at facility; "" when absent
    shc:   "GEN",
    nog:   "Auto Spare Parts",
    pcs:   24,                   // null when the manifest has no value
    wt:    312.5,                // null when the manifest has no value
    cust:  "...",                // the AWB owner, as written on the manifest
    importedAt: 1788990614000    // ms since epoch
  }]
}
```

- **One entry per AWB.** Importing a row for an AWB already loaded replaces it.
- **Retention.** Entries imported more than `SH_KEEP_DAYS` (30) days ago are
  dropped at the next import.
- **Direction is derived, not stored.** A departure time means export and an RCF
  time means import; failing both, DWC as the origin or destination decides
  (`shDirection()`).

---

## Migrations

All three run in `load()` on every boot, are idempotent, and persist
immediately so the fix-up happens once.

### M1 — backfill `entries[].type`

Invoices written before the `type` field existed have no discriminator, so the
dashboard, lying-list sync and security lookup all silently ignored them.

```js
if(!e.type){
  e.type = (e.amount !== undefined && e.mawb === undefined) ? "handover" : "invoice";
}
```

Shape-based, because that is the only signal old rows carry: a handover has an
`amount` and no `mawb`.

### M2 — backfill `sec[].id`

Reception records written before ids existed were addressed positionally, which
deleted the wrong row whenever the list was filtered.

```js
if(!x.id){ x.id = "SEC" + Date.now() + "_" + Math.floor(Math.random()*100000); }
```

### M3 — backfill the billing party

Invoices saved before 1.2.0 have no `billTo`. They were billed to the customer on
the advice, so `load()` sets `billTo = cust`, `billTrn = acct` and
`billAddr = addr`, leaving the original fields in place. `billingOf()` in the print
code applies the same rule to a record that has not been through `load()` yet,
such as one restored from a backup in the same session (audit A-21).

Covered by `09-migrations.spec.js`.

### Writing a new migration

1. Add the backfill to `load()`, inside the existing `if(o && o.entries)` block.
2. Set `fixed = true` so the repaired object is written back.
3. Make it idempotent — it runs on every boot.
4. Add a spec to `tests/specs/09-migrations.spec.js` that seeds the **old** shape
   via `openApp({ seed: ... })` and asserts the app recovers.
5. Never remove a migration. Counter machines may be many versions behind.

---

## Storage budget

`localStorage` is capped at roughly 5 MB per origin. Current consumers:

| Consumer | Approx. size |
|---|---|
| `DB.customers` (1,892 names) | ~50 KB, **rewritten on every save** — see audit A-03 |
| `DB.logo` if a custom logo is uploaded | up to ~200 KB |
| Shipment Database (`solitair_shipments_v1`) | ~250 bytes per shipment; a 30-day window at 150 shipments a day is about 1.1 MB |
| Each invoice | ~1-2 KB |
| Each saved handover report | ~5-10 KB (embeds a full figures snapshot) |

A busy counter writing 60 invoices a day plus daily handover reports will take
years to approach the cap, but `save()` currently swallows a quota failure with a
generic toast (audit A-04). The runbook's daily export is the real mitigation.
