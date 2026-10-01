begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Exercise the closed-foundation profile in either preflight/final regression.
-- These two explicit local revokes are rolled back with the whole pgTAP file;
-- final Worker authorization is checked by its own grant/profile test and API.
revoke execute on function public.phase5_list_programplan_offerings(integer),public.phase5_programplan_workspace(uuid,integer,text) from skolplattform_worker;
-- Workspace fixture: reusable synthetic setup; no grants or assertions.

create function pg_temp.programplan_actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55101000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55101000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.programplan_reference(refs jsonb default '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100}]'::jsonb)
returns jsonb language sql immutable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn','2026-08-01','specializationRefs',refs)$$;
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

-- End workspace fixture.

update public.offerings set local_code='SYNTETISK-ES',start_year=2026 where id='55101000-0000-4000-8000-000000000045';
update public.point_plans set specialization=array['UNKNOWN_LEGACY','ANIM1000X','UNKNOWN_LEGACY'] where id='55101000-0000-4000-8000-000000000051';
create temporary table workspace_before as
 select 'offerings' as name,jsonb_agg(to_jsonb(o) order by id) as value from public.offerings o where organizer_id='55101000-0000-4000-8000-000000000002'
 union all select 'plans',jsonb_agg(to_jsonb(p) order by id) from public.point_plans p where organizer_id='55101000-0000-4000-8000-000000000002'
 union all select 'history',jsonb_agg(to_jsonb(e) order by id) from public.point_plan_events e where point_plan_id in(select id from public.point_plans where organizer_id='55101000-0000-4000-8000-000000000002');
