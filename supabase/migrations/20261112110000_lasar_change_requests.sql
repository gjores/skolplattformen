-- 05.1.1-09 (D-10, D-11, D-12, D-16, LASAR-02, LASAR-05): en fastställd kalender ändras bara genom en ny version.
-- Rektor eller skoladministratör begär ändring med orsak; huvudmannen öppnar kalendern som en ny version eller avslår med
-- motivering; skolan kan ta tillbaka sin begäran. Begäran och svaret står kvar i school_year_change_requests och i historiken.
-- Den tidigare fastställda versionen gäller tills den nya är fastställd; vid fastställandet ersätts den först (Pitfall 5).
-- När läsåret har börjat (app_today() från och med 1 augusti, användarbeslut 2026-11-10) är dagar före app_today() låsta i en
-- ny version: kommandot nekar dem och skyddstriggrarna nekar varje ändring som skiljer en passerad dag, en passerad terminskant
-- eller en kort vecka (efter terminsstarten) från föregående version (lasar_past_day).
--
-- Bygger på 20261111100000_lasar_versions.sql och 20261111190000_lasar_worker_access.sql (installerade på det skyddade lokala
-- målet och låsta) och 20261112100000_lasar_groups.sql. Funktionerna ändras här med create or replace. Ingen ny Worker-ingång:
-- besluten går genom lasar_command och läsningen genom lasar_read, vars rättigheter består. Inga rättigheter ges i denna fil.
--
-- SS 12000 (SIS OpenAPI 2.1.0, som anger SS12000:2020): versioner och ändringsbegäran är intern beslutshantering utanför
-- standarden och exporteras inte. Skolenheten (Organisation, organisationType=Skolenhet) och grupperna (klass = Group med
-- groupType=Klass) behåller sina stabila ID:n i varje version; ingen rad nycklas om. Ingen standardefterlevnad påstås.

-- ---------------------------------------------------------------------------
-- 1. Ändringsbegäran
-- ---------------------------------------------------------------------------
-- Nyckel för begärans koppling till versionens skolenhet och läsår.
alter table public.school_years add constraint school_years_id_unit_year_key unique (id, unit_id, start_year);

create table public.school_year_change_requests (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid not null,
  unit_id uuid not null references public.school_units (id),
  start_year integer not null check (start_year between 2000 and 2100),
  status text not null default 'open' check (status in ('open', 'declined', 'withdrawn', 'accepted')),
  reason text not null check (char_length(reason) between 1 and 4000),
  answer text check (answer is null or char_length(answer) between 1 and 4000),
  requested_by_assignment uuid not null references public.access_assignments (id),
  answered_by_assignment uuid references public.access_assignments (id),
  requested_at timestamptz not null default clock_timestamp(),
  answered_at timestamptz,
  opened_version_id uuid references public.school_years (id),
  foreign key (school_year_id, unit_id, start_year) references public.school_years (id, unit_id, start_year),
  constraint school_year_change_requests_answered check ((status = 'open') = (answered_at is null) and (status = 'open') = (answered_by_assignment is null)),
  constraint school_year_change_requests_declined check (status <> 'declined' or answer is not null),
  constraint school_year_change_requests_opened check ((status = 'accepted') = (opened_version_id is not null))
);
-- En öppen begäran per skolenhet och läsår.
create unique index school_year_change_requests_one_open on public.school_year_change_requests (unit_id, start_year) where status = 'open';
create index school_year_change_requests_year_idx on public.school_year_change_requests (unit_id, start_year, requested_at desc);
alter table public.school_year_change_requests enable row level security;
alter table public.school_year_change_requests force row level security;
revoke all on public.school_year_change_requests from public, anon, authenticated, service_role, skolplattform_worker;

-- Begäran och svaret står kvar (T-05.1.1-30): ingen radering, och en besvarad begäran ändras inte. En öppen begäran får bara
-- ett svar; orsaken, versionen och den som begärde ändras aldrig.
create function public.lasar_change_request_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'En begäran om ändring tas inte bort.';
  end if;
  if old.status <> 'open' or new.status = 'open'
     or (new.id, new.school_year_id, new.unit_id, new.start_year, new.reason, new.requested_by_assignment, new.requested_at)
        is distinct from (old.id, old.school_year_id, old.unit_id, old.start_year, old.reason, old.requested_by_assignment, old.requested_at) then
    raise exception 'En besvarad begäran om ändring ändras inte.';
  end if;
  return new;
