-- Fas 2: serverns minsta kund-, identitets-, medlemskaps- och sessionsgrund.
-- Rollen är ett klusterobjekt och kan därför finnas kvar efter en lokal db reset.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'skolplattform_worker') then
    create role skolplattform_worker login nobypassrls noinherit;
  end if;
end
$$;

grant skolplattform_worker to postgres;
grant usage on schema public to skolplattform_worker;
grant usage on schema extensions to skolplattform_worker;
comment on role skolplattform_worker is 'Fas 2: Workerns databasroll (D-10). Lösenord sätts per lokalt mål av prepare-local, aldrig i migration.';

create or replace function public.app_today()
returns date
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.fake_today', true), '')::date,
    (now() at time zone 'Europe/Stockholm')::date
  )
$$;

create or replace function public.current_identity_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.identity_id', true), '')::uuid
$$;

create or replace function public.current_customer_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.customer_id', true), '')::uuid
$$;

create or replace function public.current_membership_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.membership_id', true), '')::uuid
$$;

create or replace function public.current_phase()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.phase', true), '')
$$;

grant execute on function public.app_today(), public.current_identity_id(),
  public.current_customer_id(), public.current_membership_id(), public.current_phase()
to skolplattform_worker;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.identities (
  id uuid primary key default gen_random_uuid(),
  issuer text not null check (issuer ~ '^https?://'),
  subject text not null check (length(subject) between 1 and 255),
  auth_user_id uuid references auth.users (id) on delete set null,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  unique (issuer, subject)
);

create index identities_auth_user_idx on public.identities (auth_user_id);

create type public.membership_status as enum ('active', 'blocked');

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.identities (id),
  customer_id uuid not null references public.customers (id),
  status public.membership_status not null default 'active',
  blocked_at timestamptz,
  blocked_by uuid references public.memberships (id),
  block_reason text,
  created_at timestamptz not null default now(),
  unique (identity_id, customer_id),
  check ((status = 'blocked') = (blocked_at is not null))
);

create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique check (length(token_hash) = 32),
  identity_id uuid not null references public.identities (id),
  membership_id uuid references public.memberships (id),
  assignment_id uuid,
  context_epoch integer not null default 1,
  acr text,
  amr text[] not null default '{}',
  auth_time timestamptz,
  proof_issuer text,
  proof_client_id text,
  proof_audience text[] not null default '{}',
  proof_profile_id text,
  proof_profile_version integer,
  proof_checked_at timestamptz,
  id_token_hint text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  check (absolute_expires_at >= expires_at or revoked_at is not null)
);

create index app_sessions_identity_idx on public.app_sessions (identity_id);
create index app_sessions_expires_idx on public.app_sessions (expires_at);

grant select, insert, update on public.customers, public.identities,
  public.memberships, public.app_sessions
to skolplattform_worker;

revoke all on public.customers, public.identities, public.memberships,
  public.app_sessions
from public, anon, authenticated;

alter table public.customers enable row level security;
alter table public.identities enable row level security;
alter table public.memberships enable row level security;
alter table public.app_sessions enable row level security;

-- FORCE RLS används inte här. Postgres är tabellägare och behöver kunna lägga
-- de syntetiska fixturerna. Workern omfattas alltid av policyerna nedan.

-- Inloggningsfasen sätts endast av serverns callback. Varje fråga i callbacken
-- måste dessutom filtrera på den verifierade externa identiteten eller tokenhashen.
create policy identities_login on public.identities
for all to skolplattform_worker
using (public.current_phase() = 'login' or id = public.current_identity_id())
with check (public.current_phase() = 'login' or id = public.current_identity_id());

-- Kundadministratör och granskare får läsa identiteter som har medlemskap i
-- vald kund. app.access_function kommer från serverns verifierade uppdragskontext.
create policy identities_customer_read on public.identities
for select to skolplattform_worker
using (
  current_setting('app.access_function', true) in ('kundadmin', 'granskare')
  and exists (
    select 1
    from public.memberships m
    where m.identity_id = identities.id
      and m.customer_id = public.current_customer_id()
  )
);

create policy app_sessions_own on public.app_sessions
for all to skolplattform_worker
using (public.current_phase() = 'login' or identity_id = public.current_identity_id())
with check (public.current_phase() = 'login' or identity_id = public.current_identity_id());

-- En kundadministratör kan läsa och återkalla sessioner för medlemskap i vald
-- kund. Sessioner i andra kunder blir fortsatt osynliga och opåverkbara.
create policy app_sessions_customer_read on public.app_sessions
for select to skolplattform_worker
using (
  current_setting('app.access_function', true) = 'kundadmin'
  and exists (
    select 1
    from public.memberships m
    where m.id = app_sessions.membership_id
      and m.customer_id = public.current_customer_id()
  )
);

create policy app_sessions_customer_update on public.app_sessions
for update to skolplattform_worker
using (
  current_setting('app.access_function', true) = 'kundadmin'
  and exists (
    select 1
    from public.memberships m
    where m.id = app_sessions.membership_id
      and m.customer_id = public.current_customer_id()
  )
)
with check (
  current_setting('app.access_function', true) = 'kundadmin'
  and exists (
    select 1
    from public.memberships m
    where m.id = app_sessions.membership_id
      and m.customer_id = public.current_customer_id()
  )
);

create policy memberships_read on public.memberships
for select to skolplattform_worker
using (
  identity_id = public.current_identity_id()
  or customer_id = public.current_customer_id()
);

create policy memberships_insert on public.memberships
for insert to skolplattform_worker
with check (
  identity_id = public.current_identity_id()
  or customer_id = public.current_customer_id()
);

create policy memberships_update on public.memberships
for update to skolplattform_worker
using (customer_id = public.current_customer_id())
with check (customer_id = public.current_customer_id());

create policy customers_read on public.customers
for select to skolplattform_worker
using (
  id = public.current_customer_id()
  or exists (
    select 1
    from public.memberships m
    where m.customer_id = customers.id
      and m.identity_id = public.current_identity_id()
  )
);

create policy customers_insert on public.customers
for insert to skolplattform_worker
with check (public.current_phase() = 'login');

create policy customers_update on public.customers
for update to skolplattform_worker
using (id = public.current_customer_id())
with check (id = public.current_customer_id());

comment on table public.app_sessions is 'fas2-kärna: serverlagrad appsession (D-10, D-11); token_hash = sha256(cookievärde)';
