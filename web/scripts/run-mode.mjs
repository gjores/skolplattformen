// Deterministisk start, bygge och förhandsvisning av example/protected.
// Klientmiljön får aldrig Supabase-värden. Serverhemligheter hämtas endast
// från det gitignorerade protected-manifestet och skrivs till privata filer.
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const VINEXT = 'node_modules/vinext/dist/cli.js';
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';
const BUILD_MARK = 'dist/build-mode.json';
const BUILD_MARK_PROTECTED = 'dist-protected/build-mode.json';
const WRANGLER_CONFIG = 'dist/server/wrangler.json';
const WRANGLER_CONFIG_PROTECTED = 'dist-protected/server/wrangler.json';
const DEV_VARS = '.dev.vars';
const DEV_VARS_PROTECTED_PREVIEW = 'dist-protected/server/.dev.vars';
const MANIFEST = '../work/pilot/targets/protected/manifest.json';

const [command, ...rest] = process.argv.slice(2);
const options = parseOptions(rest);

function parseOptions(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) fail(`Okänt argument "${arg}".`);
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const value = eq === -1 ? args[++i] : arg.slice(eq + 1);
    if (value === undefined) fail(`Flaggan --${name} saknar värde.`);
    out[name] = value;
  }
  return out;
}

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function usage() {
  fail(
    [
      'Användning:',
      '  node scripts/run-mode.mjs dev     --mode example        [--port 3000] [--hostname localhost]',
      '  node scripts/run-mode.mjs dev     --mode protected      [--port 3000] [--hostname localhost]',
      '  node scripts/run-mode.mjs dev     --mode blocked-probe  [--port 5192] [--hostname 127.0.0.1]',
      '  node scripts/run-mode.mjs build   --mode example|protected',
      '  node scripts/run-mode.mjs preview [--mode example|protected] [--port 3001]',
    ].join('\n'),
  );
}

const quiet = { WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' };

/** Klientmiljö per läge. Protected får endast serverhemligheter via .dev.vars. */
function environmentFor(mode, { allowProbe = false } = {}) {
  if (mode === 'example' || mode === 'protected') {
    return {
      ...process.env,
      NEXT_PUBLIC_APP_MODE: mode,
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      ...quiet,
    };
  }
  if (mode === 'blocked-probe' && allowProbe) {
    return {
      ...process.env,
      NEXT_PUBLIC_APP_MODE: '',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:59999',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'falsk-provnyckel',
      ...quiet,
    };
  }
  const allowed = allowProbe ? 'example, protected, blocked-probe' : 'example, protected';
  return fail(`Läget "${mode ?? ''}" är inte tillåtet. Tillåtna: ${allowed}.`);
}

function port(fallback) {
  const raw = options.port ?? String(fallback);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) fail(`Ogiltig port "${raw}".`);
  return String(n);
}

function file(name) {
  return path.resolve(project, name);
}

function readJson(name) {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8'));
  } catch {
    return null;
  }
}

function readProtectedManifest() {
  const manifest = readJson(MANIFEST);
  const fields = [
    manifest?.idp?.issuer,
    manifest?.idp?.clientId,
    manifest?.idp?.clientSecret,
    manifest?.apiUrl,
    manifest?.anonKey,
    manifest?.worker?.dbUrl,
    manifest?.sessionSecret,
    manifest?.mfa?.acrValues,
  ];
  if (!manifest?.idp || !manifest?.worker || !manifest?.sessionSecret ||
      !Number.isInteger(manifest?.mfa?.maxAgeSeconds) ||
      fields.some(value => typeof value !== 'string' || value.length === 0 || /[\r\n]/.test(value))) {
    fail('BLOCKED: protected-målet är inte förberett med IdP. Kör node work/pilot/prepare-local.mjs --target protected --with-idp', 3);
  }
  if (!manifest.apiUrl.startsWith('http://127.0.0.1:') || !manifest.worker.dbUrl.includes('@127.0.0.1:')) {
    fail('REFUSED: protected-manifestet pekar inte enbart på det lokala provmålet.', 1);
  }
  return manifest;
}

