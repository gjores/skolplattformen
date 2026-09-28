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
insert into public.customers(id,name) values ('33004000-0000-4000-8000-000000000001','Syntetisk fas 3 kund 1') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33004000-0000-4000-8000-000000000011','33004000-0000-4000-8000-000000000001','Syntetisk huvudman 1','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33004000-0000-4000-8000-000000000021','https://phase3-connections.example.test','synthetic-1') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33004000-0000-4000-8000-000000000031','33004000-0000-4000-8000-000000000021','33004000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33004000-0000-4000-8000-000000000041','33004000-0000-4000-8000-000000000031','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000011','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33004000-0000-4000-8000-000000000111','33004000-0000-4000-8000-000000000011','33000011','Syntetisk skola 11','0000') on conflict do nothing;
insert into public.mandate_units values ('33004000-0000-4000-8000-000000000041','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000011','33004000-0000-4000-8000-000000000111') on conflict do nothing;
select pg_temp.register_pupil('33004000-0000-4000-8000-000000000211','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000011','33004000-0000-4000-8000-000000000111','Syntetisk elev 11');
select pg_temp.register_class('33004000-0000-4000-8000-000000000311','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000011','33004000-0000-4000-8000-000000000111');
select pg_temp.register_member('33004000-0000-4000-8000-000000000311','33004000-0000-4000-8000-000000000211','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000111');
insert into public.phase3_probe_cases values ('33004000-0000-4000-8000-000000000411','33004000-0000-4000-8000-000000000211','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000111') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33004000-0000-4000-8000-000000000112','33004000-0000-4000-8000-000000000011','33000012','Syntetisk skola 12','0000') on conflict do nothing;
insert into public.mandate_units values ('33004000-0000-4000-8000-000000000041','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000011','33004000-0000-4000-8000-000000000112') on conflict do nothing;
select pg_temp.register_pupil('33004000-0000-4000-8000-000000000212','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000011','33004000-0000-4000-8000-000000000112','Syntetisk elev 12');
select pg_temp.register_class('33004000-0000-4000-8000-000000000312','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000011','33004000-0000-4000-8000-000000000112');
select pg_temp.register_member('33004000-0000-4000-8000-000000000312','33004000-0000-4000-8000-000000000212','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000112');
insert into public.phase3_probe_cases values ('33004000-0000-4000-8000-000000000412','33004000-0000-4000-8000-000000000212','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000112') on conflict do nothing;
insert into public.customers(id,name) values ('33004000-0000-4000-8000-000000000002','Syntetisk fas 3 kund 2') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33004000-0000-4000-8000-000000000012','33004000-0000-4000-8000-000000000002','Syntetisk huvudman 2','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33004000-0000-4000-8000-000000000022','https://phase3-connections.example.test','synthetic-2') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33004000-0000-4000-8000-000000000032','33004000-0000-4000-8000-000000000022','33004000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33004000-0000-4000-8000-000000000042','33004000-0000-4000-8000-000000000032','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000012','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33004000-0000-4000-8000-000000000121','33004000-0000-4000-8000-000000000012','33000021','Syntetisk skola 21','0000') on conflict do nothing;
insert into public.mandate_units values ('33004000-0000-4000-8000-000000000042','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000012','33004000-0000-4000-8000-000000000121') on conflict do nothing;
select pg_temp.register_pupil('33004000-0000-4000-8000-000000000221','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000012','33004000-0000-4000-8000-000000000121','Syntetisk elev 21');
select pg_temp.register_class('33004000-0000-4000-8000-000000000321','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000012','33004000-0000-4000-8000-000000000121');
select pg_temp.register_member('33004000-0000-4000-8000-000000000321','33004000-0000-4000-8000-000000000221','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000121');
insert into public.phase3_probe_cases values ('33004000-0000-4000-8000-000000000421','33004000-0000-4000-8000-000000000221','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000121') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33004000-0000-4000-8000-000000000122','33004000-0000-4000-8000-000000000012','33000022','Syntetisk skola 22','0000') on conflict do nothing;
insert into public.mandate_units values ('33004000-0000-4000-8000-000000000042','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000012','33004000-0000-4000-8000-000000000122') on conflict do nothing;
select pg_temp.register_pupil('33004000-0000-4000-8000-000000000222','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000012','33004000-0000-4000-8000-000000000122','Syntetisk elev 22');
select pg_temp.register_class('33004000-0000-4000-8000-000000000322','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000012','33004000-0000-4000-8000-000000000122');
select pg_temp.register_member('33004000-0000-4000-8000-000000000322','33004000-0000-4000-8000-000000000222','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000122');
insert into public.phase3_probe_cases values ('33004000-0000-4000-8000-000000000422','33004000-0000-4000-8000-000000000222','33004000-0000-4000-8000-000000000002','33004000-0000-4000-8000-000000000122') on conflict do nothing;

insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values('33004000-0000-4000-8000-000000000099','33004000-0000-4000-8000-000000000031','33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000011','it','synthetic-v1','school');
insert into public.mandate_units select '33004000-0000-4000-8000-000000000099',customer_id,organizer_id,unit_id from public.mandate_units where assignment_id='33004000-0000-4000-8000-000000000041' and unit_id='33004000-0000-4000-8000-000000000111';
select set_config('app.customer_id','33004000-0000-4000-8000-000000000001',true),set_config('app.identity_id','33004000-0000-4000-8000-000000000021',true),set_config('app.membership_id','33004000-0000-4000-8000-000000000031',true),set_config('app.assignment_id','33004000-0000-4000-8000-000000000099',true);
select is(jsonb_array_length(public.phase3_connection_schools()),1,'IT ser bara sin namngivna skola');
select is(public.phase3_connection_schools()->0->>'id','33004000-0000-4000-8000-000000000111','främmande skolnamn lämnas inte ut');
select is((public.phase3_connection('33004000-0000-4000-8000-000000000111')->>'version')::integer,0,'ny lokal konfiguration har version noll');
select is(public.phase3_connection('33004000-0000-4000-8000-000000000111','test')->>'result','paused','inaktiv anslutning provas utan extern trafik');
select is(public.phase3_connection('33004000-0000-4000-8000-000000000111','update',true,0)->>'enabled','true','aktivering sparas');
select is(public.phase3_connection('33004000-0000-4000-8000-000000000111','test')->>'result','synthetic_ok','aktiv anslutning ger syntetiskt prov');
select throws_ok($$select public.phase3_connection('33004000-0000-4000-8000-000000000111','update',false,0)$$,'40001',null,'gammal version får inte skriva över');
select is(public.phase3_connection('33004000-0000-4000-8000-000000000111')->>'enabled','true','konflikt lämnar raden oförändrad');
select is(public.phase3_connection('33004000-0000-4000-8000-000000000111','update',false,1)->>'version','2','paus med aktuell version sparas');
select throws_ok($$select public.phase3_connection('33004000-0000-4000-8000-000000000112')$$,'P0002',null,'annan skola nekas');
select throws_ok($$select public.phase3_connection('33004000-0000-4000-8000-000000000121')$$,'P0002',null,'annan kund nekas likadant');
select throws_ok($$select public.phase3_connection('33004000-0000-4000-8000-000000000111','update',null,2)$$,'22023',null,'ogiltigt värde nekas');
-- 04-15: IT-gränsen gäller registret: anslutningsrätt ger ingen elevläsning.
select throws_ok($$select public.phase4_list_pupils(jsonb_build_object('selection',jsonb_build_object('schoolYear',pg_temp.school_year(),'unitId','33004000-0000-4000-8000-000000000111','classId',null,'educationId',null,'grade',null,'status',null,'page',1),'search','','caseId',null))$$,'42501',null,'IT har ingen registerlista');
select throws_ok($$select public.phase4_pupil_card(jsonb_build_object('pupilId','33004000-0000-4000-8000-000000000211','schoolYear',pg_temp.school_year(),'caseId',null))$$,'42501',null,'IT har inget elevkort');
select set_config('app.assignment_id','33004000-0000-4000-8000-000000000041',true);
select throws_ok($$select public.phase3_connection_schools()$$,'42501',null,'huvudman får inte IT-skolurval');
select throws_ok($$select public.phase3_connection('33004000-0000-4000-8000-000000000111')$$,'42501',null,'huvudman har inte IT-rätt');
select is(has_function_privilege('anon','public.phase3_connection(uuid,text,boolean,integer)','EXECUTE'),false,'anon saknar rätt');
select is(has_function_privilege('authenticated','public.phase3_connection(uuid,text,boolean,integer)','EXECUTE'),false,'direkt klient saknar rätt');
select is((select count(*) from public.phase3_probe_pupils where customer_id in ('33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000002'))+(select count(*) from public.phase3_probe_groups where customer_id in ('33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000002'))+(select count(*) from public.phase3_probe_group_members where customer_id in ('33004000-0000-4000-8000-000000000001','33004000-0000-4000-8000-000000000002')),0::bigint,'fixturen skapar inga rader i det gamla elevprovet');
select * from finish();
rollback;
