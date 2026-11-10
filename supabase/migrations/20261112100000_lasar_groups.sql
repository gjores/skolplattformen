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
-- 7. Grupper, undervisning och gruppregler i läsningen (LASAR-04, LASAR-01, LASAR-03)
-- ---------------------------------------------------------------------------
-- Skolans grupper för ett läsår i kontraktets form (LasarGroupRef): först årskurserna per utbildning på skolan och kolumn,
-- sedan klasserna ur school_classes som hör till läsåret, med utbildning och kolumn ur timplanskopplingen (class_timplans).
-- Bara ID:n är nycklar; namn är etiketter. Inga elevantal (A-18).
create function public.lasar_groups(unit uuid, year integer) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce((select jsonb_agg(g.ref order by g.part, g.k1 collate "C", g.k2 collate "C", g.k3 collate "C") from (
    select 0 part, public.lasar_display_name(o.name) k1, o.id::text k2, col k3,
      jsonb_build_object('scope', 'arskurs', 'offeringId', o.id, 'columnId', col, 'label', public.lasar_column_label(col),
        'educationName', public.lasar_display_name(o.name), 'kind', o.kind) ref
      from public.offerings o cross join lateral unnest(public.lasar_offering_columns(o, year)) col
     where public.lasar_offering_at(o, unit)
    union all
    select 1, public.lasar_display_name(c.name), c.id::text, '',
      jsonb_build_object('scope', 'klass', 'classId', c.id, 'offeringId', c.offering_id, 'columnId', l.column_id, 'label', public.lasar_display_name(c.name),
        'educationName', public.lasar_display_name(o.name), 'kind', o.kind)
      from public.school_classes c join public.offerings o on o.id = c.offering_id
      left join public.class_timplans l on l.class_id = c.id and l.start_year = year
     where c.unit_id = unit and public.lasar_class_in_year(c, o.kind, year)) g), '[]'::jsonb)
$$;

-- Grupperna som groupsFromRefs i lasar-groups.ts bygger dem: grupp-ID, och för en klass årskursgruppen som förälder och
-- kolumnen bara när årskursgruppen finns. Ingången för både regler och kommandon.
create function public.lasar_group_effective(groups jsonb) returns jsonb
language sql immutable set search_path = pg_catalog, public as $$
  with r as (
    select x.value v, x.n, case when x.value ->> 'scope' = 'arskurs' then 0 else 1 end part,
      'arskurs:' || (x.value ->> 'offeringId') || ':' || (x.value ->> 'columnId') arskurs_id
    from jsonb_array_elements(coalesce(groups, '[]'::jsonb)) with ordinality x(value, n)
  ), a as (select arskurs_id from r where part = 0)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', case when part = 0 then arskurs_id else 'klass:' || (v ->> 'classId') end,
      'scope', v ->> 'scope', 'kind', v ->> 'kind', 'offeringId', v ->> 'offeringId', 'classId', v ->> 'classId',
      'column', case when part = 0 then v ->> 'columnId' when arskurs_id in (select arskurs_id from a) then v ->> 'columnId' end,
      'parent', case when part = 1 and arskurs_id in (select arskurs_id from a) then arskurs_id end) order by part, n), '[]'::jsonb)
  from r
$$;

