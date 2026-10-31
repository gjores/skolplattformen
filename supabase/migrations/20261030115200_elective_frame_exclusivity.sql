-- One funded time position per class belongs to one overlapping elective block.
-- A whole frame conflicts with each subdivision; distinct stable position IDs may coexist.
begin;
create function public.elective_assert_frame_exclusive(block_id uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare b public.elective_blocks;begin
 select * into b from public.elective_blocks x where x.id=block_id;if not found then return;end if;
 perform public.elective_lock_school(b.unit_id);
 if exists(select 1 from public.elective_block_sources a join public.elective_block_sources other on other.class_id=a.class_id and other.block_id<>a.block_id and other.active
 join public.elective_blocks ob on ob.id=other.block_id and ob.unit_id=b.unit_id and ob.school_year=b.school_year
 where a.block_id=b.id and a.active and daterange(b.starts_on,b.ends_on,'[]')&&daterange(ob.starts_on,ob.ends_on,'[]')
 and coalesce(a.source_ref->>'frameSourceKey',a.source_key)=coalesce(other.source_ref->>'frameSourceKey',other.source_key)
 and (a.source_ref->'timeDetailRef' is null or a.source_ref->'timeDetailRef'='null'::jsonb or other.source_ref->'timeDetailRef' is null or other.source_ref->'timeDetailRef'='null'::jsonb
  or a.source_ref->'timeDetailRef'->>'positionId'=other.source_ref->'timeDetailRef'->>'positionId')) then
  raise exception 'Time position already belongs to another block' using errcode='40001',hint='elective_frame_conflict';end if;
end $$;
create function public.elective_frame_source_guard() returns trigger
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin if new.active then perform public.elective_assert_frame_exclusive(new.block_id);end if;return new;end $$;
create trigger elective_frame_source_guard after insert or update on public.elective_block_sources for each row execute function public.elective_frame_source_guard();
create function public.elective_frame_period_guard() returns trigger
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin perform public.elective_assert_frame_exclusive(new.id);return new;end $$;
create constraint trigger elective_frame_period_guard after update on public.elective_blocks deferrable initially deferred for each row execute function public.elective_frame_period_guard();
create function public.elective_frame_round_guard() returns trigger
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin if new.status='open' then perform public.elective_assert_frame_exclusive(new.block_id);end if;return new;end $$;
create trigger elective_frame_round_guard before insert or update on public.elective_rounds for each row execute function public.elective_frame_round_guard();
revoke all on function public.elective_assert_frame_exclusive(uuid),public.elective_frame_source_guard(),public.elective_frame_period_guard(),public.elective_frame_round_guard() from public,anon,authenticated,skolplattform_worker;
commit;
