-- VB03: explicita tillämpade undervisningsgrupper och frysta tjänsteögonblicksbilder.
-- SS12000 2.1.0: Group/Undervisning, stabilt ID och daterade medlemskap; ingen extern anslutning.
-- Klassens utbildningsram ligger kvar i RAW tjanst_needs. Bara arbetsprojektionen reduceras.
create table public.elective_group_snapshots(
 group_id uuid not null references public.teaching_groups(id), revision integer not null check(revision>0),
 unit_id uuid not null references public.school_units(id), school_year integer not null check(school_year between 2000 and 2100),
 block_id uuid not null references public.elective_blocks(id),snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 created_at timestamptz not null default clock_timestamp(),primary key(group_id,revision)
);
create table public.elective_applied_groups(
 group_id uuid primary key references public.teaching_groups(id),revision integer not null,
 foreign key(group_id,revision) references public.elective_group_snapshots(group_id,revision)
);
alter table public.elective_group_snapshots enable row level security;
alter table public.elective_group_snapshots force row level security;
alter table public.elective_applied_groups enable row level security;
alter table public.elective_applied_groups force row level security;
revoke all on public.elective_group_snapshots,public.elective_applied_groups from public,anon,authenticated,service_role,skolplattform_worker;
create trigger elective_group_snapshots_immutable before update or delete on public.elective_group_snapshots for each row execute function public.elective_command_guard();
create trigger elective_group_snapshots_no_truncate before truncate on public.elective_group_snapshots for each statement execute function public.elective_command_guard();

alter table public.tjanst_rows add column group_id uuid references public.teaching_groups(id),
 add column group_revision integer,add column group_snapshot jsonb;
alter table public.tjanst_rows alter column class_id drop not null,alter column link_revision drop not null,
 alter column timplan_id drop not null,alter column series_id drop not null,alter column timplan_version drop not null,alter column link_column drop not null;
alter table public.tjanst_rows drop constraint tjanst_rows_source_kind_check;
-- Drop exactly the old source-identity CHECK; preserve every time/range/FK/immutable guard.
do $$declare c record;begin
 for c in select conname from pg_constraint where conrelid='public.tjanst_rows'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%source_key =%' loop execute format('alter table public.tjanst_rows drop constraint %I',c.conname);end loop;
end $$;
alter table public.tjanst_rows add constraint tjanst_rows_source_variant check((
 (source_kind='class_timplan' and class_id is not null and link_revision is not null and timplan_id is not null and series_id is not null
  and timplan_version is not null and link_column is not null and group_id is null and group_revision is null and group_snapshot is null
  and source_key='class_timplan:'||class_id::text||':'||school_year::text||':'||timplan_row_key)
 or (source_kind='teaching_group' and class_id is null and link_revision is null and timplan_id is null and series_id is null
  and timplan_version is null and link_column is null and group_id is not null and group_revision is not null and group_revision>0 and group_snapshot is not null and jsonb_typeof(group_snapshot)='object'
  and group_snapshot->>'groupId'=group_id::text and group_snapshot->'groupRevision'=to_jsonb(group_revision)
  and group_snapshot->>'sourceKey'=source_key and source_key='teaching_group:'||group_id::text||':'||school_year::text
  and timplan_row_key='group:'||group_id::text)
) is true);
alter table public.tjanst_rows add constraint tjanst_rows_group_snapshot_ref foreign key(group_id,group_revision)
 references public.elective_group_snapshots(group_id,revision);

