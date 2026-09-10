# Process Specification for ERP Implementation

**Prepared by:** SolitAir Cargo Express Services DWC-LLC, Ground Operations
**Purpose:** describe, precisely enough to be rebuilt, the cargo counter charge
advice and invoicing process as it currently operates at DWC.
**Audience:** the ERP implementation team.

This describes the counter process as it runs, demonstrated by a working prototype
on demo data - not a wish list. Where the prototype has a known limitation, it is
marked **[GAP]** so the ERP does not inherit it.

---

## 1. Scope

The cargo counter raises charge advices for export and import shipments, collects
payment, hands cash to accounts at shift change, tracks cargo physically lying in
the warehouse, and reconciles AWBs received at the facility against invoices raised.

Two controlled forms are produced:

| Form | Use | Copies printed |
|---|---|---|
| **CGS-GND-F037** | Acceptance Charges Advice — Export | Customer, Operations, Accounts |
| **CGS-GND-F038** | Delivery Order Advice — Import | Customer, Accounts |

Currency is AED throughout. VAT is applied per charge line, not globally.

---

## 2. Master data

| Entity | Attributes | Order of magnitude |
|---|---|---|
| Customer | name, TRN, address, city, country, default payment mode, phone, email | low thousands |
| Staff | name | under ten per counter |
| Site configuration | company name, address, contact, tax number; AED and USD bank blocks | 1 per legal entity |
| Shipment | AWB, origin, destination, flight, departure or RCF time, SHC, nature of goods, pieces, gross weight, AWB owner | one manifest a day |
| SHC code | code, description, cargo class (general / special / perishable) | 17 |
| Tariff line | description, rate, unit (per AWB / per kg / per kg-day / each), minimum charge, VAT %, cargo class, auto-apply rule | 11 automatic, 32 optional |
| Free storage period | hours, by cargo class | general 48, special 48, perishable 8 |

Cargo class is **derived** from the SHC code, and drives the handling rate, the
storage rate and the free storage window. It is not entered by staff.

> **Master data will need a cleansing pass.** The customer master originates as
> a spreadsheet maintained by hand and has never been validated on import. Assume
> incomplete records, inconsistent telephone formatting, and values in the wrong
> column. Budget for cleansing and for validation on import; do not assume any
> field is populated.
>
> The customer list in the demonstration application is **generated demo data**,
> not an operational extract. Operational master data is provided separately
> under NDA.
>
> The prototype deliberately has no way to load the real customer master. The ERP
> holds it, including the TRN and address that the billing party prints.

---

## 3. Process

### 3.1 Raise a charge advice

Triggered when cargo is accepted (export) or is ready for delivery (import).

**Captured:** the AWB first. The shipment's details come from the day's manifest,
loaded into a Shipment Database and looked up by AWB: AWB owner, origin and
destination, flight number, SHC code, nature of goods, pieces, gross weight, and
the departure time (export) or RCF time (import). Staff then add the HAWB and
optional HAWB quantity, the counter's own timestamp, and the **billing party**,
chosen from the customer master, whose TRN and address are the ones printed. Two
timestamps drive the charges:

| | First timestamp | Second timestamp |
|---|---|---|
| Export | Cargo acceptance (RCS) | Flight departure (STD) |
| Import | Received at facility (RCF) | Delivery to consignee |

> **AWB owner and billing party are distinct.** An AWB booked under one company is
> often invoiced to another. The ERP must carry both on the charge document: the
> AWB owner for operational reporting, and the billing party, with its TRN and
> address, for the tax invoice.

**Priced automatically** — see section 4. Staff may add optional tariff charges from
a controlled catalogue, add a free-text line, or override any rate on the advice.

**Payment** is recorded against one of six modes: Cash, Card, Cash + Card, CASS,
Credit, Bank Transfer. A single-method mode implies the full invoice total. Only
Cash + Card requires an explicit split.

**Output:** a saved invoice in the register, plus a printed advice in the copies
listed in section 1.

