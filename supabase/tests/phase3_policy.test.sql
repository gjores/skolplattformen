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
insert into public.customers(id,name) values ('33002000-0000-4000-8000-000000000001','Syntetisk fas 3 kund 1') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000001','Syntetisk huvudman 1','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000021','https://phase3-policy.example.test','synthetic-1') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000031','33002000-0000-4000-8000-000000000021','33002000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33002000-0000-4000-8000-000000000041','33002000-0000-4000-8000-000000000031','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33002000-0000-4000-8000-000000000111','33002000-0000-4000-8000-000000000011','33000011','Syntetisk skola 11','0000') on conflict do nothing;
insert into public.mandate_units values ('33002000-0000-4000-8000-000000000041','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000111') on conflict do nothing;
select pg_temp.register_pupil('33002000-0000-4000-8000-000000000211','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000111','Syntetisk elev 11');
select pg_temp.register_class('33002000-0000-4000-8000-000000000311','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000111');
select pg_temp.register_member('33002000-0000-4000-8000-000000000311','33002000-0000-4000-8000-000000000211','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000111');
insert into public.phase3_probe_cases values ('33002000-0000-4000-8000-000000000411','33002000-0000-4000-8000-000000000211','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000111') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33002000-0000-4000-8000-000000000112','33002000-0000-4000-8000-000000000011','33000012','Syntetisk skola 12','0000') on conflict do nothing;
insert into public.mandate_units values ('33002000-0000-4000-8000-000000000041','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000112') on conflict do nothing;
select pg_temp.register_pupil('33002000-0000-4000-8000-000000000212','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000112','Syntetisk elev 12');
select pg_temp.register_class('33002000-0000-4000-8000-000000000312','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000112');
select pg_temp.register_member('33002000-0000-4000-8000-000000000312','33002000-0000-4000-8000-000000000212','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000112');
insert into public.phase3_probe_cases values ('33002000-0000-4000-8000-000000000412','33002000-0000-4000-8000-000000000212','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000112') on conflict do nothing;
insert into public.customers(id,name) values ('33002000-0000-4000-8000-000000000002','Syntetisk fas 3 kund 2') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33002000-0000-4000-8000-000000000012','33002000-0000-4000-8000-000000000002','Syntetisk huvudman 2','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000022','https://phase3-policy.example.test','synthetic-2') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000032','33002000-0000-4000-8000-000000000022','33002000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33002000-0000-4000-8000-000000000042','33002000-0000-4000-8000-000000000032','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000012','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33002000-0000-4000-8000-000000000121','33002000-0000-4000-8000-000000000012','33000021','Syntetisk skola 21','0000') on conflict do nothing;
insert into public.mandate_units values ('33002000-0000-4000-8000-000000000042','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000012','33002000-0000-4000-8000-000000000121') on conflict do nothing;
select pg_temp.register_pupil('33002000-0000-4000-8000-000000000221','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000012','33002000-0000-4000-8000-000000000121','Syntetisk elev 21');
select pg_temp.register_class('33002000-0000-4000-8000-000000000321','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000012','33002000-0000-4000-8000-000000000121');
select pg_temp.register_member('33002000-0000-4000-8000-000000000321','33002000-0000-4000-8000-000000000221','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000121');
insert into public.phase3_probe_cases values ('33002000-0000-4000-8000-000000000421','33002000-0000-4000-8000-000000000221','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000121') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33002000-0000-4000-8000-000000000122','33002000-0000-4000-8000-000000000012','33000022','Syntetisk skola 22','0000') on conflict do nothing;
insert into public.mandate_units values ('33002000-0000-4000-8000-000000000042','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000012','33002000-0000-4000-8000-000000000122') on conflict do nothing;
select pg_temp.register_pupil('33002000-0000-4000-8000-000000000222','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000012','33002000-0000-4000-8000-000000000122','Syntetisk elev 22');
select pg_temp.register_class('33002000-0000-4000-8000-000000000322','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000012','33002000-0000-4000-8000-000000000122');
select pg_temp.register_member('33002000-0000-4000-8000-000000000322','33002000-0000-4000-8000-000000000222','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000122');
insert into public.phase3_probe_cases values ('33002000-0000-4000-8000-000000000422','33002000-0000-4000-8000-000000000222','33002000-0000-4000-8000-000000000002','33002000-0000-4000-8000-000000000122') on conflict do nothing;
create temporary table results(name text primary key,id uuid);
grant all on results to skolplattform_worker;
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000071','https://phase3-policy.example.test','mandate-1');
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000061','33002000-0000-4000-8000-000000000071','33002000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000072','https://phase3-policy.example.test','mandate-2');
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000062','33002000-0000-4000-8000-000000000072','33002000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000073','https://phase3-policy.example.test','mandate-3');
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000063','33002000-0000-4000-8000-000000000073','33002000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000074','https://phase3-policy.example.test','mandate-4');
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000064','33002000-0000-4000-8000-000000000074','33002000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000075','https://phase3-policy.example.test','mandate-5');
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000065','33002000-0000-4000-8000-000000000075','33002000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000076','https://phase3-policy.example.test','mandate-6');
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000066','33002000-0000-4000-8000-000000000076','33002000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000077','https://phase3-policy.example.test','mandate-7');
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000067','33002000-0000-4000-8000-000000000077','33002000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000078','https://phase3-policy.example.test','mandate-8');
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000068','33002000-0000-4000-8000-000000000078','33002000-0000-4000-8000-000000000001');
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
perform set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),set_config('app.identity_id',i::text,true),set_config('app.customer_id','33002000-0000-4000-8000-000000000001',true); end $$;
select pg_temp.actor('33002000-0000-4000-8000-000000000041'::uuid,'33002000-0000-4000-8000-000000000031','33002000-0000-4000-8000-000000000021');
select lives_ok($t$insert into results values ('principal',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000061", "function": "rektor", "scopeKind": "school", "unitIds": ["33002000-0000-4000-8000-000000000111"]}'))$t$,'grant principal');
select pg_temp.actor((select id from results where name='principal'),'33002000-0000-4000-8000-000000000061','33002000-0000-4000-8000-000000000071');
select lives_ok($t$insert into results values ('admin',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000062", "function": "administrator", "scopeKind": "school", "unitIds": ["33002000-0000-4000-8000-000000000111"]}'))$t$,'grant admin');
select lives_ok($t$insert into results values ('teacher',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000063", "function": "larare", "scopeKind": "group", "unitIds": ["33002000-0000-4000-8000-000000000111"], "groups": [{"id": "33002000-0000-4000-8000-000000000311", "kind": "teaching"}]}'))$t$,'grant teacher');
select lives_ok($t$insert into results values ('healthpupil',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000064", "function": "elevhalsa", "scopeKind": "pupil", "unitIds": ["33002000-0000-4000-8000-000000000111"], "pupilIds": ["33002000-0000-4000-8000-000000000211"]}'))$t$,'grant healthpupil');
select lives_ok($t$insert into results values ('healthcase',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000065", "function": "elevhalsa", "scopeKind": "case", "unitIds": ["33002000-0000-4000-8000-000000000111"], "caseIds": ["33002000-0000-4000-8000-000000000411"]}'))$t$,'grant healthcase');
select lives_ok($t$insert into results values ('healthschool',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000066", "function": "elevhalsa", "scopeKind": "school", "unitIds": ["33002000-0000-4000-8000-000000000111"]}'))$t$,'grant healthschool');
select pg_temp.actor('33002000-0000-4000-8000-000000000041'::uuid,'33002000-0000-4000-8000-000000000031','33002000-0000-4000-8000-000000000021');
select lives_ok($t$insert into results values ('principal2',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000067", "function": "rektor", "scopeKind": "school", "unitIds": ["33002000-0000-4000-8000-000000000112"]}'))$t$,'grant principal2');
select pg_temp.actor((select id from results where name='principal2'),'33002000-0000-4000-8000-000000000067','33002000-0000-4000-8000-000000000077');
select lives_ok($t$insert into results values ('admin2',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000068", "function": "administrator", "scopeKind": "school", "unitIds": ["33002000-0000-4000-8000-000000000112"]}'))$t$,'grant admin2');
select pg_temp.actor((select id from results where name='admin'),'33002000-0000-4000-8000-000000000062','33002000-0000-4000-8000-000000000072');
select is(public.phase3_pupil_in_scope((select id from results where name='admin'),'33002000-0000-4000-8000-000000000212'),false,'ingen union med annat giltigt skolmandat');
select is(pg_temp.visible(),array['33002000-0000-4000-8000-000000000211'::uuid],'skoladmin ser endast egen skola');
select is(pg_temp.export_count(),1,'skoladmin kan exportera eget urval');
select pg_temp.actor('33002000-0000-4000-8000-000000000041'::uuid,'33002000-0000-4000-8000-000000000031','33002000-0000-4000-8000-000000000021');
select throws_ok($t$select pg_temp.visible()$t$,'42501',null,'huvudman saknar elevinsyn');
select pg_temp.actor((select id from results where name='teacher'),'33002000-0000-4000-8000-000000000063','33002000-0000-4000-8000-000000000073');
select is(pg_temp.visible(),array['33002000-0000-4000-8000-000000000211'::uuid],'lärare ser egen grupp');
select throws_ok($t$select pg_temp.export_count()$t$,'42501',null,'lärare får inte exportera');
select is(public.phase3_mandate_context()->'assignment'->'groups'->0->>'kind','teaching'::text,'SQL undervisning mappas till teaching');
-- 04-14: registret tillåter ett klassmedlemskap åt gången. Klass 399 läggs därför på elevens
-- föregående placering; kortets klasshistorik ska ändå bara visa lärarens mandatgrupp.
insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on,ends_on) values (public.phase4_probe_uuid('placement-prev:33002000-0000-4000-8000-000000000211'),'33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000211','33002000-0000-4000-8000-000000000111',public.phase4_probe_uuid('offering:33002000-0000-4000-8000-000000000111'),make_date(pg_temp.school_year()-1,7,1),make_date(pg_temp.school_year(),6,30));
select pg_temp.register_class('33002000-0000-4000-8000-000000000399','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000111');
insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on) values (public.phase4_probe_uuid('member:33002000-0000-4000-8000-000000000399:33002000-0000-4000-8000-000000000211'),'33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000211','33002000-0000-4000-8000-000000000111','33002000-0000-4000-8000-000000000399',public.phase4_probe_uuid('placement-prev:33002000-0000-4000-8000-000000000211'),make_date(pg_temp.school_year()-1,7,1),make_date(pg_temp.school_year(),6,30));
select throws_ok($t$insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on) values ('33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000211','33002000-0000-4000-8000-000000000111','33002000-0000-4000-8000-000000000399',public.phase4_probe_uuid('placement:33002000-0000-4000-8000-000000000211'),public.app_today())$t$,'23P01',null,'samtidigt dubbelt klassmedlemskap nekas i registret');
select is((select array_agg(x->>'classId') from jsonb_array_elements(pg_temp.card('33002000-0000-4000-8000-000000000211')->'classes') x),array['33002000-0000-4000-8000-000000000311'],'grupp-ID filtreras till lärarens mandat');
select pg_temp.actor((select id from results where name='principal'),'33002000-0000-4000-8000-000000000061','33002000-0000-4000-8000-000000000071');
select is((select array_agg(x->>'classId' order by x->>'startsOn') from jsonb_array_elements(pg_temp.card('33002000-0000-4000-8000-000000000211')->'classes') x),array['33002000-0000-4000-8000-000000000399','33002000-0000-4000-8000-000000000311'],'skolscope ser elevens båda klassperioder vid skolan');
select pg_temp.actor((select id from results where name='healthpupil'),'33002000-0000-4000-8000-000000000064','33002000-0000-4000-8000-000000000074');
select is(pg_temp.visible(),array['33002000-0000-4000-8000-000000000211'::uuid],'elevhälsa ser explicit elev');
select pg_temp.actor((select id from results where name='healthcase'),'33002000-0000-4000-8000-000000000065','33002000-0000-4000-8000-000000000075');
select is(pg_temp.visible(),'{}'::uuid[],'ärendescope kräver ärendekontext');
select is(pg_temp.visible('33002000-0000-4000-8000-000000000411'),array['33002000-0000-4000-8000-000000000211'::uuid],'ärendescope ger rätt elev i rätt ärende');
select is(pg_temp.visible('33002000-0000-4000-8000-000000000412'),'{}'::uuid[],'annat ärende nekar');
select throws_ok($t$select pg_temp.card('33002000-0000-4000-8000-000000000212','33002000-0000-4000-8000-000000000412')$t$,'P0002',null,'annan skolas ärende ger inget elevkort');
select pg_temp.actor((select id from results where name='healthschool'),'33002000-0000-4000-8000-000000000066','33002000-0000-4000-8000-000000000076');
select is(pg_temp.visible(),array['33002000-0000-4000-8000-000000000211'::uuid],'skolomfattad elevhälsa ser skolan');
select pg_temp.actor((select id from results where name='principal'),'33002000-0000-4000-8000-000000000061','33002000-0000-4000-8000-000000000071');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000061", "function": "administrator", "scopeKind": "school", "unitIds": ["33002000-0000-4000-8000-000000000111"]}')$t$,'42501',null,'självutökning');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000062", "function": "rektor", "scopeKind": "school", "unitIds": ["33002000-0000-4000-8000-000000000111"]}')$t$,'42501',null,'rektor utser inte rektor');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000062", "function": "administrator", "scopeKind": "school", "unitIds": ["33002000-0000-4000-8000-000000000112"]}')$t$,'42501',null,'tilldelning utanför skola');
select is((select count(*) from public.access_assignments where profile_id='synthetic-v1' and customer_id='33002000-0000-4000-8000-000000000001'),9::bigint,'nekade mutationer skapar inga mandat');
select lives_ok($t$insert into results values ('support',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000068", "function": "support", "scopeKind": "pupil", "unitIds": ["33002000-0000-4000-8000-000000000111"], "pupilIds": ["33002000-0000-4000-8000-000000000211"], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '10 minutes')))$t$,'support beviljas med rektorsgodkännande');
select pg_temp.actor((select id from results where name='support'),'33002000-0000-4000-8000-000000000068','33002000-0000-4000-8000-000000000078');
select is(pg_temp.visible(),array['33002000-0000-4000-8000-000000000211'::uuid],'support ser en elev');
select throws_ok($t$select pg_temp.export_count()$t$,'42501',null,'support export nekar');
select is(public.phase3_probe_scope()->>'scopeKind','pupil','elevprovets scope visar supportens elevscope');
select ok(public.phase3_probe_scope()->>'approverName' is not null and public.phase3_probe_scope()->>'endsAt' is not null and public.phase3_probe_scope()->>'purposeCode'='synthetic-troubleshooting','support ser godkännare, syfte och sluttid');
select is((public.phase3_probe_scope()->>'canExport')::boolean,false,'support erbjuds ingen export');
select throws_ok($t$select public.phase3_mandate_options()$t$,'42501',null,'support saknar tilldelningsurval');
-- Support för en eller flera grupper på EN skola (användarbeslut 2026-09-27).
select pg_temp.register_pupil('33002000-0000-4000-8000-000000000213','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000111','Syntetisk elev 13');
select pg_temp.register_class('33002000-0000-4000-8000-000000000313','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000011','33002000-0000-4000-8000-000000000111');
select pg_temp.register_member('33002000-0000-4000-8000-000000000313','33002000-0000-4000-8000-000000000213','33002000-0000-4000-8000-000000000001','33002000-0000-4000-8000-000000000111');
select pg_temp.actor((select id from results where name='principal'),'33002000-0000-4000-8000-000000000061','33002000-0000-4000-8000-000000000071');
select lives_ok($t$insert into results values ('supportgroup',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000068", "function": "support", "scopeKind": "group", "unitIds": ["33002000-0000-4000-8000-000000000111"], "groups": [{"id": "33002000-0000-4000-8000-000000000311", "kind": "teaching"}], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '10 minutes')))$t$,'support beviljas för en grupp');
select lives_ok($t$insert into results values ('supportgroups',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000068", "function": "support", "scopeKind": "group", "unitIds": ["33002000-0000-4000-8000-000000000111"], "groups": [{"id": "33002000-0000-4000-8000-000000000311", "kind": "teaching"}, {"id": "33002000-0000-4000-8000-000000000313", "kind": "teaching"}], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '10 minutes')))$t$,'support beviljas för två grupper på samma skola');
select is((select approved_by_assignment_id=parent_assignment_id and parent_assignment_id=(select id from results where name='principal') from public.access_assignments where id=(select id from results where name='supportgroup')),true,'gruppsupport godkänns av den tilldelande rektorn');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000068", "function": "support", "scopeKind": "group", "unitIds": ["33002000-0000-4000-8000-000000000111"], "groups": [{"id": "33002000-0000-4000-8000-000000000311", "kind": "teaching"}], "pupilIds": ["33002000-0000-4000-8000-000000000211"], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '10 minutes'))$t$,'42501',null,'support med både grupp och elev nekas');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000068", "function": "support", "scopeKind": "group", "unitIds": ["33002000-0000-4000-8000-000000000111"], "groups": [], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '10 minutes'))$t$,'42501',null,'support med tom grupplista nekas');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000068", "function": "support", "scopeKind": "group", "unitIds": ["33002000-0000-4000-8000-000000000111"], "groups": [{"id": "33002000-0000-4000-8000-000000000311", "kind": "teaching"}], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '61 minutes'))$t$,'23514',null,'gruppsupport över 60 minuter nekas');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000068", "function": "support", "scopeKind": "pupil", "unitIds": ["33002000-0000-4000-8000-000000000111"], "pupilIds": ["33002000-0000-4000-8000-000000000211", "33002000-0000-4000-8000-000000000213"], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '10 minutes'))$t$,'42501',null,'support för flera namngivna elever nekas fortfarande');
-- En rektor med två skolor kan ändå inte ge support över skolgräns.
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000079','https://phase3-policy.example.test','mandate-9');
insert into public.memberships(id,identity_id,customer_id) values ('33002000-0000-4000-8000-000000000069','33002000-0000-4000-8000-000000000079','33002000-0000-4000-8000-000000000001');
select pg_temp.actor('33002000-0000-4000-8000-000000000041'::uuid,'33002000-0000-4000-8000-000000000031','33002000-0000-4000-8000-000000000021');
select lives_ok($t$insert into results values ('principalboth',public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000069", "function": "rektor", "scopeKind": "school", "unitIds": ["33002000-0000-4000-8000-000000000111", "33002000-0000-4000-8000-000000000112"]}'))$t$,'rektor med två skolor');
select pg_temp.actor((select id from results where name='principalboth'),'33002000-0000-4000-8000-000000000069','33002000-0000-4000-8000-000000000079');
select lives_ok($t$select public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000068", "function": "support", "scopeKind": "group", "unitIds": ["33002000-0000-4000-8000-000000000112"], "groups": [{"id": "33002000-0000-4000-8000-000000000312", "kind": "teaching"}], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '10 minutes'))$t$,'rektor med två skolor ger gruppsupport på en skola');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33002000-0000-4000-8000-000000000068", "function": "support", "scopeKind": "group", "unitIds": ["33002000-0000-4000-8000-000000000111", "33002000-0000-4000-8000-000000000112"], "groups": [{"id": "33002000-0000-4000-8000-000000000311", "kind": "teaching"}, {"id": "33002000-0000-4000-8000-000000000312", "kind": "teaching"}], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '10 minutes'))$t$,'42501',null,'gruppsupport på två skolor nekas');
-- Läsning: endast elever i de egna grupperna och endast fram till sluttiden.
select pg_temp.actor((select id from results where name='supportgroup'),'33002000-0000-4000-8000-000000000068','33002000-0000-4000-8000-000000000078');
select is(pg_temp.visible(),array['33002000-0000-4000-8000-000000000211'::uuid],'gruppsupport ser endast elever i gruppen');
select throws_ok($t$select pg_temp.card('33002000-0000-4000-8000-000000000213')$t$,'P0002',null,'elev utanför gruppen på samma skola kan inte läsas direkt');
select is(public.phase3_pupil_in_scope((select id from results where name='supportgroup'),'33002000-0000-4000-8000-000000000213'),false,'elev utanför gruppen ligger utanför scope');
select is(public.phase3_pupil_in_scope((select id from results where name='supportgroup'),'33002000-0000-4000-8000-000000000212'),false,'elev på annan skola ligger utanför scope');
select throws_ok($t$select pg_temp.export_count()$t$,'42501',null,'gruppsupport får inte exportera');
select is(public.phase3_probe_scope()->>'scopeKind','group','elevprovets scope visar gruppsupportens gruppscope');
select is((select jsonb_agg(x->>'id') from jsonb_array_elements(public.phase3_probe_scope()->'groups') x),'["33002000-0000-4000-8000-000000000311"]'::jsonb,'elevprovets scope visar endast egna grupper');
select ok(public.phase3_probe_scope()->>'approverName' is not null and public.phase3_probe_scope()->>'endsAt' is not null and public.phase3_probe_scope()->>'purposeCode'='synthetic-troubleshooting','gruppsupport ser godkännare, syfte och sluttid');
select throws_ok($t$select public.phase3_mandate_options()$t$,'42501',null,'gruppsupport kan inte delegera vidare');
select pg_temp.actor((select id from results where name='supportgroups'),'33002000-0000-4000-8000-000000000068','33002000-0000-4000-8000-000000000078');
select is(pg_temp.visible(),array['33002000-0000-4000-8000-000000000211'::uuid,'33002000-0000-4000-8000-000000000213'::uuid],'support för två grupper ser elever i båda grupperna');
update public.access_assignments set starts_at=clock_timestamp()-interval '20 minutes',ends_at=clock_timestamp()-interval '1 second' where id=(select id from results where name='supportgroup');
select pg_temp.actor((select id from results where name='supportgroup'),'33002000-0000-4000-8000-000000000068','33002000-0000-4000-8000-000000000078');
select throws_ok($t$select pg_temp.visible()$t$,'42501',null,'gruppsupport efter sluttid nekas');
select throws_ok($t$select public.phase3_probe_scope()$t$,'42501',null,'gruppsupport efter sluttid saknar scope');
select pg_temp.actor((select id from results where name='healthcase'),'33002000-0000-4000-8000-000000000065','33002000-0000-4000-8000-000000000075');
select is((select jsonb_agg(x->>'id') from jsonb_array_elements(public.phase3_probe_scope()->'cases') x),'["33002000-0000-4000-8000-000000000411"]'::jsonb,'ärendescope visar endast egna ärende-ID');
select is(public.phase3_probe_scope()->'cases'->0 ? 'pupilId',false,'ärendeurvalet avslöjar ingen elev');
select pg_temp.actor((select id from results where name='principal'),'33002000-0000-4000-8000-000000000061','33002000-0000-4000-8000-000000000071');
-- Issuance validates inside rollback; no provisional login rights remain.
select lives_ok($t$insert into results values ('invitation',public.phase3_issue_invitation('{"personName": "Syntetisk inbjuden", "expectedIssuer": "https://phase3-policy.example.test", "expectedSubject": "future-invitee", "tokenHashHex": "abababababababababababababababababababababababababababababababab", "mandates": [{"function": "larare", "scopeKind": "group", "unitIds": ["33002000-0000-4000-8000-000000000111"], "groups": [{"id": "33002000-0000-4000-8000-000000000311", "kind": "mentor"}]}]}'::jsonb||jsonb_build_object('expiresAt',clock_timestamp()+interval '1 hour')))$t$,'rektor utfärdar identitetsbunden lärarinbjudan');
select is((select count(*) from public.identities where subject='future-invitee'),0::bigint,'utfärdande skapar ingen identitet eller personalbindning');
insert into public.identities(id,issuer,subject) values ('33002000-0000-4000-8000-000000000081','https://phase3-policy.example.test','future-invitee');
insert into public.app_sessions(id,identity_id,token_hash,expires_at,absolute_expires_at) values
('33002000-0000-4000-8000-000000000901','33002000-0000-4000-8000-000000000081',decode(repeat('ba',32),'hex'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours');
select set_config('app.identity_id','33002000-0000-4000-8000-000000000081',true);
select lives_ok($t$select public.phase3_redeem_invitation(decode(repeat('ab',32),'hex'),'33002000-0000-4000-8000-000000000901')$t$,'rätt issuer och subject löser in');
select is((select count(*) from public.access_assignments a join public.memberships m on m.id=a.membership_id where m.identity_id='33002000-0000-4000-8000-000000000081' and public.phase3_mandate_is_valid(a.id)),1::bigint,'inlösen skapar giltigt personalbundet mandat');
select throws_ok($t$select public.phase3_redeem_invitation(decode(repeat('ab',32),'hex'),'33002000-0000-4000-8000-000000000901')$t$,'42501',null,'inbjudan kan inte användas två gånger');
select pg_temp.actor((select id from results where name='principal'),'33002000-0000-4000-8000-000000000061','33002000-0000-4000-8000-000000000071');
select lives_ok($t$insert into results values ('invitation2',public.phase3_issue_invitation('{"personName": "Syntetisk inbjuden", "expectedIssuer": "https://phase3-policy.example.test", "expectedSubject": "future-invitee", "tokenHashHex": "abababababababababababababababababababababababababababababababab", "mandates": [{"function": "larare", "scopeKind": "group", "unitIds": ["33002000-0000-4000-8000-000000000111"], "groups": [{"id": "33002000-0000-4000-8000-000000000311", "kind": "mentor"}]}]}'::jsonb||jsonb_build_object('tokenHashHex',repeat('cd',32),'expiresAt',clock_timestamp()+interval '1 hour')))$t$,'ytterligare inbjudan före ändrat mandat');
update public.access_assignments set ended_at=clock_timestamp() where id=(select id from results where name='principal');
select set_config('app.identity_id','33002000-0000-4000-8000-000000000081',true);
select throws_ok($t$select public.phase3_redeem_invitation(decode(repeat('cd',32),'hex'),'33002000-0000-4000-8000-000000000901')$t$,'42501',null,'avslutad utfärdare nekar inlösen');
select is((select used_at is null from public.invitations where id=(select id from results where name='invitation2')),true,'nekad inlösen förbrukar inte token');
update public.access_assignments set ended_at=null where id=(select id from results where name='principal');
select set_config('app.identity_id','33002000-0000-4000-8000-000000000071',true);
select throws_ok($t$select public.phase3_redeem_invitation(decode(repeat('cd',32),'hex'),'33002000-0000-4000-8000-000000000901')$t$,'42501',null,'annan sessionsidentitet nekar');
-- Faktisk Worker får endast de avsedda testfunktionerna inne i rollback.
grant execute on function public.phase3_issue_invitation(jsonb),public.phase3_redeem_invitation(bytea,uuid) to skolplattform_worker;
set local role skolplattform_worker;
select set_config('app.identity_id','33002000-0000-4000-8000-000000000081',true);
select lives_ok($t$select public.phase3_redeem_invitation(decode(repeat('cd',32),'hex'),'33002000-0000-4000-8000-000000000901')$t$,'faktisk Worker löser in kontrollerat utan tabellskrivning');
reset role;
-- Kontrollerade funktionsrättigheter består efter samordnad cutover.
select pg_temp.actor((select id from results where name='principal'),'33002000-0000-4000-8000-000000000061','33002000-0000-4000-8000-000000000071');
select ok((select bool_and(item ? 'displayName' and item ? 'schools' and item ? 'status') from jsonb_array_elements(public.phase3_list_mandates()) item),'mandatlistan ger namn och scope för administrerbara uppdrag');
select ok(exists(select 1 from jsonb_array_elements(public.phase3_list_mandates()) item where item->>'id'=(select id::text from results where name='support')),'pågående support listas');
update public.access_assignments set starts_at=clock_timestamp()-interval '20 minutes',ends_at=clock_timestamp()-interval '1 second' where id=(select id from results where name='support');
select ok(not exists(select 1 from jsonb_array_elements(public.phase3_list_mandates()) item where item->>'id'=(select id::text from results where name='support')),'utgånget supportuppdrag listas inte som giltigt');
select is(public.phase3_mandate_options()->'functions','["larare","administrator","elevhalsa","support"]'::jsonb,'rektor erbjuds endast delegerbara funktioner');
select ok(not exists(select 1 from jsonb_array_elements(public.phase3_mandate_options()->'recipients') r where r->>'membershipId'='33002000-0000-4000-8000-000000000061'),'eget medlemskap erbjuds inte som mottagare');
select ok(exists(select 1 from jsonb_array_elements(public.phase3_mandate_options()->'recipients') r where r->>'membershipId'='33002000-0000-4000-8000-000000000062'),'aktiv personal i kunden erbjuds som mottagare');
select ok(not (public.phase3_mandate_options()->'recipients')::text like '%33002000-0000-4000-8000-000000000032%','annan kunds medlemskap erbjuds inte');
select is((select jsonb_agg(x->>'id') from jsonb_array_elements(public.phase3_mandate_options()->'schools') x),'["33002000-0000-4000-8000-000000000111"]'::jsonb,'tilldelningsurvalet omfattar endast rektorns egna skolor');
select is((select jsonb_agg(x->>'id') from jsonb_array_elements(public.phase3_mandate_options()->'pupils') x),'["33002000-0000-4000-8000-000000000211", "33002000-0000-4000-8000-000000000213"]'::jsonb,'rektorn erbjuds endast elever i egen skola (elev 13 kommer från gruppsupportproven)');
select ok(not public.phase3_mandate_options()::text like '%33002000-0000-4000-8000-000000000212%' and not public.phase3_mandate_options()::text like '%33002000-0000-4000-8000-000000000312%' and not public.phase3_mandate_options()::text like '%33002000-0000-4000-8000-000000000412%','annan skolas elev, grupp och ärende saknas i urvalet');
select is(public.phase3_probe_scope()->>'scopeKind','school','rektorns elevprov har skolscope');
select pg_temp.actor('33002000-0000-4000-8000-000000000041'::uuid,'33002000-0000-4000-8000-000000000031','33002000-0000-4000-8000-000000000021');
select is(public.phase3_mandate_options()->'functions','["rektor"]'::jsonb,'huvudman erbjuds endast rektorsfunktion');
select is(public.phase3_mandate_options()->'pupils','[]'::jsonb,'huvudman får inget elevurval');
select throws_ok($t$select public.phase3_probe_scope()$t$,'42501',null,'huvudman saknar elevprov');
select pg_temp.actor((select id from results where name='admin'),'33002000-0000-4000-8000-000000000062','33002000-0000-4000-8000-000000000072');
select throws_ok($t$select public.phase3_mandate_options()$t$,'42501',null,'skoladministratör saknar tilldelningsurval');
select is((public.phase3_probe_scope()->>'canExport')::boolean,true,'skoladministratör erbjuds export av eget urval');
select pg_temp.actor((select id from results where name='principal'),'33002000-0000-4000-8000-000000000061','33002000-0000-4000-8000-000000000071');
select is(has_function_privilege('skolplattform_worker','public.phase3_mandate_options()','EXECUTE'),true,'Worker får tilldelningsurvalet');
select is(has_function_privilege('authenticated','public.phase3_mandate_options()','EXECUTE'),false,'klientroll saknar tilldelningsurvalet');
select is(has_function_privilege('anon','public.phase3_probe_scope()','EXECUTE'),false,'anonym roll saknar elevprovets scope');
select lives_ok($t$select public.phase3_revoke_mandate((select id from results where name='teacher'))$t$,'rektor avslutar eget lärarmandat');
select is(public.phase3_mandate_is_valid((select id from results where name='teacher')),false,'avslutat lärarmandat ogiltigt');
select pg_temp.actor('33002000-0000-4000-8000-000000000041'::uuid,'33002000-0000-4000-8000-000000000031','33002000-0000-4000-8000-000000000021');
select lives_ok($t$select public.phase3_revoke_mandate((select id from results where name='principal'))$t$,'huvudman avslutar rektor');
select is(public.phase3_mandate_is_valid((select id from results where name='admin')),false,'avslutad parent nekar barn omedelbart');
select pg_temp.actor((select id from results where name='admin'),'33002000-0000-4000-8000-000000000062','33002000-0000-4000-8000-000000000072');
select throws_ok($t$select pg_temp.visible()$t$,'42501',null,'gammal kontext nekar efter parentavslut');
select throws_ok($t$select pg_temp.card('33002000-0000-4000-8000-000000000211')$t$,'42501',null,'gammal kontext nekar elevkort efter parentavslut');
select is(has_function_privilege('skolplattform_worker','public.phase3_grant_mandate(jsonb)','EXECUTE'),true,'kontrollerad grant öppen efter cutover');
select is(has_function_privilege('skolplattform_worker','public.phase3_mandate_context()','EXECUTE'),true,'kontrollerad kontext öppen efter cutover');
-- 04-14: avsiktlig ändring. Fas 4 (migrering 20260929110000) stängde gamla elevprovsläsaren;
-- motsvarande Worker-läsning går nu via phase4_list_pupils med obligatorisk audit i API:t.
select is(has_function_privilege('skolplattform_worker','public.phase3_read_pupils(uuid,uuid,boolean)','EXECUTE'),false,'phase3_read_pupils stängd för Worker efter fas 4-cutover (tidigare öppen efter 03-05)');
select is(has_function_privilege('skolplattform_worker','public.phase4_list_pupils(jsonb)','EXECUTE'),true,'phase4_list_pupils öppen för Worker i stället för phase3_read_pupils');
select is(has_function_privilege('authenticated','public.phase3_read_pupils(uuid,uuid,boolean)','EXECUTE'),false,'klientroll saknar elevläsning');
select is(has_function_privilege('anon','public.phase3_read_pupils(uuid,uuid,boolean)','EXECUTE'),false,'anonym roll saknar elevläsning');
select is(has_function_privilege('authenticated','public.phase4_list_pupils(jsonb)','EXECUTE'),false,'klientroll saknar registerläsning');
select is(has_function_privilege('anon','public.phase4_list_pupils(jsonb)','EXECUTE'),false,'anonym roll saknar registerläsning');
-- Faktisk Worker med ett fortfarande giltigt skolmandat (admin2, skola 112).
select pg_temp.actor((select id from results where name='admin2'),'33002000-0000-4000-8000-000000000068','33002000-0000-4000-8000-000000000078');
set local role skolplattform_worker;
select throws_ok($t$select * from public.phase3_read_pupils()$t$,'42501',null,'faktisk Worker nekas gamla elevläsaren');
select is((select array_agg(p->>'id') from jsonb_array_elements(public.phase4_list_pupils(jsonb_build_object('selection',jsonb_build_object('schoolYear',extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end,'unitId','33002000-0000-4000-8000-000000000112','classId',null,'educationId',null,'grade',null,'status',null,'page',1),'search','','caseId',null))->'body'->'pupils') p),array['33002000-0000-4000-8000-000000000212'],'faktisk Worker läser egen skola via registerlistan');
select throws_ok($t$select public.phase4_list_pupils(jsonb_build_object('selection',jsonb_build_object('schoolYear',2026,'unitId','33002000-0000-4000-8000-000000000111','classId',null,'educationId',null,'grade',null,'status',null,'page',1),'search','','caseId',null))$t$,'42501',null,'faktisk Worker nekas annan skolas registerlista');
reset role;
select * from finish();
rollback;
