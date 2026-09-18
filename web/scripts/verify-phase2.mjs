#!/usr/bin/env node
// Samlad, fail-closed fasgrind för verifierad kontoåtkomst.
// Kör endast mot de lokala protected/baseline-målen och gör aldrig reset,
// deployment, hosts-ändring eller annan automatisk omkonfiguration.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertTarget } from '../../work/pilot/verify-target.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const web = path.join(root, 'web');
const pilot = path.join(root, 'work', 'pilot');
const defaultOut = path.join(pilot, 'results', 'phase2-summary.json');
const requiredAccessCases = [
  'sparr', 'uppdrag-avslut', 'uppdrag-utgatt', 'session', 'csrf', 'mfa-kravs',
  'inbjudan', 'frammande-id', 'samma-epost', 'aktor-forfalskning', 'logg',
  'logg-flod', 'context-race', 'audit-rollback',
];
const requiredMfaChecks = [
  'lösenord utan OTP nekades utan skrivning', 'för gammalt bevis nekades',
  'proof-profile', 'proof-issuer', 'proof-audience', 'proof-time', 'proof-amr',
  'kundadmin utan TOTP nekades',
];
const requiredBrowserScenarios = [
  'inloggning med TOTP ger en httpOnly-session med profilbundet MFA-bevis',
  'inloggning med engångskod ger arbetskontext i sidhuvudet',
  'uppdragsväljaren skiljer giltiga, kommande och avslutade',
  'byte i en flik låser och rensar andra flikar',
  'utloggning låser andra flikar och avslutar sessionen',
  'administrativ åtgärd utan engångskod erbjuder verifiering',
  'spärr under öppen session stoppar nästa åtgärd',
  'första skyddade ändringen är spårbar för granskaren',
  'pekytor är minst 44 px på telefon',
  'tangentbord når väljaren och låsets knapp',
  'step-up binds till ursprungligt uppdrag och epok',
  'avbruten verifiering återspelar ingen åtgärd',
];
const secretPattern = /sp_session=|postgresql:\/\/|eyJ[A-Za-z0-9_-]{20,}|(?:totp|otp)[_-]?secret|BEGIN (?:RSA |EC )?PRIVATE KEY|sb_(?:secret|service)_/iu;

export function aggregateStatus(steps, { skipBrowser = false } = {}) {
  const required = steps.filter((step) => step.required !== false);
  if (required.some((step) => step.status === 'FAIL' || (step.exit !== null && step.exit !== undefined && step.exit !== 0))) return 'FAIL';
  if (required.some((step) => step.status === 'BLOCKED')) return 'BLOCKED';
  if (required.some((step) => step.status === 'KNOWN-ISSUE')) return 'FAIL';
  const skipped = required.filter((step) => step.status === 'SKIPPED' || step.status === 'PASS-PARTIAL');
  if (skipped.length) {
    const allowed = skipBrowser && skipped.every((step) => ['fas1-browser', 'protected-browser'].includes(step.name));
    return allowed ? 'PASS-PARTIAL' : 'FAIL';
  }
  return required.every((step) => step.status === 'PASS') ? 'PASS' : 'FAIL';
}

export function validateEvidence(report, {
  requiredStepNames,
  revision,
  fingerprint,
  startedAt,
  completedAt,
} = {}) {
  const errors = [];
  const started = Date.parse(startedAt ?? report?.startedAt ?? '');
  const completed = Date.parse(completedAt ?? report?.completedAt ?? '');
  if (!report || report.kind !== 'phase2-summary') errors.push('fel eller saknad rapporttyp');
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) errors.push('ogiltigt tidsintervall');
  if (report?.gitRevision !== revision) errors.push('fel revision');
  if (report?.sourceTreeFingerprint !== fingerprint) errors.push('fel källfingeravtryck');
  const byName = new Map((report?.steps ?? []).map((step) => [step.name, step]));
  for (const name of requiredStepNames ?? []) {
    const step = byName.get(name);
    if (!step) {
      errors.push(`saknat steg: ${name}`);
      continue;
    }
    if (step.status !== 'PASS') errors.push(`${name} är ${step.status}`);
    if (step.exit !== 0) errors.push(`${name} har exit ${String(step.exit)}`);
    const produced = Date.parse(step.evidence?.producedAt ?? '');
    if (!Number.isFinite(produced) || produced < started || produced > completed) errors.push(`${name} har gammalt eller ogiltigt bevis`);
    if (step.evidence?.gitRevision !== revision) errors.push(`${name} har fel revision`);
    if (step.evidence?.sourceTreeFingerprint !== fingerprint) errors.push(`${name} har fel källfingeravtryck`);
  }
  return { ok: errors.length === 0, errors };
}

