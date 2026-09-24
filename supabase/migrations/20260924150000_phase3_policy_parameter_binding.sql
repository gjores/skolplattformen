-- Rättar kolumn-/parameterkollision upptäckt av två skilda giltiga mandat.
create or replace function public.phase3_pupil_in_scope(assignment_id uuid,pupil_id uuid,case_id uuid default null)
returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
  select exists(select 1 from public.access_assignments a
    join public.phase3_probe_pupils p on p.id=$2 and p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
    join public.mandate_units u on u.assignment_id=a.id and u.unit_id=p.unit_id
    where a.id=$1 and public.phase3_mandate_is_valid(a.id)
      and a.function in ('rektor','larare','administrator','elevhalsa','support')
      and ( $3 is null or exists(select 1 from public.phase3_probe_cases c where c.id=$3 and c.pupil_id=p.id))
      and (a.scope_kind='school'
        or (a.scope_kind='group' and exists(select 1 from public.mandate_groups g
          join public.phase3_probe_group_members gm on gm.group_id=g.group_id and gm.pupil_id=p.id where g.assignment_id=a.id))
        or (a.scope_kind='pupil' and exists(select 1 from public.mandate_pupils mp where mp.assignment_id=a.id and mp.pupil_id=p.id))
        or (a.scope_kind='case' and exists(select 1 from public.mandate_cases mc
          join public.phase3_probe_cases c on c.id=mc.case_id and c.pupil_id=p.id where mc.assignment_id=a.id and mc.case_id=$3))))
$$;

