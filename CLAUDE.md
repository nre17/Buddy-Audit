# CLAUDE.md

Project instructions for Claude Code. Read this fully before touching any file.

## What this is

A single-file, offline, browser-based charge advice and invoicing system for the
cargo counter at SolitAir Cargo Express Services DWC-LLC (Dubai World Central).
It is a **prototype** for demonstration and the ERP handover, running on demo
data, but its charge logic is what the ERP will be specified from. Treat every
change as carefully as a change to a live finance system.

- The entire application is one file: `app/solitair-invoicing.html` (~5,700 lines).
- No build step. No server. No npm dependencies at runtime.
- It is opened by double-clicking the file (`file://` protocol) in a browser.
- All data persists to **browser `localStorage` only**. There is no database.

## Critical constraints — do not violate these

1. **It must stay a single self-contained HTML file.** No external CSS, JS, fonts,
   images, or `fetch()` calls. It runs from `file://`, where `fetch()` of local
   files is blocked by CORS and any external request may fail offline. Assets are
   embedded as `data:` URIs.
2. **Never break `localStorage` compatibility.** Staff have live invoice data under
   the keys `solitair_db` and `solitair_lying_v1`. If you change a persisted shape,
   you MUST add a backfill migration in `load()` (see `docs/02-data-model.md` for
   the two existing migrations and the pattern to follow).
3. **Never edit the file by re-typing large regions.** It contains a
   56,000-character single line (the embedded logo) and about
   1,900 lines of customer master data. Use targeted, surgical edits (see
   "How to edit" below).
4. **Run the test suite before and after every change.** `npm test`. A change that
   turns a passing suite red is not done.
5. **Never commit customer, staff or banking data, and keep this repository
   PRIVATE.** See "Data rules" below. Run `npm run scan` before committing.

## Data rules (read before writing any code or committing anything)

**This repository holds demo data only, and it must stay that way.**

| In the repo | What it is |
|---|---|
| `CUSTOMERS` (the large array near the top) | 1,892 fictional companies from `tools/generate-customers.py`, each with a fake TRN and address. Listed on the Customer Database tab, and exactly what the AWB owner and billing party pickers offer. Emails use the reserved `.example` TLD, phone numbers contain `555`. |
| `CFG.bank`, `CFG.company.trn` | The literal string `"Not configured"`. Site configuration, entered per machine under Rates & Data, held in that browser only. |
| `CFG.staff` | `Counter 1` … `Counter 6`. |
| Sample-data seed, fixtures | Generated customers; air waybills in the reserved `780-3090xxxx` band. |
| `EXPORT_LINES` / `IMPORT_LINES` | The genuine commercial tariff. Confidential, but not personal data. |
| Shipment Database (`solitair_shipments_v1`) | Nothing in the repo. Manifests are pasted on the counter machine; demo shipments come from `shDemoItems()` in the reserved `780-3090xxxx` band. |

### Rules

- **Never commit a customer name, email, phone, address or tax number** - not in
  code, tests, fixtures, docs, commit messages or PR descriptions. Git keeps
  deleted files.
- **Never put bank details or a company tax number into `CFG`.** They are
  runtime configuration; `applySiteOverrides()` reads them from `DB`.
- **Tests must not hardcode a customer name.** Use `h.SAMPLE_CUSTOMER` /
  `h.OTHER_CUSTOMER` from the harness.
- **Run `npm run scan` before you commit.** It runs in CI and will fail the
  build. It is the control that keeps the statement at the top of this section
  true.
- Never commit a shipment manifest (`.csv`, `.tsv`, `.xlsx`, `.xls`). They name
  customers and shipments; `.gitignore` and CI block them.
- Never commit a `localStorage` export from a counter machine. `.gitignore`
  blocks `*.backup.json` and `data/`.
- Keep the repository private regardless. The tariff is confidential.
- **Do not document counter-machine data anywhere in this repository** - not its
  contents, not its volumes, not its field coverage. Descriptions of live data
  are themselves sensitive.

If you regenerate the customer master, commit the regenerated
`fixtures/customers.demo.json` too - CI diffs it against the generator, and
replace the `CUSTOMERS` array in the app in the same change.

Full policy: `docs/08-data-protection.md`.

### Invariants on the advice record

- `cust` is the **AWB owner**. The Register, Dashboard, Shift Handover and the
  exports all report on it. Do not repurpose it.
- The **billing party** is `billTo` / `billTrn` / `billAddr`. Its TRN and address
  are the only ones on the form, and it is the only party printed on the advice
  (`billingOf()`). The AWB owner is never printed.
- Both pickers list exactly `CUSTOMERS`. `DB.customers` is offered nowhere: a
  browser used before may hold other customer names in it.
- `acct` and `addr` are legacy mirrors of `billTrn` / `billAddr`, kept so a backup
  still prints correctly if restored into an earlier version. Keep writing them.
