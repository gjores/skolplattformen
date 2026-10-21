#!/usr/bin/env node
// 05.1-09: faktiskt Worker + OIDC + PostgreSQL + webbläsarprov av tjänstefördelningen på dator och telefon.
// Bygger inget själv. Kandidaten är en ren checkout av en commit i /private/tmp/tjanst-candidate, byggd med
// `npm ci` och `npm run build:protected` i web/. Provet kopierar bygget till en egen runtime-katalog, startar en egen
// Worker på 127.0.0.1:3015 och egen GoTrue mot en egen schemakopia (bara schema, inga rader) med fasens migrationer,
// kör Playwright med privat manifest och städar OIDC-användare, Worker, GoTrue och schemakopian. Aldrig den skyddade
// lokala databasen, aldrig 3012 och ingen installation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, cpSync, openSync, closeSync, realpathSync, rmSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createNamedTimplanSnapshot, schemaFingerprint } from './named-timplan-snapshot.mjs';
import { createNamedTimplanRuntime } from './named-timplan-runtime.mjs';
import { recoverTjanstOidcFixture, TJANST_ACTUAL_BASE, TJANST_ACTUAL_CASES, TJANST_ACTUAL_PROJECTS } from './tjanst-oidc-fixtures.mjs';
import { tjanstMigrations } from './tjanst-fixtures.mjs';
import { artifactManifest } from './verify-programplan-copy-api.mjs';
import { productSources, sha } from './apply-apl-plan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(path.join(root, 'web/package.json'));
export const CANDIDATE = '/private/tmp/tjanst-candidate';
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const migrationSources = () => Object.fromEntries(tjanstMigrations.map(p => [p, sha(readFileSync(path.join(root, p)))]));
const verificationFiles = ['work/pilot/verify-tjanst-actual.mjs', 'work/pilot/tjanst-oidc-fixtures.mjs',
  'web/playwright.tjanst-actual.config.ts', 'web/e2e/tjanst-actual.spec.ts'];
/** De tolv öppna entrypointsen: tio för tjänstefördelningen och GR/IM-kopplingens två. */
export const WORKER_ENTRYPOINTS = ['phase51_grim_class_command(jsonb)', 'phase51_grim_class_underlag(jsonb)',
  'tjanst_personal_command(jsonb)', 'tjanst_personal_read(jsonb)', 'tjanst_personal_status(jsonb)',
  'tjanst_plan_command(jsonb)', 'tjanst_plan_read(jsonb)', 'tjanst_plan_status(jsonb)',
  'tjanst_self_command(jsonb)', 'tjanst_self_read(jsonb)', 'tjanst_self_status(jsonb)', 'tjanst_staffing_read(jsonb)'];
const PHASE_TABLES = ['staff_people', 'staff_employments', 'staff_school_duties', 'staff_person_bindings'];

function verificationSources() {
  const files = new Set(), ts = require('typescript');
  const include = file => {
    assert.ok(!path.isAbsolute(file) && !file.split('/').includes('..')); if (files.has(file)) return;
    const absolute = path.join(root, file); assert.ok(existsSync(absolute), 'Missing verification dependency: ' + file); files.add(file);
    const syntax = ts.createSourceFile(absolute, readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of syntax.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
      const specifier = statement.moduleSpecifier; if (!specifier || !ts.isStringLiteral(specifier) || !specifier.text.startsWith('.')) continue;
      const dependency = path.relative(root, path.resolve(path.dirname(absolute), specifier.text));
      if (/\.(?:mjs|js|ts|tsx)$/u.test(dependency)) include(dependency);
      else if (!path.extname(dependency)) { const resolved = ['.ts', '.tsx', '.mjs', '.js'].map(ext => dependency + ext).find(p => existsSync(path.join(root, p))); if (resolved) include(resolved); }
    }
  };
  verificationFiles.forEach(include);
  return Object.fromEntries([...files].sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(file => [file, sha(readFileSync(path.join(root, file)))]));
}

