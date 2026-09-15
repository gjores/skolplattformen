-- Fas 2: kundavgränsade uppdrag, inbjudningar och serverstyrd säkerhetslogg.
-- Migrationen uppgraderar befintliga rader utan att radera verksamhetsdata.

create type public.access_function as enum (
  'kundadmin', 'granskare', 'huvudman', 'rektor', 'administrator', 'larare'
);

create table public.access_assignments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id),
  customer_id uuid not null references public.customers (id),
  organizer_id uuid references public.organizers (id),
  unit_id uuid references public.school_units (id),
  function public.access_function not null,
  valid_from date not null default public.app_today(),
  valid_to date check (valid_to is null or valid_to >= valid_from),
  staff_assignment_id uuid references public.assignments (id),
  created_by uuid references public.memberships (id),
  created_at timestamptz not null default now(),
  ended_by uuid references public.memberships (id),
  ended_at timestamptz,
  check ((function in ('kundadmin', 'granskare')) = (organizer_id is null and unit_id is null)),
  check (function <> 'rektor' or unit_id is not null),
  check (unit_id is null or organizer_id is not null),
  check (staff_assignment_id is null or organizer_id is not null)
);

create index access_assignments_membership_idx
  on public.access_assignments (membership_id);

create or replace function public.assignment_is_valid(a public.access_assignments)
returns boolean
language sql
stable
security invoker
as $$
  select a.ended_at is null
    and a.valid_from <= public.app_today()
    and (a.valid_to is null or a.valid_to >= public.app_today())
$$;

create or replace function public.current_assignment_id()
returns uuid
language sql
stable
security invoker
as $$
  select nullif(current_setting('app.assignment_id', true), '')::uuid
$$;

-- Supabase äger auth-schemat med en separat roll som migrationsrollen inte
-- kan delegera. Workern läser därför samma verifierade sub-claim direkt ur
-- den transaktionslokala serverkontexten.
create or replace function public.current_actor_auth_user_id()
returns uuid
language sql
stable
security invoker
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
$$;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  token_hash bytea not null unique check (length(token_hash) = 32),
  invited_person_name text not null check (length(btrim(invited_person_name)) between 1 and 200),
  expected_issuer text not null check (expected_issuer ~ '^https?://'),
  expected_subject text not null check (length(expected_subject) between 1 and 255),
  expected_email text,
  grants jsonb not null check (jsonb_typeof(grants) = 'array'),
  issued_by text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_identity_id uuid references public.identities (id),
  created_at timestamptz not null default now()
);

create type public.event_outcome as enum ('ok', 'denied', 'error');

create table public.security_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  correlation_id uuid not null,
  source text not null check (source in ('worker', 'cli', 'db')),
  actor_identity_id uuid references public.identities (id),
  actor_issuer text,
  actor_subject text,
  session_id uuid,
  membership_id uuid,
  assignment_id uuid,
  customer_id uuid,
  action text not null check (length(action) between 1 and 80),
  object_type text,
  object_id uuid,
  outcome public.event_outcome not null,
  details jsonb not null default '{}'::jsonb,
  ip_hash bytea
);

create index security_events_customer_idx
  on public.security_events (customer_id, occurred_at desc);

create or replace function public.security_events_immutable()
returns trigger
language plpgsql
security invoker
as $$
begin
  raise exception 'security_events är oföränderlig' using errcode = '42501';
end
$$;

create trigger security_events_no_update_delete
before update or delete on public.security_events
for each row execute function public.security_events_immutable();

create table public.denial_buckets (
  bucket_start timestamptz not null,
  key text not null,
  count integer not null default 0,
  primary key (bucket_start, key)
);

alter table public.access_assignments enable row level security;
alter table public.invitations enable row level security;
alter table public.security_events enable row level security;
alter table public.security_events force row level security;
alter table public.denial_buckets enable row level security;

create policy access_assignments_read on public.access_assignments
for select to skolplattform_worker
using (
  customer_id = public.current_customer_id()
  or exists (
    select 1 from public.memberships m
    where m.id = access_assignments.membership_id
      and m.identity_id = public.current_identity_id()
  )
);

create policy access_assignments_write on public.access_assignments
for insert to skolplattform_worker
with check (customer_id = public.current_customer_id() or public.current_phase() = 'login');

create policy access_assignments_update on public.access_assignments
for update to skolplattform_worker
using (customer_id = public.current_customer_id())
with check (customer_id = public.current_customer_id());

