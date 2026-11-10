-- 05.1.1-11 (D-04, D-09; LASAR-01, LASAR-02): kopiera förra läsåret med granskningsposter som servern sparar, och kalenderstatus
-- per skola. Servern läser själv källan (skolans gällande fastställda version för föregående läsår, eller huvudmannens senast
-- utgivna ram för föregående läsår) och målårets grupper, räknar kopian med copySchoolYear (web/lib/lasar-copy.ts) och skickar
-- källversionen, innehållet och granskningsposterna. Här prövas källan och att innehållet kommer ur den: varje inlagd dag är
-- källans dag i samma ISO-vecka och veckodag ett läsår senare, inga dagar i påskfönstret, inga klassdagar och inga korta veckor
-- läggs in, och varje dag i källan är antingen inlagd eller står som granskningspost. Ett förslag eller en ram med olösta poster
-- kan inte skickas eller ges ut (lasar_review_open). Lösningen av varje post sparas med uppdrag och tid, och historiken får
-- raderna ”Kopierat från {förra läsåret}” och ”{n} dagar granskade”.
--
-- Bygger på 20261111100000_lasar_versions.sql och 20261111190000_lasar_worker_access.sql (installerade på det skyddade lokala
-- målet och låsta) samt 20261112100000, 20261112110000 och 20261112120000. Funktionerna ändras här med create or replace. Inga
-- rättigheter ges i denna fil; nya tabeller och hjälpfunktioner är stängda för Worker och klientroller.
-- phase5_planning_year_overview och dess tolk ändras inte (Pitfall 7).
--
-- SS 12000 (SIS OpenAPI 2.1.0, som anger SS12000:2020): kalendern, kopian och granskningsposterna saknar objekt i standarden och
-- exporteras inte. Skolenheten (Organisation, organisationType=Skolenhet) anges med unit_id och huvudmannen med organizers.id.
-- Kopian behåller bara stabila gruppreferenser (utbildning och kolumn); klassdagar kopieras aldrig. Ingen standardefterlevnad påstås.

-- ---------------------------------------------------------------------------
-- 1. Granskningsposter efter kopiering (D-04)
-- ---------------------------------------------------------------------------
-- En post per dag, terminskant eller kort vecka som inte kunde flyttas entydigt. Posten hör till skolans kalenderversion eller
-- till huvudmannens ramversion. item_id är deterministiskt ur copySchoolYear (copy|skäl|källdatum|grupp eller kant).
create table public.school_year_review_items (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid references public.school_years (id),
  frame_id uuid references public.school_year_frames (id),
  item_id text not null check (char_length(item_id) between 1 and 200),
  ordinal integer not null check (ordinal between 0 and 399),
  source_date date,
  kind text not null check (kind in ('lovdag', 'studiedag', 'termin', 'gruppdag', 'kort vecka')),
  reason text not null check (reason in ('missing_week', 'easter', 'holiday', 'weekend', 'outside_terms', 'jullov', 'term_edge',
    'group_offering_missing', 'group_class', 'short_week')),
  note text check (note is null or char_length(note) between 1 and 200),
  suggested_date date,
  target_date date,
  group_ref text check (group_ref is null or char_length(group_ref) between 1 and 200),
  edge text check (edge is null or edge in ('ht:start', 'ht:end', 'vt:start', 'vt:end')),
  short_week jsonb check (short_week is null or jsonb_typeof(short_week) = 'object'),
  resolution text check (resolution is null or resolution in ('inserted', 'changed', 'dismissed')),
  resolved_by_assignment uuid references public.access_assignments (id),
  resolved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint school_year_review_items_target check ((school_year_id is null) <> (frame_id is null)),
  constraint school_year_review_items_resolved check ((resolution is null) = (resolved_by_assignment is null) and (resolution is null) = (resolved_at is null)),
  constraint school_year_review_items_year_key unique (school_year_id, item_id),
  constraint school_year_review_items_frame_key unique (frame_id, item_id)
);
alter table public.school_year_review_items enable row level security;
alter table public.school_year_review_items force row level security;
revoke all on public.school_year_review_items from public, anon, authenticated, service_role, skolplattform_worker;

