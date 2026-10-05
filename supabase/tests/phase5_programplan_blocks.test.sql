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
returns jsonb language sql stable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn',to_char(make_date(extract(year from current_date)::integer+1,8,17),'YYYY-MM-DD'),'specializationRefs',refs,'choiceBlocks','[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]'::jsonb)$$;
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

-- Foundation B entrypoint remains closed until separate preflight grant.
select ok(not has_function_privilege('anon','public.phase5_replace_programplan_blocks(uuid,integer,jsonb)','execute'),'block entrypoint closed to anon');
select ok(not has_function_privilege('authenticated','public.phase5_replace_programplan_blocks(uuid,integer,jsonb)','execute'),'block entrypoint closed to authenticated');
select ok(not has_function_privilege('skolplattform_worker','public.phase5_programplan_upgrade_shape(jsonb)','execute'),'upgrade helper closed to Worker');
select is(public.phase5_programplan_upgrade_shape(pg_temp.programplan_reference()-'choiceBlocks'),pg_temp.programplan_reference(),'legacy basis upgraded exactly');
select is(public.phase5_programplan_upgrade_shape(pg_temp.programplan_reference()),pg_temp.programplan_reference(),'v2 basis unchanged');
select is(public.phase5_programplan_upgrade_terms(pg_temp.programplan_reference()-'choiceBlocks','[{"rowKey":"foundation:ENGE:1:ENGE1000X","points":[50,50,0,0,0,0]},{"rowKey":"meta:individualChoice","points":[0,0,50,50,50,50]}]'),
 '[{"rowKey":"foundation:ENGE:1:ENGE1000X","points":[50,50,0,0,0,0]},{"rowKey":"block:iv1","points":[0,0,50,50,50,50]}]'::jsonb,'all applicable terms and ordering preserved, IV moved');
select throws_ok($q$select public.phase5_programplan_upgrade_terms(pg_temp.programplan_reference()-'choiceBlocks','[{"rowKey":"foundation:SVEN:1:SVEN1000X","points":[100,0,0,0,0,0]}]')$q$,'22023',null,'unsupported legacy Swedish terms never silently dropped');
select throws_ok($q$select public.phase5_create_programplan_draft('55008000-0000-4000-8000-000000000045',0,pg_temp.programplan_reference()-'choiceBlocks')$q$,'22023',null,'create refuses legacy input');
select throws_ok($q$select public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000051',0,pg_temp.programplan_reference()-'choiceBlocks')$q$,'22023',null,'bind refuses legacy input');
select throws_ok($q$insert into public.point_plans(organizer_id,offering_id,version,specialization,catalog_id,basis_reference) values('55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000045',1,'{}',pg_temp.programplan_reference()->>'catalogId',pg_temp.programplan_reference()-'choiceBlocks')$q$,'22023',null,'new bound legacy INSERT refused');
select throws_ok($q$update public.point_plans set basis_reference=basis_reference-'choiceBlocks',revision=revision+1 where id='55008000-0000-4000-8000-000000000050'$q$,'22023',null,'v2 draft cannot downgrade shape through direct update');
create temporary table block_result(value jsonb);
insert into block_result values(public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',0,
 '[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":100,"name":"IV ett"},{"id":"iv2","kind":"individualChoice","points":100,"name":"IV två"},{"id":"sp1","kind":"specialization","points":100,"name":"Fördjupning"}]'));
