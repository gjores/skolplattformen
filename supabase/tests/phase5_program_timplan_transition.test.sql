begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Owned synthetic fixture only. Foundation/grants are tested separately; this transaction is rolled back.
create function pg_temp.programplan_actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55010000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55010000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.programplan_reference(refs jsonb default '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100},{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM1000X","points":100},{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM2000X","points":100}]'::jsonb)
returns jsonb language sql stable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn',to_char(make_date(extract(year from current_date)::integer+1,8,17),'YYYY-MM-DD'),'specializationRefs',refs,'choiceBlocks','[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]'::jsonb)$$;
insert into public.customers(id,name) values('55010000-0000-4000-8000-000000000001','Syntetiskt programplansprov');
insert into public.organizers(id,customer_id,name,type) values('55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000001','Syntetisk programplanshuvudman','Kommun');
insert into public.identities(id,issuer,subject) values
 ('55010000-0000-4000-8000-000000000010','https://programplan.example.test','synthetic-hm'),
 ('55010000-0000-4000-8000-000000000011','https://programplan.example.test','synthetic-principal'),
 ('55010000-0000-4000-8000-000000000012','https://programplan.example.test','synthetic-principal2'),
 ('55010000-0000-4000-8000-000000000013','https://programplan.example.test','synthetic-admin');
insert into public.memberships(id,identity_id,customer_id) values
 ('55010000-0000-4000-8000-000000000020','55010000-0000-4000-8000-000000000010','55010000-0000-4000-8000-000000000001'),
 ('55010000-0000-4000-8000-000000000021','55010000-0000-4000-8000-000000000011','55010000-0000-4000-8000-000000000001'),
 ('55010000-0000-4000-8000-000000000022','55010000-0000-4000-8000-000000000012','55010000-0000-4000-8000-000000000001'),
 ('55010000-0000-4000-8000-000000000023','55010000-0000-4000-8000-000000000013','55010000-0000-4000-8000-000000000001');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values
 ('55010000-0000-4000-8000-000000000030','55010000-0000-4000-8000-000000000002','55008030','Syntetisk programplansskola','0000'),
 ('55010000-0000-4000-8000-000000000031','55010000-0000-4000-8000-000000000002','55008031','Annan syntetisk skola','0000');
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values('55010000-0000-4000-8000-000000000060','55010000-0000-4000-8000-000000000020','55010000-0000-4000-8000-000000000001','55010000-0000-4000-8000-000000000002','huvudman','synthetic-v1','school');
insert into public.mandate_units values
 ('55010000-0000-4000-8000-000000000060','55010000-0000-4000-8000-000000000001','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000030'),
 ('55010000-0000-4000-8000-000000000060','55010000-0000-4000-8000-000000000001','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000031');
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55010000-0000-4000-8000-000000000080',decode(md5('55010000-0000-4000-8000-000000000080')||md5('55010000-0000-4000-8000-000000000080'),'hex'),
 '55010000-0000-4000-8000-000000000010','55010000-0000-4000-8000-000000000020','55010000-0000-4000-8000-000000000060',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor('55010000-0000-4000-8000-000000000060','55010000-0000-4000-8000-000000000020','55010000-0000-4000-8000-000000000010','55010000-0000-4000-8000-000000000080');
