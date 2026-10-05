begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Preserve the historical ACL profile only inside this rollback-only regression.
revoke execute on function public.phase5_programplan_selection(uuid,text,jsonb),public.phase5_create_programplan_education(uuid,uuid,text,text,text,jsonb),public.phase5_programplan_education_status(uuid),public.phase5_read_programplan_terms(uuid),public.phase5_write_programplan_terms(uuid,integer,jsonb),public.phase5_change_programplan_education(uuid,integer,text,jsonb) from skolplattform_worker;

-- Workspace fixture: reusable synthetic setup; no grants or assertions.

create function pg_temp.programplan_actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55101000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55101000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.programplan_reference(refs jsonb default '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100}]'::jsonb)
returns jsonb language sql stable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn',to_char(make_date(extract(year from current_date)::integer+1,8,17),'YYYY-MM-DD'),'specializationRefs',refs)$$;
insert into public.customers(id,name) values('55101000-0000-4000-8000-000000000001','Syntetiskt programplansprov');
insert into public.organizers(id,customer_id,name,type) values('55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000001','Syntetisk programplanshuvudman','Kommun');
insert into public.identities(id,issuer,subject) values
 ('55101000-0000-4000-8000-000000000010','https://programplan.example.test','synthetic-hm'),
 ('55101000-0000-4000-8000-000000000011','https://programplan.example.test','synthetic-principal'),
 ('55101000-0000-4000-8000-000000000012','https://programplan.example.test','synthetic-principal2'),
 ('55101000-0000-4000-8000-000000000013','https://programplan.example.test','synthetic-admin');
insert into public.memberships(id,identity_id,customer_id) values
 ('55101000-0000-4000-8000-000000000020','55101000-0000-4000-8000-000000000010','55101000-0000-4000-8000-000000000001'),
 ('55101000-0000-4000-8000-000000000021','55101000-0000-4000-8000-000000000011','55101000-0000-4000-8000-000000000001'),
 ('55101000-0000-4000-8000-000000000022','55101000-0000-4000-8000-000000000012','55101000-0000-4000-8000-000000000001'),
 ('55101000-0000-4000-8000-000000000023','55101000-0000-4000-8000-000000000013','55101000-0000-4000-8000-000000000001');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values
 ('55101000-0000-4000-8000-000000000030','55101000-0000-4000-8000-000000000002','55008030','Syntetisk programplansskola','0000'),
 ('55101000-0000-4000-8000-000000000031','55101000-0000-4000-8000-000000000002','55008031','Annan syntetisk skola','0000');
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values('55101000-0000-4000-8000-000000000060','55101000-0000-4000-8000-000000000020','55101000-0000-4000-8000-000000000001','55101000-0000-4000-8000-000000000002','huvudman','synthetic-v1','school');
insert into public.mandate_units values
 ('55101000-0000-4000-8000-000000000060','55101000-0000-4000-8000-000000000001','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000030'),
 ('55101000-0000-4000-8000-000000000060','55101000-0000-4000-8000-000000000001','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000031');
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55101000-0000-4000-8000-000000000080',decode(md5('55101000-0000-4000-8000-000000000080')||md5('55101000-0000-4000-8000-000000000080'),'hex'),
 '55101000-0000-4000-8000-000000000010','55101000-0000-4000-8000-000000000020','55101000-0000-4000-8000-000000000060',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor('55101000-0000-4000-8000-000000000060','55101000-0000-4000-8000-000000000020','55101000-0000-4000-8000-000000000010','55101000-0000-4000-8000-000000000080');
