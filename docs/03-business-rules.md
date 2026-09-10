# Business Rules

The commercial logic of the system. Every figure below is transcribed from
`EXPORT_LINES` / `IMPORT_LINES` in `app/solitair-invoicing.html` (line range in `04-code-map.md`)
and is asserted by `tests/specs/03-charges.spec.js`.

> **These rates were signed off against the official SolitAir warehouse tariff
> (Solitair Member column, falling back to the standard column where the member
> rate is blank). Do not change a rate, minimum, VAT flag or auto-apply rule
> without an explicit instruction and a reference to the rate sheet.**

All amounts are AED.

---

## 1. The charge formula

Applied per line, in `recalcLine()` and again in `collectAdvice()`:

```
lineTotal = rate × quantity
charge    = quantity > 0 ? max(lineTotal, minimum) : 0
vatAmount = charge × (vat% / 100)
billed    = charge + vatAmount
```

Two rules carry real money:

- **Quantity zero means zero.** A line with no quantity never bills its minimum.
  This is why an untouched advice shows only the AWB fee.
- **Only billed lines are saved.** `collectAdvice()` drops any line whose billed
  amount is zero, so it never reaches `DB.entries` or the printed advice.

VAT is **per line, not global**. `CFG.vatRate` (5%) exists, but the authoritative
flag is the `vat` property on each line, taken from the rate sheet. Most lines are
0%. Do not apply a blanket 5%.

---

## 2. Cargo class

The SHC code drives the handling rate, the storage rate and the free storage
window. `shcClass()` maps the code via `CFG.shcCodes`; anything unrecognised or
blank falls back to **general**.

| Class | SHC codes | Free storage |
|---|---|---|
| **general** | GEN, ELI | 48 h |
| **perishable** | PER, PEP, PEF, PEM, PES | **8 h** |
| **special** | AVI, PIL, COL, VAL, HUM, DGR, COU, MUW, SWP, VUN | 48 h |

Free hours are configurable per class in the Rates & Data tab (`DB.freeHours`).

---

## 3. Automatic charges

These apply without staff action. Everything else defaults to zero.

### 3.1 Per-AWB fee — always

| | Line | Rate | Min | VAT |
|---|---|---:|---:|---:|
| Export | Cargo Acceptance Handling (the AWB fee) | 50.00 | 50.00 | 0% |
| Import | Delivery Order (the DO fee) | 50.00 | 50.00 | 0% |

Quantity is fixed at 1. This is why a blank advice totals 50.00.

### 3.2 HAWB data entry fee — when a HAWB quantity is entered

| Line | Rate | Min | VAT |
|---|---:|---:|---:|
| House Airwaybill (HAWB) Data Entry Fee | 50.00 per HAWB | 0.00 | 0% |

Quantity is the **HAWB Qty** field, so 1 HAWB = 50.00, 2 = 100.00, 3 = 150.00.
Blank or zero bills nothing. Applies to both Export and Import.

### 3.3 Handling — by cargo class, on gross weight

Quantity is the gross weight. Only the line matching the shipment's class charges.

| Class | Rate/kg | Minimum | VAT |
|---|---:|---:|---:|
| General | 0.15 | 34.00 | 0% |
| Special | 0.22 | 55.00 | 0% |
| Perishable | 0.24 | 55.00 export / 60.00 import | 0% |

Break-even for general cargo is 227 kg; below that the 34.00 minimum governs.

### 3.4 Storage — by cargo class, beyond the free period

Quantity is **weight × chargeable days**.

| Class | Rate/kg/day | Minimum | VAT |
|---|---:|---:|---:|
| General | 0.15 | 34.00 | 0% |
| Special | 0.20 | 44.00 | 0% |
| Perishable | 0.29 | 60.00 | 0% |

Chargeable days (`calcStorageDays`):

```
hours  = t2 − t1                         // acceptance→departure, or RCF→delivery
excess = hours − freeHours[class]
days   = excess > 0 ? ceil(excess / 24) : 0
```

Any part-day counts as a whole day. Worked examples:

| Elapsed | Class | Free | Excess | Chargeable |
|---:|---|---:|---:|---:|
| 24 h | General | 48 h | — | 0 days |
| 72 h | General | 48 h | 24 h | 1 day |
| 108 h | General | 48 h | 60 h | 3 days |
| 108 h | Perishable | 8 h | 100 h | 5 days |

