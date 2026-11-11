// Plan16 release evidence. Read-only file/git validation; never imports installation or opens a database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLasarActualProof, validateLasarSqlEvidence } from './verify-lasar-package-sql.mjs';
import { bindCandidateSources, verificationSources as calendarVerificationSources } from './verify-lasar-actual.mjs';
import { verificationSources as tjanstVerificationSources } from './verify-tjanst-actual.mjs';
import { LASAR_ACTUAL_CASES, LASAR_ACTUAL_LOGIN_ROLES } from './lasar-oidc-fixtures.mjs';
import { TJANST_ACTUAL_CASES, TJANST_ACTUAL_LOGIN_ROLES } from './tjanst-oidc-fixtures.mjs';
import { productSources } from './apply-apl-plan.mjs';
import { TJANST_MIGRATION_REGISTRY, TJANST_PHASE_START } from './tjanst-migration-state.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const eq = (a, b, message) => assert.deepEqual(a, b, message);
const projects = ['desktop', 'desktop-small', 'phone', 'phone-small'];
const viewports = { desktop: { width: 1440, height: 900 }, 'desktop-small': { width: 1024, height: 768 },
  phone: { width: 390, height: 664 }, 'phone-small': { width: 320, height: 740 } };
export const LASAR_CALENDAR_IMAGES = Object.freeze(projects.flatMap(project => [
  `${project}-demo-calendar.png`, `${project}-protected-calendar.png`,
  ...(project.startsWith('phone') ? [`${project}-phone-selection.png`, `${project}-phone-sticky-october.png`, `${project}-phone-sticky-november.png`] : []),
]));
const pending = TJANST_MIGRATION_REGISTRY.filter(m => m.version > '20261111190000').map(m => m.file);
assert.equal(pending.length, 7);

function canonicalFile(file, { privateMode = true } = {}) {
  assert.equal(typeof file, 'string'); assert.ok(file.startsWith('/private/tmp/'));
  assert.equal(path.resolve(file), file); assert.equal(realpathSync(file), file, 'Evidence symlink refused');
  const info = lstatSync(file); assert.ok(info.isFile() && !info.isSymbolicLink());
  const parent = lstatSync(path.dirname(file));
  // Playwright's original raw JSON/PNGs are 0644 inside private 0700 directories.
  if (privateMode) assert.equal(info.mode & 0o077, 0, 'Private evidence file required');
  else assert.equal(parent.mode & 0o077, 0, 'Raw Playwright evidence requires a private parent directory');
  return info;
}
function readEvidence(file, { json = true, privateMode = true } = {}) {
  canonicalFile(file, { privateMode });
  const bytes = readFileSync(file);
  return { path: file, sha256: sha(bytes), privateMode, ...(json ? { value: JSON.parse(bytes.toString('utf8')) } : {}) };
}
function addFile(files, proof) {
  const previous = files.get(proof.path);
  if (previous) eq(previous, { path: proof.path, sha256: proof.sha256, privateMode: proof.privateMode });
  files.set(proof.path, { path: proof.path, sha256: proof.sha256, privateMode: proof.privateMode });
}
function assertPairs(report) {
  for (const [before, after] of [['sources', 'finalSources'], ['migrationSources', 'finalMigrationSources'],
    ['verificationSources', 'finalVerificationSources'], ['candidateSourceBinding', 'finalCandidateSourceBinding'],
    ['originalArtifact', 'finalOriginalArtifact'], ['targetJournal', 'finalTargetJournal'], ['targetFingerprint', 'finalTargetFingerprint']]) {
    assert.ok(report[before]); eq(report[before], report[after], `Changed ${before}`);
  }
  assert.equal(report.candidateSourceBinding.matched, true);
  assert.equal(report.finalExecutionCheckoutRevision, report.candidate.revision);
  eq(report.runtime?.artifact, report.originalArtifact, 'Tested runtime artifact differs');
  eq(report.finalArtifact, report.originalArtifact, 'Runtime artifact changed during test');
  eq(report.finalFingerprint, report.installedFingerprint); eq(report.finalGrants, report.grants);
}

