#!/usr/bin/env node
// Disponibla lokala provmål. All drift är loopback-bunden och alla
// genererade hemligheter ligger i gitignorerade filer med läge 0600.

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
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
const phase2FixturesPath = path.join(root, 'work', 'pilot', 'sql', 'phase2-fixtures.sql');
const realmTemplatePath = path.join(root, 'work', 'pilot', 'idp', 'realm-template.json');
const baselineRef = 'fas1-baslinje';
const baselineMigrationCount = 6;
const defaultJwtSecret = 'super-secret-jwt-token-with-at-least-32-characters-long';
const idpImage = 'quay.io/keycloak/keycloak:26.7.3';
const idpContainer = 'skolplattform-pilot-idp';
const idpIssuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const idpPublicUrl = 'http://127.0.0.1:8180';
const hostsBlocked = 'BLOCKED: host.docker.internal löses inte till 127.0.0.1 på den här datorn. Lägg till raden "127.0.0.1 host.docker.internal" i /etc/hosts (kräver administratörsrättighet och görs en gång) och kör igen. Skriptet ändrar aldrig /etc/hosts.';
const portBlocks = { baseline: 553, protected: 563 };
const excludedServices = ['studio', 'mailpit', 'imgproxy', 'edge-runtime', 'logflare', 'vector', 'supavisor'];
const extraExcludedServices = ['realtime', 'postgres-meta'];