end $$;
create trigger school_year_change_requests_guard before update or delete on public.school_year_change_requests
  for each row execute function public.lasar_change_request_guard();
create trigger school_year_change_requests_no_truncate before truncate on public.school_year_change_requests
  for each statement execute function public.lasar_change_request_guard();

-- ---------------------------------------------------------------------------
-- 2. Låsta passerade dagar (D-12)
-- ---------------------------------------------------------------------------
-- Första dag som går att ändra: dagens datum när versionen har en föregående version och läsåret har börjat
-- (app_today() från och med 1 augusti, samma gräns som plan 10), annars null. Version 1 har inga låsta dagar.
create function public.lasar_editable_from(y public.school_years) returns date
language sql stable set search_path = pg_catalog, public as $$
  select case when y.previous_id is not null and public.app_today() >= make_date(y.start_year, 8, 1) then public.app_today() end
$$;

-- Jämförelse med föregående version för en rad i en dag-, gruppdags- eller kortveckotabell. present: raden finns med exakt samma
-- innehåll i föregående version. Annars: föregående version saknar rad på samma nyckel (dag, grupp och dag eller grupp).
create function public.lasar_past_state_ok(tbl text, prev uuid, rec jsonb, present boolean) returns boolean
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if prev is null or rec is null then return false; end if;
  if tbl = 'school_year_days' then
    if present then
      return exists (select 1 from public.school_year_days d where d.school_year_id = prev and d.day = (rec ->> 'day')::date
        and d.kind::text = rec ->> 'kind' and d.note is not distinct from rec ->> 'note');
    end if;
    return not exists (select 1 from public.school_year_days d where d.school_year_id = prev and d.day = (rec ->> 'day')::date);
  elsif tbl = 'school_year_group_days' then
    if present then
      return exists (select 1 from public.school_year_group_days g where g.school_year_id = prev and g.day = (rec ->> 'day')::date
        and g.scope is not distinct from rec ->> 'scope' and g.offering_id is not distinct from (rec ->> 'offering_id')::uuid
        and g.column_id is not distinct from rec ->> 'column_id' and g.class_id is not distinct from (rec ->> 'class_id')::uuid
        and g.cause::text = rec ->> 'cause' and g.note is not distinct from rec ->> 'note');
    end if;
    return not exists (select 1 from public.school_year_group_days g where g.school_year_id = prev and g.day = (rec ->> 'day')::date
      and g.scope is not distinct from rec ->> 'scope' and g.offering_id is not distinct from (rec ->> 'offering_id')::uuid
      and g.column_id is not distinct from rec ->> 'column_id' and g.class_id is not distinct from (rec ->> 'class_id')::uuid);
  elsif tbl = 'school_year_short_weeks' then
    if present then
      return exists (select 1 from public.school_year_short_weeks w where w.school_year_id = prev
        and w.scope is not distinct from rec ->> 'scope' and w.offering_id is not distinct from (rec ->> 'offering_id')::uuid
        and w.class_id is not distinct from (rec ->> 'class_id')::uuid
        and w.column_id = rec ->> 'column_id' and w.weekday = (rec ->> 'weekday')::smallint and w.reason = rec ->> 'reason');
    end if;
    return not exists (select 1 from public.school_year_short_weeks w where w.school_year_id = prev
      and w.scope is not distinct from rec ->> 'scope' and w.offering_id is not distinct from (rec ->> 'offering_id')::uuid
      and w.class_id is not distinct from (rec ->> 'class_id')::uuid);
  end if;
  return false;
end $$;

