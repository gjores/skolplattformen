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

-- 05-20: livscykel. Rollback-only; lokala ACL-ändringar rullas tillbaka.
insert into public.school_unit_types(unit_id,school_type) values('55008000-0000-4000-8000-000000000030','GY'),('55008000-0000-4000-8000-000000000031','GY');
create temporary table lc(name text primary key,value jsonb);
create function pg_temp.y(delta integer) returns integer language sql stable as $$select extract(year from public.phase5_programplan_today())::integer+delta$$;

-- Statusregeln (samma falltabell som programplan-lifecycle.test.mjs).
select is(public.phase5_programplan_phase_at('2026-10-05',null,false,'2026-10-04'),'framtida','dagen före start är framtida');
select is(public.phase5_programplan_phase_at('2026-10-04',null,true,'2026-10-04'),'pagaende','startdagen är pågående');
select is(public.phase5_programplan_phase_at('2023-10-05',null,true,'2026-10-04'),'pagaende','tre år minus en dag är pågående');
select is(public.phase5_programplan_phase_at('2023-10-04',null,true,'2026-10-04'),'avslutad','tre kalenderår senare är avslutad');
select is(public.phase5_programplan_phase_at('2024-02-29',null,true,'2027-02-27'),'pagaende','29 februari: dagen före gränsen');
select is(public.phase5_programplan_phase_at('2024-02-29',null,true,'2027-02-28'),'avslutad','29 februari ger 28 februari');
select is(public.phase5_programplan_phase_at('2023-08-17',2020,true,'2026-08-16'),'pagaende','exakt start går före startår');
select is(public.phase5_programplan_phase_at(null,2027,true,'2026-10-04'),'framtida','startår nästa år är framtida');
select is(public.phase5_programplan_phase_at(null,2026,false,'2026-10-04'),'okand','bara innevarande startår är okänd');
select is(public.phase5_programplan_phase_at(null,2023,false,'2026-10-04'),'okand','startår minus tre är okänd');
select is(public.phase5_programplan_phase_at(null,2022,false,'2026-10-04'),'avslutad','startår minus fyra är avslutad');
select is(public.phase5_programplan_phase_at(null,null,false,'2026-10-04'),'framtida','utan underlag och utan beslut är framtida');
select is(public.phase5_programplan_phase_at(null,null,true,'2026-10-04'),'okand','utan underlag men med beslut gissas aldrig');
select is(public.phase5_programplan_today(),(now() at time zone 'Europe/Stockholm')::date,'dagens datum i Europe/Stockholm');

select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
select is(public.phase5_programplan_lifecycle(o)->>'phase','framtida','bunden plan med framtida start') from public.offerings o where id='55008000-0000-4000-8000-000000000040';
select is(public.phase5_programplan_lifecycle(o)->>'phase','framtida','äldre utkast utan start och beslut') from public.offerings o where id='55008000-0000-4000-8000-000000000041';
select is(public.phase5_programplan_lifecycle(o)->>'phase','okand','fastställd utan start är okänd') from public.offerings o where id='55008000-0000-4000-8000-000000000042';
select is(public.phase5_programplan_lifecycle(o)->'units',jsonb_build_array(jsonb_build_object('id','55008000-0000-4000-8000-000000000030'::uuid,'name','Syntetisk programplansskola','primary',true,'inMandate',true)),'bara huvudskolan i units') from public.offerings o where id='55008000-0000-4000-8000-000000000040';
-- Tidigaste startedOn gäller.
set local session_replication_role=replica;
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,status,decided_on,catalog_id,basis_reference) values
 ('55008000-0000-4000-8000-000000000054','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000040',2,array['ENGE3000X'],'ersatt','2020-09-01','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',jsonb_set(pg_temp.programplan_reference(),'{startedOn}','"2020-08-17"'));
