# Architecture

## The shape of it

One HTML file. No server, no build, no runtime dependencies, no network.

```
solitair-invoicing.html
├── <style>          all CSS, including print styles
├── <body>           header + 8 tab buttons + 8 empty page containers + modal/toast/printarea
└── <script>         everything else, one inline script
    ├── CFG          company, bank, staff, SHC codes, free hours, VAT
    ├── CUSTOMERS    customer master, ~1,900 records (static)
    ├── helpers      $, esc, num, money, dates, storage
    ├── DB / LL      the two persisted state objects
    ├── rate tables  EXPORT_LINES / IMPORT_LINES / *_OPTIONAL
    ├── build*()     one builder per tab, called once at boot
    ├── render*()    re-render a tab from current state
    └── boot()       load state, build all eight tabs, wire the tab bar
```

At boot, **all eight tabs are built immediately**, not lazily. Tab switching only
toggles a CSS class and calls the relevant `render*()`. This matters:

- Element IDs for every tab exist from load, so `$("i_cust")` works while the
  Export tab is showing.
- Both advice forms exist simultaneously, which is why every function that touches
  a form must be told which one (`recalcAll("a")` vs `recalcAll("i")`). Guessing by
  "whichever exists" silently always finds the Export tab. That was a real bug.

## Why single-file, and why it stays that way

The counter needs a tool that works when the network does not, on any machine,
with no install, no admin rights, and no vendor. A file you can copy to a USB stick
and double-click satisfies that completely.

The constraint that follows: it runs from `file://`, where `fetch()` of a sibling
file is blocked as a cross-origin request and any CDN may be unreachable. So:

- No external CSS, JS, fonts or images.
- Assets are embedded as `data:` URIs (the logo is a base64 PNG on a single line).
- Persistence is `localStorage` under the `file://` origin. Chrome treats every
  local file as that one origin, so the store belongs to the browser profile and
  not to the file's path - see audit A-20 for the operational consequence.
- No modules, no bundler, no transpiler. The source is what the browser runs.

**Do not "fix" this by splitting the file.** It is a deliberate trade, and the cost
of the trade is paid in `docs/04-code-map.md` (how to navigate a big file) rather
than in operational fragility.

## Data flow

The invoice register is the single source of truth. Everything else derives.

```
        Export / Import Advice
                  │  saveAdvice()
                  ▼
          DB.entries  ◄──── the ledger, persisted to localStorage
           │  │  │  │
           │  │  │  └────────► Dashboard          renderDash()      reads DB.entries
           │  │  └───────────► Shift Handover     handoverFigures() reads DB.entries
           │  └──────────────► Facility Security  findInvoiceByAWB() scans DB.entries
           └─────────────────► Lying List         llSyncFromRegister() (exports only)
                                    │
                                    ▼
                              LL.items / LL.cleared   (separate localStorage key)
```

Consequences worth knowing before you change anything:

- **Nothing is precomputed.** Every derived view recalculates from `DB.entries` on
  render. There is no cache to invalidate, and no denormalised total to keep in sync.
- **`type` discriminates the ledger.** `DB.entries` holds two kinds of row:
  `type:"invoice"` and `type:"handover"` (a cash handover to accounts). Views filter
  on it. An entry missing `type` is invisible to the dashboard, the lying list and
  security. See `02-data-model.md`.
- **The lying list is the one derived store that persists.** It has its own
  localStorage key and its own lifecycle (sweep on departure). It is therefore the
  one place that can drift from the register, which is why invoice deletion
  explicitly cleans it up.

## Rendering model

String concatenation into `innerHTML`, then re-attach listeners. There is no
virtual DOM and no data binding.

```js
tbody.innerHTML = rows.map(function(r){ return "<tr>...</tr>"; }).join("");
$$("[data-del]", tbody).forEach(function(b){ b.onclick = ...; });   // re-wire
```

Two rules follow, and both have been violated in production before:

1. **Escape everything.** Any value that came from a user or the customer master
   goes through `esc()` before it enters an HTML string.
2. **Address rows by identity, not by index.** A row's position in a filtered and
   sorted list is not its index in the underlying array. Rows carry `data-id` and
   handlers look the record up by id. Facility Security used positional indices and
   deleted the wrong record whenever a filter was applied.

## Persistence

| Key | Holds | Written by |
|---|---|---|
| `solitair_db` | `DB`: entries, opening balance, customers, staff, rate overrides, logo, security list | `save()` |
| `solitair_lying_v1` | `LL`: live lying list + cleared history | `llSave()` |

There is no server, no sync and no automatic backup. Data lives in one browser
profile on one machine. This is the single largest operational risk in the system
and it is covered in `06-operations-runbook.md`.

## Printing

`printAdvice(e, previewOnly)` renders the invoice into a hidden `#printarea`, once
per required copy (Export: Customer, Operations, Accounts. Import: Customer,
Accounts), then calls `window.print()`. The `@media print` block hides the entire
app chrome and shows only `#printarea`. Preview mode renders the same markup into
a modal instead.
