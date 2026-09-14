/* Client/server recovery contracts. Every disk case owns a generated temporary
   directory and isolated browser contexts; the user's workspace is never used. */
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { launchTestBrowser } = require("../harness");
const PROJECT = path.resolve(__dirname, "../..");
const PREFIX = "solitair-client-storage-";

function emptySnapshot(note = "") {
  return { format: "solitair-workspace", version: 1, exportedAt: new Date().toISOString(),
    db: { entries: [], seq: { export: 0, import: 0 }, openingBalance: 0, openingNote: note, openingDate: "",
      staff: "Counter 1", staffList: ["Counter 1"], sec: [], customers: [], rates: {} },
    shipments: { items: [] }, warehouse: { items: [], cleared: [], removed: [] } };
}

async function readRemote(server) {
  const response = await fetch(server.url + "/api/snapshot");
  if (!response.ok) throw new Error("Test snapshot read failed");
  return response.json();
}

async function putRemote(server, expectedRevision, snapshot) {
  const response = await fetch(server.url + "/api/snapshot", { method: "PUT",
    headers: { "Content-Type": "application/json", Origin: server.url },
    body: JSON.stringify({ expectedRevision, snapshot }) });
  if (!response.ok) throw new Error("Test setup save failed: " + response.status);
  return response.json();
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__solitairReady || window.__solitairStartupError);
  const error = await page.evaluate(() => window.__solitairStartupError);
  if (error) throw new Error(error);
}

async function waitSaved(page) {
  await page.waitForFunction(() => window.SolitAir && SolitAir.storageStatus.kind === "saved", null, { timeout: 15000 });
}

async function removeFixture(directory) {
  const resolved = path.resolve(directory), relative = path.relative(path.resolve(os.tmpdir()), resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !path.basename(resolved).startsWith(PREFIX)) throw new Error("Unsafe test cleanup target");
  await fs.rm(resolved, { recursive: true, force: true });
}

async function diskFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), PREFIX));
  const { startServer } = await import("../../tools/server.mjs");
  let dataDir = path.join(directory, "data"), server, browser, browserFixture;
  const options = () => ({ projectDir: PROJECT, staticDir: path.join(PROJECT, "dist"), dataDir, port: 0 });
  try {
    server = await startServer(options());
    await putRemote(server, 0, emptySnapshot("Initial disk state"));
    browserFixture = await launchTestBrowser();
    browser = browserFixture.browser;
  } catch (error) {
    if (browserFixture) await browserFixture.close();
    if (server) await server.close();
    await removeFixture(directory);
    throw error;
  }
  return {
    get server() { return server; },
    async diskText() { return fs.readFile(path.join(dataDir, "snapshot.json"), "utf8"); },
    async open() {
      const context = await browser.newContext({ timezoneId: "Asia/Dubai" });
      const page = await context.newPage();
      page.on("dialog", async dialog => { await dialog.accept(); });
      await page.goto(server.url, { waitUntil: "load" }); await waitReady(page); await waitSaved(page);
      return page;
    },
    async blockDiskWrites() {
      // Both paths are direct children of this test's generated data directory.
      const backup = path.join(dataDir, "backups"), preserved = path.join(dataDir, "backups-preserved");
      let moved = false;
      try { await fs.rename(backup, preserved); moved = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
      await fs.writeFile(backup, "Test fault: a file prevents creating the backup directory.");
      return async () => { await fs.unlink(backup); if (moved) await fs.rename(preserved, backup); };
    },
    async switchWorkspace(revision) {
      const port = server.port;
      await server.close();
      dataDir = path.join(directory, "different-data");
      server = await startServer({ ...options(), port });
      for (let current = 0; current < revision; current++) await putRemote(server, current, emptySnapshot("Different disk workspace"));
    },
    async close() {
      try { await browserFixture.close(); }
      finally { await server.close(); await removeFixture(directory); }
    },
  };
}

async function changeNote(page, note) {
  return page.evaluate(note => { SolitAir.DB.openingNote = note; return SolitAir.save(); }, note);
}

