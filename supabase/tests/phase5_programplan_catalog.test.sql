begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Historical ACL profile: later B/C/D grants are revoked only in this rollback fixture.
do $profile$ declare signature text;begin
 foreach signature in array array['public.phase5_save_programplan_package(uuid,integer,jsonb)','public.phase5_list_programplan_packages(uuid)','public.phase5_replace_programplan_blocks(uuid,integer,jsonb)','public.phase5_read_programplan_unit_packages(uuid)','public.phase5_write_programplan_unit_packages(uuid,uuid,integer,text,jsonb)'] loop
  if to_regprocedure(signature) is not null then execute 'revoke execute on function '||signature||' from skolplattform_worker';end if;
 end loop;
end $profile$;

-- Historical eight-entrypoint profile: explicit local revokes roll back at EOF.
-- The actual final ten-entrypoint ACL is asserted by phase5_programplan_workspace_worker.
revoke execute on function public.phase5_list_programplan_offerings(integer),public.phase5_programplan_workspace(uuid,integer,text) from skolplattform_worker;
-- Historisk ACL-profil: senare grants (05-11 utbildning, 05-18 terminer, 05-20 livscykel) återkallas lokalt och rullas tillbaka.
revoke execute on function public.phase5_programplan_selection(uuid,text,jsonb),public.phase5_create_programplan_education(uuid,uuid,text,text,text,jsonb),public.phase5_programplan_education_status(uuid),public.phase5_read_programplan_terms(uuid),public.phase5_write_programplan_terms(uuid,integer,jsonb),public.phase5_change_programplan_education(uuid,integer,text,jsonb) from skolplattform_worker;
-- These INSERT probes are synthetic and the complete transaction rolls back.
create function pg_temp.catalog_fixture() returns jsonb language sql immutable as $f$
select '{"schemaVersion":1,"source":{"url":"https://catalog.example.test/v1","apiVersion":"synthetic-1","fetched":"2026-09-05"},"subjects":[{"code":"TEST","name":"Syntetiskt ämne","typeOfSyllabus":"GRADE_SUBJECT_SYLLABUS","schoolTypes":["GY"],"version":1,"startDate":"2026-01-01","endDate":null,"canceledDate":null,"skolfs":null,"items":[{"code":"TEST1000X","name":"Nivå 1","points":100}]}],"programs":[{"code":"TP25","name":"Syntetiskt program","category":"PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION","version":1,"startDate":"2026-01-01","endDate":null,"canceledDate":null,"skolfs":null,"foundation":[{"code":"TEST","name":"Syntetiskt ämne","points":200,"optional":false,"subjectVersion":1,"levels":[{"code":"TEST1000X","name":"Nivå 1","points":100}]}],"programmeSpecific":[],"orientations":[],"specialization":[]}]}'::jsonb
$f$;
create function pg_temp.catalog_insert(p jsonb,c text default null) returns void language plpgsql as $$begin
 insert into public.programplan_catalogs(catalog_id,payload) values(
 coalesce(c,'sha256:'||encode(extensions.digest(convert_to(public.phase5_programplan_canonical(p),'UTF8'),'sha256'),'hex')),p);
end $$;
create function pg_temp.catalog_ref(p text default 'SA25',v int default 4,o text default 'SABEP',d text default '2026-08-01',refs jsonb default '[]'::jsonb)
returns jsonb language sql stable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code',p,'version',v),'orientationCode',o,'startedOn',d,'specializationRefs',refs)$$;
create function pg_temp.catalog_diagnostic(r jsonb,c text) returns boolean language sql as $$
select coalesce(r->>'status'='blocked' and r->'diagnostics' @> jsonb_build_array(jsonb_build_object('code',c)) and r->'decisionReady'='false'::jsonb,false)$$;

select is((select count(*) from public.programplan_catalogs where catalog_id='sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace'),1::bigint,'actual saved catalog is present once');
select is((select 'sha256:'||encode(extensions.digest(convert_to(public.phase5_programplan_canonical(payload),'UTF8'),'sha256'),'hex') from public.programplan_catalogs where catalog_id='sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace'),
 'sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace','DB canonical SHA-256 matches the independently generated TS artifact');