function parseFlags(argv) {
  const flags = { skipBrowser: false, out: defaultOut };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--skip-browser') flags.skipBrowser = true;
    else if (arg === '--out') flags.out = path.resolve(process.cwd(), argv[++index] ?? '');
    else if (arg.startsWith('--out=')) flags.out = path.resolve(process.cwd(), arg.slice(6));
    else throw new Error(`okänd flagga: ${arg}`);
  }
  if (flags.skipBrowser && isInside(flags.out, root)) throw new Error('--skip-browser kräver --out utanför projektträdet');
  return flags;
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function gitRevision() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function sourceTreeFingerprint() {
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  }).split('\0').filter(Boolean).filter((file) => {
    if (!/^(web|supabase|work\/pilot)\//u.test(file)) return false;
    return !/(^|\/)(?:node_modules|dist(?:-protected)?|test-results|\.vinext|\.wrangler|targets|results)(?:\/|$)/u.test(file)
      && !/(^|\/)(?:\.env(?:\..*)?|\.dev\.vars)$/u.test(file);
  }).sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file); hash.update('\0'); hash.update(fs.readFileSync(path.join(root, file))); hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function run(file, args, { cwd = web, env = process.env } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    let child;
    try {
      child = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ exit: null, output: String(error?.message ?? error), durationMs: Date.now() - start, spawnError: true }); return;
    }
    let output = '';
    const collect = (chunk) => { const value = chunk.toString(); output += value; process.stdout.write(value); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', (error) => resolve({ exit: null, output: `${output}\n${error.message}`, durationMs: Date.now() - start, spawnError: true }));
    child.on('close', (code, signal) => resolve({ exit: code, signal, output, durationMs: Date.now() - start, spawnError: false }));
  });
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function freshJson(file, startedMs) {
  const stat = fs.statSync(file);
  if (stat.mtimeMs + 1000 < startedMs) throw new Error('resultatfilen skapades inte i denna körning');
  const value = readJson(file);
  if (!value) throw new Error('resultatfilen är inte giltig JSON');
  return value;
}

function collectTitles(value, titles = []) {
  if (Array.isArray(value)) for (const item of value) collectTitles(item, titles);
  else if (value && typeof value === 'object') {
    if (typeof value.title === 'string') titles.push(value.title);
    for (const child of Object.values(value)) collectTitles(child, titles);
  }
  return titles;
}

function statusFromExit(result) {
  if (result.exit === 0) return 'PASS';
  if (result.exit === 3) return 'BLOCKED';
  return 'FAIL';
}