create temporary table programplan_roles(name text primary key,id uuid);
insert into programplan_roles values('hm','55101000-0000-4000-8000-000000000060'),
 ('principal',public.phase3_grant_mandate('{"membershipId":"55101000-0000-4000-8000-000000000021","function":"rektor","scopeKind":"school","unitIds":["55101000-0000-4000-8000-000000000030"]}')),
 ('principal2',public.phase3_grant_mandate('{"membershipId":"55101000-0000-4000-8000-000000000022","function":"rektor","scopeKind":"school","unitIds":["55101000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values
 ('55101000-0000-4000-8000-000000000081',decode(md5('55101000-0000-4000-8000-000000000081')||md5('55101000-0000-4000-8000-000000000081'),'hex'),'55101000-0000-4000-8000-000000000011','55101000-0000-4000-8000-000000000021',(select id from programplan_roles where name='principal'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours'),
 ('55101000-0000-4000-8000-000000000082',decode(md5('55101000-0000-4000-8000-000000000082')||md5('55101000-0000-4000-8000-000000000082'),'hex'),'55101000-0000-4000-8000-000000000012','55101000-0000-4000-8000-000000000022',(select id from programplan_roles where name='principal2'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55101000-0000-4000-8000-000000000021','55101000-0000-4000-8000-000000000011','55101000-0000-4000-8000-000000000081');
insert into programplan_roles values('admin',public.phase3_grant_mandate('{"membershipId":"55101000-0000-4000-8000-000000000023","function":"administrator","scopeKind":"school","unitIds":["55101000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55101000-0000-4000-8000-000000000083',decode(md5('55101000-0000-4000-8000-000000000083')||md5('55101000-0000-4000-8000-000000000083'),'hex'),'55101000-0000-4000-8000-000000000013','55101000-0000-4000-8000-000000000023',(select id from programplan_roles where name='admin'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values
 ('55101000-0000-4000-8000-000000000040','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000030','gymnasium','Syntetisk bunden SA','Syntetisk kulltext utan datum','SA25','SABEP'),
 ('55101000-0000-4000-8000-000000000041','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000030','gymnasium','Syntetisk obunden SA','Inte ett datum','SA25','SABEP'),
 ('55101000-0000-4000-8000-000000000042','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000030','gymnasium','Syntetisk tidigare beslutad SA','Syntetiskt prov','SA25','SABEP'),
 ('55101000-0000-4000-8000-000000000043','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000031','gymnasium','Syntetisk annan skola SA','Syntetiskt prov','SA25','SABEP'),
 ('55101000-0000-4000-8000-000000000045','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000030','gymnasium','Syntetisk tom ES','Syntetiskt prov','ES25','ESBIF');
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference) values
 ('55101000-0000-4000-8000-000000000050','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000040',1,array['ENGE3000X'],'sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',pg_temp.programplan_reference());
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_fetched,status,decided_on) values
 ('55101000-0000-4000-8000-000000000051','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000041',1,array['ENGE3000X','ANIM1000X'],'2026-09-05','utkast',null),
 ('55101000-0000-4000-8000-000000000052','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000042',3,array['ENGE3000X'],'2026-09-05','faststalld','2026-09-10'),
 ('55101000-0000-4000-8000-000000000053','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000043',1,array['ENGE3000X'],'2026-09-05','utkast',null);
-- Only this synthetic legacy row predates session-based actor metadata.
set local session_replication_role=replica;
insert into public.point_plan_events(point_plan_id,actor_role,action,comment) values
 ('55101000-0000-4000-8000-000000000052','huvudman','Syntetiskt äldre beslut','Syntetisk historik ska bevaras');
set local session_replication_role=origin;


select is(array(select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and has_function_privilege('skolplattform_worker',p.oid,'execute') order by 1),array['public.phase5_bind_programplan_draft(uuid,integer,jsonb)','public.phase5_change_timplan_cell(uuid,integer,text,integer,integer)','public.phase5_clone_programplan_draft(uuid,integer,integer,jsonb)','public.phase5_create_programplan_draft(uuid,integer,jsonb)','public.phase5_list_programplan_offerings(integer)','public.phase5_list_timplans(integer)','public.phase5_programplan_workspace(uuid,integer,text)','public.phase5_read_programplan(uuid)','public.phase5_read_timplan(uuid)','public.phase5_replace_programplan_specialization(uuid,integer,jsonb)']::text[],'actual Worker ACL is exactly ten full signatures');
select is(has_function_privilege('anon','public.phase5_list_programplan_offerings(integer)','execute'),false,'anon entrypoint closed');
select is(has_function_privilege('anon','public.phase5_programplan_workspace(uuid,integer,text)','execute'),false,'anon entrypoint closed');
select is(has_function_privilege('authenticated','public.phase5_list_programplan_offerings(integer)','execute'),false,'authenticated entrypoint closed');
select is(has_function_privilege('authenticated','public.phase5_programplan_workspace(uuid,integer,text)','execute'),false,'authenticated entrypoint closed');
select is(has_function_privilege('anon','public.phase5_programplan_education(public.offerings)','execute'),false,'anon helper closed');
select is(has_function_privilege('authenticated','public.phase5_programplan_education(public.offerings)','execute'),false,'authenticated helper closed');
select is(has_function_privilege('skolplattform_worker','public.phase5_programplan_education(public.offerings)','execute'),false,'skolplattform_worker helper closed');
select is(has_function_privilege('anon','public.phase5_programplan_workspace_audit(uuid,text)','execute'),false,'anon helper closed');
select is(has_function_privilege('authenticated','public.phase5_programplan_workspace_audit(uuid,text)','execute'),false,'authenticated helper closed');
select is(has_function_privilege('skolplattform_worker','public.phase5_programplan_workspace_audit(uuid,text)','execute'),false,'skolplattform_worker helper closed');
set local role skolplattform_worker;
select lives_ok($q$select public.phase5_list_programplan_offerings(1)$q$,'actual Worker lists with living session');
select lives_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',1,null)$q$,'actual Worker reads education without plan');
select throws_ok($q$select public.phase5_programplan_education(null::public.offerings)$q$,'42501',null,'Worker cannot execute education helper');
select throws_ok($q$select * from public.programplan_catalogs$q$,'42501',null,'direct Worker catalog stays closed');
select set_config('app.session_id','',true);
select throws_ok($q$select public.phase5_list_programplan_offerings(1)$q$,'42501',null,'missing session denies list');
select throws_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',1,null)$q$,'42501',null,'missing session denies workspace');
reset role;
select is((select count(*) from public.security_events where customer_id='55101000-0000-4000-8000-000000000001' and action in('programplan_offerings_listed','programplan_workspace_read')),2::bigint,'only two actual successful read audits persisted');
select * from finish();
rollback;
