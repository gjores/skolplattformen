#!/usr/bin/env node
// Disponibla lokala provmål för fas 1 (BASE-02, D-08, D-09).
//
// Kör:
//   node work/pilot/prepare-local.mjs --target baseline|protected [--fresh] [--stop] [--exclude-extra]
//
// Mål
//   baseline   exakt de sex migrationer som taggen fas1-baslinje innehåller,
//              anonym inloggning kvar (så som arbetsversionen var).
//   protected  hela migrationskedjan i arbetskopian (inklusive karantänen),
//              anonym inloggning avstängd, fixturer från
//              work/pilot/sql/protected-fixtures.sql, pgTAP-prov kopierade.
//
// Varje mål får en egen arbetskatalog under work/pilot/targets/<mål>/ med
// eget projekt-ID (skolplattform-pilot-<mål>), eget portblock, egna
// Docker-volymer och ett manifest (manifest.json) som verify-target.mjs
// kräver före varje prov. Katalogen är gitignorerad. Molnprojektet, den
// vanliga lokala instansen (project_id "skolplattform") och supabase/.temp
// rörs aldrig; --linked, --db-url och SUPABASE_ACCESS_TOKEN används aldrig.
//
// Avslutningskoder: 0 = klart, 1 = fel/vägran, 3 = BLOCKED (Docker eller
// lokal Supabase kunde inte startas). Ett BLOCKED får aldrig rapporteras
// som PASS.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const targetsDir = path.join(root, 'work', 'pilot', 'targets');
const sourceConfig = path.join(root, 'supabase', 'config.toml');
const sourceMigrations = path.join(root, 'supabase', 'migrations');
const sourceTests = path.join(root, 'supabase', 'tests');
const fixturesPath = path.join(root, 'work', 'pilot', 'sql', 'protected-fixtures.sql');
const baselineRef = 'fas1-baslinje';
const baselineMigrationCount = 6;
const defaultJwtSecret = 'super-secret-jwt-token-with-at-least-32-characters-long';

// Portblock: baseline 553xx, protected 563xx; vid upptagna portar nästa block 554xx/564xx (högst tre försök).
const portBlocks = { baseline: 553, protected: 563 };

// Tjänster som inte behövs för databas-/API-prov. Behåll postgres, kong,
// gotrue, postgrest, storage-api, postgres-meta och realtime.
const excludedServices = ['studio', 'mailpit', 'imgproxy', 'edge-runtime', 'logflare', 'vector', 'supavisor'];
const extraExcludedServices = ['realtime', 'postgres-meta'];

// ---------------------------------------------------------------------------
// Argument
// ---------------------------------------------------------------------------
const options = { target: null, fresh: false, stop: false, excludeExtra: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--target') options.target = argv[++i];
  else if (arg.startsWith('--target=')) options.target = arg.slice('--target='.length);
  else if (arg === '--fresh') options.fresh = true;
  else if (arg === '--stop') options.stop = true;
  else if (arg === '--exclude-extra') options.excludeExtra = true;
  else if (arg === '--help' || arg === '-h') {
    console.log('Användning: node work/pilot/prepare-local.mjs --target baseline|protected [--fresh] [--stop] [--exclude-extra]');
    process.exit(0);
  } else {
    console.error(`REFUSED: okänt argument ${arg} (flaggor som --linked/--db-url är aldrig tillåtna här)`);
    process.exit(1);
  }
}
if (options.target !== 'baseline' && options.target !== 'protected') {
  console.error('REFUSED: ange --target baseline eller --target protected');
  process.exit(1);
}
for (const key of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_URL', 'SUPABASE_PROJECT_REF']) {
  if (process.env[key]) {
    console.error(`REFUSED: miljövariabeln ${key} är satt; lokala provmål förbereds aldrig med molnkonfiguration`);
    process.exit(1);
  }
}

const target = options.target;
const projectId = `skolplattform-pilot-${target}`;
const workdir = path.join(targetsDir, target);
const workConfigDir = path.join(workdir, 'supabase');
const manifestPath = path.join(workdir, 'manifest.json');

