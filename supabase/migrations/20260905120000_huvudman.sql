-- Huvudmannadelen: huvudman, skolenheter, uppdrag, utbildningar, tillstånd
-- och poängplaner. Speglar web/lib/organisation-model.ts.
--
-- Principer
--   * Varje rad hör till en huvudman (organizer_id). Radnivåskydd (RLS)
--     släpper igenom bara den inloggades egen huvudman.
--   * Skolenhetskoden är Skolverkets identitet; registrets svar sparas
--     oförändrat i registry_snapshots som proveniens. Lokala beslut skrivs
--     aldrig tillbaka till registret.
--   * Poängplaner och tillstånd är versionerade beslut: en fastställd rad
--     redigeras inte, den ersätts.
--   * Elever ligger inte här. En elev är inskriven vid exakt en skolenhet och
--     hör till elevregistret (senare migration, SS 12000).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Typer
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('huvudman', 'rektor', 'administrator', 'larare');
create type public.organizer_type as enum ('Kommun', 'Enskild', 'Region', 'Staten');
create type public.offering_kind as enum ('grundskola', 'gymnasium', 'introduktionsprogram');
create type public.offering_status as enum ('planerad', 'aktiv', 'avvecklas');
create type public.permit_issuer as enum ('Skolinspektionen', 'Skolverket', 'Huvudmannens beslut');
create type public.plan_status as enum ('utkast', 'faststalld', 'ersatt');
create type public.staff_role as enum ('rektor', 'larare');

-- ---------------------------------------------------------------------------
-- Huvudman och användare
-- ---------------------------------------------------------------------------
create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  organization_number text unique check (organization_number ~ '^\d{10}$'),
  name text not null,
  type public.organizer_type not null,
  created_at timestamptz not null default now()
);

-- En profil per inloggad användare. Rollen är exempelroll tills verklig
-- behörighet (Skolfederation/SAML) är på plats; RLS använder den redan nu.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organizer_id uuid not null references public.organizers (id) on delete restrict,
  name text not null,
  role public.app_role not null default 'larare',
  created_at timestamptz not null default now()
);

create or replace function public.current_organizer_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select organizer_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Skolenheter
-- ---------------------------------------------------------------------------
create table public.school_units (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  code text not null check (code ~ '^\d{8}$'),
  name text not null,
  municipality_code text not null,
  municipality_name text,
  status text not null default 'Okänd',
  head_master text,
  locality text,
  source_name text not null default 'Skolenhetsregistret',
  source_url text,
  source_fetched date,
  source_modified date,
  pupil_register_source text not null default 'Inget register kopplat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organizer_id, code)
);

-- Skolformer per skolenhet: årskurser sätts av huvudmannen (registret anger
-- dem inte), program kommer ur registret.
create table public.school_unit_types (
  unit_id uuid not null references public.school_units (id) on delete cascade,
  school_type text not null,                       -- GR, GY, FKLASS, FTH …
  grades smallint[] check (grades <@ array[1,2,3,4,5,6,7,8,9]::smallint[]),
  programmes text[] not null default '{}',         -- registrets programkoder, t.ex. {NA,SA}
  primary key (unit_id, school_type)
);

-- Registrets svar som det såg ut vid hämtningen. Proveniens, inte arbetsdata.
create table public.registry_snapshots (
  id uuid primary key default gen_random_uuid(),
  unit_code text not null,
  fetched_at timestamptz not null default now(),
  fetched_by uuid references auth.users (id),
  source_url text not null,
  payload jsonb not null
);
create index registry_snapshots_unit_code_idx on public.registry_snapshots (unit_code, fetched_at desc);

-- ---------------------------------------------------------------------------
-- Uppdrag: rektor leder en eller flera skolenheter, lärare kan tjänstgöra
-- vid flera. (Skollagen 2 kap. 9 §)
-- ---------------------------------------------------------------------------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  name text not null,
  role public.staff_role not null,
  created_at timestamptz not null default now()
);
create table public.assignment_units (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  unit_id uuid not null references public.school_units (id) on delete cascade,
  primary key (assignment_id, unit_id)
);

