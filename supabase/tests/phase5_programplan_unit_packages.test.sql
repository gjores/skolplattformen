begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- C assertions retain their historical profile; D begins from its actual nineteen-entrypoint base.
do $profile$ declare signature text;begin
 -- Later gym entrypoints are excluded only from this historical rollback profile.
 foreach signature in array array['public.phase5_save_programplan_package(uuid,integer,jsonb)','public.phase5_list_programplan_packages(uuid)','public.phase5_gym_timplan_underlag(uuid)','public.phase5_create_gym_timplan(uuid,uuid,integer,integer,uuid,uuid,integer)','public.phase5_read_gym_timplan(uuid)','public.phase5_write_gym_timplan_row(uuid,integer,text,jsonb)'] loop
  if to_regprocedure(signature) is not null then execute 'revoke execute on function '||signature||' from skolplattform_worker';end if;
 end loop;
end $profile$;
-- This file proves the C foundation profile, then its exact grant, inside rollback.
revoke execute on function public.phase5_read_programplan_unit_packages(uuid),public.phase5_write_programplan_unit_packages(uuid,uuid,integer,text,jsonb) from skolplattform_worker;
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

insert into public.school_unit_types(unit_id,school_type) values ('55008000-0000-4000-8000-000000000030','GY'),('55008000-0000-4000-8000-000000000031','GY') on conflict do nothing;
-- C-specific package fixture. Every test transaction rolls back its own rows.
create function pg_temp.package_entries(language text default 'fr',first_code text default 'MODO1000X',second_code text default 'MODO2000X') returns jsonb
language sql stable as $$
 select jsonb_build_array(jsonb_build_object('ref',jsonb_build_object('type','language','languageCode',language,'levels',(select jsonb_agg(jsonb_build_object('subjectCode',s->'code','subjectVersion',s->'version','itemCode',i->'code','points',i->'points') order by case i->>'code' when first_code then 1 else 2 end) from public.programplan_catalogs c cross join lateral jsonb_array_elements(c.payload->'subjects') s cross join lateral jsonb_array_elements(s->'items') i where i->>'code' in (first_code,second_code))),
 'distribution',jsonb_build_array(jsonb_build_object('levelKey',left(first_code,4)||':1:'||first_code,'points','[100,0,0,0,0,0]'::jsonb),jsonb_build_object('levelKey',left(second_code,4)||':1:'||second_code,'points','[0,100,0,0,0,0]'::jsonb))))
