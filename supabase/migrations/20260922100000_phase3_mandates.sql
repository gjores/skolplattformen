-- Fas 3, AVGRÄNSAD SCHEMAGRUND. Inga nya datavägar öppnas.
-- Fortsätt i NY migration med livekedja, kontrollerade mutationer och byte
-- av gamla Worker-rättigheter. Denna migration är inte hela plan 03-02.
alter table public.access_assignments
  add column parent_assignment_id uuid,
  add column issued_by_assignment_id uuid,
  add column profile_id text,
  add column scope_kind text,
  add column profession text,
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add column approved_by_assignment_id uuid,
  add column purpose_code text,
  add constraint access_assignments_id_customer_unique unique (id, customer_id),
  add constraint access_assignments_id_customer_org_unique unique (id, customer_id, organizer_id),
  add constraint phase3_profile check (profile_id is null or profile_id = 'synthetic-v1'),
  add constraint phase3_scope_kind check (scope_kind in ('school','group','pupil','case')),
  add constraint phase3_profession check (profession in ('specialpedagog','speciallarare','kurator','psykolog','skolskoterska','skollakare')),
  add constraint phase3_time check (
    (starts_at is null and ends_at is null) or
    (starts_at is not null and ends_at is not null and isfinite(starts_at) and isfinite(ends_at) and ends_at > starts_at)),
  add constraint phase3_profile_fields check (
    (profile_id is null and parent_assignment_id is null and issued_by_assignment_id is null
      and scope_kind is null and profession is null and starts_at is null and ends_at is null
      and approved_by_assignment_id is null and purpose_code is null
      and function not in ('elevhalsa','elevhalsoansvarig','it','support'))
    or (profile_id is not null and scope_kind is not null)),
  add constraint phase3_support_fields check (function <> 'support' or
    (profile_id is not null and scope_kind = 'pupil' and unit_id is not null
      and starts_at is not null and ends_at is not null
      and ends_at - starts_at <= interval '60 minutes'
      and parent_assignment_id is not null and approved_by_assignment_id is not null
      and approved_by_assignment_id = parent_assignment_id
      and purpose_code is not null and purpose_code = 'synthetic-troubleshooting')),
  add constraint phase3_parent_customer_fk foreign key (parent_assignment_id, customer_id)
    references public.access_assignments(id, customer_id),
  add constraint phase3_issuer_customer_fk foreign key (issued_by_assignment_id, customer_id)
    references public.access_assignments(id, customer_id),
  add constraint phase3_approver_customer_fk foreign key (approved_by_assignment_id, customer_id)
    references public.access_assignments(id, customer_id),
  add constraint phase3_parent_org_fk foreign key (parent_assignment_id, customer_id, organizer_id)
    references public.access_assignments(id, customer_id, organizer_id);

-- Ingen generellt skrivberättigad Worker får börja använda fas 3-fälten.
-- Ska ersättas tillsammans med snäva SECURITY DEFINER-mutationsfunktioner.
create function public.phase3_pending_mandate_guard() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if current_user <> 'postgres' and
     (new.profile_id is not null or (tg_op = 'UPDATE' and old.profile_id is not null)) then
    raise exception 'Fas 3-mandat är inte öppnade' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.phase3_pending_mandate_guard() from public, anon, authenticated, skolplattform_worker;
create trigger phase3_pending_mandate_guard before insert or update on public.access_assignments
for each row execute function public.phase3_pending_mandate_guard();

-- Förseedad fas 3-data får aldrig bli ett giltigt fas 2-uppdrag.
create or replace function public.assignment_is_valid(a public.access_assignments)
returns boolean language sql stable security invoker as $$
  select a.profile_id is null and a.ended_at is null
    and a.valid_from <= public.app_today()
    and (a.valid_to is null or a.valid_to >= public.app_today())
$$;

create table public.mandate_units (
  assignment_id uuid not null,
  customer_id uuid not null,
  organizer_id uuid not null,
  unit_id uuid not null,
  primary key (assignment_id, unit_id),
  unique (assignment_id, customer_id, unit_id),
  foreign key (assignment_id, customer_id, organizer_id)
    references public.access_assignments(id, customer_id, organizer_id),
  foreign key (unit_id, organizer_id) references public.school_units(id, organizer_id)
);

create table public.phase3_probe_pupils (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  organizer_id uuid not null,
  unit_id uuid not null,
  display_name text not null check (length(display_name) between 1 and 120),
  unique (id, customer_id, unit_id),
  foreign key (organizer_id, customer_id) references public.organizers(id, customer_id),
  foreign key (unit_id, organizer_id) references public.school_units(id, organizer_id)
);