-- Hook för VB09, stängd tills riktiga daterade medlemskap finns. Samma sessionsväg/mandat som förr.
create function public.elective_placement_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin raise exception 'Placement unavailable' using errcode='22023',hint='elective_action_unavailable';end $$;
create function public.elective_retire_group(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin raise exception 'Group retirement unavailable' using errcode='22023',hint='elective_action_unavailable';end $$;
create function public.elective_group_membership(group_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('memberCount',null,'membershipRevision',0,'membershipHash',substr(public.tjanst_hash('[]'::jsonb),8))
$$;

create function public.elective_lock_sources(refs jsonb,school_year integer) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare target uuid;begin
 -- Samma globala ordning som klasskommandot och timplansdetaljerna: planer, därefter klasskopplingar.
 for target in select distinct public.tjanst_uuid(x.value->'timplanId') from jsonb_array_elements(refs) x order by 1 loop
  perform 1 from public.timplans where id=target for share;
 end loop;
 for target in select distinct public.tjanst_uuid(x.value->'classId') from jsonb_array_elements(refs) x order by 1 loop
  perform 1 from public.class_timplans l where l.class_id=target and l.start_year=school_year for share;
 end loop;
end $$;
create or replace function public.elective_check_block_sources(block_id uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare b public.elective_blocks;r public.elective_block_sources;current_sources jsonb;refs jsonb;begin
 select * into b from public.elective_blocks where id=block_id;
 if b.id is null then raise exception 'Elective block absent' using errcode='22023',hint='elective_invalid';end if;
 select coalesce(jsonb_agg(source_ref),'[]') into refs from public.elective_block_sources where elective_block_sources.block_id=b.id and active;
 perform public.elective_lock_sources(refs,b.school_year);
 current_sources:=public.elective_sources(b.unit_id,b.school_year);
 for r in select s.* from public.elective_block_sources s where s.block_id=b.id and s.active loop
  if not exists(select 1 from jsonb_array_elements(current_sources) x where x.value=r.source_ref) then
   raise exception 'Elective source changed' using errcode='40001',hint='elective_stale_source';end if;
  if r.source_ref->'needHt'='null'::jsonb or r.source_ref->'needVt'='null'::jsonb then
   raise exception 'Elective time is unknown' using errcode='22023',hint='elective_time_missing';end if;
 end loop;
end $$;
create function public.elective_apply_groups(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare b public.elective_blocks;g public.teaching_groups;o public.elective_options;refs jsonb;first_ref jsonb;next_snapshot jsonb;previous public.elective_group_snapshots;next_revision integer;
begin
 perform public.elective_require_shape(input->'payload',array['blockId','expectedBlockRevision']);
 select * into b from public.elective_blocks where id=public.tjanst_uuid(input->'payload'->'blockId') for update;
 if b.id is null or b.unit_id<>(input->>'unitId')::uuid or b.school_year<>(input->>'schoolYear')::integer then raise exception 'Block denied' using errcode='42501';end if;
 if input->'payload'->'expectedBlockRevision' is distinct from to_jsonb(b.revision) then raise exception 'Block changed' using errcode='40001',hint='elective_revision_conflict';end if;
 perform public.elective_check_block_sources(b.id);
 if not exists(select 1 from public.teaching_groups where block_id=b.id and active) then raise exception 'No concrete groups' using errcode='22023',hint='elective_invalid';end if;
 -- Ett källutrymme får organiseras i flera alternativ i SAMMA block, men inte två konkurrerande block.
 if exists(select 1 from public.elective_applied_groups ag join public.elective_group_snapshots s on s.group_id=ag.group_id and s.revision=ag.revision
   cross join lateral jsonb_array_elements(s.snapshot->'sourceRefs') sr
   join public.elective_block_sources bs on bs.source_key=sr.value->>'sourceKey' and bs.block_id=b.id and bs.active
   where s.block_id<>b.id and s.unit_id=b.unit_id and s.school_year=b.school_year) then
  raise exception 'Frame already organized in another block' using errcode='40001',hint='elective_block_in_use';end if;
 for g in select * from public.teaching_groups where block_id=b.id and active order by id loop
  select * into o from public.elective_options where id=g.option_id and block_id=b.id and active;
  select jsonb_agg(bs.source_ref order by gs.class_id,gs.source_key collate "C") into refs
   from public.teaching_group_sources gs join public.elective_block_sources bs on bs.block_id=gs.block_id and bs.source_key=gs.source_key
   where gs.group_id=g.id and bs.active;
  first_ref:=refs->0;
  if o.id is null or refs is null or first_ref->'needHt'='null'::jsonb or first_ref->'needVt'='null'::jsonb
   or (first_ref->>'needHt')::integer+(first_ref->>'needVt')::integer<=0
   or exists(select 1 from jsonb_array_elements(refs) r where (r.value->'needHt',r.value->'needVt',r.value->'needBasis') is distinct from (first_ref->'needHt',first_ref->'needVt',first_ref->'needBasis')) then
   raise exception 'Concrete group time is invalid' using errcode='22023',hint='elective_time_conflict';end if;
  next_snapshot:=jsonb_build_object('sourceKind','teaching_group','sourceKey','teaching_group:'||g.id::text||':'||b.school_year::text,
   'rowKey','group:'||g.id::text,'groupId',g.id,'blockId',b.id,'optionId',o.id,'name',g.name,'label',o.name,
   'subjectCode',o.subject_code,'levelCode',o.level_code,'language',o.language,
   'classIds',(select jsonb_agg(distinct (r.value->>'classId')::uuid order by (r.value->>'classId')::uuid) from jsonb_array_elements(refs) r),
   'sourceRefs',refs,'needHt',first_ref->'needHt','needVt',first_ref->'needVt','needBasis',first_ref->'needBasis','stale',false);
  select * into previous from public.elective_group_snapshots where group_id=g.id order by revision desc limit 1;
  if previous.group_id is null or previous.snapshot-'groupRevision' is distinct from next_snapshot then
   next_revision:=coalesce(previous.revision,0)+1;next_snapshot:=next_snapshot||jsonb_build_object('groupRevision',next_revision);
   insert into public.elective_group_snapshots(group_id,revision,unit_id,school_year,block_id,snapshot) values(g.id,next_revision,b.unit_id,b.school_year,b.id,next_snapshot);
  else next_revision:=previous.revision;end if;
  insert into public.elective_applied_groups values(g.id,next_revision) on conflict(group_id) do update set revision=excluded.revision;
 end loop;
 delete from public.elective_applied_groups ag using public.teaching_groups tg where ag.group_id=tg.id and tg.block_id=b.id and not tg.active;
 update public.elective_blocks set applied=true,applied_revision=revision,applied_snapshot=public.elective_block_json(b,false) where id=b.id;
 return jsonb_build_object('objectId',b.id,'objectRevision',b.revision);
end $$;
create function public.tjanst_working_version(unit uuid,school_year integer) returns uuid
language sql stable security definer set search_path=pg_catalog,public as $$
 select v.id from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id
 where d.unit_id=unit and d.school_year=tjanst_working_version.school_year and v.status in ('draft','published')
 order by (v.status='draft') desc,v.version_no desc limit 1
$$;
create function public.tjanst_group_needs(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare sources jsonb;result jsonb;begin
 if not exists(select 1 from public.elective_applied_groups a join public.elective_group_snapshots s on s.group_id=a.group_id and s.revision=a.revision where s.unit_id=unit and s.school_year=tjanst_group_needs.school_year) then return '[]'::jsonb;end if;
 sources:=public.elective_sources(unit,school_year);
 select coalesce(jsonb_agg(s.snapshot||jsonb_build_object('stale',exists(select 1 from jsonb_array_elements(s.snapshot->'sourceRefs') r
  where not exists(select 1 from jsonb_array_elements(sources) c where c.value=r.value))) order by s.group_id),'[]') into result
 from public.elective_applied_groups ag join public.elective_group_snapshots s on s.group_id=ag.group_id and s.revision=ag.revision
 where s.unit_id=unit and s.school_year=tjanst_group_needs.school_year;
 return result;
end $$;
create function public.tjanst_needs_with_groups(unit uuid,school_year integer,groups jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb:='[]';c jsonb;n jsonb;updated jsonb;class_needs jsonb;raw jsonb:=public.tjanst_needs(unit,school_year);
 sources jsonb;covered jsonb;ht integer;vt integer;has_organization boolean;retired_frames jsonb;
begin
 select coalesce(jsonb_agg(distinct coalesce(sr.value->>'frameSourceKey',sr.value->>'sourceKey')),'[]') into retired_frames
 from public.elective_group_snapshots gs join public.teaching_groups tg on tg.id=gs.group_id
 cross join lateral jsonb_array_elements(gs.snapshot->'sourceRefs') sr
 where gs.unit_id=unit and gs.school_year=tjanst_needs_with_groups.school_year and not tg.active
  and not exists(select 1 from public.elective_applied_groups ag where ag.group_id=gs.group_id)
  and gs.revision=(select max(s2.revision) from public.elective_group_snapshots s2 where s2.group_id=gs.group_id);
 if jsonb_array_length(groups)=0 and jsonb_array_length(retired_frames)=0 and not exists(select 1 from public.elective_time_details d where d.unit_id=unit and d.school_year=tjanst_needs_with_groups.school_year and d.applied_revision is not null) then return raw;end if;
 sources:=public.elective_sources(unit,school_year);
 for c in select value from jsonb_array_elements(raw) loop
  class_needs:='[]';
  for n in select value from jsonb_array_elements(c->'needs') loop
   -- Distinct position keys: two alternatives and a shared class never subtract the same frame twice.
   select coalesce(jsonb_agg(distinct r.value->>'sourceKey'),'[]') into covered
    from jsonb_array_elements(groups) g cross join lateral jsonb_array_elements(g.value->'sourceRefs') r
    where coalesce(r.value->>'frameSourceKey',r.value->>'sourceKey')=n->>'sourceKey';
   has_organization:=jsonb_array_length(covered)>0;
   updated:=n;
   if has_organization then
    select case when n->'needHt'='null'::jsonb then null else greatest(0,(n->>'needHt')::integer-coalesce(sum((r.value->>'needHt')::integer),0)) end,
     case when n->'needVt'='null'::jsonb then null else greatest(0,(n->>'needVt')::integer-coalesce(sum((r.value->>'needVt')::integer),0)) end into ht,vt
     from (select distinct on (sr.value->>'sourceKey') sr.value from jsonb_array_elements(groups) gg
       cross join lateral jsonb_array_elements(gg.value->'sourceRefs') sr
       where coalesce(sr.value->>'frameSourceKey',sr.value->>'sourceKey')=n->>'sourceKey' order by sr.value->>'sourceKey') r;
    if ht+vt=0 then continue;end if;
    updated:=n||jsonb_build_object('needHt',ht,'needVt',vt,'organizationPending',true);
   elsif retired_frames ? (n->>'sourceKey') or exists(select 1 from public.elective_time_details d where d.unit_id=unit and d.school_year=tjanst_needs_with_groups.school_year and d.applied_revision is not null and d.timplan_id=(c->'link'->>'timplanId')::uuid and d.row_key=n->>'rowKey' and d.column_id=c->'link'->>'column') then
    updated:=n||jsonb_build_object('organizationPending',true);
   end if;
   class_needs:=class_needs||jsonb_build_array(updated);
  end loop;
  result:=result||jsonb_build_array(c||jsonb_build_object('needs',class_needs));
 end loop;
 return result;
end $$;


create function public.tjanst_working_needs(unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.tjanst_needs_with_groups(unit,school_year,public.tjanst_group_needs(unit,school_year))
$$;
-- Samma unikhet som de två tidigare partiella indexen, nu möjlig att skjuta upp under en atomisk personpermutation.
drop index public.tjanst_rows_teacher_source;
drop index public.tjanst_rows_vacant_source;
alter table public.tjanst_rows add constraint tjanst_rows_person_source unique nulls not distinct(version_id,staff_person_id,source_key) deferrable initially immediate;
create table public.tjanst_version_group_sources(
 version_id uuid not null references public.tjanst_versions(id),group_id uuid not null,group_revision integer not null,
 primary key(version_id,group_id),foreign key(group_id,group_revision) references public.elective_group_snapshots(group_id,revision)
);
alter table public.tjanst_version_group_sources enable row level security;
alter table public.tjanst_version_group_sources force row level security;
revoke all on public.tjanst_version_group_sources from public,anon,authenticated,service_role,skolplattform_worker;
create trigger tjanst_group_sources_guard before insert or update or delete on public.tjanst_version_group_sources for each row execute function public.tjanst_version_guard();
create trigger tjanst_group_sources_no_truncate before truncate on public.tjanst_version_group_sources for each statement execute function public.tjanst_version_guard();
create function public.tjanst_version_groups(version uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select case when v.status='draft' then public.tjanst_group_needs(d.unit_id,d.school_year)
 else coalesce((select jsonb_agg(s.snapshot order by s.group_id) from public.tjanst_version_group_sources vg
 join public.elective_group_snapshots s on s.group_id=vg.group_id and s.revision=vg.group_revision where vg.version_id=v.id),'[]'::jsonb) end
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id where v.id=version
$$;
-- Nya grupppubliceringar fryser även den då granskade ram-/gruppmaskningen och klass-/timplansmetadata.
-- Äldre klasspubliceringar får ingen ny projektion och behåller exakt tidigare läsbeteende.
create table public.tjanst_version_class_basis(
 version_id uuid primary key references public.tjanst_versions(id),classes jsonb not null check(jsonb_typeof(classes)='array')
);
alter table public.tjanst_version_class_basis enable row level security;
alter table public.tjanst_version_class_basis force row level security;
revoke all on public.tjanst_version_class_basis from public,anon,authenticated,service_role,skolplattform_worker;
create trigger tjanst_class_basis_guard before insert or update or delete on public.tjanst_version_class_basis for each row execute function public.tjanst_version_guard();
create trigger tjanst_class_basis_no_truncate before truncate on public.tjanst_version_class_basis for each statement execute function public.tjanst_version_guard();
create function public.tjanst_class_source_basis(unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(c.value||jsonb_build_object('aplMinutes',public.tjanst_class_apl_minutes(c.value->'link')) order by c.n),'[]'::jsonb)
 from jsonb_array_elements(public.tjanst_working_needs(unit,school_year)) with ordinality c(value,n)
$$;
create function public.tjanst_version_class_sources(version uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select case when v.status='draft' then public.tjanst_class_source_basis(d.unit_id,d.school_year)
 else (select b.classes from public.tjanst_version_class_basis b where b.version_id=v.id) end
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id where v.id=version
$$;
create function public.tjanst_group_row_snapshot_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
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
end $$;
create trigger tjanst_rows_group_source before insert or update on public.tjanst_rows for each row execute function public.tjanst_group_row_snapshot_guard();


create or replace function public.elective_save_block(input jsonb) returns jsonb
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
 perform public.elective_lock_sources(d->'sourceRefs',year);
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
 on conflict(id) do update set kind=excluded.kind,name=excluded.name,starts_on=excluded.starts_on,ends_on=excluded.ends_on,revision=elective_blocks.revision+1,applied=false,offering_revision=elective_blocks.offering_revision+case when old_offer is distinct from new_offer then 1 else 0 end returning * into b;
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
  values((g->>'id')::uuid,b.id,(g->>'optionId')::uuid,g->>'name',(g->>'startsOn')::date,(g->>'endsOn')::date,(g->>'estimatedPupils')::integer) on conflict(id) do update set name=excluded.name,estimated_pupils=excluded.estimated_pupils,revision=teaching_groups.revision+case when (teaching_groups.name,teaching_groups.estimated_pupils) is distinct from (excluded.name,excluded.estimated_pupils) then 1 else 0 end,active=true;
  for k in select jsonb_array_elements_text(g->'sourceKeys') loop
   select s.class_id into object_id from public.elective_block_sources s where s.block_id=b.id and s.source_key=k;
   insert into public.teaching_group_sources values((g->>'id')::uuid,b.id,k,object_id) on conflict(group_id,source_key) do nothing;
  end loop;
 end loop;
 return jsonb_build_object('objectId',b.id,'objectRevision',b.revision);
end $$;

create or replace function public.elective_group_json(g public.teaching_groups,can_read_pupils boolean default false) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',g.id,'optionId',g.option_id,'name',g.name,'startsOn',g.starts_on,'endsOn',g.ends_on,
  'classIds',coalesce((select jsonb_agg(s.class_id order by s.source_key collate "C") from public.teaching_group_sources s where s.group_id=g.id),'[]'),
  'sourceKeys',coalesce((select jsonb_agg(s.source_key order by s.source_key collate "C") from public.teaching_group_sources s where s.group_id=g.id),'[]'),
  'estimatedPupils',g.estimated_pupils,'memberCount',case when can_read_pupils then public.elective_group_membership(g.id)->'memberCount' else 'null'::jsonb end,'membershipRevision',public.elective_group_membership(g.id)->'membershipRevision')
$$;

create or replace function public.elective_block_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;unit uuid;year integer;command uuid;action_name text;request_hash text;s public.elective_school_state;j public.elective_commands;result jsonb;meta jsonb;envelope jsonb;begin
 perform public.elective_require_shape(input,array['commandId','unitId','schoolYear','expectedRevision','action','payload']);
 unit:=public.tjanst_uuid(input->'unitId');command:=public.tjanst_uuid(input->'commandId');year:=(input->>'schoolYear')::integer;action_name:=input->>'action';
 if action_name not in ('save_block','apply_groups','set_policy','open_round','close_round','record_choice','confirm_choice','save_placement','end_placement','retire_group') then raise exception 'Invalid elective action' using errcode='22023',hint='elective_invalid';end if;
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
 elsif action_name='retire_group' then meta:=public.elective_retire_group(input);
 elsif action_name='apply_groups' then meta:=public.elective_apply_groups(input);
 elsif action_name in ('save_placement','end_placement') then meta:=public.elective_placement_command(input);
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

create or replace function public.tjanst_plan_parse_legacy(input jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
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
   or coalesce(p->>'sourceKind','') not in ('class_timplan','teaching_group') or jsonb_typeof(p->'sourceKey') is distinct from 'string'
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
end $$;

create or replace function public.tjanst_year_payload(kind text,p jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare ht jsonb;vt jsonb;
begin
 if kind='row' then
  if not public.phase5_programplan_shape(p,array['rowId','sourceKind','sourceKey','personId','teacherHt','teacherVt','comment'])
   or coalesce(p->>'sourceKind','') not in ('class_timplan','teaching_group') or not public.phase5_apl_text(p->'sourceKey',240,false)
   or not ((p->>'sourceKind'='class_timplan' and coalesce(p->>'sourceKey','')~'^class_timplan:[0-9a-f-]{36}:[0-9]{4}:.{1,160}$') or (p->>'sourceKind'='teaching_group' and coalesce(p->>'sourceKey','')~'^teaching_group:[0-9a-f-]{36}:[0-9]{4}$')) then
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
end $$;

create or replace function public.tjanst_row_json(r public.tjanst_rows,current_need jsonb) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',r.id,'lineageId',r.lineage_id,'sourceKind',r.source_kind,'sourceKey',r.source_key,'classId',r.class_id,
  'rowKey',r.timplan_row_key,'personId',r.staff_person_id,'teacherHt',r.teacher_ht_minutes,'teacherVt',r.teacher_vt_minutes,
  'needHt',r.need_ht_minutes,'needVt',r.need_vt_minutes,'needBasis',r.need_basis,
  -- Ändrad koppling eller behov markerar raden; ögonblicksbilden skrivs aldrig om tyst (P6).
  'stale',case when r.source_kind='teaching_group' then current_need is null or coalesce((current_need->>'stale')::boolean,true) or current_need->'groupRevision' is distinct from to_jsonb(r.group_revision) else current_need is null or (current_need->'link'->>'linkRevision')::integer<>r.link_revision or (current_need->'link'->>'timplanId')::uuid<>r.timplan_id
   or current_need->>'needBasis'<>r.need_basis or (current_need->>'needHt')::integer is distinct from r.need_ht_minutes
   or (current_need->>'needVt')::integer is distinct from r.need_vt_minutes end,
  'jointGroupId',null,'comment',r.comment)||case when r.source_kind='teaching_group' then jsonb_build_object('groupId',r.group_id,'groupRevision',r.group_revision,'classIds',r.group_snapshot->'classIds','sourceRefs',r.group_snapshot->'sourceRefs') else '{}'::jsonb end
$$;

create or replace function public.tjanst_plan_save_row(a public.access_assignments,d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
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
    need->>'needBasis',(p->>'teacherHt')::integer,(p->>'teacherVt')::integer,p->>'comment',(need->>'groupId')::uuid,(need->>'groupRevision')::integer,case when need->>'sourceKind'='teaching_group' then need else null end) returning id into row_id;
  else
   update public.tjanst_rows set staff_person_id=person,source_kind=need->>'sourceKind',group_id=(need->>'groupId')::uuid,group_revision=(need->>'groupRevision')::integer,group_snapshot=case when need->>'sourceKind'='teaching_group' then need else null end,source_key=need->>'sourceKey',class_id=(need->>'classId')::uuid,link_revision=(link->>'linkRevision')::integer,
    timplan_id=(link->>'timplanId')::uuid,series_id=(link->>'seriesId')::uuid,timplan_version=(link->>'timplanVersion')::integer,timplan_row_key=need->>'rowKey',
    link_column=link->>'column',need_label=left(need->>'label',300),need_ht_minutes=(need->>'needHt')::integer,need_vt_minutes=(need->>'needVt')::integer,
    need_basis=need->>'needBasis',teacher_ht_minutes=(p->>'teacherHt')::integer,teacher_vt_minutes=(p->>'teacherVt')::integer,comment=p->>'comment'
   where id=(p->>'rowId')::uuid and version_id=v.id returning id into row_id;
   if row_id is null then raise exception 'Unknown row' using errcode='22023',hint='tjanst_invalid';end if;
  end if;
 exception when unique_violation then raise exception 'Duplicate row' using errcode='22023',hint='tjanst_duplicate_row';end;
 return v.id;
end $$;

create or replace function public.tjanst_plan_create_draft(a public.access_assignments,s public.app_sessions,d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare published public.tjanst_versions;v public.tjanst_versions;
begin
 if exists(select 1 from public.tjanst_versions x where x.distribution_id=d.id and x.status='draft') then
  raise exception 'Draft exists' using errcode='40001',hint='tjanst_revision_conflict';end if;
 select * into published from public.tjanst_versions x where x.distribution_id=d.id and x.status='published';
 if (published.id is null)<>(p->'basedOnVersionId'='null'::jsonb) or (published.id is not null and published.id<>(p->>'basedOnVersionId')::uuid) then
  raise exception 'Published version changed' using errcode='40001',hint='tjanst_published_meanwhile';end if;
 insert into public.tjanst_versions(distribution_id,version_no,status,based_on_version_id,created_by_identity_id,created_by_assignment_id)
 values(d.id,coalesce((select max(x.version_no) from public.tjanst_versions x where x.distribution_id=d.id),0)+1,'draft',published.id,s.identity_id,a.id) returning * into v;
 if published.id is not null then
  -- Ny version: samma lineage_id, nya rad-id; ögonblicksbilderna följer med oförändrade och markeras om underlaget har ändrats.
  insert into public.tjanst_version_teachers(version_id,staff_person_id) select v.id,t.staff_person_id from public.tjanst_version_teachers t where t.version_id=published.id;
  insert into public.tjanst_rows(version_id,lineage_id,staff_person_id,source_kind,source_key,class_id,school_year,link_revision,timplan_id,series_id,timplan_version,
   timplan_row_key,link_column,need_label,need_ht_minutes,need_vt_minutes,need_basis,teacher_ht_minutes,teacher_vt_minutes,comment,group_id,group_revision,group_snapshot)
  select v.id,r.lineage_id,r.staff_person_id,r.source_kind,r.source_key,r.class_id,r.school_year,r.link_revision,r.timplan_id,r.series_id,r.timplan_version,
   r.timplan_row_key,r.link_column,r.need_label,r.need_ht_minutes,r.need_vt_minutes,r.need_basis,r.teacher_ht_minutes,r.teacher_vt_minutes,r.comment,r.group_id,r.group_revision,r.group_snapshot
  from public.tjanst_rows r where r.version_id=published.id;
 end if;
 return v.id;
end $$;

create or replace function public.tjanst_year_core(a public.access_assignments,unit uuid,year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d public.tjanst_distributions;v public.tjanst_versions;needs jsonb;people jsonb:='[]';p public.staff_people;
 duties jsonb;candidate jsonb;calendar jsonb;source_state jsonb;base jsonb;rows jsonb;specials jsonb;joints jsonb;person_hash text;
begin
 if a.function not in ('rektor','administrator') or year is null or year not between 2000 and 2100 then
  raise exception 'Year planning denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=year and x.customer_id=a.customer_id;
 select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status in ('draft','published') order by (x.status='draft') desc,x.version_no desc limit 1;
 needs:=public.tjanst_working_needs(unit,year); -- exactly once per request, passed through all row/batch calculations
 for p in select x.* from public.staff_people x where x.customer_id=a.customer_id and x.organizer_id=a.organizer_id
  and public.tjanst_person_at_school(a,x.id,unit,year) order by x.family_name collate "C",x.given_name collate "C",x.id loop
  select coalesce(jsonb_agg(jsonb_build_object('dutyId',s.id,'startsOn',s.starts_on,'endsOn',s.ends_on,'percent',s.percent) order by s.starts_on,s.id),'[]') into duties
   from public.staff_school_duties s where s.staff_person_id=p.id and s.unit_id=unit
    and daterange(s.starts_on,s.ends_on,'[]')&&daterange(make_date(year,7,1),make_date(year+1,6,30),'[]');
  if jsonb_array_length(duties)>200 then raise exception 'Duty catalog exceeds explicit limit' using errcode='54000',hint='tjanst_catalog_incomplete';end if;
  person_hash:=public.tjanst_year_hash('person',jsonb_build_object('unitId',unit,'schoolYear',year,'personId',p.id,
    'personRevision',p.revision,'draft',p.status='draft','duties',duties));
  candidate:=jsonb_build_object('personId',p.id,'displayName',left(p.given_name||' '||p.family_name,200),'draft',p.status='draft',
   'shareHere',(select max((x.value->>'percent')::integer) from jsonb_array_elements(duties) x),'duties',duties,
   'personBasisHash',person_hash,'qualificationStatus','unknown');
  people:=people||jsonb_build_array(candidate);
 end loop;
 if jsonb_array_length(people)>5000 then raise exception 'Year catalog exceeds explicit limit' using errcode='54000',hint='tjanst_catalog_incomplete';end if;
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('days',coalesce((select jsonb_agg(to_jsonb(sd) order by sd.day) from public.school_year_days sd where sd.school_year_id=s.id),'[]')) order by s.id),'[]')
  into calendar from public.school_years s where s.unit_id=unit and s.start_year=year;
 -- Include source revisions even where a source change leaves displayed minutes unchanged.
 select coalesce(jsonb_agg(jsonb_build_object('class',to_jsonb(c),'link',to_jsonb(l),'planRevision',t.revision,'planStatus',t.status,
   'planDecision',t.decided_on) order by c.id),'[]') into source_state
  from public.school_classes c join public.offerings o on o.id=c.offering_id left join public.class_timplans l on l.class_id=c.id and l.start_year=year
  left join public.timplans t on t.id=l.timplan_id where c.unit_id=unit and public.phase5_class_cohort_year_fits(c,year)
   and ((o.kind='gymnasium' and c.start_year between year-2 and year) or (o.kind<>'gymnasium' and c.start_year=year));
 select coalesce(jsonb_agg(jsonb_set(public.tjanst_row_json(r,public.tjanst_need(unit,year,r.source_key)),'{jointGroupId}',coalesce((select to_jsonb(m.group_id) from public.tjanst_joint_members m where m.row_id=r.id),'null'::jsonb)) order by r.id),'[]')
  into rows from public.tjanst_rows r where r.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'lineageId',s.lineage_id,'kind',s.kind,'label',s.label,'personId',s.staff_person_id,
  'classId',s.class_id,'ht',s.ht_minutes,'vt',s.vt_minutes,'comment',s.comment) order by s.id),'[]') into specials
  from public.tjanst_special_assignments s where s.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'lineageId',g.lineage_id,'name',g.name,
  'rowIds',coalesce((select jsonb_agg(m.row_id order by m.row_id) from public.tjanst_joint_members m where m.group_id=g.id),'[]'),
  'teachers',coalesce((select jsonb_agg(jsonb_build_object('personId',tt.staff_person_id,'ht',tt.ht_minutes,'vt',tt.vt_minutes) order by tt.staff_person_id)
    from public.tjanst_joint_teacher_time tt where tt.group_id=g.id),'[]')) order by g.id),'[]') into joints from public.tjanst_joint_groups g where g.version_id=v.id;
 base:=jsonb_build_object('contractVersion','tjanst_year_v1','unitId',unit,'schoolYear',year,'currentRevision',coalesce(d.revision,0),'baseVersionId',v.id);
 base:=base||jsonb_build_object('basisHash',public.tjanst_year_hash('basis',jsonb_build_object('customerId',a.customer_id,'actorId',a.membership_id,
  'assignmentId',a.id,'unitId',unit,'schoolYear',year,'baseVersionId',v.id,'currentRevision',coalesce(d.revision,0),'asOf',public.app_today(),
  'needs',needs,'sources',source_state,'calendar',calendar,'groups',public.tjanst_group_needs(unit,year))));
 return jsonb_build_object('base',base,'needs',needs,'groups',public.tjanst_group_needs(unit,year),'candidates',people,'rows',rows,'specials',specials,'joints',joints);
end $$;

create or replace function public.tjanst_year_row(core jsonb,source_key text,row_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare need jsonb;r jsonb;base jsonb:=core->'base';
begin
 select n.value||jsonb_build_object('classId',c.value->'classId','className',c.value->'name') into need
  from jsonb_array_elements(core->'needs') c cross join lateral jsonb_array_elements(c.value->'needs') n where n.value->>'sourceKey'=source_key;
 if need is null then select jsonb_build_object('sourceKind','teaching_group','sourceKey',g.value->'sourceKey','rowKey',g.value->'rowKey','label',g.value->'label','needHt',g.value->'needHt','needVt',g.value->'needVt','needBasis',g.value->'needBasis','classId',null,'className',g.value->'name','groupId',g.value->'groupId','classIds',g.value->'classIds') into need from jsonb_array_elements(core->'groups') g where g.value->>'sourceKey'=source_key;end if;
 if need is null then raise exception 'Unknown current need' using errcode='22023',hint='tjanst_unknown_source';end if;
 if row_id is not null then
  select x.value into r from jsonb_array_elements(core->'rows') x where x.value->>'id'=row_id::text and x.value->>'sourceKey'=source_key;
  if r is null then raise exception 'Current row denied' using errcode='42501';end if;
 end if;
 base:=base||jsonb_build_object('basisHash',public.tjanst_year_hash('basis',jsonb_build_object('coreBasisHash',base->'basisHash','sourceKey',source_key,'rowId',row_id)));
 return base||jsonb_build_object('mode','row','sourceKey',source_key,'rowId',row_id,'need',need,'currentRow',r,
  'candidates',core->'candidates','totalCandidates',jsonb_array_length(core->'candidates'))||public.tjanst_year_recommendations(core,need);
end $$;

create or replace function public.tjanst_year_recommendations(core jsonb,need jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare history jsonb;refs jsonb:='[]';r jsonb;c jsonb;reason text;own jsonb;reasons jsonb;result jsonb:='[]';evidence text;
 base jsonb:=core->'base';
begin
 if need->>'sourceKind'='teaching_group' then return jsonb_build_object('recommendationStatus','empty','suggestions','[]'::jsonb);end if;
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
end $$;

create or replace function public.tjanst_year_batch(core jsonb,batch jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare base jsonb:=core->'base';action text:=batch->>'action';items jsonb:='[]';blockers jsonb:='[]';totals jsonb:='[]';
 item jsonb;p jsonb;choice jsonb;original jsonb;support jsonb;context jsonb;entry jsonb;grp jsonb;other jsonb;t jsonb;after_person jsonb;
 issue text;item_key text;kind text;gid text;affected text[]:='{}';group_ids text[]:='{}';group_state jsonb:='[]';result jsonb;key text;count_objects integer;
begin
 if not public.phase5_programplan_shape(batch,array['action','baseVersionId','items']) or (action is null or action not in ('move','bulk'))
  or jsonb_typeof(batch->'items') is distinct from 'array' then raise exception 'Invalid year batch' using errcode='22023',hint='tjanst_invalid';end if;
 if batch->'baseVersionId'<>'null'::jsonb then perform public.tjanst_uuid(batch->'baseVersionId');end if;
 if batch->'baseVersionId' is distinct from base->'baseVersionId' then raise exception 'Current base changed' using errcode='40001',hint='tjanst_stale_basis';end if;
 if action='move' and batch->'baseVersionId'='null'::jsonb then raise exception 'Move requires current version' using errcode='22023',hint='tjanst_invalid';end if;
 if jsonb_array_length(batch->'items') not between 1 and 100 then raise exception 'Batch limit' using errcode='22023',hint='tjanst_batch_too_large';end if;
 if (select count(distinct x.value->>'itemKey') from jsonb_array_elements(batch->'items') x)<>jsonb_array_length(batch->'items') then
  raise exception 'Duplicate batch key' using errcode='22023',hint='tjanst_duplicate_row';end if;
 for item in select x.value from jsonb_array_elements(batch->'items') x loop
  item_key:=item->>'itemKey';kind:=item->>'kind';issue:=null;gid:=null;original:=null;support:=null;p:=null;
  if not public.phase5_apl_text(item->'itemKey',200,false) or (kind is null or kind not in ('row','special')) then
   raise exception 'Invalid item' using errcode='22023',hint='tjanst_invalid';end if;
  if action='move' then
   if not public.phase5_programplan_shape(item,array['itemKey','kind','id','fromPersonId','choice']) then raise exception 'Invalid move' using errcode='22023',hint='tjanst_invalid';end if;
   perform public.tjanst_uuid(item->'id');perform public.tjanst_uuid(item->'fromPersonId');choice:=public.tjanst_year_choice(item->'choice');
   if choice->>'kind'='suggestion' or choice->'personId'=item->'fromPersonId' then raise exception 'Invalid move choice' using errcode='22023',hint='tjanst_choice_mismatch';end if;
   key:=kind||':'||(item->>'id');if key=any(affected) then raise exception 'Duplicate move object' using errcode='22023',hint='tjanst_duplicate_row';end if;affected:=array_append(affected,key);
   select x.value into original from jsonb_array_elements(case when kind='row' then core->'rows' else core->'specials' end) x
    where x.value->>'id'=item->>'id' and x.value->'personId'=item->'fromPersonId';
   if original is null then issue:='wrong_scope';end if;
   gid:=original->>'jointGroupId';
   entry:=jsonb_build_object('itemKey',item_key,'kind',kind,'id',item->'id','sourceKey',case when kind='row' then original->'sourceKey' else 'null'::jsonb end,
    'classId',original->'classId','jointGroupId',gid,'before',case when original is null then 'null'::jsonb else jsonb_build_object('personId',original->'personId',
      'ht',case when kind='row' then original->'teacherHt' else original->'ht' end,'vt',case when kind='row' then original->'teacherVt' else original->'vt' end) end,
    'after',case when original is null then 'null'::jsonb else jsonb_build_object('personId',choice->'personId',
      'ht',case when kind='row' then original->'teacherHt' else original->'ht' end,'vt',case when kind='row' then original->'teacherVt' else original->'vt' end) end);
   if gid is not null and not gid=any(group_ids) then group_ids:=array_append(group_ids,gid);end if;
  else
   if not public.phase5_programplan_shape(item,case when kind='row' then array['itemKey','kind','payload'] else array['itemKey','kind','payload','choice'] end) then
    raise exception 'Invalid bulk' using errcode='22023',hint='tjanst_invalid';end if;
   p:=item->'payload';context:=p->'planningContext';
   if kind='row' then
    if not public.phase5_programplan_shape(context,array['baseVersionId','expectedBasisHash','choice']) or context->'baseVersionId' is distinct from batch->'baseVersionId'
     or coalesce(context->>'expectedBasisHash','')!~'^sha256:[a-f0-9]{64}$' then raise exception 'Planning context required' using errcode='22023',hint='tjanst_context_required';end if;
    choice:=public.tjanst_year_choice(context->'choice');
    perform public.tjanst_year_payload('row',p-'planningContext');
    if p->'rowId'<>'null'::jsonb or p->'personId' is distinct from choice->'personId' or split_part(p->>'sourceKey',':',3)<>(base->>'schoolYear') then
     raise exception 'Invalid bulk row' using errcode='22023',hint='tjanst_invalid';end if;
    if exists(select 1 from jsonb_array_elements(core->'needs') c cross join lateral jsonb_array_elements(c.value->'needs') n where n.value->>'sourceKey'=p->>'sourceKey') or exists(select 1 from jsonb_array_elements(core->'groups') g where g.value->>'sourceKey'=p->>'sourceKey') then
     support:=public.tjanst_year_row(core,p->>'sourceKey',null);
     if support->>'basisHash'<>context->>'expectedBasisHash' or coalesce((support->'need'->>'organizationPending')::boolean,false) or coalesce((support->'need'->>'stale')::boolean,false) then issue:='stale_basis';end if;
    else issue:='unknown_need';end if;
    if exists(select 1 from jsonb_array_elements(core->'rows') x where x.value->>'sourceKey'=p->>'sourceKey' and x.value->'personId'=p->'personId')
     or exists(select 1 from jsonb_array_elements(items) x where x.value->>'sourceKey'=p->>'sourceKey' and x.value->'after'->'personId'=p->'personId') then issue:='duplicate_row';end if;
    entry:=jsonb_build_object('itemKey',item_key,'kind',kind,'id',null,'sourceKey',p->'sourceKey','classId',case when p->>'sourceKind'='class_timplan' then to_jsonb(split_part(p->>'sourceKey',':',2)) else 'null'::jsonb end,'jointGroupId',null,'before',null,
     'after',jsonb_build_object('personId',p->'personId','ht',p->'teacherHt','vt',p->'teacherVt'));
   else
    choice:=public.tjanst_year_choice(item->'choice');
    perform public.tjanst_year_payload('special',p);
    if p->'specialId'<>'null'::jsonb or choice->>'kind'='suggestion' or choice->'personId' is distinct from p->'personId' or (p->>'kind'='mentor' and p->'classId'='null'::jsonb) then
     raise exception 'Invalid bulk special' using errcode='22023',hint='tjanst_invalid';end if;
    if p->'classId'<>'null'::jsonb and not exists(select 1 from jsonb_array_elements(core->'needs') c where c.value->'classId'=p->'classId') then issue:='unknown_class';end if;
    entry:=jsonb_build_object('itemKey',item_key,'kind',kind,'id',null,'sourceKey',null,'classId',p->'classId','jointGroupId',null,'before',null,
     'after',jsonb_build_object('personId',p->'personId','ht',p->'ht','vt',p->'vt'));
   end if;
   affected:=array_append(affected,'new:'||item_key);
  end if;
  issue:=coalesce(issue,public.tjanst_year_choice_blocker(core,choice,support));
  if batch->'baseVersionId' is distinct from base->'baseVersionId' then issue:='stale_basis';end if;
  if issue is not null then blockers:=blockers||jsonb_build_array(jsonb_build_object('itemKey',item_key,'groupId',gid,'code',issue));end if;
  items:=items||jsonb_build_array(entry);
 end loop;
 -- Whole affected groups are bound, including members/teachers that are NOT moved.
 for grp in select x.value from jsonb_array_elements(core->'joints') x where x.value->>'id'=any(group_ids) loop
  group_state:=group_state||jsonb_build_array(grp||jsonb_build_object('members',(select jsonb_agg(r.value order by r.value->>'id')
   from jsonb_array_elements(core->'rows') r where r.value->>'jointGroupId'=grp->>'id')));
  for key in select 'row:'||(x.value#>>'{}') from jsonb_array_elements(grp->'rowIds') x loop
   if not key=any(affected) then affected:=array_append(affected,key);end if;
  end loop;
  for item in select x.value from jsonb_array_elements(batch->'items') x where x.value->>'kind'='row' and exists(
    select 1 from jsonb_array_elements(items) e where e.value->>'itemKey'=x.value->>'itemKey' and e.value->>'jointGroupId'=grp->>'id') loop
   issue:=null;choice:=item->'choice';
   if exists(select 1 from jsonb_array_elements(core->'rows') r where r.value->>'jointGroupId'=grp->>'id' and r.value->'personId'=item->'fromPersonId'
     and not exists(select 1 from jsonb_array_elements(batch->'items') i where i.value->>'kind'='row' and i.value->'id'=r.value->'id'
       and i.value->'fromPersonId'=item->'fromPersonId' and i.value->'choice'->'personId'=choice->'personId')) then issue:='joint_incomplete';end if;
   if choice->'personId'='null'::jsonb or exists(select 1 from jsonb_array_elements(grp->'teachers') tt where tt.value->'personId'=choice->'personId')
    or exists(select 1 from jsonb_array_elements(batch->'items') i join jsonb_array_elements(items) e on e.value->>'itemKey'=i.value->>'itemKey'
      where e.value->>'jointGroupId'=grp->>'id' and i.value->'fromPersonId'<>item->'fromPersonId' and i.value->'choice'->'personId'=choice->'personId') then issue:='joint_person_collision';end if;
   select x.value into t from jsonb_array_elements(grp->'teachers') x where x.value->'personId'=item->'fromPersonId';
   if t is null then issue:='joint_incomplete';end if;
   if issue is not null then blockers:=blockers||jsonb_build_array(jsonb_build_object('itemKey',item->'itemKey','groupId',grp->'id','code',issue));end if;
   if t is not null and choice->'personId'<>'null'::jsonb and not exists(select 1 from jsonb_array_elements(totals) x where x.value->'jointId'=grp->'id' and x.value->'personId'=choice->'personId') then
    totals:=totals||jsonb_build_array(jsonb_build_object('jointId',grp->'id','personId',choice->'personId','ht',t->'ht','vt',t->'vt'));end if;
  end loop;
 end loop;
 -- Compare final moved rows against ALL other final rows, including other selections and unchanged vacancies.
 if action='move' then
  for entry in select x.value from jsonb_array_elements(items) x where x.value->>'kind'='row' and x.value->'after'<>'null'::jsonb loop
   if exists(select 1 from jsonb_array_elements(core->'rows') r where r.value->'id'<>entry->'id' and r.value->'sourceKey'=entry->'sourceKey'
     and coalesce((select e.value->'after'->'personId' from jsonb_array_elements(items) e where e.value->'id'=r.value->'id' and e.value->'after'<>'null'::jsonb),r.value->'personId')=entry->'after'->'personId') then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('itemKey',entry->'itemKey','groupId',entry->'jointGroupId','code','duplicate_row'));end if;
  end loop;
 end if;
 count_objects:=cardinality(affected);
 if count_objects>100 then for entry in select x.value from jsonb_array_elements(items) x loop
  blockers:=blockers||jsonb_build_array(jsonb_build_object('itemKey',entry->'itemKey','groupId',entry->'jointGroupId','code','batch_too_large'));end loop;end if;
 select coalesce(jsonb_agg(b.value order by b.value->>'itemKey',b.value->>'code',b.value->>'groupId'),'[]') into blockers from (select distinct x.value from jsonb_array_elements(blockers) x) b;
 result:=base||jsonb_build_object('mode','batch','action',action,'items',items,'selectedCount',jsonb_array_length(items),'writeObjectCount',count_objects,'jointTotals',totals,'blockers',blockers);
 return result||jsonb_build_object('previewHash',public.tjanst_year_hash('preview',jsonb_build_object('result',result,'request',batch,
   'candidates',core->'candidates','groups',group_state)));
end $$;

create or replace function public.tjanst_year_apply_batch(a public.access_assignments,d public.tjanst_distributions,batch jsonb,base_version uuid,version uuid,preview jsonb) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare item jsonb;entry jsonb;object_id uuid;person uuid;grp uuid;pair record;grader_moves jsonb;
begin
 if batch->>'action'='bulk' then
  for item in select x.value from jsonb_array_elements(batch->'items') x loop
   perform public.tjanst_year_apply_one(a,d,case when item->>'kind'='row' then 'save_row' else 'save_special' end,(item->'payload')-'planningContext',base_version,version);
  end loop;
  return;
 end if;
 -- Defer exactly the row-person uniqueness invariant during a permutation; canonical identities stay unchanged.
 set constraints public.tjanst_rows_person_source deferred;
 -- Move keeps source/student snapshots and teacher minutes exactly. Only the explicitly chosen person changes.
 -- Preview already checks whole teacher/group selection and all final person/source collisions.
 for item in select x.value from jsonb_array_elements(batch->'items') x loop
  person:=(item->'choice'->>'personId')::uuid;
  object_id:=public.tjanst_year_map_id(item->>'kind',(item->>'id')::uuid,base_version,version);
  if person is not null then insert into public.tjanst_version_teachers(version_id,staff_person_id) values(version,person) on conflict do nothing;end if;
  if item->>'kind'='row' then
   select x.value into entry from jsonb_array_elements(preview->'items') x where x.value->>'itemKey'=item->>'itemKey';
   update public.tjanst_rows set staff_person_id=person where id=object_id and version_id=version;
  else update public.tjanst_special_assignments set staff_person_id=person where id=object_id and version_id=version;end if;
 end loop;
 for pair in select distinct e.value->>'jointGroupId' group_id,i.value->>'fromPersonId' old_person,i.value->'choice'->>'personId' new_person
  from jsonb_array_elements(batch->'items') i join jsonb_array_elements(preview->'items') e on e.value->>'itemKey'=i.value->>'itemKey'
  where e.value->>'jointGroupId' is not null loop
  grp:=public.tjanst_year_map_id('joint',pair.group_id::uuid,base_version,version);
  update public.tjanst_joint_teacher_time set staff_person_id=pair.new_person::uuid where group_id=grp and staff_person_id=pair.old_person::uuid;
  if not found then raise exception 'Joint teacher missing' using errcode='40001',hint='tjanst_stale_basis';end if;
 end loop;
 -- Capture all original graders before changing any: a permutation must not move a grader twice.
 select coalesce(jsonb_agg(distinct jsonb_build_object('sourceKey',e.value->>'sourceKey','oldPerson',i.value->>'fromPersonId','newPerson',i.value->'choice'->>'personId')),'[]') into grader_moves
 from jsonb_array_elements(batch->'items') i join jsonb_array_elements(preview->'items') e on e.value->>'itemKey'=i.value->>'itemKey'
 join public.tjanst_need_graders ng on ng.version_id=version and ng.source_key=e.value->>'sourceKey' and ng.staff_person_id=(i.value->>'fromPersonId')::uuid
 where i.value->>'kind'='row';
 delete from public.tjanst_need_graders ng using jsonb_array_elements(grader_moves) m
 where ng.version_id=version and ng.source_key=m.value->>'sourceKey' and ng.staff_person_id=(m.value->>'oldPerson')::uuid;
 insert into public.tjanst_need_graders(version_id,source_key,staff_person_id)
 select distinct version,m.value->>'sourceKey',(m.value->>'newPerson')::uuid from jsonb_array_elements(grader_moves) m where m.value->>'newPerson' is not null on conflict do nothing;
 set constraints public.tjanst_rows_person_source immediate;
end $$;

create or replace function public.tjanst_plan_blockers(a public.access_assignments,v public.tjanst_versions,unit uuid,school_year integer,needs jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
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
  result:=result||jsonb_build_array(jsonb_build_object('code','organization_pending','message','Valbara tidsutrymmen återstår att organisera i konkreta undervisningsgrupper. Tillämpa grupperna innan tjänstefördelningen publiceras.'));end if;
 if exists(select 1 from jsonb_array_elements(public.tjanst_group_needs(unit,school_year)) g where (g.value->>'stale')::boolean) then
  result:=result||jsonb_build_array(jsonb_build_object('code','group_sources_changed','message','Timplansunderlaget för tillämpade grupper har ändrats. Granska blockets källor och tillämpa grupperna på nytt.'));end if;
 return result;
end $$;

create or replace function public.tjanst_plan_projection(a public.access_assignments,unit uuid,school_year integer,version_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d public.tjanst_distributions;v public.tjanst_versions;published public.tjanst_versions;needs jsonb;rows jsonb;teachers jsonb;versions jsonb;blockers jsonb;
 specials jsonb;groups jsonb;joints jsonb;sharing jsonb;history boolean:=version_id is not null;editing boolean;actions text[]:='{}';result jsonb;
begin
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=tjanst_plan_projection.school_year;
 if history then
  select * into v from public.tjanst_versions x where x.id=version_id and x.distribution_id=d.id and x.status in ('published','superseded');
  if not found then raise exception 'Service allocation denied' using errcode='42501';end if;
 else
  select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status in ('draft','published') order by (x.status='draft') desc limit 1;
 end if;
 groups:=case when history then public.tjanst_version_groups(v.id) else public.tjanst_group_needs(unit,school_year) end;
 needs:=coalesce(case when history then public.tjanst_version_class_sources(v.id) else null end,public.tjanst_needs_with_groups(unit,school_year,groups));
 select coalesce(jsonb_agg(jsonb_set(public.tjanst_row_json(r,(select g.value from jsonb_array_elements(groups) g where g.value->>'sourceKey'=r.source_key union all select n.value||jsonb_build_object('link',c.value->'link') from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') n where n.value->>'sourceKey'=r.source_key limit 1)),'{jointGroupId}',
   coalesce((select to_jsonb(m.group_id) from public.tjanst_joint_members m where m.row_id=r.id),'null'::jsonb))
   order by r.source_key collate "C",r.staff_person_id nulls last,r.id),'[]'::jsonb) into rows from public.tjanst_rows r where r.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'lineageId',s.lineage_id,'kind',s.kind,'label',s.label,'personId',s.staff_person_id,'classId',s.class_id,
   'ht',s.ht_minutes,'vt',s.vt_minutes,'comment',s.comment) order by s.kind,s.label collate "C",s.id),'[]'::jsonb) into specials
 from public.tjanst_special_assignments s where s.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'lineageId',g.lineage_id,'name',g.name,
   'rowIds',(select coalesce(jsonb_agg(m.row_id order by m.row_id),'[]'::jsonb) from public.tjanst_joint_members m where m.group_id=g.id),
   'teachers',(select coalesce(jsonb_agg(jsonb_build_object('personId',t.staff_person_id,'ht',t.ht_minutes,'vt',t.vt_minutes) order by t.staff_person_id),'[]'::jsonb)
    from public.tjanst_joint_teacher_time t where t.group_id=g.id)) order by g.name collate "C",g.id),'[]'::jsonb) into joints
 from public.tjanst_joint_groups g where g.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('sourceKey',s.source_key,'mode',s.mode,'graderPersonIds',
   (select coalesce(jsonb_agg(g.staff_person_id order by g.staff_person_id),'[]'::jsonb) from public.tjanst_need_graders g where g.version_id=s.version_id and g.source_key=s.source_key))
   order by s.source_key collate "C"),'[]'::jsonb) into sharing
 from public.tjanst_need_sharing s where s.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('personId',p.id,'displayName',left(p.given_name||' '||p.family_name,200),'draft',p.status='draft',
   'shareHere',(select max(s.percent) from public.staff_school_duties s where s.staff_person_id=p.id and s.unit_id=unit
     and daterange(s.starts_on,s.ends_on,'[]')&&daterange(make_date(school_year,7,1),make_date(school_year+1,6,30),'[]')))
   order by p.family_name collate "C",p.given_name collate "C",p.id),'[]'::jsonb) into teachers
 from public.staff_people p where p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
  and (exists(select 1 from public.tjanst_version_teachers t where t.version_id=v.id and t.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_joint_teacher_time t join public.tjanst_joint_groups g on g.id=t.group_id where g.version_id=v.id and t.staff_person_id=p.id));
 select coalesce(jsonb_agg(public.tjanst_version_json(x) order by x.version_no desc),'[]'::jsonb) into versions
 from public.tjanst_versions x where x.distribution_id=d.id and x.status<>'discarded';
 blockers:=case when history then '[]'::jsonb else public.tjanst_plan_blockers(a,v,unit,school_year,needs) end;
 editing:=not history and a.function in ('rektor','administrator');
 if editing then
  actions:=array['add_teacher','remove_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','move','bulk','save_sharing','clear_sharing'];
  if coalesce(v.status='draft',false) then
   actions:=actions||'discard_draft'::text;
   if a.function='rektor' and jsonb_array_length(blockers)=0 then actions:=actions||'publish'::text;end if;
  end if;
 end if;
 result:=jsonb_build_object('contractVersion','tjanst_v1','unitId',unit,'schoolName',(select u.name from public.school_units u where u.id=unit),
  'schoolYear',school_year,'revision',coalesce(d.revision,0),'version',case when v.id is null then null else public.tjanst_version_json(v) end,
  'versions',versions,'teachers',teachers,
  'classes',(select coalesce(jsonb_agg(c.value-'needs'||jsonb_build_object('aplMinutes',case when c.value ? 'aplMinutes' then c.value->'aplMinutes' else to_jsonb(public.tjanst_class_apl_minutes(c.value->'link')) end,'needs',(select coalesce(jsonb_agg(x.value-'classId'-'link'),'[]'::jsonb)
    from jsonb_array_elements(c.value->'needs') x))),'[]'::jsonb) from jsonb_array_elements(needs) c),
  'rows',rows,'specials',specials,'joints',joints,'sharing',sharing,'actions',to_jsonb(actions),'blockers',blockers,
  'capabilities',jsonb_build_object('canEdit',editing,
   'canPublish',editing and coalesce(v.status='draft',false) and a.function='rektor' and jsonb_array_length(blockers)=0,'canReadHistory',true));
 -- Återkoppling (TJANST-05): bara för rektor och administratör och bara för den aktuella publicerade versionen.
 select * into published from public.tjanst_versions x where x.distribution_id=d.id and x.status='published';
 if not history and published.id is not null and a.function in ('rektor','administrator') then result:=result||jsonb_build_object('feedback',public.tjanst_feedback_json(published.id));end if;
 return result||case when jsonb_array_length(groups)>0 then jsonb_build_object('groups',groups) else '{}'::jsonb end;
