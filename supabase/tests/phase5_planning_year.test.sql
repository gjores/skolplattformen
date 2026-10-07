begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Owned synthetic fixture only. Foundation/grants are tested separately; this transaction is rolled back.
create function pg_temp.programplan_actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55370000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55370000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.programplan_reference(refs jsonb default '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100},{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM1000X","points":100},{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM2000X","points":100}]'::jsonb)
returns jsonb language sql stable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn',to_char(make_date(extract(year from current_date)::integer+1,8,17),'YYYY-MM-DD'),'specializationRefs',refs,'choiceBlocks','[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]'::jsonb)$$;
insert into public.customers(id,name) values('55370000-0000-4000-8000-000000000001','Syntetiskt programplansprov');
insert into public.organizers(id,customer_id,name,type) values('55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000001','Syntetisk programplanshuvudman','Kommun');
insert into public.identities(id,issuer,subject) values
 ('55370000-0000-4000-8000-000000000010','https://programplan.example.test','synthetic-hm'),
 ('55370000-0000-4000-8000-000000000011','https://programplan.example.test','synthetic-principal'),
 ('55370000-0000-4000-8000-000000000012','https://programplan.example.test','synthetic-principal2'),
 ('55370000-0000-4000-8000-000000000013','https://programplan.example.test','synthetic-admin');
insert into public.memberships(id,identity_id,customer_id) values
 ('55370000-0000-4000-8000-000000000020','55370000-0000-4000-8000-000000000010','55370000-0000-4000-8000-000000000001'),
 ('55370000-0000-4000-8000-000000000021','55370000-0000-4000-8000-000000000011','55370000-0000-4000-8000-000000000001'),
 ('55370000-0000-4000-8000-000000000022','55370000-0000-4000-8000-000000000012','55370000-0000-4000-8000-000000000001'),
 ('55370000-0000-4000-8000-000000000023','55370000-0000-4000-8000-000000000013','55370000-0000-4000-8000-000000000001');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values
 ('55370000-0000-4000-8000-000000000030','55370000-0000-4000-8000-000000000002','55008030','Syntetisk programplansskola','0000'),
 ('55370000-0000-4000-8000-000000000031','55370000-0000-4000-8000-000000000002','55008031','Annan syntetisk skola','0000');
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values('55370000-0000-4000-8000-000000000060','55370000-0000-4000-8000-000000000020','55370000-0000-4000-8000-000000000001','55370000-0000-4000-8000-000000000002','huvudman','synthetic-v1','school');
insert into public.mandate_units values
 ('55370000-0000-4000-8000-000000000060','55370000-0000-4000-8000-000000000001','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000030'),
 ('55370000-0000-4000-8000-000000000060','55370000-0000-4000-8000-000000000001','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000031');
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55370000-0000-4000-8000-000000000080',decode(md5('55370000-0000-4000-8000-000000000080')||md5('55370000-0000-4000-8000-000000000080'),'hex'),
 '55370000-0000-4000-8000-000000000010','55370000-0000-4000-8000-000000000020','55370000-0000-4000-8000-000000000060',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor('55370000-0000-4000-8000-000000000060','55370000-0000-4000-8000-000000000020','55370000-0000-4000-8000-000000000010','55370000-0000-4000-8000-000000000080');
create temporary table programplan_roles(name text primary key,id uuid);
insert into programplan_roles values('hm','55370000-0000-4000-8000-000000000060'),
 ('principal',public.phase3_grant_mandate('{"membershipId":"55370000-0000-4000-8000-000000000021","function":"rektor","scopeKind":"school","unitIds":["55370000-0000-4000-8000-000000000030"]}')),
 ('principal2',public.phase3_grant_mandate('{"membershipId":"55370000-0000-4000-8000-000000000022","function":"rektor","scopeKind":"school","unitIds":["55370000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values
 ('55370000-0000-4000-8000-000000000081',decode(md5('55370000-0000-4000-8000-000000000081')||md5('55370000-0000-4000-8000-000000000081'),'hex'),'55370000-0000-4000-8000-000000000011','55370000-0000-4000-8000-000000000021',(select id from programplan_roles where name='principal'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours'),
 ('55370000-0000-4000-8000-000000000082',decode(md5('55370000-0000-4000-8000-000000000082')||md5('55370000-0000-4000-8000-000000000082'),'hex'),'55370000-0000-4000-8000-000000000012','55370000-0000-4000-8000-000000000022',(select id from programplan_roles where name='principal2'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55370000-0000-4000-8000-000000000021','55370000-0000-4000-8000-000000000011','55370000-0000-4000-8000-000000000081');
insert into programplan_roles values('admin',public.phase3_grant_mandate('{"membershipId":"55370000-0000-4000-8000-000000000023","function":"administrator","scopeKind":"school","unitIds":["55370000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55370000-0000-4000-8000-000000000083',decode(md5('55370000-0000-4000-8000-000000000083')||md5('55370000-0000-4000-8000-000000000083'),'hex'),'55370000-0000-4000-8000-000000000013','55370000-0000-4000-8000-000000000023',(select id from programplan_roles where name='admin'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');

select pg_temp.programplan_actor('55370000-0000-4000-8000-000000000060','55370000-0000-4000-8000-000000000020','55370000-0000-4000-8000-000000000010','55370000-0000-4000-8000-000000000080');
create temporary table planning_setup as select public.phase5_planning_year_selection() value;
select is((select jsonb_array_length(value->'units') from planning_setup),2,'setup returns two HM mandate units');
select is((select value->>'customerId' from planning_setup),'55370000-0000-4000-8000-000000000001','setup carries actual customer');
select is((select (value->>'minimumYear')::integer from planning_setup),2000,'lower year bound');
select is((select (value->>'maximumYear')::integer from planning_setup),2100,'upper year bound');
select is((select value->>'serverDate' from planning_setup),to_char(clock_timestamp() at time zone 'Europe/Stockholm','YYYY-MM-DD'),'server date Stockholm');
select is(public.phase5_planning_year_academic_date('2027-01-15'),2026,'January belongs to previous academic year');
select is(public.phase5_planning_year_academic_date('2027-06-30'),2026,'June boundary');
select is(public.phase5_planning_year_academic_date('2027-07-01'),2027,'July boundary');
select is(public.phase5_planning_year_academic_date('infinity'),null,'nonfinite date remains unknown');
select is((select count(*)::integer from public.school_years where organizer_id='55370000-0000-4000-8000-000000000002'),0,'no calendar rows created');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55370000-0000-4000-8000-000000000021','55370000-0000-4000-8000-000000000011','55370000-0000-4000-8000-000000000081');
select is(jsonb_array_length(public.phase5_planning_year_selection()->'units'),1,'principal restricted to own school');
select pg_temp.programplan_actor((select id from programplan_roles where name='admin'),'55370000-0000-4000-8000-000000000023','55370000-0000-4000-8000-000000000013','55370000-0000-4000-8000-000000000083');
select is(public.phase5_planning_year_selection()#>>'{units,0,canRead,grundskola}','false','admin does not receive GR scope');
select is(public.phase5_planning_year_selection()#>>'{units,0,canRead,introduktionsprogram}','false','admin does not receive IM scope');
select is(public.phase5_planning_year_selection()#>>'{units,0,canRead,gymnasium}','true','existing gym admin reading preserved');
select 'PLANNING_PARITY|'||jsonb_build_object('name','setup-admin','setup',public.phase5_planning_year_selection())::text;
select * from finish();
rollback;
