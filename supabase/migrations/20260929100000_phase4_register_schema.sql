-- Fas 4: stängt syntetiskt register. Inga RPC-/tabellrättigheter öppnas här.
begin;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

-- Ren formatkontroll: TEST-prefix, faktiskt kalenderdatum och Luhn YYMMDDNNNK.
-- Allowlist tillkommer via FK, aldrig genom formatkontrollen ensam.
create function public.phase4_synthetic_birth_date(value text) returns date
language plpgsql immutable strict set search_path = pg_catalog as $$
declare born date; digits text; total integer := 0; digit integer; i integer;
begin
  if length(value) <> 18 or value !~ '^TEST-[0-9]{8}-[0-9]{4}$' then return null; end if;
  begin
    born := make_date(substring(value,6,4)::integer,substring(value,10,2)::integer,substring(value,12,2)::integer);
  exception when datetime_field_overflow then return null;
  end;
  digits := substring(value,8,6) || substring(value,15,4);
  for i in 1..10 loop
    digit := substring(digits,i,1)::integer * case when i % 2 = 1 then 2 else 1 end;
    total := total + digit / 10 + digit % 10;
  end loop;
  if total % 10 <> 0 then return null; end if;
  return born;
end $$;
revoke all on function public.phase4_synthetic_birth_date(text) from public, anon, authenticated, skolplattform_worker;

create table public.municipalities (
  code text primary key check (code ~ '^[0-9]{4}$'),
  name text not null check (length(btrim(name)) between 1 and 100)
);
create table public.synthetic_pupil_numbers (
  personal_number text primary key,
  birth_date date generated always as (public.phase4_synthetic_birth_date(personal_number)) stored not null
);
create table public.pupils (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  organizer_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 240),
  personal_number text not null references public.synthetic_pupil_numbers(personal_number),
  birth_date date generated always as (public.phase4_synthetic_birth_date(personal_number)) stored not null,
  protected_identity boolean not null default false,
  anonymous_name text not null check (length(btrim(anonymous_name)) between 1 and 120),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,customer_id),
  unique (id,customer_id,organizer_id),
  unique (customer_id,personal_number),
  foreign key (organizer_id,customer_id) references public.organizers(id,customer_id)
);
alter table public.offerings add column start_year integer check (start_year between 1 and 9998);
-- Bara den entydiga, etablerade gymnasieetiketten; fri text och andra skolformer lämnas null.
update public.offerings set start_year = right(cohort,4)::integer
where kind = 'gymnasium' and cohort ~ '^Elever som börjar HT [0-9]{4}$'
  and right(cohort,4)::integer between 1 and 9998;
alter table public.offerings add constraint offerings_id_unit_organizer_unique unique(id,unit_id,organizer_id);

create table public.school_classes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null, organizer_id uuid not null, unit_id uuid not null,
  offering_id uuid not null,
  name text not null check (length(name) between 1 and 60 and name = upper(btrim(name))),
  start_year integer not null check (start_year between 1 and 9998),
  unique(unit_id,name,start_year),
  unique(id,customer_id,unit_id),
  unique(id,customer_id,organizer_id,unit_id),
  foreign key(organizer_id,customer_id) references public.organizers(id,customer_id),
  foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id),
  foreign key(offering_id,unit_id,organizer_id) references public.offerings(id,unit_id,organizer_id)
);

create table public.pupil_placements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null, organizer_id uuid not null, pupil_id uuid not null,
  unit_id uuid not null, offering_id uuid not null,
  foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id),
  foreign key(offering_id,unit_id,organizer_id) references public.offerings(id,unit_id,organizer_id),
  unique(id,customer_id,pupil_id,unit_id),
  starts_on date not null check (isfinite(starts_on)),
  ends_on date check (ends_on is null or (isfinite(ends_on) and ends_on >= starts_on)),
  foreign key(pupil_id,customer_id,organizer_id) references public.pupils(id,customer_id,organizer_id),
  exclude using gist (pupil_id with =, daterange(starts_on,ends_on,'[]') with &&)
);

create table public.pupil_class_memberships (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null, organizer_id uuid not null, pupil_id uuid not null,
  unit_id uuid not null, class_id uuid not null, placement_id uuid not null,
  foreign key(placement_id,customer_id,pupil_id,unit_id) references public.pupil_placements(id,customer_id,pupil_id,unit_id),
  foreign key(class_id,customer_id,organizer_id,unit_id) references public.school_classes(id,customer_id,organizer_id,unit_id),
  starts_on date not null check (isfinite(starts_on)),
  ends_on date check (ends_on is null or (isfinite(ends_on) and ends_on >= starts_on)),
  foreign key(pupil_id,customer_id,organizer_id) references public.pupils(id,customer_id,organizer_id),
  exclude using gist (pupil_id with =, daterange(starts_on,ends_on,'[]') with &&)
);