**Validation on save:** the AWB, the AWB owner, the billing party, gross weight and
pieces are mandatory, and
at least one charge line must be billable. If entered payment amounts do not
reconcile to the invoice total, the user is warned but the save proceeds.

### 3.2 Invoice register

The ledger and the single source of truth. Every other view derives from it.

Holds, per invoice: date, reference, MAWB, direction, customer, staff, cash
collected, cash handed over, running cash balance, card / credit / CASS / bank
amounts, total sale, payment mode, remarks, and a hard-copy-handed-over flag.

Filterable by date range, direction, payment mode, staff, and free text across AWB,
customer and reference. Exports to Excel and CSV.

Also holds a second row type: a **cash handover to accounts**, which reduces the
running cash balance.

**Reference format** is `YYYY-MM-DD/NN`.
**[GAP]** In the current tool `NN` does not restart daily; it is a continuously
incrementing counter. **The ERP should restart the sequence each day**, and should
not reuse a number from a voided advice.

### 3.3 Cash control

```
Cash on hand = opening float
             + cash collected on invoices
             − cash handed to accounts
```

Handovers to accounts capture amount, staff, receiving party or voucher number, and
date. A handover greater than cash on hand is rejected.

### 3.4 Lying list (warehouse)

Cargo physically in the warehouse awaiting departure.

- An **export** invoice automatically places its AWB on the list, using the
  departure time and destination from the advice. **Imports never appear.**
- Shows AWB, pieces, weight, direction with origin/destination, flight, scheduled
  departure, a live countdown, and an alert for anything departing within 8 hours.
- Entries clear automatically once departure time passes, into a retained history.
- Staff can add entries manually for cargo not yet invoiced.
- Deleting an invoice removes its auto-created entry, so a corrected re-entry for
  the same AWB rejoins cleanly rather than duplicating.

### 3.5 Shift handover

Morning 08:00-16:00, Evening 16:00-00:00, Night 00:00-08:00, or a custom window.

Derived automatically from the register for the window: AWB, piece and weight
totals split by direction and cargo class; a per-staff breakdown of invoice count,
pieces, weight and collection by payment method; and a full cash reconciliation
(take-over balance, collected by method, total sales, handed to accounts, cash on
hand at handover).

Captured manually: customers waiting for physical delivery, customers waiting for a
delivery order, shipments pending X-ray, pending acceptance, pending documentation,
shipments held by authorities (export and import), equipment status, and a free-text
summary and concerns.

Saved and printable, with outgoing staff, incoming staff, handover time and
supervisor.

### 3.6 Facility security reconciliation

Security logs every AWB received at the facility, with direction and receiving
section, one at a time or as a pasted block.

Each logged AWB is matched against the invoice register by MAWB. Matched shows
**Invoiced** with the reference; unmatched shows **NOT INVOICED** and is raised in a
dedicated alert panel. Also supports a single-AWB lookup and a bulk scan summary.

Matching is exact on the MAWB string.
**[GAP]** Any difference in formatting causes a false "not invoiced". **The ERP
should normalise AWB format before matching.**

### 3.7 Management reporting

Period and staff filtered: total sales, invoice count, total weight, cash on hand,
revenue by payment method, export vs import split, top customers by revenue,
collection by staff, handover history, and outstanding Credit and CASS by customer.

---

## 4. Pricing rules

The full rate card, with every figure, is in
[`03-business-rules.md`](03-business-rules.md). Summary of the mechanism:

**Per line:**
```
lineTotal = rate × quantity
charge    = quantity > 0 ? max(lineTotal, minimum) : 0
billed    = charge + charge × (line VAT % / 100)
```

Two rules the ERP must honour:
1. A line with zero quantity charges **nothing**, not its minimum.
2. Only billable lines appear on the invoice. Zero lines are omitted entirely.

**Applied automatically:**

