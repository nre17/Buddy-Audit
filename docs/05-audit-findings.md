# Audit Findings

Full read-through of `app/solitair-invoicing.html`, in two passes.

Every finding was verified against the actual file, not assumed.

Severity: **P0** act before wider rollout · **P1** fix soon · **P2** worth doing ·
**P3** cosmetic or dead code.

## Open

| ID | Severity | Finding | Effort |
|---|---|---|---|
| [A-01](#a-01) | **P0** | No automatic backup; one browser-cache clear destroys every invoice | S (process) + M (code) |
| [A-02](#a-02) | **P0** | Invoice reference numbers do not restart daily | S |
| [A-03](#a-03) | P1 | 1,892 customer names are rewritten to localStorage on every save | S |
| [A-04](#a-04) | P1 | A storage-quota failure is swallowed by a generic toast | S |
| [A-05](#a-05) | P1 | "Acknowledge / Clear Selected" acts on every visible row, not a selection | S |
| [A-06](#a-06) | P1 | `$()` silently returns null for compound selectors | M |
| [A-07](#a-07) | P2 | The charge formula is implemented twice and can drift | M |
| [A-08](#a-08) | P2 | Deleting an invoice does not release its reference number | S |
| [A-10](#a-10) | P2 | No responsive layout; unusable on a tablet or phone | L |
| [A-15](#a-15) | P2 | Form-field styling is inlined in 22 places, overriding the CSS that already exists | M |

## Closed

| ID | Finding | Resolution |
|---|---|---|
| [A-11](#a-11) | `stamp()` declared twice | Duplicate removed. |
| [A-12](#a-12) | Dead globals `REGF`, `llTimer` | Both removed. |
| [A-13](#a-13) | Three `<h3>` closed with `</h2>` | Fixed. |
| [A-14](#a-14) | `saveAdvice()` called with a surplus argument | Fixed. |
| [A-16](#a-16) | No version identifier in the application | `APP_VERSION` added and shown under Rates & Data. |
| [A-18](#a-18) | `dayKey()` was a no-op and the reference expression was duplicated four times | Replaced by `refFor()` / `previewRef()`. A *tidying* fix — the underlying A-02 defect is still open, but now has one place to fix it. |
| [A-19](#a-19) | Duplicated date formatting and dead CSS | `ymd()` helper introduced; six dead CSS rules removed. |

All closures were verified by the 50-case regression suite plus a pixel-level
screenshot comparison across all eight tabs, before and after. Rendering is
byte-identical.

---

## A-01 — No automatic backup {#a-01}

**P0. Operational, not a code defect, and the highest risk in the system.**

All data lives in `localStorage` in one browser profile on one machine. There is no
server, no sync and no scheduled export. Clearing browsing data, a browser reset, a
profile change, an OS reinstall or a failed disk destroys **every invoice, the cash
ledger and every saved handover report**, silently and irrecoverably.

The Rates & Data tab has a JSON backup and restore, but it is manual and nothing
prompts anyone to use it.

**Mitigation now:** the mandatory daily export in `docs/06-operations-runbook.md`.
Do that from today, before any other work.

**Fix to schedule:** on boot, compare a `DB.lastBackup` timestamp against today and
show a blocking reminder if the last export is older than 24 hours. Cheap, and it
converts a silent catastrophic risk into a visible nag.

---

## A-02 — Reference numbers do not restart daily {#a-02}

**P0. Finance and audit impact.**

References are formatted `YYYY-MM-DD/NN`, which reads as "the Nth invoice of that
day". `NN` comes from `DB.seq[mode]`, a counter that only ever increments:

```js
function refFor(n){ return fmtD(new Date()) + "/" + pad(n); }   // date + sequence
DB.seq[mode] = (DB.seq[mode]||0) + 1;                           // never reset
```

There is exactly one place to fix this: `refFor()` and `previewRef()`. The
expression was previously duplicated at four call sites and routed through a
`dayKey()` function that did nothing (see A-18).

So the first invoice on day two is `2026-09-10/02`, not `/01`. Sequence numbers
climb forever while the date prefix changes, which makes the reference format
misleading to anyone reconciling it, and leaves gaps that look like missing
invoices.

**Fix:** store the sequence against the date and reset when the date rolls over.

```js
if(DB.seqDate !== todayStr){ DB.seq = {export:0, import:0}; DB.seqDate = todayStr; }
```

Needs a migration decision: existing references must not be renumbered. Add
`DB.seqDate` on first boot set to today, so only future days restart.

---

## A-03 — Customer master duplicated into localStorage {#a-03}

**P1.** `seedCustomers()` copies all 1,892 names from the static `CUSTOMERS` array
into `DB.customers`, which is then serialised on **every** `save()`.

```js
DB.customers = CUSTOMERS.map(function(c){ return c.name; });   // ~50 KB
```

The data is already in the file. Persisting a copy adds roughly 50 KB to every
write, consumes quota that real invoices need, and means a stale customer list can
outlive a file update.

**Fix:** derive the datalist from `CUSTOMERS` at render time, and keep in
`DB.customers` only names staff typed that are not in the master. Requires a
migration to prune existing stored copies.

---

## A-04 — Quota failure is swallowed {#a-04}

**P1.**

```js
function save(){ try{ localStorage.setItem("solitair_db", JSON.stringify(DB)); }
                 catch(e){ toast("Could not save","err"); } }
```

If the quota is exceeded, staff see a small transient toast and the invoice they
just raised is **not persisted**. The register still shows it, because `DB` is
correct in memory, so the loss is invisible until the page is reloaded.

**Fix:** distinguish `QuotaExceededError`, show a blocking modal that names the
problem and offers "Export backup now", and do not clear the advice form so the
work is not lost.

---

## A-05 — "Acknowledge / Clear Selected" clears everything visible {#a-05}

**P1. Data-affecting UX defect.**

`ackSelected()` iterates every rendered row and acknowledges all of them. There is
no selection mechanism, but the button is labelled "Selected" and sits next to a
destructive action.

**Fix:** either add checkboxes and honour them, or relabel to "Acknowledge All
Listed" and add a confirmation naming the count. The second is a ten-minute change
and removes the surprise.

---

## A-06 — `$()` silently returns null for compound selectors {#a-06}

**P1. This trap has already caused five production bugs.**

```js
function $(id){ return document.getElementById(String(id).replace(/^#/,"")); }
```

`$("#regtbl tbody")` strips the `#`, asks for an element whose id is literally
`"regtbl tbody"`, and returns `null` — no error, no warning. Every call site guards
with `if(!x) return;`, so the feature just silently does nothing.

Already fixed at five sites: the invoice register body, the security table body
(twice), the handover equipment table, and the preview-modal sizing. The register
one meant **the entire Invoice Register displayed nothing at all**.

**Fix:** make the helper handle both forms, so the trap cannot recur.

```js
function $(sel){
  var s = String(sel);
  if(/[\s.\[>#:]/.test(s.replace(/^#/, ""))) return document.querySelector(s.charAt(0)==="#" ? s : "#"+s);
  return document.getElementById(s.replace(/^#/,""));
}
```

Low risk: every currently correct call is a plain id and behaves identically.
Verify with the full suite afterwards.

---

## A-07 — The charge formula exists in two places {#a-07}

**P2. Has already shipped a bug once.**

`recalcLine()` computes what the screen shows. `collectAdvice()` independently
recomputes the same maths for what gets saved and printed. When the
`quantity > 0` rule was added to `recalcLine`, `collectAdvice` was missed, so the
screen showed the correct total while **saved invoices still billed minimums on
inapplicable lines**.

**Fix:** extract one `computeCharge(rate, qty, min, vat)` and call it from both.
Contained, and `tests/specs/03-charges.spec.js` covers the behaviour on both sides.

---

## A-08 — Deleting an invoice does not release its reference {#a-08}

**P2.** `DB.seq` is never decremented on delete, so a deleted invoice leaves a
permanent gap in the reference sequence. Arguably correct for audit purposes
(references should not be reused), but it is undocumented and combines with
[A-02](#a-02) to make the numbering hard to reconcile.

**Decide and document** rather than silently fix. Recommendation: keep gaps, note
in the runbook that a gap means a voided advice, and resolve A-02 so the format at
least means what it says.

---

## A-10 — No responsive layout {#a-10}

**P2.** There are no `@media (max-width: ...)` rules. The layout is fixed-width
desktop, with wide tables in horizontally scrolling wrappers. On a tablet the
advice forms and the register are effectively unusable.

Only worth doing if counter staff need tablets. Sizeable job: the register alone
has seventeen columns.

---

## A-11 — `stamp()` declared twice {#a-11}

**P3. CLOSED — the duplicate was removed.**

Originally: Identical definitions at lines 2248 and 3605. The second silently replaces
the first. Harmless today, a trap if one is ever edited. Delete the second.

---

## A-12 — Dead globals {#a-12}

**P3. CLOSED — both were removed.**

Originally: `REGF` (line 2987) and `llTimer` (line 4539) are each declared and never
read again. `REGF` in particular looks like live filter state and is not; anyone
reading the register code may reasonably assume it matters. Delete both.

---

## A-13 — Mismatched heading tags {#a-13}

**P3. CLOSED.**

Originally: In `buildSecurity()`, three `<h3>` elements are closed with `</h2>` (lines
4544, 4563, 4582). Browsers silently repair this to `<h3>`, verified, so there is
no visual defect. Fix while touching that function.

---

## A-14 — `saveAdvice()` called with a surplus argument {#a-14}

**P3. CLOSED — the argument was dropped.**

Originally: The Ctrl+S handler (line ~4967) calls `saveAdvice(mode, false)`; the
function takes one parameter. JavaScript ignores the extra argument, so behaviour
is correct, but it implies a second parameter that never existed and will mislead.
Drop the `false`.

---

## A-15 — Form-field styling is inlined, overriding CSS that already exists {#a-15}

**P2. Maintainability.**

`.f input, .f select, .f textarea` in the stylesheet already gives every form
control its border, radius, padding, background and full width. Despite that, 22
controls carry an inline `style` attribute that restates the same properties with
small deviations - `border-radius:5px` instead of `6px`, `padding:7px 9px`
instead of `6px 9px`, plus a `font-size`:

```
x10  width:100%;border:1px solid var(--line);border-radius:5px;padding:7px 9px;...
 x5  ...;font-variant-numeric:tabular-nums
 x4  ...;text-transform:uppercase
 x1  ...;resize:vertical
 x1  border-radius:4px;padding:6px
```

Because inline styles beat any stylesheet rule, editing `.f input` does not
change these controls. A future restyle will appear to half-work.

**Not fixed.** Removing the inline styles changes the visible padding and corner
radius of every affected field. That is a deliberate visual change and belongs in
its own reviewed pull request rather than riding along with unrelated work.

**Fix:** fold the variants into the stylesheet as modifier classes
(`.f input.tight`, `.f input.up`, `.mono`) and delete the inline attributes.
Verify with the screenshot comparison described at the top of this document.

---

## A-16 — No version identifier {#a-16}

**P2. CLOSED.**

The application carried no version string, so a counter machine could not be
checked against the released version without diffing the file. With releases
made by copying a file to several machines (see
[`09-governance.md`](09-governance.md) §4), divergence was invisible.

**Fixed:** `APP_VERSION` is declared next to `CFG` and displayed under
Rates & Data. Bump it on every release.

---

## A-18 — `dayKey()` was a no-op wrapping a duplicated expression {#a-18}

**P3. CLOSED.**

`function dayKey(d){ return d; }` returned its argument unchanged, while the
expression `dayKey(fmtD(new Date())) + "/" + pad((DB.seq[mode]||0)+1)` was
written out at four separate call sites - including one that used it to *build*
a reference and one that used it to *test* whether a reference was still the
default.

**Fixed:** replaced by `refFor(n)` and `previewRef(mode)`. The duplication is
gone and A-02 now has exactly one place to be fixed.

---

## A-19 — Duplicated date formatting and dead CSS {#a-19}

**P3. CLOSED.**

- `YYYY-MM-DD` was constructed inline in **seven** places besides `fmtD()`, each
  spelling out `getFullYear()+"-"+pad(getMonth()+1)+"-"+pad(getDate())`.
  Consolidated into one `ymd(date)` helper.
- Six CSS rules were defined and never applied: `.minhit`, `.btn.offbtn` (x3),
  `.splitbox` (x2), `.span4`, `.totrow` (x3). Removed.
- `.mono` was defined but unused, while its exact declaration
  (`font-variant-numeric:tabular-nums`) was inlined on six table cells. The class
  is now applied to those cells.
- 57 call sites were written `$ (x)` with a space. Normalised to `$(x)`.

Verified: 50/50 tests pass and screenshots of all eight tabs are pixel-identical
before and after.

---

## Recommended order

The housekeeping pass is done. What remains, in order:

1. **Today, if not already running:** the daily backup routine (A-01) - process
   only, no code. It is still the largest risk in the system.
2. **First PR:** A-02 (references) and A-04 (quota). Both touch money and data
   safety. A-02 is now a small change confined to `refFor()` / `previewRef()`.
3. **Second PR:** A-06 (`$` helper), then A-07 (single charge formula). These
   remove whole classes of future bug and make later refactoring safe.
4. **Third PR:** A-03, A-05, A-08 - correctness and clarity.
5. **When restyling:** A-15 (inline field styles). Visual change, own PR.
6. **Backlog:** A-10, only if tablets are actually required.

Run `npm run verify` before and after every one of these.