end $$;

create or replace function public.tjanst_school_sums(version uuid,unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare teaching_ht bigint;teaching_vt bigint;special_ht bigint;special_vt bigint;vacant_ht bigint;vacant_vt bigint;un_ht bigint:=0;un_vt bigint:=0;
 needs jsonb;n jsonb;cov_ht bigint;cov_vt bigint;
begin
 select coalesce(sum(r.teacher_ht_minutes) filter (where r.staff_person_id is not null),0),coalesce(sum(r.teacher_vt_minutes) filter (where r.staff_person_id is not null),0),
  coalesce(sum(r.teacher_ht_minutes) filter (where r.staff_person_id is null),0),coalesce(sum(r.teacher_vt_minutes) filter (where r.staff_person_id is null),0)
 into teaching_ht,teaching_vt,vacant_ht,vacant_vt
 from public.tjanst_rows r where r.version_id=version and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id);
 select teaching_ht+coalesce(sum(t.ht_minutes),0),teaching_vt+coalesce(sum(t.vt_minutes),0) into teaching_ht,teaching_vt
 from public.tjanst_joint_teacher_time t join public.tjanst_joint_groups g on g.id=t.group_id where g.version_id=version;
 select coalesce(sum(s.ht_minutes) filter (where s.staff_person_id is not null),0),coalesce(sum(s.vt_minutes) filter (where s.staff_person_id is not null),0),
  vacant_ht+coalesce(sum(s.ht_minutes) filter (where s.staff_person_id is null),0),vacant_vt+coalesce(sum(s.vt_minutes) filter (where s.staff_person_id is null),0)
 into special_ht,special_vt,vacant_ht,vacant_vt from public.tjanst_special_assignments s where s.version_id=version;
 -- Huvudmannens planeringsbrist är aktuell; versionens tilldelade lärartid är fortsatt orörd.
 needs:=public.tjanst_working_needs(unit,school_year);
 for n in select x.value from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') x where c.value->'link'<>'null'::jsonb union all select value from jsonb_array_elements(public.tjanst_group_needs(unit,school_year)) loop
  select coalesce(sum(r.teacher_ht_minutes),0),coalesce(sum(r.teacher_vt_minutes),0) into cov_ht,cov_vt from public.tjanst_rows r
  where r.version_id=version and r.source_key=n->>'sourceKey' and r.staff_person_id is not null and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id);
  -- 05.1-33: samtidig undervisning täcker behovet en gång (största lärartiden per termin).
  if exists(select 1 from public.tjanst_need_sharing s where s.version_id=version and s.source_key=n->>'sourceKey' and s.mode='concurrent') then
   select coalesce(max(r.teacher_ht_minutes),0),coalesce(max(r.teacher_vt_minutes),0) into cov_ht,cov_vt from public.tjanst_rows r
   where r.version_id=version and r.source_key=n->>'sourceKey' and r.staff_person_id is not null and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id);
  end if;
  select cov_ht+coalesce(sum(t.ht_minutes),0),cov_vt+coalesce(sum(t.vt_minutes),0) into cov_ht,cov_vt from public.tjanst_joint_teacher_time t
  where t.group_id in (select distinct m.group_id from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where r.version_id=version and r.source_key=n->>'sourceKey');
  if n->'needHt'<>'null'::jsonb then un_ht:=un_ht+greatest(0,(n->>'needHt')::bigint-cov_ht);end if;
  if n->'needVt'<>'null'::jsonb then un_vt:=un_vt+greatest(0,(n->>'needVt')::bigint-cov_vt);end if;
 end loop;
 return jsonb_build_object('teaching',jsonb_build_object('ht',teaching_ht,'vt',teaching_vt),'special',jsonb_build_object('ht',special_ht,'vt',special_vt),
  'vacant',jsonb_build_object('ht',vacant_ht,'vt',vacant_vt),'unallocated',jsonb_build_object('ht',un_ht,'vt',un_vt),
  'unlinkedClasses',(select count(*) from jsonb_array_elements(needs) c where c.value->'link'='null'::jsonb));
