begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Programplan fixture: reusable synthetic setup; no grants or assertions.
create function pg_temp.programplan_actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55008000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55008000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.programplan_reference(refs jsonb default '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100}]'::jsonb)
returns jsonb language sql immutable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn','2026-08-01','specializationRefs',refs)$$;
insert into public.customers(id,name) values('55008000-0000-4000-8000-000000000001','Syntetiskt programplansprov');
insert into public.organizers(id,customer_id,name,type) values('55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000001','Syntetisk programplanshuvudman','Kommun');
insert into public.identities(id,issuer,subject) values
 ('55008000-0000-4000-8000-000000000010','https://programplan.example.test','synthetic-hm'),
 ('55008000-0000-4000-8000-000000000011','https://programplan.example.test','synthetic-principal'),
 ('55008000-0000-4000-8000-000000000012','https://programplan.example.test','synthetic-principal2'),
 ('55008000-0000-4000-8000-000000000013','https://programplan.example.test','synthetic-admin');
insert into public.memberships(id,identity_id,customer_id) values
 ('55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000001'),
 ('55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000001'),
 ('55008000-0000-4000-8000-000000000022','55008000-0000-4000-8000-000000000012','55008000-0000-4000-8000-000000000001'),
 ('55008000-0000-4000-8000-000000000023','55008000-0000-4000-8000-000000000013','55008000-0000-4000-8000-000000000001');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values
 ('55008000-0000-4000-8000-000000000030','55008000-0000-4000-8000-000000000002','55008030','Syntetisk programplansskola','0000'),
 ('55008000-0000-4000-8000-000000000031','55008000-0000-4000-8000-000000000002','55008031','Annan syntetisk skola','0000');
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','huvudman','synthetic-v1','school');
insert into public.mandate_units values
 ('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030'),
 ('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000031');
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55008000-0000-4000-8000-000000000080',decode(md5('55008000-0000-4000-8000-000000000080')||md5('55008000-0000-4000-8000-000000000080'),'hex'),
 '55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000060',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