function devVarsFor(manifest, { hostname, port: serverPort }) {
  return [
    'APP_MODE=protected',
    `OIDC_ISSUER=${manifest.idp.issuer}`,
    `OIDC_CLIENT_ID=${manifest.idp.clientId}`,
    `OIDC_CLIENT_SECRET=${manifest.idp.clientSecret}`,
    `OIDC_REDIRECT_URI=http://${hostname}:${serverPort}/api/auth/callback`,
    `OIDC_POST_LOGOUT_REDIRECT_URI=http://${hostname}:${serverPort}/`,
    `SUPABASE_URL=${manifest.apiUrl}`,
    `SUPABASE_ANON_KEY=${manifest.anonKey}`,
    `DATABASE_URL=${manifest.worker.dbUrl}`,
    `SESSION_SECRET=${manifest.sessionSecret}`,
    `MFA_ACR_VALUES=${manifest.mfa.acrValues}`,
    `MFA_MAX_AGE_SECONDS=${manifest.mfa.maxAgeSeconds}`,
    'SESSION_IDLE_SECONDS=900',
    'SESSION_ABSOLUTE_SECONDS=28800',
    '',
  ].join('\n');
}

/** Tar ett exklusivt lås så parallella servrar aldrig delar eller raderar filen. */
function writePrivateVars(name, contents) {
  const target = file(name);
  const lock = `${target}.lock`;
  mkdirSync(path.dirname(target), { recursive: true });
  let descriptor;
  try {
    descriptor = openSync(lock, 'wx', 0o600);
  } catch {
    fail(`BLOCKED: ${name} används redan av en annan lokal server.`, 3);
  }
  closeSync(descriptor);
  if (existsSync(target)) {
    rmSync(lock, { force: true });
    fail(`BLOCKED: ${name} finns utan aktivt ägarskap. Ta bort den privata restfilen och kör igen.`, 3);
  }
  try {
    writeFileSync(target, contents, { mode: 0o600 });
    chmodSync(target, 0o600);
  } catch (error) {
    rmSync(lock, { force: true });
    throw error;
  }
  let active = true;
  const cleanup = () => {
    if (!active) return;
    active = false;
    rmSync(target, { force: true });
    rmSync(lock, { force: true });
  };
  process.on('exit', cleanup);
  return cleanup;
}

/** Startar ett barn utan skal och vidarebefordrar stoppsignaler. */
function run(args, env) {
  const child = spawn(process.execPath, args, { cwd: project, env, stdio: 'inherit' });
  const forward = signal => () => {
    if (!child.killed) child.kill(signal);
  };
  process.on('SIGINT', forward('SIGINT'));
  process.on('SIGTERM', forward('SIGTERM'));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
}

function revision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'okänd';
  } catch {
    return 'okänd';
  }
}

function writeBuildMark(name, mode) {
  const mark = { mode, revision: revision(), builtAt: new Date().toISOString(), node: process.version };
  writeFileSync(file(name), JSON.stringify(mark, null, 2) + '\n');
  console.log(`Bygge märkt: läge ${mark.mode}, revision ${mark.revision}`);
}

async function dev() {
  const env = environmentFor(options.mode, { allowProbe: true });
  const hostname = options.hostname ?? (options.mode === 'blocked-probe' ? '127.0.0.1' : 'localhost');
  const p = port(options.mode === 'blocked-probe' ? 5192 : 3000);
  let cleanup = () => {};
  if (options.mode === 'protected') {
    if (!['localhost', '127.0.0.1'].includes(hostname)) fail('REFUSED: protected-läget får endast bindas till localhost.', 1);
    const manifest = readProtectedManifest();
    cleanup = writePrivateVars(DEV_VARS, devVarsFor(manifest, { hostname, port: p }));
    console.log(`Utvecklingsserver: läge protected på ${hostname}:${p} (skyddad provmiljö, lokalt mål)`);
  } else {
    console.log(`Utvecklingsserver: läge ${options.mode} på ${hostname}:${p}`);
  }
  try {
    process.exitCode = await run([VINEXT, 'dev', '--port', p, '--hostname', hostname], env);
  } finally {
    cleanup();
  }
}

