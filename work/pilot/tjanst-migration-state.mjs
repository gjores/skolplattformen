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
  ['supabase/migrations/20261023100000_tjanst_publish_person_scope.sql', '791b116b2959fa8724f2cd0d83d72cb04d517ad574ed57c82135dc1d0e378642'],
  ['supabase/migrations/20261023110000_tjanst_year_preview.sql', '33ccc9a28144148fca80be9885617dc05d1fea37e02dce92b34b47e78fdea2b2'],
  ['supabase/migrations/20261023120000_tjanst_year_commands.sql', '1cab1d80c39b672eda6f4a0c552b4bf8bc4f198c18319a14b03498fe5b4ea95e'],
  ['supabase/migrations/20261023130000_tjanst_year_worker_access.sql', '926aec137deb721811b8a84e6779b580d8cd005564e47cdaf4cab82908e9932f'],
  ['supabase/migrations/20261026100000_tjanst_joint_single_teacher.sql', '97da3d72923df8873bbe5e7fc2d24c743e2a1b68e763502d335ae3eac499b597'],
  ['supabase/migrations/20261026110000_tjanst_class_apl.sql', '968ae9ca7972dbd02bc26667e33f7d8ac2c37da7e305c8f80d999a6d023ebe55'],
  ['supabase/migrations/20261028100000_tjanst_need_sharing.sql', '2267364732b68e7b3b34a3c40fe8b9361225ec22aaae976d70d16937e8141f2b'],
  ['supabase/migrations/20261030110000_elective_blocks.sql', '020315a66c90be1a5fd8a5347329257688e49d3a0ba7b0c7b1baad3bd94be835'],
  ['supabase/migrations/20261030111000_elective_participant_authority.sql', 'c72f95a605837df84a0b87776f6169ee5d18bd2e79f80c218e70e561b4f5386f'],
  ['supabase/migrations/20261030111500_elective_timplan_positions.sql', '55ba0cf79267792437868774f5c21f872b2e350ca89445716c102954496b63e0'],
  ['supabase/migrations/20261030112000_elective_tjanst_sources.sql', 'd47f695aee0d969d4d010068fef14c75ff6150b6d821b46181557625603e4953'],
  ['supabase/migrations/20261030113000_elective_rounds_choices.sql', 'dd712589475399347903e1bbad74466ba8cbb3284db1979791417961f5c7e6da'],
  ['supabase/migrations/20261030114000_elective_guardian_confirmation.sql', 'b19e1fb9c62aaeb8cf1986246dd86f1867fe1d83f8e180cf9c1e2e15c9dc95b7'],
  ['supabase/migrations/20261030115000_elective_placements.sql', '467ccffb99512cf77587154e0234c352fd781030855f4a85a90642969260980d'],
  ['supabase/migrations/20261030115100_elective_binding_recovery_reference.sql', '3ef83db1e92702726359d593d272f5406c3bfa4aa572583ba57f4b0a0b9a1ab1'],
  ['supabase/migrations/20261030115200_elective_frame_exclusivity.sql', '14f50a44625b80daa8a6f56bc23e2baf909c4e87f5c468b980c1aaebd140fa4f'],
  ['supabase/migrations/20261030115300_elective_participant_account_attestation.sql', '8846dadcfdac08bd8515179fdcbb92f107352b586c87314cdd2865141b489767'],
  ['supabase/migrations/20261030115400_elective_placement_applied_organization.sql', '57f556087ebb66b56c729dcc66266d6e286159be1d7f91cca613f9416b1f0fc8'],
  ['supabase/migrations/20261030115500_elective_group_retirement.sql', 'b7445ddb102e1fcf0638c39e26847b595bab4641cadce9abe7698a44252b2077'],
  ['supabase/migrations/20261030115600_elective_applied_pool_intent.sql', '5320748cf7558d48d4e11b8d1381b207484784e2bc529850da24c5439a1b0eb4'],
  ['supabase/migrations/20261030115700_elective_explicit_privileges.sql', '22041ff3b333bbba614d166314b8cc2552f973a60f407d7c36006f99ebac21f3'],
  ['supabase/migrations/20261031100000_elective_preparations.sql', '7f61304f0999303e92319c7a110928723222479cd09a908ffdbdf091da8afd0d'],
  ['supabase/migrations/20261104100000_valplans.sql', '2c527aedb2da58e17d06d482f8823da50de6a64a7e576412d6fb072694505e85'],
  ['supabase/migrations/20261104110000_study_groups.sql', '2867f1a797adf2b30a71a6de32a80f3129721b1f0e295ec66673c653176898e7'],
  ['supabase/migrations/20261104120000_valplan_legacy_row_time.sql', '0a30a1ac79440118bbac732d3c0aff1291080cadf0ccd7ad3d503b3ebcd8a539'],
  ['supabase/migrations/20261105100000_study_group_tjanst.sql', '8315190bb58657a8e02958672a815b9bc623fc7ab17bb67633794a365eb0199a'],
  ['supabase/migrations/20261105110000_valplan_choices.sql', 'b21db5515e15bcf41fa62d9c7c5f6b51909d5b978b5829b557c3c8fa1e8a76e0'],
  ['supabase/migrations/20261105120000_study_group_read_classes.sql', '55e59777f89a817ff07c71a60ad7a2c1fb3b952502c81e0b74edcdfe476d5c21'],
  ['supabase/migrations/20261106100000_class_link_following.sql', 'b3c860ed2699abbfa5e0a4598a235f2da28645cf1f3a4c896c811a8215f107ac'],
  ['supabase/migrations/20261107100000_valplan_all_block_kinds.sql', '4cf1172ee1562154c729520b60a44f960d17f3e6c08f4447bbced788c0293156'],
  ['supabase/migrations/20261107110000_valplan_class_selection.sql', '9651bc036017d3e9c6aa893302fa8030a148d2a27d229e754a6316a9fb3c1f16'],
  ['supabase/migrations/20261107120000_valplan_open_check.sql', 'cb3b6a80bb43a9d8a2844711a8b91abdcea93fbb3a3701054765f20d2b3a564d'],
  ['supabase/migrations/20261107130000_valplan_held_courses.sql', '29378c94806687b68e9485e36677d0f3021f71c1c5c657c108b62516fbb20953'],
  ['supabase/migrations/20261110100000_valplan_language_ladders.sql', '9f6faed56c136467d9375ce246392f2a7b89d6eed1fa30fb1f3da152cc43fcc5'],
  // 05.1.1-06: läsårskalenderns versioner och Worker-öppning; installeras först efter VP-16 (exakt prefix).
  ['supabase/migrations/20261111100000_lasar_versions.sql', '10961843a52192d38c962d0c9311d97538e9f8f4bba446868b02505ccb3f3f66'],
  ['supabase/migrations/20261111190000_lasar_worker_access.sql', '3b95e261bc48e8df8f8bbcdedbf9005050658ac6419c0e123208436e7216027c'],
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

