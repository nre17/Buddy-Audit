/*
 * Minimal zero-config test harness for the SolitAir invoicing app.
 *
 * Deliberately not using @playwright/test: this project has no build step and no
 * framework, and the suite must stay as easy to read and run as the app itself.
 * We only need: launch a real browser, drive the real file, assert, report.
 */
const path = require("path");
const { chromium } = require("playwright");

const APP_PATH = path.resolve(__dirname, "..", "app", "solitair-invoicing.html");
const APP_URL = "file://" + APP_PATH;

/*
 * Test customers come from the demo master, never from a literal typed into a
 * spec. Customer names must not appear anywhere in this repository (see
 * docs/08-data-protection.md); resolving them here means a spec cannot
 * introduce one by accident, and regenerating the master with a different seed
 * does not break the suite.
 *
 * SAMPLE_CUSTOMER is a complete record: TRN, phone and country all present, so
 * it exercises the picker's autofill fully.
 */
const CUSTOMERS = require(path.resolve(__dirname, "..", "fixtures", "customers.demo.json"));

const SAMPLE_CUSTOMER = CUSTOMERS.find(
  (c) =>
    /^\d{15}$/.test(String(c.trn)) &&
    String(c.phone).trim() &&
    String(c.country).trim()
);
if (!SAMPLE_CUSTOMER) {
  throw new Error("demo master has no customer with a TRN, phone and country");
}

/** A second, distinct customer for tests that need two. */
const OTHER_CUSTOMER = CUSTOMERS.find((c) => c.name !== SAMPLE_CUSTOMER.name);

/** A third customer with a TRN, a phone number and an address, so the billing
    party autofill is exercised in full. */
const BILLING_CUSTOMER = CUSTOMERS.find(
  (c) =>
    c.name !== SAMPLE_CUSTOMER.name &&
    c.name !== OTHER_CUSTOMER.name &&
    /^\d{15}$/.test(String(c.trn)) &&
    String(c.phone).trim() &&
    String(c.addr).trim()
);
if (!BILLING_CUSTOMER) {
  throw new Error("demo master has no customer with a TRN, phone and address");
}

/** The manifest headings as the counter's Excel sheet has them. */
const MANIFEST_HEADER = [
  "AWB", "Origin", "Destination", "Flight Number", "Departure date and Time (Export)",
  "RCF date and time (import)", "SHC Code", "Nature of goods", "# of Pieces", "Gross Weight", "Customer",
];

/* ---------- assertions ---------- */

class AssertionError extends Error {}

function assert(cond, message) {
  if (!cond) throw new AssertionError(message || "assertion failed");
}

function eq(actual, expected, message) {
  if (actual !== expected) {
    throw new AssertionError(
      (message || "values differ") +
        "\n      expected: " + JSON.stringify(expected) +
        "\n      actual:   " + JSON.stringify(actual)
    );
  }
}

/** Compare money as a number to 2dp, tolerating "84.00" vs 84. */
function eqMoney(actual, expected, message) {
  const a = Math.round(parseFloat(actual) * 100);
  const e = Math.round(parseFloat(expected) * 100);
  if (a !== e) {
    throw new AssertionError(
      (message || "amounts differ") +
        "\n      expected: " + expected +
        "\n      actual:   " + actual
    );
  }
}

function contains(haystack, needle, message) {
  if (String(haystack).indexOf(needle) < 0) {
    throw new AssertionError(
      (message || "expected text not found") +
        "\n      looking for: " + JSON.stringify(needle) +
        "\n      within:      " + JSON.stringify(String(haystack).slice(0, 300))
    );
  }
}

function notContains(haystack, needle, message) {
  if (String(haystack).indexOf(needle) >= 0) {
    throw new AssertionError(
      (message || "unexpected text found") +
        "\n      should not contain: " + JSON.stringify(needle)
    );
  }
}

/* ---------- browser lifecycle ---------- */

/**
 * Open the app in a fresh browser context with empty localStorage.
 *
 * @param {object}  opts
 * @param {string}  opts.timezoneId  default Asia/Dubai — the app writes local
 *                                   (not UTC) datetimes, so tests that touch
 *                                   acceptance/departure times need a fixed zone.
 * @param {object}  opts.seed        optional object written to localStorage
 *                                   BEFORE the app boots, to test migrations.
 * @param {boolean} opts.firstOpen   leave the Shipment Database untouched, as on a
 *                                   browser's first open, when the app loads its
 *                                   sample shipments. Otherwise every spec starts
 *                                   with an empty Shipment Database, so the samples
 *                                   never mix into a spec's own manifest.
 */
