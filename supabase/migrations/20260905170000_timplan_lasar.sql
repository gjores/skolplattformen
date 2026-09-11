-- Timplaner och läsår. Speglar web/lib/timplan-model.ts och
-- web/lib/lasar-model.ts.
--
-- Principer
--   * Samma mönster som poängplanerna: versionerade beslut som rektorn
--     föreslår och huvudmannen fastställer (Skolförordningen 9 kap. 4 §,
--     Gymnasieförordningen 4 kap. 22 §, Skolförordningen 3 kap. 3 §).
--     En fastställd rad redigeras inte, den ersätts.
--   * Radnivåskyddet drar den skarpa gränsen: rektor och huvudman arbetar i
--     öppna versioner, men bara huvudmannen får sätta status fastställd.
--   * Läsåret hör till skolenheten och prövas mot 178 skoldagar, 12 lovdagar
--     och högst fem studiedagar. Undantagen ligger som rader: bara de dagar
--     som avviker från "vardag inom terminen är skoldag" lagras.
--   * Årskurser och klasser är inte egna tabeller. Årskursen kommer ur
--     timplanens kolumner och klassen ur elevregistret, som inte ligger här
--     (SS 12000, eget beslut). Gruppens nyckel är därför text och inte en
--     främmande nyckel. Det som databasen ändå kan skydda skyddas: en
--     förkortad vecka bär årskursen och begränsas till årskurs 1 och 2.

-- ---------------------------------------------------------------------------
-- Typer
-- ---------------------------------------------------------------------------
create type public.timplan_status as enum ('utkast', 'forslag', 'atersand', 'faststalld', 'ersatt');
create type public.school_year_status as enum ('utkast', 'forslag', 'atersand', 'faststalld');
create type public.school_day_kind as enum ('lovdag', 'studiedag');
create type public.group_off_cause as enum ('nationellt prov', 'apl', 'friluftsdag', 'annat');

-- ---------------------------------------------------------------------------
-- Timplaner: fördelningen av undervisningstid per utbildning
-- ---------------------------------------------------------------------------
create table public.timplans (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  offering_id uuid not null references public.offerings (id) on delete cascade,
  version integer not null check (version >= 1),
  status public.timplan_status not null default 'utkast',
  -- Vad fördelningen bygger på, till exempel "Poängplan v1". Ändras grunden
  -- märks timplanen tills en ny version skapas.
  basis text not null default '',
  catalog_fetched date,
  decided_on date,
  decided_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offering_id, version),
  check (status <> 'faststalld' or decided_on is not null),
  check (decided_on is null or status in ('faststalld', 'ersatt'))
);
-- Högst en öppen version och högst en fastställd per utbildning.
create unique index timplans_one_open on public.timplans (offering_id)
  where status in ('utkast', 'forslag', 'atersand');
create unique index timplans_one_decided on public.timplans (offering_id) where status = 'faststalld';

