#!/usr/bin/env node
// Samlad, fail-closed fasgrind för fas 3 (mandat och skyddade datavägar).
//
// Kör endast mot lokala syntetiska protected/baseline-mål. Gör aldrig reset,
// deployment, hosts-ändring, omstart av andras servrar eller annan automatisk
// omkonfiguration. Varje fasägt krav kräver färska bevis från just denna
// körning: samma git-revision och samma källfingeravtryck vid start och slut,
// resultatfiler skrivna efter start och alla obligatoriska steg PASS. Saknat
// steg, gammal rapport, loggkälla utan bevis eller hoppad/saknad browser ger
// aldrig PASS. En blockerad miljö redovisas BLOCKED.
//
//   cd web && npm run verify:phase3 [-- --out <fil>]

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertTarget } from '../../work/pilot/verify-target.mjs';
import { REQUIRED_CASES } from '../../work/pilot/verify-mandates.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const web = path.join(root, 'web');
const pilot = path.join(root, 'work', 'pilot');
const results = path.join(pilot, 'results');
const defaultOut = path.join(results, 'phase3-summary.json');

export const REQUIRED_SQL_FILES = [
  'phase1_isolation.test.sql', 'phase2_access.test.sql', 'phase2_audit.test.sql', 'phase3_audit.test.sql',
  'phase3_boundaries.test.sql', 'phase3_connections.test.sql', 'phase3_mandates.test.sql', 'phase3_matrix.test.sql',
  'phase3_policy.test.sql', 'phase3_temporal.test.sql',
];
export const REQUIRED_ACCESS_CASES = [
  'sparr', 'uppdrag-avslut', 'uppdrag-utgatt', 'session', 'csrf', 'mfa-kravs', 'inbjudan', 'frammande-id',
  'samma-epost', 'aktor-forfalskning', 'logg', 'logg-flod', 'context-race', 'audit-rollback',
  'phase3-mandates', 'phase3-pupils',
];
export const REQUIRED_SOURCE_PROBES = ['direct-rest', 'direct-rpc', 'direct-storage', 'direct-sql'];
export const REQUIRED_SOURCE_OUTAGES = ['kong', 'storage', 'postgres'];
// Riktig OIDC mot byggd Worker (03-05): nio flöden på dator och telefon.
export const WORKSPACE_BROWSER = {
  projects: ['phase3-desktop', 'phase3-phone'],
  titles: [
    'rektor tilldelar och avslutar uppdrag via formuläret',
    'rektor godkänner tidsbegränsad support för en elev',
    'support ser godkännare och sluttid, innehållet töms vid utgång',
    'lärare ser endast egen grupp och loggfel stoppar läsningen',
    'elevhälsa med ärendescope ser elev endast genom tilldelat ärende',
    'skoladministratör exporterar det kontrollerade urvalet',
    'IT pausar, aktiverar och provar anslutningen utan elevdata',
    'huvudman ser rektorsmandatet och kan bara tilldela rektor',
    'utloggning i en flik rensar elevprovet i andra flikar',
  ],
};
// Fas 3-mandatflöden i de befintliga protected-projekten. Specen skapas i 03-07
// med exakt dessa titlar (eller listan ändras där med redovisad motivering).
// Innan specen finns är steget BLOCKED och grinden kan inte ge PASS.
export const MANDATE_BROWSER = {
  spec: 'phase3-mandates.spec.ts',
  projects: ['protected-desktop', 'protected-phone'],
  builtProject: 'protected-built',
  titles: [
    'huvudman utser rektor',
    'rektor ger och avslutar läraruppdrag',
    'lärare loggar in utan engångskod',
    'elevhälsa med skolscope',
    'elevhälsa med elevscope',
    'elevhälsa med ärendescope',
    'rektor godkänner support som upphör vid sluttid',
    'rektor ger support till grupper som upphör vid sluttid',
    'IT pausar och provar anslutning utan elevinsyn',
    'granskaren följer elevläsning, export och nekande',
    'tangentbord och fältfel i tilldelningen',
    'verifiering nås med pekskärm i avslutsdialogen',
    'pekytor är minst 44 px på telefon',
    'utloggning rensar andra flikar',
    'nätverkssvar innehåller inga främmande elever',
  ],
};
export const REQUIREMENTS = [
  { id: 'ACL-02', evidence: ['sql', 'access-api', 'mandat-api', 'fas3-arbetsyta-browser', 'fas3-mandat-browser'] },
  { id: 'ACL-03', evidence: ['sql', 'access-api', 'mandat-api', 'fas3-arbetsyta-browser', 'fas3-mandat-browser'] },
  { id: 'ACL-04', evidence: ['modeller', 'sql', 'mandat-api', 'fas3-arbetsyta-browser', 'fas3-mandat-browser'] },
  { id: 'ACL-05', evidence: ['modeller', 'sql', 'mandat-api', 'fas3-arbetsyta-browser', 'fas3-mandat-browser'] },
  { id: 'AUDIT-02', evidence: ['sql', 'access-api', 'mandat-api', 'källbevis', 'fas3-arbetsyta-browser', 'fas3-mandat-browser'] },
  { id: 'AUDIT-03', evidence: ['sql', 'mandat-api', 'källbevis', 'fas3-mandat-browser'] },
];
const secretPattern = /sp_session=|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20,}|(?:totp|otp)[_-]?secret|BEGIN (?:RSA |EC )?PRIVATE KEY|sb_(?:secret|service)_|Syntetisk elev/iu;

