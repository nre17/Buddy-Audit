import path from 'node:path';
import { promises as fs, openSync, closeSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APPLICATION_ID, workspaceIdentity } from './server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.SOLITAIR_DATA_DIR || path.join(root, '.data'));
const port = Number(process.env.SOLITAIR_PORT || 4380);
const noOpen = process.argv.includes('--no-open') || process.env.SOLITAIR_NO_OPEN === '1';
const environment = { ...process.env };
const pathKey = Object.keys(environment).find(key => key.toLowerCase() === 'path') || 'PATH';
environment[pathKey] = path.dirname(process.execPath) + path.delimiter + (environment[pathKey] || '');

async function exists(filename) { try { await fs.access(filename); return true; } catch { return false; } }
function commandExists(command) {
  return spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], { stdio: 'ignore', windowsHide: true, env: environment }).status === 0;
}
async function ensureDependencies(packageInfo) {
  if (await exists(path.join(root, 'node_modules', 'esbuild', 'package.json'))) return;
  const manager = packageInfo.packageManager || 'pnpm@11.19.0';
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(manager)) throw new Error('Configure the pinned pnpm packageManager before first-run setup.');
  if (!await exists(path.join(root, 'pnpm-lock.yaml'))) throw new Error('The pnpm lockfile is missing. Restore it before installing dependencies.');
  const bundledModules = path.resolve(path.dirname(process.execPath), '..', 'node_modules');
  const pnpmCli = path.join(bundledModules, 'pnpm', 'bin', 'pnpm.cjs');
  const npmCli = path.join(bundledModules, 'npm', 'bin', 'npm-cli.js');
  let program, args, shell = false;
  if (await exists(pnpmCli)) { program = process.execPath; args = [pnpmCli, 'install', '--frozen-lockfile']; }
  else if (commandExists('pnpm')) { program = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'; args = ['install', '--frozen-lockfile']; shell = process.platform === 'win32'; }
  else if (await exists(npmCli)) { program = process.execPath; args = [npmCli, 'exec', '--yes', `--package=${manager}`, '--', 'pnpm', 'install', '--frozen-lockfile']; }
  else if (commandExists('npm')) { program = process.platform === 'win32' ? 'npm.cmd' : 'npm'; args = ['exec', '--yes', `--package=${manager}`, '--', 'pnpm', 'install', '--frozen-lockfile']; shell = process.platform === 'win32'; }
  else throw new Error(`First-run setup needs ${manager}. Install pnpm, then run "pnpm install --frozen-lockfile" in ${root}.`);
  console.log('Installing the pinned application dependencies for the first run…');
  const installed = spawnSync(program, args, { cwd: root, stdio: 'inherit', windowsHide: true, env: environment, shell });
  if (installed.error || installed.status !== 0) throw new Error('Dependency installation failed. Check the network and run pnpm install --frozen-lockfile, then retry.');
}

async function health(url) {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500), redirect: 'error' });
    if (!response.ok) throw new Error(`Port ${port} is occupied by a service that is not this SolitAir workspace.`);
    const value = await response.json();
    if (value.application !== APPLICATION_ID || value.workspace !== workspaceIdentity(root, dataDir)) throw new Error(`Port ${port} belongs to another application or workspace. Choose another SOLITAIR_PORT; no process was stopped.`);
    return value;
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return null;
    if (error.name === 'TimeoutError') throw new Error(`The service on port ${port} did not respond. Inspect it or choose another SOLITAIR_PORT.`);
    throw error;
  }
}

function openBrowser(url) {
  const program = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(program, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.unref();
}

try {
  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
  if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 13)) throw new Error('SolitAir needs Node.js 22.13 or newer. Install it and run this launcher again.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SOLITAIR_PORT must be an integer between 1 and 65535.');
  const packageInfo = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const url = `http://127.0.0.1:${port}`;
  const existing = await health(url);
  if (existing && existing.version !== packageInfo.version) throw new Error(`An older SolitAir server (${existing.version}) is still using port ${port}. Close that server before restarting this version; your data is unchanged.`);
  await ensureDependencies(packageInfo);
  console.log('Building SolitAir…');
  const build = spawnSync(process.execPath, [path.join(root, 'tools', 'build.mjs')], { cwd: root, stdio: 'inherit', windowsHide: true, env: environment });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error('The application build failed. Complete dependency setup and retry; saved workspace data was not changed.');
  if (!existing) {
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    const logPath = path.join(dataDir, 'server.log');
    const output = openSync(logPath, 'a', 0o600);
    let child;
    try {
      child = spawn(process.execPath, [path.join(root, 'tools', 'server.mjs')], {
        cwd: root, detached: true, windowsHide: true, stdio: ['ignore', output, output],
        env: { ...environment, SOLITAIR_PORT: String(port), SOLITAIR_DATA_DIR: dataDir },
      });
    } finally { closeSync(output); }
    let startError;
    child.once('error', error => { startError = error; });
    child.unref();
    const deadline = Date.now() + 12000;
    let ready = false;
    while (Date.now() < deadline) {
      if (startError) throw startError;
      const running = await health(url);
      if (running) { ready = true; break; }
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) throw new Error(`The local server did not start. Review ${logPath}. No existing process or saved snapshot was removed.`);
  }
  console.log(`SolitAir is ready: ${url}`);
  console.log(`Saved workspace: ${dataDir}`);
  if (!noOpen) openBrowser(url);
} catch (error) {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
}