async function main() {
  let flags;
  try { flags = parseFlags(process.argv.slice(2)); }
  catch (error) { console.error(`REFUSED: ${error.message}`); process.exitCode = 1; return; }

  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const revision = gitRevision();
  const fingerprint = sourceTreeFingerprint();
  const steps = [];
  const knownIssues = [];
  const requiredStepNames = [];
  const context = { revision, fingerprint, startedMs };

  const record = (step) => {
    const evidence = { ...step.evidence, producedAt: new Date().toISOString(), gitRevision: revision, sourceTreeFingerprint: fingerprint };
    const saved = { required: true, ...step, evidence };
    steps.push(saved);
    if (saved.required) requiredStepNames.push(saved.name);
    console.log(`\n==> ${saved.name}: ${saved.status} (exit ${saved.exit ?? '-'})`);
    return saved;
  };

  const commandStep = async (name, file, args, options = {}) => {
    console.log(`\n--- ${name}: ${options.command ?? [file, ...args].join(' ')}`);
    const result = await run(file, args, options);
    let status = statusFromExit(result);
    let evidence = {};
    if (status === 'PASS' && options.validate) {
      try { evidence = await options.validate(result, context); }
      catch (error) { status = 'FAIL'; evidence = { validation: error.message }; }
    }
    return record({ name, command: options.command ?? [file, ...args].join(' '), exit: result.exit, durationMs: result.durationMs, status, evidence });
  };

  const blocked = (name, command, reason) => record({ name, command, exit: null, durationMs: 0, status: 'BLOCKED', evidence: { reason } });
  const skipped = (name, command) => record({ name, command, exit: null, durationMs: 0, status: 'SKIPPED', evidence: { reason: '--skip-browser' } });

  const major = Number(process.versions.node.split('.')[0]);
  if (major !== 25) {
    blocked('node25', 'node --version', `Node 25 krävs; kör export PATH="/opt/homebrew/opt/node@25/bin:$PATH" (nu ${process.version})`);
  } else record({ name: 'node25', command: 'node --version', exit: 0, durationMs: 0, status: 'PASS', evidence: { nodeVersion: process.version } });

  let protectedReady = false;
  try {
    await assertTarget('protected', { requireIdp: true }); protectedReady = true;
    record({ name: 'mål-protected', command: 'assertTarget(protected,{requireIdp:true})', exit: 0, durationMs: 0, status: 'PASS', evidence: { target: 'protected', idp: 'local-test-idp' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    blocked('mål-protected', 'assertTarget(protected,{requireIdp:true})', `${message}. Starta med node work/pilot/prepare-local.mjs --target protected --with-idp`);
  }
  let baselineReady = false;
  try {
    await assertTarget('baseline'); baselineReady = true;
    record({ name: 'mål-baseline', command: 'assertTarget(baseline)', exit: 0, durationMs: 0, status: 'PASS', evidence: { target: 'baseline' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    blocked('mål-baseline', 'assertTarget(baseline)', `${message}. Starta med node work/pilot/prepare-local.mjs --target baseline`);
  }

  const libTests = fs.readdirSync(path.join(web, 'lib')).filter((file) => file.endsWith('.test.mjs')).sort().map((file) => `lib/${file}`);
  await commandStep('modeller', process.execPath, ['--test', ...libTests], { command: `node --test lib/*.test.mjs (${libTests.length} filer)` });
  await commandStep('fasgrind-unit', process.execPath, ['--test', 'scripts/verify-phase2.test.mjs'], { command: 'node --test scripts/verify-phase2.test.mjs' });
  await commandStep('typkontroll', process.execPath, [path.join(web, 'node_modules/typescript/bin/tsc'), '--noEmit'], { command: 'npx tsc --noEmit' });
  await commandStep('lint', process.execPath, [path.join(web, 'node_modules/oxlint/bin/oxlint'), 'app', 'lib', 'scripts', 'e2e'], { command: 'npx oxlint app lib scripts e2e' });
  await commandStep('exempelbygge', process.execPath, ['scripts/run-mode.mjs', 'build', '--mode', 'example'], { command: 'npm run build:example' });
  if (flags.skipBrowser) skipped('fas1-browser', 'npx playwright test -c playwright.config.ts');
  else await commandStep('fas1-browser', process.execPath, [path.join(web, 'node_modules/@playwright/test/cli.js'), 'test', '-c', 'playwright.config.ts'], {
    command: 'npx playwright test -c playwright.config.ts',
    validate: () => {
      const report = freshJson(path.join(web, 'test-results/phase1-e2e.json'), startedMs);
      if (report.stats?.unexpected !== 0 || report.stats?.expected < 20) throw new Error(`browserrapport: expected=${report.stats?.expected}, unexpected=${report.stats?.unexpected}`);
      return { expected: report.stats.expected, unexpected: report.stats.unexpected };
    },
  });
  await commandStep('protected-bygge', process.execPath, ['scripts/run-mode.mjs', 'build', '--mode', 'protected'], { command: 'npm run build:protected' });

  const sqlOut = path.join(pilot, 'results', 'phase2-sql.json');
  if (!protectedReady) blocked('sql', 'node work/pilot/run-sql-tests.mjs', 'protected-målet är inte klart');
  else await commandStep('sql', process.execPath, [path.join(pilot, 'run-sql-tests.mjs'), '--out', sqlOut], {
    cwd: root, command: 'node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase2-sql.json',
    validate: () => {
      const report = freshJson(sqlOut, startedMs);
      const expected = ['phase1_isolation.test.sql', 'phase2_access.test.sql', 'phase2_audit.test.sql'];
      if (report.status !== 'PASS' || expected.some((name) => !report.files?.includes(name))) throw new Error('pgTAP saknar PASS eller obligatorisk fil');
      return { status: report.status, files: report.files };
    },
  });

  const isolationOut = path.join(pilot, 'results', 'isolation.json');
  if (!protectedReady) blocked('api-isolering', 'node work/pilot/verify-isolation.mjs', 'protected-målet är inte klart');
  else await commandStep('api-isolering', process.execPath, [path.join(pilot, 'verify-isolation.mjs')], {
    cwd: root, command: 'node work/pilot/verify-isolation.mjs',
    validate: () => {
      const report = freshJson(isolationOut, startedMs);
      if (report.status !== 'PASS' || report.checks?.some((check) => check.outcome === 'ALLOWED')) throw new Error('isolationsrapporten är inte helt nekande/PASS');
      return { status: report.status, denied: report.checks?.filter((check) => check.outcome === 'DENIED').length ?? 0 };
    },
  });

  const baselineOut = path.join(pilot, 'results', 'baseline-db.json');
  if (!baselineReady) blocked('baslinje-db', 'node work/pilot/verify-baseline-db.mjs', 'baseline-målet är inte klart');
  else await commandStep('baslinje-db', process.execPath, [path.join(pilot, 'verify-baseline-db.mjs')], {
    cwd: root, command: 'node work/pilot/verify-baseline-db.mjs',
    validate: () => {
      const report = freshJson(baselineOut, startedMs);
      if (report.status !== 'PASS' || report.flows?.some((flow) => flow.status !== 'PASS')) throw new Error('baslinjeflöden saknar PASS');
      return { status: report.status, flows: report.flows?.map((flow) => flow.flow) ?? [] };
    },
  });

  const accessOut = path.join(pilot, 'results', 'access.json');
  if (!protectedReady) blocked('access-api', 'node work/pilot/verify-access.mjs', 'protected-målet är inte klart');
  else await commandStep('access-api', process.execPath, [path.join(pilot, 'verify-access.mjs'), '--out', accessOut], {
    cwd: root, command: 'node work/pilot/verify-access.mjs --out work/pilot/results/access.json',
    validate: () => {
      const report = freshJson(accessOut, startedMs);
      const names = new Set(report.cases?.filter((item) => item.status === 'PASS').map((item) => item.name));
      const missing = requiredAccessCases.filter((name) => !names.has(name));
      const mfa = report.cases?.find((item) => item.name === 'mfa-kravs');
      const mfaNames = new Set(mfa?.checks?.filter((check) => check.ok).map((check) => check.check));
      const missingMfa = requiredMfaChecks.filter((name) => !mfaNames.has(name));
      if (report.status !== 'PASS' || missing.length || missingMfa.length) throw new Error(`saknade fall: ${[...missing, ...missingMfa].join(', ')}`);
      if (secretPattern.test(JSON.stringify(report))) throw new Error('accessrapporten innehåller hemligt markerbyte');
      return { status: report.status, cases: requiredAccessCases, checks: report.cases.reduce((sum, item) => sum + item.checks.length, 0), mfaNegativeChecks: requiredMfaChecks };
    },
  });

  if (flags.skipBrowser) skipped('protected-browser', 'npm run e2e:protected');
  else if (!protectedReady) blocked('protected-browser', 'npm run e2e:protected', 'protected-målet eller test-IdP:n är inte klart');
  else await commandStep('protected-browser', process.execPath, [path.join(web, 'node_modules/@playwright/test/cli.js'), 'test', '-c', 'playwright.protected.config.ts'], {
    command: 'npm run e2e:protected',
    validate: () => {
      const report = freshJson(path.join(web, 'test-results/phase2-e2e.json'), startedMs);
      const titles = collectTitles(report);
      const missing = requiredBrowserScenarios.filter((title) => !titles.includes(title));
      if (report.stats?.unexpected !== 0 || report.stats?.expected < 30 || missing.length) throw new Error(`browserbevis saknas: ${missing.join(', ') || 'statistik'}`);
      return { expected: report.stats.expected, unexpected: report.stats.unexpected, scenarios: requiredBrowserScenarios };
    },
  });

  console.log('\n--- sparordning: node --test lib/save-order.repro.mjs');
  const saveOrder = await run(process.execPath, ['--test', 'lib/save-order.repro.mjs'], { cwd: web });
  const knownLine = saveOrder.output.split('\n').map((line) => line.trim()).find((line) => line.startsWith('KNOWN-ISSUE:'));
  const knownStatus = knownLine ? 'KNOWN-ISSUE' : 'FAIL';
  const issue = knownLine ?? 'reproduceraren gav ingen KNOWN-ISSUE-rad';
  knownIssues.push({ id: 'save-order', owner: 'fas 5', status: knownStatus, evidence: issue });
  record({ name: 'sparordning', command: 'node --test lib/save-order.repro.mjs', required: false, exit: saveOrder.exit, durationMs: saveOrder.durationMs, status: knownStatus, evidence: { owner: 'fas 5', result: 'reproducerad' } });

  const endRevision = gitRevision();
  const endFingerprint = sourceTreeFingerprint();
  if (endRevision !== revision || endFingerprint !== fingerprint) {
    record({ name: 'källstabilitet', command: 'git revision + source fingerprint', exit: 1, durationMs: 0, status: 'FAIL', evidence: { reason: 'källträdet ändrades under körningen' } });
  } else record({ name: 'källstabilitet', command: 'git revision + source fingerprint', exit: 0, durationMs: 0, status: 'PASS' });

  const completedAt = new Date().toISOString();
  const status = aggregateStatus(steps, flags);
  const requirements = [
    { id: 'IAM-01', evidence: ['access-api:inbjudan', 'protected-browser:profilbundet proof'], status: status === 'PASS' ? 'PASS' : 'BLOCKED' },
    { id: 'IAM-03', evidence: ['access-api:uppdrag-utgatt/context-race', 'protected-browser:uppdragsväljare/flikbyte'], status: status === 'PASS' ? 'PASS' : 'BLOCKED' },
    { id: 'IAM-04', evidence: ['access-api:session', 'protected-browser:logout/flikrensning'], status: status === 'PASS' ? 'PASS' : 'BLOCKED' },
    { id: 'IAM-05', evidence: ['access-api:sparr/uppdrag-avslut/mfa-kravs', 'protected-browser:spärr/step-up'], status: status === 'PASS' ? 'PASS' : 'BLOCKED' },
    { id: 'ACL-01', evidence: ['sql', 'api-isolering', 'access-api:frammande-id/logg'], status: status === 'PASS' ? 'PASS' : 'BLOCKED' },
    { id: 'AUDIT-01', evidence: ['sql', 'access-api:aktor-forfalskning/logg/logg-flod/audit-rollback', 'protected-browser:spårbar ändring'], status: status === 'PASS' ? 'PASS' : 'BLOCKED' },
  ];
  const report = {
    kind: 'phase2-summary', startedAt, completedAt, gitRevision: revision,
    sourceTreeFingerprint: fingerprint, nodeVersion: process.version, target: 'protected',
    flags: { skipBrowser: flags.skipBrowser }, steps, requirements, knownIssues, status,
  };
  const validation = validateEvidence(report, { requiredStepNames, revision, fingerprint, startedAt, completedAt });
  if (!validation.ok) {
    report.status = 'FAIL';
    report.validationErrors = validation.errors;
  }
  if (secretPattern.test(JSON.stringify(report))) {
    report.status = 'FAIL';
    report.validationErrors = [...(report.validationErrors ?? []), 'slutrapporten innehåller hemligt markerbyte'];
  }
  fs.mkdirSync(path.dirname(flags.out), { recursive: true });
  fs.writeFileSync(flags.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nTotalstatus: ${report.status} → ${path.relative(root, flags.out) || flags.out}`);
  process.exitCode = report.status === 'PASS' || report.status === 'PASS-PARTIAL' ? 0 : report.status === 'BLOCKED' ? 3 : 1;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await main();
