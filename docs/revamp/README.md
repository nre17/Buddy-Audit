# Cargo workspace revamp: start here

**Working branch:** `audit/full-repo-review` · **reviewed baseline:** `f0f0fdb` · **review date:** 14 September 2026.

The repository now runs as a modular local application: a browser workspace, an esbuild bundle, a Node server, and a complete saved workspace on disk. The original counter workflows remain available through a new navigation shell. The next stage is a more explicit operational and financial record model; this delivery is not a production-readiness certification.

## Read the review in this order

| Document | Use it for |
| --- | --- |
| [System and record map](system-map.md) | Current module boundaries, saved entities, data flow, the AWB relationship graph, and where every baseline file belongs. |
| [Architecture and safety audit](architecture-audit.md) | Baseline defect evidence, persistence/security risks, migration rationale and the delivered local server controls. |
| [Domain and ingestion audit](domain-audit.md) | Commercial invariants, ingestion failure cases, operational ambiguities and the proposed domain boundaries. |
| [Product and design direction](product-design.md) | Screen hierarchy, interaction patterns, source transparency, design choices and proposed future workflows. |

The audit tables describe the original `f0f0fdb` code unless expressly marked as an implementation update. Their line numbers point to that baseline. This index and the [system map](system-map.md) describe the integrated application. Proposed React/Vite, typed service layers, formal acceptance and ULD models in the initial reviews are recommendations, not claims about the delivered implementation.

## Open and validate the app

From the repository root, with the documented Node runtime and dependencies installed:

```powershell
npm run build
npm start
```

