begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- 04-14: relationsgrunden är portad till det beständiga elevregistret. Samma elev-,
-- grupp- och ärende-ID som tidigare; utbildning, placering och klassmedlemskap får
-- deterministiska ID via phase4_probe_uuid (samma schema som migreringen
-- 20260929110000). Inga rader skapas i phase3_probe_pupils/-groups/-group_members;
-- elevläsning prövas via fas 4:s lista, kort och export. Endast syntetiska data i rollback.
create function pg_temp.school_year() returns integer language sql stable as $$
 select extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end $$;
create function pg_temp.register_offering(o uuid,u uuid,y integer default null) returns uuid language plpgsql as $$begin
 insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,start_year)
 values(public.phase4_probe_uuid('offering:'||u),o,u,'grundskola','Syntetisk provutbildning','Syntetisk migrering',coalesce(y,pg_temp.school_year()))
 on conflict(id) do nothing;
 return public.phase4_probe_uuid('offering:'||u);
end $$;
create function pg_temp.register_pupil(p uuid,c uuid,o uuid,u uuid,name text) returns void language plpgsql as $$begin
 perform pg_temp.register_offering(o,u);
 insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name)
 select p,c,o,name,n.personal_number,'Elev '||right(p::text,3) from public.synthetic_pupil_numbers n
 where not exists(select 1 from public.pupils x where x.customer_id=c and x.personal_number=n.personal_number)
 order by n.personal_number limit 1;
 insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
 values(public.phase4_probe_uuid('placement:'||p),c,o,p,u,public.phase4_probe_uuid('offering:'||u),make_date(pg_temp.school_year(),7,1));
end $$;
create function pg_temp.register_class(g uuid,c uuid,o uuid,u uuid) returns void language plpgsql as $$begin
 insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
 values(g,c,o,u,pg_temp.register_offering(o,u),'PROV-'||upper(g::text),pg_temp.school_year());
end $$;
create function pg_temp.register_member(g uuid,p uuid,c uuid,u uuid) returns void language plpgsql as $$begin
 insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
 select public.phase4_probe_uuid('member:'||g||':'||p),c,pp.organizer_id,p,u,g,pp.id,pp.starts_on
 from public.pupil_placements pp where pp.id=public.phase4_probe_uuid('placement:'||p);
 if not found then raise exception 'Synthetic placement missing' using errcode='23503'; end if;