-- ---------------------------------------------------------------------------
-- Utbildningar (studievägar) vid en skolenhet
-- ---------------------------------------------------------------------------
create table public.offerings (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  unit_id uuid not null references public.school_units (id) on delete cascade,
  kind public.offering_kind not null,
  name text not null check (length(trim(name)) > 0),
  local_code text,
  program_code text,                                -- ur Skolverkets katalog, t.ex. ES25
  orientation_code text,                            -- t.ex. ESBIF
  grades smallint[],
  cohort text not null,
  status public.offering_status not null default 'planerad',
  catalog_fetched date,                             -- vilken katalogversion koderna kom ur
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'gymnasium') = (program_code is not null))
);
create index offerings_unit_idx on public.offerings (unit_id);

-- ---------------------------------------------------------------------------
-- Tillstånd och beslut per utbildning
-- ---------------------------------------------------------------------------
create table public.permits (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  offering_id uuid not null references public.offerings (id) on delete cascade,
  issuer public.permit_issuer not null,
  reference text not null check (length(trim(reference)) > 0),
  decided date not null,
  valid_from date not null,
  valid_to date check (valid_to is null or valid_to >= valid_from),
  scope text not null default '',
  file_path text,                                   -- objekt i bucket "tillstand"
  file_name text,
  file_size integer,
  file_type text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index permits_offering_idx on public.permits (offering_id);

-- ---------------------------------------------------------------------------
-- Poängplaner: versionerade, huvudmannen fastställer (GyF 4 kap. 6 §)
-- ---------------------------------------------------------------------------
create table public.point_plans (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  offering_id uuid not null references public.offerings (id) on delete cascade,
  version integer not null check (version >= 1),
  status public.plan_status not null default 'utkast',
  specialization text[] not null default '{}',      -- nivåkoder i programfördjupningen
  catalog_fetched date,
  decided_on date,
  decided_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, version)
);
-- Högst ett utkast och högst en fastställd version per utbildning.
create unique index point_plans_one_draft on public.point_plans (offering_id) where status = 'utkast';
create unique index point_plans_one_decided on public.point_plans (offering_id) where status = 'faststalld';