select is((select jsonb_array_length(payload->'subjects') from public.programplan_catalogs where catalog_id='sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace'),907,'full saved subject set retained');
select is((select jsonb_array_length(payload->'programs') from public.programplan_catalogs where catalog_id='sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace'),29,'no program is filtered out to obtain passing checks');
select is(public.phase5_programplan_canonical($j${"z":"åäö \"citat\" \\ sned /\n\t\u0001 😀","a":[1,true,null]}$j$::jsonb),
 $j${"a":[1,true,null],"z":"åäö \"citat\" \\ sned /\n\t\u0001 😀"}$j$,'canonical string escaping and UTF-8 match JSON.stringify without stripping spaces');
select is(public.phase5_programplan_canonical('{"b":2,"a":1}'::jsonb),'{"a":1,"b":2}','canonical object keys are ordered without added whitespace');

select lives_ok($q$select pg_temp.catalog_insert(pg_temp.catalog_fixture())$q$,'valid synthetic catalog keeps raw block points independent of level sum');
select throws_ok($q$select pg_temp.catalog_insert(pg_temp.catalog_fixture(),'sha256:'||repeat('0',64))$q$,'22023',null,'correct shape with wrong fingerprint rejected');
select throws_ok($q$select pg_temp.catalog_insert(pg_temp.catalog_fixture(),'bad-id')$q$,'22023',null,'malformed catalog ID rejected');
select throws_ok($q$select pg_temp.catalog_insert(pg_temp.catalog_fixture()||'{"actor":"forged"}'::jsonb)$q$,'22023',null,'extra catalog field rejected even with recomputed hash');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{subjects,0,items,0,points}','"100"'))$q$,'22023',null,'numeric strings rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{subjects,0,items,0,points}','100.5'))$q$,'22023',null,'fractional item points rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{programs,0,startDate}','"2026-02-30"'))$q$,'22023',null,'impossible calendar date rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{programs,0,foundation,0,subjectVersion}','2'))$q$,'22023',null,'block must pin the actual subject version');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{programs,0,foundation,0,levels,0,points}','99'))$q$,'22023',null,'block/item points mismatch rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{programs,0,foundation,0,levels,0,code}','"MISSING1000X"'))$q$,'22023',null,'unknown block item rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{subjects}',(pg_temp.catalog_fixture()->'subjects')||(pg_temp.catalog_fixture()->'subjects')))$q$,'22023',null,'duplicate subject codes rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{programs}',(pg_temp.catalog_fixture()->'programs')||(pg_temp.catalog_fixture()->'programs')))$q$,'22023',null,'duplicate program codes rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{subjects,0,items}',(pg_temp.catalog_fixture()#>'{subjects,0,items}')||(pg_temp.catalog_fixture()#>'{subjects,0,items}')))$q$,'22023',null,'duplicate item codes rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{subjects}',(pg_temp.catalog_fixture()->'subjects')||jsonb_build_array(jsonb_set(pg_temp.catalog_fixture()#>'{subjects,0}','{code}','"TESTB"'))))$q$,'22023',null,'item code cannot be duplicated under two different subject codes');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{source,customerId}','"forged"'))$q$,'22023',null,'extra nested source field rejected');
select throws_ok($q$select pg_temp.catalog_insert(null)$q$,'22023',null,'null catalog payload rejected explicitly');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{source,url}','"https://user:secret@catalog.example.test/v1"'))$q$,'22023',null,'source URL user information rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{source,url}','"https://catalog.example.test:65536/v1"'))$q$,'22023',null,'source URL port beyond URL range rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{source,url}','"https://catalog.example.test:bogus/v1"'))$q$,'22023',null,'source URL non-numeric port rejected');
select throws_ok($q$select pg_temp.catalog_insert(jsonb_set(pg_temp.catalog_fixture(),'{source,url}','"https://[bogus]/v1"'))$q$,'22023',null,'malformed source URL rejected');
select throws_ok($q$update public.programplan_catalogs set payload=payload$q$,'42501',null,'even no-op catalog update rejected');
select throws_ok($q$delete from public.programplan_catalogs$q$,'42501',null,'catalog deletion rejected');
select throws_ok($q$truncate public.programplan_catalogs cascade$q$,'42501',null,'catalog truncate rejected even when referencing tables are named by cascade');

select is(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref())->>'status','resolved','actual SA25 version and orientation resolved');
select is(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('EK25',4,'EKEKI'))->>'status','resolved','actual EK25 resolved');
select is(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('ES25',3,'ESBIF'))->>'status','resolved','actual ES25 resolved');
select is(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref())->'decisionReady','false'::jsonb,'technical reference result never permits deciding');
select ok(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref())->'unresolvedChoices' @> '[{"kind":"optional_subject","subjectCode":"SVEN"},{"kind":"optional_subject","subjectCode":"SVEA"},{"kind":"subject_levels_unresolved","subjectCode":"MOSP"},{"kind":"program_rules_unverified"}]'::jsonb,'language alternatives, empty level lists and unresolved national rules retained');
select is((select count(*) from jsonb_object_keys(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref()))),6::bigint,'resolver returns exactly the six closed result fields');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(null),'unpinned_basis'),'null older basis is explicit unpinned');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('MISSING',1)),'program_not_found'),'unknown program blocked');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',3)),'historical_version_missing'),'wrong program version never falls back to latest');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,'UNKNOWN')),'orientation_not_found'),'unknown orientation blocked');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,'EKEKI')),'orientation_not_found'),'another program orientation blocked');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,null)),'orientation_required'),'required orientation cannot disappear');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,'SABEP','2025-08-01')),'historical_version_missing'),'2025 education cannot use the saved 2026 program');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref() - 'startedOn'),'unknown_education_start'),'missing explicit start is not inferred');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,'SABEP','2026-02-30')),'invalid_basis_reference'),'broken start date blocked');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref()||'{"role":"huvudman"}'),'invalid_basis_reference'),'client role field rejected');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(jsonb_set(pg_temp.catalog_ref(),'{programRef,extra}','true')),'invalid_basis_reference'),'nested extra field rejected');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,'SABEP','2026-08-01','[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":50}]')),'points_mismatch'),'wrong specialization points blocked');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,'SABEP','2026-08-01','[{"subjectCode":"ENGE","subjectVersion":2,"itemCode":"ENGE3000X","points":100}]')),'historical_version_missing'),'wrong selected subject version blocked');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,'SABEP','2026-08-01','[{"subjectCode":"MATE","subjectVersion":1,"itemCode":"ENGE3000X","points":100}]')),'wrong_subject'),'item cannot be attributed to another subject');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,'SABEP','2026-08-01','[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"MISSING1000X","points":100}]')),'item_not_found'),'unknown item blocked');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,'SABEP','2026-08-01','[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE1000X","points":100}]')),'fixed_level_duplicate'),'fixed level cannot become new specialization');
select ok(pg_temp.catalog_diagnostic(public.phase5_resolve_programplan_basis(pg_temp.catalog_ref('SA25',4,'SABEP','2026-08-01','[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100},{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100}]')),'duplicate_selected_level'),'double selected level blocked');
select ok(not has_table_privilege(r,'public.programplan_catalogs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'catalog privileges closed for '||r) from unnest(array['anon','authenticated','skolplattform_worker'])r;
select is((select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%programplan%' and p.oid not in ('public.phase5_read_programplan(uuid)'::regprocedure,'public.phase5_bind_programplan_draft(uuid,integer,jsonb)'::regprocedure,'public.phase5_replace_programplan_specialization(uuid,integer,jsonb)'::regprocedure,'public.phase5_create_programplan_draft(uuid,integer,jsonb)'::regprocedure,'public.phase5_clone_programplan_draft(uuid,integer,integer,jsonb)'::regprocedure) and has_function_privilege(r,p.oid,'EXECUTE')),0::bigint,'all new catalog helpers closed for '||r) from unnest(array['anon','authenticated','skolplattform_worker'])r;
select is((select count(*) from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%programplan%' and acl.grantee=0 and acl.privilege_type='EXECUTE'),0::bigint,'PUBLIC cannot execute any new catalog helper');
select is((select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and has_function_privilege('skolplattform_worker',p.oid,'EXECUTE')),8::bigint,'Worker has exactly five programplan and three timplan entrypoints');
select * from finish();
rollback;