// ---- Rena sammanställningsfunktioner (enhetstestade) ----------------------------------------------

export function aggregateStatus(steps) {
  const required = steps.filter((step) => step.required !== false);
  if (!required.length) return 'FAIL';
  if (required.some((step) => step.status === 'FAIL' || (step.exit !== null && step.exit !== undefined && step.exit !== 0))) return 'FAIL';
  if (required.some((step) => step.status === 'BLOCKED')) return 'BLOCKED';
  return required.every((step) => step.status === 'PASS') ? 'PASS' : 'FAIL';
}

export function requirementResults(steps, overall) {
  const byName = new Map(steps.map((step) => [step.name, step]));
  return REQUIREMENTS.map(({ id, evidence }) => {
    const statuses = evidence.map((name) => byName.get(name)?.status ?? 'MISSING');
    const own = statuses.includes('FAIL') || statuses.includes('MISSING') ? (statuses.includes('FAIL') ? 'FAIL' : 'BLOCKED')
      : statuses.includes('BLOCKED') ? 'BLOCKED' : statuses.every((status) => status === 'PASS') ? 'PASS' : 'FAIL';
    const status = own === 'PASS' ? (overall === 'PASS' ? 'PASS' : overall === 'FAIL' ? 'FAIL' : 'BLOCKED') : own;
    return { id, evidence: evidence.map((name, index) => ({ step: name, status: statuses[index] })), status };
  });
}

export function validateEvidence(report, { requiredStepNames, revision, fingerprint, startedAt, completedAt } = {}) {
  const errors = [];
  const started = Date.parse(startedAt ?? report?.startedAt ?? '');
  const completed = Date.parse(completedAt ?? report?.completedAt ?? '');
  if (!report || report.kind !== 'phase3-summary') errors.push('fel eller saknad rapporttyp');
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) errors.push('ogiltigt tidsintervall');
  if (report?.gitRevision !== revision) errors.push('fel revision');
  if (report?.sourceTreeFingerprint !== fingerprint) errors.push('fel källfingeravtryck');
  const byName = new Map((report?.steps ?? []).map((step) => [step.name, step]));
  for (const name of requiredStepNames ?? []) {
    const step = byName.get(name);
    if (!step) { errors.push(`saknat steg: ${name}`); continue; }
    if (step.status !== 'PASS') errors.push(`${name} är ${step.status}`);
    if (step.exit !== 0) errors.push(`${name} har exit ${String(step.exit)}`);
    const produced = Date.parse(step.evidence?.producedAt ?? '');
    if (!Number.isFinite(produced) || produced < started || produced > completed) errors.push(`${name} har gammalt eller ogiltigt bevis`);
    if (step.evidence?.gitRevision !== revision) errors.push(`${name} har fel revision`);
    if (step.evidence?.sourceTreeFingerprint !== fingerprint) errors.push(`${name} har fel källfingeravtryck`);
  }
  return { ok: errors.length === 0, errors };
}

function fresh(timestamp, startedMs, label) {
  const value = Date.parse(timestamp ?? '');
  if (!Number.isFinite(value) || value + 1000 < startedMs) throw new Error(`${label}: gammalt eller saknat tidsbevis`);
}

/** API-rapporten från verify-mandates.mjs: exakt hela falluppsättningen, färsk och grön. */
export function validateApiReport(report, { startedMs, revision }) {
  if (!report || report.kind !== 'phase3-api') throw new Error('API: fel eller saknad rapport');
  fresh(report.startedAt, startedMs, 'API');
  if (report.revision !== revision) throw new Error('API: fel revision');
  if (report.status !== 'PASS' || report.complete !== true) throw new Error(`API: status ${report.status}, complete ${report.complete}`);
  if (JSON.stringify(report.requiredCases) !== JSON.stringify(REQUIRED_CASES)) throw new Error('API: ändrad falluppsättning');
  const byName = new Map((report.cases ?? []).map((item) => [item.name, item]));
  const bad = REQUIRED_CASES.filter((name) => {
    const item = byName.get(name);
    return !item || item.status !== 'PASS' || !Array.isArray(item.checks) || item.checks.length < 2 || item.checks.some((c) => c.ok !== true);
  });
  if (bad.length) throw new Error(`API: saknade eller ej gröna fall: ${bad.join(', ')}`);
  if (secretPattern.test(JSON.stringify(report))) throw new Error('API: rapporten innehåller hemligt markerbyte eller elevnamn');
  return { cases: REQUIRED_CASES.length, checks: report.cases.reduce((sum, item) => sum + item.checks.length, 0) };
}

