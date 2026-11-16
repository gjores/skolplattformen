// Helt egen PostgreSQL, Keycloak och GoTrue. Ingen målanslutning, dump, delad realm eller användarautentisering läses.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, cpSync, symlinkSync, openSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { createServer as httpServer, request as httpRequest } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrationFiles } from './ephemeral-migrated-db.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(path.join(root, 'web/package.json'));
const postgres = require('postgres');
export const SCHEMA_ACTUAL_ISSUER = 'http://host.docker.internal:8180/realms/skolplattform-test';
const CLIENT = 'skolplattform-worker';
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 }).trim();
const hash = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const port = async () => { const server = createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value; };
async function ready(url, check = () => {}, count = 180) {
  for (let i = 0; i < count; i++) { check(); try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.ok) return; } catch {} await sleep(250); }
  throw new Error('Owned service readiness timed out: ' + new URL(url).pathname);
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM'); await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(10000).then(() => { child.kill('SIGKILL'); })]);
}
function sourceFiles(directory) {
  const result = {};
  const visit = (dir, prefix) => { for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isSymbolicLink() || ['node_modules', 'dist', 'dist-protected', '.git', '.wrangler', '.next', '.vinext', '.DS_Store', 'test-results', 'playwright-report'].includes(item.name)
      || item.name.startsWith('.env') || item.name === '.dev.vars') continue;
    const file = path.join(dir, item.name), relative = prefix + item.name;
    if (item.isDirectory()) visit(file, relative + '/'); else if (item.isFile()) result[relative] = hash(readFileSync(file));
  } }; visit(directory, 'web/'); return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