-- Som 20261112100000, plus D-12 för en version med föregående version: en terminskant som är eller blir passerad måste vara
-- densamma som i föregående version (T-05.1.1-27). Övriga skydd är oförändrade.
create or replace function public.guard_decided_school_year()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare v_from date; p public.school_years;
begin
  if public.lasar_group_migration_active() and old.status = 'faststalld' and old.content_hash is null and new.content_hash is not null
     and (to_jsonb(new) - 'content_hash' - 'updated_at') = (to_jsonb(old) - 'content_hash' - 'updated_at') then
    return new;
  end if;
  if old.superseded_by is not null then
    raise exception 'En ersatt kalenderversion ändras inte.';
  end if;
  if (new.organizer_id, new.unit_id, new.start_year, new.version, new.previous_id)
     is distinct from (old.organizer_id, old.unit_id, old.start_year, old.version, old.previous_id) then
    raise exception 'Kalenderversionens skolenhet, läsår och version ändras inte.';
  end if;
  if old.status in ('forslag', 'faststalld')
     and (new.ht_start, new.ht_end, new.vt_start, new.vt_end)
         is distinct from (old.ht_start, old.ht_end, old.vt_start, old.vt_end) then
    raise exception 'Ett skickat eller fastställt läsår ändras inte. Ta tillbaka förslaget eller begär en ny version.';
  end if;
  if old.content_hash is not null and new.content_hash is distinct from old.content_hash then
    raise exception 'En fastställd versions kontrollsumma ändras inte.';
  end if;
  if (new.ht_start, new.ht_end, new.vt_start, new.vt_end) is distinct from (old.ht_start, old.ht_end, old.vt_start, old.vt_end) then
    v_from := public.lasar_editable_from(new);
    if v_from is not null then
      select * into p from public.school_years s where s.id = new.previous_id;
      if (new.ht_start <> old.ht_start and new.ht_start is distinct from p.ht_start and (new.ht_start < v_from or p.ht_start < v_from))
         or (new.ht_end <> old.ht_end and new.ht_end is distinct from p.ht_end and (new.ht_end < v_from or p.ht_end < v_from))
         or (new.vt_start <> old.vt_start and new.vt_start is distinct from p.vt_start and (new.vt_start < v_from or p.vt_start < v_from))
         or (new.vt_end <> old.vt_end and new.vt_end is distinct from p.vt_end and (new.vt_end < v_from or p.vt_end < v_from)) then
        raise exception 'Passerade dagar kan inte ändras.' using errcode = '40001', hint = 'lasar_past_day';
      end if;
    end if;
  end if;
  return new;
end $$;

-- Som 20261112100000, plus D-12 för en version med föregående version: efter ändringen ska varje passerad dag (lov- och
-- studiedagar och gruppdagar) vara som i föregående version, och en kort vecka ändras inte när terminen har börjat, eftersom
-- den gäller hela läsåret. Kopian vid öppning för ändring går igenom, eftersom raderna är identiska.
create or replace function public.guard_school_year_days()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  current_status public.school_year_status;
  replaced uuid;
  year_id uuid;
  refs text[];
  y public.school_years;
  v_from date;
  v_new jsonb;
  v_old jsonb;
  v_keys text[];
  v_moved boolean;
begin
  if tg_op = 'UPDATE' and tg_table_name in ('school_year_group_days', 'school_year_short_weeks') and public.lasar_group_migration_active() then
    refs := case when tg_table_name = 'school_year_group_days' then array['scope', 'offering_id', 'column_id', 'class_id', 'group_ref']
                 else array['scope', 'offering_id', 'class_id', 'group_ref'] end;
    if (to_jsonb(old) ->> 'scope') is null and (to_jsonb(new) - refs) = (to_jsonb(old) - refs) then
      return new;
    end if;
  end if;
  year_id := coalesce(new.school_year_id, old.school_year_id);
  select y0.status, y0.superseded_by into current_status, replaced from public.school_years y0 where y0.id = year_id;
  if current_status in ('forslag', 'faststalld') or replaced is not null then
    raise exception 'Dagarna i ett skickat, fastställt eller ersatt läsår ändras inte.';
  end if;
  select * into y from public.school_years y1 where y1.id = year_id;
  v_from := public.lasar_editable_from(y);
  if v_from is not null then
    v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
    v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
    v_keys := case tg_table_name when 'school_year_days' then array['day'] when 'school_year_group_days' then array['scope', 'offering_id', 'column_id', 'class_id', 'day']
                else array['scope', 'offering_id', 'class_id'] end;
    v_moved := tg_op = 'DELETE' or (tg_op = 'UPDATE' and (select jsonb_agg(v_old -> k order by k) from unnest(v_keys) k)
      is distinct from (select jsonb_agg(v_new -> k order by k) from unnest(v_keys) k));
    if tg_table_name = 'school_year_short_weeks' then
      if v_from > y.ht_start and ((v_new is not null and not public.lasar_past_state_ok(tg_table_name, y.previous_id, v_new, true))
         or (v_moved and not public.lasar_past_state_ok(tg_table_name, y.previous_id, v_old, false))) then
        raise exception 'Passerade dagar kan inte ändras.' using errcode = '40001', hint = 'lasar_past_day';
      end if;
    elsif (v_new is not null and (v_new ->> 'day')::date < v_from and not public.lasar_past_state_ok(tg_table_name, y.previous_id, v_new, true))
       or (v_moved and (v_old ->> 'day')::date < v_from and not public.lasar_past_state_ok(tg_table_name, y.previous_id, v_old, false)) then
      raise exception 'Passerade dagar kan inte ändras.' using errcode = '40001', hint = 'lasar_past_day';
    end if;
  end if;
  return coalesce(new, old);