| Charge | Basis | Condition |
|---|---|---|
| AWB fee (export) / DO fee (import) | per AWB | always |
| HAWB data entry fee | per HAWB | HAWB quantity entered |
| Handling | per kg, rate by cargo class | always, class from SHC |
| Storage | per kg per chargeable day, rate by class | elapsed time exceeds the class free period |
| Dangerous Goods Inspection | flat | SHC = DGR, with a manual reject option |
| Late Acceptance of Cargo (export only) | per kg | acceptance within 5 hours of departure |

**Chargeable storage days:**
```
excess = (second timestamp − first timestamp) − freeHours[cargo class]
days   = excess > 0 ? ceil(excess / 24) : 0        // any part day counts as a full day
```

Everything else in the tariff is **optional**: selected by staff from a controlled
catalogue when it genuinely applies, never applied automatically.

VAT is a per-line attribute from the rate sheet. Most lines are 0%. A blanket 5%
would be wrong.

---

## 5. Data model summary

| Entity | Key fields |
|---|---|
| **Invoice** | id, type, direction, reference, date, timestamp, customer (name, TRN, address), MAWB, HAWB, HAWB qty, origin, destination, nature of goods, SHC, cargo class, flight no., timestamp 1, timestamp 2, gross weight, pieces, charge lines[], total, payment mode, payment breakdown{cash, card, credit, CASS, bank}, transaction ref, remarks, received by, staff, hard copy flag |
| **Charge line** | description, quantity, rate, line total, minimum, VAT %, billed amount, minimum-applied flag |
| **Cash handover** | id, type, amount, staff, note/voucher, date, timestamp |
| **Lying list entry** | id, source invoice id, AWB, pieces, weight, direction, origin/destination, flight no., scheduled departure, added by, added at, auto flag, cleared at |
| **Security reception** | id, AWB, direction, received by, timestamp, acknowledged flag |

---

## 6. Requirements the ERP must improve on

The current tool is a single-file browser application with browser-local storage.
These are the constraints it cannot solve and the ERP must:

1. **Central, backed-up, multi-user storage.** Today data lives in one browser on
   one machine with manual backups. This is the primary reason for the ERP.
2. **Concurrent counter positions** with a shared register and no reference
   collisions.
3. **Daily-resetting reference sequence** (section 3.2 GAP).
4. **Normalised AWB matching** (section 3.6 GAP).
5. **Role-based access.** Today anyone can delete an invoice.
6. **An audit trail.** Today deletion is unlogged and irreversible.
7. **A tariff maintained as data**, versioned with effective dates, so a rate change
   does not require redeploying the application and historical invoices continue to
   reflect the rate that applied on their date.
8. **Accounting integration** for the cash handover and the Credit/CASS receivables
   that the counter currently only records.
9. **Customer personal data and banking details held as configuration and
   secured data, not in application source or build artefacts**, with
   non-production environments using generated or masked data. See
   [`08-data-protection.md`](08-data-protection.md) §6 for the properties the
   replacement is expected to carry forward.
10. **Validation on master-data import**, so a malformed or misplaced value is
    rejected or flagged rather than flowing through to a printed document.
11. **Shipment data from the source, not re-keyed.** Today the counter pastes a
    manifest into a local Shipment Database so an advice fills from its AWB. The
    ERP should take shipment data straight from the booking or cargo management
    system, keyed by AWB, keeping the same guards: no fill across export and
    import, and no stale details left under a changed AWB.
12. **A billing party distinct from the AWB owner**, drawn from the ERP's real
    customer master, with its TRN and address printed on the tax invoice.

---

## 7. Reference material available on request

- The controlled forms CGS-GND-F037 and CGS-GND-F038 as printed today.
- The official warehouse tariff sheet the rates derive from.
- Operational master data, under NDA.
- A working copy of the current application for demonstration. **It ships with a
  generated customer master and no bank details**, so it can be handed over and
  demonstrated freely; it behaves identically to the operational system.
- [`08-data-protection.md`](08-data-protection.md) — the data-handling standard
  the current system meets and the replacement is expected to meet.
- [`09-governance.md`](09-governance.md) — how the current system is controlled,
  including the risk register.

> Customer data, bank details and the tariff are confidential and will be shared
> under the executed NDA only, not through this document.