create table public.point_plan_events (
  id uuid primary key default gen_random_uuid(),
  point_plan_id uuid not null references public.point_plans (id) on delete cascade,
  actor uuid references auth.users (id),
  actor_role public.app_role not null,
  action text not null,                             -- Utkast påbörjat, Fastställd, Kommentar …
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index point_plan_events_plan_idx on public.point_plan_events (point_plan_id, created_at desc);

-- Händelselogg för huvudmannen (skolenhet tillagd, tillstånd registrerat …)
create table public.organisation_events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  actor uuid references auth.users (id),
  actor_role public.app_role not null,
  action text not null,
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index organisation_events_org_idx on public.organisation_events (organizer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger school_units_touch before update on public.school_units for each row execute function public.touch_updated_at();
create trigger offerings_touch before update on public.offerings for each row execute function public.touch_updated_at();
create trigger point_plans_touch before update on public.point_plans for each row execute function public.touch_updated_at();

-- En fastställd poängplan redigeras inte; den ersätts av en ny version.
create or replace function public.guard_decided_point_plan()
returns trigger language plpgsql as $$
begin
  if old.status = 'faststalld' and new.status = 'faststalld'
     and (new.specialization is distinct from old.specialization) then
    raise exception 'En fastställd poängplan ändras inte. Skapa en ny version.';
  end if;
  return new;
end $$;
create trigger point_plans_guard before update on public.point_plans for each row execute function public.guard_decided_point_plan();

-- ---------------------------------------------------------------------------
-- Radnivåskydd. Allt är avgränsat till den egna huvudmannen; skrivning i
-- grunden är huvudmannens, poängplansutkast får rektorn också arbeta i.
-- ---------------------------------------------------------------------------
alter table public.organizers enable row level security;
alter table public.profiles enable row level security;
alter table public.school_units enable row level security;
alter table public.school_unit_types enable row level security;
alter table public.registry_snapshots enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_units enable row level security;
alter table public.offerings enable row level security;
alter table public.permits enable row level security;
alter table public.point_plans enable row level security;
alter table public.point_plan_events enable row level security;
alter table public.organisation_events enable row level security;

create policy organizers_read on public.organizers for select using (id = public.current_organizer_id());
create policy profiles_read on public.profiles for select using (organizer_id = public.current_organizer_id());

create policy school_units_read on public.school_units for select using (organizer_id = public.current_organizer_id());
create policy school_units_write on public.school_units for all
  using (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman')
  with check (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman');

create policy school_unit_types_read on public.school_unit_types for select
  using (exists (select 1 from public.school_units u where u.id = unit_id and u.organizer_id = public.current_organizer_id()));
create policy school_unit_types_write on public.school_unit_types for all
  using (public.current_app_role() = 'huvudman' and exists (select 1 from public.school_units u where u.id = unit_id and u.organizer_id = public.current_organizer_id()))
  with check (public.current_app_role() = 'huvudman' and exists (select 1 from public.school_units u where u.id = unit_id and u.organizer_id = public.current_organizer_id()));

create policy registry_snapshots_read on public.registry_snapshots for select using (auth.uid() is not null);
create policy registry_snapshots_insert on public.registry_snapshots for insert with check (auth.uid() is not null and fetched_by = auth.uid());

create policy assignments_read on public.assignments for select using (organizer_id = public.current_organizer_id());
create policy assignments_write on public.assignments for all
  using (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman')
  with check (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman');
create policy assignment_units_read on public.assignment_units for select
  using (exists (select 1 from public.assignments a where a.id = assignment_id and a.organizer_id = public.current_organizer_id()));
create policy assignment_units_write on public.assignment_units for all
  using (public.current_app_role() = 'huvudman' and exists (select 1 from public.assignments a where a.id = assignment_id and a.organizer_id = public.current_organizer_id()))
  with check (public.current_app_role() = 'huvudman' and exists (select 1 from public.assignments a where a.id = assignment_id and a.organizer_id = public.current_organizer_id()));

create policy offerings_read on public.offerings for select using (organizer_id = public.current_organizer_id());
create policy offerings_write on public.offerings for all
  using (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman')
  with check (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman');

create policy permits_read on public.permits for select using (organizer_id = public.current_organizer_id());
create policy permits_write on public.permits for all
  using (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman')
  with check (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman');

-- Rektor och huvudman utformar utkast; bara huvudmannen sätter status fastställd/ersatt.
create policy point_plans_read on public.point_plans for select using (organizer_id = public.current_organizer_id());
create policy point_plans_insert on public.point_plans for insert
  with check (organizer_id = public.current_organizer_id() and public.current_app_role() in ('huvudman', 'rektor') and status = 'utkast');
create policy point_plans_update_draft on public.point_plans for update
  using (organizer_id = public.current_organizer_id() and public.current_app_role() in ('huvudman', 'rektor') and status = 'utkast')
  with check (organizer_id = public.current_organizer_id() and (status = 'utkast' or public.current_app_role() = 'huvudman'));
create policy point_plans_update_decided on public.point_plans for update
  using (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman')
  with check (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman');

create policy point_plan_events_read on public.point_plan_events for select
  using (exists (select 1 from public.point_plans p where p.id = point_plan_id and p.organizer_id = public.current_organizer_id()));
create policy point_plan_events_insert on public.point_plan_events for insert
  with check (actor = auth.uid() and exists (select 1 from public.point_plans p where p.id = point_plan_id and p.organizer_id = public.current_organizer_id()));

create policy organisation_events_read on public.organisation_events for select using (organizer_id = public.current_organizer_id());
create policy organisation_events_insert on public.organisation_events for insert
  with check (organizer_id = public.current_organizer_id() and actor = auth.uid());

-- ---------------------------------------------------------------------------
-- Lagring: tillståndsbeslut som filer, privata, per huvudman.
-- Sökväg: <organizer_id>/<offering_id>/<filnamn>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tillstand', 'tillstand', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy tillstand_read on storage.objects for select
  using (bucket_id = 'tillstand' and (storage.foldername(name))[1] = public.current_organizer_id()::text);
create policy tillstand_write on storage.objects for insert
  with check (bucket_id = 'tillstand' and public.current_app_role() = 'huvudman' and (storage.foldername(name))[1] = public.current_organizer_id()::text);
create policy tillstand_delete on storage.objects for delete
  using (bucket_id = 'tillstand' and public.current_app_role() = 'huvudman' and (storage.foldername(name))[1] = public.current_organizer_id()::text);
