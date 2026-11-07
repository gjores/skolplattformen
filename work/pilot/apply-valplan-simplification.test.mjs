import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseValplanArgs } from './apply-valplan.mjs';
import { ELECTIVE_MIGRATIONS, sha } from './apply-elective-blocks.mjs';
import { linkSourceSnapshot } from './apply-class-link-following.mjs';
import { EXPECTED_DELTA, NEW_FUNCTIONS, REPLACED_FUNCTIONS, SIMPLIFICATION_MIGRATIONS, assertNoRowWrites, assertSimplificationRehearsal, assertSimplificationTransition, simplificationSourceSnapshot, validateSimplificationJournal } from './apply-valplan-simplification.mjs';

const version = p => p.split('/').at(-1).slice(0, 14), name = p => p.split('/').at(-1).slice(15, -4);
function journal() {
  const sources = simplificationSourceSnapshot();
  const rows = Object.keys(sources).filter(p => !SIMPLIFICATION_MIGRATIONS.includes(p)).map(p => ({ version: version(p), name: name(p), statements: [sources[p].sql] }));
  return { sources, rows };
}
const KINDS = "CHECK ((kind = ANY (ARRAY['modernLanguage'::text, 'languageSubject'::text, 'naturalScience'::text, 'individualChoice'::text, 'specialization'::text])))";
const TABLE = 'valplan_row_excluded_classes', relation = key => key.slice(0, key.lastIndexOf('.'));
const item = key => key.slice(key.lastIndexOf('.') + 1);
function structures() {
  const fn = (signature, definition = 'old') => ({ signature, definition, acl: '{owner=X/owner}', owner: '10' });
  const before = { functions: [...REPLACED_FUNCTIONS, 'unrelated()'].map(s => fn(s)), tables: [{ relname: 'valplans', relrowsecurity: true }, { relname: 'valplan_rows', relrowsecurity: true }, ...EXPECTED_DELTA.tables.removed.map(relname => ({ relname }))],
    columns: [{ relname: 'valplans', attname: 'kind' }, ...EXPECTED_DELTA.columns.removed.map(k => ({ relname: relation(k), attname: item(k) }))],
    constraints: [{ relname: 'valplans', conname: 'valplans_kind_check', definition: "CHECK ((kind = ANY (ARRAY['modernLanguage'::text])))", convalidated: true }, ...EXPECTED_DELTA.constraints.removed.map(k => ({ relname: relation(k), conname: item(k), definition: 'UNIQUE', convalidated: true }))],
    indexes: EXPECTED_DELTA.indexes.removed.map(k => ({ tablename: relation(k), indexname: item(k), indexdef: 'old' })), triggers: [{ relname: 'valplan_commands', tgname: 'immutable', definition: 'old', tgenabled: 'O' }], policies: [] };
  const after = structuredClone(before);
  after.functions = [...before.functions.map(f => REPLACED_FUNCTIONS.includes(f.signature) ? { ...f, definition: 'new' } : { ...f }), ...NEW_FUNCTIONS.map(s => fn(s, 'new'))];
  after.tables = [...structuredClone(before.tables).filter(t => !EXPECTED_DELTA.tables.removed.includes(t.relname)), ...EXPECTED_DELTA.tables.added.map(relname => ({ relname }))];
  after.columns = [structuredClone(before.columns[0]), ...EXPECTED_DELTA.columns.added.map(k => ({ relname: relation(k), attname: item(k), attnotnull: relation(k) === TABLE }))];
  after.constraints = [{ ...before.constraints[0], definition: KINDS }, ...EXPECTED_DELTA.constraints.added.map((k, i) => ({ relname: TABLE, conname: 'generated_' + i, definition: k.slice(TABLE.length + 2), convalidated: true }))];
  after.indexes = EXPECTED_DELTA.indexes.added.map(k => ({ tablename: relation(k), indexname: item(k), indexdef: 'new' }));
  return { before, after };
}