function run(command, args, { capture = false, cwd = root, allowFail = false } = {}) {
  const proc = spawnSync(command, args, {
    cwd,
    env: { ...process.env },
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (proc.error) throw new Error(`${command} kunde inte startas: ${proc.error.message}`);
  if (proc.status !== 0 && !allowFail) {
    const tail = capture ? `\n${(proc.stderr ?? '').slice(-2000)}` : '';
    throw new Error(`${command} ${args.join(' ')} avslutades med exit ${proc.status}${tail}`);
  }
  return proc;
}

// CLI:n skriver en versionskontroll-cache i <workdir>/supabase/.temp vid varje
// anrop. Målen är aldrig länkade, så katalogen innehåller inget projekt-ID;
// den tas bort så att .temp aldrig finns i ett provmål (rotens supabase/.temp
// kopieras aldrig hit).
function dropCliCache() {
  fs.rmSync(path.join(workConfigDir, '.temp'), { recursive: true, force: true });
}

function supabase(args, opts = {}) {
  try {
    return run('supabase', ['--workdir', workdir, ...args], opts);
  } finally {
    dropCliCache();
  }
}

// ---------------------------------------------------------------------------
// --stop: stäng målets containrar (volymer tas bort med --no-backup).
// ---------------------------------------------------------------------------
if (options.stop) {
  if (!fs.existsSync(path.join(workConfigDir, 'config.toml'))) {
    console.log(`Målet ${target} har ingen arbetskatalog; inget att stoppa.`);
    process.exit(0);
  }
  supabase(['stop', '--no-backup'], { allowFail: true });
  console.log(`Målet ${target} stoppat.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 1. Preflight: Docker-daemonen måste svara. På macOS försöker vi starta
//    Docker Desktop och väntar högst 120 s.
// ---------------------------------------------------------------------------
function dockerReady() {
  // "docker info" svarar bara när daemonen är igång.
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!dockerReady()) {
  if (process.platform === 'darwin') {
    console.log('Docker-daemonen svarar inte; försöker starta Docker Desktop (open -a Docker) …');
    try {
      execFileSync('open', ['-a', 'Docker'], { stdio: 'ignore' });
    } catch {
      // Hanteras av pollningen nedan.
    }
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline && !dockerReady()) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    }
  }
  if (!dockerReady()) {
    console.error('BLOCKED: Docker-daemonen svarar inte. Starta Docker Desktop och kör igen.');
    process.exit(3);
  }
}
console.log('Docker svarar.');

// ---------------------------------------------------------------------------
// 2. Portblock: kontrollera att api- och db-porten är lediga (eller redan
//    används av just detta mål från en tidigare körning).
// ---------------------------------------------------------------------------
function portFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function targetRunning() {
  if (!fs.existsSync(path.join(workConfigDir, 'config.toml'))) return null;
  const proc = supabase(['status', '-o', 'json'], { capture: true, allowFail: true });
  if (proc.status !== 0) return null;
  const start = proc.stdout.indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(proc.stdout.slice(start));
  } catch {
    return null;
  }
}

const previousManifest = readManifest();
const running = targetRunning();
let block = portBlocks[target];

if (running && previousManifest?.ports?.api && !options.fresh) {
  // Målet kör redan med ett valt block; behåll det.
  block = Math.floor(previousManifest.ports.api / 100);
  console.log(`Målet ${target} kör redan på portblock ${block}xx; behåller det.`);
} else {
  if (running) {
    console.log(`Målet ${target} kör; stoppar det först (--fresh).`);
    supabase(['stop', '--no-backup'], { allowFail: true });
  }
  let chosen = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = block + attempt; // 553xx -> 554xx -> 555xx
    const api = candidate * 100 + 21;
    const db = candidate * 100 + 22;
    // eslint-disable-next-line no-await-in-loop
    if ((await portFree(api)) && (await portFree(db))) {
      chosen = candidate;
      break;
    }
    console.log(`Portarna ${api}/${db} är upptagna; provar nästa block.`);
  }
  if (chosen === null) {
    console.error(`Inga lediga portblock för målet ${target} (provade ${block}xx, ${block + 10}xx, ${block + 20}xx). Stoppa det som lyssnar eller kör --stop på andra mål.`);
    process.exit(1);
  }
  block = chosen;
}
const ports = { api: block * 100 + 21, db: block * 100 + 22 };

// ---------------------------------------------------------------------------
// 3. Arbetskatalog: config.toml (kopia med ändringar), migrationer, prov.
//    supabase/.temp kopieras aldrig.
// ---------------------------------------------------------------------------
function setSectionKey(toml, section, key, value) {
  const lines = toml.split('\n');
  let inSection = false;
  let done = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\[/.test(line)) {
      if (inSection && !done) {
        throw new Error(`Hittade ingen rad "${key}" i sektionen [${section}] i config.toml`);
      }
      inSection = line.trim() === `[${section}]`;
      continue;
    }
    if (inSection && !done && new RegExp(`^${key.replace(/\./g, '\\.')}\\s*=`).test(line)) {
      lines[i] = `${key} = ${value}`;
      done = true;
    }
  }
  if (!done) throw new Error(`Hittade ingen rad "${key}" i sektionen [${section}] i config.toml`);
  return lines.join('\n');
}

// Ändringar mot rotens config.toml: project_id, portblock, [db.seed] enabled = false,
// [analytics] enabled = false, [edge_runtime] enabled = false och för protected
// enable_anonymous_sign_ins = false under [auth].
let config = fs.readFileSync(sourceConfig, 'utf8');
config = config.replace(/^project_id = ".*"$/m, `project_id = "${projectId}"`);
config = config.replace(/543(\d\d)/g, `${block}$1`);
config = setSectionKey(config, 'db.seed', 'enabled', 'false');
config = setSectionKey(config, 'analytics', 'enabled', 'false');
config = setSectionKey(config, 'edge_runtime', 'enabled', 'false');
config = setSectionKey(config, 'auth', 'enable_anonymous_sign_ins', target === 'protected' ? 'false' : 'true');
if (!config.includes(`project_id = "${projectId}"`)) throw new Error('project_id kunde inte sättas');

fs.mkdirSync(workConfigDir, { recursive: true });
fs.writeFileSync(path.join(workConfigDir, 'config.toml'), config);
fs.writeFileSync(path.join(workdir, 'README.txt'),
  `Genererad av work/pilot/prepare-local.mjs för målet ${target}. Katalogen är disponibel och gitignorerad.\n`);

const workMigrations = path.join(workConfigDir, 'migrations');
fs.rmSync(workMigrations, { recursive: true, force: true });
fs.mkdirSync(workMigrations, { recursive: true });

const ownTmpDirs = [];
let migrations = [];
let baselineSha = null;

if (target === 'baseline') {
  // Exakt taggens sex migrationer via git archive (aldrig arbetskopian).
  baselineSha = execFileSync('git', ['rev-parse', '--verify', `${baselineRef}^{commit}`], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skolplattform-pilot-baseline-'));
  ownTmpDirs.push(tmp);
  const tarPath = path.join(tmp, 'migrations.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tarPath, baselineRef, 'supabase/migrations'], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
  execFileSync('tar', ['-xf', tarPath, '-C', tmp], { stdio: ['ignore', 'inherit', 'inherit'] });
  const files = fs.readdirSync(path.join(tmp, 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).sort();
  if (files.length !== baselineMigrationCount) {
    throw new Error(`Taggen ${baselineRef} innehåller ${files.length} migrationer, förväntade exakt ${baselineMigrationCount}`);
  }
  for (const f of files) fs.copyFileSync(path.join(tmp, 'supabase', 'migrations', f), path.join(workMigrations, f));
  migrations = files;
} else {
  migrations = fs.readdirSync(sourceMigrations).filter(f => f.endsWith('.sql')).sort();
  if (migrations.length === 0) throw new Error('Inga migrationer i supabase/migrations');
  for (const f of migrations) fs.copyFileSync(path.join(sourceMigrations, f), path.join(workMigrations, f));
  const workTests = path.join(workConfigDir, 'tests');
  fs.rmSync(workTests, { recursive: true, force: true });
  fs.mkdirSync(workTests, { recursive: true });
  if (fs.existsSync(sourceTests)) {
    for (const f of fs.readdirSync(sourceTests).filter(f => f.endsWith('.sql')).sort()) {
      fs.copyFileSync(path.join(sourceTests, f), path.join(workTests, f));
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Starta målet och lägg migrationskedjan med db reset (utan seed).
// ---------------------------------------------------------------------------
const exclude = options.excludeExtra ? [...excludedServices, ...extraExcludedServices] : excludedServices;
try {
  if (!running || options.fresh) {
    console.log(`Startar ${projectId} (api ${ports.api}, db ${ports.db}) …`);
    supabase(['start', '-x', exclude.join(',')]);
  }
  console.log('Lägger migrationskedjan: db reset --local --no-seed …');
  supabase(['db', 'reset', '--local', '--no-seed']);
} catch (error) {
  console.error(`BLOCKED: lokal Supabase kunde inte startas eller återställas för målet ${target}: ${error.message}`);
  process.exit(3);
}

// ---------------------------------------------------------------------------
// 5. Manifest ur supabase status.
// ---------------------------------------------------------------------------
const statusProc = supabase(['status', '-o', 'json'], { capture: true });
const status = JSON.parse(statusProc.stdout.slice(statusProc.stdout.indexOf('{')));
for (const key of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL']) {
  if (!status[key]) throw new Error(`supabase status saknar ${key}`);
}
const apiUrl = status.API_URL;
if (new URL(apiUrl).hostname !== '127.0.0.1' || !status.DB_URL.includes('@127.0.0.1:')) {
  console.error(`REFUSED: den startade instansen lyssnar inte på 127.0.0.1 (${apiUrl})`);
  process.exit(1);
}
const manifest = {
  target,
  projectId,
  workdir,
  apiUrl,
  anonKey: status.ANON_KEY,
  serviceRoleKey: status.SERVICE_ROLE_KEY,
  dbUrl: status.DB_URL,
  jwtSecret: status.JWT_SECRET ?? defaultJwtSecret,
  ports,
  migrations,
  baselineRef: target === 'baseline' ? baselineSha : null,
  createdAt: new Date().toISOString(),
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });

// ---------------------------------------------------------------------------
// 6. Fixturer för det skyddade målet (psql som postgres, lokalt).
// ---------------------------------------------------------------------------
if (target === 'protected') {
  if (!fs.existsSync(fixturesPath)) throw new Error(`Fixturfilen saknas: ${fixturesPath}`);
  console.log('Lägger fixturer: work/pilot/sql/protected-fixtures.sql …');
  run('psql', [manifest.dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', fixturesPath]);
}

// 7. Städa egna tmp-kataloger.
for (const dir of ownTmpDirs) fs.rmSync(dir, { recursive: true, force: true });

console.log(JSON.stringify({ target, projectId, apiUrl, migrations: migrations.length, manifest: path.relative(root, manifestPath) }));
