begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Mutation fixture: its own synthetic customer, restored by the enclosing rollback.
create function pg_temp.mid(n integer) returns uuid language sql immutable as $$select ('44005000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into public.customers(id,name) values(pg_temp.mid(1),'Syntetiskt ändringsprov');
insert into public.organizers(id,customer_id,name,type) values(pg_temp.mid(2),pg_temp.mid(1),'Syntetiskt ändringsprov','Kommun');
insert into public.identities(id,issuer,subject) select pg_temp.mid(n),'https://mutation.example.test',n::text from generate_series(10,13)n;
insert into public.memberships(id,identity_id,customer_id) select pg_temp.mid(n+10),pg_temp.mid(n),pg_temp.mid(1) from generate_series(10,13)n;
insert into public.school_units(id,organizer_id,code,name,municipality_code) select pg_temp.mid(n),pg_temp.mid(2),'440050'||n,'Provskola '||n,'0180' from generate_series(30,32)n;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,start_year) select pg_temp.mid(n+10),pg_temp.mid(2),pg_temp.mid(n),'grundskola','Provutbildning','Provkull',2026 from generate_series(30,32)n;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,start_year) values(pg_temp.mid(43),pg_temp.mid(2),pg_temp.mid(30),'grundskola','Annan utbildning','Provkull',2026);
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) select pg_temp.mid(n+20),pg_temp.mid(1),pg_temp.mid(2),pg_temp.mid(n),pg_temp.mid(n+10),'PROV'||n,2026 from generate_series(30,32)n;
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values(pg_temp.mid(53),pg_temp.mid(1),pg_temp.mid(2),pg_temp.mid(30),pg_temp.mid(43),'ANNAN',2026);
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values(pg_temp.mid(60),pg_temp.mid(20),pg_temp.mid(1),pg_temp.mid(2),'huvudman','synthetic-v1','school');
insert into public.mandate_units select pg_temp.mid(60),pg_temp.mid(1),pg_temp.mid(2),pg_temp.mid(n) from generate_series(30,32)n;
create temp table mutation_roles(name text primary key,id uuid);
create function pg_temp.ma(name text) returns void language plpgsql as $$declare a public.access_assignments; begin
select * into a from public.access_assignments where id=case when name='hm' then pg_temp.mid(60) else (select r.id from mutation_roles r where r.name=ma.name) end;
perform set_config('app.customer_id',a.customer_id::text,true),set_config('app.assignment_id',a.id::text,true),set_config('app.membership_id',a.membership_id::text,true),set_config('app.identity_id',(select identity_id::text from public.memberships where id=a.membership_id),true); end$$;
select pg_temp.ma('hm');
insert into mutation_roles values('principal',public.phase3_grant_mandate(jsonb_build_object('membershipId',pg_temp.mid(21),'function','rektor','scopeKind','school','unitIds',jsonb_build_array(pg_temp.mid(30),pg_temp.mid(31),pg_temp.mid(32)))));
select pg_temp.ma('principal');
insert into mutation_roles select label,public.phase3_grant_mandate(jsonb_build_object('membershipId',member,'function','administrator','scopeKind','school','unitIds',jsonb_build_array(pg_temp.mid(30),pg_temp.mid(31)))) from (values('admin',pg_temp.mid(22)),('admin2',pg_temp.mid(23)))r(label,member);
insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name) values(pg_temp.mid(70),pg_temp.mid(1),pg_temp.mid(2),'Syntetisk elev','TEST-20100101-0014','Elev prov');
insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on) values(pg_temp.mid(80),pg_temp.mid(1),pg_temp.mid(2),pg_temp.mid(70),pg_temp.mid(30),pg_temp.mid(40),public.app_today()-100);
insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on) values(pg_temp.mid(90),pg_temp.mid(1),pg_temp.mid(2),pg_temp.mid(70),pg_temp.mid(30),pg_temp.mid(50),pg_temp.mid(80),public.app_today()-100);
insert into public.pupil_home_municipalities(id,customer_id,organizer_id,pupil_id,municipality_code,starts_on) values(pg_temp.mid(100),pg_temp.mid(1),pg_temp.mid(2),pg_temp.mid(70),'0180',public.app_today()-100);
create function pg_temp.mreq(kind text,payload jsonb,v integer default null) returns jsonb language sql as $$select jsonb_build_object('pupilId',pg_temp.mid(70),'schoolYear',extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end,'caseId',null,'expectedVersion',coalesce(v,(select version from public.pupils where id=pg_temp.mid(70))),'kind',kind,'payload',payload)$$;
select pg_temp.ma('admin');

select has_function('public','phase4_change_pupil',array['jsonb'],'mutation conflict entrypoint exists');
select is(public.phase4_change_pupil(pg_temp.mreq('basics','{"displayName":"Prövat nytt namn"}',1))->>'kind','success','first admin saves');
select pg_temp.ma('admin2');
select is(public.phase4_change_pupil(pg_temp.mreq('basics','{"displayName":"Annat namn"}',1))->>'kind','conflict','second admin receives typed conflict');
select is((select version from public.pupils where id=pg_temp.mid(70)),2,'conflict makes no writes');
select is((select display_name from public.pupils where id=pg_temp.mid(70)),'Prövat nytt namn','conflict cannot silently overwrite');

select is(public.phase4_change_pupil(pg_temp.mreq('basics','{"displayName":"Annat namn"}',1))->'details'->'fields'->0->>'current','Prövat nytt namn','conflict contains only currently authorized field value');
select is(public.phase4_change_pupil(pg_temp.mreq('basics','{"displayName":"Annat namn"}',1))->'details'->>'changedBy',pg_temp.mid(22)::text,'conflict identifies original server actor');
select is(public.phase4_change_pupil(pg_temp.mreq('basics','{"personalNumber":"TEST-20100101-0022"}',1))->>'kind','success','stale independent field can merge after lock');
select is(public.phase4_change_pupil(pg_temp.mreq('basics','{"personalNumber":"TEST-20100101-0014"}',1))->'details'->>'kind','identity','identity conflict does not disclose either number');
select ok(public.phase4_change_pupil(pg_temp.mreq('basics','{"personalNumber":"TEST-20100101-0014"}',1))::text not like '%TEST-%','identity conflict carries no number');
select is(public.phase4_change_pupil(pg_temp.mreq('municipality',jsonb_build_object('municipalityCode','0180','startsOn',public.app_today()+1,'endsOn',null),1))->'details'->>'kind','period','stale date relation always requires reread');
select is((select count(*) from public.pupil_field_history where pupil_id=pg_temp.mid(70)),2::bigint,'repeated conflicts leave history untouched');
select is(public.phase4_change_pupil(pg_temp.mreq('basics','{"displayName":"Uttryckligt omval"}',3))->>'kind','success','explicit retry against new version succeeds');
select is((select version from public.pupils where id=pg_temp.mid(70)),4,'retry advances current version');
update public.pupils set protected_identity=true where id=pg_temp.mid(70);
select throws_ok($q$select public.phase4_change_pupil(pg_temp.mreq('basics','{"displayName":"Hemligt"}',1))$q$,'P0002',null,'live protection is checked before conflict details');
update public.pupils set protected_identity=false where id=pg_temp.mid(70);
update public.memberships set status='blocked',blocked_at=clock_timestamp() where id=pg_temp.mid(23);
select throws_ok($q$select public.phase4_change_pupil(pg_temp.mreq('basics','{"displayName":"Hemligt"}',1))$q$,'42501',null,'blocked actor receives no conflict values');

select * from finish();
rollback;
