import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateBookingPlanner } from '../src/domain/bookings.mjs';

export const APPLICATION_ID = 'solitair-local-workspace';
const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const BACKUP_PATTERN = /^revision-(\d+)-[a-f0-9-]+\.backup\.json$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp' };

class HttpError extends Error {
  constructor(status, code, message, extra = {}) { super(message); Object.assign(this, { status, code, extra }); }
}

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function inside(parent, target) { const relative = path.relative(parent, target); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }

export function workspaceIdentity(projectDir, dataDir) {
  return hash(`${path.resolve(projectDir)}\n${path.resolve(dataDir)}`).slice(0, 24);
}

/** Bounded envelope validation, plus the shared booking domain schema. */
export function validateSnapshot(snapshot) {
  const invalid = (message) => { throw new HttpError(400, 'invalid_snapshot', message); };
  if (!isObject(snapshot) || snapshot.format !== 'solitair-workspace' || snapshot.version !== 1) invalid('Expected a version 1 SolitAir workspace snapshot.');
  const allowed = new Set(['format', 'version', 'exportedAt', 'db', 'shipments', 'warehouse']);
  if (Object.keys(snapshot).some(key => !allowed.has(key))) invalid('The workspace envelope contains an unsupported field.');
  if (typeof snapshot.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(snapshot.exportedAt) || !Number.isFinite(Date.parse(snapshot.exportedAt))) invalid('The workspace export timestamp is invalid.');
  if (!isObject(snapshot.db) || !Array.isArray(snapshot.db.entries)) invalid('The invoice database must contain an entries array.');
  if (!isObject(snapshot.shipments) || !Array.isArray(snapshot.shipments.items)) invalid('The shipment database must contain an items array.');
  if (!isObject(snapshot.warehouse) || !['items', 'cleared', 'removed'].every(key => Array.isArray(snapshot.warehouse[key]))) invalid('The warehouse must contain items, cleared, and removed arrays.');
  for (const key of ['sec', 'customers', 'staffList', 'reports', 'equipment']) {
    if (snapshot.db[key] !== undefined && !Array.isArray(snapshot.db[key])) invalid(`The invoice database ${key} field must be an array.`);
  }
  if (snapshot.db.seq !== undefined && !isObject(snapshot.db.seq)) invalid('Invoice sequences must be an object.');
  for (const records of [snapshot.db.entries, snapshot.shipments.items, snapshot.warehouse.items, snapshot.warehouse.cleared]) {
    if (records.length > 50000 || !records.every(isObject)) invalid('Workspace record collections must contain at most 50,000 objects.');
  }
  if (!snapshot.warehouse.removed.every(value => typeof value === 'string')) invalid('Removed warehouse identities must be strings.');
  let nodes = 0;
  function visit(value, depth) {
    if (++nodes > 400000 || depth > 30) invalid('The workspace exceeds the supported nesting or value limit.');
    if (typeof value === 'number' && !Number.isFinite(value)) invalid('Workspace numbers must be finite.');
    if (typeof value === 'string' && value.length > 2 * 1024 * 1024) invalid('A workspace field exceeds the supported size.');
    if (value && typeof value === 'object') {
      if (Array.isArray(value) && value.length > 50000) invalid('A workspace collection exceeds the supported size.');
      for (const key of Object.keys(value)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) invalid('The workspace contains an unsafe property name.');
        visit(value[key], depth + 1);
      }
    } else if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) invalid('The workspace must contain only JSON values.');
  }
  visit(snapshot, 0);
  if (snapshot.db.bookingPlanner !== undefined) {
    try { validateBookingPlanner(snapshot.db.bookingPlanner); }
    catch (error) { invalid(error.message); }
  }
  return snapshot;
}

