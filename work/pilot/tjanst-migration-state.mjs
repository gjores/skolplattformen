// WR-11: fail-closed registry. Add each reviewed forward migration here with its immutable hash.
// The classifier is pure; filesystem/database acquisition is kept in the callers.
import assert from 'node:assert/strict';
export const TJANST_MIGRATION_REGISTRY = Object.freeze([
  ['supabase/migrations/20261020100000_grim_class_timplan_link.sql', '0bf06b644e5e0025fbe9b6d02b48b9629c652b86b235033e772679719196ada4'],
  ['supabase/migrations/20261020100100_grim_class_worker_access.sql', 'd7d9dca0baec3a23dc1a78380f06474d1507d9a3322fa09f8e714bab20378795'],
  ['supabase/migrations/20261020110000_tjanst_personal_self.sql', '7a383919d32495848188114e822524f79c88f6f6a585630b8256bbf61f66af4f'],
  ['supabase/migrations/20261020120000_tjanst_plan.sql', 'fc2ae54c157d204d579edab3e63aeebfbce6bcc742ab9baa39bf1abac45eb1a3'],
  ['supabase/migrations/20261020130000_tjanst_assignments_feedback.sql', '4e28f15c434b2abed8d95e834b73613f8c77334cf8f70111a5946fdff2cc5ef5'],
  ['supabase/migrations/20261020140000_tjanst_person_account.sql', '70f37d3f3350cad0dd48488bc9616a36fb20ed8550a3589e8817d29d76f5bed5'],
  ['supabase/migrations/20261020190000_tjanst_worker_access.sql', '3bc080b5180bdc66d0492c6bd664d630bf3ce78ca63f8ea87306f68aa6aea146'],
  ['supabase/migrations/20261021120000_tjanst_self_schools_joint_rules.sql', '55ef638226b36118578ee007e8e9d70975acea1fa9b26ca9dc3209066e729ccc'],
].map(([file, sha256]) => Object.freeze({ file, version: file.split('/').at(-1).slice(0, 14), sha256 })));
export const TJANST_BASELINE_LENGTH = 7;
export const TJANST_GAP_LENGTH = 8;
export const TJANST_PHASE_START = '20261020000000';

export function classifyTjanstMigrations({ journal, sourceHashes }) {
  assert.ok(Array.isArray(journal), 'Migrationsjournalen måste vara en lista');
  const files = TJANST_MIGRATION_REGISTRY.map(m => m.file);
  assert.deepEqual(Object.keys(sourceHashes).sort(), [...files].sort(), 'Okänd eller saknad migrationskälla: registrera suffixet uttryckligen');
  for (const m of TJANST_MIGRATION_REGISTRY) assert.equal(sourceHashes[m.file], m.sha256, 'Ändrad migrationskälla: ' + m.file);
  assert.ok(journal.every(v => typeof v === 'string' && /^\d{14}$/u.test(v)), 'Ogiltig journalversion');
  assert.deepEqual(journal, [...new Set(journal)].sort(), 'Migrationsjournalen är omordnad eller innehåller dubbletter');
  const installed = journal.filter(v => v >= TJANST_PHASE_START);
  const unknown = installed.filter(v => !TJANST_MIGRATION_REGISTRY.some(m => m.version === v));
  assert.deepEqual(unknown, [], 'Okänd journalpost efter fasens start');
  assert.ok(installed.length >= TJANST_BASELINE_LENGTH, 'Etapp 1 saknas helt eller delvis');
  assert.deepEqual(installed, TJANST_MIGRATION_REGISTRY.slice(0, installed.length).map(m => m.version), 'Migrationsbasen har hål eller fel prefix');
  const baselineMode = installed.length === TJANST_BASELINE_LENGTH ? 'etapp1' : installed.length === TJANST_GAP_LENGTH ? 'etapp1+gap' : 'registered-suffix:' + installed.at(-1);
  const pendingMigrations = TJANST_MIGRATION_REGISTRY.slice(installed.length).map(m => m.file);
  return { baselineMode, installed, pendingMigrations, unknown };
}

/** Expected gap table and ACL, checked in a schema-only copy before any fixture writes. */
export async function assertTjanstSelfMandatesSchema(db, { installed }) {
  const [{ present }] = await db`select to_regclass('public.tjanst_self_mandates') is not null present`;
  assert.equal(present, installed, 'Journal och tjanst_self_mandates stämmer inte överens');
  if (!installed) return;
  const columns = await db`select a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull required
    from pg_attribute a where a.attrelid='public.tjanst_self_mandates'::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`;
  assert.deepEqual([...columns], ['access_assignment_id','binding_id','customer_id','organizer_id','linked_by_assignment_id','linked_at']
    .map(name => ({ name, type: name === 'linked_at' ? 'timestamp with time zone' : 'uuid', required: true })));
  const [rls] = await db`select relrowsecurity r,relforcerowsecurity f from pg_class where oid='public.tjanst_self_mandates'::regclass`;
  assert.ok(rls.r && rls.f, 'Tvingad RLS krävs');
  const constraints = await db`select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.tjanst_self_mandates'::regclass and contype<>'n' order by 1`;
  assert.deepEqual(constraints.map(c => c.definition), [
    'FOREIGN KEY (access_assignment_id, customer_id, organizer_id) REFERENCES access_assignments(id, customer_id, organizer_id)',
    'FOREIGN KEY (binding_id) REFERENCES staff_person_bindings(id)',
    'FOREIGN KEY (linked_by_assignment_id, customer_id) REFERENCES access_assignments(id, customer_id)',
    'PRIMARY KEY (access_assignment_id)',
  ]);
  const triggers = await db`select tgname name,tgenabled enabled,tgtype::int type,tgfoid::regprocedure::text fn
    from pg_trigger where tgrelid='public.tjanst_self_mandates'::regclass and not tgisinternal order by tgname`;
  assert.deepEqual([...triggers], [
    { name: 'tjanst_self_mandates_immutable', enabled: 'O', type: 27, fn: 'tjanst_self_mandates_guard()' },
    { name: 'tjanst_self_mandates_no_truncate', enabled: 'O', type: 34, fn: 'tjanst_self_mandates_guard()' },
  ]);
  const forbidden = await db`select a.grantee from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where c.oid='public.tjanst_self_mandates'::regclass and a.grantee<>c.relowner`;
  assert.deepEqual([...forbidden], [], 'Kopplingstabellen får bara ha ägarrättigheter');
  for (const role of ['anon','authenticated','service_role','skolplattform_worker']) {
    const [privilege] = await db`select has_table_privilege(${role},'public.tjanst_self_mandates','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed`;
    assert.equal(privilege.allowed, false, role);
  }
}