create policy invitations_customer on public.invitations
for all to skolplattform_worker
using (customer_id = public.current_customer_id() or public.current_phase() = 'login')
with check (customer_id = public.current_customer_id() or public.current_phase() = 'login');

create policy security_events_insert on public.security_events
for insert to skolplattform_worker with check (true);

create policy security_events_read_granskare on public.security_events
for select to skolplattform_worker
using (
  customer_id = public.current_customer_id()
  and current_setting('app.access_function', true) = 'granskare'
);

create policy security_events_owner_read on public.security_events
for select to postgres using (true);

create policy denial_buckets_worker on public.denial_buckets
for all to skolplattform_worker using (true) with check (true);

revoke all on public.access_assignments, public.invitations,
  public.security_events, public.denial_buckets
from public, anon, authenticated;

grant select, insert, update on public.access_assignments, public.invitations
to skolplattform_worker;
grant select, insert on public.security_events to skolplattform_worker;
grant usage on sequence public.security_events_id_seq to skolplattform_worker;
grant select, insert, update on public.denial_buckets to skolplattform_worker;
grant execute on function public.security_events_immutable() to skolplattform_worker;

-- Varje befintlig huvudman får en egen kund. Namn används bara som visning,
-- aldrig som matchningsnyckel, så namnlika huvudmän hålls isär.
alter table public.organizers
  add column customer_id uuid references public.customers (id);

insert into public.customers (id, name, closed_at)
values ('20000000-0000-4000-8000-0000000000de', 'Demo — stängd', now())
on conflict (id) do update
  set name = excluded.name,
      closed_at = coalesce(public.customers.closed_at, excluded.closed_at);

update public.organizers
set customer_id = '20000000-0000-4000-8000-0000000000de'
where id = '00000000-0000-4000-8000-000000000001'
  and customer_id is null;

do $$
declare
  organizer_row record;
  generated_customer_id uuid;
begin
  for organizer_row in
    select id, name from public.organizers where customer_id is null order by id
  loop
    insert into public.customers (name)
    values ('Migrerad kund: ' || organizer_row.name)
    returning id into generated_customer_id;

    update public.organizers
    set customer_id = generated_customer_id
    where id = organizer_row.id;
  end loop;
end
$$;

alter table public.organizers alter column customer_id set not null;
create index organizers_customer_idx on public.organizers (customer_id);

-- Sammansatta nycklar gör kund-, huvudman- och skolenhetstillhörighet till
-- databasintegritet i stället för en kontroll som bara finns i gränssnittet.
alter table public.memberships
  add constraint memberships_id_customer_unique unique (id, customer_id),
  add constraint memberships_id_identity_unique unique (id, identity_id);

alter table public.organizers
  add constraint organizers_id_customer_unique unique (id, customer_id);

alter table public.school_units
  add constraint school_units_id_organizer_unique unique (id, organizer_id);

alter table public.assignments
  add constraint assignments_id_organizer_unique unique (id, organizer_id);

alter table public.access_assignments
  add constraint access_assignments_membership_customer_fk
    foreign key (membership_id, customer_id)
    references public.memberships (id, customer_id),
  add constraint access_assignments_organizer_customer_fk
    foreign key (organizer_id, customer_id)
    references public.organizers (id, customer_id),
  add constraint access_assignments_unit_organizer_fk
    foreign key (unit_id, organizer_id)
    references public.school_units (id, organizer_id),
  add constraint access_assignments_staff_organizer_fk
    foreign key (staff_assignment_id, organizer_id)
    references public.assignments (id, organizer_id),
  add constraint access_assignments_id_membership_unique unique (id, membership_id);

alter table public.app_sessions
  add constraint app_sessions_membership_identity_fk
    foreign key (membership_id, identity_id)
    references public.memberships (id, identity_id),
  add constraint app_sessions_assignment_fk
    foreign key (assignment_id)
    references public.access_assignments (id),
  add constraint app_sessions_assignment_membership_fk
    foreign key (assignment_id, membership_id)
    references public.access_assignments (id, membership_id);

-- Proveniens kopplas bara när unit_code pekar entydigt på en huvudman.
alter table public.registry_snapshots
  add column organizer_id uuid references public.organizers (id);

with unambiguous_origin as (
  select code as unit_code, min(organizer_id::text)::uuid as organizer_id
  from public.school_units
  group by code
  having count(distinct organizer_id) = 1
)
update public.registry_snapshots snapshot
set organizer_id = origin.organizer_id
from unambiguous_origin origin
where snapshot.unit_code = origin.unit_code
  and snapshot.organizer_id is null;

