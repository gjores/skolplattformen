-- 05.1.1-10 (D-01, D-02, D-05, D-06, D-08, D-13, D-14, D-15; LASAR-01, LASAR-02, LASAR-05): huvudmannens ram och arbetssättet
-- per läsår. Huvudmannen väljer arbetssätt för alla sina skolenheter: eget förslag per skola (ingen rad = dagens beteende) eller
-- huvudmannens ram. Ramen har egna versioner: ett utkast som bara huvudmannen ser och utgivna versioner som aldrig ändras.
-- Skolans kalenderversion pekar på den utgivna ramversion den utgår från (school_years.frame_id) och på den senaste ramversion
-- skolan har tagit ställning till (frame_ack_id). En ny utgivning eller ett byte av arbetssätt skriver aldrig i skolornas
-- kalendrar; skolan tar in valda ändringar uttryckligen eller behåller sin kalender (take_frame_changes, keep_school_calendar).
--
-- Användarbeslut 2026-11-10, alternativ a (”Kör 1a 2ja 3a 4a”): planens tabellform, och läsåret har börjat när
-- public.app_today() >= make_date(start_year, 8, 1). Då kan arbetssättet inte bytas (lasar_mode_locked).
--
-- Bygger på 20261111100000_lasar_versions.sql och 20261111190000_lasar_worker_access.sql (installerade på det skyddade lokala
-- målet och låsta), 20261112100000_lasar_groups.sql och 20261112110000_lasar_change_requests.sql. Funktionerna ändras här med
-- create or replace. Ingen ny Worker-ingång: ramen och arbetssättet går genom lasar_read, lasar_command och lasar_status, vars
-- rättigheter består. Inga rättigheter ges i denna fil; alla nya tabeller och funktioner är stängda för Worker och klientroller.
-- Tjänstefördelning, timplaner och programplaner läser aldrig ramen; de läser skolans gällande fastställda version.
--
-- SS 12000 (SIS OpenAPI 2.1.0, som anger SS12000:2020): ramen och arbetssättet saknar objekt i standarden och exporteras inte.
-- Ramen nycklas på huvudmannens ID (organizers.id, Organisation med organisationType=Huvudman) och läsåret, aldrig på namn.
-- Skolenheten (Organisation, organisationType=Skolenhet) anges med unit_id. Ingen standardefterlevnad påstås.

-- ---------------------------------------------------------------------------
-- 1. Arbetssätt och ramversioner
-- ---------------------------------------------------------------------------
-- Arbetssättet per huvudman och läsår. Ingen rad betyder eget förslag per skola.
create table public.school_year_frame_settings (
  organizer_id uuid not null references public.organizers (id),
  start_year integer not null check (start_year between 2000 and 2100),
  mode text not null check (mode in ('ram', 'eget')),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default clock_timestamp(),
  updated_by_assignment uuid not null references public.access_assignments (id),
  primary key (organizer_id, start_year)
);

-- Ramens versioner: en öppen (utkast) och utgivna versioner per huvudman och läsår. Den senaste utgivna är skolornas ram.
create table public.school_year_frames (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers (id),
  start_year integer not null check (start_year between 2000 and 2100),
  version integer not null check (version between 1 and 10000),
  status text not null default 'utkast' check (status in ('utkast', 'utgiven')),
  revision integer not null default 1 check (revision >= 1),
  ht_start date not null,
  ht_end date not null,
  vt_start date not null,
  vt_end date not null,
  previous_id uuid references public.school_year_frames (id),
  published_at timestamptz,
  published_on date,
  published_by_assignment uuid references public.access_assignments (id),
  message text check (message is null or char_length(message) between 1 and 4000),
  content_hash text check (content_hash is null or content_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  created_by_assignment uuid not null references public.access_assignments (id),
  constraint school_year_frames_version_key unique (organizer_id, start_year, version),
  constraint school_year_frames_scope_key unique (id, organizer_id, start_year),
  constraint school_year_frames_terms check (ht_start < ht_end and ht_end < vt_start and vt_start < vt_end
    and extract(year from ht_start) = start_year and extract(year from vt_end) = start_year + 1),
  constraint school_year_frames_published check ((status = 'utgiven') = (published_at is not null)
    and (published_at is null) = (published_on is null) and (published_at is null) = (published_by_assignment is null)
    and (published_at is null) = (content_hash is null) and (message is null or status = 'utgiven')),
  constraint school_year_frames_not_self check (previous_id is distinct from id)
);
create unique index school_year_frames_one_open on public.school_year_frames (organizer_id, start_year) where status = 'utkast';

-- Ramens gemensamma lov- och studiedagar. Ramen har inga gruppdagar och inga korta veckor.
create table public.school_year_frame_days (
  frame_id uuid not null references public.school_year_frames (id),
  day date not null,
  kind public.school_day_kind not null,
  note text check (note is null or char_length(note) between 1 and 200),
  primary key (frame_id, day)
);

-- Ramens historik med verifierad aktör ur den låsta sessionen (A-16). Bara huvudmannen skriver.
create table public.school_year_frame_events (
  id uuid primary key default gen_random_uuid(),
  frame_id uuid not null references public.school_year_frames (id),
  action text not null check (action in ('create', 'create_frame', 'reset_to_proposal', 'publish')),
  comment text not null check (char_length(comment) <= 4000),
  actor_identity_id uuid not null references public.identities (id),
  session_id uuid not null references public.app_sessions (id),
  membership_id uuid not null references public.memberships (id),
  assignment_id uuid not null references public.access_assignments (id),
  created_at timestamptz not null default clock_timestamp()
);
create index school_year_frame_events_frame_idx on public.school_year_frame_events (frame_id, created_at desc);

alter table public.school_year_frame_settings enable row level security;
alter table public.school_year_frame_settings force row level security;
alter table public.school_year_frames enable row level security;
alter table public.school_year_frames force row level security;
alter table public.school_year_frame_days enable row level security;
alter table public.school_year_frame_days force row level security;
alter table public.school_year_frame_events enable row level security;
alter table public.school_year_frame_events force row level security;
revoke all on public.school_year_frame_settings, public.school_year_frames, public.school_year_frame_days, public.school_year_frame_events
  from public, anon, authenticated, service_role, skolplattform_worker;

-- En utgiven ramversion ändras aldrig (D-13), och ingen ramversion tas bort. Huvudman, läsår, version och ursprung står fast.
create function public.lasar_frame_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'En ramversion tas inte bort.';
  end if;
  if old.status = 'utgiven' then
    raise exception 'En utgiven ramversion ändras inte. Skapa en ny version av ramen.';
  end if;
  if (new.id, new.organizer_id, new.start_year, new.version, new.previous_id, new.created_at, new.created_by_assignment)
     is distinct from (old.id, old.organizer_id, old.start_year, old.version, old.previous_id, old.created_at, old.created_by_assignment) then
    raise exception 'Ramversionens huvudman, läsår och version ändras inte.';
  end if;
  return new;
end $$;
create trigger school_year_frames_guard before update or delete on public.school_year_frames
  for each row execute function public.lasar_frame_guard();
create trigger school_year_frames_no_truncate before truncate on public.school_year_frames
  for each statement execute function public.lasar_frame_guard();

-- Dagarna i en utgiven ramversion ändras inte.
create function public.lasar_frame_days_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare v_ids uuid[];
begin
  if tg_op = 'TRUNCATE' then raise exception 'Ramens dagar töms inte.'; end if;
  v_ids := array[case when tg_op <> 'INSERT' then old.frame_id end, case when tg_op <> 'DELETE' then new.frame_id end];
  if exists (select 1 from public.school_year_frames f where f.id = any (v_ids) and f.status = 'utgiven') then
    raise exception 'Dagarna i en utgiven ramversion ändras inte.';
  end if;
  return coalesce(new, old);
end $$;
create trigger school_year_frame_days_guard before insert or update or delete on public.school_year_frame_days
  for each row execute function public.lasar_frame_days_guard();
create trigger school_year_frame_days_no_truncate before truncate on public.school_year_frame_days
  for each statement execute function public.lasar_frame_days_guard();

-- Ramens historik ändras och tas inte bort.
create function public.lasar_frame_events_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'Ramens historik ändras inte.';
end $$;
create trigger school_year_frame_events_guard before update or delete on public.school_year_frame_events
  for each row execute function public.lasar_frame_events_guard();
create trigger school_year_frame_events_no_truncate before truncate on public.school_year_frame_events
  for each statement execute function public.lasar_frame_events_guard();

-- ---------------------------------------------------------------------------
-- 2. Skolans koppling till ramen
-- ---------------------------------------------------------------------------
-- frame_id: den utgivna ramversion skolans kalender utgår från (basen i jämförelsen, D-05). frame_ack_id: den senaste utgivna
-- ramversion skolan har tagit in eller kvitterat. Båda pekar på en ramversion hos samma huvudman och läsår.
alter table public.school_years
  add column frame_id uuid,
  add column frame_ack_id uuid,
  add constraint school_years_frame_fk foreign key (frame_id, organizer_id, start_year) references public.school_year_frames (id, organizer_id, start_year),
  add constraint school_years_frame_ack_fk foreign key (frame_ack_id, organizer_id, start_year) references public.school_year_frames (id, organizer_id, start_year),
  add constraint school_years_frame_pair check (frame_id is null or frame_ack_id is not null);
create index school_years_frame_idx on public.school_years (frame_id) where frame_id is not null;
create index school_years_frame_ack_idx on public.school_years (frame_ack_id) where frame_ack_id is not null;

-- Skolan följer bara utgivna ramversioner, den kvitterade versionen är aldrig äldre än basen, och kopplingen i ett skickat,
-- fastställt eller ersatt läsår ändras inte (för en fastställd kalender krävs en ny version, D-10).
create function public.lasar_school_frame_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' and (new.frame_id, new.frame_ack_id) is not distinct from (old.frame_id, old.frame_ack_id) then return new; end if;
  if tg_op = 'INSERT' and new.frame_id is null and new.frame_ack_id is null then return new; end if;
  if tg_op = 'UPDATE' and (old.status in ('forslag', 'faststalld') or old.superseded_by is not null) then
    raise exception 'Ramkopplingen i ett skickat, fastställt eller ersatt läsår ändras inte.';
  end if;
  if exists (select 1 from public.school_year_frames f where f.id in (new.frame_id, new.frame_ack_id) and f.status <> 'utgiven') then
    raise exception 'Skolans kalender kan bara följa en utgiven ramversion.';
  end if;
  if new.frame_id is not null and (select f.version from public.school_year_frames f where f.id = new.frame_ack_id)
       < (select f.version from public.school_year_frames f where f.id = new.frame_id) then
    raise exception 'Den kvitterade ramversionen är äldre än skolans ram.';
  end if;
  return new;
end $$;
create trigger school_years_frame_guard before insert or update of frame_id, frame_ack_id on public.school_years
  for each row execute function public.lasar_school_frame_guard();

-- Journalen tar också ramens kommandon: mål ramen har ingen skolenhet och ingen skolversion, och ett byte av arbetssätt har
-- ingen ramversion.
alter table public.lasar_commands
  alter column unit_id drop not null,
  alter column school_year_id drop not null,
  add column frame_id uuid references public.school_year_frames (id),
  add constraint lasar_commands_target check ((unit_id is null) = (school_year_id is null) and (frame_id is null or unit_id is null));

-- ---------------------------------------------------------------------------
-- 3. Arbetssätt, ram och läsning
-- ---------------------------------------------------------------------------
create function public.lasar_mode(org uuid, year integer) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select s.mode from public.school_year_frame_settings s where s.organizer_id = org and s.start_year = year), 'eget')
$$;