end $$;

create or replace function public.tjanst_self_projection(a public.access_assignments) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
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
      from public.tjanst_joint_members m join public.tjanst_joint_groups g on g.id=m.group_id where m.row_id=r.id))||case when r.source_kind='teaching_group' then jsonb_build_object('sourceKind','teaching_group','groupId',r.group_id,'groupName',r.group_snapshot->'name',
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
end $$;

create or replace function public.tjanst_version_hash(version uuid) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
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
  ||case when jsonb_array_length(coalesce(public.tjanst_version_groups(version),'[]'::jsonb))>0 or exists(select 1 from public.tjanst_rows r where r.version_id=version and r.source_kind='teaching_group') then
  jsonb_build_array(jsonb_build_array('teaching_groups_v1',public.tjanst_version_groups(version),public.tjanst_version_class_sources(version),
    (select coalesce(jsonb_agg(jsonb_build_array(r.lineage_id,r.group_id,r.group_revision,r.group_snapshot) order by r.lineage_id),'[]'::jsonb) from public.tjanst_rows r where r.version_id=version and r.source_kind='teaching_group'))) else '[]'::jsonb end)
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id where v.id=version
$$;

create or replace function public.tjanst_plan_publish(a public.access_assignments,s public.app_sessions,d public.tjanst_distributions,q jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
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
 update public.tjanst_versions set status='superseded' where distribution_id=d.id and status='published';
 update public.tjanst_versions set status='published',content_hash=h,published_by_identity_id=s.identity_id,published_by_assignment_id=a.id,published_at=clock_timestamp()
 where id=v.id;
 return v.id;
end $$;

create or replace function public.tjanst_plan_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;request_id uuid;action_name text;unit uuid;year integer;a public.access_assignments;s public.app_sessions;r public.tjanst_commands;
 d public.tjanst_distributions;version uuid;target jsonb;detail jsonb;receipt jsonb;envelope jsonb;discarded uuid;
 core jsonb;base jsonb;ctx jsonb;support jsonb;preview jsonb;issue text;base_version uuid;
begin
 -- Current authority is checked even for old receipts; no parser/replay path bypasses the customer lock.
 a:=public.tjanst_actor('plan');s:=public.phase5_programplan_session_check();
 if a.function not in ('rektor','administrator') then raise exception 'Service allocation command denied' using errcode='42501';end if;
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>65536 then raise exception 'Invalid command' using errcode='22023',hint='tjanst_input_too_large';end if;
 request_id:=public.tjanst_uuid(input->'commandId');unit:=public.tjanst_uuid(input->'unitId');
 perform public.tjanst_plan_scope(a,unit);
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5561));
 select * into r from public.tjanst_commands where command_id=request_id;
 if found then
  -- Explicit legacy normalization ONLY for an existing persisted legacy command.
  if r.action not in ('move','bulk') and not (r.request->'payload' ? 'planningContext') and not (r.request->'payload' ? 'mutationContext') then
   q:=public.tjanst_plan_parse_legacy(input);
  else q:=public.tjanst_plan_parse(input);end if;
  target:=jsonb_build_object('unitId',unit,'schoolYear',q->'schoolYear','versionId',null,'personId',null);
  if (r.family,r.action,r.customer_id,r.organizer_id,r.actor_identity_id,r.assignment_id,r.target,r.request)
    is distinct from ('plan',q->>'action',a.customer_id,a.organizer_id,s.identity_id,a.id,target,q) then
   raise exception 'Service allocation command changed' using errcode='40001',hint='tjanst_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 q:=public.tjanst_plan_parse(input);action_name:=q->>'action';year:=(q->>'schoolYear')::integer;
 if action_name='publish' and a.function<>'rektor' then raise exception 'Publish denied' using errcode='42501';end if;
 if public.tjanst_hash(jsonb_build_array('tjanst_payload_v1',action_name,input->'payload'))<>q->>'payloadHash' then
  raise exception 'Payload hash mismatch' using errcode='22023',hint='tjanst_payload_hash';end if;
 -- Serialize with group apply/time-detail edits without creating any elective business row.
 perform pg_advisory_xact_lock(hashtextextended(unit::text,5520));
 perform public.elective_lock_sources(coalesce((select jsonb_agg(distinct sr.value) from jsonb_array_elements(public.tjanst_group_needs(unit,year)) g cross join lateral jsonb_array_elements(g.value->'sourceRefs') sr),'[]'),year);
 core:=public.tjanst_year_core(a,unit,year);base:=core->'base';base_version:=(base->>'baseVersionId')::uuid;
 if (base->>'currentRevision')::integer<>(q->>'expectedRevision')::integer then raise exception 'Planning revision changed' using errcode='40001',hint='tjanst_revision_conflict';end if;
 if action_name in ('move','bulk') then
  preview:=public.tjanst_year_batch(core,(q->'payload')-'expectedPreviewHash');
  if preview->>'previewHash'<>q->'payload'->>'expectedPreviewHash' or jsonb_array_length(preview->'blockers')>0 then
   raise exception 'Preview changed or blocked' using errcode='40001',hint='tjanst_stale_basis';end if;
 elsif action_name='save_row' then
  ctx:=q->'payload'->'planningContext';
  if ctx->'baseVersionId' is distinct from base->'baseVersionId' then raise exception 'Planning base changed' using errcode='40001',hint='tjanst_stale_basis';end if;
  support:=public.tjanst_year_row(core,q->'payload'->>'sourceKey',(q->'payload'->>'rowId')::uuid);
  if ctx->>'expectedBasisHash'<>support->>'basisHash' then raise exception 'Planning basis changed' using errcode='40001',hint='tjanst_stale_basis';end if;
  issue:=public.tjanst_year_choice_blocker(core,ctx->'choice',support);
  if issue is not null then raise exception 'Teacher choice changed' using errcode='40001',hint=case when issue='person_unavailable' then 'tjanst_stale_person' else 'tjanst_stale_evidence' end;end if;
 else
  ctx:=q->'payload'->'mutationContext';
  if ctx->'baseVersionId' is distinct from base->'baseVersionId' or ctx->>'expectedBasisHash'<>(public.tjanst_year_catalog(core))->>'basisHash' then
   raise exception 'Mutation basis changed' using errcode='40001',hint='tjanst_stale_basis';end if;
 end if;
 if action_name='save_special' and q#>>'{payload,kind}'='mentor' and not exists(select 1 from jsonb_array_elements(core->'needs') n where n->>'classId'=q#>>'{payload,classId}') then
  raise exception 'Mentor class is outside current year' using errcode='22023',hint='tjanst_unknown_source';end if;
 -- All stale checks precede business writes. The customer lock also protects an absent distribution.
 insert into public.tjanst_distributions(customer_id,organizer_id,unit_id,school_year) values(a.customer_id,a.organizer_id,unit,year) on conflict(unit_id,school_year) do nothing;
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=year for update;
 if d.customer_id<>a.customer_id or d.organizer_id<>a.organizer_id then raise exception 'Planning denied' using errcode='42501';end if;
 if action_name in ('publish','discard_draft') then
  version:=(public.tjanst_current_draft(d)).id;
  if version is distinct from base_version then raise exception 'Draft changed' using errcode='40001',hint='tjanst_stale_basis';end if;
  if action_name='publish' then version:=public.tjanst_plan_publish(a,s,d,q);
  else update public.tjanst_versions set status='discarded' where id=version;discarded:=version;end if;
 else
  version:=public.tjanst_year_ensure_draft(a,s,d,base_version);
  if action_name in ('move','bulk') then perform public.tjanst_year_apply_batch(a,d,q->'payload',base_version,version,preview);
  else perform public.tjanst_year_apply_one(a,d,action_name,(q->'payload')-'planningContext'-'mutationContext',base_version,version);end if;
 end if;
 update public.tjanst_distributions set revision=revision+1 where id=d.id returning * into d;
 target:=jsonb_build_object('unitId',unit,'schoolYear',year,'versionId',null,'personId',null);
 detail:=public.tjanst_plan_projection(a,unit,year,null);
 receipt:=jsonb_build_object('commandId',request_id,'action',action_name,'versionId',version,'revision',d.revision,
  'contentHash',coalesce((select v.content_hash from public.tjanst_versions v where v.id=version),public.tjanst_version_hash(version)),'replayed',false,'changed',true);
 envelope:=jsonb_build_object('contractVersion','tjanst_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),'result',jsonb_build_object('receipt',receipt,'detail',detail));
 insert into public.tjanst_commands(command_id,family,action,customer_id,organizer_id,target,actor_identity_id,assignment_id,request,envelope)
 values(request_id,'plan',action_name,a.customer_id,a.organizer_id,target,s.identity_id,a.id,q,envelope);
 perform public.tjanst_audit(case when action_name='publish' then 'tjanst_plan_published' else 'tjanst_plan_command' end,'tjanst_version',version,
  jsonb_build_object('commandId',request_id,'action',action_name,'revision',d.revision,'unitId',unit,'schoolYear',year,'discarded',discarded is not null));
 return envelope;
end $$;

-- Privata hjälpare kan aldrig anropas direkt av Worker, demo eller anonyma klienter.
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname=any(array['elective_placement_command','elective_retire_group','elective_group_membership','elective_lock_sources','elective_apply_groups','tjanst_group_needs','tjanst_working_needs','tjanst_needs_with_groups','tjanst_version_groups','tjanst_working_version','tjanst_class_source_basis','tjanst_version_class_sources','tjanst_group_row_snapshot_guard']) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role,skolplattform_worker',f);
 end loop;
end $$;

create or replace function public.tjanst_need(unit uuid,school_year integer,source_key text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select n.value||jsonb_build_object('classId',c.value->'classId','link',c.value->'link')
 from jsonb_array_elements(public.tjanst_working_needs(unit,school_year)) c cross join lateral jsonb_array_elements(c.value->'needs') n where n.value->>'sourceKey'=source_key
 union all
 select g.value from jsonb_array_elements(public.tjanst_group_needs(unit,school_year)) g where g.value->>'sourceKey'=source_key
$$;

create or replace function public.elective_block_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;unit uuid;command uuid;j public.elective_commands;result jsonb;begin
 perform public.elective_require_shape(input,array['commandId','unitId','schoolYear','action','payloadHash']);unit:=public.tjanst_uuid(input->'unitId');command:=public.tjanst_uuid(input->'commandId');
 if not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or input->>'action' not in ('save_block','apply_groups','set_policy','open_round','close_round','record_choice','confirm_choice','save_placement','end_placement','retire_group') or jsonb_typeof(input->'payloadHash')<>'string' or input->>'payloadHash'!~'^[a-f0-9]{64}$' then raise exception 'Invalid elective status reference' using errcode='22023',hint='elective_invalid';end if;
 a:=public.elective_staff_scope(unit);perform pg_advisory_xact_lock(hashtextextended(command::text,5521));
 select * into j from public.elective_commands where command_id=command;
 if j.command_id is not null and (j.unit_id<>unit or j.school_year<>(input->>'schoolYear')::integer or j.assignment_id<>a.id or j.actor_identity_id::text<>current_setting('app.identity_id',true)
  or j.payload_hash<>input->>'payloadHash' or j.action<>input->>'action') then raise exception 'Elective command conflict' using errcode='40001',hint='elective_command_conflict';end if;
 result:=jsonb_build_object('unitId',unit,'schoolYear',(input->>'schoolYear')::integer,'commandId',command,'status',case when j.command_id is null then 'not_found' else 'found' end,
  'receipt',case when j.command_id is null then 'null'::jsonb else (j.envelope->'result')||jsonb_build_object('replayed',true) end);
 perform public.elective_staff_audit('elective_status',command,unit);
 return jsonb_build_object('contractVersion','elective_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',result);
end $$;