drop policy if exists registry_snapshots_read on public.registry_snapshots;
drop policy if exists registry_snapshots_insert on public.registry_snapshots;

create policy registry_snapshots_org_read on public.registry_snapshots
for select to skolplattform_worker
using (organizer_id = public.current_organizer_id());

create policy registry_snapshots_org_insert on public.registry_snapshots
for insert to skolplattform_worker
with check (organizer_id = public.current_organizer_id());

create or replace function public.current_organizer_id()
returns uuid
language sql
stable
security invoker
as $$
  select nullif(current_setting('app.organizer_id', true), '')::uuid
$$;
alter function public.current_organizer_id() reset all;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security invoker
as $$
  select nullif(current_setting('app.app_role', true), '')::public.app_role
$$;
alter function public.current_app_role() reset all;

grant execute on function public.current_organizer_id(), public.current_app_role(),
  public.current_assignment_id(), public.assignment_is_valid(public.access_assignments)
to skolplattform_worker;

create or replace function public.set_event_actor()
returns trigger
language plpgsql
security invoker
as $$
begin
  if public.current_actor_auth_user_id() is null or public.current_app_role() is null then
    raise exception 'Händelse utan serverkontext (aktör/roll saknas)' using errcode = '42501';
  end if;
  new.actor := public.current_actor_auth_user_id();
  new.actor_role := public.current_app_role();
  return new;
end
$$;

create trigger organisation_events_actor
before insert on public.organisation_events
for each row execute function public.set_event_actor();
create trigger point_plan_events_actor
before insert on public.point_plan_events
for each row execute function public.set_event_actor();
create trigger timplan_events_actor
before insert on public.timplan_events
for each row execute function public.set_event_actor();
create trigger school_year_events_actor
before insert on public.school_year_events
for each row execute function public.set_event_actor();

grant execute on function public.set_event_actor() to skolplattform_worker;
grant execute on function public.current_actor_auth_user_id() to skolplattform_worker;

grant select on public.organizers, public.school_units, public.school_unit_types,
  public.assignments, public.assignment_units, public.registry_snapshots,
  public.organisation_events, public.offerings, public.permits,
  public.point_plans, public.point_plan_events, public.timplans,
  public.timplan_events, public.school_years, public.school_year_events,
  public.profiles
to skolplattform_worker;

grant insert, update on public.organizers, public.school_units,
  public.school_unit_types, public.assignments, public.assignment_units,
  public.registry_snapshots, public.organisation_events
to skolplattform_worker;
grant insert on public.point_plan_events, public.timplan_events,
  public.school_year_events to skolplattform_worker;
grant delete on public.assignment_units to skolplattform_worker;

create policy organizers_customer_read on public.organizers
for select to skolplattform_worker
using (customer_id = public.current_customer_id());
create policy organizers_customer_insert on public.organizers
for insert to skolplattform_worker
with check (customer_id = public.current_customer_id());
create policy organizers_customer_update on public.organizers
for update to skolplattform_worker
using (customer_id = public.current_customer_id())
with check (customer_id = public.current_customer_id());

-- Fas 1-policyerna använde auth.uid(). Klientrollerna är fortfarande helt
-- karantänsatta; Workern får egna policyer som använder serverns sub-claim.
drop policy if exists organisation_events_insert on public.organisation_events;
create policy organisation_events_insert_worker on public.organisation_events
for insert to skolplattform_worker
with check (
  organizer_id = public.current_organizer_id()
  and actor = public.current_actor_auth_user_id()
);

drop policy if exists point_plan_events_insert on public.point_plan_events;
create policy point_plan_events_insert_worker on public.point_plan_events
for insert to skolplattform_worker
with check (
  actor = public.current_actor_auth_user_id()
  and exists (
    select 1 from public.point_plans p
    where p.id = point_plan_id
      and p.organizer_id = public.current_organizer_id()
  )
);

drop policy if exists timplan_events_insert on public.timplan_events;
create policy timplan_events_insert_worker on public.timplan_events
for insert to skolplattform_worker
with check (
  actor = public.current_actor_auth_user_id()
  and exists (
    select 1 from public.timplans p
    where p.id = timplan_id
      and p.organizer_id = public.current_organizer_id()
  )
);

drop policy if exists school_year_events_insert on public.school_year_events;
create policy school_year_events_insert_worker on public.school_year_events
for insert to skolplattform_worker
with check (
  actor = public.current_actor_auth_user_id()
  and exists (
    select 1 from public.school_years y
    where y.id = school_year_id
      and y.organizer_id = public.current_organizer_id()
  )
);