async function cacheOf(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem(SolitAir.storageKey)));
}

module.exports = {
  name: "Workspace persistence and recovery",
  tests: {
    "backup restores all stores and immediately migrates legacy records without stale boot reloads": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "import", { mawb: "780-30909701", cust: h.SAMPLE_CUSTOMER.name,
          wt: 100, pcs: 2, t1: "2026-09-14T08:00", t2: "2026-09-14T10:00" });
        h.contains(await h.saveAdvice(app.page, "import"), "Invoice saved");
        await app.page.evaluate(() => {
          SolitAir.SH.items = [{ awb: "780-30909702", key: "78030909702", org: "DWC", dst: "ISU", fltno: "ZZ 907",
            dep: "2099-09-14T12:00", rcf: "", shc: "GEN", nog: "Demo cargo", pcs: 2, wt: 100, cust: "", importedAt: Date.now(), source: "manifest" }];
          SolitAir.LL = { items: [{ id: "LL_TEST_ACTIVE", awb: "780-30909703", dir: "Export", loc: "TO ISU", fltno: "ZZ 908",
            dep: "2099-09-14T12:00", pcs: 2, wt: 100, addedBy: "Counter 1", addedTs: new Date().toISOString(), auto: false }],
            cleared: [{ id: "LL_TEST_CLEARED", awb: "780-30909704", dir: "Export", loc: "TO ISU", fltno: "ZZ 909",
              dep: "2026-09-01T12:00", pcs: 1, wt: 50, clearedAt: "2026-09-01T08:00:00.000Z", auto: false }], removed: ["LLA_TEST_REMOVED"] };
          SolitAir.DB.openingNote = "Roundtrip marker";
          SolitAir.save();
        });
        const downloadEvent = app.page.waitForEvent("download");
        await app.page.evaluate(() => SolitAir.downloadWorkspaceBackup());
        const download = await downloadEvent, stream = await download.createReadStream(), chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const backup = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        h.eq(backup.db.entries.length, 1); h.eq(backup.shipments.items.length, 1);
        h.eq(backup.warehouse.items.length, 1); h.eq(backup.warehouse.cleared.length, 1); h.eq(backup.warehouse.removed.length, 1);
        delete backup.db.entries[0].type; delete backup.db.entries[0].billTo; delete backup.db.entries[0].billTrn; delete backup.db.entries[0].billAddr;
        backup.db.sec = [{ awb: "780-30909701", dir: "Import", by: "ACC", ts: "2026-09-14T08:00:00.000Z", ack: false }];
        await app.page.evaluate(() => SolitAir.restoreWorkspace({ entries: [], seq: { export: 0, import: 0 }, sec: [] }));
        await h.tab(app.page, "Rates & Data");
        await app.page.setInputFiles("#fileRestore", { name: "roundtrip.backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
        await app.page.waitForFunction(() => document.getElementById("modal").style.display !== "none");
        await h.modalClick(app.page, "Restore");
        const check = async () => {
          const snapshot = await app.page.evaluate(() => SolitAir.workspaceSnapshot());
          h.eq(snapshot.db.entries[0].type, "invoice", "type migrated immediately");
          h.eq(snapshot.db.entries[0].billTo, h.SAMPLE_CUSTOMER.name, "legacy billing migrated immediately");
          h.assert(!!snapshot.db.sec[0].id, "security identity migrated immediately");
          h.eq(snapshot.db.openingNote, "Roundtrip marker");
          h.eq(JSON.stringify(snapshot.shipments), JSON.stringify(backup.shipments), "manifest restored");
          h.eq(JSON.stringify(snapshot.warehouse), JSON.stringify(backup.warehouse), "warehouse and histories restored");
        };
        await check();
        await app.page.evaluate(() => SolitAir.boot()); await check();
        await app.page.reload({ waitUntil: "load" }); await waitReady(app.page); await check();
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "malformed restores leave both runtime state and recovery cache unchanged": async (h) => {
      const app = await h.openApp();
      try {
        const outcome = await app.page.evaluate(() => {
          const original = SolitAir.workspaceSnapshot();
          const state = () => JSON.stringify([SolitAir.DB, SolitAir.SH, SolitAir.LL]);
          const before = state(), cache = localStorage.getItem(SolitAir.storageKey);
          const variants = [
            next => { next.db.entries = {}; }, next => { next.db.entries = [{}]; },
            next => { next.shipments.items = [{}]; }, next => { next.warehouse.items = [{}]; },
            next => { next.db.seq.export = "1"; }, next => { next.db.freeHours = { general: "invalid" }; },
          ];
          return variants.map(change => {
            const bad = JSON.parse(JSON.stringify(original)); change(bad);
            let rejected = false;
            try { rejected = SolitAir.restoreWorkspace(bad) === false; } catch { rejected = true; }
            return { rejected, runtimeUnchanged: before === state(), cacheUnchanged: cache === localStorage.getItem(SolitAir.storageKey) };
          });
        });
        for (const result of outcome) h.assert(result.rejected && result.runtimeUnchanged && result.cacheUnchanged, "malformed backup rejected before mutation");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "a stale browser cannot overwrite a newer disk revision and retains its recovery snapshot": async (h) => {
      const fixture = await diskFixture();
      try {
        const stale = await fixture.open(), winner = await fixture.open();
        h.assert(await changeNote(winner, "Winning revision")); await waitSaved(winner);
        const expected = await readRemote(fixture.server);
        h.assert(await changeNote(stale, "Unsent revision"), "local recovery save succeeds before server conflict");
        await stale.waitForFunction(() => SolitAir.storageStatus.kind === "conflict");
        const remote = await readRemote(fixture.server), cache = await cacheOf(stale);
        h.eq(remote.revision, expected.revision); h.eq(remote.snapshot.db.openingNote, "Winning revision");
        h.eq(cache.snapshot.db.openingNote, "Unsent revision"); h.eq(cache.pending, true, "unsynced work retained");
        await stale.reload({ waitUntil: "load" }); await waitReady(stale);
        h.eq(await stale.evaluate(() => SolitAir.storageStatus.kind), "conflict", "restart does not overwrite a newer revision");
        h.eq(await stale.evaluate(() => SolitAir.workspaceSnapshot().db.openingNote), "Unsent revision", "recovery download still has local work");
        h.eq((await readRemote(fixture.server)).revision, expected.revision);
      } finally { await fixture.close(); }
    },

    "revision conflicts reject later opening-balance edits and invoice deletion without changing recovery": async (h) => {
      const fixture = await diskFixture();
      try {
        const stale = await fixture.open();
        await h.fillAdvice(stale, "import", { mawb: "780-30909705", cust: h.SAMPLE_CUSTOMER.name,
          wt: 100, pcs: 2, t1: "2026-09-14T08:00", t2: "2026-09-14T10:00" });
        h.contains(await h.saveAdvice(stale, "import"), "Invoice saved"); await waitSaved(stale);
        const winner = await fixture.open();
        h.assert(await changeNote(winner, "Winning disk revision")); await waitSaved(winner);
        const remoteBefore = await readRemote(fixture.server);
        h.assert(await changeNote(stale, "Retained recovery note"));
        await stale.waitForFunction(() => SolitAir.storageStatus.kind === "conflict");
        const recoveryState = () => stale.evaluate(() => {
          const snapshot = SolitAir.workspaceSnapshot();
          return { content: JSON.stringify([snapshot.db, snapshot.shipments, snapshot.warehouse]),
            cache: localStorage.getItem(SolitAir.storageKey) };
        });
        const before = await recoveryState();
        await stale.evaluate(() => SolitAir.openingDialog());
        await stale.fill("#ob_amt", "999"); await stale.fill("#ob_note", "Rejected opening balance");
        await h.modalClick(stale, "Save");
        h.eq(JSON.stringify(await recoveryState()), JSON.stringify(before), "blocked balance edit preserves runtime and exact cached bytes");
        h.assert(await stale.isVisible("#ob_amt"), "rejected opening balance keeps its form open");
        await h.modalClick(stale, "Cancel");
        await stale.evaluate(() => { SolitAir.buildRegister(); document.querySelector("#regtbl [data-del]").click(); });
        await h.modalClick(stale, "Delete");
        h.eq(JSON.stringify(await recoveryState()), JSON.stringify(before), "blocked deletion preserves invoice, linked warehouse data, and recovery cache");
        h.assert(await stale.isVisible("#modal"), "rejected deletion keeps confirmation open");
        h.eq(JSON.stringify(await readRemote(fixture.server)), JSON.stringify(remoteBefore), "rejected mutations never alter the winning disk snapshot");
      } finally { await fixture.close(); }
    },

    "disk write failure preserves the old file and recovers pending cache after reload": async (h) => {
      const fixture = await diskFixture();
      try {
        const page = await fixture.open(), before = await readRemote(fixture.server), diskBefore = await fixture.diskText();
        const restoreDisk = await fixture.blockDiskWrites();
        h.assert(await changeNote(page, "Pending disk recovery"));
        await page.waitForFunction(() => SolitAir.storageStatus.kind === "error");
        const failed = await readRemote(fixture.server), cache = await cacheOf(page);
        h.eq(JSON.stringify(failed), JSON.stringify(before), "failed disk operation preserves prior snapshot and revision");
        h.eq(await fixture.diskText(), diskBefore, "the prior snapshot file is byte-for-byte intact");
        h.eq(cache.pending, true); h.eq(cache.snapshot.db.openingNote, "Pending disk recovery");
        await restoreDisk();
        await page.reload({ waitUntil: "load" }); await waitReady(page); await waitSaved(page);
        const recovered = await readRemote(fixture.server);
        h.eq(recovered.snapshot.db.openingNote, "Pending disk recovery", "restart sends the recovered local snapshot");
        h.assert(recovered.revision > before.revision); h.eq((await cacheOf(page)).pending, false);
      } finally { await fixture.close(); }
    },

    "browser sandbox on the same origin never reads or overwrites pending disk recovery": async (h) => {
      const fixture = await diskFixture();
      try {
        const disk = await fixture.open(), restoreDisk = await fixture.blockDiskWrites();
        h.assert(await changeNote(disk, "Disk-only pending work"));
        await disk.waitForFunction(() => SolitAir.storageStatus.kind === "error");
        const key = await disk.evaluate(() => SolitAir.storageKey), pending = await disk.evaluate(key => localStorage.getItem(key), key);
        const sandbox = await disk.context().newPage();
        await sandbox.goto(fixture.server.url + "/?storage=browser", { waitUntil: "load" }); await waitReady(sandbox);
        h.assert(await sandbox.evaluate(() => SolitAir.DB.openingNote !== "Disk-only pending work"), "sandbox does not ingest pending disk data");
        h.assert(await changeNote(sandbox, "Sandbox-only work"));
        h.eq(await sandbox.evaluate(key => localStorage.getItem(key), key), pending, "disk cache untouched by sandbox");
        h.assert(await sandbox.evaluate(key => SolitAir.storageKey !== key, key), "separate storage key");
        await restoreDisk();
      } finally { await fixture.close(); }
    },

    "a lost disk-save acknowledgement is reconciled on reload without losing the saved work": async (h) => {
      const fixture = await diskFixture();
      try {
        const page = await fixture.open();
        let intercepted = false, commitStatus = null;
        const loseAcknowledgement = async route => {
          if (route.request().method() !== "PUT" || intercepted) { await route.continue(); return; }
          intercepted = true;
          const response = await route.fetch();
          commitStatus = response.status();
          // The disk write completes, but its acknowledgement never reaches the client.
          await route.abort("failed");
        };
        await page.route("**/api/snapshot", loseAcknowledgement);
        h.assert(await changeNote(page, "Committed without acknowledgement"));
        await page.waitForFunction(() => SolitAir.storageStatus.kind === "error");
        h.eq(commitStatus, 200, "fault occurs after a successful server commit");
        const remote = await readRemote(fixture.server), cache = await cacheOf(page);
        h.eq(remote.snapshot.db.openingNote, "Committed without acknowledgement");
        h.eq(cache.pending, true); h.assert(remote.revision > cache.revision, "server committed but client has the previous revision");
        await page.unroute("**/api/snapshot", loseAcknowledgement);
        await page.reload({ waitUntil: "load" }); await waitReady(page); await waitSaved(page);
        h.eq(await page.evaluate(() => SolitAir.DB.openingNote), "Committed without acknowledgement");
        h.eq((await cacheOf(page)).pending, false, "identical recovered content reconciles successfully");
      } finally { await fixture.close(); }
    },

    "unchanged reloads preserve disk revision and cache while customer autofill still works": async (h) => {
      const fixture = await diskFixture();
      try {
        const page = await fixture.open();
        h.assert(await changeNote(page, "Stable across reloads")); await waitSaved(page);
        const remoteBefore = await readRemote(fixture.server), diskBefore = await fixture.diskText();
        const cacheBefore = await page.evaluate(() => localStorage.getItem(SolitAir.storageKey));
        h.eq(remoteBefore.snapshot.db.customers.length, 0, "derived customer master is not duplicated in snapshots");
        for (let reload = 0; reload < 2; reload++) {
          await page.reload({ waitUntil: "load" }); await waitReady(page); await waitSaved(page);
          // Drain a scheduled save too, so an unnecessary boot write cannot hide behind debounce.
          await page.evaluate(() => SolitAir.flushStorage()); await waitSaved(page);
          h.eq(JSON.stringify(await readRemote(fixture.server)), JSON.stringify(remoteBefore), "unchanged reload preserves snapshot and revision");
          h.eq(await fixture.diskText(), diskBefore, "unchanged reload does not rewrite the disk file");
          h.eq(await page.evaluate(() => localStorage.getItem(SolitAir.storageKey)), cacheBefore, "unchanged reload preserves exact cache bytes");
          await h.tab(page, "Import Advice");
          const listed = await page.evaluate(name => Array.from(document.querySelectorAll("#i_custlist option")).some(option => option.value === name), h.SAMPLE_CUSTOMER.name);
          h.assert(listed, "customer remains available in the advice picker");
          await page.fill("#i_bill", h.SAMPLE_CUSTOMER.name);
          h.eq(await page.inputValue("#i_bill_trn"), String(h.SAMPLE_CUSTOMER.trn), "billing autofill still reads the master");
        }
      } finally { await fixture.close(); }
    },

    "pending recovery cannot be written into a different workspace at the same URL and revision": async (h) => {
      const fixture = await diskFixture();
      try {
        const page = await fixture.open(); await fixture.blockDiskWrites();
        h.assert(await changeNote(page, "Original workspace pending work"));
        await page.waitForFunction(() => SolitAir.storageStatus.kind === "error");
        const key = await page.evaluate(() => SolitAir.storageKey), cache = await cacheOf(page);
        await fixture.switchWorkspace(cache.revision);
        await page.reload({ waitUntil: "load" });
        await page.waitForFunction(() => window.__solitairReady || window.__solitairStartupError);
        const result = await page.evaluate(key => ({ blocked: !!window.__solitairStartupError || window.SolitAir?.storageStatus.kind === "conflict",
          cache: JSON.parse(localStorage.getItem(key)) }), key);
        h.assert(result.blocked, "workspace identity mismatch blocks automatic replay");
        h.eq(result.cache.snapshot.db.openingNote, "Original workspace pending work", "recovery retained");
        const remote = await readRemote(fixture.server);
        h.eq(remote.revision, cache.revision); h.eq(remote.snapshot.db.openingNote, "Different disk workspace", "different disk workspace preserved");
      } finally { await fixture.close(); }
    },
  },
};