-- En rad per ämne eller nivå, med timmarna i utbildningens kolumnordning
-- (årskurs 1–9 i grundskolan, år 1–3 i gymnasieskolan, per vecka på IM).
-- Underfrågor är inte tillåtna i en check-villkor; timmarnas intervall prövas
-- därför genom en immutable funktion.
create or replace function public.hours_in_range(h smallint[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(x between 0 and 2000), true) from unnest(h) x;
$$;

create table public.timplan_cells (
  timplan_id uuid not null references public.timplans (id) on delete cascade,
  row_id text not null,
  hours smallint[] not null default '{}',
  primary key (timplan_id, row_id),
  check (array_length(hours, 1) is null or (array_length(hours, 1) between 1 and 12)),
  check (public.hours_in_range(hours))
);

create table public.timplan_events (
  id uuid primary key default gen_random_uuid(),
  timplan_id uuid not null references public.timplans (id) on delete cascade,
  actor uuid references auth.users (id),
  actor_role public.app_role not null,
  action text not null,
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index timplan_events_plan_idx on public.timplan_events (timplan_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Läsår: terminer, skoldagar, lovdagar och studiedagar per skolenhet
-- ---------------------------------------------------------------------------
create table public.school_years (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id) on delete cascade,
  unit_id uuid not null references public.school_units (id) on delete cascade,
  start_year integer not null check (start_year between 2000 and 2100),
  ht_start date not null,
  ht_end date not null,
  vt_start date not null,
  vt_end date not null,
  status public.school_year_status not null default 'utkast',
  decided_on date,
  decided_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, start_year),
  -- Terminerna ligger i ordning och inom läsårets två kalenderår.
  check (ht_start < ht_end and ht_end < vt_start and vt_start < vt_end),
  check (extract(year from ht_start) = start_year and extract(year from vt_end) = start_year + 1),
  check ((status = 'faststalld') = (decided_on is not null))
);
create index school_years_unit_idx on public.school_years (unit_id, start_year);

-- Bara avvikelserna lagras. Varje annan vardag inom en termin är skoldag.
create table public.school_year_days (
  school_year_id uuid not null references public.school_years (id) on delete cascade,
  day date not null,
  kind public.school_day_kind not null,
  note text,
  primary key (school_year_id, day)
);

-- Skoldagar då en enskild årskurs eller klass saknar undervisning.
-- group_key är 'utbildningsid:kolumn' för en årskurs och 'klass:namn' för en
-- klass; se kommentaren överst om varför det inte är en främmande nyckel.
create table public.school_year_group_days (
  school_year_id uuid not null references public.school_years (id) on delete cascade,
  group_key text not null check (length(trim(group_key)) > 0),
  day date not null,
  cause public.group_off_cause not null,
  note text,
  primary key (school_year_id, group_key, day),
  -- Orsaken "annat" säger ingenting; då krävs en anteckning.
  check (cause <> 'annat' or length(trim(coalesce(note, ''))) > 0)
);
create index school_year_group_days_year_idx on public.school_year_group_days (school_year_id, group_key);

-- Fyra skoldagar i veckan för en grupp elever i årskurs 1 eller 2, om det
-- finns särskilda skäl (Skolförordningen 3 kap. 4 § andra stycket).
create table public.school_year_short_weeks (
  school_year_id uuid not null references public.school_years (id) on delete cascade,
  group_key text not null check (length(trim(group_key)) > 0),
  column_id text not null check (column_id in ('ak1', 'ak2')),
  weekday smallint not null check (weekday between 0 and 4),
  reason text not null check (length(trim(reason)) > 0),
  primary key (school_year_id, group_key)
);

create table public.school_year_events (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references public.school_years (id) on delete cascade,
  actor uuid references auth.users (id),
  actor_role public.app_role not null,
  action text not null,
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index school_year_events_year_idx on public.school_year_events (school_year_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at och skydd av fastställda beslut
-- ---------------------------------------------------------------------------
create trigger timplans_touch before update on public.timplans for each row execute function public.touch_updated_at();
create trigger school_years_touch before update on public.school_years for each row execute function public.touch_updated_at();

-- En fastställd timplan ändras inte; den ersätts av en ny version.
create or replace function public.guard_decided_timplan()
returns trigger language plpgsql as $$
begin
  if old.status = 'faststalld' and new.status = 'faststalld' and new.basis is distinct from old.basis then
    raise exception 'En fastställd timplan ändras inte. Skapa en ny version.';
  end if;
  return new;
end $$;
create trigger timplans_guard before update on public.timplans for each row execute function public.guard_decided_timplan();

-- Timmarna hör till en öppen version. En fastställd timplans celler ligger fast.
create or replace function public.guard_timplan_cells()
returns trigger language plpgsql as $$
declare
  current_status public.timplan_status;
begin
  select status into current_status from public.timplans
   where id = coalesce(new.timplan_id, old.timplan_id);
  if current_status in ('faststalld', 'ersatt') then
    raise exception 'Timmarna i en fastställd eller ersatt timplan ändras inte.';
  end if;
  return coalesce(new, old);
end $$;
create trigger timplan_cells_guard before insert or update or delete on public.timplan_cells
  for each row execute function public.guard_timplan_cells();

-- Ett fastställt läsår ändras inte; huvudmannen öppnar det först.
create or replace function public.guard_decided_school_year()
returns trigger language plpgsql as $$
begin
  if old.status = 'faststalld' and new.status = 'faststalld'
     and (new.ht_start, new.ht_end, new.vt_start, new.vt_end)
         is distinct from (old.ht_start, old.ht_end, old.vt_start, old.vt_end) then
    raise exception 'Ett fastställt läsår ändras inte. Öppna det för ändring först.';
  end if;
  return new;
end $$;
create trigger school_years_guard before update on public.school_years for each row execute function public.guard_decided_school_year();

-- Dagarna hör till ett läsår som inte är fastställt.
create or replace function public.guard_school_year_days()
returns trigger language plpgsql as $$
declare
  current_status public.school_year_status;
  year_id uuid;
begin
  year_id := coalesce(new.school_year_id, old.school_year_id);
  select status into current_status from public.school_years where id = year_id;
  if current_status = 'faststalld' then
    raise exception 'Dagarna i ett fastställt läsår ändras inte. Öppna läsåret för ändring först.';
  end if;
  return coalesce(new, old);
end $$;
create trigger school_year_days_guard before insert or update or delete on public.school_year_days
  for each row execute function public.guard_school_year_days();
create trigger school_year_group_days_guard before insert or update or delete on public.school_year_group_days
  for each row execute function public.guard_school_year_days();
create trigger school_year_short_weeks_guard before insert or update or delete on public.school_year_short_weeks
  for each row execute function public.guard_school_year_days();

-- ---------------------------------------------------------------------------
-- Radnivåskydd
-- ---------------------------------------------------------------------------
alter table public.timplans enable row level security;
alter table public.timplan_cells enable row level security;
alter table public.timplan_events enable row level security;
alter table public.school_years enable row level security;
alter table public.school_year_days enable row level security;
alter table public.school_year_group_days enable row level security;
alter table public.school_year_short_weeks enable row level security;
alter table public.school_year_events enable row level security;

-- Timplaner: rektor och huvudman arbetar i öppna versioner, huvudmannen fastställer.
create policy timplans_read on public.timplans for select using (organizer_id = public.current_organizer_id());
create policy timplans_insert on public.timplans for insert
  with check (organizer_id = public.current_organizer_id() and public.current_app_role() in ('huvudman', 'rektor') and status = 'utkast');
create policy timplans_update_open on public.timplans for update
  using (organizer_id = public.current_organizer_id() and public.current_app_role() in ('huvudman', 'rektor') and status in ('utkast', 'forslag', 'atersand'))
  with check (organizer_id = public.current_organizer_id() and (status in ('utkast', 'forslag', 'atersand') or public.current_app_role() = 'huvudman'));
create policy timplans_update_decided on public.timplans for update
  using (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman')
  with check (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman');
create policy timplans_delete on public.timplans for delete
  using (organizer_id = public.current_organizer_id() and public.current_app_role() in ('huvudman', 'rektor') and status = 'utkast');

create policy timplan_cells_read on public.timplan_cells for select
  using (exists (select 1 from public.timplans t where t.id = timplan_id and t.organizer_id = public.current_organizer_id()));
create policy timplan_cells_write on public.timplan_cells for all
  using (public.current_app_role() in ('huvudman', 'rektor') and exists (select 1 from public.timplans t where t.id = timplan_id and t.organizer_id = public.current_organizer_id()))
  with check (public.current_app_role() in ('huvudman', 'rektor') and exists (select 1 from public.timplans t where t.id = timplan_id and t.organizer_id = public.current_organizer_id()));

create policy timplan_events_read on public.timplan_events for select
  using (exists (select 1 from public.timplans t where t.id = timplan_id and t.organizer_id = public.current_organizer_id()));
create policy timplan_events_insert on public.timplan_events for insert
  with check (actor = auth.uid() and exists (select 1 from public.timplans t where t.id = timplan_id and t.organizer_id = public.current_organizer_id()));

-- Läsår: samma gräns. Rektorn föreslår dagarna, huvudmannen beslutar terminerna.
create policy school_years_read on public.school_years for select using (organizer_id = public.current_organizer_id());
create policy school_years_insert on public.school_years for insert
  with check (organizer_id = public.current_organizer_id() and public.current_app_role() in ('huvudman', 'rektor') and status = 'utkast');
create policy school_years_update_open on public.school_years for update
  using (organizer_id = public.current_organizer_id() and public.current_app_role() in ('huvudman', 'rektor') and status in ('utkast', 'forslag', 'atersand'))
  with check (organizer_id = public.current_organizer_id() and (status in ('utkast', 'forslag', 'atersand') or public.current_app_role() = 'huvudman'));
create policy school_years_update_decided on public.school_years for update
  using (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman')
  with check (organizer_id = public.current_organizer_id() and public.current_app_role() = 'huvudman');
create policy school_years_delete on public.school_years for delete
  using (organizer_id = public.current_organizer_id() and public.current_app_role() in ('huvudman', 'rektor') and status = 'utkast');

create policy school_year_days_read on public.school_year_days for select
  using (exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()));
create policy school_year_days_write on public.school_year_days for all
  using (public.current_app_role() in ('huvudman', 'rektor') and exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()))
  with check (public.current_app_role() in ('huvudman', 'rektor') and exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()));

create policy school_year_group_days_read on public.school_year_group_days for select
  using (exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()));
create policy school_year_group_days_write on public.school_year_group_days for all
  using (public.current_app_role() in ('huvudman', 'rektor') and exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()))
  with check (public.current_app_role() in ('huvudman', 'rektor') and exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()));

create policy school_year_short_weeks_read on public.school_year_short_weeks for select
  using (exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()));
create policy school_year_short_weeks_write on public.school_year_short_weeks for all
  using (public.current_app_role() in ('huvudman', 'rektor') and exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()))
  with check (public.current_app_role() in ('huvudman', 'rektor') and exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()));

create policy school_year_events_read on public.school_year_events for select
  using (exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()));
create policy school_year_events_insert on public.school_year_events for insert
  with check (actor = auth.uid() and exists (select 1 from public.school_years y where y.id = school_year_id and y.organizer_id = public.current_organizer_id()));