/** Worker-rollens och klientrollernas rättigheter på fasens funktioner och tabeller i schemakopian. */
export async function workerGrants(db) {
  const functions = await db`select p.oid::regprocedure::text signature,
    has_function_privilege('skolplattform_worker',p.oid,'EXECUTE') worker,
    has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
    has_function_privilege('service_role',p.oid,'EXECUTE') service_role,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute
   from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'tjanst\\_%' or p.proname like 'phase51\\_%') order by 1`;
  const tables = await db`select c.relname,r.role,
    has_table_privilege(r.role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') any_privilege
   from pg_class c cross join (values ('skolplattform_worker'),('anon'),('authenticated'),('service_role')) r(role)
   where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S') and (c.relname like 'tjanst\\_%' or c.relname = any(${PHASE_TABLES}))
   order by 1,2`;
  const publicTables = await db`select c.relname from pg_class c where c.relnamespace='public'::regnamespace and (c.relname like 'tjanst\\_%' or c.relname = any(${PHASE_TABLES}))
   and exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0) order by 1`;
  const open = functions.filter(f => f.worker).map(f => f.signature.replace(/^public\./u, '')).sort();
  return {
    workerExecute: open, workerExecuteCount: open.length, functionCount: functions.length,
    closedFunctions: functions.filter(f => !f.worker).length,
    clientRoleExecute: functions.filter(f => f.anon || f.authenticated || f.service_role || f.public_execute).map(f => f.signature),
    tablePrivileges: tables.filter(t => t.any_privilege).map(t => t.relname + ':' + t.role),
    tablesChecked: [...new Set(tables.map(t => t.relname))],
    publicTablePrivileges: publicTables.map(t => t.relname),
  };
}

async function runPlaywright(evidenceDir, manifestPath, baseURL, projects) {
  const log = path.join(evidenceDir, 'playwright.log'), fd = openSync(log, 'wx', 0o600);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'web/node_modules/@playwright/test/cli.js'), 'test', '-c', 'playwright.tjanst-actual.config.ts', ...projects.flatMap(p => ['--project', p])], {
        cwd: path.join(root, 'web'), stdio: ['ignore', fd, fd], env: { ...process.env, PHASE5_BASE_URL: baseURL, TJANST_ACTUAL_MANIFEST: manifestPath, TJANST_ACTUAL_EVIDENCE_DIR: evidenceDir } });
      child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal, log }));
    });
  } finally { closeSync(fd); }
}

/** Sammanställer Playwrights JSON-rapport: körda, godkända, misslyckade och ej körda fall per projekt. */
function playwrightOutcome(evidenceDir) {
  const file = path.join(evidenceDir, 'playwright-actual.json'); if (!existsSync(file)) return null;
  const report = JSON.parse(readFileSync(file, 'utf8')), tests = [];
  const walk = suite => { for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) { const results = t.results ?? [];
    tests.push({ title: spec.title, project: t.projectName, status: results.length ? results.at(-1).status : 'notRun', retries: Math.max(0, results.length - 1), expected: t.expectedStatus }); }
    for (const child of suite.suites ?? []) walk(child); };
  for (const suite of report.suites ?? []) walk(suite);
  return { stats: report.stats, tests, sha256: sha(readFileSync(file)) };
}

/** Kontrollerar att kandidaten är en ren checkout av en commit vars produktkällor är identiska med HEAD. */
function candidateProof(originalBuild, mark) {
  assert.equal(originalBuild, path.join(CANDIDATE, 'web/dist-protected'), 'Bara kandidaten i /private/tmp/tjanst-candidate är tillåten');
  const revision = git(['rev-parse', 'HEAD'], CANDIDATE);
  assert.equal(revision, mark.revision, 'Byggets revision är inte kandidatens checkout');
  assert.equal(git(['status', '--porcelain', '--untracked-files=no'], CANDIDATE), '', 'Kandidatens checkout har ändringar');
  assert.equal(git(['diff', '--name-only', mark.revision, 'HEAD', '--', 'web/app', 'web/lib', 'web/components', 'web/hooks', 'web/scripts', 'web/package.json', 'web/package-lock.json', 'web/vite.config.ts', 'web/vinext.config.ts']), '',
    'Kandidatens produktkällor skiljer sig från aktuell commit');
  return { path: CANDIDATE, revision, build: originalBuild, mark, rebuild: `git clone --no-hardlinks <repo> ${CANDIDATE} && git -C ${CANDIDATE} checkout ${revision} && cd ${CANDIDATE}/web && npm ci && npm run build:protected` };
}

