-- 05-23 D: immutable, pinned subject packages. Current definitions/ACL inventoried before replacement.
-- Foundation is closed; exactly two Worker grants are made separately after preflight.
create table public.programplan_packages (
 id uuid primary key default gen_random_uuid(),
 package_id uuid not null,version integer not null check(version>0),
 organizer_id uuid not null references public.organizers(id),unit_id uuid,
 kind text not null check(kind in ('languageSubject','naturalScience','specialization','individualChoice')),
 name text not null check(length(btrim(name)) between 1 and 160),
 catalog_id text not null references public.programplan_catalogs(catalog_id),
 levels jsonb not null check(jsonb_typeof(levels)='array' and jsonb_array_length(levels) between 1 and 200),
 points integer not null check(points between 1 and 10000),
 created_at timestamptz not null default clock_timestamp(),
 created_by_assignment uuid not null references public.access_assignments(id),
 unique(package_id,version),
 foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id)
);
alter table public.programplan_packages enable row level security;
alter table public.programplan_packages force row level security;
revoke all on public.programplan_packages from public,anon,authenticated,service_role,skolplattform_worker;
create index programplan_packages_scope on public.programplan_packages(organizer_id,unit_id,package_id,version);

create function public.phase5_programplan_package_immutable() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$begin
 raise exception 'Programplan package is immutable' using errcode='55000';
end $$;
create trigger programplan_packages_immutable before update or delete on public.programplan_packages for each row execute function public.phase5_programplan_package_immutable();
create trigger programplan_packages_no_truncate before truncate on public.programplan_packages for each statement execute function public.phase5_programplan_package_immutable();

-- Creation has no plan/start-date context. The selected plan checks its actual start date later.
create function public.phase5_programplan_package_levels(catalog_id text,kind text,levels jsonb) returns integer
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare payload jsonb;l jsonb;s jsonb;i jsonb;k text;keys text[]:='{}';total integer:=0;
begin
 if kind is null or kind not in ('languageSubject','naturalScience','specialization','individualChoice')
  or not public.phase5_programplan_array(levels,200) then raise exception 'Invalid subject package' using errcode='22023';end if;
 if jsonb_array_length(levels)=0 then raise exception 'Invalid subject package' using errcode='22023';end if;
 select c.payload into payload from public.programplan_catalogs c where c.catalog_id=phase5_programplan_package_levels.catalog_id;
 if not found then raise exception 'Invalid package catalog' using errcode='22023';end if;
 for l in select value from jsonb_array_elements(levels) loop
  if not public.phase5_programplan_shape(l,array['subjectCode','subjectVersion','itemCode','points'])
   or not public.phase5_programplan_code(l->'subjectCode') or not public.phase5_programplan_code(l->'itemCode')
   or not public.phase5_programplan_integer(l->'subjectVersion',1,100000) or not public.phase5_programplan_integer(l->'points',1,10000)
   or l->>'subjectCode' in ('MODY','MODG','MODO','MODF','MODE')
   or (kind='languageSubject' and l->>'subjectCode' not in ('ENGE','KLAS','LATI'))
   or (kind='naturalScience' and l->>'subjectCode' not in ('BIOG','BIOE','FYSK','FYSF','KEMI')) then raise exception 'Invalid subject package level' using errcode='22023';end if;
  select value into s from jsonb_array_elements(payload->'subjects') where value->>'code'=l->>'subjectCode' and value->'version'=l->'subjectVersion';
  select value into i from jsonb_array_elements(coalesce(s->'items','[]'::jsonb)) where value->>'code'=l->>'itemCode';
  if s is null or i is null or i->'points' is distinct from l->'points' or not(s->'schoolTypes'?'GY') or s->>'typeOfSyllabus' is distinct from 'GRADE_SUBJECT_SYLLABUS' then raise exception 'Invalid subject package level' using errcode='22023';end if;
  k:=(l->>'subjectCode')||':'||(l->>'subjectVersion')||':'||(l->>'itemCode');
  if k=any(keys) then raise exception 'Duplicate subject package level' using errcode='22023';end if;
  keys:=array_append(keys,k);total:=total+(l->>'points')::integer;
 end loop;
 if total>10000 then raise exception 'Invalid subject package points' using errcode='22023';end if;
 return total;
end $$;

create function public.phase5_programplan_package_result(p public.programplan_packages) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('packageId',p.package_id,'version',p.version,'unitId',p.unit_id,'kind',p.kind,'name',p.name,'catalogId',p.catalog_id,'levels',p.levels,'points',p.points)
$$;

