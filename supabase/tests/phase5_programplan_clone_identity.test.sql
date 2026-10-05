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

-- Historical identity regression: v1 retains pf1, v2 retires it, clone from v1 retains it.
create temporary table identity_versions(name text primary key,value jsonb);
insert into identity_versions values('v1',public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',0,
 pg_temp.programplan_reference()->'choiceBlocks'||'[{"id":"pf1","kind":"specialization","points":100,"name":"Ursprungligt block"}]'::jsonb));
set local session_replication_role=replica;
update public.point_plans set status='faststalld',decided_on=public.app_today() where id='55008000-0000-4000-8000-000000000050';
set local session_replication_role=origin;
insert into identity_versions values('v2',public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000050',1,1,null));
select is((select value->'basisReference' from identity_versions where name='v2'),(select value->'basisReference' from identity_versions where name='v1'),'first clone retains complete blocks');
select public.phase5_replace_programplan_blocks((select(value->>'id')::uuid from identity_versions where name='v2'),0,pg_temp.programplan_reference()->'choiceBlocks');
set local session_replication_role=replica;
update public.point_plans set status='ersatt' where offering_id='55008000-0000-4000-8000-000000000040' and version=1;
update public.point_plans set status='faststalld',decided_on=public.app_today() where offering_id='55008000-0000-4000-8000-000000000040' and version=2;
set local session_replication_role=origin;
create temporary table identity_sealed_before as select id,to_jsonb(p) value from public.point_plans p where offering_id='55008000-0000-4000-8000-000000000040';
select throws_ok($q$select public.phase5_create_programplan_draft('55008000-0000-4000-8000-000000000040',2,(select value->'basisReference' from identity_versions where name='v1'))$q$,'22023','Retired programplan block id','create cannot introduce retired identity');
-- A caller-supplied GUC must not open the create command.
select set_config('app.programplan_clone_source','55008000-0000-4000-8000-000000000050',true);
select throws_ok($q$select public.phase5_create_programplan_draft('55008000-0000-4000-8000-000000000040',2,(select value->'basisReference' from identity_versions where name='v1'))$q$,'22023','Retired programplan block id','create ignores forged clone context');
select set_config('app.programplan_clone_source','',true);
create function pg_temp.clone_older_and_edit() returns void language plpgsql as $$declare plan jsonb; begin
 plan:=public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000050',1,2,null);
 insert into identity_versions values('v3',plan);
 plan:=public.phase5_replace_programplan_blocks((plan->>'id')::uuid,0,
 plan->'basisReference'->'choiceBlocks'||'[{"id":"pf2","kind":"specialization","points":100,"name":"Ytterligare block"}]'::jsonb);
 insert into identity_versions values('v3edit',plan);
end $$;
select lives_ok($q$select pg_temp.clone_older_and_edit()$q$,'older sealed source clones and retains pf1 through other block edit');
select ok((select value->'basisReference'->'choiceBlocks' @> '[{"id":"pf1","kind":"specialization","points":100,"name":"Ursprungligt block"}]'::jsonb from identity_versions where name='v3edit'),'original block identity and contents retained');
select ok((select value->'basisReference'->'choiceBlocks' @> '[{"id":"pf2"}]'::jsonb and value->>'revision'='1' from identity_versions where name='v3edit'),'other block edit advances revision normally');
select ok(not exists(select 1 from identity_sealed_before b join public.point_plans p on p.id=b.id where to_jsonb(p) is distinct from b.value),'both sealed source rows wholly preserved');
select is(coalesce(current_setting('app.programplan_clone_source',true),''),'','clone context restored after success');
-- Remove the restored block in v3; reintroducing it is still a new identity and is denied.
select lives_ok($q$select public.phase5_replace_programplan_blocks((select(value->>'id')::uuid from identity_versions where name='v3edit'),1,
 (select jsonb_agg(b order by n) from jsonb_array_elements((select value->'basisReference'->'choiceBlocks' from identity_versions where name='v3edit')) with ordinality e(b,n) where b->>'id'<>'pf1'))$q$,'restored block may be removed deliberately');
select throws_ok($q$select public.phase5_replace_programplan_blocks((select(value->>'id')::uuid from identity_versions where name='v3edit'),2,
 (select value->'basisReference'->'choiceBlocks' from identity_versions where name='v3edit'))$q$,'22023','Retired programplan block id','block command cannot reuse identity after removal');
-- A late clone audit failure must roll back insert, actor history and any temporary context.
set local session_replication_role=replica;
update public.point_plans set status='ersatt' where offering_id='55008000-0000-4000-8000-000000000040' and version=2;
update public.point_plans set status='faststalld',decided_on=public.app_today() where offering_id='55008000-0000-4000-8000-000000000040' and version=3;
set local session_replication_role=origin;
create temporary table clone_audit_before as select to_jsonb(p) value from public.point_plans p where offering_id='55008000-0000-4000-8000-000000000040';
create temporary table clone_history_before as select to_jsonb(e) value from public.point_plan_events e where point_plan_id in(select id from public.point_plans where offering_id='55008000-0000-4000-8000-000000000040');
create function pg_temp.identity_clone_audit_failure() returns trigger language plpgsql as $$begin if new.action='programplan_draft_cloned' then raise exception 'Synthetic clone audit unavailable';end if;return new;end $$;
create trigger synthetic_identity_clone_audit_failure before insert on public.security_events for each row execute function pg_temp.identity_clone_audit_failure();
select throws_ok($q$select public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000050',1,3,null)$q$,'55000','Programplan audit unavailable','clone audit failure remains atomic');
select is((select jsonb_agg(to_jsonb(p) order by p.id) from public.point_plans p where offering_id='55008000-0000-4000-8000-000000000040'),(select jsonb_agg(value order by value->>'id') from clone_audit_before),'audit failure preserves every version full row');
select is((select jsonb_agg(to_jsonb(e) order by e.id) from public.point_plan_events e where point_plan_id in(select id from public.point_plans where offering_id='55008000-0000-4000-8000-000000000040')),(select jsonb_agg(value order by value->>'id') from clone_history_before),'audit failure preserves complete actor history');
select is(coalesce(current_setting('app.programplan_clone_source',true),''),'','clone context restored after audit rollback');
select ok(not has_function_privilege('skolplattform_worker','public.phase5_programplan_require_unused_block_ids(uuid,jsonb)','execute'),'retired-ID helper stays closed');
select * from finish();
rollback;
