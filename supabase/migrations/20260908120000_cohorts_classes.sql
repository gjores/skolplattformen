-- New cohorts are independent drafts. Copy the complete bundle atomically.
create or replace function public.copy_offering_cohort(source_id uuid, target_year integer)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  src public.offerings; pp public.point_plans; tp public.timplans;
  new_id uuid; new_pp uuid; new_tp uuid; target_cohort text;
begin
  if public.current_app_role() is distinct from 'huvudman' then
    raise exception 'Bara huvudmannen kopierar utbildningar.';
  end if;
  if target_year is null or target_year < 2000 or target_year > 2100 then raise exception 'Ange ett giltigt startår.'; end if;
  select * into src from public.offerings where id = source_id and organizer_id = public.current_organizer_id();
  if not found then raise exception 'Utbildningen finns inte.'; end if;
  if target_year <= coalesce(substring(src.cohort from '(20[0-9]{2})')::integer, 1999) then
    raise exception 'Den nya kullen ska börja efter den ursprungliga.';
  end if;
  target_cohort := case when src.kind = 'gymnasium' then 'Elever som börjar HT ' || target_year
    else 'Läsåret ' || target_year || '/' || right((target_year + 1)::text, 2) end;
  perform pg_advisory_xact_lock(hashtextextended(src.unit_id::text || src.name || target_cohort, 0));
  if exists(select 1 from public.offerings where unit_id = src.unit_id and name = src.name and kind = src.kind and cohort = target_cohort) then
    raise exception 'Utbildningen finns redan för den kullen.';
  end if;
  insert into public.offerings(organizer_id, unit_id, kind, name, local_code, program_code, orientation_code, grades, cohort, status, catalog_fetched, created_by)
    values(src.organizer_id, src.unit_id, src.kind, src.name, src.local_code, src.program_code, src.orientation_code, src.grades, target_cohort, 'planerad', src.catalog_fetched, auth.uid()) returning id into new_id;
  select * into pp from public.point_plans where offering_id = source_id and status <> 'ersatt' order by version desc limit 1;
  if found then
    insert into public.point_plans(organizer_id, offering_id, version, specialization, catalog_fetched, created_by)
      values(src.organizer_id, new_id, 1, pp.specialization, pp.catalog_fetched, auth.uid()) returning id into new_pp;
    insert into public.point_plan_events(point_plan_id, actor, actor_role, action, comment)
      values(new_pp, auth.uid(), 'huvudman', 'Kopierad till ny kull', 'Utgår från ' || src.cohort || ', poängplan v' || pp.version || '. Nytt beslut behövs.');
  end if;
  select * into tp from public.timplans where offering_id = source_id and status <> 'ersatt' order by version desc limit 1;
  if found then
    insert into public.timplans(organizer_id, offering_id, version, basis, catalog_fetched, created_by)
      values(src.organizer_id, new_id, 1, case when new_pp is not null then 'Poängplan v1' else tp.basis end, tp.catalog_fetched, auth.uid()) returning id into new_tp;
    insert into public.timplan_cells(timplan_id, row_id, hours) select new_tp, row_id, hours from public.timplan_cells where timplan_id = tp.id;
    insert into public.timplan_events(timplan_id, actor, actor_role, action, comment)
      values(new_tp, auth.uid(), 'huvudman', 'Kopierad till ny kull', 'Utgår från ' || src.cohort || ', timplan v' || tp.version || '. Nytt beslut behövs.');
  end if;
  insert into public.organisation_events(organizer_id, actor, actor_role, action, comment)
    values(src.organizer_id, auth.uid(), 'huvudman', 'Utbildning kopierad', src.name || ': ' || src.cohort || ' → ' || target_cohort);
  return new_id;
end $$;
revoke all on function public.copy_offering_cohort(uuid, integer) from public, anon;
grant execute on function public.copy_offering_cohort(uuid, integer) to authenticated;

create table public.class_timplans (
  unit_id uuid not null references public.school_units(id) on delete cascade,
  class_name text not null check(length(class_name) between 1 and 60 and class_name = upper(btrim(class_name))),
  start_year integer not null check(start_year between 2000 and 2100),
  timplan_id uuid not null references public.timplans(id) on delete restrict,
  column_id text not null,
  updated_at timestamptz not null default now(),
  primary key(unit_id, class_name, start_year)
);
alter table public.class_timplans enable row level security;
create policy class_timplans_read on public.class_timplans for select to authenticated
  using(exists(select 1 from public.school_units u where u.id = unit_id and u.organizer_id = public.current_organizer_id()));
create policy class_timplans_write on public.class_timplans for all to authenticated
  using(public.current_app_role() in ('huvudman','rektor') and exists(select 1 from public.school_units u where u.id = unit_id and u.organizer_id = public.current_organizer_id()))
  with check(public.current_app_role() in ('huvudman','rektor') and exists(select 1 from public.school_units u where u.id = unit_id and u.organizer_id = public.current_organizer_id()));
create or replace function public.validate_class_timplan() returns trigger
language plpgsql security invoker set search_path = public as $$
declare o public.offerings; p public.timplans;
begin
  select * into p from public.timplans where id = new.timplan_id;
  if not found or p.status <> 'faststalld' then raise exception 'Välj en fastställd timplan.'; end if;
  select * into o from public.offerings where id = p.offering_id;
  if not found or o.unit_id <> new.unit_id then raise exception 'Timplanen hör till en annan skolenhet.'; end if;
  if (o.kind = 'gymnasium' and new.column_id not in ('ar1','ar2','ar3'))
    or (o.kind = 'grundskola' and new.column_id not in (select 'ak' || g from unnest(coalesce(o.grades, array[1,2,3,4,5,6,7,8,9]::smallint[])) g))
    or (o.kind = 'introduktionsprogram' and new.column_id <> 'vecka') then
    raise exception 'Välj en årskurs som finns i timplanen.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger class_timplans_validate before insert or update on public.class_timplans for each row execute function public.validate_class_timplan();