create function public.phase5_programplan_package_audit(operation text,object_id uuid,unit_id uuid,version integer default null,count integer default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if count is null or count<0 or count>1000000 or operation not in ('programplan_package_saved','programplan_packages_read')
  or (operation='programplan_package_saved' and (object_id is null or version is null or version<1))
  or (operation='programplan_packages_read' and (object_id is distinct from unit_id or unit_id is null or version is not null)) then raise exception 'Invalid package audit' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,case when operation='programplan_packages_read' then 'school_unit' else 'programplan_package' end,object_id,'ok',
 case when version is null then jsonb_build_object('count',count) else jsonb_build_object('unitId',unit_id,'packageVersion',version,'count',count) end);
 exception when others then raise exception 'Package audit unavailable' using errcode='55000';end;
end $$;

create function public.phase5_save_programplan_package(package_id uuid,expected_version integer,details jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;latest public.programplan_packages;p public.programplan_packages;target_unit uuid;source_unit uuid;school_id uuid;pid uuid;
 cid text:='sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace';total integer;
begin
 a:=public.phase5_programplan_actor();
 if expected_version is null or expected_version<0 or expected_version>2147483646
  or (package_id is null and expected_version<>0) or (package_id is not null and expected_version=0)
  or not public.phase5_programplan_shape(details,array['unitId','kind','name','levels'])
  or jsonb_typeof(details->'unitId') not in ('null','string') or jsonb_typeof(details->'kind') is distinct from 'string'
  or not public.phase5_programplan_text(details->'name',160) or length(btrim(details->>'name',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))=0 or details->>'name' is distinct from btrim(details->>'name',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') or details->>'name' ~ ('['||chr(1)||'-'||chr(31)||chr(127)||'-'||chr(159)||']') then raise exception 'Invalid subject package' using errcode='22023';end if;
 if details->>'unitId' is not null then
  if details->>'unitId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Invalid package school' using errcode='22023';end if;
  target_unit:=(details->>'unitId')::uuid;
 end if;
 if target_unit is null and a.function<>'huvudman' then raise exception 'Package school denied' using errcode='42501';end if;
 if package_id is not null then
  select * into latest from public.programplan_packages x where x.package_id=phase5_save_programplan_package.package_id and x.organizer_id=a.organizer_id order by version desc limit 1;
  if not found then raise exception 'Package denied' using errcode='42501';end if;
  source_unit:=latest.unit_id;
  if source_unit is null and a.function<>'huvudman' then raise exception 'Package source denied' using errcode='42501';end if;
 end if;
 -- Scope both the source and destination before the package lock, in school-id order.
 for school_id in select distinct v from unnest(array[source_unit,target_unit]) v where v is not null order by v loop perform public.phase5_programplan_unit(school_id);end loop;
 pid:=coalesce(package_id,gen_random_uuid());perform pg_advisory_xact_lock(hashtextextended(pid::text,5231));
 if package_id is not null then
  select * into latest from public.programplan_packages x where x.package_id=phase5_save_programplan_package.package_id and x.organizer_id=a.organizer_id order by version desc limit 1 for share;
  if not found or latest.version<>expected_version then raise exception 'Package version conflict' using errcode='40001';end if;
  if latest.unit_id is distinct from source_unit then raise exception 'Package version conflict' using errcode='40001';end if;
 end if;
 total:=public.phase5_programplan_package_levels(cid,details->>'kind',details->'levels');
 insert into public.programplan_packages(package_id,version,organizer_id,unit_id,kind,name,catalog_id,levels,points,created_by_assignment)
 values(pid,expected_version+1,a.organizer_id,target_unit,details->>'kind',btrim(details->>'name',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'),cid,details->'levels',total,a.id) returning * into p;
 perform public.phase5_programplan_package_audit('programplan_package_saved',pid,target_unit,p.version,jsonb_array_length(p.levels));
 return public.phase5_programplan_package_result(p);
end $$;

-- Own-school lists expose all versions; another school's list exposes only exact versions
-- already selected in an education shared with an own mandated school.
create function public.phase5_list_programplan_packages(unit_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;own_school boolean;result jsonb;oid uuid;
begin
 a:=public.phase5_programplan_actor();
 if unit_id is null then raise exception 'Invalid package school' using errcode='22023';end if;
 if not exists(select 1 from public.school_units u join public.organizers g on g.id=u.organizer_id where u.id=phase5_list_programplan_packages.unit_id and u.organizer_id=a.organizer_id and g.customer_id=a.customer_id and exists(select 1 from public.school_unit_types t where t.unit_id=u.id and t.school_type='GY')) then raise exception 'Package school denied' using errcode='42501';end if;
 own_school:=exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=phase5_list_programplan_packages.unit_id);
 if own_school then perform public.phase5_programplan_unit(unit_id);
 else
  if not exists(select 1 from public.offering_units target join public.offerings o on o.id=target.offering_id and o.organizer_id=target.organizer_id where target.unit_id=phase5_list_programplan_packages.unit_id and target.organizer_id=a.organizer_id and o.kind='gymnasium' and exists(select 1 from public.offering_units own join public.mandate_units m on m.assignment_id=a.id and m.unit_id=own.unit_id where own.offering_id=o.id and own.organizer_id=a.organizer_id)) then raise exception 'Package school denied' using errcode='42501';end if;
  for oid in select distinct target.offering_id from public.offering_units target where target.unit_id=phase5_list_programplan_packages.unit_id and target.organizer_id=a.organizer_id and exists(select 1 from public.offering_units own join public.mandate_units m on m.assignment_id=a.id and m.unit_id=own.unit_id where own.offering_id=target.offering_id and own.organizer_id=a.organizer_id) order by target.offering_id loop perform public.phase5_programplan_scope(null,oid);end loop;
 end if;
 select jsonb_build_object('unitId',phase5_list_programplan_packages.unit_id,'packages',coalesce(jsonb_agg(public.phase5_programplan_package_result(p) order by p.package_id,p.version desc),'[]'::jsonb)) into result
 from public.programplan_packages p where p.organizer_id=a.organizer_id and (p.unit_id is null or p.unit_id=phase5_list_programplan_packages.unit_id)
 and (own_school or exists(select 1 from public.programplan_unit_packages up join public.point_plans pp on pp.id=up.plan_id and pp.organizer_id=a.organizer_id
 cross join lateral jsonb_array_elements(up.selections) sel cross join lateral jsonb_array_elements(sel->'entries') e
 where up.unit_id=phase5_list_programplan_packages.unit_id and up.organizer_id=a.organizer_id and e->'ref'->>'type'='package' and lower(e->'ref'->>'packageId')=p.package_id::text and e->'ref'->'version'=to_jsonb(p.version)
 and exists(select 1 from public.offering_units own join public.mandate_units m on m.assignment_id=a.id and m.unit_id=own.unit_id where own.offering_id=pp.offering_id and own.organizer_id=a.organizer_id)));
 perform public.phase5_programplan_package_audit('programplan_packages_read',unit_id,unit_id,null,jsonb_array_length(result->'packages'));return result;
end $$;

CREATE OR REPLACE FUNCTION public.phase5_programplan_validate_selection(reference jsonb, block_id text, entry jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare b jsonb; r jsonb; payload jsonb; l jsonb; subject jsonb; item jsonb; ladder jsonb; start_index integer;
 step jsonb; n integer; total integer:=0; key text; keys text[]:='{}'; d jsonb; v jsonb; allocated integer; resolution jsonb;original_ref jsonb;pkg public.programplan_packages;package_key text;
begin
 perform public.phase5_programplan_require_current_shape(reference);
 resolution:=public.phase5_resolve_programplan_basis(reference);
 if resolution->>'status' is distinct from 'resolved' then raise exception 'Invalid package selection' using errcode='22023';end if;
 select value into b from jsonb_array_elements(reference->'choiceBlocks') where value->>'id'=block_id;
 if b is null or not public.phase5_programplan_shape(entry,array['ref','distribution'])
  or not public.phase5_programplan_array(entry->'distribution',200) then raise exception 'Invalid package selection' using errcode='22023';end if;
 r:=entry->'ref';original_ref:=r;
 if r->>'type'='package' then
  if not public.phase5_programplan_shape(r,array['type','packageId','version']) or jsonb_typeof(r->'packageId') is distinct from 'string'
   or r->>'packageId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or not public.phase5_programplan_integer(r->'version',1,2147483647) then raise exception 'Invalid package reference' using errcode='22023';end if;
  select * into pkg from public.programplan_packages x where x.package_id=(r->>'packageId')::uuid and x.version=(r->>'version')::integer;
  if not found or pkg.catalog_id is distinct from reference->>'catalogId' or pkg.kind is distinct from b->>'kind' then raise exception 'Invalid block package kind or catalog' using errcode='22023';end if;
  perform public.phase5_programplan_package_levels(pkg.catalog_id,pkg.kind,pkg.levels);
  package_key:='package:'||pkg.package_id::text||'@'||pkg.version::text;
  r:=jsonb_build_object('levels',pkg.levels);
 else
 if not public.phase5_programplan_shape(r,array['type','languageCode','levels']) or r->>'type' is distinct from 'language'
  or jsonb_typeof(r->'languageCode') not in ('null','string') or not public.phase5_programplan_array(r->'levels',7)
  or jsonb_array_length(r->'levels')=0 then raise exception 'Invalid language package' using errcode='22023';end if;
 if r->>'languageCode' is not null and not exists(select 1 from jsonb_array_elements(public.phase5_programplan_languages()) lang where lang->>'code'=r->>'languageCode') then
  raise exception 'Invalid language code' using errcode='22023';end if;
 -- Exactly one contiguous ladder, preserving supplied level order.
 for ladder in select value from jsonb_array_elements(public.phase5_programplan_ladders()) loop
  select ordinality::integer into start_index from jsonb_array_elements(ladder->'steps') with ordinality e(value,ordinality)
   where value->>'subjectCode'=r->'levels'->0->>'subjectCode' and value->>'itemCode'=r->'levels'->0->>'itemCode';
  if start_index is not null then exit;end if;
 end loop;
 if start_index is null or start_index+jsonb_array_length(r->'levels')-1>jsonb_array_length(ladder->'steps')
  or ((ladder->>'languageRequired')::boolean and r->>'languageCode' is null)
  or (not (ladder->>'languageRequired')::boolean and r->>'languageCode' is not null)
  or (ladder->>'languageCode' is not null and ladder->>'languageCode' is distinct from r->>'languageCode') then
  raise exception 'Invalid language ladder' using errcode='22023';end if;
 end if;
 select c.payload into payload from public.programplan_catalogs c where c.catalog_id=reference->>'catalogId';
 n:=0;
 for l in select value from jsonb_array_elements(r->'levels') loop
  if package_key is null then step:=ladder->'steps'->(start_index+n-1);end if;n:=n+1;
  if not public.phase5_programplan_shape(l,array['subjectCode','subjectVersion','itemCode','points'])
   or not public.phase5_programplan_integer(l->'subjectVersion',1,100000)
   or (package_key is null and (l->>'subjectCode' is distinct from step->>'subjectCode' or l->>'itemCode' is distinct from step->>'itemCode')) then raise exception 'Invalid language level' using errcode='22023';end if;
  select value into subject from jsonb_array_elements(payload->'subjects') where value->>'code'=l->>'subjectCode' and value->'version'=l->'subjectVersion';
  select value into item from jsonb_array_elements(coalesce(subject->'items','[]'::jsonb)) where value->>'code'=l->>'itemCode';
  if subject is null or item is null or item->'points' is distinct from l->'points'
   or not (subject->'schoolTypes' ? 'GY') or subject->>'typeOfSyllabus' is distinct from 'GRADE_SUBJECT_SYLLABUS'
   or subject->>'startDate' is null or subject->>'startDate'>reference->>'startedOn'
   or (subject->>'endDate' is not null and subject->>'endDate'<reference->>'startedOn')
   or (subject->>'canceledDate' is not null and subject->>'canceledDate'<=reference->>'startedOn') then raise exception 'Invalid language level' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(public.phase5_programplan_term_rows(reference)) fixed
   where (fixed->>'key' not like 'block:%' and fixed->>'key' not like 'meta:%' and fixed->>'key' not like 'alternative:%'
    and substring(fixed->>'key' from position(':' in fixed->>'key')+1)=(l->>'subjectCode')||':'||(l->>'subjectVersion')||':'||(l->>'itemCode'))
    or (fixed->>'key' like 'alternative:%' and exists(select 1 from regexp_split_to_table(substring(fixed->>'key' from '^alternative:[^:]+:(.*)$'),'\+') alternative_key
     where alternative_key=(l->>'subjectCode')||':'||(l->>'subjectVersion')||':'||(l->>'itemCode')))) then
   raise exception 'Package level already fixed' using errcode='22023';end if;
  if package_key is null and b->>'kind'='naturalScience' then raise exception 'Invalid block package kind' using errcode='22023';end if;
  if b->>'kind'='specialization' and not exists(select 1 from jsonb_array_elements(payload->'programs') program cross join lateral jsonb_array_elements(program->'specialization') opt cross join lateral jsonb_array_elements(opt->'levels') level
   where program->>'code'=reference->'programRef'->>'code' and program->'version'=reference->'programRef'->'version'
   and opt->>'code'=l->>'subjectCode' and opt->'subjectVersion'=l->'subjectVersion' and level->>'code'=l->>'itemCode' and level->'points'=l->'points') then
   raise exception 'Invalid block package level' using errcode='22023';end if;
  key:=(l->>'subjectCode')||':'||(l->>'subjectVersion')||':'||(l->>'itemCode'); keys:=array_append(keys,key);total:=total+(l->>'points')::integer;
 end loop;
 if total is distinct from (b->>'points')::integer then raise exception 'Package points differ from block' using errcode='22023';end if;
 keys:='{}';
 for d in select value from jsonb_array_elements(entry->'distribution') loop
  if not public.phase5_programplan_shape(d,array['levelKey','points']) or jsonb_typeof(d->'levelKey') is distinct from 'string'
   or not public.phase5_programplan_array(d->'points',6) or jsonb_array_length(d->'points')<>6 then raise exception 'Invalid package distribution' using errcode='22023';end if;
  key:=d->>'levelKey';
  if key=any(keys) then raise exception 'Duplicate package distribution' using errcode='22023';end if;keys:=array_append(keys,key);
  select value into l from jsonb_array_elements(r->'levels') lev(value) where (value->>'subjectCode')||':'||(value->>'subjectVersion')||':'||(value->>'itemCode')=key;
  if l is null then raise exception 'Unknown package level row' using errcode='22023';end if;
  allocated:=0;
  for v in select value from jsonb_array_elements(d->'points') loop
   if not public.phase5_programplan_integer(v,0,10000) then raise exception 'Invalid package points' using errcode='22023';end if;allocated:=allocated+(v#>>'{}')::integer;
  end loop;
  if allocated>(l->>'points')::integer then raise exception 'Package allocation exceeds level' using errcode='22023';end if;
 end loop;
 return jsonb_build_object('key',coalesce(package_key,'language:'||coalesce(r->>'languageCode','-')||':'||(select string_agg(lvl->>'itemCode','+' order by ordinality) from jsonb_array_elements(r->'levels') with ordinality e(lvl,ordinality))),
 'ref',original_ref,'levels',r->'levels','points',total,'distribution',entry->'distribution');
end $function$
;

-- Exact-school guard is deliberately internal; no caller supplies authority by a GUC.
create function public.phase5_programplan_validate_scoped_selection(reference jsonb,block_id text,entry jsonb,unit_id uuid,organizer_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r jsonb;p public.programplan_packages;
begin
 r:=public.phase5_programplan_validate_selection(reference,block_id,entry);
 if entry->'ref'->>'type'='package' then
  select * into p from public.programplan_packages x where x.package_id=(entry->'ref'->>'packageId')::uuid and x.version=(entry->'ref'->>'version')::integer;
  if p.organizer_id is distinct from organizer_id or (p.unit_id is not null and p.unit_id is distinct from unit_id) then raise exception 'Package school denied' using errcode='42501';end if;
 end if;
 return r;
end $$;

CREATE OR REPLACE FUNCTION public.phase5_programplan_resolved_selections(plan_id uuid, unit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare p public.point_plans;up public.programplan_unit_packages;sel jsonb;e jsonb;entries jsonb;selections jsonb:='[]';
begin
 select * into p from public.point_plans where id=plan_id;
 if not found then raise exception 'Programplan denied' using errcode='42501';end if;
 select * into up from public.programplan_unit_packages x where x.plan_id=p.id and x.unit_id=phase5_programplan_resolved_selections.unit_id;
 for sel in select value from jsonb_array_elements(coalesce(up.selections,'[]'::jsonb)) loop
  entries:='[]';
  for e in select value from jsonb_array_elements(sel->'entries') loop entries:=entries||jsonb_build_array(public.phase5_programplan_validate_scoped_selection(p.basis_reference,sel->>'blockId',e,unit_id,p.organizer_id));end loop;
  selections:=selections||jsonb_build_array(jsonb_build_object('blockId',sel->'blockId','entries',entries));
 end loop;
 return jsonb_build_object('planId',p.id,'unitId',unit_id,'revision',coalesce(up.revision,0),'selections',selections);
end $function$
;

CREATE OR REPLACE FUNCTION public.phase5_write_programplan_unit_packages(plan_id uuid, unit_id uuid, expected_revision integer, block_id text, entries jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings;a public.access_assignments;p public.point_plans;up public.programplan_unit_packages;
 e jsonb;resolved jsonb;keys text[]:='{}';selection jsonb;current_revision integer;result jsonb;
begin
 o:=public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for share;
 a:=public.phase5_programplan_actor();
 if not exists(select 1 from public.offering_units ou join public.mandate_units m on m.assignment_id=a.id and m.unit_id=ou.unit_id where ou.offering_id=o.id and ou.organizer_id=a.organizer_id and ou.unit_id=phase5_write_programplan_unit_packages.unit_id) then
  raise exception 'Package school denied' using errcode='42501',hint='programplan_mandate';end if;
 if o.archived_at is not null then raise exception 'Programplan archived' using errcode='42501',hint='programplan_archived';end if;
 if expected_revision is null or expected_revision<0 or expected_revision>2147483646 or not public.phase5_programplan_array(entries,200) then raise exception 'Invalid package selection' using errcode='22023';end if;
 perform public.phase5_programplan_require_current_shape(p.basis_reference);
 if not exists(select 1 from jsonb_array_elements(p.basis_reference->'choiceBlocks') b where b->>'id'=block_id) then raise exception 'Unknown package block' using errcode='22023';end if;
 -- Customer/scope locks precede share(plan), then serialize absent as well as existing school rows.
 perform pg_advisory_xact_lock(hashtextextended(p.id::text||':'||unit_id::text,523));
 select * into up from public.programplan_unit_packages x where x.plan_id=p.id and x.unit_id=phase5_write_programplan_unit_packages.unit_id for update;
 current_revision:=coalesce(up.revision,0);
 if current_revision<>expected_revision then raise exception 'Package revision conflict' using errcode='40001';end if;
 for e in select value from jsonb_array_elements(entries) loop
  resolved:=public.phase5_programplan_validate_scoped_selection(p.basis_reference,block_id,e,unit_id,p.organizer_id);
  if resolved->>'key'=any(keys) then raise exception 'Duplicate package entry' using errcode='22023';end if;keys:=array_append(keys,resolved->>'key');
 end loop;
 select coalesce(jsonb_agg(s order by n),'[]'::jsonb) into selection from jsonb_array_elements(coalesce(up.selections,'[]'::jsonb)) with ordinality prior(s,n) where s->>'blockId'<>block_id;
 -- Preserve block order from the pinned plan; clearing retains the school revision receipt.
 if jsonb_array_length(entries)>0 then selection:=selection||jsonb_build_array(jsonb_build_object('blockId',block_id,'entries',entries));end if;
 select coalesce(jsonb_agg(s order by n),'[]'::jsonb) into selection from jsonb_array_elements(p.basis_reference->'choiceBlocks') with ordinality b(v,n) join jsonb_array_elements(selection) s on s->>'blockId'=v->>'id';
 insert into public.programplan_unit_packages(plan_id,offering_id,unit_id,organizer_id,revision,selections,updated_by_assignment)
 values(p.id,o.id,unit_id,o.organizer_id,current_revision+1,selection,a.id)
 on conflict on constraint programplan_unit_packages_pkey do update set revision=excluded.revision,selections=excluded.selections,updated_at=clock_timestamp(),updated_by_assignment=excluded.updated_by_assignment;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,a.function::text::public.app_role,'programplan_unit_packages_changed');
 result:=public.phase5_programplan_unit_package_result(p.id);perform public.phase5_programplan_unit_package_audit(p.id,'programplan_unit_packages_changed',unit_id,current_revision+1);return result;
end $function$
;

-- Existing signatures retain their inventoried ACL. New helpers and entrypoints are closed.
revoke execute on function public.phase5_programplan_package_immutable(),public.phase5_programplan_package_levels(text,text,jsonb),public.phase5_programplan_package_result(public.programplan_packages),public.phase5_programplan_package_audit(text,uuid,uuid,integer,integer),public.phase5_save_programplan_package(uuid,integer,jsonb),public.phase5_list_programplan_packages(uuid),public.phase5_programplan_validate_scoped_selection(jsonb,text,jsonb,uuid,uuid) from public,anon,authenticated,service_role,skolplattform_worker;
