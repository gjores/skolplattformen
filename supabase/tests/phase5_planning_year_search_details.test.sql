begin;
-- Resource-heavy rollback proof keeps only its owned synthetic sessions valid for three hours; absolute eight-hour fixture limit is unchanged.

create extension if not exists pgtap with schema extensions;
select no_plan();
-- A hash-valid owned catalogue retains actual program content/names. Only its source
-- apiVersion identifies this rollback fixture, so stale-name probes touch no original row.
create temporary table search_fixture_catalog(catalog_id text primary key);
do $$declare payload jsonb; cid text;begin
 select c.payload into strict payload from public.programplan_catalogs c
 where c.catalog_id='sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace';
 payload:=jsonb_set(payload,'{source,apiVersion}',to_jsonb((payload#>>'{source,apiVersion}')||'-search-owned-5540'));
 cid:='sha256:'||encode(extensions.digest(convert_to(public.phase5_programplan_canonical(payload),'UTF8'),'sha256'),'hex');
 insert into public.programplan_catalogs(catalog_id,payload) values(cid,payload);
 insert into search_fixture_catalog values(cid);
end $$;
-- Owned rollback-only fixture. Original 05-37/38 migrations and 93 tests remain immutable.
create function pg_temp.programplan_actor(a uuid,m uuid,i uuid,s uuid) returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55400000-0000-4000-8000-000000000001',true),
 set_config('app.assignment_id',a::text,true),set_config('app.membership_id',m::text,true),
 set_config('app.identity_id',i::text,true),set_config('app.session_id',s::text,true),
 set_config('app.correlation_id','55400000-0000-4000-8000-000000000099',true);
end $$;
create function pg_temp.programplan_reference(refs jsonb default '[{"subjectCode":"ENGE","subjectVersion":1,"itemCode":"ENGE3000X","points":100},{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM1000X","points":100},{"subjectCode":"ANIM","subjectVersion":1,"itemCode":"ANIM2000X","points":100}]'::jsonb)
returns jsonb language sql stable as $$select jsonb_build_object(
 'catalogId',(select catalog_id from search_fixture_catalog),
 'programRef',jsonb_build_object('code','SA25','version',4),'orientationCode','SABEP',
 'startedOn',to_char(make_date(extract(year from current_date)::integer+1,8,17),'YYYY-MM-DD'),'specializationRefs',refs,'choiceBlocks','[{"id":"mosp","kind":"modernLanguage","points":200,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]'::jsonb)$$;
insert into public.customers(id,name) values('55400000-0000-4000-8000-000000000001','Syntetiskt programplansprov');
insert into public.organizers(id,customer_id,name,type) values('55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000001','Syntetisk programplanshuvudman','Kommun');
insert into public.identities(id,issuer,subject) values
 ('55400000-0000-4000-8000-000000000010','https://programplan.example.test','synthetic-hm'),
 ('55400000-0000-4000-8000-000000000011','https://programplan.example.test','synthetic-principal'),
 ('55400000-0000-4000-8000-000000000012','https://programplan.example.test','synthetic-principal2'),
 ('55400000-0000-4000-8000-000000000013','https://programplan.example.test','synthetic-admin');
insert into public.memberships(id,identity_id,customer_id) values
 ('55400000-0000-4000-8000-000000000020','55400000-0000-4000-8000-000000000010','55400000-0000-4000-8000-000000000001'),
 ('55400000-0000-4000-8000-000000000021','55400000-0000-4000-8000-000000000011','55400000-0000-4000-8000-000000000001'),
 ('55400000-0000-4000-8000-000000000022','55400000-0000-4000-8000-000000000012','55400000-0000-4000-8000-000000000001'),
 ('55400000-0000-4000-8000-000000000023','55400000-0000-4000-8000-000000000013','55400000-0000-4000-8000-000000000001');
insert into public.school_units(id,organizer_id,code,name,municipality_code) values
 ('55400000-0000-4000-8000-000000000030','55400000-0000-4000-8000-000000000002','55408030','Syntetisk programplansskola','0000'),
 ('55400000-0000-4000-8000-000000000031','55400000-0000-4000-8000-000000000002','55408031','Annan syntetisk skola','0000');
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
values('55400000-0000-4000-8000-000000000060','55400000-0000-4000-8000-000000000020','55400000-0000-4000-8000-000000000001','55400000-0000-4000-8000-000000000002','huvudman','synthetic-v1','school');
insert into public.mandate_units values
 ('55400000-0000-4000-8000-000000000060','55400000-0000-4000-8000-000000000001','55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000030'),
 ('55400000-0000-4000-8000-000000000060','55400000-0000-4000-8000-000000000001','55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000031');
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55400000-0000-4000-8000-000000000080',decode(md5('55400000-0000-4000-8000-000000000080')||md5('55400000-0000-4000-8000-000000000080'),'hex'),
 '55400000-0000-4000-8000-000000000010','55400000-0000-4000-8000-000000000020','55400000-0000-4000-8000-000000000060',clock_timestamp()+interval '3 hours',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor('55400000-0000-4000-8000-000000000060','55400000-0000-4000-8000-000000000020','55400000-0000-4000-8000-000000000010','55400000-0000-4000-8000-000000000080');
create temporary table programplan_roles(name text primary key,id uuid);
insert into programplan_roles values('hm','55400000-0000-4000-8000-000000000060'),
 ('principal',public.phase3_grant_mandate('{"membershipId":"55400000-0000-4000-8000-000000000021","function":"rektor","scopeKind":"school","unitIds":["55400000-0000-4000-8000-000000000030"]}')),
 ('principal2',public.phase3_grant_mandate('{"membershipId":"55400000-0000-4000-8000-000000000022","function":"rektor","scopeKind":"school","unitIds":["55400000-0000-4000-8000-000000000031"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values
 ('55400000-0000-4000-8000-000000000081',decode(md5('55400000-0000-4000-8000-000000000081')||md5('55400000-0000-4000-8000-000000000081'),'hex'),'55400000-0000-4000-8000-000000000011','55400000-0000-4000-8000-000000000021',(select id from programplan_roles where name='principal'),clock_timestamp()+interval '3 hours',clock_timestamp()+interval '8 hours'),
 ('55400000-0000-4000-8000-000000000082',decode(md5('55400000-0000-4000-8000-000000000082')||md5('55400000-0000-4000-8000-000000000082'),'hex'),'55400000-0000-4000-8000-000000000012','55400000-0000-4000-8000-000000000022',(select id from programplan_roles where name='principal2'),clock_timestamp()+interval '3 hours',clock_timestamp()+interval '8 hours');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55400000-0000-4000-8000-000000000021','55400000-0000-4000-8000-000000000011','55400000-0000-4000-8000-000000000081');
insert into programplan_roles values('admin',public.phase3_grant_mandate('{"membershipId":"55400000-0000-4000-8000-000000000023","function":"administrator","scopeKind":"school","unitIds":["55400000-0000-4000-8000-000000000030"]}'));
insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
values('55400000-0000-4000-8000-000000000083',decode(md5('55400000-0000-4000-8000-000000000083')||md5('55400000-0000-4000-8000-000000000083'),'hex'),'55400000-0000-4000-8000-000000000013','55400000-0000-4000-8000-000000000023',(select id from programplan_roles where name='admin'),clock_timestamp()+interval '3 hours',clock_timestamp()+interval '8 hours');

select pg_temp.programplan_actor('55400000-0000-4000-8000-000000000060','55400000-0000-4000-8000-000000000020','55400000-0000-4000-8000-000000000010','55400000-0000-4000-8000-000000000080');
create function pg_temp.planning_q(patch jsonb default '{}'::jsonb) returns jsonb language sql as $$select
 '{"schoolYear":2027,"unitId":null,"view":"programplan","schoolform":"gymnasium","query":"","status":"all","cohortRelation":"all","archive":"all","grade":null,"sort":"name","direction":"asc","page":1,"selectionRevision":null}'::jsonb||patch$$;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
select ('55400000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000030','gymnasium','Syntetisk ram '||n,'Ingen datumtolkning','SA25','SABEP' from generate_series(0,2) n;
insert into public.offering_units(offering_id,unit_id,organizer_id) values('55400000-0000-4000-8000-000000000100','55400000-0000-4000-8000-000000000031','55400000-0000-4000-8000-000000000002');
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference)
select ('55400000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'55400000-0000-4000-8000-000000000002',
 ('55400000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,1,array['ENGE3000X','ANIM1000X','ANIM2000X'],
 (select catalog_id from search_fixture_catalog),jsonb_set(pg_temp.programplan_reference(),'{startedOn}',to_jsonb((2027+n-1)::text||'-08-17')) from generate_series(0,2) n;
set local session_replication_role=replica;
update public.point_plans p set revision=1,term_distribution=(select jsonb_agg(jsonb_build_object('rowKey',r->>'key','points',jsonb_build_array((r->>'points')::integer,0,0,0,0,0)) order by n)
 from jsonb_array_elements(public.phase5_programplan_term_rows(p.basis_reference)) with ordinality t(r,n)) where p.organizer_id='55400000-0000-4000-8000-000000000002';
set local session_replication_role=origin;
create temporary table planning_gym(name text,value jsonb);
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55400000-0000-4000-8000-000000000021','55400000-0000-4000-8000-000000000011','55400000-0000-4000-8000-000000000081');
insert into planning_gym values('first',public.phase5_create_gym_timplan('55400000-0000-4000-8000-000000000300','55400000-0000-4000-8000-000000000200',1,(select lifecycle_revision from public.offerings where id='55400000-0000-4000-8000-000000000100'),'55400000-0000-4000-8000-000000000030',null,null));
select pg_temp.programplan_actor((select id from programplan_roles where name='principal2'),'55400000-0000-4000-8000-000000000022','55400000-0000-4000-8000-000000000012','55400000-0000-4000-8000-000000000082');
insert into planning_gym values('second',public.phase5_create_gym_timplan('55400000-0000-4000-8000-000000000301','55400000-0000-4000-8000-000000000200',1,(select lifecycle_revision from public.offerings where id='55400000-0000-4000-8000-000000000100'),'55400000-0000-4000-8000-000000000031',null,null));
select pg_temp.programplan_actor('55400000-0000-4000-8000-000000000060','55400000-0000-4000-8000-000000000020','55400000-0000-4000-8000-000000000010','55400000-0000-4000-8000-000000000080');
-- Only owned synthetic cells bypass production mutation guards to model historic sources.
set local session_replication_role=replica;
update public.timplan_cells c set hours=array[case when g.name='first' then 10 else 20 end,0,0,0,0,0]::smallint[],allocated=array[true,false,false,false,false,false]
from planning_gym g where c.timplan_id=(g.value#>>'{reply,id}')::uuid;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades) values
 ('55400000-0000-4000-8000-000000000400','55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000030','grundskola','Syntetisk GR','Text',array[7,8,9]::smallint[]),
 ('55400000-0000-4000-8000-000000000401','55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000030','introduktionsprogram','Syntetisk IM','Text',null);
insert into public.offering_units(offering_id,unit_id,organizer_id) select id,unit_id,organizer_id from public.offerings where id in ('55400000-0000-4000-8000-000000000400','55400000-0000-4000-8000-000000000401');
insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,basis,decided_on) values
 ('55400000-0000-4000-8000-000000000410','55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000400','55400000-0000-4000-8000-000000000030',1,'faststalld','Äldre bunden','2026-09-01'),
 ('55400000-0000-4000-8000-000000000411','55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000400','55400000-0000-4000-8000-000000000030',2,'utkast','Nyare obunden',null),
 ('55400000-0000-4000-8000-000000000412','55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000401','55400000-0000-4000-8000-000000000030',1,'utkast','Veckoram',null);
insert into public.timplan_cells(timplan_id,row_id,hours) values('55400000-0000-4000-8000-000000000410','engelska',array[111,222,333]::smallint[]);
insert into public.timplan_cells(timplan_id,row_id,hours) select '55400000-0000-4000-8000-000000000412',k,array[case when k='im-mentor' then 0 else 2 end]::smallint[] from unnest(array['im-sv','im-ma','im-en','im-sh','im-idh','im-praktik','im-mentor']) k;
insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values
 ('55400000-0000-4000-8000-000000000030','A',2027,'55400000-0000-4000-8000-000000000410','ak8'),
 ('55400000-0000-4000-8000-000000000030','B',2027,'55400000-0000-4000-8000-000000000410','ak8'),
 ('55400000-0000-4000-8000-000000000030','A',2028,'55400000-0000-4000-8000-000000000410','ak9');
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values
 ('55400000-0000-4000-8000-000000000420','55400000-0000-4000-8000-000000000001','55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000030','55400000-0000-4000-8000-000000000400','A',2025),
 ('55400000-0000-4000-8000-000000000421','55400000-0000-4000-8000-000000000001','55400000-0000-4000-8000-000000000002','55400000-0000-4000-8000-000000000030','55400000-0000-4000-8000-000000000400','B',2025);
set local session_replication_role=origin;

-- Fifty-two same-name frames share one verified full key; identity/code metadata remains own.
create function pg_temp.search_id(n integer) returns uuid language sql immutable as $$
 select ('55400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.search_distribution(reference jsonb) returns jsonb language sql stable as $$
 select jsonb_agg(jsonb_build_object('rowKey',r->>'key','points',jsonb_build_array((r->>'points')::integer,0,0,0,0,0)) order by n)
 from jsonb_array_elements(public.phase5_programplan_term_rows(reference)) with ordinality t(r,n)
$$;
set local session_replication_role=replica;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
select pg_temp.search_id(500+n),pg_temp.search_id(2),pg_temp.search_id(30),'gymnasium',
 'Gemensam ram','Syntetisk kull','SA25','SABEP' from generate_series(1,52)n;
insert into public.offering_units(offering_id,unit_id,organizer_id)
select pg_temp.search_id(500+n),pg_temp.search_id(30),pg_temp.search_id(2) from generate_series(1,52)n;
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference,term_distribution,revision)
select pg_temp.search_id(600+n),p.organizer_id,pg_temp.search_id(500+n),1,p.specialization,p.catalog_id,
 jsonb_set(p.basis_reference,'{startedOn}','"2026-08-17"'::jsonb),p.term_distribution,n%7
from public.point_plans p cross join generate_series(1,52)n where p.id=pg_temp.search_id(200);
-- Second real plan version with an identical key; version/revision/status cannot come from cache.
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference,term_distribution,revision,status,decided_on)
select pg_temp.search_id(250),p.organizer_id,p.offering_id,2,p.specialization,p.catalog_id,p.basis_reference,p.term_distribution,17,'ersatt','2026-09-01'
from public.point_plans p where p.id=pg_temp.search_id(200);
-- Partial weekly source and an unbound legacy program remain explicit.
update public.timplan_cells set hours=array[null]::smallint[] where timplan_id=pg_temp.search_id(412) and row_id='im-mentor';
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
values(pg_temp.search_id(470),pg_temp.search_id(2),pg_temp.search_id(30),'gymnasium','Syntetiskt legacyprogram','Okänd start','SA25','SABEP');
-- Replica fixture inserts bypass the ordinary offering-unit trigger; scope must still be real.
insert into public.offering_units(offering_id,unit_id,organizer_id)
values(pg_temp.search_id(470),pg_temp.search_id(30),pg_temp.search_id(2));
insert into public.point_plans(id,organizer_id,offering_id,version,specialization)
values(pg_temp.search_id(471),pg_temp.search_id(2),pg_temp.search_id(470),1,array['ENGE3000X']);
-- A second customer supplies an actual foreign scope, without granting a mandate.
insert into public.customers(id,name) values(pg_temp.search_id(9000),'Syntetisk främmande sökkund');
insert into public.organizers(id,customer_id,name,type) values(pg_temp.search_id(9001),pg_temp.search_id(9000),'Syntetisk främmande huvudman','Kommun');
insert into public.school_units(id,organizer_id,code,name,municipality_code)
values(pg_temp.search_id(9002),pg_temp.search_id(9001),'55408032','Syntetisk främmande sökskola','0000');
set local session_replication_role=origin;


-- Own codes are deliberately absent from name, cohort and school; row052 is on page two.
set local session_replication_role=replica;
update public.offerings set local_code=case when id=pg_temp.search_id(552) then '%_O''Hara-052'
 else 'LKS-'||lpad((substring(id::text from 25)::integer-500)::text,3,'0') end
where id between pg_temp.search_id(501) and pg_temp.search_id(552);
insert into public.offering_units(offering_id,unit_id,organizer_id) values(pg_temp.search_id(501),pg_temp.search_id(31),pg_temp.search_id(2));
update public.offerings set local_code='GR-LOCAL' where id=pg_temp.search_id(400);
update public.offerings set local_code='IM-LOCAL' where id=pg_temp.search_id(401);
update public.offerings set local_code='LEGACY-LOCAL' where id=pg_temp.search_id(470);
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,local_code,program_code,orientation_code)
values(pg_temp.search_id(480),pg_temp.search_id(2),pg_temp.search_id(30),'gymnasium','Saknad plan','Ingen start','UNBOUND-LOCAL','SA25',null),
 (pg_temp.search_id(9003),pg_temp.search_id(9001),pg_temp.search_id(9002),'gymnasium','Gemensam ram','Syntetisk kull','%_O''Hara-052','SA25','SABEP');
insert into public.offering_units(offering_id,unit_id,organizer_id) values
 (pg_temp.search_id(480),pg_temp.search_id(30),pg_temp.search_id(2)),
 (pg_temp.search_id(9003),pg_temp.search_id(9002),pg_temp.search_id(9001));
set local session_replication_role=origin;

-- Independent expectations use the exact stored source reference and the actual pinned
-- catalogue, not the implementation's cached names or a mocked positive response.
create function pg_temp.search_expected_details(row_data jsonb,view_name text) returns jsonb language plpgsql as $$
declare o public.offerings; reference jsonb; catalog_program jsonb; orientation jsonb;
begin
 select * into strict o from public.offerings where id=(row_data->>'offeringId')::uuid;
 if row_data->'source'<>'null'::jsonb then
  if view_name='programplan' then select basis_reference into reference from public.point_plans where id=(row_data#>>'{plan,id}')::uuid;
  else select gym_basis->'basisReference' into reference from public.timplans where id=(row_data#>>'{plan,id}')::uuid;end if;
  select p.value into catalog_program from public.programplan_catalogs c cross join lateral jsonb_array_elements(c.payload->'programs') p(value)
   where c.catalog_id=reference->>'catalogId' and p.value->>'code'=reference#>>'{programRef,code}' and p.value->'version'=reference#>'{programRef,version}';
  select value into orientation from jsonb_array_elements(catalog_program->'orientations') where value->>'code'=reference->>'orientationCode';
 end if;
 return jsonb_build_object('localCode',o.local_code,'programCode',o.program_code,'orientationCode',o.orientation_code,
  'programName',case when o.program_code=reference#>>'{programRef,code}' then catalog_program->'name' end,
  'orientationName',case when o.program_code=reference#>>'{programRef,code}' and o.orientation_code=reference->>'orientationCode' then orientation->'name' end);
end $$;
create function pg_temp.search_details_valid(rows jsonb,view_name text) returns boolean language sql as $$
 select coalesce(bool_and(public.phase5_programplan_shape(r->'searchDetails',array['localCode','programCode','orientationCode','programName','orientationName'])
  and (select count(*) from jsonb_object_keys(r))=20
  and not exists(select 1 from jsonb_each(r->'searchDetails') e where jsonb_typeof(e.value) not in ('string','null'))
  and r->'searchDetails'=pg_temp.search_expected_details(r,view_name)),true)
 from jsonb_array_elements(rows) r
$$;
create function pg_temp.search_scope_valid(rows jsonb) returns boolean language sql as $$
 select coalesce(bool_and(r->>'customerId'=pg_temp.search_id(1)::text and exists(select 1 from public.offerings o
  join public.mandate_units m on m.unit_id=(r->>'unitId')::uuid and m.assignment_id=current_setting('app.assignment_id')::uuid
  where o.id=(r->>'offeringId')::uuid and o.organizer_id=pg_temp.search_id(2)
   and case when o.kind='gymnasium' then exists(select 1 from public.offering_units ou where ou.offering_id=o.id and ou.unit_id=m.unit_id) else o.unit_id=m.unit_id end)),true)
 from jsonb_array_elements(rows) r
$$;
create function pg_temp.search_strip_details(rows jsonb) returns jsonb language sql immutable as $$
 select coalesce(jsonb_agg(r-'searchDetails' order by n),'[]') from jsonb_array_elements(rows) with ordinality t(r,n)
$$;
-- Strip only searchDetails from rows. Explicitly replace both revision carriers with
-- the unchanged revision formula over those exact core rows; do not omit any other field.
create function pg_temp.search_core(outcome jsonb) returns jsonb language plpgsql as $$
declare result jsonb:=outcome->'result'; core_rows jsonb; core_revision text; q jsonb; part text;
begin
 if outcome->>'state'<>'00000' then return jsonb_build_object('state',outcome->>'state','result',result);end if;
 core_rows:=pg_temp.search_strip_details(result#>'{overview,rows}');q:=result#>'{overview,selection}';
 core_revision:=public.phase5_planning_year_revision(q,core_rows);
 foreach part in array array['list','overview'] loop
  result:=jsonb_set(result,array[part,'rows'],pg_temp.search_strip_details(result#>array[part,'rows']));
  result:=jsonb_set(result,array[part,'selectionRevision'],to_jsonb(core_revision));
  if result#>array[part,'selection','selectionRevision']<>'null'::jsonb then
   result:=jsonb_set(result,array[part,'selection','selectionRevision'],to_jsonb(core_revision));end if;
 end loop;
 return jsonb_build_object('state','00000','result',result);
end $$;

create temporary table search_cases(ordinal serial,name text primary key,kind text not null default 'parity',old_state text not null default '00000',new_state text not null default '00000',old_count integer,new_count integer);
insert into search_cases(name) values
 ('school-first-52'),('all-schools-53'),('page-two-2'),('sort-name-desc'),('sort-school'),('sort-cohort'),('sort-version'),('sort-status'),('sort-grade'),('sort-points'),
 ('grade-filter'),('relevant-filter'),('future-year'),('archived-filter'),('own-plan-version-revision'),('own-null-codes'),('missing-basis'),('missing-plan'),
 ('gr-bound-column'),('im-null-hours'),('frozen-year-one'),('frozen-year-two'),('frozen-year-three'),('frozen-live-source-mismatch'),
 ('cache-first-program-mismatch'),('cache-first-orientation-mismatch'),('cache-own-code'),('distinct-start'),('distinct-distribution'),('pinned-orientation'),('pinned-other-program'),('pinned-catalog-version'),
 ('unknown-catalog'),('invalid-program-version'),('invalid-json-version'),('malformed-distribution'),('truncated-frozen-inventory'),('foreign-scope-denied');
update search_cases set old_state='22023',new_state='22023' where name in ('unknown-catalog','invalid-program-version','invalid-json-version','malformed-distribution','truncated-frozen-inventory');
update search_cases set old_state='42501',new_state='42501' where name='foreign-scope-denied';
insert into search_cases(name,kind,old_count,new_count) values
 ('match-local-last','match',0,1),('match-local-middle','match',0,1),('match-program-code','match',0,58),('match-orientation-code','match',0,57),
 ('match-program-name','match',0,56),('match-orientation-name','match',0,56),('match-literal-percent','match',0,1),('match-literal-underscore','match',0,1),
 ('match-literal-apostrophe','match',0,1),('match-missing-basis-local','match',0,1),('match-missing-plan-local','match',0,1),
 ('match-gr-local','match',0,1),('match-im-local','match',0,1),('match-other-school','match',0,1),
 ('match-local-lowercase','match',0,1),('match-program-lowercase','match',0,58),('match-orientation-lowercase','match',0,57),
 ('match-combined','match',0,1),('match-archived-combined','match',0,1),('match-year-filter-excludes','match',0,0),('match-empty','match',0,0);
insert into search_cases(name,kind,old_state,new_state,old_count,new_count) values
 ('stale-local-code','match','00000','40001',52,null),('stale-catalog-name','match','00000','40001',52,null);

-- Each probe rolls back its OWN source variants and actual read audit, on success and
-- failure. Missing fixture mutations fail PZ002 instead of returning a false positive.
create function pg_temp.search_probe(case_name text) returns jsonb language plpgsql as $$
declare q jsonb:=pg_temp.planning_q(jsonb_build_object('unitId',pg_temp.search_id(30),'query','Gemensam ram'));
 outcome jsonb; list_reply jsonb; overview_reply jsonb; page_one jsonb; reference jsonb; dist jsonb; entry jsonb;
 payload jsonb; catalog text; program_name text; orientation_name text; affected integer;
begin
 begin
  set local session_replication_role=replica;
  case case_name
   when 'school-first-52' then null;
   when 'all-schools-53' then q:=q||'{"unitId":null}';
   when 'page-two-2' then page_one:=public.phase5_planning_year_list(q);q:=q||jsonb_build_object('page',2,'selectionRevision',page_one->'selectionRevision');
   when 'sort-name-desc' then q:=q||'{"direction":"desc"}';
   when 'sort-school' then q:=q||'{"sort":"school"}';
   when 'sort-cohort' then q:=q||'{"sort":"cohort"}';
   when 'sort-version' then q:=q||'{"sort":"version"}';
   when 'sort-status' then q:=q||'{"sort":"status"}';
   when 'sort-grade' then q:=q||'{"sort":"grade"}';
   when 'sort-points' then q:=q||'{"sort":"points"}';
   when 'grade-filter' then q:=q||'{"grade":2}';
   when 'relevant-filter' then q:=q||'{"cohortRelation":"relevant"}';
   when 'future-year' then q:=q||'{"schoolYear":2025}';
   when 'archived-filter' then update public.offerings set archived_at='2026-09-01' where id=pg_temp.search_id(552);q:=q||'{"archive":"archived"}';
   when 'own-plan-version-revision' then update public.point_plans set version=17,revision=44,status='ersatt',decided_on='2026-09-01' where id=pg_temp.search_id(652);
   when 'own-null-codes' then update public.offerings set local_code=null,orientation_code=null where id=pg_temp.search_id(552);
   when 'missing-basis' then q:=q||'{"query":"Syntetiskt legacyprogram"}';
   when 'missing-plan' then q:=q||'{"query":"Saknad plan"}';
   when 'gr-bound-column' then q:=pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola"}');
   when 'im-null-hours' then q:=pg_temp.planning_q('{"view":"timplan","schoolform":"introduktionsprogram"}');
   when 'frozen-year-one' then q:=pg_temp.planning_q('{"query":"Syntetisk ram 0","view":"timplan","schoolYear":2026}');
   when 'frozen-year-two' then q:=pg_temp.planning_q('{"query":"Syntetisk ram 0","view":"timplan","schoolYear":2027}');
   when 'frozen-year-three' then q:=pg_temp.planning_q('{"query":"Syntetisk ram 0","view":"timplan","schoolYear":2028}');
   when 'frozen-live-source-mismatch' then
    update public.point_plans set basis_reference=jsonb_set(basis_reference,'{orientationCode}','"SASAP"') where id=pg_temp.search_id(200);
    update public.point_plans set term_distribution=pg_temp.search_distribution(basis_reference) where id=pg_temp.search_id(200);
    q:=pg_temp.planning_q('{"query":"Syntetisk ram 0","view":"timplan","schoolYear":2027}');
   when 'cache-first-program-mismatch' then update public.offerings set program_code='OWN_PROGRAM' where id=pg_temp.search_id(100);
   when 'cache-first-orientation-mismatch' then update public.offerings set orientation_code='OWN_ORIENTATION' where id=pg_temp.search_id(100);
   when 'cache-own-code' then update public.offerings set local_code='CACHE_OWN_LAST',orientation_code='OWN_ORIENTATION' where id=pg_temp.search_id(552);
   when 'distinct-start' then update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}','"2027-01-15"') where id=pg_temp.search_id(652);
   when 'distinct-distribution' then
    select term_distribution into dist from public.point_plans where id=pg_temp.search_id(652);entry:=dist->0;
    update public.point_plans set term_distribution=jsonb_set(dist,'{0,points}',jsonb_build_array(0,0,(entry->'points'->>0)::integer,0,0,0)) where id=pg_temp.search_id(652);
   when 'pinned-orientation' then
    update public.point_plans set basis_reference=jsonb_set(basis_reference,'{orientationCode}','"SASAP"') where id=pg_temp.search_id(652);
    update public.point_plans set term_distribution=pg_temp.search_distribution(basis_reference) where id=pg_temp.search_id(652);
    update public.offerings set orientation_code='SASAP' where id=pg_temp.search_id(552);
   when 'pinned-other-program' then
    reference:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(pg_temp.programplan_reference('[]'),'{startedOn}','"2026-08-17"'),
     '{programRef}','{"code":"EK25","version":4}'),'{orientationCode}','"EKEKI"'),'{choiceBlocks}',
     '[{"id":"mosp","kind":"modernLanguage","points":100,"name":"Moderna språk"},{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]');
    update public.point_plans set basis_reference=reference,specialization='{}',term_distribution=pg_temp.search_distribution(reference) where id=pg_temp.search_id(652);
    update public.offerings set program_code='EK25',orientation_code='EKEKI' where id=pg_temp.search_id(552);
   when 'pinned-catalog-version' then
    select c.payload into strict payload from public.programplan_catalogs c where c.catalog_id=(select p.catalog_id from public.point_plans p where p.id=pg_temp.search_id(652));
    payload:=jsonb_set(payload,'{programs}',(select jsonb_agg(case when p->>'code'='SA25' then jsonb_set(jsonb_set(p,'{version}','5'),'{name}','"Äldre explicit katalogvariant"') else p end order by n) from jsonb_array_elements(payload->'programs') with ordinality t(p,n)));
    if not public.phase5_programplan_payload_valid(payload) then raise exception 'Invalid owned catalogue fixture' using errcode='PZ002';end if;
    catalog:='sha256:'||encode(extensions.digest(convert_to(public.phase5_programplan_canonical(payload),'UTF8'),'sha256'),'hex');
    insert into public.programplan_catalogs(catalog_id,payload) values(catalog,payload);
    update public.point_plans set catalog_id=catalog,basis_reference=jsonb_set(jsonb_set(basis_reference,'{catalogId}',to_jsonb(catalog)),'{programRef,version}','5') where id=pg_temp.search_id(652);
   when 'unknown-catalog' then
    update public.point_plans set catalog_id='sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
     basis_reference=jsonb_set(basis_reference,'{catalogId}','"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"') where id=pg_temp.search_id(652);
   when 'invalid-program-version' then update public.point_plans set basis_reference=jsonb_set(basis_reference,'{programRef,version}','99') where id=pg_temp.search_id(652);
   when 'invalid-json-version' then update public.point_plans set basis_reference=jsonb_set(basis_reference,'{programRef,version}','"4"') where id=pg_temp.search_id(652);
   when 'malformed-distribution' then update public.point_plans set term_distribution='[{}]' where id=pg_temp.search_id(652);
   when 'truncated-frozen-inventory' then
    update public.timplans set gym_basis=jsonb_set(gym_basis,'{rows}','[]') where id in(select (value#>>'{reply,id}')::uuid from planning_gym);
    get diagnostics affected=row_count;if affected<>2 then raise exception 'Expected two real frozen timplans' using errcode='PZ002';end if;
    q:=pg_temp.planning_q('{"query":"Syntetisk ram 0","view":"timplan","schoolYear":2027}');
   when 'foreign-scope-denied' then q:=q||jsonb_build_object('unitId',pg_temp.search_id(9002));
   when 'stale-local-code' then
    page_one:=public.phase5_planning_year_list(q);update public.offerings set local_code='AFTER_FIRST_PAGE' where id=pg_temp.search_id(552);
    q:=q||jsonb_build_object('page',2,'selectionRevision',page_one->'selectionRevision');
   when 'stale-catalog-name' then
    page_one:=public.phase5_planning_year_list(q);
    update public.programplan_catalogs c set payload=jsonb_set(c.payload,'{programs}',(select jsonb_agg(case when p->>'code'='SA25' then jsonb_set(p,'{name}','"Ändrat namn efter första sidan"') else p end order by n) from jsonb_array_elements(c.payload->'programs') with ordinality t(p,n)))
     where c.catalog_id=(select p.catalog_id from public.point_plans p where p.id=pg_temp.search_id(652));
    get diagnostics affected=row_count;if affected<>1 then raise exception 'Expected exact owned stale catalogue update' using errcode='PZ002';end if;
    q:=q||jsonb_build_object('page',2,'selectionRevision',page_one->'selectionRevision');
   else
    q:=q||'{"query":""}';
    case case_name
     when 'match-local-last' then q:=q||'{"query":"O''Hara-052"}';
     when 'match-local-middle' then q:=q||'{"query":"LKS-027"}';
     when 'match-local-lowercase' then q:=q||'{"query":"lks-027"}';
     when 'match-program-lowercase' then q:=q||'{"query":"sa25"}';
     when 'match-orientation-lowercase' then q:=q||'{"query":"sabep"}';
     when 'match-combined' then q:=q||'{"query":"LKS-027","status":"utkast","grade":2,"cohortRelation":"relevant","archive":"active"}';
     when 'match-archived-combined' then
      update public.offerings set archived_at='2026-09-01' where id=pg_temp.search_id(552);
      q:=q||'{"query":"O''Hara-052","status":"utkast","grade":2,"cohortRelation":"continuing","archive":"archived"}';
     when 'match-year-filter-excludes' then q:=q||'{"query":"LKS-027","schoolYear":2030,"grade":2}';
     when 'match-empty' then q:=q||'{"query":"INGENTRAFF I NAGOT FALT"}';
     when 'match-program-code' then q:=q||'{"query":"SA25"}';
     when 'match-orientation-code' then q:=q||'{"query":"SABEP"}';
     when 'match-program-name' then
      select p->>'name' into strict program_name from public.programplan_catalogs c cross join lateral jsonb_array_elements(c.payload->'programs') p where c.catalog_id=(select catalog_id from public.point_plans where id=pg_temp.search_id(200)) and p->>'code'='SA25' and p->'version'='4'::jsonb;
      q:=q||jsonb_build_object('query',program_name);
     when 'match-orientation-name' then
      select orientation->>'name' into strict orientation_name from public.programplan_catalogs c cross join lateral jsonb_array_elements(c.payload->'programs') p cross join lateral jsonb_array_elements(p->'orientations') orientation
       where c.catalog_id=(select catalog_id from public.point_plans where id=pg_temp.search_id(200)) and p->>'code'='SA25' and p->'version'='4'::jsonb and orientation->>'code'='SABEP';
      q:=q||jsonb_build_object('query',orientation_name);
     when 'match-literal-percent' then q:=q||'{"query":"%"}';
     when 'match-literal-underscore' then q:=q||'{"query":"_"}';
     when 'match-literal-apostrophe' then q:=q||'{"query":"''"}';
     when 'match-missing-basis-local' then q:=q||'{"query":"LEGACY-LOCAL"}';
     when 'match-missing-plan-local' then q:=q||'{"query":"UNBOUND-LOCAL"}';
     when 'match-gr-local' then q:=pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola","query":"GR-LOCAL"}');
     when 'match-im-local' then q:=pg_temp.planning_q('{"view":"timplan","schoolform":"introduktionsprogram","query":"IM-LOCAL"}');
     when 'match-other-school' then q:=q||jsonb_build_object('unitId',pg_temp.search_id(31),'query','LKS-001');
     else raise exception 'Unknown search case' using errcode='PZ002';
    end case;
  end case;
  set local session_replication_role=origin;
  list_reply:=public.phase5_planning_year_list(q);
  overview_reply:=public.phase5_planning_year_overview(q||'{"page":1,"selectionRevision":null}');
  outcome:=jsonb_build_object('state','00000','result',jsonb_build_object('list',list_reply,'overview',overview_reply),
   'detailsValid',pg_temp.search_details_valid(overview_reply->'rows',q->>'view'),
   'metadataProvenance',pg_temp.search_details_valid(list_reply->'rows',q->>'view') and pg_temp.search_details_valid(overview_reply->'rows',q->>'view'),
   'scopeValid',pg_temp.search_scope_valid(overview_reply->'rows'),
   'revisionValid',list_reply->>'selectionRevision'=public.phase5_planning_year_revision(q,overview_reply->'rows') and list_reply->'selectionRevision'=overview_reply->'selectionRevision');
  raise exception 'Deliberate owned search probe rollback' using errcode='PZ001';
 exception when sqlstate 'PZ001' then
   raise notice 'SEARCH_PROGRESS|%|%',case_name,outcome->>'state';return outcome;
  when others then
   raise notice 'SEARCH_PROGRESS|%|%',case_name,sqlstate;
   return jsonb_build_object('state',sqlstate,'result',null,'detailsValid',null,'metadataProvenance',null,'scopeValid',null,'revisionValid',null);
 end;
end $$;

create temporary table search_old(name text primary key,outcome jsonb not null);
insert into search_old select name,pg_temp.search_probe(name) from search_cases order by ordinal;
-- SEARCH_DETAILS_CANDIDATE_APPLY
create temporary table search_new(name text primary key,outcome jsonb not null);
insert into search_new select name,pg_temp.search_probe(name) from search_cases order by ordinal;
select is(o.outcome->>'state',c.old_state,'original intended SQLSTATE: '||c.name) from search_cases c join search_old o using(name) order by ordinal;
select is(n.outcome->>'state',c.new_state,'candidate intended SQLSTATE: '||c.name) from search_cases c join search_new n using(name) order by ordinal;
select is(pg_temp.search_core(n.outcome),pg_temp.search_core(o.outcome),'only details/revision changes: '||c.name)
 from search_cases c join search_old o using(name) join search_new n using(name) where c.kind='parity' order by ordinal;
select ok((n.outcome->>'detailsValid')::boolean and (n.outcome->>'metadataProvenance')::boolean and (n.outcome->>'scopeValid')::boolean and (n.outcome->>'revisionValid')::boolean,'actual metadata, scope and revision: '||c.name)
 from search_cases c join search_new n using(name) where c.new_state='00000' order by ordinal;
select is((o.outcome#>>'{result,list,count}')::integer,c.old_count,'intended original search count: '||c.name) from search_cases c join search_old o using(name) where c.kind='match' order by ordinal;
select is((n.outcome#>>'{result,list,count}')::integer,c.new_count,'intended SEARCH count: '||c.name) from search_cases c join search_new n using(name) where c.kind='match' order by ordinal;
select 'PLANNING_SEARCH_PARITY|'||jsonb_build_object('name',c.name,'oldState',o.outcome->>'state','newState',n.outcome->>'state',
 'oldCoreHash',encode(extensions.digest(pg_temp.search_core(o.outcome)::text,'sha256'),'hex'),'newCoreHash',encode(extensions.digest(pg_temp.search_core(n.outcome)::text,'sha256'),'hex'),
 'coreSame',pg_temp.search_core(o.outcome)=pg_temp.search_core(n.outcome),'oldRevision',o.outcome#>>'{result,list,selectionRevision}','newRevision',n.outcome#>>'{result,list,selectionRevision}',
 'revisionPolicy',case when c.new_state='00000' then 'metadata-bound' else 'error-unchanged' end,
 'detailsValid',n.outcome->'detailsValid')::text
 from search_cases c join search_old o using(name) join search_new n using(name) where c.kind='parity' order by ordinal;
select 'PLANNING_SEARCH_MATCH|'||jsonb_build_object('name',c.name,'oldState',o.outcome->>'state','newState',n.outcome->>'state','expectedOldState',c.old_state,'expectedNewState',c.new_state,
 'oldHash',encode(extensions.digest(jsonb_build_object('state',o.outcome->'state','result',o.outcome->'result')::text,'sha256'),'hex'),
 'newHash',encode(extensions.digest(jsonb_build_object('state',n.outcome->'state','result',n.outcome->'result')::text,'sha256'),'hex'),
 'oldCount',(o.outcome#>>'{result,list,count}')::integer,'newCount',(n.outcome#>>'{result,list,count}')::integer,'expectedOldCount',c.old_count,'expectedNewCount',c.new_count,
 'metadataProvenance',n.outcome->'metadataProvenance','scopeValid',n.outcome->'scopeValid')::text
 from search_cases c join search_old o using(name) join search_new n using(name) where c.kind='match' order by ordinal;
-- Non-vacuous identity, pagination, unknown-source and cache-provenance assertions.
select is((select (outcome#>>'{result,list,count}')::integer from search_new where name='school-first-52'),52,'52 same-name frames at selected school');
select is((select (outcome#>>'{result,list,count}')::integer from search_new where name='all-schools-53'),53,'actual second school adds one distinct frame');
select is((select jsonb_array_length(outcome#>'{result,list,rows}') from search_new where name='page-two-2'),2,'page two contains final two rows');
select ok(exists(select 1 from search_new n cross join lateral jsonb_array_elements(n.outcome#>'{result,list,rows}') r where n.name='page-two-2' and r->>'offeringId'=pg_temp.search_id(552)::text),'last-code target is actually beyond first page');
select ok(exists(select 1 from search_new n cross join lateral jsonb_array_elements(n.outcome#>'{result,overview,rows}') r where n.name='cache-first-program-mismatch' and r->>'offeringId'=pg_temp.search_id(501)::text and r#>>'{searchDetails,programName}' is not null and r#>>'{searchDetails,orientationName}' is not null),'first own-code mismatch cannot poison matching cache hit');
select ok(exists(select 1 from search_new n cross join lateral jsonb_array_elements(n.outcome#>'{result,overview,rows}') r where n.name='cache-own-code' and r->>'offeringId'=pg_temp.search_id(552)::text and r#>>'{searchDetails,localCode}'='CACHE_OWN_LAST' and r#>>'{searchDetails,programName}' is not null and r#>'{searchDetails,orientationName}'='null'::jsonb),'cache hit retains own code and masks only mismatched orientation name');
select ok(exists(select 1 from search_new n cross join lateral jsonb_array_elements(n.outcome#>'{result,overview,rows}') r where n.name='own-plan-version-revision' and r#>>'{plan,id}'=pg_temp.search_id(652)::text and r#>>'{plan,version}'='17' and r#>>'{plan,revision}'='44' and r#>>'{plan,status}'='ersatt'),'cache hit retains own exact plan identity/version/revision/status');
select ok(not exists(select 1 from search_new n cross join lateral jsonb_array_elements(n.outcome#>'{result,overview,rows}') r where n.name in ('missing-plan','missing-basis') and (r#>'{searchDetails,programName}'<>'null'::jsonb or r#>'{searchDetails,orientationName}'<>'null'::jsonb)),'missing plan/basis never gains guessed names');
select ok(exists(select 1 from search_new n cross join lateral jsonb_array_elements(n.outcome#>'{result,overview,rows}') r where n.name='pinned-catalog-version' and r->>'offeringId'=pg_temp.search_id(552)::text and r#>>'{searchDetails,programName}'='Äldre explicit katalogvariant'),'exact changed catalog and JSON version provide their own name');
select ok(exists(select 1 from search_new n cross join lateral jsonb_array_elements(n.outcome#>'{result,overview,rows}') r where n.name='pinned-other-program' and r->>'offeringId'=pg_temp.search_id(552)::text and r#>>'{searchDetails,programCode}'='EK25' and r#>>'{searchDetails,orientationCode}'='EKEKI' and r#>>'{searchDetails,programName}'='Ekonomiprogrammet' and r#>>'{searchDetails,orientationName}'='Ekonomi'),'different actual program/orientation has its own pinned names');
select is((select (outcome#>>'{result,list,count}')::integer from search_new where name='missing-plan'),1,'missing plan is an actual scoped offering row');
select is((select (outcome#>>'{result,list,count}')::integer from search_new where name='missing-basis'),1,'legacy basis is an actual scoped plan row');
select * from finish();
rollback;