async function claimDataDirectory(dataDir) {
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lockPath = path.join(dataDir, '.server.lock');
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(lockPath, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() })); await handle.sync(); }
      finally { await handle.close(); }
      return async () => {
        try {
          const held = JSON.parse(await fs.readFile(lockPath, 'utf8'));
          if (held.token === token) await fs.unlink(lockPath);
        } catch (error) { if (error.code !== 'ENOENT') console.error('Could not release the local workspace lock.'); }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let held;
      try { held = JSON.parse(await fs.readFile(lockPath, 'utf8')); }
      catch { throw new Error('The workspace lock is unreadable. Its contents have been preserved; inspect it before restarting.'); }
      if (!Number.isSafeInteger(held.pid) || held.pid <= 0) throw new Error('The workspace lock is invalid. Inspect it before restarting.');
      let running = true;
      try { process.kill(held.pid, 0); } catch (check) { if (check.code === 'ESRCH') running = false; }
      if (running) throw new Error('Another local server already owns this workspace data directory.');
      // Preserve stale lock evidence; never remove or reset a snapshot to recover.
      try { await fs.rename(lockPath, path.join(dataDir, `.stale-lock-${randomUUID()}.json`)); }
      catch (renameError) { if (renameError.code !== 'ENOENT') throw renameError; }
    }
  }
  throw new Error('Could not acquire the local workspace lock.');
}

async function syncDirectory(directory) {
  // Node/Windows cannot open directories for fsync. The file itself is synced.
  if (process.platform === 'win32') return;
  let handle;
  try { handle = await fs.open(directory, 'r'); await handle.sync(); }
  finally { await handle?.close(); }
}

async function replaceAtomic(temporary, filename) {
  // A Windows file scanner or another short-lived reader can deny replacement
  // after both of our handles are closed. Retry the same rename, never an
  // unlink/copy fallback: the previous complete snapshot stays in place.
  const delays = [25, 50, 100, 200, 400];
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(temporary, filename);
      if (attempt) console.warn('Workspace atomic replacement recovered after a filesystem retry:', path.basename(filename), `(${attempt} retries)`);
      return;
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= delays.length) throw error;
      // A directory or an inaccessible path is a structural fault, not a
      // replaceable file. Surface it immediately rather than delaying a retry.
      try { if (!(await fs.stat(filename)).isFile()) throw error; }
      catch (inspectionError) { if (inspectionError.code !== 'ENOENT') throw error; }
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }
}

