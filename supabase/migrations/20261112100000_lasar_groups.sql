-- 05.1.1-08 (LASAR-04): gruppdagar och korta veckor knyts till stabila referenser för utbildning och klass i stället för
-- textnyckeln group_key ('utbildningsid:kolumn' eller 'klass:namn'). Befintliga rader förs över avstämt och fail-closed.
--
-- Användarbeslut 2026-11-10, alternativ a (”Kör 1a 2ja 3a 4a”): group_key behålls som låst historikkolumn (nullbar, inga nya
-- värden), primärnyckeln står på de stabila referenserna, och migreringsflaggan app.lasar_group_migration låter överföringen
-- skriva i skickade, fastställda och ersatta kalendrar. Skydden godtar flaggan bara inom migrationens transaktion och bara när
-- sessionen tillhör databasens ägare; Workern kan inte använda den. Inga triggrar stängs av och alla främmande nycklar gäller.
--
-- Bygger på 20261111100000_lasar_versions.sql och 20261111190000_lasar_worker_access.sql, som är installerade på det skyddade
-- lokala målet och låsta. Deras funktioner ändras här med create or replace. Ingen ny Worker-ingång: grupperna går genom
-- lasar_read och lasar_command, vars rättigheter består. Inga rättigheter ges i denna fil.
--
-- SS 12000 (SIS OpenAPI 2.1.0, som anger SS12000:2020): class_id = school_classes.id motsvarar Group.id med groupType=Klass,
-- organisation = skolenheten och giltighet ur elevkullen. offering_id = offerings.id är en lokal studieväg per elevkull och
-- inte 1:1 med Programme eller SchoolUnitOffering; ingen mappning påstås. En årskursgrupp (utbildning + kolumn) har inget
-- gruppobjekt i standarden och kan vid utbyte bara uttryckas som elevernas årskurs (Enrolment.schoolYear). Orsaken
-- 'nationellt prov' är inte en Provgrupp. Namn används aldrig som nycklar. Inget informationsutbyte är verifierat.

lock table public.school_year_group_days, public.school_year_short_weeks in exclusive mode;

-- ---------------------------------------------------------------------------
-- 1. Hjälpfunktioner för grupper
-- ---------------------------------------------------------------------------
-- Migreringsflaggan: satt lokalt i denna transaktion (värdet bär transaktions-id) och av en session som tillhör ägaren.
create function public.lasar_group_migration_active() returns boolean
language sql volatile set search_path = pg_catalog, public as $$
  select coalesce(current_setting('app.lasar_group_migration', true), '') = 'on:' || txid_current()::text
    and pg_has_role(session_user, (select c.relowner from pg_class c where c.oid = 'public.school_year_group_days'::regclass), 'MEMBER')
$$;

-- Timplanens kolumn som etikett, samma som vyns columnLabel.
create function public.lasar_column_label(col text) returns text
language sql immutable set search_path = pg_catalog, public as $$
  select case when col = 'vecka' then 'Per vecka' when col like 'ak%' then 'Åk ' || substr(col, 3) else 'År ' || substr(col, 3) end
$$;

-- Utbildningens årskurskolumner ett läsår: gymnasiet det år elevkullen går (år 1–3), grundskolan sina årskurser och
-- introduktionsprogrammet veckoramen, båda bara för sitt eget läsår. Samma läsår som tjänstefördelningens klassurval.
create function public.lasar_offering_columns(o public.offerings, year integer) returns text[]
language sql stable set search_path = pg_catalog, public as $$
  select case
    when o.id is null or o.start_year is null or year is null then '{}'::text[]
    when o.kind = 'gymnasium' then case when year - o.start_year between 0 and 2 then array['ar' || (year - o.start_year + 1)] else '{}'::text[] end
    when o.start_year <> year then '{}'::text[]
    when o.kind = 'grundskola' then coalesce((select array_agg('ak' || g order by g) from unnest(coalesce(o.grades, array[1, 2, 3, 4, 5, 6, 7, 8, 9]::smallint[])) g
      where g between 1 and 9), '{}'::text[])
    else array['vecka'] end
$$;

