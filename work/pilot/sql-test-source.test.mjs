import test from 'node:test';
import assert from 'node:assert/strict';
import { expandSqlTestSource } from './sql-test-source.mjs';
test('ordinary SQL is unchanged and never reads a migration', () => {
  const source='begin;\nselect 1;\nrollback;';
  assert.equal(expandSqlTestSource(source,()=>assert.fail('unexpected read')),source);
});
test('rollback fixture executes exact repository migration text in place', () => {
  const body='alter table example add column test integer;\n';
  const source=expandSqlTestSource('begin;\n\\ir ../migrations/20260929110000_phase4_register_migrate_probe.sql\nrollback;', name=>{
    assert.equal(name,'20260929110000_phase4_register_migrate_probe.sql'); return body;
  });
  assert.ok(source.startsWith('begin;\n'));
  assert.ok(source.includes(body));
  assert.ok(source.endsWith('\nrollback;'));
});
test('traversal, alternate includes, absolute paths and nested reads are refused', () => {
  for(const line of ['\\include secret.sql','\\include_relative secret.sql','\\i secret.sql','\\ir /tmp/test.sql','\\ir ../migrations/../../secret.sql',' \\ir ../migrations/20260929110000_good.sql','\\ir ../migrations/20260929110000_good.sql extra']) {
    assert.throws(()=>expandSqlTestSource(line,()=>assert.fail('unsafe read')),/REFUSED/);
  }
  assert.throws(()=>expandSqlTestSource('\\ir ../migrations/20260929110000_good.sql',()=> '\\ir secret.sql'),/REFUSED/);
});
test('missing migration fails rather than silently skipping it', () => {
  assert.throws(()=>expandSqlTestSource('\\ir ../migrations/20260929110000_missing.sql',()=>{throw new Error('ENOENT');}),/ENOENT/);
});