/** Egen källfrysning av arbetskopian; detta påstår inte en ännu ej skapad ren commit. */
export async function buildSchemaActual(directory, onStage = () => {}, tag = 'candidate') {
  assert.match(tag, /^[a-z][a-z0-9-]{0,60}$/u);
  const candidate = path.join(directory, tag), source = path.join(root, 'web'), target = path.join(candidate, 'web'); mkdirSync(candidate, { mode: 0o700 });
  cpSync(source, target, { recursive: true, filter(file) { const relative = path.relative(source, file), parts = relative.split(path.sep);
    return !parts.some(name => ['node_modules', 'dist', 'dist-protected', '.wrangler', '.next', '.vinext', '.DS_Store', 'test-results', 'playwright-report'].includes(name) || name.startsWith('.env') || name === '.dev.vars'); } });
  if (existsSync(path.join(source, '.vinext/fonts'))) cpSync(path.join(source, '.vinext/fonts'), path.join(target, '.vinext/fonts'), { recursive: true });
  const sources = sourceFiles(target); assert.deepEqual(sources, sourceFiles(source), 'Source changed while freezing candidate');
  symlinkSync(path.join(source, 'node_modules'), path.join(target, 'node_modules'), 'dir');
  const log = path.join(directory, 'build.log'), fd = openSync(log, 'wx', 0o600); onStage('building');
  try {
    const child = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'build'], { cwd: target, stdio: ['ignore', fd, fd], env: { ...process.env,
      NEXT_PUBLIC_APP_MODE: 'protected', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' } });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }); assert.equal(code, 0, 'Owned build failed; inspect private build.log');
  } finally { closeSync(fd); }
  assert.deepEqual(sourceFiles(target), sources, 'Frozen sources changed during build');
  return { buildRoot: path.join(target, 'dist'), sources, sourceManifestSha256: hash(JSON.stringify(sources)), kind: 'frozen-working-tree',
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() };
}

/** All secrets are fresh and held only in the owned 0700 directory. Existing Docker objects are never inspected or reused. */
export async function createSchemaActualRuntime({ directory, onStage = () => {} }) {
  assert.ok(directory.startsWith('/private/tmp/')); chmodSync(directory, 0o700);
  const runId = randomUUID(), suffix = runId.replaceAll('-', ''), names = { network: 'schema-actual-' + suffix, idp: 'schema-idp-' + suffix, auth: 'schema-auth-' + suffix };
  const ports = { postgres: await port(), idp: await port(), auth: await port(), api: await port(), worker: await port(), motor: await port() };
  const baseURL = `http://127.0.0.1:${ports.worker}`, idpURL = `http://127.0.0.1:${ports.idp}`, apiURL = `http://127.0.0.1:${ports.api}`;
  const secrets = { client: randomBytes(32).toString('hex'), authDb: randomBytes(32).toString('hex'), workerDb: randomBytes(32).toString('hex'),
    jwt: randomBytes(40).toString('hex'), session: randomBytes(48).toString('base64url'), motor: randomBytes(24).toString('hex') };
  const bin = ['/opt/homebrew/opt/postgresql@18/bin', '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/18/bin', '/usr/lib/postgresql/17/bin'].find(dir => existsSync(path.join(dir, 'initdb')));
  assert.ok(bin, 'PostgreSQL server is required'); assert.ok(!process.getuid || process.getuid() !== 0, 'Use an unprivileged owner for this local runtime');
  const pg = mkdtempSync(path.join(directory, 'postgres-')), data = path.join(pg, 'data'), database = 'named_timplan_' + suffix;
  const privateFile = path.join(directory, 'runtime-private.json');
  const journal = { kind: 'schema-actual-owned-runtime', runId, names, ports, baseURL, idpURL, apiURL, database, pg, status: 'initializing', cleanup: 'pending' };
  const save = () => writeFileSync(privateFile, JSON.stringify({ ...journal, secrets }, null, 2) + '\n', { mode: 0o600 }); save();
  let db, started = false, network = false, idp = false, auth = false, proxy, worker, motor, build, cleaned = false;
  const logs = [], provenance = { kind: 'own-initialized-postgresql-keycloak-gotrue', noTargetReads: true, noUserBrowserAuth: true, names, ports };
  const run = (file, args) => execFileSync(path.join(bin, file), args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 });
  const cleanup = async () => {
    if (cleaned) return { cleanup: journal.cleanup };
    try {
      await stop(worker); await stop(motor);
      if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
      for (const [name, exists] of [[names.auth, auth], [names.idp, idp]]) if (exists) {
        const label = docker(['inspect', '--format', '{{index .Config.Labels "skolplattform.schema-actual"}}', name]); assert.equal(label, runId); docker(['rm', '-f', name]);
      }
      if (existsSync(path.join(pg, 'postgres.log'))) {
        const errors = readFileSync(path.join(pg, 'postgres.log'), 'utf8').split('\n').filter(line => /ERROR:|CONTEXT:.*(?:PL\/pgSQL|SQL) function/u.test(line)).slice(-80);
        writeFileSync(path.join(directory, 'postgres-error-context.json'), JSON.stringify(errors, null, 2), { mode: 0o600 });
      }
      if (network) { assert.equal(docker(['network', 'inspect', '--format', '{{index .Labels "skolplattform.schema-actual"}}', names.network]), runId); docker(['network', 'rm', names.network]); }
      if (db) await db.end({ timeout: 5 });
      if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
      for (const fd of logs) closeSync(fd);
      rmSync(pg, { recursive: true, force: true });
      for (const file of ['auth.env', 'keycloak.env', 'realm.json', 'worker-private.json']) rmSync(path.join(directory, file), { force: true });
      journal.cleanup = 'complete'; journal.status = 'stopped'; cleaned = true;
      // Remove secrets from the surviving cleanup proof.
      delete journal.users;
      writeFileSync(privateFile, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
      return { cleanup: 'complete', stoppedOwnedContainers: [names.auth, names.idp], postgresRemoved: !existsSync(pg) };
    } catch (error) { journal.cleanup = 'failed'; save(); throw error; }
  };
  try {
    onStage('initializing-own-postgresql'); run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '-E', 'UTF8', '--locale=C.UTF-8', '--no-sync']);
    const hba = path.join(data, 'pg_hba.conf'); writeFileSync(hba, 'host all all 127.0.0.1/32 scram-sha-256\n' + readFileSync(hba, 'utf8'));
    run('pg_ctl', ['-D', data, '-l', path.join(pg, 'postgres.log'), '-w', '-o', `-k ${pg} -p ${ports.postgres} -c listen_addresses=127.0.0.1 -c fsync=off`, 'start']); started = true;
    const connect = name => postgres({ path: path.join(pg, `.s.PGSQL.${ports.postgres}`), database: name, username: 'postgres', max: 2, prepare: false, onnotice: () => {} });
    const admin = connect('postgres'); try { await admin.unsafe(`create database ${database} template template0 encoding 'UTF8'`); } finally { await admin.end(); }
    db = connect(database);
    await db.unsafe(`create role schema_auth login superuser password '${secrets.authDb}'; create schema auth authorization schema_auth; create schema extensions;
      create extension pgcrypto with schema extensions; alter database ${database} set search_path = "$user",public,extensions;`);
    onStage('starting-own-keycloak'); docker(['network', 'create', '--label', 'skolplattform.schema-actual=' + runId, names.network]); network = true;
    const realm = JSON.parse(readFileSync(path.join(root, 'work/pilot/idp/realm-template.json'), 'utf8')); realm.users = [];
    realm.clients = realm.clients.filter(c => c.clientId === CLIENT); assert.equal(realm.clients.length, 1);
    Object.assign(realm.clients[0], { secret: secrets.client, redirectUris: [baseURL + '/api/auth/callback'], webOrigins: [baseURL] });
    realm.clients[0].attributes['post.logout.redirect.uris'] = baseURL + '/';
    writeFileSync(path.join(directory, 'realm.json'), JSON.stringify(realm), { mode: 0o600 });
    const adminPassword = randomBytes(32).toString('hex'); secrets.idpAdmin = adminPassword;
    writeFileSync(path.join(directory, 'keycloak.env'), `KC_BOOTSTRAP_ADMIN_USERNAME=schema-test-admin\nKC_BOOTSTRAP_ADMIN_PASSWORD=${adminPassword}\n`, { mode: 0o600 }); save();
    docker(['run', '-d', '--name', names.idp, '--label', 'skolplattform.schema-actual=' + runId, '--network', names.network, '--network-alias', 'host.docker.internal',
      '--publish', `127.0.0.1:${ports.idp}:8180`, '--env-file', path.join(directory, 'keycloak.env'), '--volume', path.join(directory, 'realm.json') + ':/opt/keycloak/data/import/realm.json:ro',
      'quay.io/keycloak/keycloak:26.7.3', 'start-dev', '--http-port=8180', '--hostname=http://host.docker.internal:8180', '--import-realm']); idp = true;
    await ready(idpURL + '/realms/skolplattform-test/.well-known/openid-configuration');
    onStage('starting-own-gotrue');
    const authVars = { GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: apiURL, GOTRUE_SITE_URL: baseURL, GOTRUE_URI_ALLOW_LIST: baseURL + '/**',
      GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: `postgres://schema_auth:${secrets.authDb}@schema-test-host:${ports.postgres}/${database}?sslmode=disable&search_path=auth`,
      GOTRUE_JWT_SECRET: secrets.jwt, GOTRUE_JWT_ISSUER: apiURL + '/auth/v1', GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
      GOTRUE_DISABLE_SIGNUP: 'false', GOTRUE_MAILER_AUTOCONFIRM: 'true', GOTRUE_EXTERNAL_KEYCLOAK_ENABLED: 'true', GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID: CLIENT,
      GOTRUE_EXTERNAL_KEYCLOAK_SECRET: secrets.client, GOTRUE_EXTERNAL_KEYCLOAK_URL: SCHEMA_ACTUAL_ISSUER,
      // Samma avgränsning som prepare-local.mjs: appens openid-client prövar state/PKCE/nonce före registreringen.
      GOTRUE_EXTERNAL_KEYCLOAK_SKIP_NONCE_CHECK: 'true' };
    writeFileSync(path.join(directory, 'auth.env'), Object.entries(authVars).map(([k, v]) => k + '=' + v).join('\n') + '\n', { mode: 0o600 });
    docker(['run', '-d', '--name', names.auth, '--label', 'skolplattform.schema-actual=' + runId, '--network', names.network, '--add-host', 'schema-test-host:host-gateway',
      '--publish', `127.0.0.1:${ports.auth}:9999`, '--env-file', path.join(directory, 'auth.env'), 'public.ecr.aws/supabase/gotrue:v2.187.0']); auth = true;
    await ready(`http://127.0.0.1:${ports.auth}/health`);
    onStage('applying-own-migration-chain');
    let stub = readFileSync(path.join(root, 'work/pilot/ephemeral-supabase-stubs.sql'), 'utf8');
    stub = stub.replace('create schema auth; create schema extensions; create schema storage;', 'create schema storage;')
      .replace('create extension pgcrypto with schema extensions; ', '')
      .replace(/^create table auth\.users .*;\n/mu, '');
    for (const name of ['uid', 'role', 'jwt']) if ((await db`select to_regprocedure(${'auth.' + name + '()'}) value`)[0].value) {
      stub = stub.replace(new RegExp('^create function auth\\.' + name + '\\(\\).*;\\n', 'mu'), '');
    }
    await db.unsafe(stub);
    const applied = [];
    for (const file of migrationFiles()) { const sql = readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'); await db.begin(tx => tx.unsafe(sql)); applied.push({ file, sha256: hash(sql) }); }
    await db.unsafe(`alter role skolplattform_worker login password '${secrets.workerDb}'`);
    provenance.migrations = applied; provenance.migrationChainSha256 = hash(JSON.stringify(applied));
    proxy = httpServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/auth/v1/token?grant_type=id_token') { req.resume(); res.writeHead(404); res.end(); return; }
      const upstream = httpRequest({ hostname: '127.0.0.1', port: ports.auth, path: '/token?grant_type=id_token', method: 'POST', headers: { ...req.headers, host: `127.0.0.1:${ports.auth}` } }, result => {
        if (result.statusCode >= 400) {
          let text = ''; result.on('data', chunk => { if (text.length < 4096) text += chunk.toString('utf8'); });
          result.on('end', () => { let body = {}; try { const raw = JSON.parse(text); body = Object.fromEntries(['code', 'error', 'error_code', 'error_description', 'msg'].filter(k => Object.hasOwn(raw, k)).map(k => [k, String(raw[k]).slice(0, 500)])); } catch {}
            writeFileSync(path.join(directory, 'auth-failure.json'), JSON.stringify({ status: result.statusCode, body }), { mode: 0o600 }); });
        }
        res.writeHead(result.statusCode, result.headers); result.pipe(res);
      });
      upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream);
    }); await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(ports.api, '127.0.0.1', resolve); });
    const keycloak = async (route, method = 'GET', body) => {
      const login = await fetch(idpURL + '/realms/master/protocol/openid-connect/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'schema-test-admin', password: adminPassword }) });
      assert.ok(login.ok); const token = (await login.json()).access_token;
      const response = await fetch(idpURL + '/admin/realms/skolplattform-test' + route, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      assert.ok(response.ok, 'Owned Keycloak rejected setup: ' + response.status); const text = await response.text(); return text ? JSON.parse(text) : null;
    };
    const startWorker = async () => {
      build = await buildSchemaActual(directory, onStage);
      const motorBinary = path.join(root, 'schemamotor/target/release/schemamotor-tjanst'); assert.ok(existsSync(motorBinary), 'Build the real Rust motor first');
      let fd = openSync(path.join(directory, 'motor.log'), 'wx', 0o600); logs.push(fd);
      motor = spawn(motorBinary, [], { cwd: root, env: { ...process.env, SCHEMAMOTOR_TOKEN: secrets.motor, SCHEMAMOTOR_ADDR: `127.0.0.1:${ports.motor}` }, stdio: ['ignore', fd, fd] });
      await ready(`http://127.0.0.1:${ports.motor}/v1/health`, () => { if (motor.exitCode !== null) throw new Error('Owned Rust motor exited'); });
      const vars = { APP_MODE: 'protected', OIDC_ISSUER: SCHEMA_ACTUAL_ISSUER, OIDC_CLIENT_ID: CLIENT, OIDC_CLIENT_SECRET: secrets.client,
        OIDC_REDIRECT_URI: baseURL + '/api/auth/callback', OIDC_POST_LOGOUT_REDIRECT_URI: baseURL + '/', SUPABASE_URL: apiURL, SUPABASE_ANON_KEY: 'own-synthetic-local-api',
        DATABASE_URL: `postgresql://skolplattform_worker:${secrets.workerDb}@127.0.0.1:${ports.postgres}/${database}`, SESSION_SECRET: secrets.session, MFA_ACR_VALUES: '2', MFA_MAX_AGE_SECONDS: '28800',
        SESSION_IDLE_SECONDS: '900', SESSION_ABSOLUTE_SECONDS: '28800', SCHEMAMOTOR_URL: `http://127.0.0.1:${ports.motor}`, SCHEMAMOTOR_TOKEN: secrets.motor };
      const workerFile = path.join(directory, 'worker-private.json'); writeFileSync(workerFile, JSON.stringify({ buildRoot: build.buildRoot, port: ports.worker, idpURL, bindings: vars }), { mode: 0o600 });
      fd = openSync(path.join(directory, 'worker.log'), 'wx', 0o600); logs.push(fd); onStage('starting-own-worker');
      worker = spawn(process.execPath, [path.join(root, 'work/pilot/schema-draft-actual-worker.mjs'), workerFile], { cwd: path.join(root, 'web'), env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' }, stdio: ['ignore', fd, fd] });
      await ready(baseURL + '/api/health/db', () => { if (worker.exitCode !== null) throw new Error('Owned Worker exited'); });
      const health = await (await fetch(baseURL + '/api/health/db')).json(); assert.equal(health.role, 'skolplattform_worker'); assert.equal(health.runtime, 'workerd');
      Object.assign(provenance, { build, motor: { binarySha256: hash(readFileSync(motorBinary)), source: 'real Rust HTTP service' }, health });
      journal.status = 'ready'; journal.workerPid = worker.pid; journal.build = build; save(); return provenance;
    };
    return { db, baseURL, idpURL, apiURL, directory, runId, keycloak, startWorker, cleanup, provenance, privateFile,
      privateUpdate(value) { Object.assign(journal, value); save(); } };
  } catch (error) { journal.failure = { code: error.code ?? 'setup', name: error.name }; save(); try { await cleanup(); } catch {} throw error; }
}
