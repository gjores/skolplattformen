-- Intern personalbindning. Inga nya app-/klienträttigheter öppnas.
-- Namn, e-post och äldre profiles används aldrig som identitetsbevis.
create table public.staff_assignment_bindings (
  staff_assignment_id uuid primary key,
  membership_id uuid not null,
  customer_id uuid not null,
  organizer_id uuid not null,
  foreign key (staff_assignment_id, organizer_id) references public.assignments(id, organizer_id),
  foreign key (membership_id, customer_id) references public.memberships(id, customer_id),
  foreign key (organizer_id, customer_id) references public.organizers(id, customer_id)
);
alter table public.staff_assignment_bindings enable row level security;
alter table public.staff_assignment_bindings force row level security;
revoke all on public.staff_assignment_bindings from public, anon, authenticated, skolplattform_worker;

-- Separat predikat för rektor/lärare, inte full mandatgiltighet.
-- Andra roller nekar här och ska hanteras separat i kommande policyfunktion.
create function public.phase3_staff_binding_is_valid(assignment_id uuid)
returns boolean language sql stable security invoker
set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public.access_assignments a
    join public.staff_assignment_bindings b on b.staff_assignment_id=a.staff_assignment_id
      and b.membership_id=a.membership_id and b.customer_id=a.customer_id and b.organizer_id=a.organizer_id
    join public.assignments s on s.id=b.staff_assignment_id and s.organizer_id=b.organizer_id
    join public.memberships m on m.id=b.membership_id and m.status='active'
    where a.id=assignment_id and a.profile_id='synthetic-v1'
      and a.function in ('rektor','larare') and s.role::text=a.function::text
      and exists (select 1 from public.mandate_units u where u.assignment_id=a.id)
      and not exists (
        select 1 from public.mandate_units u where u.assignment_id=a.id
        and not exists (select 1 from public.assignment_units su
          where su.assignment_id=s.id and su.unit_id=u.unit_id)
      )
  )
$$;
revoke all on function public.phase3_staff_binding_is_valid(uuid)
from public, anon, authenticated, skolplattform_worker;
