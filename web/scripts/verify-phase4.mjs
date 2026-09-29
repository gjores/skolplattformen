#!/usr/bin/env node
// Samlad lokal, syntetisk fas 4-grind. Inga servrar som redan kör stoppas.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertTarget } from '../../work/pilot/verify-target.mjs';
import { REQUIRED_CASES as REGISTER_CASES } from '../../work/pilot/verify-register.mjs';
import { REQUIRED_SQL_FILES as PHASE3_SQL, REQUIRED_ACCESS_CASES,
  validateAccessReport, validateApiReport, validateBrowserReport, validateSourceReport,
  sourceTreeFingerprint } from './verify-phase3.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const web = path.join(root, 'web');
const pilot = path.join(root, 'work/pilot');
const results = path.join(pilot, 'results');
const defaultOut = path.join(results, 'phase4-summary.json');
export const PHASE4_SQL = ['phase4_conflicts.test.sql', 'phase4_export.test.sql', 'phase4_periods.test.sql',
  'phase4_protected.test.sql', 'phase4_register.test.sql', 'phase4_retire.test.sql', 'phase4_selection.test.sql'];
export const LOCK_CASES = ['different-fields', 'same-field', 'period', 'membership-block', 'protection-revoked', 'pupil-row-lock'];
export const BASELINE_FLOWS = ['utbildning-och-kurs-niva', 'kullkopiering-fristaende', 'klass-timplan-fast-version', 'grundskola-timplan'];
export const BROWSER_TITLES = [
  'namnlika elever hittas igen efter utloggning utan sökord i adress eller lagring',
  'elevkort visar perioder, ursprung och historik utan oombedd personnummerläsning',
  'personnummer kräver aktivt val och rensas när elevkortet stängs',
  'export kräver uttryckliga val och ger nedladdning samt säkerhetslogg',
  'telefonbredd 390 och 320 visar lista, kort och dialog utan sidledsrullning',
  'huvudmannens beviljande och återkallelse styr skyddad vy och anonym rad',
  'lokal rättelse möter simulerad källa och båda explicita val loggas',
  'klass, utbildning och hemkommun får varsin period och ursprung',
  'avslutad historisk placering kan läsas men inte ändras',
  'två administratörer löser fältkonflikt och hämtar om periodkonflikt',
  'loggfel stoppar ändring och bevarar inmatning för nytt försök',
  'sena exportsvar efter utloggning i annan flik skapar ingen fil eller Blob',
  'fördröjt 409-svar återför inte elevfält efter flerflikslås',
];
export const REQUIREMENT_STEPS = {
  'STU-01': ['sql', 'register-api', 'register-browser', 'baslinje-db'],
  'STU-02': ['sql', 'register-api', 'register-browser'],
  'STU-03': ['sql', 'register-api', 'register-browser'],
  'STU-04': ['sql', 'register-api', 'register-lås', 'register-browser'],
  'STU-05': ['sql', 'register-api', 'register-browser'],
  'STU-06': ['sql', 'register-api', 'register-lås', 'register-browser'],
  'DATA-01': ['sql', 'register-api', 'register-browser', 'access-api', 'mandat-api', 'källbevis'],
  'DATA-02': ['sql', 'register-api', 'register-browser', 'access-api', 'mandat-api', 'källbevis'],
};
const leak = /sp_session=|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20,}|(?:totp|otp)[_-]?secret|BEGIN (?:RSA |EC )?PRIVATE KEY|sb_(?:secret|service)_|Syntetisk elev|TEST-\d{8}-\d{4}|\b\d{6}[-+]\d{4}\b|Alex Prov|Syntetiskt 04-/iu;
const revision = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const fresh = (file, start) => {
  if (!fs.existsSync(file) || fs.statSync(file).mtimeMs + 1000 < start) throw new Error('saknad eller gammal rapport');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const checkTime = (value, start) => { if (!Number.isFinite(Date.parse(value)) || Date.parse(value) + 1000 < start) throw new Error('gammalt tidsbevis'); };
const exact = (actual, required, label) => {
  if (!Array.isArray(actual) || actual.length !== required.length || new Set(actual).size !== required.length ||
    required.some(item => !actual.includes(item))) throw new Error(`${label}: saknad, extra eller duplicerad fallidentitet`);
};
const clean = (report, label) => { if (leak.test(JSON.stringify(report))) throw new Error(`${label}: rapporten innehåller känsliga markörer`); };

export function validateRegister(report, { head }) {
  if (report?.target !== 'protected' || report?.revision !== head || report?.status !== 'PASS') throw new Error('register: fel mål/revision/status');
  exact(report.cases?.map(item => item.name), REGISTER_CASES, 'register');
  if (report.cases.some(item => item.status !== 'PASS' || !Array.isArray(item.checks) || item.checks.length < 2 ||
    !['response', 'persistent'].every(kind => item.checks.some(check => check.kind === kind && check.ok === true)) ||
    item.checks.some(check => check.ok !== true))) throw new Error('register: fall saknar kontroller');
  clean(report, 'register');
  return { cases: report.cases.length, report: 'work/pilot/results/phase4-api.json' };
}
export function validateLocks(report) {
  if (report?.target !== 'protected' || report?.status !== 'PASS') throw new Error('lås: fel mål/status');
  exact(report.cases?.map(item => item.name), LOCK_CASES, 'lås');
  if (report.cases.some(item => item.waitingObserved !== true || !item.lockType || !item.outcome ||
    item.committedVersionObserved !== !['membership-block', 'protection-revoked'].includes(item.name))) throw new Error('lås: två anslutningar eller låsbevis saknas');
  clean(report, 'lås');
  return { cases: report.cases.length };
}
export function validateSql(report) {
  if (report?.target !== 'protected' || report?.status !== 'PASS' || report.exitCode !== 0) throw new Error('SQL: fel mål/status');
  exact(report.files, [...PHASE3_SQL, ...PHASE4_SQL], 'SQL');
  return { files: report.files.length };
}
export function validateBaseline(report, target, head, start) {
  if (report?.kind !== 'baseline-db' || report?.status !== 'PASS' || report?.target?.projectId !== target.projectId ||
    report.revision !== head.slice(0, 7)) throw new Error('baslinje: fel mål/revision/status');
  checkTime(report.date, start);
  exact(report.flows?.map(item => item.flow), BASELINE_FLOWS, 'baslinje');
  if (report.flows.some(item => item.status !== 'PASS')) throw new Error('baslinje: rött flöde');
  clean(report, 'baslinje');
  return { flows: BASELINE_FLOWS };
}
export function validatePhase4Browser(report) {
  const evidence = validateBrowserReport(report, { file: 'phase4-register.spec.ts', projects: ['protected-desktop', 'protected-phone', 'protected-built'], titles: BROWSER_TITLES });
  if (evidence.passed !== BROWSER_TITLES.length * 3) throw new Error('browser: extra eller dubbla fall');
  return evidence;
}
export function summarize(steps, head, fingerprint, startedAt, completedAt) {
  const required = Object.keys(REQUIREMENT_STEPS);
  const names = steps.map(item => item.name);
  const errors = [];
  if (new Set(names).size !== names.length) errors.push('dubbla steg');
  const start = Date.parse(startedAt), end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) errors.push('ogiltigt tidsintervall');
  for (const item of steps) {
    if (item.status === 'PASS' && (item.exit !== 0 || item.revision !== head || item.fingerprint !== fingerprint ||
      !Number.isFinite(Date.parse(item.producedAt)) || Date.parse(item.producedAt) < start || Date.parse(item.producedAt) > end)) errors.push(`${item.name}: gammalt eller felaktigt bevis`);
  }
  const requirements = required.map(id => {
    const evidence = REQUIREMENT_STEPS[id].map(name => ({ step: name, status: steps.find(item => item.name === name)?.status ?? 'MISSING' }));
    const status = evidence.some(item => item.status === 'FAIL') ? 'FAIL' : evidence.some(item => item.status !== 'PASS') ? 'BLOCKED' : 'PASS';
    return { id, evidence, status };
  });
  const status = errors.length || steps.some(item => item.status === 'FAIL') ? 'FAIL' :
    steps.some(item => item.status !== 'PASS') || requirements.some(item => item.status !== 'PASS') ? 'BLOCKED' : 'PASS';
  return { status, requirements, errors };
}
async function busy(port) { return new Promise(resolve => { const socket = net.connect({ host: '127.0.0.1', port }); const done = value => { socket.destroy(); resolve(value); }; socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.setTimeout(1000, () => done(false)); }); }
async function portsFree(ports) { const occupied = []; for (const port of ports) if (await busy(port)) occupied.push(port); return occupied.length ? `port ${occupied.join(', ')} används redan` : null; }
async function run(file, args, options = {}) {
  return new Promise(resolve => {
    const child = spawn(file, args, { cwd: options.cwd ?? web, env: options.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const output = chunk => { const value = chunk.toString(); tail = `${tail}${value}`.slice(-1000); process.stdout.write(value); };
    child.stdout.on('data', output); child.stderr.on('data', output);
    child.once('error', error => resolve({ exit: 1, tail: String(error.message) }));
    child.once('close', exit => resolve({ exit, tail }));
  });
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length > 2 || (args.length && (args[0] !== '--out' || !args[1]))) { console.error('REFUSED: endast --out <fil> tillåts'); process.exitCode = 1; return; }
  const out = args.length ? path.resolve(process.cwd(), args[1]) : defaultOut;
  const start = Date.now(), startedAt = new Date(start).toISOString(), head = revision(), fingerprint = sourceTreeFingerprint();
  const steps = [];
  const add = (name, status, exit, evidence = {}) => { steps.push({ name, status, exit, evidence, revision: head, fingerprint, producedAt: new Date().toISOString() }); console.log(`${name}: ${status}`); };
  const blocked = (name, reason) => add(name, 'BLOCKED', null, { reason: String(reason).slice(0, 180) });
  const step = async (name, file, argv, options = {}) => {
    console.log(`\n--- ${name}`);
    const result = await run(file, argv, options);
    let status = result.exit === 0 ? 'PASS' : result.exit === 3 || result.tail.includes('BLOCKED:') ? 'BLOCKED' : 'FAIL';
    let evidence = status === 'PASS' ? {} : { reason: result.tail.slice(-180) };
    if (status === 'PASS' && options.validate) try { evidence = options.validate(); } catch (error) { status = 'FAIL'; evidence = { validation: String(error.message).slice(0, 200) }; }
    add(name, status, status === 'FAIL' && result.exit === 0 ? 1 : result.exit, evidence);
  };
  if (Number(process.versions.node.split('.')[0]) === 25) add('node25', 'PASS', 0, { version: process.version });
  else blocked('node25', `Node 25 krävs; aktuell ${process.version}`);
  let protectedTarget, baselineTarget;
  try { protectedTarget = await assertTarget('protected', { requireIdp: true }); add('mål-protected', 'PASS', 0, { projectId: protectedTarget.projectId }); }
  catch (error) { blocked('mål-protected', error.message); }
  try { baselineTarget = await assertTarget('baseline'); add('mål-baseline', 'PASS', 0, { projectId: baselineTarget.projectId }); }
  catch (error) { blocked('mål-baseline', error.message); }
  const locked = fs.existsSync(path.join(web, 'dist-protected/server/.dev.vars.lock'));
  if (locked) blocked('preview-lås', 'byggd protected-preview håller låset; stoppa den före grinden');
  else add('preview-lås', 'PASS', 0);
  const tests = [path.join(web, 'lib'), path.join(web, 'lib/server')].flatMap(dir => fs.readdirSync(dir).filter(file => file.endsWith('.test.mjs')).sort().map(file => path.relative(web, path.join(dir, file))));
  await step('modeller', process.execPath, ['--test', ...tests]);
  await step('grind-unit', process.execPath, ['--test', 'scripts/verify-phase4.test.mjs', 'scripts/verify-phase3.test.mjs', 'scripts/verify-phase2.test.mjs', path.join(pilot, 'verify-register.test.mjs')]);
  await step('typkontroll', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
  await step('lint', path.join(web, 'node_modules/.bin/oxlint'), ['app', 'lib', 'scripts', 'e2e']);
  await step('lint-pilot', path.join(web, 'node_modules/.bin/oxlint'), ['work/pilot/verify-register.mjs', 'work/pilot/verify-register-locks.mjs', 'work/pilot/verify-mandates.mjs', 'work/pilot/verify-access.mjs', 'work/pilot/collect-denials.mjs'], { cwd: root });
  await step('normalt-bygge', process.execPath, ['scripts/run-mode.mjs', 'build', '--mode', 'example']);
  if (locked) blocked('protected-bygge', 'preview-lås');
  else await step('protected-bygge', process.execPath, ['scripts/run-mode.mjs', 'build', '--mode', 'protected'], { validate: () => {
    const mark = fresh(path.join(web, 'dist-protected/build-mode.json'), start);
    if (mark.mode !== 'protected' || mark.revision !== head) throw new Error('fel byggläge/revision');
    return { mode: mark.mode };
  } });
  if (fs.existsSync(path.join(root, '.planning/phases/04-best-ndigt-och-skyddat-elevregister/04-21-SUMMARY.md'))) {
    if (fs.existsSync(path.join(root, 'docs-site/node_modules'))) await step('docs-bygge', 'npm', ['run', 'docs:build'], { cwd: root });
    else blocked('docs-bygge', 'Docusaurus-beroenden saknas');
  }
  const fileStep = async (name, file, argv, reportFile, validator, options = {}) => {
    if (options.reason) { blocked(name, options.reason); return; }
    await step(name, file, argv, { cwd: root, validate: () => validator(fresh(reportFile, start)) });
  };
  await fileStep('baslinje-db', process.execPath, [path.join(pilot, 'verify-baseline-db.mjs')], path.join(results, 'baseline-db.json'), report => validateBaseline(report, baselineTarget, head, start), { reason: !baselineTarget && 'baseline-målet saknas' });
  if (protectedTarget) await step('audit-källa-konfig', process.execPath, [path.join(pilot, 'configure-audit-source.mjs'), '--target', 'protected'], { cwd: root });
  else blocked('audit-källa-konfig', 'protected-målet saknas');
  if (protectedTarget) await step('register-fixturer', process.execPath, [path.join(pilot, 'phase4-browser-fixtures.mjs'), '--target', 'protected'], { cwd: root });
  else blocked('register-fixturer', 'protected-målet saknas');
  // Samlings-SQL använder de syntetiska registerraderna från fixturen.
  await fileStep('sql', process.execPath, [path.join(pilot, 'run-sql-tests.mjs'), '--out', path.join(results, 'phase4-all-sql.json')], path.join(results, 'phase4-all-sql.json'), validateSql, { reason: !protectedTarget && 'protected-målet saknas' });
  const apiPorts = await portsFree([3013, 3014, 3046]);
  const apiReason = !protectedTarget ? 'protected-målet saknas' : locked ? 'preview-lås' : apiPorts;
  await fileStep('access-api', process.execPath, [path.join(pilot, 'verify-access.mjs'), '--out', path.join(results, 'phase4-access-regression.json')], path.join(results, 'phase4-access-regression.json'), report => {
    const value = validateAccessReport(report, { startedMs: start, revision: head });
    exact(report.cases.map(item => item.name), REQUIRED_ACCESS_CASES, 'access'); return value;
  }, { reason: apiReason });
  await fileStep('mandat-api', process.execPath, [path.join(pilot, 'verify-mandates.mjs'), '--out', path.join(results, 'phase4-mandates-regression.json')], path.join(results, 'phase4-mandates-regression.json'), report => validateApiReport(report, { startedMs: start, revision: head }), { reason: apiReason });
  if (apiReason) blocked('källbevis', apiReason);
  else try { add('källbevis', 'PASS', 0, validateSourceReport(fresh(path.join(results, 'phase4-denials-regression.json'), start), { startedMs: start })); }
  catch (error) { add('källbevis', 'FAIL', 1, { validation: String(error.message).slice(0, 200) }); }
  await fileStep('register-api', process.execPath, [path.join(pilot, 'verify-register.mjs'), '--out', path.join(results, 'phase4-api.json')], path.join(results, 'phase4-api.json'), report => validateRegister(report, { start, head }), { reason: apiReason });
  await fileStep('register-lås', process.execPath, [path.join(pilot, 'verify-register-locks.mjs')], path.join(results, 'phase4-register-locks.json'), validateLocks, { reason: !protectedTarget && 'protected-målet saknas' });
  const browserReason = !protectedTarget ? 'protected-målet saknas' : locked ? 'preview-lås' : await portsFree([5193, 3012]);
  // Ett redan rött obligatoriskt steg kan inte räddas av browserprovet.
  // Starta då inga nya provservrar, men redovisa uttryckligen att browserbevis saknas.
  if (steps.some(item => item.status !== 'PASS')) blocked('register-browser', 'tidigare obligatoriskt steg saknar PASS');
  else if (browserReason) blocked('register-browser', browserReason);
  else await step('register-browser', process.execPath, [path.join(web, 'node_modules/@playwright/test/cli.js'), 'test', '-c', 'playwright.protected.config.ts', 'phase4-register.spec.ts', '--project=protected-desktop', '--project=protected-phone', '--project=protected-built', '--reporter=list,json'], {
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(web, 'test-results/phase4-gate.json') },
    validate: () => validatePhase4Browser(fresh(path.join(web, 'test-results/phase4-gate.json'), start)),
  });
  const endHead = revision(), endFingerprint = sourceTreeFingerprint();
  if (endHead === head && endFingerprint === fingerprint) add('källstabilitet', 'PASS', 0);
  else add('källstabilitet', 'FAIL', 1, { reason: 'källträdet ändrades under körningen' });
  const completedAt = new Date().toISOString();
  const summary = summarize(steps, head, fingerprint, startedAt, completedAt);
  const report = { kind: 'phase4-summary', scope: 'local-synthetic-only', startedAt, completedAt, gitRevision: head,
    sourceTreeFingerprint: fingerprint, target: 'protected', steps, ...summary };
  if (cleanReport(report) === false) { report.status = 'FAIL'; report.errors.push('slutrapporten innehåller känsliga markörer'); }
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(`\nTotalstatus: ${report.status} → ${path.relative(root, out)}`);
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'BLOCKED' ? 3 : 1;
}
function cleanReport(report) { return !leak.test(JSON.stringify(report)); }
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
