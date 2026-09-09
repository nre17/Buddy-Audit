# 09 — Governance

How changes to this system are proposed, reviewed, released and recorded.

This is a small system run by a small team. The controls below are deliberately
the minimum that make the system auditable and safe to change — not a process
borrowed from a larger organisation.

---

## 1. What this system is

| | |
|---|---|
| **Name** | SolitAir Cargo — Charge Advice & Invoicing System |
| **Purpose** | Raise, price and record export and import cargo charge advices at the DWC counter; reconcile cash per shift |
| **Classification** | Business-critical. It is the only record of counter revenue. |
| **Users** | Counter staff, DWC |
| **System of record** | The browser `localStorage` of each counter machine |
| **Lifecycle stage** | Production, pending replacement by an ERP |
| **Data classification** | Confidential — commercial tariff, customer transactions, cash positions |

### Standing constraints

These are architectural commitments, not preferences. Breaking one is a design
decision that needs recording in §7, not a routine change.

1. **One self-contained file.** No build step, no external assets, no network
   calls. It must run from `file://` on a machine with no internet.
2. **ES5 only.** It runs on whatever browser the counter machine has.
3. **Any change to a persisted shape requires a migration** in `load()`. Live
   machines hold records written by older versions.
4. **Demo data only in source control.** No customer, staff or banking data,
   and no description of it. See [`08-data-protection.md`](08-data-protection.md).

---

## 2. Roles

| Role | Responsibility |
|---|---|
| **System owner** | Approves tariff and business-rule changes. Owns the decision to replace the system. |
| **Maintainer** | Reviews and merges changes, runs releases, holds the backup discipline. |
| **Counter staff** | Operate the system, take the end-of-shift backup, report defects. |
| **ERP vendor** | Receives the handover specification. No access to this repository. |

On a team this size one person may hold several roles. What must not happen is
one person both making a tariff change and being the only person who reviewed
it — see §3.

---

## 3. Change control

### 3.1 Classes of change

| Class | Examples | Requires |
|---|---|---|
| **A — Business rule** | Tariff rates, VAT, free-storage hours, charge logic, invoice numbering | System owner's written approval, recorded in the PR |
| **B — Behaviour** | New field, changed validation, new report, layout change | Maintainer review |
| **C — Internal** | Refactor, comments, dead-code removal, docs | Maintainer review |
| **D — Data** | Anything touching the customer master or fixtures | Maintainer review **and** a clean `npm run scan` |

Class A changes affect money. They do not go in the same pull request as
anything else.

### 3.2 The route

1. Branch from `main`. Never commit to `main` directly.
2. Make the change. Keep it to one concern.
3. `npm test` — all 50 cases must pass.
4. `npm run scan` — must be clean.
5. Open a pull request using the template. State the class, what changed, and
   how it was verified.
6. Review, merge, release (§4).

### 3.3 Definition of done

- [ ] The regression suite passes locally and in CI
- [ ] `npm run scan` is clean
- [ ] New behaviour has a test that fails without the change
- [ ] Any persisted-shape change has a migration **and** a migration test
- [ ] Affected documentation updated in the same pull request
- [ ] `CHANGELOG.md` updated
- [ ] Class A only: owner approval recorded in the PR

### 3.4 Branch protection

`main` should require: a pull request, a passing CI run, and no force-pushes.
See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for the commands.

---

## 4. Release and rollback

There is no deployment pipeline. A release is a file copied to counter machines.

**Before**

1. CI green on `main`.
2. Tag the release: `git tag -a v1.2.0 -m "..."` and push the tag.
3. **Take a backup on every counter machine** (Rates & Data → Download Backup).
   This is the rollback position and it is not optional.

**Release**

4. Copy `app/solitair-invoicing.html` to each counter machine, replacing the
   existing file. Keep the previous file as `solitair-invoicing.<version>.html`.
5. Open it. Confirm the register still lists yesterday's invoices and the cash
   position is unchanged.
6. Confirm company and bank details still print correctly (they live in browser
   storage, not the file, so they should survive — verify rather than assume).

**Rollback**

7. Restore the previous file, then restore the backup taken at step 3.

> Data written by a newer version may not be readable by an older one. Rolling
> back after a shift has been worked will lose that shift unless the backup is
> restored. This is a known limitation of a file-based release.