end $$;

-- Kommandots förkontroll (D-12): en åtgärd som rör en dag före editableFrom, en passerad terminskant, en kort vecka efter
-- terminsstarten eller återställning efter terminsstarten nekas med lasar_past_day innan något skrivs. Ogiltiga indata prövas
-- av åtgärden själv (lasar_invalid).
create function public.lasar_past_check(y public.school_years, op jsonb) returns void
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_from date := public.lasar_editable_from(y); v_old date; v_new date;
begin
  if v_from is null then return; end if;
  if op ->> 'op' in ('set_days', 'set_notes', 'set_group_days', 'clear_group_days') then
    if jsonb_typeof(op -> 'dates') = 'array' and exists (select 1 from jsonb_array_elements(op -> 'dates') e where public.lasar_date(e) < v_from) then
      raise exception 'Passerade dagar kan inte ändras.' using errcode = '40001', hint = 'lasar_past_day';
    end if;
  elsif op ->> 'op' = 'set_term' then
    v_old := case (op ->> 'term') || ':' || (op ->> 'edge') when 'ht:start' then y.ht_start when 'ht:end' then y.ht_end
      when 'vt:start' then y.vt_start when 'vt:end' then y.vt_end end;
    v_new := case when op ? 'date' then public.lasar_date(op -> 'date') end;
    if v_old is not null and (v_old < v_from or v_new < v_from) then
      raise exception 'Passerade dagar kan inte ändras.' using errcode = '40001', hint = 'lasar_past_day';
    end if;
  elsif op ->> 'op' in ('set_short_week', 'clear_short_week', 'reset_to_proposal') and v_from > y.ht_start then
    raise exception 'Passerade dagar kan inte ändras.' using errcode = '40001', hint = 'lasar_past_day';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Historik (A-16) med begäran, återtagande, avslag och öppning
-- ---------------------------------------------------------------------------
create or replace function public.lasar_history_add(version_id uuid, action text, comment text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
begin
  if action not in ('create', 'reset_to_proposal', 'comment', 'submit', 'withdraw', 'return', 'approve', 'request_change', 'withdraw_request',
       'decline_request', 'reopen') then
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
        when 'lasar_reopen' then 'Öppnat för ändring' end,
      'comment', e.comment, 'version', v.version) entry
    from public.school_year_events e
    join public.school_years v on v.id = e.school_year_id
    left join public.identities i on i.id = e.actor_identity_id
    where v.unit_id = y.unit_id and v.start_year = y.start_year and v.organizer_id = y.organizer_id and v.version <= y.version
      and e.actor_identity_id is not null and e.actor_role in ('huvudman', 'rektor', 'administrator')
      and e.action in ('lasar_create', 'lasar_reset_to_proposal', 'lasar_comment', 'lasar_submit', 'lasar_withdraw', 'lasar_return', 'lasar_approve',
        'lasar_request_change', 'lasar_withdraw_request', 'lasar_decline_request', 'lasar_reopen')
    order by e.created_at desc, e.id desc limit 500) h
$$;