-- Utbildningen erbjuds på skolenheten, direkt eller via offering_units, hos samma huvudman.
create function public.lasar_offering_at(o public.offerings, unit uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (select 1 from public.school_units u where u.id = unit and u.organizer_id = o.organizer_id)
    and (o.unit_id = unit or exists (select 1 from public.offering_units x where x.offering_id = o.id and x.unit_id = unit))
$$;

-- Klassen hör till läsåret: elevkullens giltighet (phase5_class_cohort_year_fits) och samma urval som tjanst_needs.
create function public.lasar_class_in_year(c public.school_classes, kind public.offering_kind, year integer) returns boolean
language sql stable set search_path = pg_catalog, public as $$
  select public.phase5_class_cohort_year_fits(c, year)
    and ((kind = 'gymnasium' and c.start_year between year - 2 and year) or (kind <> 'gymnasium' and c.start_year = year))
$$;

-- ---------------------------------------------------------------------------
-- 2. Skydden godtar migreringsflaggan, bara för överföringens egna ändringar
-- ---------------------------------------------------------------------------
-- Som 20261111100000, plus: under flaggan får en fastställd eller ersatt version få sin kontrollsumma lagrad när den saknas
-- och ingenting annat ändras (kontrollsumman före överföringen frystes, så att den är densamma efter).
create or replace function public.guard_decided_school_year()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
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
  return new;
end $$;

-- Som 20261111100000, plus: under flaggan får en grupprad i en låst version få sina referenser ifyllda, och ingenting annat.
create or replace function public.guard_school_year_days()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  current_status public.school_year_status;
  replaced uuid;
  year_id uuid;
  refs text[];
begin
  if tg_op = 'UPDATE' and tg_table_name in ('school_year_group_days', 'school_year_short_weeks') and public.lasar_group_migration_active() then
    refs := case when tg_table_name = 'school_year_group_days' then array['scope', 'offering_id', 'column_id', 'class_id', 'group_ref']
                 else array['scope', 'offering_id', 'class_id', 'group_ref'] end;
    if (to_jsonb(old) ->> 'scope') is null and (to_jsonb(new) - refs) = (to_jsonb(old) - refs) then
      return new;
    end if;
  end if;
  year_id := coalesce(new.school_year_id, old.school_year_id);
  select y.status, y.superseded_by into current_status, replaced from public.school_years y where y.id = year_id;
  if current_status in ('forslag', 'faststalld') or replaced is not null then
    raise exception 'Dagarna i ett skickat, fastställt eller ersatt läsår ändras inte.';
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Nya referenskolumner (främmande nycklar gäller från början)
-- ---------------------------------------------------------------------------
alter table public.school_year_group_days
  add column scope text,
  add column offering_id uuid references public.offerings (id),
  add column column_id text,
  add column class_id uuid references public.school_classes (id);
alter table public.school_year_short_weeks
  add column scope text,
  add column offering_id uuid references public.offerings (id),
  add column class_id uuid references public.school_classes (id);

-- group_key tar inga nya värden, och varje referens ska höra till kalenderns skola och läsår (T-05.1.1-24). En klass korta
-- vecka bär klassens årskurs ur timplanskopplingen för läsåret.
create function public.lasar_group_ref_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare y record; ok boolean;
begin
  if (tg_op = 'INSERT' and new.group_key is not null) or (tg_op = 'UPDATE' and new.group_key is distinct from old.group_key) then
    raise exception 'group_key är historik sedan 20261112100000 och tar inga nya värden.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  select s.unit_id, s.organizer_id, s.start_year into y from public.school_years s where s.id = new.school_year_id;
  if new.scope = 'arskurs' then
    ok := exists (select 1 from public.offerings o where o.id = new.offering_id and o.organizer_id = y.organizer_id
      and public.lasar_offering_at(o, y.unit_id) and (to_jsonb(new) ->> 'column_id') = any (public.lasar_offering_columns(o, y.start_year)));
  elsif new.scope = 'klass' then
    ok := exists (select 1 from public.school_classes c join public.offerings o on o.id = c.offering_id
      where c.id = new.class_id and c.unit_id = y.unit_id and c.organizer_id = y.organizer_id and public.lasar_class_in_year(c, o.kind, y.start_year)
        and (tg_table_name = 'school_year_group_days' or exists (select 1 from public.class_timplans l
          where l.class_id = c.id and l.start_year = y.start_year and l.column_id = (to_jsonb(new) ->> 'column_id'))));
  else
    ok := false;
  end if;
  if not coalesce(ok, false) then
    raise exception 'Gruppen hör inte till kalenderns skola och läsår.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  return new;
end $$;
create trigger school_year_group_days_refs before insert or update on public.school_year_group_days
  for each row execute function public.lasar_group_ref_guard();
create trigger school_year_short_weeks_refs before insert or update on public.school_year_short_weeks
  for each row execute function public.lasar_group_ref_guard();

-- ---------------------------------------------------------------------------
-- 4. Avstämd överföring (fail-closed)
-- ---------------------------------------------------------------------------
-- Förkontroll: varje rad klassas som årskurs ('<utbildnings-id>:<kolumn>', även med prefixet 'arskurs:'), klass ('klass:<namn>'
-- eller 'klass:<klass-id>') eller okänd form. En årskurs godtas bara om utbildningen erbjuds på kalenderns skola och kolumnen hör
-- till läsåret. En klass godtas bara om exakt en klass i kalenderns skola som hör till läsåret har namnet (eller ID:t). En kort
-- vecka för en klass godtas bara om klassens timplanskoppling för läsåret har samma årskurs. Allt annat avbryter migrationen.
create temp table lasar_group_rows as
select r.tbl, r.school_year_id, r.group_key, r.day, r.sw_column, r.form,
  a.offering_id, a.column_id, k.class_id, coalesce(k.n, 0) candidates,
  case r.form
    when 'arskurs' then a.offering_id is not null and (r.tbl = 'group_days' or a.column_id = r.sw_column)
    when 'klass' then k.n = 1 and (r.tbl = 'group_days' or coalesce(k.link_ok, false))
    else false end resolved
from (
  select x.*, y.unit_id, y.organizer_id, y.start_year,
    case when x.group_key ~* '^(arskurs:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(ar[1-3]|ak[1-9]|vecka)$' then 'arskurs'
         when x.group_key ~ '^klass:.' then 'klass' else 'okand' end form,
    regexp_replace(lower(x.group_key), '^arskurs:', '') bare
  from (select 'group_days'::text tbl, g.school_year_id, g.group_key, g.day, null::text sw_column from public.school_year_group_days g
        union all select 'short_weeks', w.school_year_id, w.group_key, null::date, w.column_id from public.school_year_short_weeks w) x
  join public.school_years y on y.id = x.school_year_id
) r
left join lateral (
  select o.id offering_id, split_part(r.bare, ':', 2) column_id from public.offerings o
   where o.id = case when r.form = 'arskurs' then split_part(r.bare, ':', 1)::uuid end
     and o.organizer_id = r.organizer_id and public.lasar_offering_at(o, r.unit_id)
     and split_part(r.bare, ':', 2) = any (public.lasar_offering_columns(o, r.start_year))
) a on true
left join lateral (
  select count(*)::integer n, (array_agg(c.id))[1] class_id,
    bool_and(exists (select 1 from public.class_timplans l where l.class_id = c.id and l.start_year = r.start_year and l.column_id = r.sw_column)) link_ok
  from public.school_classes c join public.offerings o on o.id = c.offering_id
  where r.form = 'klass' and c.unit_id = r.unit_id and c.organizer_id = r.organizer_id and public.lasar_class_in_year(c, o.kind, r.start_year)
    and (c.name = substr(r.group_key, 7) or c.id::text = lower(substr(r.group_key, 7)))
) k on true;

-- Kontrollsumman före överföringen för varje fastställd version (även ersatta). Prövas igen sist i filen.
create temp table lasar_group_hashes as
select y.id, coalesce(y.content_hash, public.lasar_content_hash(y.id)) before
  from public.school_years y where y.status = 'faststalld';

do $$
declare v record; v_days integer; v_weeks integer; v_left integer;
begin
  select count(*)::integer total, count(*) filter (where form = 'arskurs')::integer arskurs, count(*) filter (where form = 'klass')::integer klass,
    count(*) filter (where form = 'okand')::integer unknown, count(*) filter (where form = 'klass' and candidates > 1)::integer ambiguous,
    count(*) filter (where not resolved)::integer unresolved,
    count(*) filter (where tbl = 'group_days')::integer days, count(*) filter (where tbl = 'short_weeks')::integer weeks
    into v from lasar_group_rows;
  raise notice 'LASAR-04 före överföringen: % rader (% gruppdagar, % korta veckor; % årskurs, % klass, % okänd form).',
    v.total, v.days, v.weeks, v.arskurs, v.klass, v.unknown;
  if v.unresolved > 0 then
    raise exception 'LASAR-04: % gruppreferenser kan inte föras över entydigt (% okänd form, % tvetydiga klassnamn, % utan träff i kalenderns skola och läsår). Inget har förts över.',
      v.unresolved, v.unknown, v.ambiguous, v.unresolved - v.unknown - v.ambiguous using hint = 'lasar_group_transfer';
  end if;

  perform set_config('app.lasar_group_migration', 'on:' || txid_current()::text, true);
  -- Fastställda versioner med grupprader och utan lagrad kontrollsumma får sin nuvarande kontrollsumma lagrad.
  update public.school_years y set content_hash = public.lasar_content_hash(y.id)
   where y.status = 'faststalld' and y.content_hash is null
     and y.id in (select school_year_id from lasar_group_rows);
  update public.school_year_group_days g
     set scope = r.form, offering_id = r.offering_id, column_id = case when r.form = 'arskurs' then r.column_id end, class_id = r.class_id
    from lasar_group_rows r
   where r.tbl = 'group_days' and g.school_year_id = r.school_year_id and g.group_key = r.group_key and g.day = r.day;
  get diagnostics v_days = row_count;
  update public.school_year_short_weeks w
     set scope = r.form, offering_id = r.offering_id, class_id = r.class_id
    from lasar_group_rows r
   where r.tbl = 'short_weeks' and w.school_year_id = r.school_year_id and w.group_key = r.group_key;
  get diagnostics v_weeks = row_count;
  perform set_config('app.lasar_group_migration', '', true);

  select (select count(*) from public.school_year_group_days where scope is null) + (select count(*) from public.school_year_short_weeks where scope is null)
    into v_left;
  if v_days <> v.days or v_weeks <> v.weeks or v_left <> 0 then
    raise exception 'LASAR-04: överföringen stämmer inte (% av % gruppdagar, % av % korta veckor, % kvar).', v_days, v.days, v_weeks, v.weeks, v_left
      using hint = 'lasar_group_transfer';
  end if;
  raise notice 'LASAR-04 efter överföringen: % gruppdagar och % korta veckor överförda, 0 kvar.', v_days, v_weeks;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Ny nyckel på stabila referenser; group_key blir historik
-- ---------------------------------------------------------------------------
alter table public.school_year_group_days drop constraint school_year_group_days_pkey;
drop index public.school_year_group_days_year_idx;
alter table public.school_year_group_days
  alter column group_key drop not null,
  alter column scope set not null,
  add constraint school_year_group_days_scope check (scope in ('arskurs', 'klass')),
  add constraint school_year_group_days_ref check ((scope = 'arskurs' and offering_id is not null and column_id is not null and class_id is null)
    or (scope = 'klass' and class_id is not null and offering_id is null and column_id is null)),
  add constraint school_year_group_days_column check (column_id ~ '^(ar[1-3]|ak[1-9]|vecka)$'),
  add column group_ref text not null generated always as (case scope when 'arskurs' then 'arskurs:' || offering_id::text || ':' || column_id
    when 'klass' then 'klass:' || class_id::text end) stored;
alter table public.school_year_group_days add constraint school_year_group_days_pkey primary key (school_year_id, group_ref, day);
create unique index school_year_group_days_arskurs on public.school_year_group_days (school_year_id, offering_id, column_id, day) where scope = 'arskurs';
create unique index school_year_group_days_klass on public.school_year_group_days (school_year_id, class_id, day) where scope = 'klass';
create index school_year_group_days_offering_idx on public.school_year_group_days (offering_id) where offering_id is not null;
create index school_year_group_days_class_idx on public.school_year_group_days (class_id) where class_id is not null;

alter table public.school_year_short_weeks drop constraint school_year_short_weeks_pkey;
alter table public.school_year_short_weeks
  alter column group_key drop not null,
  alter column scope set not null,
  add constraint school_year_short_weeks_scope check (scope in ('arskurs', 'klass')),
  add constraint school_year_short_weeks_ref check ((scope = 'arskurs' and offering_id is not null and class_id is null)
    or (scope = 'klass' and class_id is not null and offering_id is null)),
  add column group_ref text not null generated always as (case scope when 'arskurs' then 'arskurs:' || offering_id::text || ':' || column_id
    when 'klass' then 'klass:' || class_id::text end) stored;
alter table public.school_year_short_weeks add constraint school_year_short_weeks_pkey primary key (school_year_id, group_ref);
create unique index school_year_short_weeks_arskurs on public.school_year_short_weeks (school_year_id, offering_id, column_id) where scope = 'arskurs';
create unique index school_year_short_weeks_klass on public.school_year_short_weeks (school_year_id, class_id) where scope = 'klass';
create index school_year_short_weeks_offering_idx on public.school_year_short_weeks (offering_id) where offering_id is not null;
create index school_year_short_weeks_class_idx on public.school_year_short_weeks (class_id) where class_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Innehåll och kontrollsumma ur de stabila referenserna
-- ---------------------------------------------------------------------------
-- Gruppdagar och korta veckor per grupp-ID (lasar-groups.ts: 'arskurs:<utbildning>:<kolumn>' och 'klass:<klass>').
create function public.lasar_group_days_json(version_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select jsonb_object_agg(g.group_ref, g.days) from (
    select x.group_ref, jsonb_object_agg(x.day::text, jsonb_strip_nulls(jsonb_build_object('cause', x.cause, 'note', x.note))) days
      from public.school_year_group_days x where x.school_year_id = version_id group by x.group_ref) g), '{}'::jsonb)