/** Källrapporten (collect-denials via verify-mandates): alla direktvägar och avbrott med bevis. */
export function validateSourceReport(report, { startedMs }) {
  if (!report || report.scope !== 'local-synthetic-only') throw new Error('källor: fel eller saknad rapport');
  fresh(report.checkedAt, startedMs, 'källor');
  if (report.status !== 'PASS' || (report.blockers ?? []).length) throw new Error(`källor: ${report.status} ${JSON.stringify(report.blockers ?? [])}`);
  const probes = new Map((report.probes ?? []).map((p) => [p.id, p.status]));
  const missingProbe = REQUIRED_SOURCE_PROBES.filter((id) => probes.get(id) !== 'PASS');
  const outages = new Map((report.outages ?? []).map((o) => [o.source, o.status]));
  const missingOutage = REQUIRED_SOURCE_OUTAGES.filter((id) => outages.get(id) !== 'PASS');
  if (missingProbe.length || missingOutage.length) throw new Error(`källor: saknar bevis för ${[...missingProbe, ...missingOutage].join(', ')}`);
  if (!Array.isArray(report.events) || report.events.length === 0) throw new Error('källor: inga källhändelser');
  if (secretPattern.test(JSON.stringify(report))) throw new Error('källor: rapporten innehåller hemligt markerbyte');
  return { probes: REQUIRED_SOURCE_PROBES, outages: REQUIRED_SOURCE_OUTAGES, events: report.events.length };
}

/** Playwrights JSON-rapport → [{title, project, status}] för varje körd test. */
export function playwrightOutcomes(report) {
  const outcomes = [];
  const walk = (suite) => {
    for (const spec of suite?.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const last = test.results?.[test.results.length - 1];
        outcomes.push({ title: spec.title, file: spec.file ?? suite.file ?? null, project: test.projectName, status: test.status === 'expected' && last?.status === 'passed' ? 'passed' : (last?.status ?? test.status ?? 'missing') });
      }
    }
    for (const child of suite?.suites ?? []) walk(child);
  };
  for (const suite of report?.suites ?? []) walk(suite);
  return outcomes;
}

/** Varje obligatorisk titel måste ha passerat i varje obligatoriskt projekt; inget får hoppas. */
export function validateBrowserReport(report, { titles, projects, builtProject = null, file = null }) {
  if (!report?.stats) throw new Error('browser: saknad rapport');
  if (report.stats.unexpected !== 0 || report.stats.skipped !== 0 || (report.stats.flaky ?? 0) !== 0) {
    throw new Error(`browser: unexpected=${report.stats.unexpected}, skipped=${report.stats.skipped}, flaky=${report.stats.flaky ?? 0}`);
  }
  const outcomes = playwrightOutcomes(report).filter((o) => !file || (o.file ?? '').endsWith(file));
  if (outcomes.some((o) => o.status !== 'passed')) throw new Error('browser: minst ett fall passerade inte');
  const missing = [];
  for (const project of projects) for (const title of titles) {
    if (!outcomes.some((o) => o.project === project && o.title === title && o.status === 'passed')) missing.push(`${project}: ${title}`);
  }
  if (builtProject && !outcomes.some((o) => o.project === builtProject && o.status === 'passed')) missing.push(`${String(builtProject)}: inget fall`);
  if (missing.length) throw new Error(`browser: saknade fall: ${missing.slice(0, 6).join('; ')}${missing.length > 6 ? ` (+${missing.length - 6})` : ''}`);
  return { passed: outcomes.length, projects: [...projects, ...(builtProject ? [builtProject] : [])], titles: titles.length };
}

// Fas 1/2-specarna hoppar avsiktligt över vissa fall i vissa projekt (t.ex. devfall i
// byggd Worker, pekytor utanför telefonprojektet). Endast dessa redovisade skäl godtas;
// ett fall som hoppas av annat skäl, t.ex. för att ett seriellt fall före det
// misslyckades ("did not run"), gör regressionen FAIL.
export const DESIGNED_SKIPS = {
  fas1: ['Pekytor mäts bara i telefonprojektet'],
  fas2: ['Provas i devprojekten.', 'Provas mot byggd Worker.', 'Pekytor provas i telefonprojektet.'],
};