-- ---------------------------------------------------------------------------
-- 4. Läsningen: förmågor, editableFrom och senaste begäran
-- ---------------------------------------------------------------------------
-- Den senaste begäran för skolenhetens läsår i kontraktets form (LasarChangeRequest), eller null.
create function public.lasar_change_request_json(unit uuid, year integer) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select (select jsonb_build_object('id', r.id, 'status', r.status, 'reason', r.reason, 'answer', r.answer,
      'requestedAt', to_char(r.requested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'answeredAt', to_char(r.answered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    from public.school_year_change_requests r where r.unit_id = unit and r.start_year = year
    order by r.requested_at desc, r.id desc limit 1)
$$;

-- Som 20261112100000 med ändringsflödets förmågor (D-10, D-16, D-18): på den gällande fastställda versionen begär rektor och
-- skoladministratör ändring när ingen begäran är öppen och ingen ny version pågår, och tar tillbaka en öppen begäran;
-- huvudmannen avslår en öppen begäran och öppnar för ändring när ingen ny version pågår. editableFrom enligt D-12.
create or replace function public.lasar_detail(a public.access_assignments, unit uuid, year integer, version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_unit public.school_units; v_year public.school_years; v_versions jsonb; v_types jsonb; v_school boolean := a.function in ('rektor', 'administrator');
  v_open boolean; v_sent boolean; v_caps jsonb; v_groups jsonb; v_current boolean; v_pending boolean; v_requested boolean;
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
    'canCreate', case when v_school and jsonb_array_length(v_versions) = 0 then '["proposal"]'::jsonb else '[]'::jsonb end,
    'canPublishFrame', false, 'canSetMode', false);
  return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'target', jsonb_build_object('kind', 'school', 'unitId', unit), 'schoolYear', year,
    'schoolName', left(btrim(v_unit.name), 200), 'schoolTypes', v_types, 'mode', 'eget', 'modeLocked', false, 'versions', v_versions,
    'calendar', case when v_year.id is null then null else public.lasar_calendar_json(v_year) end,
    'capabilities', v_caps, 'editableFrom', case when v_year.id is null then null else public.lasar_editable_from(v_year) end,
    'changeRequest', public.lasar_change_request_json(unit, year), 'review', '[]'::jsonb, 'frame', null, 'groups', v_groups,
    'teaching', public.lasar_teaching(unit, year),
    'previousYearAvailable', (public.lasar_current(unit, year - 1)).id is not null);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Öppna för ändring: ny version med samma innehåll
-- ---------------------------------------------------------------------------
-- Version n+1 som utkast med previous_id = n, ändringsorsaken och samma terminer, lov- och studiedagar, gruppdagar och korta
-- veckor. Grupperna kopieras med sina stabila referenser (LASAR-04); ingen rad nycklas om. Den gällande versionen rörs inte.
create function public.lasar_reopen(y public.school_years, reason text) returns public.school_years
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_new public.school_years;
begin
  begin
    insert into public.school_years (organizer_id, unit_id, start_year, ht_start, ht_end, vt_start, vt_end, status, version, revision, previous_id, change_reason)
    values (y.organizer_id, y.unit_id, y.start_year, y.ht_start, y.ht_end, y.vt_start, y.vt_end, 'utkast',
      (select max(s.version) + 1 from public.school_years s where s.unit_id = y.unit_id and s.start_year = y.start_year), 1, y.id, reason)
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
-- 6. Kommandon och beslut
-- ---------------------------------------------------------------------------
-- Som 20261112100000 plus D-12 (lasar_past_check före varje åtgärd i en ny version) och besluten request_change,
-- withdraw_request, decline_request och reopen (D-10, D-16, D-18). Begäran, återtagande och avslag höjer den fastställda
-- versionens revision; öppningen ger den nya versionen i svaret. Fastställandet ersätter den gällande versionen först
-- (Pitfall 5). Övriga åtgärder ger lasar_unsupported.
create or replace function public.lasar_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions; q jsonb; v_kind text; v_action text; v_request uuid; v_unit uuid; v_year integer;
  v_version uuid; v_expected integer; v_text text; v_row public.lasar_commands; y public.school_years; v_current public.school_years;
  v_op jsonb; v_detail jsonb; v_envelope jsonb; v_req public.school_year_change_requests; v_new public.school_years;
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
    q := jsonb_build_object('commandId', v_request, 'target', jsonb_build_object('kind', 'school', 'unitId', v_unit), 'schoolYear', v_year,
      'versionId', v_version, 'expectedRevision', v_expected, 'ops', input -> 'ops', 'payloadHash', input -> 'payloadHash', 'proposal', input -> 'proposal');
  else
    v_action := input ->> 'action';
    if jsonb_typeof(input -> 'action') <> 'string' or v_action not in ('submit', 'withdraw', 'return', 'approve', 'reopen', 'request_change', 'withdraw_request',
         'decline_request', 'publish_frame', 'preview_mode_change', 'set_mode')
       or not (input -> 'mode' = 'null'::jsonb or input -> 'mode' in ('"ram"'::jsonb, '"eget"'::jsonb))
       or jsonb_typeof(input -> 'confirmAffected') <> 'array' or jsonb_array_length(input -> 'confirmAffected') > 1000 then
      raise exception 'Ogiltigt beslut.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    v_text := public.lasar_text(input -> 'text', 4000, true, true);
    q := jsonb_build_object('commandId', v_request, 'target', jsonb_build_object('kind', 'school', 'unitId', v_unit), 'schoolYear', v_year,
      'versionId', v_version, 'expectedRevision', v_expected, 'action', v_action, 'text', v_text, 'mode', input -> 'mode',
      'confirmAffected', (select coalesce(jsonb_agg(to_jsonb(public.lasar_uuid(c))), '[]') from jsonb_array_elements(input -> 'confirmAffected') c));
  end if;
  perform public.lasar_scope(a, v_unit);
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
    -- Förslagets innehåll räknas fram i servern och hör bara till create och reset_to_proposal.
    if (input ? 'proposal') <> (v_action in ('create', 'reset_to_proposal')) then
      raise exception 'Förslaget hör bara till create och reset_to_proposal.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    -- Utkastarbetet är skolans: rektor och skoladministratör (D-18). Huvudmannen kommenterar men ändrar inte skolans kalender.
    if a.function not in ('rektor', 'administrator') and v_action <> 'comment' then
      raise exception 'Läsårskalendern nekas.' using errcode = '42501';
    end if;
    if v_action = 'create' then
      perform public.lasar_shape(input #> '{ops,0}', array['op', 'source']);
      if input #>> '{ops,0,source}' is distinct from 'proposal' then
        raise exception 'Bara förslaget finns i denna version.' using errcode = '22023', hint = 'lasar_unsupported';
      end if;
      if exists (select 1 from public.school_years x where x.unit_id = v_unit and x.start_year = v_year) then
        raise exception 'Kalendern finns redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
      end if;
      y := public.lasar_create_proposal(a, v_unit, v_year, input -> 'proposal');
      perform public.lasar_history_add(y.id, 'create', 'Terminer, helgdagar och vanliga lov föreslagna. Studiedagar läggs ut av rektorn.');
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
    if v_version is null or v_expected is null or input -> 'mode' <> 'null'::jsonb or jsonb_array_length(input -> 'confirmAffected') <> 0 then
      raise exception 'Ogiltigt beslut.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    if v_text = '' and v_action in ('submit', 'return', 'approve', 'reopen', 'request_change', 'decline_request') then
      raise exception 'Text krävs.' using errcode = '22023', hint = 'lasar_text_required';
    end if;
    -- D-18: rektor och skoladministratör skickar, tar tillbaka och begär ändring; bara huvudmannen återsänder,
    -- fastställer, öppnar, avslår och styr ramen (T-05.1.1-14, T-05.1.1-19, T-05.1.1-29).
    if (v_action in ('submit', 'withdraw', 'request_change', 'withdraw_request') and a.function not in ('rektor', 'administrator'))
       or (v_action in ('return', 'approve', 'reopen', 'decline_request', 'publish_frame', 'preview_mode_change', 'set_mode') and a.function <> 'huvudman') then
      raise exception 'Läsårskalendern nekas.' using errcode = '42501';
    end if;
    if v_action not in ('submit', 'withdraw', 'return', 'approve', 'request_change', 'withdraw_request', 'decline_request', 'reopen') then
      raise exception 'Beslutet finns inte i denna version.' using errcode = '22023', hint = 'lasar_unsupported';
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

-- ---------------------------------------------------------------------------
-- 7. Stängt: inga rättigheter för Worker eller klientroller
-- ---------------------------------------------------------------------------
revoke all on function public.lasar_change_request_guard(), public.lasar_editable_from(public.school_years),
  public.lasar_past_state_ok(text, uuid, jsonb, boolean), public.lasar_past_check(public.school_years, jsonb),
  public.lasar_change_request_json(uuid, integer), public.lasar_reopen(public.school_years, text)
  from public, anon, authenticated, service_role, skolplattform_worker;
