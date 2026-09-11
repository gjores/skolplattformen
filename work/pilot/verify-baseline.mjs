#!/usr/bin/env node
// Återställningsprov för källbaslinjen (BASE-01).
//
// Kör:
//   node work/pilot/verify-baseline.mjs [--ref fas1-baslinje] [--out work/pilot/results/baseline-restore.json] [--keep] [--skip-build]
//
// Skriptet packar upp en versionshanterad revision med `git archive` i en ny
// tillfällig katalog, kontrollerar att inga lokala miljöfiler eller byggen
// följer med, installerar beroenden, kör modelltesterna, typkontrollen och
// produktionsbygget med tomma Supabase-värden, och skriver ett daterat
// resultat med revisionens sha. Inga miljövärden läses från arbetskopian
// (web/.env.local rörs aldrig) och inga miljövärden skrivs ut.
//
// Resultatfilens nycklar: "kind", "ref", "sha", "date", "node", "archiveDir",
// "forbiddenPresent", "npmCiExit", "tests" { "pass", "fail" }, "tscExit",
// "buildExit", "buildArtifact", "durationMs", "status" (PASS/FAIL), "errors".
// "status" är PASS endast om inga förbjudna filer finns, npm ci lyckas,
// alla tester passerar (minst ett), och bygget lyckas (eller --skip-build).
//
// Avslutningskoder: 0 = PASS, 1 = FAIL, 2 = felaktig körmiljö/argument.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const startedAt = Date.now();

// 1. Kräv Node 22+ (web/package.json engines: node >=22.13.0).
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 22) {
  console.error(`Node ${process.versions.node} är för gammal för web/.`);
  console.error('Kör med Node 22+: export PATH="/opt/homebrew/opt/node@25/bin:$PATH"');
  process.exit(2);
}

// Argument.
const options = { ref: 'fas1-baslinje', out: null, keep: false, skipBuild: false };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--ref') options.ref = argv[++i];
  else if (arg.startsWith('--ref=')) options.ref = arg.slice('--ref='.length);
  else if (arg === '--out') options.out = argv[++i];
  else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length);
  else if (arg === '--keep') options.keep = true;
  else if (arg === '--skip-build') options.skipBuild = true;
  else if (arg === '--help' || arg === '-h') {
    console.log('Användning: node work/pilot/verify-baseline.mjs [--ref <tagg|sha>] [--out <fil.json>] [--keep] [--skip-build]');
    process.exit(0);
  } else {
    console.error(`Okänt argument: ${arg}`);
    process.exit(2);
  }
}
if (!options.ref) {
  console.error('Argumentet --ref saknar värde.');
  process.exit(2);
}

// 2. Projektrot och revision.
const projectRoot = path.resolve(fileURLToPath(import.meta.url), '../../..');
const outPath = path.resolve(projectRoot, options.out ?? 'work/pilot/results/baseline-restore.json');