export function assertTjanstActualProof(report) {
  assert.equal(report.kind, 'tjanst-actual-api-browser'); assert.equal(report.status, 'PASS'); assert.equal(report.fullSuite, true);
  assert.match(report.candidate?.revision, /^[0-9a-f]{40}$/u);
  assert.equal(report.build?.mode, 'protected'); assert.equal(report.build.revision, report.candidate.revision);
  assert.equal(report.sourceRevision, report.candidate.revision); assert.equal(report.executionCheckoutRevision, report.candidate.revision);
  assert.equal(report.playwright?.code, 0); eq(report.requiredCases, TJANST_ACTUAL_CASES); eq(report.projects, projects); eq(report.notExecuted, []);
  assert.equal(report.checks.length, 88); assert.ok(report.checks.every(c => c.ok === true));
  for (const [project, cases] of Object.entries(TJANST_ACTUAL_CASES)) {
    eq(report.casesPerProject[project], { required: cases.length, passed: cases.length });
    eq(report.checks.filter(c => c.project === project).map(c => c.case).sort(), [...cases].sort(), 'Missing or duplicate named SQL/Worker case');
  }
  eq(Object.values(report.casesPerProject).map(c => c.passed), [56, 13, 10, 9]);
  const outcome = report.playwrightOutcome;
  assert.equal(outcome.stats.expected, 23); assert.equal(outcome.stats.skipped, 53);
  assert.equal(outcome.stats.unexpected, 0); assert.equal(outcome.stats.flaky, 0); assert.equal(outcome.tests.length, 76);
  assert.equal(outcome.tests.filter(t => t.status === 'passed').length, 23);
  assert.equal(outcome.tests.filter(t => t.status === 'skipped' && t.expected === 'skipped').length, 53);
  assert.ok(outcome.tests.every(t => t.retries === 0 && (t.status === 'passed' || t.status === 'skipped' && t.expected === 'skipped')));
  for (const key of ['oidcCleanup', 'runtimeCleanup', 'snapshotCleanup']) assert.equal(report[key]?.cleanup, 'complete');
  for (const key of ['targetUnchanged', 'originalArtifactPreserved', 'buildCopyRemoved']) assert.equal(report[key], true);
  assert.equal(report.oidcCleanup.expectedFixtures, 4); assert.equal(report.oidcCleanup.verifiedCallbacks, 44);
  for (const key of ['failure', 'failureCode']) assert.equal(report[key], undefined);
  assertPairs(report);
}

export function assertActualPair(calendar, tjanst, candidate) {
  assertLasarActualProof(calendar); assertTjanstActualProof(tjanst);
  assert.equal(calendar.candidate.path, candidate); assert.equal(tjanst.candidate.path, candidate);
  eq(calendar.pendingMigrations, pending, 'Exactly seven approved pending migrations required');
  for (const key of ['originalArtifact', 'sources', 'migrationSources', 'candidate', 'targetFingerprint', 'targetJournal', 'pendingMigrations'])
    eq(calendar[key], tjanst[key], `Actual reports disagree on ${key}`);
  assert.equal(calendar.oidcCleanup.verifiedCallbacks, 36);
  assert.equal(calendar.oidcCleanup.expectedFixtures, 4);
  for (const key of ['failure', 'failureCode']) assert.equal(calendar[key], undefined);
  assertPairs(calendar);
}

export function playwrightSummary(raw, sha256) {
  const tests = [];
  const walk = suite => {
    for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) {
      const results = t.results ?? [];
      tests.push({ title: spec.title, project: t.projectName, status: results.length ? results.at(-1).status : 'notRun',
        retries: Math.max(0, results.length - 1), expected: t.expectedStatus });
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of raw.suites ?? []) walk(suite);
  return { stats: raw.stats, tests, sha256 };
}

/** Verify callback + server audit attestations, without returning identities, sessions or journal contents. */
export function assertOidcProject(proof, { project, roles, fixture, seenAudit = new Set(), seenCallback = new Set() }) {
  assert.equal(proof.status, 'PASS'); assert.equal(proof.databaseClosed, true);
  assert.equal(proof.cleanup?.cleanup, 'complete'); assert.equal(proof.proof?.cleanup, 'complete');
  assert.equal(fixture.cleanup, 'complete'); assert.equal(fixture.project, project);
  assert.equal(fixture.redirectRestored, true); assert.ok(fixture.deletedUsers > 0);
  const auth = proof.proof?.auth; assert.ok(Array.isArray(auth) && auth.length > 0);
  assert.equal(proof.cleanup.verifiedCallbacks, auth.length); assert.equal(fixture.verifiedCallbacks, auth.length);
  assert.equal(proof.cleanup.runId, fixture.runId); assert.equal(proof.proof.runId, fixture.runId);
  for (const a of auth) {
    assert.equal(a.status, 'verified'); assert.equal(a.proof?.proofKind, 'browser-return-and-server-audit');
    assert.equal(a.proof.attemptId, a.id);
    // WebKit may not expose the redirected response; source-bound fixture verifies browser return + new server audit.
    assert.ok(a.proof.httpStatus === null || Number.isInteger(a.proof.httpStatus) && a.proof.httpStatus >= 300 && a.proof.httpStatus < 400);
    for (const key of ['auditId', 'callbackId', 'sessionId']) assert.ok(typeof a.proof[key] === 'string' && a.proof[key].length > 0);
    assert.ok(!seenAudit.has(a.proof.auditId), 'Reused server audit'); seenAudit.add(a.proof.auditId);
    assert.ok(!seenCallback.has(a.proof.callbackId), 'Reused OIDC callback'); seenCallback.add(a.proof.callbackId);
  }
  for (const role of roles) assert.ok(auth.some(a => a.role === role && a.stepUp === false), 'Missing required real login role');
  return auth.length;
}

