-- Explicit retirement; stable objects/period history survive, only live organizational pointers are released.
begin;
alter table public.teaching_groups add column retired_at timestamptz;
alter table public.elective_blocks add column organization_retired_at timestamptz;
create or replace function public.elective_assert_frame_exclusive(block_id uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare b public.elective_blocks;begin
 select * into b from public.elective_blocks x where x.id=block_id;if not found or b.organization_retired_at is not null then return;end if;
 perform public.elective_lock_school(b.unit_id);
 if exists(select 1 from public.elective_block_sources a join public.elective_block_sources other on other.class_id=a.class_id and other.block_id<>a.block_id and other.active
 join public.elective_blocks ob on ob.id=other.block_id and ob.unit_id=b.unit_id and ob.school_year=b.school_year and ob.organization_retired_at is null
 where a.block_id=b.id and a.active and daterange(b.starts_on,b.ends_on,'[]')&&daterange(ob.starts_on,ob.ends_on,'[]')
 and coalesce(a.source_ref->>'frameSourceKey',a.source_key)=coalesce(other.source_ref->>'frameSourceKey',other.source_key)
 and (a.source_ref->'timeDetailRef' is null or a.source_ref->'timeDetailRef'='null'::jsonb or other.source_ref->'timeDetailRef' is null or other.source_ref->'timeDetailRef'='null'::jsonb
 or a.source_ref->'timeDetailRef'->>'positionId'=other.source_ref->'timeDetailRef'->>'positionId')) then
 raise exception 'Time position already belongs to another block' using errcode='40001',hint='elective_frame_conflict';end if;
end $$;
create function public.elective_retired_identity_guard() returns trigger
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 if old.retired_at is not null and (new.active or (new.id,new.block_id,new.option_id,new.name,new.starts_on,new.ends_on,new.estimated_pupils,new.retired_at) is distinct from (old.id,old.block_id,old.option_id,old.name,old.starts_on,old.ends_on,old.estimated_pupils,old.retired_at)) then raise exception 'Retired group identity is immutable' using errcode='40001',hint='elective_group_retired';end if;return new;
end $$;
create trigger elective_retired_identity_guard before update on public.teaching_groups for each row execute function public.elective_retired_identity_guard();
create function public.elective_reclaim_organization() returns trigger
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 if new.active and (tg_op='INSERT' or old.active is distinct from true) then
  update public.elective_blocks set organization_retired_at=null where id=new.block_id and organization_retired_at is not null;
  perform public.elective_assert_frame_exclusive(new.block_id);
 end if;return new;
end $$;
create trigger elective_reclaim_organization after insert or update on public.teaching_groups for each row execute function public.elective_reclaim_organization();
create or replace function public.elective_frame_round_guard() returns trigger
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 if new.status='open' then
  if exists(select 1 from public.elective_blocks b where b.id=new.block_id and b.organization_retired_at is not null) then raise exception 'Organization retired' using errcode='40001',hint='elective_group_retired';end if;
  perform public.elective_assert_frame_exclusive(new.block_id);
 end if;return new;
end $$;
create or replace function public.elective_retire_group(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;b public.elective_blocks;g public.teaching_groups;v uuid;q jsonb;unit uuid;year integer;has_groups boolean;
begin
 unit:=(input->>'unitId')::uuid;year:=(input->>'schoolYear')::integer;a:=public.elective_staff_scope(unit);q:=input->'payload';
 perform public.elective_require_shape(q,array['groupId','expectedBlockRevision']);
 select x.* into b from public.elective_blocks x join public.teaching_groups t on t.block_id=x.id where t.id=public.tjanst_uuid(q->'groupId') and x.unit_id=unit and x.school_year=year for update of x;
 if not found then raise exception 'Group scope denied' using errcode='42501';end if;
 select * into g from public.teaching_groups where id=(q->>'groupId')::uuid for update;
 if b.revision<>(q->>'expectedBlockRevision')::integer or not g.active or g.retired_at is not null then raise exception 'Group changed' using errcode='40001',hint='elective_group_retired';end if;
 perform 1 from public.elective_placements p where p.group_id=g.id order by p.id for update;
 if exists(select 1 from public.elective_placements p where p.group_id=g.id and p.cancelled_at is null and p.ends_on>=public.app_today()) then raise exception 'Ongoing or planned placement' using errcode='40001',hint='elective_group_in_use';end if;
 select exists(select 1 from public.teaching_groups t where t.block_id=b.id and t.id<>g.id and t.active) into has_groups;
 if exists(select 1 from public.elective_rounds r where r.block_id=b.id and r.status='open' and (g.option_id=any(r.option_ids) or not has_groups)) then raise exception 'Affected choice round still open' using errcode='40001',hint='elective_round_open';end if;
 v:=public.tjanst_working_version(unit,year);
 if exists(select 1 from public.tjanst_rows r where r.version_id=v and r.group_id=g.id) then raise exception 'Current service row still exists' using errcode='40001',hint='elective_group_in_use';end if;
 update public.teaching_groups set active=false,retired_at=clock_timestamp(),revision=revision+1 where id=g.id returning * into g;
 delete from public.elective_applied_groups where group_id=g.id;
 update public.elective_blocks set revision=revision+1,
 applied_snapshot=case when applied_snapshot is null then null else jsonb_set(applied_snapshot,'{groups}',coalesce((select jsonb_agg(x.value order by x.ordinality) from jsonb_array_elements(applied_snapshot->'groups') with ordinality x(value,ordinality) where x.value->>'id'<>g.id::text),'[]'::jsonb)) end,
 organization_retired_at=case when not has_groups then clock_timestamp() else organization_retired_at end where id=b.id;
 return jsonb_build_object('objectId',g.id,'objectRevision',g.revision);
end $$;
create or replace function public.elective_placement_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;q jsonb;review jsonb;old public.elective_placements;created public.elective_placements;c public.elective_choices;r public.elective_rounds;g public.teaching_groups;unit uuid;end_date date;
begin
 unit:=(input->>'unitId')::uuid;a:=public.elective_staff_scope(unit);q:=input->'payload';
 if input->>'action'='save_placement' then
  perform public.elective_require_shape(q,array['placementId','choiceId','expectedChoiceRevision','groupId','startsOn','endsOn','previousPlacementId','expectedBasisHash']);
  review:=public.elective_placement_basis(jsonb_build_object('unitId',unit,'schoolYear',input->'schoolYear','expectedRevision',input->'expectedRevision','payload',q-'expectedBasisHash'));
  if q->>'expectedBasisHash' is distinct from review->>'basisHash' then raise exception 'Placement basis changed' using errcode='40001',hint='elective_placement_conflict';end if;
  if not (review->>'allowed')::boolean then raise exception 'Placement requires review' using errcode='40001',hint='elective_placement_conflict';end if;
  select * into c from public.elective_choices where id=(q->>'choiceId')::uuid;select * into r from public.elective_rounds where id=c.round_id;select * into g from public.teaching_groups where id=(q->>'groupId')::uuid;
  if q->>'previousPlacementId' is not null then
   select * into old from public.elective_placements where id=(q->>'previousPlacementId')::uuid;
   insert into public.elective_placement_history(placement_id,revision,body) values(old.id,old.revision,to_jsonb(old));
   if review->'previous'->>'operation'='cancel' then update public.elective_placements set cancelled_at=clock_timestamp(),revision=revision+1 where id=old.id;
   else update public.elective_placements set ends_on=least(ends_on,(q->>'startsOn')::date-1),revision=revision+1 where id=old.id;end if;
   update public.teaching_groups set membership_revision=membership_revision+1 where id=old.group_id;
  end if;
  insert into public.elective_placements(id,unit_id,block_id,group_id,option_id,pupil_id,round_id,choice_id,choice_revision,starts_on,ends_on,recorded_by_assignment_id,previous_placement_id)
  values((q->>'placementId')::uuid,unit,r.block_id,g.id,g.option_id,c.pupil_id,r.id,c.id,c.revision,(review->'period'->>'startsOn')::date,(review->'period'->>'endsOn')::date,a.id,old.id) returning * into created;
  update public.teaching_groups set membership_revision=membership_revision+1 where id=g.id;
 elsif input->>'action'='end_placement' then
  perform public.elective_require_shape(q,array['placementId','expectedPlacementRevision','endsOn']);
  select x.* into old from public.elective_placements x join public.elective_blocks b on b.id=x.block_id where x.id=public.tjanst_uuid(q->'placementId') and x.unit_id=unit and b.school_year=(input->>'schoolYear')::integer for update of x;
  if not found or not public.phase4_scope(a.id,old.pupil_id,unit) or exists(select 1 from public.pupils p where p.id=old.pupil_id and p.protected_identity and not public.phase4_can_read_protected(p.id,unit)) then raise exception 'Placement denied' using errcode='42501';end if;
  end_date:=(q->>'endsOn')::date;
  if old.revision<>(q->>'expectedPlacementRevision')::integer or old.cancelled_at is not null or (end_date<old.starts_on and not(old.starts_on>public.app_today() and end_date=old.starts_on-1)) or end_date>old.ends_on then raise exception 'Placement changed' using errcode='40001',hint='elective_placement_conflict';end if;
  insert into public.elective_placement_history(placement_id,revision,body) values(old.id,old.revision,to_jsonb(old));
  if end_date=old.starts_on-1 then update public.elective_placements set cancelled_at=clock_timestamp(),revision=revision+1 where id=old.id returning * into created;
  else update public.elective_placements set ends_on=end_date,revision=revision+1 where id=old.id returning * into created;end if;
  update public.teaching_groups set membership_revision=membership_revision+1 where id=old.group_id;
 else raise exception 'Placement action denied' using errcode='22023',hint='elective_invalid';end if;
 return jsonb_build_object('objectId',created.id,'objectRevision',created.revision);
end $$;
create or replace function public.elective_placement_projection(a public.access_assignments,unit uuid,school_year integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare result jsonb;retired jsonb;released jsonb;
begin
 if a.id is distinct from public.current_assignment_id() or a.function not in ('rektor','administrator') then raise exception 'Placement projection denied' using errcode='42501';end if;
 result:=jsonb_build_object('placements',coalesce((select jsonb_agg(public.elective_placement_json(x) order by x.starts_on,x.id) from public.elective_placements x join public.elective_blocks b on b.id=x.block_id
 join public.pupils p on p.id=x.pupil_id where x.unit_id=unit and b.school_year=elective_placement_projection.school_year and x.cancelled_at is null and public.phase4_scope(a.id,p.id,unit) and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))),'[]'::jsonb));

 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'blockId',g.block_id,'optionId',g.option_id,'name',g.name,'startsOn',g.starts_on,'endsOn',g.ends_on,'retiredAt',to_char(g.retired_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by g.id),'[]') into retired from public.teaching_groups g join public.elective_blocks b on b.id=g.block_id where b.unit_id=unit and b.school_year=elective_placement_projection.school_year and g.retired_at is not null;
 select coalesce(jsonb_agg(b.id order by b.id),'[]') into released from public.elective_blocks b where b.unit_id=unit and b.school_year=elective_placement_projection.school_year and b.organization_retired_at is not null;
 if jsonb_array_length(retired)>0 then result:=result||jsonb_build_object('retiredGroups',retired);end if;
 if jsonb_array_length(released)>0 then result:=result||jsonb_build_object('releasedBlockIds',released);end if;return result;
end $$;
revoke all on function public.elective_retired_identity_guard(),public.elective_reclaim_organization(),public.elective_retire_group(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
commit;
