begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Delad GR/IM-utbildning i årslistan (05-PLANNING-YEAR-SHARED-GRIM). Egen syntetisk fixtur; rullas tillbaka.
-- Skolor: A (30, huvudskola), B (31, tillagd), C (32, utan utbildningen).
create function pg_temp.actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55390000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55390000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.id(n integer) returns uuid language sql immutable as $$select ('55390000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.customers(id,name) values(pg_temp.id(1),'Syntetiskt delad GR/IM-prov');
insert into public.organizers(id,customer_id,name,type) values(pg_temp.id(2),pg_temp.id(1),'Syntetisk huvudman delad GR/IM','Kommun');
insert into public.identities(id,issuer,subject) select pg_temp.id(10+n),'https://shared-grim.example.test','synthetic-'||n from generate_series(0,3) n;
insert into public.memberships(id,identity_id,customer_id) select pg_temp.id(20+n),pg_temp.id(10+n),pg_temp.id(1) from generate_series(0,3) n;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values
 (pg_temp.id(30),pg_temp.id(2),'55009030','Syntetisk skola A','0000'),
 (pg_temp.id(31),pg_temp.id(2),'55009031','Syntetisk skola B','0000'),
 (pg_temp.id(32),pg_temp.id(2),'55009032','Syntetisk skola C','0000');
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values(pg_temp.id(60),pg_temp.id(20),pg_temp.id(1),pg_temp.id(2),'huvudman','synthetic-v1','school');
insert into public.mandate_units select pg_temp.id(60),pg_temp.id(1),pg_temp.id(2),pg_temp.id(n) from generate_series(30,32) n;
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values(pg_temp.id(80),decode(md5(pg_temp.id(80)::text)||md5(pg_temp.id(80)::text),'hex'),pg_temp.id(10),pg_temp.id(20),pg_temp.id(60),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.actor(pg_temp.id(60),pg_temp.id(20),pg_temp.id(10),pg_temp.id(80));
create temporary table roles(name text primary key,assignment uuid,membership uuid,identity uuid,session uuid);
insert into roles values('hm',pg_temp.id(60),pg_temp.id(20),pg_temp.id(10),pg_temp.id(80));
insert into roles select r.name,public.phase3_grant_mandate(jsonb_build_object('membershipId',pg_temp.id(20+r.n),'function','rektor','scopeKind','school','unitIds',jsonb_build_array(pg_temp.id(29+r.n)))),
 pg_temp.id(20+r.n),pg_temp.id(10+r.n),pg_temp.id(80+r.n) from (values('rA',1),('rB',2),('rC',3)) r(name,n);
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
select session,decode(md5(session::text)||md5(session::text),'hex'),identity,membership,assignment,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours' from roles where name<>'hm';
create function pg_temp.as_role(role text) returns void language sql as $$select pg_temp.actor(assignment,membership,identity,session) from roles where name=role$$;
create function pg_temp.q(patch jsonb) returns jsonb language sql as $$select
 '{"schoolYear":2027,"unitId":null,"view":"timplan","schoolform":"grundskola","query":"","status":"all","cohortRelation":"all","archive":"all","grade":null,"sort":"name","direction":"asc","page":1,"selectionRevision":null}'::jsonb||patch$$;
create function pg_temp.rows(role text,patch jsonb default '{}') returns jsonb language plpgsql as $$begin
 perform pg_temp.as_role(role);return public.phase5_planning_year_list(pg_temp.q(patch))->'rows';end$$;
create function pg_temp.keys(role text,patch jsonb default '{}') returns text language sql as $$
 select coalesce(string_agg(case r->>'unitId' when pg_temp.id(30)::text then 'A' when pg_temp.id(31)::text then 'B' else '?' end
  ||':'||right(r->>'offeringId',3)||':'||coalesce(right(r#>>'{plan,id}',3),'-'),',' order by r->>'unitId',r#>>'{plan,id}'),'')
 from jsonb_array_elements(pg_temp.rows(role,patch)) r$$;

-- Utbildningar med huvudskola A, delade till B. Primär offering_units skapas av triggern.
select pg_temp.as_role('hm');
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,program_code,orientation_code) values
 (pg_temp.id(400),pg_temp.id(2),pg_temp.id(30),'grundskola','Delad GR','Text',array[7,8,9]::smallint[],null,null),
 (pg_temp.id(401),pg_temp.id(2),pg_temp.id(30),'introduktionsprogram','Delad IM','Text',null,null,null),
 (pg_temp.id(402),pg_temp.id(2),pg_temp.id(30),'grundskola','Delad GR utan plan på B','Text',array[7,8,9]::smallint[],null,null),
 (pg_temp.id(403),pg_temp.id(2),pg_temp.id(30),'gymnasium','Delad GY','Text',null,'SA25','SABEP');
select is((select count(*)::integer from public.offering_units where offering_id in (pg_temp.id(400),pg_temp.id(401),pg_temp.id(402),pg_temp.id(403)) and unit_id=pg_temp.id(30)),4,'primary school links created by trigger');
insert into public.offering_units(offering_id,unit_id,organizer_id) select id,pg_temp.id(31),pg_temp.id(2) from public.offerings where id in (pg_temp.id(400),pg_temp.id(401),pg_temp.id(402),pg_temp.id(403));
insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values
 (pg_temp.id(410),pg_temp.id(2),pg_temp.id(400),pg_temp.id(30),1,'GR på A'),
 (pg_temp.id(411),pg_temp.id(2),pg_temp.id(400),pg_temp.id(31),1,'GR på B'),
 (pg_temp.id(412),pg_temp.id(2),pg_temp.id(401),pg_temp.id(30),1,'IM på A'),
 (pg_temp.id(413),pg_temp.id(2),pg_temp.id(401),pg_temp.id(31),1,'IM på B'),
 (pg_temp.id(414),pg_temp.id(2),pg_temp.id(402),pg_temp.id(30),1,'GR utan plan på B');
insert into public.timplan_cells(timplan_id,row_id,hours) values
 (pg_temp.id(410),'engelska',array[100,100,100]::smallint[]),(pg_temp.id(411),'engelska',array[5,6,7]::smallint[]),
 (pg_temp.id(414),'engelska',array[1,1,1]::smallint[]);
insert into public.timplan_cells(timplan_id,row_id,hours) select p.id,k,array[p.h]::smallint[]
 from (values(pg_temp.id(412),2),(pg_temp.id(413),1)) p(id,h) cross join unnest(array['im-sv','im-ma','im-en','im-sh','im-idh','im-praktik','im-mentor']) k;
-- Klassbindning på B för 2027, och en A-klass med samma namn som inte får räknas på B.
set local session_replication_role=replica;
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values
 (pg_temp.id(420),pg_temp.id(1),pg_temp.id(2),pg_temp.id(30),pg_temp.id(400),'A',2025),
 (pg_temp.id(421),pg_temp.id(1),pg_temp.id(2),pg_temp.id(31),pg_temp.id(400),'A',2025);
insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(pg_temp.id(31),'A',2027,pg_temp.id(411),'ak8');
set local session_replication_role=origin;

-- 1. Rektor på tillagd skola B ser sin egen GR-timplan i årslistan.
select is(pg_temp.keys('rB'),'B:400:411','B principal lists own GR plan for shared education');
-- 2. Samma för IM, med veckotimmar från B:s egen plan.
select is(pg_temp.keys('rB','{"schoolform":"introduktionsprogram"}'),'B:401:413','B principal lists own IM plan for shared education');
select pg_temp.as_role('rB');
select is(public.phase5_planning_year_overview(pg_temp.q('{"schoolform":"introduktionsprogram"}'))#>>'{totals,weeklyHours,value}','7','B IM weekly hours come only from B plan');
-- 3. Ingen skola ser den andra skolans plan, klasser eller summor.
select ok(not pg_temp.rows('rB')::text like '%'||pg_temp.id(410)||'%' and not pg_temp.rows('rB')::text like '%'||pg_temp.id(420)||'%','B principal sees no plan or class of A');
select is(pg_temp.keys('rA'),'A:400:410,A:402:414','A principal still lists only A plans');
select is(pg_temp.keys('rA','{"schoolform":"introduktionsprogram"}'),'A:401:412','A principal IM unchanged');
select pg_temp.as_role('rA');
select is(public.phase5_planning_year_overview(pg_temp.q('{"schoolform":"introduktionsprogram"}'))#>>'{totals,weeklyHours,value}','14','A IM weekly hours come only from A plan');
select throws_ok($q$select public.phase5_planning_year_list(pg_temp.q(jsonb_build_object('unitId',pg_temp.id(31))))$q$,'42501',null,'A principal cannot request B');
-- 4. Rektor på C, där utbildningen inte ges, får inget och nekas B.
select is(pg_temp.keys('rC'),'','C principal gets no shared education row');
select is(pg_temp.keys('rC','{"schoolform":"introduktionsprogram"}'),'','C principal gets no shared IM row');
select pg_temp.as_role('rC');
select throws_ok($q$select public.phase5_planning_year_list(pg_temp.q(jsonb_build_object('unitId',pg_temp.id(31))))$q$,'42501',null,'C principal cannot request B');
-- 5. Huvudman med A och B får en rad per skola; summan räknar båda planerna en gång.
select is(pg_temp.keys('hm'),'A:400:410,A:402:414,B:400:411','HM lists one GR row per school plan');
select is(pg_temp.keys('hm','{"schoolform":"introduktionsprogram"}'),'A:401:412,B:401:413','HM lists one IM row per school plan');
select pg_temp.as_role('hm');
select is(public.phase5_planning_year_overview(pg_temp.q('{"schoolform":"introduktionsprogram"}'))#>>'{totals,weeklyHours,value}','21','HM IM total counts each school plan once');
select is(pg_temp.keys('hm',jsonb_build_object('unitId',pg_temp.id(31))),'B:400:411','HM school filter B returns B row only');
-- 6. Klassbunden rad på B räknar B-klassen, inte A-klassen med samma namn.
select is((select jsonb_agg(c->>'id')::text from jsonb_array_elements(pg_temp.rows('rB')) r cross join jsonb_array_elements(r->'classes') c),
 jsonb_build_array(pg_temp.id(421))::text,'B row resolves only the B class');
select is((select r->>'underlag'||':'||(r#>>'{application,columnId}') from jsonb_array_elements(pg_temp.rows('rB')) r),'class-bound:ak8','B row is class bound to ak8');
select is((select r->>'schoolName' from jsonb_array_elements(pg_temp.rows('rB')) r),'Syntetisk skola B','B row names the planning school');
-- 7. Delad utbildning utan egen plan på B ger ingen rad på B.
select ok(not pg_temp.keys('hm') like '%B:402%','shared education without B plan has no B row');
-- 8. GY oförändrad: programplansvyn visar delad GY på båda skolorna, rektor B bara på B.
select is((select string_agg(case r->>'unitId' when pg_temp.id(30)::text then 'A' else 'B' end,',' order by r->>'unitId')
 from jsonb_array_elements(pg_temp.rows('hm','{"view":"programplan","schoolform":"gymnasium"}')) r where r->>'offeringId'=pg_temp.id(403)::text),'A,B','GY shared scope unchanged for HM');
select is((select string_agg(case r->>'unitId' when pg_temp.id(31)::text then 'B' else 'A' end,',')
 from jsonb_array_elements(pg_temp.rows('rB','{"view":"programplan","schoolform":"gymnasium"}')) r where r->>'offeringId'=pg_temp.id(403)::text),'B','GY shared scope unchanged for B principal');
select * from finish(true);
rollback;