/** Every external browser/OIDC payload is checked against both bytes and the embedded report result. */
export function collectActualFiles(report, { cases, roles, read = readEvidence, files = new Map() }) {
  eq(Object.keys(report.browserEvidence).sort(), [...projects].sort()); eq(Object.keys(report.oidcEvidence).sort(), [...projects].sort());
  eq(report.oidcCleanup.fixtures.map(f => f.project).sort(), [...projects].sort());
  const screenshots = new Map(), rootChecks = [], seenAudit = new Set(), seenCallback = new Set(); let callbacks = 0;
  const browserDirs = new Set();
  for (const project of projects) {
    const browser = report.browserEvidence[project], oidc = report.oidcEvidence[project];
    assert.equal(path.basename(browser.path), `browser-${project}.json`); assert.equal(path.basename(oidc.path), `oidc-${project}.json`);
    const browserFile = read(browser.path); addFile(files, browserFile);
    assert.equal(browserFile.sha256, browser.sha256); eq(browserFile.value, browser.result, 'Embedded browser result differs');
    const result = browserFile.value; assert.equal(result.status, 'PASS'); assert.equal(result.project, project); eq(result.errors, []); eq(result.missing, []);
    eq(result.checks.map(c => c.case).sort(), [...cases[project]].sort()); assert.ok(result.checks.every(c => c.ok === true));
    rootChecks.push(...result.checks.map(c => ({ ...c, project, name: `${project}: ${c.name}` })));
    assert.equal(result.browser.name, project.startsWith('phone') ? 'webkit' : 'chromium'); eq(result.browser.viewport, viewports[project]);
    assert.ok(typeof result.browser.version === 'string' && result.browser.version.length > 0); eq(result.browser, report.browsers[project]);
    assert.equal(result.foreignCanary?.unchanged, true); eq(result.foreignCanary.before, result.foreignCanary.after);
    eq(result.foreignCanary, report.foreignCanary[project]);
    const dir = path.dirname(browser.path); browserDirs.add(dir); assert.equal(path.dirname(oidc.path), dir);
    const pictureHashes = {};
    for (const picture of result.screenshots) {
      assert.equal(path.basename(picture.file), picture.file); assert.ok(picture.file.startsWith(project + '-') && picture.file.endsWith('.png'));
      assert.ok(!screenshots.has(picture.file), 'Duplicate screenshot');
      const file = read(path.join(dir, picture.file), { json: false, privateMode: false }); addFile(files, file);
      assert.equal(file.sha256, picture.sha256); pictureHashes[picture.file] = file.sha256;
      screenshots.set(picture.file, { path: file.path, sha256: file.sha256 });
    }
    eq(pictureHashes, browser.screenshotHashes);
    const oidcFile = read(oidc.path); addFile(files, oidcFile); assert.equal(oidcFile.sha256, oidc.sha256); eq(oidcFile.value, oidc.result);
    eq(oidc.requiredRoles, roles[project]);
    const fixture = report.oidcCleanup.fixtures.find(f => f.project === project);
    callbacks += assertOidcProject(oidcFile.value, { project, roles: roles[project], fixture, seenAudit, seenCallback });
  }
  eq(rootChecks, report.checks); assert.equal(callbacks, report.oidcCleanup.verifiedCallbacks); assert.equal(browserDirs.size, 1);
  const directory = [...browserDirs][0], raw = read(path.join(directory, 'playwright-actual.json'), { privateMode: false }); addFile(files, raw);
  eq(playwrightSummary(raw.value, raw.sha256), report.playwrightOutcome, 'Raw Playwright report differs from summary');
  assert.equal(report.playwright.log, path.join(directory, 'playwright.log'));
  addFile(files, read(report.playwright.log, { json: false }));
  return { screenshots, callbacks, files };
}

