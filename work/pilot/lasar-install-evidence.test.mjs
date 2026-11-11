import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assertActualPair, assertTjanstActualProof, assertOidcProject, collectActualFiles,
  assertVisualReview, assertEvidenceFilesUnchanged, LASAR_CALENDAR_IMAGES, playwrightSummary } from './lasar-install-evidence.mjs';
import { LASAR_ACTUAL_CASES, LASAR_ACTUAL_LOGIN_ROLES } from './lasar-oidc-fixtures.mjs';
import { TJANST_ACTUAL_CASES } from './tjanst-oidc-fixtures.mjs';
import { TJANST_MIGRATION_REGISTRY } from './tjanst-migration-state.mjs';

const clone = x => structuredClone(x), revision = 'a'.repeat(40), candidate = '/private/tmp/lasar-candidate';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const projects = Object.keys(LASAR_ACTUAL_CASES);
function baseReport(cases, kind) {
  const same = { sha256: 'b'.repeat(64) }, total = Object.values(cases).flat().length;
  const r = { kind, status: 'PASS', fullSuite: true, candidate: { path: candidate, revision }, build: { mode: 'protected', revision },
    sourceRevision: revision, executionCheckoutRevision: revision, requiredCases: cases, projects, notExecuted: [],
    casesPerProject: Object.fromEntries(Object.entries(cases).map(([p, c]) => [p, { required: c.length, passed: c.length }])),
    checks: Object.entries(cases).flatMap(([project, cs]) => cs.map(name => ({ case: name, name: `${project}: ${name}`, project, ok: true }))),
    playwright: { code: 0 }, playwrightOutcome: { stats: { expected: 4, skipped: 0, unexpected: 0, flaky: 0 },
      tests: Array.from({ length: 4 }, () => ({ status: 'passed', retries: 0, expected: 'passed' })) },
    oidcCleanup: { cleanup: 'complete', expectedFixtures: 4, verifiedCallbacks: 36 },
    runtimeCleanup: { cleanup: 'complete' }, snapshotCleanup: { cleanup: 'complete' },
    targetUnchanged: true, originalArtifactPreserved: true, buildCopyRemoved: true,
    pendingMigrations: TJANST_MIGRATION_REGISTRY.filter(m => m.version > '20261111190000').map(m => m.file) };
  assert.ok(total > 0);
  for (const [a, b] of [['sources', 'finalSources'], ['migrationSources', 'finalMigrationSources'],
    ['verificationSources', 'finalVerificationSources'], ['originalArtifact', 'finalOriginalArtifact'],
    ['targetJournal', 'finalTargetJournal'], ['targetFingerprint', 'finalTargetFingerprint']]) r[a] = r[b] = same;
  r.candidateSourceBinding = r.finalCandidateSourceBinding = { matched: true };
  r.finalExecutionCheckoutRevision = revision; r.runtime = { artifact: r.originalArtifact }; r.finalArtifact = r.originalArtifact;
  r.finalFingerprint = r.installedFingerprint = 'schema'; r.finalGrants = r.grants = { worker: 'closed-by-default' };
  return r;
}
function pair() {
  const calendar = baseReport(LASAR_ACTUAL_CASES, 'lasar-actual-api-browser');
  const tjanst = baseReport(TJANST_ACTUAL_CASES, 'tjanst-actual-api-browser');
  tjanst.playwrightOutcome.stats.expected = 23; tjanst.playwrightOutcome.stats.skipped = 53;
  tjanst.playwrightOutcome.tests = Array.from({ length: 76 }, (_, i) => ({ status: i < 23 ? 'passed' : 'skipped', expected: i < 23 ? 'passed' : 'skipped', retries: 0 }));
  tjanst.oidcCleanup.verifiedCallbacks = 44;
  return { calendar, tjanst };
}
function oidc(project, roles) {
  const fixture = { project, cleanup: 'complete', runId: project, verifiedCallbacks: roles.length, deletedUsers: roles.length, redirectRestored: true };
  const proof = { status: 'PASS', databaseClosed: true, cleanup: { ...fixture }, proof: { runId: project, cleanup: 'complete',
    auth: roles.map((role, i) => ({ id: `${project}-${i}`, role, status: 'verified', stepUp: false,
      proof: { proofKind: 'browser-return-and-server-audit', attemptId: `${project}-${i}`, callbackId: `${project}-callback-${i}`,
        auditId: `${project}-audit-${i}`, sessionId: `${project}-session-${i}`, httpStatus: 302 } })) } };
  return { fixture, proof };
}
function browserFixture() {
  const { calendar: report } = pair(), map = new Map(), images = [], dir = '/private/tmp/test-browser-evidence';
  report.browserEvidence = {}; report.oidcEvidence = {}; report.browsers = {}; report.foreignCanary = {}; report.checks = [];
  report.oidcCleanup.fixtures = []; report.oidcCleanup.verifiedCallbacks = 0;
  const raw = { stats: { expected: 4, skipped: 0, unexpected: 0, flaky: 0 }, suites: [] };
  const put = (file, value, privateMode = true) => {
    const proof = { path: file, sha256: sha(JSON.stringify(value)), privateMode, value }; map.set(file, proof); return proof;
  };
  for (const project of projects) {
    const checks = LASAR_ACTUAL_CASES[project].map(name => ({ case: name, name, ok: true }));
    const screenshots = LASAR_CALENDAR_IMAGES.filter(file => file.startsWith(project + '-') && (project !== 'phone' || !file.startsWith('phone-small-')) && (project !== 'desktop' || !file.startsWith('desktop-small-')))
      .map(file => { const p = put(path.join(dir, file), 'symbolic image', false); images.push([file, { path: p.path, sha256: p.sha256 }]); return { file, sha256: p.sha256 }; });
    const browser = { name: project.startsWith('phone') ? 'webkit' : 'chromium', version: 'test-version', viewport: {
      desktop: { width: 1440, height: 900 }, 'desktop-small': { width: 1024, height: 768 }, phone: { width: 390, height: 664 }, 'phone-small': { width: 320, height: 740 },
    }[project] };
    const result = { status: 'PASS', project, checks, screenshots, errors: [], missing: [], browser,
      foreignCanary: { unchanged: true, before: { sha256: 'foreign' }, after: { sha256: 'foreign' } } };
    const file = put(`${dir}/browser-${project}.json`, result);
    report.browserEvidence[project] = { path: file.path, sha256: file.sha256, result, screenshotHashes: Object.fromEntries(screenshots.map(s => [s.file, s.sha256])) };
    report.browsers[project] = browser; report.foreignCanary[project] = result.foreignCanary;
    report.checks.push(...checks.map(c => ({ ...c, project, name: `${project}: ${c.name}` })));
    const { fixture, proof } = oidc(project, LASAR_ACTUAL_LOGIN_ROLES[project]);
    report.oidcCleanup.fixtures.push(fixture); report.oidcCleanup.verifiedCallbacks += fixture.verifiedCallbacks;
    const o = put(`${dir}/oidc-${project}.json`, proof);
    report.oidcEvidence[project] = { path: o.path, sha256: o.sha256, result: proof, requiredRoles: LASAR_ACTUAL_LOGIN_ROLES[project] };
    raw.suites.push({ specs: [{ title: 'calendar', tests: [{ projectName: project, expectedStatus: 'passed', results: [{ status: 'passed' }] }] }] });
  }
  const pw = put(`${dir}/playwright-actual.json`, raw, false); report.playwrightOutcome = playwrightSummary(raw, pw.sha256);
  report.playwright.log = `${dir}/playwright.log`; put(report.playwright.log, 'symbolic log');
  return { report, map, read: file => { assert.ok(map.has(file)); return clone(map.get(file)); }, images: new Map(images) };
}

