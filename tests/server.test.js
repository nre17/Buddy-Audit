const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const serverModule = import('../tools/server.mjs');
const PREFIX = 'solitair-server-test-';

function snapshot(note = '') {
  return {
    format: 'solitair-workspace', version: 1, exportedAt: '2026-09-14T08:00:00.000Z',
    db: { entries: [], seq: { export: 0, import: 0 }, openingNote: note, sec: [] },
    shipments: { items: [] }, warehouse: { items: [], cleared: [], removed: [] },
  };
}

async function fixture(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), PREFIX));
  const staticDir = path.join(directory, 'dist');
  const dataDir = path.join(directory, 'private-data');
  await fs.mkdir(staticDir);
  await fs.writeFile(path.join(staticDir, 'index.html'), '<!doctype html><title>Test workspace</title>');
  await fs.writeFile(path.join(staticDir, 'app.js'), 'window.testWorkspace = true;');
  const { startServer } = await serverModule;
  let app = await startServer({ port: 0, projectDir: directory, staticDir, dataDir, ...overrides });
  t.after(async () => {
    await app.close();
    const resolved = path.resolve(directory);
    const relative = path.relative(path.resolve(os.tmpdir()), resolved);
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(resolved).startsWith(PREFIX), 'cleanup stays in this generated test directory');
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return {
    directory, staticDir, dataDir,
    get app() { return app; },
    async restart() { await app.close(); app = await startServer({ port: 0, projectDir: directory, staticDir, dataDir, ...overrides }); return app; },
  };
}

async function request(app, route, options = {}) {
  const method = options.method || 'GET';
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  const headers = { ...(body !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}), ...(method === 'PUT' ? { Origin: app.url } : {}), ...options.headers };
  for (const [key, value] of Object.entries(headers)) if (value === undefined) delete headers[key];
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: app.port, path: route, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) });
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Test HTTP request timed out.')));
    req.end(body);
  });
}

const put = (app, expectedRevision, value = snapshot()) => request(app, '/api/snapshot', { method: 'PUT', body: { expectedRevision, snapshot: value } });

test('health identifies the application and empty workspace without exposing file paths', async t => {
  const f = await fixture(t);
  const { APPLICATION_ID, workspaceIdentity } = await serverModule;
  const health = await request(f.app, '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json().application, APPLICATION_ID);
  assert.equal(health.json().workspace, workspaceIdentity(f.directory, f.dataDir));
  assert.equal(health.json().revision, 0);
  assert.equal(health.text.includes(f.directory), false);
  assert.deepEqual((await request(f.app, '/api/snapshot')).json(), { revision: 0, snapshot: null });
  assert.equal(f.app.server.address().address, '127.0.0.1');
});

test('all three stores survive an atomic save and process restart', async t => {
  const f = await fixture(t);
  const value = snapshot('Saved workspace');
  value.db.entries.push({ id: 'invoice-demo', type: 'invoice', total: 10 });
  value.shipments.items.push({ awb: '780-30901001' });
  value.warehouse.items.push({ id: 'warehouse-demo', awb: '780-30901001' });
  value.warehouse.cleared.push({ id: 'cleared-demo' });
  value.warehouse.removed.push('removed-demo');
  const saved = await put(f.app, 0, value);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json(), { revision: 1, snapshot: value });
  await f.restart();
  assert.deepEqual((await request(f.app, '/api/snapshot')).json(), { revision: 1, snapshot: value });
  const disk = JSON.parse(await fs.readFile(path.join(f.dataDir, 'snapshot.json'), 'utf8'));
  assert.equal(disk.storageVersion, 1);
  assert.match(disk.sha256, /^[a-f0-9]{64}$/);
});

