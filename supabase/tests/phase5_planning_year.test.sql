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
 ('principal2',public.phase3_grant_mandate('{"membershipId":"55370000-0000-4000-8000-000000000022","function":"rektor","scopeKind":"school","unitIds":["55370000-0000-4000-8000-000000000031"]}'));
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

-- Full matrix. Every row below belongs to this rollback-only customer.
select pg_temp.programplan_actor('55370000-0000-4000-8000-000000000060','55370000-0000-4000-8000-000000000020','55370000-0000-4000-8000-000000000010','55370000-0000-4000-8000-000000000080');
create function pg_temp.planning_q(patch jsonb default '{}'::jsonb) returns jsonb language sql as $$select
 '{"schoolYear":2027,"unitId":null,"view":"programplan","schoolform":"gymnasium","query":"","status":"all","cohortRelation":"all","archive":"all","grade":null,"sort":"name","direction":"asc","page":1,"selectionRevision":null}'::jsonb||patch$$;
create function pg_temp.planning_parity(label text,patch jsonb) returns text language plpgsql as $$
declare q jsonb:=pg_temp.planning_q(patch);begin return 'PLANNING_PARITY|'||jsonb_build_object('name',label,'setup',public.phase5_planning_year_selection(),
 'request',q,'list',public.phase5_planning_year_list(q),'overview',public.phase5_planning_year_overview(q))::text;end$$;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
select ('55370000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,'55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000030','gymnasium','Syntetisk ram '||n,'Ingen datumtolkning','SA25','SABEP' from generate_series(0,2) n;
insert into public.offering_units(offering_id,unit_id,organizer_id) values('55370000-0000-4000-8000-000000000100','55370000-0000-4000-8000-000000000031','55370000-0000-4000-8000-000000000002');
insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference)
select ('55370000-0000-4000-8000-'||lpad((200+n)::text,12,'0'))::uuid,'55370000-0000-4000-8000-000000000002',
 ('55370000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,1,array['ENGE3000X','ANIM1000X','ANIM2000X'],
 'sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace',jsonb_set(pg_temp.programplan_reference(),'{startedOn}',to_jsonb((2027+n-1)::text||'-08-17')) from generate_series(0,2) n;
set local session_replication_role=replica;
update public.point_plans p set revision=1,term_distribution=(select jsonb_agg(jsonb_build_object('rowKey',r->>'key','points',jsonb_build_array((r->>'points')::integer,0,0,0,0,0)) order by n)
 from jsonb_array_elements(public.phase5_programplan_term_rows(p.basis_reference)) with ordinality t(r,n)) where p.organizer_id='55370000-0000-4000-8000-000000000002';
set local session_replication_role=origin;
create temporary table planning_gym(name text,value jsonb);
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55370000-0000-4000-8000-000000000021','55370000-0000-4000-8000-000000000011','55370000-0000-4000-8000-000000000081');
insert into planning_gym values('first',public.phase5_create_gym_timplan('55370000-0000-4000-8000-000000000300','55370000-0000-4000-8000-000000000200',1,(select lifecycle_revision from public.offerings where id='55370000-0000-4000-8000-000000000100'),'55370000-0000-4000-8000-000000000030',null,null));
select pg_temp.programplan_actor((select id from programplan_roles where name='principal2'),'55370000-0000-4000-8000-000000000022','55370000-0000-4000-8000-000000000012','55370000-0000-4000-8000-000000000082');
insert into planning_gym values('second',public.phase5_create_gym_timplan('55370000-0000-4000-8000-000000000301','55370000-0000-4000-8000-000000000200',1,(select lifecycle_revision from public.offerings where id='55370000-0000-4000-8000-000000000100'),'55370000-0000-4000-8000-000000000031',null,null));
select pg_temp.programplan_actor('55370000-0000-4000-8000-000000000060','55370000-0000-4000-8000-000000000020','55370000-0000-4000-8000-000000000010','55370000-0000-4000-8000-000000000080');
-- Only owned synthetic cells bypass production mutation guards to model historic sources.
set local session_replication_role=replica;
update public.timplan_cells c set hours=array[case when g.name='first' then 10 else 20 end,0,0,0,0,0]::smallint[],allocated=array[true,false,false,false,false,false]
from planning_gym g where c.timplan_id=(g.value#>>'{reply,id}')::uuid;
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades) values
 ('55370000-0000-4000-8000-000000000400','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000030','grundskola','Syntetisk GR','Text',array[7,8,9]::smallint[]),
 ('55370000-0000-4000-8000-000000000401','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000030','introduktionsprogram','Syntetisk IM','Text',null);
insert into public.offering_units(offering_id,unit_id,organizer_id) select id,unit_id,organizer_id from public.offerings where id in ('55370000-0000-4000-8000-000000000400','55370000-0000-4000-8000-000000000401');
insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,basis,decided_on) values
 ('55370000-0000-4000-8000-000000000410','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000400','55370000-0000-4000-8000-000000000030',1,'faststalld','Äldre bunden','2026-09-01'),
 ('55370000-0000-4000-8000-000000000411','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000400','55370000-0000-4000-8000-000000000030',2,'utkast','Nyare obunden',null),
 ('55370000-0000-4000-8000-000000000412','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000401','55370000-0000-4000-8000-000000000030',1,'utkast','Veckoram',null);