- Shipments (`SH`, key `solitair_shipments_v1`) are a lookup table, not a record.
  They are outside `DB` and outside the backup on purpose. See docs/02-data-model.md.

## How to edit this file

The file is large. Read only what you need.

```bash
# Find the region you need (see docs/04-code-map.md for the full map)
grep -n "^function collectAdvice" app/solitair-invoicing.html
sed -n '2816,2934p'   app/solitair-invoicing.html
```

**Never** `cat` the whole file, and never read the customer master array or the
base64 logo line unless the task is specifically about them. For customer data
use `fixtures/customers.demo.json`. Doing so
wastes the entire context window for no benefit.

For edits, prefer a Python read-modify-write with a uniqueness assertion. This is
the pattern used throughout this project's history and it fails loudly rather than
silently corrupting the file:

```python
path = "app/solitair-invoicing.html"
content = open(path, encoding="utf-8").read()
old = '''<exact snippet including surrounding lines for uniqueness>'''
assert content.count(old) == 1, f"expected 1 match, got {content.count(old)}"
open(path, "w", encoding="utf-8").write(content.replace(old, new, 1))
```

Match whitespace exactly. If a replacement fails, re-read the exact bytes with
`sed -n 'N,Mp' file | cat -A` rather than guessing.

## Coding conventions in this file

Match what is already there. Do not modernise piecemeal.

- **ES5 only.** `var`, `function(){}`, no arrow functions, no `let`/`const`, no
  template literals, no optional chaining. The file is consistent on this; keep it.
- **DOM helpers:** `$(id)` is `getElementById` with an optional leading `#`
  stripped. `$$(sel, ctx)` is `querySelectorAll` returning an array.
  - **Known trap:** `$()` cannot take a compound selector. `$("#tbl tbody")`
    silently returns `null`, it does not throw. This has already caused five
    production bugs (register, security table, equipment table, modal sizing).
    For a descendant, write `var t = $("tbl"); var b = t ? t.querySelector("tbody") : null;`
    or use `$$()`. See audit finding A-08 for the proposed permanent fix.
- **Rendering:** HTML is built as concatenated strings and assigned to `innerHTML`.
  Always wrap user-supplied values in `esc()`.
- **Money:** always `num()` on input, `money()` on output. Never trust `.value`.
- **Naming:** the Export form prefixes element IDs with `a_`, the Import form with
  `i_`. `buildAdvice(mode)` builds both from one code path via an `isExp` flag; a
  change to one side is automatically a change to the other. Check both.

## Commands

```bash
npm install     # one-time: installs playwright (dev only, not needed to run the app)
npm test        # full regression suite, exits non-zero on failure
npm run test:one -- specs/03-charges.spec.js   # single spec
npm run open    # print the file:// URL to open the app
```

## Where things are

| Area | Doc |
|---|---|
| How it is put together, why single-file | `docs/01-architecture.md` |
| Persisted shapes, migrations, storage keys | `docs/02-data-model.md` |
| Tariff logic, auto-charge rules, VAT, storage, AWB owner and billing party, shipment lookup | `docs/03-business-rules.md` |
| Line-range map and function index | `docs/04-code-map.md` |
| Known defects and tech debt, prioritised | `docs/05-audit-findings.md` |
| Backup, recovery, deployment to staff | `docs/06-operations-runbook.md` |
| Process spec written for the ERP vendor | `docs/07-erp-handover-spec.md` |
| What data the repository may hold, and the guards | `docs/08-data-protection.md` |
| Change classes, release and rollback, risks, decisions | `docs/09-governance.md` |

## Working agreement

- **Fix only what is asked.** This system works. Do not refactor, restyle, or
  "modernise" adjacent code because you happened to read it. Unrequested changes to
  a live finance tool are a defect, not a bonus.
- **The advice forms and the rate tables are settled.** The Export/Import Advice
  tabs and the tariff figures in `EXPORT_LINES`/`IMPORT_LINES` were signed off
  against the official rate sheet. Do not change rates, VAT flags, minimums, or
  auto-apply rules unless the request explicitly says to, and cite the rate sheet
  when you do.
- **If you find a bug outside your task, report it, do not fix it silently.** Add it
  to `docs/05-audit-findings.md` and mention it in your summary.
- **Verify in a real browser, not by reading code.** Several past bugs (a null
  selector, a stale schema field) were invisible on inspection and only surfaced
  when the page actually ran. Add or extend a spec in `tests/specs/`.
- **Never use `git push --force`, never rewrite published history, never commit
  directly to `main`.** Work on a branch, open a PR.
- **Do not delete anything from `DB.entries` programmatically.** Those are invoices.

## Definition of done

1. `npm test` passes with zero console errors.
2. New behaviour has a spec that fails without your change.
3. If a persisted shape changed, a migration exists and legacy data still loads.
4. `docs/` updated if you changed behaviour, rules, or the data model.
5. `CHANGELOG.md` has an entry.
