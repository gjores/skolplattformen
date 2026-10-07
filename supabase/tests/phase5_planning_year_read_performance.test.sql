begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Owned rollback-only fixture. Original 05-37/38 migrations and 93 tests remain immutable.
create function pg_temp.programplan_actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55380000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55380000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.programplan_reference(refs jsonb default '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100},{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM1000X","points":100},{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM2000X","points":100}]'::jsonb)
returns jsonb language sql stable as $$select jsonb_build_object(
 'catalogId','sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn',to_char(make_date(extract(year from current_date)::integer+1,8,17),'YYYY-MM-DD'),'specializationRefs',refs,'choiceBlocks','[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]'::jsonb)$$;
insert into public.customers(id,name) values('55380000-0000-4000-8000-000000000001','Syntetiskt programplansprov');
insert into public.organizers(id,customer_id,name,type) values('55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000001','Syntetisk programplanshuvudman','Kommun');
insert into public.identities(id,issuer,subject) values
 ('55380000-0000-4000-8000-000000000010','https://programplan.example.test','synthetic-hm'),
 ('55380000-0000-4000-8000-000000000011','https://programplan.example.test','synthetic-principal'),
 ('55380000-0000-4000-8000-000000000012','https://programplan.example.test','synthetic-principal2'),
 ('55380000-0000-4000-8000-000000000013','https://programplan.example.test','synthetic-admin');
insert into public.memberships(id,identity_id,customer_id) values
 ('55380000-0000-4000-8000-000000000020','55380000-0000-4000-8000-000000000010','55380000-0000-4000-8000-000000000001'),
 ('55380000-0000-4000-8000-000000000021','55380000-0000-4000-8000-000000000011','55380000-0000-4000-8000-000000000001'),
 ('55380000-0000-4000-8000-000000000022','55380000-0000-4000-8000-000000000012','55380000-0000-4000-8000-000000000001'),
 ('55380000-0000-4000-8000-000000000023','55380000-0000-4000-8000-000000000013','55380000-0000-4000-8000-000000000001');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values
 ('55380000-0000-4000-8000-000000000030','55380000-0000-4000-8000-000000000002','55388030','Syntetisk programplansskola','0000'),
 ('55380000-0000-4000-8000-000000000031','55380000-0000-4000-8000-000000000002','55388031','Annan syntetisk skola','0000');
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values('55380000-0000-4000-8000-000000000060','55380000-0000-4000-8000-000000000020','55380000-0000-4000-8000-000000000001','55380000-0000-4000-8000-000000000002','huvudman','synthetic-v1','school');
insert into public.mandate_units values
 ('55380000-0000-4000-8000-000000000060','55380000-0000-4000-8000-000000000001','55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000030'),
 ('55380000-0000-4000-8000-000000000060','55380000-0000-4000-8000-000000000001','55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000031');
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55380000-0000-4000-8000-000000000080',decode(md5('55380000-0000-4000-8000-000000000080')||md5('55380000-0000-4000-8000-000000000080'),'hex'),
 '55380000-0000-4000-8000-000000000010','55380000-0000-4000-8000-000000000020','55380000-0000-4000-8000-000000000060',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor('55380000-0000-4000-8000-000000000060','55380000-0000-4000-8000-000000000020','55380000-0000-4000-8000-000000000010','55380000-0000-4000-8000-000000000080');
