begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Före fixturen: snapshot av redan befintliga verksamhetsrader, inget exponeras i TAP.
create temporary table existing_classes as select id,to_jsonb(c) value from public.school_classes c;
create temporary table existing_placements as select id,to_jsonb(c) value from public.pupil_placements c;
create temporary table existing_plans as select id,to_jsonb(c) value from public.timplans c;
create temporary table existing_bindings as select unit_id,class_name,start_year,to_jsonb(c) value from public.class_timplans c;
-- Programplan fixture: reusable synthetic setup; no grants or assertions.
create function pg_temp.programplan_actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55022000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55022000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.programplan_reference(refs jsonb default '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100}]'::jsonb)
returns jsonb language sql stable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn',to_char(make_date(extract(year from current_date)::integer+1,8,17),'YYYY-MM-DD'),'specializationRefs',refs,'choiceBlocks','[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]'::jsonb)$$;
insert into public.customers(id,name) values('55022000-0000-4000-8000-000000000001','Syntetiskt programplansprov');
insert into public.organizers(id,customer_id,name,type) values('55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000001','Syntetisk programplanshuvudman','Kommun');
insert into public.identities(id,issuer,subject) values
 ('55022000-0000-4000-8000-000000000010','https://programplan.example.test','synthetic-hm'),
 ('55022000-0000-4000-8000-000000000011','https://programplan.example.test','synthetic-principal'),
 ('55022000-0000-4000-8000-000000000012','https://programplan.example.test','synthetic-principal2'),
 ('55022000-0000-4000-8000-000000000013','https://programplan.example.test','synthetic-admin');
insert into public.memberships(id,identity_id,customer_id) values
 ('55022000-0000-4000-8000-000000000020','55022000-0000-4000-8000-000000000010','55022000-0000-4000-8000-000000000001'),
 ('55022000-0000-4000-8000-000000000021','55022000-0000-4000-8000-000000000011','55022000-0000-4000-8000-000000000001'),
 ('55022000-0000-4000-8000-000000000022','55022000-0000-4000-8000-000000000012','55022000-0000-4000-8000-000000000001'),
 ('55022000-0000-4000-8000-000000000023','55022000-0000-4000-8000-000000000013','55022000-0000-4000-8000-000000000001');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values
 ('55022000-0000-4000-8000-000000000030','55022000-0000-4000-8000-000000000002','55022030','Syntetisk programplansskola','0000'),
 ('55022000-0000-4000-8000-000000000031','55022000-0000-4000-8000-000000000002','55022031','Annan syntetisk skola','0000');
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values('55022000-0000-4000-8000-000000000060','55022000-0000-4000-8000-000000000020','55022000-0000-4000-8000-000000000001','55022000-0000-4000-8000-000000000002','huvudman','synthetic-v1','school');
insert into public.mandate_units values
 ('55022000-0000-4000-8000-000000000060','55022000-0000-4000-8000-000000000001','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000030'),
 ('55022000-0000-4000-8000-000000000060','55022000-0000-4000-8000-000000000001','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000031');
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55022000-0000-4000-8000-000000000080',decode(md5('55022000-0000-4000-8000-000000000080')||md5('55022000-0000-4000-8000-000000000080'),'hex'),
 '55022000-0000-4000-8000-000000000010','55022000-0000-4000-8000-000000000020','55022000-0000-4000-8000-000000000060',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor('55022000-0000-4000-8000-000000000060','55022000-0000-4000-8000-000000000020','55022000-0000-4000-8000-000000000010','55022000-0000-4000-8000-000000000080');
