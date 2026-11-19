-- Nationella prov i Förbered. En versionskedja per skolenhet och läsår, med den senaste revisionen som gällande planeringsunderlag.
-- SS 12000 2.1: lokalt planeringsdokument. Stabila referenser till skolenhet, klass, undervisningsgrupp, sal och personal bevaras.
create table public.nationella_prov_revisions (
  unit_id uuid not null,
  school_year integer not null check (school_year between 2000 and 2100),
  customer_id uuid not null references public.customers(id),
  organizer_id uuid not null,
  revision integer not null check (revision > 0),
  command_id uuid not null unique,
  expected_revision integer not null check (expected_revision >= 0 and expected_revision = revision - 1),
  document jsonb not null check (jsonb_typeof(document) = 'object' and octet_length(document::text) <= 262144),
  actor_identity_id uuid not null references public.identities(id),
  assignment_id uuid not null references public.access_assignments(id),
  saved_at timestamptz not null,
  primary key (unit_id, school_year, revision),
  foreign key (organizer_id, customer_id) references public.organizers(id, customer_id),
  foreign key (unit_id, organizer_id) references public.school_units(id, organizer_id)
);

alter table public.nationella_prov_revisions enable row level security;
alter table public.nationella_prov_revisions force row level security;
revoke all on public.nationella_prov_revisions from public, anon, authenticated, service_role, skolplattform_worker;

create function public.nationella_prov_immutable() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'National exam plan history is immutable' using errcode = '55000';
end $$;

create trigger nationella_prov_revisions_immutable before update or delete on public.nationella_prov_revisions
for each row execute function public.nationella_prov_immutable();

