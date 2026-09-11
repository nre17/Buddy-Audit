# Documentation

Read in this order depending on why you are here.

## I am picking this project up for the first time

1. [`../README.md`](../README.md) — what it is, how to run it
2. [`01-architecture.md`](01-architecture.md) — how it is put together and why single-file
3. [`04-code-map.md`](04-code-map.md) — where everything lives, so you never read the whole file
4. [`05-audit-findings.md`](05-audit-findings.md) — what is known to be wrong with it
5. [`08-data-protection.md`](08-data-protection.md) — what data this repository may hold, and the controls that keep it that way

## I am about to change the code

1. [`../CLAUDE.md`](../CLAUDE.md) — the constraints. Non-negotiable ones.
2. [`04-code-map.md`](04-code-map.md) — find your region
3. [`02-data-model.md`](02-data-model.md) — if you touch anything persisted
4. [`03-business-rules.md`](03-business-rules.md) — if you touch anything that prices
5. [`08-data-protection.md`](08-data-protection.md) — **before you commit anything**
6. [`09-governance.md`](09-governance.md) — which class of change you are making
7. [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — branch, test, PR

## I run the counter, not the code

1. [`06-operations-runbook.md`](06-operations-runbook.md) — setting up a machine,
   backups, recovery, rolling out a new version, troubleshooting.
   **Section 0 first on a new machine; section 0a each morning to load the
   manifest; then the daily backup.**

## I am briefing the ERP vendor

1. [`07-erp-handover-spec.md`](07-erp-handover-spec.md) — the whole process,
   written for an implementation team, with the current system's gaps marked
2. [`03-business-rules.md`](03-business-rules.md) — the full rate card
3. [`08-data-protection.md`](08-data-protection.md) §6 — the data-handling
   requirements the replacement system must carry forward
4. [`09-governance.md`](09-governance.md) — how this system is currently
   controlled, and the risk register

---

| Document | Contents |
|---|---|
| [`01-architecture.md`](01-architecture.md) | Single-file rationale, boot model, data flow, rendering model, persistence, printing |
| [`02-data-model.md`](02-data-model.md) | `DB` and `LL` shapes field by field, all three migrations, how to write a new one, storage budget, the Shipment Database store |
| [`03-business-rules.md`](03-business-rules.md) | The charge formula, cargo classes, every automatic and optional charge with rate, minimum and VAT, payment and cash rules, AWB owner and billing party, Shipment Database lookup and date rules |
| [`04-code-map.md`](04-code-map.md) | Line-range map, function index, the regions never to read, naming conventions |
| [`05-audit-findings.md`](05-audit-findings.md) | Findings with severity, evidence, suggested fix and a recommended order. Seven closed. |
| [`06-operations-runbook.md`](06-operations-runbook.md) | Daily backup, restore, deployment, browser rules, month-end, troubleshooting |
| [`07-erp-handover-spec.md`](07-erp-handover-spec.md) | Process specification for the ERP vendor, including what the ERP must improve on |
| [`08-data-protection.md`](08-data-protection.md) | Data classification, the demo-data policy, the automated controls, incident procedure |
| [`09-governance.md`](09-governance.md) | Roles, change classes, release and rollback, quality gates, risk register, decision log |