$$;
select ok(to_regprocedure('public.phase5_write_programplan_unit_packages(uuid,uuid,integer,text,jsonb)') is not null,'C entrypoint exists');
select ok(not has_table_privilege('anon','public.programplan_unit_packages','select,insert,update,delete'),'anon table closed');
select ok(not has_table_privilege('authenticated','public.programplan_unit_packages','select,insert,update,delete'),'authenticated table closed');
select ok(not has_table_privilege('skolplattform_worker','public.programplan_unit_packages','select,insert,update,delete'),'Worker table closed');
select ok(not has_function_privilege('skolplattform_worker','public.phase5_programplan_validate_selection(jsonb,text,jsonb)','execute'),'validation helper closed');
select is((public.phase5_read_programplan_unit_packages('55008000-0000-4000-8000-000000000050')->'units'->0->>'revision')::integer,0,'missing school row revision zero');
create temporary table package_before(value jsonb);
insert into package_before select to_jsonb(p) from public.point_plans p where p.id='55008000-0000-4000-8000-000000000050';
create temporary table package_result(value jsonb);
insert into package_result values(public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',0,'mosp',pg_temp.package_entries()));
select is((select value->'units'->0->>'revision' from package_result),'1','principal saves school revision one');
select is(public.phase5_read_programplan_unit_packages('55008000-0000-4000-8000-000000000050'),(select value from package_result),'exact read-back');
select is((select to_jsonb(p) from public.point_plans p where p.id='55008000-0000-4000-8000-000000000050'),(select value from package_before),'complete plan row unchanged including revision/timestamps');
select is((select count(*) from public.point_plan_events where point_plan_id='55008000-0000-4000-8000-000000000050' and action='programplan_unit_packages_changed' and session_id='55008000-0000-4000-8000-000000000081'),1::bigint,'session-bound history');
select is((select count(*) from public.security_events where object_id='55008000-0000-4000-8000-000000000050' and action='programplan_unit_packages_changed' and source='db'),1::bigint,'atomic DB audit');
select throws_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',0,'mosp',pg_temp.package_entries())$q$,'40001',null,'stale CAS refused');
select throws_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000031',0,'mosp',pg_temp.package_entries())$q$,'42501',null,'foreign school denied');
select throws_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',1,'missing',pg_temp.package_entries())$q$,'22023',null,'unknown block denied');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',pg_temp.package_entries('zz')->0)$q$,'22023',null,'unknown language denied');
select lives_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',pg_temp.package_entries('fr','MODO2000X','MODF1000X')->0)$q$,'continuation2 and advanced1 contiguous');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',pg_temp.package_entries('fr','MODO1000X','MODF1000X')->0)$q$,'22023',null,'continuation1 and advanced1 gap denied');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',jsonb_set(pg_temp.package_entries()->0,'{ref,levels,0,points}','99'))$q$,'22023',null,'forged points denied');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',jsonb_set(pg_temp.package_entries()->0,'{ref,levels}','[{"subjectCode":"MODO","subjectVersion":1,"itemCode":"MODO1000X","points":100}]'))$q$,'22023',null,'package total must match block');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',jsonb_set(pg_temp.package_entries()->0,'{distribution,0,points}','[101,0,0,0,0,0]'))$q$,'22023',null,'level overflow denied');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',jsonb_set(pg_temp.package_entries()->0,'{distribution,0,points}','[0.1,0,0,0,0,0]'))$q$,'22023',null,'fractional points denied');
select lives_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',jsonb_set(pg_temp.package_entries()->0,'{distribution}','[]'))$q$,'missing allocation allowed for analysis');
select throws_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',1,'mosp',pg_temp.package_entries()||pg_temp.package_entries())$q$,'22023',null,'duplicate entry refused');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp','{"ref":{"type":"package","packageId":"55008000-0000-4000-8000-000000000001","version":1},"distribution":[]}')$q$,'22023',null,'missing generic package reference remains denied');
select pg_temp.programplan_actor((select id from programplan_roles where name='admin'),'55008000-0000-4000-8000-000000000023','55008000-0000-4000-8000-000000000013','55008000-0000-4000-8000-000000000083');
select lives_ok($q$select public.phase5_read_programplan('55008000-0000-4000-8000-000000000050')$q$,'administrator plan reading allowed');
select lives_ok($q$select public.phase5_read_programplan_terms('55008000-0000-4000-8000-000000000050')$q$,'administrator term reading allowed');
select lives_ok($q$select public.phase5_list_programplan_offerings(1)$q$,'administrator listing allowed');
select lives_ok($q$select public.phase5_programplan_selection(null,null,null)$q$,'administrator selection read allowed');
select lives_ok($q$select public.phase5_programplan_workspace('55008000-0000-4000-8000-000000000040',1,null)$q$,'administrator workspace allowed');
select lives_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',1,'mosp',pg_temp.package_entries('de'))$q$,'administrator package save allowed');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',0,'[]')$q$,'42501',null,'administrator terms write denied');
select throws_ok($q$select public.phase5_replace_programplan_blocks('55008000-0000-4000-8000-000000000050',0,pg_temp.programplan_reference()->'choiceBlocks')$q$,'42501',null,'administrator block write denied');
select throws_ok($q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',0,'[]')$q$,'42501',null,'administrator specialization write denied');
select throws_ok($q$select public.phase5_create_programplan_draft('55008000-0000-4000-8000-000000000045',0,pg_temp.programplan_reference())$q$,'42501',null,'administrator draft write denied');
select throws_ok($q$select public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000051',0,pg_temp.programplan_reference())$q$,'42501',null,'administrator bind denied');
select throws_ok($q$select public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000052',0,3,pg_temp.programplan_reference())$q$,'42501',null,'administrator clone denied');
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',0,'archive','{}')$q$,'42501',null,'administrator lifecycle write denied');
select throws_ok($q$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000090','55008000-0000-4000-8000-000000000030','Test',null,'Test',pg_temp.programplan_reference())$q$,'42501',null,'administrator education create denied');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
select lives_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',2,'mosp',pg_temp.package_entries('es'))$q$,'HM school save allowed');
-- Sealed/replaced source cannot be mutated, but school selections can.
set local session_replication_role=replica;
update public.point_plans set status='faststalld',decided_on=current_date where id='55008000-0000-4000-8000-000000000050';
set local session_replication_role=origin;
select lives_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',3,'mosp',pg_temp.package_entries())$q$,'sealed selection save allowed');
set local session_replication_role=replica;
update public.point_plans set status='ersatt' where id='55008000-0000-4000-8000-000000000050';
set local session_replication_role=origin;
select lives_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',4,'mosp',pg_temp.package_entries())$q$,'replaced selection save allowed');
create temporary table package_source as select to_jsonb(p) value from public.point_plans p where id='55008000-0000-4000-8000-000000000050';
create temporary table package_clone as select public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000050',0,1,null) value;
select is((select value->>'copiedPackageUnits' from package_clone),'1','clone returns copied school count');
select is((select revision from public.programplan_unit_packages where plan_id=(select (value->>'id')::uuid from package_clone)),1,'clone selection revision resets one');
select is((select selections from public.programplan_unit_packages where plan_id=(select (value->>'id')::uuid from package_clone)),(select selections from public.programplan_unit_packages where plan_id='55008000-0000-4000-8000-000000000050'),'clone preserves exact selections');
select is((select to_jsonb(p) from public.point_plans p where id='55008000-0000-4000-8000-000000000050'),(select value from package_source),'clone preserves complete source plan');
update public.offerings set archived_at=clock_timestamp() where id='55008000-0000-4000-8000-000000000040';
select throws_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',5,'mosp',pg_temp.package_entries())$q$,'42501',null,'archived selection denied');
update public.offerings set archived_at=null where id='55008000-0000-4000-8000-000000000040';
create temporary table package_before_audit as select to_jsonb(up) value from public.programplan_unit_packages up where plan_id='55008000-0000-4000-8000-000000000050';
create temporary table package_events_before as select count(*) n from public.point_plan_events;
create function pg_temp.reject_package_audit() returns trigger language plpgsql as $$begin if new.action='programplan_unit_packages_changed' then raise exception 'Synthetic audit failure';end if;return new;end$$;
create trigger package_audit_failure before insert on public.security_events for each row execute function pg_temp.reject_package_audit();
select throws_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',5,'mosp',pg_temp.package_entries('es'))$q$,'55000',null,'audit failure aborts entire command');
select is((select to_jsonb(up) from public.programplan_unit_packages up where plan_id='55008000-0000-4000-8000-000000000050'),(select value from package_before_audit),'full package row audit rollback');
select is((select count(*) from public.point_plan_events),(select n from package_events_before),'history audit rollback');
drop trigger package_audit_failure on public.security_events;
-- Dependency protection is checked before mutating linked schools or blocks.
insert into public.offering_units(offering_id,unit_id,organizer_id) values('55008000-0000-4000-8000-000000000040','55008000-0000-4000-8000-000000000031','55008000-0000-4000-8000-000000000002');
select lives_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000031',0,'mosp',pg_temp.package_entries())$q$,'HM chooses second linked school');
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',0,'units','{"unitIds":["55008000-0000-4000-8000-000000000030"]}')$q$,'55006',null,'school with saved selections cannot be removed');
select is((select count(*) from public.offering_units where offering_id='55008000-0000-4000-8000-000000000040'),2::bigint,'dependency failure keeps both linked schools');
select lives_ok($q$select public.phase5_write_programplan_unit_packages((select (value->>'id')::uuid from package_clone),'55008000-0000-4000-8000-000000000030',1,'iv1',pg_temp.package_entries('fr','MODO2000X','MODF1000X'))$q$,'IV language selections saved');
select throws_ok($q$select public.phase5_replace_programplan_blocks((select (value->>'id')::uuid from package_clone),0,'[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv2","kind":"individualChoice","points":200,"name":"IV två"}]')$q$,'55006',null,'saved block cannot be removed');
select throws_ok($q$select public.phase5_replace_programplan_blocks((select (value->>'id')::uuid from package_clone),0,'[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":100,"name":"IV ett"},{"id":"iv2","kind":"individualChoice","points":100,"name":"IV två"}]')$q$,'55006',null,'saved block points cannot change');
select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000031',1,'mosp','[]');
select lives_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',0,'units','{"unitIds":["55008000-0000-4000-8000-000000000030"]}')$q$,'empty school revision receipt does not block removal');
select is((select count(*) from public.programplan_unit_packages where unit_id='55008000-0000-4000-8000-000000000031'),0::bigint,'empty school receipts deleted on removal');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp','null')$q$,'22023',null,'null entry denied');
select throws_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',5,'mosp','null')$q$,'22023',null,'null entries denied');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',jsonb_set(pg_temp.package_entries()->0,'{ref,languageCode}','null'))$q$,'22023',null,'modern language requires language');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',jsonb_set(pg_temp.package_entries()->0,'{distribution,0,levelKey}','"bad"'))$q$,'22023',null,'foreign distribution row denied');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',jsonb_set(pg_temp.package_entries()->0,'{ref,levels,0,subjectVersion}','2'))$q$,'22023',null,'foreign subject version denied');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',jsonb_set(pg_temp.package_entries()->0,'{extra}','1'))$q$,'22023',null,'extra entry keys denied');
select throws_ok($q$insert into public.programplan_unit_packages(plan_id,offering_id,unit_id,organizer_id,revision,selections,updated_by_assignment) values('55008000-0000-4000-8000-000000000053','55008000-0000-4000-8000-000000000040','55008000-0000-4000-8000-000000000030','55008000-0000-4000-8000-000000000002',1,'[]','55008000-0000-4000-8000-000000000060')$q$,'42501',null,'both parent edges bind the same plan and education');
select is((select array_agg(proname::text order by proname) from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_%' and has_function_privilege('skolplattform_worker',oid,'execute') and proname ~ '(bind|change|clone|create|replace|write)'),array['phase5_bind_programplan_draft','phase5_change_programplan_education','phase5_change_timplan_cell','phase5_clone_programplan_draft','phase5_create_programplan_draft','phase5_create_programplan_education','phase5_replace_programplan_blocks','phase5_replace_programplan_specialization','phase5_write_programplan_terms']::text[],'all existing writable Worker entrypoints inventoried; administrator denied above except school packages');
select is((select details->>'copiedPackageUnits' from public.security_events where object_id=(select (value->>'id')::uuid from package_clone) and action='programplan_draft_cloned'),'1','clone audit counts copied school rows');
select is((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_%' and has_function_privilege('skolplattform_worker',oid,'execute')),17::bigint,'foundation preserves exact seventeen entrypoints');
grant execute on function public.phase5_read_programplan_unit_packages(uuid),public.phase5_write_programplan_unit_packages(uuid,uuid,integer,text,jsonb) to skolplattform_worker;
select is((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_%' and has_function_privilege('skolplattform_worker',oid,'execute')),19::bigint,'explicit rollback grant adds exactly two Worker entrypoints');
select ok(not has_function_privilege('anon','public.phase5_write_programplan_unit_packages(uuid,uuid,integer,text,jsonb)','execute'),'anon command remains closed after grant');
select ok(not has_function_privilege('authenticated','public.phase5_read_programplan_unit_packages(uuid)','execute'),'authenticated command remains closed after grant');
select ok(not has_function_privilege('skolplattform_worker','public.phase5_programplan_unit_package_guard()','execute'),'relation helper remains closed after grant');
set local role skolplattform_worker;
select lives_ok($q$select public.phase5_read_programplan_unit_packages('55008000-0000-4000-8000-000000000050')$q$,'real Worker role can use read command');
select lives_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',5,'mosp','[]')$q$,'real Worker role can use write command');
select throws_ok($q$select * from public.programplan_unit_packages$q$,'42501',null,'real Worker role cannot bypass command through table');
reset role;
-- D: immutable package catalogue and versioned school references.
create function pg_temp.valpaket_details(kind text default 'individualChoice',school uuid default '55008000-0000-4000-8000-000000000030',codes text[] default array['ANIM1000X','ANIM2000X']) returns jsonb
language sql stable as $$select jsonb_build_object('unitId',school,'kind',kind,'name','Syntetiskt valpaket','levels',
 (select jsonb_agg(jsonb_build_object('subjectCode',s->'code','subjectVersion',s->'version','itemCode',i->'code','points',i->'points') order by array_position(codes,i->>'code'))
 from public.programplan_catalogs c cross join lateral jsonb_array_elements(c.payload->'subjects') s cross join lateral jsonb_array_elements(s->'items') i where i->>'code'=any(codes)))$$;
create function pg_temp.valpaket_entry(p jsonb) returns jsonb language sql as $$select jsonb_build_array(jsonb_build_object('ref',jsonb_build_object('type','package','packageId',p->'packageId','version',p->'version'),'distribution','[]'::jsonb))$$;
create function pg_temp.slot_reference(program text,orientation text) returns jsonb language sql stable as $$
 select jsonb_build_object('catalogId',c.catalog_id,'programRef',jsonb_build_object('code',p->'code','version',p->'version'),'orientationCode',orientation,'startedOn','2027-08-17','specializationRefs','[]'::jsonb,'choiceBlocks',
 case program when 'HU25' then '[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"sprk","kind":"languageSubject","points":300,"name":"Språkämne"}]'::jsonb
 else '[{"id":"mosp","kind":"modernLanguage","points":100,"name":"Moderna språk"},{"id":"nave","kind":"naturalScience","points":100,"name":"Ett naturvetenskapligt ämne"}]'::jsonb end||'[{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]'::jsonb)
 from public.programplan_catalogs c cross join lateral jsonb_array_elements(c.payload->'programs') p where p->>'code'=program
$$;
create temporary table d_worker_before as select proname::text name from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_%' and has_function_privilege('skolplattform_worker',oid,'execute');
select is((select count(*) from d_worker_before),19::bigint,'D foundation preserves nineteen entrypoints');
select ok(not has_table_privilege('anon','public.programplan_packages','select,insert,update,delete'),'D anon table closed');
select ok(not has_table_privilege('authenticated','public.programplan_packages','select,insert,update,delete'),'D authenticated table closed');
select ok(not has_table_privilege('service_role','public.programplan_packages','select,insert,update,delete'),'D service table closed');
select ok(not has_table_privilege('skolplattform_worker','public.programplan_packages','select,insert,update,delete'),'D Worker table closed');
select ok(not has_function_privilege('skolplattform_worker','public.phase5_save_programplan_package(uuid,integer,jsonb)','execute'),'D save entrypoint closed before explicit grant');
select ok(not has_function_privilege('skolplattform_worker','public.phase5_programplan_validate_scoped_selection(jsonb,text,jsonb,uuid,uuid)','execute'),'D scoped validation helper closed');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
create temporary table valpaket_results(name text primary key,value jsonb);
insert into valpaket_results values('iv1',public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details()));
select is((select value->>'version' from valpaket_results where name='iv1'),'1','D principal creates version one');
select is((select value->>'points' from valpaket_results where name='iv1'),'200','D package points from pinned levels');
select is((select array_agg(k order by k) from valpaket_results,jsonb_object_keys(value) k where name='iv1'),array['catalogId','kind','levels','name','packageId','points','unitId','version']::text[],'D reply contains exact frozen fields');
create temporary table valpaket_original as select to_jsonb(p) value from public.programplan_packages p;
select throws_ok($q$update public.programplan_packages set name='Ändrad'$q$,'55000',null,'D package cannot be updated');
select throws_ok($q$delete from public.programplan_packages$q$,'55000',null,'D package cannot be deleted');
select throws_ok($q$truncate public.programplan_packages$q$,'55000',null,'D package cannot be truncated');
select lives_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',6,'iv1',pg_temp.valpaket_entry((select value from valpaket_results where name='iv1')))$q$,'D package selected in replaced plan');
create temporary table valpaket_selection_original as select to_jsonb(up) value from public.programplan_unit_packages up where plan_id='55008000-0000-4000-8000-000000000050' and unit_id='55008000-0000-4000-8000-000000000030';
insert into valpaket_results values('iv2',public.phase5_save_programplan_package((select (value->>'packageId')::uuid from valpaket_results where name='iv1'),1,jsonb_set(pg_temp.valpaket_details(),'{name}','"Ny version"')));
select is((select value->>'version' from valpaket_results where name='iv2'),'2','D new immutable version increments CAS');
select is((select to_jsonb(p) from public.programplan_packages p where package_id=(select (value->>'packageId')::uuid from valpaket_results where name='iv1') and version=1),(select value from valpaket_original),'D complete version one row unchanged');
select is((select to_jsonb(up) from public.programplan_unit_packages up where plan_id='55008000-0000-4000-8000-000000000050' and unit_id='55008000-0000-4000-8000-000000000030'),(select value from valpaket_selection_original),'D existing school selection row unchanged by package version');
select is((select sel->'entries'->0->'levels' from jsonb_array_elements(public.phase5_programplan_resolved_selections('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030')->'selections') sel where sel->>'blockId'='iv1'),(select value->'levels' from valpaket_results where name='iv1'),'D reread resolves exact original version levels');
select lives_ok($q$select public.phase5_write_programplan_unit_packages((select (value->>'id')::uuid from package_clone),'55008000-0000-4000-8000-000000000030',2,'iv1',pg_temp.valpaket_entry((select value from valpaket_results where name='iv1')))$q$,'D same package offered in two plans');
select is(jsonb_array_length(public.phase5_list_programplan_packages('55008000-0000-4000-8000-000000000030')->'packages'),2,'D own-school list includes every immutable version');
select is((select details from public.security_events where action='programplan_package_saved' and object_id=(select (value->>'packageId')::uuid from valpaket_results where name='iv1') and details->>'packageVersion'='1'),jsonb_build_object('unitId','55008000-0000-4000-8000-000000000030','packageVersion',1,'count',2),'D save audit contains only frozen identifiers and level count');
select is((select details from public.security_events where action='programplan_packages_read' and object_type='school_unit' and object_id='55008000-0000-4000-8000-000000000030' order by occurred_at desc limit 1),'{"count":2}'::jsonb,'D list audit counts versions and binds target school');
select throws_ok($q$select public.phase5_save_programplan_package((select (value->>'packageId')::uuid from valpaket_results where name='iv1'),1,pg_temp.valpaket_details())$q$,'40001',null,'D stale CAS denied');
select throws_ok($q$select public.phase5_save_programplan_package(null,1,pg_temp.valpaket_details())$q$,'22023',null,'D new package requires zero expected version');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('individualChoice',null))$q$,'42501',null,'D principal cannot create global package');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('individualChoice','55008000-0000-4000-8000-000000000031'))$q$,'42501',null,'D principal cannot create another-school package');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('naturalScience'))$q$,'22023',null,'D NAVE disallowed subjects denied');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('languageSubject'))$q$,'22023',null,'D HU disallowed subjects denied');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('individualChoice','55008000-0000-4000-8000-000000000030',array['MODO1000X','MODO2000X']))$q$,'22023',null,'D MODO stays language package');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('individualChoice','55008000-0000-4000-8000-000000000030',array['ANIM1000X'])||'{"extra":1}'::jsonb)$q$,'22023',null,'D extra detail keys denied');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,jsonb_set(pg_temp.valpaket_details(),'{levels,0,points}','99'))$q$,'22023',null,'D forged catalogue points denied');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,jsonb_set(pg_temp.valpaket_details(),'{levels}',(pg_temp.valpaket_details()->'levels')||(pg_temp.valpaket_details()->'levels')))$q$,'22023',null,'D duplicate levels denied');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,jsonb_set(pg_temp.valpaket_details(),'{name}','" "'))$q$,'22023',null,'D empty trimmed name denied');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'mosp',(pg_temp.valpaket_entry((select value from valpaket_results where name='iv1')))->0)$q$,'22023',null,'D generic package forbidden in language block');
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.programplan_reference(),'iv1',jsonb_set((pg_temp.valpaket_entry((select value from valpaket_results where name='iv1')))->0,'{distribution}','[{"levelKey":"ANIM:1:ANIM1000X","points":[101,0,0,0,0,0]}]'))$q$,'22023',null,'D generic distribution overflow denied');
insert into valpaket_results values('nave',public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('naturalScience','55008000-0000-4000-8000-000000000030',array['BIOG2000X'])));
select lives_ok($q$select public.phase5_programplan_validate_selection(pg_temp.slot_reference('NA25','NANAA'),'nave',(pg_temp.valpaket_entry((select value from valpaket_results where name='nave')))->0)$q$,'D valid NAVE package');
insert into valpaket_results values('sprk',public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('languageSubject','55008000-0000-4000-8000-000000000030',array['LATI1000X','LATI2000X','LATI3000X'])));
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.slot_reference('HU25','HUSPK'),'sprk',(pg_temp.valpaket_entry((select value from valpaket_results where name='sprk')))->0)$q$,'22023',null,'D HU Latin1 already fixed denied');
insert into valpaket_results values('sprk-valid',public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('languageSubject','55008000-0000-4000-8000-000000000030',array['KLAS1000X','KLAS2000X','LATI2000X'])));
select lives_ok($q$select public.phase5_programplan_validate_selection(pg_temp.slot_reference('HU25','HUSPK'),'sprk',(pg_temp.valpaket_entry((select value from valpaket_results where name='sprk-valid')))->0)$q$,'D valid HU subjects package');
insert into valpaket_results values('spec-valid',public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('specialization','55008000-0000-4000-8000-000000000030',array['ANIM1000X'])));
select lives_ok($q$select public.phase5_programplan_validate_selection(jsonb_set(pg_temp.programplan_reference(),'{choiceBlocks}',(pg_temp.programplan_reference()->'choiceBlocks')||'[{"id":"spec1","kind":"specialization","points":100,"name":"Fördjupning"}]'::jsonb),'spec1',(pg_temp.valpaket_entry((select value from valpaket_results where name='spec-valid')))->0)$q$,'D specialization option package allowed');
insert into valpaket_results values('spec-invalid',public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('specialization','55008000-0000-4000-8000-000000000030',array['LATI1000X'])));
select throws_ok($q$select public.phase5_programplan_validate_selection(jsonb_set(pg_temp.programplan_reference(),'{choiceBlocks}',(pg_temp.programplan_reference()->'choiceBlocks')||'[{"id":"spec1","kind":"specialization","points":100,"name":"Fördjupning"}]'::jsonb),'spec1',(pg_temp.valpaket_entry((select value from valpaket_results where name='spec-invalid')))->0)$q$,'22023',null,'D specialization outside pinned programme options denied');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,jsonb_set(pg_temp.valpaket_details(),'{name}',to_jsonb(chr(160)||'Namn')))$q$,'22023',null,'D JavaScript trim whitespace parity');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,jsonb_set(pg_temp.valpaket_details(),'{name}',to_jsonb('Namn'||chr(128))))$q$,'22023',null,'D C1 control character denied');
select pg_temp.programplan_actor((select id from programplan_roles where name='admin'),'55008000-0000-4000-8000-000000000023','55008000-0000-4000-8000-000000000013','55008000-0000-4000-8000-000000000083');
select lives_ok($q$select public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details())$q$,'D administrator creates own package');
select throws_ok($q$select public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('individualChoice',null))$q$,'42501',null,'D administrator global creation denied');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
insert into valpaket_results values('global',public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('individualChoice',null))),('foreign-school',public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details('individualChoice','55008000-0000-4000-8000-000000000031')));
select lives_ok($q$select public.phase5_save_programplan_package((select (value->>'packageId')::uuid from valpaket_results where name='global'),1,pg_temp.valpaket_details('individualChoice',null))$q$,'D HM versions global package');
select throws_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',7,'iv1',pg_temp.valpaket_entry((select value from valpaket_results where name='foreign-school')))$q$,'42501',null,'D exact target school enforced even for HM');
select lives_ok($q$select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000030',7,'iv1',pg_temp.valpaket_entry((select value from valpaket_results where name='global')))$q$,'D HM global package available on school');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
select throws_ok($q$select public.phase5_save_programplan_package((select (value->>'packageId')::uuid from valpaket_results where name='global'),2,pg_temp.valpaket_details())$q$,'42501',null,'D global read grants no right to version global source');
select throws_ok($q$select public.phase5_save_programplan_package((select (value->>'packageId')::uuid from valpaket_results where name='foreign-school'),1,pg_temp.valpaket_details())$q$,'42501',null,'D destination mandate insufficient for foreign source');
select throws_ok($q$select public.phase5_list_programplan_packages('55008000-0000-4000-8000-000000000031')$q$,'42501',null,'D unrelated school list denied');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
insert into public.offering_units(offering_id,unit_id,organizer_id) values('55008000-0000-4000-8000-000000000040','55008000-0000-4000-8000-000000000031','55008000-0000-4000-8000-000000000002');
select public.phase5_write_programplan_unit_packages('55008000-0000-4000-8000-000000000050','55008000-0000-4000-8000-000000000031',0,'iv1',pg_temp.valpaket_entry((select value from valpaket_results where name='foreign-school')));
select public.phase5_save_programplan_package((select (value->>'packageId')::uuid from valpaket_results where name='foreign-school'),1,pg_temp.valpaket_details('individualChoice','55008000-0000-4000-8000-000000000031'));
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
select is(public.phase5_list_programplan_packages('55008000-0000-4000-8000-000000000031')->'packages',jsonb_build_array((select value from valpaket_results where name='foreign-school')),'D shared other-school list only exposes exact selected version');
-- Catalogue mismatch is exercised with an isolated corruption of the synthetic row only.
set local session_replication_role=replica;
update public.programplan_packages set catalog_id='sha256:'||repeat('0',64) where package_id=(select (value->>'packageId')::uuid from valpaket_results where name='nave');
set local session_replication_role=origin;
select throws_ok($q$select public.phase5_programplan_validate_selection(pg_temp.slot_reference('NA25','NANAA'),'nave',(pg_temp.valpaket_entry((select value from valpaket_results where name='nave')))->0)$q$,'22023',null,'D another catalogue denied');
set local session_replication_role=replica;
update public.programplan_packages set catalog_id='sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace' where package_id=(select (value->>'packageId')::uuid from valpaket_results where name='nave');
set local session_replication_role=origin;
create temporary table valpaket_audit_before as select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb) value from public.programplan_packages p;
create function pg_temp.reject_valpaket_audit() returns trigger language plpgsql as $$begin if new.action in ('programplan_package_saved','programplan_packages_read') then raise exception 'Synthetic audit failure';end if;return new;end$$;
create trigger valpaket_audit_failure before insert on public.security_events for each row execute function pg_temp.reject_valpaket_audit();
select throws_ok($q$select public.phase5_save_programplan_package(null,0,pg_temp.valpaket_details())$q$,'55000',null,'D new package audit rollback');
select throws_ok($q$select public.phase5_save_programplan_package((select (value->>'packageId')::uuid from valpaket_results where name='iv1'),2,pg_temp.valpaket_details())$q$,'55000',null,'D new version audit rollback');
select throws_ok($q$select public.phase5_list_programplan_packages('55008000-0000-4000-8000-000000000030')$q$,'55000',null,'D list audit failure stops response');
select is((select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb) from public.programplan_packages p),(select value from valpaket_audit_before),'D whole package table unchanged after audit failures');
drop trigger valpaket_audit_failure on public.security_events;
grant execute on function public.phase5_save_programplan_package(uuid,integer,jsonb),public.phase5_list_programplan_packages(uuid) to skolplattform_worker;
select is((select count(*) from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_%' and has_function_privilege('skolplattform_worker',oid,'execute')),21::bigint,'D rollback-only grant adds exactly two to twenty-one');
select is(array(select proname::text from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_%' and has_function_privilege('skolplattform_worker',oid,'execute') order by proname),array(select name from (select name from d_worker_before union all select 'phase5_save_programplan_package' union all select 'phase5_list_programplan_packages') expected order by name),'D exact previous Worker set plus only two package RPC');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')) and a.privilege_type='EXECUTE'),'D all direct clients and PUBLIC remain closed');
set local role skolplattform_worker;
select lives_ok($q$select public.phase5_save_programplan_package(null,0,'{"unitId":"55008000-0000-4000-8000-000000000030","kind":"individualChoice","name":"Syntetiskt Workerpaket","levels":[{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM1000X","points":100}]}')$q$,'D real Worker creates through entrypoint');
select lives_ok($q$select public.phase5_list_programplan_packages('55008000-0000-4000-8000-000000000030')$q$,'D real Worker reads through entrypoint');
select throws_ok($q$select * from public.programplan_packages$q$,'42501',null,'D real Worker cannot read table');
select throws_ok($q$select public.phase5_programplan_package_levels('x','individualChoice','[]')$q$,'42501',null,'D real Worker cannot invoke internal helper');
reset role;

select * from finish();
rollback;