-- Användarbeslut 2026-11-10 (alternativ a): läsåret har börjat från och med 1 augusti läsårets startår.
create function public.lasar_mode_locked(year integer) returns boolean
language sql stable set search_path = pg_catalog, public as $$
  select public.app_today() >= make_date(year, 8, 1)
$$;

-- Den senaste utgivna ramversionen, eller en rad med bara null.
create function public.lasar_frame_latest(org uuid, year integer) returns public.school_year_frames
language sql stable security definer set search_path = pg_catalog, public as $$
  select f.* from public.school_year_frames f where f.organizer_id = org and f.start_year = year and f.status = 'utgiven'
   order by f.version desc limit 1
$$;

-- Huvudmannens skolformer (samma urval som skolans schoolTypes, för alla huvudmannens skolenheter).
create function public.lasar_organizer_types(org uuid) returns text[]
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(array_agg(t.school_type order by t.school_type collate "C"), '{}') from (
    select distinct x.school_type from public.school_unit_types x join public.school_units u on u.id = x.unit_id
     where u.organizer_id = org and x.school_type ~ '^[A-Z]{2,6}$' order by 1 limit 10) t
$$;

-- En dag som huvudmannen kan ändra i ramen: vardag inom ramens terminer som inte är allmän helgdag.
create function public.lasar_frame_day_editable(f public.school_year_frames, d date) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select extract(isodow from d) < 6 and (d between f.ht_start and f.ht_end or d between f.vt_start and f.vt_end)
    and not public.tjanst_is_holiday(d)
$$;

create function public.lasar_frame_terms_json(f public.school_year_frames) returns jsonb
language sql immutable set search_path = pg_catalog, public as $$
  select jsonb_build_object('ht', jsonb_build_object('start', f.ht_start, 'end', f.ht_end), 'vt', jsonb_build_object('start', f.vt_start, 'end', f.vt_end))
$$;

create function public.lasar_frame_exceptions_json(frame uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select jsonb_object_agg(d.day::text, jsonb_strip_nulls(jsonb_build_object('kind', d.kind, 'note', d.note)))
    from public.school_year_frame_days d where d.frame_id = frame), '{}'::jsonb)
$$;

