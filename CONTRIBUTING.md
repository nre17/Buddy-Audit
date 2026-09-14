# Working on this fork

Install Node.js 22.13+ and the pinned pnpm version in `package.json`, then run `pnpm install --frozen-lockfile`.

Make changes in `src/`, build with `pnpm build`, and open the local app using `pnpm start` or `Launch SolitAir.cmd`. Use `?storage=browser` for an isolated browser sandbox. Full browser tests create their own contexts and HTTP servers; disk tests use temporary directories.

Run `pnpm verify` before proposing a change. Preserve relevant regression coverage and add meaningful tests for data-loss, calculation, migration, validation or cross-workflow behavior. Keep `.data/`, backups, manifests, generated builds and test output outside commits.

Work on a branch and describe the actual behavior change, verification and remaining limits. The original prototype and its constraints are historical; the owner has authorized a full redesign. Refer to [the roadmap](docs/revamp/README.md) to avoid losing domain context.

Public/private repository settings belong to the owner of this fork. The inherited tariff remains in source; the automated structural scanner does not audit Git history or recognize every kind of confidential data.
