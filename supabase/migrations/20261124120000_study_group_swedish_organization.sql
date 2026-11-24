-- Svenska/SvA i Gy25. Rektorns grupporganisation kan gälla innan eleverna är kända.
-- En länk ersätter klassens alternativrad i arbetsunderlaget. Klass och grupp behåller sina ID:n,
-- undervisningstiden läses från den fastställda timplanen och daterade elevmedlemskap är separata.
alter table public.study_groups
 add column swedish_planning boolean not null default false,
 add column swedish_forecast integer,
 add constraint study_groups_swedish_planning_check check (
  (swedish_forecast is null or swedish_planning and swedish_forecast between 1 and 999)
  and (not swedish_planning or origin_kind in ('classes','manual') and subject_code in ('SVEN','SVEA')
   and item_code ~ ('^'||subject_code||'[123]000X$') and language_code is null)
 );

create table public.study_group_swedish_sources (
 group_id uuid not null references public.study_groups(id),
 class_id uuid not null references public.school_classes(id),
 source_key text not null,
 timplan_id uuid not null references public.timplans(id),
 timplan_version integer not null,
 link_revision integer not null,
 need_basis text not null check (need_basis in ('terms','even_split')),
 primary key(group_id,class_id)
);
create index study_group_swedish_source_key on public.study_group_swedish_sources(source_key,group_id);
alter table public.study_group_swedish_sources enable row level security;
alter table public.study_group_swedish_sources force row level security;
revoke all on public.study_group_swedish_sources from public,anon,authenticated,service_role,skolplattform_worker;

-- Scope, terms and catalogue versions come from the linked class and timeplan.
create function public.study_group_swedish_sources(unit uuid, year integer)
returns table(class_id uuid, source_key text, level_no integer, minutes_ht integer, minutes_vt integer,
 timplan_id uuid, timplan_version integer, link_revision integer, need_basis text, points integer, sv_version integer, sva_version integer)
language sql stable security definer set search_path=pg_catalog,public as $$
 select (c.value->>'classId')::uuid,n.value->>'sourceKey',sv.parts[2]::integer,
  coalesce((n.value->>'needHt')::integer,0),coalesce((n.value->>'needVt')::integer,0),
  t.id,t.version,(c.value->'link'->>'linkRevision')::integer,n.value->>'needBasis',
  (row_definition.value->>'points')::integer,sv.parts[1]::integer,sva.parts[1]::integer
 from jsonb_array_elements(public.tjanst_needs(unit,year)) c
 cross join lateral jsonb_array_elements(c.value->'needs') n
 join public.timplans t on t.id=(c.value->'link'->>'timplanId')::uuid
 cross join lateral jsonb_array_elements(t.gym_basis->'rows') row_definition
 cross join lateral jsonb_array_elements(t.gym_basis->'distribution') distribution
 cross join lateral regexp_match(n.value->>'rowKey','(?:^alternative:foundation:|[+])SVEN:([1-9][0-9]{0,5}):SVEN([123])000X(?:[+]|$)') sv(parts)
 cross join lateral regexp_match(n.value->>'rowKey','(?:^alternative:foundation:|[+])SVEA:([1-9][0-9]{0,5}):SVEA([123])000X(?:[+]|$)') sva(parts)
 where c.value->'link'->>'schoolform'='gymnasium'
   and n.value->>'rowKey' like 'alternative:foundation:%'
   and length(n.value->>'rowKey')-length(replace(n.value->>'rowKey','+',''))=1
   and sv.parts[2]=sva.parts[2]
   and row_definition.value->>'key'=n.value->>'rowKey'
   and distribution.value->>'rowKey'=n.value->>'rowKey'
   and (coalesce((n.value->>'needHt')::integer,0)+coalesce((n.value->>'needVt')::integer,0))>0
   and coalesce((n.value->>'needHt')::integer,0) between 0 and 100000
   and coalesce((n.value->>'needVt')::integer,0) between 0 and 100000
   and (n.value->>'needHt' is not null or coalesce((distribution.value->'points'->>(2*(right(c.value->'link'->>'column',1)::integer-1)))::integer,0)=0)
   and (n.value->>'needVt' is not null or coalesce((distribution.value->'points'->>(2*(right(c.value->'link'->>'column',1)::integer-1)+1))::integer,0)=0)
