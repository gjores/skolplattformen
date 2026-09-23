-- Intern kedjeprövning, INTE ett fullständigt behörighetsbeslut.
-- Fortsatt stängd: inga GRANT, ingen inkoppling i assignment_is_valid.
-- Staff-bindning, objekt-/professionsscope, session och mutationslås måste
-- fortfarande prövas av den kommande kompletta mandatvägen.
create function public.phase3_mandate_chain_is_valid(assignment_id uuid)
returns boolean language plpgsql stable security invoker
set search_path = pg_catalog, public as $$
declare
  child public.access_assignments;
  parent public.access_assignments;
  cursor_id uuid := assignment_id;
  seen uuid[] := '{}';
  today date := (statement_timestamp() at time zone 'Europe/Stockholm')::date;
begin
  loop
    if cursor_id is null or cursor_id = any(seen) or cardinality(seen) >= 64 then return false; end if;
    seen := array_append(seen, cursor_id);
    select * into child from public.access_assignments where id = cursor_id;
    if not found then return false; end if;
    if child.profile_id is distinct from 'synthetic-v1' or child.ended_at is not null
       or child.valid_from > today or (child.valid_to is not null and child.valid_to < today)
       or (child.starts_at is not null and statement_timestamp() < child.starts_at)
       or (child.ends_at is not null and statement_timestamp() >= child.ends_at)
       or not exists (select 1 from public.memberships m join public.customers c on c.id=m.customer_id
         where m.id=child.membership_id and m.customer_id=child.customer_id and m.status='active' and c.closed_at is null)
       or not exists (select 1 from public.mandate_units u where u.assignment_id=child.id)
    then return false; end if;
    if child.parent_assignment_id is null then
      -- Elevhälsoansvarig förseedas; offentlig utnämning ingår inte.
      return child.function in ('huvudman','elevhalsoansvarig','it');
    end if;
    select * into parent from public.access_assignments where id=child.parent_assignment_id;
    if not found then return false; end if;
    if parent.customer_id is distinct from child.customer_id
       or parent.organizer_id is distinct from child.organizer_id
       or not ((parent.function='huvudman' and child.function='rektor')
         or (parent.function='rektor' and child.function in ('larare','administrator','elevhalsa','support'))
         or (parent.function='elevhalsoansvarig' and child.function='elevhalsa'))
       or exists (select 1 from public.memberships a join public.memberships b on a.identity_id=b.identity_id
         where a.id=child.membership_id and b.id=parent.membership_id)
       or child.valid_from < parent.valid_from
       or (parent.valid_to is not null and (child.valid_to is null or child.valid_to > parent.valid_to))
       or (parent.starts_at is not null and (child.starts_at is null or child.starts_at < parent.starts_at))
       or (parent.ends_at is not null and (child.ends_at is null or child.ends_at > parent.ends_at))
       or exists (select 1 from public.mandate_units cu where cu.assignment_id=child.id
         and not exists (select 1 from public.mandate_units pu
           where pu.assignment_id=parent.id and pu.unit_id=cu.unit_id and pu.customer_id=cu.customer_id))
    then return false; end if;
    cursor_id := parent.id;
  end loop;
end $$;
revoke all on function public.phase3_mandate_chain_is_valid(uuid)
from public, anon, authenticated, skolplattform_worker;
