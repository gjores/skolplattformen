begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- 04-04: independent register/read fixtures; all identities and values synthetic.
create function pg_temp.rid(n bigint) returns uuid language sql immutable as $$select ('44004000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.customers(id,name) values(pg_temp.rid(1),'Read test');
insert into public.organizers(id,customer_id,name,type) values(pg_temp.rid(2),pg_temp.rid(1),'Read test','Kommun');
insert into public.identities(id,issuer,subject) select pg_temp.rid(10+n),'https://read.example.test',n::text from generate_series(1,10)n;
insert into public.memberships(id,customer_id,identity_id) select pg_temp.rid(30+n),pg_temp.rid(1),pg_temp.rid(10+n) from generate_series(1,10)n;
insert into public.school_units(id,organizer_id,code,name,municipality_code) select pg_temp.rid(100+n),pg_temp.rid(2),'4400400'||n,'Skola '||n,'0000' from generate_series(1,2)n;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,start_year) select pg_temp.rid(200+n),pg_temp.rid(2),pg_temp.rid(100+n),'grundskola','Utbildning '||n,'Syntetisk',2026 from generate_series(1,2)n;
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) select pg_temp.rid(300+n),pg_temp.rid(1),pg_temp.rid(2),pg_temp.rid(100+n),pg_temp.rid(200+n),'KLASS '||n,2026 from generate_series(1,2)n;
insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name,protected_identity)
select pg_temp.rid(400+n),pg_temp.rid(1),pg_temp.rid(2),case when n=1 then 'Hemligt namn' else 'Namn '||lpad(n::text,3,'0') end,personal_number,'Elev anonym '||n,n=1 from (select personal_number,row_number()over(order by personal_number)n from public.synthetic_pupil_numbers limit 65)x;
insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on,ends_on)
select pg_temp.rid(500+n),pg_temp.rid(1),pg_temp.rid(2),pg_temp.rid(400+n),pg_temp.rid(case when n=65 then 102 else 101 end),pg_temp.rid(case when n=65 then 202 else 201 end),date '2026-07-01',case when n=64 then public.app_today()-1 else null end from generate_series(1,65)n;
insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
select pg_temp.rid(600+n),pg_temp.rid(1),pg_temp.rid(2),pg_temp.rid(400+n),pg_temp.rid(101),pg_temp.rid(301),pg_temp.rid(500+n),date '2026-07-01' from generate_series(1,3)n;
insert into public.phase3_probe_cases values(pg_temp.rid(700),pg_temp.rid(402),pg_temp.rid(1),pg_temp.rid(101));
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values(pg_temp.rid(801),pg_temp.rid(31),pg_temp.rid(1),pg_temp.rid(2),'huvudman','synthetic-v1','school');
insert into public.mandate_units select pg_temp.rid(801),pg_temp.rid(1),pg_temp.rid(2),pg_temp.rid(100+n) from generate_series(1,2)n;
create function pg_temp.read_actor(n integer) returns void language plpgsql as $$begin
perform set_config('app.assignment_id',pg_temp.rid(800+n)::text,true),set_config('app.membership_id',pg_temp.rid(30+n)::text,true),set_config('app.identity_id',pg_temp.rid(10+n)::text,true),set_config('app.customer_id',pg_temp.rid(1)::text,true);end$$;
-- Explicit valid parent chain, unrelated memberships prevent self delegation.
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind,parent_assignment_id,issued_by_assignment_id,unit_id)
values(pg_temp.rid(802),pg_temp.rid(32),pg_temp.rid(1),pg_temp.rid(2),'rektor','synthetic-v1','school',pg_temp.rid(801),pg_temp.rid(801),pg_temp.rid(101));
insert into public.mandate_units values(pg_temp.rid(802),pg_temp.rid(1),pg_temp.rid(2),pg_temp.rid(101));
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind,parent_assignment_id,issued_by_assignment_id,unit_id)
select pg_temp.rid(800+n),pg_temp.rid(30+n),pg_temp.rid(1),pg_temp.rid(2),(case n when 3 then 'administrator' when 4 then 'larare' else 'elevhalsa' end)::public.access_function,'synthetic-v1',case n when 3 then 'school' when 4 then 'group' when 5 then 'pupil' when 6 then 'case' else 'school' end,pg_temp.rid(802),pg_temp.rid(802),pg_temp.rid(101) from generate_series(3,7)n;
insert into public.mandate_units select pg_temp.rid(800+n),pg_temp.rid(1),pg_temp.rid(2),pg_temp.rid(101) from generate_series(3,7)n;
insert into public.mandate_groups values(pg_temp.rid(804),pg_temp.rid(301),pg_temp.rid(1),pg_temp.rid(101),'undervisning');
insert into public.mandate_pupils values(pg_temp.rid(805),pg_temp.rid(402),pg_temp.rid(1),pg_temp.rid(101));
insert into public.mandate_cases values(pg_temp.rid(806),pg_temp.rid(700),pg_temp.rid(1),pg_temp.rid(101));
insert into public.assignments(id,organizer_id,name,role) values(pg_temp.rid(902),pg_temp.rid(2),'Rektor','rektor'),(pg_temp.rid(904),pg_temp.rid(2),'Lärare','larare');
insert into public.assignment_units values(pg_temp.rid(902),pg_temp.rid(101)),(pg_temp.rid(904),pg_temp.rid(101));
insert into public.staff_assignment_bindings values(pg_temp.rid(902),pg_temp.rid(32),pg_temp.rid(1),pg_temp.rid(2)),(pg_temp.rid(904),pg_temp.rid(34),pg_temp.rid(1),pg_temp.rid(2));
update public.access_assignments set staff_assignment_id=pg_temp.rid(902) where id=pg_temp.rid(802);
update public.access_assignments set staff_assignment_id=pg_temp.rid(904) where id=pg_temp.rid(804);
create function pg_temp.sel() returns jsonb language sql as $$select jsonb_build_object('schoolYear',2026,'unitId',pg_temp.rid(101),'classId',null,'educationId',null,'grade',null,'status',null,'page',1)$$;
create function pg_temp.req() returns jsonb language sql as $$select jsonb_build_object('selection',pg_temp.sel(),'search','','caseId',null)$$;
create function pg_temp.card(n integer) returns jsonb language sql as $$select jsonb_build_object('pupilId',pg_temp.rid(400+n),'schoolYear',2026,'caseId',null)$$;
select pg_temp.read_actor(3);

