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
-- End programplan fixture.
-- 05-21: samma syntetiska huvudman; alla ändringar rullas tillbaka.
select has_table('public','offering_units','offering_units finns');
select ok((select relrowsecurity from pg_class where oid='public.offering_units'::regclass),'RLS är på');
select ok(not exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid='public.offering_units'::regclass and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='skolplattform_worker'),(select oid from pg_roles where rolname='service_role'))),'direkta tabellprivilegier stängda');
insert into public.school_unit_types(unit_id,school_type) values('55008000-0000-4000-8000-000000000030','GY'),('55008000-0000-4000-8000-000000000031','GY');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values
 ('55008000-0000-4000-8000-000000000032','55008000-0000-4000-8000-000000000002','55008032','Skola utan gymnasium','0000'),
 ('55008000-0000-4000-8000-000000000033','55008000-0000-4000-8000-000000000002','55008033','Gymnasium utan mandat','0000');
insert into public.school_unit_types(unit_id,school_type) values('55008000-0000-4000-8000-000000000033','GY');
insert into public.mandate_units values('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000032');
select is((select count(*)::integer from public.offering_units where offering_id in ('55008000-0000-4000-8000-000000000040','55008000-0000-4000-8000-000000000041','55008000-0000-4000-8000-000000000042','55008000-0000-4000-8000-000000000043','55008000-0000-4000-8000-000000000045')),5,'nya utbildningar får automatiskt huvudskolan');
create function pg_temp.units_cmd(n integer,revision integer,ids jsonb) returns jsonb language sql volatile as $$select public.phase5_change_programplan_education(('55008000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,revision,'units',jsonb_build_object('unitIds',ids))$$;
create function pg_temp.units_actor(role text) returns void language plpgsql as $$begin
 if role='hm' then perform pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
 else perform pg_temp.programplan_actor((select id from programplan_roles where name=role),'55008000-0000-4000-8000-000000000022','55008000-0000-4000-8000-000000000012','55008000-0000-4000-8000-000000000082');end if;end$$;
-- Rektor B får endast mandat för B; parent HM har både skolor.
select pg_temp.units_actor('hm');
delete from public.mandate_units where assignment_id=(select id from programplan_roles where name='principal2');
insert into public.mandate_units select id,'55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000031' from programplan_roles where name='principal2';
update public.access_assignments set unit_id='55008000-0000-4000-8000-000000000031' where id=(select id from programplan_roles where name='principal2');
insert into public.assignment_units(assignment_id,unit_id) select staff_assignment_id,'55008000-0000-4000-8000-000000000031' from public.access_assignments where id=(select id from programplan_roles where name='principal2');
create temporary table ur(name text primary key,value jsonb);
insert into ur select 'added',pg_temp.units_cmd(40,0,'["55008000-0000-4000-8000-000000000030","55008000-0000-4000-8000-000000000031"]');
select is((select value->'lifecycle'->>'revision' from ur where name='added'),'1','skolval höjer revision');
select is((select jsonb_array_length(value->'lifecycle'->'units') from ur where name='added'),2,'båda skolor i lifecycle');
select is((select value->'lifecycle'->'units'->0->>'primary' from ur where name='added'),'true','huvudskolan först');
select is((select count(*)::integer from public.security_events where object_id='55008000-0000-4000-8000-000000000040' and action='programplan_education_units_changed' and details='{"added":1,"removed":0}'::jsonb),1,'audit innehåller endast antal');
select pg_temp.units_actor('principal2');
select ok(exists(select 1 from jsonb_array_elements(public.phase5_list_programplan_offerings(1)->'offerings') f where f->>'id'='55008000-0000-4000-8000-000000000040'),'rektor B ser planen i lista');
select is(public.phase5_programplan_workspace('55008000-0000-4000-8000-000000000040',1,null)->'versions'->0->>'id','55008000-0000-4000-8000-000000000050','rektor B ser samma version');
select is(public.phase5_programplan_workspace('55008000-0000-4000-8000-000000000040',1,null)->'lifecycle'->'units'->0->>'inMandate','false','huvudskolan utanför B:s mandat');
select is(public.phase5_programplan_workspace('55008000-0000-4000-8000-000000000040',1,null)->'lifecycle'->'units'->1->>'inMandate','true','B i rektorns mandat');
select throws_ok($q$select pg_temp.units_cmd(40,1,'["55008000-0000-4000-8000-000000000030","55008000-0000-4000-8000-000000000031"]')$q$,'42501',null,'rektor ändrar inte skolor');
select throws_ok($q$select public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',0,'[]')$q$,'42501','Programplan denied','partiellt mandat blockerar fördelning');
select throws_ok($q$select public.phase5_create_programplan_draft('55008000-0000-4000-8000-000000000040',1,pg_temp.programplan_reference())$q$,'42501','Programplan denied','partiellt mandat blockerar utkast');
select pg_temp.units_actor('hm');
-- Alla befintliga skrivvägar använder mandat för hela planen.
create temporary table partial_writers(name text,sql text);
insert into partial_writers values
 ('binda', $q$select public.phase5_bind_programplan_draft('55008000-0000-4000-8000-000000000050',0,pg_temp.programplan_reference())$q$),
 ('fördjupning',$q$select public.phase5_replace_programplan_specialization('55008000-0000-4000-8000-000000000050',0,'[]')$q$),
 ('klona',$q$select public.phase5_clone_programplan_draft('55008000-0000-4000-8000-000000000050',0,1,null)$q$),
 ('arkivera',$q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',1,'archive','{}')$q$),
 ('ändra uppgifter',$q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',1,'update','{"name":"N","localCode":null,"cohort":"K","startedOn":null}')$q$),
 ('radera',$q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',1,'delete','{}')$q$),
 ('skolval',$q$select pg_temp.units_cmd(40,1,'["55008000-0000-4000-8000-000000000030"]')$q$);
-- Huvudmannen har nu bara huvudskolan, men mandatet är fortfarande giltigt.
delete from public.mandate_units where assignment_id='55008000-0000-4000-8000-000000000060' and unit_id='55008000-0000-4000-8000-000000000031';
select throws_ok(sql,'42501',null,'partiell huvudman nekas: '||name) from partial_writers;
insert into public.mandate_units values('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000031');
-- Skola hos annan huvudman, även inom samma kund, får inte läggas till.
insert into public.organizers(id,customer_id,name,type) values('55008000-0000-4000-8000-000000000004','55008000-0000-4000-8000-000000000001','Annan syntetisk huvudman','Kommun');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values('55008000-0000-4000-8000-000000000034','55008000-0000-4000-8000-000000000004','55008034','Främmande skola','0000');
insert into public.school_unit_types(unit_id,school_type) values('55008000-0000-4000-8000-000000000034','GY');
select throws_ok($q$select pg_temp.units_cmd(40,1,'["55008000-0000-4000-8000-000000000030","55008000-0000-4000-8000-000000000034"]')$q$,'42501',null,'främmande huvudmans skola nekas');
select throws_ok($q$insert into public.offering_units(offering_id,unit_id,organizer_id) values('55008000-0000-4000-8000-000000000040','55008000-0000-4000-8000-000000000034','55008000-0000-4000-8000-000000000002')$q$,'23503',null,'FK kräver att skolan hör till samma huvudman');
select throws_ok($q$select pg_temp.units_cmd(40,0,'["55008000-0000-4000-8000-000000000030"]')$q$,'40001',null,'gammal revision nekas');
select throws_ok($q$select pg_temp.units_cmd(40,1,'[]')$q$,'22023',null,'tomt skolval nekas');
select throws_ok($q$select pg_temp.units_cmd(40,1,'["55008000-0000-4000-8000-000000000031"]')$q$,'22023',null,'huvudskola krävs');
select throws_ok($q$select pg_temp.units_cmd(40,1,'["55008000-0000-4000-8000-000000000030","55008000-0000-4000-8000-000000000030"]')$q$,'22023',null,'dubblett nekas');
select throws_ok($q$select pg_temp.units_cmd(40,1,'["INVALID"]')$q$,'22023',null,'ogiltigt ID nekas');
select throws_ok($q$select pg_temp.units_cmd(40,1,'null')$q$,'22023',null,'null nekas');
select throws_ok($q$select pg_temp.units_cmd(40,1,'[null]')$q$,'22023',null,'null-element nekas');
select throws_ok($q$select pg_temp.units_cmd(40,1,'[1]')$q$,'22023',null,'nummer-element nekas');
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',1,'units','{"unitIds":[],"other":1}')$q$,'22023',null,'extra fält nekas');
select throws_ok($q$select pg_temp.units_cmd(40,1,(select jsonb_agg(gen_random_uuid()::text) from generate_series(1,101)))$q$,'22023',null,'mer än 100 skolor nekas');
select throws_ok($q$select pg_temp.units_cmd(40,1,'["55008000-0000-4000-8000-000000000030","55008000-0000-4000-8000-000000000032"]')$q$,'42501',null,'icke gymnasieskola nekas');
select throws_ok($q$select pg_temp.units_cmd(40,1,'["55008000-0000-4000-8000-000000000030","55008000-0000-4000-8000-000000000033"]')$q$,'42501',null,'huvudman utan mandat nekas');
select throws_ok($q$delete from public.offering_units where offering_id='55008000-0000-4000-8000-000000000040' and unit_id='55008000-0000-4000-8000-000000000030'$q$,'42501',null,'huvudskolans rad kan inte raderas');
select throws_ok($q$update public.offerings set unit_id='55008000-0000-4000-8000-000000000031' where id='55008000-0000-4000-8000-000000000040'$q$,'42501',null,'huvudskolan är oföränderlig');
select is(pg_temp.units_cmd(40,1,'["55008000-0000-4000-8000-000000000030"]')->'lifecycle'->>'revision','2','framtida plan tillåter borttagning');
select pg_temp.units_actor('principal2');
select throws_ok($q$select public.phase5_programplan_workspace('55008000-0000-4000-8000-000000000040',1,null)$q$,'42501',null,'B förlorar läsning efter borttagning');
select pg_temp.units_actor('hm');
-- Startår ger pågående/avslutad/okänd utan att ändra något bundet underlag.
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,start_year) values
 ('55008000-0000-4000-8000-000000000090','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Pågående syntetisk plan','K','SA25',extract(year from public.phase5_programplan_today())::integer),
 ('55008000-0000-4000-8000-000000000091','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Avslutad syntetisk plan','K','SA25',extract(year from public.phase5_programplan_today())::integer-4);
create temporary table states(n integer,label text);
insert into states values(90,'okänd'),(91,'avslutad'),(42,'okänd fastställd');
insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end) values('55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030',extract(year from public.phase5_programplan_today())::integer,public.phase5_programplan_today()-30,public.phase5_programplan_today()+30,public.phase5_programplan_today()+31,public.phase5_programplan_today()+100);
update states set label='pågående' where n=90;
select lives_ok(format('select pg_temp.units_cmd(%s,0,''["55008000-0000-4000-8000-000000000030","55008000-0000-4000-8000-000000000031"]'')',n),'tillägg tillåts för '||label) from states;
select throws_ok(format('select pg_temp.units_cmd(%s,1,''["55008000-0000-4000-8000-000000000030"]'')',n),'42501','Programplan started','borttagning nekas för '||label) from states;
select lives_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000090',1,'archive','{}')$q$,'arkivera delad pågående plan');
select throws_ok($q$select pg_temp.units_cmd(90,2,'["55008000-0000-4000-8000-000000000030"]')$q$,'42501','Programplan archived','arkiverad delad plan blockerar borttagning');
select lives_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',2,'archive','{}')$q$,'arkivera framtida plan');
select throws_ok($q$select pg_temp.units_cmd(40,3,'["55008000-0000-4000-8000-000000000030","55008000-0000-4000-8000-000000000031"]')$q$,'42501','Programplan archived','arkiv blockerar tillägg');
select throws_ok($q$select pg_temp.units_cmd(40,3,'["55008000-0000-4000-8000-000000000030"]')$q$,'42501','Programplan archived','arkiv blockerar även oförändrat skolval');
select lives_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',3,'restore','{}')$q$,'återställ efter arkiv');
select lives_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000045',0,'delete','{}')$q$,'utbildning kan raderas inklusive huvudskolans koppling');
select is((select count(*)::integer from public.offering_units where offering_id='55008000-0000-4000-8000-000000000045'),0,'borttagen utbildning lämnar inga skolkopplingar');
select * from finish();
rollback;