set local session_replication_role=origin;
select is(public.phase5_programplan_lifecycle(o)->>'startsOn','2020-08-17','tidigaste startedOn gäller') from public.offerings o where id='55008000-0000-4000-8000-000000000040';
select is(public.phase5_programplan_lifecycle(o)->>'phase','avslutad','tidigaste version avgör status') from public.offerings o where id='55008000-0000-4000-8000-000000000040';
set local session_replication_role=replica;
delete from public.point_plans where id='55008000-0000-4000-8000-000000000054';
set local session_replication_role=origin;
-- ht_start från huvudskolans läsår används som reserv.
insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end) values('55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030',pg_temp.y(-1),make_date(pg_temp.y(-1),8,17),make_date(pg_temp.y(-1),12,20),make_date(pg_temp.y(0),1,8),make_date(pg_temp.y(0),6,10));
update public.offerings set start_year=pg_temp.y(-1) where id='55008000-0000-4000-8000-000000000045';
select is(public.phase5_programplan_lifecycle(o)->>'phase','pagaende','ht_start som reserv ger pågående') from public.offerings o where id='55008000-0000-4000-8000-000000000045';
select is(public.phase5_programplan_lifecycle(o)->>'startsOn',to_char(make_date(pg_temp.y(-1),8,17),'YYYY-MM-DD'),'reservens startdatum visas') from public.offerings o where id='55008000-0000-4000-8000-000000000045';
-- Lista och arbetsyta visar lifecycle; utbildningens egen form ändras inte.
select ok((select bool_and(r ? 'lifecycle' and (r->'lifecycle'->>'phase') is not null) from jsonb_array_elements(public.phase5_list_programplan_offerings(1)->'offerings') r),'listrader har lifecycle');
select is((select r->'lifecycle'->>'phase' from jsonb_array_elements(public.phase5_list_programplan_offerings(1)->'offerings') r where r->>'id'='55008000-0000-4000-8000-000000000042'),'okand','listans status kommer från SQL');
select is(public.phase5_programplan_workspace('55008000-0000-4000-8000-000000000041',1,null)->'lifecycle'->>'phase','framtida','arbetsytan har lifecycle');
select ok(not (public.phase5_programplan_education(o) ? 'lifecycle'),'utbildningens kvittoform är oförändrad') from public.offerings o where id='55008000-0000-4000-8000-000000000041';

-- Direkta skrivningar stängda för klient-, service- och Worker-roller.
select ok(not exists(select 1 from (values ('public.offerings'),('public.point_plans'),('public.point_plan_events'),('public.programplan_education_receipts')) t(name)
 cross join (values ('anon'),('authenticated'),('service_role'),('skolplattform_worker')) r(role) cross join (values ('insert'),('update'),('delete'),('truncate')) p(priv)
 where has_table_privilege(r.role,t.name,p.priv)),'inga direkta skrivrättigheter på utbildningstabellerna');
select ok(not exists(select 1 from (values ('anon'),('authenticated'),('service_role'),('skolplattform_worker')) r(role) cross join (values ('delete'),('truncate')) p(priv)
 where has_table_privilege(r.role,'public.school_units',p.priv)),'ingen roll kan ta bort skolenheter (kaskad till utbildningar)');
select ok(not exists(select 1 from (values ('anon'),('authenticated'),('service_role')) r(role) cross join (values ('insert'),('update')) p(priv)
 where has_table_privilege(r.role,'public.school_units',p.priv)),'klient- och servicerollerna kan inte skriva skolenheter');
select ok(not exists(select 1 from pg_policy where polrelid='public.offerings'::regclass and polname='offerings_write'),'död skrivpolicy borttagen');
set local role authenticated;
do $$begin delete from public.offerings where false; perform set_config('test.direct_delete','open',true);
exception when others then perform set_config('test.direct_delete',sqlstate,true); end$$;
reset role;
select is(current_setting('test.direct_delete'),'42501','authenticated: delete from offerings ger 42501');
set local role skolplattform_worker;
do $$begin update public.offerings set name=name where false; perform set_config('test.worker_update','open',true);
exception when others then perform set_config('test.worker_update',sqlstate,true); end$$;
reset role;
select is(current_setting('test.worker_update'),'42501','Worker: update offerings ger 42501');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.proname in ('phase5_programplan_phase_at','phase5_programplan_today','phase5_programplan_starts_on','phase5_programplan_phase','phase5_programplan_lifecycle',
 'phase5_programplan_writable','phase5_programplan_lifecycle_audit','phase5_change_programplan_education') and a.grantee=0 and a.privilege_type='EXECUTE'),'nya funktioner stängda för PUBLIC');