The form shows this live above the storage rows: elapsed hours, the free period for
the current class, and the resulting chargeable days.

### 3.5 Dangerous Goods Inspection — conditional, with an override

| Line | Rate | Min | VAT |
|---|---:|---:|---:|
| Dangerous Goods Inspection | 350.00 | 350.00 | 0% |

Applies automatically when **SHC = DGR**, on both Export and Import. A
**"Reject / not required"** checkbox on the line zeroes it when the inspection was
not performed. Unticking restores it.

### 3.6 Late Acceptance of Cargo — Export only

| Line | Rate | Min | VAT |
|---|---:|---:|---:|
| Late Acceptance of Cargo | 0.53 /kg | 68.00 | **5%** |

Applies automatically when `0 < (departure − acceptance) ≤ 5 hours`. Quantity is
gross weight. There is **no import equivalent** in the rate sheet, so none is
implemented.

---

## 4. Optional charges

Never automatic. Staff pick one from the **Add Tariff Charge** dropdown on the
advice tab; it is added as an editable line immediately on selection. The same
charge cannot be added twice (deduped by catalogue id).

### Export

| Charge | Rate | Min | VAT |
|---|---:|---:|---:|
| Barcode Labels / Sortation | 0.25 /kg | 30.00 | 0% |
| Dangerous Goods Rejection Fee | 350.00 | 350.00 | 5% |
| Skid Dismantling | 197.00 | 197.00 | 5% |
| AWB Cancellation / Rebooking / Return (Pre-Build-Up) | 225.00 | 225.00 | 5% |
| AWB Cancellation / Rebooking / Return (Post-Build-Up) | 0.15 /kg | 450.00 | 5% |
| AWB Amendment Fee (After Handover) | 172.00 | 172.00 | 0% |
| Aviation / Live Animals (AVI) Handling | 258.00 | 258.00 | 0% |
| Cargo Cartage — Inbound to Warehouse | 30.00 | 30.00 | 0% |
| Cargo Brokering / Agency Fee | 100.00 | 100.00 | 0% |
| Air Waybill & Documentation (Additional) | 25.00 | 25.00 | 0% |
| X-ray / Security Screening | 0.15 /kg | 36.00 | 5% |

### Import

| Charge | Rate | Min | VAT |
|---|---:|---:|---:|
| Consolidation Breakdown | 50.00 | 50.00 | 0% |
| Dangerous Goods Rejection Fee | 350.00 | 350.00 | 5% |
| Cancellation of Delivery Order | 126.00 | 126.00 | 5% |
| AWB Amendment Fee | 172.00 | 172.00 | 0% |
| Request for Wooden Skid on Delivery | 50.00 | 50.00 | 5% |
| Photocopy Charges | 5.00 | 5.00 | 5% |
| Restraining / Restrapping / Resealing | 35.00 | 35.00 | 0% |
| Additional Labour | 70.00 | 70.00 | 5% |
| Additional Forklift Use | 200.00 | 200.00 | 5% |
| AWB / CCA Amendment / AWB Reprint | 100.00 | 100.00 | 0% |
| Reweighing | 0.15 /kg | 170.00 | 5% |
| Photo Graph Charges | 54.00 | 54.00 | 5% |
| X-ray Screening | 0.15 /kg | 36.00 | 5% |
| LIV Handling | 0.28 /kg | 300.00 | 0% |
| AVI Handling | 258.00 | 258.00 | 0% |
| Automobile Handling | 400.00 | 400.00 | 0% |
| Dismantling Skids after Acceptance on Airside | 197.00 | 197.00 | 5% |
| Cargo Receiving at Facility | 45.00 | 45.00 | 0% |
| Customs Clearance Brokerage | 150.00 | 150.00 | 0% |
| Delivery / Cartage to Consignee | 0.25 /kg | 50.00 | 0% |
| Sortation & Labelling / Barcode Labels | 0.25 /kg | 30.00 | 0% |

Express Delivery Order is intentionally excluded from the catalogue.

A free-text **Add Custom Line** is also available for anything outside the tariff.

### Known approximations

Two optional lines compress a compound rate-sheet structure into the app's single
`rate` + `min` model, and are documented here so they are not mistaken for errors:

- **AWB Cancellation (Post-Build-Up)** is "450.00 base plus a per-kg element" on
  the rate sheet, modelled as 0.15/kg with a 450.00 floor. Correct at or below the
  break-even weight; understates above it.
