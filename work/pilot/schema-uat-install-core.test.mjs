import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_UAT_MIGRATIONS, schemaUatSources, schemaUatSqlMetadata, assertSchemaUatJournal, assertSchemaUatTransition } from './schema-uat-install-core.mjs';

test('exact three SQL sources bind original and execution bytes; no destructive transaction wrapper', () => {
  const sources = schemaUatSources(), metadata = schemaUatSqlMetadata(sources);
  assert.deepEqual(metadata.map(item => item.file), [...SCHEMA_UAT_MIGRATIONS]);
  assert.ok(metadata.every(item => item.bytes > 0 && /^[a-f0-9]{64}$/u.test(item.sha256) && /^[a-f0-9]{64}$/u.test(item.executionSha256)));
  assert.equal(Object.keys(sources).length, 3);
});
test('journal gate rejects empty, partial, installed, unordered and newer baselines', () => {
  const row = version => ({ version, name: 'synthetic', statements: ['synthetic'] });
  assert.equal(assertSchemaUatJournal([row('20261115100000')]).count, 1);
  for (const rows of [[], [row('20261116100000')], [row('20261116101000')], [row('20261116102000')], [row('20261117100000')], [row('20261115100000'), row('20261114100000')]]) {
    assert.throws(() => assertSchemaUatJournal(rows));
  }
});
test('catalog gate rejects modification/removal of any existing object before accepting new inventory', () => {
  const original = { functions: [{ signature: 'existing(jsonb)', definition: 'original', acl: 'closed' }], tables: [], columns: [], constraints: [], indexes: [], triggers: [], policies: [] };
  const changed = structuredClone(original); changed.functions[0].definition = 'changed';
  assert.throws(() => assertSchemaUatTransition(original, changed), /existing functions changed/u);
  assert.throws(() => assertSchemaUatTransition(original, { ...original, functions: [] }), /existing functions removed/u);
});
