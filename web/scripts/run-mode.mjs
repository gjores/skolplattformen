// Deterministisk start/bygge/förhandsvisning av exempelläget med explicit miljö.
//
//   node scripts/run-mode.mjs dev     --mode example        [--port 3000] [--hostname localhost]
//   node scripts/run-mode.mjs dev     --mode blocked-probe  [--port 5192] [--hostname 127.0.0.1]
//   node scripts/run-mode.mjs build   --mode example
//   node scripts/run-mode.mjs preview [--port 3001]
//
// Supabase-värdena sätts avsiktligt till tomma strängar i exempelläget: Vinext
// skriver inte över redan satta miljövärden, så en gammal .env.local kan inte
// fylla tillbaka dem. Skriptet skriver aldrig ut miljövärden.
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const VINEXT = 'node_modules/vinext/dist/cli.js';
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';
const BUILD_MARK = 'dist/build-mode.json';
const WRANGLER_CONFIG = 'dist/server/wrangler.json';

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
      '  node scripts/run-mode.mjs dev     --mode blocked-probe  [--port 5192] [--hostname 127.0.0.1]',
      '  node scripts/run-mode.mjs build   --mode example',
      '  node scripts/run-mode.mjs preview [--port 3001]',
    ].join('\n'),
  );
}

const quiet = { WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' };

/** Miljö per läge. Endast example och blocked-probe är tillåtna i fas 1. */
function environmentFor(mode, { allowProbe }) {
  if (mode === 'example') {
    return {
      ...process.env,
      NEXT_PUBLIC_APP_MODE: 'example',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      ...quiet,
    };
  }
  if (mode === 'blocked-probe' && allowProbe) {
    // Fasta syntetiska loopback-värden för provet av stängd start. Appen ska
    // vara blockerad och får inte kontakta porten.
    return {
      ...process.env,
      NEXT_PUBLIC_APP_MODE: '',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:59999',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'falsk-provnyckel',
      ...quiet,
    };
  }
  const allowed = allowProbe ? 'example, blocked-probe' : 'example';
  return fail(`Läget "${mode ?? ''}" är stängt i fas 1. Tillåtna: ${allowed}.`);
}

function port(fallback) {
  const raw = options.port ?? String(fallback);
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) fail(`Ogiltig port "${raw}".`);
  return String(n);
}

/** Startar ett barn med process.execPath (aldrig shell) och vidarebefordrar signaler. */
function run(args, env) {
  const child = spawn(process.execPath, args, { cwd: project, env, stdio: 'inherit' });
  const forward = (signal) => () => {
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

async function dev() {
  const env = environmentFor(options.mode, { allowProbe: true });
  const hostname = options.hostname ?? (options.mode === 'blocked-probe' ? '127.0.0.1' : 'localhost');
  const p = port(options.mode === 'blocked-probe' ? 5192 : 3000);
  console.log(`Utvecklingsserver: läge ${options.mode} på ${hostname}:${p}`);
  process.exit(await run([VINEXT, 'dev', '--port', p, '--hostname', hostname], env));
}

async function build() {
  const env = environmentFor(options.mode, { allowProbe: false });
  const code = await run([VINEXT, 'build'], env);
  if (code !== 0) process.exit(code);
  if (!existsSync(new URL(WRANGLER_CONFIG, `file://${project}`))) {
    fail(`Bygget saknar ${WRANGLER_CONFIG}.`, 1);
  }
  const mark = { mode: 'example', revision: revision(), builtAt: new Date().toISOString(), node: process.version };
  writeFileSync(new URL(BUILD_MARK, `file://${project}`), JSON.stringify(mark, null, 2) + '\n');
  console.log(`Bygge märkt: läge ${mark.mode}, revision ${mark.revision}`);
}

async function preview() {
  const markPath = new URL(BUILD_MARK, `file://${project}`);
  let mark = null;
  try {
    mark = JSON.parse(readFileSync(markPath, 'utf8'));
  } catch {
    mark = null;
  }
  if (!mark || mark.mode !== 'example') fail('Bygget saknar exempelläge. Kör npm run build:example först.');
  const p = port(3001);
  console.log(`Förhandsvisning: läge ${mark.mode}, revision ${mark.revision}`);
  process.exit(
    await run(
      [WRANGLER, 'dev', '--config', WRANGLER_CONFIG, '--port', p, '--ip', '127.0.0.1', '--inspector-port', '0'],
      { ...process.env, ...quiet },
    ),
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