On Windows, double-click **Launch SolitAir.cmd** for the build-and-open experience. It resolves the project directory, builds the current source, checks the local service identity, reuses a compatible running server or starts one, and opens the browser. Default address: [SolitAir local workspace](http://127.0.0.1:4380). Closing the browser does not stop a background server. Normal startup does not erase saved data.

```powershell
npm test
npm run verify
```

Use the [root README](../../README.md) for installation, current script definitions and stopping/restarting instructions. Test data must remain isolated from the working disk store. The browser-only sandbox uses `?storage=browser`; its cache key is separate from the normal workspace, and its status is visible in the UI. Normal recovery data carries a verified workspace identity, preventing pending data from being applied to another disk workspace at the same URL. Server tests create isolated temporary data directories.

## What this delivery changes

| Area | Delivered | Boundary that remains |
| --- | --- | --- |
| Application structure | Explicit ESM feature files, separate source data/styles, esbuild output, local HTTP startup and Windows launcher. | Functions still register on a shared mutable `app` object. Most forms still use the original DOM/string-rendering model; this is not a completed pure-domain or component rewrite. |
| Working interface | Overview, grouped navigation to all ten existing features, history/refresh support, global search, shipment/invoice drawers, connected AWB trail, responsive tables and isolated print styling. | The trace uses existing IDs and AWB matches. It is not an immutable lifecycle graph or a graph database. |
| Persistence | A versioned envelope covers ledger/settings, shipment lookup and warehouse state. Browser recovery cache, serialized disk writes, revision conflicts, process ownership and twenty retained previous revision backups. | The first save is accepted into browser cache; disk flush follows asynchronously. The disk-status banner is the acknowledgement of durable persistence. This is a local-machine system, not authenticated shared storage. |
| Failure handling | Failed or blocked local persistence restores all in-memory stores and effective settings to the last locally accepted snapshot. Register, settings and manual warehouse mutations check persistence before success/continuation; advice and manifest failures preserve drafts/input. Validated restore and conflict recovery use the same boundary. | Disk flush remains asynchronous after local acceptance. Field-level schemas and pure command boundaries still need consolidation before shared operational use. |
| Ingestion | Strict checks reject invalid weight/piece values and invalid nonempty dates; invalid rows block the import. Title/header handling improves. Source row, warnings and synthetic/manifest classification are retained. Older imported AWBs are no longer silently evicted after thirty days; they remain until explicit clearing or same-AWB replacement. | No retained raw source file, immutable import batch, before/after shipment revision history, native workbook parser or ERP feed. |
| Open advice | Reimport refreshes unchanged source fields while retaining operator edits, and advises the operator that source data changed. Impossible quantities, negative financial inputs and reversed timestamps are rejected. | The form remains an in-memory draft; it does not have a durable revision/field-acceptance workflow. |
| Security reconciliation | Reception matching checks normalized AWB and direction; an opposite-direction invoice does not resolve the reception. | Matching does not establish a formal shipment occurrence, screening completion or physical release. |
| Commercial behavior | Existing tariff behavior, explicit billing party, supported allocations, CSV/XLSX and controlled advice outputs remain the compatibility baseline. | Rounding policy, stable catalogue/version references, immutable issuance and settlement are separate work. No tariff correction is implied by this revamp. |

## A useful review journey

1. Open **Overview**. Read the all-dates basis of the metrics; click a metric to inspect its records. A warehouse-list count is a recorded list count, not a physical inventory statement.
2. Open **Shipment Database** and review the manifest workflow. On a fresh workspace, sample shipments are synthetic. Imported rows and older unclassified rows keep distinct source labels.
3. Search an AWB from the topbar or use **Ctrl+K**. Inspect owner, route, invoice links, warehouse rows and reception count in its detail drawer.
4. Start the correct **Export Advice** or **Import Advice** from that record. Check source-filled values, billing party, active charges and allocation before preview/save.
5. Follow the saved record through **Invoice Register**, **Warehouse / Lying List**, **Facility Security**, and **Shift Handover**. These are related records with different meanings, not interchangeable lifecycle statuses.
6. Open **Rates & Data** to inspect settings and download a complete workspace backup. A legacy register-only backup cannot supply missing historical shipment or warehouse data.

The customer master remains generated demonstration data. Staff selection is attribution, not sign-in. Real customer data, payment settlement, authentication, formal acceptance and ULD operations are not silently supplied by the new shell.

## Prioritized next work

| Priority | Work package | Concrete finish condition | Audit basis |
| --- | --- | --- | --- |
| 1 | Financial record integrity | Define reference scope; issue unique references transactionally; preserve issued invoices; represent voids/reversals/replacements and dated cash adjustments; retain actor/reason history. | R-10/R-12/R-13, D-06/D-09/D-10. |
| 1 | Shared domain calculations and save commands | One tested charge/money policy and cash projection; every mutation uses the same validated command boundary; failed browser/disk writes and conflicts have consistent outcomes. | R-01/R-02/R-06/R-10/R-14, D-01/D-02/D-05/D-10. |
| 1 | Historical document and shift fidelity | Persist the required issuer, branding, tariff and warehouse context; adopt a defined shift-boundary policy; saved reports reproduce their original content. | D-11/D-12, R-09. |
| 2 | Evidence-preserving ingestion | Import batches retain raw values, mapping/date conventions, issues and row identity; preview new/changed/conflicting rows; persist accepted shipment revisions and manual reconciliation decisions. | D-03/D-04/D-13 and the ingestion audit. |
| 2 | Shipment identity and actual operations | Define an AWB occurrence/flight identity, planned versus observed events, receipt/hold/release/departure evidence, warehouse location and explicit reconciliation links. | D-08/D-14. |
| 2 | Real master data and user model | Specify customer IDs/authoritative source, approved data intake, authenticated operators and appropriate permissions. Decide backup ownership and restore drills before real deployment. | R-03/R-08/R-12 and the data-protection review. |
| 3 | Formal acceptance and ULD workflows | Agree operator checklists, evidence, exception ownership, ULD identity/type/condition and build-up/breakdown rules; implement end-to-end workflows against supplied examples. | Scope gap in product/domain reviews. |
| 3 | ERP and settlement integration | Versioned external contracts, idempotent submission, acknowledgement/retry history, transaction/receipt/allocation records and reconciliation to the receiving system. | D-09 and the ERP boundary review. |

Do not build a network visualization before these record identities and relationships are reliable. The existing AWB detail is the starting point: every displayed link should be explainable and every claimed state should have supporting evidence.

## Handover for the next working session

- Start from the working branch and inspect `git status`; preserve uncommitted integrated work. The baseline is retained in Git for comparison.
- The original HTML, one-time extraction tooling and obsolete duplicate persistence module have been removed. Use the [exact baseline source](https://github.com/nre17/Buddy-Audit/blob/f0f0fdb5cc506bfd3dfc0c465395c165c2bae4ce/app/solitair-invoicing.html#L1) for historical evidence; current load/save behavior lives in `src/core/workspace-storage.js`.
- Read `src/main.js`, `src/core/workspace-storage.js` and [the module map](system-map.md#module-and-dependency-map) before changing initialization or persistence.
- Use feature ownership boundaries when delegating: `src/ui/`, `src/features/`, persistence contracts, and local server are separate useful work packages. Coordinate shared-runtime changes explicitly.
- Keep legacy fixtures as migration evidence. Keep generated demo data separate from private/customer operational data and do not put downloaded workspace backups into Git.
- Update this index when a proposed capability becomes implemented; audit evidence remains historical. Record actual validation commands and totals after the integrated suite completes.

## Validation record

Repository cleanup removed four fork branch aliases only after fetching and confirming each tip was already an ancestor of `origin/main`: `feat/awb-first-advice`, `feat/sample-shipments-first-open`, `fix/blank-until-first-invoice` and `fix/harness-reload-race`. Their commits remain reachable through the baseline. The working audit branch, `main` and the upstream repository were preserved.

Verified locally on 14 September 2026:

- **Server: 13/13 passed**, including atomic writes, restart, failed writes, revision conflicts, backup rotation and serving boundaries.
- **Browser: all 134 distinct cases passed across the integrated run and focused reruns**, using Node 24.19.0 and installed Chrome 153.0.8010.36 on Windows. The first complete run recorded 129 passes and five failures: two inherited Overview/layout expectations and three browser-shutdown timeouts. After correcting those fixture expectations and bounding test-owned browser shutdown, spec 10 passed 31/31 and spec 14 passed 8/8. All other specs passed in the complete run. No application assertions were suppressed.
- **Fresh checkout:** exported the staged tree to an isolated temporary directory, installed with `pnpm install --offline --frozen-lockfile`, and successfully built and scanned that checkout. The temporary checkout was then removed.
- **Repository:** the generated customer master exactly matches its fixture after newline normalization; the structural scanner and staged artifact guard pass; all source/assets are tracked and runtime stores remain excluded; `git diff --cached --check` passes.
- **Launcher:** `Launch SolitAir.cmd --no-open` builds and starts the app. Repeating it reuses the verified service without changing its PID, workspace identity or disk revision.
- **Visual review:** inspected the running overview and advice form at desktop and 390-pixel mobile width. The working workspace contains synthetic sample shipments only.

Local logs are retained outside Git in `tests/output/full-verification.log`, `focused-awb-verification.log`, `focused-domain-verification.log` and `server-verification.log`. The reruns exercised forced shutdown with confirmed test-owned process exit; the additional independent OS/closed-endpoint fallback was reviewed but was not needed in those reruns. Specs 13–16 cover navigation/search/mobile behavior, domain input and failed-save handling, full restore and disk recovery/conflicts, sandbox/workspace separation, unchanged reloads, reception reconciliation and rendering/export boundaries. These checks do not certify production readiness.