- **X-ray Screening** bills per kg with a minimum, which matches the sheet, but the
  sheet's tiering is not modelled.

---

## 5. Payment

Modes: **Cash, Card, Cash + Card, CASS, Credit, Bank Transfer.**

- Selecting a single-method mode shows one amount field.
- **Cash shows no amount field at all** — the invoice total is the amount.
- **Cash + Card** is the only mode that shows two fields, because the split has to
  be entered by hand.
- On save, if no amount was typed, the full total is assigned to the selected
  method. If exactly one method carries a value, it is set to the total. Methods
  not relevant to the mode are zeroed.
- If the amounts entered do not reconcile to the invoice total, the save proceeds
  but a warning toast is shown.

Bank details are printed on the advice for Bank Transfer, Credit and CASS. A credit
card slip box is printed for Card and Cash + Card.

---

## 6. Cash position

```
cashOnHand = openingBalance
           + Σ pay.cash over all invoices
           − Σ amount over all handovers
```

Shown live in the header, on the dashboard, and used to validate handovers to
accounts. A handover exceeding cash on hand is rejected.

The shift handover report computes the same figures independently, restricted to a
shift window and optionally to one staff member, opening from the balance carried
in at the start of the window.

---

## 7. Downstream consequences of saving

`saveAdvice()` validates the AWB, the AWB owner, the billing party, weight, pieces
and at least one charge line, allocates the reference, then:

1. Pushes the invoice into `DB.entries` with `type: "invoice"`.
2. **Export only:** auto-joins the lying list, keyed `"LLA" + invoiceId`, using the
   departure time and destination from the advice. Imports never join.
3. Refreshes the register, cash chip and lying list.
4. Resets the form.

Deleting an invoice reverses all of it: the entry is removed, balances recalculate,
and the matching lying-list entry is removed from both the live list and the
cleared history so a corrected re-entry for the same AWB rejoins cleanly.

---

## 8. AWB owner and billing party

An AWB is booked under one company and may be invoiced to another. The advice
keeps the two apart.

| | AWB owner | Billing party |
|---|---|---|
| Field | `cust` | `billTo`, `billTrn`, `billAddr` |
| Comes from | The Shipment Database, or typed | The customer master; **Same as AWB owner** copies the owner |
| Printed as | AWB Owner | Billing Party, Billing Party TRN, Billing Party Address |
| Reported on by | Register, Dashboard, Shift Handover, exports | The printed advice |
| Required | Yes | Yes |

The billing party's TRN and address are the only customer TRN and address on the
advice. The billing party is **never filled in automatically**: an unnoticed
default would put the charges on the wrong company's tax document.

If the billing party is changed to a name that is not in the customer master, the
TRN and address filled in for the previous name are cleared, so no party can
print under another party's TRN.

---

## 9. Shipment Database lookup

Typing an AWB on an advice fills in its shipment from the Shipment Database.

- **Matching** is on the AWB's digits only, so hyphens and spaces do not matter.
  While the AWB is being typed, a shipment fills in only on an exact match that no
  other loaded AWB extends; on Enter, or on leaving the field, an exact match is
  enough.
- **Fields filled:** AWB owner, origin, destination, flight number, SHC code,
  nature of goods, pieces and gross weight, plus the departure time on an export
  (the second timestamp) or the RCF time on an import (the first). The counter's
  own timestamp - acceptance on an export, delivery on an import - is never
  touched. A value missing from the manifest is left blank to be entered, and an
  SHC code the application does not know is not applied.
- **Changing the AWB** to one that is not loaded clears the details filled in for
  the previous shipment. One shipment's data never sits under another's AWB.
- **Wrong direction:** an import shipment's AWB typed on the Export Advice, or the
  reverse, is not filled in, because the two advices price from different tariffs.
  The form offers to open it on the right one.
- **Everything stays editable.** Filling in sets values; it does not lock them.

Storage and late-acceptance charges are calculated from these timestamps, so the
day/month order of manifest dates is decided per import and shown in the preview
with every date written out in words:

- A first number above 12 means day-first; a second number above 12 means
  month-first.
- When every date is ambiguous, the reading under which the manifest covers the
  shorter period wins, because a manifest spans a day or two, not months. A true
  tie falls back to the browser's own date format.
- The preview marks anything short of certain, and staff can set the order before
  importing.