async function writeAtomic(filename, content) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  let renamed = false;
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await replaceAtomic(temporary, filename);
    renamed = true;
    // A metadata flush failure after rename must not falsely report a rolled-back write.
    try { await syncDirectory(path.dirname(filename)); }
    catch { console.error('Workspace saved, but directory metadata could not be flushed.'); }
  } finally {
    if (!renamed) { try { await fs.unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') console.error('A temporary workspace file was preserved after a failed write.'); } }
  }
}

async function createStore(dataDir, maxBytes, backupLimit) {
  const filename = path.join(dataDir, 'snapshot.json');
  const backupDir = path.join(dataDir, 'backups');
  let state = { revision: 0, snapshot: null };
  let storedText = null;
  try {
    const stat = await fs.stat(filename);
    if (stat.size > maxBytes + 4096) throw new Error('Stored workspace exceeds the supported size.');
    storedText = await fs.readFile(filename, 'utf8');
    const record = JSON.parse(storedText);
    if (record.storageVersion !== 1 || !Number.isSafeInteger(record.revision) || record.revision < 1) throw new Error('Stored workspace has an invalid revision or storage version.');
    validateSnapshot(record.snapshot);
    if (record.sha256 !== hash(JSON.stringify({ revision: record.revision, snapshot: record.snapshot }))) throw new Error('Stored workspace integrity check failed.');
    state = { revision: record.revision, snapshot: record.snapshot };
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot open the saved workspace. Existing files are preserved. ${error.message}`);
  }
  let queue = Promise.resolve();
  async function pruneBackups() {
    const backups = (await fs.readdir(backupDir)).filter(name => BACKUP_PATTERN.test(name));
    backups.sort((a, b) => Number(BACKUP_PATTERN.exec(b)[1]) - Number(BACKUP_PATTERN.exec(a)[1]));
    for (const name of backups.slice(backupLimit)) {
      const target = path.resolve(backupDir, name);
      if (!inside(backupDir, target) || path.dirname(target) !== backupDir) throw new Error('Unsafe backup retention path.');
      await fs.unlink(target);
    }
  }
  return {
    read: () => state,
    drained: () => queue,
    replace(expectedRevision, snapshot) {
      const operation = queue.then(async () => {
        if (expectedRevision !== state.revision) throw new HttpError(409, 'revision_conflict', 'The disk workspace changed. Reload it before saving again.', { revision: state.revision });
        if (state.revision >= Number.MAX_SAFE_INTEGER) throw new HttpError(507, 'revision_limit', 'The workspace revision limit has been reached.');
        const next = { revision: state.revision + 1, snapshot };
        const text = JSON.stringify({ storageVersion: 1, ...next, savedAt: new Date().toISOString(), sha256: hash(JSON.stringify(next)) });
        try {
          if (storedText !== null) {
            await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
            await writeAtomic(path.join(backupDir, `revision-${String(state.revision).padStart(12, '0')}-${hash(storedText).slice(0, 32)}.backup.json`), storedText);
            await pruneBackups();
          }
          await writeAtomic(filename, text);
        } catch (error) {
          console.error('Workspace disk write failed:', error.code || error.name, error.syscall || 'unknown operation', path.basename(error.dest || error.path || filename));
          throw new HttpError(507, 'storage_write_failed', 'The workspace could not be saved to disk. Your previous snapshot has been preserved.');
        }
        state = next;
        storedText = text;
        if (state.revision > 1) {
          try { await pruneBackups(); }
          catch { console.error('Workspace saved; prior backup retention cleanup will be retried on the next save.'); }
        }
        return state;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}

function json(res, status, value, extraHeaders = {}) {
  const text = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), ...extraHeaders });
  res.end(text);
}

function bodyJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    if (Number(req.headers['content-length'] || 0) > maxBytes) { req.resume(); reject(new HttpError(413, 'body_too_large', 'The workspace exceeds the maximum request size.')); return; }
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        chunks.length = 0;
        reject(new HttpError(413, 'body_too_large', 'The workspace exceeds the maximum request size.'));
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > maxBytes) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'invalid_json', 'The request must contain valid JSON.')); }
    });
    req.on('aborted', () => reject(new HttpError(400, 'request_aborted', 'The save request was interrupted.')));
    req.on('error', reject);
  });
}

export async function startServer(options = {}) {
  const projectDir = path.resolve(options.projectDir || PROJECT_DIR);
  const dataDir = path.resolve(options.dataDir || process.env.SOLITAIR_DATA_DIR || path.join(projectDir, '.data'));
  const staticDir = path.resolve(options.staticDir || path.join(projectDir, 'dist'));
  const port = Number(options.port ?? process.env.SOLITAIR_PORT ?? 4380);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const backupLimit = options.backupLimit ?? 20;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('SOLITAIR_PORT must be an integer between 0 and 65535.');
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || !Number.isInteger(backupLimit) || backupLimit < 1 || backupLimit > 100) throw new Error('Invalid local storage limits.');
  if (inside(staticDir, dataDir)) throw new Error('The data directory must be outside the public static directory.');
  const packageInfo = JSON.parse(await fs.readFile(path.join(PROJECT_DIR, 'package.json'), 'utf8'));
  const version = options.version || packageInfo.version;
  const identity = workspaceIdentity(projectDir, dataDir);
  const releaseLock = await claimDataDirectory(dataDir);
  let store;
  try {
    const realData = await fs.realpath(dataDir);
    let realStatic;
    try { realStatic = await fs.realpath(staticDir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (realStatic && inside(realStatic, realData)) throw new Error('The data directory must be outside the public static directory, including symbolic links.');
    store = await createStore(dataDir, maxBytes, backupLimit);
  }
  catch (error) { await releaseLock(); throw error; }
  let boundPort;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const allowedHosts = [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`];
      if (!allowedHosts.includes(req.headers.host) || (req.headers.origin && !allowedHosts.map(host => `http://${host}`).includes(req.headers.origin))) throw new HttpError(403, 'local_access_only', 'Only this local application may access the workspace.');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'local_access_only', 'Cross-site requests are not accepted.');
      if (!req.url?.startsWith('/') || req.url.startsWith('//')) throw new HttpError(400, 'invalid_path', 'Invalid request path.');
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${boundPort}`).pathname); }
      catch { throw new HttpError(400, 'invalid_path', 'Invalid request path.'); }
      if (pathname === '/api/health') {
        if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed', 'Use GET for health checks.');
        json(res, 200, { application: APPLICATION_ID, version, workspace: identity, storageVersion: 1, revision: store.read().revision });
        return;
      }
      if (pathname === '/api/snapshot') {
        if (req.method === 'GET') { json(res, 200, store.read()); return; }
        if (req.method !== 'PUT') throw new HttpError(405, 'method_not_allowed', 'Use GET or PUT for workspace snapshots.');
        if (!req.headers.origin) throw new HttpError(403, 'origin_required', 'A local application origin is required for saving.');
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'json_required', 'Workspace saves require application/json.');
        const body = await bodyJson(req, maxBytes);
        if (!isObject(body) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || Object.keys(body).some(key => !['expectedRevision', 'snapshot'].includes(key))) throw new HttpError(400, 'invalid_request', 'A save must contain expectedRevision and snapshot.');
        validateSnapshot(body.snapshot);
        json(res, 200, await store.replace(body.expectedRevision, body.snapshot));
        return;
      }
      if (pathname.startsWith('/api/')) throw new HttpError(404, 'not_found', 'Unknown local API route.');
      if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'method_not_allowed', 'Static files support GET and HEAD.');
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) throw new HttpError(403, 'invalid_path', 'That path is not public.');
      let realRoot;
      try { realRoot = await fs.realpath(staticDir); }
      catch { throw new HttpError(503, 'build_missing', 'Build the application before opening it.'); }
      let target = path.resolve(realRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!inside(realRoot, target)) throw new HttpError(403, 'invalid_path', 'That path is not public.');
      try { target = await fs.realpath(target); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (path.extname(pathname) || !String(req.headers.accept || '').includes('text/html')) throw new HttpError(404, 'not_found', 'File not found.');
        try { target = await fs.realpath(path.join(realRoot, 'index.html')); }
        catch { throw new HttpError(503, 'build_missing', 'Build the application before opening it.'); }
      }
      if (!inside(realRoot, target)) throw new HttpError(403, 'invalid_path', 'That path is not public.');
      const stat = await fs.stat(target);
      if (!stat.isFile()) throw new HttpError(404, 'not_found', 'File not found.');
      const content = await fs.readFile(target);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Content-Length': content.length });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.destroyed || res.headersSent) return;
      json(res, error.status || 500, { error: error.status ? error.message : 'The local server could not complete this request.', code: error.code || 'server_error', ...(error.extra || {}) });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); boundPort = server.address().port; resolve(); });
    });
  } catch (error) { await releaseLock(); throw error; }
  let closed = false;
  return {
    server, port: boundPort, url: `http://127.0.0.1:${boundPort}`, dataDir,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); });
      await store.drained();
      await releaseLock();
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const app = await startServer();
    console.log(`SolitAir local workspace ready at ${app.url}`);
    let stopping = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      try { await app.close(); process.exit(0); }
      catch { process.exit(1); }
    });
  } catch (error) { console.error(`SolitAir could not start: ${error.message}`); process.exitCode = 1; }
}