create temporary table workspace_results(name text primary key,value jsonb);
insert into workspace_results values('list',public.phase5_list_programplan_offerings(1)),
 ('empty-education',public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',1,null)),
 ('legacy',public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000041',1,null)),
 ('selected',public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000040',1,pg_temp.programplan_reference()->>'catalogId')),
 ('missing',public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',1,'sha256:'||repeat('0',64)));
select is((select (value->>'count')::int from workspace_results where name='list'),4,'principal sees four own-school gymnasieutbildningar including no-plan education');
select is((select count(*) from jsonb_object_keys((select value from workspace_results where name='list'))),4::bigint,'list has exactly four fields');
select ok((select bool_and((select count(*) from jsonb_object_keys(o))=13) from workspace_results cross join lateral jsonb_array_elements(value->'offerings') o where name='list'),'education summaries have exactly thirteen fields');
select ok((select bool_and(o->>'unitId'='55101000-0000-4000-8000-000000000030' and o->>'kind'='gymnasium') from workspace_results cross join lateral jsonb_array_elements(value->'offerings') o where name='list'),'other school and other schoolforms absent');
select ok((select value->'education' @> '{"id":"55101000-0000-4000-8000-000000000045","localCode":"SYNTETISK-ES","startYear":2026,"latestVersion":0,"draftId":null}'::jsonb and value->'versions'='[]'::jsonb and value->>'versionCount'='0' from workspace_results where name='empty-education'),'education without plan retains real metadata and zero max version');
select is((select count(*) from jsonb_object_keys((select value from workspace_results where name='empty-education'))),8::bigint,'workspace has exactly eight fields');
select ok((select value->'catalog' @> '{"status":"unselected","catalogId":null,"diagnostic":null,"payload":null}'::jsonb and value->'decisionReady'='false'::jsonb from workspace_results where name='empty-education'),'NULL explicitly leaves catalog unselected and decision closed');
select is((select value->'versions'->0->'legacySpecialization' from workspace_results where name='legacy'),'["UNKNOWN_LEGACY","ANIM1000X","UNKNOWN_LEGACY"]'::jsonb,'legacy unknown and duplicate values preserved in original order');
select ok((select value->'education'->'startYear'='null'::jsonb and value->'versions'->0->'basisReference'='null'::jsonb from workspace_results where name='legacy'),'free cohort is not education start and legacy is not auto-bound');
select is((select value->'catalog'->>'status' from workspace_results where name='selected'),'selected','explicit stored exact catalog selected');
select is((select value->'catalog'->'payload' from workspace_results where name='selected'),(select payload from public.programplan_catalogs where catalog_id=pg_temp.programplan_reference()->>'catalogId'),'entire stored artifact supplied to server integrity verification');
select ok((select value->'versions'->0->'legacySpecialization'='null'::jsonb from workspace_results where name='selected'),'pinned version never exposes an alternative unpinned selection');
select is((select value->'catalog'->>'diagnostic' from workspace_results where name='missing'),'catalog_unavailable','missing explicit catalog never falls back to current seed');
select ok((select jsonb_array_length(value->'catalogs')>0 and value->'catalogs'->0 ? 'source' from workspace_results where name='selected'),'catalog choices retain public source identity');
select ok(exists(select 1 from public.security_events where action='programplan_offerings_listed' and source='db' and object_type='education_collection' and object_id is null and session_id='55101000-0000-4000-8000-000000000081' and actor_identity_id='55101000-0000-4000-8000-000000000011' and membership_id='55101000-0000-4000-8000-000000000021' and assignment_id=(select id from programplan_roles where name='principal') and customer_id='55101000-0000-4000-8000-000000000001' and details='{}'::jsonb),'list audit has actual session/identity/mandate with no payload');
select ok(exists(select 1 from public.security_events where action='programplan_workspace_read' and source='db' and object_type='education' and object_id='55101000-0000-4000-8000-000000000045' and session_id='55101000-0000-4000-8000-000000000081' and correlation_id='55101000-0000-4000-8000-000000000099' and details='{}'::jsonb),'workspace audit records actual education and correlation');
select is((public.phase5_list_programplan_offerings(2)->>'count')::int,4,'empty education page retains total count');
select is(jsonb_array_length(public.phase5_list_programplan_offerings(2)->'offerings'),0,'empty education page is honest');
select throws_ok($q$select public.phase5_list_programplan_offerings(null)$q$,'22023',null,'null list page denied');
select throws_ok($q$select public.phase5_list_programplan_offerings(0)$q$,'22023',null,'zero list page denied');
select throws_ok($q$select public.phase5_list_programplan_offerings(100001)$q$,'22023',null,'oversize list page denied');
select throws_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',0,null)$q$,'22023',null,'bad workspace page denied');
select throws_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',1,'latest')$q$,'22023',null,'implicit catalog alias denied');
select throws_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000043',1,null)$q$,'42501',null,'other-school education denied like missing object');
select throws_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000099',1,null)$q$,'42501',null,'missing education denied');

select is((select jsonb_agg(to_jsonb(o) order by id) from public.offerings o where organizer_id='55101000-0000-4000-8000-000000000002'),(select value from workspace_before where name='offerings'),'all reads preserve every education field');
select is((select jsonb_agg(to_jsonb(p) order by id) from public.point_plans p where organizer_id='55101000-0000-4000-8000-000000000002'),(select value from workspace_before where name='plans'),'all reads preserve plan ID, legacy/bound choice, decisions and revision');
select is((select jsonb_agg(to_jsonb(e) order by id) from public.point_plan_events e where point_plan_id in(select id from public.point_plans where organizer_id='55101000-0000-4000-8000-000000000002')),(select value from workspace_before where name='history'),'all reads preserve old history');

-- New synthetic rows prove whole-collection pagination, never a UI max guess.
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
 select ('55101000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000030','gymnasium','Syntetisk paginerad '||lpad(n::text,2,'0'),'Syntetisk fri kull','ES25','ESBIF' from generate_series(1,55)n;
insert into workspace_results values('page1',public.phase5_list_programplan_offerings(1)),('page2',public.phase5_list_programplan_offerings(2));
select is((select (value->>'count')::int from workspace_results where name='page1'),59,'whole scoped education count over fifty');
select is((select jsonb_array_length(value->'offerings') from workspace_results where name='page1'),50,'first education page contains fifty');
select is((select jsonb_array_length(value->'offerings') from workspace_results where name='page2'),9,'second education page contains remainder');
select is((select count(distinct o->>'id') from workspace_results cross join lateral jsonb_array_elements(value->'offerings') o where name in('page1','page2')),59::bigint,'education pages have no duplicate or missing IDs');
select is(public.phase5_list_programplan_offerings(1),(select value from workspace_results where name='page1'),'education order is stable on repeat');

insert into public.point_plans(id,organizer_id,offering_id,version,status,specialization,decided_on)
 select ('55101000-0000-4000-8000-'||lpad((400+n)::text,12,'0'))::uuid,'55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000042',n,
 case when n=52 then 'utkast'::public.plan_status else 'ersatt'::public.plan_status end,array['UNKNOWN_ORDERED','ENGE3000X'],case when n=52 then null else '2026-01-01'::date end
 from generate_series(1,52)n where n<>3;
insert into workspace_results values('versions1',public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000042',1,null)),('versions2',public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000042',2,null));
select is((select (value->>'versionCount')::int from workspace_results where name='versions2'),52,'version count spans whole education');
select is((select jsonb_array_length(value->'versions') from workspace_results where name='versions1'),50,'first versions page contains fifty');
select is((select jsonb_array_length(value->'versions') from workspace_results where name='versions2'),2,'old versions page contains two');
select ok((select value->'education' @> '{"latestVersion":52,"draftId":"55101000-0000-4000-8000-000000000452"}'::jsonb from workspace_results where name='versions2'),'old page reports max/new draft outside its visible page');
select is((select value->'versions'->0->>'version' from workspace_results where name='versions2'),'2','versions sorted descending without implicit latest selection');
select is((select value->'versions'->1->'legacySpecialization' from workspace_results where name='versions2'),'["UNKNOWN_ORDERED","ENGE3000X"]'::jsonb,'old page retains exact ordered legacy codes');

select pg_temp.programplan_actor('55101000-0000-4000-8000-000000000060','55101000-0000-4000-8000-000000000020','55101000-0000-4000-8000-000000000010','55101000-0000-4000-8000-000000000080');
select is((public.phase5_list_programplan_offerings(1)->>'count')::int,60,'HM sees both actual mandated schools');
select lives_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000043',1,null)$q$,'HM reads second mandated school');
select pg_temp.programplan_actor((select id from programplan_roles where name='admin'),'55101000-0000-4000-8000-000000000023','55101000-0000-4000-8000-000000000013','55101000-0000-4000-8000-000000000083');
select throws_ok($q$select public.phase5_list_programplan_offerings(1)$q$,'42501',null,'administrator has no education-list right');
select throws_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',1,null)$q$,'42501',null,'administrator cannot obtain public catalog through protected education route');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55101000-0000-4000-8000-000000000021','55101000-0000-4000-8000-000000000011','55101000-0000-4000-8000-000000000081');
update public.app_sessions set revoked_at=clock_timestamp() where id='55101000-0000-4000-8000-000000000081';
select throws_ok($q$select public.phase5_list_programplan_offerings(1)$q$,'42501',null,'revoked session prevents list');
select throws_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',1,null)$q$,'42501',null,'revoked session prevents workspace');
update public.app_sessions set revoked_at=null where id='55101000-0000-4000-8000-000000000081';
update public.access_assignments set ended_at=clock_timestamp() where id='55101000-0000-4000-8000-000000000060';
select throws_ok($q$select public.phase5_list_programplan_offerings(1)$q$,'42501',null,'revoked mandate parent prevents list');
select throws_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',1,null)$q$,'42501',null,'revoked mandate parent prevents workspace');
update public.access_assignments set ended_at=null where id='55101000-0000-4000-8000-000000000060';
update public.memberships set status='blocked',blocked_at=clock_timestamp() where id='55101000-0000-4000-8000-000000000021';
select throws_ok($q$select public.phase5_list_programplan_offerings(1)$q$,'42501',null,'blocked membership prevents list');
update public.memberships set status='active',blocked_at=null where id='55101000-0000-4000-8000-000000000021';
update public.customers set closed_at=clock_timestamp() where id='55101000-0000-4000-8000-000000000001';
select throws_ok($q$select public.phase5_list_programplan_offerings(1)$q$,'42501',null,'closed customer prevents list');
update public.customers set closed_at=null where id='55101000-0000-4000-8000-000000000001';

create function pg_temp.fail_workspace_audit() returns trigger language plpgsql as $$begin
 if new.customer_id='55101000-0000-4000-8000-000000000001' and new.action in ('programplan_offerings_listed','programplan_workspace_read') then raise exception 'Synthetic workspace audit failure'; end if; return new; end $$;
create trigger phase5_workspace_audit_probe before insert on public.security_events for each row execute function pg_temp.fail_workspace_audit();
create temporary table workspace_audit_before as select count(*) as count from public.security_events where customer_id='55101000-0000-4000-8000-000000000001';
select throws_ok($q$select public.phase5_list_programplan_offerings(1)$q$,'55000',null,'DB audit failure blocks list');
select throws_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',1,null)$q$,'55000',null,'DB audit failure blocks workspace');
select is((select count(*) from public.security_events where customer_id='55101000-0000-4000-8000-000000000001'),(select count from workspace_audit_before),'failed audit leaves no success events');
drop trigger phase5_workspace_audit_probe on public.security_events;

insert into public.school_units(id,organizer_id,code,name,municipality_code) values('55101000-0000-4000-8000-000000000039','55101000-0000-4000-8000-000000000002','55101039','Syntetisk tom skola','0000');
insert into public.mandate_units values('55101000-0000-4000-8000-000000000060','55101000-0000-4000-8000-000000000001','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000039');
delete from public.mandate_units where assignment_id=(select id from programplan_roles where name='principal');
insert into public.mandate_units values((select id from programplan_roles where name='principal'),'55101000-0000-4000-8000-000000000001','55101000-0000-4000-8000-000000000002','55101000-0000-4000-8000-000000000039');
select is((public.phase5_list_programplan_offerings(1)->>'count')::int,0,'valid school mandate without gymnasieutbildningar yields empty count');
select is(public.phase5_list_programplan_offerings(1)->'offerings','[]'::jsonb,'empty scope yields honest empty list with audit');
select throws_ok($q$select public.phase5_programplan_workspace('55101000-0000-4000-8000-000000000045',1,null)$q$,'42501',null,'removed unit no longer reads workspace');

select ok(not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute'),p.proname||' remains closed to client roles') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('phase5_programplan_education','phase5_programplan_workspace_audit','phase5_list_programplan_offerings','phase5_programplan_workspace');
select ok(not has_function_privilege('skolplattform_worker',p.oid,'execute'),p.proname||' has no Worker grant before own preflight') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('phase5_programplan_education','phase5_programplan_workspace_audit','phase5_list_programplan_offerings','phase5_programplan_workspace');
select * from finish();
rollback;