insert into public.timplan_cells(timplan_id,row_id,hours) values('55370000-0000-4000-8000-000000000410','engelska',array[111,222,333]::smallint[]);
insert into public.timplan_cells(timplan_id,row_id,hours) select '55370000-0000-4000-8000-000000000412',k,array[case when k='im-mentor' then 0 else 2 end]::smallint[] from unnest(array['im-sv','im-ma','im-en','im-sh','im-idh','im-praktik','im-mentor']) k;
insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values
 ('55370000-0000-4000-8000-000000000030','A',2027,'55370000-0000-4000-8000-000000000410','ak8'),
 ('55370000-0000-4000-8000-000000000030','B',2027,'55370000-0000-4000-8000-000000000410','ak8'),
 ('55370000-0000-4000-8000-000000000030','A',2028,'55370000-0000-4000-8000-000000000410','ak9');
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values
 ('55370000-0000-4000-8000-000000000420','55370000-0000-4000-8000-000000000001','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000030','55370000-0000-4000-8000-000000000400','A',2025),
 ('55370000-0000-4000-8000-000000000421','55370000-0000-4000-8000-000000000001','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000030','55370000-0000-4000-8000-000000000400','B',2025);
set local session_replication_role=origin;
create temporary table planning_outputs(name text primary key,q jsonb,list jsonb,overview jsonb);
insert into planning_outputs select name,q,public.phase5_planning_year_list(q),public.phase5_planning_year_overview(q) from (values
 ('program',pg_temp.planning_q()),('gym',pg_temp.planning_q('{"view":"timplan","schoolYear":2026}')),
 ('gr8',pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola"}')),
 ('gr9',pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola","schoolYear":2028}')),
 ('im',pg_temp.planning_q('{"view":"timplan","schoolform":"introduktionsprogram"}')),
 ('empty',pg_temp.planning_q('{"query":"Helt saknad"}'))) t(name,q);
select 'PLANNING_PARITY|'||jsonb_build_object('name',name,'setup',public.phase5_planning_year_selection(),'request',q,'list',list,'overview',overview)::text from planning_outputs;
select is((select list->>'count' from planning_outputs where name='program'),'4','shared program produces two scoped school rows');
select is((select overview#>>'{totals,points,known}' from planning_outputs where name='gym'),'2500','shared points counted once');
select is((select (overview#>>'{totals,annualHours,known}')::integer from planning_outputs where name='gym'),
 (select count(*)::integer*30 from jsonb_array_elements(public.phase5_gym_timplan_source('55370000-0000-4000-8000-000000000200')->'rows') row where (row->>'points')::integer>0),'two school frames independently contribute 10 plus 20 hours per active canonical row');
select is((select list#>>'{rows,0,plan,id}' from planning_outputs where name='gr8'),'55370000-0000-4000-8000-000000000410','old bound plan overrides newer draft');
select is((select list#>>'{rows,0,application,columnId}' from planning_outputs where name='gr8'),'ak8','actual eighth-grade binding');
select is((select list#>>'{rows,0,application,columnId}' from planning_outputs where name='gr9'),'ak9','application year selects ninth grade');
select is((select jsonb_array_length(list#>'{rows,0,classes}') from planning_outputs where name='gr8'),2,'two actual classes retained separately');
select is((select overview#>>'{totals,annualHours,value}' from planning_outputs where name='gr8'),null,'unknown original map prevents guessed hours');
select is((select overview#>>'{totals,weeklyHours,value}' from planning_outputs where name='im'),'12','IM weekly frame includes activities and zero');
select is((select overview#>>'{totals,annualHours,value}' from planning_outputs where name='im'),'0','IM never converted to annual hours');
select is((select overview#>>'{totals,points}' from planning_outputs where name='im'),null,'IM never invents program points');
select is((select list->>'count' from planning_outputs where name='empty'),'0','no invented education');
select ok(exists(select 1 from jsonb_array_elements((select list->'rows' from planning_outputs where name='program')) r where r->>'relation'='new'),'new cohort');
select ok(exists(select 1 from jsonb_array_elements((select list->'rows' from planning_outputs where name='program')) r where r->>'relation'='continuing'),'continuing cohort');
select ok(exists(select 1 from jsonb_array_elements((select list->'rows' from planning_outputs where name='program')) r where r->>'relation'='future'),'future cohort');
select is((public.phase5_planning_year_list(pg_temp.planning_q('{"cohortRelation":"relevant"}'))->>'count')::integer,3,'relevant excludes future');
select is((public.phase5_planning_year_list(pg_temp.planning_q('{"schoolYear":2032,"cohortRelation":"finished"}'))->>'count')::integer,4,'finished cohorts explicit');
select is(public.phase5_planning_year_list(pg_temp.planning_q('{"view":"timplan","schoolYear":2027}'))#>>'{rows,0,start,startedOn}','2026-08-17','frozen date authoritative');
update public.offerings set start_year=2090,lifecycle_revision=lifecycle_revision+1 where id='55370000-0000-4000-8000-000000000100';
set local session_replication_role=replica;
update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}','"2028-08-17"'),revision=revision+1 where id='55370000-0000-4000-8000-000000000200';
set local session_replication_role=origin;
select is(public.phase5_planning_year_list(pg_temp.planning_q('{"view":"timplan","schoolYear":2027}'))#>>'{rows,0,start,startedOn}','2026-08-17','changed live education and newer source revision do not rewrite frozen start');
update public.offerings set grades=array[8,7,9]::smallint[] where id='55370000-0000-4000-8000-000000000400';
select is(public.phase5_planning_year_list(pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola"}'))#>>'{rows,0,columnMap,kind}','unknown','same-width reordered columns never authenticate map');
select pg_temp.planning_parity('gr-reordered','{"view":"timplan","schoolform":"grundskola"}');
-- Missing expected rows remain null in the full inventory, never disappear from a complete sum.
delete from public.timplan_cells where timplan_id='55370000-0000-4000-8000-000000000412' and row_id='im-ma';
select is(public.phase5_planning_year_overview(pg_temp.planning_q('{"view":"timplan","schoolform":"introduktionsprogram"}'))#>>'{totals,weeklyHours,value}',null,'missing weekly row makes sum incomplete');
select pg_temp.planning_parity('im-missing','{"view":"timplan","schoolform":"introduktionsprogram"}');
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values
 ('55370000-0000-4000-8000-000000000422','55370000-0000-4000-8000-000000000001','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000030','55370000-0000-4000-8000-000000000400','A',2024);
select ok(public.phase5_planning_year_list(pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola"}'))#>'{rows,0,diagnostics}' ? 'ambiguous-class','ambiguous real class lookup diagnosed');
select is(public.phase5_planning_year_overview(pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola"}'))#>>'{totals,classCount,value}',null,'ambiguous class count not complete');
select pg_temp.planning_parity('gr-ambiguous','{"view":"timplan","schoolform":"grundskola"}');
-- 55 equal names force stable whole-result sorting across the fixed page boundary.
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
select ('55370000-0000-4000-8000-'||lpad((500+n)::text,12,'0'))::uuid,'55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000030','gymnasium','Lika namn','Saknat underlag','SA25','SABEP' from generate_series(1,55) n;
create temporary table planning_page as select public.phase5_planning_year_list(pg_temp.planning_q('{"query":"Lika namn"}')) value;
select is((select value->>'count' from planning_page),'55','count over complete result');
select is((select jsonb_array_length(value->'rows') from planning_page),50,'fixed page size');
select is(jsonb_array_length(public.phase5_planning_year_list(pg_temp.planning_q(jsonb_build_object('query','Lika namn','page',2,'selectionRevision',(select value->>'selectionRevision' from planning_page))))->'rows'),5,'second page five rows');
select is((select value#>>'{rows,49,offeringId}' from planning_page),'55370000-0000-4000-8000-000000000550','stable UUID tie break');
select is(public.phase5_planning_year_list(pg_temp.planning_q(jsonb_build_object('query','Lika namn','page',2,'selectionRevision',(select value->>'selectionRevision' from planning_page))))#>>'{rows,0,offeringId}','55370000-0000-4000-8000-000000000551','no duplicated boundary row');
update public.offerings set name='Ändrad rad' where id='55370000-0000-4000-8000-000000000551';
select throws_ok($q$select public.phase5_planning_year_list(pg_temp.planning_q(jsonb_build_object('query','Lika namn','page',2,'selectionRevision',(select value->>'selectionRevision' from planning_page))))$q$,'40001',null,'changed result refuses stale page');
select pg_temp.planning_parity('missing-plans','{"query":"Lika namn"}');



set local session_replication_role=replica;
update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}','"2027-01-15"'),revision=revision+1 where id='55370000-0000-4000-8000-000000000201';
set local session_replication_role=origin;
select is(public.phase5_planning_year_list(pg_temp.planning_q('{"query":"Syntetisk ram 1","schoolYear":2026}'))#>>'{rows,0,relativeYear}','1','January start projects previous academic year');
select ok(public.phase5_planning_year_list(pg_temp.planning_q('{"query":"Syntetisk ram 1","schoolYear":2026}'))#>'{rows,0,diagnostics}' ? 'allocation-before-start','positive term before actual January start requires review');
select pg_temp.planning_parity('january','{"query":"Syntetisk ram 1","schoolYear":2026}');
set local session_replication_role=replica;
update public.point_plans set term_distribution='[]',revision=revision+1 where id='55370000-0000-4000-8000-000000000202';
set local session_replication_role=origin;
select is(public.phase5_planning_year_overview(pg_temp.planning_q('{"query":"Syntetisk ram 2","schoolYear":2028}'))#>>'{totals,points,value}',null,'undistributed points remain unknown');
select pg_temp.planning_parity('unallocated-points','{"query":"Syntetisk ram 2","schoolYear":2028}');
create function pg_temp.planning_truncated_read() returns void language plpgsql security definer as $$begin
 set local session_replication_role=replica;
 update public.timplans set gym_basis=jsonb_set(gym_basis,'{rows}','[]') where organizer_id='55370000-0000-4000-8000-000000000002' and gym_basis is not null;
 set local session_replication_role=origin;
 perform public.phase5_planning_year_overview(pg_temp.planning_q('{"view":"timplan"}'));
end$$;
select throws_ok($q$select pg_temp.planning_truncated_read()$q$,'22023',null,'identical truncated sources on both schools refused by actual overview');

set local session_replication_role=replica;
insert into public.timplan_cells(timplan_id,row_id,hours) values('55370000-0000-4000-8000-000000000410','legacy-unknown',array[1,2,3]::smallint[]);
set local session_replication_role=origin;
select ok(public.phase5_planning_year_list(pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola"}'))#>'{rows,0,diagnostics}' ? 'unknown-row','unknown legacy GR row carries named gap');
select pg_temp.planning_parity('gr-unknown-row','{"view":"timplan","schoolform":"grundskola"}');

-- GY classes bind to the same frozen cohort frame; two classes never double its quantities.
set local session_replication_role=replica;
update public.timplans set status='faststalld',decided_on='2026-09-01' where id=(select (value#>>'{reply,id}')::uuid from planning_gym where name='first');
insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id)
select '55370000-0000-4000-8000-000000000030',name,2026,(select (value#>>'{reply,id}')::uuid from planning_gym where name='first'),'ar1' from unnest(array['GY-A','GY-B']) name;
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
select ('55370000-0000-4000-8000-'||lpad((700+n)::text,12,'0'))::uuid,'55370000-0000-4000-8000-000000000001','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000030','55370000-0000-4000-8000-000000000100',name,2026 from unnest(array['GY-A','GY-B']) with ordinality t(name,n);
set local session_replication_role=origin;
select is(public.phase5_planning_year_overview(pg_temp.planning_q('{"view":"timplan","schoolYear":2026,"query":"Syntetisk ram 0"}'))#>>'{totals,points,value}','2500','two classes and schools still one point frame');
select is(public.phase5_planning_year_overview(pg_temp.planning_q('{"view":"timplan","schoolYear":2026,"query":"Syntetisk ram 0"}'))#>>'{totals,classCount,value}','2','GY classes counted independently');
select is(public.phase5_planning_year_list(pg_temp.planning_q('{"view":"timplan","schoolYear":2026,"unitId":"55370000-0000-4000-8000-000000000030","query":"Syntetisk ram 0"}'))#>>'{rows,0,underlag}','class-bound','real GY annual binding retained');
select pg_temp.planning_parity('gym-bound','{"view":"timplan","schoolYear":2026,"query":"Syntetisk ram 0"}');
create function pg_temp.planning_wrong_gym_binding() returns void language plpgsql security definer as $$begin
 set local session_replication_role=replica;
 update public.class_timplans set column_id='ar3' where unit_id='55370000-0000-4000-8000-000000000030' and class_name='GY-A';
 set local session_replication_role=origin;
 perform public.phase5_planning_year_overview(pg_temp.planning_q('{"view":"timplan","schoolYear":2026}'));
end$$;
select throws_ok($q$select pg_temp.planning_wrong_gym_binding()$q$,'40001',null,'bound GY column conflicting with frozen cohort denied');
create function pg_temp.planning_foreign_customer() returns void language plpgsql as $$begin
 perform set_config('app.customer_id','55370000-0000-4000-8000-000000009999',true);perform public.phase5_planning_year_selection();end$$;
select throws_ok($q$select pg_temp.planning_foreign_customer()$q$,'42501',null,'forged customer context rejected by real session');
select is((public.phase5_planning_year_list(pg_temp.planning_q('{"schoolYear":2100,"query":"Lika namn"}'))->>'count')::integer,54,'future planning year works without calendar rows');
create function pg_temp.planning_row_overflow() returns void language plpgsql security definer as $$begin
 set local session_replication_role=replica;
 insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id)
 select '55370000-0000-4000-8000-000000000030','LIMIT-'||n,2027,'55370000-0000-4000-8000-000000000410','ak8' from generate_series(1,1001) n;
 insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
 select ('55370000-0000-4000-8000-'||lpad((3000+n)::text,12,'0'))::uuid,'55370000-0000-4000-8000-000000000001','55370000-0000-4000-8000-000000000002','55370000-0000-4000-8000-000000000030','55370000-0000-4000-8000-000000000400','LIMIT-'||n,2027 from generate_series(1,1001) n;
 set local session_replication_role=origin;
 perform public.phase5_planning_year_list(pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola"}'));
end$$;
select throws_ok($q$select pg_temp.planning_row_overflow()$q$,'54000',null,'1001 class references in a single row denied before response');
select throws_ok(format('select public.phase5_planning_year_list(pg_temp.planning_q(%L::jsonb))',jsonb_build_object('query',chr(160)||'X')::text),'22023',null,'Unicode boundary space matches client trim rejection');
set local session_replication_role=replica;
update public.timplan_cells set hours=array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[] where timplan_id='55370000-0000-4000-8000-000000000410' and row_id='engelska';
update public.timplan_cells set hours=array[2,3]::smallint[] where timplan_id='55370000-0000-4000-8000-000000000412' and row_id='im-en';
set local session_replication_role=origin;
select is((select cell->>'hourValues' from jsonb_array_elements(public.phase5_planning_year_list(pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola"}'))#>'{rows,0,cells}') cell where cell->>'rowKey'='engelska'),null,'invalid legacy GR width projected unknown');
select pg_temp.planning_parity('gr-legacy-width','{"view":"timplan","schoolform":"grundskola"}');
select is((select cardinality(hours) from public.timplan_cells where timplan_id='55370000-0000-4000-8000-000000000412' and row_id='im-en'),2,'invalid legacy IM raw width remains preserved');
select pg_temp.planning_parity('im-legacy-width','{"view":"timplan","schoolform":"introduktionsprogram"}');
set local session_replication_role=replica;
update public.timplan_cells set hours=array[[1,2,3],[4,5,6]]::smallint[] where timplan_id='55370000-0000-4000-8000-000000000410' and row_id='engelska';
set local session_replication_role=origin;
select is((select cell->>'hourValues' from jsonb_array_elements(public.phase5_planning_year_list(pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola"}'))#>'{rows,0,cells}') cell where cell->>'rowKey'='engelska'),null,'nested legacy GR array never creates annual positions');
select pg_temp.planning_parity('gr-legacy-nested','{"view":"timplan","schoolform":"grundskola"}');
create function pg_temp.planning_far_start() returns void language plpgsql security definer as $$begin
 set local session_replication_role=replica;
 update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}','"9999-08-17"') where id='55370000-0000-4000-8000-000000000202';
 set local session_replication_role=origin;
 perform public.phase5_planning_year_list(pg_temp.planning_q('{"query":"Syntetisk ram 2"}'));
end$$;
select throws_ok($q$select pg_temp.planning_far_start()$q$,'22023',null,'source academic year outside model calendar range denied');
create function pg_temp.planning_conflicting_source() returns void language plpgsql security definer as $$begin
 set local session_replication_role=replica;
 update public.timplans set gym_basis=jsonb_set(gym_basis,'{revision}','999') where id=(select (value#>>'{reply,id}')::uuid from planning_gym where name='second');
 set local session_replication_role=origin;
 perform public.phase5_planning_year_overview(pg_temp.planning_q('{"view":"timplan","schoolYear":2026,"query":"Syntetisk ram 0"}'));
end$$;
select throws_ok($q$select pg_temp.planning_conflicting_source()$q$,'40001',null,'two schools cannot aggregate contradictory shared source revisions');
select throws_ok($q$select public.phase5_planning_year_gym_cells(
 jsonb_set(public.phase5_gym_timplan_source('55370000-0000-4000-8000-000000000200'),'{rows}',
  (public.phase5_gym_timplan_source('55370000-0000-4000-8000-000000000200')->'rows')||jsonb_build_array(public.phase5_gym_timplan_source('55370000-0000-4000-8000-000000000200')#>'{rows,0}')),null)$q$,
 '22023',null,'overlapping forged row inventory cannot double count alternatives or fixed levels');
-- Negative selection inputs fail before any collection result/audit.
select throws_ok(format('select public.phase5_planning_year_list(pg_temp.planning_q(%L::jsonb))',patch::text),'22023',null,label)
from (values
 ('{"schoolYear":1999}'::jsonb,'year below bound'),('{"schoolYear":2101}','year above bound'),('{"schoolYear":2026.5}','fractional year'),
 ('{"status":null}','null status denied'),('{"schoolform":null}','null schoolform denied'),('{"view":"pupils"}','unknown view denied'),
 ('{"query":" leading"}','untrimmed search denied'),('{"query":"a\ncontrol"}','control search denied'),('{"sort":"name;drop table"}','free SQL sort denied'),
 ('{"page":2}','next page without revision denied'),('{"page":0}','zero page denied'),('{"selectionRevision":"forged"}','malformed revision denied'),
 ('{"grade":4}','gym fourth year denied'),('{"view":"timplan","schoolform":"introduktionsprogram","grade":1}','IM grade inference denied'),
 ('{"view":"timplan","schoolform":"grundskola","sort":"points"}','GR points inference denied'),('{"unrelated":true}','extra request field denied')) t(patch,label);
select throws_ok($q$select public.phase5_planning_year_overview(pg_temp.planning_q('{"page":2,"selectionRevision":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'))$q$,'22023',null,'overview page two denied');
select throws_ok($q$select public.phase5_planning_year_list(pg_temp.planning_q('{"unitId":"55370000-0000-4000-8000-000000009999"}'))$q$,'42501',null,'foreign school denied');
select throws_ok($q$select public.phase5_planning_year_gym_cells(jsonb_set(public.phase5_gym_timplan_source('55370000-0000-4000-8000-000000000200'),'{rows}','[]'),null)$q$,'22023',null,'identical truncated frozen inventory denied against catalog');
select throws_ok($q$select public.phase5_planning_year_gym_cells(jsonb_set(public.phase5_gym_timplan_source('55370000-0000-4000-8000-000000000200'),'{catalogId}','"sha256:forged"'),null)$q$,'22023',null,'contradicting catalog identity denied');
-- Genuine DB audit failure: a trigger rejects the required event inside the same statement.
create function pg_temp.planning_audit_failure() returns trigger language plpgsql as $$begin
 if new.customer_id='55370000-0000-4000-8000-000000000001' and new.action like 'planning_year_%' then raise exception 'Synthetic audit rejection';end if;return new;end$$;
create trigger p5_planning_synthetic_audit_failure before insert on public.security_events for each row execute function pg_temp.planning_audit_failure();
create temporary table planning_audit_before as select count(*)::integer n from public.security_events where customer_id='55370000-0000-4000-8000-000000000001' and action like 'planning_year_%';
select throws_ok($q$select public.phase5_planning_year_selection()$q$,'55000',null,'setup audit failure blocks result');
select throws_ok($q$select public.phase5_planning_year_list(pg_temp.planning_q())$q$,'55000',null,'list audit failure blocks result');
select throws_ok($q$select public.phase5_planning_year_overview(pg_temp.planning_q())$q$,'55000',null,'overview audit failure blocks result');
select is((select count(*)::integer from public.security_events where customer_id='55370000-0000-4000-8000-000000000001' and action like 'planning_year_%'),(select n from planning_audit_before),'no successful audit escapes failed commands');
drop trigger p5_planning_synthetic_audit_failure on public.security_events;
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55370000-0000-4000-8000-000000000021','55370000-0000-4000-8000-000000000011','55370000-0000-4000-8000-000000000081');
select throws_ok($q$select public.phase5_planning_year_list(pg_temp.planning_q('{"unitId":"55370000-0000-4000-8000-000000000031"}'))$q$,'42501',null,'principal cannot search/count another school');
select is((public.phase5_planning_year_list(pg_temp.planning_q('{"query":"Syntetisk ram"}'))->>'count')::integer,3,'mandate filtering precedes total count');
select pg_temp.programplan_actor((select id from programplan_roles where name='admin'),'55370000-0000-4000-8000-000000000023','55370000-0000-4000-8000-000000000013','55370000-0000-4000-8000-000000000083');
select throws_ok($q$select public.phase5_planning_year_list(pg_temp.planning_q('{"view":"timplan","schoolform":"grundskola"}'))$q$,'42501',null,'GY admin cannot read GR');
select throws_ok($q$select public.phase5_planning_year_overview(pg_temp.planning_q('{"view":"timplan","schoolform":"introduktionsprogram"}'))$q$,'42501',null,'GY admin cannot aggregate IM');
update public.app_sessions set expires_at=clock_timestamp()-interval '1 second' where id='55370000-0000-4000-8000-000000000083';
select throws_ok($q$select public.phase5_planning_year_selection()$q$,'42501',null,'expired actual session denied');
select pg_temp.programplan_actor((select id from programplan_roles where name='principal'),'55370000-0000-4000-8000-000000000021','55370000-0000-4000-8000-000000000011','55370000-0000-4000-8000-000000000081');
update public.access_assignments set ended_at=clock_timestamp() where id='55370000-0000-4000-8000-000000000060';
select throws_ok($q$select public.phase5_planning_year_list(pg_temp.planning_q())$q$,'42501',null,'revoked parent issuing mandate denies future-year read');
select ok(not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.pronamespace='public'::regnamespace and p.proname like 'phase5_planning_year_%' and a.privilege_type='EXECUTE'
 and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='service_role'),(select oid from pg_roles where rolname='skolplattform_worker'))),'every new helper and RPC closed to all five roles');
select * from finish();
rollback;