-- En post ändras bara när den löses, en gång; inget annat ändras och ingen post tas bort.
create function public.lasar_review_guard() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' and old.resolution is null and new.resolution is not null
     and (new.id, new.school_year_id, new.frame_id, new.item_id, new.ordinal, new.source_date, new.kind, new.reason, new.note, new.suggested_date,
          new.target_date, new.group_ref, new.edge, new.short_week, new.created_at)
     is not distinct from (old.id, old.school_year_id, old.frame_id, old.item_id, old.ordinal, old.source_date, old.kind, old.reason, old.note,
          old.suggested_date, old.target_date, old.group_ref, old.edge, old.short_week, old.created_at) then
    return new;
  end if;
  raise exception 'Granskningsposterna ändras bara när de löses.';
end $$;
create trigger school_year_review_items_guard before update or delete on public.school_year_review_items
  for each row execute function public.lasar_review_guard();
create trigger school_year_review_items_no_truncate before truncate on public.school_year_review_items
  for each statement execute function public.lasar_review_guard();

-- Ramens historik får raderna för kopiering och granskning.
alter table public.school_year_frame_events drop constraint school_year_frame_events_action_check;
alter table public.school_year_frame_events add constraint school_year_frame_events_action_check
  check (action in ('create', 'create_frame', 'reset_to_proposal', 'publish', 'copy', 'review_done'));

-- ---------------------------------------------------------------------------
-- 2. Kopians prövning
-- ---------------------------------------------------------------------------
-- Samma ISO-vecka och veckodag `years` år senare (shift i lasar-copy.ts), eller null när veckan saknas det året.
create function public.lasar_copy_shift(d date, years integer) returns date
language plpgsql immutable set search_path = pg_catalog, public as $$
declare v_year integer := extract(isoyear from d)::integer + years; v_week integer := extract(week from d)::integer; v_jan4 date; v_target date;
begin
  v_jan4 := make_date(v_year, 1, 4);
  v_target := v_jan4 - (extract(isodow from v_jan4)::integer - 1) + (v_week - 1) * 7 + (extract(isodow from d)::integer - 1);
  if extract(isoyear from v_target)::integer <> v_year or extract(week from v_target)::integer <> v_week then return null; end if;
  return v_target;
end $$;

-- Påskfönstret i lasar-copy.ts (RESEARCH A6): påskdagen −8…+8 dagar och klämdagen efter Kristi himmelsfärdsdag (+40).
create function public.lasar_copy_easter(d date) returns boolean
language sql immutable set search_path = pg_catalog, public as $$
  select abs(d - public.tjanst_easter(extract(year from d)::integer)) <= 8 or d - public.tjanst_easter(extract(year from d)::integer) = 40
$$;