test('exact full regression is accepted; skipped named cases, duplicate checks, retries, failed cleanup and another candidate are refused', () => {
  const { tjanst } = pair(); assertTjanstActualProof(tjanst);
  for (const change of [r => r.checks.pop(), r => { r.checks[0] = r.checks[1]; }, r => { r.playwrightOutcome.tests[0].retries = 1; },
    r => { r.playwrightOutcome.stats.skipped = 54; }, r => { r.oidcCleanup.cleanup = 'incomplete'; }, r => { r.candidate.revision = 'c'.repeat(40); },
    r => { r.oidcCleanup.verifiedCallbacks = 43; }]) {
    const r = clone(tjanst); change(r); assert.throws(() => assertTjanstActualProof(r));
  }
});
test('release refuses divergent actual artifact, migrations, target journal, or pending package', () => {
  const { calendar, tjanst } = pair(); assertActualPair(calendar, tjanst, candidate);
  for (const key of ['originalArtifact', 'sources', 'migrationSources', 'targetJournal', 'targetFingerprint', 'pendingMigrations']) {
    const t = clone(tjanst); t[key] = { changed: true }; assert.throws(() => assertActualPair(calendar, t, candidate));
  }
  assert.throws(() => assertActualPair(calendar, tjanst, '/private/tmp/other-candidate'));
});
test('OIDC requires browser return, server audit, unique callbacks, matching attempt and real login per role', () => {
  const { fixture, proof } = oidc('desktop', ['hm', 'principalA']);
  assert.equal(assertOidcProject(proof, { fixture, project: 'desktop', roles: ['hm', 'principalA'] }), 2);
  const webkit = clone(proof); webkit.proof.auth[0].proof.httpStatus = null;
  assert.equal(assertOidcProject(webkit, { fixture, project: 'desktop', roles: ['hm', 'principalA'] }), 2);
  for (const mutate of [p => { p.proof.auth[0].proof.proofKind = 'simulated'; }, p => { p.proof.auth[0].proof.attemptId = 'other'; },
    p => { p.proof.auth[1].proof.callbackId = p.proof.auth[0].proof.callbackId; }, p => { p.proof.auth[1].proof.auditId = p.proof.auth[0].proof.auditId; },
    p => { p.proof.auth[1].stepUp = true; }, p => { p.proof.auth[0].proof.httpStatus = 403; }]) {
    const p = clone(proof); mutate(p); assert.throws(() => assertOidcProject(p, { fixture, project: 'desktop', roles: ['hm', 'principalA'] }));
  }
});
test('all browser/OIDC files, original image hashes and raw Playwright outcomes are required', () => {
  const fx = browserFixture(), result = collectActualFiles(fx.report, { cases: LASAR_ACTUAL_CASES, roles: LASAR_ACTUAL_LOGIN_ROLES, read: fx.read });
  assert.equal(result.screenshots.size, 14); assert.equal(result.files.size, 24);
  const bad = file => { const p = fx.read(file); if (file.endsWith('browser-desktop.json')) p.sha256 = 'changed'; return p; };
  assert.throws(() => collectActualFiles(fx.report, { cases: LASAR_ACTUAL_CASES, roles: LASAR_ACTUAL_LOGIN_ROLES, read: bad }));
  const rawBad = file => { const p = fx.read(file); if (file.endsWith('playwright-actual.json')) p.value.suites[0].specs[0].tests[0].results.push({ status: 'passed' }); return p; };
  assert.throws(() => collectActualFiles(fx.report, { cases: LASAR_ACTUAL_CASES, roles: LASAR_ACTUAL_LOGIN_ROLES, read: rawBad }));
  const imageBad = file => { const p = fx.read(file); if (file.endsWith('.png')) p.sha256 = 'changed-picture'; return p; };
  assert.throws(() => collectActualFiles(fx.report, { cases: LASAR_ACTUAL_CASES, roles: LASAR_ACTUAL_LOGIN_ROLES, read: imageBad }));
  const embedded = clone(fx.report); embedded.browserEvidence.desktop.result.project = 'foreign';
  assert.throws(() => collectActualFiles(embedded, { cases: LASAR_ACTUAL_CASES, roles: LASAR_ACTUAL_LOGIN_ROLES, read: fx.read }));
});
test('visual approval must cover exactly the fourteen unchanged calendar originals once each', () => {
  const { images } = browserFixture();
  const review = { status: 'reviewed', candidate: revision, images: [...images].map(([file, p]) => ({ file, sha256: p.sha256, reviewed: true })) };
  assert.equal(assertVisualReview(review, revision, images).count, 14);
  for (const mutate of [r => r.images.pop(), r => { r.images[0] = clone(r.images[1]); }, r => { r.candidate = 'c'.repeat(40); },
    r => { r.images[0].file = 'foreign.png'; }, r => { r.images[0].reviewed = false; }, r => { r.images[0].sha256 = 'changed'; }]) {
    const r = clone(review); mutate(r); assert.throws(() => assertVisualReview(r, revision, images));
  }
});
test('rehashing refuses changed evidence bytes and symlinks even within the same private directory', () => {
  const dir = mkdtempSync('/private/tmp/lasar-evidence-unit-'), file = path.join(dir, 'proof.json'), bytes = '{"symbolic":true}';
  writeFileSync(file, bytes, { mode: 0o600 }); const evidence = { files: [{ path: file, sha256: sha(bytes), privateMode: true }] };
  try {
    assert.equal(assertEvidenceFilesUnchanged(evidence), true); writeFileSync(file, 'changed'); assert.throws(() => assertEvidenceFilesUnchanged(evidence));
    unlinkSync(file); const other = path.join(dir, 'other.json'); writeFileSync(other, bytes, { mode: 0o600 }); symlinkSync(other, file);
    assert.throws(() => assertEvidenceFilesUnchanged(evidence));
  } finally { rmSync(dir, { recursive: true }); }
});