create temporary table programplan_roles(name text primary key,id uuid);
insert into programplan_roles values('hm','55010000-0000-4000-8000-000000000060'),
 ('principal',public.phase3_grant_mandate('{"membershipId":"55010000-0000-4000-8000-000000000021","function":"rektor","scopeKind":"school","unitIds":["55010000-0000-4000-8000-000000000030"]}')),
 ('principal2',public.phase3_grant_mandate('{"membershipId":"55010000-0000-4000-8000-000000000022","function":"rektor","scopeKind":"school","unitIds":["55010000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values
 ('55010000-0000-4000-8000-000000000081',decode(md5('55010000-0000-4000-8000-000000000081')||md5('55010000-0000-4000-8000-000000000081'),'hex'),'55010000-0000-4000-8000-000000000011','55010000-0000-4000-8000-000000000021',(select id from programplan_roles where name='principal'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours'),
 ('55010000-0000-4000-8000-000000000082',decode(md5('55010000-0000-4000-8000-000000000082')||md5('55010000-0000-4000-8000-000000000082'),'hex'),'55010000-0000-4000-8000-000000000012','55010000-0000-4000-8000-000000000022',(select id from programplan_roles where name='principal2'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55010000-0000-4000-8000-000000000021','55010000-0000-4000-8000-000000000011','55010000-0000-4000-8000-000000000081');
insert into programplan_roles values('admin',public.phase3_grant_mandate('{"membershipId":"55010000-0000-4000-8000-000000000023","function":"administrator","scopeKind":"school","unitIds":["55010000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55010000-0000-4000-8000-000000000083',decode(md5('55010000-0000-4000-8000-000000000083')||md5('55010000-0000-4000-8000-000000000083'),'hex'),'55010000-0000-4000-8000-000000000013','55010000-0000-4000-8000-000000000023',(select id from programplan_roles where name='admin'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values
 ('55010000-0000-4000-8000-000000000040','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000030','gymnasium','Syntetisk bunden SA','Syntetisk kulltext utan datum','SA25','SABEP'),
 ('55010000-0000-4000-8000-000000000041','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000030','gymnasium','Syntetisk obunden SA','Inte ett datum','SA25','SABEP'),
 ('55010000-0000-4000-8000-000000000042','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000030','gymnasium','Syntetisk tidigare beslutad SA','Syntetiskt prov','SA25','SABEP'),
 ('55010000-0000-4000-8000-000000000043','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000031','gymnasium','Syntetisk annan skola SA','Syntetiskt prov','SA25','SABEP'),
 ('55010000-0000-4000-8000-000000000045','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000030','gymnasium','Syntetisk tom ES','Syntetiskt prov','ES25','ESBIF');
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference) values
 ('55010000-0000-4000-8000-000000000050','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000040',1,array['ENGE3000X','ANIM1000X','ANIM2000X'],'sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',pg_temp.programplan_reference());
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_fetched,status,decided_on) values
 ('55010000-0000-4000-8000-000000000051','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000041',1,array['ENGE3000X','ANIM1000X','ANIM2000X'],'2026-09-05','utkast',null),
 ('55010000-0000-4000-8000-000000000052','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000042',3,array['ENGE3000X'],'2026-09-05','faststalld','2026-09-10'),
 ('55010000-0000-4000-8000-000000000053','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000043',1,array['ENGE3000X'],'2026-09-05','utkast',null);
-- Only this synthetic legacy row predates session-based actor metadata.
set local session_replication_role=replica;
insert into public.point_plan_events(point_plan_id,actor_role,action,comment) values
 ('55010000-0000-4000-8000-000000000052','huvudman','Syntetiskt äldre beslut','Syntetisk historik ska bevaras');
set local session_replication_role=origin;

-- All SQL statements below affect only the 55010000 synthetic customer.
-- Complete the 2 500-point source through the real term command. Deliberately
-- put all rows in one active term: SQL tests structural drafts; the Worker
-- separately checks level order before its outer transaction commits.
select public.phase5_write_programplan_terms('55010000-0000-4000-8000-000000000050',0,
 (select jsonb_agg(jsonb_build_object('rowKey',r->>'key','points',jsonb_build_array((r->>'points')::integer,0,0,0,0,0)) order by n)
 from jsonb_array_elements(public.phase5_programplan_term_rows(pg_temp.programplan_reference())) with ordinality x(r,n)));
select public.phase5_bind_programplan_draft('55010000-0000-4000-8000-000000000051',0,pg_temp.programplan_reference());
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades) values
 ('55010000-0000-4000-8000-000000000046','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000030','grundskola','Syntetisk bevarad grundskola','Syntetiskt prov',array[1,2,3,4,5,6,7,8,9]::smallint[]);
insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values
 ('55010000-0000-4000-8000-000000000070','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000046','55010000-0000-4000-8000-000000000030',1,'Syntetisk äldre GR');
insert into public.timplan_cells(timplan_id,row_id,hours) values('55010000-0000-4000-8000-000000000070','engelska',array[0,0,0,0,0,0,0,0,0]::smallint[]);
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort) values
 ('55010000-0000-4000-8000-000000000047','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000030','introduktionsprogram','Syntetisk bevarad IM','Syntetiskt prov');
insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values
 ('55010000-0000-4000-8000-000000000071','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000047','55010000-0000-4000-8000-000000000030',1,'Syntetisk äldre IM');
insert into public.timplan_cells(timplan_id,row_id,hours) values('55010000-0000-4000-8000-000000000071','im-en',array[0]::smallint[]);
create temporary table gym_source_before as select to_jsonb(p) value from public.point_plans p where id='55010000-0000-4000-8000-000000000050';
create temporary table gym_results(name text primary key,value jsonb);

select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array['phase5_gym_timplan_scope','phase5_gym_timplan_source','phase5_gym_timplan_require_source','phase5_gym_timplan_audit','phase5_gym_timplan_event_actor','phase5_gym_timplan_guard','phase5_gym_timplan_cells_guard','phase5_gym_timplan_matrix_guard','phase5_gym_timplan_receipt_guard','phase5_gym_timplan_result'])
 and (exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where acl.grantee=0 and acl.privilege_type='EXECUTE')
 or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('skolplattform_worker',p.oid,'execute'))),'all gym helpers closed to PUBLIC, anon, authenticated and Worker');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array['phase5_gym_timplan_underlag','phase5_create_gym_timplan','phase5_read_gym_timplan','phase5_write_gym_timplan_row'])
 and (exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where acl.grantee=0 and acl.privilege_type='EXECUTE')
 or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('skolplattform_worker',p.oid,'execute'))),'foundation RPCs remain closed before real Worker preflight');