select is((select value->>'revision' from block_result),'1','split IV and specialization advances CAS once');
select is(public.phase5_read_programplan('55008000-0000-4000-8000-000000000050'),(select value from block_result),'blocks read back exactly');
select is((select count(*) from public.point_plan_events where point_plan_id='55008000-0000-4000-8000-000000000050' and action='programplan_blocks_changed' and session_id='55008000-0000-4000-8000-000000000081'),1::bigint,'session-bound block history');
select is((select count(*) from public.security_events where object_id='55008000-0000-4000-8000-000000000050' and source='db' and action='programplan_blocks_changed'),1::bigint,'atomic DB audit');
select throws_ok($q$select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',0,pg_temp.programplan_reference()->'choiceBlocks')$q$,'40001',null,'stale CAS refused');
select throws_ok($q$select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',1,'[{"id":"mosp","kind":"modernLanguage","points":100,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]')$q$,'22023',null,'slot points immutable');
select throws_ok($q$select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',1,'[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":201,"name":"Individuellt val"}]')$q$,'22023',null,'IV over 200 refused');
select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',1,'[{"rowKey":"block:sp1","points":[0,0,0,0,50,50]}]');
select throws_ok($q$select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',2,pg_temp.programplan_reference()->'choiceBlocks')$q$,'22023',null,'allocated removed block refused');
select pg_temp.programplan_actor((select id from programplan_roles where name='admin'),'55008000-0000-4000-8000-000000000023','55008000-0000-4000-8000-000000000013','55008000-0000-4000-8000-000000000083');
select throws_ok($q$select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',2,pg_temp.programplan_reference()->'choiceBlocks')$q$,'42501',null,'administrator cannot edit plan');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
update public.offerings set archived_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000040';
select throws_ok($q$select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',2,pg_temp.programplan_reference()->'choiceBlocks')$q$,'42501',null,'archived education denied');
update public.offerings set archived_at=null where id='55008000-0000-4000-8000-000000000040';
-- Realistic bound historical source: use replica only for old sealed row fixture.
set local session_replication_role=replica;
update public.point_plans set catalog_id=pg_temp.programplan_reference()->>'catalogId',basis_reference=pg_temp.programplan_reference()-'choiceBlocks',term_distribution='[{"rowKey":"meta:individualChoice","points":[0,0,50,50,50,50]}]' where id='55008000-0000-4000-8000-000000000052';
set local session_replication_role=origin;
create temporary table sealed_before as select to_jsonb(p) value from public.point_plans p where id='55008000-0000-4000-8000-000000000052';
insert into block_result values(public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000052',0,3,null));
select ok((select value->'basisReference' ? 'choiceBlocks' from block_result where value->>'version'='4'),'clone upgrades bound legacy source');
select is((select term_distribution from public.point_plans where offering_id='55008000-0000-4000-8000-000000000042' and version=4),'[{"rowKey":"block:iv1","points":[0,0,50,50,50,50]}]'::jsonb,'clone migrates IV allocation');
select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000052'),(select value from sealed_before),'sealed source entire row unchanged');
-- Late audit failure must undo revision, block edits, and session-bound history.
create temporary table audit_plan_before as select to_jsonb(p) value from public.point_plans p where id='55008000-0000-4000-8000-000000000050';
create temporary table audit_history_before as select to_jsonb(e) value from public.point_plan_events e where point_plan_id='55008000-0000-4000-8000-000000000050';
create function pg_temp.block_audit_failure() returns trigger language plpgsql as $$begin if new.action='programplan_blocks_changed' and new.object_id='55008000-0000-4000-8000-000000000050' then raise exception 'Synthetic block audit unavailable';end if;return new;end $$;
create trigger synthetic_block_audit_failure before insert on public.security_events for each row execute function pg_temp.block_audit_failure();
select throws_ok($q$select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',2,(select basis_reference->'choiceBlocks' from public.point_plans where id='55008000-0000-4000-8000-000000000050'))$q$,'55000',null,'block DB audit failure closes whole command');
select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000050'),(select value from audit_plan_before),'audit failure preserves entire plan row');
select is((select jsonb_agg(to_jsonb(e) order by id) from public.point_plan_events e where point_plan_id='55008000-0000-4000-8000-000000000050'),(select jsonb_agg(value order by value->>'id') from audit_history_before),'audit failure preserves entire history');
select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',2,'[]');
select throws_ok($q$select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',3,pg_temp.programplan_reference()->'choiceBlocks')$q$,'55000',null,'audit failure rolls back removal and retired IDs');
select ok((select revision=3 and basis_reference->'choiceBlocks' @> '[{"id":"sp1"}]'::jsonb from public.point_plans where id='55008000-0000-4000-8000-000000000050'),'failed removal preserves revision and original ID');
select ok(not exists(select 1 from public.point_plan_events where point_plan_id='55008000-0000-4000-8000-000000000050' and action='programplan_blocks_changed' and comment::jsonb @> '{"retiredBlockIds":["sp1"]}'),'failed removal commits no retired-ID history');
drop trigger synthetic_block_audit_failure on public.security_events;
select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',3,pg_temp.programplan_reference()->'choiceBlocks');
select ok(exists(select 1 from public.point_plan_events where point_plan_id='55008000-0000-4000-8000-000000000050' and action='programplan_blocks_changed' and comment::jsonb @> '{"retiredBlockIds":["iv2","sp1"]}'),'removed IDs retained in closed actor-bound history');
select throws_ok($q$select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',4,pg_temp.programplan_reference()->'choiceBlocks'||'[{"id":"sp1","kind":"specialization","points":100,"name":"Ny användning"}]'::jsonb)$q$,'22023','Retired programplan block id','retired ID cannot be reused');
select ok((select revision=4 and not basis_reference->'choiceBlocks' @> '[{"id":"sp1"}]'::jsonb from public.point_plans where id='55008000-0000-4000-8000-000000000050'),'retired-ID refusal preserves revision and blocks');
select * from finish();
rollback;