-- Timplanens årstimmar per kolumn (A-09): grundskolan per årskurs utan att räkna NO/SO och deras delämnen dubbelt (som
-- tjanst_needs), introduktionsprogrammet veckotimmar och gymnasiet per år ur v2-tiden eller timmarna per termin.
create function public.lasar_timplan_hours(t public.timplans, o public.offerings) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare r jsonb := '[]'; n integer; i integer; idx integer; total numeric; v2 boolean; grades smallint[];
begin
  if t.gym_basis is not null then
    v2 := exists (select 1 from public.timplan_time_models m where m.plan_id = t.id);
    for n in 1..3 loop
      i := 2 * (n - 1);
      select coalesce(sum(case when v2 then coalesce((c2.school_minutes ->> i)::numeric, 0) + coalesce((c2.school_minutes ->> (i + 1))::numeric, 0)
          else (case when coalesce(c1.allocated[i + 1], false) then coalesce(c1.hours[i + 1], 0) else 0 end
              + case when coalesce(c1.allocated[i + 2], false) then coalesce(c1.hours[i + 2], 0) else 0 end) * 60 end), 0) / 60
        into total
        from jsonb_array_elements(t.gym_basis -> 'rows') x
        left join public.timplan_time_cells_v2 c2 on v2 and c2.plan_id = t.id and c2.row_key = x.value ->> 'key'
        left join public.timplan_cells c1 on not v2 and c1.timplan_id = t.id and c1.row_id = x.value ->> 'key'
       where x.value ->> 'key' not like 'meta:%'
         and exists (select 1 from jsonb_array_elements(t.gym_basis -> 'distribution') d where d.value ->> 'rowKey' = x.value ->> 'key'
           and coalesce((d.value -> 'points' ->> i)::integer, 0) + coalesce((d.value -> 'points' ->> (i + 1))::integer, 0) > 0);
      r := r || jsonb_build_array(jsonb_build_object('columnId', 'ar' || n, 'hours', round(total)::integer));
    end loop;
  elsif o.kind = 'grundskola' then
    grades := coalesce(o.grades, array[1, 2, 3, 4, 5, 6, 7, 8, 9]::smallint[]);
    for idx in 1..coalesce(array_length(grades, 1), 0) loop
      n := grades[idx];
      continue when n not between 1 and 9;
      select coalesce(sum(c.hours[idx]), 0) into total from public.timplan_cells c where c.timplan_id = t.id
        and not (n <= 3 and c.row_id in ('biologi', 'fysik', 'kemi', 'geografi', 'historia', 'religion', 'samhallskunskap'))
        and not (n > 3 and c.row_id in ('no', 'so'));
      r := r || jsonb_build_array(jsonb_build_object('columnId', 'ak' || n, 'hours', round(total)::integer));
    end loop;
  else
    select coalesce(sum(c.hours[1]), 0) into total from public.timplan_cells c where c.timplan_id = t.id;
    r := jsonb_build_array(jsonb_build_object('columnId', 'vecka', 'hours', round(total)::integer));
  end if;
  return r;
end $$;

-- Panelen Undervisning som läsåret rymmer: per klass i läsåret med en fastställd timplan via kopplingen, timplanens version och
-- årstimmar. IM-klasserna anges för sig (veckoram, A-17). Inga elevantal (A-18).
create function public.lasar_teaching(unit uuid, year integer) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object(
    'classes', coalesce((select jsonb_agg(jsonb_build_object('classId', c.id, 'name', public.lasar_display_name(c.name), 'offeringId', c.offering_id,
        'columnId', l.column_id, 'timplanId', t.id, 'timplanVersion', t.version, 'rows', public.lasar_timplan_hours(t, tp))
        order by public.lasar_display_name(c.name) collate "C", c.id)
      from public.school_classes c join public.offerings o on o.id = c.offering_id
      join public.class_timplans l on l.class_id = c.id and l.start_year = year
      join public.timplans t on t.id = l.timplan_id and t.status = 'faststalld'
      join public.offerings tp on tp.id = t.offering_id
     where c.unit_id = unit and public.lasar_class_in_year(c, o.kind, year)), '[]'::jsonb),
    'imClassIds', coalesce((select jsonb_agg(c.id order by c.id) from public.school_classes c join public.offerings o on o.id = c.offering_id
     where c.unit_id = unit and o.kind = 'introduktionsprogram' and public.lasar_class_in_year(c, o.kind, year)), '[]'::jsonb))
$$;

