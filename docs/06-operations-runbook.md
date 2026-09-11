# Operations Runbook

For whoever owns the counter system day to day. Written for a non-developer.

---

## 0. Setting up a new counter machine

Do this once per machine, before anyone raises an advice on it. **A fresh copy of
the application does not contain the company's tax number or bank details** -
they are deliberately not in the file, so that the file can be copied around and
kept in version control safely. Until you enter them, every printed advice will
say `Not configured` where they belong.

1. Copy `app/solitair-invoicing.html` to the machine and open it.
2. Go to **Rates & Data**.
3. Under **Company & Bank Details**, fill in:
   - Company name and address
   - Contact number
   - Company TRN
   - The AED account block - one line per line of the printed block
     (account name, account number, IBAN, BIC/SWIFT, bank, branch)
   - The USD account block, the same way
4. Click **Save Details**.
5. Under **Counter Staff**, replace `Counter 1, Counter 2, ...` with the real
   names of the people who work that counter. Click **Save**.
6. Check the tariff under **Rates & Data** matches the current rate card.
7. Raise one test advice and **print it**. Confirm the TRN and both bank blocks
   are correct on the printed page. Then delete the test advice.
8. If this machine is replacing an existing one, restore the latest backup now
   (section 2).

These settings are stored in that browser, not in the file. They survive a
version upgrade (section 3), but they are lost if browsing data is cleared - so
they are also included in the daily backup.

> **Where do the real details come from?** Finance. Do not copy them out of an
> old version of the HTML file, and do not put them back into the file.

---

## 0a. Each day: load the manifest

At the start of each day, or whenever a new manifest arrives:

1. Open the manifest in Excel.
2. Select it **including the heading row** - clicking the corner square at the top
   left of the sheet selects everything - and copy.
3. In the app, open **Shipment Database** (the first tab) and paste into the box.
   The preview appears on its own; if not, click **Preview**.
4. Check the preview:
   - The number of exports and imports looks right.
   - **The departure and RCF times are written out in words. Check the day and the
     month are the right way round.** If they are not, change *Dates in this sheet
     are written* before importing. Storage charges are calculated from these
     times.
   - Read the **Notes** column. An unknown SHC code, an owner not in the customer
     master or a missing gross weight will each need attention on the advice.
5. Click **Import**.

Columns can be in any order; they are matched by their headings. A CSV file works
too, through **Choose CSV File**. Pasting an updated manifest later replaces the
shipments it contains and keeps the others.

**On the advice:** start typing the AWB. Matching shipments are suggested under the
field - click one, or type the AWB in full. The owner, flight, route, time, SHC,
goods, pieces and weight fill in. Enter anything the manifest did not have, choose the **Billing
Party** at the bottom - or click **Same as AWB owner** - and carry on as before.

> Loaded shipments are **not** part of the daily backup. After a restore, paste the
> manifest again.

---

## 1. Daily backup — mandatory

**Read `docs/05-audit-findings.md` A-01 first. This is the single largest risk in
the system.** All invoices live in one browser on one machine. Clearing browsing
data, resetting the browser, or losing the machine destroys everything, silently.

**At the end of every shift, on the counter machine:**

1. Open the app.
2. Go to **Rates & Data**.
3. Click **Download Backup (JSON)**.
4. Save it to the shared drive as `solitair-db-YYYY-MM-DD-<shift>.backup.json`.

Keep 90 days. It takes fifteen seconds and it is the only thing standing between a
routine IT action and the loss of the invoice register.

Optionally also **Export Register to Excel** for finance. That is a report, not a
backup — it cannot be restored.

---

## 2. Restoring after data loss

1. Open the app on the machine (a fresh copy of the HTML file is fine).
2. **Rates & Data → Restore from Backup**.
3. Select the most recent `.backup.json`.
4. Verify: the Invoice Register shows the expected invoices, and **Cash on Hand** in
   the header matches the last known figure.

The lying list is stored separately and is **not** in the main backup. It rebuilds
itself for export invoices from the register on next load. Manually added entries
are lost; re-add them from the Lying List tab.

The Facility Security list has its own **Backup This List** / **Restore From File**
buttons on that tab.

---

## 3. Rolling out a new version to staff

> **Builds from 1.1.0 are a prototype, not for counter rollout.** They run on the
> demo customer master shown on the Customer Database tab, so customer TRNs and
> addresses fill in only for demo companies. The real customer master belongs in
> the ERP. See decision D-11 in `09-governance.md`.

> Company and bank details, staff names, tariff overrides and all invoice data
> live in the browser, not in the HTML file. Replacing the file does not erase
> them. Verify after the upgrade rather than assuming - print one advice and
> check the TRN and bank blocks.


The app is one file. Deployment is copying that file. The data is separate from the
file, in the browser, so replacing the file does not touch existing invoices.