$$;

create or replace function public.study_group_document(g public.study_groups) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',g.id,'unitId',g.unit_id,'schoolYear',g.school_year,'name',g.name,'startsOn',g.starts_on,'endsOn',g.ends_on,
  'course',case when g.subject_code is null then null else jsonb_build_object('subjectCode',g.subject_code,'subjectVersion',g.subject_version,'itemCode',g.item_code,'points',g.points,'languageCode',g.language_code) end,
  'minutesHt',g.minutes_ht,'minutesVt',g.minutes_vt,'parallelSetId',g.parallel_set_id,
  'classIds',(select coalesce(jsonb_agg(c.class_id order by c.class_id),'[]') from public.study_group_classes c where c.group_id=g.id),
  'origin',case g.origin_kind when 'valplan' then jsonb_build_object('kind','valplan','valplanId',g.valplan_id,'courseId',g.valplan_course_id) else jsonb_build_object('kind',g.origin_kind) end,
  'revision',g.revision,'active',g.active)
  ||case when g.swedish_planning then jsonb_build_object('svenska',jsonb_build_object('forecast',g.swedish_forecast)) else '{}'::jsonb end
$$;

create or replace function public.study_group_projection(a public.access_assignments,unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('contractVersion','study_group_v1','unitId',unit,'schoolYear',school_year,
  'groups',(select coalesce(jsonb_agg(public.study_group_document(g) order by g.name collate "C",g.id),'[]') from public.study_groups g where g.unit_id=unit and g.school_year=study_group_projection.school_year),
  'memberships',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'groupId',m.group_id,'pupilId',m.pupil_id,'startsOn',m.starts_on,'endsOn',m.ends_on,'source',m.source,'sourceRef',m.source_ref) order by m.group_id,m.starts_on,m.id),'[]')
   from public.study_group_memberships m join public.study_groups g on g.id=m.group_id join public.pupils p on p.id=m.pupil_id
   where g.unit_id=unit and g.school_year=study_group_projection.school_year and m.cancelled_at is null
    and public.phase4_scope(a.id,p.id,unit) and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))),
  'pupils',public.study_group_pupils(a,unit,school_year),
  'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name collate "C",c.id),'[]') from public.school_classes c where c.unit_id=unit),
  'svenskaSources',(select coalesce(jsonb_agg(jsonb_build_object('classId',s.class_id,'sourceKey',s.source_key,'level',s.level_no,
   'needHt',s.minutes_ht,'needVt',s.minutes_vt,'groupIds',(select coalesce(jsonb_agg(l.group_id order by l.group_id),'[]')
    from public.study_group_swedish_sources l join public.study_groups g on g.id=l.group_id
    where l.class_id=s.class_id and g.unit_id=unit and g.school_year=study_group_projection.school_year and g.active
     and substring(g.item_code,5,1)=s.level_no::text)) order by c.name collate "C",s.class_id,s.level_no),'[]')
   from public.study_group_swedish_sources(unit,school_year) s join public.school_classes c on c.id=s.class_id))
$$;

create or replace function public.study_group_need(g public.study_groups) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('sourceKind','study_group','sourceKey','study_group:'||g.id::text||':'||g.school_year::text,'rowKey','group:'||g.id::text,
  'groupId',g.id,'groupRevision',g.revision,'blockId',null,'optionId',null,'name',g.name,'label',g.name,'subjectCode',g.subject_code,'levelCode',g.item_code,'language',g.language_code,
  'classIds',(select coalesce(jsonb_agg(c.class_id order by c.class_id),'[]') from public.study_group_classes c where c.group_id=g.id),'sourceRefs','[]'::jsonb,
  'needHt',g.minutes_ht,'needVt',g.minutes_vt,'needBasis',coalesce((select min(s.need_basis) from public.study_group_swedish_sources s where s.group_id=g.id),'terms'),'stale',false)
  ||case when g.swedish_planning then jsonb_build_object('svenska',jsonb_build_object('forecast',g.swedish_forecast)) else '{}'::jsonb end