end $$;
-- Syntetisk relationsgrund för 03-02; inga API-mandat aktiveras.
-- Kör endast efter assertTarget(protected), som postgres. Inga rader raderas.
insert into public.customers(id,name) values ('33006000-0000-4000-8000-000000000001','Syntetisk fas 3 kund 1') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33006000-0000-4000-8000-000000000011','33006000-0000-4000-8000-000000000001','Syntetisk huvudman 1','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33006000-0000-4000-8000-000000000021','https://phase3-matrix.example.test','synthetic-1') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33006000-0000-4000-8000-000000000031','33006000-0000-4000-8000-000000000021','33006000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33006000-0000-4000-8000-000000000041','33006000-0000-4000-8000-000000000031','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000011','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33006000-0000-4000-8000-000000000111','33006000-0000-4000-8000-000000000011','33000011','Syntetisk skola 11','0000') on conflict do nothing;
insert into public.mandate_units values ('33006000-0000-4000-8000-000000000041','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000011','33006000-0000-4000-8000-000000000111') on conflict do nothing;
select pg_temp.register_pupil('33006000-0000-4000-8000-000000000211','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000011','33006000-0000-4000-8000-000000000111','Syntetisk elev 11');
select pg_temp.register_class('33006000-0000-4000-8000-000000000311','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000011','33006000-0000-4000-8000-000000000111');
select pg_temp.register_member('33006000-0000-4000-8000-000000000311','33006000-0000-4000-8000-000000000211','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000111');
insert into public.phase3_probe_cases values ('33006000-0000-4000-8000-000000000411','33006000-0000-4000-8000-000000000211','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000111') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33006000-0000-4000-8000-000000000112','33006000-0000-4000-8000-000000000011','33000012','Syntetisk skola 12','0000') on conflict do nothing;
insert into public.mandate_units values ('33006000-0000-4000-8000-000000000041','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000011','33006000-0000-4000-8000-000000000112') on conflict do nothing;
select pg_temp.register_pupil('33006000-0000-4000-8000-000000000212','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000011','33006000-0000-4000-8000-000000000112','Syntetisk elev 12');
select pg_temp.register_class('33006000-0000-4000-8000-000000000312','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000011','33006000-0000-4000-8000-000000000112');
select pg_temp.register_member('33006000-0000-4000-8000-000000000312','33006000-0000-4000-8000-000000000212','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000112');
insert into public.phase3_probe_cases values ('33006000-0000-4000-8000-000000000412','33006000-0000-4000-8000-000000000212','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000112') on conflict do nothing;
insert into public.customers(id,name) values ('33006000-0000-4000-8000-000000000002','Syntetisk fas 3 kund 2') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33006000-0000-4000-8000-000000000012','33006000-0000-4000-8000-000000000002','Syntetisk huvudman 2','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33006000-0000-4000-8000-000000000022','https://phase3-matrix.example.test','synthetic-2') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33006000-0000-4000-8000-000000000032','33006000-0000-4000-8000-000000000022','33006000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33006000-0000-4000-8000-000000000042','33006000-0000-4000-8000-000000000032','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000012','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33006000-0000-4000-8000-000000000121','33006000-0000-4000-8000-000000000012','33000021','Syntetisk skola 21','0000') on conflict do nothing;
insert into public.mandate_units values ('33006000-0000-4000-8000-000000000042','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000012','33006000-0000-4000-8000-000000000121') on conflict do nothing;
select pg_temp.register_pupil('33006000-0000-4000-8000-000000000221','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000012','33006000-0000-4000-8000-000000000121','Syntetisk elev 21');
select pg_temp.register_class('33006000-0000-4000-8000-000000000321','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000012','33006000-0000-4000-8000-000000000121');
select pg_temp.register_member('33006000-0000-4000-8000-000000000321','33006000-0000-4000-8000-000000000221','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000121');
insert into public.phase3_probe_cases values ('33006000-0000-4000-8000-000000000421','33006000-0000-4000-8000-000000000221','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000121') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33006000-0000-4000-8000-000000000122','33006000-0000-4000-8000-000000000012','33000022','Syntetisk skola 22','0000') on conflict do nothing;
insert into public.mandate_units values ('33006000-0000-4000-8000-000000000042','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000012','33006000-0000-4000-8000-000000000122') on conflict do nothing;
select pg_temp.register_pupil('33006000-0000-4000-8000-000000000222','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000012','33006000-0000-4000-8000-000000000122','Syntetisk elev 22');
select pg_temp.register_class('33006000-0000-4000-8000-000000000322','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000012','33006000-0000-4000-8000-000000000122');
select pg_temp.register_member('33006000-0000-4000-8000-000000000322','33006000-0000-4000-8000-000000000222','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000122');
insert into public.phase3_probe_cases values ('33006000-0000-4000-8000-000000000422','33006000-0000-4000-8000-000000000222','33006000-0000-4000-8000-000000000002','33006000-0000-4000-8000-000000000122') on conflict do nothing;
create temporary table results(name text primary key,id uuid);
grant all on results to skolplattform_worker;
insert into public.identities(id,issuer,subject) values ('33006000-0000-4000-8000-000000000071','https://phase3-matrix.example.test','mandate-1');
insert into public.memberships(id,identity_id,customer_id) values ('33006000-0000-4000-8000-000000000061','33006000-0000-4000-8000-000000000071','33006000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33006000-0000-4000-8000-000000000072','https://phase3-matrix.example.test','mandate-2');
insert into public.memberships(id,identity_id,customer_id) values ('33006000-0000-4000-8000-000000000062','33006000-0000-4000-8000-000000000072','33006000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33006000-0000-4000-8000-000000000073','https://phase3-matrix.example.test','mandate-3');
insert into public.memberships(id,identity_id,customer_id) values ('33006000-0000-4000-8000-000000000063','33006000-0000-4000-8000-000000000073','33006000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33006000-0000-4000-8000-000000000074','https://phase3-matrix.example.test','mandate-4');
insert into public.memberships(id,identity_id,customer_id) values ('33006000-0000-4000-8000-000000000064','33006000-0000-4000-8000-000000000074','33006000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33006000-0000-4000-8000-000000000075','https://phase3-matrix.example.test','mandate-5');
insert into public.memberships(id,identity_id,customer_id) values ('33006000-0000-4000-8000-000000000065','33006000-0000-4000-8000-000000000075','33006000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33006000-0000-4000-8000-000000000076','https://phase3-matrix.example.test','mandate-6');
insert into public.memberships(id,identity_id,customer_id) values ('33006000-0000-4000-8000-000000000066','33006000-0000-4000-8000-000000000076','33006000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33006000-0000-4000-8000-000000000077','https://phase3-matrix.example.test','mandate-7');
insert into public.memberships(id,identity_id,customer_id) values ('33006000-0000-4000-8000-000000000067','33006000-0000-4000-8000-000000000077','33006000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33006000-0000-4000-8000-000000000078','https://phase3-matrix.example.test','mandate-8');
insert into public.memberships(id,identity_id,customer_id) values ('33006000-0000-4000-8000-000000000068','33006000-0000-4000-8000-000000000078','33006000-0000-4000-8000-000000000001');
-- 04-14: fas 4:s läsvägar ersätter phase3_read_pupils. Listan anropas för varje egen
-- mandatskola (samma SQL som Workerns elevlista), kortet per elev och exporten som
-- serverns preview. Saknas mandatskola anropas listan utan skola och ska nekas.
create function pg_temp.list(u uuid,c uuid default null,y integer default null) returns jsonb language sql as $$
 select public.phase4_list_pupils(jsonb_build_object('selection',jsonb_build_object('schoolYear',coalesce(y,pg_temp.school_year()),'unitId',u,'classId',null,'educationId',null,'grade',null,'status',null,'page',1),'search','','caseId',c))->'body' $$;