export function assertVisualReview(review, candidateRevision, screenshots) {
  assert.equal(review.status, 'reviewed'); assert.equal(review.candidate, candidateRevision);
  assert.equal(screenshots.size, 14); assert.equal(review.images?.length, 14);
  eq([...screenshots.keys()].sort(), [...LASAR_CALENDAR_IMAGES].sort(), 'Unexpected calendar original image inventory');
  assert.equal(new Set(review.images.map(i => i.file)).size, 14, 'Duplicate visual attestation');
  eq(review.images.map(i => i.file).sort(), [...screenshots.keys()].sort(), 'Foreign or missing screenshot attestation');
  for (const item of review.images) {
    assert.equal(item.reviewed, true); assert.equal(item.sha256, screenshots.get(item.file).sha256, 'Visual attestation hash differs');
  }
  return { reviewed: true, count: 14, candidateRevision };
}

function assertSourceBytes(report, expectedVerification) {
  eq(report.sources, productSources()); eq(report.verificationSources, expectedVerification);
  const migrations = Object.fromEntries(readdirSync(path.join(ROOT, 'supabase/migrations')).filter(f => /^\d{14}_[a-z0-9_]+\.sql$/u.test(f) && f.slice(0, 14) >= TJANST_PHASE_START).sort()
    .map(f => [`supabase/migrations/${f}`, sha(readFileSync(path.join(ROOT, 'supabase/migrations', f)))]));
  eq(migrations, report.migrationSources);
  const binding = bindCandidateSources(report.candidate.revision, report.sources, report.migrationSources, report.verificationSources);
  eq(binding, report.candidateSourceBinding);
  for (const inventory of [report.sources, report.migrationSources, report.verificationSources]) for (const [file, hash] of Object.entries(inventory)) {
    assert.ok(!/\/(?:\.env(?:\.|$)|oidc-private\.json)/u.test('/' + file));
    assert.equal(sha(readFileSync(path.join(ROOT, file))), hash, 'Current evidence source bytes changed');
  }
}

/** Rehash all accepted files. This intentionally returns no parsed evidence or person/session rows. */
export function assertEvidenceFilesUnchanged(evidence) {
  assert.ok(Array.isArray(evidence.files) && evidence.files.length > 0);
  assert.equal(new Set(evidence.files.map(f => f.path)).size, evidence.files.length, 'Duplicate evidence file');
  for (const file of evidence.files) {
    const current = readEvidence(file.path, { json: false, privateMode: file.privateMode !== false });
    assert.equal(current.sha256, file.sha256, 'Release evidence file bytes changed');
  }
  return true;
}

export async function validateLasarReleaseEvidence({ candidate, actual, tjanstActual, visualReview, sqlEvidence }) {
  const files = new Map(), cal = readEvidence(actual), tjanst = readEvidence(tjanstActual), visual = readEvidence(visualReview);
  for (const proof of [cal, tjanst, visual]) addFile(files, proof);
  assertActualPair(cal.value, tjanst.value, candidate);
  assertSourceBytes(cal.value, calendarVerificationSources()); assertSourceBytes(tjanst.value, tjanstVerificationSources());
  const calendar = collectActualFiles(cal.value, { cases: LASAR_ACTUAL_CASES, roles: LASAR_ACTUAL_LOGIN_ROLES, files });
  const regression = collectActualFiles(tjanst.value, { cases: TJANST_ACTUAL_CASES, roles: TJANST_ACTUAL_LOGIN_ROLES, files });
  const visualProof = assertVisualReview(visual.value, cal.value.candidate.revision, calendar.screenshots);
  const sql = await validateLasarSqlEvidence({ file: sqlEvidence, actual, candidate });
  const sqlFile = readEvidence(sqlEvidence); addFile(files, sqlFile); assert.equal(sqlFile.sha256, sql.sha256);
  for (const row of sql.manifest.suites) {
    const report = readEvidence(row.reportFile); addFile(files, report); assert.equal(report.sha256, row.reportSha256);
    addFile(files, readEvidence(row.logFile, { json: false }));
  }
  const evidence = { candidateRevision: cal.value.candidate.revision, candidate, artifact: cal.value.originalArtifact,
    productSources: cal.value.sources, migrationSources: cal.value.migrationSources, pendingMigrations: cal.value.pendingMigrations,
    targetFingerprint: cal.value.targetFingerprint, targetJournal: cal.value.targetJournal,
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)), sqlBinding: sql.binding,
    visual: visualProof, counts: { calendar: cal.value.checks.length, tjanst: tjanst.value.checks.length,
      calendarCallbacks: calendar.callbacks, tjanstCallbacks: regression.callbacks, screenshots: calendar.screenshots.size + regression.screenshots.size } };
  assertEvidenceFilesUnchanged(evidence);
  return evidence;
}