-- Ramversionens kontrollsumma i samma kanoniska form som skolans (lasar-content.ts), utan grupper och utan ramversion.
create function public.lasar_frame_content_hash(frame uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select public.lasar_content_hash_json(jsonb_build_object('version', f.version, 'frameVersionId', null, 'terms', public.lasar_frame_terms_json(f),
    'exceptions', public.lasar_frame_exceptions_json(f.id), 'groupDays', '{}'::jsonb, 'shortWeeks', '{}'::jsonb))
  from public.school_year_frames f where f.id = frame
$$;

-- En utgiven ramversion i kontraktets form (LasarFrameRef), eller null.
create function public.lasar_frame_ref(frame uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select (select jsonb_build_object('versionId', f.id, 'version', f.version, 'publishedOn', f.published_on, 'terms', public.lasar_frame_terms_json(f),
    'exceptions', public.lasar_frame_exceptions_json(f.id))
    from public.school_year_frames f where f.id = frame and f.status = 'utgiven')
$$;

-- Ramens historikrad; aktören härleds ur den låsta sessionen och uppdraget, aldrig ur begäran.
create function public.lasar_frame_event(frame uuid, action text, comment text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions;
begin
  a := public.phase3_actor(); s := public.phase5_programplan_session_check();
  if a.function <> 'huvudman' then raise exception 'Huvudmannens ram nekas.' using errcode = '42501'; end if;
  insert into public.school_year_frame_events (frame_id, action, comment, actor_identity_id, session_id, membership_id, assignment_id)
  values (frame, action, comment, s.identity_id, s.id, a.membership_id, a.id);
end $$;

create function public.lasar_frame_history(f public.school_year_frames) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(h.entry order by h.at desc, h.id desc), '[]'::jsonb) from (
    select e.id, e.created_at at, jsonb_build_object('id', e.id, 'role', 'huvudman', 'actorName', public.lasar_display_name(i.display_name),
      'at', to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'action', case e.action when 'create' then 'Ram skapad' when 'create_frame' then 'Ny ramversion' when 'reset_to_proposal' then 'Förslag återställt'
        when 'publish' then 'Ramen utgiven' end,
      'comment', e.comment, 'version', v.version) entry
    from public.school_year_frame_events e
    join public.school_year_frames v on v.id = e.frame_id
    left join public.identities i on i.id = e.actor_identity_id
    where v.organizer_id = f.organizer_id and v.start_year = f.start_year and v.version <= f.version
    order by e.created_at desc, e.id desc limit 500) h
$$;

-- Ramversionen som kalender i kontraktets form. En utgiven ramversion visas med status faststalld och decidedOn = utgivningsdagen.
create function public.lasar_frame_calendar_json(f public.school_year_frames) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('versionId', f.id, 'version', f.version, 'status', case f.status when 'utgiven' then 'faststalld' else 'utkast' end,
    'revision', f.revision, 'terms', public.lasar_frame_terms_json(f), 'exceptions', public.lasar_frame_exceptions_json(f.id),
    'groupDays', '{}'::jsonb, 'shortWeeks', '{}'::jsonb, 'frameVersionId', null,
    'contentHash', coalesce(f.content_hash, public.lasar_frame_content_hash(f.id)), 'decidedOn', f.published_on, 'history', public.lasar_frame_history(f))
$$;

-- Läsningen för målet ramen (bara huvudmannen, D-08). Förmågorna: skapa ram när ingen finns, ny version ur den senast utgivna
-- när inget utkast finns, ändra och ge ut utkastet, byta arbetssätt före läsårets start.
create function public.lasar_frame_detail(a public.access_assignments, year integer, version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_frame public.school_year_frames; v_latest public.school_year_frames; v_versions jsonb; v_open boolean; v_locked boolean := public.lasar_mode_locked(year);
begin
  if a.function <> 'huvudman' then raise exception 'Huvudmannens ram nekas.' using errcode = '42501'; end if;
  if version_id is not null then
    select * into v_frame from public.school_year_frames f where f.id = version_id and f.organizer_id = a.organizer_id and f.start_year = year;
    if not found then raise exception 'Ramversionen finns inte.' using errcode = '40001', hint = 'lasar_not_found'; end if;
  else
    select * into v_frame from public.school_year_frames f where f.organizer_id = a.organizer_id and f.start_year = year
     order by (f.status = 'utkast') desc, f.version desc limit 1;
  end if;
  v_latest := public.lasar_frame_latest(a.organizer_id, year);
  v_open := exists (select 1 from public.school_year_frames f where f.organizer_id = a.organizer_id and f.start_year = year and f.status = 'utkast');
  select coalesce(jsonb_agg(jsonb_build_object('versionId', f.id, 'version', f.version, 'status', case f.status when 'utgiven' then 'faststalld' else 'utkast' end,
    'decidedOn', f.published_on, 'current', f.id is not distinct from v_latest.id) order by f.version), '[]') into v_versions
    from public.school_year_frames f where f.organizer_id = a.organizer_id and f.start_year = year;
  return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'target', jsonb_build_object('kind', 'frame'), 'schoolYear', year,
    'schoolName', 'Huvudmannens ram', 'schoolTypes', to_jsonb(public.lasar_organizer_types(a.organizer_id)),
    'mode', public.lasar_mode(a.organizer_id, year), 'modeLocked', v_locked, 'versions', v_versions,
    'calendar', case when v_frame.id is null then null else public.lasar_frame_calendar_json(v_frame) end,
    'capabilities', jsonb_build_object('canEdit', coalesce(v_frame.status = 'utkast', false), 'canSubmit', false, 'canWithdraw', false, 'canRequestChange', false,
      'canWithdrawRequest', false, 'canReturn', false, 'canApprove', false, 'canReopen', false, 'canDecline', false, 'canComment', false,
      'canCreate', case when jsonb_array_length(v_versions) = 0 then '["proposal"]'::jsonb when not v_open and v_latest.id is not null then '["frame"]'::jsonb
        else '[]'::jsonb end,
      'canPublishFrame', coalesce(v_frame.status = 'utkast', false), 'canSetMode', not v_locked),
    'editableFrom', null, 'changeRequest', null, 'review', '[]'::jsonb, 'frame', null, 'groups', '[]'::jsonb,
    'teaching', jsonb_build_object('classes', '[]'::jsonb, 'imClassIds', '[]'::jsonb),
    'previousYearAvailable', (public.lasar_frame_latest(a.organizer_id, year - 1)).id is not null);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Befintliga funktioner med ramen (create or replace)
-- ---------------------------------------------------------------------------
-- Målet ramen ({kind: 'frame'}) ger null; en skola ger skolenhetens ID.
create or replace function public.lasar_target(v jsonb) returns uuid
language plpgsql immutable set search_path = pg_catalog, public as $$
begin
  if jsonb_typeof(v) = 'object' and v ->> 'kind' = 'frame' then
    perform public.lasar_shape(v, array['kind']);
    return null;
  end if;
  perform public.lasar_shape(v, array['kind', 'unitId']);
  if v ->> 'kind' is distinct from 'school' then
    raise exception 'Ogiltigt mål för läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  return public.lasar_uuid(v -> 'unitId');
end $$;

-- Som 20261111100000 men också för ramens versioner (object_type school_year_frame).
create or replace function public.lasar_audit(operation text, object_type text, object_id uuid, details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
  if operation is null or operation not in ('lasar_read', 'lasar_command', 'lasar_decision', 'lasar_status')
     or object_type is null or object_type not in ('school_year', 'school_year_frame') or not coalesce(public.tjanst_audit_details(details), false) then
    raise exception 'Ogiltig logg för läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  a := public.phase3_actor(); s := public.phase5_programplan_session_check();
  select * into i from public.identities where id = s.identity_id;
  begin
    insert into public.security_events (correlation_id, source, actor_identity_id, actor_issuer, actor_subject, session_id, membership_id, assignment_id,
      customer_id, action, object_type, object_id, outcome, details)
    values (nullif(current_setting('app.correlation_id', true), '')::uuid, 'db', i.id, i.issuer, i.subject, s.id, a.membership_id, a.id,
      a.customer_id, operation, object_type, object_id, 'ok', details);
  exception when others then raise exception 'Läsårskalenderns logg saknas.' using errcode = '55000'; end;
end $$;

-- Som 20261112100000 men med skolans ramversion (frame_id) i kontrollsumman, samma form som lasarContentCanonical.
create or replace function public.lasar_content_hash(version_id uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select public.lasar_content_hash_json(jsonb_build_object('version', y.version, 'frameVersionId', y.frame_id,
    'terms', jsonb_build_object('ht', jsonb_build_object('start', y.ht_start, 'end', y.ht_end), 'vt', jsonb_build_object('start', y.vt_start, 'end', y.vt_end)),
    'exceptions', coalesce((select jsonb_object_agg(d.day::text, jsonb_strip_nulls(jsonb_build_object('kind', d.kind, 'note', d.note)))
      from public.school_year_days d where d.school_year_id = y.id), '{}'::jsonb),
    'groupDays', public.lasar_group_days_json(y.id), 'shortWeeks', public.lasar_short_weeks_json(y.id)))
  from public.school_years y where y.id = version_id
$$;

-- Som 20261112100000 med skolans ramversion (frameVersionId = frame_id).
create or replace function public.lasar_calendar_json(y public.school_years) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('versionId', y.id, 'version', y.version, 'status', y.status, 'revision', y.revision,
    'terms', jsonb_build_object('ht', jsonb_build_object('start', y.ht_start, 'end', y.ht_end), 'vt', jsonb_build_object('start', y.vt_start, 'end', y.vt_end)),
    'exceptions', coalesce((select jsonb_object_agg(d.day::text, jsonb_strip_nulls(jsonb_build_object('kind', d.kind, 'note', d.note)))
      from public.school_year_days d where d.school_year_id = y.id), '{}'::jsonb),
    'groupDays', public.lasar_group_days_json(y.id), 'shortWeeks', public.lasar_short_weeks_json(y.id),
    'frameVersionId', y.frame_id, 'contentHash', coalesce(y.content_hash, public.lasar_content_hash(y.id)), 'decidedOn', y.decided_on,
    'history', public.lasar_history(y))
$$;

-- Som 20261112110000 plus skolans start ur ramen, intag och kvittering av ramens ändringar.
create or replace function public.lasar_history_add(version_id uuid, action text, comment text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
begin
  if action not in ('create', 'reset_to_proposal', 'comment', 'submit', 'withdraw', 'return', 'approve', 'request_change', 'withdraw_request',
       'decline_request', 'reopen', 'create_frame', 'take_frame_changes', 'keep_school_calendar') then
    raise exception 'Ogiltig historik för läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  insert into public.school_year_events (school_year_id, actor_role, action, comment, created_at)
  values (version_id, 'rektor', 'lasar_' || action, comment, clock_timestamp());
end $$;

create or replace function public.lasar_history(y public.school_years) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(h.entry order by h.at desc, h.id desc), '[]'::jsonb) from (
    select e.id, e.created_at at, jsonb_build_object('id', e.id,
      'role', case e.actor_role when 'administrator' then 'skoladministrator' else e.actor_role::text end,
      'actorName', public.lasar_display_name(i.display_name),
      'at', to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'action', case e.action when 'lasar_create' then 'Förslag skapat' when 'lasar_reset_to_proposal' then 'Förslag återställt'
        when 'lasar_comment' then 'Kommentar' when 'lasar_submit' then 'Förslag skickat' when 'lasar_withdraw' then 'Förslag återtaget'
        when 'lasar_return' then 'Återsänd för ändring' when 'lasar_approve' then 'Fastställd' when 'lasar_request_change' then 'Ändring begärd'
        when 'lasar_withdraw_request' then 'Begäran återtagen' when 'lasar_decline_request' then 'Begäran avslagen'
        when 'lasar_reopen' then 'Öppnat för ändring' when 'lasar_create_frame' then 'Utgår från huvudmannens ram'
        when 'lasar_take_frame_changes' then 'Ramens ändringar intagna' when 'lasar_keep_school_calendar' then 'Skolans kalender behållen' end,
      'comment', e.comment, 'version', v.version) entry
    from public.school_year_events e
    join public.school_years v on v.id = e.school_year_id
    left join public.identities i on i.id = e.actor_identity_id
    where v.unit_id = y.unit_id and v.start_year = y.start_year and v.organizer_id = y.organizer_id and v.version <= y.version
      and e.actor_identity_id is not null and e.actor_role in ('huvudman', 'rektor', 'administrator')
      and e.action in ('lasar_create', 'lasar_reset_to_proposal', 'lasar_comment', 'lasar_submit', 'lasar_withdraw', 'lasar_return', 'lasar_approve',
        'lasar_request_change', 'lasar_withdraw_request', 'lasar_decline_request', 'lasar_reopen', 'lasar_create_frame', 'lasar_take_frame_changes',
        'lasar_keep_school_calendar')
    order by e.created_at desc, e.id desc limit 500) h
$$;

-- Som 20261112110000 plus arbetssättet (D-01), ramen (D-05, D-06) och startvalet i arbetssättet (D-03, D-14): i eget förslag
-- kan skolan skapa förslag, i ramen bara utgå från en utgiven ram. frame.current är skolans ramversion (frame_id), frame.latest
-- den senaste utgivna och acknowledgedVersionId den kvitterade (frame_ack_id). Rektor ser bara utgivna ramversioner (T-05.1.1-34).
create or replace function public.lasar_detail(a public.access_assignments, unit uuid, year integer, version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_unit public.school_units; v_year public.school_years; v_versions jsonb; v_types jsonb; v_school boolean := a.function in ('rektor', 'administrator');
  v_open boolean; v_sent boolean; v_caps jsonb; v_groups jsonb; v_current boolean; v_pending boolean; v_requested boolean;
  v_mode text := public.lasar_mode(a.organizer_id, year); v_latest public.school_year_frames := public.lasar_frame_latest(a.organizer_id, year);
begin
  select * into v_unit from public.school_units u where u.id = unit;
  if version_id is not null then
    select * into v_year from public.school_years s where s.id = version_id and s.unit_id = unit and s.start_year = year and s.organizer_id = a.organizer_id;
    if not found then raise exception 'Kalenderversionen finns inte.' using errcode = '40001', hint = 'lasar_not_found'; end if;
  else
    select * into v_year from public.school_years s where s.unit_id = unit and s.start_year = year and s.organizer_id = a.organizer_id
     order by (s.status in ('utkast', 'forslag', 'atersand') and s.superseded_by is null) desc, (s.status = 'faststalld' and s.superseded_by is null) desc, s.version desc
     limit 1;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('versionId', s.id, 'version', s.version, 'status', s.status, 'decidedOn', s.decided_on,
    'current', s.status = 'faststalld' and s.superseded_by is null) order by s.version), '[]') into v_versions
    from public.school_years s where s.unit_id = unit and s.start_year = year and s.organizer_id = a.organizer_id;
  select coalesce(jsonb_agg(t.school_type order by t.school_type collate "C"), '[]') into v_types
    from (select distinct x.school_type from public.school_unit_types x where x.unit_id = unit and x.school_type ~ '^[A-Z]{2,6}$' order by 1 limit 10) t;
  v_groups := public.lasar_groups(unit, year);
  if jsonb_array_length(v_groups) > 2000 then
    raise exception 'Skolan har fler grupper än läsningen rymmer.' using errcode = '54000';
  end if;
  v_open := v_year.id is not null and v_year.status in ('utkast', 'atersand') and v_year.superseded_by is null;
  v_sent := v_year.id is not null and v_year.status = 'forslag' and v_year.superseded_by is null;
  v_current := v_year.id is not null and v_year.status = 'faststalld' and v_year.superseded_by is null;
  v_pending := exists (select 1 from public.school_years s where s.unit_id = unit and s.start_year = year and s.organizer_id = a.organizer_id
    and s.status in ('utkast', 'forslag', 'atersand') and s.superseded_by is null);
  v_requested := exists (select 1 from public.school_year_change_requests r where r.unit_id = unit and r.start_year = year and r.status = 'open');
  v_caps := jsonb_build_object('canEdit', v_school and v_open, 'canSubmit', v_school and v_open, 'canWithdraw', v_school and v_sent,
    'canRequestChange', v_school and v_current and not v_requested and not v_pending, 'canWithdrawRequest', v_school and v_current and v_requested,
    'canReturn', a.function = 'huvudman' and v_sent, 'canApprove', a.function = 'huvudman' and v_sent,
    'canReopen', a.function = 'huvudman' and v_current and not v_pending, 'canDecline', a.function = 'huvudman' and v_current and v_requested,
    'canComment', v_year.id is not null and v_year.superseded_by is null,
    'canCreate', case when not v_school or jsonb_array_length(v_versions) > 0 then '[]'::jsonb
      when v_mode = 'eget' then '["proposal"]'::jsonb when v_latest.id is not null then '["frame"]'::jsonb else '[]'::jsonb end,
    'canPublishFrame', false, 'canSetMode', false);
  return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'target', jsonb_build_object('kind', 'school', 'unitId', unit), 'schoolYear', year,
    'schoolName', left(btrim(v_unit.name), 200), 'schoolTypes', v_types, 'mode', v_mode, 'modeLocked', public.lasar_mode_locked(year), 'versions', v_versions,
    'calendar', case when v_year.id is null then null else public.lasar_calendar_json(v_year) end,
    'capabilities', v_caps, 'editableFrom', case when v_year.id is null then null else public.lasar_editable_from(v_year) end,
    'changeRequest', public.lasar_change_request_json(unit, year), 'review', '[]'::jsonb,
    'frame', case when v_mode = 'ram' or v_year.frame_id is not null or v_year.frame_ack_id is not null then
      jsonb_build_object('current', public.lasar_frame_ref(v_year.frame_id), 'latest', public.lasar_frame_ref(v_latest.id), 'acknowledgedVersionId', v_year.frame_ack_id)
      end,
    'groups', v_groups, 'teaching', public.lasar_teaching(unit, year),
    'previousYearAvailable', (public.lasar_current(unit, year - 1)).id is not null);
end $$;

-- Som 20261112110000 men den nya versionen behåller skolans ramversion och kvitterade version, så att en ändring av ramen kan
-- tas in i den nya versionen (D-05, D-10).
create or replace function public.lasar_reopen(y public.school_years, reason text) returns public.school_years
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_new public.school_years;
begin
  begin
    insert into public.school_years (organizer_id, unit_id, start_year, ht_start, ht_end, vt_start, vt_end, status, version, revision, previous_id, change_reason,
      frame_id, frame_ack_id)
    values (y.organizer_id, y.unit_id, y.start_year, y.ht_start, y.ht_end, y.vt_start, y.vt_end, 'utkast',
      (select max(s.version) + 1 from public.school_years s where s.unit_id = y.unit_id and s.start_year = y.start_year), 1, y.id, reason,
      y.frame_id, y.frame_ack_id)
    returning * into v_new;
  exception when unique_violation then
    raise exception 'En ny version pågår redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
  end;
  insert into public.school_year_days (school_year_id, day, kind, note)
    select v_new.id, d.day, d.kind, d.note from public.school_year_days d where d.school_year_id = y.id order by d.day;
  insert into public.school_year_group_days (school_year_id, scope, offering_id, column_id, class_id, day, cause, note)
    select v_new.id, g.scope, g.offering_id, g.column_id, g.class_id, g.day, g.cause, g.note from public.school_year_group_days g
     where g.school_year_id = y.id order by g.group_ref collate "C", g.day;
  insert into public.school_year_short_weeks (school_year_id, scope, offering_id, class_id, column_id, weekday, reason)
    select v_new.id, w.scope, w.offering_id, w.class_id, w.column_id, w.weekday, w.reason from public.school_year_short_weeks w
     where w.school_year_id = y.id order by w.group_ref collate "C";
  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Ramens skrivningar (bara huvudmannen, bara i utkastet)
-- ---------------------------------------------------------------------------
-- Ramens lov- och studiedagar ur förslaget: varje dag ska vara en ändringsbar vardag i ramens terminer.
create function public.lasar_frame_days_from(f public.school_year_frames, exceptions jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_day record; v_date date; v_kind text;
begin
  if jsonb_typeof(exceptions) is distinct from 'object' or (select count(*) from jsonb_object_keys(exceptions)) > 400 then
    raise exception 'Ogiltigt förslag.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  for v_day in select e.key, e.value from jsonb_each(exceptions) e loop
    v_date := public.lasar_date(to_jsonb(v_day.key));
    perform public.lasar_shape(v_day.value, array['kind'], array['note']);
    v_kind := v_day.value ->> 'kind';
    if jsonb_typeof(v_day.value -> 'kind') <> 'string' or v_kind not in ('lovdag', 'studiedag') or not public.lasar_frame_day_editable(f, v_date) then
      raise exception 'Ogiltig dag i förslaget.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    insert into public.school_year_frame_days (frame_id, day, kind, note)
    values (f.id, v_date, v_kind::public.school_day_kind, case when v_day.value ? 'note' then public.lasar_text(v_day.value -> 'note', 200, false) end);
  end loop;
end $$;

-- Terminerna ur förslaget, prövade som i skolans förslag.
create function public.lasar_frame_terms_from(proposal jsonb) returns date[]
language plpgsql immutable set search_path = pg_catalog, public as $$
declare v_terms jsonb;
begin
  perform public.lasar_shape(proposal, array['terms', 'exceptions']);
  v_terms := public.lasar_shape(proposal -> 'terms', array['ht', 'vt']);
  perform public.lasar_shape(v_terms -> 'ht', array['start', 'end']); perform public.lasar_shape(v_terms -> 'vt', array['start', 'end']);
  return array[public.lasar_date(v_terms #> '{ht,start}'), public.lasar_date(v_terms #> '{ht,end}'), public.lasar_date(v_terms #> '{vt,start}'),
    public.lasar_date(v_terms #> '{vt,end}')];
end $$;

-- Ramutkast version 1 ur helgdagar och vanliga lov: förslaget räknas fram i servern med proposeSchoolYear (D-03) för
-- huvudmannens skolformer och prövas här.
create function public.lasar_frame_create_proposal(a public.access_assignments, year integer, proposal jsonb) returns public.school_year_frames
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare f public.school_year_frames; t date[] := public.lasar_frame_terms_from(proposal);
begin
  begin
    insert into public.school_year_frames (organizer_id, start_year, version, ht_start, ht_end, vt_start, vt_end, created_by_assignment)
    values (a.organizer_id, year, 1, t[1], t[2], t[3], t[4], a.id) returning * into f;
  exception
    when check_violation then raise exception 'Ogiltiga terminer.' using errcode = '22023', hint = 'lasar_invalid';
    when unique_violation then raise exception 'Ramen finns redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
  end;
  perform public.lasar_frame_days_from(f, proposal -> 'exceptions');
  return f;
end $$;

-- Nästa ändring av en utgiven ram: version n+1 som utkast med samma terminer och dagar som den senast utgivna (D-13).
create function public.lasar_frame_new_version(a public.access_assignments, latest public.school_year_frames) returns public.school_year_frames
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare f public.school_year_frames;
begin
  begin
    insert into public.school_year_frames (organizer_id, start_year, version, ht_start, ht_end, vt_start, vt_end, previous_id, created_by_assignment)
    values (latest.organizer_id, latest.start_year,
      (select max(x.version) + 1 from public.school_year_frames x where x.organizer_id = latest.organizer_id and x.start_year = latest.start_year),
      latest.ht_start, latest.ht_end, latest.vt_start, latest.vt_end, latest.id, a.id) returning * into f;
  exception when unique_violation then
    raise exception 'Ett utkast till ramen finns redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
  end;
  insert into public.school_year_frame_days (frame_id, day, kind, note)
    select f.id, d.day, d.kind, d.note from public.school_year_frame_days d where d.frame_id = latest.id order by d.day;
  return f;
end $$;

create function public.lasar_frame_lock(a public.access_assignments, year integer, version_id uuid) returns public.school_year_frames
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare f public.school_year_frames;
begin
  select * into f from public.school_year_frames x where x.id = version_id for update;
  if not found or f.organizer_id <> a.organizer_id or f.start_year <> year then
    raise exception 'Ramversionen finns inte.' using errcode = '40001', hint = 'lasar_not_found';
  end if;
  return f;
end $$;

-- set_days och set_notes i ramen: samma prövning som i skolans utkast (lasar_set_days, lasar_set_notes).
create function public.lasar_frame_set_days(f public.school_year_frames, op jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_kind text; v_note text; v_date date; v_prev date; v_item record;
begin
  perform public.lasar_shape(op, array['op', 'dates', 'kind'], array['note']);
  v_kind := op ->> 'kind';
  if jsonb_typeof(op -> 'kind') <> 'string' or v_kind not in ('skoldag', 'lovdag', 'studiedag') or (v_kind = 'skoldag' and op ? 'note')
     or jsonb_typeof(op -> 'dates') <> 'array' or jsonb_array_length(op -> 'dates') not between 1 and 400 then
    raise exception 'Ogiltig ändring av dagar.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  v_note := case when op ? 'note' then public.lasar_text(op -> 'note', 200, false) end;
  for v_item in select e.value from jsonb_array_elements(op -> 'dates') with ordinality e(value, n) order by e.n loop
    v_date := public.lasar_date(v_item.value);
    if (v_prev is not null and v_date <= v_prev) or not public.lasar_frame_day_editable(f, v_date) then
      raise exception 'Dagen kan inte ändras.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    v_prev := v_date;
    if v_kind = 'skoldag' then
      delete from public.school_year_frame_days d where d.frame_id = f.id and d.day = v_date;
    else
      insert into public.school_year_frame_days (frame_id, day, kind, note) values (f.id, v_date, v_kind::public.school_day_kind, v_note)
      on conflict (frame_id, day) do update set kind = excluded.kind, note = excluded.note;
    end if;
  end loop;
end $$;

create function public.lasar_frame_set_notes(f public.school_year_frames, op jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_note text; v_date date; v_prev date; v_item record; v_changed integer := 0; n integer;
begin
  perform public.lasar_shape(op, array['op', 'dates'], array['note']);
  if jsonb_typeof(op -> 'dates') <> 'array' or jsonb_array_length(op -> 'dates') not between 1 and 400 then
    raise exception 'Ogiltig anteckning.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  v_note := case when op ? 'note' then public.lasar_text(op -> 'note', 200, false) end;
  for v_item in select e.value from jsonb_array_elements(op -> 'dates') with ordinality e(value, n) order by e.n loop
    v_date := public.lasar_date(v_item.value);
    if v_prev is not null and v_date <= v_prev then raise exception 'Ogiltig anteckning.' using errcode = '22023', hint = 'lasar_invalid'; end if;
    v_prev := v_date;
    update public.school_year_frame_days d set note = v_note where d.frame_id = f.id and d.day = v_date and public.lasar_frame_day_editable(f, v_date);
    get diagnostics n = row_count; v_changed := v_changed + n;
  end loop;
  if v_changed = 0 then raise exception 'Bara lov- och studiedagar har anteckning.' using errcode = '22023', hint = 'lasar_invalid'; end if;
end $$;

-- set_term i ramen: samma ordning och kalenderår som i skolans utkast; dagar som inte längre är ändringsbara faller bort.
create function public.lasar_frame_set_term(f public.school_year_frames, op jsonb) returns public.school_year_frames
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_term text; v_edge text; v_date date; v_ht_start date := f.ht_start; v_ht_end date := f.ht_end; v_vt_start date := f.vt_start; v_vt_end date := f.vt_end;
begin
  perform public.lasar_shape(op, array['op', 'term', 'edge', 'date']);
  v_term := op ->> 'term'; v_edge := op ->> 'edge';
  if jsonb_typeof(op -> 'term') <> 'string' or jsonb_typeof(op -> 'edge') <> 'string' or v_term not in ('ht', 'vt') or v_edge not in ('start', 'end') then
    raise exception 'Ogiltig terminsändring.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  v_date := public.lasar_date(op -> 'date');
  if v_term = 'ht' and v_edge = 'start' then v_ht_start := v_date; elsif v_term = 'ht' then v_ht_end := v_date;
  elsif v_edge = 'start' then v_vt_start := v_date; else v_vt_end := v_date; end if;
  if not (v_ht_start < v_ht_end and v_ht_end < v_vt_start and v_vt_start < v_vt_end) then
    raise exception 'Kalendern uppfyller inte förordningarna.' using errcode = '40001', hint = 'lasar_rules_failed', detail = '["term_order"]';
  end if;
  if extract(year from v_ht_start) <> f.start_year or extract(year from v_vt_end) <> f.start_year + 1 then
    raise exception 'Läsåret ligger utanför sina kalenderår.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  update public.school_year_frames x set ht_start = v_ht_start, ht_end = v_ht_end, vt_start = v_vt_start, vt_end = v_vt_end where x.id = f.id returning * into f;
  delete from public.school_year_frame_days d where d.frame_id = f.id and not public.lasar_frame_day_editable(f, d.day);
  return f;
end $$;

-- reset_to_proposal i ramen: terminer och dagar enligt serverns förslag.
create function public.lasar_frame_reset(f public.school_year_frames, proposal jsonb) returns public.school_year_frames
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare t date[] := public.lasar_frame_terms_from(proposal);
begin
  delete from public.school_year_frame_days d where d.frame_id = f.id;
  begin
    update public.school_year_frames x set ht_start = t[1], ht_end = t[2], vt_start = t[3], vt_end = t[4] where x.id = f.id returning * into f;
  exception when check_violation then raise exception 'Ogiltiga terminer.' using errcode = '22023', hint = 'lasar_invalid';
  end;
  perform public.lasar_frame_days_from(f, proposal -> 'exceptions');
  return f;
end $$;

-- Skolor hos huvudmannen som har påbörjat en kalender för läsåret (D-15), med den öppna versionens status eller annars den senaste.
create function public.lasar_mode_affected(org uuid, year integer) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('unitId', u.id, 'schoolName', public.lasar_display_name(u.name), 'status', z.status)
    order by public.lasar_display_name(u.name) collate "C", u.id), '[]'::jsonb)
  from public.school_units u
  cross join lateral (select y.status::text status from public.school_years y where y.unit_id = u.id and y.start_year = year and y.organizer_id = org
    order by (y.status in ('utkast', 'forslag', 'atersand') and y.superseded_by is null) desc, y.version desc limit 1) z
  where u.organizer_id = org
$$;

-- Ramens kommandon och beslut (mål ramen). Anropas av lasar_command efter tolkning, lås och återspelning. Bara huvudmannen
-- (T-05.1.1-31). Kommandon: create (proposal = ur helgdagar och vanliga lov, frame = ny version ur den senast utgivna),
-- set_days, set_notes, set_term och reset_to_proposal i utkastet. Beslut: publish_frame, preview_mode_change och set_mode.
create function public.lasar_frame_command(a public.access_assignments, s public.app_sessions, input jsonb, q jsonb, v_kind text, v_action text,
  v_request uuid, v_year integer, v_version uuid, v_expected integer, v_text text) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare f public.school_year_frames; v_latest public.school_year_frames; v_op jsonb; v_source text; v_result jsonb; v_envelope jsonb; v_revision integer;
  v_affected jsonb; v_errors jsonb; v_mode text;
begin
  if a.function <> 'huvudman' then raise exception 'Huvudmannens ram nekas.' using errcode = '42501'; end if;
  if v_kind = 'command' then
    if v_action = 'create' then
      perform public.lasar_shape(input #> '{ops,0}', array['op', 'source']);
      v_source := input #>> '{ops,0,source}';
      if v_source = 'copy' then
        raise exception 'Kopiering av förra årets ram kommer i en senare version.' using errcode = '22023', hint = 'lasar_unsupported';
      elsif v_source = 'proposal' then
        if exists (select 1 from public.school_year_frames x where x.organizer_id = a.organizer_id and x.start_year = v_year) then
          raise exception 'Ramen finns redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
        end if;
        f := public.lasar_frame_create_proposal(a, v_year, input -> 'proposal');
        perform public.lasar_frame_event(f.id, 'create', 'Terminer, helgdagar och vanliga lov föreslagna. Gemensamma studiedagar läggs ut av huvudmannen.');
      elsif v_source = 'frame' then
        v_latest := public.lasar_frame_latest(a.organizer_id, v_year);
        if v_latest.id is null then raise exception 'Ramen är inte utgiven.' using errcode = '40001', hint = 'lasar_frame_missing'; end if;
        f := public.lasar_frame_new_version(a, v_latest);
        perform public.lasar_frame_event(f.id, 'create_frame', format('Utgår från ramens version %s.', v_latest.version));
      else
        raise exception 'Ogiltig källa.' using errcode = '22023', hint = 'lasar_invalid';
      end if;
    else
      f := public.lasar_frame_lock(a, v_year, v_version);
      if f.status <> 'utkast' then raise exception 'Ramen är utgiven.' using errcode = '40001', hint = 'lasar_locked_status'; end if;
      if f.revision <> v_expected then raise exception 'Ramen har ändrats.' using errcode = '40001', hint = 'lasar_revision_conflict'; end if;
      for v_op in select o.value from jsonb_array_elements(input -> 'ops') with ordinality o(value, n) order by o.n loop
        case v_op ->> 'op'
          when 'set_days' then perform public.lasar_frame_set_days(f, v_op);
          when 'set_notes' then perform public.lasar_frame_set_notes(f, v_op);
          when 'set_term' then f := public.lasar_frame_set_term(f, v_op);
          when 'reset_to_proposal' then
            perform public.lasar_shape(v_op, array['op']);
            f := public.lasar_frame_reset(f, input -> 'proposal');
            perform public.lasar_frame_event(f.id, 'reset_to_proposal', 'Terminer och lov enligt förslaget utifrån helgdagarna.');
          else raise exception 'Åtgärden gäller inte ramen.' using errcode = '22023', hint = 'lasar_invalid';
        end case;
      end loop;
      update public.school_year_frames x set revision = x.revision + 1 where x.id = f.id returning * into f;
    end if;
    v_revision := f.revision;
  elsif v_action = 'publish_frame' then
    if v_version is null or v_expected is null or input -> 'mode' <> 'null'::jsonb or jsonb_array_length(input -> 'confirmAffected') <> 0 then
      raise exception 'Ogiltigt beslut.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    f := public.lasar_frame_lock(a, v_year, v_version);
    if f.status <> 'utkast' then raise exception 'Ramen är redan utgiven.' using errcode = '40001', hint = 'lasar_locked_status'; end if;
    if f.revision <> v_expected then raise exception 'Ramen har ändrats.' using errcode = '40001', hint = 'lasar_revision_conflict'; end if;
    -- Samma regler som skolans förslag (LASAR-03), för huvudmannens skolformer.
    select coalesce(jsonb_agg(r -> 'code'), '[]') into v_errors
      from jsonb_array_elements(public.lasar_rule_check(public.lasar_frame_terms_json(f), public.lasar_frame_exceptions_json(f.id),
        public.lasar_organizer_types(a.organizer_id))) r where r ->> 'level' = 'error';
    if jsonb_array_length(v_errors) > 0 then
      raise exception 'Ramen uppfyller inte förordningarna.' using errcode = '40001', hint = 'lasar_rules_failed', detail = v_errors::text;
    end if;
    update public.school_year_frames x set status = 'utgiven', published_at = clock_timestamp(), published_on = public.app_today(),
      published_by_assignment = a.id, message = nullif(v_text, ''), content_hash = public.lasar_frame_content_hash(x.id), revision = x.revision + 1
     where x.id = f.id returning * into f;
    perform public.lasar_frame_event(f.id, 'publish', coalesce(nullif(v_text, ''), 'Ramen är utgiven till skolorna.'));
    v_revision := f.revision;
  elsif v_action in ('preview_mode_change', 'set_mode') then
    if v_version is not null or v_expected is not null or input -> 'mode' = 'null'::jsonb
       or (v_action = 'preview_mode_change' and jsonb_array_length(input -> 'confirmAffected') <> 0) then
      raise exception 'Ogiltigt beslut.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    v_mode := input ->> 'mode';
    if public.lasar_mode_locked(v_year) then
      raise exception 'Läsåret har börjat.' using errcode = '40001', hint = 'lasar_mode_locked';
    end if;
    v_affected := public.lasar_mode_affected(a.organizer_id, v_year);
    if v_action = 'preview_mode_change' then
      -- Förhandsvisningen sparar inget och journalförs inte; den loggas.
      perform public.lasar_audit('lasar_decision', 'school_year_frame', null,
        jsonb_build_object('commandId', v_request, 'action', v_action, 'mode', v_mode, 'schoolYear', v_year, 'count', jsonb_array_length(v_affected)));
      return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'actor', jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id),
        'result', jsonb_build_object('contractVersion', 'lasar_sql_v1', 'schoolYear', v_year, 'mode', v_mode, 'affected', v_affected));
    end if;
    -- D-15: bytet gäller bara med exakt den skollista huvudmannen har sett. Påbörjade kalendrar rörs inte.
    if (select coalesce(jsonb_agg(c order by c), '[]'::jsonb) from jsonb_array_elements_text(q -> 'confirmAffected') c)
       <> (select coalesce(jsonb_agg(e ->> 'unitId' order by e ->> 'unitId'), '[]'::jsonb) from jsonb_array_elements(v_affected) e) then
      raise exception 'Skolorna med påbörjade kalendrar har ändrats.' using errcode = '40001', hint = 'lasar_revision_conflict';
    end if;
    insert into public.school_year_frame_settings as x (organizer_id, start_year, mode, updated_by_assignment)
    values (a.organizer_id, v_year, v_mode, a.id)
    on conflict (organizer_id, start_year) do update set mode = excluded.mode, revision = x.revision + 1, updated_at = clock_timestamp(),
      updated_by_assignment = excluded.updated_by_assignment
    returning x.revision into v_revision;
  else
    raise exception 'Beslutet gäller inte ramen.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  v_result := jsonb_build_object('receipt', jsonb_build_object('commandId', v_request, 'revision', v_revision, 'replayed', false),
    'detail', public.lasar_frame_detail(a, v_year, f.id));
  v_envelope := jsonb_build_object('contractVersion', 'lasar_sql_v1', 'actor', jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id), 'result', v_result);
  insert into public.lasar_commands (command_id, kind, action, customer_id, organizer_id, unit_id, school_year, school_year_id, frame_id, actor_identity_id,
    assignment_id, request, envelope)
  values (v_request, v_kind, v_action, a.customer_id, a.organizer_id, null, v_year, null, f.id, s.identity_id, a.id, q, v_envelope);
  perform public.lasar_audit(case when v_kind = 'command' then 'lasar_command' else 'lasar_decision' end, 'school_year_frame', f.id,
    jsonb_build_object('commandId', v_request, 'action', v_action, 'revision', v_revision, 'version', f.version, 'schoolYear', v_year,
      'mode', case when v_action = 'set_mode' then v_mode end));
  return v_envelope;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Skolans start ur ramen (D-02, D-14)
-- ---------------------------------------------------------------------------
-- Skolans utkast med den utgivna ramens terminer och lov- och studiedagar; frame_id och frame_ack_id är ramversionen.
create function public.lasar_create_from_frame(a public.access_assignments, unit uuid, year integer, f public.school_year_frames) returns public.school_years
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare y public.school_years;
begin
  begin
    insert into public.school_years (organizer_id, unit_id, start_year, ht_start, ht_end, vt_start, vt_end, status, version, revision, frame_id, frame_ack_id)
    values (a.organizer_id, unit, year, f.ht_start, f.ht_end, f.vt_start, f.vt_end, 'utkast', 1, 1, f.id, f.id)
    returning * into y;
  exception when unique_violation then raise exception 'Kalendern finns redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
  end;
  insert into public.school_year_days (school_year_id, day, kind, note)
    select y.id, d.day, d.kind, d.note from public.school_year_frame_days d where d.frame_id = f.id order by d.day;
  return y;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Ingångar
-- ---------------------------------------------------------------------------
-- Som 20261111100000 plus målet ramen (bara huvudmannen).
create or replace function public.lasar_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions; v_unit uuid; v_year integer; v_version uuid; v_detail jsonb;
begin
  a := public.lasar_actor(); s := public.phase5_programplan_session_check();
  if input is null or octet_length(input::text) > 65536 then
    raise exception 'Ogiltig läsning.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  perform public.lasar_shape(input, array['target', 'schoolYear', 'versionId']);
  v_unit := public.lasar_target(input -> 'target');
  v_year := public.lasar_int(input -> 'schoolYear', 2000, 2100);
  v_version := case when input -> 'versionId' = 'null'::jsonb then null else public.lasar_uuid(input -> 'versionId') end;
  if v_unit is null then
    v_detail := public.lasar_frame_detail(a, v_year, v_version);
    perform public.lasar_audit('lasar_read', 'school_year_frame', (v_detail #>> '{calendar,versionId}')::uuid, jsonb_build_object('schoolYear', v_year));
  else
    perform public.lasar_scope(a, v_unit);
    v_detail := public.lasar_detail(a, v_unit, v_year, v_version);
    perform public.lasar_audit('lasar_read', 'school_year', (v_detail #>> '{calendar,versionId}')::uuid,
      jsonb_build_object('unitId', v_unit, 'schoolYear', v_year));
  end if;
  return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'actor', jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id), 'result', v_detail);
end $$;

-- Som 20261112110000 plus målet ramen (lasar_frame_command), skolans start ur ramen och startvalet per arbetssätt (D-14):
-- i arbetssättet ram utan utgiven ram nekas varje start med lasar_frame_missing; förslag hör till eget förslag och ramen till
-- arbetssättet ram. Kopiering (källan copy) kommer i plan 11.
create or replace function public.lasar_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions; q jsonb; v_kind text; v_action text; v_request uuid; v_unit uuid; v_year integer;
  v_version uuid; v_expected integer; v_text text; v_row public.lasar_commands; y public.school_years; v_current public.school_years;
  v_op jsonb; v_detail jsonb; v_envelope jsonb; v_req public.school_year_change_requests; v_new public.school_years;
  v_source text; v_mode text; v_frame public.school_year_frames;
begin
  a := public.lasar_actor(); s := public.phase5_programplan_session_check();
  if input is null or jsonb_typeof(input) <> 'object' or octet_length(input::text) > 65536 then
    raise exception 'Ogiltigt kommando.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  v_kind := case when input ? 'ops' then 'command' when input ? 'action' then 'decision' else null end;
  if v_kind = 'command' then
    perform public.lasar_shape(input, array['commandId', 'target', 'schoolYear', 'versionId', 'expectedRevision', 'ops', 'payloadHash'], array['proposal']);
  elsif v_kind = 'decision' then
    perform public.lasar_shape(input, array['commandId', 'target', 'schoolYear', 'versionId', 'expectedRevision', 'action', 'text', 'mode', 'confirmAffected']);
  else
    raise exception 'Ogiltigt kommando.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  v_request := public.lasar_uuid(input -> 'commandId');
  v_unit := public.lasar_target(input -> 'target');
  v_year := public.lasar_int(input -> 'schoolYear', 2000, 2100);
  v_version := case when input -> 'versionId' = 'null'::jsonb then null else public.lasar_uuid(input -> 'versionId') end;
  v_expected := case when input -> 'expectedRevision' = 'null'::jsonb then null else public.lasar_int(input -> 'expectedRevision', 0, 2147483647) end;
  if v_kind = 'command' then
    if jsonb_typeof(input -> 'ops') <> 'array' or jsonb_array_length(input -> 'ops') not between 1 and 50
       or exists (select 1 from jsonb_array_elements(input -> 'ops') o where jsonb_typeof(o) <> 'object' or jsonb_typeof(o -> 'op') <> 'string')
       or jsonb_typeof(input -> 'payloadHash') <> 'string' or (input ->> 'payloadHash') !~ '^sha256:[0-9a-f]{64}$' then
      raise exception 'Ogiltigt kommando.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    v_action := input #>> '{ops,0,op}';
    q := jsonb_build_object('commandId', v_request,
      'target', case when v_unit is null then jsonb_build_object('kind', 'frame') else jsonb_build_object('kind', 'school', 'unitId', v_unit) end,
      'schoolYear', v_year, 'versionId', v_version, 'expectedRevision', v_expected, 'ops', input -> 'ops', 'payloadHash', input -> 'payloadHash',
      'proposal', input -> 'proposal');
  else
    v_action := input ->> 'action';
    if jsonb_typeof(input -> 'action') <> 'string' or v_action not in ('submit', 'withdraw', 'return', 'approve', 'reopen', 'request_change', 'withdraw_request',
         'decline_request', 'publish_frame', 'preview_mode_change', 'set_mode')
       or not (input -> 'mode' = 'null'::jsonb or input -> 'mode' in ('"ram"'::jsonb, '"eget"'::jsonb))
       or jsonb_typeof(input -> 'confirmAffected') <> 'array' or jsonb_array_length(input -> 'confirmAffected') > 1000 then
      raise exception 'Ogiltigt beslut.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    v_text := public.lasar_text(input -> 'text', 4000, true, true);
    q := jsonb_build_object('commandId', v_request,
      'target', case when v_unit is null then jsonb_build_object('kind', 'frame') else jsonb_build_object('kind', 'school', 'unitId', v_unit) end,
      'schoolYear', v_year, 'versionId', v_version, 'expectedRevision', v_expected, 'action', v_action, 'text', v_text, 'mode', input -> 'mode',
      'confirmAffected', (select coalesce(jsonb_agg(to_jsonb(public.lasar_uuid(c))), '[]') from jsonb_array_elements(input -> 'confirmAffected') c));
  end if;
  -- Skolans mål prövas mot uppdragets skolenheter; ramens mål är huvudmannens (lasar_frame_command).
  if v_unit is not null then
    perform public.lasar_scope(a, v_unit);
  elsif a.function <> 'huvudman' then
    raise exception 'Huvudmannens ram nekas.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_request::text, 5571));
  select * into v_row from public.lasar_commands c where c.command_id = v_request;
  if found then
    -- Exakt återspelning: samma aktör, uppdrag, mål och begäran ger samma svar; allt annat nekas (T-05.1.1-15).
    if (v_row.kind, v_row.customer_id, v_row.organizer_id, v_row.actor_identity_id, v_row.assignment_id, v_row.unit_id, v_row.school_year, v_row.request)
       is distinct from (v_kind, a.customer_id, a.organizer_id, s.identity_id, a.id, v_unit, v_year, q) then
      raise exception 'Kommandot har redan skickats med andra uppgifter.' using errcode = '40001', hint = 'lasar_command_conflict';
    end if;
    return jsonb_set(v_row.envelope, '{result,receipt,replayed}', 'true'::jsonb, false);
  end if;

  if v_kind = 'command' then
    if public.tjanst_hash(jsonb_build_array('lasar_payload_v1', input -> 'ops')) <> input ->> 'payloadHash' then
      raise exception 'Kommandots kontrollsumma stämmer inte.' using errcode = '22023', hint = 'lasar_payload_hash';
    end if;
    if exists (select 1 from jsonb_array_elements(input -> 'ops') o where o ->> 'op' in ('create', 'reset_to_proposal', 'resolve_review',
         'take_frame_changes', 'keep_school_calendar', 'comment')) and jsonb_array_length(input -> 'ops') <> 1 then
      raise exception 'Ett uttryckligt kommando står ensamt.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    if (v_action = 'create') <> (v_version is null) or (v_action = 'create') <> (v_expected is null) then
      raise exception 'Bara create saknar version.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    -- Förslagets innehåll räknas fram i servern och hör bara till create med källan proposal och till reset_to_proposal.
    if (input ? 'proposal') <> ((v_action = 'create' and input #>> '{ops,0,source}' = 'proposal') or v_action = 'reset_to_proposal') then
      raise exception 'Förslaget hör bara till create med källan proposal och reset_to_proposal.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
  end if;
  if v_unit is null then
    return public.lasar_frame_command(a, s, input, q, v_kind, v_action, v_request, v_year, v_version, v_expected, v_text);
  end if;

  if v_kind = 'command' then
    -- Utkastarbetet är skolans: rektor och skoladministratör (D-18). Huvudmannen kommenterar men ändrar inte skolans kalender.
    if a.function not in ('rektor', 'administrator') and v_action <> 'comment' then
      raise exception 'Läsårskalendern nekas.' using errcode = '42501';
    end if;
    if v_action = 'create' then
      perform public.lasar_shape(input #> '{ops,0}', array['op', 'source']);
      v_source := input #>> '{ops,0,source}';
      v_mode := public.lasar_mode(a.organizer_id, v_year);
      v_frame := public.lasar_frame_latest(a.organizer_id, v_year);
      -- D-14: i arbetssättet ram börjar skolan inte, och kopierar inte, förrän ramen är utgiven.
      if v_mode = 'ram' and v_frame.id is null then
        raise exception 'Huvudmannen har inte gett ut ramen.' using errcode = '40001', hint = 'lasar_frame_missing';
      end if;
      if v_source = 'copy' then
        raise exception 'Kopiering av förra läsåret kommer i en senare version.' using errcode = '22023', hint = 'lasar_unsupported';
      end if;
      if v_source is null or v_source not in ('proposal', 'frame') or (v_source = 'proposal') <> (v_mode = 'eget') then
        raise exception 'Startvalet hör inte till arbetssättet.' using errcode = '22023', hint = 'lasar_invalid';
      end if;
      if exists (select 1 from public.school_years x where x.unit_id = v_unit and x.start_year = v_year) then
        raise exception 'Kalendern finns redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
      end if;
      if v_source = 'frame' then
        y := public.lasar_create_from_frame(a, v_unit, v_year, v_frame);
        perform public.lasar_history_add(y.id, 'create_frame', format('Terminer, lov- och studiedagar ur ramens version %s.', v_frame.version));
      else
        y := public.lasar_create_proposal(a, v_unit, v_year, input -> 'proposal');
        perform public.lasar_history_add(y.id, 'create', 'Terminer, helgdagar och vanliga lov föreslagna. Studiedagar läggs ut av rektorn.');
      end if;
    else
      y := public.lasar_lock_version(a, v_unit, v_year, v_version);
      -- En kommentar går att skriva på varje version som inte är ersatt; allt annat bara i ett öppet utkast.
      if y.superseded_by is not null or (v_action <> 'comment' and y.status not in ('utkast', 'atersand')) then
        raise exception 'Kalendern är låst.' using errcode = '40001', hint = 'lasar_locked_status';
      end if;
      if y.revision <> v_expected then
        raise exception 'Kalendern har ändrats.' using errcode = '40001', hint = 'lasar_revision_conflict';
      end if;
      for v_op in select o.value from jsonb_array_elements(input -> 'ops') with ordinality o(value, n) order by o.n loop
        -- D-12: passerade dagar i en ny version nekas innan något skrivs (T-05.1.1-27).
        if v_op ->> 'op' <> 'comment' then perform public.lasar_past_check(y, v_op); end if;
        case v_op ->> 'op'
          when 'set_days' then perform public.lasar_set_days(y, v_op);
          when 'set_notes' then perform public.lasar_set_notes(y, v_op);
          when 'set_term' then y := public.lasar_set_term(y, v_op);
          when 'set_group_days' then perform public.lasar_set_group_days(y, v_op);
          when 'clear_group_days' then perform public.lasar_clear_group_days(y, v_op);
          when 'set_short_week' then perform public.lasar_set_short_week(y, v_op);
          when 'clear_short_week' then perform public.lasar_clear_short_week(y, v_op);
          when 'reset_to_proposal' then
            perform public.lasar_shape(v_op, array['op']);
            y := public.lasar_reset_proposal(y, input -> 'proposal');
            perform public.lasar_history_add(y.id, 'reset_to_proposal', 'Terminer och lov enligt förslaget utifrån helgdagarna.');
          when 'comment' then
            perform public.lasar_shape(v_op, array['op', 'text']);
            v_text := public.lasar_text(v_op -> 'text', 4000, true, true);
            if v_text = '' then raise exception 'Text krävs.' using errcode = '22023', hint = 'lasar_text_required'; end if;
            perform public.lasar_history_add(y.id, 'comment', v_text);
          else raise exception 'Åtgärden finns inte i denna version.' using errcode = '22023', hint = 'lasar_unsupported';
        end case;
      end loop;
      update public.school_years x set revision = x.revision + 1 where x.id = y.id returning * into y;
    end if;
  else
    if v_version is null or v_expected is null or input -> 'mode' <> 'null'::jsonb or jsonb_array_length(input -> 'confirmAffected') <> 0
       or v_action in ('publish_frame', 'preview_mode_change', 'set_mode') then
      raise exception 'Ogiltigt beslut.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    if v_text = '' and v_action in ('submit', 'return', 'approve', 'reopen', 'request_change', 'decline_request') then
      raise exception 'Text krävs.' using errcode = '22023', hint = 'lasar_text_required';
    end if;
    -- D-18: rektor och skoladministratör skickar, tar tillbaka och begär ändring; bara huvudmannen återsänder,
    -- fastställer, öppnar och avslår (T-05.1.1-14, T-05.1.1-19, T-05.1.1-29).
    if (v_action in ('submit', 'withdraw', 'request_change', 'withdraw_request') and a.function not in ('rektor', 'administrator'))
       or (v_action in ('return', 'approve', 'reopen', 'decline_request') and a.function <> 'huvudman') then
      raise exception 'Läsårskalendern nekas.' using errcode = '42501';
    end if;
    y := public.lasar_lock_version(a, v_unit, v_year, v_version);
    -- Ändringsflödet gäller den gällande fastställda versionen; skolans flöde ett öppet eller skickat förslag. Ersatta versioner är låsta.
    if y.superseded_by is not null
       or (v_action in ('request_change', 'withdraw_request', 'decline_request', 'reopen') and y.status <> 'faststalld')
       or (v_action = 'submit' and y.status not in ('utkast', 'atersand'))
       or (v_action in ('withdraw', 'return', 'approve') and y.status <> 'forslag') then
      raise exception 'Kalendern är låst.' using errcode = '40001', hint = 'lasar_locked_status';
    end if;
    if y.revision <> v_expected then
      raise exception 'Kalendern har ändrats.' using errcode = '40001', hint = 'lasar_revision_conflict';
    end if;
    if v_action in ('request_change', 'reopen') and exists (select 1 from public.school_years x where x.unit_id = v_unit and x.start_year = v_year
         and x.status in ('utkast', 'forslag', 'atersand') and x.superseded_by is null) then
      raise exception 'En ny version pågår redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
    end if;
    if v_action in ('withdraw_request', 'decline_request', 'reopen') then
      select * into v_req from public.school_year_change_requests r where r.unit_id = v_unit and r.start_year = v_year and r.status = 'open' for update;
      if v_action <> 'reopen' and (v_req.id is null or v_req.school_year_id <> y.id) then
        raise exception 'Det finns ingen öppen begäran om ändring.' using errcode = '40001', hint = 'lasar_revision_conflict';
      end if;
    end if;
    if v_action in ('submit', 'approve') then perform public.lasar_require_rules(y.id); end if;
    if v_action = 'submit' then
      update public.school_years x set status = 'forslag', revision = x.revision + 1 where x.id = y.id returning * into y;
    elsif v_action = 'withdraw' then
      update public.school_years x set status = 'utkast', revision = x.revision + 1 where x.id = y.id returning * into y;
    elsif v_action = 'return' then
      update public.school_years x set status = 'atersand', revision = x.revision + 1 where x.id = y.id returning * into y;
    elsif v_action = 'approve' then
      -- Pitfall 5: den tidigare gällande versionen ersätts före fastställandet, så att indexet för gällande version håller.
      v_current := public.lasar_current(v_unit, v_year);
      if v_current.id is not null and v_current.id <> y.id then
        update public.school_years x set superseded_at = clock_timestamp(), superseded_by = y.id where x.id = v_current.id;
      end if;
      update public.school_years x set status = 'faststalld', decided_on = public.app_today(), decision_comment = v_text,
        content_hash = public.lasar_content_hash(x.id), revision = x.revision + 1
       where x.id = y.id returning * into y;
    elsif v_action = 'request_change' then
      begin
        insert into public.school_year_change_requests (school_year_id, unit_id, start_year, reason, requested_by_assignment)
        values (y.id, y.unit_id, y.start_year, v_text, a.id);
      exception when unique_violation then
        raise exception 'Det finns redan en öppen begäran om ändring.' using errcode = '40001', hint = 'lasar_revision_conflict';
      end;
      update public.school_years x set revision = x.revision + 1 where x.id = y.id returning * into y;
    elsif v_action in ('withdraw_request', 'decline_request') then
      update public.school_year_change_requests r set status = case when v_action = 'decline_request' then 'declined' else 'withdrawn' end,
        answer = nullif(v_text, ''), answered_by_assignment = a.id, answered_at = clock_timestamp() where r.id = v_req.id;
      update public.school_years x set revision = x.revision + 1 where x.id = y.id returning * into y;
    else
      -- reopen: den gällande versionen gäller tills den nya är fastställd; en öppen begäran besvaras med öppningen.
      v_new := public.lasar_reopen(y, v_text);
      if v_req.id is not null then
        update public.school_year_change_requests r set status = 'accepted', answer = v_text, answered_by_assignment = a.id,
          answered_at = clock_timestamp(), opened_version_id = v_new.id where r.id = v_req.id;
      end if;
      update public.school_years x set revision = x.revision + 1 where x.id = y.id;
      y := v_new;
    end if;
    perform public.lasar_history_add(y.id, v_action, case when v_action = 'withdraw' and v_text = '' then 'Förslaget togs tillbaka för fortsatt arbete.'
      when v_action = 'withdraw_request' and v_text = '' then 'Begäran om ändring togs tillbaka.' else v_text end);
  end if;
  v_detail := public.lasar_detail(a, v_unit, v_year, y.id);
  v_envelope := jsonb_build_object('contractVersion', 'lasar_sql_v1', 'actor', jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id),
    'result', jsonb_build_object('receipt', jsonb_build_object('commandId', v_request, 'revision', y.revision, 'replayed', false), 'detail', v_detail));
  insert into public.lasar_commands (command_id, kind, action, customer_id, organizer_id, unit_id, school_year, school_year_id, actor_identity_id, assignment_id, request, envelope)
  values (v_request, v_kind, v_action, a.customer_id, a.organizer_id, v_unit, v_year, y.id, s.identity_id, a.id, q, v_envelope);
  perform public.lasar_audit(case when v_kind = 'command' then 'lasar_command' else 'lasar_decision' end, 'school_year', y.id,
    jsonb_build_object('commandId', v_request, 'action', v_action, 'revision', y.revision, 'version', y.version, 'unitId', v_unit, 'schoolYear', v_year));
  return v_envelope;
end $$;

-- Som 20261111100000 plus målet ramen: bara huvudmannen, och bara sitt eget kommando hos samma huvudman.
create or replace function public.lasar_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions; v_request uuid; v_unit uuid; v_year integer; v_row public.lasar_commands; v_result jsonb;
begin
  a := public.lasar_actor(); s := public.phase5_programplan_session_check();
  if input is null or octet_length(input::text) > 65536 then
    raise exception 'Ogiltig statusläsning.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  perform public.lasar_shape(input, array['commandId', 'target', 'schoolYear']);
  v_request := public.lasar_uuid(input -> 'commandId');
  v_unit := public.lasar_target(input -> 'target');
  v_year := public.lasar_int(input -> 'schoolYear', 2000, 2100);
  if v_unit is not null then
    perform public.lasar_scope(a, v_unit);
  elsif a.function <> 'huvudman' then
    raise exception 'Huvudmannens ram nekas.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_request::text, 5571));
  select * into v_row from public.lasar_commands c where c.command_id = v_request;
  if not found then
    v_result := jsonb_build_object('state', 'not_found', 'result', null);
  else
    if (v_row.customer_id, v_row.organizer_id, v_row.actor_identity_id, v_row.assignment_id, v_row.unit_id, v_row.school_year)
       is distinct from (a.customer_id, a.organizer_id, s.identity_id, a.id, v_unit, v_year) then
      raise exception 'Kommandot hör till någon annan.' using errcode = '40001', hint = 'lasar_command_conflict';
    end if;
    v_result := jsonb_build_object('state', 'completed', 'result', jsonb_set(v_row.envelope -> 'result', '{receipt,replayed}', 'true'::jsonb, false));
  end if;
  perform public.lasar_audit('lasar_status', case when v_unit is null then 'school_year_frame' else 'school_year' end, coalesce(v_row.school_year_id, v_row.frame_id),
    jsonb_build_object('commandId', v_request, 'unitId', v_unit, 'schoolYear', v_year));
  return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'actor', jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id), 'result', v_result);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Stängt: inga rättigheter för Worker eller klientroller
-- ---------------------------------------------------------------------------
revoke all on function public.lasar_frame_guard(), public.lasar_frame_days_guard(), public.lasar_frame_events_guard(), public.lasar_school_frame_guard(),
  public.lasar_mode(uuid, integer), public.lasar_mode_locked(integer), public.lasar_frame_latest(uuid, integer), public.lasar_organizer_types(uuid),
  public.lasar_frame_day_editable(public.school_year_frames, date), public.lasar_frame_terms_json(public.school_year_frames),
  public.lasar_frame_exceptions_json(uuid), public.lasar_frame_content_hash(uuid), public.lasar_frame_ref(uuid), public.lasar_frame_event(uuid, text, text),
  public.lasar_frame_history(public.school_year_frames), public.lasar_frame_calendar_json(public.school_year_frames),
  public.lasar_frame_detail(public.access_assignments, integer, uuid), public.lasar_frame_days_from(public.school_year_frames, jsonb),
  public.lasar_frame_terms_from(jsonb), public.lasar_frame_create_proposal(public.access_assignments, integer, jsonb),
  public.lasar_frame_new_version(public.access_assignments, public.school_year_frames), public.lasar_frame_lock(public.access_assignments, integer, uuid),
  public.lasar_frame_set_days(public.school_year_frames, jsonb), public.lasar_frame_set_notes(public.school_year_frames, jsonb),
  public.lasar_frame_set_term(public.school_year_frames, jsonb), public.lasar_frame_reset(public.school_year_frames, jsonb),
  public.lasar_mode_affected(uuid, integer),
  public.lasar_frame_command(public.access_assignments, public.app_sessions, jsonb, jsonb, text, text, uuid, integer, uuid, integer, text),
  public.lasar_create_from_frame(public.access_assignments, uuid, integer, public.school_year_frames)
  from public, anon, authenticated, service_role, skolplattform_worker;
