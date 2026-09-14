# SolitAir workspace

This fork is undergoing an owner-authorized full revamp. Historical single-file/ES5/no-server constraints do not apply.

- Source: `src/`; build: `node tools/build.mjs`; app: `node tools/launch.mjs`.
- Start with `docs/revamp/README.md` and `docs/revamp/system-map.md`.
- `app` in `src/core/runtime.js` is the explicit shared runtime during the domain migration. Avoid creating new browser-global dependencies.
- `src/core/workspace-storage.js` owns persistence. Full snapshots cover DB, shipments and warehouse together. Preserve migrations, workspace identity, recovery caches and revision-conflict checks.
- The local working store is `.data/`; tests use isolated temporary stores. Never reset the working store to make a test pass.
- Preserve owner/billing-party meaning and existing tariff behavior unless a task deliberately changes those rules. Test calculation and migration changes at behavior boundaries.
- Use supplied synthetic fixtures; no counter-machine backups or private PMO data in source control.
- Use `pnpm verify` for complete validation. UI tests target built HTTP output, not the historical HTML file.
- User instructions determine scope. Keep current docs synchronized with completed implementation; label proposals and inherited audit findings accurately.