create function pg_temp.visible(c uuid default null,y integer default null) returns uuid[] language sql as $$
 select coalesce(array_agg((p->>'id')::uuid order by (p->>'id')::uuid) filter (where p is not null),'{}')
 from (select m.unit_id from public.mandate_units m where m.assignment_id=nullif(current_setting('app.assignment_id',true),'')::uuid
  union all select null where not exists(select 1 from public.mandate_units m where m.assignment_id=nullif(current_setting('app.assignment_id',true),'')::uuid)) m
 left join lateral jsonb_array_elements(pg_temp.list(m.unit_id,c,y)->'pupils') p on true $$;
create function pg_temp.card(p uuid,c uuid default null,y integer default null) returns jsonb language sql as $$
 select public.phase4_pupil_card(jsonb_build_object('pupilId',p,'schoolYear',coalesce(y,pg_temp.school_year()),'caseId',c))->'body' $$;
create function pg_temp.export_count() returns integer language sql as $$
 select coalesce(sum((public.phase4_export_pupils(jsonb_build_object('mode','filter','selection',jsonb_build_object('schoolYear',pg_temp.school_year(),'unitId',m.unit_id,'classId',null,'educationId',null,'grade',null,'status',null,'page',1),
  'search','','schoolYear',pg_temp.school_year(),'caseId',null,'fields','["id","displayName"]'::jsonb,'protectedIds','[]'::jsonb,'includePersonalNumber',false),true)->'body'->>'count')::integer),0)::integer
 from (select m.unit_id from public.mandate_units m where m.assignment_id=nullif(current_setting('app.assignment_id',true),'')::uuid
  union all select null where not exists(select 1 from public.mandate_units m where m.assignment_id=nullif(current_setting('app.assignment_id',true),'')::uuid)) m $$;