test('concurrent saves from one revision commit once and return a conflict for the other', async t => {
  const f = await fixture(t);
  const responses = await Promise.all([put(f.app, 0, snapshot('First')), put(f.app, 0, snapshot('Second'))]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const conflict = responses.find(response => response.status === 409).json();
  assert.equal(conflict.code, 'revision_conflict');
  assert.equal(conflict.revision, 1);
  const state = (await request(f.app, '/api/snapshot')).json();
  assert.equal(state.revision, 1);
  assert.ok(['First', 'Second'].includes(state.snapshot.db.openingNote));
  assert.equal((await put(f.app, 1, snapshot('Next'))).status, 200, 'the queue continues after a conflict');
});

test('invalid schemas, unsafe properties, and deep structures never replace valid state', async t => {
  const f = await fixture(t);
  await put(f.app, 0);
  const bad = [null, { ...snapshot(), version: 2 }, { ...snapshot(), db: { entries: {} } }, { ...snapshot(), warehouse: { items: [], cleared: [] } }, { ...snapshot(), surprise: 'field' }];
  const unsafe = snapshot();
  unsafe.db.setting = JSON.parse('{"__proto__":{"polluted":true}}');
  bad.push(unsafe);
  const deep = snapshot();
  let parent = deep.db;
  for (let i = 0; i < 40; i++) parent = parent.nested = {};
  bad.push(deep);
  for (const value of bad) assert.equal((await put(f.app, 1, value)).status, 400);
  assert.equal((await request(f.app, '/api/snapshot')).json().revision, 1);
  const nonfinite = snapshot(); nonfinite.db.total = Infinity;
  const { validateSnapshot } = await serverModule;
  assert.throws(() => validateSnapshot(nonfinite), /finite/);
});

test('origin, host, content type, and cross-site guards block writes without changing state', async t => {
  const f = await fixture(t);
  const body = { expectedRevision: 0, snapshot: snapshot() };
  for (const headers of [{ Origin: undefined }, { Origin: 'null' }, { Origin: 'https://untrusted.example' }, { Origin: `http://127.0.0.1:${f.app.port + 1}` }, { Host: 'untrusted.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await request(f.app, '/api/snapshot', { method: 'PUT', body, headers })).status, 403);
  }
  assert.equal((await request(f.app, '/api/snapshot', { method: 'PUT', body, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request(f.app, '/api/health', { headers: { Host: 'untrusted.example' } })).status, 403);
  assert.equal((await request(f.app, '/api/snapshot')).json().revision, 0);
});

test('oversized bodies and malformed JSON fail before persistence', async t => {
  const f = await fixture(t, { maxBytes: 2048 });
  assert.equal((await put(f.app, 0, snapshot('x'.repeat(3000)))).status, 413);
  assert.equal((await request(f.app, '/api/snapshot', { method: 'PUT', rawBody: '{broken' })).status, 400);
  assert.equal((await request(f.app, '/api/snapshot')).json().revision, 0);
  assert.equal((await put(f.app, 0)).status, 200, 'a valid request still saves after rejection');
});

test('rotated backups preserve complete previous snapshots and ignore unrelated files', async t => {
  const f = await fixture(t, { backupLimit: 2 });
  await fs.mkdir(path.join(f.dataDir, 'backups'));
  await fs.writeFile(path.join(f.dataDir, 'backups', 'keep.txt'), 'unrelated file');
  for (let i = 0; i < 4; i++) assert.equal((await put(f.app, i, snapshot(`Revision ${i + 1}`))).status, 200);
  const files = await fs.readdir(path.join(f.dataDir, 'backups'));
  assert.ok(files.includes('keep.txt'));
  const backups = files.filter(name => name.endsWith('.backup.json'));
  assert.equal(backups.length, 2);
  const revisions = [];
  for (const name of backups) {
    const saved = JSON.parse(await fs.readFile(path.join(f.dataDir, 'backups', name), 'utf8'));
    revisions.push(saved.revision);
    assert.equal(saved.snapshot.db.openingNote, `Revision ${saved.revision}`);
  }
  assert.deepEqual(revisions.sort(), [2, 3]);
});

test('corrupt on-disk snapshots fail startup without silently replacing the data', async t => {
  const f = await fixture(t);
  await put(f.app, 0);
  await f.app.close();
  const file = path.join(f.dataDir, 'snapshot.json');
  const record = JSON.parse(await fs.readFile(file, 'utf8'));
  record.snapshot.db.openingNote = 'Tampered';
  const corrupt = JSON.stringify(record);
  await fs.writeFile(file, corrupt);
  const { startServer } = await serverModule;
  await assert.rejects(startServer({ port: 0, projectDir: f.directory, staticDir: f.staticDir, dataDir: f.dataDir }), /integrity check failed/);
  assert.equal(await fs.readFile(file, 'utf8'), corrupt);
  await assert.rejects(fs.access(path.join(f.dataDir, '.server.lock')), { code: 'ENOENT' });
});

test('failed disk writes preserve the previous revision and do not poison later saves', async t => {
  const f = await fixture(t, { backupLimit: 2 });
  await put(f.app, 0, snapshot('Durable original'));
  const target = path.join(f.dataDir, 'snapshot.json');
  const held = path.join(f.dataDir, 'saved-original.json');
  await fs.rename(target, held);
  await fs.mkdir(target); // force atomic replacement to fail on every supported OS
  for (let i = 0; i < 3; i++) {
    const rejected = await put(f.app, 1, snapshot('Must not report saved'));
    assert.equal(rejected.status, 507);
    assert.equal(rejected.json().code, 'storage_write_failed');
  }
  const current = (await request(f.app, '/api/snapshot')).json();
  assert.equal(current.revision, 1);
  assert.equal(current.snapshot.db.openingNote, 'Durable original');
  assert.equal(JSON.parse(await fs.readFile(held, 'utf8')).revision, 1);
  const backups = (await fs.readdir(path.join(f.dataDir, 'backups'))).filter(name => name.endsWith('.backup.json'));
  assert.equal(backups.length, 1, 'failed retries do not accumulate duplicate revision backups');
  await fs.rmdir(target);
  await fs.rename(held, target);
  assert.equal((await put(f.app, 1, snapshot('Recovered save'))).status, 200);
  await f.restart();
  assert.equal((await request(f.app, '/api/snapshot')).json().revision, 2);
});

test('one process owns a data directory even when another server chooses another port', async t => {
  const f = await fixture(t);
  const { startServer } = await serverModule;
  await assert.rejects(startServer({ port: 0, projectDir: f.directory, staticDir: f.staticDir, dataDir: f.dataDir }), /already owns/);
  assert.equal((await request(f.app, '/api/health')).status, 200);
  await f.restart();
  assert.equal((await request(f.app, '/api/health')).status, 200);
});

test('static assets support HEAD and SPA routes without exposing data or traversing symlinks', async t => {
  const f = await fixture(t);
  const index = await request(f.app, '/');
  assert.equal(index.status, 200);
  assert.match(index.headers['content-type'], /text\/html/);
  assert.match(index.headers['content-security-policy'], /script-src 'self'/);
  assert.equal(index.headers['access-control-allow-origin'], undefined);
  assert.equal((await request(f.app, '/app.js', { method: 'HEAD' })).text, '');
  assert.equal((await request(f.app, '/advice/export', { headers: { Accept: 'text/html' } })).status, 200);
  assert.equal((await request(f.app, '/missing.js')).status, 404);
  for (const route of ['/.data/snapshot.json', '/%2e%2e%2fprivate-data/snapshot.json', '/%00', '/..%5cprivate-data/snapshot.json']) assert.equal((await request(f.app, route)).status, 403);
  await fs.writeFile(path.join(f.dataDir, 'secret.txt'), 'private test content');
  await fs.symlink(f.dataDir, path.join(f.staticDir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await request(f.app, '/linked/secret.txt')).status, 403);
});

test('unsupported API methods never erase a saved workspace', async t => {
  const f = await fixture(t);
  await put(f.app, 0, snapshot('Keep this'));
  assert.equal((await request(f.app, '/api/snapshot', { method: 'DELETE' })).status, 405);
  assert.equal((await request(f.app, '/api/snapshot', { method: 'POST' })).status, 405);
  assert.equal((await request(f.app, '/api/unknown')).status, 404);
  assert.equal((await request(f.app, '/api/snapshot')).json().snapshot.db.openingNote, 'Keep this');
});

test('storage cannot be configured inside the served directory', async t => {
  const f = await fixture(t);
  const { startServer } = await serverModule;
  await assert.rejects(startServer({ port: 0, staticDir: f.staticDir, dataDir: path.join(f.staticDir, 'private') }), /outside/);
});
