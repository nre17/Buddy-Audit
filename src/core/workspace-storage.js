import { app } from './runtime.js';
import { migrateSnapshot, makeSnapshot, validateSnapshot } from './snapshot.js';

export const CACHE_KEY = 'solitair_workspace_v2';
const SANDBOX_KEY = 'solitair_workspace_sandbox_v2';
let storageKey = CACHE_KEY;
let workspace = 'browser-sandbox';
const contentOf = snapshot => JSON.stringify([snapshot.db, snapshot.shipments, snapshot.warehouse]);
let ready = false, browserOnly = false, revision = 0, pending = false, blocked = false, running = false, generation = 0;
let flushTimer, storedContent = '', startupSnapshot = null, firstShipments = false;

function status(kind, message) {
  app.storageStatus = {kind, message, revision, browserOnly};
  window.dispatchEvent(new CustomEvent('solitair:storage', {detail: app.storageStatus}));
  let banner = document.getElementById('storage-status');
  if (!banner) {
    banner = document.createElement('div'); banner.id = 'storage-status'; banner.className = 'storage-status noprint';
    banner.setAttribute('role', 'status'); document.body.appendChild(banner);
  }
  banner.dataset.kind = kind; banner.replaceChildren(document.createTextNode(message));
  if (kind === 'error' || kind === 'conflict') {
    const backup = document.createElement('button'); backup.textContent = 'Download recovery copy';
    backup.onclick = () => app.downloadWorkspaceBackup(); banner.append(' ', backup);
    if (kind === 'error' && !blocked) {
      const retry = document.createElement('button'); retry.textContent = 'Retry disk save'; retry.onclick = () => flush(); banner.append(' ', retry);
    }
  }
}

function readCache() {
  const value = localStorage.getItem(storageKey); if (!value) return null;
  const cache = JSON.parse(value);
  if (!cache || !Number.isInteger(cache.revision) || cache.revision < 0 || typeof cache.pending !== 'boolean') throw new Error('Invalid workspace cache');
  validateSnapshot(cache.snapshot); return cache;
}
function writeCache(snapshot, isPending) {
  localStorage.setItem(storageKey, JSON.stringify({workspace, revision, pending: isPending, snapshot}));
}

export async function prepareStorage() {
  browserOnly = new URLSearchParams(location.search).get('storage') === 'browser';
  storageKey = browserOnly ? SANDBOX_KEY : CACHE_KEY;
  app.storageKey = storageKey;
  const cached = readCache();
  if (browserOnly) {
    if (cached) startupSnapshot = migrateSnapshot(cached.snapshot);
    status('local', 'Browser-only sandbox · isolated from disk workspace'); ready = true; return;
  }
  const [healthResponse, response] = await Promise.all([
    fetch('/api/health', {cache: 'no-store', signal: AbortSignal.timeout(8000)}),
    fetch('/api/snapshot', {cache: 'no-store', signal: AbortSignal.timeout(8000)})
  ]);
  if (!healthResponse.ok) throw new Error('The local workspace identity could not be verified.');
  const health = await healthResponse.json();
  if (health.application !== 'solitair-local-workspace' || typeof health.workspace !== 'string') throw new Error('This address is not the expected SolitAir workspace.');
  workspace = health.workspace;
  if (!response.ok) throw new Error('The local workspace could not be opened.');
  const remote = await response.json();
  if (!Number.isInteger(remote.revision) || remote.revision < 0) throw new Error('Invalid workspace revision');
  revision = remote.revision;
  if (remote.snapshot) validateSnapshot(remote.snapshot);
  if (cached?.pending) {
    if (cached.workspace !== workspace) throw new Error('Unsynced browser data belongs to a different or unidentified workspace. Download the recovery copy before restoring it explicitly.');
    startupSnapshot = migrateSnapshot(cached.snapshot); pending = true;
    if (cached.revision !== revision) {
      if (remote.snapshot && contentOf(cached.snapshot) === contentOf(remote.snapshot)) {
        pending = false; startupSnapshot = migrateSnapshot(remote.snapshot); writeCache(startupSnapshot, false);
      } else {
        blocked = true;
        status('conflict', 'Another session saved newer data. Your unsynced changes are preserved here. Download a recovery copy, then reconcile before continuing.');
      }
    }
  } else if (remote.snapshot) {
    startupSnapshot = migrateSnapshot(remote.snapshot);
    if (!cached || cached.workspace !== workspace || cached.revision !== revision || contentOf(cached.snapshot) !== contentOf(startupSnapshot)) writeCache(startupSnapshot, false);
  } else if (cached?.snapshot) {
    throw new Error('This browser has saved data but the disk workspace is empty. Export a recovery copy before choosing which workspace to restore.');
  }
  ready = true;
  if (!blocked) status('saved', `Disk workspace connected · revision ${revision}`);
}

function rollbackMemory() {
  if (!storedContent) return;
  const prior = JSON.parse(storedContent);
  app.DB = prior[0]; app.SH = prior[1]; app.LL = prior[2];
  app.restoreShippedSettings(); app.applySiteOverrides(); app.applyRateOverrides();
  if (app.DB.staffList?.length) app.CFG.staff = app.DB.staffList;
  if (app.DB.freeHours) Object.assign(app.CFG.freeHours, app.DB.freeHours);
}