async function openApp(opts) {
  opts = opts || {};
  const browser = await chromium.launch({
    args: ["--no-sandbox"],
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({
    timezoneId: opts.timezoneId || "Asia/Dubai",
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  // Native confirm() is used by a few destructive actions; auto-accept.
  page.on("dialog", async (d) => { await d.accept(); });

  await page.goto(APP_URL, { waitUntil: "load" });

  if (opts.seed) {
    await page.evaluate((seed) => {
      for (const k of Object.keys(seed)) {
        localStorage.setItem(k, JSON.stringify(seed[k]));
      }
    }, opts.seed);
    await page.reload({ waitUntil: "load" });
  }

  if (!opts.firstOpen) {
    // Empty the sample shipments a first open loads, once the app has booted. Not
    // done in an init script: that touches localStorage at the start of every
    // load, reloads included, and on a slow machine can read storage before the
    // previous page's writes have landed, so a spec's saved data vanishes.
    await page.evaluate(() => { SH = { items: [] }; shSave(); buildShipments(); shRefreshForms(); });
  }

  await page.waitForTimeout(400); // boot() builds all eight tabs synchronously

  return {
    browser,
    page,
    consoleErrors,
    /** Assert the page produced no console or uncaught errors. */
    assertNoErrors() {
      assert(
        consoleErrors.length === 0,
        "console errors:\n        " + consoleErrors.join("\n        ")
      );
    },
    async close() { await browser.close(); },
  };
}

/* ---------- app-specific helpers ---------- */

/** Switch tabs by visible label, e.g. "Export Advice", "Invoice Register". */
async function tab(page, label) {
  await page.evaluate((label) => {
    document.querySelectorAll(".tabs button").forEach((b) => {
      if (b.textContent.trim().toLowerCase().indexOf(label.toLowerCase()) >= 0) b.click();
    });
  }, label);
  await page.waitForTimeout(250);
}

/** Local (not UTC) datetime-local string, offset from now by `hours`. */
async function localDT(page, hours) {
  return page.evaluate((h) => {
    const d = new Date(Date.now() + h * 3600000);
    const p = (n) => (n < 10 ? "0" + n : "" + n);
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
           "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }, hours);
}

/**
 * Fill an advice form. `mode` is "export" | "import"; fields are the bare
 * suffixes, e.g. {cust, mawb, wt, pcs, shc, dst, fltno, t1, t2, hawbqty}.
 */
async function fillAdvice(page, mode, fields) {
  const p = mode === "export" ? "a_" : "i_";
  await tab(page, mode === "export" ? "Export Advice" : "Import Advice");
  for (const key of Object.keys(fields)) {
    const sel = "#" + p + key;
    const isSelect = await page.evaluate(
      (s) => { const el = document.querySelector(s); return !!el && el.tagName === "SELECT"; }, sel
    );
    if (isSelect) await page.selectOption(sel, String(fields[key]));
    else await page.fill(sel, String(fields[key]));
    await page.waitForTimeout(60);
  }
  // Every advice needs a billing party. Specs about other behaviour should not
  // have to care, so unless a spec sets one (even to ""), bill the AWB owner.
  if (fields.cust !== undefined && fields.bill === undefined) {
    await page.fill("#" + p + "bill", String(fields.cust));
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(200);
}

/** Manifest text as Excel puts it on the clipboard: tab-separated rows. */
function manifestText(header, rows) {
  return [header].concat(rows).map((r) => r.join("\t")).join("\n");
}

/** Paste a manifest on the Shipment Database tab, preview it, optionally set the
    date order ("DMY" / "MDY"), and import. Returns the toast text. */
async function importManifest(page, text, order) {
  await tab(page, "Shipment Database");
  await page.fill("#sh_paste", text);
  await page.click("#sh_preview");
  await page.waitForTimeout(150);
  if (order) {
    await page.selectOption("#sh_order", order);
    await page.waitForTimeout(150);
  }
  await page.click("#sh_import");
  await page.waitForTimeout(250);
  return page.evaluate(() => document.getElementById("toast").textContent);
}

/** Read a charge row by its line id, e.g. "ex_handling_gen". */
function chargeRow(page, lid) {
  return page.evaluate((lid) => {
    const r = document.querySelector('tr[data-lid="' + lid + '"]');
    if (!r) return null;
    return {
      rate: r.querySelector('[data-f="rate"]').value,
      qty: r.querySelector('[data-f="qty"]').value,
      min: r.querySelector('[data-f="min"]').value,
      charge: r.querySelector('[data-f="charge"]').textContent,
    };
  }, lid);
}

/** Click a payment-mode button by label. */
async function payMode(page, mode, label) {
  const p = mode === "export" ? "a" : "i";
  await page.evaluate(({ p, label }) => {
    document.querySelectorAll("#" + p + "_pmodes .payopt").forEach((b) => {
      if (b.dataset.pm === label) b.click();
    });
  }, { p, label });
  await page.waitForTimeout(150);
}

/** Save the current advice; returns the toast text. */
async function saveAdvice(page, mode) {
  await page.click("#" + (mode === "export" ? "a" : "i") + "_save");
  await page.waitForTimeout(350);
  return page.evaluate(() => {
    const t = document.getElementById("toast");
    return t ? t.textContent : "";
  });
}

/** Read the in-memory DB (the app's live state). */
function db(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.DB)));
}

/** Read the in-memory lying list. */
function lyingList(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.LL)));
}

/** Click a labelled button inside the open modal. */
async function modalClick(page, label) {
  await page.evaluate((label) => {
    const b = Array.from(document.querySelectorAll("#modal button"))
      .find((x) => x.textContent.trim() === label);
    if (b) b.click();
  }, label);
  await page.waitForTimeout(300);
}

module.exports = {
  APP_URL, APP_PATH,
  SAMPLE_CUSTOMER, OTHER_CUSTOMER, BILLING_CUSTOMER, MANIFEST_HEADER,
  AssertionError, assert, eq, eqMoney, contains, notContains,
  openApp, tab, localDT, fillAdvice, chargeRow, payMode, saveAdvice,
  manifestText, importManifest,
  db, lyingList, modalClick,
};
