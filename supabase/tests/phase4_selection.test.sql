begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Syntetisk relationsgrund för 03-02; inga API-mandat aktiveras.
-- Kör endast efter assertTarget(protected), som postgres. Inga rader raderas.
insert into public.customers(id,name) values ('44003000-0000-4000-8000-000000000001','Syntetisk fas 3 kund 1') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('44003000-0000-4000-8000-000000000011','44003000-0000-4000-8000-000000000001','Syntetisk huvudman 1','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('44003000-0000-4000-8000-000000000021','https://phase4-protected.example.test','synthetic-1') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('44003000-0000-4000-8000-000000000031','44003000-0000-4000-8000-000000000021','44003000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('44003000-0000-4000-8000-000000000041','44003000-0000-4000-8000-000000000031','44003000-0000-4000-8000-000000000001','44003000-0000-4000-8000-000000000011','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('44003000-0000-4000-8000-000000000111','44003000-0000-4000-8000-000000000011','44003011','Syntetisk skola 11','0000') on conflict do nothing;
insert into public.mandate_units values ('44003000-0000-4000-8000-000000000041','44003000-0000-4000-8000-000000000001','44003000-0000-4000-8000-000000000011','44003000-0000-4000-8000-000000000111') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('44003000-0000-4000-8000-000000000112','44003000-0000-4000-8000-000000000011','44003012','Syntetisk skola 12','0000') on conflict do nothing;
insert into public.mandate_units values ('44003000-0000-4000-8000-000000000041','44003000-0000-4000-8000-000000000001','44003000-0000-4000-8000-000000000011','44003000-0000-4000-8000-000000000112') on conflict do nothing;
insert into public.customers(id,name) values ('44003000-0000-4000-8000-000000000002','Syntetisk fas 3 kund 2') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('44003000-0000-4000-8000-000000000012','44003000-0000-4000-8000-000000000002','Syntetisk huvudman 2','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('44003000-0000-4000-8000-000000000022','https://phase4-protected.example.test','synthetic-2') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('44003000-0000-4000-8000-000000000032','44003000-0000-4000-8000-000000000022','44003000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('44003000-0000-4000-8000-000000000042','44003000-0000-4000-8000-000000000032','44003000-0000-4000-8000-000000000002','44003000-0000-4000-8000-000000000012','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('44003000-0000-4000-8000-000000000121','44003000-0000-4000-8000-000000000012','44003021','Syntetisk skola 21','0000') on conflict do nothing;
insert into public.mandate_units values ('44003000-0000-4000-8000-000000000042','44003000-0000-4000-8000-000000000002','44003000-0000-4000-8000-000000000012','44003000-0000-4000-8000-000000000121') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('44003000-0000-4000-8000-000000000122','44003000-0000-4000-8000-000000000012','44003022','Syntetisk skola 22','0000') on conflict do nothing;
insert into public.mandate_units values ('44003000-0000-4000-8000-000000000042','44003000-0000-4000-8000-000000000002','44003000-0000-4000-8000-000000000012','44003000-0000-4000-8000-000000000122') on conflict do nothing;
create temporary table results(name text primary key,id uuid);
grant all on results to skolplattform_worker;
insert into public.identities(id,issuer,subject) values ('44003000-0000-4000-8000-000000000071','https://phase4-protected.example.test','mandate-1');
insert into public.memberships(id,identity_id,customer_id) values ('44003000-0000-4000-8000-000000000061','44003000-0000-4000-8000-000000000071','44003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('44003000-0000-4000-8000-000000000072','https://phase4-protected.example.test','mandate-2');
insert into public.memberships(id,identity_id,customer_id) values ('44003000-0000-4000-8000-000000000062','44003000-0000-4000-8000-000000000072','44003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('44003000-0000-4000-8000-000000000073','https://phase4-protected.example.test','mandate-3');
insert into public.memberships(id,identity_id,customer_id) values ('44003000-0000-4000-8000-000000000063','44003000-0000-4000-8000-000000000073','44003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('44003000-0000-4000-8000-000000000074','https://phase4-protected.example.test','mandate-4');
insert into public.memberships(id,identity_id,customer_id) values ('44003000-0000-4000-8000-000000000064','44003000-0000-4000-8000-000000000074','44003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('44003000-0000-4000-8000-000000000075','https://phase4-protected.example.test','mandate-5');
insert into public.memberships(id,identity_id,customer_id) values ('44003000-0000-4000-8000-000000000065','44003000-0000-4000-8000-000000000075','44003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('44003000-0000-4000-8000-000000000076','https://phase4-protected.example.test','mandate-6');
insert into public.memberships(id,identity_id,customer_id) values ('44003000-0000-4000-8000-000000000066','44003000-0000-4000-8000-000000000076','44003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('44003000-0000-4000-8000-000000000077','https://phase4-protected.example.test','mandate-7');
insert into public.memberships(id,identity_id,customer_id) values ('44003000-0000-4000-8000-000000000067','44003000-0000-4000-8000-000000000077','44003000-0000-4000-8000-000000000001');
insert into public.identities(id,issuer,subject) values ('44003000-0000-4000-8000-000000000078','https://phase4-protected.example.test','mandate-8');
insert into public.memberships(id,identity_id,customer_id) values ('44003000-0000-4000-8000-000000000068','44003000-0000-4000-8000-000000000078','44003000-0000-4000-8000-000000000001');
create function pg_temp.actor(a uuid,m uuid,i uuid) returns void language plpgsql as $$begin
perform set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),set_config('app.identity_id',i::text,true),set_config('app.customer_id','44003000-0000-4000-8000-000000000001',true); end $$;
select pg_temp.actor('44003000-0000-4000-8000-000000000041'::uuid,'44003000-0000-4000-8000-000000000031','44003000-0000-4000-8000-000000000021');

select has_function('public','phase4_grant_protected_permission',array['uuid','uuid'],'HM grant entrypoint exists');
select is((select count(*) from public.protected_identity_permissions where customer_id='44003000-0000-4000-8000-000000000001'),0::bigint,'no implicit protected grants from migration');
select lives_ok($q$insert into results values ('principal',public.phase3_grant_mandate('{"membershipId":"44003000-0000-4000-8000-000000000061","function":"rektor","scopeKind":"school","unitIds":["44003000-0000-4000-8000-000000000111","44003000-0000-4000-8000-000000000112"]}'))$q$,'HM appoints principal at two schools');
select pg_temp.actor((select id from results where name='principal'),'44003000-0000-4000-8000-000000000061','44003000-0000-4000-8000-000000000071');
select lives_ok($q$insert into results values ('admin',public.phase3_grant_mandate('{"membershipId":"44003000-0000-4000-8000-000000000062","function":"administrator","scopeKind":"school","unitIds":["44003000-0000-4000-8000-000000000111","44003000-0000-4000-8000-000000000112"]}'))$q$,'principal grants ordinary admin at two schools');
select lives_ok($q$insert into results values ('admin2',public.phase3_grant_mandate('{"membershipId":"44003000-0000-4000-8000-000000000062","function":"administrator","scopeKind":"school","unitIds":["44003000-0000-4000-8000-000000000111"]}'))$q$,'same person can have a second independent admin mandate');


select pg_temp.actor('44003000-0000-4000-8000-000000000041','44003000-0000-4000-8000-000000000031','44003000-0000-4000-8000-000000000021');
select throws_ok('select public.phase4_register_selection()', '42501', null, 'HM cannot bootstrap pupil workspace');
select pg_temp.actor((select id from results where name='admin'),'44003000-0000-4000-8000-000000000062','44003000-0000-4000-8000-000000000072');
select is(jsonb_array_length(public.phase4_register_selection()->'scope'->'schools'),2,'admin only receives own two schools');
select ok(not exists(select 1 from jsonb_array_elements(public.phase4_register_selection()->'scope'->'schools') s where s->>'id' in ('44003000-0000-4000-8000-000000000121','44003000-0000-4000-8000-000000000122')),'foreign schools absent');
insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end) values
 ('44003000-0000-4000-8000-000000000011','44003000-0000-4000-8000-000000000111',2001,'2001-08-20','2001-12-20','2002-01-10','2002-06-10'),
 ('44003000-0000-4000-8000-000000000012','44003000-0000-4000-8000-000000000121',2002,'2002-08-20','2002-12-20','2003-01-10','2003-06-10');
select ok((public.phase4_register_selection()->'schoolYears') @> '[2001]'::jsonb,'own registered year included even without pupils');
select ok(not ((public.phase4_register_selection()->'schoolYears') @> '[2002]'::jsonb),'foreign registered year excluded');
select is((public.phase4_register_selection()->>'currentSchoolYear')::integer,extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end,'current year uses server calendar');
select ok((public.phase4_register_selection()->'schoolYears') @> jsonb_build_array((public.phase4_register_selection()->>'currentSchoolYear')::integer),'current school year selectable without pupil inference');
select is((select count(*) from jsonb_object_keys(public.phase4_register_selection())),7::bigint,'closed bootstrap has seven metadata fields');
select ok(not (public.phase4_register_selection() ? 'pupils'),'bootstrap never returns pupils');
select is(public.phase4_register_selection()->'endsAt','null'::jsonb,'ordinary assignment has no support expiry');
select ok(has_function_privilege('skolplattform_worker','public.phase4_register_selection()','execute'),'Worker bootstrap allowed');
select ok(not has_function_privilege('anon','public.phase4_register_selection()','execute'),'anon denied');
select ok(not has_function_privilege('authenticated','public.phase4_register_selection()','execute'),'authenticated denied');
set local role skolplattform_worker;
select is(jsonb_array_length(public.phase4_register_selection()->'scope'->'schools'),2,'actual Worker execution remains scoped');
reset role;
update public.memberships set status='blocked',blocked_at=clock_timestamp() where id='44003000-0000-4000-8000-000000000062';
select throws_ok('select public.phase4_register_selection()', '42501', null, 'blocked actor stops bootstrap');
select * from finish();
rollback;