test('the journal is accepted only with the known versions, byte-identical to their sources', () => {
  const { sources, rows } = journal(), result = validateSimplificationJournal(rows, sources);
  assert.equal(result.count, rows.length); assert.equal(result.sha256, sha(rows));
});
for (const [what, change, reason] of [
  ['a changed source of the class link', rows => { rows.find(r => r.version === '20261106100000').statements = ['-- annan text']; }, /installed_journal_differs/],
  ['a changed name of the class link', rows => { rows.find(r => r.version === '20261106100000').name = 'annat'; }, /installed_journal_differs/],
  ['a changed elective migration', rows => { rows.find(r => r.version === version(ELECTIVE_MIGRATIONS[0])).statements = ['-- annan text']; }, /installed_journal_differs/],
  ['a second statement', rows => { rows.find(r => r.version === '20261105110000').statements.push('select 1'); }, /installed_journal_differs/],
  ['a missing installed version', rows => { rows.splice(rows.findIndex(r => r.version === '20261105120000'), 1); }, /unexpected_journal_versions/],
  ['an unknown version between the known ones', rows => { rows.splice(-1, 0, { version: '20261105130000', name: 'okand', statements: ['select 1'] }); }, /unexpected_journal_versions/],
  ['a journal that stops before the class link', rows => { rows.pop(); }, /unexpected_journal_tail/],
  ['an unknown tail', rows => { rows.push({ version: '20261106200000', name: 'okand', statements: ['select 1'] }); }, /unexpected_journal_tail/],
]) test('refuses ' + what, () => { const { sources, rows } = journal(); change(rows); assert.throws(() => validateSimplificationJournal(rows, sources), reason); });
test('refuses a journal where a package migration is already installed', () => {
  const { sources, rows } = journal(), p = SIMPLIFICATION_MIGRATIONS[0];
  const row = { version: version(p), name: name(p), statements: [sources[p].sql] };
  assert.throws(() => validateSimplificationJournal([...rows, row], sources), /unexpected_journal_tail/);
  assert.throws(() => validateSimplificationJournal([...rows.slice(0, -1), row, rows.at(-1)], sources), /already_installed/);
});

test('the four migrations hold schema statements only at the top level', () => {
  const sources = simplificationSourceSnapshot();
  for (const p of SIMPLIFICATION_MIGRATIONS) { assertNoRowWrites(sources[p].sql); assert.ok(sources[p].sql.length > 0); }
  assertNoRowWrites("create function public.f() returns void language sql as $$ update public.valplans set name='x' $$; -- delete from public.valplans\n");
});
for (const sql of ["update public.valplans set name='x';", 'insert into public.valplans default values;', 'delete from public.valplan_rows;', 'truncate public.valplan_rows;', 'select public.f();', "do $$begin delete from public.valplans;end$$;", 'with x as (delete from public.valplans returning 1) select 1;', 'grant execute on function public.f() to anon;', 'drop table public.valplan_rows;'])
  test('refuses the migration statement ' + sql.slice(0, 24), () => assert.throws(() => assertNoRowWrites(sql), /migration_statement_refused/));

