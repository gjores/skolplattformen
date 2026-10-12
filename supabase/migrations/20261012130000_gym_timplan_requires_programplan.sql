-- Gymnasiets flöde börjar med en programplan. Befintliga fristående timplaner
-- måste granskas och hanteras separat innan migrationen får installeras.
-- Grundskola och introduktionsprogram använder sina befintliga underlag.
lock table public.offerings, public.timplans in share row exclusive mode;

do $$
begin
 if exists(select 1 from public.timplans t join public.offerings o on o.id=t.offering_id
   where o.kind='gymnasium' and t.source_programplan_id is null) then
  raise exception 'Review unlinked gymnasium timplans before applying this migration' using errcode='23514';
 end if;
end $$;

create function public.require_gym_timplan_programplan() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Lås utbildningen så skolformen inte kan bytas samtidigt som planen skapas.
 perform 1 from public.offerings where id=new.offering_id for share;
 if exists(select 1 from public.offerings where id=new.offering_id and kind='gymnasium')
   and new.source_programplan_id is null then
  raise exception 'Gymnasium timplans require a programplan' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.require_gym_timplan_programplan() from public,anon,authenticated;
create trigger timplans_require_programplan before insert or update on public.timplans
 for each row execute function public.require_gym_timplan_programplan();

create function public.require_gym_offering_programplans() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.kind='gymnasium' and exists(select 1 from public.timplans where offering_id=new.id and source_programplan_id is null) then
  raise exception 'Gymnasium timplans require a programplan' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.require_gym_offering_programplans() from public,anon,authenticated;
create trigger offerings_require_timplan_programplan before update of kind on public.offerings
 for each row execute function public.require_gym_offering_programplans();