/** Derived only from a source-verified installed prefix plus successfully applied files. */
export const TJANST_WORKER_BASE_ENTRYPOINTS = Object.freeze([
  'phase51_grim_class_command(jsonb)', 'phase51_grim_class_underlag(jsonb)',
  'tjanst_personal_command(jsonb)', 'tjanst_personal_read(jsonb)', 'tjanst_personal_status(jsonb)',
  'tjanst_plan_command(jsonb)', 'tjanst_plan_read(jsonb)', 'tjanst_plan_status(jsonb)',
  'tjanst_self_command(jsonb)', 'tjanst_self_read(jsonb)', 'tjanst_self_status(jsonb)', 'tjanst_staffing_read(jsonb)',
]);
export function expectedTjanstWorkerEntrypoints({ installed, applied = [] }) {
  assert.ok(Array.isArray(installed) && Array.isArray(applied));
  assert.ok(installed.length >= TJANST_BASELINE_LENGTH, 'ACL baseline requires installed etapp 1');
  assert.deepEqual(installed,TJANST_MIGRATION_REGISTRY.slice(0,installed.length).map(m=>m.version),'ACL installed baseline must be an exact registered prefix');
  const versions = [...installed, ...applied.map(file => {
    const entry = TJANST_MIGRATION_REGISTRY.find(m => m.file === file);
    assert.ok(entry, 'Unknown applied migration: '+file); return entry.version;
  })];
  assert.ok(versions.length >= TJANST_BASELINE_LENGTH);
  assert.deepEqual(versions, TJANST_MIGRATION_REGISTRY.slice(0,versions.length).map(m=>m.version), 'ACL expectation requires an exact registered prefix');
  return [...TJANST_WORKER_BASE_ENTRYPOINTS, ...(versions.includes('20261023130000') ? ['tjanst_year_preview(jsonb)'] : [])].sort();
}
export async function assertTjanstYearAcl(db, state) {
  const expected = expectedTjanstWorkerEntrypoints(state);
  const grants = await db`select p.oid::regprocedure::text signature,r.role,has_function_privilege(r.role,p.oid,'EXECUTE') allowed
    from pg_proc p cross join (values ('skolplattform_worker'),('anon'),('authenticated'),('service_role')) r(role)
    where p.pronamespace='public'::regnamespace and (p.proname like 'tjanst_year_%' or p.proname='tjanst_plan_parse_legacy')`;
  assert.ok(grants.length);
  for (const g of grants) assert.equal(g.allowed, g.role==='skolplattform_worker'&&expected.includes(g.signature.replace(/^public\./u,'')), g.role+':'+g.signature);
  assert.equal((await db`select count(*)::int n from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where p.pronamespace='public'::regnamespace and (p.proname like 'tjanst_year_%' or p.proname='tjanst_plan_parse_legacy') and acl.grantee=0`)[0].n,0);
  return expected;
}
