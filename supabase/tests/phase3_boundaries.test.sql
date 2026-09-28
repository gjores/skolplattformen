begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- 04-15: relationsgrunden är portad till det beständiga elevregistret. Samma elev-,
-- grupp- och ärende-ID som tidigare; utbildning, placering och klassmedlemskap får
-- deterministiska ID via phase4_probe_uuid (samma schema som migreringen
-- 20260929110000 och 04-14). Inga rader skapas i phase3_probe_pupils/-groups/
-- -group_members. Endast syntetiska data i rollback.
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
insert into public.customers(id,name) values ('33003000-0000-4000-8000-000000000001','Syntetisk fas 3 kund 1') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33003000-0000-4000-8000-000000000011','33003000-0000-4000-8000-000000000001','Syntetisk huvudman 1','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33003000-0000-4000-8000-000000000021','https://phase3-boundaries.example.test','synthetic-1') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33003000-0000-4000-8000-000000000031','33003000-0000-4000-8000-000000000021','33003000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33003000-0000-4000-8000-000000000041','33003000-0000-4000-8000-000000000031','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000011','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33003000-0000-4000-8000-000000000111','33003000-0000-4000-8000-000000000011','33000011','Syntetisk skola 11','0000') on conflict do nothing;
insert into public.mandate_units values ('33003000-0000-4000-8000-000000000041','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000011','33003000-0000-4000-8000-000000000111') on conflict do nothing;
select pg_temp.register_pupil('33003000-0000-4000-8000-000000000211','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000011','33003000-0000-4000-8000-000000000111','Syntetisk elev 11');
select pg_temp.register_class('33003000-0000-4000-8000-000000000311','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000011','33003000-0000-4000-8000-000000000111');
select pg_temp.register_member('33003000-0000-4000-8000-000000000311','33003000-0000-4000-8000-000000000211','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000111');
insert into public.phase3_probe_cases values ('33003000-0000-4000-8000-000000000411','33003000-0000-4000-8000-000000000211','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000111') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33003000-0000-4000-8000-000000000112','33003000-0000-4000-8000-000000000011','33000012','Syntetisk skola 12','0000') on conflict do nothing;
insert into public.mandate_units values ('33003000-0000-4000-8000-000000000041','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000011','33003000-0000-4000-8000-000000000112') on conflict do nothing;
select pg_temp.register_pupil('33003000-0000-4000-8000-000000000212','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000011','33003000-0000-4000-8000-000000000112','Syntetisk elev 12');
select pg_temp.register_class('33003000-0000-4000-8000-000000000312','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000011','33003000-0000-4000-8000-000000000112');
select pg_temp.register_member('33003000-0000-4000-8000-000000000312','33003000-0000-4000-8000-000000000212','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000112');
insert into public.phase3_probe_cases values ('33003000-0000-4000-8000-000000000412','33003000-0000-4000-8000-000000000212','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000112') on conflict do nothing;
insert into public.customers(id,name) values ('33003000-0000-4000-8000-000000000002','Syntetisk fas 3 kund 2') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33003000-0000-4000-8000-000000000012','33003000-0000-4000-8000-000000000002','Syntetisk huvudman 2','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33003000-0000-4000-8000-000000000022','https://phase3-boundaries.example.test','synthetic-2') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33003000-0000-4000-8000-000000000032','33003000-0000-4000-8000-000000000022','33003000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33003000-0000-4000-8000-000000000042','33003000-0000-4000-8000-000000000032','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000012','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33003000-0000-4000-8000-000000000121','33003000-0000-4000-8000-000000000012','33000021','Syntetisk skola 21','0000') on conflict do nothing;
insert into public.mandate_units values ('33003000-0000-4000-8000-000000000042','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000012','33003000-0000-4000-8000-000000000121') on conflict do nothing;
select pg_temp.register_pupil('33003000-0000-4000-8000-000000000221','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000012','33003000-0000-4000-8000-000000000121','Syntetisk elev 21');
select pg_temp.register_class('33003000-0000-4000-8000-000000000321','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000012','33003000-0000-4000-8000-000000000121');
select pg_temp.register_member('33003000-0000-4000-8000-000000000321','33003000-0000-4000-8000-000000000221','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000121');
insert into public.phase3_probe_cases values ('33003000-0000-4000-8000-000000000421','33003000-0000-4000-8000-000000000221','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000121') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33003000-0000-4000-8000-000000000122','33003000-0000-4000-8000-000000000012','33000022','Syntetisk skola 22','0000') on conflict do nothing;
insert into public.mandate_units values ('33003000-0000-4000-8000-000000000042','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000012','33003000-0000-4000-8000-000000000122') on conflict do nothing;
select pg_temp.register_pupil('33003000-0000-4000-8000-000000000222','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000012','33003000-0000-4000-8000-000000000122','Syntetisk elev 22');
select pg_temp.register_class('33003000-0000-4000-8000-000000000322','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000012','33003000-0000-4000-8000-000000000122');
select pg_temp.register_member('33003000-0000-4000-8000-000000000322','33003000-0000-4000-8000-000000000222','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000122');
insert into public.phase3_probe_cases values ('33003000-0000-4000-8000-000000000422','33003000-0000-4000-8000-000000000222','33003000-0000-4000-8000-000000000002','33003000-0000-4000-8000-000000000122') on conflict do nothing;
-- 04-15: fas 4:s läsvägar (samma SQL som Workerns elevlista och elevkort).
create function pg_temp.list(u uuid) returns jsonb language sql as $$
 select public.phase4_list_pupils(jsonb_build_object('selection',jsonb_build_object('schoolYear',pg_temp.school_year(),'unitId',u,'classId',null,'educationId',null,'grade',null,'status',null,'page',1),'search','','caseId',null))->'body' $$;