create function pg_temp.actor(a uuid,m uuid,i uuid) returns void language plpgsql as $$begin
perform set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),set_config('app.identity_id',i::text,true),set_config('app.customer_id','33006000-0000-4000-8000-000000000001',true); end $$;
select pg_temp.actor('33006000-0000-4000-8000-000000000041'::uuid,'33006000-0000-4000-8000-000000000031','33006000-0000-4000-8000-000000000021');
select lives_ok($t$insert into results values ('principal',public.phase3_grant_mandate('{"membershipId": "33006000-0000-4000-8000-000000000061", "function": "rektor", "scopeKind": "school", "unitIds": ["33006000-0000-4000-8000-000000000111"]}'))$t$,'grant principal');
select pg_temp.actor((select id from results where name='principal'),'33006000-0000-4000-8000-000000000061','33006000-0000-4000-8000-000000000071');
select lives_ok($t$insert into results values ('admin',public.phase3_grant_mandate('{"membershipId": "33006000-0000-4000-8000-000000000062", "function": "administrator", "scopeKind": "school", "unitIds": ["33006000-0000-4000-8000-000000000111"]}'))$t$,'grant admin');
select lives_ok($t$insert into results values ('teacher',public.phase3_grant_mandate('{"membershipId": "33006000-0000-4000-8000-000000000063", "function": "larare", "scopeKind": "group", "unitIds": ["33006000-0000-4000-8000-000000000111"], "groups": [{"id": "33006000-0000-4000-8000-000000000311", "kind": "teaching"}]}'))$t$,'grant teacher');
select lives_ok($t$insert into results values ('healthpupil',public.phase3_grant_mandate('{"membershipId": "33006000-0000-4000-8000-000000000064", "function": "elevhalsa", "scopeKind": "pupil", "unitIds": ["33006000-0000-4000-8000-000000000111"], "pupilIds": ["33006000-0000-4000-8000-000000000211"]}'))$t$,'grant healthpupil');
select lives_ok($t$insert into results values ('healthcase',public.phase3_grant_mandate('{"membershipId": "33006000-0000-4000-8000-000000000065", "function": "elevhalsa", "scopeKind": "case", "unitIds": ["33006000-0000-4000-8000-000000000111"], "caseIds": ["33006000-0000-4000-8000-000000000411"]}'))$t$,'grant healthcase');
select lives_ok($t$insert into results values ('healthschool',public.phase3_grant_mandate('{"membershipId": "33006000-0000-4000-8000-000000000066", "function": "elevhalsa", "scopeKind": "school", "unitIds": ["33006000-0000-4000-8000-000000000111"]}'))$t$,'grant healthschool');
select pg_temp.actor('33006000-0000-4000-8000-000000000041'::uuid,'33006000-0000-4000-8000-000000000031','33006000-0000-4000-8000-000000000021');
select lives_ok($t$insert into results values ('principal2',public.phase3_grant_mandate('{"membershipId": "33006000-0000-4000-8000-000000000067", "function": "rektor", "scopeKind": "school", "unitIds": ["33006000-0000-4000-8000-000000000112"]}'))$t$,'grant principal2');
select pg_temp.actor((select id from results where name='principal2'),'33006000-0000-4000-8000-000000000067','33006000-0000-4000-8000-000000000077');
select lives_ok($t$insert into results values ('admin2',public.phase3_grant_mandate('{"membershipId": "33006000-0000-4000-8000-000000000068", "function": "administrator", "scopeKind": "school", "unitIds": ["33006000-0000-4000-8000-000000000112"]}'))$t$,'grant admin2');
select pg_temp.actor((select id from results where name='principal'),'33006000-0000-4000-8000-000000000061','33006000-0000-4000-8000-000000000071');
select is(pg_temp.visible(),array['33006000-0000-4000-8000-000000000211'::uuid],'principal-school: endast egen skola');
select throws_ok($t$select pg_temp.list('33006000-0000-4000-8000-000000000112')$t$,'42501',null,'principal-school-other: annan skolas registerlista nekas');
select throws_ok($t$select pg_temp.card('33006000-0000-4000-8000-000000000212')$t$,'P0002',null,'principal-school-other-card: annan skolas elev hittas inte');
select pg_temp.actor((select id from results where name='teacher'),'33006000-0000-4000-8000-000000000063','33006000-0000-4000-8000-000000000073');
update public.mandate_groups set kind='mentor' where assignment_id=(select id from results where name='teacher');
select is(pg_temp.visible(),array['33006000-0000-4000-8000-000000000211'::uuid],'teacher-mentor: explicit mentorgrupp');
delete from public.mandate_groups where assignment_id=(select id from results where name='teacher');
select is(public.phase3_mandate_is_valid((select id from results where name='teacher')),false,'teacher-empty: tomt gruppscope ger ingen rätt');
insert into public.mandate_groups select id,'33006000-0000-4000-8000-000000000311',customer_id,'33006000-0000-4000-8000-000000000111','undervisning' from public.access_assignments where id=(select id from results where name='teacher');
select pg_temp.register_pupil('33006000-0000-4000-8000-000000000219','33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000011','33006000-0000-4000-8000-000000000111','Syntetisk annan elev');
select pg_temp.actor((select id from results where name='healthpupil'),'33006000-0000-4000-8000-000000000064','33006000-0000-4000-8000-000000000074');
select is(pg_temp.card('33006000-0000-4000-8000-000000000211')->>'id','33006000-0000-4000-8000-000000000211','health-pupil-own: explicit elev läses i registret');
select throws_ok($t$select pg_temp.card('33006000-0000-4000-8000-000000000219')$t$,'P0002',null,'health-pupil-other: annan elev i samma skola nekar');
select is(pg_temp.visible(),array['33006000-0000-4000-8000-000000000211'::uuid],'health-pupil-list: listan visar bara den explicita eleven');
-- Registrets mandate_pupils-FK binder elev och kund men inte skola; läsningen kräver placering i mandatskolan.
insert into public.mandate_pupils select id,'33006000-0000-4000-8000-000000000212',customer_id,'33006000-0000-4000-8000-000000000111' from public.access_assignments where id=(select id from results where name='healthpupil');
select throws_ok($t$select pg_temp.card('33006000-0000-4000-8000-000000000212')$t$,'P0002',null,'health-pupil-unplaced: elevmandat utan placering i mandatskolan ger ingen läsning');
select is(pg_temp.visible(),array['33006000-0000-4000-8000-000000000211'::uuid],'health-pupil-unplaced-list: elev vid annan skola visas inte');
delete from public.mandate_pupils where assignment_id=(select id from results where name='healthpupil') and pupil_id='33006000-0000-4000-8000-000000000212';
select throws_ok($t$select pg_temp.export_count()$t$,'42501',null,'health-export: elevhälsa kan inte exportera');
select pg_temp.actor((select id from results where name='healthcase'),'33006000-0000-4000-8000-000000000065','33006000-0000-4000-8000-000000000075');
select is(pg_temp.card('33006000-0000-4000-8000-000000000211','33006000-0000-4000-8000-000000000411')->>'id','33006000-0000-4000-8000-000000000211','health-case-own: ärendets elev läses med ärendekontext');
select throws_ok($t$select pg_temp.card('33006000-0000-4000-8000-000000000219','33006000-0000-4000-8000-000000000411')$t$,'P0002',null,'health-case-other-pupil: ärende måste tillhöra begärd elev');
-- 04-14: skolbyte med daterade placeringar. Eleven 211 lämnar skola 111 vid läsårets slut
-- och börjar på skola 112 nästa läsår; gruppmedlemskapet slutar samtidigt. Mandat vid
-- den gamla skolan följer inte med till nästa läsår, och den nya skolan ser inte den
-- gamla perioden.
update public.pupil_placements set ends_on=make_date(pg_temp.school_year()+1,6,30) where id=public.phase4_probe_uuid('placement:33006000-0000-4000-8000-000000000211');
update public.pupil_class_memberships set ends_on=make_date(pg_temp.school_year()+1,6,30) where pupil_id='33006000-0000-4000-8000-000000000211';
insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on) values (public.phase4_probe_uuid('placement-next:33006000-0000-4000-8000-000000000211'),'33006000-0000-4000-8000-000000000001','33006000-0000-4000-8000-000000000011','33006000-0000-4000-8000-000000000211','33006000-0000-4000-8000-000000000112',public.phase4_probe_uuid('offering:33006000-0000-4000-8000-000000000112'),make_date(pg_temp.school_year()+1,7,1));
select pg_temp.actor((select id from results where name='healthpupil'),'33006000-0000-4000-8000-000000000064','33006000-0000-4000-8000-000000000074');
select throws_ok($t$select pg_temp.card('33006000-0000-4000-8000-000000000211',null,pg_temp.school_year()+1)$t$,'P0002',null,'health-pupil-move: elevmandat i gammal skola följer inte eleven');
select is(pg_temp.card('33006000-0000-4000-8000-000000000211')->>'unitId','33006000-0000-4000-8000-000000000111','health-pupil-move-history: innevarande läsår visar bara gamla skolans placering');
select pg_temp.actor((select id from results where name='principal'),'33006000-0000-4000-8000-000000000061','33006000-0000-4000-8000-000000000071');
select ok(not ('33006000-0000-4000-8000-000000000211'::uuid=any(pg_temp.visible(null,pg_temp.school_year()+1))),'principal-move: skolmandat i gammal skola följer inte eleven');
select throws_ok($t$select pg_temp.card('33006000-0000-4000-8000-000000000211',null,pg_temp.school_year()+1)$t$,'P0002',null,'principal-move-card: elevkort vid ny skola nekas gamla rektorn');
select pg_temp.actor((select id from results where name='teacher'),'33006000-0000-4000-8000-000000000063','33006000-0000-4000-8000-000000000073');
select ok(not ('33006000-0000-4000-8000-000000000211'::uuid=any(pg_temp.visible(null,pg_temp.school_year()+1))),'teacher-move: gruppmandat följer inte eleven');
select pg_temp.actor((select id from results where name='principal2'),'33006000-0000-4000-8000-000000000067','33006000-0000-4000-8000-000000000077');
select ok('33006000-0000-4000-8000-000000000211'::uuid=any(pg_temp.visible(null,pg_temp.school_year()+1)),'principal2-move: ny skola ser eleven nästa läsår');
select is(pg_temp.card('33006000-0000-4000-8000-000000000211',null,pg_temp.school_year()+1)->>'unitId','33006000-0000-4000-8000-000000000112','principal2-move-card: kortet visar bara nya skolans placering');
select is((select array_agg(distinct x->>'unitId') from jsonb_array_elements(pg_temp.card('33006000-0000-4000-8000-000000000211',null,pg_temp.school_year()+1)->'placements') x),array['33006000-0000-4000-8000-000000000112'],'principal2-move-placements: kortets placeringar gäller bara nya skolan');
select throws_ok($t$select pg_temp.card('33006000-0000-4000-8000-000000000211')$t$,'P0002',null,'principal2-move-history: ny skola ser inte gamla skolans läsår');
select pg_temp.actor((select id from results where name='principal'),'33006000-0000-4000-8000-000000000061','33006000-0000-4000-8000-000000000071');
select throws_ok($t$select public.phase3_grant_mandate(jsonb_build_object('membershipId','33006000-0000-4000-8000-000000000062','function','elevhalsoansvarig','scopeKind','school','unitIds',jsonb_build_array('33006000-0000-4000-8000-000000000111')))$t$,'42501',null,'no-public-health-lead: ingen publik utnämning');
select throws_ok($t$select public.phase3_grant_mandate(jsonb_build_object('membershipId','33006000-0000-4000-8000-000000000062','function','owner','scopeKind','school','unitIds',jsonb_build_array('33006000-0000-4000-8000-000000000111')))$t$,'22P02',null,'unknown-function: databasenum nekar');
update public.access_assignments set function='huvudman' where id=(select id from results where name='principal');
select is(public.phase3_mandate_is_valid((select id from results where name='teacher')),false,'parent-invalid-function: full livekontroll nekar');
update public.access_assignments set function='rektor' where id=(select id from results where name='principal');
update public.access_assignments set membership_id='33006000-0000-4000-8000-000000000063' where id=(select id from results where name='principal');
select is(public.phase3_mandate_is_valid((select id from results where name='teacher')),false,'parent-invalid-identity: full livekontroll nekar');
update public.access_assignments set membership_id='33006000-0000-4000-8000-000000000061' where id=(select id from results where name='principal');
update public.access_assignments set valid_from=public.app_today()+1 where id=(select id from results where name='principal');
select is(public.phase3_mandate_is_valid((select id from results where name='teacher')),false,'parent-invalid-upcoming: full livekontroll nekar');
update public.access_assignments set valid_from=public.app_today() where id=(select id from results where name='principal');
update public.access_assignments set valid_from=public.app_today()-2,valid_to=public.app_today()-1 where id=(select id from results where name='principal');
select is(public.phase3_mandate_is_valid((select id from results where name='teacher')),false,'parent-invalid-expired: full livekontroll nekar');
update public.access_assignments set valid_from=public.app_today(),valid_to=null where id=(select id from results where name='principal');
select is(public.phase3_mandate_is_valid('33006000-0000-4000-8000-000000000888'),false,'missing-assignment: okänt uppdrag nekar');
insert into public.access_assignments(id,membership_id,customer_id,function) values('33006000-0000-4000-8000-000000000610','33006000-0000-4000-8000-000000000068','33006000-0000-4000-8000-000000000001','kundadmin');
insert into results values('account','33006000-0000-4000-8000-000000000610');
select pg_temp.actor((select id from results where name='account'),'33006000-0000-4000-8000-000000000068','33006000-0000-4000-8000-000000000078');
select throws_ok($t$select pg_temp.list('33006000-0000-4000-8000-000000000111')$t$,'42501',null,'customer-admin-no-pupils: kundkonto ger ingen elevläsning');
select throws_ok($t$select pg_temp.visible()$t$,'42501',null,'customer-admin-no-pupils-list: kundkonto utan skola nekas');
select lives_ok($t$select public.phase3_grant_mandate(jsonb_build_object('membershipId','33006000-0000-4000-8000-000000000062','function','kundadmin','scopeKind','school','unitIds','[]'::jsonb))$t$,'customer-only-kundadmin: kontomandat utan huvudman');
select lives_ok($t$select public.phase3_grant_mandate(jsonb_build_object('membershipId','33006000-0000-4000-8000-000000000062','function','granskare','scopeKind','school','unitIds','[]'::jsonb))$t$,'customer-only-granskare: kontomandat utan huvudman');
select is(has_table_privilege('skolplattform_worker','public.access_assignments','INSERT'),false,'direct-access_assignments-INSERT: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.access_assignments','UPDATE'),false,'direct-access_assignments-UPDATE: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.access_assignments','DELETE'),false,'direct-access_assignments-DELETE: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.invitations','INSERT'),false,'direct-invitations-INSERT: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.invitations','UPDATE'),false,'direct-invitations-UPDATE: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.invitations','DELETE'),false,'direct-invitations-DELETE: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.assignments','INSERT'),false,'direct-assignments-INSERT: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.assignments','UPDATE'),false,'direct-assignments-UPDATE: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.assignments','DELETE'),false,'direct-assignments-DELETE: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.assignment_units','INSERT'),false,'direct-assignment_units-INSERT: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.assignment_units','UPDATE'),false,'direct-assignment_units-UPDATE: generella skriver stängda');
select is(has_table_privilege('skolplattform_worker','public.assignment_units','DELETE'),false,'direct-assignment_units-DELETE: generella skriver stängda');
select is(pg_get_function_result('public.phase3_read_pupils(uuid,uuid,boolean)'::regprocedure),'TABLE(id uuid, display_name text, unit_id uuid, group_ids uuid[])'::text,'fields-are-exact: SQLreturen innehåller bara fyra basfält');
select pg_temp.actor((select id from results where name='principal'),'33006000-0000-4000-8000-000000000061','33006000-0000-4000-8000-000000000071');
select is((select array_agg(k order by k collate "C") from jsonb_object_keys(pg_temp.list('33006000-0000-4000-8000-000000000111')->'pupils'->0) k),array['capabilities','classId','className','displayName','educationId','educationName','grade','id','status','unitId','unitName'],'fields-are-exact-register: registerlistan ger bara basfält utan personnummer, födelsedatum eller hemkommun');
select is((select count(*) from public.phase3_read_pupils()),0::bigint,'legacy-reader-no-source: gamla läsaren har ingen elevdatakälla för registerelever');
select * from finish();
rollback;