test('accepts exactly the expected schema change', () => {
  const { before, after } = structures(), counts = assertSimplificationTransition(before, after);
  assert.deepEqual(counts.functions, { added: 9, removed: 0, changed: 12 }); assert.deepEqual(counts.triggers, { added: 0, removed: 0, changed: 0 });
});
test('PostgreSQL 18 lists NOT NULL as constraints, and a schema name in a definition makes no difference', () => {
  const { before, after } = structures();
  after.constraints.push(...['valplan_id', 'class_id'].map(c => ({ relname: TABLE, conname: `${TABLE}_${c}_not_null`, definition: 'NOT NULL ' + c, convalidated: true })));
  for (const c of after.constraints) c.definition = c.definition.replace('REFERENCES school_classes', 'REFERENCES public.school_classes');
  assert.ok(assertSimplificationTransition(before, after));
});
test('reads a function signature the same with and without schema names', () => {
  const { before, after } = structures();
  for (const f of [...before.functions, ...after.functions]) f.signature = f.signature.replace('valplan_self_read()', 'public.valplan_self_read()').replace('(valplans,uuid)', '(public.valplans, uuid)');
  assert.ok(assertSimplificationTransition(before, after));
});
for (const [what, change] of [
  ['a removed function', s => s.functions.pop()],
  ['a changed unrelated function', s => { s.functions.find(f => f.signature === 'unrelated()').definition = 'changed'; }],
  ['a replaced function left unchanged', s => { s.functions.find(f => f.signature === 'valplan_self_read()').definition = 'old'; }],
  ['a new grant on a replaced function', s => { s.functions.find(f => f.signature === 'valplan_command(jsonb)').acl += ',anon=X/owner'; }],
  ['a new owner of a replaced function', s => { s.functions.find(f => f.signature === 'valplan_command(jsonb)').owner = '11'; }],
  ['an extra function', s => s.functions.push({ signature: 'valplan_extra()', definition: 'x', acl: null, owner: '10' })],
  ['disabled row security on a table', s => { s.tables.find(t => t.relname === 'valplans').relrowsecurity = false; }],
  ['an extra table', s => s.tables.push({ relname: 'valplan_extra' })],
  ['a new column on a kept table', s => s.columns.push({ relname: 'valplans', attname: 'extra' })],
  ['a changed kept column', s => { s.columns[0].type = 'text'; }],
  ['an extra constraint', s => s.constraints.push({ relname: 'valplans', conname: 'extra', definition: 'CHECK (true)', convalidated: true })],
  ['a block type missing', s => { s.constraints[0].definition = "CHECK ((kind = ANY (ARRAY['modernLanguage'::text])))"; }],
  ['an extra block type', s => { s.constraints[0].definition = KINDS.replace('])))', ", 'other'::text])))"); }],
  ['an unvalidated kind check', s => { s.constraints[0].convalidated = false; }],
  ['an unvalidated new constraint', s => { s.constraints.at(-1).convalidated = false; }],
  ['the unique key left in place', s => s.indexes.push({ tablename: 'valplan_rows', indexname: EXPECTED_DELTA.tables.removed[0], indexdef: 'old' })],
  ['a nullable column in the new table', s => { s.columns.find(c => c.relname === TABLE && c.attname === 'class_id').attnotnull = false; }],
  ['a foreign key without cascade', s => { const c = s.constraints.find(x => x.definition.endsWith('ON DELETE CASCADE')); c.definition = c.definition.replace(' ON DELETE CASCADE', ''); }],
  ['a new trigger', s => s.triggers.push({ relname: 'valplans', tgname: 'extra', definition: 'x', tgenabled: 'O' })],
  ['a disabled trigger', s => { s.triggers[0].tgenabled = 'D'; }],
  ['a new policy', s => s.policies.push({ tablename: 'valplans', policyname: 'open' })],
]) test('refuses ' + what, () => { const { before, after } = structures(); change(after); assert.throws(() => assertSimplificationTransition(before, after)); });

test('apply needs a passed rehearsal of the same sources and installer', () => {
  const current = { kind: 'k', sqlSourceHashes: { a: '1' }, installerSources: { b: '2' } }, passed = { ...current, status: 'PASS', mode: 'rehearsal', committed: false, rollbackRestored: true, databaseClosed: true, checks: [{ ok: true }] };
  assertSimplificationRehearsal(passed, current);
  for (const change of [{ status: 'FAIL' }, { mode: 'apply' }, { committed: true }, { rollbackRestored: false }, { databaseClosed: false }, { checks: [] }, { checks: [{ ok: false }] }, { sqlSourceHashes: { a: '2' } }, { installerSources: { b: '3' } }, { kind: 'other' }])
    assert.throws(() => assertSimplificationRehearsal({ ...passed, ...change }, current));
});
test('the command line takes no database address and needs explicit evidence', () => {
  assert.deepEqual(parseValplanArgs(['--rehearse', '--out', '/private/tmp/a.json']), { mode: 'rehearsal', out: '/private/tmp/a.json' });
  assert.deepEqual(parseValplanArgs(['--apply', '--rehearsal', '/private/tmp/a.json', '--out', '/private/tmp/b.json']), { mode: 'apply', rehearsal: '/private/tmp/a.json', out: '/private/tmp/b.json' });
  for (const args of [[], ['--rehearse'], ['--apply', '--out', '/private/tmp/b.json'], ['--rehearse', '--rehearsal', '/private/tmp/a.json', '--out', '/private/tmp/b.json'], ['--rehearse', '--db-url', 'postgres://x', '--out', '/private/tmp/b.json'], ['--rehearse', '--out', '/home/b.json'], ['--apply', '--rehearsal', '/private/tmp/a.json', '--out', '/private/tmp/a.json']])
    assert.throws(() => parseValplanArgs(args));
});
test('the older class link installer refuses to run with the new migrations in the repository', () => {
  assert.throws(() => linkSourceSnapshot(), /unexpected_migration_suffix/);
});
test('the source holds no database address or process control', () => {
  const source = readFileSync(new URL('./apply-valplan-simplification.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /postgres(?:ql)?:\/\/|child_process|execFile|spawn\(|process\.env|\b3012\b(?! |,)/u);
});