create or replace function public.appoint_school_principal(
  school_id uuid,
  principal_id uuid default null,
  principal_name text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  org_id uuid;
  chosen uuid;
  removed_count integer;
begin
  if public.current_app_role() is distinct from 'huvudman' then
    raise exception 'Bara huvudmannen utser rektor.';
  end if;
  select organizer_id into org_id
  from public.school_units
  where id = school_id and organizer_id = public.current_organizer_id()
  for update;
  if not found then raise exception 'Skolenheten finns inte.'; end if;
  if principal_id is not null then
    select id into chosen from public.assignments
    where id = principal_id and organizer_id = org_id and role = 'rektor';
    if not found then raise exception 'Välj en rektor hos huvudmannen.'; end if;
  elsif nullif(btrim(principal_name), '') is not null then
    if length(btrim(principal_name)) > 120 then
      raise exception 'Rektorns namn är för långt.';
    end if;
    insert into public.assignments (organizer_id, name, role)
    values (org_id, btrim(principal_name), 'rektor') returning id into chosen;
  else
    raise exception 'Välj rektor eller ange ett namn.';
  end if;
  with removed as (delete from public.assignment_units au using public.assignments a where au.assignment_id = a.id and a.role = 'rektor' and au.unit_id = school_id returning 1)
  select count(*) into removed_count from removed;
  insert into public.assignment_units (assignment_id, unit_id) values (chosen, school_id);
  insert into public.organisation_events (
    organizer_id, actor, actor_role, action, comment
  ) values (
    org_id, public.current_actor_auth_user_id(), 'huvudman', 'Rektor utsedd',
    (select name from public.assignments where id = chosen) || ' vid ' ||
      (select name from public.school_units where id = school_id)
  );
  return chosen;
end
$$;

create or replace function public.import_school_unit(
  unit_data jsonb,
  registry_payload jsonb,
  principal_id uuid default null,
  principal_name text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id uuid;
  org_id uuid;
  item jsonb;
begin
  if public.current_app_role() is distinct from 'huvudman' then
    raise exception 'Bara huvudmannen lägger till skolenheter.';
  end if;
  org_id := public.current_organizer_id();
  insert into public.school_units (
    organizer_id, code, name, municipality_code, municipality_name, status,
    head_master, locality, address, source_name, source_url, source_fetched,
    source_modified, pupil_register_source
  ) values (
    org_id, unit_data->>'code', unit_data->>'name',
    unit_data->'municipality'->>'code', unit_data->'municipality'->>'name',
    unit_data->>'status', unit_data->>'headMaster', unit_data->>'locality',
    unit_data->'address', unit_data->'source'->>'name',
    unit_data->'source'->>'url', nullif(unit_data->'source'->>'fetched', '')::date,
    nullif(unit_data->'source'->>'modified', '')::timestamptz,
    unit_data->'pupilRegister'->>'source'
  ) returning id into new_id;
  for item in select value from jsonb_array_elements(unit_data->'schoolTypes') loop
    insert into public.school_unit_types (unit_id, school_type, grades, programmes)
    values (
      new_id,
      item->>'code',
      case when item ? 'grades'
        then array(select jsonb_array_elements_text(item->'grades')::smallint)
        else null end,
      array(select jsonb_array_elements_text(coalesce(item->'programmes', '[]'::jsonb)))
    );
  end loop;
  if principal_id is not null or nullif(btrim(principal_name), '') is not null then
    perform public.appoint_school_principal(new_id, principal_id, principal_name);
  end if;
  insert into public.registry_snapshots (
    unit_code, fetched_by, source_url, payload, organizer_id
  ) values (
    unit_data->>'code', public.current_actor_auth_user_id(), unit_data->'source'->>'url',
    registry_payload, org_id
  );
  insert into public.organisation_events (
    organizer_id, actor, actor_role, action, comment
  ) values (
    org_id, public.current_actor_auth_user_id(), 'huvudman', 'Skolenhet tillagd', unit_data->>'name'
  );
  return new_id;
end
$$;

revoke all on function public.import_school_unit(jsonb, jsonb, uuid, text)
from public, anon, authenticated;
grant execute on function public.import_school_unit(jsonb, jsonb, uuid, text)
to skolplattform_worker;
grant execute on function public.appoint_school_principal(uuid, uuid, text)
to skolplattform_worker;

drop function public.bootstrap_demo_profile(text);

comment on schema public is
  'fas2-kontext: klientroller fortsatt utan rättigheter; skolplattform_worker med RLS på serverns GUC:er (D-10, D-11)';