const options = { target: null, fresh: false, stop: false, excludeExtra: false, withIdp: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--target') options.target = argv[++i];
  else if (arg.startsWith('--target=')) options.target = arg.slice('--target='.length);
  else if (arg === '--fresh') options.fresh = true;
  else if (arg === '--stop') options.stop = true;
  else if (arg === '--exclude-extra') options.excludeExtra = true;
  else if (arg === '--with-idp') options.withIdp = true;
  else if (arg === '--help' || arg === '-h') {
    console.log('Användning: node work/pilot/prepare-local.mjs --target baseline|protected [--with-idp] [--fresh] [--stop] [--exclude-extra]');
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
if (options.withIdp && options.target !== 'protected') {
  console.error('REFUSED: --with-idp får endast användas med --target protected');
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

function run(command, args, { capture = false, cwd = root, allowFail = false, env = process.env, input } = {}) {
  const proc = spawnSync(command, args, {
    cwd,
    env: { ...env },
    encoding: 'utf8',
    input,
    stdio: capture || input !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (proc.error) throw new Error(`${command} kunde inte startas: ${proc.error.message}`);
  if (!capture && input !== undefined) {
    if (proc.stdout) process.stdout.write(proc.stdout);
    if (proc.stderr) process.stderr.write(proc.stderr);
  }
  if (proc.status !== 0 && !allowFail) {
    const tail = capture || input !== undefined ? `\n${(proc.stderr ?? '').slice(-2000)}` : '';
    throw new Error(`${command} avslutades med exit ${proc.status}${tail}`);
  }
  return proc;
}

function dropCliCache() { fs.rmSync(path.join(workConfigDir, '.temp'), { recursive: true, force: true }); }
function supabase(args, opts = {}) {
  try { return run('supabase', ['--workdir', workdir, ...args], opts); }
  finally { dropCliCache(); }
}
function dockerReady() {
  try { execFileSync('docker', ['info'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}
function readManifest() {
  try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch { return null; }
}
function containerExists() {
  return run('docker', ['inspect', idpContainer], { capture: true, allowFail: true }).status === 0;
}

if (options.stop) {
  if (target === 'protected' && dockerReady() && containerExists()) run('docker', ['rm', '-f', idpContainer], { allowFail: true });
  if (fs.existsSync(path.join(workConfigDir, 'config.toml'))) supabase(['stop', '--no-backup'], { allowFail: true });
  console.log(`Målet ${target} stoppat.`);
  process.exit(0);
}

// D-17 kontrolleras före Docker/Supabase så en saknad engångsrad inte
// startar eller ändrar någon lokal tjänst.
if (options.withIdp && !hostsReady()) {
  console.error(hostsBlocked);
  process.exit(3);
}

if (!dockerReady()) {
  if (process.platform === 'darwin') {
    console.log('Docker-daemonen svarar inte; försöker starta Docker Desktop …');
    try { execFileSync('open', ['-a', 'Docker'], { stdio: 'ignore' }); } catch {}
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline && !dockerReady()) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  }
  if (!dockerReady()) {
    console.error('BLOCKED: Docker-daemonen svarar inte. Starta Docker Desktop och kör igen.');
    process.exit(3);
  }
}
console.log('Docker svarar.');

function hostsReady() {
  if (process.env.SKOLPLATTFORM_TEST_NO_HOSTS === '1') return false;
  if (process.platform === 'darwin') {
    const proc = run('dscacheutil', ['-q', 'host', '-a', 'name', 'host.docker.internal'], { capture: true, allowFail: true });
    return proc.status === 0 && /^ip_address:\s*127\.0\.0\.1\s*$/m.test(proc.stdout ?? '');
  }
  try { return /^\s*127\.0\.0\.1\s+.*\bhost\.docker\.internal\b/m.test(fs.readFileSync('/etc/hosts', 'utf8')); }
  catch { return false; }
}
function randomBase32(length) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  return Array.from(crypto.randomBytes(length), byte => alphabet[byte % alphabet.length]).join('');
}
function secretSet(previous) {
  if (!options.fresh && previous?.idp && previous.worker?.dbUrl && previous.sessionSecret) {
    const workerPassword = decodeURIComponent(new URL(previous.worker.dbUrl).password);
    if (workerPassword) return { clientSecret: previous.idp.clientSecret, adminPassword: previous.idp.adminPassword, totpSecret: previous.idp.totpSecret, workerPassword, sessionSecret: previous.sessionSecret };
  }
  return {
    clientSecret: crypto.randomBytes(32).toString('base64url'),
    adminPassword: crypto.randomBytes(24).toString('base64url'),
    totpSecret: randomBase32(20),
    workerPassword: crypto.randomBytes(32).toString('base64url'),
    sessionSecret: crypto.randomBytes(32).toString('base64'),
  };
}
async function waitForIdp(secrets) {
  const discoveryUrl = `${idpPublicUrl}/realms/skolplattform-test/.well-known/openid-configuration`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(discoveryUrl);
      if (response.ok && (await response.json()).issuer === idpIssuer) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  const logs = run('docker', ['logs', '--tail', '40', idpContainer], { capture: true, allowFail: true });
  const redacted = `${logs.stdout ?? ''}${logs.stderr ?? ''}`.split('\n')
    .filter(line => ![secrets.adminPassword, secrets.clientSecret, secrets.totpSecret].some(secret => secret && line.includes(secret)))
    .slice(-40).join('\n');
  console.error('BLOCKED: Keycloak startade inte inom 120 s');
  if (redacted) console.error(redacted);
  process.exit(3);
}

const previousManifest = readManifest();
let secrets = null;
if (options.withIdp) {
  if (run('docker', ['image', 'inspect', idpImage], { capture: true, allowFail: true }).status !== 0) {
    if (run('docker', ['pull', idpImage], { allowFail: true }).status !== 0) {
      console.error('BLOCKED: Keycloak-bilden kunde inte hämtas (nät krävs första gången).');
      process.exit(3);
    }
  }
  secrets = secretSet(previousManifest);
  const idpDir = path.join(workdir, 'idp');
  fs.mkdirSync(idpDir, { recursive: true });
  if (options.fresh) {
    fs.rmSync(path.join(idpDir, 'totp-users.json'), { force: true });
    fs.rmSync(path.join(idpDir, 'totp-last-used.json'), { force: true });
  }
  const realmPath = path.join(idpDir, 'realm.json');
  const realm = fs.readFileSync(realmTemplatePath, 'utf8').replaceAll('__CLIENT_SECRET__', secrets.clientSecret).replaceAll('__TOTP_SECRET__', secrets.totpSecret);
  fs.writeFileSync(realmPath, realm, { mode: 0o600 });
  fs.chmodSync(realmPath, 0o600);
  const envPath = path.join(idpDir, 'runtime.env');
  fs.writeFileSync(envPath, `KC_BOOTSTRAP_ADMIN_USERNAME=admin\nKC_BOOTSTRAP_ADMIN_PASSWORD=${secrets.adminPassword}\n`, { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
  if (!containerExists() || options.fresh) {
    if (containerExists()) run('docker', ['rm', '-f', idpContainer], { allowFail: true });
    const proc = run('docker', ['run', '-d', '--name', idpContainer, '-p', '127.0.0.1:8180:8080', '--env-file', envPath,
      '-e', 'KC_HOSTNAME=http://host.docker.internal:8180', '-e', 'KC_HTTP_ENABLED=true', '-e', 'KC_HEALTH_ENABLED=true',
      '-v', `${realmPath}:/opt/keycloak/data/import/realm.json:ro`, idpImage, 'start-dev', '--import-realm'], { capture: true, allowFail: true });
    if (proc.status !== 0) { console.error('BLOCKED: Keycloak-containern kunde inte startas.'); process.exit(3); }
  } else {
    run('docker', ['start', idpContainer], { capture: true, allowFail: true });
  }
  await waitForIdp(secrets);
  console.log('Keycloak discovery svarar med förväntad issuer.');
}

function portFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
function targetRunning() {
  if (!fs.existsSync(path.join(workConfigDir, 'config.toml'))) return null;
  const proc = supabase(['status', '-o', 'json'], { capture: true, allowFail: true });
  if (proc.status !== 0) return null;
  const start = proc.stdout.indexOf('{');
  if (start < 0) return null;
  try { return JSON.parse(proc.stdout.slice(start)); } catch { return null; }
}
const running = targetRunning();
let block = portBlocks[target];
if (running && previousManifest?.ports?.api && !options.fresh) {
  block = Math.floor(previousManifest.ports.api / 100);
  console.log(`Målet ${target} kör redan på portblock ${block}xx; behåller det.`);
} else {
  if (running) supabase(['stop', '--no-backup'], { allowFail: true });
  let chosen = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = block + attempt;
    if ((await portFree(candidate * 100 + 21)) && (await portFree(candidate * 100 + 22))) { chosen = candidate; break; }
  }
  if (chosen === null) { console.error(`Inga lediga portblock för målet ${target}. Stoppa det som lyssnar eller kör --stop på andra mål.`); process.exit(1); }
  block = chosen;
}
const ports = { api: block * 100 + 21, db: block * 100 + 22 };

function setSectionKey(toml, section, key, value) {
  const lines = toml.split('\n');
  let inSection = false;
  let done = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\[/.test(line)) {
      if (inSection && !done) throw new Error(`Hittade ingen rad "${key}" i sektionen [${section}] i config.toml`);
      inSection = line.trim() === `[${section}]`;
      continue;
    }
    if (inSection && !done && new RegExp(`^${key.replace(/\./g, '\\\\.')}\\s*=`).test(line)) { lines[i] = `${key} = ${value}`; done = true; }
  }
  if (!done) throw new Error(`Hittade ingen rad "${key}" i sektionen [${section}] i config.toml`);
  return lines.join('\n');
}

let config = fs.readFileSync(sourceConfig, 'utf8');
config = config.replace(/^project_id = ".*"$/m, `project_id = "${projectId}"`);
config = config.replace(/543(\d\d)/g, `${block}$1`);
config = setSectionKey(config, 'db.seed', 'enabled', 'false');
config = setSectionKey(config, 'analytics', 'enabled', 'false');
config = setSectionKey(config, 'edge_runtime', 'enabled', 'false');
config = setSectionKey(config, 'auth', 'enable_anonymous_sign_ins', target === 'protected' ? 'false' : 'true');
if (options.withIdp) {
  config = setSectionKey(config, 'auth.email', 'enable_signup', 'false');
  // Workern validerar nonce före registrering. GoTrue används enbart för
  // identitetsregistrering och får inte bli en alternativ appsession.
  config += `\n[auth.external.keycloak]\nenabled = true\nclient_id = "skolplattform-worker"\nsecret = "${secrets.clientSecret}"\nredirect_uri = ""\nurl = "${idpIssuer}"\nskip_nonce_check = true\nemail_optional = false\n`;
}
if (!config.includes(`project_id = "${projectId}"`)) throw new Error('project_id kunde inte sättas');
const configPath = path.join(workConfigDir, 'config.toml');
const oldConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
let effectiveRunning = running;
if (running && oldConfig !== config) {
  console.log('Målets konfiguration har ändrats; startar om den lokala instansen.');
  supabase(['stop', '--no-backup'], { allowFail: true });
  effectiveRunning = null;
}
fs.mkdirSync(workConfigDir, { recursive: true });
fs.writeFileSync(configPath, config);
fs.writeFileSync(path.join(workdir, 'README.txt'), `Genererad av work/pilot/prepare-local.mjs för målet ${target}. Katalogen är disponibel och gitignorerad.\n`);

const workMigrations = path.join(workConfigDir, 'migrations');
fs.rmSync(workMigrations, { recursive: true, force: true });
fs.mkdirSync(workMigrations, { recursive: true });
const ownTmpDirs = [];
let migrations = [];
let baselineSha = null;
if (target === 'baseline') {
  baselineSha = execFileSync('git', ['rev-parse', '--verify', `${baselineRef}^{commit}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skolplattform-pilot-baseline-'));
  ownTmpDirs.push(tmp);
  const tarPath = path.join(tmp, 'migrations.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tarPath, baselineRef, 'supabase/migrations'], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
  execFileSync('tar', ['-xf', tarPath, '-C', tmp], { stdio: ['ignore', 'inherit', 'inherit'] });
  const files = fs.readdirSync(path.join(tmp, 'supabase', 'migrations')).filter(file => file.endsWith('.sql')).sort();
  if (files.length !== baselineMigrationCount) throw new Error(`Taggen ${baselineRef} innehåller ${files.length} migrationer, förväntade exakt ${baselineMigrationCount}`);
  for (const file of files) fs.copyFileSync(path.join(tmp, 'supabase', 'migrations', file), path.join(workMigrations, file));
  migrations = files;
} else {
  migrations = fs.readdirSync(sourceMigrations).filter(file => file.endsWith('.sql')).sort();
  if (migrations.length === 0) throw new Error('Inga migrationer i supabase/migrations');
  for (const file of migrations) fs.copyFileSync(path.join(sourceMigrations, file), path.join(workMigrations, file));
  const workTests = path.join(workConfigDir, 'tests');
  fs.rmSync(workTests, { recursive: true, force: true });
  fs.mkdirSync(workTests, { recursive: true });
  if (fs.existsSync(sourceTests)) for (const file of fs.readdirSync(sourceTests).filter(file => file.endsWith('.sql')).sort()) fs.copyFileSync(path.join(sourceTests, file), path.join(workTests, file));
}

const exclude = options.excludeExtra ? [...excludedServices, ...extraExcludedServices] : excludedServices;
try {
  if (!effectiveRunning || options.fresh) {
    console.log(`Startar ${projectId} (api ${ports.api}, db ${ports.db}) …`);
    supabase(['start', '-x', exclude.join(',')]);
  }
  console.log('Lägger migrationskedjan: db reset --local --no-seed …');
  supabase(['db', 'reset', '--local', '--no-seed']);
} catch (error) {
  console.error(`BLOCKED: lokal Supabase kunde inte startas eller återställas för målet ${target}: ${error.message}`);
  process.exit(3);
}

const statusProc = supabase(['status', '-o', 'json'], { capture: true });
const status = JSON.parse(statusProc.stdout.slice(statusProc.stdout.indexOf('{')));
for (const key of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL']) if (!status[key]) throw new Error(`supabase status saknar ${key}`);
const apiUrl = status.API_URL;
if (new URL(apiUrl).hostname !== '127.0.0.1' || !status.DB_URL.includes('@127.0.0.1:')) { console.error('REFUSED: den startade instansen är inte loopback-bunden'); process.exit(1); }
const manifest = {
  target, projectId, workdir, apiUrl, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY,
  dbUrl: status.DB_URL, jwtSecret: status.JWT_SECRET ?? defaultJwtSecret, ports, migrations,
  baselineRef: target === 'baseline' ? baselineSha : null, createdAt: new Date().toISOString(),
};
if (options.withIdp) {
  const users = JSON.parse(fs.readFileSync(realmTemplatePath, 'utf8')).users.map(user => ({
    username: user.username,
    subject: user.id,
    email: user.email,
    totp: user.credentials.some(credential => credential.type === 'otp') || user.requiredActions?.includes('CONFIGURE_TOTP') === true,
  }));
  manifest.idp = { containerName: idpContainer, issuer: idpIssuer, publicUrl: idpPublicUrl, clientId: 'skolplattform-worker', clientSecret: secrets.clientSecret, adminUser: 'admin', adminPassword: secrets.adminPassword, totpSecret: secrets.totpSecret, users };
  manifest.worker = { dbUrl: `postgresql://skolplattform_worker:${encodeURIComponent(secrets.workerPassword)}@127.0.0.1:${ports.db}/postgres` };
  manifest.sessionSecret = secrets.sessionSecret;
  manifest.mfa = { acrValues: '2', maxAgeSeconds: 28800 };
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
fs.chmodSync(manifestPath, 0o600);

function pgEnvironment(dbUrl) {
  const parsed = new URL(dbUrl);
  const passPath = path.join(workdir, `.pgpass-${process.pid}`);
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  fs.writeFileSync(passPath, `${parsed.hostname}:${parsed.port}:${parsed.pathname.slice(1)}:${user}:${password.replaceAll('\\', '\\\\').replaceAll(':', '\\:')}\n`, { mode: 0o600 });
  fs.chmodSync(passPath, 0o600);
  return { args: ['-h', parsed.hostname, '-p', parsed.port, '-U', user, '-d', parsed.pathname.slice(1), '-v', 'ON_ERROR_STOP=1', '-q'], env: { ...process.env, PGPASSFILE: passPath }, passPath };
}
function runPsql(dbUrl, sqlOrFile, { file = false } = {}) {
  const pg = pgEnvironment(dbUrl);
  try { return run('psql', [...pg.args, ...(file ? ['-f', sqlOrFile] : ['-f', '-'])], { env: pg.env, input: file ? undefined : sqlOrFile }); }
  finally { fs.rmSync(pg.passPath, { force: true }); }
}
if (target === 'protected') {
  if (!fs.existsSync(fixturesPath)) throw new Error(`Fixturfilen saknas: ${fixturesPath}`);
  console.log('Lägger fixturer: work/pilot/sql/protected-fixtures.sql …');
  runPsql(manifest.dbUrl, fixturesPath, { file: true });
  if (options.withIdp) {
    const escapedWorkerPassword = secrets.workerPassword.replaceAll("'", "''");
    runPsql(manifest.dbUrl, `do $$ begin if exists (select 1 from pg_roles where rolname = 'skolplattform_worker') then execute format('alter role skolplattform_worker with login password %L', '${escapedWorkerPassword}'); end if; end $$;\n`);
    if (fs.existsSync(phase2FixturesPath)) runPsql(manifest.dbUrl, phase2FixturesPath, { file: true });
    else console.log('phase2-fixtures.sql saknas ännu');
  }
}
for (const dir of ownTmpDirs) fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ target, projectId, apiUrl, migrations: migrations.length, manifest: path.relative(root, manifestPath), ...(manifest.idp ? { idp: manifest.idp.issuer } : {}) }));