/** Regressionsrapport: inga oväntade/flaky fall, minsta antal gröna och bara redovisade hopp. */
export function validateRegressionReport(report, { minExpected, allowedSkips, label }) {
  const stats = report?.stats;
  if (!stats) throw new Error(`${label}: saknad rapport`);
  if (stats.unexpected !== 0 || (stats.flaky ?? 0) !== 0 || !(stats.expected >= minExpected)) {
    throw new Error(`${label}: expected=${stats.expected}, unexpected=${stats.unexpected}, flaky=${stats.flaky ?? 0}`);
  }
  const undesigned = [];
  let skipped = 0;
  const walk = (suite) => {
    for (const spec of suite?.specs ?? []) {
      for (const run of spec.tests ?? []) {
        if (run.status !== 'skipped') continue;
        skipped += 1;
        const reasons = [...(run.annotations ?? []), ...(run.results ?? []).flatMap((result) => result.annotations ?? [])]
          .filter((annotation) => annotation.type === 'skip').map((annotation) => annotation.description);
        if (!reasons.length || !reasons.every((reason) => allowedSkips.includes(reason))) undesigned.push(`${run.projectName}: ${spec.title}`);
      }
    }
    for (const child of suite?.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  if (skipped !== stats.skipped) throw new Error(`${label}: hoppade fall kunde inte stämmas av (${skipped}/${stats.skipped})`);
  if (undesigned.length) throw new Error(`${label}: fall hoppades utan redovisat skäl: ${undesigned.slice(0, 4).join('; ')}${undesigned.length > 4 ? ` (+${undesigned.length - 4})` : ''}`);
  return { expected: stats.expected, designedSkips: skipped };
}

/** SQL-runnern saknar tidsstämpel i rapporten; färskheten avgörs av filens mtime (freshJson). */
export function validateSqlReport(report) {
  if (!report || report.status !== 'PASS' || report.exitCode !== 0) throw new Error(`SQL: status ${report?.status}`);
  const missing = REQUIRED_SQL_FILES.filter((name) => !report.files?.includes(name));
  if (missing.length) throw new Error(`SQL: saknar ${missing.join(', ')}`);
  return { files: report.files.length };
}

export function validateAccessReport(report, { startedMs, revision }) {
  if (!report || report.status !== 'PASS') throw new Error(`access: status ${report?.status}`);
  fresh(report.checkedAt, startedMs, 'access');
  if (report.revision !== revision) throw new Error('access: fel revision');
  const passed = new Set((report.cases ?? []).filter((item) => item.status === 'PASS').map((item) => item.name));
  const missing = REQUIRED_ACCESS_CASES.filter((name) => !passed.has(name));
  if (missing.length) throw new Error(`access: saknade fall ${missing.join(', ')}`);
  if (secretPattern.test(JSON.stringify(report))) throw new Error('access: hemligt markerbyte');
  return { cases: REQUIRED_ACCESS_CASES.length };
}

// ---- Körning ---------------------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = { out: defaultOut };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') flags.out = path.resolve(process.cwd(), argv[++index] ?? '');
    else if (arg.startsWith('--out=')) flags.out = path.resolve(process.cwd(), arg.slice(6));
    else throw new Error(`okänd flagga: ${arg}`);
  }
  return flags;
}

function gitRevision() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// Omfattar webbkod, SQL/migrationer, work/pilot (provskript, fixturer), browserkonfiguration
// och handbokens källor/Docusaurus-konfiguration. Genererade resultat och byggen ingår inte.
export function sourceTreeFingerprint() {
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\0').filter(Boolean).filter((file) => {
      if (!/^(web|supabase|work\/pilot|docs\/handbok|docs-site)\//u.test(file) && file !== 'package.json') return false;
      return !/(^|\/)(?:node_modules|dist(?:-protected)?|build|test-results|playwright-report|\.docusaurus|\.vinext|\.wrangler|targets|results)(?:\/|$)/u.test(file)
        && !/(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\.lock)?)$/u.test(file);
    }).sort();
  const hash = createHash('sha256');
  for (const file of files) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    hash.update(file); hash.update('\0'); hash.update(fs.readFileSync(full)); hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function run(file, args, { cwd = web, env = process.env } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    let child;
    try { child = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { resolve({ exit: null, output: String(error?.message ?? error), durationMs: Date.now() - start }); return; }
    let output = '';
    const collect = (chunk) => { const value = chunk.toString(); output = `${output}${value}`.slice(-200_000); process.stdout.write(value); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', (error) => resolve({ exit: null, output: `${output}\n${error.message}`, durationMs: Date.now() - start }));
    child.on('close', (code) => resolve({ exit: code, output, durationMs: Date.now() - start }));
  });
}