create function pg_temp.card(p uuid) returns jsonb language sql as $$
 select public.phase4_pupil_card(jsonb_build_object('pupilId',p,'schoolYear',pg_temp.school_year(),'caseId',null))->'body' $$;
create temporary table results(name text primary key,id uuid);
grant all on results to skolplattform_worker;
insert into public.identities(id,issuer,subject) values ('33003000-0000-4000-8000-000000000071','https://phase3-boundaries.example.test','mandate-1');
insert into public.memberships(id,identity_id,customer_id) values ('33003000-0000-4000-8000-000000000061','33003000-0000-4000-8000-000000000071','33003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33003000-0000-4000-8000-000000000072','https://phase3-boundaries.example.test','mandate-2');
insert into public.memberships(id,identity_id,customer_id) values ('33003000-0000-4000-8000-000000000062','33003000-0000-4000-8000-000000000072','33003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33003000-0000-4000-8000-000000000073','https://phase3-boundaries.example.test','mandate-3');
insert into public.memberships(id,identity_id,customer_id) values ('33003000-0000-4000-8000-000000000063','33003000-0000-4000-8000-000000000073','33003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33003000-0000-4000-8000-000000000074','https://phase3-boundaries.example.test','mandate-4');
insert into public.memberships(id,identity_id,customer_id) values ('33003000-0000-4000-8000-000000000064','33003000-0000-4000-8000-000000000074','33003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33003000-0000-4000-8000-000000000075','https://phase3-boundaries.example.test','mandate-5');
insert into public.memberships(id,identity_id,customer_id) values ('33003000-0000-4000-8000-000000000065','33003000-0000-4000-8000-000000000075','33003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33003000-0000-4000-8000-000000000076','https://phase3-boundaries.example.test','mandate-6');
insert into public.memberships(id,identity_id,customer_id) values ('33003000-0000-4000-8000-000000000066','33003000-0000-4000-8000-000000000076','33003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33003000-0000-4000-8000-000000000077','https://phase3-boundaries.example.test','mandate-7');
insert into public.memberships(id,identity_id,customer_id) values ('33003000-0000-4000-8000-000000000067','33003000-0000-4000-8000-000000000077','33003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('33003000-0000-4000-8000-000000000078','https://phase3-boundaries.example.test','mandate-8');
insert into public.memberships(id,identity_id,customer_id) values ('33003000-0000-4000-8000-000000000068','33003000-0000-4000-8000-000000000078','33003000-0000-4000-8000-000000000001');
create function pg_temp.actor(a uuid,m uuid,i uuid) returns void language plpgsql as $$begin
perform set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),set_config('app.identity_id',i::text,true),set_config('app.customer_id','33003000-0000-4000-8000-000000000001',true); end $$;
select pg_temp.actor('33003000-0000-4000-8000-000000000041'::uuid,'33003000-0000-4000-8000-000000000031','33003000-0000-4000-8000-000000000021');
select lives_ok($t$insert into results values ('principal',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000061", "function": "rektor", "scopeKind": "school", "unitIds": ["33003000-0000-4000-8000-000000000111"]}'))$t$,'grant principal');
select pg_temp.actor((select id from results where name='principal'),'33003000-0000-4000-8000-000000000061','33003000-0000-4000-8000-000000000071');
select lives_ok($t$insert into results values ('admin',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000062", "function": "administrator", "scopeKind": "school", "unitIds": ["33003000-0000-4000-8000-000000000111"]}'))$t$,'grant admin');
select lives_ok($t$insert into results values ('teacher',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000063", "function": "larare", "scopeKind": "group", "unitIds": ["33003000-0000-4000-8000-000000000111"], "groups": [{"id": "33003000-0000-4000-8000-000000000311", "kind": "teaching"}]}'))$t$,'grant teacher');
select lives_ok($t$insert into results values ('healthpupil',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000064", "function": "elevhalsa", "scopeKind": "pupil", "unitIds": ["33003000-0000-4000-8000-000000000111"], "pupilIds": ["33003000-0000-4000-8000-000000000211"]}'))$t$,'grant healthpupil');
select lives_ok($t$insert into results values ('healthcase',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000065", "function": "elevhalsa", "scopeKind": "case", "unitIds": ["33003000-0000-4000-8000-000000000111"], "caseIds": ["33003000-0000-4000-8000-000000000411"]}'))$t$,'grant healthcase');
select lives_ok($t$insert into results values ('healthschool',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000066", "function": "elevhalsa", "scopeKind": "school", "unitIds": ["33003000-0000-4000-8000-000000000111"]}'))$t$,'grant healthschool');
select pg_temp.actor('33003000-0000-4000-8000-000000000041'::uuid,'33003000-0000-4000-8000-000000000031','33003000-0000-4000-8000-000000000021');
select lives_ok($t$insert into results values ('principal2',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000067", "function": "rektor", "scopeKind": "school", "unitIds": ["33003000-0000-4000-8000-000000000112"]}'))$t$,'grant principal2');
select pg_temp.actor((select id from results where name='principal2'),'33003000-0000-4000-8000-000000000067','33003000-0000-4000-8000-000000000077');
select lives_ok($t$insert into results values ('admin2',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000068", "function": "administrator", "scopeKind": "school", "unitIds": ["33003000-0000-4000-8000-000000000112"]}'))$t$,'grant admin2');
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33003000-0000-4000-8000-000000000600','33003000-0000-4000-8000-000000000068','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000011','elevhalsoansvarig','synthetic-v1','school');
insert into public.mandate_units values ('33003000-0000-4000-8000-000000000600','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000011','33003000-0000-4000-8000-000000000111'),('33003000-0000-4000-8000-000000000600','33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000011','33003000-0000-4000-8000-000000000112');
insert into results values('lead','33003000-0000-4000-8000-000000000600');
select pg_temp.actor((select id from results where name='lead'),'33003000-0000-4000-8000-000000000068','33003000-0000-4000-8000-000000000078');
select lives_ok($t$insert into results values('leadhealth',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000062", "function": "elevhalsa", "scopeKind": "school", "unitIds": ["33003000-0000-4000-8000-000000000111", "33003000-0000-4000-8000-000000000112"]}'::jsonb))$t$,'bevilja leadhealth');
select is(public.phase3_mandate_is_valid((select id from results where name='leadhealth')),true,'elevhälsoansvarig kan tilldela två egna skolor');
select throws_ok($t$select * from public.phase3_read_pupils()$t$,'42501',null,'elevhälsoansvarig har ingen egen elevläsning');
select throws_ok($t$select pg_temp.list('33003000-0000-4000-8000-000000000111')$t$,'42501',null,'elevhälsoansvarig har ingen registerlista (fas 4)');
select throws_ok($t$select pg_temp.card('33003000-0000-4000-8000-000000000211')$t$,'42501',null,'elevhälsoansvarig har inget elevkort (fas 4)');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000068", "function": "elevhalsa", "scopeKind": "school", "unitIds": ["33003000-0000-4000-8000-000000000111", "33003000-0000-4000-8000-000000000112"]}')$t$,'42501',null,'elevhälsoansvarig får inte utöka sig själv');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000062", "function": "administrator", "scopeKind": "school", "unitIds": ["33003000-0000-4000-8000-000000000111", "33003000-0000-4000-8000-000000000112"]}')$t$,'42501',null,'elevhälsoansvarig får bara tilldela elevhälsa');
delete from public.mandate_units where assignment_id='33003000-0000-4000-8000-000000000600' and unit_id='33003000-0000-4000-8000-000000000112';
select is(public.phase3_mandate_is_valid((select id from results where name='leadhealth')),false,'minskad ledarskolmängd nekar tidigare tvåskolemandat');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000062", "function": "elevhalsa", "scopeKind": "school", "unitIds": ["33003000-0000-4000-8000-000000000111", "33003000-0000-4000-8000-000000000112"]}')$t$,'42501',null,'elevhälsoansvarig får inte tilldela borttagen skola');
select pg_temp.actor((select id from results where name='principal'),'33003000-0000-4000-8000-000000000061','33003000-0000-4000-8000-000000000071');
select lives_ok($t$insert into results values('supportboundary',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000062", "function": "support", "scopeKind": "pupil", "unitIds": ["33003000-0000-4000-8000-000000000111"], "pupilIds": ["33003000-0000-4000-8000-000000000211"], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '1 minute')))$t$,'bevilja supportboundary');
select is((select approved_by_assignment_id=parent_assignment_id and issued_by_assignment_id=parent_assignment_id from public.access_assignments where id=(select id from results where name='supportboundary')),true,'supportgodkännare och tilldelare härleds från rektor');
select throws_ok($t$select public.phase3_grant_mandate(('{"membershipId": "33003000-0000-4000-8000-000000000062", "function": "support", "scopeKind": "pupil", "unitIds": ["33003000-0000-4000-8000-000000000111"], "pupilIds": ["33003000-0000-4000-8000-000000000211"], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '1 minute'))||jsonb_build_object('approvedByAssignmentId','33003000-0000-4000-8000-000000000041'))$t$,'22023',null,'klient får inte välja supportgodkännare');
select throws_ok($t$update public.access_assignments set approved_by_assignment_id='33003000-0000-4000-8000-000000000041' where id=(select id from results where name='supportboundary')$t$,'23514',null,'avvikande supportgodkännare nekas av databasconstraint');
-- 04-15: supportgränsen gäller registret: bara den namngivna eleven i mandatskolan.
select pg_temp.actor((select id from results where name='supportboundary'),'33003000-0000-4000-8000-000000000062','33003000-0000-4000-8000-000000000072');
select is(pg_temp.card('33003000-0000-4000-8000-000000000211')->>'id','33003000-0000-4000-8000-000000000211','support läser den namngivna eleven i registret');
select is((select array_agg(p->>'id') from jsonb_array_elements(pg_temp.list('33003000-0000-4000-8000-000000000111')->'pupils') p),array['33003000-0000-4000-8000-000000000211'],'supportens registerlista innehåller bara den namngivna eleven');
select throws_ok($t$select pg_temp.card('33003000-0000-4000-8000-000000000212')$t$,'P0002',null,'support får inte elevkort utanför mandatet');
select throws_ok($t$select pg_temp.list('33003000-0000-4000-8000-000000000112')$t$,'42501',null,'support får inte lista annan skola');
select pg_temp.actor((select id from results where name='principal'),'33003000-0000-4000-8000-000000000061','33003000-0000-4000-8000-000000000071');
select pg_temp.actor('33003000-0000-4000-8000-000000000041'::uuid,'33003000-0000-4000-8000-000000000031','33003000-0000-4000-8000-000000000021');
select throws_ok($t$select public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000062", "function": "support", "scopeKind": "pupil", "unitIds": ["33003000-0000-4000-8000-000000000111"], "pupilIds": ["33003000-0000-4000-8000-000000000211"], "purposeCode": "synthetic-troubleshooting"}'::jsonb||jsonb_build_object('startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '1 minute'))$t$,'42501',null,'huvudman får inte direktgodkänna support');
select pg_temp.actor((select id from results where name='principal'),'33003000-0000-4000-8000-000000000061','33003000-0000-4000-8000-000000000071');
select lives_ok($t$insert into results values('futureteacher',public.phase3_grant_mandate('{"membershipId": "33003000-0000-4000-8000-000000000062", "function": "larare", "scopeKind": "group", "unitIds": ["33003000-0000-4000-8000-000000000111"], "groups": [{"id": "33003000-0000-4000-8000-000000000311", "kind": "teaching"}]}'::jsonb||jsonb_build_object('validFrom',public.app_today()+1,'validTo',public.app_today()+10)))$t$,'bevilja futureteacher');
select is(public.phase3_mandate_is_valid((select id from results where name='futureteacher')),false,'framtida tilldelning ger ingen åtkomst idag');
select is(public.phase3_mandate_is_valid((select id from results where name='futureteacher'),false),true,'framtida uppdrag är administrerbart');
select lives_ok($t$select public.phase3_revoke_mandate((select id from results where name='futureteacher'))$t$,'framtida uppdrag kan avslutas före start');
select is(public.phase3_mandate_is_valid((select id from results where name='futureteacher'),false),false,'avslutat framtida uppdrag kan inte återanvändas');
insert into public.app_sessions(id,identity_id,token_hash,expires_at,absolute_expires_at) values('33003000-0000-4000-8000-000000000950','33003000-0000-4000-8000-000000000076',decode(repeat('95',32),'hex'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours');
insert into public.mandate_units select id,customer_id,organizer_id,'33003000-0000-4000-8000-000000000112' from public.access_assignments where id=(select id from results where name='principal');
insert into public.assignment_units select staff_assignment_id,'33003000-0000-4000-8000-000000000112' from public.access_assignments where id=(select id from results where name='principal');
select lives_ok($t$insert into results values('scopeinvite',public.phase3_issue_invitation('{"personName": "Syntetisk mottagare", "expectedIssuer": "https://phase3-boundaries.example.test", "expectedSubject": "mandate-6", "tokenHashHex": "efefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefef", "mandates": [{"function": "larare", "scopeKind": "group", "unitIds": ["33003000-0000-4000-8000-000000000111"], "groups": [{"id": "33003000-0000-4000-8000-000000000311", "kind": "teaching"}]}]}'::jsonb||jsonb_build_object('expiresAt',clock_timestamp()+interval '1 hour')))$t$,'inbjudan prövas före scopeminskning');
delete from public.mandate_units where assignment_id=(select id from results where name='principal') and unit_id='33003000-0000-4000-8000-000000000111';
select set_config('app.identity_id','33003000-0000-4000-8000-000000000076',true);
select is(public.phase3_mandate_is_valid((select id from results where name='principal')),true,'utfärdaren är fortfarande giltig inom återstående skola');
select throws_ok($t$select public.phase3_redeem_invitation(decode(repeat('ef',32),'hex'),'33003000-0000-4000-8000-000000000950')$t$,'42501',null,'inlösen nekar skola som utfärdaren förlorat');
select is((select used_at is null from public.invitations where id=(select id from results where name='scopeinvite')),true,'nekad scopeinlösen lämnar token orörd');
insert into public.mandate_units select id,customer_id,organizer_id,'33003000-0000-4000-8000-000000000111' from public.access_assignments where id=(select id from results where name='principal');
select pg_temp.actor((select id from results where name='principal'),'33003000-0000-4000-8000-000000000061','33003000-0000-4000-8000-000000000071');
select lives_ok($t$insert into results values('timeinvite',public.phase3_issue_invitation('{"personName": "Syntetisk mottagare", "expectedIssuer": "https://phase3-boundaries.example.test", "expectedSubject": "mandate-6", "tokenHashHex": "fefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefefe", "mandates": [{"function": "larare", "scopeKind": "group", "unitIds": ["33003000-0000-4000-8000-000000000111"], "groups": [{"id": "33003000-0000-4000-8000-000000000311", "kind": "teaching"}], "validTo": "2099-01-01"}]}'::jsonb||jsonb_build_object('expiresAt',clock_timestamp()+interval '1 hour')))$t$,'inbjudan prövas före tidsminskning');
update public.access_assignments set valid_to=public.app_today()+1 where id=(select id from results where name='principal');
select set_config('app.identity_id','33003000-0000-4000-8000-000000000076',true);
select throws_ok($t$select public.phase3_redeem_invitation(decode(repeat('fe',32),'hex'),'33003000-0000-4000-8000-000000000950')$t$,'42501',null,'inlösen får inte förlänga förkortat utfärdarmandat');
select is((select used_at is null from public.invitations where id=(select id from results where name='timeinvite')),true,'nekad tidsinlösen lämnar token orörd');
-- 04-15: mandaten binds till registerobjekt; det gamla elevprovet återinförs inte.
select is((select count(*) from public.mandate_groups g join public.school_classes c on c.id=g.group_id and c.unit_id=g.unit_id where g.assignment_id=(select id from results where name='teacher')),1::bigint,'lärarmandatets grupp är en registerklass');
select is((select count(*) from public.mandate_pupils m join public.pupils p on p.id=m.pupil_id and p.customer_id=m.customer_id where m.assignment_id=(select id from results where name='healthpupil')),1::bigint,'elevmandatet pekar på registerelev');
select is((select count(*) from public.phase3_probe_pupils where customer_id in ('33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000002'))+(select count(*) from public.phase3_probe_groups where customer_id in ('33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000002'))+(select count(*) from public.phase3_probe_group_members where customer_id in ('33003000-0000-4000-8000-000000000001','33003000-0000-4000-8000-000000000002')),0::bigint,'fixturen skapar inga rader i det gamla elevprovet');
select * from finish();
rollback;