select ok(not has_table_privilege('skolplattform_worker','public.gym_timplan_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 and not exists(select 1 from pg_roles where rolname='skolplattform_worker' and (rolsuper or rolbypassrls))
 and (select count(*)=3 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relrowsecurity and not p.polpermissive and p.polcmd='*' and p.polroles=array[0::oid]
 and (c.relname,p.polname) in (('timplans','timplans_gym_rpc_only'),('timplan_cells','timplan_cells_gym_rpc_only'),('timplan_events','timplan_events_gym_rpc_only'))),
 'receipts are closed and ordinary Worker cannot bypass restrictive gym row policies');
select is((select sum((r->>'points')::integer) from jsonb_array_elements(public.phase5_gym_timplan_source('55010000-0000-4000-8000-000000000050')->'rows') r),2500::bigint,'complete saved source has the verified 2500-point frame');

insert into gym_results values('first',public.phase5_create_gym_timplan('55010000-0000-4000-8000-000000000090','55010000-0000-4000-8000-000000000050',1,0,'55010000-0000-4000-8000-000000000030',null,null));
select ok((select value#>>'{reply,version}'='1' and value#>>'{reply,revision}'='0' and value#>>'{plan,status}'='utkast'
 and value#>>'{plan,source,status}'='utkast' and value#>>'{reply,carriedRows}'='0' from gym_results where name='first'),'real create accepts a complete saved program draft and makes its own school draft');
-- Exercise the actual older table grants as Worker. Legacy GUCs must preserve
-- GR/IM reads while new rows and authenticated gym history stay RPC-only.
do $q$
declare pid uuid;v integer;checks jsonb:='{}';frozen jsonb;
begin
 select (value#>>'{reply,id}')::uuid into pid from gym_results where name='first';
 select gym_basis into frozen from public.timplans where id=pid;
 perform set_config('app.organizer_id','55010000-0000-4000-8000-000000000002',true),set_config('app.app_role','rektor',true);
 execute 'set local role skolplattform_worker';
 select count(*) into v from public.timplans where id in ('55010000-0000-4000-8000-000000000070','55010000-0000-4000-8000-000000000071');
 checks:=checks||jsonb_build_object('legacyVisible',v=2);
 select count(*) into v from public.timplans where id=pid;checks:=checks||jsonb_build_object('gymPlanHidden',v=0);
 select count(*) into v from public.timplan_events where timplan_id=pid;checks:=checks||jsonb_build_object('gymHistoryHidden',v=0);
 begin
  select count(*) into v from public.timplan_cells where timplan_id=pid;checks:=checks||jsonb_build_object('gymCellsHidden',v=0);
 exception when insufficient_privilege then checks:=checks||jsonb_build_object('gymCellsHidden',true);end;
 begin
  update public.timplans set basis=basis where id=pid;get diagnostics v=row_count;checks:=checks||jsonb_build_object('gymPlanUpdateClosed',v=0);
 exception when insufficient_privilege then checks:=checks||jsonb_build_object('gymPlanUpdateClosed',true);end;
 begin
  update public.timplan_cells set hours=hours where timplan_id=pid;get diagnostics v=row_count;checks:=checks||jsonb_build_object('gymCellUpdateClosed',v=0);
 exception when insufficient_privilege then checks:=checks||jsonb_build_object('gymCellUpdateClosed',true);end;
 begin
  insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis,gym_basis,source_programplan_id)
   values('55010000-0000-4000-8000-000000000097','55010000-0000-4000-8000-000000000002','55010000-0000-4000-8000-000000000040','55010000-0000-4000-8000-000000000030',2,'Syntetiskt råprov',
    frozen,'55010000-0000-4000-8000-000000000050');
  raise exception 'Unexpected raw gym plan insert' using errcode='PT001';
 exception when insufficient_privilege then checks:=checks||jsonb_build_object('gymPlanInsertClosed',true);
 when sqlstate 'PT001' then checks:=checks||jsonb_build_object('gymPlanInsertClosed',false);end;
 begin
  insert into public.timplan_cells(timplan_id,row_id,hours,allocated) values(pid,'foundation:ENGE:1:ENGE1000X',array[0,0,0,0,0,0]::smallint[],array[false,false,false,false,false,false]);
  raise exception 'Unexpected raw gym cell insert' using errcode='PT001';
 exception when insufficient_privilege then checks:=checks||jsonb_build_object('gymCellInsertClosed',true);
 when sqlstate 'PT001' then checks:=checks||jsonb_build_object('gymCellInsertClosed',false);end;
 begin
  insert into public.timplan_events(timplan_id,actor_role,action) values(pid,'rektor','gym_timplan_created');
  raise exception 'Unexpected raw gym history insert' using errcode='PT001';
 exception when insufficient_privilege then checks:=checks||jsonb_build_object('gymHistoryInsertClosed',true);
 when sqlstate 'PT001' then checks:=checks||jsonb_build_object('gymHistoryInsertClosed',false);end;
 execute 'reset role';
 insert into gym_results values('raw-worker-security',checks);
end $q$;
select ok((select value->>'legacyVisible'='true' and value->>'gymPlanHidden'='true' and value->>'gymHistoryHidden'='true' and value->>'gymCellsHidden'='true'
 from gym_results where name='raw-worker-security'),'real Worker table reads preserve legacy controls and hide new gym plans, cells and actor history');
select ok((select value->>'gymPlanUpdateClosed'='true' and value->>'gymCellUpdateClosed'='true' and value->>'gymPlanInsertClosed'='true' and value->>'gymCellInsertClosed'='true' and value->>'gymHistoryInsertClosed'='true'
 from gym_results where name='raw-worker-security'),'real raw Worker plan, cell and actor-history writes cannot bypass gym RPCs');
select ok(not exists(select 1 from public.timplan_cells c where c.timplan_id=(select (value#>>'{reply,id}')::uuid from gym_results where name='first')
 and (c.hours<>array[0,0,0,0,0,0]::smallint[] or c.allocated<>array[false,false,false,false,false,false]))
 and not exists(select 1 from jsonb_each((select value#>'{plan,hours}' from gym_results where name='first')) h where h.value<>'[null,null,null,null,null,null]'::jsonb),'six empty terms have no automatic points-to-hours conversion');
select public.phase5_write_gym_timplan_row((select (value#>>'{reply,id}')::uuid from gym_results where name='first'),0,'foundation:ENGE:1:ENGE1000X','[0,null,null,null,null,null]');
select public.phase5_write_gym_timplan_row((select (value#>>'{reply,id}')::uuid from gym_results where name='first'),1,'foundation:ENGE:1:ENGE2000X','[55,null,null,null,null,null]');
select ok((select hours[1]=0 and allocated[1] and not allocated[2] from public.timplan_cells
 where timplan_id=(select (value#>>'{reply,id}')::uuid from gym_results where name='first') and row_id='foundation:ENGE:1:ENGE1000X'),'explicit zero is allocated; unused and blank terms remain false');
select is(public.phase5_read_gym_timplan((select (value#>>'{reply,id}')::uuid from gym_results where name='first'))#>'{hours,foundation:ENGE:1:ENGE1000X}',
 '[0,null,null,null,null,null]'::jsonb,'audited read keeps explicit zero distinct from blank');
select throws_ok($q$select public.phase5_write_gym_timplan_row((select (value#>>'{reply,id}')::uuid from gym_results where name='first'),2,'foundation:ENGE:1:ENGE1000X','[0,0,null,null,null,null]')$q$,'22023',null,'inactive point term rejects even explicit zero hours');
select throws_ok($q$select public.phase5_write_gym_timplan_row((select (value#>>'{reply,id}')::uuid from gym_results where name='first'),0,'foundation:ENGE:1:ENGE1000X','[30,null,null,null,null,null]')$q$,'40001',null,'stale hour CAS cannot overwrite saved values');
select throws_ok($q$select public.phase5_read_timplan((select (value#>>'{reply,id}')::uuid from gym_results where name='first'))$q$,'42501',null,'legacy read cannot project new gym matrices without their mask');
select throws_ok($q$select public.phase5_change_timplan_cell((select (value#>>'{reply,id}')::uuid from gym_results where name='first'),2,'foundation:ENGE:1:ENGE1000X',0,30)$q$,'42501',null,'legacy cell cannot bypass frozen gym hours');
select throws_ok($q$select public.phase5_create_gym_timplan('55010000-0000-4000-8000-000000000095','55010000-0000-4000-8000-000000000050',1,0,'55010000-0000-4000-8000-000000000031',null,null)$q$,'42501',null,'principal cannot create another school plan');
select pg_temp.programplan_actor((select id from programplan_roles where name='hm'),'55010000-0000-4000-8000-000000000020','55010000-0000-4000-8000-000000000010','55010000-0000-4000-8000-000000000080');
select throws_ok($q$select public.phase5_write_gym_timplan_row((select (value#>>'{reply,id}')::uuid from gym_results where name='first'),2,'foundation:ENGE:1:ENGE1000X','[30,null,null,null,null,null]')$q$,'42501',null,'HM reading access does not confer school hour editing');
select pg_temp.programplan_actor((select id from programplan_roles where name='admin'),'55010000-0000-4000-8000-000000000023','55010000-0000-4000-8000-000000000013','55010000-0000-4000-8000-000000000083');
select throws_ok($q$select public.phase5_change_timplan_cell('55010000-0000-4000-8000-000000000070',0,'engelska',0,30)$q$,'42501',null,'new school administrator gym access does not open legacy GR editing');
select throws_ok($q$select public.phase5_change_timplan_cell('55010000-0000-4000-8000-000000000071',0,'im-en',0,30)$q$,'42501',null,'new school administrator gym access does not open legacy IM editing');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55010000-0000-4000-8000-000000000021','55010000-0000-4000-8000-000000000011','55010000-0000-4000-8000-000000000081');
select ok((select count(*)=3 and bool_and(actor_identity_id='55010000-0000-4000-8000-000000000011'::uuid and session_id='55010000-0000-4000-8000-000000000081'::uuid and assignment_id=(select id from programplan_roles where name='principal'))
 from public.timplan_events where timplan_id=(select (value#>>'{reply,id}')::uuid from gym_results where name='first')),'create and hours history derive the real session actor');
select is((select to_jsonb(p) from public.point_plans p where id='55010000-0000-4000-8000-000000000050'),(select value from gym_source_before),'hour changes leave the complete program source row unchanged');
select throws_ok($q$update public.timplans set gym_basis=jsonb_set(gym_basis,'{revision}','99'),revision=revision+1 where id=(select (value#>>'{reply,id}')::uuid from gym_results where name='first')$q$,'42501',null,'frozen source snapshot cannot be overwritten');
create temporary table gym_old_cells as select to_jsonb(c) value from public.timplan_cells c where timplan_id=(select (value#>>'{reply,id}')::uuid from gym_results where name='first');

-- Change one saved point-term shape, keeping all other exact keys and points.
select public.phase5_write_programplan_terms('55010000-0000-4000-8000-000000000050',1,
 (select jsonb_agg(case when d->>'rowKey'='foundation:ENGE:1:ENGE1000X' then jsonb_set(d,'{points}','[0,100,0,0,0,0]') else d end order by n)
 from public.point_plans p cross join lateral jsonb_array_elements(p.term_distribution) with ordinality x(d,n) where p.id='55010000-0000-4000-8000-000000000050'));
insert into gym_results values('replayed',public.phase5_create_gym_timplan('55010000-0000-4000-8000-000000000090','55010000-0000-4000-8000-000000000050',1,0,'55010000-0000-4000-8000-000000000030',null,null));
select ok((select value#>>'{reply,replayed}'='true' and value#>>'{reply,revision}'='2' and value#>>'{plan,source,revision}'='1' and value#>>'{plan,currentSource,revision}'='2'
 and value#>>'{reply,id}'=(select value#>>'{reply,id}' from gym_results where name='first') from gym_results where name='replayed'),'identical replay uses original frozen source despite changed live revision');
select throws_ok($q$select public.phase5_create_gym_timplan('55010000-0000-4000-8000-000000000090','55010000-0000-4000-8000-000000000050',2,0,'55010000-0000-4000-8000-000000000030',null,null)$q$,'40001',null,'same command ID with changed payload cannot create or rewrite a plan');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal2'),'55010000-0000-4000-8000-000000000022','55010000-0000-4000-8000-000000000012','55010000-0000-4000-8000-000000000082');
select throws_ok($q$select public.phase5_create_gym_timplan('55010000-0000-4000-8000-000000000090','55010000-0000-4000-8000-000000000050',1,0,'55010000-0000-4000-8000-000000000030',null,null)$q$,'40001',null,'another valid school actor cannot take over an identity-bound receipt');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55010000-0000-4000-8000-000000000021','55010000-0000-4000-8000-000000000011','55010000-0000-4000-8000-000000000081');
select throws_ok($q$select public.phase5_create_gym_timplan('55010000-0000-4000-8000-000000000092','55010000-0000-4000-8000-000000000050',2,0,'55010000-0000-4000-8000-000000000030',null,null)$q$,'40001',null,'new command ID does not bypass the already open school draft');
insert into gym_results values('next',public.phase5_create_gym_timplan('55010000-0000-4000-8000-000000000091','55010000-0000-4000-8000-000000000050',2,0,'55010000-0000-4000-8000-000000000030',(select (value#>>'{reply,id}')::uuid from gym_results where name='first'),2));
select ok((select value#>>'{reply,version}'='2' and (value#>>'{reply,resetRows}')::integer=1
 and (value#>>'{reply,carriedRows}')::integer=jsonb_array_length(value#>'{plan,source,rows}')-1 from gym_results where name='next'),'explicit next version carries only exactly unchanged source rows and term shapes');
select ok((select value#>'{plan,hours,foundation:ENGE:1:ENGE1000X}'='[null,null,null,null,null,null]'::jsonb
 and value#>'{plan,hours,foundation:ENGE:1:ENGE2000X}'='[55,null,null,null,null,null]'::jsonb from gym_results where name='next'),'changed term frame starts blank while an unchanged row retains its hours');
select is((select jsonb_agg(to_jsonb(c) order by c.row_id) from public.timplan_cells c where timplan_id=(select (value#>>'{reply,id}')::uuid from gym_results where name='first')),
 (select jsonb_agg(value order by value->>'row_id') from gym_old_cells),'all predecessor hour rows remain byte-JSON unchanged');
select ok((select t.status='ersatt' and t.gym_basis=(select value#>'{plan,source}' from gym_results where name='first')
 from public.timplans t where t.id=(select (value#>>'{reply,id}')::uuid from gym_results where name='first')),'superseding the school draft preserves its frozen source');

create temporary table gym_partial_before as select jsonb_build_object(
 'plans',(select count(*) from public.timplans where organizer_id='55010000-0000-4000-8000-000000000002'),
 'cells',(select count(*) from public.timplan_cells c join public.timplans t on t.id=c.timplan_id where t.organizer_id='55010000-0000-4000-8000-000000000002'),
 'receipts',(select count(*) from public.gym_timplan_receipts where organizer_id='55010000-0000-4000-8000-000000000002'),
 'audit',(select count(*) from public.security_events where customer_id='55010000-0000-4000-8000-000000000001' and action='gym_timplan_created')) value;
select throws_ok($q$select public.phase5_create_gym_timplan('55010000-0000-4000-8000-000000000093','55010000-0000-4000-8000-000000000051',1,0,'55010000-0000-4000-8000-000000000030',null,null)$q$,'40001',null,'structurally incomplete point terms cannot create a gym draft');
select is(jsonb_build_object('plans',(select count(*) from public.timplans where organizer_id='55010000-0000-4000-8000-000000000002'),
 'cells',(select count(*) from public.timplan_cells c join public.timplans t on t.id=c.timplan_id where t.organizer_id='55010000-0000-4000-8000-000000000002'),
 'receipts',(select count(*) from public.gym_timplan_receipts where organizer_id='55010000-0000-4000-8000-000000000002'),
 'audit',(select count(*) from public.security_events where customer_id='55010000-0000-4000-8000-000000000001' and action='gym_timplan_created')),
 (select value from gym_partial_before),'failed partial-source creation leaves no plan, cells, receipt or success audit');
update public.offerings set archived_at=clock_timestamp() where id='55010000-0000-4000-8000-000000000040';
select throws_ok($q$select public.phase5_write_gym_timplan_row((select (value#>>'{reply,id}')::uuid from gym_results where name='next'),0,'foundation:ENGE:1:ENGE2000X','[60,null,null,null,null,null]')$q$,'42501',null,'archive closes gym hour mutation');
select ok(public.phase5_read_gym_timplan((select (value#>>'{reply,id}')::uuid from gym_results where name='next'))->'archived'='true'::jsonb,'archived school time remains auditable and readable');
update public.offerings set archived_at=null where id='55010000-0000-4000-8000-000000000040';
-- Synthetic fixture makes the live program already started. Its old frozen
-- timplan source remains immutable; hour editing must not inherit that date lock.
set local session_replication_role=replica;
update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb(to_char(current_date-1,'YYYY-MM-DD'))),revision=revision+1 where id='55010000-0000-4000-8000-000000000050';
set local session_replication_role=origin;
select ok(public.phase5_programplan_phase((select o from public.offerings o where o.id='55010000-0000-4000-8000-000000000040'))='pagaende'
 and public.phase5_write_gym_timplan_row((select (value#>>'{reply,id}')::uuid from gym_results where name='next'),0,'foundation:ENGE:1:ENGE2000X','[60,null,null,null,null,null]')->>'revision'='1','started live program does not lock its school draft hours');

create temporary table gym_audit_before as select jsonb_build_object('plan',to_jsonb(t),
 'cells',(select jsonb_agg(to_jsonb(c) order by c.row_id) from public.timplan_cells c where c.timplan_id=t.id),
 'history',(select jsonb_agg(to_jsonb(e) order by e.id) from public.timplan_events e where e.timplan_id=t.id)) value
 from public.timplans t where t.id=(select (value#>>'{reply,id}')::uuid from gym_results where name='next');
create function pg_temp.gym_audit_failure() returns trigger language plpgsql as $$begin
 if new.action='gym_timplan_row_changed' and new.customer_id='55010000-0000-4000-8000-000000000001'::uuid then raise exception 'Synthetic gym audit failure';end if;return new;end $$;
create trigger synthetic_gym_audit_failure before insert on public.security_events for each row execute function pg_temp.gym_audit_failure();
select throws_ok($q$select public.phase5_write_gym_timplan_row((select (value#>>'{reply,id}')::uuid from gym_results where name='next'),1,'foundation:ENGE:1:ENGE2000X','[75,null,null,null,null,null]')$q$,'55000',null,'late mandatory DB audit failure rolls back the complete row command');
select is((select jsonb_build_object('plan',to_jsonb(t),'cells',(select jsonb_agg(to_jsonb(c) order by c.row_id) from public.timplan_cells c where c.timplan_id=t.id),
 'history',(select jsonb_agg(to_jsonb(e) order by e.id) from public.timplan_events e where e.timplan_id=t.id)) from public.timplans t where t.id=(select (value#>>'{reply,id}')::uuid from gym_results where name='next')),
 (select value from gym_audit_before),'audit rollback preserves the complete timplan, cell rows and actor-bound history');
drop trigger synthetic_gym_audit_failure on public.security_events;
select throws_ok($q$update public.gym_timplan_receipts set reply=reply||'{"replayed":true}'::jsonb where command_id='55010000-0000-4000-8000-000000000090'$q$,'55000',null,'receipt history is immutable even for a privileged caller');

-- Exercise deferred completeness before rollback discards pending triggers.
set constraints timplans_gym_matrix,timplan_cells_gym_matrix immediate;
select * from finish();
rollback;