create function pg_temp.exp() returns jsonb language sql as $$select jsonb_build_object('mode','filter','selection',pg_temp.sel(),'search','','schoolYear',2026,'caseId',null,'fields',jsonb_build_array('id','displayName'),'protectedIds','[]'::jsonb,'includePersonalNumber',false)$$;
select has_function('public','phase4_export_pupils',array['jsonb','boolean'],'export entrypoint exists');
select is((public.phase4_export_pupils(pg_temp.exp(),true)->'body'->>'count')::integer,63,'preview omits protected and spans pages');
select is(jsonb_array_length(public.phase4_export_pupils(pg_temp.exp(),false)->'body'->'rows'),63,'download includes all pages');
select ok(not(public.phase4_export_pupils(pg_temp.exp(),true)->'body' ? 'rows'),'preview contains no rows');
select is((public.phase4_export_pupils((pg_temp.exp()-'selection'-'search')||jsonb_build_object('mode','ids','ids',jsonb_build_array(pg_temp.rid(402),pg_temp.rid(463))),true)->'body'->>'count')::integer,2,'explicit IDs can span display pages');
select is((public.phase4_export_pupils(jsonb_set(pg_temp.exp(),'{selection,page}','2'),true)->'body'->>'count')::integer,63,'filter export ignores display pagination');
select throws_ok($q$select public.phase4_export_pupils(pg_temp.exp()||'{"fields":["personalNumber"]}',true)$q$,'22023',null,'number not available through fields');
select throws_ok($q$select public.phase4_export_pupils(pg_temp.exp()||'{"schoolYear":2025}',true)$q$,'22023',null,'filter and envelope year must agree');
select throws_ok($q$select public.phase4_export_pupils((pg_temp.exp()-'selection'-'search')||jsonb_build_object('mode','ids','ids',jsonb_build_array(pg_temp.rid(402),pg_temp.rid(465))),false)$q$,'P0002','Pupil not found','one foreign id rejects entire export');
select throws_ok($q$select public.phase4_export_pupils(pg_temp.exp()||jsonb_build_object('protectedIds',jsonb_build_array(pg_temp.rid(401))),true)$q$,'P0002','Pupil not found','explicit protected selection requires permission');
select pg_temp.read_actor(1);
select public.phase4_grant_protected_permission(pg_temp.rid(803),pg_temp.rid(101));
select pg_temp.read_actor(3);
select is((public.phase4_export_pupils(pg_temp.exp(),true)->'body'->>'count')::integer,63,'permission alone never includes protected');
select is((public.phase4_export_pupils(pg_temp.exp()||jsonb_build_object('protectedIds',jsonb_build_array(pg_temp.rid(401))),true)->'body'->>'count')::integer,64,'explicit allowed protected inclusion counted');
select is(jsonb_array_length(public.phase4_export_pupils(pg_temp.exp()||jsonb_build_object('protectedIds',jsonb_build_array(pg_temp.rid(401)),'includePersonalNumber',true),false)->'auditRefs'),65,'protected plus per-number export refs');
select pg_temp.read_actor(1);
select public.phase4_revoke_protected_permission((select id from public.protected_identity_permissions where assignment_id=pg_temp.rid(803) and revoked_at is null));
select pg_temp.read_actor(3);
select throws_ok($q$select public.phase4_export_pupils(pg_temp.exp()||jsonb_build_object('protectedIds',jsonb_build_array(pg_temp.rid(401))),false)$q$,'P0002','Pupil not found','download rechecks permission after preview');
update public.pupils set protected_identity=true where id=pg_temp.rid(402);
select is((public.phase4_export_pupils(pg_temp.exp(),false)->'body'->>'count')::integer,62,'download rechecks newly protected pupil');
update public.access_assignments set ended_at=clock_timestamp() where id=pg_temp.rid(803);
select throws_ok($q$select public.phase4_export_pupils(pg_temp.exp(),false)$q$,'42501',null,'download rechecks ended mandate');
update public.access_assignments set ended_at=null where id=pg_temp.rid(803);
select is(public.phase4_export_pupils(pg_temp.exp(),true)->'auditRefs','[]'::jsonb,'count-only preview never claims number or protected value display');
insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on,ends_on)values(pg_temp.rid(9201),pg_temp.rid(1),pg_temp.rid(2),pg_temp.rid(403),pg_temp.rid(101),pg_temp.rid(201),'2025-07-01','2026-06-30');
select is((public.phase4_export_pupils(jsonb_set(pg_temp.exp()||'{"schoolYear":2025}','{selection,schoolYear}','2025'),true)->'body'->>'count')::integer,1,'historical export honors actual school-year overlap');
select pg_temp.read_actor(4);
select throws_ok($q$select public.phase4_export_pupils(pg_temp.exp(),false)$q$,'42501',null,'teacher cannot export');
select is(has_function_privilege(r,'public.phase4_export_pupils(jsonb,boolean)','EXECUTE'),r='skolplattform_worker','export execute for '||r||' after 04-23 audited route grant') from unnest(array['anon','authenticated','skolplattform_worker'])r;
select * from finish();
rollback;