function freshJson(file, startedMs) {
  if (!fs.existsSync(file)) throw new Error(`${path.relative(root, file)} saknas`);
  if (fs.statSync(file).mtimeMs + 1000 < startedMs) throw new Error(`${path.relative(root, file)} skapades inte i denna körning`);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error(`${path.relative(root, file)} är inte giltig JSON`); }
}

function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (busy) => { socket.destroy(); resolve(busy); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1000, () => done(false));
  });
}

/** Miljöhinder före ett steg: upptagna portar eller kvarlämnat preview-lås ger BLOCKED, inte FAIL. */
async function environmentBlock(ports, needsProtectedBuild) {
  const busy = [];
  for (const port of ports) if (await portBusy(port)) busy.push(port);
  if (busy.length) return `port ${busy.join(', ')} används redan av en annan process; stoppa den (grinden stoppar aldrig andras servrar)`;
  if (needsProtectedBuild && fs.existsSync(path.join(web, 'dist-protected/server/.dev.vars.lock'))) return 'dist-protected är låst av en körande eller avbruten preview';
  return null;
}

const statusFromExit = (result) => (result.exit === 0 ? 'PASS' : result.exit === 3 ? 'BLOCKED' : 'FAIL');

async function main() {
  let flags;
  try { flags = parseFlags(process.argv.slice(2)); }
  catch (error) { console.error(`REFUSED: ${error.message}`); process.exitCode = 1; return; }

  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const revision = gitRevision();
  const fingerprint = sourceTreeFingerprint();
  const steps = [];
  const requiredStepNames = [];

  const record = (step) => {
    const saved = { required: true, ...step, evidence: { ...step.evidence, producedAt: new Date().toISOString(), gitRevision: revision, sourceTreeFingerprint: fingerprint } };
    steps.push(saved);
    if (saved.required) requiredStepNames.push(saved.name);
    console.log(`\n==> ${saved.name}: ${saved.status} (exit ${saved.exit ?? '-'})`);
    return saved;
  };
  const blocked = (name, command, reason) => record({ name, command, exit: null, durationMs: 0, status: 'BLOCKED', evidence: { reason } });
  const commandStep = async (name, file, args, options = {}) => {
    const command = options.command ?? [file, ...args].join(' ');
    console.log(`\n--- ${name}: ${command}`);
    const result = await run(file, args, options);
    let status = statusFromExit(result);
    let evidence = {};
    if (status === 'BLOCKED') {
      const line = result.output.split('\n').map((l) => l.trim()).find((l) => l.startsWith('BLOCKED:'));
      evidence = { reason: (line ?? 'miljön är blockerad').slice(0, 300) };
    }
    if (status === 'PASS' && options.validate) {
      try { evidence = await options.validate(result); }
      catch (error) { status = 'FAIL'; evidence = { validation: String(error.message).slice(0, 400) }; }
    }
    return record({ name, command, exit: status === 'FAIL' && result.exit === 0 ? 1 : result.exit, durationMs: result.durationMs, status, evidence });
  };

  const major = Number(process.versions.node.split('.')[0]);
  if (major !== 25) blocked('node25', 'node --version', `Node 25 krävs; kör export PATH="/opt/homebrew/opt/node@25/bin:$PATH" (nu ${process.version})`);
  else record({ name: 'node25', command: 'node --version', exit: 0, durationMs: 0, status: 'PASS', evidence: { nodeVersion: process.version } });

  let protectedReady = false;
  try {
    await assertTarget('protected', { requireIdp: true }); protectedReady = true;
    record({ name: 'mål-protected', command: 'assertTarget(protected,{requireIdp:true})', exit: 0, durationMs: 0, status: 'PASS', evidence: { target: 'protected' } });
  } catch (error) {
    blocked('mål-protected', 'assertTarget(protected,{requireIdp:true})', `${error instanceof Error ? error.message : String(error)}`.slice(0, 300));
  }
  let baselineReady = false;
  try {
    await assertTarget('baseline'); baselineReady = true;
    record({ name: 'mål-baseline', command: 'assertTarget(baseline)', exit: 0, durationMs: 0, status: 'PASS', evidence: { target: 'baseline' } });
  } catch (error) {
    blocked('mål-baseline', 'assertTarget(baseline)', `${error instanceof Error ? error.message : String(error)}. Starta med node work/pilot/prepare-local.mjs --target baseline`.slice(0, 400));
  }
  // En annan byggd protected-preview (t.ex. på port 3000) låser dist-protected. Grinden
  // stoppar aldrig andras servrar; den redovisar blockeringen.
  const previewLock = path.join(web, 'dist-protected/server/.dev.vars.lock');
  const previewFree = !fs.existsSync(previewLock);
  if (previewFree) record({ name: 'preview-lås', command: 'dist-protected/server/.dev.vars.lock', exit: 0, durationMs: 0, status: 'PASS', evidence: { free: true } });
  else blocked('preview-lås', 'dist-protected/server/.dev.vars.lock', 'en byggd protected-preview körs redan (t.ex. på port 3000). Stoppa den före grinden och starta om den efteråt.');

  const libTests = fs.readdirSync(path.join(web, 'lib')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `lib/${f}`);
  const serverTests = fs.readdirSync(path.join(web, 'lib/server')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `lib/server/${f}`);
  await commandStep('modeller', process.execPath, ['--test', ...libTests, ...serverTests], { command: `node --test lib/*.test.mjs lib/server/*.test.mjs (${libTests.length + serverTests.length} filer)` });
  await commandStep('grind-unit', process.execPath, ['--test', 'scripts/verify-phase3.test.mjs', 'scripts/verify-phase2.test.mjs', path.join(pilot, 'collect-denials.test.mjs')], { command: 'node --test scripts/verify-phase3.test.mjs scripts/verify-phase2.test.mjs ../work/pilot/collect-denials.test.mjs' });
  await commandStep('typkontroll', process.execPath, [path.join(web, 'node_modules/typescript/bin/tsc'), '--noEmit'], { command: 'npx tsc --noEmit' });
  await commandStep('lint', process.execPath, [path.join(web, 'node_modules/oxlint/bin/oxlint'), 'app', 'lib', 'scripts', 'e2e'], { command: 'npx oxlint app lib scripts e2e' });
  const pilotScripts = ['verify-mandates.mjs', 'verify-access.mjs', 'collect-denials.mjs', 'configure-audit-source.mjs', 'phase3-browser-fixtures.mjs', 'phase2-otp-fixtures.mjs'].map((f) => path.join('work/pilot', f));
  await commandStep('lint-pilot', path.join(web, 'node_modules/.bin/oxlint'), pilotScripts, { cwd: root, command: `oxlint ${pilotScripts.join(' ')}` });
  await commandStep('normalt-bygge', process.execPath, ['scripts/run-mode.mjs', 'build', '--mode', 'example'], { command: 'npm run build:example' });
  if (!previewFree) blocked('protected-bygge', 'npm run build:protected', 'dist-protected är låst av en körande preview');
  else await commandStep('protected-bygge', process.execPath, ['scripts/run-mode.mjs', 'build', '--mode', 'protected'], {
    command: 'npm run build:protected',
    validate: () => {
      const mark = freshJson(path.join(web, 'dist-protected/build-mode.json'), startedMs);
      if (mark.mode !== 'protected' || mark.revision !== revision) throw new Error('bygget har fel läge eller revision');
      return { mode: mark.mode, revision: mark.revision };
    },
  });
  const docsReady = fs.existsSync(path.join(root, 'docs-site/node_modules'));
  if (!docsReady) blocked('docs-bygge', 'npm run docs:build', 'Docusaurus-beroenden saknas; kör npm run docs:install från projektroten');
  else await commandStep('docs-bygge', 'npm', ['run', 'docs:build'], { cwd: root, command: 'npm run docs:build (projektroten)' });

  const sqlOut = path.join(results, 'phase3-sql-all.json');
  if (!protectedReady) blocked('sql', 'node work/pilot/run-sql-tests.mjs', 'protected-målet är inte klart');
  else await commandStep('sql', process.execPath, [path.join(pilot, 'run-sql-tests.mjs'), '--out', sqlOut], {
    cwd: root, command: 'node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase3-sql-all.json',
    validate: () => validateSqlReport(freshJson(sqlOut, startedMs)),
  });

  const isolationOut = path.join(results, 'isolation.json');
  if (!protectedReady) blocked('api-isolering', 'node work/pilot/verify-isolation.mjs', 'protected-målet är inte klart');
  else await commandStep('api-isolering', process.execPath, [path.join(pilot, 'verify-isolation.mjs')], {
    cwd: root, command: 'node work/pilot/verify-isolation.mjs',
    validate: () => {
      const report = freshJson(isolationOut, startedMs);
      if (report.status !== 'PASS' || report.checks?.some((c) => c.outcome === 'ALLOWED')) throw new Error('isolationsrapporten är inte helt nekande/PASS');
      return { status: report.status };
    },
  });

  const baselineOut = path.join(results, 'baseline-db.json');
  if (!baselineReady) blocked('baslinje-db', 'node work/pilot/verify-baseline-db.mjs', 'baseline-målet är inte klart');
  else await commandStep('baslinje-db', process.execPath, [path.join(pilot, 'verify-baseline-db.mjs')], {
    cwd: root, command: 'node work/pilot/verify-baseline-db.mjs',
    validate: () => {
      const report = freshJson(baselineOut, startedMs);
      if (report.status !== 'PASS' || report.flows?.some((flow) => flow.status !== 'PASS')) throw new Error('baslinjeflöden saknar PASS');
      return { status: report.status, flows: report.flows?.map((flow) => flow.flow) ?? [] };
    },
  });

  const apiBlock = !protectedReady ? 'protected-målet är inte klart' : await environmentBlock([3013, 3014], true);
  const apiReady = apiBlock === null;
  const apiReason = apiBlock ?? '';
  // Fas 3:s gamla rapporter är historiska bevis och får inte skrivas över av
  // den portade regressionskörningen efter elevprovets avveckling.
  const accessOut = path.join(results, 'phase4-access-regression.json');
  if (!apiReady) blocked('access-api', 'node work/pilot/verify-access.mjs', apiReason);
  else await commandStep('access-api', process.execPath, [path.join(pilot, 'verify-access.mjs'), '--out', accessOut], {
    cwd: root, command: 'node work/pilot/verify-access.mjs --out work/pilot/results/phase4-access-regression.json',
    validate: () => validateAccessReport(freshJson(accessOut, startedMs), { startedMs, revision }),
  });

  const apiOut = path.join(results, 'phase4-mandates-regression.json');
  const denialsOut = path.join(results, 'phase4-denials-regression.json');
  if (!apiReady) {
    blocked('mandat-api', 'node work/pilot/verify-mandates.mjs', apiReason);
    blocked('källbevis', 'work/pilot/results/phase4-denials-regression.json', apiReason);
  } else {
    await commandStep('mandat-api', process.execPath, [path.join(pilot, 'verify-mandates.mjs'), '--out', apiOut], {
      cwd: root, command: 'node work/pilot/verify-mandates.mjs --out work/pilot/results/phase4-mandates-regression.json',
      validate: () => validateApiReport(freshJson(apiOut, startedMs), { startedMs, revision }),
    });
    try {
      const evidence = validateSourceReport(freshJson(denialsOut, startedMs), { startedMs });
      record({ name: 'källbevis', command: 'work/pilot/results/phase4-denials-regression.json (skriven av mandat-api)', exit: 0, durationMs: 0, status: 'PASS', evidence });
    } catch (error) {
      record({ name: 'källbevis', command: 'work/pilot/results/phase4-denials-regression.json (skriven av mandat-api)', exit: 1, durationMs: 0, status: 'FAIL', evidence: { validation: String(error.message).slice(0, 400) } });
    }
  }

  const playwright = path.join(web, 'node_modules/@playwright/test/cli.js');
  const fas1Block = await environmentBlock([5191, 5192, 3011], false);
  if (fas1Block) blocked('fas1-browser', 'npx playwright test -c playwright.config.ts', fas1Block);
  else await commandStep('fas1-browser', process.execPath, [playwright, 'test', '-c', 'playwright.config.ts'], {
    command: 'npx playwright test -c playwright.config.ts',
    validate: () => {
      const report = freshJson(path.join(web, 'test-results/phase1-e2e.json'), startedMs);
      return validateRegressionReport(report, { minExpected: 20, allowedSkips: DESIGNED_SKIPS.fas1, label: 'fas 1' });
    },
  });
  const protectedBrowserBlock = async () => (!protectedReady ? 'protected-målet är inte klart' : environmentBlock([5193, 3012], true));
  // Test-IdP:ns TOTP-registrering för fas 2-kontona återställs så att browserprovet
  // registrerar och använder en känd hemlighet (MFA-kravet ändras inte).
  if (!protectedReady) blocked('fas2-fixturer', 'node work/pilot/phase2-otp-fixtures.mjs --target protected', 'protected-målet är inte klart');
  else await commandStep('fas2-fixturer', process.execPath, [path.join(pilot, 'phase2-otp-fixtures.mjs'), '--target', 'protected'], { cwd: root, command: 'node work/pilot/phase2-otp-fixtures.mjs --target protected' });
  const fas2Block = await protectedBrowserBlock();
  if (fas2Block) blocked('fas2-browser', 'npm run e2e:protected', fas2Block);
  else await commandStep('fas2-browser', process.execPath, [playwright, 'test', '-c', 'playwright.protected.config.ts', 'phase2-'], {
    command: 'npx playwright test -c playwright.protected.config.ts phase2-',
    validate: () => {
      const report = freshJson(path.join(web, 'test-results/phase2-e2e.json'), startedMs);
      return validateRegressionReport(report, { minExpected: 30, allowedSkips: DESIGNED_SKIPS.fas2, label: 'fas 2' });
    },
  });

  if (!protectedReady) blocked('fas3-fixturer', 'node work/pilot/phase3-browser-fixtures.mjs --target protected', 'protected-målet är inte klart');
  else await commandStep('fas3-fixturer', process.execPath, [path.join(pilot, 'phase3-browser-fixtures.mjs'), '--target', 'protected'], { cwd: root, command: 'node work/pilot/phase3-browser-fixtures.mjs --target protected' });
  const workspaceBlock = await protectedBrowserBlock();
  if (workspaceBlock) blocked('fas3-arbetsyta-browser', 'npx playwright test -c playwright.phase3.config.ts', workspaceBlock);
  else await commandStep('fas3-arbetsyta-browser', process.execPath, [playwright, 'test', '-c', 'playwright.phase3.config.ts'], {
    command: 'npx playwright test -c playwright.phase3.config.ts',
    validate: () => validateBrowserReport(freshJson(path.join(web, 'test-results/phase3-workspace.json'), startedMs), WORKSPACE_BROWSER),
  });

  const mandateSpec = path.join(web, 'e2e', MANDATE_BROWSER.spec);
  const mandateJson = path.join(web, 'test-results/phase3-mandates-e2e.json');
  if (!fs.existsSync(mandateSpec)) blocked('fas3-mandat-browser', `npm run e2e:protected -- ${MANDATE_BROWSER.spec}`, `e2e/${MANDATE_BROWSER.spec} saknas; fas 3-mandatflödena på dator/telefon/byggd Worker skapas i 03-07`);
  else if (await protectedBrowserBlock()) blocked('fas3-mandat-browser', `npm run e2e:protected -- ${MANDATE_BROWSER.spec}`, await protectedBrowserBlock());
  else {
    const listed = await run(process.execPath, [playwright, 'test', '-c', 'playwright.protected.config.ts', '--list', MANDATE_BROWSER.spec]);
    const discovered = MANDATE_BROWSER.projects.every((project) => listed.output.includes(`[${project}]`)) && listed.output.includes(`[${MANDATE_BROWSER.builtProject}]`);
    if (listed.exit !== 0 || !discovered) {
      record({ name: 'fas3-mandat-browser', command: `playwright --list ${MANDATE_BROWSER.spec}`, exit: 1, durationMs: listed.durationMs, status: 'FAIL', evidence: { validation: 'specen upptäcks inte i alla protected-projekt (testMatch)' } });
    } else {
      await commandStep('fas3-mandat-browser', process.execPath, [playwright, 'test', '-c', 'playwright.protected.config.ts', MANDATE_BROWSER.spec, '--reporter=list,json'], {
        command: `npx playwright test -c playwright.protected.config.ts ${MANDATE_BROWSER.spec}`,
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: mandateJson },
        validate: () => validateBrowserReport(freshJson(mandateJson, startedMs), { ...MANDATE_BROWSER, file: MANDATE_BROWSER.spec }),
      });
    }
  }

  const endRevision = gitRevision();
  const endFingerprint = sourceTreeFingerprint();
  if (endRevision !== revision || endFingerprint !== fingerprint) record({ name: 'källstabilitet', command: 'git revision + källfingeravtryck', exit: 1, durationMs: 0, status: 'FAIL', evidence: { reason: 'källträdet ändrades under körningen' } });
  else record({ name: 'källstabilitet', command: 'git revision + källfingeravtryck', exit: 0, durationMs: 0, status: 'PASS' });

  const completedAt = new Date().toISOString();
  let status = aggregateStatus(steps);
  const report = {
    kind: 'phase3-summary', scope: 'local-synthetic-only', startedAt, completedAt, gitRevision: revision,
    sourceTreeFingerprint: fingerprint, nodeVersion: process.version, target: 'protected', steps, status,
  };
  const validation = validateEvidence(report, { requiredStepNames, revision, fingerprint, startedAt, completedAt });
  if (!validation.ok && status === 'PASS') status = 'FAIL';
  if (!validation.ok) report.validationErrors = validation.errors;
  if (secretPattern.test(JSON.stringify(report))) {
    status = 'FAIL';
    report.validationErrors = [...(report.validationErrors ?? []), 'slutrapporten innehåller hemligt markerbyte'];
  }
  report.status = status;
  report.requirements = requirementResults(steps, status);
  fs.mkdirSync(path.dirname(flags.out), { recursive: true });
  fs.writeFileSync(flags.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log('\nKrav:');
  for (const item of report.requirements) console.log(`  ${item.id}: ${item.status} (${item.evidence.map((e) => `${e.step}=${e.status}`).join(', ')})`);
  console.log(`\nTotalstatus: ${report.status} → ${path.relative(root, flags.out) || flags.out}`);
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'BLOCKED' ? 3 : 1;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await main();