-- Kopian prövas mot källans kalender i kontraktets form (terms, exceptions, groupDays, shortWeeks). Se filhuvudet.
create function public.lasar_copy_check(source jsonb, copy jsonb, frame boolean) returns void
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_item jsonb; v_e record; v_g record; v_s date; v_t date; v_id text; v_ids text[] := '{}'; v_kind text; v_edge text; v_src date; v_tgt date; v_n integer := 0;
begin
  perform public.lasar_shape(copy, array['sourceVersionId', 'terms', 'exceptions', 'groupDays', 'review']);
  perform public.lasar_shape(copy -> 'terms', array['ht', 'vt']);
  perform public.lasar_shape(copy #> '{terms,ht}', array['start', 'end']); perform public.lasar_shape(copy #> '{terms,vt}', array['start', 'end']);
  if jsonb_typeof(copy -> 'exceptions') is distinct from 'object' or jsonb_typeof(copy -> 'groupDays') is distinct from 'object'
     or jsonb_typeof(copy -> 'review') is distinct from 'array' or jsonb_array_length(copy -> 'review') > 400
     or (select count(*) from jsonb_object_keys(copy -> 'exceptions')) > 400 or (frame and copy -> 'groupDays' <> '{}'::jsonb) then
    raise exception 'Ogiltig kopia.' using errcode = '22023', hint = 'lasar_invalid';
  end if;

  -- Granskningsposterna: deterministiskt ID och en dag, kant eller kort vecka i källan.
  for v_item in select r.value from jsonb_array_elements(copy -> 'review') r loop
    perform public.lasar_shape(v_item, array['id', 'sourceDate', 'kind', 'reason'], array['note', 'suggestedDate', 'targetDate', 'groupId', 'edge', 'shortWeek']);
    v_kind := v_item ->> 'kind';
    if jsonb_typeof(v_item -> 'id') <> 'string' or jsonb_typeof(v_item -> 'kind') <> 'string' or jsonb_typeof(v_item -> 'reason') <> 'string'
       or v_kind not in ('lovdag', 'studiedag', 'termin', 'gruppdag', 'kort vecka')
       or (v_item ->> 'reason') not in ('missing_week', 'easter', 'holiday', 'weekend', 'outside_terms', 'jullov', 'term_edge', 'group_offering_missing',
         'group_class', 'short_week')
       or (v_item ? 'groupId' and (jsonb_typeof(v_item -> 'groupId') <> 'string' or char_length(v_item ->> 'groupId') not between 1 and 200))
       or (v_item ? 'edge' and (jsonb_typeof(v_item -> 'edge') <> 'string' or (v_item ->> 'edge') not in ('ht:start', 'ht:end', 'vt:start', 'vt:end')))
       or (v_item ? 'groupId' and v_item ? 'edge') or (frame and v_item ? 'groupId') then
      raise exception 'Ogiltig granskningspost.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    v_s := case when v_item -> 'sourceDate' = 'null'::jsonb then null else public.lasar_date(v_item -> 'sourceDate') end;
    if v_item ? 'note' then perform public.lasar_text(v_item -> 'note', 200, false); end if;
    if v_item ? 'suggestedDate' then perform public.lasar_date(v_item -> 'suggestedDate'); end if;
    if v_item ? 'targetDate' then perform public.lasar_date(v_item -> 'targetDate'); end if;
    v_id := format('copy|%s|%s|%s', v_item ->> 'reason', coalesce(v_s::text, '-'), coalesce(v_item ->> 'groupId', v_item ->> 'edge', '-'));
    if (v_item ->> 'id') <> v_id or v_id = any (v_ids) then
      raise exception 'Ogiltig granskningspost.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    v_ids := v_ids || v_id;
    if not coalesce(case
      when v_kind in ('lovdag', 'studiedag') then v_s is not null and not (v_item ? 'groupId' or v_item ? 'edge' or v_item ? 'shortWeek')
        and source #>> array['exceptions', v_s::text, 'kind'] = v_kind and (source #>> array['exceptions', v_s::text, 'note']) is not distinct from (v_item ->> 'note')
      when v_kind = 'gruppdag' then v_s is not null and v_item ? 'groupId' and not v_item ? 'shortWeek'
        and source #> array['groupDays', v_item ->> 'groupId', v_s::text] is not null
        and (source #>> array['groupDays', v_item ->> 'groupId', v_s::text, 'note']) is not distinct from (v_item ->> 'note')
      when v_kind = 'termin' then v_s is not null and v_item ? 'edge' and not v_item ? 'shortWeek'
        and source #>> array['terms', split_part(v_item ->> 'edge', ':', 1), split_part(v_item ->> 'edge', ':', 2)] = v_s::text
      else v_s is null and v_item ? 'groupId' and (v_item ->> 'reason') = 'short_week' and v_item ? 'shortWeek'
        and source #> array['shortWeeks', v_item ->> 'groupId'] = v_item -> 'shortWeek' and (v_item ->> 'note') is not distinct from (source #>> array['shortWeeks', v_item ->> 'groupId', 'reason'])
    end, false) then
      raise exception 'Granskningsposten hör inte till källan.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
  end loop;

  -- Terminskanterna: den flyttade kanten eller en granskningspost för kanten.
  foreach v_edge in array array['ht:start', 'ht:end', 'vt:start', 'vt:end'] loop
    v_src := (source #>> array['terms', split_part(v_edge, ':', 1), split_part(v_edge, ':', 2)])::date;
    v_tgt := public.lasar_date(copy #> array['terms', split_part(v_edge, ':', 1), split_part(v_edge, ':', 2)]);
    if v_tgt is distinct from public.lasar_copy_shift(v_src, 1) and not exists (select 1 from jsonb_array_elements(copy -> 'review') r
         where r.value ->> 'kind' = 'termin' and r.value ->> 'edge' = v_edge) then
      raise exception 'Terminen kommer inte ur källan.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
  end loop;

  -- Inlagda lov- och studiedagar: källans dag ett läsår tidigare, utanför påskfönstret.
  for v_e in select x.key, x.value from jsonb_each(copy -> 'exceptions') x loop
    v_t := public.lasar_date(to_jsonb(v_e.key)); v_s := public.lasar_copy_shift(v_t, -1);
    if v_s is null or public.lasar_copy_shift(v_s, 1) is distinct from v_t or (source #> array['exceptions', v_s::text]) is distinct from v_e.value
       or public.lasar_copy_easter(v_s) then
      raise exception 'Dagen kommer inte entydigt ur källan.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
  end loop;
  -- Varje dag i källan är inlagd eller granskas.
  for v_e in select x.key, x.value from jsonb_each(coalesce(source -> 'exceptions', '{}'::jsonb)) x loop
    v_t := public.lasar_copy_shift(v_e.key::date, 1);
    if not (coalesce(v_t is not null and (copy #> array['exceptions', v_t::text]) = v_e.value, false)
       or exists (select 1 from jsonb_array_elements(copy -> 'review') r where r.value ->> 'sourceDate' = v_e.key and r.value ->> 'kind' = v_e.value ->> 'kind')) then
      raise exception 'En dag i källan saknas i kopian.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
  end loop;

  -- Årskursernas gruppdagar: bara årskursgrupper, källans dag ett läsår tidigare, utanför påskfönstret. Klassdagar kopieras aldrig.
  for v_g in select x.key, x.value from jsonb_each(copy -> 'groupDays') x loop
    if v_g.key !~ '^arskurs:' or jsonb_typeof(v_g.value) <> 'object' then
      raise exception 'Bara årskursernas gruppdagar kopieras.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    for v_e in select x.key, x.value from jsonb_each(v_g.value) x loop
      v_t := public.lasar_date(to_jsonb(v_e.key)); v_s := public.lasar_copy_shift(v_t, -1); v_n := v_n + 1;
      if v_n > 2000 or v_s is null or public.lasar_copy_shift(v_s, 1) is distinct from v_t
         or (source #> array['groupDays', v_g.key, v_s::text]) is distinct from v_e.value or public.lasar_copy_easter(v_s) then
        raise exception 'Gruppdagen kommer inte entydigt ur källan.' using errcode = '22023', hint = 'lasar_invalid';
      end if;
    end loop;
  end loop;
  for v_g in select x.key, x.value from jsonb_each(coalesce(source -> 'groupDays', '{}'::jsonb)) x loop
    for v_e in select x.key, x.value from jsonb_each(v_g.value) x loop
      v_t := public.lasar_copy_shift(v_e.key::date, 1);
      if not (coalesce(v_t is not null and (copy #> array['groupDays', v_g.key, v_t::text]) = v_e.value, false)
         or exists (select 1 from jsonb_array_elements(copy -> 'review') r where r.value ->> 'sourceDate' = v_e.key and r.value ->> 'kind' = 'gruppdag'
           and r.value ->> 'groupId' = v_g.key)) then
        raise exception 'En gruppdag i källan saknas i kopian.' using errcode = '22023', hint = 'lasar_invalid';
      end if;
    end loop;
  end loop;
  -- Korta veckor läggs aldrig in; varje kort vecka i källan granskas.
  for v_g in select x.key from jsonb_each(coalesce(source -> 'shortWeeks', '{}'::jsonb)) x loop
    if not exists (select 1 from jsonb_array_elements(copy -> 'review') r where r.value ->> 'kind' = 'kort vecka' and r.value ->> 'groupId' = v_g.key) then
      raise exception 'En kort vecka i källan saknas i granskningen.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
  end loop;
end $$;

-- Granskningsposterna sparas i serverns ordning.
create function public.lasar_review_insert(year_id uuid, frame uuid, review jsonb) returns integer
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare n integer;
begin
  insert into public.school_year_review_items (school_year_id, frame_id, item_id, ordinal, source_date, kind, reason, note, suggested_date, target_date,
    group_ref, edge, short_week)
  select year_id, frame, r.value ->> 'id', (r.n - 1)::integer, (r.value ->> 'sourceDate')::date, r.value ->> 'kind', r.value ->> 'reason', r.value ->> 'note',
    (r.value ->> 'suggestedDate')::date, (r.value ->> 'targetDate')::date, r.value ->> 'groupId', r.value ->> 'edge', r.value -> 'shortWeek'
  from jsonb_array_elements(review) with ordinality r(value, n) order by r.n;
  get diagnostics n = row_count;
  return n;
end $$;

-- Posterna i kontraktets form (LasarReviewItem), i serverns ordning.
create function public.lasar_review_json(year_id uuid, frame uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', r.item_id, 'sourceDate', r.source_date, 'kind', r.kind, 'reason', r.reason, 'resolved', r.resolution is not null)
    || jsonb_strip_nulls(jsonb_build_object('note', r.note, 'suggestedDate', r.suggested_date, 'targetDate', r.target_date, 'groupId', r.group_ref, 'edge', r.edge,
      'shortWeek', r.short_week)) order by r.ordinal), '[]'::jsonb)
  from public.school_year_review_items r where (year_id is not null and r.school_year_id = year_id) or (frame is not null and r.frame_id = frame)
$$;

-- Historikradens kommentar vid kopiering.
create function public.lasar_copy_comment(n integer, frame boolean) returns text
language sql immutable set search_path = pg_catalog, public as $$
  select case when n = 0 then 'Alla dagar flyttades till samma vecka och veckodag.'
    else format('%s %s inte flyttas entydigt och är inte inlagda. Granska dem innan %s.', n, case when n = 1 then 'dag kunde' else 'dagar kunde' end,
      case when frame then 'ramen ges ut' else 'förslaget skickas' end) end
$$;

-- Skolans kopia (D-04): källan är skolans gällande fastställda version för föregående läsår hos samma huvudman. Utkastet får
-- kopians terminer och dagar (prövade som skolans förslag) och årskursernas gruppdagar (prövade som set_group_days).
create function public.lasar_create_copy(a public.access_assignments, unit uuid, year integer, copy jsonb) returns public.school_years
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_src public.school_years; y public.school_years; v_g record; v_e record; n integer;
begin
  perform public.lasar_shape(copy, array['sourceVersionId', 'terms', 'exceptions', 'groupDays', 'review']);
  v_src := public.lasar_current(unit, year - 1);
  if v_src.id is null or v_src.organizer_id <> a.organizer_id then
    raise exception 'Förra läsåret har ingen fastställd kalender.' using errcode = '40001', hint = 'lasar_not_found';
  end if;
  if public.lasar_uuid(copy -> 'sourceVersionId') <> v_src.id then
    raise exception 'Källan är inte förra läsårets gällande version.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  perform public.lasar_copy_check(public.lasar_calendar_json(v_src), copy, false);
  y := public.lasar_create_proposal(a, unit, year, jsonb_build_object('terms', copy -> 'terms', 'exceptions', copy -> 'exceptions'));
  for v_g in select x.key, x.value from jsonb_each(copy -> 'groupDays') x order by x.key collate "C" loop
    for v_e in select x.key, x.value from jsonb_each(v_g.value) x order by x.key loop
      perform public.lasar_shape(v_e.value, array['cause'], array['note']);
      perform public.lasar_set_group_days(y, jsonb_build_object('op', 'set_group_days', 'groupId', v_g.key, 'dates', jsonb_build_array(v_e.key), 'cause', v_e.value -> 'cause')
        || case when v_e.value ? 'note' then jsonb_build_object('note', v_e.value -> 'note') else '{}'::jsonb end);
    end loop;
  end loop;
  n := public.lasar_review_insert(y.id, null, copy -> 'review');
  perform public.lasar_history_add(y.id, 'copy', public.lasar_copy_comment(n, false));
  return y;
end $$;

-- Ramens kopia (D-04): källan är huvudmannens senast utgivna ram för föregående läsår. Utkastet prövas som ramens förslag.
create function public.lasar_frame_create_copy(a public.access_assignments, year integer, copy jsonb) returns public.school_year_frames
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_src public.school_year_frames := public.lasar_frame_latest(a.organizer_id, year - 1); f public.school_year_frames; n integer;
begin
  perform public.lasar_shape(copy, array['sourceVersionId', 'terms', 'exceptions', 'groupDays', 'review']);
  if v_src.id is null then
    raise exception 'Förra årets ram är inte utgiven.' using errcode = '40001', hint = 'lasar_not_found';
  end if;
  if public.lasar_uuid(copy -> 'sourceVersionId') <> v_src.id then
    raise exception 'Källan är inte förra årets utgivna ram.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  perform public.lasar_copy_check(public.lasar_frame_calendar_json(v_src), copy, true);
  f := public.lasar_frame_create_proposal(a, year, jsonb_build_object('terms', copy -> 'terms', 'exceptions', copy -> 'exceptions'));
  n := public.lasar_review_insert(null, f.id, copy -> 'review');
  perform public.lasar_frame_event(f.id, 'copy', public.lasar_copy_comment(n, true));
  return f;
end $$;

-- resolve_review: en post i versionen markeras som löst (inserted, changed eller dismissed) av aktören ur sessionen. När den
-- sista posten löses skrivs historikraden ”{n} dagar granskade”. En redan löst post nekas med lasar_revision_conflict.
create function public.lasar_resolve_review(a public.access_assignments, year_id uuid, frame uuid, op jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_item public.school_year_review_items; c record; v_comment text;
begin
  perform public.lasar_shape(op, array['op', 'itemId', 'resolution']);
  if jsonb_typeof(op -> 'itemId') <> 'string' or jsonb_typeof(op -> 'resolution') <> 'string' or char_length(op ->> 'itemId') not between 1 and 200
     or (op ->> 'resolution') not in ('inserted', 'changed', 'dismissed') then
    raise exception 'Ogiltig granskning.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  select * into v_item from public.school_year_review_items r
   where ((year_id is not null and r.school_year_id = year_id) or (frame is not null and r.frame_id = frame)) and r.item_id = op ->> 'itemId' for update;
  if not found then raise exception 'Granskningsposten finns inte.' using errcode = '22023', hint = 'lasar_invalid'; end if;
  if v_item.resolution is not null then
    raise exception 'Posten är redan granskad.' using errcode = '40001', hint = 'lasar_revision_conflict';
  end if;
  update public.school_year_review_items r set resolution = op ->> 'resolution', resolved_by_assignment = a.id, resolved_at = clock_timestamp() where r.id = v_item.id;
  select count(*) filter (where r.resolution is null) open, count(*) filter (where r.resolution = 'inserted') inserted,
    count(*) filter (where r.resolution = 'changed') changed, count(*) filter (where r.resolution = 'dismissed') dismissed into c
    from public.school_year_review_items r where (year_id is not null and r.school_year_id = year_id) or (frame is not null and r.frame_id = frame);
  if c.open = 0 then
    v_comment := format('Inlagda %s, ändrade %s och utan ändring %s.', c.inserted, c.changed, c.dismissed);
    if year_id is not null then perform public.lasar_history_add(year_id, 'review_done', v_comment);
    else perform public.lasar_frame_event(frame, 'review_done', v_comment); end if;
  end if;
end $$;

-- Förslaget skickas och ramen ges ut bara när alla kopierade dagar är granskade (T-05.1.1-37).
create function public.lasar_review_require(year_id uuid, frame uuid) returns void
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if exists (select 1 from public.school_year_review_items r where r.resolution is null
       and ((year_id is not null and r.school_year_id = year_id) or (frame is not null and r.frame_id = frame))) then
    raise exception 'Kopierade dagar är inte granskade.' using errcode = '40001', hint = 'lasar_review_open';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Historik, läsning och kommandon (create or replace)
-- ---------------------------------------------------------------------------

-- ”{n} dagar granskade” för versionens granskningsposter.
create function public.lasar_review_count_text(year_id uuid, frame uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select case when n = 1 then '1 dag granskad' else n || ' dagar granskade' end
    from (select count(*) n from public.school_year_review_items r
      where (year_id is not null and r.school_year_id = year_id) or (frame is not null and r.frame_id = frame)) c
$$;

-- Som 20261112120000 plus kopiering och granskning (D-04).
create or replace function public.lasar_history_add(version_id uuid, action text, comment text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
begin
  if action not in ('create', 'reset_to_proposal', 'comment', 'submit', 'withdraw', 'return', 'approve', 'request_change', 'withdraw_request',
       'decline_request', 'reopen', 'create_frame', 'take_frame_changes', 'keep_school_calendar', 'copy', 'review_done') then
    raise exception 'Ogiltig historik för läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  insert into public.school_year_events (school_year_id, actor_role, action, comment, created_at)
  values (version_id, 'rektor', 'lasar_' || action, comment, clock_timestamp());
end $$;

-- Som 20261112120000 plus ”Kopierat från {förra läsåret}” och ”{n} dagar granskade”.
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
        when 'lasar_take_frame_changes' then 'Ramens ändringar intagna' when 'lasar_keep_school_calendar' then 'Skolans kalender behållen'
        when 'lasar_copy' then format('Kopierat från %s/%s', v.start_year - 1, lpad((v.start_year % 100)::text, 2, '0'))
        when 'lasar_review_done' then public.lasar_review_count_text(e.school_year_id, null) end,
      'comment', e.comment, 'version', v.version) entry
    from public.school_year_events e
    join public.school_years v on v.id = e.school_year_id
    left join public.identities i on i.id = e.actor_identity_id
    where v.unit_id = y.unit_id and v.start_year = y.start_year and v.organizer_id = y.organizer_id and v.version <= y.version
      and e.actor_identity_id is not null and e.actor_role in ('huvudman', 'rektor', 'administrator')
      and e.action in ('lasar_create', 'lasar_reset_to_proposal', 'lasar_comment', 'lasar_submit', 'lasar_withdraw', 'lasar_return', 'lasar_approve',
        'lasar_request_change', 'lasar_withdraw_request', 'lasar_decline_request', 'lasar_reopen', 'lasar_create_frame', 'lasar_take_frame_changes',
        'lasar_keep_school_calendar', 'lasar_copy', 'lasar_review_done')
    order by e.created_at desc, e.id desc limit 500) h
$$;

-- Som 20261112120000 plus ramens kopiering och granskning.
create or replace function public.lasar_frame_history(f public.school_year_frames) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(h.entry order by h.at desc, h.id desc), '[]'::jsonb) from (
    select e.id, e.created_at at, jsonb_build_object('id', e.id, 'role', 'huvudman', 'actorName', public.lasar_display_name(i.display_name),
      'at', to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'action', case e.action when 'create' then 'Ram skapad' when 'create_frame' then 'Ny ramversion' when 'reset_to_proposal' then 'Förslag återställt'
        when 'publish' then 'Ramen utgiven'
        when 'copy' then format('Kopierat från %s/%s', v.start_year - 1, lpad((v.start_year % 100)::text, 2, '0'))
        when 'review_done' then public.lasar_review_count_text(null, e.frame_id) end,
      'comment', e.comment, 'version', v.version) entry
    from public.school_year_frame_events e
    join public.school_year_frames v on v.id = e.frame_id
    left join public.identities i on i.id = e.actor_identity_id
    where v.organizer_id = f.organizer_id and v.start_year = f.start_year and v.version <= f.version
    order by e.created_at desc, e.id desc limit 500) h
$$;

-- Som 20261112120000 plus Kopiera förra läsåret i båda arbetssätten (D-04; i arbetssättet ram först när ramen är utgiven, D-14)
-- och versionens granskningsposter.
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
      when v_mode = 'eget' then '["proposal", "copy"]'::jsonb when v_latest.id is not null then '["frame", "copy"]'::jsonb else '[]'::jsonb end,
    'canPublishFrame', false, 'canSetMode', false);
  return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'target', jsonb_build_object('kind', 'school', 'unitId', unit), 'schoolYear', year,
    'schoolName', left(btrim(v_unit.name), 200), 'schoolTypes', v_types, 'mode', v_mode, 'modeLocked', public.lasar_mode_locked(year), 'versions', v_versions,
    'calendar', case when v_year.id is null then null else public.lasar_calendar_json(v_year) end,
    'capabilities', v_caps, 'editableFrom', case when v_year.id is null then null else public.lasar_editable_from(v_year) end,
    'changeRequest', public.lasar_change_request_json(unit, year),
    'review', case when v_year.id is null then '[]'::jsonb else public.lasar_review_json(v_year.id, null) end,
    'frame', case when v_mode = 'ram' or v_year.frame_id is not null or v_year.frame_ack_id is not null then
      jsonb_build_object('current', public.lasar_frame_ref(v_year.frame_id), 'latest', public.lasar_frame_ref(v_latest.id), 'acknowledgedVersionId', v_year.frame_ack_id)
      end,
    'groups', v_groups, 'teaching', public.lasar_teaching(unit, year),
    'previousYearAvailable', (public.lasar_current(unit, year - 1)).id is not null);
end $$;

-- Som 20261112120000 plus kopiering av förra årets ram (canCreate copy) och ramens granskningsposter.
create or replace function public.lasar_frame_detail(a public.access_assignments, year integer, version_id uuid) returns jsonb
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
      'canCreate', case when jsonb_array_length(v_versions) = 0 then '["proposal", "copy"]'::jsonb when not v_open and v_latest.id is not null then '["frame"]'::jsonb
        else '[]'::jsonb end,
      'canPublishFrame', coalesce(v_frame.status = 'utkast', false), 'canSetMode', not v_locked),
    'editableFrom', null, 'changeRequest', null,
    'review', case when v_frame.id is null then '[]'::jsonb else public.lasar_review_json(null, v_frame.id) end, 'frame', null, 'groups', '[]'::jsonb,
    'teaching', jsonb_build_object('classes', '[]'::jsonb, 'imClassIds', '[]'::jsonb),
    'previousYearAvailable', (public.lasar_frame_latest(a.organizer_id, year - 1)).id is not null);
end $$;

-- Som 20261112120000 plus kopiering av förra årets utgivna ram, resolve_review och spärren för olösta poster vid utgivning.
create or replace function public.lasar_frame_command(a public.access_assignments, s public.app_sessions, input jsonb, q jsonb, v_kind text, v_action text,
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
        if not input ? 'copy' then raise exception 'Kopian räknas fram i servern.' using errcode = '22023', hint = 'lasar_invalid'; end if;
        if exists (select 1 from public.school_year_frames x where x.organizer_id = a.organizer_id and x.start_year = v_year) then
          raise exception 'Ramen finns redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
        end if;
        f := public.lasar_frame_create_copy(a, v_year, input -> 'copy');
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
          when 'resolve_review' then perform public.lasar_resolve_review(a, null, f.id, v_op);
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
    perform public.lasar_review_require(null, f.id);
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

-- Som 20261112120000 plus kopiering av förra läsåret (källan copy med serverns innehåll), resolve_review och spärren för olösta
-- poster vid submit (lasar_review_open).
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
    perform public.lasar_shape(input, array['commandId', 'target', 'schoolYear', 'versionId', 'expectedRevision', 'ops', 'payloadHash'], array['proposal', 'copy']);
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
    -- Kopians innehåll står i journalen bara när det finns, så att tidigare journalförda kommandon återspelas oförändrat.
    if input ? 'copy' then q := q || jsonb_build_object('copy', input -> 'copy'); end if;
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
    -- Kopian räknas fram i servern ur förra årets källa och hör bara till create med källan copy (D-04, T-05.1.1-35).
    if input ? 'copy' and not (v_action = 'create' and input #>> '{ops,0,source}' = 'copy') then
      raise exception 'Kopian hör bara till create med källan copy.' using errcode = '22023', hint = 'lasar_invalid';
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
      if v_source = 'copy' and not input ? 'copy' then
        raise exception 'Kopian räknas fram i servern.' using errcode = '22023', hint = 'lasar_invalid';
      end if;
      if v_source is null or v_source not in ('proposal', 'frame', 'copy') or (v_source = 'proposal' and v_mode <> 'eget') or (v_source = 'frame' and v_mode <> 'ram') then
        raise exception 'Startvalet hör inte till arbetssättet.' using errcode = '22023', hint = 'lasar_invalid';
      end if;
      if exists (select 1 from public.school_years x where x.unit_id = v_unit and x.start_year = v_year) then
        raise exception 'Kalendern finns redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
      end if;
      if v_source = 'copy' then
        -- Kopian har ingen ramversion; i arbetssättet ram får skolan ramens markering och tar in ramen uttryckligen (D-05, D-15).
        y := public.lasar_create_copy(a, v_unit, v_year, input -> 'copy');
      elsif v_source = 'frame' then
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
          when 'take_frame_changes', 'keep_school_calendar' then y := public.lasar_take_frame_changes(y, v_op);
          when 'resolve_review' then perform public.lasar_resolve_review(a, y.id, null, v_op);
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
    if v_action = 'submit' then perform public.lasar_review_require(y.id, null); end if;
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
-- 4. Stängt: inga rättigheter för Worker eller klientroller
-- ---------------------------------------------------------------------------
revoke all on function public.lasar_review_guard(), public.lasar_copy_shift(date, integer), public.lasar_copy_easter(date),
  public.lasar_copy_check(jsonb, jsonb, boolean), public.lasar_review_insert(uuid, uuid, jsonb), public.lasar_review_json(uuid, uuid),
  public.lasar_copy_comment(integer, boolean), public.lasar_create_copy(public.access_assignments, uuid, integer, jsonb),
  public.lasar_frame_create_copy(public.access_assignments, integer, jsonb), public.lasar_resolve_review(public.access_assignments, uuid, uuid, jsonb),
  public.lasar_review_require(uuid, uuid), public.lasar_review_count_text(uuid, uuid)
  from public, anon, authenticated, service_role, skolplattform_worker;
