-- Closed, immutable offline catalog. No caller/Worker privileges are opened.
create table public.programplan_catalogs (
 catalog_id text primary key,
 payload jsonb not null
);
alter table public.programplan_catalogs enable row level security;
alter table public.programplan_catalogs force row level security;
revoke all on public.programplan_catalogs from public,anon,authenticated,skolplattform_worker;

create function public.phase5_programplan_shape(v jsonb, keys text[]) returns boolean
language sql immutable security invoker set search_path=pg_catalog,public as $$
 select coalesce(jsonb_typeof(v)='object' and (select array_agg(k order by k collate "C") from jsonb_object_keys(case when jsonb_typeof(v)='object' then v else '{}'::jsonb end) k)
  = (select array_agg(k order by k collate "C") from unnest(keys) k),false)
$$;
create function public.phase5_programplan_text(v jsonb, maximum integer default 1000) returns boolean
language sql immutable security invoker set search_path=pg_catalog,public as $$
 select coalesce(jsonb_typeof(v)='string' and length(v#>>'{}')>0 and
  (select coalesce(sum(case when octet_length(c)=4 then 2 else 1 end),0) from regexp_split_to_table(v#>>'{}','') c)<=maximum,false)
$$;
create function public.phase5_programplan_code(v jsonb) returns boolean
language sql immutable security invoker set search_path=pg_catalog,public as $$
 select public.phase5_programplan_text(v,96) and (v#>>'{}') ~ '^[[:alpha:]][[:alnum:]_-]*$'
  and (v#>>'{}') not in ('constructor','prototype','__proto__')
$$;
create function public.phase5_programplan_integer(v jsonb, minimum integer, maximum integer) returns boolean
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare n numeric;
begin
 if v is null or jsonb_typeof(v)<>'number' then return false; end if;
 n:=(v#>>'{}')::numeric; return n=trunc(n) and n between minimum and maximum;
end $$;
create function public.phase5_programplan_array(v jsonb, maximum integer) returns boolean
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
begin
 if v is null or jsonb_typeof(v)<>'array' then return false; end if;
 return jsonb_array_length(v)<=maximum;
end $$;
-- Validate calendar dates without DateStyle, clock, or date coercion/fallback.
create function public.phase5_programplan_date(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare t text; y integer; m integer; d integer; days integer;
begin
 if jsonb_typeof(v) is distinct from 'string' then return false; end if;
 t:=v#>>'{}'; if t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
 y:=substring(t,1,4)::integer; m:=substring(t,6,2)::integer; d:=substring(t,9,2)::integer;
 if m not between 1 and 12 then return false; end if;
 days:=case when m=2 then case when y%400=0 or (y%4=0 and y%100<>0) then 29 else 28 end when m in (4,6,9,11) then 30 else 31 end;
 return d between 1 and days;
end $$;
create function public.phase5_programplan_dates(v jsonb) returns boolean
language sql immutable security invoker set search_path=pg_catalog,public as $$
 select coalesce((v->'startDate'='null'::jsonb or public.phase5_programplan_date(v->'startDate'))
  and (v->'endDate'='null'::jsonb or public.phase5_programplan_date(v->'endDate'))
  and (v->'canceledDate'='null'::jsonb or public.phase5_programplan_date(v->'canceledDate'))
  and (v->'skolfs'='null'::jsonb or public.phase5_programplan_text(v->'skolfs',100))
  and (v->'startDate'='null'::jsonb or v->'endDate'='null'::jsonb or (v->>'endDate') collate "C">=(v->>'startDate') collate "C"),false)
$$;
create function public.phase5_programplan_item(v jsonb) returns boolean
language sql immutable security invoker set search_path=pg_catalog,public as $$
 select public.phase5_programplan_shape(v,array['code','name','points']) and public.phase5_programplan_code(v->'code')
 and public.phase5_programplan_text(v->'name') and public.phase5_programplan_integer(v->'points',0,10000)
$$;
-- Compact recursive JSON serialization. Object keys are ASCII and use C ordering;
-- array order and string escaping are retained, numeric scale is normalized.
create function public.phase5_programplan_canonical(v jsonb) returns text
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare result text;
begin
 case jsonb_typeof(v)
 when 'object' then
  select '{'||coalesce(string_agg(to_json(k)::text||':'||public.phase5_programplan_canonical(x),',' order by k collate "C"),'')||'}' into result from jsonb_each(v) e(k,x);
 when 'array' then
  select '['||coalesce(string_agg(public.phase5_programplan_canonical(x),',' order by n),'')||']' into result from jsonb_array_elements(v) with ordinality e(x,n);
 when 'number' then
  if (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) or abs((v#>>'{}')::numeric)>9007199254740991 then raise exception 'Invalid canonical number' using errcode='22023'; end if;
  result:=((v#>>'{}')::numeric)::bigint::text;
 when 'string' then result:=to_json(v#>>'{}')::text;
 when 'boolean' then result:=v::text;
 when 'null' then result:='null';
 else raise exception 'Invalid canonical JSON' using errcode='22023';
 end case;
 return result;
end $$;

create function public.phase5_programplan_block_valid(block jsonb, subjects jsonb) returns boolean
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare b jsonb; s jsonb; l jsonb; found_item jsonb; seen text[]:='{}'; levels_seen text[];
begin
 if not public.phase5_programplan_array(block,1000) then return false; end if;
 for b in select value from jsonb_array_elements(block) loop
  if not public.phase5_programplan_shape(b,array['code','name','points','optional','subjectVersion','levels']) or not public.phase5_programplan_code(b->'code')
   or not public.phase5_programplan_text(b->'name') or not public.phase5_programplan_integer(b->'points',0,10000)
   or jsonb_typeof(b->'optional') is distinct from 'boolean' or not public.phase5_programplan_array(b->'levels',1000) or b->>'code'=any(seen) then return false; end if;
  seen:=array_append(seen,b->>'code');
  select value into s from jsonb_array_elements(subjects) where value->>'code'=b->>'code';
  if b->'subjectVersion' is distinct from coalesce(s->'version','null'::jsonb) then return false; end if;
  if jsonb_array_length(b->'levels')>0 and s is null then return false; end if;
  levels_seen:='{}';
  for l in select value from jsonb_array_elements(b->'levels') loop
   if not public.phase5_programplan_item(l) or l->>'code'=any(levels_seen) then return false; end if;
   levels_seen:=array_append(levels_seen,l->>'code');
   select value into found_item from jsonb_array_elements(s->'items') where value->>'code'=l->>'code';
   if found_item is null or found_item->'points' is distinct from l->'points' then return false; end if;
  end loop;
 end loop;
 return true;
end $$;
create function public.phase5_programplan_url(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare authority text; host text; port text; address inet;
begin
 if not public.phase5_programplan_text(v,2000) or (v#>>'{}') !~ '^https?://' or (v#>>'{}') ~ '[[:space:]]' then return false; end if;
 authority:=substring(v#>>'{}' from '^https?://([^/?#]+)');
 if authority is null or authority ~ '@' then return false; end if;
 if left(authority,1)='[' then
  if authority !~ '^\[[0-9A-Fa-f:]+\](:[0-9]+)?$' then return false; end if;
  host:=substring(authority from '^\[([^]]+)\]');
  begin address:=host::inet; exception when invalid_text_representation then return false; end;
  if family(address)<>6 then return false; end if;
  port:=substring(authority from '\]:([0-9]+)$');
 else
  if authority !~ '^[[:alnum:]._-]+(:[0-9]+)?$' then return false; end if;
  port:=substring(authority from ':([0-9]+)$');
 end if;
 if port is not null and (length(port)>5 or port::integer>65535) then return false; end if;
 return true;
end $$;
create function public.phase5_programplan_payload_valid(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare s jsonb; p jsonb; o jsonb; i jsonb; school jsonb; seen text[]:='{}'; item_seen text[]:='{}'; schools_seen text[]; orientation_seen text[]; prior text; current_code text; src jsonb;
begin
 if not public.phase5_programplan_shape(v,array['schemaVersion','source','subjects','programs']) or v->'schemaVersion' is distinct from '1'::jsonb
  or not public.phase5_programplan_array(v->'subjects',20000) or not public.phase5_programplan_array(v->'programs',1000) then return false; end if;
 src:=v->'source';
 if not public.phase5_programplan_shape(src,array['url','apiVersion','fetched']) or not public.phase5_programplan_url(src->'url')
  or not public.phase5_programplan_text(src->'apiVersion',100) or not public.phase5_programplan_date(src->'fetched') then return false; end if;
 prior:=null;
 for s in select value from jsonb_array_elements(v->'subjects') loop
  if not public.phase5_programplan_shape(s,array['code','name','typeOfSyllabus','schoolTypes','version','items','startDate','endDate','canceledDate','skolfs'])
   or not public.phase5_programplan_code(s->'code') or not public.phase5_programplan_text(s->'name') or not public.phase5_programplan_code(s->'typeOfSyllabus')
   or not public.phase5_programplan_integer(s->'version',1,100000) or not public.phase5_programplan_dates(s)
   or not public.phase5_programplan_array(s->'schoolTypes',20) or jsonb_array_length(s->'schoolTypes')=0
   or not public.phase5_programplan_array(s->'items',1000) then return false; end if;
  current_code:=s->>'code'; if current_code=any(seen) or (prior is not null and current_code collate "C"<=prior collate "C") then return false; end if;
  prior:=current_code; seen:=array_append(seen,current_code); schools_seen:='{}';
  for school in select value from jsonb_array_elements(s->'schoolTypes') loop
   if not public.phase5_programplan_code(school) or school#>>'{}'=any(schools_seen) then return false; end if;
   if cardinality(schools_seen)>0 and (school#>>'{}') collate "C"<=schools_seen[cardinality(schools_seen)] collate "C" then return false; end if;
   schools_seen:=array_append(schools_seen,school#>>'{}');
  end loop;
  for i in select value from jsonb_array_elements(s->'items') loop
   if not public.phase5_programplan_item(i) or i->>'code'=any(item_seen) then return false; end if;
   item_seen:=array_append(item_seen,i->>'code');
  end loop;
 end loop;
 seen:='{}'; prior:=null;
 for p in select value from jsonb_array_elements(v->'programs') loop
  if not public.phase5_programplan_shape(p,array['code','name','category','version','foundation','programmeSpecific','orientations','specialization','startDate','endDate','canceledDate','skolfs'])
   or not public.phase5_programplan_code(p->'code') or not public.phase5_programplan_text(p->'name') or not public.phase5_programplan_code(p->'category')
   or not public.phase5_programplan_integer(p->'version',1,100000) or not public.phase5_programplan_dates(p)
   or not public.phase5_programplan_block_valid(p->'foundation',v->'subjects') or not public.phase5_programplan_block_valid(p->'programmeSpecific',v->'subjects')
   or not public.phase5_programplan_block_valid(p->'specialization',v->'subjects') or not public.phase5_programplan_array(p->'orientations',100) then return false; end if;
  current_code:=p->>'code'; if current_code=any(seen) or (prior is not null and current_code collate "C"<=prior collate "C") then return false; end if;
  prior:=current_code; seen:=array_append(seen,current_code); orientation_seen:='{}';
  for o in select value from jsonb_array_elements(p->'orientations') loop
   if not public.phase5_programplan_shape(o,array['code','name','points','subjects']) or not public.phase5_programplan_code(o->'code') or not public.phase5_programplan_text(o->'name')
    or not public.phase5_programplan_integer(o->'points',0,10000) or not public.phase5_programplan_block_valid(o->'subjects',v->'subjects') or o->>'code'=any(orientation_seen) then return false; end if;
   orientation_seen:=array_append(orientation_seen,o->>'code');
  end loop;
 end loop;
 return true;
end $$;
create function public.phase5_programplan_catalog_guard() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.catalog_id !~ '^sha256:[0-9a-f]{64}$' or not public.phase5_programplan_payload_valid(new.payload)
  or new.catalog_id is distinct from 'sha256:'||encode(extensions.digest(convert_to(public.phase5_programplan_canonical(new.payload),'UTF8'),'sha256'),'hex') then
  raise exception 'Invalid programplan catalog' using errcode='22023';
 end if;
 return new;
end $$;
create function public.phase5_programplan_catalog_immutable() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin raise exception 'Programplan catalog is immutable' using errcode='42501'; end $$;
create trigger programplan_catalogs_validate before insert on public.programplan_catalogs for each row execute function public.phase5_programplan_catalog_guard();
create trigger programplan_catalogs_immutable before update or delete on public.programplan_catalogs for each row execute function public.phase5_programplan_catalog_immutable();
create trigger programplan_catalogs_no_truncate before truncate on public.programplan_catalogs for each statement execute function public.phase5_programplan_catalog_immutable();

create function public.phase5_programplan_date_diagnostic(v jsonb, started_on text) returns text
language sql immutable security invoker set search_path=pg_catalog,public as $$
 select case when v->'startDate'='null'::jsonb then 'validity_metadata_missing'
 when started_on collate "C"<(v->>'startDate') collate "C" then 'historical_version_missing'
 when v->'endDate'<>'null'::jsonb and started_on collate "C">(v->>'endDate') collate "C" then 'version_not_applicable_at_start'
 when v->'canceledDate'<>'null'::jsonb and started_on collate "C">=(v->>'canceledDate') collate "C" then 'version_canceled_before_start' end
$$;
create function public.phase5_programplan_blocked(reason text, catalog_id text default null, program_ref jsonb default null) returns jsonb
language sql immutable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('status','blocked','catalogId',catalog_id,'programRef',program_ref,'diagnostics',jsonb_build_array(jsonb_build_object('code',reason)),'unresolvedChoices','[]'::jsonb,'decisionReady',false)
$$;
create function public.phase5_programplan_subject_diagnostics(s jsonb, started_on text, block_id text) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare result jsonb:='[]'; reason text; base jsonb:=jsonb_build_object('subjectCode',s->>'code','blockId',block_id);
begin
 if s->>'typeOfSyllabus'<>'GRADE_SUBJECT_SYLLABUS' then result:=result||jsonb_build_array(base||jsonb_build_object('code','unsupported_regime')); end if;
 if not (s->'schoolTypes' ? 'GY') then result:=result||jsonb_build_array(base||jsonb_build_object('code','unsupported_school_type')); end if;
 reason:=public.phase5_programplan_date_diagnostic(s,started_on);
 if reason is not null then result:=result||jsonb_build_array(base||jsonb_build_object('code',reason)); end if;
 return result;
end $$;
create function public.phase5_resolve_programplan_basis(reference jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare cat jsonb; cid text; pr jsonb; p jsonb; o jsonb; selected jsonb; s jsonb; i jsonb; block jsonb; b jsonb; l jsonb; block_id text;
 reason text; started text; diagnostics jsonb:='[]'; unresolved jsonb:='[]'; fixed text[]:='{}'; seen text[]:='{}'; options jsonb:='[]'; base jsonb;
begin
 if jsonb_typeof(reference) is distinct from 'object' or not reference ? 'catalogId' or not reference ? 'programRef' then return public.phase5_programplan_blocked('unpinned_basis'); end if;
 if not reference ? 'startedOn' or reference->'startedOn'='null'::jsonb or reference->>'startedOn'='' then return public.phase5_programplan_blocked('unknown_education_start'); end if;
 if not public.phase5_programplan_shape(reference,array['catalogId','programRef','orientationCode','startedOn','specializationRefs']) then return public.phase5_programplan_blocked('invalid_basis_reference'); end if;
 if jsonb_typeof(reference->'catalogId') is distinct from 'string' or reference->>'catalogId' !~ '^sha256:[0-9a-f]{64}$' then return public.phase5_programplan_blocked('invalid_catalog_id'); end if;
 cid:=reference->>'catalogId'; pr:=reference->'programRef';
 if not public.phase5_programplan_shape(pr,array['code','version']) or not public.phase5_programplan_code(pr->'code') or not public.phase5_programplan_integer(pr->'version',1,100000)
  or not (reference->'orientationCode'='null'::jsonb or public.phase5_programplan_code(reference->'orientationCode'))
  or not public.phase5_programplan_date(reference->'startedOn') or not public.phase5_programplan_array(reference->'specializationRefs',200) then return public.phase5_programplan_blocked('invalid_basis_reference',cid); end if;
 for selected in select value from jsonb_array_elements(reference->'specializationRefs') loop
  if not public.phase5_programplan_shape(selected,array['subjectCode','subjectVersion','itemCode','points']) or not public.phase5_programplan_code(selected->'subjectCode')
   or not public.phase5_programplan_code(selected->'itemCode') or not public.phase5_programplan_integer(selected->'subjectVersion',1,100000) or not public.phase5_programplan_integer(selected->'points',0,10000) then return public.phase5_programplan_blocked('invalid_basis_reference',cid); end if;
 end loop;
 select payload into cat from public.programplan_catalogs where catalog_id=cid;
 if not found then return public.phase5_programplan_blocked('catalog_unavailable',cid,pr); end if;
 select value into p from jsonb_array_elements(cat->'programs') where value->>'code'=pr->>'code';
 if p is null then return public.phase5_programplan_blocked('program_not_found',cid,pr); end if;
 if p->'version' is distinct from pr->'version' then return public.phase5_programplan_blocked('historical_version_missing',cid,pr); end if;
 started:=reference->>'startedOn'; reason:=public.phase5_programplan_date_diagnostic(p,started);
 if reason is not null then return public.phase5_programplan_blocked(reason,cid,pr); end if;
 if reference->'orientationCode'<>'null'::jsonb then
  select value into o from jsonb_array_elements(p->'orientations') where value->>'code'=reference->>'orientationCode';
  if o is null then return public.phase5_programplan_blocked('orientation_not_found',cid,pr); end if;
 elsif jsonb_array_length(p->'orientations')>0 then return public.phase5_programplan_blocked('orientation_required',cid,pr); end if;
 for block_id,block in select 'foundation',p->'foundation' union all select 'programmeSpecific',p->'programmeSpecific' union all select 'orientation',o->'subjects' where o is not null loop
  for b in select value from jsonb_array_elements(block) loop
   base:=jsonb_build_object('blockId',block_id,'subjectCode',b->>'code','points',b->'points');
   if (b->>'optional')::boolean then unresolved:=unresolved||jsonb_build_array(base||jsonb_build_object('kind','optional_subject')); end if;
   if jsonb_array_length(b->'levels')=0 then unresolved:=unresolved||jsonb_build_array(base||jsonb_build_object('kind','subject_levels_unresolved')); continue; end if;
   select value into s from jsonb_array_elements(cat->'subjects') where value->>'code'=b->>'code' and value->'version'=b->'subjectVersion';
   if s is null then diagnostics:=diagnostics||jsonb_build_array(jsonb_build_object('code','historical_version_missing','subjectCode',b->>'code','blockId',block_id)); continue; end if;
   diagnostics:=diagnostics||public.phase5_programplan_subject_diagnostics(s,started,block_id);
   for l in select value from jsonb_array_elements(b->'levels') loop fixed:=array_append(fixed,l->>'code'); end loop;
  end loop;
 end loop;
 for b in select value from jsonb_array_elements(p->'specialization') loop
  if jsonb_array_length(b->'levels')=0 then unresolved:=unresolved||jsonb_build_array(jsonb_build_object('kind','subject_levels_unresolved','blockId','specialization','subjectCode',b->>'code','points',b->'points')); continue; end if;
  select value into s from jsonb_array_elements(cat->'subjects') where value->>'code'=b->>'code' and value->'version'=b->'subjectVersion';
  if s is null then diagnostics:=diagnostics||jsonb_build_array(jsonb_build_object('code','historical_version_missing','subjectCode',b->>'code','blockId','specialization')); continue; end if;
  for l in select value from jsonb_array_elements(b->'levels') loop
   if not l->>'code'=any(fixed) then options:=options||jsonb_build_array(jsonb_build_object('subjectCode',s->>'code','subjectVersion',s->'version','itemCode',l->>'code','points',l->'points')); end if;
  end loop;
 end loop;
 for selected in select value from jsonb_array_elements(reference->'specializationRefs') loop
  base:=jsonb_build_object('subjectCode',selected->>'subjectCode','itemCode',selected->>'itemCode');
  if selected->>'itemCode'=any(seen) then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','duplicate_selected_level')); continue; end if;
  seen:=array_append(seen,selected->>'itemCode');
  select value into s from jsonb_array_elements(cat->'subjects') where value->>'code'=selected->>'subjectCode';
  if s is null then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','subject_not_found')); continue; end if;
  if s->'version' is distinct from selected->'subjectVersion' then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','historical_version_missing')); continue; end if;
  diagnostics:=diagnostics||public.phase5_programplan_subject_diagnostics(s,started,'specialization');
  select value into i from jsonb_array_elements(s->'items') where value->>'code'=selected->>'itemCode';
  if i is null then
   reason:=case when exists(select 1 from jsonb_array_elements(cat->'subjects') a, lateral jsonb_array_elements(a->'items') x where x->>'code'=selected->>'itemCode') then 'wrong_subject' else 'item_not_found' end;
   diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code',reason)); continue;
  end if;
  if i->'points' is distinct from selected->'points' then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','points_mismatch')); continue; end if;
  if i->>'code'=any(fixed) then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','fixed_level_duplicate')); continue; end if;
  if not options @> jsonb_build_array(selected) then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','not_specialization_option')); end if;
 end loop;
 unresolved:=unresolved||jsonb_build_array(jsonb_build_object('kind','program_rules_unverified','blockId','program','category',p->>'category'));
 return jsonb_build_object('status',case when jsonb_array_length(diagnostics)=0 then 'resolved' else 'blocked' end,'catalogId',cid,'programRef',pr,'diagnostics',diagnostics,'unresolvedChoices',unresolved,'decisionReady',false);
end $$;

revoke all on function public.phase5_programplan_shape(jsonb,text[]),public.phase5_programplan_text(jsonb,integer),public.phase5_programplan_code(jsonb),
 public.phase5_programplan_integer(jsonb,integer,integer),public.phase5_programplan_array(jsonb,integer),public.phase5_programplan_date(jsonb),public.phase5_programplan_dates(jsonb),
 public.phase5_programplan_item(jsonb),public.phase5_programplan_canonical(jsonb),public.phase5_programplan_block_valid(jsonb,jsonb),public.phase5_programplan_payload_valid(jsonb),
 public.phase5_programplan_url(jsonb),public.phase5_programplan_catalog_guard(),public.phase5_programplan_catalog_immutable(),public.phase5_programplan_date_diagnostic(jsonb,text),
 public.phase5_programplan_blocked(text,text,jsonb),public.phase5_programplan_subject_diagnostics(jsonb,text,text),public.phase5_resolve_programplan_basis(jsonb)
 from public,anon,authenticated,skolplattform_worker;