function persist() {
  if (!ready || blocked) {
    rollbackMemory();
    status('conflict', 'Saving is paused because this workspace has a newer disk revision. Download your recovery copy before reloading.'); return false;
  }
  try {
    const snapshot = makeSnapshot(app.DB, app.SH, app.LL); validateSnapshot(snapshot);
    const content = contentOf(snapshot);
    if (storedContent === content) return true;
    writeCache(snapshot, !browserOnly); storedContent = content; generation++; pending = !browserOnly;
    window.dispatchEvent(new CustomEvent('solitair:change'));
    if (browserOnly) status('local', 'Saved in browser-only sandbox');
    else {status('saving', 'Saved in browser · saving disk snapshot…'); clearTimeout(flushTimer); flushTimer = setTimeout(flush, 200);}
    return true;
  } catch {
    rollbackMemory();
    status('error', 'Save failed. Your form is still open; free browser storage or download a recovery copy.');
    app.toast('Could not save. No successful save was recorded.', 'err'); return false;
  }
}

async function flush() {
  if (running || !pending || blocked || browserOnly) return;
  running = true; const version = generation;
  try {
    const snapshot = makeSnapshot(app.DB, app.SH, app.LL);
    const response = await fetch('/api/snapshot', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({expectedRevision: revision, snapshot}), signal: AbortSignal.timeout(10000)});
    if (response.status === 409) {
      blocked = true; status('conflict', 'Another session has saved newer data. Disk data was not overwritten. Download your recovery copy and reload to reconcile.'); return;
    }
    if (!response.ok) throw new Error('Disk write failed');
    const saved = await response.json();
    if (!Number.isInteger(saved.revision) || saved.revision !== revision + 1) throw new Error('Invalid save acknowledgement');
    revision = saved.revision; pending = generation !== version;
    writeCache(makeSnapshot(app.DB, app.SH, app.LL), pending);
    status(pending ? 'saving' : 'saved', pending ? 'Saving latest disk snapshot…' : `Saved to disk · revision ${revision}`);
  } catch {status('error', 'Disk save failed. Browser recovery copy retained; keep this window open and retry.');}
  finally {running = false; if (pending && !blocked && generation !== version) flushTimer = setTimeout(flush, 200);}
}

export function installPersistence() {
  app.save = persist; app.shSave = persist; app.llSave = persist;
  app.load = () => {
    if (startupSnapshot) {
      const snapshot = migrateSnapshot(startupSnapshot); app.DB = snapshot.db; app.SH = snapshot.shipments; app.LL = snapshot.warehouse; storedContent = contentOf(snapshot); startupSnapshot = null;
    } else {
      const oldDb = localStorage.getItem('solitair_db'), oldShipments = localStorage.getItem('solitair_shipments_v1'), oldWarehouse = localStorage.getItem('solitair_lying_v1');
      firstShipments = oldShipments === null;
      const snapshot = migrateSnapshot(makeSnapshot(oldDb ? JSON.parse(oldDb) : app.DB, oldShipments ? JSON.parse(oldShipments) : app.SH, oldWarehouse ? JSON.parse(oldWarehouse) : app.LL));
      app.DB = snapshot.db; app.SH = snapshot.shipments; app.LL = snapshot.warehouse;
    }
  };
  app.shLoad = () => {if (firstShipments) {firstShipments = false; app.shImport(app.shDemoItems());}};
  app.llLoad = () => {};
  app.workspaceSnapshot = () => makeSnapshot(app.DB, app.SH, app.LL);
  app.downloadWorkspaceBackup = () => app.dl(JSON.stringify(app.workspaceSnapshot(), null, 2), 'SolitAir_Workspace_' + app.stamp() + '.backup.json', 'application/json');
  app.restoreWorkspace = input => {
    const next = migrateSnapshot(input), previous = {db: app.DB, shipments: app.SH, warehouse: app.LL};
    app.DB = next.db; app.SH = next.shipments; app.LL = next.warehouse;
    if (!persist()) {app.DB = previous.db; app.SH = previous.shipments; app.LL = previous.warehouse; return false;}
    app.restoreShippedSettings(); app.boot(); window.dispatchEvent(new CustomEvent('solitair:change')); return true;
  };
  app.flushStorage = flush;
  window.addEventListener('beforeunload', event => {if (pending && !browserOnly) {event.preventDefault(); event.returnValue = '';}});
  window.addEventListener('online', flush);
  window.addEventListener('storage', event => {
    if (event.key === storageKey && !browserOnly && event.newValue) {blocked = true; status('conflict', 'This workspace changed in another browser tab. Saving is paused; download any unsaved work, then reload.');}
  });
}

export function finishStorageBoot() {if (!blocked) {persist(); if(pending) flush();}}

export function showStartupError(error) {
  const main = document.createElement('main');
  main.style.cssText = 'max-width:720px;margin:10vh auto;padding:36px;font:16px/1.6 system-ui;background:white;border:1px solid #ddd;border-radius:16px';
  const title = document.createElement('h1'); title.textContent = 'Workspace needs attention';
  const message = document.createElement('p'); message.textContent = error.message;
  const note = document.createElement('p'); note.textContent = 'Existing data has been left intact. Restart the local server with Launch SolitAir.cmd, then retry.';
  const retry = document.createElement('button'); retry.textContent = 'Retry opening workspace'; retry.onclick = () => location.reload(); main.append(title, message, note, retry);
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    const download = document.createElement('button'); download.textContent = 'Download browser recovery copy';
    download.onclick = () => app.dl(raw, 'SolitAir_Recovery.backup.json', 'application/json'); main.append(' ', download);
  }
  document.body.replaceChildren(main);
}