async function buildProtected() {
  const dist = file('dist');
  const protectedDist = file('dist-protected');
  const keep = file('.dist-example-keep');
  if (existsSync(file(DEV_VARS)) || existsSync(file(`${DEV_VARS}.lock`))) {
    fail('REFUSED: skyddat bygge körs inte medan web/.dev.vars används.', 1);
  }
  if (existsSync(keep)) fail('REFUSED: .dist-example-keep finns redan; återställ eller ta bort den före nytt bygge.', 1);
  const exampleMark = readJson(BUILD_MARK);
  const preserveExample = existsSync(dist) && exampleMark?.mode === 'example';
  if (preserveExample) renameSync(dist, keep);
  else rmSync(dist, { recursive: true, force: true });
  rmSync(protectedDist, { recursive: true, force: true });
  let code = 1;
  try {
    code = await run([VINEXT, 'build'], environmentFor('protected'));
    if (code !== 0) throw new Error(`protected-bygget avslutades med exit ${code}`);
    if (!existsSync(file(WRANGLER_CONFIG))) throw new Error(`Bygget saknar ${WRANGLER_CONFIG}.`);
    renameSync(dist, protectedDist);
    writeBuildMark(BUILD_MARK_PROTECTED, 'protected');
  } catch (error) {
    rmSync(dist, { recursive: true, force: true });
    if (preserveExample && existsSync(keep)) renameSync(keep, dist);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(code === 0 ? 1 : code);
  }
  if (preserveExample) renameSync(keep, dist);
}

async function build() {
  if (options.mode === 'protected') return buildProtected();
  const env = environmentFor(options.mode);
  const code = await run([VINEXT, 'build'], env);
  if (code !== 0) process.exit(code);
  if (!existsSync(file(WRANGLER_CONFIG))) fail(`Bygget saknar ${WRANGLER_CONFIG}.`, 1);
  writeBuildMark(BUILD_MARK, 'example');
}

async function preview() {
  if (options.mode === 'protected') {
    const mark = readJson(BUILD_MARK_PROTECTED);
    if (!mark || mark.mode !== 'protected') fail('Bygget saknar skyddat läge. Kör npm run build:protected först.');
    const manifest = readProtectedManifest();
    const p = port(3012);
    const cleanup = writePrivateVars(
      DEV_VARS_PROTECTED_PREVIEW,
      devVarsFor(manifest, { hostname: '127.0.0.1', port: p }),
    );
    console.log(`Förhandsvisning: läge protected, revision ${mark.revision}`);
    try {
      process.exitCode = await run(
        [WRANGLER, 'dev', '--config', WRANGLER_CONFIG_PROTECTED, '--port', p, '--ip', '127.0.0.1', '--inspector-port', '0'],
        { ...process.env, ...quiet },
      );
    } finally {
      cleanup();
    }
    return;
  }
  const mark = readJson(BUILD_MARK);
  if (!mark || mark.mode !== 'example') fail('Bygget saknar exempelläge. Kör npm run build:example först.');
  const p = port(3001);
  console.log(`Förhandsvisning: läge ${mark.mode}, revision ${mark.revision}`);
  process.exitCode = await run(
    [WRANGLER, 'dev', '--config', WRANGLER_CONFIG, '--port', p, '--ip', '127.0.0.1', '--inspector-port', '0'],
    { ...process.env, ...quiet },
  );
}

switch (command) {
  case 'dev':
    await dev();
    break;
  case 'build':
    await build();
    break;
  case 'preview':
    await preview();
    break;
  default:
    usage();
}