create temporary table programplan_roles(name text primary key,id uuid);
insert into programplan_roles values('hm','55022000-0000-4000-8000-000000000060'),
 ('principal',public.phase3_grant_mandate('{"membershipId":"55022000-0000-4000-8000-000000000021","function":"rektor","scopeKind":"school","unitIds":["55022000-0000-4000-8000-000000000030"]}')),
 ('principal2',public.phase3_grant_mandate('{"membershipId":"55022000-0000-4000-8000-000000000022","function":"rektor","scopeKind":"school","unitIds":["55022000-0000-4000-8000-000000000031"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values
 ('55022000-0000-4000-8000-000000000081',decode(md5('55022000-0000-4000-8000-000000000081')||md5('55022000-0000-4000-8000-000000000081'),'hex'),'55022000-0000-4000-8000-000000000011','55022000-0000-4000-8000-000000000021',(select id from programplan_roles where name='principal'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours'),
 ('55022000-0000-4000-8000-000000000082',decode(md5('55022000-0000-4000-8000-000000000082')||md5('55022000-0000-4000-8000-000000000082'),'hex'),'55022000-0000-4000-8000-000000000012','55022000-0000-4000-8000-000000000022',(select id from programplan_roles where name='principal2'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal2'),'55022000-0000-4000-8000-000000000022','55022000-0000-4000-8000-000000000012','55022000-0000-4000-8000-000000000082');
insert into programplan_roles values('admin',public.phase3_grant_mandate('{"membershipId":"55022000-0000-4000-8000-000000000023","function":"administrator","scopeKind":"school","unitIds":["55022000-0000-4000-8000-000000000031"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55022000-0000-4000-8000-000000000083',decode(md5('55022000-0000-4000-8000-000000000083')||md5('55022000-0000-4000-8000-000000000083'),'hex'),'55022000-0000-4000-8000-000000000013','55022000-0000-4000-8000-000000000023',(select id from programplan_roles where name='admin'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values
 ('55022000-0000-4000-8000-000000000040','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000030','gymnasium','Syntetisk bunden SA','Syntetisk kulltext utan datum','SA25','SABEP'),
 ('55022000-0000-4000-8000-000000000041','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000030','gymnasium','Syntetisk obunden SA','Inte ett datum','SA25','SABEP'),
 ('55022000-0000-4000-8000-000000000042','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000030','gymnasium','Syntetisk tidigare beslutad SA','Syntetiskt prov','SA25','SABEP'),
 ('55022000-0000-4000-8000-000000000043','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000031','gymnasium','Syntetisk annan skola SA','Syntetiskt prov','SA25','SABEP'),
 ('55022000-0000-4000-8000-000000000045','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000030','gymnasium','Syntetisk tom ES','Syntetiskt prov','ES25','ESBIF');
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference) values
 ('55022000-0000-4000-8000-000000000050','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000040',1,array['ENGE3000X'],'sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',pg_temp.programplan_reference());
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_fetched,status,decided_on) values
 ('55022000-0000-4000-8000-000000000051','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000041',1,array['ENGE3000X','ANIM1000X'],'2026-09-05','utkast',null),
 ('55022000-0000-4000-8000-000000000052','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000042',3,array['ENGE3000X'],'2026-09-05','faststalld','2026-09-10'),
 ('55022000-0000-4000-8000-000000000053','55022000-0000-4000-8000-000000000002','55022000-0000-4000-8000-000000000043',1,array['ENGE3000X'],'2026-09-05','utkast',null);
-- Only this synthetic legacy row predates session-based actor metadata.
set local session_replication_role=replica;
insert into public.point_plan_events(point_plan_id,actor_role,action,comment) values
 ('55022000-0000-4000-8000-000000000052','huvudman','Syntetiskt äldre beslut','Syntetisk historik ska bevaras');
set local session_replication_role=origin;

-- End programplan fixture. Alla syntetiska ändringar rullas tillbaka.
create function pg_temp.lid(n integer) returns uuid language sql immutable as $$select ('55022000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.actor(role text) returns void language plpgsql as $$begin
 if role='hm' then perform pg_temp.programplan_actor(pg_temp.lid(60),pg_temp.lid(20),pg_temp.lid(10),pg_temp.lid(80));
 elsif role='principal' then perform pg_temp.programplan_actor((select id from programplan_roles where name=role),pg_temp.lid(21),pg_temp.lid(11),pg_temp.lid(81));
 elsif role='principal2' then perform pg_temp.programplan_actor((select id from programplan_roles where name=role),pg_temp.lid(22),pg_temp.lid(12),pg_temp.lid(82));
 else perform pg_temp.programplan_actor((select id from programplan_roles where name=role),pg_temp.lid(23),pg_temp.lid(13),pg_temp.lid(83)); end if;
end$$;
create function pg_temp.remove_b() returns jsonb language sql volatile as $$select public.phase5_change_programplan_education(pg_temp.lid(40),1,'units',jsonb_build_object('unitIds',jsonb_build_array(pg_temp.lid(30))))$$;
create function pg_temp.remove_reason() returns text language plpgsql as $$declare reason text;begin
 perform pg_temp.remove_b(); return 'allowed';
 exception when sqlstate '55006' then get stacked diagnostics reason=PG_EXCEPTION_HINT;return reason;end$$;
select pg_temp.actor('hm');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values(pg_temp.lid(32),pg_temp.lid(2),'55022032','Syntetisk okopplad skola','0000');
insert into public.school_unit_types(unit_id,school_type) values(pg_temp.lid(30),'GY'),(pg_temp.lid(31),'GY'),(pg_temp.lid(32),'GY');
update public.offerings set start_year=extract(year from public.app_today())::integer where id in (pg_temp.lid(40),pg_temp.lid(43));
select lives_ok($q$select public.phase5_change_programplan_education(pg_temp.lid(40),0,'units',jsonb_build_object('unitIds',jsonb_build_array(pg_temp.lid(30),pg_temp.lid(31))))$q$,'kopplar B till utbildningen');
select ok((select bool_and(convalidated) from pg_constraint where conname in ('school_classes_offering_unit_linkage_fkey','pupil_placements_offering_unit_linkage_fkey','timplans_offering_unit_linkage_fkey')),'alla nya FK validerade');
select col_not_null('public','timplans','unit_id','timplans skol-ID obligatoriskt');
select lives_ok($q$insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values(pg_temp.lid(100),pg_temp.lid(1),pg_temp.lid(2),pg_temp.lid(31),pg_temp.lid(40),'DELAD',2027)$q$,'klass på tillagd B tillåts');
select is(pg_temp.remove_reason(),'programplan_in_use','klass blockerar skolborttagning med verksamhetsorsak');
select is((select lifecycle_revision from public.offerings where id=pg_temp.lid(40)),1,'nekad borttagning ändrar inte revision');
select throws_ok($q$insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(pg_temp.lid(1),pg_temp.lid(2),pg_temp.lid(32),pg_temp.lid(40),'OKOPPLAD',2027)$q$,'23503',null,'klass på okopplad skola nekas');
delete from public.school_classes where id=pg_temp.lid(100);
insert into public.synthetic_pupil_numbers(personal_number) values('TEST-20100101-0014') on conflict do nothing;
insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name) values(pg_temp.lid(110),pg_temp.lid(1),pg_temp.lid(2),'Syntetisk skolkopplingselev','TEST-20100101-0014','Elev skolkoppling');
select lives_ok($q$insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on) values(pg_temp.lid(111),pg_temp.lid(1),pg_temp.lid(2),pg_temp.lid(110),pg_temp.lid(31),pg_temp.lid(40),public.app_today()-30)$q$,'placering på tillagd B tillåts');
select is(pg_temp.remove_reason(),'programplan_in_use','placering blockerar skolborttagning med verksamhetsorsak');
select throws_ok($q$insert into public.pupil_placements(customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on,ends_on) values(pg_temp.lid(1),pg_temp.lid(2),pg_temp.lid(110),pg_temp.lid(32),pg_temp.lid(40),public.app_today()-100,public.app_today()-99)$q$,'23503',null,'placering på okopplad skola nekas');
-- Befintligt utbildningsbyte i registret använder skolkopplingen och oförändrad form.
create function pg_temp.education_cmd(off integer,rev integer) returns jsonb language sql as $$select jsonb_build_object('pupilId',pg_temp.lid(110),'schoolYear',extract(year from public.app_today())::integer,'caseId',null,'expectedVersion',rev,'kind','education','payload',jsonb_build_object('placementId',pg_temp.lid(111),'educationId',pg_temp.lid(off),'startsOn',public.app_today()-1))$$;
select pg_temp.actor('admin');
select lives_ok($q$select public.phase4_validate_selection(jsonb_build_object('schoolYear',extract(year from public.app_today())::integer,'unitId',pg_temp.lid(31),'classId',null,'educationId',pg_temp.lid(40),'grade',null,'status',null,'page',1))$q$,'registret accepterar delad utbildning på B');
create temporary table register_options as select public.phase4_list_pupils(jsonb_build_object('selection',jsonb_build_object('schoolYear',extract(year from public.app_today())::integer,'unitId',pg_temp.lid(31),'classId',null,'educationId',null,'grade',null,'status',null,'page',1),'search','','caseId',null)) value;
select ok(exists(select 1 from register_options r,jsonb_array_elements(r.value->'body'->'options'->'educations') e where e->>'id'=pg_temp.lid(40)::text and e->>'unitId'=pg_temp.lid(31)::text),'B:s registerval visar delad utbildning med B:s unitId');
select ok(exists(select 1 from register_options r,jsonb_array_elements(r.value->'body'->'options'->'grades') e where e='1'::jsonb),'B:s årskursval omfattar den delade utbildningen');
select is(public.phase4_history_value('education',to_jsonb(pg_temp.lid(40)),pg_temp.lid(31)),to_jsonb('Syntetisk bunden SA'::text),'utbildningsetikett går att läsa på B');
select is(public.phase4_history_value('education',to_jsonb(pg_temp.lid(40)),pg_temp.lid(32)),'null'::jsonb,'etikett för okopplad skola lämnas inte ut');
select throws_ok($q$select public.phase4_change_pupil(pg_temp.education_cmd(41,1))$q$,'22023','Invalid education','registret nekar utbildning som bara finns på A');
select is(public.phase4_change_pupil(pg_temp.education_cmd(40,1))->>'kind','success','registret sparar utbildningsbyte till delad utbildning på B');
select ok(exists(select 1 from public.pupil_placements where pupil_id=pg_temp.lid(110) and starts_on=public.app_today()-1 and unit_id=pg_temp.lid(31) and offering_id=pg_temp.lid(40)),'sparat utbildningsbyte behåller B:s skola');
select pg_temp.actor('hm');
delete from public.pupil_placements where pupil_id=pg_temp.lid(110);
-- GY: version och explicit klasskoppling är per skola.
insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,decided_on) values
 (pg_temp.lid(150),pg_temp.lid(2),pg_temp.lid(40),pg_temp.lid(30),1,'faststalld',public.app_today()),
 (pg_temp.lid(151),pg_temp.lid(2),pg_temp.lid(40),pg_temp.lid(31),1,'faststalld',public.app_today());
select is((select count(*)::integer from public.timplans where offering_id=pg_temp.lid(40) and version=1),2,'två skolor har samma utbildningsversion självständigt');
select is(pg_temp.remove_reason(),'programplan_in_use','timplan blockerar skolborttagning med verksamhetsorsak');
select lives_ok($q$insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(pg_temp.lid(31),'GYB',2027,pg_temp.lid(151),'ar1')$q$,'klass B kopplas till B:s fastställda timplan');
select throws_ok($q$insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(pg_temp.lid(31),'FELSKOLA',2027,pg_temp.lid(150),'ar1')$q$,'P0001','Timplanen hör till en annan skolenhet.','klass B nekas A:s timplan');
select throws_ok($q$insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(pg_temp.lid(31),'FELKOLUMN',2027,pg_temp.lid(151),'ak1')$q$,'P0001','Välj en årskurs som finns i timplanen.','kolumnkontroll bevarad');
update public.timplans set status='ersatt' where id=pg_temp.lid(151);
insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,decided_on) values(pg_temp.lid(152),pg_temp.lid(2),pg_temp.lid(40),pg_temp.lid(31),2,'faststalld',public.app_today());
select is((select timplan_id from public.class_timplans where unit_id=pg_temp.lid(31) and class_name='GYB'),pg_temp.lid(151),'ny fastställd B-version flyttar aldrig befintlig klasskoppling');
select throws_ok($q$insert into public.timplans(organizer_id,offering_id,unit_id,version) values(pg_temp.lid(2),pg_temp.lid(40),pg_temp.lid(32),1)$q$,'23503',null,'timplan på okopplad skola nekas');
select throws_ok($q$insert into public.timplans(organizer_id,offering_id,version) values(pg_temp.lid(2),pg_temp.lid(40),99)$q$,'23502',null,'timplan utan explicit skola nekas');
-- GR: befintliga read/list/change-kommandon ärver timplanens skola.
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades) values(pg_temp.lid(70),pg_temp.lid(2),pg_temp.lid(30),'grundskola','Delad syntetisk grundutbildning','Prov',array[1,4,9]::smallint[]);
insert into public.offering_units(offering_id,unit_id,organizer_id) values(pg_temp.lid(70),pg_temp.lid(31),pg_temp.lid(2));
insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values(pg_temp.lid(170),pg_temp.lid(2),pg_temp.lid(70),pg_temp.lid(30),1,'Syntetisk grund'),(pg_temp.lid(171),pg_temp.lid(2),pg_temp.lid(70),pg_temp.lid(31),1,'Syntetisk grund');
insert into public.timplan_cells values(pg_temp.lid(170),'matematik',array[100,200,300]::smallint[]),(pg_temp.lid(171),'matematik',array[100,200,300]::smallint[]);
select throws_ok($q$insert into public.timplans(organizer_id,offering_id,unit_id,version) values(pg_temp.lid(2),pg_temp.lid(70),pg_temp.lid(31),2)$q$,'23505',null,'bara en öppen version per skola');
select pg_temp.actor('principal2');
select is(public.phase5_read_timplan(pg_temp.lid(171))->>'unitId',pg_temp.lid(31)::text,'B:s rektor läser B:s timplan');
select is(public.phase5_read_timplan(pg_temp.lid(171))->>'schoolName','Annan syntetisk skola','läst skola är B trots huvudskola A');
select throws_ok($q$select public.phase5_read_timplan(pg_temp.lid(170))$q$,'42501','Planning denied','B:s rektor kan inte läsa A:s timplan');
select is((public.phase5_list_timplans(1)->>'count')::integer,1,'B:s timplanslista innehåller endast B:s version');
select is(public.phase5_list_timplans(1)->'plans'->0->>'id',pg_temp.lid(171)::text,'listval pekar på B:s timplan');
select lives_ok($q$select public.phase5_change_timplan_cell(pg_temp.lid(171),0,'matematik',1,225)$q$,'B:s rektor ändrar B:s timplan');
select throws_ok($q$select public.phase5_change_timplan_cell(pg_temp.lid(170),0,'matematik',1,225)$q$,'42501','Planning denied','B:s rektor kan inte ändra A:s timplan');
select is((select hours from public.timplan_cells where timplan_id=pg_temp.lid(170)),array[100,200,300]::smallint[],'A:s timmar lämnas orörda av B');
select pg_temp.actor('principal');
select is(public.phase5_read_timplan(pg_temp.lid(170))->>'unitId',pg_temp.lid(30)::text,'huvudskolans rektor kan läsa sin timplan');
select throws_ok($q$select public.phase5_read_timplan(pg_temp.lid(171))$q$,'42501','Planning denied','huvudskolans rektor kan inte läsa B:s timplan');
select ok(not exists(select 1 from existing_classes s full join public.school_classes c on c.id=s.id where s.id is not null and to_jsonb(c) is distinct from s.value),'befintliga klasser oförändrade');
select ok(not exists(select 1 from existing_placements s full join public.pupil_placements c on c.id=s.id where s.id is not null and to_jsonb(c) is distinct from s.value),'befintliga placeringar oförändrade');
select ok(not exists(select 1 from existing_plans s full join public.timplans c on c.id=s.id where s.id is not null and to_jsonb(c) is distinct from s.value),'befintliga timplaner oförändrade');
select ok(not exists(select 1 from existing_bindings s full join public.class_timplans c using(unit_id,class_name,start_year) where s.unit_id is not null and to_jsonb(c) is distinct from s.value),'befintliga klasskopplingar oförändrade');
select is(has_function_privilege(role,'public.copy_offering_cohort(uuid,integer)','EXECUTE'),false,'äldre kullkopiering stängd för '||role) from unnest(array['anon','authenticated','skolplattform_worker'])role;
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='public.copy_offering_cohort(uuid,integer)'::regprocedure and a.grantee=0),'äldre kullkopiering stängd för PUBLIC');
select is(has_function_privilege('service_role','public.copy_offering_cohort(uuid,integer)','EXECUTE'),true,'äldre service_role-behörighet oförändrad; ej Worker-/klientväg');
select * from finish();
rollback;
