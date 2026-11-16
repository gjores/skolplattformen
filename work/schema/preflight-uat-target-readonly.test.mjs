import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSchemaUatJournal } from './preflight-uat-target-readonly.mjs';
import { syntheticJournalFromMetadata } from '../pilot/verify-schema-uat-install-owned.mjs';
import { SCHEMA_UAT_MIGRATIONS } from '../pilot/schema-uat-install-core.mjs';
import { releaseSha } from './prepare-uat-release.mjs';

test('journal comparison exposes older gaps independently of the three planned additions', () => {
  const files = ['20261112140000_old.sql', '20261112141000_older.sql', '20261116100000_schema_drafts.sql', '20261116101000_schema_drafts_worker_access.sql', '20261116102000_schema_dated_basis.sql'];
  const rows = [{ version: '20261112140000', name: 'old', statements: ['synthetic'] }], report = summarizeSchemaUatJournal(rows, files, () => 'synthetic');
  assert.equal(report.count, 1); assert.equal(report.missing.length, 4); assert.equal(report.missing[0], '20261112141000_older.sql'); assert.equal(report.mismatched.length, 0);
});
test('journal comparison refuses changed sources and reports unexpected versions without emitting SQL', () => {
  const report = summarizeSchemaUatJournal([{ version: '20261112140000', name: 'old', statements: ['changed synthetic SQL'] },
    { version: '20261117100000', name: 'unexpected', statements: ['other'] }], ['20261112140000_old.sql'], () => 'expected synthetic SQL');
  assert.equal(report.mismatched.length, 1); assert.equal(report.unknown.length, 1); assert.equal(report.unknown[0].version, '20261117100000');
  assert.ok(!JSON.stringify(report).includes('changed synthetic SQL') && !JSON.stringify(report).includes('expected synthetic SQL'));
});
test('owned rehearsal preserves historical journal array formats/name alias/gaps while excluding all actual SQL texts', () => {
  const known = ['20261002120000_phase5_programplan_education.sql', '20261002121000_phase5_worker_programplan_education.sql'];
  const files = ['20260905120000_huvudman.sql', '20260930110000_phase5_timplan_draft.sql', ...known, '20261012220000_plan_decision_search.sql', ...SCHEMA_UAT_MIGRATIONS];
  const shape = [{ version: '20260905120000', name: 'huvudman', statementCount: 75, statementsSha256: 'a'.repeat(64) },
    { version: '20260930110000', name: 'phase5_timplan_draft', statementCount: 0, statementsSha256: releaseSha([]) },
    { version: '20261012220000', name: 'plan_decision_operational', statementCount: 1, statementsSha256: 'b'.repeat(64) }];
  const value = { kind: 'schema-uat-target-readonly-preflight', readsOnly: true, businessRowsRead: false, databaseClosed: true, database: { transactionReadOnly: true },
    journal: { count: shape.length, shape, shapeSha256: releaseSha(shape), missingBaseline: known } };
  const result = syntheticJournalFromMetadata(value, files);
  assert.deepEqual(result.map(row => row.statements.length), [75, 0, 1]); assert.equal(result[2].name, 'plan_decision_operational');
  assert.ok(result.every(row => row.statements.every(text => text.startsWith('-- synthetic prior journal metadata only;'))));
  const changed = structuredClone(value); changed.journal.shape[0].statementCount = 74;
  assert.throws(() => syntheticJournalFromMetadata(changed, files));
  assert.throws(() => syntheticJournalFromMetadata({ ...value, businessRowsRead: true }, files));
});
