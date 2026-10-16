import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedFunctions, assertStructureTransition, assertColumnTransition, requirePackageProof, sha } from './apply-apl-term-intent.mjs';
import { deliveryPackage, requireInstallationProof, requirePreparedTransfer } from './deliver-apl-plan.mjs';

function structures() {
  const before = { tables: [{ relname: 'apl_plan_periods', relrowsecurity: true }], indexes: [], policies: [], triggers: [],
    columns: [{ relname: 'apl_plan_periods', attname: 'id', attnum: 1, type: 'uuid' }], constraints: [],
    functions: [...allowedFunctions, 'unrelated()'].map(signature => ({ signature, definition: 'old', acl: '{owner=X/owner}', owner: '10' })) };
  const after = structuredClone(before);
  after.columns.push({ relname: 'apl_plan_periods', attname: 'planned_term_index', attnum: 2, type: 'smallint', attnotnull: false,
    default_value: null, acl: null, attidentity: '', attgenerated: '' });
  after.constraints.push({ relname: 'apl_plan_periods', conname: 'apl_plan_periods_planned_term_index_check', convalidated: true,
    definition: 'CHECK (((planned_term_index >= 0) AND (planned_term_index <= 5)))' });
  for (const f of after.functions) if (allowedFunctions.includes(f.signature)) f.definition = 'updated';
  return { before, after };
}
function evidence() {
  const { before, after } = structures(), hash = 'a'.repeat(64), sources = { 'web/lib/apl-plan.ts': hash }, packages = { 'supabase/migrations/delta.sql': hash };
  const baseline = { structure: before, fingerprint: sha(JSON.stringify(before)), rows: { apl_plan_periods: { count: 2, hash } } };
  const installed = { ...structuredClone(baseline), structure: after, fingerprint: sha(JSON.stringify(after)) };
  const snapshot = { sourceFingerprint: baseline.fingerprint, dataCopied: false };
  const sql = { kind: 'apl-term-intent-private-schema-only', schemaVersion: 1, status: 'PASS', checks: [{ ok: true }], cleanup: { cleanup: 'complete' }, snapshot,
    baseline, installed, final: installed, rollback: { ...baseline, restored: true }, migrationRollbackRestored: true,
    originalPreservation: { tables: 1, exactPreservedRows: 2, preserved: true },
    races: [{ leftPid: 1, rightPid: 2, blockers: [1], wait_event_type: 'Lock', left: 'committed', right: '40001' }],
    sources: { ...sources, ...packages }, finalSources: { ...sources, ...packages }, migrations: packages };
  const artifact = { sha256: hash, fileCount: 1 }, browserEvidence = {};
  for (const device of ['desktop', 'phone']) browserEvidence[device] = { visualReview: 'reviewed', sha256: hash,
    result: { status: 'PASS', device, checks: [{ ok: true }], screenshots: [{ file: device + '-saved.png' }] }, screenshotHashes: { [device + '-saved.png']: hash } };
  const api = { kind: 'apl-term-intent-actual-api-browser', status: 'PASS', checks: [{ ok: true }], api: { ok: true },
    sources, finalSources: sources, migrationSources: packages, finalMigrationSources: packages, build: { mode: 'protected' },
    runtime: { baseURL: 'http://127.0.0.1:3014', artifact }, finalArtifact: artifact, snapshot,
    verificationSources: { 'work/pilot/probe.mjs': hash }, finalVerificationSources: { 'work/pilot/probe.mjs': hash },
    oidcCleanup: { cleanup: 'complete', verifiedCallbacks: 2 }, runtimeCleanup: { cleanup: 'complete' }, snapshotCleanup: { cleanup: 'complete' }, browserEvidence };
  return { sql, api, context: { sources, packages } };
}
test('accepts only the nullable term column and five existing function bodies', () => {
  const { before, after } = structures(); assert.equal(assertStructureTransition(before, after), true);
  assertColumnTransition({ apl_plan_periods: ['id'], other: ['id'] }, { apl_plan_periods: ['id', 'planned_term_index'], other: ['id'] });
});
test('accepts PostgreSQL Result arrays and their serialized evidence equivalently', () => {
  const { before, after } = structures();
  class Result extends Array {}
  for (const structure of [before, after]) for (const key of Object.keys(structure)) Object.setPrototypeOf(structure[key], Result.prototype);
  assert.equal(assertStructureTransition(before, after), true);
});
for (const [name, mutate] of [
  ['removed function', s => s.functions.pop()], ['unrelated definition', s => { s.functions.at(-1).definition = 'changed'; }],
  ['new grant', s => { s.functions[0].acl += ',authenticated=X/owner'; }], ['disabled RLS', s => { s.tables[0].relrowsecurity = false; }],
  ['column default', s => { s.columns[1].default_value = '0'; }], ['non-null column', s => { s.columns[1].attnotnull = true; }],
  ['unvalidated constraint', s => { s.constraints[0].convalidated = false; }], ['weaker check', s => { s.constraints[0].definition = 'CHECK (true)'; }],
  ['new trigger', s => s.triggers.push({ name: 'other' })], ['old column change', s => { s.columns[0].type = 'text'; }],
]) test('rejects ' + name, () => { const { before, after } = structures(); mutate(after); assert.throws(() => assertStructureTransition(before, after)); });
test('requires complete current SQL, HTTP, browser and cleanup evidence together', () => {
  const { sql, api, context } = evidence(); assert.equal(requirePackageProof(sql, api, context), true);
});
for (const [name, mutate] of [
  ['old release evidence', e => { e.sql.kind = 'apl-full-private-worker-sql'; }],
  ['failed check', e => { e.sql.checks[0].ok = false; }], ['missing rollback', e => { e.sql.rollback.restored = false; }],
  ['changed rows', e => { e.sql.installed.rows.apl_plan_periods.count++; }], ['missing race', e => { e.sql.races = []; }],
  ['unobserved lock', e => { e.sql.races[0].blockers = []; }], ['copied live data', e => { e.api.snapshot = { ...e.api.snapshot, dataCopied: true }; }],
  ['changed source', e => { e.api.finalSources = {}; }], ['different migration', e => { e.api.migrationSources = {}; }],
  ['active test port', e => { e.api.runtime.baseURL = 'http://127.0.0.1:3012'; }],
  ['incomplete OIDC cleanup', e => { e.api.oidcCleanup.cleanup = 'failed'; }], ['unreviewed phone', e => { e.api.browserEvidence.phone.visualReview = 'pending'; }],
  ['missing phone', e => { delete e.api.browserEvidence.phone; }], ['missing screenshot digest', e => { e.api.browserEvidence.phone.screenshotHashes = {}; }],
]) test('refuses release evidence: ' + name, () => { const e = evidence(); mutate(e); assert.throws(() => requirePackageProof(e.sql, e.api, e.context)); });
test('delivery packages are fixed and an old preparation cannot authorize the delta', () => {
  assert.equal(deliveryPackage('apl-term-intent').installationKind, 'apl-term-intent-live-installation');
  assert.throws(() => deliveryPackage('../another-module'));
  assert.throws(() => requirePreparedTransfer({ packageId: 'apl-plan' }, { packageId: 'apl-term-intent' }), /package mismatch/);
});
test('delta installation receipt cannot be substituted for another package or unknown commit', () => {
  const { before, after } = structures();
  const report = { kind: 'apl-term-intent-live-installation', mode: '--apply', status: 'PASS', committed: true, databaseClosed: true,
    oldWorkerCompatibleAfterCommit: false, candidateTransferRequired: true, toolSha256: 'digest', target: {}, installed: {},
    beforeProjection: {}, afterProjection: {}, beforeJournal: {}, afterOriginalJournal: {}, structureVerified: true,
    beforeStructure: before, afterStructure: after, recoveryRequired: false, lockHoldMsBeforeCommit: 100 };
  const context = { target: {}, installed: {}, toolSha256: 'digest', packageId: 'apl-term-intent' };
  requireInstallationProof(report, context);
  assert.throws(() => requireInstallationProof(report, { ...context, packageId: 'apl-plan' }));
  assert.throws(() => requireInstallationProof({ ...report, committed: false }, context));
  assert.throws(() => requireInstallationProof({ ...report, recoveryRequired: true }, context));
});
