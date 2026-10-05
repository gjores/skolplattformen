begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Programplan fixture: reusable synthetic setup; no grants or assertions.
create function pg_temp.programplan_actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55008000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55008000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.programplan_reference(refs jsonb default '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100}]'::jsonb)
returns jsonb language sql stable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn',to_char(make_date(extract(year from current_date)::integer+1,8,17),'YYYY-MM-DD'),'specializationRefs',refs,'choiceBlocks','[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]'::jsonb)$$;
insert into public.customers(id,name) values('55008000-0000-4000-8000-000000000001','Syntetiskt programplansprov');
insert into public.organizers(id,customer_id,name,type) values('55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000001','Syntetisk programplanshuvudman','Kommun');
insert into public.identities(id,issuer,subject) values
 ('55008000-0000-4000-8000-000000000010','https://programplan.example.test','synthetic-hm'),
 ('55008000-0000-4000-8000-000000000011','https://programplan.example.test','synthetic-principal'),
 ('55008000-0000-4000-8000-000000000012','https://programplan.example.test','synthetic-principal2'),
 ('55008000-0000-4000-8000-000000000013','https://programplan.example.test','synthetic-admin');
insert into public.memberships(id,identity_id,customer_id) values
 ('55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000001'),
 ('55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000001'),
 ('55008000-0000-4000-8000-000000000022','55008000-0000-4000-8000-000000000012','55008000-0000-4000-8000-000000000001'),
 ('55008000-0000-4000-8000-000000000023','55008000-0000-4000-8000-000000000013','55008000-0000-4000-8000-000000000001');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values
 ('55008000-0000-4000-8000-000000000030','55008000-0000-4000-8000-000000000002','55008030','Syntetisk programplansskola','0000'),
 ('55008000-0000-4000-8000-000000000031','55008000-0000-4000-8000-000000000002','55008031','Annan syntetisk skola','0000');
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','huvudman','synthetic-v1','school');
insert into public.mandate_units values
 ('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030'),
 ('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000031');
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55008000-0000-4000-8000-000000000080',decode(md5('55008000-0000-4000-8000-000000000080')||md5('55008000-0000-4000-8000-000000000080'),'hex'),
 '55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000060',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
