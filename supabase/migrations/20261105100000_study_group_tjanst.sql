-- VP-03B. Common teaching groups (study_groups) become needs in tjänstefördelningen. A timplan row filled by a valplan
-- is no class need once the valplan has active groups; until then it waits for organization. Each group revision used by
-- a row or a publication is frozen in study_group_snapshots. Old teaching_group rows and tjanst_joint_* are unchanged.
-- SS 12000:2024 (OpenAPI 2.1.0): intended Group of type Undervisning with a stable id; the need and its teacher rows are
-- local planning data towards Activity. No exchange is built or verified here.
create table public.study_group_snapshots(
 group_id uuid not null references public.study_groups(id), revision integer not null check(revision>0),
 unit_id uuid not null references public.school_units(id), school_year integer not null check(school_year between 2000 and 2100),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'), created_at timestamptz not null default clock_timestamp(),
 primary key(group_id,revision)
);
create table public.tjanst_version_study_group_sources(
 version_id uuid not null references public.tjanst_versions(id), group_id uuid not null, group_revision integer not null,
 primary key(version_id,group_id), foreign key(group_id,group_revision) references public.study_group_snapshots(group_id,revision)
);
do $$declare n text;begin foreach n in array array['study_group_snapshots','tjanst_version_study_group_sources'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);end loop;end $$;
create trigger study_group_snapshots_immutable before update or delete or truncate on public.study_group_snapshots for each statement execute function public.elective_time_immutable();
create trigger tjanst_study_group_sources_guard before insert or update or delete on public.tjanst_version_study_group_sources for each row execute function public.tjanst_version_guard();
create trigger tjanst_study_group_sources_no_truncate before truncate on public.tjanst_version_study_group_sources for each statement execute function public.tjanst_version_guard();

-- group_id stays the one column every copy path writes; generated columns keep a real FK per source kind.
alter table public.tjanst_rows drop constraint tjanst_rows_group_snapshot_ref, drop constraint tjanst_rows_group_id_fkey, drop constraint tjanst_rows_source_variant;
alter table public.tjanst_rows
 add column teaching_group_id uuid generated always as (case when source_kind='teaching_group' then group_id end) stored,
 add column study_group_id uuid generated always as (case when source_kind='study_group' then group_id end) stored;
alter table public.tjanst_rows
 add constraint tjanst_rows_teaching_group_ref foreign key(teaching_group_id) references public.teaching_groups(id),
 add constraint tjanst_rows_group_snapshot_ref foreign key(teaching_group_id,group_revision) references public.elective_group_snapshots(group_id,revision),
 add constraint tjanst_rows_study_group_snapshot_ref foreign key(study_group_id,group_revision) references public.study_group_snapshots(group_id,revision),
 add constraint tjanst_rows_source_variant check((
 (source_kind='class_timplan' and class_id is not null and link_revision is not null and timplan_id is not null and series_id is not null
  and timplan_version is not null and link_column is not null and group_id is null and group_revision is null and group_snapshot is null
  and source_key='class_timplan:'||class_id::text||':'||school_year::text||':'||timplan_row_key)
 or (source_kind in ('teaching_group','study_group') and class_id is null and link_revision is null and timplan_id is null and series_id is null
  and timplan_version is null and link_column is null and group_id is not null and group_revision is not null and group_revision>0 and group_snapshot is not null and jsonb_typeof(group_snapshot)='object'
  and group_snapshot->>'groupId'=group_id::text and group_snapshot->'groupRevision'=to_jsonb(group_revision)
  and group_snapshot->>'sourceKey'=source_key and source_key=source_kind||':'||group_id::text||':'||school_year::text
  and timplan_row_key='group:'||group_id::text)
) is true);

-- Group and valplan edits wait for a running tjänst command, like elective apply and time-detail edits (lock 5520).
create function public.study_group_tjanst_lock() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform pg_advisory_xact_lock(hashtextextended(new.unit_id::text,5520));return new;end $$;
create trigger study_groups_tjanst_lock before insert or update on public.study_groups for each row execute function public.study_group_tjanst_lock();
create trigger valplans_tjanst_lock before update on public.valplans for each row execute function public.study_group_tjanst_lock();

-- The need is fully given by group id and revision: save_group bumps the revision and writes the classes.
create function public.study_group_need(g public.study_groups) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('sourceKind','study_group','sourceKey','study_group:'||g.id::text||':'||g.school_year::text,'rowKey','group:'||g.id::text,
  'groupId',g.id,'groupRevision',g.revision,'blockId',null,'optionId',null,'name',g.name,'label',g.name,'subjectCode',g.subject_code,'levelCode',g.item_code,'language',g.language_code,
  'classIds',(select coalesce(jsonb_agg(c.class_id order by c.class_id),'[]') from public.study_group_classes c where c.group_id=g.id),'sourceRefs','[]'::jsonb,
  'needHt',g.minutes_ht,'needVt',g.minutes_vt,'needBasis','terms','stale',false)
$$;
create function public.study_group_freeze(need jsonb) returns void
language sql volatile security definer set search_path=pg_catalog,public as $$
 insert into public.study_group_snapshots(group_id,revision,unit_id,school_year,snapshot)
 select g.id,(need->>'groupRevision')::integer,g.unit_id,g.school_year,need from public.study_groups g where g.id=(need->>'groupId')::uuid
 on conflict(group_id,revision) do nothing
$$;