-- Gruppreglerna med koder ur web/lib/lasar-rule-codes.ts, som groupSummary i lasar-model.ts för varje grupp ur
-- groupsFromRefs: kort vecka bara för grundskolans åk 1–2 (short_week_column) och med särskilda skäl (short_week_reason),
-- orsaken annat kräver anteckning (group_other_note), och en varning när gruppen har färre än 178 undervisningsdagar medan
-- skolan har minst 178 (group_days_min). En klass ärver sin årskursgrupps dagar och korta vecka. Skolförordningen 3 kap. 2 och
-- 4 §§. Indata: terms, exceptions, grupperna i kontraktets form, groupDays och shortWeeks per grupp-ID.
create function public.lasar_group_rule_check(terms jsonb, exceptions jsonb, groups jsonb, group_days jsonb, short_weeks jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  ht_start date := (terms #>> '{ht,start}')::date; ht_end date := (terms #>> '{ht,end}')::date;
  vt_start date := (terms #>> '{vt,start}')::date; vt_end date := (terms #>> '{vt,end}')::date;
  v_groups jsonb := public.lasar_group_effective(groups); v_school date[]; v_count integer; r jsonb := '[]'; g record; v_chain text[];
  v_owner text; v_owner_g jsonb; v_teach integer; v_member text;
begin
  group_days := coalesce(group_days, '{}'::jsonb); short_weeks := coalesce(short_weeks, '{}'::jsonb);
  select coalesce(array_agg(x.d order by x.d), '{}') into v_school
    from (select s::date d from generate_series(ht_start, vt_end, interval '1 day') s) x
   where (x.d between ht_start and ht_end or x.d between vt_start and vt_end) and extract(isodow from x.d) < 6
     and not public.tjanst_is_holiday(x.d) and not coalesce(exceptions ? x.d::text, false);
  v_count := coalesce(array_length(v_school, 1), 0);
  for g in select x.value v from jsonb_array_elements(v_groups) with ordinality x(value, n) order by x.n loop
    v_chain := array[g.v ->> 'id'] || case when g.v ->> 'parent' is null then '{}'::text[] else array[g.v ->> 'parent'] end;
    v_owner := (select m from unnest(v_chain) with ordinality u(m, n) where short_weeks ? m order by n limit 1);
    if v_owner is not null then
      select x.value into v_owner_g from jsonb_array_elements(v_groups) x where x.value ->> 'id' = v_owner limit 1;
      if not (v_owner_g ->> 'kind' = 'grundskola' and coalesce(v_owner_g ->> 'column', '') in ('ak1', 'ak2')) then
        r := r || jsonb_build_array(jsonb_build_object('code', 'short_week_column', 'level', 'error'));
      end if;
      if coalesce(short_weeks #>> array[v_owner, 'reason'], '') ~ '^[[:space:]]*$' then
        r := r || jsonb_build_array(jsonb_build_object('code', 'short_week_reason', 'level', 'error'));
      end if;
    end if;
    foreach v_member in array v_chain loop
      r := r || coalesce((select jsonb_agg(jsonb_build_object('code', 'group_other_note', 'level', 'error'))
        from jsonb_each(case when jsonb_typeof(group_days -> v_member) = 'object' then group_days -> v_member else '{}'::jsonb end) d
       where d.value ->> 'cause' = 'annat' and coalesce(d.value ->> 'note', '') ~ '^[[:space:]]*$'), '[]'::jsonb);
    end loop;
    select count(*)::integer into v_teach from unnest(v_school) s(d)
     where not exists (select 1 from unnest(v_chain) m(id)
       where coalesce((group_days -> m.id) ? s.d::text, false)
          or (short_weeks -> m.id ->> 'weekday')::integer = extract(isodow from s.d)::integer - 1);
    if v_teach < 178 and v_count >= 178 then
      r := r || jsonb_build_array(jsonb_build_object('code', 'group_days_min', 'level', 'warning'));
    end if;
  end loop;
  return r;
end $$;

-- Som 20261111100000 plus gruppreglerna för skolans grupper i läsåret. Returnerar [{code, level}].
create or replace function public.lasar_rules(version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_year public.school_years; v_exceptions jsonb; v_types text[]; v_terms jsonb;
begin
  select * into v_year from public.school_years s where s.id = version_id;
  if not found then raise exception 'Kalenderversionen finns inte.' using errcode = '40001', hint = 'lasar_not_found'; end if;
  select coalesce(jsonb_object_agg(d.day::text, jsonb_strip_nulls(jsonb_build_object('kind', d.kind, 'note', d.note))), '{}'::jsonb) into v_exceptions
    from public.school_year_days d where d.school_year_id = v_year.id;
  select coalesce(array_agg(t.school_type order by t.school_type collate "C"), '{}') into v_types
    from (select distinct x.school_type from public.school_unit_types x where x.unit_id = v_year.unit_id and x.school_type ~ '^[A-Z]{2,6}$' order by 1 limit 10) t;
  v_terms := jsonb_build_object('ht', jsonb_build_object('start', v_year.ht_start, 'end', v_year.ht_end),
    'vt', jsonb_build_object('start', v_year.vt_start, 'end', v_year.vt_end));
  return public.lasar_rule_check(v_terms, v_exceptions, v_types)
    || public.lasar_group_rule_check(v_terms, v_exceptions, public.lasar_groups(v_year.unit_id, v_year.start_year),
         public.lasar_group_days_json(v_year.id), public.lasar_short_weeks_json(v_year.id));
end $$;

-- Som 20261111100000 men med skolans grupper och undervisning för läsåret i stället för tomma listor.
create or replace function public.lasar_detail(a public.access_assignments, unit uuid, year integer, version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_unit public.school_units; v_year public.school_years; v_versions jsonb; v_types jsonb; v_school boolean := a.function in ('rektor', 'administrator');
  v_open boolean; v_sent boolean; v_caps jsonb; v_groups jsonb;
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
  -- D-18: rektor och skoladministratör arbetar i utkastet, skickar och tar tillbaka; huvudmannen återsänder och fastställer.
  v_caps := jsonb_build_object('canEdit', v_school and v_open, 'canSubmit', v_school and v_open, 'canWithdraw', v_school and v_sent, 'canRequestChange', false,
    'canWithdrawRequest', false, 'canReturn', a.function = 'huvudman' and v_sent, 'canApprove', a.function = 'huvudman' and v_sent,
    'canReopen', false, 'canDecline', false, 'canComment', v_year.id is not null and v_year.superseded_by is null,
    'canCreate', case when v_school and jsonb_array_length(v_versions) = 0 then '["proposal"]'::jsonb else '[]'::jsonb end,
    'canPublishFrame', false, 'canSetMode', false);
  return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'target', jsonb_build_object('kind', 'school', 'unitId', unit), 'schoolYear', year,
    'schoolName', left(btrim(v_unit.name), 200), 'schoolTypes', v_types, 'mode', 'eget', 'modeLocked', false, 'versions', v_versions,
    'calendar', case when v_year.id is null then null else public.lasar_calendar_json(v_year) end,
    'capabilities', v_caps, 'editableFrom', null, 'changeRequest', null, 'review', '[]'::jsonb, 'frame', null, 'groups', v_groups,
    'teaching', public.lasar_teaching(unit, year),
    'previousYearAvailable', (public.lasar_current(unit, year - 1)).id is not null);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Gruppkommandon i en öppen version
-- ---------------------------------------------------------------------------
-- Gruppen ur skolans grupper i versionens läsår, eller lasar_invalid. Ett klassnamn eller programprefix är aldrig ett grupp-ID.
create function public.lasar_find_group(y public.school_years, v jsonb) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare g jsonb;
begin
  if jsonb_typeof(v) is distinct from 'string' then
    raise exception 'Ogiltig grupp.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  select x.value into g from jsonb_array_elements(public.lasar_group_effective(public.lasar_groups(y.unit_id, y.start_year))) x
   where x.value ->> 'id' = (v #>> '{}') limit 1;
  if g is null then raise exception 'Gruppen finns inte i skolans läsår.' using errcode = '22023', hint = 'lasar_invalid'; end if;
  return g;
end $$;

-- Datumlista i stigande ordning (1–400 dagar).
create function public.lasar_op_dates(v jsonb) returns date[]
language plpgsql immutable set search_path = pg_catalog, public as $$
declare v_out date[] := '{}'; v_date date; v_item record;
begin
  if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v) not between 1 and 400 then
    raise exception 'Ogiltiga datum.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  for v_item in select e.value from jsonb_array_elements(v) with ordinality e(value, n) order by e.n loop
    v_date := public.lasar_date(v_item.value);
    if cardinality(v_out) > 0 and v_date <= v_out[cardinality(v_out)] then
      raise exception 'Ogiltiga datum.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    v_out := v_out || v_date;
  end loop;
  return v_out;
end $$;

-- set_group_days: skoldagar utan undervisning för gruppen, med orsak och anteckning (setGroupDays). Bara skolans skoldagar;
-- orsaken annat utan anteckning ger regelkoden group_other_note.
create function public.lasar_set_group_days(y public.school_years, op jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare g jsonb; v_cause text; v_note text; v_date date;
begin
  perform public.lasar_shape(op, array['op', 'groupId', 'dates', 'cause'], array['note']);
  g := public.lasar_find_group(y, op -> 'groupId');
  v_cause := op ->> 'cause';
  if jsonb_typeof(op -> 'cause') is distinct from 'string' or v_cause not in ('nationellt prov', 'apl', 'friluftsdag', 'annat') then
    raise exception 'Ogiltig orsak.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  v_note := case when op ? 'note' then public.lasar_text(op -> 'note', 200, false) end;
  if v_cause = 'annat' and v_note is null then
    raise exception 'Kalendern uppfyller inte förordningarna.' using errcode = '40001', hint = 'lasar_rules_failed', detail = '["group_other_note"]';
  end if;
  foreach v_date in array public.lasar_op_dates(op -> 'dates') loop
    if not public.lasar_day_editable(y, v_date) or exists (select 1 from public.school_year_days d where d.school_year_id = y.id and d.day = v_date) then
      raise exception 'Bara skolans skoldagar kan sakna undervisning för en grupp.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    insert into public.school_year_group_days (school_year_id, scope, offering_id, column_id, class_id, day, cause, note)
    values (y.id, g ->> 'scope', case when g ->> 'scope' = 'arskurs' then (g ->> 'offeringId')::uuid end, case when g ->> 'scope' = 'arskurs' then g ->> 'column' end,
      case when g ->> 'scope' = 'klass' then (g ->> 'classId')::uuid end, v_date, v_cause::public.group_off_cause, v_note)
    on conflict on constraint school_year_group_days_pkey do update set cause = excluded.cause, note = excluded.note;
  end loop;
end $$;

-- clear_group_days: gruppens egna avvikelser tas bort (clearGroupDays); minst en ska finnas.
create function public.lasar_clear_group_days(y public.school_years, op jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare g jsonb; n integer;
begin
  perform public.lasar_shape(op, array['op', 'groupId', 'dates']);
  g := public.lasar_find_group(y, op -> 'groupId');
  delete from public.school_year_group_days x where x.school_year_id = y.id and x.group_ref = g ->> 'id' and x.day = any (public.lasar_op_dates(op -> 'dates'));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ingen av dagarna är en egen avvikelse för gruppen.' using errcode = '22023', hint = 'lasar_invalid'; end if;
end $$;

-- set_short_week: fyra skoldagar i veckan (setShortWeek). Bara grundskolans åk 1–2 (short_week_column) och med särskilda skäl
-- (short_week_reason), Skolförordningen 3 kap. 4 § andra stycket. Årskursen är gruppens: årskursgruppens kolumn eller klassens
-- kolumn ur timplanskopplingen för läsåret.
create function public.lasar_set_short_week(y public.school_years, op jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare g jsonb; v_weekday integer; v_reason text; v_codes jsonb := '[]';
begin
  perform public.lasar_shape(op, array['op', 'groupId', 'columnId', 'weekday', 'reason']);
  g := public.lasar_find_group(y, op -> 'groupId');
  v_weekday := public.lasar_int(op -> 'weekday', 0, 4);
  if jsonb_typeof(op -> 'columnId') is distinct from 'string' or (op ->> 'columnId') !~ '^(ar[1-3]|ak[1-9]|vecka)$'
     or jsonb_typeof(op -> 'reason') is distinct from 'string' then
    raise exception 'Ogiltig kort vecka.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  if not (g ->> 'kind' = 'grundskola' and coalesce(g ->> 'column', '') in ('ak1', 'ak2')) then v_codes := v_codes || '["short_week_column"]'::jsonb; end if;
  if (op ->> 'reason') ~ '^[[:space:]]*$' then v_codes := v_codes || '["short_week_reason"]'::jsonb; end if;
  if jsonb_array_length(v_codes) > 0 then
    raise exception 'Kalendern uppfyller inte förordningarna.' using errcode = '40001', hint = 'lasar_rules_failed', detail = v_codes::text;
  end if;
  if op ->> 'columnId' <> g ->> 'column' then
    raise exception 'Årskursen stämmer inte med gruppen.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  v_reason := public.lasar_text(op -> 'reason', 200, false);
  insert into public.school_year_short_weeks (school_year_id, scope, offering_id, class_id, column_id, weekday, reason)
  values (y.id, g ->> 'scope', case when g ->> 'scope' = 'arskurs' then (g ->> 'offeringId')::uuid end,
    case when g ->> 'scope' = 'klass' then (g ->> 'classId')::uuid end, g ->> 'column', v_weekday, v_reason)
  on conflict on constraint school_year_short_weeks_pkey do update set weekday = excluded.weekday, reason = excluded.reason, column_id = excluded.column_id;
end $$;

-- clear_short_week: gruppens korta vecka tas bort (clearShortWeek); den ska finnas.
create function public.lasar_clear_short_week(y public.school_years, op jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare g jsonb; n integer;
begin
  perform public.lasar_shape(op, array['op', 'groupId']);
  g := public.lasar_find_group(y, op -> 'groupId');
  delete from public.school_year_short_weeks w where w.school_year_id = y.id and w.group_ref = g ->> 'id';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Gruppen har ingen kort vecka.' using errcode = '22023', hint = 'lasar_invalid'; end if;
end $$;

-- Som 20261111100000 plus gruppåtgärderna set_group_days, clear_group_days, set_short_week och clear_short_week. Ordning:
-- aktör, storlek, tolkning, skolenhet, lås på kommando-id, exakt återspelning, payload-hash, behörighet per åtgärd, status,
-- revision, skrivning, kvitto, journal, historik och logg. Övriga åtgärder ger lasar_unsupported.
create or replace function public.lasar_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions; q jsonb; v_kind text; v_action text; v_request uuid; v_unit uuid; v_year integer;
  v_version uuid; v_expected integer; v_text text; v_row public.lasar_commands; y public.school_years; v_current public.school_years;
  v_op jsonb; v_detail jsonb; v_envelope jsonb;
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
    -- fastställer, öppnar, avslår och styr ramen (T-05.1.1-14, T-05.1.1-19).
    if (v_action in ('submit', 'withdraw', 'request_change', 'withdraw_request') and a.function not in ('rektor', 'administrator'))
       or (v_action in ('return', 'approve', 'reopen', 'decline_request', 'publish_frame', 'preview_mode_change', 'set_mode') and a.function <> 'huvudman') then
      raise exception 'Läsårskalendern nekas.' using errcode = '42501';
    end if;
    if v_action not in ('submit', 'withdraw', 'return', 'approve') then
      raise exception 'Beslutet finns inte i denna version.' using errcode = '22023', hint = 'lasar_unsupported';
    end if;
    y := public.lasar_lock_version(a, v_unit, v_year, v_version);
    if y.superseded_by is not null or (v_action = 'submit' and y.status not in ('utkast', 'atersand')) or (v_action <> 'submit' and y.status <> 'forslag') then
      raise exception 'Kalendern är låst.' using errcode = '40001', hint = 'lasar_locked_status';
    end if;
    if y.revision <> v_expected then
      raise exception 'Kalendern har ändrats.' using errcode = '40001', hint = 'lasar_revision_conflict';
    end if;
    if v_action in ('submit', 'approve') then perform public.lasar_require_rules(y.id); end if;
    if v_action = 'submit' then
      update public.school_years x set status = 'forslag', revision = x.revision + 1 where x.id = y.id returning * into y;
    elsif v_action = 'withdraw' then
      update public.school_years x set status = 'utkast', revision = x.revision + 1 where x.id = y.id returning * into y;
    elsif v_action = 'return' then
      update public.school_years x set status = 'atersand', revision = x.revision + 1 where x.id = y.id returning * into y;
    else
      -- Pitfall 5: den tidigare gällande versionen ersätts före fastställandet, så att indexet för gällande version håller.
      v_current := public.lasar_current(v_unit, v_year);
      if v_current.id is not null and v_current.id <> y.id then
        update public.school_years x set superseded_at = clock_timestamp(), superseded_by = y.id where x.id = v_current.id;
      end if;
      update public.school_years x set status = 'faststalld', decided_on = public.app_today(), decision_comment = v_text,
        content_hash = public.lasar_content_hash(x.id), revision = x.revision + 1
       where x.id = y.id returning * into y;
    end if;
    perform public.lasar_history_add(y.id, v_action, case when v_action = 'withdraw' and v_text = '' then 'Förslaget togs tillbaka för fortsatt arbete.' else v_text end);
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
  public.lasar_group_ref_guard(), public.lasar_group_days_json(uuid), public.lasar_short_weeks_json(uuid),
  public.lasar_groups(uuid, integer), public.lasar_group_effective(jsonb), public.lasar_timplan_hours(public.timplans, public.offerings),
  public.lasar_teaching(uuid, integer), public.lasar_group_rule_check(jsonb, jsonb, jsonb, jsonb, jsonb), public.lasar_find_group(public.school_years, jsonb),
  public.lasar_op_dates(jsonb), public.lasar_set_group_days(public.school_years, jsonb), public.lasar_clear_group_days(public.school_years, jsonb),
  public.lasar_set_short_week(public.school_years, jsonb), public.lasar_clear_short_week(public.school_years, jsonb)
  from public, anon, authenticated, service_role, skolplattform_worker;