export async function verifyTjanstActual({ build, out, projects = TJANST_ACTUAL_PROJECTS }) {
  const originalBuild = realpathSync(build); out = path.resolve(out);
  assert.ok(out.startsWith('/private/tmp/') && out.endsWith('.json')); assert.equal(existsSync(out), false);
  assert.ok(projects.length && projects.every(p => TJANST_ACTUAL_PROJECTS.includes(p)));
  const evidenceDir = out.slice(0, -5) + '-evidence'; mkdirSync(evidenceDir, { mode: 0o700 }); chmodSync(evidenceDir, 0o700);
  const mark = JSON.parse(readFileSync(path.join(originalBuild, 'build-mode.json'), 'utf8')); assert.equal(mark.mode, 'protected');
  const candidate = candidateProof(originalBuild, mark);
  const initialSources = productSources(), initialMigrations = migrationSources(), initialVerification = verificationSources();
  const buildRoot = path.join(root, 'work/pilot/targets/protected/runtime/tjanst-' + randomUUID());
  cpSync(originalBuild, buildRoot, { recursive: true, filter: p => !p.endsWith('/.dev.vars') });
  const report = { kind: 'tjanst-actual-api-browser', status: 'FAIL', startedAt: new Date().toISOString(), build: mark, candidate,
    sourceRevision: git(['rev-parse', 'HEAD']), sources: initialSources, migrationSources: initialMigrations, verificationSources: initialVerification,
    projects, browserEvidence: {}, checks: [], notExecuted: [],
    limits: ['Egen schemakopia utan rader och bara syntetiska identiteter, skolor, klasser och personal; inga verkliga rader kopieras och inget skrivs i den skyddade databasen eller på 3012',
      'Ingen installation; migrationerna installeras bara i schemakopian', 'Inga autentiserings-, verksamhets- eller transportattrapper utom två märkta transportfel: ett svar som tappas efter riktig Worker-200 och en fördröjd läsning för laddningstillståndet',
      'SS 12000: provet bekräftar bara intern lagring (heltalsandelar, stabila Person- och klass-ID, åtskilda behovs- och lärarminuter); inget informationsutbyte med en motpart provas',
      'Telefonprojekten läser en version som är förberedd i schemakopian med samma SQL-kommandon som Worker anropar; redigering finns bara på dator (D-15)',
      'Retries 0, en Playwright-worker'] };
  const save = () => writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); save();
  let snapshot, runtime, failure;
  try {
    snapshot = await createNamedTimplanSnapshot(); report.snapshot = snapshot.provenance; save();
    report.baselineFingerprint = await schemaFingerprint(snapshot.db);
    await snapshot.db.begin(async tx => { for (const p of tjanstMigrations) await tx.unsafe(readFileSync(path.join(root, p), 'utf8')); await tx`set constraints all immediate`; });
    report.installedFingerprint = await schemaFingerprint(snapshot.db); assert.notEqual(report.installedFingerprint, report.baselineFingerprint);
    report.grants = await workerGrants(snapshot.db); save();
    assert.deepEqual(report.grants.workerExecute, [...WORKER_ENTRYPOINTS].sort(), 'Worker ska ha exakt tolv öppna entrypoints');
    assert.deepEqual(report.grants.clientRoleExecute, [], 'Inga funktioner får vara öppna för public, anon, authenticated eller service_role');
    assert.deepEqual(report.grants.tablePrivileges, [], 'Inga tabellrättigheter för Worker eller klientroller');
    assert.deepEqual(report.grants.publicTablePrivileges, [], 'Inga tabellrättigheter för public');
    runtime = await createNamedTimplanRuntime({ snapshot, buildRoot, evidenceDir, port: 3015, prefix: 'tjanst' });
    report.runtime = runtime.proof; assert.equal(runtime.baseURL, TJANST_ACTUAL_BASE); save();
    const manifestPath = path.join(evidenceDir, 'browser-manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ kind: 'tjanst-actual-owned-runtime', baseURL: runtime.baseURL, provenance: snapshot.provenance, projects }), { mode: 0o600, flag: 'wx' });
    report.playwright = await runPlaywright(evidenceDir, manifestPath, runtime.baseURL, projects); save();
    report.playwrightOutcome = playwrightOutcome(evidenceDir);
    for (const project of projects) {
      const file = path.join(evidenceDir, `browser-${project}.json`); if (!existsSync(file)) continue;
      const result = JSON.parse(readFileSync(file, 'utf8'));
      report.browserEvidence[project] = { path: file, sha256: sha(readFileSync(file)), result, visualReview: 'pending',
        screenshotHashes: Object.fromEntries(result.screenshots.map(s => [s.file, sha(readFileSync(path.join(evidenceDir, s.file)))])) };
      report.checks.push(...result.checks.map(c => ({ ...c, project, name: project + ': ' + c.name })));
    }
    for (const project of projects) for (const name of TJANST_ACTUAL_CASES[project]) {
      const check = report.checks.find(c => c.project === project && c.case === name);
      if (!check) report.notExecuted.push({ project, case: name, status: 'ej kört' });
    }
    report.casesPerProject = Object.fromEntries(projects.map(p => [p, { required: TJANST_ACTUAL_CASES[p].length, passed: report.checks.filter(c => c.project === p && c.ok === true).length }]));
    save();
    assert.equal(report.playwright.code, 0, 'Faktiskt webbläsarfel; se den privata Playwright-loggen');
    assert.ok(report.playwrightOutcome && report.playwrightOutcome.tests.every(t => t.status === 'passed' && t.retries === 0), 'Alla fall ska vara godkända utan omprov');
    for (const project of projects) assert.equal(report.browserEvidence[project]?.result.status, 'PASS', 'Projektet ' + project + ' är inte godkänt');
    assert.deepEqual(report.notExecuted, [], 'Fall saknas i rapporten');
    report.finalFingerprint = await schemaFingerprint(snapshot.db); assert.equal(report.finalFingerprint, report.installedFingerprint);
    report.finalGrants = await workerGrants(snapshot.db); assert.deepEqual(report.finalGrants, report.grants);
    report.finalSources = productSources(); report.finalMigrationSources = migrationSources(); report.finalVerificationSources = verificationSources(); report.finalArtifact = artifactManifest(buildRoot);
    assert.deepEqual(report.finalSources, initialSources); assert.deepEqual(report.finalMigrationSources, initialMigrations); assert.deepEqual(report.finalVerificationSources, initialVerification); assert.deepEqual(report.finalArtifact, runtime.proof.artifact);
    report.status = 'PASS';
  } catch (error) { failure = error; report.failureCode = error.code ?? 'ASSERTION'; report.failure = error.message; writeFileSync(path.join(evidenceDir, 'failure.txt'), String(error.stack), { mode: 0o600 }); }
  finally {
    const oidc = [], journals = [];
    for (const project of projects) {
      const file = path.join(evidenceDir, `oidc-${project}.json`), journal = path.join(evidenceDir, 'oidc-' + project, 'oidc-private.json');
      if (!existsSync(journal)) continue; journals.push(project);
      const proof = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
      if (proof?.cleanup?.cleanup === 'complete') oidc.push({ project, ...proof.cleanup });
      else try { oidc.push({ project, ...(await recoverTjanstOidcFixture(journal)) }); } catch (error) { failure ??= error; oidc.push({ project, cleanup: 'failed', code: error.code ?? 'cleanup' }); }
    }
    report.oidcCleanup = { cleanup: oidc.length === journals.length && oidc.every(p => p.cleanup === 'complete') ? 'complete' : 'incomplete', expectedFixtures: journals.length,
      verifiedCallbacks: oidc.reduce((sum, p) => sum + (p.verifiedCallbacks ?? 0), 0), fixtures: oidc };
    for (const [key, object] of [['runtimeCleanup', runtime], ['snapshotCleanup', snapshot]]) if (object) try { report[key] = await object.cleanup(); } catch (error) { report[key] = { cleanup: 'failed', code: error.code ?? 'cleanup' }; failure ??= error; report.status = 'FAIL'; }
    try { rmSync(buildRoot, { recursive: true, force: true }); report.buildCopyRemoved = !existsSync(buildRoot); } catch { report.buildCopyRemoved = false; }
    if (report.oidcCleanup.cleanup !== 'complete' || report.runtimeCleanup?.cleanup !== 'complete' || report.snapshotCleanup?.cleanup !== 'complete') report.status = 'FAIL';
    report.evidenceFiles = readdirSync(evidenceDir).sort();
    report.finishedAt = new Date().toISOString(); save();
  }
  console.log(`${report.status}: ${report.checks.length} faktiska kontroller av tjänstefördelningen i ${projects.length} projekt, ${report.notExecuted.length} ej körda; privat rapport ${out}`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); assert.deepEqual([args[0], args[2]], ['--build', '--out'], 'Använd --build <dir> --out /private/tmp/<namn>.json'); assert.equal(args.length, 4);
  const report = await verifyTjanstActual({ build: args[1], out: args[3] }); if (report.status !== 'PASS') process.exitCode = 1;
}