create function public.nationella_prov_uuid(value jsonb) returns boolean
language sql immutable set search_path = pg_catalog, public as $$
  select coalesce(jsonb_typeof(value) = 'string'
    and (value #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false)
$$;

create function public.nationella_prov_keys(value jsonb, keys text[]) returns boolean
language sql immutable set search_path = pg_catalog, public as $$
  select case when jsonb_typeof(value) = 'object' then value ?& keys and (value - keys) = '{}'::jsonb else false end
$$;

create function public.nationella_prov_date(value jsonb) returns date
language plpgsql immutable set search_path = pg_catalog, public as $$
declare result date;
begin
  if jsonb_typeof(value) is distinct from 'string' or (value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;
  result := (value #>> '{}')::date;
  if to_char(result, 'YYYY-MM-DD') is distinct from (value #>> '{}') then return null; end if;
  return result;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $$;

create function public.nationella_prov_valid(doc jsonb, school_year integer) returns boolean
language plpgsql immutable set search_path = pg_catalog, public as $$
declare
  b jsonb;
  vakter jsonb;
  datum date;
  kontrollerad date;
  start_min integer;
  slut_min integer;
  namn text;
  undervisning text;
  -- Samma yttre blanktecken som String.trim() i webbens kontrakt.
  blanktecken constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if not public.nationella_prov_keys(doc, array['granskad', 'bokningar']) or octet_length(doc::text) > 262144
    or jsonb_typeof(doc -> 'granskad') <> 'boolean' or jsonb_typeof(doc -> 'bokningar') <> 'array' then
    return false;
  end if;
  if jsonb_array_length(doc -> 'bokningar') > 200 then return false; end if;

  for b in select value from jsonb_array_elements(doc -> 'bokningar') loop
    if not public.nationella_prov_keys(b, array['id', 'namn', 'undervisning', 'mal', 'datum', 'startMin', 'slutMin', 'tidsval', 'salId', 'vakter', 'kontrolleradDatum'])
      or not public.nationella_prov_uuid(b -> 'id')
      or not public.nationella_prov_keys(b -> 'mal', array['slag', 'ref'])
      or b -> 'mal' -> 'slag' not in ('"klass"'::jsonb, '"grupp"'::jsonb)
      or not public.nationella_prov_uuid(b -> 'mal' -> 'ref')
      or jsonb_typeof(b -> 'namn') <> 'string'
      or jsonb_typeof(b -> 'undervisning') <> 'string'
      or b -> 'tidsval' not in ('"fast"'::jsonb, '"period"'::jsonb)
      or (b -> 'salId' <> 'null'::jsonb and (jsonb_typeof(b -> 'salId') <> 'string' or (b ->> 'salId') !~ '^sal-[1-9][0-9]{0,8}$'))
      or jsonb_typeof(b -> 'vakter') <> 'array'
      or not coalesce(public.phase5_programplan_integer(b -> 'startMin', 0, 1440), false)
      or not coalesce(public.phase5_programplan_integer(b -> 'slutMin', 0, 1440), false) then
      return false;
    end if;

    namn := b ->> 'namn';
    undervisning := b ->> 'undervisning';
    datum := public.nationella_prov_date(b -> 'datum');
    kontrollerad := public.nationella_prov_date(b -> 'kontrolleradDatum');
    start_min := ((b ->> 'startMin')::numeric)::integer;
    slut_min := ((b ->> 'slutMin')::numeric)::integer;
    vakter := b -> 'vakter';
    if namn <> btrim(namn, blanktecken) or length(namn) not between 1 and 160 or namn ~ U&'[\0001-\001F\007F-\009F]'
      or undervisning <> btrim(undervisning, blanktecken) or length(undervisning) > 500
      or undervisning !~ U&'^(undervisning|samlasning):[^\0001-\001F\007F-\009F]+$'
      or datum is null or datum not between make_date(school_year, 7, 1) and make_date(school_year + 1, 6, 30)
      or extract(isodow from datum) > 5
      or kontrollerad is null or kontrollerad not between date '2000-01-01' and date '2101-12-31'
      or start_min % 5 <> 0 or slut_min % 5 <> 0 or slut_min - start_min < 5
      or (b ->> 'tidsval' = 'fast' and start_min <> 540)
      or jsonb_array_length(vakter) > 20
      or exists (select 1 from jsonb_array_elements(vakter) v where not public.nationella_prov_uuid(v))
      or exists (select 1 from jsonb_array_elements(vakter) v group by v having count(*) > 1) then
      return false;
    end if;
  end loop;

  return not exists (select 1 from jsonb_array_elements(doc -> 'bokningar') item group by item.value -> 'id' having count(*) > 1)
     and not exists (select 1 from jsonb_array_elements(doc -> 'bokningar') item
       group by item.value -> 'namn', item.value -> 'datum', item.value -> 'startMin', item.value -> 'slutMin', item.value -> 'mal' having count(*) > 1);
end $$;

create function public.nationella_prov_scope(input jsonb, extra text[] default '{}') returns void
language plpgsql immutable set search_path = pg_catalog, public as $$
begin
  if not public.nationella_prov_keys(input, array['contractVersion', 'unitId', 'schoolYear'] || extra)
    or input -> 'contractVersion' <> '"nationella_prov_v1"'::jsonb
    or not public.nationella_prov_uuid(input -> 'unitId')
    or not coalesce(public.phase5_programplan_integer(input -> 'schoolYear', 2000, 2100), false) then
    raise exception 'Invalid national exam plan scope' using errcode = '22023', hint = 'nationella_prov_invalid';
  end if;
end $$;

create function public.nationella_prov_actor(unit uuid) returns public.access_assignments
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments;
begin
  a := public.tjanst_actor('plan');
  if a.function not in ('rektor', 'administrator') then
    raise exception 'National exam plan denied' using errcode = '42501';
  end if;
  perform public.tjanst_plan_scope(a, unit);
  return a;
end $$;

create function public.nationella_prov_audit(operation text, unit uuid, details jsonb, a public.access_assignments, s public.app_sessions) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare i public.identities;
begin
  if operation not in ('nationella_prov_read', 'nationella_prov_saved') or not coalesce(public.tjanst_audit_details(details), false) then
    raise exception 'Invalid national exam plan audit' using errcode = '22023', hint = 'nationella_prov_invalid';
  end if;
  select * into strict i from public.identities where id = s.identity_id;
  insert into public.security_events(correlation_id, source, actor_identity_id, actor_issuer, actor_subject, session_id,
    membership_id, assignment_id, customer_id, action, object_type, object_id, outcome, details)
  values (nullif(current_setting('app.correlation_id', true), '')::uuid, 'db', i.id, i.issuer, i.subject, s.id,
    a.membership_id, a.id, a.customer_id, operation, 'nationella_prov', unit, 'ok', details);
exception when others then raise exception 'National exam plan audit unavailable' using errcode = '55000';
end $$;

create function public.nationella_prov_register_json(r public.nationella_prov_revisions) returns jsonb
language sql stable set search_path = pg_catalog, public as $$
  select case when r.revision is not null then jsonb_build_object('revision', r.revision, 'document', r.document,
    'savedAt', to_char(r.saved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) end
$$;

create function public.nationella_prov_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare
  unit uuid;
  start_year integer;
  a public.access_assignments;
  s public.app_sessions;
  r public.nationella_prov_revisions;
begin
  perform public.nationella_prov_scope(input);
  unit := (input ->> 'unitId')::uuid;
  start_year := ((input ->> 'schoolYear')::numeric)::integer;
  a := public.nationella_prov_actor(unit);
  s := public.phase5_programplan_session_check();
  select * into r from public.nationella_prov_revisions x where x.unit_id = unit and x.school_year = start_year
    order by x.revision desc limit 1;
  if found and (r.customer_id, r.organizer_id) is distinct from (a.customer_id, a.organizer_id) then
    raise exception 'National exam plan denied' using errcode = '42501';
  end if;
  perform public.nationella_prov_audit('nationella_prov_read', unit,
    jsonb_build_object('unitId', unit, 'schoolYear', start_year, 'revision', coalesce(r.revision, 0)), a, s);
  return jsonb_build_object('contractVersion', 'nationella_prov_v1',
    'actor', jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id),
    'result', jsonb_build_object('register', public.nationella_prov_register_json(r)));
end $$;

create function public.nationella_prov_save(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare
  unit uuid;
  start_year integer;
  request_id uuid;
  expected integer;
  doc jsonb;
  a public.access_assignments;
  s public.app_sessions;
  r public.nationella_prov_revisions;
  replayed boolean;
begin
  perform public.nationella_prov_scope(input, array['commandId', 'expectedRevision', 'document']);
  unit := (input ->> 'unitId')::uuid;
  start_year := ((input ->> 'schoolYear')::numeric)::integer;
  a := public.nationella_prov_actor(unit);
  if not public.nationella_prov_uuid(input -> 'commandId')
    or not coalesce(public.phase5_programplan_integer(input -> 'expectedRevision', 0, 2147483646), false)
    or not public.nationella_prov_valid(input -> 'document', start_year) then
    raise exception 'Invalid national exam plan command' using errcode = '22023', hint = 'nationella_prov_invalid';
  end if;
  if exists (select 1 from jsonb_array_elements(input -> 'document' -> 'bokningar') b
    where public.nationella_prov_date(b -> 'kontrolleradDatum') > (statement_timestamp() at time zone 'Europe/Stockholm')::date) then
    raise exception 'Invalid national exam verification date' using errcode = '22023', hint = 'nationella_prov_invalid';
  end if;
  request_id := (input ->> 'commandId')::uuid;
  expected := ((input ->> 'expectedRevision')::numeric)::integer;
  doc := input -> 'document';
  perform pg_advisory_xact_lock(hashtextextended(request_id::text, 2026111901));
  s := public.phase5_programplan_session_check();
  select * into r from public.nationella_prov_revisions x where x.command_id = request_id;
  replayed := found;
  if replayed then
    if (r.unit_id, r.school_year, r.customer_id, r.organizer_id, r.actor_identity_id, r.assignment_id, r.expected_revision, r.document)
      is distinct from (unit, start_year, a.customer_id, a.organizer_id, s.identity_id, a.id, expected, doc) then
      raise exception 'National exam plan command changed' using errcode = '40001', hint = 'nationella_prov_command_conflict';
    end if;
  else
    -- Lås även när skolan saknar en första revision. Samtidiga sparningar kan aldrig räkna fram samma nästa nummer.
    perform pg_advisory_xact_lock(hashtextextended(unit::text || '/' || start_year::text, 2026111902));
    s := public.phase5_programplan_session_check();
    select * into r from public.nationella_prov_revisions x where x.unit_id = unit and x.school_year = start_year
      order by x.revision desc limit 1;
    if found and (r.customer_id, r.organizer_id) is distinct from (a.customer_id, a.organizer_id) then
      raise exception 'National exam plan denied' using errcode = '42501';
    end if;
    if coalesce(r.revision, 0) <> expected then
      raise exception 'National exam plan revision conflict' using errcode = '40001', hint = 'nationella_prov_conflict';
    end if;
    insert into public.nationella_prov_revisions(unit_id, school_year, customer_id, organizer_id, revision, command_id,
      expected_revision, document, actor_identity_id, assignment_id, saved_at)
    values (unit, start_year, a.customer_id, a.organizer_id, expected + 1, request_id,
      expected, doc, s.identity_id, a.id, clock_timestamp()) returning * into r;
    perform public.nationella_prov_audit('nationella_prov_saved', unit,
      jsonb_build_object('commandId', request_id, 'unitId', unit, 'schoolYear', start_year, 'revision', r.revision), a, s);
  end if;
  return jsonb_build_object('contractVersion', 'nationella_prov_v1',
    'actor', jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id),
    'result', jsonb_build_object('register', public.nationella_prov_register_json(r), 'replayed', replayed));
end $$;

revoke all on function public.nationella_prov_immutable(), public.nationella_prov_uuid(jsonb), public.nationella_prov_keys(jsonb, text[]),
  public.nationella_prov_date(jsonb), public.nationella_prov_valid(jsonb, integer), public.nationella_prov_scope(jsonb, text[]),
  public.nationella_prov_actor(uuid), public.nationella_prov_audit(text, uuid, jsonb, public.access_assignments, public.app_sessions),
  public.nationella_prov_register_json(public.nationella_prov_revisions), public.nationella_prov_read(jsonb), public.nationella_prov_save(jsonb)
from public, anon, authenticated, service_role, skolplattform_worker;
