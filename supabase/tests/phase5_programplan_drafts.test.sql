begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Preserve the historical ACL profile only inside this rollback-only regression.
revoke execute on function public.phase5_programplan_selection(uuid,text,jsonb),public.phase5_create_programplan_education(uuid,uuid,text,text,text,jsonb),public.phase5_programplan_education_status(uuid),public.phase5_read_programplan_terms(uuid),public.phase5_write_programplan_terms(uuid,integer,jsonb),public.phase5_change_programplan_education(uuid,integer,text,jsonb) from skolplattform_worker;

-- Historical eight-entrypoint profile: explicit local revokes roll back at EOF.
-- The actual final ten-entrypoint ACL is asserted by phase5_programplan_workspace_worker.
revoke execute on function public.phase5_list_programplan_offerings(integer),public.phase5_programplan_workspace(uuid,integer,text) from skolplattform_worker;
-- Programplan fixture: reusable synthetic setup; no grants or assertions.
create function pg_temp.programplan_actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55008000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55008000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.programplan_reference(refs jsonb default '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100}]'::jsonb)
returns jsonb language sql stable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn',to_char(make_date(extract(year from current_date)::integer+1,8,17),'YYYY-MM-DD'),'specializationRefs',refs)$$;
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
-- End programplan fixture.