create temporary table programplan_roles(name text primary key,id uuid);
insert into programplan_roles values('hm','55008000-0000-4000-8000-000000000060'),
 ('principal',public.phase3_grant_mandate('{"membershipId":"55008000-0000-4000-8000-000000000021","function":"rektor","scopeKind":"school","unitIds":["55008000-0000-4000-8000-000000000030"]}')),
 ('principal2',public.phase3_grant_mandate('{"membershipId":"55008000-0000-4000-8000-000000000022","function":"rektor","scopeKind":"school","unitIds":["55008000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values
 ('55008000-0000-4000-8000-000000000081',decode(md5('55008000-0000-4000-8000-000000000081')||md5('55008000-0000-4000-8000-000000000081'),'hex'),'55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000021',(select id from programplan_roles where name='principal'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours'),
 ('55008000-0000-4000-8000-000000000082',decode(md5('55008000-0000-4000-8000-000000000082')||md5('55008000-0000-4000-8000-000000000082'),'hex'),'55008000-0000-4000-8000-000000000012','55008000-0000-4000-8000-000000000022',(select id from programplan_roles where name='principal2'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
insert into programplan_roles values('admin',public.phase3_grant_mandate('{"membershipId":"55008000-0000-4000-8000-000000000023","function":"administrator","scopeKind":"school","unitIds":["55008000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55008000-0000-4000-8000-000000000083',decode(md5('55008000-0000-4000-8000-000000000083')||md5('55008000-0000-4000-8000-000000000083'),'hex'),'55008000-0000-4000-8000-000000000013','55008000-0000-4000-8000-000000000023',(select id from programplan_roles where name='admin'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values
 ('55008000-0000-4000-8000-000000000040','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk bunden SA','Syntetisk kulltext utan datum','SA25','SABEP'),
 ('55008000-0000-4000-8000-000000000041','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk obunden SA','Inte ett datum','SA25','SABEP'),
 ('55008000-0000-4000-8000-000000000042','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk tidigare beslutad SA','Syntetiskt prov','SA25','SABEP'),
 ('55008000-0000-4000-8000-000000000043','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000031','gymnasium','Syntetisk annan skola SA','Syntetiskt prov','SA25','SABEP'),
 ('55008000-0000-4000-8000-000000000045','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk tom ES','Syntetiskt prov','ES25','ESBIF');
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference) values
 ('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000040',1,array['ENGE3000X'],'sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',pg_temp.programplan_reference());
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_fetched,status,decided_on) values
 ('55008000-0000-4000-8000-000000000051','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000041',1,array['ENGE3000X','ANIM1000X'],'2026-09-05','utkast',null),
 ('55008000-0000-4000-8000-000000000052','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000042',3,array['ENGE3000X'],'2026-09-05','faststalld','2026-09-10'),
 ('55008000-0000-4000-8000-000000000053','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000043',1,array['ENGE3000X'],'2026-09-05','utkast',null);
-- Only this synthetic legacy row predates session-based actor metadata.
set local session_replication_role=replica;
insert into public.point_plan_events(point_plan_id,actor_role,action,comment) values
 ('55008000-0000-4000-8000-000000000052','huvudman','Syntetiskt äldre beslut','Syntetisk historik ska bevaras');
set local session_replication_role=origin;

insert into public.school_unit_types(unit_id,school_type) values('55008000-0000-4000-8000-000000000030','GY'),('55008000-0000-4000-8000-000000000031','GY');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
create temporary table education_results(result jsonb);
insert into education_results select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000901','55008000-0000-4000-8000-000000000030',' Ny utbildning ',null,' Ny kull ',pg_temp.programplan_reference());
select is((select result->'education'->>'name' from education_results),'Ny utbildning','name explicitly trimmed');
select is((select result->'education'->>'status' from education_results),'planerad','status planned');
select is((select result->'plan'->>'status' from education_results),'utkast','first draft');
select is((select result->'education'->>'startYear' from education_results),(extract(year from current_date)::integer+1)::text,'start year comes from explicit start');
select is((select count(*) from public.programplan_education_receipts where command_id='55008000-0000-4000-8000-000000000901'),1::bigint,'one private receipt');
select is((select result->'plan'->>'version' from education_results),'1','first version');
select is((select result->>'replayed' from education_results),'false','first save not replay');
select is(public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000901','55008000-0000-4000-8000-000000000030','Ny utbildning',null,'Ny kull',pg_temp.programplan_reference())->>'replayed','true','same normalized request replays');
select is((public.phase5_programplan_education_status('55008000-0000-4000-8000-000000000901')->>'status'),'created','own receipt readable');
select is(public.phase5_programplan_education_status('55008000-0000-4000-8000-000000000902')->>'status','not_found','absent command only absence');
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000901','55008000-0000-4000-8000-000000000030','Changed',null,'Ny kull',pg_temp.programplan_reference())$$,'40001',null,'changed request conflict');
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000902','55008000-0000-4000-8000-000000000030','Ny utbildning',null,'Ny kull',pg_temp.programplan_reference())$$,'40001',null,'separate UUID exact duplicate conflicts');
select lives_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000903','55008000-0000-4000-8000-000000000030','Tom fördjupning',null,'Ny kull',pg_temp.programplan_reference('[]'))$$,'empty specialization valid');
select lives_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000904','55008000-0000-4000-8000-000000000030','Annan profil','P2','Ny kull',jsonb_set(pg_temp.programplan_reference(),'{orientationCode}','"SAMJK"'))$$,'different profiles remain separate');
select lives_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000905','55008000-0000-4000-8000-000000000030','VO utan inriktning',null,'Ny kull',jsonb_set(jsonb_set(jsonb_set(pg_temp.programplan_reference('[]'),'{programRef}','{"code":"VO25","version":4}'),'{orientationCode}','null'),'{choiceBlocks}','[{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]'))$$,'program without orientation valid');
create temporary table before_failure as select (select count(*) from public.offerings where organizer_id='55008000-0000-4000-8000-000000000002') as offerings,(select count(*) from public.point_plans where organizer_id='55008000-0000-4000-8000-000000000002') as plans,(select count(*) from public.programplan_education_receipts where customer_id='55008000-0000-4000-8000-000000000001') as receipts;
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000910','55008000-0000-4000-8000-000000000030','Invalid',null,'Ny kull',jsonb_set(pg_temp.programplan_reference(),'{orientationCode}','"UNKNOWN"'))$$,'22023',null,'invalid orientation rolls back');
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000910','55008000-0000-4000-8000-000000000030','Invalid',null,'Ny kull',jsonb_set(pg_temp.programplan_reference(),'{programRef,version}','999'))$$,'22023',null,'missing program version rolls back');
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000910','55008000-0000-4000-8000-000000000030','Invalid',null,'Ny kull',jsonb_set(pg_temp.programplan_reference(),'{catalogId}',to_jsonb('sha256:'||repeat('0',64))))$$,'22023',null,'unavailable catalogue rolls back');
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000910','55008000-0000-4000-8000-000000000030','Invalid',null,'Ny kull',jsonb_set(pg_temp.programplan_reference(),'{startedOn}','"2023-08-01"'))$$,'22023',null,'wrong education start rolls back');
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000910','55008000-0000-4000-8000-000000000030','Invalid',null,'Ny kull',pg_temp.programplan_reference('[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"UNKNOWN","points":100}]'))$$,'22023',null,'wrong subject item rolls back');
select is((select count(*) from public.offerings where organizer_id='55008000-0000-4000-8000-000000000002'),(select offerings from before_failure),'failed basis leaves offerings unchanged');
select is((select count(*) from public.point_plans where organizer_id='55008000-0000-4000-8000-000000000002'),(select plans from before_failure),'failed basis leaves plans unchanged');
select is((select count(*) from public.programplan_education_receipts where customer_id='55008000-0000-4000-8000-000000000001'),(select receipts from before_failure),'failed basis leaves receipts unchanged');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
select is(public.phase5_programplan_selection('55008000-0000-4000-8000-000000000030',null,null)->>'canCreateEducation','false','rektor selection permits existing only');
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000910','55008000-0000-4000-8000-000000000030','Denied',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'rektor cannot create');
select throws_ok($$select public.phase5_programplan_education_status('55008000-0000-4000-8000-000000000901')$$,'42501',null,'rektor cannot inspect HM command');
select throws_ok($$select public.phase5_programplan_selection('55008000-0000-4000-8000-000000000031',null,null)$$,'42501',null,'other school denied');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
create function pg_temp.education_audit_fail() returns trigger language plpgsql as $$begin if new.action='programplan_education_created' and new.customer_id='55008000-0000-4000-8000-000000000001' then raise exception 'Synthetic education audit failure';end if;return new;end$$;
create trigger education_audit_fail before insert on public.security_events for each row execute function pg_temp.education_audit_fail();
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000911','55008000-0000-4000-8000-000000000030','Audit failure',null,'Ny kull',pg_temp.programplan_reference())$$,'55000',null,'audit failure rolls back all objects');
drop trigger education_audit_fail on public.security_events;
create function pg_temp.education_receipt_fail() returns trigger language plpgsql as $$begin raise exception 'Synthetic receipt failure' using errcode='55000';end$$;
create trigger education_receipt_fail before insert on public.programplan_education_receipts for each row execute function pg_temp.education_receipt_fail();
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000912','55008000-0000-4000-8000-000000000030','Receipt failure',null,'Ny kull',pg_temp.programplan_reference())$$,'55000',null,'receipt failure rolls back all objects');
drop trigger education_receipt_fail on public.programplan_education_receipts;
select is((select count(*) from public.offerings where organizer_id='55008000-0000-4000-8000-000000000002'),(select offerings from before_failure),'audit/receipt faults leave offerings unchanged');
select is((select count(*) from public.point_plans where organizer_id='55008000-0000-4000-8000-000000000002'),(select plans from before_failure),'audit/receipt faults leave plans unchanged');
select is((select count(*) from public.programplan_education_receipts where customer_id='55008000-0000-4000-8000-000000000001'),(select receipts from before_failure),'audit/receipt faults leave receipts unchanged');
delete from public.school_unit_types where unit_id='55008000-0000-4000-8000-000000000030' and school_type='GY';
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000913','55008000-0000-4000-8000-000000000030','Wrong schoolform',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'wrong schoolform denied');
select throws_ok($$select public.phase5_programplan_education_status('55008000-0000-4000-8000-000000000901')$$,'42501',null,'current schoolform checked on receipt');
insert into public.school_unit_types(unit_id,school_type) values('55008000-0000-4000-8000-000000000030','GY');
update public.access_assignments set function='larare' where id='55008000-0000-4000-8000-000000000060';
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000914','55008000-0000-4000-8000-000000000030','Denied function',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'larare actual SQL actor denied');
update public.access_assignments set function='huvudman' where id='55008000-0000-4000-8000-000000000060';
update public.access_assignments set function='it' where id='55008000-0000-4000-8000-000000000060';
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000914','55008000-0000-4000-8000-000000000030','Denied function',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'it actual SQL actor denied');
update public.access_assignments set function='huvudman' where id='55008000-0000-4000-8000-000000000060';
update public.access_assignments set function='administrator' where id='55008000-0000-4000-8000-000000000060';
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000914','55008000-0000-4000-8000-000000000030','Denied function',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'administrator actual SQL actor denied');
update public.access_assignments set function='huvudman' where id='55008000-0000-4000-8000-000000000060';
update public.app_sessions set revoked_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000080';
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000914','55008000-0000-4000-8000-000000000030','Denied state',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'revoked session denied');
update public.app_sessions set revoked_at=null where id='55008000-0000-4000-8000-000000000080';
update public.app_sessions set expires_at=clock_timestamp()-interval '1 second' where id='55008000-0000-4000-8000-000000000080';
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000914','55008000-0000-4000-8000-000000000030','Denied state',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'expired session denied');
update public.app_sessions set expires_at=clock_timestamp()+interval '1 hour' where id='55008000-0000-4000-8000-000000000080';
update public.memberships set status='blocked',blocked_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000020';
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000914','55008000-0000-4000-8000-000000000030','Denied state',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'blocked membership denied');
update public.memberships set status='active',blocked_at=null where id='55008000-0000-4000-8000-000000000020';
update public.customers set closed_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000001';
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000914','55008000-0000-4000-8000-000000000030','Denied state',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'closed customer denied');
update public.customers set closed_at=null where id='55008000-0000-4000-8000-000000000001';
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values('55008000-0000-4000-8000-000000000065','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','huvudman','synthetic-v1','school');
insert into public.mandate_units values('55008000-0000-4000-8000-000000000065','55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000031');
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values('55008000-0000-4000-8000-000000000084',decode(md5('55008000-0000-4000-8000-000000000084')||md5('55008000-0000-4000-8000-000000000084'),'hex'),'55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000065',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000065','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000084');
select throws_ok($$select public.phase5_programplan_education_status('55008000-0000-4000-8000-000000000901')$$,'42501',null,'same identity different current unit cannot read original receipt');
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000901','55008000-0000-4000-8000-000000000030','Ny utbildning',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'same identity wrong current unit cannot replay');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
select is((select count(*) from public.offerings where organizer_id='55008000-0000-4000-8000-000000000002'),(select offerings from before_failure),'all denied states preserve offerings');
select is((select count(*) from public.point_plans where organizer_id='55008000-0000-4000-8000-000000000002'),(select plans from before_failure),'all denied states preserve plans');
select is((select count(*) from public.programplan_education_receipts where customer_id='55008000-0000-4000-8000-000000000001'),(select receipts from before_failure),'all denied states preserve receipts');
update public.access_assignments set ended_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000060';
select throws_ok($$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000914','55008000-0000-4000-8000-000000000030','Ended mandate',null,'Ny kull',pg_temp.programplan_reference())$$,'42501',null,'ended mandate denied');
select throws_ok($$select public.phase5_programplan_education_status('55008000-0000-4000-8000-000000000901')$$,'42501',null,'ended mandate receipt denied');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='public'::regnamespace and p.proname in ('phase5_programplan_unit','phase5_programplan_education_audit','phase5_programplan_selection','phase5_programplan_organisation_actor','phase5_create_programplan_education','phase5_programplan_education_status') and a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC new functions closed');
select ok(not has_table_privilege('skolplattform_worker','public.programplan_education_receipts','SELECT'),'Worker receipt table closed');
select * from finish();
rollback;