1. Confirm CI is green on `main` (or run `npm test` locally).
2. Take a backup on the counter machine (section 1). Always, without exception.
3. Copy `app/solitair-invoicing.html` over the file on the counter machine, keeping
   the **same filename and folder**.

   > This matters. `localStorage` is scoped to the file URL. Renaming the file or
   > moving it to another folder makes the browser treat it as a different site and
   > **the existing data will appear to have vanished.** It is not lost — restore
   > the original path, or restore from backup at the new path.

4. Reload the page. Confirm the register still lists recent invoices and Cash on
   Hand is unchanged.
5. Raise one test invoice, check the total, then delete it.

Roll back by copying the previous file version back. Data is unaffected.

---

## 4. Which browser

Chrome or Safari on macOS, tested. Use one browser and one profile consistently on
the counter machine.

- Do not use Private/Incognito. Data is discarded on close.
- Advise IT never to run "clear browsing data" on the counter profile.

> **Every local copy of the app shares one set of data.** In Chrome, all files
> opened from your computer count as the same "site", so the register is tied to
> the **browser profile**, not to the file's name or folder. Two consequences,
> and the second one bites:
>
> 1. **Good:** replacing the application file during an upgrade does not lose
>    anything. You may rename it or move it; the data stays put.
> 2. **Dangerous:** if you open a *second* copy of the app in the same browser -
>    a downloaded one, an older version, a copy for training - it is reading and
>    writing the **live counter register**. Clicking *Load Sample Data* or
>    *Erase All Data* in that second copy changes the real one.
>
> **Rule: only ever open the counter's own copy in the counter's browser.** To
> demonstrate, train, or try a new version, use a different browser (or a
> different browser profile) so it has its own separate storage. See audit A-20.

---

## 5. Month-end for finance

1. **Invoice Register** → set the date range → **Export Register to Excel**.
2. The export includes the running cash balance, every payment method column, and
   the handover rows, matching the on-screen ledger.
3. The **Dashboard** filtered to the same period gives the summary figures, plus
   outstanding Credit and CASS by customer.

---

## 6. Changing rates

Two routes:

- **Temporary or site-specific:** Rates & Data tab, edit a rate, Save. Stored in
  `DB.rates` on that machine only, and not shared with other counter machines.
- **Permanent, for everyone:** change `EXPORT_LINES` / `IMPORT_LINES` in the source
  file, update `docs/03-business-rules.md`, update the assertions in
  `tests/specs/03-charges.spec.js`, run `npm test`, and roll out per section 3.

Permanent tariff changes must come from the official rate sheet, and the PR should
say which version of the sheet it follows.

---

## 7. Adding or removing counter staff

> New machines ship with placeholder names `Counter 1` … `Counter 6`. Replace
> them with real names during setup (section 0).


Rates & Data tab → staff list. Persisted in `DB.staffList` on that machine. Existing
invoices keep the name they were raised under.

---

## 8. Troubleshooting

| Symptom | Cause | Action |
|---|---|---|
| An AWB does not fill in | Its manifest has not been loaded, or the AWB is typed differently | Search for the AWB on the Shipment Database tab. Load the manifest, or enter the details by hand |
| "...is an import shipment" on the Export Advice, or the reverse | The AWB is on the manifest for the other direction | Click **Open in Import Advice** (or Export) |
| Departure or RCF times are out by about a month | The manifest's day and month were read the wrong way round | Clear the loaded shipments, paste again, and set *Dates in this sheet are written* in the preview |
| "Billing party is required" | No billing party chosen | Choose one at the bottom of the advice, or click **Same as AWB owner** |
| Register is empty after an update | Different browser, or a different browser profile, from the one holding the data - not the file's name or location | Open the app in the browser the counter normally uses. If it is genuinely gone, restore from backup |
| Sample or unfamiliar invoices appear in the register | A second copy of the app was opened in the same browser and seeded with demo data (audit A-20) | Delete the demo rows, re-check Cash on Hand and the opening balance, and restore from backup if the figures do not reconcile |
| "Could not save" toast | localStorage is full or blocked | Back up immediately, then see audit A-04. Do not keep working |
| Cash on Hand looks wrong | An invoice or handover was deleted, or the opening balance is unset | Rates & Data → check opening balance; review the register for gaps |
| An export AWB is not on the lying list | The advice had no departure time | Add it manually on the Lying List tab; capture departure time on the advice next time |
| Security shows NOT INVOICED for an invoiced AWB | MAWB typed differently on the two sides | Compare the two AWBs character by character; matching is exact |
| Printout has no logo | Custom logo was removed on that machine | Rates & Data → Upload Logo, or leave it: the built-in logo is embedded in the file |
| A charge did not apply | Quantity is zero, or the SHC does not map to that class | Check weight, SHC and the two timestamps. See `docs/03-business-rules.md` |

---

## 9. Escalation

1. Take a backup **before** attempting anything (section 1).
2. Note the exact symptom, the AWB or reference involved, and the time.
3. In the browser, open the developer console (Cmd+Option+J) and copy any red
   errors. Those are what a developer needs.
4. Never share a backup file outside the company: it contains customer invoices.