create or replace function public.tjanst_group_needs(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare sources jsonb;elective jsonb:='[]';study jsonb;begin
 if exists(select 1 from public.elective_applied_groups a join public.elective_group_snapshots s on s.group_id=a.group_id and s.revision=a.revision where s.unit_id=unit and s.school_year=tjanst_group_needs.school_year) then
  sources:=public.elective_sources(unit,school_year);
  select coalesce(jsonb_agg(s.snapshot||jsonb_build_object('stale',exists(select 1 from jsonb_array_elements(s.snapshot->'sourceRefs') r
   where not exists(select 1 from jsonb_array_elements(sources) c where c.value=r.value))) order by s.group_id),'[]') into elective
  from public.elective_applied_groups ag join public.elective_group_snapshots s on s.group_id=ag.group_id and s.revision=ag.revision
  where s.unit_id=unit and s.school_year=tjanst_group_needs.school_year;
 end if;
 -- The valplan owns the time (D-03): a changed or removed course makes its groups stale until they are saved again.
 select coalesce(jsonb_agg(public.study_group_need(g)||jsonb_build_object('stale',g.valplan_course_id is not null and not exists(select 1 from public.valplan_courses vc
   where vc.id=g.valplan_course_id and vc.active and vc.minutes_ht=g.minutes_ht and vc.minutes_vt=g.minutes_vt)) order by g.id),'[]') into study
 from public.study_groups g where g.unit_id=unit and g.school_year=tjanst_group_needs.school_year and g.active and g.minutes_ht+g.minutes_vt>0;
 return elective||study;
end $$;

create or replace function public.tjanst_version_groups(version uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select case when v.status='draft' then public.tjanst_group_needs(d.unit_id,d.school_year)
 else coalesce((select jsonb_agg(s.snapshot order by s.group_id) from public.tjanst_version_group_sources vg
 join public.elective_group_snapshots s on s.group_id=vg.group_id and s.revision=vg.group_revision where vg.version_id=v.id),'[]'::jsonb)
 ||coalesce((select jsonb_agg(s.snapshot order by s.group_id) from public.tjanst_version_study_group_sources vg
 join public.study_group_snapshots s on s.group_id=vg.group_id and s.revision=vg.group_revision where vg.version_id=v.id),'[]'::jsonb) end
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id where v.id=version
$$;

create or replace function public.tjanst_working_needs(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare needs jsonb:=public.tjanst_needs_with_groups(unit,school_year,public.tjanst_group_needs(unit,school_year));applied_frames jsonb;filled jsonb;result jsonb;
begin
 -- b.applied kan vara false efter ett otillämpat namn-/prognos-/poolutkast. Endast senaste
 -- uttryckliga applied_snapshot.sourceRefs gäller medan en tillämpad organisation finns kvar.
 -- Ett återöppnat sparutkast får återta claim i155 men väcker inte den gamla poolen före ny tillämpning.
 select coalesce(jsonb_agg(distinct coalesce(sr.value->>'frameSourceKey',sr.value->>'sourceKey')),'[]'::jsonb) into applied_frames
 from public.elective_blocks b cross join lateral jsonb_array_elements(coalesce(b.applied_snapshot->'sourceRefs','[]'::jsonb)) sr
 where b.unit_id=unit and b.school_year=tjanst_working_needs.school_year and b.organization_retired_at is null
  and exists(select 1 from public.elective_applied_groups ag join public.elective_group_snapshots gs on gs.group_id=ag.group_id and gs.revision=ag.revision where gs.block_id=b.id);
 -- Rows filled by a valplan: true = its groups carry the need once, false = still to organize.
 select coalesce(jsonb_object_agg(r.timplan_id::text||'|'||r.row_key||'|ar'||r.year::text,exists(select 1 from public.study_groups g
   where g.valplan_id=r.valplan_id and g.active and g.minutes_ht+g.minutes_vt>0)),'{}'::jsonb) into filled
 from public.valplan_rows r where r.unit_id=unit and r.school_year=tjanst_working_needs.school_year;
 if jsonb_array_length(applied_frames)=0 and filled='{}'::jsonb then return needs;end if;
 select coalesce(jsonb_agg(c.value||jsonb_build_object('needs',
  (select coalesce(jsonb_agg(case when applied_frames ? (n.value->>'sourceKey') or filled ? ((c.value->'link'->>'timplanId')||'|'||(n.value->>'rowKey')||'|'||(c.value->'link'->>'column')) then n.value||jsonb_build_object('organizationPending',true) else n.value end order by n.position),'[]'::jsonb)
   from jsonb_array_elements(c.value->'needs') with ordinality n(value,position)
   where filled->>((c.value->'link'->>'timplanId')||'|'||(n.value->>'rowKey')||'|'||(c.value->'link'->>'column')) is distinct from 'true')) order by c.position),'[]'::jsonb) into result
 from jsonb_array_elements(needs) with ordinality c(value,position);
 return result;
end $$;


CREATE OR REPLACE FUNCTION public.tjanst_row_json(r tjanst_rows, current_need jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select jsonb_build_object('id',r.id,'lineageId',r.lineage_id,'sourceKind',r.source_kind,'sourceKey',r.source_key,'classId',r.class_id,
  'rowKey',r.timplan_row_key,'personId',r.staff_person_id,'teacherHt',r.teacher_ht_minutes,'teacherVt',r.teacher_vt_minutes,
  'needHt',r.need_ht_minutes,'needVt',r.need_vt_minutes,'needBasis',r.need_basis,
  -- Ändrad koppling eller behov markerar raden; ögonblicksbilden skrivs aldrig om tyst (P6).
  'stale',case when r.source_kind in ('teaching_group','study_group') then current_need is null or coalesce((current_need->>'stale')::boolean,true) or current_need->'groupRevision' is distinct from to_jsonb(r.group_revision) else current_need is null or coalesce((current_need->>'organizationPending')::boolean,false) or (current_need->'link'->>'linkRevision')::integer<>r.link_revision or (current_need->'link'->>'timplanId')::uuid<>r.timplan_id
   or current_need->>'needBasis'<>r.need_basis or (current_need->>'needHt')::integer is distinct from r.need_ht_minutes
   or (current_need->>'needVt')::integer is distinct from r.need_vt_minutes end,
  'jointGroupId',null,'comment',r.comment)||case when r.source_kind in ('teaching_group','study_group') then jsonb_build_object('groupId',r.group_id,'groupRevision',r.group_revision,'classIds',r.group_snapshot->'classIds','sourceRefs',r.group_snapshot->'sourceRefs') else '{}'::jsonb end
$function$;

CREATE OR REPLACE FUNCTION public.tjanst_group_row_snapshot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
 if new.source_kind='study_group' and not exists(
  select 1 from public.study_group_snapshots gs join public.tjanst_versions v on v.id=new.version_id
  join public.tjanst_distributions d on d.id=v.distribution_id
  where gs.group_id=new.group_id and gs.revision=new.group_revision and gs.snapshot=new.group_snapshot
   and gs.unit_id=d.unit_id and gs.school_year=d.school_year and new.school_year=d.school_year
   and new.need_label=gs.snapshot->>'label' and new.need_basis=gs.snapshot->>'needBasis'
   and new.need_ht_minutes is not distinct from (gs.snapshot->>'needHt')::integer
   and new.need_vt_minutes is not distinct from (gs.snapshot->>'needVt')::integer
 ) then raise exception 'Invalid frozen group source snapshot' using errcode='23514',hint='tjanst_invalid';end if;
 if new.source_kind='teaching_group' and not exists(
  select 1 from public.elective_group_snapshots gs join public.tjanst_versions v on v.id=new.version_id
  join public.tjanst_distributions d on d.id=v.distribution_id
  where gs.group_id=new.group_id and gs.revision=new.group_revision and gs.snapshot=new.group_snapshot
   and gs.unit_id=d.unit_id and gs.school_year=d.school_year and new.school_year=d.school_year
   and new.need_label=gs.snapshot->>'label' and new.need_basis=gs.snapshot->>'needBasis'
   and new.need_ht_minutes is not distinct from (gs.snapshot->>'needHt')::integer
   and new.need_vt_minutes is not distinct from (gs.snapshot->>'needVt')::integer
 ) then raise exception 'Invalid frozen group source snapshot' using errcode='23514',hint='tjanst_invalid';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.tjanst_plan_save_row(a access_assignments, d tjanst_distributions, p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);need jsonb;person uuid;row_id uuid;link jsonb;
begin
 -- WR-02 (D-16): en rad i en samläsning behåller lärare och källa; tid och kommentar får ändras. Prövas innan något skrivs.
 if p->'rowId'<>'null'::jsonb and exists(select 1 from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id
   where r.id=(p->>'rowId')::uuid and r.version_id=v.id
    and (r.staff_person_id is distinct from (p->>'personId')::uuid or r.source_key is distinct from p->>'sourceKey')) then
  raise exception 'Row is joint' using errcode='22023',hint='tjanst_joint_already';end if;
 -- Behovet hämtas på servern i samma transaktion; klienten anger bara källa och lärartid.
 need:=public.tjanst_need(d.unit_id,d.school_year,p->>'sourceKey');
 if need is null or need->>'sourceKind' is distinct from p->>'sourceKind' then raise exception 'Unknown need source' using errcode='22023',hint='tjanst_unknown_source';end if;
 if coalesce((need->>'organizationPending')::boolean,false) or coalesce((need->>'stale')::boolean,false) then raise exception 'Review group organization/source first' using errcode='40001',hint='tjanst_stale_basis';end if;
 if need->>'sourceKind'='study_group' then perform public.study_group_freeze(need);end if;
 link:=need->'link';person:=(p->>'personId')::uuid;
 if person is not null then
  if not public.tjanst_person_at_school(a,person,d.unit_id,d.school_year) then raise exception 'Person not at school' using errcode='22023',hint='tjanst_person_not_at_school';end if;
  insert into public.tjanst_version_teachers(version_id,staff_person_id) values(v.id,person) on conflict do nothing;
 end if;
 begin
  if p->'rowId'='null'::jsonb then
   insert into public.tjanst_rows(version_id,lineage_id,staff_person_id,source_kind,source_key,class_id,school_year,link_revision,timplan_id,series_id,timplan_version,
    timplan_row_key,link_column,need_label,need_ht_minutes,need_vt_minutes,need_basis,teacher_ht_minutes,teacher_vt_minutes,comment,group_id,group_revision,group_snapshot)
   values(v.id,gen_random_uuid(),person,need->>'sourceKind',need->>'sourceKey',(need->>'classId')::uuid,d.school_year,(link->>'linkRevision')::integer,(link->>'timplanId')::uuid,
    (link->>'seriesId')::uuid,(link->>'timplanVersion')::integer,need->>'rowKey',link->>'column',left(need->>'label',300),(need->>'needHt')::integer,(need->>'needVt')::integer,
    need->>'needBasis',(p->>'teacherHt')::integer,(p->>'teacherVt')::integer,p->>'comment',(need->>'groupId')::uuid,(need->>'groupRevision')::integer,case when need->>'sourceKind'<>'class_timplan' then need else null end) returning id into row_id;
  else
   update public.tjanst_rows set staff_person_id=person,source_kind=need->>'sourceKind',group_id=(need->>'groupId')::uuid,group_revision=(need->>'groupRevision')::integer,group_snapshot=case when need->>'sourceKind'<>'class_timplan' then need else null end,source_key=need->>'sourceKey',class_id=(need->>'classId')::uuid,link_revision=(link->>'linkRevision')::integer,
    timplan_id=(link->>'timplanId')::uuid,series_id=(link->>'seriesId')::uuid,timplan_version=(link->>'timplanVersion')::integer,timplan_row_key=need->>'rowKey',
    link_column=link->>'column',need_label=left(need->>'label',300),need_ht_minutes=(need->>'needHt')::integer,need_vt_minutes=(need->>'needVt')::integer,
    need_basis=need->>'needBasis',teacher_ht_minutes=(p->>'teacherHt')::integer,teacher_vt_minutes=(p->>'teacherVt')::integer,comment=p->>'comment'
   where id=(p->>'rowId')::uuid and version_id=v.id returning id into row_id;
   if row_id is null then raise exception 'Unknown row' using errcode='22023',hint='tjanst_invalid';end if;
  end if;
 exception when unique_violation then raise exception 'Duplicate row' using errcode='22023',hint='tjanst_duplicate_row';end;
 return v.id;
end $function$;

CREATE OR REPLACE FUNCTION public.tjanst_year_payload(kind text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare ht jsonb;vt jsonb;
begin
 if kind='row' then
  if not public.phase5_programplan_shape(p,array['rowId','sourceKind','sourceKey','personId','teacherHt','teacherVt','comment'])
   or coalesce(p->>'sourceKind','') not in ('class_timplan','teaching_group','study_group') or not public.phase5_apl_text(p->'sourceKey',240,false)
   or not ((p->>'sourceKind'='class_timplan' and coalesce(p->>'sourceKey','')~'^class_timplan:[0-9a-f-]{36}:[0-9]{4}:.{1,160}$') or (p->>'sourceKind' in ('teaching_group','study_group') and coalesce(p->>'sourceKey','')~('^'||(p->>'sourceKind')||':[0-9a-f-]{36}:[0-9]{4}$'))) then
   raise exception 'Invalid row payload' using errcode='22023',hint='tjanst_invalid';end if;
  perform public.tjanst_uuid(to_jsonb(split_part(p->>'sourceKey',':',2)));
  if p->'rowId'<>'null'::jsonb then perform public.tjanst_uuid(p->'rowId');end if;
  ht:=p->'teacherHt';vt:=p->'teacherVt';
 elsif kind='special' then
  if not public.phase5_programplan_shape(p,array['specialId','kind','label','personId','classId','ht','vt','comment'])
   or coalesce(p->>'kind','') not in ('mentor','programansvar','speciallarare','annat') or not public.phase5_apl_text(p->'label',200,false)
   or ((p->>'kind'='mentor') is distinct from (p->'classId'<>'null'::jsonb)) then
   raise exception 'Invalid special payload' using errcode='22023',hint='tjanst_invalid';end if;
  if p->'specialId'<>'null'::jsonb then perform public.tjanst_uuid(p->'specialId');end if;
  if p->'classId'<>'null'::jsonb then perform public.tjanst_uuid(p->'classId');end if;
  ht:=p->'ht';vt:=p->'vt';
 else raise exception 'Invalid payload kind' using errcode='22023',hint='tjanst_invalid';end if;
 if p->'personId'<>'null'::jsonb then perform public.tjanst_uuid(p->'personId');end if;
 if not public.phase5_programplan_integer(ht,0,200000) or not public.phase5_programplan_integer(vt,0,200000)
  or (ht#>>'{}')::integer+(vt#>>'{}')::integer=0 or not public.phase5_apl_text(p->'comment',2000,true) then
  raise exception 'Invalid payload time/comment' using errcode='22023',hint='tjanst_invalid';end if;
 return p;
end $function$;

CREATE OR REPLACE FUNCTION public.tjanst_plan_parse_legacy(input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare action_name text;p jsonb;payload jsonb;t jsonb;teachers jsonb:='[]';rows jsonb;
begin
 if jsonb_typeof(input) is distinct from 'object' or jsonb_typeof(input->'action') is distinct from 'string'
  or input->>'action' not in ('create_draft','add_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','discard_draft','publish')
  or not public.phase5_programplan_shape(input,array['commandId','unitId','schoolYear','action','expectedRevision','payloadHash','payload']
   ||case when input->>'action'='publish' then array['expectedContentHash'] else '{}'::text[] end)
  or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483647)
  or jsonb_typeof(input->'payloadHash') is distinct from 'string' or input->>'payloadHash'!~'^sha256:[0-9a-f]{64}$'
  or (input->>'action'='publish' and (jsonb_typeof(input->'expectedContentHash') is distinct from 'string' or input->>'expectedContentHash'!~'^sha256:[0-9a-f]{64}$')) then
  raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
 action_name:=input->>'action';p:=input->'payload';
 if action_name='create_draft' then
  if not public.phase5_programplan_shape(p,array['basedOnVersionId']) then raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object('basedOnVersionId',case when p->'basedOnVersionId'='null'::jsonb then null else public.tjanst_uuid(p->'basedOnVersionId') end);
 elsif action_name='add_teacher' then
  if not public.phase5_programplan_shape(p,array['personId']) then raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object('personId',public.tjanst_uuid(p->'personId'));
 elsif action_name='save_row' then
  if not public.phase5_programplan_shape(p,array['rowId','sourceKind','sourceKey','personId','teacherHt','teacherVt','comment'])
   or coalesce(p->>'sourceKind','') not in ('class_timplan','teaching_group','study_group') or jsonb_typeof(p->'sourceKey') is distinct from 'string'
   or not public.phase5_programplan_integer(p->'teacherHt',0,200000) or not public.phase5_programplan_integer(p->'teacherVt',0,200000)
   or (p->>'teacherHt')::integer+(p->>'teacherVt')::integer=0 then
   raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  if not public.phase5_apl_text(p->'comment',2000,true) then raise exception 'Invalid comment' using errcode='22023',hint='tjanst_comment_too_long';end if;
  payload:=jsonb_build_object('rowId',case when p->'rowId'='null'::jsonb then null else public.tjanst_uuid(p->'rowId') end,'sourceKind',p->'sourceKind',
   'sourceKey',p->'sourceKey','personId',case when p->'personId'='null'::jsonb then null else public.tjanst_uuid(p->'personId') end,
   'teacherHt',p->'teacherHt','teacherVt',p->'teacherVt','comment',p->'comment');
 elsif action_name in ('delete_row','delete_special','dissolve_joint') then
  if not public.phase5_programplan_shape(p,array[case action_name when 'delete_row' then 'rowId' when 'delete_special' then 'specialId' else 'jointId' end]) then
   raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object(case action_name when 'delete_row' then 'rowId' when 'delete_special' then 'specialId' else 'jointId' end,
   public.tjanst_uuid(p->case action_name when 'delete_row' then 'rowId' when 'delete_special' then 'specialId' else 'jointId' end));
 elsif action_name='save_special' then
  if not public.phase5_programplan_shape(p,array['specialId','kind','label','personId','classId','ht','vt','comment'])
   or jsonb_typeof(p->'kind') is distinct from 'string' or p->>'kind' not in ('mentor','programansvar','speciallarare','annat')
   or not public.phase5_apl_text(p->'label',200,false)
   or not public.phase5_programplan_integer(p->'ht',0,200000) or not public.phase5_programplan_integer(p->'vt',0,200000)
   or (p->>'ht')::integer+(p->>'vt')::integer=0 or (p->'classId'<>'null'::jsonb and p->>'kind'<>'mentor') then
   raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  if not public.phase5_apl_text(p->'comment',2000,true) then raise exception 'Invalid comment' using errcode='22023',hint='tjanst_comment_too_long';end if;
  payload:=jsonb_build_object('specialId',case when p->'specialId'='null'::jsonb then null else public.tjanst_uuid(p->'specialId') end,'kind',p->'kind','label',p->'label',
   'personId',case when p->'personId'='null'::jsonb then null else public.tjanst_uuid(p->'personId') end,
   'classId',case when p->'classId'='null'::jsonb then null else public.tjanst_uuid(p->'classId') end,'ht',p->'ht','vt',p->'vt','comment',p->'comment');
 elsif action_name='save_joint' then
  if not public.phase5_programplan_shape(p,array['jointId','name','rowIds','teachers']) or not public.phase5_apl_text(p->'name',200,false)
   or jsonb_typeof(p->'rowIds') is distinct from 'array' or jsonb_typeof(p->'teachers') is distinct from 'array'
   or jsonb_array_length(p->'rowIds')>200 or jsonb_array_length(p->'teachers')>2000 then
   raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  select coalesce(jsonb_agg(to_jsonb(public.tjanst_uuid(x.value)) order by x.n),'[]'::jsonb) into rows from jsonb_array_elements(p->'rowIds') with ordinality x(value,n);
  if (select count(distinct x.value) from jsonb_array_elements(rows) x)<>jsonb_array_length(rows) then raise exception 'Duplicate row' using errcode='22023',hint='tjanst_duplicate_row';end if;
  if jsonb_array_length(rows)<2 then raise exception 'Too few rows' using errcode='22023',hint='tjanst_joint_too_few';end if;
  for t in select x.value from jsonb_array_elements(p->'teachers') x loop
   if not public.phase5_programplan_shape(t,array['personId','ht','vt']) or not public.phase5_programplan_integer(t->'ht',0,200000)
    or not public.phase5_programplan_integer(t->'vt',0,200000) or (t->>'ht')::integer+(t->>'vt')::integer=0 then
    raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
   teachers:=teachers||jsonb_build_array(jsonb_build_object('personId',public.tjanst_uuid(t->'personId'),'ht',t->'ht','vt',t->'vt'));
  end loop;
  if (select count(distinct x.value->>'personId') from jsonb_array_elements(teachers) x)<>jsonb_array_length(teachers) then
   raise exception 'Duplicate teacher' using errcode='22023',hint='tjanst_duplicate_row';end if;
  payload:=jsonb_build_object('jointId',case when p->'jointId'='null'::jsonb then null else public.tjanst_uuid(p->'jointId') end,'name',p->'name','rowIds',rows,'teachers',teachers);
 else
  if p is distinct from '{}'::jsonb then raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:='{}'::jsonb;
 end if;
 return jsonb_build_object('commandId',public.tjanst_uuid(input->'commandId'),'unitId',public.tjanst_uuid(input->'unitId'),'schoolYear',input->'schoolYear',
  'action',action_name,'expectedRevision',input->'expectedRevision','payloadHash',input->'payloadHash','payload',payload)
  ||case when action_name='publish' then jsonb_build_object('expectedContentHash',input->'expectedContentHash') else '{}'::jsonb end;
end $function$;

CREATE OR REPLACE FUNCTION public.tjanst_year_recommendations(core jsonb, need jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare history jsonb;refs jsonb:='[]';r jsonb;c jsonb;reason text;own jsonb;reasons jsonb;result jsonb:='[]';evidence text;
 base jsonb:=core->'base';
begin
 if need->>'sourceKind' in ('teaching_group','study_group') then return jsonb_build_object('recommendationStatus','empty','suggestions','[]'::jsonb);end if;
 begin history:=public.tjanst_year_history((base->>'unitId')::uuid,(base->>'schoolYear')::integer);
 exception when sqlstate 'P5101' then return jsonb_build_object('recommendationStatus','unavailable','suggestions','[]'::jsonb);end;
 for r in select x.value from jsonb_array_elements(core->'rows') x where x.value->>'classId'=need->>'classId' and x.value->>'personId' is not null loop
  refs:=refs||jsonb_build_array(jsonb_build_object('reason','current_same_class','unitId',base->'unitId','schoolYear',base->'schoolYear',
    'versionId',base->'baseVersionId','rowId',r->'id','personId',r->'personId','classId',r->'classId','rowKey',r->'rowKey','sourceKey',r->'sourceKey'));
 end loop;
 for r in select x.value from jsonb_array_elements(history) x loop
  reason:=case when r->>'classId'=need->>'classId' and r->>'rowKey'=need->>'rowKey' then 'previous_same_class_row'
   when r->>'classId'=need->>'classId' then 'previous_same_class' when r->>'rowKey'=need->>'rowKey' then 'previous_same_row' else null end;
  if reason is not null then refs:=refs||jsonb_build_array(r||jsonb_build_object('reason',reason));end if;
 end loop;
 for c in select x.value from jsonb_array_elements(core->'candidates') x loop
  select coalesce(jsonb_agg(x.value order by x.value->>'reason',x.value->>'versionId',x.value->>'rowId'),'[]') into own
   from jsonb_array_elements(refs) x where x.value->>'personId'=c->>'personId';
  if jsonb_array_length(own)=0 then continue;end if;
  select jsonb_agg(rr.reason order by rr.rank) into reasons from (select distinct x.value->>'reason' reason,
    array_position(array['current_same_class','previous_same_class_row','previous_same_class','previous_same_row'],x.value->>'reason') rank from jsonb_array_elements(own) x) rr;
  evidence:=public.tjanst_year_hash('evidence',jsonb_build_object('unitId',base->'unitId','schoolYear',base->'schoolYear','sourceKey',need->'sourceKey',
   'personId',c->'personId','references',own,'reasons',reasons));
  result:=result||jsonb_build_array(jsonb_build_object('suggestionId',evidence,'personId',c->'personId','evidenceHash',evidence,'reasons',reasons,'references',own));
 end loop;
 return jsonb_build_object('recommendationStatus',case when jsonb_array_length(result)>0 then 'ready' else 'empty' end,'suggestions',result);
end $function$;

CREATE OR REPLACE FUNCTION public.tjanst_year_row(core jsonb, source_key text, row_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare need jsonb;r jsonb;base jsonb:=core->'base';
begin
 select n.value||jsonb_build_object('classId',c.value->'classId','className',c.value->'name') into need
  from jsonb_array_elements(core->'needs') c cross join lateral jsonb_array_elements(c.value->'needs') n where n.value->>'sourceKey'=source_key;
 if need is null then select jsonb_build_object('sourceKind',g.value->'sourceKind','sourceKey',g.value->'sourceKey','rowKey',g.value->'rowKey','label',g.value->'label','needHt',g.value->'needHt','needVt',g.value->'needVt','needBasis',g.value->'needBasis','classId',null,'className',g.value->'name','groupId',g.value->'groupId','classIds',g.value->'classIds') into need from jsonb_array_elements(core->'groups') g where g.value->>'sourceKey'=source_key;end if;
 if need is null then raise exception 'Unknown current need' using errcode='22023',hint='tjanst_unknown_source';end if;
 if row_id is not null then
  select x.value into r from jsonb_array_elements(core->'rows') x where x.value->>'id'=row_id::text and x.value->>'sourceKey'=source_key;
  if r is null then raise exception 'Current row denied' using errcode='42501';end if;
 end if;
 base:=base||jsonb_build_object('basisHash',public.tjanst_year_hash('basis',jsonb_build_object('coreBasisHash',base->'basisHash','sourceKey',source_key,'rowId',row_id)));
 return base||jsonb_build_object('mode','row','sourceKey',source_key,'rowId',row_id,'need',need,'currentRow',r,
  'candidates',core->'candidates','totalCandidates',jsonb_array_length(core->'candidates'))||public.tjanst_year_recommendations(core,need);
end $function$;

CREATE OR REPLACE FUNCTION public.tjanst_plan_blockers(a access_assignments, v tjanst_versions, unit uuid, school_year integer, needs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare result jsonb:='[]';
begin
 if v.id is null or v.status<>'draft' then return result;end if;
 if not exists(select 1 from public.tjanst_rows r where r.version_id=v.id) then
  result:=result||jsonb_build_array(jsonb_build_object('code','empty_draft','message','Utkastet har inga tjänsterader. Lägg till minst en rad före publicering.'));end if;
 if exists(select 1 from public.tjanst_rows r where r.version_id=v.id and (public.tjanst_row_json(r,public.tjanst_need(unit,tjanst_plan_blockers.school_year,r.source_key))->>'stale')::boolean) then
  result:=result||jsonb_build_array(jsonb_build_object('code','stale_rows','message','Underlaget har ändrats för en eller flera rader. Spara raderna på nytt efter granskning.'));end if;
 if exists(select 1 from (select t.staff_person_id p from public.tjanst_version_teachers t where t.version_id=v.id
   union select r.staff_person_id from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id is not null
   union select s.staff_person_id from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id is not null) x
   where not public.tjanst_person_at_school(a,x.p,unit,school_year)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','person_not_at_school','message','En lärare saknar giltigt skoluppdrag på skolan för läsåret.'));end if;
 -- WR-02 (D-16): samläsningens regler prövas också vid publicering, även för data från före rättelsen.
 if exists(select 1 from public.tjanst_joint_groups g where g.version_id=v.id and (
   (select count(distinct r.class_id) from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id)<2
   or exists(select 1 from public.tjanst_joint_teacher_time t where t.group_id=g.id and not exists(select 1 from public.tjanst_joint_members m
    join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id and r.staff_person_id=t.staff_person_id)))) then
  result:=result||jsonb_build_array(jsonb_build_object('code','joint_invalid','message','En samläsning uppfyller inte reglerna: raderna ska finnas i minst två klasser, och lärartid får bara gälla lärare som har en rad i gruppen. Ändra eller lös upp samläsningen.'));end if;
 -- D-28: en samläsning har samma lärare för alla rader (eller bara vakanta rader); äldre blandade grupper repareras aldrig automatiskt.
 if exists(select 1 from public.tjanst_joint_groups g where g.version_id=v.id and (
   (select count(distinct coalesce(r.staff_person_id::text,'vakant')) from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id)>1
   or (select count(*) from public.tjanst_joint_teacher_time t where t.group_id=g.id)>1)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','joint_mixed_teachers','message','En samläsning har flera lärare. En samläsning ska ha samma lärare för alla klasser. Flytta uppdragen till samma lärare eller lös upp samläsningen.'));end if;
 -- 05.1-33 / D-31: två eller fler lärare med tid på samma behov kräver en angiven delningsform och minst en betygssättare med tid.
 if exists(select 1 from (select r.source_key from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id is not null
   and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id) group by r.source_key having count(distinct r.staff_person_id)>1) x
   where not exists(select 1 from public.tjanst_need_sharing s where s.version_id=v.id and s.source_key=x.source_key)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','shared_need_unspecified','message','Två eller fler lärare har tid på samma kurs i en klass utan angiven delning. Ange om de undervisar en i taget eller samtidigt.'));end if;
 if exists(select 1 from public.tjanst_need_sharing s where s.version_id=v.id
   and (select count(distinct r.staff_person_id) from public.tjanst_rows r where r.version_id=v.id and r.source_key=s.source_key and r.staff_person_id is not null
    and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id))>1
   and not exists(select 1 from public.tjanst_need_graders g join public.tjanst_rows r on r.version_id=v.id and r.source_key=g.source_key and r.staff_person_id=g.staff_person_id
    where g.version_id=v.id and g.source_key=s.source_key and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id))) then
  result:=result||jsonb_build_array(jsonb_build_object('code','grader_missing','message','En delad kurs saknar lärare som sätter betyg. Ange vem eller vilka av lärarna som sätter betyget.'));end if;
 if exists(select 1 from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') n where coalesce((n.value->>'organizationPending')::boolean,false)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','organization_pending','message','Valbara tidsutrymmen återstår att organisera i undervisningsgrupper. Skapa grupperna från valplanen eller under Undervisningsgrupper innan tjänstefördelningen publiceras.'));end if;
 if exists(select 1 from jsonb_array_elements(public.tjanst_group_needs(unit,school_year)) g where (g.value->>'stale')::boolean) then
  result:=result||jsonb_build_array(jsonb_build_object('code','group_sources_changed','message','Underlaget för undervisningsgrupper har ändrats. Granska grupperna och spara dem på nytt.'));end if;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.tjanst_plan_publish(a access_assignments, s app_sessions, d tjanst_distributions, q jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);h text;
begin
 if a.function<>'rektor' then raise exception 'Publish denied' using errcode='42501';end if;
 h:=public.tjanst_version_hash(v.id);
 if h<>q->>'expectedContentHash' then raise exception 'Content changed' using errcode='40001',hint='tjanst_content_changed';end if;
 if jsonb_array_length(public.tjanst_plan_blockers(a,v,d.unit_id,d.school_year,public.tjanst_working_needs(d.unit_id,d.school_year)))>0 then
  raise exception 'Publish blocked' using errcode='40001',hint='tjanst_publish_blocked';end if;
 delete from public.tjanst_version_class_basis where version_id=v.id;
 if jsonb_array_length(public.tjanst_group_needs(d.unit_id,d.school_year))>0 then
  insert into public.tjanst_version_class_basis(version_id,classes) values(v.id,public.tjanst_class_source_basis(d.unit_id,d.school_year));
 end if;
 delete from public.tjanst_version_group_sources where version_id=v.id;
 insert into public.tjanst_version_group_sources(version_id,group_id,group_revision)
 select v.id,ag.group_id,ag.revision from public.elective_applied_groups ag join public.elective_group_snapshots gs on gs.group_id=ag.group_id and gs.revision=ag.revision
 where gs.unit_id=d.unit_id and gs.school_year=d.school_year;
 perform public.study_group_freeze(x.value) from jsonb_array_elements(public.tjanst_group_needs(d.unit_id,d.school_year)) x where x.value->>'sourceKind'='study_group';
 delete from public.tjanst_version_study_group_sources where version_id=v.id;
 insert into public.tjanst_version_study_group_sources(version_id,group_id,group_revision)
 select v.id,(x.value->>'groupId')::uuid,(x.value->>'groupRevision')::integer from jsonb_array_elements(public.tjanst_group_needs(d.unit_id,d.school_year)) x where x.value->>'sourceKind'='study_group';
 update public.tjanst_versions set status='superseded' where distribution_id=d.id and status='published';
 update public.tjanst_versions set status='published',content_hash=h,published_by_identity_id=s.identity_id,published_by_assignment_id=a.id,published_at=clock_timestamp()
 where id=v.id;
 return v.id;
end $function$;

CREATE OR REPLACE FUNCTION public.tjanst_version_hash(version uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select public.tjanst_hash(jsonb_build_array('tjanst_content_v2',d.unit_id,d.school_year,
  coalesce((select jsonb_agg(t.staff_person_id order by t.staff_person_id) from public.tjanst_version_teachers t where t.version_id=v.id),'[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_array(r.lineage_id,r.source_key,r.staff_person_id,r.link_revision,r.timplan_id,r.timplan_version,r.link_column,
    r.need_ht_minutes,r.need_vt_minutes,r.need_basis,r.teacher_ht_minutes,r.teacher_vt_minutes,r.comment) order by r.lineage_id)
   from public.tjanst_rows r where r.version_id=v.id),'[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_array(s.lineage_id,s.kind,s.label,s.staff_person_id,s.class_id,s.ht_minutes,s.vt_minutes,s.comment) order by s.lineage_id)
   from public.tjanst_special_assignments s where s.version_id=v.id),'[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_array(g.lineage_id,g.name,
     (select jsonb_agg(r.lineage_id order by r.lineage_id) from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id),
     (select jsonb_agg(jsonb_build_array(t.staff_person_id,t.ht_minutes,t.vt_minutes) order by t.staff_person_id) from public.tjanst_joint_teacher_time t where t.group_id=g.id))
    order by g.lineage_id) from public.tjanst_joint_groups g where g.version_id=v.id),'[]'::jsonb))
  -- 05.1-33: delning läggs bara till när den finns, så hashen för versioner utan delning är oförändrad.
  ||case when exists(select 1 from public.tjanst_need_sharing s where s.version_id=v.id) then jsonb_build_array(jsonb_build_array('sharing_v1',
   (select jsonb_agg(jsonb_build_array(s.source_key,s.mode,(select jsonb_agg(g.staff_person_id order by g.staff_person_id) from public.tjanst_need_graders g
     where g.version_id=s.version_id and g.source_key=s.source_key)) order by s.source_key) from public.tjanst_need_sharing s where s.version_id=v.id))) else '[]'::jsonb end
  ||case when jsonb_array_length(coalesce(public.tjanst_version_groups(version),'[]'::jsonb))>0 or exists(select 1 from public.tjanst_rows r where r.version_id=version and r.source_kind in ('teaching_group','study_group')) then
  jsonb_build_array(jsonb_build_array('teaching_groups_v1',public.tjanst_version_groups(version),public.tjanst_version_class_sources(version),
    (select coalesce(jsonb_agg(jsonb_build_array(r.lineage_id,r.group_id,r.group_revision,r.group_snapshot) order by r.lineage_id),'[]'::jsonb) from public.tjanst_rows r where r.version_id=version and r.source_kind in ('teaching_group','study_group')))) else '[]'::jsonb end)
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id where v.id=version
$function$;

CREATE OR REPLACE FUNCTION public.tjanst_self_projection(a access_assignments)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare p public.staff_people:=public.tjanst_self_person(a);publications jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('versionId',v.id,'versionNo',v.version_no,'unitId',d.unit_id,
   'schoolName',(select u.name from public.school_units u where u.id=d.unit_id),'schoolYear',d.school_year,
   'publishedAt',to_char(v.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'contentHash',v.content_hash,
   'rows',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'className',c.name,'rowKey',r.timplan_row_key,'label',r.need_label,
     'ht',r.teacher_ht_minutes,'vt',r.teacher_vt_minutes,
     'sharing',(select jsonb_build_object('mode',s.mode,
       'colleagues',coalesce((select jsonb_agg(distinct left(o.given_name||' '||o.family_name,200)) from public.tjanst_rows o_r join public.staff_people o on o.id=o_r.staff_person_id
         where o_r.version_id=v.id and o_r.source_key=r.source_key and o.id<>p.id and not exists(select 1 from public.tjanst_joint_members om where om.row_id=o_r.id)),'[]'::jsonb),
       'grader',exists(select 1 from public.tjanst_need_graders g where g.version_id=v.id and g.source_key=r.source_key and g.staff_person_id=p.id))
      from public.tjanst_need_sharing s where s.version_id=v.id and s.source_key=r.source_key and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id)),
     'joint',(select jsonb_build_object('jointId',g.id,'name',g.name,
       'colleagues',coalesce((select jsonb_agg(left(o.given_name||' '||o.family_name,200) order by o.family_name collate "C",o.given_name collate "C")
         from public.tjanst_joint_teacher_time t join public.staff_people o on o.id=t.staff_person_id where t.group_id=g.id and o.id<>p.id),'[]'::jsonb),
       'ht',coalesce((select t.ht_minutes from public.tjanst_joint_teacher_time t where t.group_id=g.id and t.staff_person_id=p.id),0),
       'vt',coalesce((select t.vt_minutes from public.tjanst_joint_teacher_time t where t.group_id=g.id and t.staff_person_id=p.id),0))
      from public.tjanst_joint_members m join public.tjanst_joint_groups g on g.id=m.group_id where m.row_id=r.id))||case when r.source_kind='study_group' then jsonb_build_object('sourceKind','study_group','groupId',r.group_id,'groupName',r.group_snapshot->'name',
      'classRefs',(select coalesce(jsonb_agg(jsonb_build_object('classId',sc.id,'name',sc.name) order by sc.id),'[]'::jsonb) from public.school_classes sc where r.group_snapshot->'classIds' ? sc.id::text),
      'subjectCode',r.group_snapshot->'subjectCode','levelCode',r.group_snapshot->'levelCode','language',r.group_snapshot->'language')
     when r.source_kind='teaching_group' then jsonb_build_object('sourceKind','teaching_group','groupId',r.group_id,'groupName',r.group_snapshot->'name',
      'classRefs',(select jsonb_agg(jsonb_build_object('classId',sr.value->'classId','name',sr.value->'className') order by sr.value->>'classId') from jsonb_array_elements(r.group_snapshot->'sourceRefs') sr),
      'subjectCode',r.group_snapshot->'subjectCode','levelCode',r.group_snapshot->'levelCode','language',r.group_snapshot->'language') else '{}'::jsonb end
     order by c.name collate "C",r.need_label collate "C",r.id),'[]'::jsonb)
    from public.tjanst_rows r left join public.school_classes c on c.id=r.class_id where r.version_id=v.id and r.staff_person_id=p.id),
   'specials',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'label',s.label,'className',(select c.name from public.school_classes c where c.id=s.class_id),
     'ht',s.ht_minutes,'vt',s.vt_minutes) order by s.kind,s.label collate "C",s.id),'[]'::jsonb)
    from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id=p.id),
   'acknowledgedAt',(select to_char(f.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from public.tjanst_feedback f where f.version_id=v.id and f.staff_person_id=p.id and f.kind='ack'),
   'comments',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'body',f.body,'at',to_char(f.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by f.created_at,f.id),'[]'::jsonb)
    from public.tjanst_feedback f where f.version_id=v.id and f.staff_person_id=p.id and f.kind='comment'))
   order by d.school_year desc,d.unit_id),'[]'::jsonb) into publications
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id
 where v.status='published' and d.customer_id=a.customer_id and d.organizer_id=a.organizer_id
  and d.unit_id=any(public.tjanst_self_unit_ids(a))
  and (exists(select 1 from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_version_teachers t where t.version_id=v.id and t.staff_person_id=p.id));
 return jsonb_build_object('contractVersion','tjanst_v1','person',jsonb_build_object('id',p.id,'displayName',left(p.given_name||' '||p.family_name,200)),
  'publications',publications,'capabilities',jsonb_build_object('canAck',true,'canComment',true));
end $function$;


-- Private helpers: no new direct Worker entry points.
revoke all on function public.study_group_tjanst_lock(),public.study_group_need(public.study_groups),public.study_group_freeze(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;