select ok(not has_function_privilege('skolplattform_worker','public.phase5_programplan_writable(public.offerings,boolean)','execute'),'hjälpare stängd för Worker');

-- Ta bort framtida plan.
insert into lc select 'created',public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000700','55008000-0000-4000-8000-000000000030','Syntetisk raderbar SA',null,'Syntetisk kull',pg_temp.programplan_reference());
insert into lc values('offering',to_jsonb((select value->'education'->>'id' from lc where name='created')));
select is((select public.phase5_programplan_lifecycle(o)->>'phase' from public.offerings o where id=(select (value#>>'{}')::uuid from lc where name='offering')),'framtida','ny utbildning med framtida start');
select throws_ok($q$select public.phase5_change_programplan_education((select (value#>>'{}')::uuid from lc where name='offering'),0,'delete','{"force":true}')$q$,'22023',null,'okända detaljer nekas');
select throws_ok($q$select public.phase5_change_programplan_education((select (value#>>'{}')::uuid from lc where name='offering'),0,'drop','{}')$q$,'22023',null,'okänt kommando nekas');
select throws_ok($q$select public.phase5_change_programplan_education((select (value#>>'{}')::uuid from lc where name='offering'),1,'delete','{}')$q$,'40001',null,'gammal revision nekas');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
select throws_ok($q$select public.phase5_change_programplan_education((select (value#>>'{}')::uuid from lc where name='offering'),0,'delete','{}')$q$,'42501',null,'rektor kan inte ta bort');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
insert into lc select 'deleted',public.phase5_change_programplan_education((select (value#>>'{}')::uuid from lc where name='offering'),0,'delete','{}');
select is((select value from lc where name='deleted'),jsonb_build_object('offeringId',(select value from lc where name='offering'),'command','delete','lifecycle',null),'borttagningens svar');
select ok(not exists(select 1 from public.offerings where id=(select (value#>>'{}')::uuid from lc where name='offering')),'utbildningen borttagen');
select ok(not exists(select 1 from public.point_plans where offering_id=(select (value#>>'{}')::uuid from lc where name='offering')),'versionerna borttagna');
select ok(exists(select 1 from public.programplan_education_receipts where command_id='55008000-0000-4000-8000-000000000700'),'kvittot finns kvar som spärr');
select is((select count(*)::integer from public.organisation_events where organizer_id='55008000-0000-4000-8000-000000000002' and action='programplan_education_deleted' and actor_identity_id='55008000-0000-4000-8000-000000000010' and session_id='55008000-0000-4000-8000-000000000080'),1,'organisationshändelse med sessionens aktör');
select is((select details from public.security_events where source='db' and action='programplan_education_deleted' and object_id=(select (value#>>'{}')::uuid from lc where name='offering')),'{"decided":false,"versions":1}'::jsonb,'DB-audit med minimerade detaljer');
select throws_ok($q$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000700','55008000-0000-4000-8000-000000000030','Syntetisk raderbar SA',null,'Syntetisk kull',pg_temp.programplan_reference())$q$,'40001',null,'replay återskapar aldrig en borttagen utbildning');
select is(public.phase5_programplan_education_status('55008000-0000-4000-8000-000000000700')->>'status','not_found','status för borttagen utbildning är not_found');
-- Startad, okänd och använd utbildning nekas.
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000045',0,'delete','{}')$q$,'42501','Programplan started','pågående plan kan inte tas bort');
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000042',0,'delete','{}')$q$,'42501','Programplan started','okänd start kan inte tas bort');
insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values('55008000-0000-4000-8000-000000000001','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','55008000-0000-4000-8000-000000000041','SYN1A',pg_temp.y(1));
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000041',0,'delete','{}')$q$,'55006','Education in use','utbildning med klass kan inte tas bort');
select ok(exists(select 1 from public.point_plans where offering_id='55008000-0000-4000-8000-000000000041'),'nekad borttagning lämnar planen orörd');
-- Auditfel ger rollback.
insert into lc select 'created2',public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000701','55008000-0000-4000-8000-000000000030','Syntetisk raderbar SA 2',null,'Syntetisk kull',pg_temp.programplan_reference());
create function pg_temp.fail_audit() returns trigger language plpgsql as $$begin if new.action='programplan_education_deleted' and new.source='db' then raise exception 'synthetic'; end if; return new; end$$;
create trigger lc_fail_audit before insert on public.security_events for each row execute function pg_temp.fail_audit();
select throws_ok($q$select public.phase5_change_programplan_education((select (value->'education'->>'id')::uuid from lc where name='created2'),0,'delete','{}')$q$,'55000',null,'auditfel avbryter borttagningen');
drop trigger lc_fail_audit on public.security_events;
select ok(exists(select 1 from public.offerings where id=(select (value->'education'->>'id')::uuid from lc where name='created2')),'utbildningen finns kvar efter auditfel');

-- 05-20 uppgift 2: D-01/D-04 i alla skrivande entrypoints, arkiv och ändrade uppgifter.
select is(array(select p.proname::text from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%'
 and has_function_privilege('skolplattform_worker',p.oid,'execute') and p.proname !~ '^phase5_(read_|list_)'
 and p.proname not in ('phase5_programplan_workspace','phase5_programplan_selection','phase5_programplan_education_status') order by 1),
 array['phase5_bind_programplan_draft','phase5_change_programplan_education','phase5_change_timplan_cell','phase5_clone_programplan_draft','phase5_create_programplan_draft',
 'phase5_create_programplan_education','phase5_replace_programplan_specialization','phase5_write_programplan_terms'],'exakt mängd skrivande Worker-funktioner');
-- Pågående (start förra året) och avslutad (start för fyra år sedan) med bundna utkast.
set local session_replication_role=replica;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year) values
 ('55008000-0000-4000-8000-000000000090','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk pågående SA','Startad kull','SA25','SABEP',extract(year from public.phase5_programplan_today()-30)::integer),
 ('55008000-0000-4000-8000-000000000091','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000030','gymnasium','Syntetisk avslutad SA','Avslutad kull','SA25','SABEP',pg_temp.y(-4));
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference) values
 ('55008000-0000-4000-8000-000000000092','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000090',1,array['ENGE3000X'],'sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',jsonb_set(pg_temp.programplan_reference(),'{startedOn}',to_jsonb(to_char(public.phase5_programplan_today()-30,'YYYY-MM-DD')))),
 ('55008000-0000-4000-8000-000000000093','55008000-0000-4000-8000-000000000002','55008000-0000-4000-8000-000000000091',1,array['ENGE3000X'],'sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',jsonb_set(pg_temp.programplan_reference(),'{startedOn}',to_jsonb(to_char(make_date(pg_temp.y(-4),8,17),'YYYY-MM-DD'))));
set local session_replication_role=origin;
-- Startade syntetiska utkast har skapats utan huvudskoletriggern ovan.
-- Ge dem samma huvudskolekoppling som varje vanligt utbildningsskapande får.
insert into public.offering_units(offering_id,unit_id,organizer_id)
 select id,unit_id,organizer_id from public.offerings
 where id in ('55008000-0000-4000-8000-000000000090','55008000-0000-4000-8000-000000000091');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
insert into lc select 'archived40',public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',0,'archive','{}');
select ok((select (value->'lifecycle'->>'archived')::boolean and (value->'lifecycle'->>'revision')::integer=1 from lc where name='archived40'),'framtida plan arkiverad med revision +1');
create temporary table lock_states(label text,offering uuid,plan uuid,message text);
insert into lock_states values('pågående','55008000-0000-4000-8000-000000000090','55008000-0000-4000-8000-000000000092','Programplan started'),('avslutad','55008000-0000-4000-8000-000000000091','55008000-0000-4000-8000-000000000093','Programplan started'),
 ('okänd','55008000-0000-4000-8000-000000000042','55008000-0000-4000-8000-000000000052','Programplan started'),('arkiverad','55008000-0000-4000-8000-000000000040','55008000-0000-4000-8000-000000000050','Programplan archived');
create temporary table lock_calls(writer text,template text);
insert into lock_calls values
 ('binda','select public.phase5_bind_programplan_draft(%2$L::uuid,0,pg_temp.programplan_reference())'),
 ('fördjupning','select public.phase5_replace_programplan_specialization(%2$L::uuid,0,''[]''::jsonb)'),
 ('nytt utkast','select public.phase5_create_programplan_draft(%1$L::uuid,1,pg_temp.programplan_reference())'),
 ('klona','select public.phase5_clone_programplan_draft(%2$L::uuid,0,1,null)'),
 ('terminer','select public.phase5_write_programplan_terms(%2$L::uuid,0,''[]''::jsonb)');
select throws_ok(format(c.template,l.offering,l.plan),'42501',l.message,'huvudman: '||c.writer||' nekas för '||l.label||' plan') from lock_states l cross join lock_calls c;
select throws_ok(format('select public.phase5_change_programplan_education(%L::uuid,%s,''update'',''{"name":"Ny","localCode":null,"cohort":"K","startedOn":null}'')',l.offering,case when l.label='arkiverad' then 1 else 0 end),'42501',l.message,'uppgifter kan inte ändras för '||l.label||' plan') from lock_states l;
select throws_ok(format('select public.phase5_change_programplan_education(%L::uuid,%s,''delete'',''{}'')',l.offering,case when l.label='arkiverad' then 1 else 0 end),'42501',l.message,'kan inte tas bort: '||l.label||' plan') from lock_states l;
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
select throws_ok(format(c.template,l.offering,l.plan),'42501',l.message,'rektor: '||c.writer||' nekas för '||l.label||' plan') from lock_states l cross join lock_calls c;
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000090',0,'archive','{}')$q$,'42501',null,'rektor kan inte arkivera');
select ok((select status='utkast' from public.point_plans where id='55008000-0000-4000-8000-000000000092'),'utkast i pågående plan finns kvar (D-04)');
select is((public.phase5_read_programplan_terms('55008000-0000-4000-8000-000000000092')->>'status'),'utkast','utkast i pågående plan kan läsas');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
insert into lc select 'archived90',public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000090',0,'archive','{}');
select ok((select (value->'lifecycle'->>'archived')::boolean and value->'lifecycle'->>'phase'='pagaende' from lc where name='archived90'),'pågående plan kan arkiveras');
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000090',1,'archive','{}')$q$,'40001',null,'redan arkiverad');
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000091',0,'restore','{}')$q$,'40001',null,'ej arkiverad kan inte tas fram');
select ok((public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000090',1,'restore','{}')->'lifecycle'->>'revision')='2','tas fram ur arkivet med revision +1');
select ok((public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',1,'restore','{}')->'lifecycle'->>'archived')='false','framtida plan tas fram');
select is((select count(*)::integer from public.organisation_events where organizer_id='55008000-0000-4000-8000-000000000002' and action in ('programplan_education_archived','programplan_education_restored')),4,'organisationshändelser för arkiv');
select is((select count(*)::integer from public.security_events where source='db' and action in ('programplan_education_archived','programplan_education_restored') and details='{}'::jsonb and object_id in ('55008000-0000-4000-8000-000000000040','55008000-0000-4000-8000-000000000090')),4,'DB-audit för arkiv');
-- Framtida plan ändras som förut, även av rektor.
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55008000-0000-4000-8000-000000000021','55008000-0000-4000-8000-000000000011','55008000-0000-4000-8000-000000000081');
select is((public.phase5_write_programplan_terms('55008000-0000-4000-8000-000000000050',0,'[{"rowKey":"meta:diplomaWork","points":[0,0,0,0,0,100]}]')->>'revision'),'1','rektor fördelar terminer i framtida plan');
select pg_temp.programplan_actor('55008000-0000-4000-8000-000000000060','55008000-0000-4000-8000-000000000020','55008000-0000-4000-8000-000000000010','55008000-0000-4000-8000-000000000080');
-- Ändra uppgifter och startdatum.
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',2,'update','{"name":"","localCode":null,"cohort":"K","startedOn":null}')$q$,'22023',null,'tomt namn nekas');
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',2,'update','{"name":"N","cohort":"K","startedOn":null}')$q$,'22023',null,'exakt nyckelmängd');
insert into lc select 'updated',public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',2,'update',jsonb_build_object('name',' Syntetisk ny SA ','localCode','SYN-1','cohort','Ny kull','startedOn',to_char(make_date(pg_temp.y(2),8,18),'YYYY-MM-DD')));
select ok((select name='Syntetisk ny SA' and local_code='SYN-1' and cohort='Ny kull' and start_year=pg_temp.y(2) and lifecycle_revision=3 from public.offerings where id='55008000-0000-4000-8000-000000000040'),'namn, kod, kull och startår ändrade');
select ok((select basis_reference->>'startedOn'=to_char(make_date(pg_temp.y(2),8,18),'YYYY-MM-DD') and revision=2 from public.point_plans where id='55008000-0000-4000-8000-000000000050'),'utkastets startdatum ändrat med revision +1');
select is((select value->'lifecycle'->>'startsOn' from lc where name='updated'),to_char(make_date(pg_temp.y(2),8,18),'YYYY-MM-DD'),'svaret visar nytt startdatum');
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000040',3,'update',jsonb_build_object('name','Syntetisk ny SA','localCode',null,'cohort','Ny kull','startedOn',to_char(public.phase5_programplan_today(),'YYYY-MM-DD')))$q$,'22023','Education start passed','startdatum i dag nekas');
select throws_ok($q$select public.phase5_change_programplan_education('55008000-0000-4000-8000-000000000041',0,'update',jsonb_build_object('name','Syntetisk obunden SA','localCode',null,'cohort','Inte ett datum','startedOn',to_char(make_date(pg_temp.y(1),8,17),'YYYY-MM-DD')))$q$,'22023','Education start locked','startdatum kräver ett enda bundet utkast');
select throws_ok($q$update public.point_plans set basis_reference=jsonb_set(basis_reference,'{orientationCode}','"SASAP"'),revision=revision+1 where id='55008000-0000-4000-8000-000000000050'$q$,'42501',null,'övrig basis förblir låst');
-- D-04: ny utbildning med passerat startdatum nekas.
select throws_ok($q$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000702','55008000-0000-4000-8000-000000000030','Syntetisk bakåt SA',null,'K',jsonb_set(pg_temp.programplan_reference(),'{startedOn}',to_jsonb(to_char(public.phase5_programplan_today(),'YYYY-MM-DD'))))$q$,'22023','Education start passed','start i dag nekas');
select throws_ok($q$select public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000703','55008000-0000-4000-8000-000000000030','Syntetisk bakåt SA',null,'K',jsonb_set(pg_temp.programplan_reference(),'{startedOn}','"2020-08-17"'))$q$,'22023','Education start passed','passerad start nekas');
insert into lc select 'sameyear',public.phase5_create_programplan_education('55008000-0000-4000-8000-000000000704','55008000-0000-4000-8000-000000000030','Syntetisk sen start SA',null,'K',jsonb_set(pg_temp.programplan_reference(),'{startedOn}',to_jsonb(to_char(public.phase5_programplan_today()+1,'YYYY-MM-DD'))));
select is((select public.phase5_programplan_lifecycle(o)->>'phase' from public.offerings o where id=(select (value->'education'->>'id')::uuid from lc where name='sameyear')),'framtida','start i morgon är framtida och utkastet skapas');
select * from finish();
rollback;
