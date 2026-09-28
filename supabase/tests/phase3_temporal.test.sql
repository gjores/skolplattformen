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
insert into public.customers(id,name) values ('33005000-0000-4000-8000-000000000001','Syntetisk fas 3 kund 1') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33005000-0000-4000-8000-000000000011','33005000-0000-4000-8000-000000000001','Syntetisk huvudman 1','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33005000-0000-4000-8000-000000000021','https://phase3-temporal.example.test','synthetic-1') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33005000-0000-4000-8000-000000000031','33005000-0000-4000-8000-000000000021','33005000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33005000-0000-4000-8000-000000000041','33005000-0000-4000-8000-000000000031','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000011','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33005000-0000-4000-8000-000000000111','33005000-0000-4000-8000-000000000011','33000011','Syntetisk skola 11','0000') on conflict do nothing;
insert into public.mandate_units values ('33005000-0000-4000-8000-000000000041','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000011','33005000-0000-4000-8000-000000000111') on conflict do nothing;
select pg_temp.register_pupil('33005000-0000-4000-8000-000000000211','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000011','33005000-0000-4000-8000-000000000111','Syntetisk elev 11');
select pg_temp.register_class('33005000-0000-4000-8000-000000000311','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000011','33005000-0000-4000-8000-000000000111');
select pg_temp.register_member('33005000-0000-4000-8000-000000000311','33005000-0000-4000-8000-000000000211','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000111');
insert into public.phase3_probe_cases values ('33005000-0000-4000-8000-000000000411','33005000-0000-4000-8000-000000000211','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000111') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33005000-0000-4000-8000-000000000112','33005000-0000-4000-8000-000000000011','33000012','Syntetisk skola 12','0000') on conflict do nothing;
insert into public.mandate_units values ('33005000-0000-4000-8000-000000000041','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000011','33005000-0000-4000-8000-000000000112') on conflict do nothing;
select pg_temp.register_pupil('33005000-0000-4000-8000-000000000212','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000011','33005000-0000-4000-8000-000000000112','Syntetisk elev 12');
select pg_temp.register_class('33005000-0000-4000-8000-000000000312','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000011','33005000-0000-4000-8000-000000000112');
select pg_temp.register_member('33005000-0000-4000-8000-000000000312','33005000-0000-4000-8000-000000000212','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000112');
insert into public.phase3_probe_cases values ('33005000-0000-4000-8000-000000000412','33005000-0000-4000-8000-000000000212','33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000112') on conflict do nothing;
insert into public.customers(id,name) values ('33005000-0000-4000-8000-000000000002','Syntetisk fas 3 kund 2') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33005000-0000-4000-8000-000000000012','33005000-0000-4000-8000-000000000002','Syntetisk huvudman 2','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33005000-0000-4000-8000-000000000022','https://phase3-temporal.example.test','synthetic-2') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33005000-0000-4000-8000-000000000032','33005000-0000-4000-8000-000000000022','33005000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33005000-0000-4000-8000-000000000042','33005000-0000-4000-8000-000000000032','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000012','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33005000-0000-4000-8000-000000000121','33005000-0000-4000-8000-000000000012','33000021','Syntetisk skola 21','0000') on conflict do nothing;
insert into public.mandate_units values ('33005000-0000-4000-8000-000000000042','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000012','33005000-0000-4000-8000-000000000121') on conflict do nothing;
select pg_temp.register_pupil('33005000-0000-4000-8000-000000000221','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000012','33005000-0000-4000-8000-000000000121','Syntetisk elev 21');
select pg_temp.register_class('33005000-0000-4000-8000-000000000321','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000012','33005000-0000-4000-8000-000000000121');
select pg_temp.register_member('33005000-0000-4000-8000-000000000321','33005000-0000-4000-8000-000000000221','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000121');
insert into public.phase3_probe_cases values ('33005000-0000-4000-8000-000000000421','33005000-0000-4000-8000-000000000221','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000121') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33005000-0000-4000-8000-000000000122','33005000-0000-4000-8000-000000000012','33000022','Syntetisk skola 22','0000') on conflict do nothing;
insert into public.mandate_units values ('33005000-0000-4000-8000-000000000042','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000012','33005000-0000-4000-8000-000000000122') on conflict do nothing;
select pg_temp.register_pupil('33005000-0000-4000-8000-000000000222','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000012','33005000-0000-4000-8000-000000000122','Syntetisk elev 22');
select pg_temp.register_class('33005000-0000-4000-8000-000000000322','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000012','33005000-0000-4000-8000-000000000122');
select pg_temp.register_member('33005000-0000-4000-8000-000000000322','33005000-0000-4000-8000-000000000222','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000122');
insert into public.phase3_probe_cases values ('33005000-0000-4000-8000-000000000422','33005000-0000-4000-8000-000000000222','33005000-0000-4000-8000-000000000002','33005000-0000-4000-8000-000000000122') on conflict do nothing;
create temporary table results(name text primary key,id uuid);
grant all on results to skolplattform_worker;
insert into public.identities(id,issuer,subject) values ('33005000-0000-4000-8000-000000000071','https://phase3-temporal.example.test','mandate-1');
insert into public.memberships(id,identity_id,customer_id) values ('33005000-0000-4000-8000-000000000061','33005000-0000-4000-8000-000000000071','33005000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33005000-0000-4000-8000-000000000072','https://phase3-temporal.example.test','mandate-2');
insert into public.memberships(id,identity_id,customer_id) values ('33005000-0000-4000-8000-000000000062','33005000-0000-4000-8000-000000000072','33005000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33005000-0000-4000-8000-000000000073','https://phase3-temporal.example.test','mandate-3');
insert into public.memberships(id,identity_id,customer_id) values ('33005000-0000-4000-8000-000000000063','33005000-0000-4000-8000-000000000073','33005000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33005000-0000-4000-8000-000000000074','https://phase3-temporal.example.test','mandate-4');
insert into public.memberships(id,identity_id,customer_id) values ('33005000-0000-4000-8000-000000000064','33005000-0000-4000-8000-000000000074','33005000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33005000-0000-4000-8000-000000000075','https://phase3-temporal.example.test','mandate-5');
insert into public.memberships(id,identity_id,customer_id) values ('33005000-0000-4000-8000-000000000065','33005000-0000-4000-8000-000000000075','33005000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33005000-0000-4000-8000-000000000076','https://phase3-temporal.example.test','mandate-6');
insert into public.memberships(id,identity_id,customer_id) values ('33005000-0000-4000-8000-000000000066','33005000-0000-4000-8000-000000000076','33005000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33005000-0000-4000-8000-000000000077','https://phase3-temporal.example.test','mandate-7');
insert into public.memberships(id,identity_id,customer_id) values ('33005000-0000-4000-8000-000000000067','33005000-0000-4000-8000-000000000077','33005000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33005000-0000-4000-8000-000000000078','https://phase3-temporal.example.test','mandate-8');
insert into public.memberships(id,identity_id,customer_id) values ('33005000-0000-4000-8000-000000000068','33005000-0000-4000-8000-000000000078','33005000-0000-4000-8000-000000000001');
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
perform set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),set_config('app.identity_id',i::text,true),set_config('app.customer_id','33005000-0000-4000-8000-000000000001',true); end $$;
select pg_temp.actor('33005000-0000-4000-8000-000000000041'::uuid,'33005000-0000-4000-8000-000000000031','33005000-0000-4000-8000-000000000021');
select lives_ok($t$insert into results values ('principal',public.phase3_grant_mandate('{"membershipId": "33005000-0000-4000-8000-000000000061", "function": "rektor", "scopeKind": "school", "unitIds": ["33005000-0000-4000-8000-000000000111"]}'))$t$,'grant principal');
select pg_temp.actor((select id from results where name='principal'),'33005000-0000-4000-8000-000000000061','33005000-0000-4000-8000-000000000071');
select lives_ok($t$insert into results values ('admin',public.phase3_grant_mandate('{"membershipId": "33005000-0000-4000-8000-000000000062", "function": "administrator", "scopeKind": "school", "unitIds": ["33005000-0000-4000-8000-000000000111"]}'))$t$,'grant admin');
select lives_ok($t$insert into results values ('teacher',public.phase3_grant_mandate('{"membershipId": "33005000-0000-4000-8000-000000000063", "function": "larare", "scopeKind": "group", "unitIds": ["33005000-0000-4000-8000-000000000111"], "groups": [{"id": "33005000-0000-4000-8000-000000000311", "kind": "teaching"}]}'))$t$,'grant teacher');
select lives_ok($t$insert into results values ('healthpupil',public.phase3_grant_mandate('{"membershipId": "33005000-0000-4000-8000-000000000064", "function": "elevhalsa", "scopeKind": "pupil", "unitIds": ["33005000-0000-4000-8000-000000000111"], "pupilIds": ["33005000-0000-4000-8000-000000000211"]}'))$t$,'grant healthpupil');
select lives_ok($t$insert into results values ('healthcase',public.phase3_grant_mandate('{"membershipId": "33005000-0000-4000-8000-000000000065", "function": "elevhalsa", "scopeKind": "case", "unitIds": ["33005000-0000-4000-8000-000000000111"], "caseIds": ["33005000-0000-4000-8000-000000000411"]}'))$t$,'grant healthcase');
select lives_ok($t$insert into results values ('healthschool',public.phase3_grant_mandate('{"membershipId": "33005000-0000-4000-8000-000000000066", "function": "elevhalsa", "scopeKind": "school", "unitIds": ["33005000-0000-4000-8000-000000000111"]}'))$t$,'grant healthschool');
select pg_temp.actor('33005000-0000-4000-8000-000000000041'::uuid,'33005000-0000-4000-8000-000000000031','33005000-0000-4000-8000-000000000021');
select lives_ok($t$insert into results values ('principal2',public.phase3_grant_mandate('{"membershipId": "33005000-0000-4000-8000-000000000067", "function": "rektor", "scopeKind": "school", "unitIds": ["33005000-0000-4000-8000-000000000112"]}'))$t$,'grant principal2');
select pg_temp.actor((select id from results where name='principal2'),'33005000-0000-4000-8000-000000000067','33005000-0000-4000-8000-000000000077');
select lives_ok($t$insert into results values ('admin2',public.phase3_grant_mandate('{"membershipId": "33005000-0000-4000-8000-000000000068", "function": "administrator", "scopeKind": "school", "unitIds": ["33005000-0000-4000-8000-000000000112"]}'))$t$,'grant admin2');
-- 04-14: placeringarnas datumgränser i det beständiga registret. app.fake_today sätts bara
-- transaktionslokalt i denna rollback-fixtur och styr registrets placeringsdatum; mandatens
-- giltighet styrs av serverklockan och prövas separat nedan. Eleven 211 lämnar skola 111
-- efter 31 mars och börjar på skola 112 den 1 april samma läsår; klassmedlemskapet slutar
-- med den gamla placeringen. Inkluderande slutdatum enligt registrets daterange '[]'.
create function pg_temp.at(d date) returns void language sql as $$ select set_config('app.fake_today',d::text,true) $$;
create function pg_temp.status(u uuid,p uuid) returns text language sql as $$ select x->>'status' from jsonb_array_elements(pg_temp.list(u)->'pupils') x where x->>'id'=p::text $$;
update public.pupil_placements set ends_on=make_date(pg_temp.school_year()+1,3,31) where id=public.phase4_probe_uuid('placement:33005000-0000-4000-8000-000000000211');
update public.pupil_class_memberships set ends_on=make_date(pg_temp.school_year()+1,3,31) where pupil_id='33005000-0000-4000-8000-000000000211';
insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on) values (public.phase4_probe_uuid('placement-next:33005000-0000-4000-8000-000000000211'),'33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000011','33005000-0000-4000-8000-000000000211','33005000-0000-4000-8000-000000000112',public.phase4_probe_uuid('offering:33005000-0000-4000-8000-000000000112'),make_date(pg_temp.school_year()+1,4,1));
select throws_ok($t$insert into public.pupil_placements(customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on,ends_on) values ('33005000-0000-4000-8000-000000000001','33005000-0000-4000-8000-000000000011','33005000-0000-4000-8000-000000000211','33005000-0000-4000-8000-000000000112',public.phase4_probe_uuid('offering:33005000-0000-4000-8000-000000000112'),make_date(pg_temp.school_year()+1,3,31),make_date(pg_temp.school_year()+1,3,31))$t$,'23P01',null,'placeringar får inte överlappa på slutdagen');
select pg_temp.actor((select id from results where name='principal'),'33005000-0000-4000-8000-000000000061','33005000-0000-4000-8000-000000000071');
select pg_temp.at(make_date(pg_temp.school_year()+1,3,31));
select is(pg_temp.status('33005000-0000-4000-8000-000000000111','33005000-0000-4000-8000-000000000211'),'aktuell','placering gäller till och med slutdatum');
select pg_temp.at(make_date(pg_temp.school_year()+1,4,1));
select is(pg_temp.status('33005000-0000-4000-8000-000000000111','33005000-0000-4000-8000-000000000211'),'avslutad','placering avslutas dagen efter slutdatum');
select pg_temp.actor((select id from results where name='principal2'),'33005000-0000-4000-8000-000000000067','33005000-0000-4000-8000-000000000077');
select pg_temp.at(make_date(pg_temp.school_year()+1,3,31));
select is(pg_temp.status('33005000-0000-4000-8000-000000000112','33005000-0000-4000-8000-000000000211'),'framtida','ny placering är framtida dagen före start');
select pg_temp.at(make_date(pg_temp.school_year()+1,4,1));
select is(pg_temp.status('33005000-0000-4000-8000-000000000112','33005000-0000-4000-8000-000000000211'),'aktuell','ny placering gäller från och med startdatum');
select pg_temp.actor((select id from results where name='teacher'),'33005000-0000-4000-8000-000000000063','33005000-0000-4000-8000-000000000073');
select pg_temp.at(make_date(pg_temp.school_year()+1,3,31));
select ok('33005000-0000-4000-8000-000000000211'::uuid=any(pg_temp.visible()),'gruppscope gäller sista medlemsdagen');
select pg_temp.at(make_date(pg_temp.school_year()+1,4,1));
select ok(not('33005000-0000-4000-8000-000000000211'::uuid=any(pg_temp.visible())),'gruppscope upphör dagen efter medlemskapets slut');
select pg_temp.actor((select id from results where name='healthpupil'),'33005000-0000-4000-8000-000000000064','33005000-0000-4000-8000-000000000074');
select is(pg_temp.card('33005000-0000-4000-8000-000000000211')->>'unitId','33005000-0000-4000-8000-000000000111','elevmandat ser bara gamla skolans period efter skolbyte');
select is(pg_temp.card('33005000-0000-4000-8000-000000000211')->>'status','avslutad','gamla skolans period visas som avslutad');
select throws_ok($t$select pg_temp.card('33005000-0000-4000-8000-000000000211',null,pg_temp.school_year()+1)$t$,'P0002',null,'elevmandat följer inte eleven till ny skola');
select pg_temp.actor((select id from results where name='admin'),'33005000-0000-4000-8000-000000000062','33005000-0000-4000-8000-000000000072');
select pg_temp.at(make_date(pg_temp.school_year()+1,3,31));
select is((pg_temp.card('33005000-0000-4000-8000-000000000211')->'capabilities'->>'canEdit')::boolean,true,'administratör kan ändra elev med pågående placering');
select pg_temp.at(make_date(pg_temp.school_year()+1,4,1));
select is((pg_temp.card('33005000-0000-4000-8000-000000000211')->'capabilities'->>'canEdit')::boolean,false,'administratör kan inte ändra elev med bara avslutad placering (D-20)');
-- Kedjeavslut: avslutad rektor stänger underliggande mandats registerläsning omedelbart.
update public.access_assignments set ended_at=clock_timestamp() where id=(select id from results where name='principal');
select throws_ok($t$select pg_temp.visible()$t$,'42501',null,'avslutad rektor stänger administratörens registerläsning');
select throws_ok($t$select pg_temp.card('33005000-0000-4000-8000-000000000211')$t$,'42501',null,'avslutad rektor stänger administratörens elevkort');
select pg_temp.actor((select id from results where name='teacher'),'33005000-0000-4000-8000-000000000063','33005000-0000-4000-8000-000000000073');
select throws_ok($t$select pg_temp.visible()$t$,'42501',null,'avslutad rektor stänger lärarens registerläsning');
update public.access_assignments set ended_at=null where id=(select id from results where name='principal');
select pg_temp.actor((select id from results where name='admin'),'33005000-0000-4000-8000-000000000062','33005000-0000-4000-8000-000000000072');
select ok('33005000-0000-4000-8000-000000000211'::uuid=any(pg_temp.visible()),'återställd kedja ger registerläsning igen');
select set_config('app.fake_today','',true);
select pg_temp.actor((select id from results where name='principal'),'33005000-0000-4000-8000-000000000061','33005000-0000-4000-8000-000000000071');
insert into results values('support',public.phase3_grant_mandate('{"membershipId": "33005000-0000-4000-8000-000000000068", "function": "support", "scopeKind": "pupil", "unitIds": ["33005000-0000-4000-8000-000000000111"], "pupilIds": ["33005000-0000-4000-8000-000000000211"], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '1 minute')));
update public.access_assignments set valid_from='2026-09-01',valid_to='2026-12-31' where customer_id='33005000-0000-4000-8000-000000000001';
update public.access_assignments set starts_at='2026-09-23T10:00:00Z',ends_at='2026-09-23T11:00:00Z' where id=(select id from results where name='support');
-- Kör samma sparade funktionsdefinition. Byt bara klockkällan i rollback-
-- transaktionen; ingen testklocka/migration/RPC införs i produktschemat.
select ok(position('server_now timestamptz:=clock_timestamp();' in pg_get_functiondef('public.phase3_mandate_is_valid(uuid,boolean)'::regprocedure))>0,'förväntad runtime-klockkälla finns före kontrollerat prov');
do $body$
declare definition text;
begin
  definition:=pg_get_functiondef('public.phase3_mandate_is_valid(uuid,boolean)'::regprocedure);
  if position('server_now timestamptz:=clock_timestamp();' in definition)=0 then raise exception 'Clock source changed'; end if;
  execute replace(definition,'server_now timestamptz:=clock_timestamp();',
    'server_now timestamptz:=current_setting(''test.phase3_clock'')::timestamptz;');
end $body$;
set local role skolplattform_worker;
select set_config('test.phase3_clock','2026-09-23T09:59:59.999999Z',true);
select is(public.assignment_is_valid(a),false,'support före start') from public.access_assignments a where id=(select id from results where name='support');
select set_config('test.phase3_clock','2026-09-23T10:00:00Z',true);
select is(public.assignment_is_valid(a),true,'support exakt inkluderande start') from public.access_assignments a where id=(select id from results where name='support');
select set_config('test.phase3_clock','2026-09-23T10:30:00Z',true);
select is(public.assignment_is_valid(a),true,'support inne i intervallet') from public.access_assignments a where id=(select id from results where name='support');
select set_config('test.phase3_clock','2026-09-23T10:59:59.999999Z',true);
select is(public.assignment_is_valid(a),true,'support sista mikrosekunden före slut') from public.access_assignments a where id=(select id from results where name='support');
select set_config('test.phase3_clock','2026-09-23T11:00:00Z',true);
select is(public.assignment_is_valid(a),false,'support exakt exklusivt slut') from public.access_assignments a where id=(select id from results where name='support');
select set_config('test.phase3_clock','2026-09-23T11:00:00.000001Z',true);
select is(public.assignment_is_valid(a),false,'support efter slut') from public.access_assignments a where id=(select id from results where name='support');
reset role;
update public.access_assignments set starts_at='2026-09-23T10:00:00Z',ends_at='2026-09-23T11:00:00Z' where id=(select id from results where name='principal');
select set_config('test.phase3_clock','2026-09-23T11:00:00Z',true);
select is(public.phase3_mandate_is_valid((select id from results where name='support')),false,'parent vid exklusivt slut kan inte förlängas av barn');
update public.access_assignments set starts_at=null,ends_at=null where id=(select id from results where name='principal');
update public.access_assignments set valid_to='2026-09-23' where id=(select id from results where name='admin');
select set_config('test.phase3_clock','2026-09-23T21:59:59.999999Z',true);
select is(public.phase3_mandate_is_valid((select id from results where name='admin')),true,'datumslut sista mikrosekunden i Stockholm');
select set_config('test.phase3_clock','2026-09-23T22:00:00Z',true);
select is(public.phase3_mandate_is_valid((select id from results where name='admin')),false,'datumslut upphör vid Stockholms midnatt');
select * from finish();
rollback;
