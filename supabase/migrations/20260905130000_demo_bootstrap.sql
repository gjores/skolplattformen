-- Exempelinloggning för förhandsversionen.
--
-- Förhandsversionen har ingen verklig identitet. Varje besökare loggas in
-- anonymt och knyts till samma demohuvudman med rollen huvudman, så att
-- ändringar blir gemensamma i stället för sessionsbundna. Detta är en
-- demokonstruktion: verklig behörighet kräver Skolfederation eller
-- motsvarande och rollsättning av huvudmannen. Migrationen ska tas bort
-- innan produktion.

insert into public.organizers (id, organization_number, name, type)
values ('00000000-0000-4000-8000-000000000001', '5599999901', 'Testskolan i Exempelstad AB', 'Enskild')
on conflict (id) do nothing;

create or replace function public.bootstrap_demo_profile(display_name text default 'Exempelanvändare')
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Ingen inloggad användare.';
  end if;
  insert into public.profiles (id, organizer_id, name, role)
  values (auth.uid(), '00000000-0000-4000-8000-000000000001', display_name, 'huvudman')
  on conflict (id) do update set name = excluded.name
  returning * into result;
  return result;
end
$$;

revoke execute on function public.bootstrap_demo_profile(text) from public, anon;
grant execute on function public.bootstrap_demo_profile(text) to authenticated;