$$;
create function public.lasar_short_weeks_json(version_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select jsonb_object_agg(w.group_ref, jsonb_build_object('weekday', w.weekday, 'reason', w.reason, 'columnId', w.column_id))
    from public.school_year_short_weeks w where w.school_year_id = version_id), '{}'::jsonb)
$$;

-- Som 20261111100000 men med grupp-ID ur referenserna, samma form som lasarContentCanonical i lasar-content.ts.
create or replace function public.lasar_content_hash(version_id uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select public.lasar_content_hash_json(jsonb_build_object('version', y.version, 'frameVersionId', null,
    'terms', jsonb_build_object('ht', jsonb_build_object('start', y.ht_start, 'end', y.ht_end), 'vt', jsonb_build_object('start', y.vt_start, 'end', y.vt_end)),
    'exceptions', coalesce((select jsonb_object_agg(d.day::text, jsonb_strip_nulls(jsonb_build_object('kind', d.kind, 'note', d.note)))
      from public.school_year_days d where d.school_year_id = y.id), '{}'::jsonb),
    'groupDays', public.lasar_group_days_json(y.id), 'shortWeeks', public.lasar_short_weeks_json(y.id)))
  from public.school_years y where y.id = version_id
$$;

-- Som 20261111100000 men gruppdagarna och de korta veckorna ur de stabila referenserna, utan filter på textnycklar.
create or replace function public.lasar_calendar_json(y public.school_years) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('versionId', y.id, 'version', y.version, 'status', y.status, 'revision', y.revision,
    'terms', jsonb_build_object('ht', jsonb_build_object('start', y.ht_start, 'end', y.ht_end), 'vt', jsonb_build_object('start', y.vt_start, 'end', y.vt_end)),
    'exceptions', coalesce((select jsonb_object_agg(d.day::text, jsonb_strip_nulls(jsonb_build_object('kind', d.kind, 'note', d.note)))
      from public.school_year_days d where d.school_year_id = y.id), '{}'::jsonb),
    'groupDays', public.lasar_group_days_json(y.id), 'shortWeeks', public.lasar_short_weeks_json(y.id),
    'frameVersionId', null, 'contentHash', coalesce(y.content_hash, public.lasar_content_hash(y.id)), 'decidedOn', y.decided_on,
    'history', public.lasar_history(y))
$$;



-- ---------------------------------------------------------------------------
-- 9. Avstämning: fastställda versioner har samma kontrollsumma som före överföringen
-- ---------------------------------------------------------------------------
do $$
declare v_diff integer;
begin
  select count(*)::integer into v_diff from lasar_group_hashes h join public.school_years y on y.id = h.id
   where coalesce(y.content_hash, public.lasar_content_hash(y.id)) is distinct from h.before;
  if v_diff <> 0 then
    raise exception 'LASAR-04: % fastställda kalenderversioner fick en annan kontrollsumma.', v_diff using hint = 'lasar_group_transfer';
  end if;
end $$;
drop table lasar_group_rows;
drop table lasar_group_hashes;

-- ---------------------------------------------------------------------------
-- 10. Stängt: inga rättigheter för Worker eller klientroller
-- ---------------------------------------------------------------------------
revoke all on function public.lasar_group_migration_active(), public.lasar_column_label(text), public.lasar_offering_columns(public.offerings, integer),
  public.lasar_offering_at(public.offerings, uuid), public.lasar_class_in_year(public.school_classes, public.offering_kind, integer),
  public.lasar_group_ref_guard(), public.lasar_group_days_json(uuid), public.lasar_short_weeks_json(uuid)
  from public, anon, authenticated, service_role, skolplattform_worker;