create temporary table programplan_roles(name text primary key,id uuid);
insert into programplan_roles values('hm','55008000-0000-4000-8000-000000000060'),
 ('principal',public.phase3_grant_mandate('{"membershipId":"55008000-0000-4000-8000-000000000021","function":"rektor","scopeKind":"school","unitIds":["55008000-0000-4000-8000-000000000030"]}')),
 ('principal2',public.phase3_grant_mandate('{"membershipId":"55008000-0000-4000-8000-000000000022","function":"rektor","scopeKind":"school","unitIds":["55008000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values
 ('55008000-0000-4000-8000-000000000081',decode(md5('55008000-0000-4000-8000-000000000081')||md5('55008000-0000-4000-8000-000000000081'),'hex'),'55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000021',(select id from programplan_roles where name='principal'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours'),
 ('55008000-0000-4000-8000-000000000082',decode(md5('55008000-0000-4000-8000-000000000082')||md5('55008000-0000-4000-8000-000000000082'),'hex'),'55008000-0000-4000-8000-000000000012','55008000-0000-4000-8000-000000000022',(select id from programplan_roles where name='principal2'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
insert into programplan_roles values('admin',public.phase3_grant_mandate('{"membershipId":"55008000-0000-4000-8000-000000000023","function":"administrator","scopeKind":"school","unitIds":["55008000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55008000-0000-4000-8000-000000000083',decode(md5('55008000-0000-4000-8000-000000000083')||md5('55008000-0000-4000-8000-000000000083'),'hex'),'55008000-0000-4000-8000-000000000013','55008000-0000-4000-8000-000000000023',(select id from programplan_roles where name='admin'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values
 ('55008000-0000-4000-8000-000000000040','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk bunden SA','Syntetisk kulltext utan datum','SA25','SABEP'),
 ('55008000-0000-4000-8000-000000000041','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk obunden SA','Inte ett datum','SA25','SABEP'),
 ('55008000-0000-4000-8000-000000000042','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk tidigare beslutad SA','Syntetiskt prov','SA25','SABEP'),
 ('55008000-0000-4000-8000-000000000043','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000031','gymnasium','Syntetisk annan skola SA','Syntetiskt prov','SA25','SABEP'),
 ('55008000-0000-4000-8000-000000000045','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk tom ES','Syntetiskt prov','ES25','ESBIF');
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference) values
 ('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000040',1,array['ENGE3000X'],'sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',pg_temp.programplan_reference());
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_fetched,status,decided_on) values
 ('55008000-0000-4000-8000-000000000051','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000041',1,array['ENGE3000X','ANIM1000X'],'2026-09-05','utkast',null),
 ('55008000-0000-4000-8000-000000000052','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000042',3,array['ENGE3000X'],'2026-09-05','faststalld','2026-09-10'),
 ('55008000-0000-4000-8000-000000000053','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000043',1,array['ENGE3000X'],'2026-09-05','utkast',null);
-- Only this synthetic legacy row predates session-based actor metadata.
set local session_replication_role=replica;
insert into public.point_plan_events(point_plan_id,actor_role,action,comment) values
 ('55008000-0000-4000-8000-000000000052','huvudman','Syntetiskt äldre beslut','Syntetisk historik ska bevaras');
set local session_replication_role=origin;

-- Foundation tests run before or after final grants; local ACL alterations roll back.
revoke execute on function public.phase5_read_programplan_terms(uuid),public.phase5_write_programplan_terms(uuid,integer,jsonb) from skolplattform_worker;
select ok(not has_function_privilege('skolplattform_worker','public.phase5_read_programplan_terms(uuid)','execute'),'closed new read entrypoint');
select ok(not has_function_privilege('skolplattform_worker','public.phase5_write_programplan_terms(uuid,integer,jsonb)','execute'),'closed new write entrypoint');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.proname in ('phase5_programplan_term_rows','phase5_programplan_validate_terms','phase5_programplan_terms_guard','phase5_programplan_terms_audit','phase5_read_programplan_terms','phase5_write_programplan_terms') and a.grantee=0 and a.privilege_type='EXECUTE'),'all term helpers closed to PUBLIC');
select ok(not has_table_privilege('skolplattform_worker','public.point_plans','update'),'no direct table writes');
select is(public.phase5_read_programplan_terms('55008000-0000-4000-8000-000000000050')->'distribution','[]'::jsonb,'existing draft starts empty');
create temporary table term_result(value jsonb);
insert into term_result values(public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',0,'[{"rowKey":"specialization:ENGE:1:ENGE3000X","points":[0,0,25,25,50,0]},{"rowKey":"meta:diplomaWork","points":[0,0,0,0,0,100]}]'));
select is((select value->>'revision' from term_result),'1','shared CAS revision advances');
select is(public.phase5_read_programplan_terms('55008000-0000-4000-8000-000000000050'),(select value from term_result),'exact saved term distribution read back');
select is((select count(*) from public.point_plan_events where point_plan_id='55008000-0000-4000-8000-000000000050' and action='programplan_terms_changed'),1::bigint,'one actor-bound business event');
select ok((select bool_and(actor_identity_id='55008000-0000-4000-8000-000000000011' and session_id='55008000-0000-4000-8000-000000000081' and assignment_id=(select id from programplan_roles where name='principal')) from public.point_plan_events where point_plan_id='55008000-0000-4000-8000-000000000050' and action='programplan_terms_changed'),'event uses actual principal session');
select ok((select bool_and(details='{}'::jsonb and source='db' and actor_identity_id='55008000-0000-4000-8000-000000000011') from public.security_events where object_id='55008000-0000-4000-8000-000000000050' and action like 'programplan_terms_%'),'audit minimized and actual actor');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',0,'[]')$q$,'40001',null,'stale revision cannot overwrite');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',1,'[]')$q$,'22023',null,'cannot delete allocated specialization silently');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',1,'[{"rowKey":"meta:diplomaWork","points":[100,1,0,0,0,0]}]')$q$,'22023',null,'overallocated level denied');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',1,'[{"rowKey":"meta:diplomaWork","points":[-1,0,0,0,0,0]}]')$q$,'22023',null,'negative allocation denied');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',1,'[{"rowKey":"meta:diplomaWork","points":[0.5,0,0,0,0,0]}]')$q$,'22023',null,'fractional allocation denied');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',1,'[{"rowKey":"meta:diplomaWork","points":[0,0,0,0,0]}]')$q$,'22023',null,'exactly six cells required');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',1,'[{"rowKey":"meta:diplomaWork","points":[0,0,0,0,0,0]},{"rowKey":"meta:diplomaWork","points":[0,0,0,0,0,0]}]')$q$,'22023',null,'duplicate row denied');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',1,'[{"rowKey":"foundation:SVEN:1:SVEN1000X","points":[100,0,0,0,0,0]}]')$q$,'22023',null,'unresolved alternative is not selected automatically');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',1,'[{"rowKey":"specialization:ENGE:2:ENGE3000X","points":[100,0,0,0,0,0]}]')$q$,'22023',null,'wrong pinned subject version denied');
select throws_ok($q$update public.point_plans set term_distribution='[]' where id='55008000-0000-4000-8000-000000000050'$q$,'40001',null,'direct update cannot bypass revision');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000051',0,'[]')$q$,'42501',null,'unbound legacy plan cannot allocate');
-- Exact unresolved handling: optional source levels absent, obligatory rows + meta present.
select ok(not exists(select 1 from jsonb_array_elements(public.phase5_programplan_term_rows(pg_temp.programplan_reference())) r where r->>'key' like 'foundation:SVEN:%' or r->>'key' like 'foundation:SVEA:%'),'alternative national subjects remain unresolved');
select ok(exists(select 1 from jsonb_array_elements(public.phase5_programplan_term_rows(pg_temp.programplan_reference())) r where r->>'key'='meta:individualChoice' and r->>'points'='200'),'individual choice frame retained');
-- Synthetic sealed snapshot predates binding; disable existing immutable guard only for fixture.
alter table public.point_plans disable trigger point_plans_programplan_guard;
update public.point_plans set status='faststalld',decided_on='2026-10-03' where id='55008000-0000-4000-8000-000000000050';
alter table public.point_plans enable trigger point_plans_programplan_guard;
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',1,'[]')$q$,'42501',null,'sealed plan locked');
select throws_ok($q$update public.point_plans set term_distribution='[]',revision=revision+1 where id='55008000-0000-4000-8000-000000000050'$q$,'42501',null,'sealed trigger prevents direct allocation change');
insert into term_result values(public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000050',1,1,null));
select is((select p.term_distribution from public.point_plans p where p.id=(select (value->>'id')::uuid from term_result where value ? 'id')),(select value->'distribution' from term_result where value ? 'distribution'),'new version copies term distribution exactly');
select pg_temp.programplan_actor((select id from programplan_roles where name='admin'),'55008000-0000-4000-8000-000000000023','55008000-0000-4000-8000-000000000013','55008000-0000-4000-8000-000000000083');
select throws_ok($q$select public.phase5_read_programplan_terms('55008000-0000-4000-8000-000000000050')$q$,'42501',null,'administrator cannot bypass pending delegation');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
select throws_ok($q$select public.phase5_read_programplan_terms('55008000-0000-4000-8000-000000000053')$q$,'42501',null,'foreign school denied');
update public.app_sessions set revoked_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000081';
select throws_ok($q$select public.phase5_read_programplan_terms('55008000-0000-4000-8000-000000000050')$q$,'42501',null,'revoked actual session denied');
select * from finish();
rollback;