create temporary table programplan_roles(name text primary key,id uuid);
insert into programplan_roles values('hm','55380000-0000-4000-8000-000000000060'),
 ('principal',public.phase3_grant_mandate('{"membershipId":"55380000-0000-4000-8000-000000000021","function":"rektor","scopeKind":"school","unitIds":["55380000-0000-4000-8000-000000000030"]}')),
 ('principal2',public.phase3_grant_mandate('{"membershipId":"55380000-0000-4000-8000-000000000022","function":"rektor","scopeKind":"school","unitIds":["55380000-0000-4000-8000-000000000031"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values
 ('55380000-0000-4000-8000-000000000081',decode(md5('55380000-0000-4000-8000-000000000081')||md5('55380000-0000-4000-8000-000000000081'),'hex'),'55380000-0000-4000-8000-000000000011','55380000-0000-4000-8000-000000000021',(select id from programplan_roles where name='principal'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours'),
 ('55380000-0000-4000-8000-000000000082',decode(md5('55380000-0000-4000-8000-000000000082')||md5('55380000-0000-4000-8000-000000000082'),'hex'),'55380000-0000-4000-8000-000000000012','55380000-0000-4000-8000-000000000022',(select id from programplan_roles where name='principal2'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55380000-0000-4000-8000-000000000021','55380000-0000-4000-8000-000000000011','55380000-0000-4000-8000-000000000081');
insert into programplan_roles values('admin',public.phase3_grant_mandate('{"membershipId":"55380000-0000-4000-8000-000000000023","function":"administrator","scopeKind":"school","unitIds":["55380000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55380000-0000-4000-8000-000000000083',decode(md5('55380000-0000-4000-8000-000000000083')||md5('55380000-0000-4000-8000-000000000083'),'hex'),'55380000-0000-4000-8000-000000000013','55380000-0000-4000-8000-000000000023',(select id from programplan_roles where name='admin'),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours');

select pg_temp.programplan_actor('55380000-0000-4000-8000-000000000060','55380000-0000-4000-8000-000000000020','55380000-0000-4000-8000-000000000010','55380000-0000-4000-8000-000000000080');
create function pg_temp.planning_q(patch jsonb default '{}'::jsonb) returns jsonb language sql as $$select
 '{"schoolYear":2027,"unitId":null,"view":"programplan","schoolform":"gymnasium","query":"","status":"all","cohortRelation":"all","archive":"all","grade":null,"sort":"name","direction":"asc","page":1,"selectionRevision":null}'::jsonb||patch$$;
create function pg_temp.planning_parity(label text,patch jsonb) returns text language plpgsql as $$
declare q jsonb:=pg_temp.planning_q(patch);begin return 'PLANNING_PARITY|'||jsonb_build_object('name',label,'setup',public.phase5_planning_year_selection(),
 'request',q,'list',public.phase5_planning_year_list(q),'overview',public.phase5_planning_year_overview(q))::text;end$$;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
select ('55380000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000030','gymnasium','Syntetisk ram '||n,'Ingen datumtolkning','SA25','SABEP' from generate_series(0,2) n;
insert into public.offering_units(offering_id,unit_id,organizer_id) values('55380000-0000-4000-8000-000000000100','55380000-0000-4000-8000-000000000031','55380000-0000-4000-8000-000000000002');
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference)
select ('55380000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'55380000-0000-4000-8000-000000000002',
 ('55380000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,1,array['ENGE3000X','ANIM1000X','ANIM2000X'],
 'sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',jsonb_set(pg_temp.programplan_reference(),'{startedOn}',to_jsonb((2027+n-1)::text||'-08-17')) from generate_series(0,2) n;
set local session_replication_role=replica;
update public.point_plans p set revision=1,term_distribution=(select jsonb_agg(jsonb_build_object('rowKey',r->>'key','points',jsonb_build_array((r->>'points')::integer,0,0,0,0,0)) order by n)
 from jsonb_array_elements(public.phase5_programplan_term_rows(p.basis_reference)) with ordinality t(r,n)) where p.organizer_id='55380000-0000-4000-8000-000000000002';
set local session_replication_role=origin;
create temporary table planning_gym(name text,value jsonb);
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55380000-0000-4000-8000-000000000021','55380000-0000-4000-8000-000000000011','55380000-0000-4000-8000-000000000081');
insert into planning_gym values('first',public.phase5_create_gym_timplan('55380000-0000-4000-8000-000000000300','55380000-0000-4000-8000-000000000200',1,(select lifecycle_revision from public.offerings where id='55380000-0000-4000-8000-000000000100'),'55380000-0000-4000-8000-000000000030',null,null));
select pg_temp.programplan_actor((select id from programplan_roles where name='principal2'),'55380000-0000-4000-8000-000000000022','55380000-0000-4000-8000-000000000012','55380000-0000-4000-8000-000000000082');
insert into planning_gym values('second',public.phase5_create_gym_timplan('55380000-0000-4000-8000-000000000301','55380000-0000-4000-8000-000000000200',1,(select lifecycle_revision from public.offerings where id='55380000-0000-4000-8000-000000000100'),'55380000-0000-4000-8000-000000000031',null,null));
select pg_temp.programplan_actor('55380000-0000-4000-8000-000000000060','55380000-0000-4000-8000-000000000020','55380000-0000-4000-8000-000000000010','55380000-0000-4000-8000-000000000080');
-- Only owned synthetic cells bypass production mutation guards to model historic sources.
set local session_replication_role=replica;
update public.timplan_cells c set hours=array[case when g.name='first' then 10 else 20 end,0,0,0,0,0]::smallint[],allocated=array[true,false,false,false,false,false]
from planning_gym g where c.timplan_id=(g.value#>>'{reply,id}')::uuid;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades) values
 ('55380000-0000-4000-8000-000000000400','55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000030','grundskola','Syntetisk GR','Text',array[7,8,9]::smallint[]),
 ('55380000-0000-4000-8000-000000000401','55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000030','introduktionsprogram','Syntetisk IM','Text',null);
insert into public.offering_units(offering_id,unit_id,organizer_id) select id,unit_id,organizer_id from public.offerings where id in ('55380000-0000-4000-8000-000000000400','55380000-0000-4000-8000-000000000401');
insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,basis,decided_on) values
 ('55380000-0000-4000-8000-000000000410','55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000400','55380000-0000-4000-8000-000000000030',1,'faststalld','Äldre bunden','2026-09-01'),
 ('55380000-0000-4000-8000-000000000411','55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000400','55380000-0000-4000-8000-000000000030',2,'utkast','Nyare obunden',null),
 ('55380000-0000-4000-8000-000000000412','55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000401','55380000-0000-4000-8000-000000000030',1,'utkast','Veckoram',null);
insert into public.timplan_cells(timplan_id,row_id,hours) values('55380000-0000-4000-8000-000000000410','engelska',array[111,222,333]::smallint[]);
insert into public.timplan_cells(timplan_id,row_id,hours) select '55380000-0000-4000-8000-000000000412',k,array[case when k='im-mentor' then 0 else 2 end]::smallint[] from unnest(array['im-sv','im-ma','im-en','im-sh','im-idh','im-praktik','im-mentor']) k;
insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values
 ('55380000-0000-4000-8000-000000000030','A',2027,'55380000-0000-4000-8000-000000000410','ak8'),
 ('55380000-0000-4000-8000-000000000030','B',2027,'55380000-0000-4000-8000-000000000410','ak8'),
 ('55380000-0000-4000-8000-000000000030','A',2028,'55380000-0000-4000-8000-000000000410','ak9');
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values
 ('55380000-0000-4000-8000-000000000420','55380000-0000-4000-8000-000000000001','55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000030','55380000-0000-4000-8000-000000000400','A',2025),
 ('55380000-0000-4000-8000-000000000421','55380000-0000-4000-8000-000000000001','55380000-0000-4000-8000-000000000002','55380000-0000-4000-8000-000000000030','55380000-0000-4000-8000-000000000400','B',2025);
set local session_replication_role=origin;

-- Fifty-two actual plans share three full keys; every identity remains distinct.
create function pg_temp.performance_id(n integer) returns uuid language sql immutable as $$
 select ('55380000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.performance_distribution(reference jsonb) returns jsonb language sql stable as $$
 select jsonb_agg(jsonb_build_object('rowKey',r->>'key','points',jsonb_build_array((r->>'points')::integer,0,0,0,0,0)) order by n)
 from jsonb_array_elements(public.phase5_programplan_term_rows(reference)) with ordinality t(r,n)
$$;
set local session_replication_role=replica;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
select pg_temp.performance_id(500+n),pg_temp.performance_id(2),pg_temp.performance_id(30),'gymnasium',
 'Performance ram '||lpad(n::text,3,'0'),'Syntetisk kull '||(2026+n%3)::text,'SA25','SABEP' from generate_series(1,52)n;
insert into public.offering_units(offering_id,unit_id,organizer_id)
select pg_temp.performance_id(500+n),pg_temp.performance_id(30),pg_temp.performance_id(2) from generate_series(1,52)n;
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference,term_distribution,revision)
select pg_temp.performance_id(600+n),p.organizer_id,pg_temp.performance_id(500+n),1,p.specialization,p.catalog_id,
 jsonb_set(p.basis_reference,'{startedOn}',to_jsonb((2026+n%3)::text||'-08-17')),p.term_distribution,n%7
from public.point_plans p cross join generate_series(1,52)n where p.id=pg_temp.performance_id(200);
-- Second real plan version with an identical key; version/revision/status cannot come from cache.
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference,term_distribution,revision,status,decided_on)
select pg_temp.performance_id(250),p.organizer_id,p.offering_id,2,p.specialization,p.catalog_id,p.basis_reference,p.term_distribution,17,'ersatt','2026-09-01'
from public.point_plans p where p.id=pg_temp.performance_id(200);
-- Partial weekly source and an unbound legacy program remain explicit.
update public.timplan_cells set hours=array[null]::smallint[] where timplan_id=pg_temp.performance_id(412) and row_id='im-mentor';
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
values(pg_temp.performance_id(470),pg_temp.performance_id(2),pg_temp.performance_id(30),'gymnasium','Syntetiskt legacyprogram','Okänd start','SA25','SABEP');
insert into public.point_plans(id,organizer_id,offering_id,version,specialization)
values(pg_temp.performance_id(471),pg_temp.performance_id(2),pg_temp.performance_id(470),1,array['ENGE3000X']);
-- A second customer supplies an actual foreign scope, without granting a mandate.
insert into public.customers(id,name) values(pg_temp.performance_id(9000),'Syntetisk främmande performancekund');
insert into public.organizers(id,customer_id,name,type) values(pg_temp.performance_id(9001),pg_temp.performance_id(9000),'Syntetisk främmande huvudman','Kommun');
insert into public.school_units(id,organizer_id,code,name,municipality_code)
values(pg_temp.performance_id(9002),pg_temp.performance_id(9001),'55388032','Syntetisk främmande performanceskola','0000');
set local session_replication_role=origin;

create temporary table performance_cases(ordinal serial,name text primary key,expected_state text not null default '00000');
insert into performance_cases(name) values
 ('program-list-full'),('program-list-page2'),('program-search'),('program-name-desc'),('program-school-sort'),('program-cohort-sort'),
 ('program-version-sort'),('program-status-sort'),('program-grade-sort'),('program-points-sort'),('program-status-filter'),('program-grade-filter'),
 ('program-relation-filter'),('program-archive-filter'),('program-school-filter'),('program-year-before'),('program-year-after'),
 ('gym-timplan-year1'),('gym-timplan-year2'),('gym-timplan-year3'),('gr-bound-old-year8'),('gr-bound-old-year9'),('im-weekly-null'),
 ('missing-program-basis'),('cache-plan-identity-revision'),('cache-school-identity'),('distinct-catalog'),('distinct-start'),
 ('distinct-orientation'),('distinct-specialization'),('distinct-choice-blocks'),('distinct-distribution'),('array-order-distinct'),
 ('cache-128-fallback'),('cache-cell-limit-fallback'),('null-basis-fallback'),('malformed-distribution'),('extra-distribution-row'),
 ('duplicate-distribution-row'),('invalid-start'),('invalid-program-version'),('shared-source-conflict'),('truncated-frozen-inventory'),
 ('future-2099'),('selection-stale'),('foreign-scope-denied');
update performance_cases set expected_state='22023' where name in ('malformed-distribution','extra-distribution-row','duplicate-distribution-row',
 'invalid-start','invalid-program-version','truncated-frozen-inventory');
update performance_cases set expected_state='40001' where name in ('shared-source-conflict','selection-stale');
update performance_cases set expected_state='42501' where name='foreign-scope-denied';
update performance_cases set expected_state='54000' where name='cache-cell-limit-fallback';

-- Every probe uses a subtransaction that is rolled back on BOTH success and failure.
-- PL/pgSQL variables preserve the actual result across the deliberate subtransaction rollback.
-- No business mutation or audit from one variant can leak into another comparison.
create function pg_temp.performance_probe(case_name text) returns jsonb language plpgsql as $$
declare q jsonb:=pg_temp.planning_q('{"query":"Performance ram","status":"utkast"}'); outcome jsonb; reply jsonb; page_one jsonb;
 ref jsonb; dist jsonb; entry jsonb; payload jsonb; subject jsonb; items jsonb; levels jsonb; basis jsonb; n integer;
 catalog text:='sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
begin
 begin
  set local session_replication_role=replica;
  case case_name
   when 'program-list-full' then null;
   when 'program-list-page2' then
    page_one:=public.phase5_planning_year_list(q);
    q:=q||jsonb_build_object('page',2,'selectionRevision',page_one->'selectionRevision');
   when 'program-search' then q:=q||'{"query":"Performance ram 052"}';
   when 'program-name-desc' then q:=q||'{"direction":"desc"}';
   when 'program-school-sort' then q:=q||'{"sort":"school"}';
   when 'program-cohort-sort' then q:=q||'{"sort":"cohort"}';
   when 'program-version-sort' then q:=q||'{"sort":"version"}';
   when 'program-status-sort' then q:=q||'{"sort":"status"}';
   when 'program-grade-sort' then q:=q||'{"sort":"grade"}';
   when 'program-points-sort' then q:=q||'{"sort":"points"}';
   when 'program-status-filter' then q:=q||'{"status":"faststalld"}';
   when 'program-grade-filter' then q:=q||'{"grade":1,"cohortRelation":"relevant"}';
   when 'program-relation-filter' then q:=q||'{"cohortRelation":"relevant"}';
   when 'program-archive-filter' then
    update public.offerings set archived_at='2026-09-01' where id=pg_temp.performance_id(552);
    q:=q||'{"archive":"archived"}';
   when 'program-school-filter' then q:=q||jsonb_build_object('unitId',pg_temp.performance_id(30));
   when 'program-year-before' then q:=q||'{"schoolYear":2025}';
   when 'program-year-after' then q:=q||'{"schoolYear":2032}';
   when 'gym-timplan-year1' then q:=pg_temp.planning_q('{"query":"Syntetisk ram 0","view":"timplan","schoolYear":2026}');
   when 'gym-timplan-year2' then q:=pg_temp.planning_q('{"query":"Syntetisk ram 0","view":"timplan","schoolYear":2027}');
   when 'gym-timplan-year3' then q:=pg_temp.planning_q('{"query":"Syntetisk ram 0","view":"timplan","schoolYear":2028}');
   when 'gr-bound-old-year8' then q:=pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola","schoolYear":2027}');
   when 'gr-bound-old-year9' then q:=pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola","schoolYear":2028}');
   when 'im-weekly-null' then q:=pg_temp.planning_q('{"view":"timplan","schoolform":"introduktionsprogram"}');
   when 'missing-program-basis' then q:=pg_temp.planning_q('{"query":"Syntetiskt legacyprogram"}');
   when 'cache-plan-identity-revision' then
    update public.point_plans set version=17,revision=44,status='ersatt',decided_on='2026-09-01' where id=pg_temp.performance_id(652);
    q:=q||'{"status":"all"}';
   when 'cache-school-identity' then
    update public.offerings set cohort='Egen ändrad utbildningsmetadata',lifecycle_revision=lifecycle_revision+7 where id=pg_temp.performance_id(100);
    q:=pg_temp.planning_q('{"query":"Syntetisk ram 0"}');
   when 'distinct-catalog' then
    insert into public.programplan_catalogs(catalog_id,payload) select catalog,c.payload from public.programplan_catalogs c
     where c.catalog_id=(select p.catalog_id from public.point_plans p where p.id=pg_temp.performance_id(652));
    update public.point_plans set catalog_id=catalog,basis_reference=jsonb_set(basis_reference,'{catalogId}',to_jsonb(catalog)) where id=pg_temp.performance_id(652);
   when 'distinct-start' then
    update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}','"2027-01-15"') where id=pg_temp.performance_id(652);
   when 'distinct-orientation' then
    update public.point_plans set basis_reference=jsonb_set(basis_reference,'{orientationCode}','"SASAP"') where id=pg_temp.performance_id(652);
    update public.point_plans set term_distribution=pg_temp.performance_distribution(basis_reference) where id=pg_temp.performance_id(652);
   when 'distinct-specialization' then
    update public.point_plans set basis_reference=jsonb_set(basis_reference,'{specializationRefs}','[]') where id=pg_temp.performance_id(652);
    update public.point_plans set term_distribution=pg_temp.performance_distribution(basis_reference) where id=pg_temp.performance_id(652);
   when 'distinct-choice-blocks' then
    update public.point_plans set basis_reference=jsonb_set(basis_reference,'{choiceBlocks,1,id}','"iv2"') where id=pg_temp.performance_id(652);
    update public.point_plans set term_distribution=pg_temp.performance_distribution(basis_reference) where id=pg_temp.performance_id(652);
   when 'distinct-distribution' then
    select term_distribution into dist from public.point_plans where id=pg_temp.performance_id(652);
    entry:=dist->0;
    dist:=jsonb_set(dist,'{0,points}',jsonb_build_array(0,0,(entry->'points'->>0)::integer,0,0,0));
    update public.point_plans set term_distribution=dist where id=pg_temp.performance_id(652);
   when 'array-order-distinct' then
    select basis_reference into ref from public.point_plans where id=pg_temp.performance_id(652);
    ref:=jsonb_set(ref,'{specializationRefs}',(select jsonb_agg(value order by ord desc) from jsonb_array_elements(ref->'specializationRefs') with ordinality t(value,ord)));
    ref:=jsonb_set(ref,'{choiceBlocks}',(select jsonb_agg(value order by ord desc) from jsonb_array_elements(ref->'choiceBlocks') with ordinality t(value,ord)));
    update public.point_plans set basis_reference=ref,term_distribution=pg_temp.performance_distribution(ref) where id=pg_temp.performance_id(652);
   when 'cache-128-fallback' then
    select basis_reference into basis from public.point_plans where id=pg_temp.performance_id(200);
    for n in 1..129 loop
     ref:=jsonb_set(basis,'{startedOn}',to_jsonb(to_char(date '2027-08-17'+n,'YYYY-MM-DD')));
     insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
      values(pg_temp.performance_id(8000+n),pg_temp.performance_id(2),pg_temp.performance_id(30),'gymnasium','Syntetisk nyckelgräns '||n,'Syntetisk kull','SA25','SABEP');
     insert into public.offering_units(offering_id,unit_id,organizer_id) values(pg_temp.performance_id(8000+n),pg_temp.performance_id(30),pg_temp.performance_id(2));
     insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference,term_distribution)
      values(pg_temp.performance_id(10000+n),pg_temp.performance_id(2),pg_temp.performance_id(8000+n),1,array['ENGE3000X','ANIM1000X','ANIM2000X'],basis->>'catalogId',ref,pg_temp.performance_distribution(ref));
    end loop;
    q:=pg_temp.planning_q('{"query":"Syntetisk nyckelgräns"}');
   when 'cache-cell-limit-fallback' then
    -- A rollback-only synthetic catalog expands the authenticated inventory.
    -- Its 500 explicit foundation levels exercise the cell budget before 128 keys.
    -- The full result still hits the unchanged 50,000-cell limit (SQLSTATE 54000).
    select basis_reference into basis from public.point_plans where id=pg_temp.performance_id(200);
    select c.payload into payload from public.programplan_catalogs c where c.catalog_id=basis->>'catalogId';
    select value into subject from jsonb_array_elements(payload->'subjects') where value->>'code'='ENGE';
    select jsonb_agg((subject->'items'->0)||jsonb_build_object('code','SYNPL'||lpad(i::text,4,'0'),'points',1) order by i),
     jsonb_agg(jsonb_build_object('code','SYNPL'||lpad(i::text,4,'0'),'points',1) order by i) into items,levels from generate_series(1,500)i;
    subject:=subject||jsonb_build_object('code','SYNPL','version',1,'items',items);
    payload:=jsonb_set(payload,'{subjects}',payload->'subjects'||jsonb_build_array(subject));
    payload:=jsonb_set(payload,'{programs}',(select jsonb_agg(case when p->>'code'='SA25' then jsonb_set(p,'{foundation}',p->'foundation'||
     jsonb_build_array(jsonb_build_object('code','SYNPL','subjectVersion',1,'name','Syntetisk budgetgrund','points',500,'optional',false,'levels',levels))) else p end order by ord)
     from jsonb_array_elements(payload->'programs') with ordinality t(p,ord)));
    insert into public.programplan_catalogs(catalog_id,payload) values(catalog,payload);
    basis:=jsonb_set(basis,'{catalogId}',to_jsonb(catalog));
    for n in 1..96 loop
     ref:=jsonb_set(basis,'{startedOn}',to_jsonb(to_char(date '2027-08-17'+n,'YYYY-MM-DD')));
     insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
      values(pg_temp.performance_id(8000+n),pg_temp.performance_id(2),pg_temp.performance_id(30),'gymnasium','Syntetisk cellgräns '||n,'Syntetisk kull','SA25','SABEP');
     insert into public.offering_units(offering_id,unit_id,organizer_id) values(pg_temp.performance_id(8000+n),pg_temp.performance_id(30),pg_temp.performance_id(2));
     insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference,term_distribution)
      values(pg_temp.performance_id(10000+n),pg_temp.performance_id(2),pg_temp.performance_id(8000+n),1,array['ENGE3000X','ANIM1000X','ANIM2000X'],catalog,ref,pg_temp.performance_distribution(ref));
    end loop;
    q:=pg_temp.planning_q('{"query":"Syntetisk cellgräns"}');
   when 'null-basis-fallback' then
    update public.point_plans set basis_reference=null,catalog_id=null,term_distribution='[]' where id=pg_temp.performance_id(652);
   when 'malformed-distribution' then
    update public.point_plans set term_distribution='[{}]' where id=pg_temp.performance_id(652);
   when 'extra-distribution-row' then
    update public.point_plans set term_distribution=term_distribution||'[{"rowKey":"synthetic:unknown","points":[0,0,0,0,0,0]}]' where id=pg_temp.performance_id(652);
   when 'duplicate-distribution-row' then
    update public.point_plans set term_distribution=term_distribution||jsonb_build_array(term_distribution->0) where id=pg_temp.performance_id(652);
   when 'invalid-start' then
    update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}','"invalid"') where id=pg_temp.performance_id(652);
   when 'invalid-program-version' then
    update public.point_plans set basis_reference=jsonb_set(basis_reference,'{programRef,version}','99') where id=pg_temp.performance_id(652);
   when 'shared-source-conflict' then
    update public.timplans set gym_basis=jsonb_set(gym_basis,'{revision}','99') where id=pg_temp.performance_id(301);
    q:=pg_temp.planning_q('{"query":"Syntetisk ram 0","view":"timplan","schoolYear":2027}');
   when 'truncated-frozen-inventory' then
    update public.timplans set gym_basis=jsonb_set(gym_basis,'{rows}','[]') where id in(pg_temp.performance_id(300),pg_temp.performance_id(301));
    q:=pg_temp.planning_q('{"query":"Syntetisk ram 0","view":"timplan","schoolYear":2027}');
   when 'future-2099' then q:=q||'{"schoolYear":2099}';
   when 'selection-stale' then
    page_one:=public.phase5_planning_year_list(q);
    update public.point_plans set revision=revision+1 where id=pg_temp.performance_id(652);
    q:=q||jsonb_build_object('page',2,'selectionRevision',page_one->'selectionRevision');
   when 'foreign-scope-denied' then q:=q||jsonb_build_object('unitId',pg_temp.performance_id(9002));
   else raise exception 'Unknown performance case' using errcode='22023';
  end case;
  set local session_replication_role=origin;
  reply:=public.phase5_planning_year_list(q);
  if (q->>'page')::integer=1 then reply:=jsonb_build_object('list',reply,'overview',public.phase5_planning_year_overview(q));end if;
  outcome:=jsonb_build_object('state','00000','result',reply);
  raise exception 'Deliberate performance probe rollback' using errcode='PZ001';
 exception
  when sqlstate 'PZ001' then
   raise notice 'PERFORMANCE_PROGRESS|%|%',case_name,outcome->>'state';
   return outcome;
  when others then
   raise notice 'PERFORMANCE_PROGRESS|%|%',case_name,sqlstate;
   return jsonb_build_object('state',sqlstate,'result',null);
 end;
end $$;

create temporary table performance_old(name text primary key,outcome jsonb not null);
insert into performance_old select name,pg_temp.performance_probe(name) from performance_cases order by ordinal;
-- PERFORMANCE_CANDIDATE_APPLY
create temporary table performance_new(name text primary key,outcome jsonb not null);
insert into performance_new select name,pg_temp.performance_probe(name) from performance_cases order by ordinal;
select is(n.outcome,o.outcome,'exact old/new data or SQLSTATE: '||c.name)
from performance_cases c join performance_old o using(name) join performance_new n using(name) order by ordinal;
select is(o.outcome->>'state',c.expected_state,'original intended SQLSTATE: '||c.name)
from performance_cases c join performance_old o using(name) order by ordinal;
select is(n.outcome->>'state',c.expected_state,'candidate intended SQLSTATE: '||c.name)
from performance_cases c join performance_new n using(name) order by ordinal;
select 'PLANNING_PERFORMANCE_PARITY|'||jsonb_build_object('name',c.name,'oldState',o.outcome->>'state','newState',n.outcome->>'state',
 'oldHash',encode(extensions.digest(o.outcome::text,'sha256'),'hex'),'newHash',encode(extensions.digest(n.outcome::text,'sha256'),'hex'),
 'same',o.outcome=n.outcome)::text
from performance_cases c join performance_old o using(name) join performance_new n using(name) order by ordinal;
-- Direct assertions ensure positive comparisons actually cover the intended identities and bounds.
select is((select (outcome#>>'{result,list,count}')::integer from performance_new where name='program-list-full'),52,'all 52 actual canonical program plans present');
select is((select jsonb_array_length(outcome#>'{result,rows}') from performance_new where name='program-list-page2'),2,'second page contains exactly two identities');
select ok(exists(select 1 from performance_new n cross join lateral jsonb_array_elements(n.outcome#>'{result,overview,rows}') r
 where n.name='cache-plan-identity-revision' and r#>>'{plan,id}'=pg_temp.performance_id(652)::text
 and r#>>'{plan,version}'='17' and r#>>'{plan,revision}'='44' and r#>>'{plan,status}'='ersatt'),'cache hit preserves own version/revision/status');
select is((select (outcome#>>'{result,list,count}')::integer from performance_new where name='cache-128-fallback'),129,'128-key fallback returns all 129 distinct actual sources');
select is((select outcome->>'state' from performance_new where name='cache-cell-limit-fallback'),'54000','cell-budget fallback preserves full-result size denial');
select * from finish();
rollback;