---

## 5. Risk register

| ID | Risk | Impact | Likelihood | Mitigation | Owner |
|---|---|---|---|---|---|
| R-01 | Total data loss — browser storage cleared, machine reimaged, profile lost | Critical. Every invoice, the cash ledger and all handover history. | Medium | Mandatory end-of-shift backup (runbook §2). No technical control prevents it. | Maintainer |
| R-02 | Invoice references do not restart daily (audit A-02) | High. The reference format promises a daily sequence it does not produce; an audit trail that misrepresents itself. | Certain — present now | Documented in `05-audit-findings.md`; flagged as a gap to the ERP vendor | Owner |
| R-03 | Customer or banking data committed to the repository | High. Personal-data disclosure. | Low | `pii-scan` in CI; private repository; `08-data-protection.md` | Maintainer |
| R-04 | Single maintainer — no continuity | High | Medium | This documentation set exists so a competent engineer can pick the system up cold | Owner |
| R-05 | Divergent versions across counter machines | Medium. Different staff pricing differently. | Medium | Release checklist §4; version visible in the app footer | Maintainer |
| R-06 | Tariff change applied incorrectly | High. Systematic mis-billing until noticed. | Low | Class A change control; rate tests in the suite | Owner |
| R-07 | ERP migration loses history | High | Medium | Export requirements in `07-erp-handover-spec.md`; keep final backups indefinitely | Owner |

---

## 6. Quality gates

| Gate | Mechanism | Blocks merge |
|---|---|---|
| Regression suite (50 cases) | `npm test`, CI | Yes |
| Repository data guard | `tools/pii-scan.js`, CI | Yes |
| Demo master reproducible | CI regenerates and diffs | Yes |
| No external asset references | CI grep | Yes |
| No live backups committed | CI grep + `.gitignore` | Yes |
| Documentation current | Review | Yes, by convention |

The regression suite is the load-bearing control. This application has no type
system and no framework; the suite is the only thing that makes a refactor
safe. It must stay green and it must grow with the system.

---

## 7. Decision log

Architectural decisions and their reasoning. Append; do not rewrite.

| # | Date | Decision | Reasoning |
|---|---|---|---|
| D-01 | — | Single self-contained HTML file | The counter has no reliable network and no IT support for installed software. A file that works when everything else is down was worth the architectural cost. |
| D-02 | — | `localStorage` as the system of record | No server available. Accepted with the known consequence recorded as R-01. |
| D-03 | — | Playwright regression suite over a framework rewrite | The system works and is in daily use. A safety net around it is worth more than a rewrite that risks its behaviour. |
| D-04 | 2026-09-10 | Ship a generated customer master of 1,892 fictional records rather than any counter-machine data | Customer personal data must not be in source control, and a generated set of realistic size and patchiness is a better test bed than a hand-written one. See `08-data-protection.md`. |
| D-05 | 2026-09-10 | Hold the company TRN and bank details as per-machine runtime configuration rather than in source | Financial details must not sit in a build artefact. Reuses the existing `DB` → `CFG` override pattern already used for rates, free hours and staff. |
| D-06 | 2026-09-10 | Keep the form codes CGS-GND-F037/F038 on printed advices, remove them from on-screen panel headings | They are document-control identifiers required on the printed record; on screen they were visual noise. |
| D-07 | 2026-09-10 | Structural repository scanner with no denylist | A denylist or hash list of short numeric identifiers would itself disclose them. Shape-based rules give the same protection while carrying nothing sensitive. |

---

## 8. Replacement

This system is a prototype that became production. It is not the intended
long-term platform.

[`07-erp-handover-spec.md`](07-erp-handover-spec.md) is the requirements
document for the replacement. It describes the current behaviour in full,
including the rate card, and marks the current system's known gaps explicitly so
they are not inherited.

Until the replacement is live, this system stays under the change control above.
"It is being replaced anyway" is not a reason to lower the gates — it is in
daily use and it handles money.

---

## Related

- [`08-data-protection.md`](08-data-protection.md) — data classification and demo-data policy
- [`05-audit-findings.md`](05-audit-findings.md) — open technical findings
- [`06-operations-runbook.md`](06-operations-runbook.md) — daily operations
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — the practical workflow
