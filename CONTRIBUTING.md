# Contributing & Git Workflow

How this repository is worked on, including with Claude Code.

---

## First-time setup

```bash
# 1. Verify the repository is clean before it goes anywhere.
npm run scan                # must print "clean"

# 2. Create a PRIVATE repository. Private is not optional: the commercial
#    tariff and the process design are confidential.
#    See docs/08-data-protection.md.
git init
git add .
git commit -m "Baseline: invoicing system, demo data, docs, regression suite"
git branch -M main
gh repo create solitair-invoicing --private --source=. --remote=origin --push

# 3. Protect main (GitHub → Settings → Branches → Add rule):
#    - Require a pull request before merging
#    - Require the CI checks to pass ("Regression suite", "Repository guards")
#    - Do not allow force pushes
#
#    NOTE: branch protection on a PRIVATE repository requires a paid GitHub
#    plan. On the free plan the rule cannot be created, so the pull-request
#    route in this document is a convention the team keeps rather than a
#    control the platform enforces. CI still runs on every push and every PR,
#    and still reports pass/fail - it just cannot block a direct push to main.
```

Then verify locally:

```bash
npm install
npx playwright install chromium
npm test                    # expect 50 passed
npm run scan                # expect clean
```

---

## Day-to-day flow

```bash
git checkout main && git pull
git checkout -b fix/a02-daily-reference-reset

# ... make the change ...
npm test

git add -p
git commit -m "Reset invoice reference sequence daily (A-02)"
git push -u origin HEAD
gh pr create --fill
```

Never commit to `main` directly. Never `git push --force`. Never rewrite published
history.

## Branch naming

| Prefix | For |
|---|---|
| `fix/` | A defect. Reference the audit ID if there is one: `fix/a06-dollar-helper` |
| `feat/` | New behaviour: `feat/hawb-quantity-fee` |
| `docs/` | Documentation only |
| `chore/` | Tooling, CI, dead code removal |

## Commit messages

Say what changed and why, in one line. Then detail if needed.

```
Reset invoice reference sequence daily (A-02)

References are formatted YYYY-MM-DD/NN but NN came from a counter that
never reset, so day two started at /02. Sequence is now stored against
the date and resets on rollover. Existing references are untouched.
```

**Never put customer names, bank details, AWBs or rate figures in a commit message
or PR description.** Commit history is forever.

---

## Working with Claude Code

Claude Code reads `CLAUDE.md` at the start of every session. That file carries the
constraints — single file, ES5, migrations, the `$()` trap, and the rule not to read
the customer block or the base64 logo line.

### Getting set up

```bash
cd solitair-invoicing
claude
```

Connect GitHub once, so it can open and review pull requests:

```
/install-github-app
```

### Prompts that work well here

Be specific about the file region and the expected verification. Vague prompts on a
5,000-line file produce vague, expensive results.

**Fixing an audited issue:**
> Read docs/05-audit-findings.md A-02 and docs/02-data-model.md. Implement the daily
> reference reset in refFor()/previewRef() — they are the only two places that build
> a reference. Existing references must not be renumbered, so add DB.seqDate on
> first boot. Add a spec that seeds two invoices on different dates and asserts the
> second day starts at /01. Run npm test and show me the diff.

**Reviewing:**
> Review the diff on this branch against CLAUDE.md and docs/03-business-rules.md.
> Flag anything that changes a rate, breaks the single-file constraint, changes a
> persisted shape without a migration, or duplicates the charge formula. Do not
> change any code — report only.

**Auditing:**
> Audit the shift handover region for the same class of bug as A-06: a
> compound selector passed to $(). Report findings with line numbers, propose fixes,
> change nothing yet. Use docs/04-code-map.md to locate the region rather than
> reading the whole file.

**Cleaning:**
> Apply audit finding A-15: fold the 22 inline form-field style attributes into
> modifier classes on the existing `.f input` rule. This changes padding and corner
> radius visibly, so screenshot all eight tabs before and after and show me the
> comparison. Run npm test. Do not touch anything else.

**Checking the repository is safe to push:**
> Run npm run verify. Then grep the whole repo for anything that looks like a
> routable email domain, a +971 number without 555, or a 15-digit tax number that
> is not in fixtures/customers.demo.json. Report what you find.

### What to hold it to

- It must run `npm test` and show you the result, not claim it passed.
- It must not change rates, minimums or VAT flags unless you asked and cited the
  rate sheet.
- It must not "improve" code it merely happened to read.
- If it changed a persisted shape, it must show you the migration and the spec.
- Ask for the diff. Read it. Verification is your job, not the model's.
- **It must never put a customer name, email, phone, address, tax number or
  bank detail into any file**, and must not describe counter-machine data in a
  comment, doc or commit message either. If you paste working data into the chat
  to explain a bug, do not let it be committed. Run `npm run scan` first.

---

## Definition of done

1. `npm test` passes, 50+ cases, zero console errors.
2. `npm run scan` is clean.
3. A test fails without your change.
4. Any persisted shape change has a migration and a migration spec.
5. Docs updated if behaviour, rules or the data model moved.
6. `CHANGELOG.md` has an entry.
7. The change class is stated in the PR (see `docs/09-governance.md` §3.1).
   Business-rule changes need the system owner's approval recorded there.
8. The PR checklist is completed honestly.

## Releasing to the counter

Merging does not deploy anything. Follow `docs/06-operations-runbook.md` section 3.
Back up the counter machine first, always.

The register is tied to the **browser profile**, not to the file's path, so
replacing the file in place is safe and renaming it loses nothing. The hazard runs
the other way: every local copy opened in that browser shares the same data, so
never open a test or demo copy in the counter's browser. Use a separate browser
profile. See audit A-20.