create table public.pupil_home_municipalities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null, organizer_id uuid not null, pupil_id uuid not null,
  municipality_code text not null references public.municipalities(code),
  starts_on date not null check (isfinite(starts_on)),
  ends_on date check (ends_on is null or (isfinite(ends_on) and ends_on >= starts_on)),
  foreign key(pupil_id,customer_id,organizer_id) references public.pupils(id,customer_id,organizer_id),
  exclude using gist (pupil_id with =, daterange(starts_on,ends_on,'[]') with &&)
);

create table public.pupil_field_state (
  customer_id uuid not null, organizer_id uuid not null, pupil_id uuid not null,
  field text not null check(field in ('displayName','personalNumber','protectedIdentity','municipality','placement','education','class')),
  source text not null check(source in ('manual','ss12000','spar','simulated')),
  actor_id uuid not null,
  changed_at timestamptz not null default now(),
  local_correction boolean not null default false,
  revision integer not null check (revision > 0),
  primary key(pupil_id,field),
  foreign key(pupil_id,customer_id,organizer_id) references public.pupils(id,customer_id,organizer_id),
  foreign key(actor_id,customer_id) references public.memberships(id,customer_id)
);

create table public.pupil_field_history (
  customer_id uuid not null, organizer_id uuid not null, pupil_id uuid not null,
  field text not null check(field in ('displayName','personalNumber','protectedIdentity','municipality','placement','education','class')),
  source text not null check(source in ('manual','ss12000','spar','simulated')),
  actor_id uuid not null,
  changed_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  before_value jsonb, after_value jsonb,
  revision integer not null check (revision > 0),
  foreign key(pupil_id,customer_id,organizer_id) references public.pupils(id,customer_id,organizer_id),
  foreign key(actor_id,customer_id) references public.memberships(id,customer_id)
);

create table public.pupil_source_values (
  customer_id uuid not null, organizer_id uuid not null, pupil_id uuid not null,
  field text not null check(field in ('displayName','personalNumber','protectedIdentity','municipality','placement','education','class')),
  source text not null check(source in ('manual','ss12000','spar','simulated')),
  actor_id uuid not null,
  changed_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  source_value jsonb not null,
  resolved_at timestamptz,
  resolution text check (resolution in ('local','source')),
  check ((resolved_at is null) = (resolution is null)),
  foreign key(pupil_id,customer_id,organizer_id) references public.pupils(id,customer_id,organizer_id),
  foreign key(actor_id,customer_id) references public.memberships(id,customer_id)
);

-- Historiken är append-only även om en senare appfunktion får skrivrättigheter.
create function public.phase4_history_append_only() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  raise exception using errcode = '55000', message = 'register_history_append_only';
end $$;
revoke all on function public.phase4_history_append_only() from public,anon,authenticated,skolplattform_worker;
create trigger pupil_field_history_append_only before update or delete on public.pupil_field_history
for each row execute function public.phase4_history_append_only();
create trigger pupil_field_history_no_truncate before truncate on public.pupil_field_history
for each statement execute function public.phase4_history_append_only();
create index pupil_field_history_lookup on public.pupil_field_history(customer_id,pupil_id,changed_at desc,id);
create index pupil_source_values_lookup on public.pupil_source_values(customer_id,pupil_id) where resolved_at is null;
create index pupil_placements_school on public.pupil_placements(customer_id,unit_id,starts_on);
create index pupil_class_memberships_class on public.pupil_class_memberships(customer_id,class_id,starts_on);
alter table public.municipalities enable row level security;
alter table public.municipalities force row level security;
revoke all on public.municipalities from public,anon,authenticated,skolplattform_worker;
alter table public.synthetic_pupil_numbers enable row level security;
alter table public.synthetic_pupil_numbers force row level security;
revoke all on public.synthetic_pupil_numbers from public,anon,authenticated,skolplattform_worker;
alter table public.pupils enable row level security;
alter table public.pupils force row level security;
revoke all on public.pupils from public,anon,authenticated,skolplattform_worker;
alter table public.school_classes enable row level security;
alter table public.school_classes force row level security;
revoke all on public.school_classes from public,anon,authenticated,skolplattform_worker;
alter table public.pupil_placements enable row level security;
alter table public.pupil_placements force row level security;
revoke all on public.pupil_placements from public,anon,authenticated,skolplattform_worker;
alter table public.pupil_class_memberships enable row level security;
alter table public.pupil_class_memberships force row level security;
revoke all on public.pupil_class_memberships from public,anon,authenticated,skolplattform_worker;
alter table public.pupil_home_municipalities enable row level security;
alter table public.pupil_home_municipalities force row level security;
revoke all on public.pupil_home_municipalities from public,anon,authenticated,skolplattform_worker;
alter table public.pupil_field_state enable row level security;
alter table public.pupil_field_state force row level security;
revoke all on public.pupil_field_state from public,anon,authenticated,skolplattform_worker;
alter table public.pupil_field_history enable row level security;
alter table public.pupil_field_history force row level security;
revoke all on public.pupil_field_history from public,anon,authenticated,skolplattform_worker;
alter table public.pupil_source_values enable row level security;
alter table public.pupil_source_values force row level security;
revoke all on public.pupil_source_values from public,anon,authenticated,skolplattform_worker;
commit;
