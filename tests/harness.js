/*
 * Browser integration harness for the built SolitAir workspace.
 *
 * Deliberately not using @playwright/test: the suite only needs an isolated HTTP
 * sandbox, a real browser, assertions, and a report. Run the app build first.
 */
const path = require("path");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const { chromium } = require("playwright");

const APP_PATH = path.resolve(__dirname, "..", "dist", "index.html");
let APP_URL = process.env.APP_URL || '';
let serverPromise;
async function testUrl() {
  if (APP_URL) return APP_URL;
  if (!serverPromise) serverPromise = new Promise((resolve, reject) => {
    const root = path.dirname(APP_PATH);
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://localhost');
      const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + path.sep)) {response.writeHead(403).end(); return;}
      fs.readFile(file, (error, data) => {
        if (error) {response.writeHead(404).end(); return;}
        response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
        response.end(data);
      });
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {server.unref(); APP_URL = 'http://127.0.0.1:' + server.address().port + '/?storage=browser'; resolve(APP_URL);});
  });
  return serverPromise;
}

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

async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + " timed out after " + milliseconds + "ms")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}

function browserEndpointClosed(endpoint) {
  const url = new URL(endpoint);
  return new Promise(resolve => {
    const socket = net.createConnection({ host: url.hostname, port: Number(url.port) });
    const finish = closed => { socket.destroy(); resolve(closed); };
    socket.setTimeout(1000, () => finish(false));
    socket.once("connect", () => finish(false));
    socket.once("error", error => finish(error.code === "ECONNREFUSED"));
  });
}

/** Own the browser process explicitly so a system Chrome shutdown cannot freeze
 * the suite. Windows Chrome can stop responding after contexts have closed;
 * Playwright's taskkill fallback can also leave its Node child watcher pending.
 * ChildProcess.kill signals that exact owned process and completes its watcher.
 * No browser outside this fixture is selected or terminated. */
async function launchTestBrowser() {
  const installedBrowser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
  const browserServer = await chromium.launchServer({
    args: ["--no-sandbox"],
    executablePath: process.env.CHROMIUM_PATH || (fs.existsSync(chromium.executablePath()) ? undefined : installedBrowser),
  });
  const child = browserServer.process();
  let browser, closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    let connectionError;
    if (browser) {
      try {
        await bounded(Promise.all(browser.contexts().map(context => context.close())), 10000, "Browser context cleanup");
        await bounded(browser.close(), 5000, "Browser connection cleanup");
      } catch (error) { connectionError = error; }
    }
    const closing = browserServer.close();
    try {
      await bounded(closing, 5000, "Browser process shutdown");
    } catch (error) {
      // Use the public ChildProcess handle, not a name match or unrelated PID.
      child.kill("SIGKILL");
      try {
        await bounded(closing, 5000, "Forced browser process cleanup");
        if (child.exitCode === null && child.signalCode === null) throw new Error("Browser cleanup did not confirm the owned process exited");
        console.warn("  [browser cleanup] System browser required forced shutdown; owned process exit and cleanup confirmed (PID " + child.pid + ").");
      } catch (cleanupError) {
        // On Windows the process watcher or temporary-profile cleanup can lag.
        // Accept only independently proven isolation: contexts and connection
        // closed, no OS process at this owned PID, and its server port released.
        const exists = processExists(child.pid);
        const endpointClosed = await browserEndpointClosed(browserServer.wsEndpoint());
        const evidence = "PID " + child.pid + ", OS process exists=" + exists + ", browser endpoint closed=" + endpointClosed + ", exitCode=" + child.exitCode + ", signalCode=" + child.signalCode;
        if (connectionError || exists || !endpointClosed) throw new Error(cleanupError.message + " (" + evidence + ")");
        console.warn("  [browser cleanup] Playwright cleanup notification stalled; process exit and released endpoint verified independently (" + evidence + ").");
      }
    }
    if (connectionError) throw connectionError;
  }
  try { browser = await chromium.connect(browserServer.wsEndpoint()); }
  catch (error) { await close(); throw error; }
  return { browser, close };
}

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
  const url = await testUrl();
  const fixture = await launchTestBrowser();
  const browser = fixture.browser;
  try {
  const context = await browser.newContext({
    timezoneId: opts.timezoneId || "Asia/Dubai",
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  // Native confirm() is used by a few destructive actions; auto-accept.
  page.on("dialog", async (d) => { await d.accept(); });

  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__solitairReady || window.__solitairStartupError);
  const startupError = await page.evaluate(() => window.__solitairStartupError);
  if (startupError) throw new Error(startupError);

  if (opts.seed) {
    await page.evaluate((seed) => {
      localStorage.clear();
      for (const k of Object.keys(seed)) {
        localStorage.setItem(k, JSON.stringify(seed[k]));
      }
    }, opts.seed);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__solitairReady || window.__solitairStartupError);
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
    close: fixture.close,
  };
  } catch (error) { await fixture.close(); throw error; }
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
  openApp, launchTestBrowser, tab, localDT, fillAdvice, chargeRow, payMode, saveAdvice,
  manifestText, importManifest,
  db, lyingList, modalClick,
};