create temporary table programplan_before(name text primary key,value jsonb);
insert into programplan_before values
 ('legacy', (select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000051')),
 ('decided', (select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000052')),
 ('old_history', (select jsonb_agg(to_jsonb(e) order by e.id) from public.point_plan_events e where point_plan_id='55008000-0000-4000-8000-000000000052'));
create temporary table programplan_results(name text primary key,value jsonb);
create function pg_temp.programplan_legacy_reference() returns jsonb language sql as $$select pg_temp.programplan_reference(
 '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100},{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM1000X","points":100}]'::jsonb)$$;

insert into programplan_results values('read',public.phase5_read_programplan('55008000-0000-4000-8000-000000000050'));
select is((select count(*) from jsonb_object_keys((select value from programplan_results where name='read'))),12::bigint,'read returns exactly the twelve closed result fields');
select ok((select value @> '{"id":"55008000-0000-4000-8000-000000000050","offeringId":"55008000-0000-4000-8000-000000000040","unitId":"55008000-0000-4000-8000-000000000030","version":1,"revision":0,"status":"utkast","resolution":{"status":"resolved","decisionReady":false}}'::jsonb from programplan_results where name='read'),'principal reads the actual pinned draft with closed readiness');
select is((select count(*) from public.security_events where object_id='55008000-0000-4000-8000-000000000050' and action='programplan_read'),1::bigint,'successful read inserts its mandatory DB event');
select ok((select bool_and(source='db' and session_id='55008000-0000-4000-8000-000000000081' and actor_identity_id='55008000-0000-4000-8000-000000000011' and actor_issuer='https://programplan.example.test' and actor_subject='synthetic-principal' and membership_id='55008000-0000-4000-8000-000000000021' and assignment_id=(select id from programplan_roles where name='principal') and customer_id='55008000-0000-4000-8000-000000000001' and correlation_id='55008000-0000-4000-8000-000000000099' and object_type='programplan' and outcome='ok' and details='{}'::jsonb) from public.security_events where object_id='55008000-0000-4000-8000-000000000050'),'audit uses actual session/issuer/identity/mandate and contains no raw plan');
select ok(public.phase5_read_programplan('55008000-0000-4000-8000-000000000051')->'resolution' @> '{"status":"blocked","diagnostics":[{"code":"unpinned_basis"}],"decisionReady":false}'::jsonb,'legacy draft read does not guess a catalog or education date');
select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000051'),(select value from programplan_before where name='legacy'),'legacy read leaves every business field unchanged');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000051',0,'[]')$q$,'42501',null,'unbound legacy draft cannot bypass explicit binding through replacement');

select throws_ok($q$select public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000051',0,pg_temp.programplan_reference())$q$,'22023',null,'binding cannot silently remove a legacy selected level');
select throws_ok($q$select public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000051',0,pg_temp.programplan_reference('[{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM1000X","points":100},{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100}]'))$q$,'22023',null,'binding cannot reorder older selected levels');
select throws_ok($q$select public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000051',0,pg_temp.programplan_legacy_reference()-'startedOn')$q$,'22023',null,'free cohort text does not supply missing explicit start');
select throws_ok($q$select public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000051',0,jsonb_set(pg_temp.programplan_legacy_reference(),'{orientationCode}','"SASAP"'))$q$,'22023',null,'binding must match the offering actual orientation');
select throws_ok($q$select public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000051',0,jsonb_set(pg_temp.programplan_legacy_reference(),'{programRef}','{"code":"EK25","version":4}'))$q$,'22023',null,'binding must match the offering actual program');
select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000051'),(select value from programplan_before where name='legacy'),'invalid legacy binding leaves original date/choices/revision/null basis unchanged');
insert into programplan_results values('bound',public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000051',0,pg_temp.programplan_legacy_reference()));
select ok((select specialization=array['ENGE3000X','ANIM1000X'] and revision=1 and basis_reference=pg_temp.programplan_legacy_reference() and catalog_id=pg_temp.programplan_reference()->>'catalogId' and catalog_fetched='2026-09-05' and decided_on is null and status='utkast' and version=1 from public.point_plans where id='55008000-0000-4000-8000-000000000051'),'explicit binding preserves old ordered choices/version and advances revision once');
select is((select count(*) from public.security_events where object_id='55008000-0000-4000-8000-000000000051' and action='programplan_basis_bound'),1::bigint,'binding has exactly one separate successful audit');
select throws_ok($q$select public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000051',1,pg_temp.programplan_legacy_reference())$q$,'40001',null,'a pinned draft cannot be rebound');

select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',0,'[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":"100"}]')$q$,'22023',null,'replacement rejects numeric coercion');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',0,'[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100,"role":"huvudman"}]')$q$,'22023',null,'replacement rejects nested authority field');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',0,'[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100},{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100}]')$q$,'22023',null,'replacement rejects duplicate selected levels');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',0,'[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE1000X","points":100}]')$q$,'22023',null,'fixed level cannot become new specialization');
insert into programplan_results values('replaced',public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',0,pg_temp.programplan_legacy_reference()->'specializationRefs'));
select ok((select revision=1 and specialization=array['ENGE3000X','ANIM1000X'] and basis_reference=pg_temp.programplan_legacy_reference() and status='utkast' and decided_on is null from public.point_plans where id='55008000-0000-4000-8000-000000000050'),'replace stores the complete ordered choice set and matching basis once');
select ok((select value->'resolution' @> '{"status":"resolved","decisionReady":false}'::jsonb from programplan_results where name='replaced'),'incomplete national choices remain a technical draft, not a decision');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',0,'[]')$q$,'40001',null,'stale revision cannot overwrite winner choices');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',-1,'[]')$q$,'22023',null,'negative expected revision rejected');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',null,'[]')$q$,'22023',null,'null expected revision rejected');

select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
select lives_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000053')$q$,'HM reads actual second mandated school');
select lives_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',1,'[]')$q$,'HM may author draft choices directly');
select ok((select revision=2 and specialization='{}'::text[] and basis_reference->'specializationRefs'='[]'::jsonb and status='utkast' from public.point_plans where id='55008000-0000-4000-8000-000000000050'),'explicit empty selection is stored as an unfinished draft');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000053')$q$,'42501',null,'principal cannot read another school in same organizer');
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000999')$q$,'42501',null,'missing plan has the same scope denial');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000053',999,'[]')$q$,'42501',null,'foreign school denied before exposing revision conflict');
select pg_temp.programplan_actor((select id from programplan_roles where name='admin'),'55008000-0000-4000-8000-000000000023','55008000-0000-4000-8000-000000000013','55008000-0000-4000-8000-000000000083');
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'42501',null,'administrator gains no programplan read mandate');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',2,'[]')$q$,'42501',null,'administrator gains no programplan draft mandate');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
select set_config('app.app_role','huvudman',true);
select is((public.phase3_actor()).function::text,'rektor','client role hint cannot replace the actual mandate');

select set_config('app.session_id','',true);
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'42501',null,'session is mandatory even for privileged synthetic SQL');
select set_config('app.session_id','55008000-0000-4000-8000-000000000082',true);
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',2,'[]')$q$,'42501',null,'another principal session cannot replace actor context');
select set_config('app.session_id','55008000-0000-4000-8000-000000000081',true);
update public.app_sessions set revoked_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000081';
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',2,'[]')$q$,'42501',null,'revoked session cannot write');
update public.app_sessions set revoked_at=null,expires_at=clock_timestamp()-interval '1 minute' where id='55008000-0000-4000-8000-000000000081';
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'42501',null,'expired ordinary session denied');
update public.app_sessions set expires_at=clock_timestamp()-interval '1 minute',absolute_expires_at=clock_timestamp()-interval '1 minute' where id='55008000-0000-4000-8000-000000000081';
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'42501',null,'expired absolute session denied');
update public.app_sessions set expires_at=clock_timestamp()+interval '1 hour',absolute_expires_at=clock_timestamp()+interval '8 hours' where id='55008000-0000-4000-8000-000000000081';
update public.access_assignments set ended_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000060';
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',2,'[]')$q$,'42501',null,'revoked giving HM invalidates inherited principal mandate');
update public.access_assignments set ended_at=null where id='55008000-0000-4000-8000-000000000060';
update public.memberships set status='blocked',blocked_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000021';
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'42501',null,'blocked membership denied');
update public.memberships set status='active',blocked_at=null where id='55008000-0000-4000-8000-000000000021';
update public.customers set closed_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000001';
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'42501',null,'closed customer denied');
update public.customers set closed_at=null where id='55008000-0000-4000-8000-000000000001';
select is((select revision from public.point_plans where id='55008000-0000-4000-8000-000000000050'),2,'all role/session/revocation denials preserve the winner revision');
select is((select count(*) from public.security_events where object_id='55008000-0000-4000-8000-000000000050' and action='programplan_specialization_changed'),2::bigint,'denied calls add no successful mutation audit');

select throws_ok($q$update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}','"2026-09-01"') where id='55008000-0000-4000-8000-000000000050'$q$,'40001',null,'pinned education start cannot be changed directly without revision');
-- 05-20: startdatumet i ett utkast får ändras via update-kommandot (revision +1); direkt ändring utan revision ger nu 40001 i stället för 42501.
select throws_ok($q$update public.point_plans set basis_reference=jsonb_set(basis_reference,'{orientationCode}','"SASAP"') where id='55008000-0000-4000-8000-000000000050'$q$,'42501',null,'pinned orientation cannot be changed directly');
select throws_ok($q$update public.point_plans set status='faststalld',decided_on=public.app_today() where id='55008000-0000-4000-8000-000000000050'$q$,'42501',null,'there is no new direct fastställande path');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000052',0,'[]')$q$,'42501',null,'older decided source cannot be edited');
select throws_ok($q$select public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000052',0,pg_temp.programplan_reference())$q$,'42501',null,'older decided source cannot be bound in place');

select throws_ok($q$select public.phase5_create_programplan_draft('55008000-0000-4000-8000-000000000040',1,pg_temp.programplan_reference())$q$,'40001',null,'create cannot open a second draft');
select throws_ok($q$select public.phase5_create_programplan_draft('55008000-0000-4000-8000-000000000045',1,jsonb_set(jsonb_set(pg_temp.programplan_reference('[]'),'{programRef}','{"code":"ES25","version":3}'),'{orientationCode}','"ESBIF"'))$q$,'40001',null,'create requires actual latest version zero for an empty offering');
select throws_ok($q$select public.phase5_create_programplan_draft('55008000-0000-4000-8000-000000000045',0,pg_temp.programplan_reference('[]'))$q$,'22023',null,'create must match the offering actual program/orientation');
insert into programplan_results values('created',public.phase5_create_programplan_draft('55008000-0000-4000-8000-000000000045',0,jsonb_set(jsonb_set(pg_temp.programplan_reference('[]'),'{programRef}','{"code":"ES25","version":3}'),'{orientationCode}','"ESBIF"')));
select ok((select value @> '{"version":1,"revision":0,"status":"utkast","decidedOn":null,"resolution":{"status":"resolved","decisionReady":false}}'::jsonb and value->>'id'<>'55008000-0000-4000-8000-000000000050' from programplan_results where name='created'),'create returns actual new ID/version/revision with no decision');
select is((select count(*) from public.point_plans where offering_id='55008000-0000-4000-8000-000000000045' and status='utkast'),1::bigint,'create stores exactly one open draft');
-- 05-20: okänd start (fastställd utan startunderlag) är låst. Ett framtida startår ger en framtida plan så att
-- klonens egna valideringar prövas som förut.
update public.offerings set start_year=extract(year from current_date)::integer+1 where id='55008000-0000-4000-8000-000000000042';
select throws_ok($q$select public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000052',0,3,null)$q$,'22023',null,'unbound decided source requires explicit legacy basis');
select throws_ok($q$select public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000052',0,2,pg_temp.programplan_reference())$q$,'40001',null,'clone checks current latest business version');
select throws_ok($q$select public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000052',1,3,pg_temp.programplan_reference())$q$,'40001',null,'clone checks source revision');
insert into programplan_results values('cloned',public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000052',0,3,pg_temp.programplan_reference()));
select ok((select value @> '{"version":4,"revision":0,"status":"utkast","decidedOn":null,"resolution":{"decisionReady":false}}'::jsonb and value->>'id'<>'55008000-0000-4000-8000-000000000052' and value->'basisReference'=pg_temp.programplan_reference() from programplan_results where name='cloned'),'explicit legacy clone creates max+1 with the exact original selected choices');
select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000052'),(select value from programplan_before where name='decided'),'cloning leaves all old source ID/status/decision/choices/null-basis fields untouched');
select is((select jsonb_agg(to_jsonb(e) order by e.id) from public.point_plan_events e where point_plan_id='55008000-0000-4000-8000-000000000052'),(select value from programplan_before where name='old_history'),'clone never copies or rewrites source decision history');
select ok((select details=jsonb_build_object('sourcePlanId','55008000-0000-4000-8000-000000000052') and source='db' and session_id='55008000-0000-4000-8000-000000000081' from public.security_events where object_id=((select value->>'id' from programplan_results where name='cloned')::uuid) and action='programplan_draft_cloned'),'clone audit contains only server-derived source plan metadata');

-- A future decided pinned source is synthetic test setup, not an opened decision command.
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
values('55008000-0000-4000-8000-000000000046','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk bunden beslutad källa','Syntetiskt prov','SA25','SABEP');
set local session_replication_role=replica;
insert into public.point_plans(id,organizer_id,offering_id,version,status,decided_on,specialization,catalog_id,basis_reference)
values('55008000-0000-4000-8000-000000000056','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000046',2,'faststalld','2026-09-11',array['ENGE3000X'],pg_temp.programplan_reference()->>'catalogId',pg_temp.programplan_reference());
set local session_replication_role=origin;
insert into programplan_before values('pinned_source',(select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000056'));
select is(public.phase5_read_programplan('55008000-0000-4000-8000-000000000056')->'resolution'->>'status','resolved','synthetic future pinned source has valid exact references');
select throws_ok($q$select public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000056',0,2,pg_temp.programplan_reference())$q$,'22023',null,'pinned source rejects caller-supplied replacement basis');
insert into programplan_results values('pinned_cloned',public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000056',0,2,null));
select ok((select value->'basisReference'=pg_temp.programplan_reference() and value @> '{"version":3,"revision":0,"status":"utkast","decidedOn":null,"resolution":{"decisionReady":false}}'::jsonb from programplan_results where name='pinned_cloned'),'bound source clone preserves the frozen core and exact ordered selections');
select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000056'),(select value from programplan_before where name='pinned_source'),'bound clone leaves the decided source byte-for-byte unchanged');
select throws_ok($q$select public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000056',0,3,null)$q$,'40001',null,'second clone cannot create another open draft');

-- Separate foreign customer; every row is synthetic and rolled back below.
insert into public.customers(id,name) values('55008000-0000-4000-8000-000000000101','Annan syntetisk programplanskund');
insert into public.organizers(id,customer_id,name,type) values('55008000-0000-4000-8000-000000000102','55008000-0000-4000-8000-000000000101','Annan syntetisk huvudman','Kommun');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values('55008000-0000-4000-8000-000000000130','55008000-0000-4000-8000-000000000102','55008130','Annan syntetisk kundskola','0000');
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values('55008000-0000-4000-8000-000000000140','55008000-0000-4000-8000-000000000102','55008000-0000-4000-8000-000000000130','gymnasium','Annan syntetisk utbildning','Syntetiskt prov','SA25','SABEP');
insert into public.point_plans(id,organizer_id,offering_id,version) values('55008000-0000-4000-8000-000000000150','55008000-0000-4000-8000-000000000102','55008000-0000-4000-8000-000000000140',1);
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000150')$q$,'42501',null,'another customer plan has the same scope denial');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000150',999,'[]')$q$,'42501',null,'another customer is denied before revision/basis disclosure');
-- Deliberately broken historical FK relations, only within this rollback fixture.
-- Parent membership mismatch leaves the current actor and its valid school unchanged.
set local session_replication_role=replica;
update public.memberships set customer_id='55008000-0000-4000-8000-000000000101' where id='55008000-0000-4000-8000-000000000020';
set local session_replication_role=origin;
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'42501',null,'parent membership from another customer invalidates otherwise live inherited mandate');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',2,'[]')$q$,'42501',null,'parent broken membership/customer relation cannot write');
set local session_replication_role=replica;
update public.memberships set customer_id='55008000-0000-4000-8000-000000000001' where id='55008000-0000-4000-8000-000000000020';
update public.memberships set customer_id='55008000-0000-4000-8000-000000000101' where id='55008000-0000-4000-8000-000000000021';
set local session_replication_role=origin;
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'42501',null,'current membership/customer mismatch cannot rely on matching session IDs');
set local session_replication_role=replica;
update public.memberships set customer_id='55008000-0000-4000-8000-000000000001' where id='55008000-0000-4000-8000-000000000021';
set local session_replication_role=origin;
select lives_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'restored actual current and parent membership relations remain readable');
select is((select revision from public.point_plans where id='55008000-0000-4000-8000-000000000050'),2,'broken actor/FK denials never change the draft revision');
-- Existing legacy shape permits these mismatches; scope must independently reject them.
insert into public.point_plans(id,organizer_id,offering_id,version,status,decided_on)
values('55008000-0000-4000-8000-000000000151','55008000-0000-4000-8000-000000000102','55008000-0000-4000-8000-000000000040',2,'ersatt','2026-09-12');
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000151')$q$,'42501',null,'broken plan/organizer/offering relation is not accepted as scoped');
-- Avsiktligt skadat legacy-underlag: 05-21:s FK/trigger hindrar att det skapas normalt.
-- Replikläget gäller bara denna syntetiska injektion; läsprovet körs med vanliga regler.
set local session_replication_role=replica;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
values('55008000-0000-4000-8000-000000000141','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000130','gymnasium','Syntetiskt bruten skolrelation','Syntetiskt prov','SA25','SABEP');
insert into public.point_plans(id,organizer_id,offering_id,version) values('55008000-0000-4000-8000-000000000152','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000141',1);
set local session_replication_role=origin;
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000152')$q$,'42501',null,'broken offering/school/organizer relation is denied');

select is((select count(*) from public.point_plan_events where point_plan_id='55008000-0000-4000-8000-000000000050'),2::bigint,'two successful replacements each create one business history row');
select ok((select bool_and(e.actor is null and e.actor_identity_id=s.identity_id and e.membership_id=s.membership_id and e.assignment_id=s.assignment_id and e.action='programplan_specialization_changed') from public.point_plan_events e join public.app_sessions s on s.id=e.session_id where e.point_plan_id='55008000-0000-4000-8000-000000000050'),'new history references actual session actor rather than invented auth.users IDs');
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
values('55008000-0000-4000-8000-000000000048','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetiskt återställande skapandeprov','Syntetiskt prov','SA25','SABEP');
insert into programplan_before values
 ('rollback_plan',(select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000050')),
 ('rollback_history',(select jsonb_agg(to_jsonb(e) order by e.id) from public.point_plan_events e where point_plan_id='55008000-0000-4000-8000-000000000050')),
 ('rollback_audit',(select jsonb_agg(to_jsonb(e) order by e.id) from public.security_events e where object_id='55008000-0000-4000-8000-000000000050')),
 ('created_history_count',to_jsonb((select count(*) from public.point_plan_events where action='programplan_draft_created'))),
 ('created_audit_count',to_jsonb((select count(*) from public.security_events where customer_id='55008000-0000-4000-8000-000000000001' and action='programplan_draft_created')));
create function pg_temp.fail_programplan_audit() returns trigger language plpgsql as $$begin
 if new.customer_id='55008000-0000-4000-8000-000000000001' and new.action in ('programplan_read','programplan_specialization_changed','programplan_draft_created') then raise exception 'Synthetic programplan audit failure' using errcode='P0001'; end if; return new;
end $$;
create trigger programplan_test_audit_failure before insert on public.security_events for each row execute function pg_temp.fail_programplan_audit();
select throws_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'55000',null,'read never returns a plan when mandatory DB audit INSERT fails');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',2,pg_temp.programplan_reference()->'specializationRefs')$q$,'55000',null,'DB audit INSERT failure closes and rolls back the whole replacement');
select throws_ok($q$select public.phase5_create_programplan_draft('55008000-0000-4000-8000-000000000048',0,pg_temp.programplan_reference())$q$,'55000',null,'create audit failure restores the newly inserted plan and history');
drop trigger programplan_test_audit_failure on public.security_events;
select is((select count(*) from public.point_plans where offering_id='55008000-0000-4000-8000-000000000048'),0::bigint,'failed create leaves no version or open draft');
select is(to_jsonb((select count(*) from public.point_plan_events where action='programplan_draft_created')),(select value from programplan_before where name='created_history_count'),'failed create leaves no successful business history');
select is(to_jsonb((select count(*) from public.security_events where customer_id='55008000-0000-4000-8000-000000000001' and action='programplan_draft_created')),(select value from programplan_before where name='created_audit_count'),'failed create leaves no successful security event');
select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000050'),(select value from programplan_before where name='rollback_plan'),'audit failure restores complete plan/basis/choices/revision');
select is((select jsonb_agg(to_jsonb(e) order by e.id) from public.point_plan_events e where point_plan_id='55008000-0000-4000-8000-000000000050'),(select value from programplan_before where name='rollback_history'),'audit failure also restores business history');
select is((select jsonb_agg(to_jsonb(e) order by e.id) from public.security_events e where object_id='55008000-0000-4000-8000-000000000050'),(select value from programplan_before where name='rollback_audit'),'audit failure adds no successful security event');
create function pg_temp.fail_programplan_history() returns trigger language plpgsql as $$begin
 if new.point_plan_id='55008000-0000-4000-8000-000000000050' then raise exception 'Synthetic late programplan history failure' using errcode='P0001'; end if; return new;
end $$;
create trigger programplan_test_history_failure before insert on public.point_plan_events for each row execute function pg_temp.fail_programplan_history();
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',2,pg_temp.programplan_reference()->'specializationRefs')$q$,'P0001',null,'late business history failure propagates rather than being mislabeled audit unavailable');
drop trigger programplan_test_history_failure on public.point_plan_events;
select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000050'),(select value from programplan_before where name='rollback_plan'),'late history failure restores plan/revision/pinned core');
select is((select jsonb_agg(to_jsonb(e) order by e.id) from public.point_plan_events e where point_plan_id='55008000-0000-4000-8000-000000000050'),(select value from programplan_before where name='rollback_history'),'late history failure leaves no partial history');
select is((select jsonb_agg(to_jsonb(e) order by e.id) from public.security_events e where object_id='55008000-0000-4000-8000-000000000050'),(select value from programplan_before where name='rollback_audit'),'late history failure leaves no successful DB audit');
create function pg_temp.programplan_caller_failure() returns void language plpgsql as $$begin
 perform public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',2,pg_temp.programplan_reference()->'specializationRefs');
 raise exception 'Synthetic mandatory caller failure after actual SQL command' using errcode='P0001';
end $$;
select throws_ok($q$select pg_temp.programplan_caller_failure()$q$,'P0001',null,'subsequent caller failure composes with the real SQL command');
select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000050'),(select value from programplan_before where name='rollback_plan'),'caller failure rolls back business data and revision');
select is((select jsonb_agg(to_jsonb(e) order by e.id) from public.point_plan_events e where point_plan_id='55008000-0000-4000-8000-000000000050'),(select value from programplan_before where name='rollback_history'),'caller failure rolls back successful business history');
select is((select jsonb_agg(to_jsonb(e) order by e.id) from public.security_events e where object_id='55008000-0000-4000-8000-000000000050'),(select value from programplan_before where name='rollback_audit'),'caller failure rolls back successful DB audit, not a Worker/API proof');

select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000052'),(select value from programplan_before where name='decided'),'all tests preserve the old decided plan and its nullable actor semantics');
select is((select count(*) from public.point_plans where offering_id='55008000-0000-4000-8000-000000000042' and status='faststalld'),1::bigint,'old decided version remains the single decided version');
select is((select count(*) from public.point_plans where offering_id='55008000-0000-4000-8000-000000000042' and status='utkast'),1::bigint,'clone leaves exactly one open draft beside the previous decision');
select ok(not has_table_privilege(r,'public.point_plan_events','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'all direct history SELECT/DML privileges closed for '||r) from unnest(array['anon','authenticated','skolplattform_worker'])r;
select ok(not has_table_privilege(r,'public.point_plans','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'all direct plan SELECT/DML privileges closed for '||r) from unnest(array['anon','authenticated','skolplattform_worker'])r;
select is((select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%programplan%' and has_function_privilege(r,p.oid,'EXECUTE')),case when r='skolplattform_worker' then 5::bigint else 0::bigint end,'exact programplan entrypoint count, helpers closed for '||r) from unnest(array['anon','authenticated','skolplattform_worker'])r;
select is((select count(*) from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%programplan%' and acl.grantee=0 and acl.privilege_type='EXECUTE'),0::bigint,'PUBLIC has no new programplan execute right');
select is((select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and has_function_privilege('skolplattform_worker',p.oid,'EXECUTE')),8::bigint,'final transport preserves the exact eight-function phase5 Worker grant set');
select * from finish();
rollback;
