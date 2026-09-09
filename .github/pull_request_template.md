## What changed

<!-- One or two sentences. What behaviour is different for counter staff? -->

## Why

<!-- The request, the bug, or the audit finding ID (e.g. A-02). -->

## Change class

<!-- See docs/09-governance.md §3.1. Delete the ones that do not apply. -->

- [ ] **A — Business rule** (rates, VAT, free hours, charge logic, numbering)
      → requires the system owner's approval, recorded below
- [ ] **B — Behaviour** (new field, validation, report, layout)
- [ ] **C — Internal** (refactor, comments, dead code, docs)
- [ ] **D — Data** (customer master or fixtures)

Owner approval (class A only): <!-- who approved, when -->

## Checklist

- [ ] `npm test` passes locally (50+ cases)
- [ ] `npm run scan` is clean
- [ ] A test fails without this change (new behaviour or a fixed bug)
- [ ] No change to rates, minimums, VAT flags or auto-apply rules — or, if there is,
      the rate sheet version is cited below and `docs/03-business-rules.md` is updated
- [ ] Persisted shapes unchanged — or a migration was added to `load()` and covered
      in `tests/specs/09-migrations.spec.js`
- [ ] The app is still a single self-contained file (no external assets, no `fetch`)
- [ ] Docs updated if behaviour, rules or the data model changed
- [ ] `CHANGELOG.md` updated
- [ ] No customer data, bank details or rates in the diff, the commit messages
      or this description — and no description of counter-machine data either

## Verification

<!-- What you actually ran in a browser, not just what you read. -->
