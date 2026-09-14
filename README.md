# SolitAir Cargo Workspace

A local application for warehouse bookings, shipment intake, charge advice, invoicing, warehouse tracking, security reconciliation and shift handover. This fork replaces the single HTML prototype with organized JavaScript modules, a navigable operations interface and a local disk-backed workspace.

**Start with [the revamp review](docs/revamp/README.md)** for the full audit, system map, delivered changes and next work.

Version 2.1 adds the [internal booking desk](docs/bookings/README.md). The [dnata reference](docs/bookings/dnata-reference.md) separates the scheduling model from unverified commercial terms. [ULD reconciliation](docs/uld/exploration.md) is research and a pilot proposal only.

## Open it on Windows

Double-click **Launch SolitAir.cmd**. The launcher finds Node, installs locked dependencies on first use when a supported package manager is available, builds the app, starts or reuses its local server, then opens [the workspace](http://127.0.0.1:4380). It also supports the Node runtime bundled with Codex on this machine.

First-time setup on another machine: install Node.js 22.13 or newer, then:

```powershell
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm start
```

The launcher reports an occupied or incompatible port without stopping another service. Set `SOLITAIR_PORT` to choose another port and `SOLITAIR_DATA_DIR` to choose another local storage directory. Keep the same port and directory for the same workspace.

## Workspaces

| Workspace | Purpose |
| --- | --- |
| Overview | Record-based metrics, exceptions, recent shipments and quick actions |
| Shipment Database | Preview and validate pasted CSV/TSV manifests; inspect row issues |
| Export / Import Bookings | Delivery and collection appointments, shared staff demand, coordination, arrivals and reviewed late-charge proposals |
| Export / Import Advice | AWB lookup, billing party, calculated charges, payment allocation and printing |
| Warehouse / Lying List | Recorded cargo and scheduled departures |
| Facility Security | Reception records matched to invoices by AWB and direction |
| Invoice Register | Saved invoices, cash movements, filters and CSV/XLSX exports |
| Shift Handover / Dashboard | Recorded activity, cash position, reports and analysis |
| Customers / Rates & Data | Demo customer master, tariffs, site details and backup/restore |

Search an AWB, customer, booking or invoice with **Ctrl+K**. A shipment drawer connects its bookings, manifest, invoices, warehouse records and security receptions.

## Saving and recovery

- A save first writes one complete browser recovery cache. The status banner confirms when it reaches disk; keep the window open if disk saving fails.
- Normal storage is `.data/snapshot.json`, with up to 20 previous revisions in `.data/backups/`. The server writes snapshots atomically and rejects stale revisions.
- Complete workspace backups include bookings and their history/policy, ledger/settings, shipment records and warehouse history. Use **Rates & Data → Download Backup** for a portable copy.
- Restore validates and migrates before changing current state. Legacy register-only backups are supported; their missing shipment/warehouse history cannot be reconstructed.
- Unsynced caches are bound to a workspace identity. A conflict preserves the recovery copy and pauses writes; download it before reloading and reconciling.
- `?storage=browser` opens an explicitly labelled sandbox using a separate cache key and no disk writes.
- Disk snapshots on this machine are not protection against losing the machine. Keep separate backup copies.

Closing the browser leaves the background server running. For a foreground server that stops with Ctrl+C, use `pnpm build` then `pnpm serve`. For a launcher-started server, `.data/.server.lock` records its PID; verify that PID belongs to this project's `tools/server.mjs` before stopping it. Never delete snapshots to restart the app.

Old `file://` browser data does not automatically move to a localhost origin. Open the old version, download its backup and restore it here. The original source is retained in Git at [the audited baseline](https://github.com/nre17/Buddy-Audit/tree/f0f0fdb5cc506bfd3dfc0c465395c165c2bae4ce).

## Development

```powershell
pnpm build               # source → dist
pnpm start               # build, serve locally, open browser
pnpm test                # build + domain/server tests + browser regressions
pnpm verify              # data-pattern guard + build + all tests
pnpm test:one 14-domain   # one browser spec (build first)
```

Browser tests use isolated contexts and temporary HTTP servers. Install test Chromium with `pnpm exec playwright install chromium`, or set `CHROMIUM_PATH`; the harness also detects installed Chrome/Edge on Windows. No tests write to the working `.data` directory.

```text
src/core/       runtime, boot, schema/migrations and persistence
src/domain/     pure booking rules and tariff catalogue
src/features/   shipment, advice, register, warehouse and reporting modules
src/ui/         shell, search, record drawers and dialogs
src/styles/     shared and workspace styles; print layout
src/data/       generated master import, sample data and branding
tools/          build, launcher, local server, repository guard
tests/          domain, server and browser behavior tests
fixtures/       fictional demonstration data
docs/revamp/    audit, decisions, knowledge map and roadmap
docs/bookings/  booking workflow, assumptions and dnata references
docs/uld/       exploratory ULD reconciliation design
```

ES modules currently share an explicit `app` runtime. A compatibility bridge keeps the existing regression suite useful. Bookings use pure domain functions and a validated command adapter; extracting the inherited advice and finance calculations is still future work.

## Current scope

This is an internal local prototype with a synthetic customer master, without public customer submission or ERP access. Booking charges are disabled initially; optional company policies create review proposals only. Tariff behavior in advice is preserved from the audited application. Staff selection is attribution, not authentication. Formal cargo acceptance, ULD inventory, actual movement evidence, authoritative customer integration, immutable financial records and ERP/payment settlement remain future work. See the [prioritized roadmap](docs/revamp/README.md#prioritized-next-work).

The source still contains the inherited commercial tariff. Repository visibility is controlled by this fork's owner. Runtime data and backups are ignored by Git; the structural data scanner is a useful check, not proof that every file is free of confidential information.

Historical numbered documents under `docs/` describe the original prototype and decisions. Current operational and development instructions are this README and `docs/revamp/`.