create table public.phase3_probe_groups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  organizer_id uuid not null,
  unit_id uuid not null,
  
  unique (id, customer_id, unit_id),
  foreign key (organizer_id, customer_id) references public.organizers(id, customer_id),
  foreign key (unit_id, organizer_id) references public.school_units(id, organizer_id)
);

create table public.phase3_probe_group_members (
  group_id uuid not null,
  pupil_id uuid not null,
  customer_id uuid not null,
  unit_id uuid not null,
  primary key (group_id, pupil_id),
  foreign key (group_id, customer_id, unit_id) references public.phase3_probe_groups(id, customer_id, unit_id),
  foreign key (pupil_id, customer_id, unit_id) references public.phase3_probe_pupils(id, customer_id, unit_id)
);
create table public.phase3_probe_cases (
  id uuid primary key default gen_random_uuid(),
  pupil_id uuid not null,
  customer_id uuid not null,
  unit_id uuid not null,
  unique (id, customer_id, unit_id),
  foreign key (pupil_id, customer_id, unit_id) references public.phase3_probe_pupils(id, customer_id, unit_id)
);

create table public.mandate_groups (
  assignment_id uuid not null,
  group_id uuid not null,
  customer_id uuid not null,
  unit_id uuid not null,
  kind text not null check (kind in ('undervisning','mentor')),
  primary key (assignment_id, group_id),
  foreign key (assignment_id, customer_id, unit_id) references public.mandate_units(assignment_id, customer_id, unit_id),
  foreign key (group_id, customer_id, unit_id) references public.phase3_probe_groups(id, customer_id, unit_id)
);

create table public.mandate_pupils (
  assignment_id uuid not null,
  pupil_id uuid not null,
  customer_id uuid not null,
  unit_id uuid not null,
  
  primary key (assignment_id, pupil_id),
  foreign key (assignment_id, customer_id, unit_id) references public.mandate_units(assignment_id, customer_id, unit_id),
  foreign key (pupil_id, customer_id, unit_id) references public.phase3_probe_pupils(id, customer_id, unit_id)
);

create table public.mandate_cases (
  assignment_id uuid not null,
  case_id uuid not null,
  customer_id uuid not null,
  unit_id uuid not null,
  
  primary key (assignment_id, case_id),
  foreign key (assignment_id, customer_id, unit_id) references public.mandate_units(assignment_id, customer_id, unit_id),
  foreign key (case_id, customer_id, unit_id) references public.phase3_probe_cases(id, customer_id, unit_id)
);

create table public.local_connection_configs (
  customer_id uuid not null,
  organizer_id uuid not null,
  unit_id uuid primary key,
  enabled boolean not null default false,
  version integer not null default 1 check (version > 0),
  updated_by_assignment_id uuid not null,
  updated_at timestamptz not null default now(),
  foreign key (organizer_id, customer_id) references public.organizers(id, customer_id),
  foreign key (unit_id, organizer_id) references public.school_units(id, organizer_id),
  foreign key (updated_by_assignment_id, customer_id, organizer_id)
    references public.access_assignments(id, customer_id, organizer_id)
);
alter table public.mandate_units enable row level security;
alter table public.mandate_units force row level security;
revoke all on public.mandate_units from public, anon, authenticated, skolplattform_worker;
alter table public.mandate_groups enable row level security;
alter table public.mandate_groups force row level security;
revoke all on public.mandate_groups from public, anon, authenticated, skolplattform_worker;
alter table public.mandate_pupils enable row level security;
alter table public.mandate_pupils force row level security;
revoke all on public.mandate_pupils from public, anon, authenticated, skolplattform_worker;
alter table public.mandate_cases enable row level security;
alter table public.mandate_cases force row level security;
revoke all on public.mandate_cases from public, anon, authenticated, skolplattform_worker;
alter table public.phase3_probe_pupils enable row level security;
alter table public.phase3_probe_pupils force row level security;
revoke all on public.phase3_probe_pupils from public, anon, authenticated, skolplattform_worker;
alter table public.phase3_probe_groups enable row level security;
alter table public.phase3_probe_groups force row level security;
revoke all on public.phase3_probe_groups from public, anon, authenticated, skolplattform_worker;
alter table public.phase3_probe_group_members enable row level security;
alter table public.phase3_probe_group_members force row level security;
revoke all on public.phase3_probe_group_members from public, anon, authenticated, skolplattform_worker;
alter table public.phase3_probe_cases enable row level security;
alter table public.phase3_probe_cases force row level security;
revoke all on public.phase3_probe_cases from public, anon, authenticated, skolplattform_worker;
alter table public.local_connection_configs enable row level security;
alter table public.local_connection_configs force row level security;
revoke all on public.local_connection_configs from public, anon, authenticated, skolplattform_worker;