$$;

create function public.study_group_swedish_covers(starts date, ends date, ht integer, vt integer, year integer, calendar public.school_years)
returns boolean language sql immutable security definer set search_path=pg_catalog,public as $$
 select (ht=0 or starts<=coalesce((calendar).ht_start,make_date(year,7,1)) and ends>=coalesce((calendar).ht_end,make_date(year+1,6,30)))
    and (vt=0 or starts<=coalesce((calendar).vt_start,make_date(year,7,1)) and ends>=coalesce((calendar).vt_end,make_date(year+1,6,30)))
$$;

create or replace function public.tjanst_group_needs(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare sources jsonb;elective jsonb:='[]';study jsonb;swedish_sources jsonb:='[]';calendar public.school_years;
begin
 if exists(select 1 from public.elective_applied_groups a join public.elective_group_snapshots s on s.group_id=a.group_id and s.revision=a.revision where s.unit_id=unit and s.school_year=tjanst_group_needs.school_year) then
  sources:=public.elective_sources(unit,school_year);
  select coalesce(jsonb_agg(s.snapshot||jsonb_build_object('stale',exists(select 1 from jsonb_array_elements(s.snapshot->'sourceRefs') r
   where not exists(select 1 from jsonb_array_elements(sources) c where c.value=r.value))) order by s.group_id),'[]') into elective
  from public.elective_applied_groups ag join public.elective_group_snapshots s on s.group_id=ag.group_id and s.revision=ag.revision
  where s.unit_id=unit and s.school_year=tjanst_group_needs.school_year;
 end if;
 if exists(select 1 from public.study_groups g where g.unit_id=unit and g.school_year=tjanst_group_needs.school_year and g.active and g.swedish_planning) then
  select coalesce(jsonb_agg(to_jsonb(s)),'[]') into swedish_sources from public.study_group_swedish_sources(unit,school_year) s;
  calendar:=public.lasar_current(unit,school_year);
 end if;
 select coalesce(jsonb_agg(public.study_group_need(g)||jsonb_build_object('stale',
  (g.valplan_course_id is not null and not exists(select 1 from public.valplan_courses vc
    where vc.id=g.valplan_course_id and vc.active and vc.minutes_ht=g.minutes_ht and vc.minutes_vt=g.minutes_vt))
  or (g.swedish_planning and (not public.study_group_swedish_covers(g.starts_on,g.ends_on,g.minutes_ht,g.minutes_vt,g.school_year,calendar)
   or exists(select 1 from public.study_group_swedish_sources l where l.group_id=g.id and not exists(
   select 1 from jsonb_to_recordset(swedish_sources) s(class_id uuid,source_key text,timplan_id uuid,timplan_version integer,link_revision integer,need_basis text,minutes_ht integer,minutes_vt integer)
   where (s.class_id,s.source_key,s.timplan_id,s.timplan_version,s.link_revision,s.need_basis,s.minutes_ht,s.minutes_vt)
     =(l.class_id,l.source_key,l.timplan_id,l.timplan_version,l.link_revision,l.need_basis,g.minutes_ht,g.minutes_vt)))))) order by g.id),'[]') into study
 from public.study_groups g where g.unit_id=unit and g.school_year=tjanst_group_needs.school_year and g.active and g.minutes_ht+g.minutes_vt>0;
 return elective||study;
end $$;

-- An organised row leaves the working class needs. Prior staffing versions keep their frozen class and group snapshots.
create or replace function public.tjanst_working_needs(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare needs jsonb:=public.tjanst_needs_with_groups(unit,school_year,public.tjanst_group_needs(unit,school_year));applied_frames jsonb;filled jsonb;result jsonb;swedish_keys jsonb;
begin
 -- b.applied kan vara false efter ett otillämpat namn-/prognos-/poolutkast. Endast senaste
 -- uttryckliga applied_snapshot.sourceRefs gäller medan en tillämpad organisation finns kvar.
 -- Ett återöppnat sparutkast får återta claim i155 men väcker inte den gamla poolen före ny tillämpning.
 select coalesce(jsonb_agg(distinct coalesce(sr.value->>'frameSourceKey',sr.value->>'sourceKey')),'[]'::jsonb) into applied_frames
 from public.elective_blocks b cross join lateral jsonb_array_elements(coalesce(b.applied_snapshot->'sourceRefs','[]'::jsonb)) sr
 where b.unit_id=unit and b.school_year=tjanst_working_needs.school_year and b.organization_retired_at is null
  and exists(select 1 from public.elective_applied_groups ag join public.elective_group_snapshots gs on gs.group_id=ag.group_id and gs.revision=ag.revision where gs.block_id=b.id);
 -- Rows filled by valplans, with each block's unticked classes and whether it has groups. A row counts as organized per class:
 -- the groups carry the need of a class in a block with groups, and every other class on the row waits for organization.
 select coalesce(jsonb_object_agg(x.key,x.blocks),'{}'::jsonb) into filled from (
  select r.timplan_id::text||'|'||r.row_key||'|ar'||r.year::text key,jsonb_agg(jsonb_build_object(
    'excluded',(select coalesce(jsonb_agg(e.class_id),'[]'::jsonb) from public.valplan_row_excluded_classes e where e.valplan_id=r.valplan_id and e.timplan_id=r.timplan_id and e.row_key=r.row_key and e.year=r.year),
    'grouped',exists(select 1 from public.study_groups g where g.valplan_id=r.valplan_id and g.active and g.minutes_ht+g.minutes_vt>0))) blocks
  from public.valplan_rows r where r.unit_id=unit and r.school_year=tjanst_working_needs.school_year group by 1) x;
 select coalesce(jsonb_object_agg(l.source_key,true),'{}'::jsonb) into swedish_keys
 from public.study_group_swedish_sources l join public.study_groups g on g.id=l.group_id
 where g.unit_id=unit and g.school_year=tjanst_working_needs.school_year and g.active;
 if jsonb_array_length(applied_frames)=0 and filled='{}'::jsonb and swedish_keys='{}'::jsonb then return needs;end if;
 select coalesce(jsonb_agg(c.value||jsonb_build_object('needs',
  (select coalesce(jsonb_agg(case when applied_frames ? (n.value->>'sourceKey') or filled ? ((c.value->'link'->>'timplanId')||'|'||(n.value->>'rowKey')||'|'||(c.value->'link'->>'column')) then n.value||jsonb_build_object('organizationPending',true) else n.value end order by n.position),'[]'::jsonb)
   from jsonb_array_elements(c.value->'needs') with ordinality n(value,position)
   where not swedish_keys ? (n.value->>'sourceKey') and not public.valplan_class_organized(filled->((c.value->'link'->>'timplanId')||'|'||(n.value->>'rowKey')||'|'||(c.value->'link'->>'column')),c.value->>'classId'))) order by c.position),'[]'::jsonb) into result
 from jsonb_array_elements(needs) with ordinality c(value,position);
 return result;
end $$;

create function public.study_group_swedish_member_in_classes(group_id uuid, pupil uuid, unit uuid, starts date, ends date)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(range_agg(daterange(m.starts_on,m.ends_on,'[]')) @> daterange(starts,ends,'[]'),false)
 from public.pupil_class_memberships m join public.study_group_classes c on c.class_id=m.class_id
 where c.group_id=study_group_swedish_member_in_classes.group_id and m.pupil_id=pupil and m.unit_id=unit
$$;

create function public.study_group_swedish_check_membership() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare g public.study_groups;
begin
 select * into g from public.study_groups where id=new.group_id;
 if not g.swedish_planning then return new;end if;
 if not public.study_group_swedish_member_in_classes(g.id,new.pupil_id,g.unit_id,new.starts_on,new.ends_on) then
  perform public.study_group_invalid('study_group_swedish_class_period');
 end if;
 if exists(select 1 from public.study_group_memberships m join public.study_groups other on other.id=m.group_id
   where m.pupil_id=new.pupil_id and m.id<>new.id and m.group_id<>new.group_id and m.cancelled_at is null
    and other.unit_id=g.unit_id and other.school_year=g.school_year and other.swedish_planning and other.active
    and substring(other.item_code,5,1)=substring(g.item_code,5,1)
    and daterange(m.starts_on,m.ends_on,'[]')&&daterange(new.starts_on,new.ends_on,'[]')) then
  raise exception 'Pupil already assigned to a Swedish subject group on this level' using errcode='40001',hint='study_group_member_overlap';
 end if;
 return new;
end $$;
create trigger study_group_swedish_membership before insert on public.study_group_memberships
 for each row execute function public.study_group_swedish_check_membership();

create function public.study_group_organize_swedish(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
 a public.access_assignments;
 prior public.study_group_commands;
 chosen public.study_groups;
 unit uuid;
 year integer;
 command uuid;
 request_hash text;
 doc jsonb;
 matched jsonb;
 class_ids jsonb;
 spec jsonb;
 source jsonb;
 group_plan jsonb;
 group_id uuid;
 group_classes uuid[];
 subject text;
 version integer;
 level_no integer;
 item text;
 points integer;
 ht integer;
 vt integer;
 forecast integer;
 envelope jsonb;
 keep_revision boolean;
 calendar public.school_years;
begin
 if not coalesce(public.phase5_programplan_shape(input,array['contractVersion','commandId','action','unitId','schoolYear','payload']),false)
  or input->>'contractVersion' is distinct from 'study_group_v1'
  or input->>'action' is distinct from 'organize_swedish'
  or not public.phase5_programplan_integer(input->'schoolYear',2000,2100)
  or octet_length(public.tjanst_canonical(input))>512000 then perform public.study_group_invalid();end if;
 unit:=public.tjanst_uuid(input->'unitId');
 year:=(input->>'schoolYear')::integer;
 command:=public.tjanst_uuid(input->'commandId');
 doc:=input->'payload';
 a:=public.elective_staff_scope(unit);
 perform pg_advisory_xact_lock(hashtextextended(command::text,5571));
 perform pg_advisory_xact_lock(hashtextextended(unit::text||':'||year::text,5572));
 perform pg_advisory_xact_lock(hashtextextended(unit::text,5520));
 a:=public.elective_staff_scope(unit);
 request_hash:=substr(public.tjanst_hash(input),8);
 select * into prior from public.study_group_commands where command_id=command;
 if found then
  if prior.unit_id<>unit or prior.school_year<>year or prior.action<>'organize_swedish' or prior.payload_hash<>request_hash
   or prior.actor_identity_id::text<>current_setting('app.identity_id',true) or prior.assignment_id<>a.id then
   raise exception 'Study group command collision' using errcode='40001',hint='study_group_command_conflict';
  end if;
  return jsonb_set(prior.envelope,'{result,receipt,replayed}','true');
 end if;

 if not coalesce(public.phase5_programplan_shape(doc,array['sources','groups']),false)
  or jsonb_typeof(doc->'sources') is distinct from 'array' or jsonb_array_length(doc->'sources') not between 1 and 500
  or jsonb_typeof(doc->'groups') is distinct from 'array' or jsonb_array_length(doc->'groups') not between 1 and 500 then
  perform public.study_group_invalid();
 end if;
 for spec in select value from jsonb_array_elements(doc->'sources') loop
  if not coalesce(public.phase5_programplan_shape(spec,array['classId','sourceKey']),false)
   or jsonb_typeof(spec->'sourceKey') is distinct from 'string' or char_length(spec->>'sourceKey')>240 then
   perform public.study_group_invalid();
  end if;
  perform public.tjanst_uuid(spec->'classId');
 end loop;
 select coalesce(jsonb_agg(to_jsonb(s)),'[]'),coalesce(jsonb_agg(s.class_id),'[]'),min(s.level_no)
 into matched,class_ids,level_no
 from public.study_group_swedish_sources(unit,year) s join jsonb_array_elements(doc->'sources') selected
  on s.class_id=public.tjanst_uuid(selected.value->'classId') and s.source_key=selected.value->>'sourceKey';
 if jsonb_array_length(matched)<>jsonb_array_length(doc->'sources')
  or (select count(distinct value) from jsonb_array_elements(class_ids))<>jsonb_array_length(class_ids)
  or exists(select 1 from jsonb_array_elements(matched) s where (s.value->>'level_no')::integer<>level_no) then
  perform public.study_group_invalid('study_group_swedish_sources');
 end if;

 for group_plan in select value from jsonb_array_elements(doc->'groups') loop
  if not coalesce(public.phase5_programplan_shape(group_plan,array['groupId','expectedRevision','name','forecast','subjectCode','classIds']),false)
   or not public.phase5_programplan_integer(group_plan->'expectedRevision',0,2147483645)
   or jsonb_typeof(group_plan->'name') is distinct from 'string' or btrim(group_plan->>'name')='' or char_length(group_plan->>'name')>200
   or group_plan->>'subjectCode' is null or group_plan->>'subjectCode' not in ('SVEN','SVEA')
   or (group_plan->'forecast'<>'null'::jsonb and not public.phase5_programplan_integer(group_plan->'forecast',1,999))
   or jsonb_typeof(group_plan->'classIds') is distinct from 'array' or jsonb_array_length(group_plan->'classIds') not between 1 and 500 then
   perform public.study_group_invalid();
  end if;
  perform public.tjanst_uuid(group_plan->'groupId');
  if (select count(distinct public.tjanst_uuid(x.value)) from jsonb_array_elements(group_plan->'classIds') x)<>jsonb_array_length(group_plan->'classIds')
   or exists(select 1 from jsonb_array_elements(group_plan->'classIds') x where not class_ids @> jsonb_build_array(public.tjanst_uuid(x.value))) then
   perform public.study_group_invalid('study_group_swedish_sources');
  end if;
 end loop;
 if (select count(distinct public.tjanst_uuid(g.value->'groupId')) from jsonb_array_elements(doc->'groups') g)<>jsonb_array_length(doc->'groups')
  or exists(select 1 from jsonb_array_elements(class_ids) c where not exists(select 1 from jsonb_array_elements(doc->'groups') g
    where exists(select 1 from jsonb_array_elements(g.value->'classIds') gc where public.tjanst_uuid(gc.value)=public.tjanst_uuid(c.value)))) then
  perform public.study_group_invalid('study_group_swedish_sources');
 end if;
 -- A save edits every already organised group attached to a selected class. It cannot lose another group's links as a side effect.
 if exists(select 1 from public.study_group_swedish_sources l join public.study_groups g on g.id=l.group_id
  where g.unit_id=unit and g.school_year=year and g.active and class_ids @> jsonb_build_array(l.class_id)
   and substring(g.item_code,5,1)=level_no::text
   and not exists(select 1 from jsonb_array_elements(doc->'groups') p where public.tjanst_uuid(p.value->'groupId')=g.id)) then
  perform public.study_group_invalid('study_group_swedish_complete');
 end if;

 calendar:=public.lasar_current(unit,year);
 for group_plan in select value from jsonb_array_elements(doc->'groups') loop
  group_id:=public.tjanst_uuid(group_plan->'groupId');
  subject:=group_plan->>'subjectCode';
  item:=subject||level_no::text||'000X';
  forecast:=(group_plan->>'forecast')::integer;
  select array_agg(public.tjanst_uuid(c.value) order by public.tjanst_uuid(c.value)) into group_classes from jsonb_array_elements(group_plan->'classIds') c;
  select s.value into source from jsonb_array_elements(matched) s where (s.value->>'class_id')::uuid=any(group_classes) limit 1;
  version:=(source->>(case subject when 'SVEN' then 'sv_version' else 'sva_version' end))::integer;
  ht:=(source->>'minutes_ht')::integer;
  vt:=(source->>'minutes_vt')::integer;
  points:=(source->>'points')::integer;
  if exists(select 1 from jsonb_array_elements(matched) s where (s.value->>'class_id')::uuid=any(group_classes)
   and (s.value->>'minutes_ht',s.value->>'minutes_vt',s.value->>'need_basis',s.value->>'points',
         s.value->>(case subject when 'SVEN' then 'sv_version' else 'sva_version' end))
       is distinct from (ht::text,vt::text,source->>'need_basis',points::text,version::text)) then
   perform public.study_group_invalid('study_group_swedish_time');
  end if;
  select * into chosen from public.study_groups where id=group_id for update;
  if chosen.id is not null and (chosen.unit_id<>unit or chosen.school_year<>year) then
   raise exception 'Study group denied' using errcode='42501';
  end if;
  if coalesce(chosen.revision,0)<>(group_plan->>'expectedRevision')::integer then
   raise exception 'Study group revision changed' using errcode='40001',hint='study_group_revision_conflict';
  end if;
  if chosen.id is not null and (not chosen.active or chosen.valplan_id is not null or
    (chosen.subject_code,chosen.subject_version,chosen.item_code,chosen.points,chosen.language_code)
    is distinct from (subject,version,item,points,null::text)) then
   perform public.study_group_invalid('study_group_swedish_course');
  end if;
  if chosen.id is not null and not public.study_group_swedish_covers(chosen.starts_on,chosen.ends_on,ht,vt,year,calendar) then
   perform public.study_group_invalid('study_group_swedish_period');
  end if;
  if exists(select 1 from public.study_group_swedish_sources l where l.group_id=chosen.id and not class_ids @> jsonb_build_array(l.class_id)) then
   perform public.study_group_invalid('study_group_swedish_complete');
  end if;

  if chosen.id is null then
   insert into public.study_groups(id,unit_id,organizer_id,school_year,name,starts_on,ends_on,subject_code,subject_version,item_code,points,
    minutes_ht,minutes_vt,parallel_set_id,origin_kind,revision,swedish_planning,swedish_forecast)
   values(group_id,unit,a.organizer_id,year,btrim(group_plan->>'name'),make_date(year,7,1),make_date(year+1,6,30),subject,version,item,points,
    ht,vt,group_id,'classes',1,true,forecast)
   returning * into chosen;
  else
   keep_revision:=chosen.swedish_planning and (chosen.name,chosen.minutes_ht,chosen.minutes_vt,chosen.swedish_forecast)
      is not distinct from (btrim(group_plan->>'name'),ht,vt,forecast)
    and group_classes=(select array_agg(c.class_id order by c.class_id) from public.study_group_classes c where c.group_id=chosen.id)
    and not exists(select 1 from jsonb_array_elements(matched) s where (s.value->>'class_id')::uuid=any(group_classes)
     and not exists(select 1 from public.study_group_swedish_sources l where l.group_id=chosen.id
      and (l.class_id,l.source_key,l.timplan_id,l.timplan_version,l.link_revision,l.need_basis)
        =((s.value->>'class_id')::uuid,s.value->>'source_key',(s.value->>'timplan_id')::uuid,
          (s.value->>'timplan_version')::integer,(s.value->>'link_revision')::integer,s.value->>'need_basis')));
   if not keep_revision then
    update public.study_groups set name=btrim(group_plan->>'name'),minutes_ht=ht,minutes_vt=vt,swedish_planning=true,swedish_forecast=forecast,
     revision=revision+1,updated_at=clock_timestamp() where id=chosen.id returning * into chosen;
   end if;
  end if;

  delete from public.study_group_classes c where c.group_id=chosen.id and not c.class_id=any(group_classes);
  insert into public.study_group_classes(group_id,class_id)
   select chosen.id,class_id from unnest(group_classes) as class_id on conflict do nothing;
  delete from public.study_group_swedish_sources l where l.group_id=chosen.id and not l.class_id=any(group_classes);
  insert into public.study_group_swedish_sources as l(group_id,class_id,source_key,timplan_id,timplan_version,link_revision,need_basis)
   select chosen.id,(s.value->>'class_id')::uuid,s.value->>'source_key',(s.value->>'timplan_id')::uuid,
    (s.value->>'timplan_version')::integer,(s.value->>'link_revision')::integer,s.value->>'need_basis'
   from jsonb_array_elements(matched) s where (s.value->>'class_id')::uuid=any(group_classes)
   on conflict on constraint study_group_swedish_sources_pkey do update set source_key=excluded.source_key,timplan_id=excluded.timplan_id,
    timplan_version=excluded.timplan_version,link_revision=excluded.link_revision,need_basis=excluded.need_basis;

  if exists(select 1 from public.study_group_memberships m where m.group_id=chosen.id and m.cancelled_at is null and m.ends_on>=public.app_today()
    and not public.study_group_swedish_member_in_classes(chosen.id,m.pupil_id,unit,greatest(m.starts_on,public.app_today()),m.ends_on)) then
   perform public.study_group_invalid('study_group_swedish_class_period');
  end if;
  if exists(select 1 from public.study_group_memberships m join public.study_group_memberships n on n.pupil_id=m.pupil_id join public.study_groups other on other.id=n.group_id
   where m.group_id=chosen.id and m.cancelled_at is null and n.cancelled_at is null and n.group_id<>chosen.id and m.ends_on>=public.app_today()
    and other.unit_id=unit and other.school_year=year and other.swedish_planning and other.active
    and substring(other.item_code,5,1)=level_no::text and daterange(m.starts_on,m.ends_on,'[]')&&daterange(n.starts_on,n.ends_on,'[]')) then
   raise exception 'Pupil already assigned to a Swedish subject group on this level' using errcode='40001',hint='study_group_member_overlap';
  end if;

  insert into public.study_group_history(group_id,command_id,action,detail,actor_identity_id,assignment_id)
   values(chosen.id,command,'organize_swedish',public.study_group_document(chosen),current_setting('app.identity_id',true)::uuid,a.id);
 end loop;

 envelope:=jsonb_build_object('contractVersion','study_group_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),
  'result',jsonb_build_object('receipt',jsonb_build_object('commandId',command,'action','organize_swedish','replayed',false),
    'read',public.study_group_projection(a,unit,year)));
 insert into public.study_group_commands(command_id,unit_id,school_year,action,payload_hash,actor_identity_id,assignment_id,envelope)
 values(command,unit,year,'organize_swedish',request_hash,current_setting('app.identity_id',true)::uuid,a.id,envelope);
 return envelope;
end $$;

-- Retain the ordinary read/write operations and dated membership handling for the same stable group.
alter function public.study_group_command(jsonb) rename to study_group_regular_command;
create function public.study_group_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare unit uuid;year integer;command uuid;
begin
 if input->>'action'='organize_swedish' then return public.study_group_organize_swedish(input);end if;
 if input->>'action'='save_group' and public.phase5_programplan_integer(input->'schoolYear',2000,2100) then
  unit:=public.tjanst_uuid(input->'unitId');
  year:=(input->>'schoolYear')::integer;
  command:=public.tjanst_uuid(input->'commandId');
  perform public.elective_staff_scope(unit);
  perform pg_advisory_xact_lock(hashtextextended(command::text,5571));
  perform pg_advisory_xact_lock(hashtextextended(unit::text||':'||year::text,5572));
  if exists(select 1 from public.study_groups g where g.id=public.tjanst_uuid(input->'payload'->'id')
   and g.unit_id=unit and g.school_year=year and g.swedish_planning)
   and not exists(select 1 from public.study_group_commands c where c.command_id=command) then
   perform public.study_group_invalid('study_group_swedish_edit');
  end if;
 end if;
 return public.study_group_regular_command(input);
end $$;

revoke all on function public.study_group_swedish_sources(uuid,integer),public.study_group_swedish_member_in_classes(uuid,uuid,uuid,date,date),
 public.study_group_swedish_check_membership(),public.study_group_organize_swedish(jsonb),public.study_group_regular_command(jsonb),
 public.study_group_swedish_covers(date,date,integer,integer,integer,public.school_years),
 public.study_group_command(jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.study_group_command(jsonb) to skolplattform_worker;
