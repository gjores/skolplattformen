-- Valbara block, skolans utbud och ärvda undervisningsgrupper. Separat från klassmedlemskap.
-- SS12000: avsedd Group/Undervisning + Activity-mappning; valflödet är lokalt, ingen export.
create table public.elective_school_state (
 unit_id uuid primary key, customer_id uuid not null, organizer_id uuid not null,
 revision integer not null default 1 check(revision>0), policy_revision integer not null default 1 check(policy_revision>0),
 guardian_confirmation boolean, unique(unit_id,customer_id,organizer_id),
 foreign key(organizer_id,customer_id) references public.organizers(id,customer_id),
 foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id)
);
create table public.elective_blocks (
 id uuid primary key,unit_id uuid not null,customer_id uuid not null,organizer_id uuid not null,
 school_year integer not null check(school_year between 2000 and 2100),kind text not null check(kind in ('modernLanguage','individualChoice','specialization','languageChoice','schoolChoice')),
 name text not null check(char_length(name) between 1 and 200),starts_on date not null,ends_on date not null,
 revision integer not null default 1 check(revision>0),offering_revision integer not null default 1 check(offering_revision>0),applied boolean not null default false,applied_revision integer,applied_snapshot jsonb,
 unique(id,unit_id),foreign key(unit_id,customer_id,organizer_id) references public.elective_school_state(unit_id,customer_id,organizer_id),
 check(starts_on=make_date(school_year,7,1) and ends_on=make_date(school_year+1,6,30))
);
create table public.elective_block_sources (
 block_id uuid not null references public.elective_blocks(id),source_key text not null,
 class_id uuid not null references public.school_classes(id),timplan_id uuid not null references public.timplans(id),
 source_ref jsonb not null check(jsonb_typeof(source_ref)='object'),active boolean not null default true,primary key(block_id,source_key),unique(block_id,source_key,class_id)
);
create table public.elective_options (
 id uuid primary key,block_id uuid not null references public.elective_blocks(id),name text not null check(char_length(name) between 1 and 200),
 subject_code text not null check(char_length(subject_code) between 1 and 80),level_code text not null check(char_length(level_code) between 1 and 80),
 language text check(language is null or char_length(language) between 1 and 80),points integer check(points between 1 and 2500),active boolean not null default true,unique(id,block_id)
);
create table public.teaching_groups (
 id uuid primary key,block_id uuid not null references public.elective_blocks(id),option_id uuid not null,name text not null check(char_length(name) between 1 and 200),
 starts_on date not null,ends_on date not null,estimated_pupils integer check(estimated_pupils between 0 and 10000),revision integer not null default 1 check(revision>0),active boolean not null default true,
 unique(id,block_id),foreign key(option_id,block_id) references public.elective_options(id,block_id),check(ends_on>=starts_on)
);
create table public.teaching_group_sources (
 group_id uuid not null,block_id uuid not null,source_key text not null,class_id uuid not null,
 primary key(group_id,source_key),unique(group_id,class_id),foreign key(group_id,block_id) references public.teaching_groups(id,block_id),
 foreign key(block_id,source_key,class_id) references public.elective_block_sources(block_id,source_key,class_id)
);
create table public.elective_commands (
 command_id uuid primary key,unit_id uuid not null references public.school_units(id),school_year integer not null,
 actor_identity_id uuid not null references public.identities(id),assignment_id uuid not null references public.access_assignments(id),
 action text not null,payload_hash text not null check(payload_hash~'^[0-9a-f]{64}$'),request jsonb not null,envelope jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
do $$declare n text;begin foreach n in array array['elective_school_state','elective_blocks','elective_block_sources','elective_options','teaching_groups','teaching_group_sources','elective_commands'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);
end loop;end $$;
create function public.elective_command_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin raise exception 'Elective command journal is immutable' using errcode='42501';end $$;
create trigger elective_commands_immutable before update or delete on public.elective_commands for each row execute function public.elective_command_guard();
create trigger elective_commands_no_truncate before truncate on public.elective_commands for each statement execute function public.elective_command_guard();

create function public.elective_staff_scope(unit uuid) returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;begin
 a:=public.tjanst_actor('plan');if a.function not in ('rektor','administrator') then raise exception 'Elective block denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);return a;
end $$;
create function public.elective_lock_school(unit uuid) returns public.elective_school_state
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare s public.elective_school_state;begin
 perform pg_advisory_xact_lock(hashtextextended(unit::text,5520));
 insert into public.elective_school_state(unit_id,customer_id,organizer_id)
 select u.id,o.customer_id,o.id from public.school_units u join public.organizers o on o.id=u.organizer_id where u.id=unit on conflict do nothing;
 select * into s from public.elective_school_state where unit_id=unit for update;
 if s.unit_id is null then raise exception 'Elective block denied' using errcode='42501';end if;return s;
end $$;
create function public.elective_staff_audit(operation text,object_id uuid,unit uuid,details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;begin
 a:=public.elective_staff_scope(unit);s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 if operation not in ('elective_read','elective_command','elective_status') or not public.tjanst_audit_details(details) then raise exception 'Elective audit unavailable' using errcode='55000';end if;
 begin insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'elective_block',object_id,'ok',details||jsonb_build_object('unitId',unit));
 exception when others then raise exception 'Elective audit unavailable' using errcode='55000';end;
end $$;

create function public.elective_option_codes(plan_id uuid,block_kind text,item_points integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare t public.timplans;cat jsonb;program jsonb;basis jsonb;result jsonb;begin
 select * into t from public.timplans where id=plan_id;basis:=t.gym_basis->'basisReference';
 select payload into cat from public.programplan_catalogs where catalog_id=t.gym_basis->>'catalogId';
 select p.value into program from jsonb_array_elements(cat->'programs') p where p.value->>'code'=basis->'programRef'->>'code' and p.value->'version'=basis->'programRef'->'version';
 select coalesce(jsonb_agg(item_code order by item_code collate "C"),'[]') into result from (
  select distinct it.value->>'code' item_code from jsonb_array_elements(cat->'subjects') sub cross join lateral jsonb_array_elements(sub.value->'items') it
  where sub.value->>'typeOfSyllabus'='GRADE_SUBJECT_SYLLABUS' and sub.value->'schoolTypes'?'GY' and (it.value->>'points')::integer=item_points
   and public.phase5_programplan_date_diagnostic(sub.value,basis->>'startedOn') is null
   and (block_kind='individualChoice' or (block_kind='modernLanguage' and sub.value->>'code'=any(array['MODF','MODG','MODO','MODY','SVEF','SVEG','SVEO','SVEY','MODE','FINX','FINY','FINW','JIDX','JIDY','JIDW','MEAX','MEAY','MEAW','ROMX','ROMY','ROMW','SAMX','SAMY','SAMW']))
    or (block_kind='specialization' and exists(select 1 from jsonb_array_elements(program->'specialization') spec cross join lateral jsonb_array_elements(spec.value->'levels') lev
      where spec.value->>'code'=sub.value->>'code' and lev.value->>'code'=it.value->>'code')))
 ) allowed;return result;
end $$;
-- Stable hook replaced by the explicit timplan-detail migration; raw class needs stay unchanged.
create function public.elective_expand_time_sources(source jsonb) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$select jsonb_build_array(source)$$;

-- A timplan frame is eligible only if its frozen program reference really declares a choice block.
create function public.elective_sources(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb:='[]';c jsonb;n jsonb;link jsonb;t public.timplans;frame jsonb;kind text;codes jsonb;cat jsonb;program jsonb;basis jsonb;started text;annual_points integer;index_value integer;begin
 for c in select value from jsonb_array_elements(public.tjanst_needs(unit,school_year)) loop
  link:=c->'link';continue when link='null'::jsonb or link is null;
  select * into t from public.timplans where id=(link->>'timplanId')::uuid;
  basis:=t.gym_basis->'basisReference';cat:=null;program:=null;
  if t.gym_basis is not null then
   select payload into cat from public.programplan_catalogs where catalog_id=t.gym_basis->>'catalogId';
   select p.value into program from jsonb_array_elements(cat->'programs') p where p.value->>'code'=basis->'programRef'->>'code' and p.value->'version'=basis->'programRef'->'version';
  end if;
  for n in select value from jsonb_array_elements(c->'needs') loop
   frame:=null;kind:=null;codes:='[]';
   if t.gym_basis is not null then
    select b.value into frame from jsonb_array_elements(coalesce(basis->'choiceBlocks','[]')) b where 'block:'||(b.value->>'id')=n->>'rowKey';
    continue when frame is null or frame->>'kind' not in ('modernLanguage','individualChoice','specialization') or program is null;
    kind:=frame->>'kind';started:=basis->>'startedOn';index_value:=2*(substr(link->>'column',3)::integer-1);
    select (dist.value->'points'->>index_value)::integer+(dist.value->'points'->>(index_value+1))::integer into annual_points from jsonb_array_elements(t.gym_basis->'distribution') dist where dist.value->>'rowKey'=n->>'rowKey';
    codes:=public.elective_option_codes(t.id,kind,annual_points);
   elsif link->>'schoolform'='grundskola' and n->>'rowKey' in ('sprakval','skolansval') then
    kind:=case when n->>'rowKey'='sprakval' then 'languageChoice' else 'schoolChoice' end;
    select coalesce(jsonb_agg(code order by code collate "C"),'[]') into codes from (
     select distinct sub.value->>'code' code from public.programplan_catalogs pc cross join lateral jsonb_array_elements(pc.payload->'subjects') sub
     where sub.value->'schoolTypes'?'GR' and sub.value->>'typeOfSyllabus'='COURSE_SYLLABUS'
      and (kind='schoolChoice' or sub.value->>'code' in ('GRGRMSP01','GRGRSVE01','GRGRSVA01','GRGRENG01','GRGRMOD01','GRGRTSP01'))
    ) allowed;
   else continue;end if;
   result:=result||public.elective_expand_time_sources(jsonb_build_object('unitId',unit,'schoolYear',school_year,'classId',c->'classId','className',c->'name',
    'sourceKey',n->'sourceKey','frameSourceKey',n->'sourceKey','timeDetailRef',null,'rowKey',n->'rowKey','label',n->'label','linkRevision',link->'linkRevision','timplanId',link->'timplanId',
    'timplanVersion',link->'timplanVersion','seriesId',link->'seriesId','column',link->'column','schoolform',link->'schoolform',
    'needHt',case when t.gym_basis is not null and n->'needHt'='null'::jsonb and exists(select 1 from jsonb_array_elements(t.gym_basis->'distribution') di where di.value->>'rowKey'=n->>'rowKey' and (di.value->'points'->>index_value)::integer=0) then '0'::jsonb else n->'needHt' end,
    'needVt',case when t.gym_basis is not null and n->'needVt'='null'::jsonb and exists(select 1 from jsonb_array_elements(t.gym_basis->'distribution') di where di.value->>'rowKey'=n->>'rowKey' and (di.value->'points'->>(index_value+1))::integer=0) then '0'::jsonb else n->'needVt' end,'needBasis',n->'needBasis','blockKind',kind,'allowedOptionCodes',codes));
  end loop;
 end loop;return result;
end $$;

-- Lock exact references before applying a saved block. Source changes never guess a replacement.
create function public.elective_check_block_sources(block_id uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare b public.elective_blocks;r public.elective_block_sources;current_sources jsonb;begin
 select * into b from public.elective_blocks where id=block_id;
 if b.id is null then raise exception 'Elective block absent' using errcode='22023',hint='elective_invalid';end if;
 for r in select s.* from public.elective_block_sources s where s.block_id=b.id and s.active order by s.class_id,s.source_key collate "C" loop
  perform 1 from public.class_timplans where class_id=r.class_id and start_year=b.school_year for share;
  perform 1 from public.timplans where id=r.timplan_id for share;
 end loop;
 current_sources:=public.elective_sources(b.unit_id,b.school_year);
 for r in select s.* from public.elective_block_sources s where s.block_id=b.id and s.active loop
  if not exists(select 1 from jsonb_array_elements(current_sources) x where x.value=r.source_ref) then
   raise exception 'Elective source changed' using errcode='40001',hint='elective_stale_source';end if;
  if r.source_ref->'needHt'='null'::jsonb or r.source_ref->'needVt'='null'::jsonb then
   raise exception 'Elective time is unknown' using errcode='22023',hint='elective_time_missing';end if;
 end loop;
end $$;

create function public.elective_group_json(g public.teaching_groups,can_read_pupils boolean default false) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',g.id,'optionId',g.option_id,'name',g.name,'startsOn',g.starts_on,'endsOn',g.ends_on,
  'classIds',coalesce((select jsonb_agg(s.class_id order by s.source_key collate "C") from public.teaching_group_sources s where s.group_id=g.id),'[]'),
  'sourceKeys',coalesce((select jsonb_agg(s.source_key order by s.source_key collate "C") from public.teaching_group_sources s where s.group_id=g.id),'[]'),
  'estimatedPupils',g.estimated_pupils,'memberCount',null,'membershipRevision',g.revision)
$$;
create function public.elective_block_json(b public.elective_blocks,can_read_pupils boolean default false) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',b.id,'kind',b.kind,'name',b.name,'startsOn',b.starts_on,'endsOn',b.ends_on,'revision',b.revision,'offeringRevision',b.offering_revision,'applied',b.applied,'appliedRevision',b.applied_revision,
  'sourceRefs',coalesce((select jsonb_agg(s.source_ref order by s.source_key collate "C") from public.elective_block_sources s where s.block_id=b.id and s.active),'[]'),
  'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'subjectCode',o.subject_code,'levelCode',o.level_code,'language',o.language,'points',o.points) order by o.name collate "C",o.id) from public.elective_options o where o.block_id=b.id and o.active),'[]'),
  'groups',coalesce((select jsonb_agg(public.elective_group_json(g,can_read_pupils) order by g.name collate "C",g.id) from public.teaching_groups g where g.block_id=b.id and g.active),'[]'))
$$;
create function public.elective_pupil_projection(a public.access_assignments,unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('canReadPupils',false,'pupils',null,'rounds','[]'::jsonb,'choices',null,'placements',null)
$$;
create function public.elective_staff_projection(a public.access_assignments,unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('contractVersion','elective_block_v1','unitId',unit,'schoolYear',school_year,'schoolName',(select name from public.school_units where id=unit),
  'revision',coalesce(s.revision,1),'canManage',true,'policy',jsonb_build_object('unitId',unit,'revision',coalesce(s.policy_revision,1),'guardianConfirmation',s.guardian_confirmation),
  'sources',public.elective_sources(unit,school_year),'blocks',coalesce((select jsonb_agg(public.elective_block_json(b,false) order by b.name collate "C",b.id) from public.elective_blocks b where b.unit_id=unit and b.school_year=elective_staff_projection.school_year),'[]'))
  ||public.elective_pupil_projection(a,unit,school_year)
 from (select 1) one left join public.elective_school_state s on s.unit_id=unit
$$;
create function public.elective_round_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin raise exception 'Elective action unavailable' using errcode='22023',hint='elective_action_unavailable';end $$;

create function public.elective_require_shape(value jsonb,keys text[]) returns void
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
begin if not coalesce(public.phase5_programplan_shape(value,keys),false) then raise exception 'Invalid elective payload' using errcode='22023',hint='elective_invalid';end if;end $$;
create function public.elective_apply_policy(unit uuid,guardian boolean,policy_revision integer) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$begin return;end $$;
create function public.elective_language_valid(level_code text,language_code text) returns boolean
language sql immutable security definer set search_path=pg_catalog,public as $$
 select case when level_code~'^(FIN|JID|MEA|ROM|SAM)[XYW][123]000X$' then language_code=case left(level_code,3) when 'FIN' then 'fi' when 'JID' then 'yi' when 'MEA' then 'fit' when 'ROM' then 'rom' when 'SAM' then 'se' end
 when level_code like 'MOD%' or level_code in ('GRGRMSP01','GRGRMOD01') then language_code=any(array['fr','es','de','it','zh','ja','ru','ar','pt','en','fi','yi','fit','rom','se','so','fa','ku','tr','pl','uk','bs','hr','sr','sq','el','ro','hu','vi','th','ti','am','ur','hi','bn','ta','ps','nl','da','no','is','he'])
 else language_code is null end
$$;
create function public.elective_save_block(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p jsonb:=input->'payload';d jsonb;unit uuid:=(input->>'unitId')::uuid;year integer:=(input->>'schoolYear')::integer;
 a public.access_assignments;b public.elective_blocks;existing public.elective_blocks;ref jsonb;option jsonb;g jsonb;src jsonb;current_sources jsonb;
 target_block uuid;object_id uuid;k text;keys text[];class_ids uuid[];t public.timplans;subject jsonb;item jsonb;annual_points integer;index_value integer;old_offer jsonb;new_offer jsonb;old_group public.teaching_groups;in_use boolean;begin
 perform public.elective_require_shape(p,array['expectedBlockRevision','block']);d:=p->'block';
 perform public.elective_require_shape(d,array['id','kind','name','startsOn','endsOn','sourceRefs','options','groups']);target_block:=public.tjanst_uuid(d->'id');
 a:=public.elective_staff_scope(unit);
 if not public.phase5_programplan_text(d->'name',200) or btrim(d->>'name')<>d->>'name'
  or jsonb_typeof(d->'kind')<>'string' or d->>'kind' not in ('modernLanguage','individualChoice','specialization','languageChoice','schoolChoice')
  or not public.phase5_programplan_date(d->'startsOn') or not public.phase5_programplan_date(d->'endsOn') or d->>'startsOn'<>make_date(year,7,1)::text or d->>'endsOn'<>make_date(year+1,6,30)::text
  or not public.phase5_programplan_array(d->'sourceRefs',100) or jsonb_array_length(d->'sourceRefs')=0
  or not public.phase5_programplan_array(d->'options',100) or jsonb_array_length(d->'options')=0
  or not public.phase5_programplan_array(d->'groups',200) then raise exception 'Invalid elective block' using errcode='22023',hint='elective_invalid';end if;
 select * into existing from public.elective_blocks where id=target_block for update;
 if existing.id is not null then
  if existing.unit_id<>unit or existing.school_year<>year or existing.customer_id<>a.customer_id then raise exception 'Elective block denied' using errcode='42501';end if;
  if p->'expectedBlockRevision' is distinct from to_jsonb(existing.revision) then raise exception 'Elective block changed' using errcode='40001',hint='elective_revision_conflict';end if;

 elsif p->'expectedBlockRevision'<>'null'::jsonb then raise exception 'Elective block changed' using errcode='40001',hint='elective_revision_conflict';end if;
 -- Lock and re-read every referenced plan. A matching client label is never authority.
 for ref in select value from jsonb_array_elements(d->'sourceRefs') order by value->>'sourceKey' collate "C" loop
  perform 1 from public.class_timplans where class_id=public.tjanst_uuid(ref->'classId') and start_year=year for share;
  perform 1 from public.timplans where id=public.tjanst_uuid(ref->'timplanId') for share;
 end loop;
 current_sources:=public.elective_sources(unit,year);
 keys:=array[]::text[];class_ids:=array[]::uuid[];
 for ref in select value from jsonb_array_elements(d->'sourceRefs') loop
  if not exists(select 1 from jsonb_array_elements(current_sources) x where x.value=ref)
   or ref->>'blockKind'<>d->>'kind' or ref->>'sourceKey'=any(keys) or (ref->>'classId')::uuid=any(class_ids) then raise exception 'Elective source changed' using errcode='40001',hint='elective_stale_source';end if;
  keys:=array_append(keys,ref->>'sourceKey');class_ids:=array_append(class_ids,(ref->>'classId')::uuid);
  if ref->'needHt'='null'::jsonb or ref->'needVt'='null'::jsonb then raise exception 'Elective time missing' using errcode='22023',hint='elective_time_missing';end if;
 end loop;
 old_offer:=case when existing.id is null then null else (public.elective_block_json(existing,false)-'groups'-'revision'-'offeringRevision'-'applied'-'appliedRevision') end;
 new_offer:=d-'groups';
 for option in select value from jsonb_array_elements(d->'options') loop
  perform public.elective_require_shape(option,array['id','name','subjectCode','levelCode','language','points']);object_id:=public.tjanst_uuid(option->'id');
  if not public.phase5_programplan_text(option->'name',200) or not public.phase5_programplan_text(option->'subjectCode',80) or not public.phase5_programplan_text(option->'levelCode',80)
   or (option->'language'<>'null'::jsonb and not public.phase5_programplan_text(option->'language',80))
   or not coalesce(public.elective_language_valid(option->>'levelCode',option->>'language'),false) then
   raise exception 'Invalid elective option' using errcode='22023',hint='elective_invalid';end if;
  if exists(select 1 from public.elective_options o where o.id=object_id and o.block_id<>target_block) then raise exception 'Elective option denied' using errcode='42501';end if;
  if (select count(*) from jsonb_array_elements(d->'options') x where x.value->>'id'=object_id::text)<>1 then raise exception 'Duplicate elective option' using errcode='22023',hint='elective_invalid';end if;
  for ref in select value from jsonb_array_elements(d->'sourceRefs') loop
   if not (ref->'allowedOptionCodes' ? (option->>'levelCode')) then raise exception 'Option outside frozen frame' using errcode='22023',hint='elective_option_not_allowed';end if;
   select * into t from public.timplans where id=(ref->>'timplanId')::uuid;
   if t.gym_basis is not null then
    select s.value,it.value into subject,item from public.programplan_catalogs pc cross join lateral jsonb_array_elements(pc.payload->'subjects') s
    cross join lateral jsonb_array_elements(s.value->'items') it where pc.catalog_id=t.gym_basis->>'catalogId'
     and s.value->>'code'=option->>'subjectCode' and it.value->>'code'=option->>'levelCode';
    if subject is null or item->'points' is distinct from option->'points' then raise exception 'Option outside frozen frame' using errcode='22023',hint='elective_option_not_allowed';end if;
    index_value:=2*(substr(ref->>'column',3)::integer-1);
    select (dist.value->'points'->>index_value)::integer+(dist.value->'points'->>(index_value+1))::integer into annual_points
     from jsonb_array_elements(t.gym_basis->'distribution') dist where dist.value->>'rowKey'=ref->>'rowKey';
    if ref->'timeDetailRef'='null'::jsonb and (annual_points is null or (option->>'points')::integer<>annual_points) then raise exception 'Alternative needs its own frozen time path' using errcode='22023',hint='elective_alternative_time_missing';end if;
   elsif option->>'subjectCode'<>option->>'levelCode' or option->'points'<>'null'::jsonb then
    raise exception 'Invalid GR option reference' using errcode='22023',hint='elective_option_not_allowed';
   end if;
  end loop;
 end loop;
 for g in select value from jsonb_array_elements(d->'groups') loop
  perform public.elective_require_shape(g,array['id','optionId','name','startsOn','endsOn','classIds','sourceKeys','estimatedPupils']);object_id:=public.tjanst_uuid(g->'id');
  if exists(select 1 from public.teaching_groups x where x.id=object_id and x.block_id<>target_block) then raise exception 'Group denied' using errcode='42501';end if;
  if (select count(*) from jsonb_array_elements(d->'groups') x where x.value->>'id'=object_id::text)<>1
   or not exists(select 1 from jsonb_array_elements(d->'options') x where x.value->'id'=g->'optionId')
   or not public.phase5_programplan_text(g->'name',200) or g->'startsOn'<>d->'startsOn' or g->'endsOn'<>d->'endsOn'
   or not public.phase5_programplan_array(g->'sourceKeys',100) or jsonb_array_length(g->'sourceKeys')=0
   or not public.phase5_programplan_array(g->'classIds',100) or jsonb_array_length(g->'classIds')<>jsonb_array_length(g->'sourceKeys')
   or (g->'estimatedPupils'<>'null'::jsonb and not public.phase5_programplan_integer(g->'estimatedPupils',0,10000)) then
   raise exception 'Invalid teaching group' using errcode='22023',hint='elective_invalid';end if;
  select * into old_group from public.teaching_groups where id=object_id;
  if old_group.id is not null and (old_group.option_id<>public.tjanst_uuid(g->'optionId') or old_group.starts_on<>(g->>'startsOn')::date or old_group.ends_on<>(g->>'endsOn')::date) then raise exception 'Group identity cannot be rebound' using errcode='40001',hint='elective_group_in_use';end if;
  keys:=array[]::text[];class_ids:=array[]::uuid[];src:=null;
  for k in select jsonb_array_elements_text(g->'sourceKeys') loop
   select x.value into ref from jsonb_array_elements(d->'sourceRefs') x where x.value->>'sourceKey'=k;
   if ref is null or k=any(keys) or (ref->>'classId')::uuid=any(class_ids) or not (g->'classIds' ? (ref->>'classId')) then raise exception 'Invalid group source' using errcode='22023',hint='elective_invalid';end if;
   if src is not null and (src->'needHt',src->'needVt',src->'needBasis') is distinct from (ref->'needHt',ref->'needVt',ref->'needBasis') then raise exception 'Incompatible group time' using errcode='22023',hint='elective_time_conflict';end if;
   src:=ref;keys:=array_append(keys,k);class_ids:=array_append(class_ids,(ref->>'classId')::uuid);
  end loop;
  if old_group.id is not null and exists(select 1 from public.teaching_group_sources x where x.group_id=old_group.id and not (g->'sourceKeys' ? x.source_key)) then raise exception 'Existing group sources cannot silently disappear' using errcode='40001',hint='elective_group_in_use';end if;
 end loop;
 -- Removed objects are retained for history. References must be explicitly resolved first.
 for old_group in select x.* from public.teaching_groups x where x.block_id=target_block and x.active and not exists(select 1 from jsonb_array_elements(d->'groups') j where j.value->>'id'=x.id::text) loop
  if exists(select 1 from public.tjanst_rows r join public.tjanst_versions v on v.id=r.version_id where v.status='draft' and r.source_key='teaching_group:'||old_group.id::text||':'||year::text) then raise exception 'Assigned group cannot be removed' using errcode='40001',hint='elective_group_in_use';end if;
  if to_regclass('public.elective_placements') is not null then
   execute 'select exists(select 1 from public.elective_placements where group_id=$1)' into in_use using old_group.id;
   if in_use then raise exception 'Placed group cannot be removed' using errcode='40001',hint='elective_group_in_use';end if;
  end if;
 end loop;
 insert into public.elective_blocks(id,unit_id,customer_id,organizer_id,school_year,kind,name,starts_on,ends_on)
 values(target_block,unit,a.customer_id,a.organizer_id,year,d->>'kind',d->>'name',(d->>'startsOn')::date,(d->>'endsOn')::date)
 on conflict(id) do update set kind=excluded.kind,name=excluded.name,starts_on=excluded.starts_on,ends_on=excluded.ends_on,revision=elective_blocks.revision+1,offering_revision=elective_blocks.offering_revision+case when old_offer is distinct from new_offer then 1 else 0 end returning * into b;
 update public.teaching_groups set active=false where block_id=b.id;update public.elective_options set active=false where block_id=b.id;update public.elective_block_sources set active=false where block_id=b.id;
 for ref in select value from jsonb_array_elements(d->'sourceRefs') loop
  insert into public.elective_block_sources(block_id,source_key,class_id,timplan_id,source_ref,active) values(b.id,ref->>'sourceKey',(ref->>'classId')::uuid,(ref->>'timplanId')::uuid,ref,true)
  on conflict(block_id,source_key) do update set source_ref=excluded.source_ref,timplan_id=excluded.timplan_id,active=true;
 end loop;
 for option in select value from jsonb_array_elements(d->'options') loop
  if exists(select 1 from public.elective_options o where o.id=(option->>'id')::uuid and (o.subject_code,o.level_code,o.language,o.points) is distinct from (option->>'subjectCode',option->>'levelCode',option->>'language',(option->>'points')::integer)) then raise exception 'Option identity cannot be rebound' using errcode='40001',hint='elective_block_in_use';end if;
  insert into public.elective_options(id,block_id,name,subject_code,level_code,language,points,active) values((option->>'id')::uuid,b.id,option->>'name',option->>'subjectCode',option->>'levelCode',option->>'language',(option->>'points')::integer,true)
  on conflict(id) do update set name=excluded.name,active=true;
 end loop;
 for g in select value from jsonb_array_elements(d->'groups') loop
  insert into public.teaching_groups(id,block_id,option_id,name,starts_on,ends_on,estimated_pupils)
  values((g->>'id')::uuid,b.id,(g->>'optionId')::uuid,g->>'name',(g->>'startsOn')::date,(g->>'endsOn')::date,(g->>'estimatedPupils')::integer) on conflict(id) do update set name=excluded.name,estimated_pupils=excluded.estimated_pupils,revision=teaching_groups.revision+1,active=true;
  for k in select jsonb_array_elements_text(g->'sourceKeys') loop
   select s.class_id into object_id from public.elective_block_sources s where s.block_id=b.id and s.source_key=k;
   insert into public.teaching_group_sources values((g->>'id')::uuid,b.id,k,object_id) on conflict(group_id,source_key) do nothing;
  end loop;
 end loop;
 return jsonb_build_object('objectId',b.id,'objectRevision',b.revision);
end $$;

create function public.elective_block_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;unit uuid;year integer;result jsonb;begin
 perform public.elective_require_shape(input,array['unitId','schoolYear']);unit:=public.tjanst_uuid(input->'unitId');year:=(input->>'schoolYear')::integer;
 if not public.phase5_programplan_integer(input->'schoolYear',2000,2100) then raise exception 'Invalid elective year' using errcode='22023',hint='elective_invalid';end if;
 a:=public.elective_staff_scope(unit);result:=public.elective_staff_projection(a,unit,year);
 perform public.elective_staff_audit('elective_read',unit,unit);
 return jsonb_build_object('contractVersion','elective_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',result);
end $$;
create function public.elective_block_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;unit uuid;year integer;command uuid;action_name text;request_hash text;s public.elective_school_state;j public.elective_commands;result jsonb;meta jsonb;envelope jsonb;begin
 perform public.elective_require_shape(input,array['commandId','unitId','schoolYear','expectedRevision','action','payload']);
 unit:=public.tjanst_uuid(input->'unitId');command:=public.tjanst_uuid(input->'commandId');year:=(input->>'schoolYear')::integer;action_name:=input->>'action';
 if action_name not in ('save_block','apply_groups','set_policy','open_round','close_round','record_choice','confirm_choice','save_placement','end_placement') then raise exception 'Invalid elective action' using errcode='22023',hint='elective_invalid';end if;
 if not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or not public.phase5_programplan_integer(input->'expectedRevision',1,2147483647) then raise exception 'Invalid elective command' using errcode='22023',hint='elective_invalid';end if;
 a:=public.elective_staff_scope(unit);request_hash:=substr(public.tjanst_hash(input),8);
 perform pg_advisory_xact_lock(hashtextextended(command::text,5521));s:=public.elective_lock_school(unit);
 -- Revalidate the whole live chain after waiting for the school lock.
 a:=public.elective_staff_scope(unit);
 select * into j from public.elective_commands where command_id=command;
 if j.command_id is not null then
  if j.unit_id<>unit or j.school_year<>year or j.assignment_id<>a.id or j.actor_identity_id::text<>current_setting('app.identity_id',true) or j.payload_hash<>request_hash then
   raise exception 'Elective command conflict' using errcode='40001',hint='elective_command_conflict';end if;
  perform public.elective_staff_audit('elective_command',command,unit);
  return jsonb_set(j.envelope,'{result,replayed}','true');
 end if;
 if s.revision<>(input->>'expectedRevision')::integer then raise exception 'Elective revision changed' using errcode='40001',hint='elective_revision_conflict';end if;
 if action_name='save_block' then meta:=public.elective_save_block(input);
 elsif action_name='set_policy' then
  perform public.elective_require_shape(input->'payload',array['guardianConfirmation']);
  if jsonb_typeof(input->'payload'->'guardianConfirmation')<>'boolean' then raise exception 'Invalid elective policy' using errcode='22023',hint='elective_invalid';end if;
  update public.elective_school_state set guardian_confirmation=(input->'payload'->>'guardianConfirmation')::boolean,policy_revision=policy_revision+1 where unit_id=unit returning * into s;
  perform public.elective_apply_policy(unit,s.guardian_confirmation,s.policy_revision);meta:=jsonb_build_object('objectId',unit,'objectRevision',s.policy_revision);
 else meta:=public.elective_round_command(input);end if;
 update public.elective_school_state set revision=revision+1 where unit_id=unit returning * into s;
 result:=jsonb_build_object('unitId',unit,'schoolYear',year,'commandId',command,'action',action_name,'payloadHash',request_hash,
  'revision',s.revision,'objectId',meta->'objectId','objectRevision',meta->'objectRevision','replayed',false);
 envelope:=jsonb_build_object('contractVersion','elective_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',result);
 perform public.elective_staff_audit('elective_command',command,unit);
 insert into public.elective_commands(command_id,unit_id,school_year,actor_identity_id,assignment_id,action,payload_hash,request,envelope)
 values(command,unit,year,current_setting('app.identity_id',true)::uuid,a.id,action_name,request_hash,input,envelope);return envelope;
end $$;
create function public.elective_block_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;unit uuid;command uuid;j public.elective_commands;result jsonb;begin
 perform public.elective_require_shape(input,array['commandId','unitId','schoolYear','action','payloadHash']);unit:=public.tjanst_uuid(input->'unitId');command:=public.tjanst_uuid(input->'commandId');
 if not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or input->>'action' not in ('save_block','apply_groups','set_policy','open_round','close_round','record_choice','confirm_choice','save_placement','end_placement') or jsonb_typeof(input->'payloadHash')<>'string' or input->>'payloadHash'!~'^[a-f0-9]{64}$' then raise exception 'Invalid elective status reference' using errcode='22023',hint='elective_invalid';end if;
 a:=public.elective_staff_scope(unit);perform pg_advisory_xact_lock(hashtextextended(command::text,5521));
 select * into j from public.elective_commands where command_id=command;
 if j.command_id is not null and (j.unit_id<>unit or j.school_year<>(input->>'schoolYear')::integer or j.assignment_id<>a.id or j.actor_identity_id::text<>current_setting('app.identity_id',true)
  or j.payload_hash<>input->>'payloadHash' or j.action<>input->>'action') then raise exception 'Elective command conflict' using errcode='40001',hint='elective_command_conflict';end if;
 result:=jsonb_build_object('unitId',unit,'schoolYear',(input->>'schoolYear')::integer,'commandId',command,'status',case when j.command_id is null then 'not_found' else 'found' end,
  'receipt',case when j.command_id is null then 'null'::jsonb else (j.envelope->'result')||jsonb_build_object('replayed',true) end);
 perform public.elective_staff_audit('elective_status',command,unit);
 return jsonb_build_object('contractVersion','elective_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',result);
end $$;

do $$declare f regprocedure;begin for f in select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'elective_%' loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role,skolplattform_worker',f);
end loop;end $$;
grant execute on function public.elective_block_read(jsonb),public.elective_block_command(jsonb),public.elective_block_status(jsonb) to skolplattform_worker;