let sha;
try {
  sha = execFileSync('git', ['rev-parse', '--verify', `${options.ref}^{commit}`], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch {
  console.error(`Revisionen "${options.ref}" finns inte i ${projectRoot}. Skapa taggen först (plan 01-01) eller ange --ref.`);
  process.exit(2);
}
if (!/^[0-9a-f]{40}$/.test(sha)) {
  console.error(`Kunde inte tolka revisionen "${options.ref}" som en commit-sha.`);
  process.exit(2);
}
console.log(`Revision: ${options.ref} -> ${sha}`);

// Resultatobjekt. Fylls i steg för steg så att en FAIL ändå blir dokumenterad.
const result = {
  kind: 'baseline-restore',
  ref: options.ref,
  sha,
  date: new Date().toISOString(),
  node: process.version,
  archiveDir: null,
  forbiddenPresent: [],
  npmCiExit: null,
  tests: { pass: null, fail: null },
  tscExit: null,
  buildExit: null,
  buildArtifact: options.skipBuild ? null : 'dist/server/wrangler.json',
  durationMs: 0,
  status: 'FAIL',
  errors: [],
};

function fail(message) {
  console.error(`FEL: ${message}`);
  result.errors.push(message);
}

// Miljö för alla kommandon i arkivkatalogen: tomma Supabase-värden, ingen
// läsning av arbetskopians .env.local, och CI för icke-interaktiv npm.
function archiveEnv() {
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    CI: '1',
  };
}

const npmPath = path.join(path.dirname(process.execPath), 'npm');
const npxPath = path.join(path.dirname(process.execPath), 'npx');

function run(label, command, args, cwd, { capture = false } = {}) {
  console.log(`\n== ${label}: ${path.basename(command)} ${args.join(' ')}`);
  const proc = spawnSync(command, args, {
    cwd,
    env: archiveEnv(),
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (proc.error) {
    fail(`${label} kunde inte startas: ${proc.error.message}`);
    return { status: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
  }
  const status = proc.status ?? 1;
  console.log(`== ${label}: exit ${status}`);
  return { status, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

// 3. Tillfällig katalog och git archive.
const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skolplattform-baslinje-'));
result.archiveDir = archiveDir;
console.log(`Arkivkatalog: ${archiveDir}`);

try {
  const tarPath = path.join(archiveDir, 'baslinje.tar');
  try {
    execFileSync('git', ['archive', '--format=tar', '-o', tarPath, sha, 'web', 'supabase', 'work'], {
      cwd: projectRoot,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    execFileSync('tar', ['-xf', tarPath, '-C', archiveDir], { stdio: ['ignore', 'inherit', 'inherit'] });
    fs.rmSync(tarPath, { force: true });
  } catch (error) {
    fail(`git archive/tar misslyckades: ${error.message}`);
    throw new Error('archive');
  }

  // 4. Negativa kontroller: inget lokalt eller byggt får finnas i arkivet.
  const forbidden = ['web/.env.local', 'web/node_modules', 'web/dist', 'web/.wrangler', 'supabase/.temp'];
  result.forbiddenPresent = forbidden.filter(rel => fs.existsSync(path.join(archiveDir, rel)));
  if (result.forbiddenPresent.length > 0) {
    fail(`Arkivet innehåller filer som inte får ingå i baslinjen: ${result.forbiddenPresent.join(', ')}`);
    throw new Error('forbidden');
  }
  console.log(`Negativa kontroller OK (${forbidden.length} sökvägar saknas som de ska).`);

  const webDir = path.join(archiveDir, 'web');
  if (!fs.existsSync(path.join(webDir, 'package.json'))) {
    fail('Arkivet saknar web/package.json.');
    throw new Error('missing-web');
  }

  // 5a. npm ci
  const ci = run('npm ci', npmPath, ['ci', '--no-audit', '--no-fund'], webDir);
  result.npmCiExit = ci.status;
  if (ci.status !== 0) {
    fail(`npm ci avslutades med exit ${ci.status}.`);
    throw new Error('npm-ci');
  }

  // 5b. Modelltester (node expanderar inte globben själv).
  const libDir = path.join(webDir, 'lib');
  const testFiles = fs.readdirSync(libDir)
    .filter(f => f.endsWith('.test.mjs'))
    .sort()
    .map(f => path.join('lib', f));
  if (testFiles.length === 0) {
    fail('Inga testfiler (lib/*.test.mjs) hittades i arkivet.');
    throw new Error('no-tests');
  }
  const tests = run('node --test', process.execPath, ['--test', '--test-reporter=tap', ...testFiles], webDir, { capture: true });
  const tap = tests.stdout;
  const passMatch = tap.match(/^# pass (\d+)/m);
  const failMatch = tap.match(/^# fail (\d+)/m);
  result.tests.pass = passMatch ? Number(passMatch[1]) : 0;
  result.tests.fail = failMatch ? Number(failMatch[1]) : (tests.status === 0 ? 0 : 1);
  console.log(`Tester: ${result.tests.pass} passerade, ${result.tests.fail} misslyckade (${testFiles.length} filer, exit ${tests.status}).`);
  if (tests.status !== 0 || result.tests.fail > 0) {
    // Visa de misslyckade testerna utan att dumpa hela utdata.
    const failing = tap.split('\n').filter(line => /^\s*not ok/.test(line));
    for (const line of failing.slice(0, 20)) console.error(line);
    if (tests.stderr) console.error(tests.stderr.slice(-4000));
    fail(`Modelltesterna misslyckades (exit ${tests.status}, ${result.tests.fail} fel).`);
  }

  // 5c. Typkontroll (informativ; ingår inte i PASS-villkoret).
  const tsc = run('tsc --noEmit', npxPath, ['tsc', '--noEmit'], webDir);
  result.tscExit = tsc.status;
  if (tsc.status !== 0) console.warn(`Varning: typkontrollen gav exit ${tsc.status} (påverkar inte status, noteras i resultatet).`);

  // 5d. Produktionsbygge.
  if (options.skipBuild) {
    console.log('\n== Bygget hoppas över (--skip-build).');
    result.buildExit = null;
  } else {
    const build = run('npm run build', npmPath, ['run', 'build'], webDir);
    result.buildExit = build.status;
    const artifact = path.join(webDir, 'dist', 'server', 'wrangler.json');
    if (build.status !== 0) {
      fail(`npm run build avslutades med exit ${build.status}.`);
    } else if (!fs.existsSync(artifact)) {
      fail('Bygget gav exit 0 men dist/server/wrangler.json saknas.');
      result.buildExit = 1;
    } else {
      console.log('Byggartefakt finns: dist/server/wrangler.json');
    }
  }
} catch (error) {
  if (!result.errors.length) fail(`Oväntat fel: ${error.message}`);
}

// 6. Status och resultatfil.
const buildOk = options.skipBuild ? result.buildExit === null : result.buildExit === 0;
result.status =
  result.forbiddenPresent.length === 0 &&
  result.npmCiExit === 0 &&
  result.tests.fail === 0 &&
  (result.tests.pass ?? 0) > 0 &&
  buildOk &&
  result.errors.length === 0
    ? 'PASS'
    : 'FAIL';
result.durationMs = Date.now() - startedAt;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');

// 7. Städa.
if (options.keep) {
  console.log(`\nArkivkatalogen behålls (--keep): ${archiveDir}`);
} else {
  fs.rmSync(archiveDir, { recursive: true, force: true });
  result.archiveDir = `${archiveDir} (borttagen)`;
}

console.log(`\nResultat: ${result.status} (${Math.round(result.durationMs / 1000)} s) -> ${path.relative(projectRoot, outPath)}`);
console.log(`  sha ${sha}, node ${result.node}, tester ${result.tests.pass}/${result.tests.fail}, tsc ${result.tscExit}, build ${result.buildExit}`);
process.exit(result.status === 'PASS' ? 0 : 1);
