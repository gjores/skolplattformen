-- 05.1.1-06: läsårskalenderns versioner (D-10), gällande version för alla läsare (D-19, Pitfall 3, 4 och 6) och
-- tracerns skyddade ingångar lasar_read/lasar_command (rektor föreslår, huvudmannen fastställer).
-- 05.1.1-07: hela utkast- och beslutsflödet för skolans version (set_term, set_notes, comment, reset_to_proposal,
-- withdraw, return) med mandat per åtgärd (D-18), historik med verifierad aktör (A-16), statusvägen lasar_status
-- och fullständiga regler med paritet mot lasar-model.ts (LASAR-03). Filen var inte installerad när den byggdes ut.
--
-- En rad i school_years är från och med denna migration en version av skolenhetens kalender för ett läsår.
-- Versionerna ligger på plats: barntabellernas nycklar (school_year_id) behålls och ingen rad nycklas om.
-- Allt som frågar efter "skolans kalender" går via lasar_current(unit, year), den gällande fastställda versionen,
-- eller anger uttryckligen en version. Inget nytt enumvärde (Pitfall 1): ersatt version = superseded_by.
--
-- Inga rättigheter ges här. Alla nya funktioner och tabeller är stängda för Worker och klientroller tills
-- den separat granskade grant-migrationen 20261111190000_lasar_worker_access.sql.
--
-- SS 12000 (SIS OpenAPI 2.1.0, SS12000:2020): läsår, terminer, lovdagar, studiedagar, skoldagar och
-- kalenderversioner saknar objekt i standarden och exporteras inte. Kalendern nycklas på unit_id
-- (Organisation, organisationType=Skolenhet) och version, aldrig på namn. Ingen standardefterlevnad påstås.

-- ---------------------------------------------------------------------------
-- 1. Versioner på plats i school_years
-- ---------------------------------------------------------------------------
alter table public.school_years drop constraint school_years_unit_id_start_year_key;
alter table public.school_years
  add column version integer not null default 1 check (version between 1 and 10000),
  add column revision integer not null default 0 check (revision >= 0),
  add column superseded_at timestamptz,
  add column superseded_by uuid references public.school_years (id),
  add column previous_id uuid references public.school_years (id),
  add column content_hash text check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  add column change_reason text check (change_reason is null or char_length(change_reason) between 1 and 4000),
  add column decision_comment text check (decision_comment is null or char_length(decision_comment) between 1 and 4000),
  add constraint school_years_version_key unique (unit_id, start_year, version),
  add constraint school_years_superseded_pair check ((superseded_at is null) = (superseded_by is null)),
  add constraint school_years_superseded_decided check (superseded_by is null or status = 'faststalld'),
  add constraint school_years_not_self check (superseded_by is distinct from id and previous_id is distinct from id);
-- En öppen version och en gällande fastställd version per skolenhet och läsår.
create unique index school_years_one_open on public.school_years (unit_id, start_year)
  where status in ('utkast', 'forslag', 'atersand') and superseded_by is null;
create unique index school_years_one_current on public.school_years (unit_id, start_year)
  where status = 'faststalld' and superseded_by is null;

-- Ett skickat, fastställt eller ersatt läsår ändras inte i sitt innehåll. Statusbyten sker i kommandona.
create or replace function public.guard_decided_school_year()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
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

create or replace function public.guard_school_year_days()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  current_status public.school_year_status;
  replaced uuid;
  year_id uuid;
begin
  year_id := coalesce(new.school_year_id, old.school_year_id);
  select y.status, y.superseded_by into current_status, replaced from public.school_years y where y.id = year_id;
  if current_status in ('forslag', 'faststalld') or replaced is not null then
    raise exception 'Dagarna i ett skickat, fastställt eller ersatt läsår ändras inte.';
  end if;
  return coalesce(new, old);
end $$;

-- Historikrader med verifierad aktör (A-16). Kolumnerna är tillägg; äldre rader behåller alla sina värden.
-- Kalenderns rader (action lasar_*) skrivs bara av de skyddade ingångarna; aktören härleds ur den låsta sessionen
-- och uppdraget, aldrig ur begäran. Samma mönster som timplanens gymnasiehistorik (20261005110000).
alter table public.school_year_events
  add column actor_identity_id uuid references public.identities (id),
  add column session_id uuid references public.app_sessions (id),
  add column membership_id uuid references public.memberships (id),
  add column assignment_id uuid references public.access_assignments (id);
create policy school_year_events_lasar_rpc_only on public.school_year_events as restrictive for all to public
  using (actor_identity_id is null and session_id is null and membership_id is null and assignment_id is null)
  with check (actor_identity_id is null and session_id is null and membership_id is null and assignment_id is null);

create function public.lasar_event_actor() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions;
begin
  if new.action like 'lasar\_%' then
    a := public.phase3_actor(); s := public.phase5_programplan_session_check();
    if a.function not in ('huvudman', 'rektor', 'administrator') then
      raise exception 'Läsårskalenderns historik nekas.' using errcode = '42501';
    end if;
    new.actor := null; new.actor_role := a.function::text::public.app_role;
    new.actor_identity_id := s.identity_id; new.session_id := s.id; new.membership_id := a.membership_id; new.assignment_id := a.id;
  else
    -- Äldre väg oförändrad (set_event_actor), men utan kalenderns aktörsfält.
    if new.actor_identity_id is not null or new.session_id is not null or new.membership_id is not null or new.assignment_id is not null
       or public.current_actor_auth_user_id() is null or public.current_app_role() is null then
      raise exception 'Händelse utan serverkontext (aktör/roll saknas)' using errcode = '42501';
    end if;
    new.actor := public.current_actor_auth_user_id(); new.actor_role := public.current_app_role();
  end if;
  return new;
end $$;
drop trigger school_year_events_actor on public.school_year_events;
create trigger school_year_events_actor before insert on public.school_year_events for each row execute function public.lasar_event_actor();

-- ---------------------------------------------------------------------------
-- 2. Accessor, skoldagar och kontrollsumma
-- ---------------------------------------------------------------------------
-- Den gällande fastställda versionen, eller en rad med bara null om ingen finns.
create function public.lasar_current(unit uuid, year integer) returns public.school_years
language sql stable security definer set search_path = pg_catalog, public as $$
  select s.* from public.school_years s
   where s.unit_id = unit and s.start_year = year and s.status = 'faststalld' and s.superseded_by is null
$$;

-- Skoldagar per termin i en version: vardagar inom terminen som varken är helgdag eller lov-/studiedag.
-- Samma räkning som tjanst_school_weeks hade före versionerna och som summarize i lasar-model.ts.
create function public.lasar_school_days(version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_year public.school_years; v_ht integer; v_vt integer;
begin
  select * into v_year from public.school_years s where s.id = version_id;
  if not found then return null; end if;
  select count(*) filter (where d <= v_year.ht_end), count(*) filter (where d >= v_year.vt_start) into v_ht, v_vt
    from generate_series(v_year.ht_start, v_year.vt_end, interval '1 day') g(x) cross join lateral (select g.x::date d) dd
   where (d between v_year.ht_start and v_year.ht_end or d between v_year.vt_start and v_year.vt_end)
     and extract(isodow from d) < 6 and not public.tjanst_is_holiday(d)
     and not exists (select 1 from public.school_year_days e where e.school_year_id = v_year.id and e.day = d);
  return jsonb_build_object('htSchoolDays', v_ht, 'vtSchoolDays', v_vt);
end $$;

-- Kanonisk form som lasarContentCanonical i web/lib/lasar-content.ts; listorna sorteras på UTF-8-byte (collate "C").
-- Indata har LasarContent-formen: {version, frameVersionId, terms, exceptions, groupDays, shortWeeks}.
create function public.lasar_content_hash_json(content jsonb) returns text
language sql immutable security definer set search_path = pg_catalog, public as $$
  select public.tjanst_hash(jsonb_build_array('lasar_content_v1', content -> 'version', coalesce(content -> 'frameVersionId', 'null'::jsonb),
    jsonb_build_array(content #> '{terms,ht,start}', content #> '{terms,ht,end}', content #> '{terms,vt,start}', content #> '{terms,vt,end}'),
    coalesce((select jsonb_agg(jsonb_build_array(e.key, e.value -> 'kind', coalesce(e.value -> 'note', 'null'::jsonb)) order by e.key collate "C")
      from jsonb_each(content -> 'exceptions') e), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_array(g.key, d.key, d.value -> 'cause', coalesce(d.value -> 'note', 'null'::jsonb)) order by g.key collate "C", d.key collate "C")
      from jsonb_each(content -> 'groupDays') g cross join lateral jsonb_each(g.value) d), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_array(w.key, w.value -> 'columnId', w.value -> 'weekday', w.value -> 'reason') order by w.key collate "C")
      from jsonb_each(content -> 'shortWeeks') w), '[]'::jsonb)))
$$;

-- Kontrollsumman för en lagrad version, ur dess rader. Används när content_hash saknas (Pitfall 6: fixturer och
-- äldre rader) och vid fastställande. Ramversion finns först med ramen (plan 10) och är här null.
create function public.lasar_content_hash(version_id uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select public.lasar_content_hash_json(jsonb_build_object('version', y.version, 'frameVersionId', null,
    'terms', jsonb_build_object('ht', jsonb_build_object('start', y.ht_start, 'end', y.ht_end), 'vt', jsonb_build_object('start', y.vt_start, 'end', y.vt_end)),
    'exceptions', coalesce((select jsonb_object_agg(d.day::text, jsonb_strip_nulls(jsonb_build_object('kind', d.kind, 'note', d.note)))
      from public.school_year_days d where d.school_year_id = y.id), '{}'::jsonb),
    'groupDays', coalesce((select jsonb_object_agg(g.group_key, g.days) from (
      select x.group_key, jsonb_object_agg(x.day::text, jsonb_strip_nulls(jsonb_build_object('cause', x.cause, 'note', x.note))) days
        from public.school_year_group_days x where x.school_year_id = y.id group by x.group_key) g), '{}'::jsonb),
    'shortWeeks', coalesce((select jsonb_object_agg(w.group_key, jsonb_build_object('columnId', w.column_id, 'weekday', w.weekday, 'reason', w.reason))
      from public.school_year_short_weeks w where w.school_year_id = y.id), '{}'::jsonb)))
  from public.school_years y where y.id = version_id
$$;

-- ---------------------------------------------------------------------------
-- 3. Befintliga läsare läser den gällande fastställda versionen
-- ---------------------------------------------------------------------------
-- Tjänstefördelningens IM-behov (D-20): samma returform {htSchoolDays, vtSchoolDays} eller null som tidigare.
create or replace function public.tjanst_school_weeks(unit uuid, school_year integer) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_id uuid;
begin
  v_id := (public.lasar_current(unit, school_year)).id;
  if v_id is null then return null; end if;
  return public.lasar_school_days(v_id);
end $$;

-- D-19: programplanens reservstart läser bara den gällande fastställda versionen. Ett utkast ändrar inte gymnasiets flöde.
create or replace function public.phase5_programplan_starts_on(o public.offerings) returns date
language sql stable security definer set search_path = pg_catalog, public as $$
 select coalesce(
  (select min((p.basis_reference->>'startedOn')::date) from public.point_plans p
   where p.offering_id=o.id and p.organizer_id=o.organizer_id and p.basis_reference is not null
    and p.basis_reference->>'startedOn' ~ '^\d{4}-\d{2}-\d{2}$'),
  (select c.ht_start from public.lasar_current(o.unit_id, o.start_year) c where c.id is not null and c.organizer_id = o.organizer_id))
$$;

-- Pitfall 3: tjänstefördelningens basisHash bär bara den gällande versionens {versionId, version, contentHash}.
-- Ett sparat kalenderutkast ändrar den inte; en ny fastställd version gör det. Resten av funktionen är oförändrad
-- från 20261030112000_elective_tjanst_sources.sql.
create or replace function public.tjanst_year_core(a public.access_assignments,unit uuid,year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d public.tjanst_distributions;v public.tjanst_versions;needs jsonb;people jsonb:='[]';p public.staff_people;
 duties jsonb;candidate jsonb;calendar jsonb;source_state jsonb;base jsonb;rows jsonb;specials jsonb;joints jsonb;person_hash text;
begin
 if a.function not in ('rektor','administrator') or year is null or year not between 2000 and 2100 then
  raise exception 'Year planning denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=year and x.customer_id=a.customer_id;
 select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status in ('draft','published') order by (x.status='draft') desc,x.version_no desc limit 1;
 needs:=public.tjanst_working_needs(unit,year); -- exactly once per request, passed through all row/batch calculations
 for p in select x.* from public.staff_people x where x.customer_id=a.customer_id and x.organizer_id=a.organizer_id
  and public.tjanst_person_at_school(a,x.id,unit,year) order by x.family_name collate "C",x.given_name collate "C",x.id loop
  select coalesce(jsonb_agg(jsonb_build_object('dutyId',s.id,'startsOn',s.starts_on,'endsOn',s.ends_on,'percent',s.percent) order by s.starts_on,s.id),'[]') into duties
   from public.staff_school_duties s where s.staff_person_id=p.id and s.unit_id=unit
    and daterange(s.starts_on,s.ends_on,'[]')&&daterange(make_date(year,7,1),make_date(year+1,6,30),'[]');
  if jsonb_array_length(duties)>200 then raise exception 'Duty catalog exceeds explicit limit' using errcode='54000',hint='tjanst_catalog_incomplete';end if;
  person_hash:=public.tjanst_year_hash('person',jsonb_build_object('unitId',unit,'schoolYear',year,'personId',p.id,
    'personRevision',p.revision,'draft',p.status='draft','duties',duties));
  candidate:=jsonb_build_object('personId',p.id,'displayName',left(p.given_name||' '||p.family_name,200),'draft',p.status='draft',
   'shareHere',(select max((x.value->>'percent')::integer) from jsonb_array_elements(duties) x),'duties',duties,
   'personBasisHash',person_hash,'qualificationStatus','unknown');
  people:=people||jsonb_build_array(candidate);
 end loop;
 if jsonb_array_length(people)>5000 then raise exception 'Year catalog exceeds explicit limit' using errcode='54000',hint='tjanst_catalog_incomplete';end if;
 select jsonb_build_object('versionId',c.id,'version',c.version,'contentHash',coalesce(c.content_hash,public.lasar_content_hash(c.id)))
  into calendar from public.lasar_current(unit,year) c where c.id is not null;
 -- Include source revisions even where a source change leaves displayed minutes unchanged.
 select coalesce(jsonb_agg(jsonb_build_object('class',to_jsonb(c),'link',to_jsonb(l),'planRevision',t.revision,'planStatus',t.status,
   'planDecision',t.decided_on) order by c.id),'[]') into source_state
  from public.school_classes c join public.offerings o on o.id=c.offering_id left join public.class_timplans l on l.class_id=c.id and l.start_year=year
  left join public.timplans t on t.id=l.timplan_id where c.unit_id=unit and public.phase5_class_cohort_year_fits(c,year)
   and ((o.kind='gymnasium' and c.start_year between year-2 and year) or (o.kind<>'gymnasium' and c.start_year=year));
 select coalesce(jsonb_agg(jsonb_set(public.tjanst_row_json(r,public.tjanst_need(unit,year,r.source_key)),'{jointGroupId}',coalesce((select to_jsonb(m.group_id) from public.tjanst_joint_members m where m.row_id=r.id),'null'::jsonb)) order by r.id),'[]')
  into rows from public.tjanst_rows r where r.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'lineageId',s.lineage_id,'kind',s.kind,'label',s.label,'personId',s.staff_person_id,
  'classId',s.class_id,'ht',s.ht_minutes,'vt',s.vt_minutes,'comment',s.comment) order by s.id),'[]') into specials
  from public.tjanst_special_assignments s where s.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'lineageId',g.lineage_id,'name',g.name,
  'rowIds',coalesce((select jsonb_agg(m.row_id order by m.row_id) from public.tjanst_joint_members m where m.group_id=g.id),'[]'),
  'teachers',coalesce((select jsonb_agg(jsonb_build_object('personId',tt.staff_person_id,'ht',tt.ht_minutes,'vt',tt.vt_minutes) order by tt.staff_person_id)
    from public.tjanst_joint_teacher_time tt where tt.group_id=g.id),'[]')) order by g.id),'[]') into joints from public.tjanst_joint_groups g where g.version_id=v.id;
 base:=jsonb_build_object('contractVersion','tjanst_year_v1','unitId',unit,'schoolYear',year,'currentRevision',coalesce(d.revision,0),'baseVersionId',v.id);
 base:=base||jsonb_build_object('basisHash',public.tjanst_year_hash('basis',jsonb_build_object('customerId',a.customer_id,'actorId',a.membership_id,
  'assignmentId',a.id,'unitId',unit,'schoolYear',year,'baseVersionId',v.id,'currentRevision',coalesce(d.revision,0),'asOf',public.app_today(),
  'needs',needs,'sources',source_state,'calendar',calendar,'groups',public.tjanst_group_needs(unit,year))));
 return jsonb_build_object('base',base,'needs',needs,'groups',public.tjanst_group_needs(unit,year),'candidates',people,'rows',rows,'specials',specials,'joints',joints);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Kommandojournal
-- ---------------------------------------------------------------------------
create table public.lasar_commands (
  command_id uuid primary key,
  kind text not null check (kind in ('command', 'decision')),
  action text not null check (action ~ '^[a-z][a-z_]{0,39}$'),
  customer_id uuid not null,
  organizer_id uuid not null,
  unit_id uuid not null references public.school_units (id),
  school_year integer not null check (school_year between 2000 and 2100),
  school_year_id uuid not null references public.school_years (id),
  actor_identity_id uuid not null references public.identities (id),
  assignment_id uuid not null references public.access_assignments (id),
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  envelope jsonb not null check (jsonb_typeof(envelope) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organizer_id, customer_id) references public.organizers (id, customer_id)
);
create index lasar_commands_year_idx on public.lasar_commands (unit_id, school_year, created_at);
alter table public.lasar_commands enable row level security;
alter table public.lasar_commands force row level security;
revoke all on public.lasar_commands from public, anon, authenticated, service_role, skolplattform_worker;

-- ---------------------------------------------------------------------------
-- 5. Tolkhjälp (samma regler som web/lib/lasar-contract.ts)
-- ---------------------------------------------------------------------------
create function public.lasar_shape(v jsonb, required text[], optional text[] default '{}') returns jsonb
language plpgsql immutable set search_path = pg_catalog, public as $$
begin
  if jsonb_typeof(v) is distinct from 'object' or not (v ?& required)
     or exists (select 1 from jsonb_object_keys(v) k where not (k = any (required) or k = any (optional))) then
    raise exception 'Ogiltig begäran för läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  return v;
end $$;

create function public.lasar_uuid(v jsonb) returns uuid
language plpgsql immutable set search_path = pg_catalog, public as $$
begin
  if jsonb_typeof(v) is distinct from 'string'
     or (v #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Ogiltig identitet i läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  return (v #>> '{}')::uuid;
end $$;

create function public.lasar_int(v jsonb, minimum integer, maximum integer) returns integer
language plpgsql immutable set search_path = pg_catalog, public as $$
declare n numeric;
begin
  if jsonb_typeof(v) is distinct from 'number' then
    raise exception 'Ogiltigt tal i läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  n := (v #>> '{}')::numeric;
  if trunc(n) <> n or n < minimum or n > maximum then
    raise exception 'Ogiltigt tal i läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  return n::integer;
end $$;

create function public.lasar_date(v jsonb) returns date
language plpgsql immutable set search_path = pg_catalog, public as $$
declare d date;
begin
  if jsonb_typeof(v) is distinct from 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Ogiltigt datum i läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  begin d := (v #>> '{}')::date;
  exception when others then raise exception 'Ogiltigt datum i läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid'; end;
  if to_char(d, 'YYYY-MM-DD') <> (v #>> '{}') then
    raise exception 'Ogiltigt datum i läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  return d;
end $$;

-- Text utan omgivande blanktecken och utan styrtecken; fri text (multiline) tillåter radbrytning.
create function public.lasar_text(v jsonb, maximum integer, allow_empty boolean, multiline boolean default false) returns text
language plpgsql immutable set search_path = pg_catalog, public as $$
declare t text;
begin
  if jsonb_typeof(v) is distinct from 'string' then
    raise exception 'Ogiltig text i läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  t := v #>> '{}';
  if t ~ '^[[:space:]]' or t ~ '[[:space:]]$' or char_length(t) > maximum or (not allow_empty and t = '')
     or (multiline and t ~ '[\x01-\x09\x0b-\x1f\x7f]') or (not multiline and t ~ '[[:cntrl:]]') then
    raise exception 'Ogiltig text i läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  return t;
end $$;

-- Målet i tracern är en skola. Huvudmannens ram (D-08) kommer i plan 10.
create function public.lasar_target(v jsonb) returns uuid
language plpgsql immutable set search_path = pg_catalog, public as $$
begin
  if jsonb_typeof(v) = 'object' and v ->> 'kind' = 'frame' then
    raise exception 'Huvudmannens ram finns inte ännu.' using errcode = '22023', hint = 'lasar_unsupported';
  end if;
  perform public.lasar_shape(v, array['kind', 'unitId']);
  if v ->> 'kind' is distinct from 'school' then
    raise exception 'Ogiltigt mål för läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  return public.lasar_uuid(v -> 'unitId');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Aktör, skolenhet och logg
-- ---------------------------------------------------------------------------
-- Samma kedjeprövning som tjanst_actor: låst session, korrelation, kundlås och giltigt uppdrag i hela kedjan.
-- Klientens rollval ger aldrig behörighet.
create function public.lasar_actor() returns public.access_assignments
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; corr uuid; node public.access_assignments; cursor_id uuid; seen uuid[] := '{}';
begin
  perform public.phase5_programplan_session_check();
  begin corr := nullif(current_setting('app.correlation_id', true), '')::uuid;
  exception when invalid_text_representation then raise exception 'Läsårskalenderns logg saknas.' using errcode = '55000'; end;
  if corr is null then raise exception 'Läsårskalenderns logg saknas.' using errcode = '55000'; end if;
  a := public.phase3_actor();
  perform public.phase5_programplan_session_check();
  if a.function not in ('huvudman', 'rektor', 'administrator') then
    raise exception 'Läsårskalendern nekas.' using errcode = '42501';
  end if;
  cursor_id := a.id;
  loop
    if cursor_id = any (seen) or cardinality(seen) >= 64 then raise exception 'Läsårskalendern nekas.' using errcode = '42501'; end if;
    seen := array_append(seen, cursor_id);
    select * into node from public.access_assignments where id = cursor_id;
    if not found or not exists (select 1 from public.memberships m join public.customers c on c.id = m.customer_id join public.identities i on i.id = m.identity_id
       where m.id = node.membership_id and m.customer_id = node.customer_id and m.status = 'active' and c.closed_at is null)
       or (node.organizer_id is not null and not exists (select 1 from public.organizers g where g.id = node.organizer_id and g.customer_id = node.customer_id))
       or exists (select 1 from public.mandate_units m left join public.school_units u on u.id = m.unit_id
         where m.assignment_id = node.id and (u.id is null or u.organizer_id is distinct from node.organizer_id)) then
      raise exception 'Läsårskalendern nekas.' using errcode = '42501';
    end if;
    exit when node.parent_assignment_id is null;
    cursor_id := node.parent_assignment_id;
  end loop;
  return a;
end $$;

-- Skolenheten ska ligga i aktörens aktuella uppdrag och hos samma huvudman (T-05.1.1-13).
create function public.lasar_scope(a public.access_assignments, unit uuid) returns public.school_units
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare u public.school_units;
begin
  select s.* into u from public.school_units s join public.mandate_units m on m.unit_id = s.id and m.assignment_id = a.id
   where s.id = unit and s.organizer_id = a.organizer_id;
  if not found then raise exception 'Läsårskalendern nekas.' using errcode = '42501'; end if;
  return u;
end $$;

-- Detaljer är bara referenser: UUID, heltal, sanningsvärden och korta koder (samma prövning som tjänstefördelningen).
create function public.lasar_audit(operation text, object_type text, object_id uuid, details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
  if operation is null or operation not in ('lasar_read', 'lasar_command', 'lasar_decision', 'lasar_status')
     or object_type is distinct from 'school_year' or not coalesce(public.tjanst_audit_details(details), false) then
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

-- ---------------------------------------------------------------------------
-- 7. Regler och dagar
-- ---------------------------------------------------------------------------
-- En dag som rektor kan ändra: vardag inom en termin som inte är allmän helgdag (som dayInfo().editable).
create function public.lasar_day_editable(y public.school_years, d date) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select extract(isodow from d) < 6 and (d between y.ht_start and y.ht_end or d between y.vt_start and y.vt_end)
    and not public.tjanst_is_holiday(d)
$$;

-- Regelkoder ur web/lib/lasar-rule-codes.ts i modellens ordning. Tracern prövar terminsordning, start i augusti,
-- slut i juni och minst 178 skoldagar; plan 07 lägger till resten.
create function public.lasar_rules(version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_year public.school_years; v_days jsonb; v_result jsonb := '[]';
begin
  select * into v_year from public.school_years s where s.id = version_id;
  if not found then raise exception 'Kalenderversionen finns inte.' using errcode = '40001', hint = 'lasar_not_found'; end if;
  if extract(month from v_year.ht_start) <> 8 then v_result := v_result || jsonb_build_array(jsonb_build_object('code', 'term_start_august', 'level', 'error')); end if;
  if extract(month from v_year.vt_end) <> 6 then v_result := v_result || jsonb_build_array(jsonb_build_object('code', 'term_end_june', 'level', 'error')); end if;
  if not (v_year.ht_start < v_year.ht_end and v_year.ht_end < v_year.vt_start and v_year.vt_start < v_year.vt_end) then
    v_result := v_result || jsonb_build_array(jsonb_build_object('code', 'term_order', 'level', 'error'));
  end if;
  v_days := public.lasar_school_days(v_year.id);
  if (v_days ->> 'htSchoolDays')::integer + (v_days ->> 'vtSchoolDays')::integer < 178 then
    v_result := v_result || jsonb_build_array(jsonb_build_object('code', 'school_days_min', 'level', 'error'));
  end if;
  return v_result;
end $$;

create function public.lasar_require_rules(version_id uuid) returns void
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_errors jsonb;
begin
  select coalesce(jsonb_agg(r -> 'code'), '[]') into v_errors from jsonb_array_elements(public.lasar_rules(version_id)) r where r ->> 'level' = 'error';
  if jsonb_array_length(v_errors) > 0 then
    raise exception 'Kalendern uppfyller inte förordningarna.' using errcode = '40001', hint = 'lasar_rules_failed', detail = v_errors::text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Historik (A-16) och läsningens svar (kontraktet lasar_sql_v1)
-- ---------------------------------------------------------------------------
-- Visningsnamnet ur den verifierade identiteten, rensat så att kontraktets texttolk tar det (inga styr- eller
-- formattecken, inga omgivande blanktecken, högst 200 tecken).
create function public.lasar_display_name(name text) returns text
language sql immutable set search_path = pg_catalog, public as $$
  select coalesce(nullif(regexp_replace(left(regexp_replace(regexp_replace(coalesce(name, ''),
    '[[:cntrl:]\u00ad\u0600-\u0605\u061c\u06dd\u070f\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]', '', 'g'),
    '^[[:space:]\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+', ''), 200),
    '[[:space:]\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$', ''), ''), 'Namn saknas')
$$;

-- Historikraden skrivs av ingångarna; aktören sätts av triggern lasar_event_actor ur sessionen.
create function public.lasar_history_add(version_id uuid, action text, comment text) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
begin
  if action not in ('create', 'reset_to_proposal', 'comment', 'submit', 'withdraw', 'return', 'approve') then
    raise exception 'Ogiltig historik för läsårskalendern.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  insert into public.school_year_events (school_year_id, actor_role, action, comment, created_at)
  values (version_id, 'rektor', 'lasar_' || action, comment, clock_timestamp());
end $$;

-- Skolans historik för läsåret till och med vald version, nyast först. Bara kalenderns rader med verifierad aktör
-- visas; äldre rader utan identitet hör till exempelläget. Rollen administrator heter skoladministrator i kontraktet.
create function public.lasar_history(y public.school_years) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select coalesce(jsonb_agg(h.entry order by h.at desc, h.id desc), '[]'::jsonb) from (
    select e.id, e.created_at at, jsonb_build_object('id', e.id,
      'role', case e.actor_role when 'administrator' then 'skoladministrator' else e.actor_role::text end,
      'actorName', public.lasar_display_name(i.display_name),
      'at', to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'action', case e.action when 'lasar_create' then 'Förslag skapat' when 'lasar_reset_to_proposal' then 'Förslag återställt'
        when 'lasar_comment' then 'Kommentar' when 'lasar_submit' then 'Förslag skickat' when 'lasar_withdraw' then 'Förslag återtaget'
        when 'lasar_return' then 'Återsänd för ändring' when 'lasar_approve' then 'Fastställd' end,
      'comment', e.comment, 'version', v.version) entry
    from public.school_year_events e
    join public.school_years v on v.id = e.school_year_id
    left join public.identities i on i.id = e.actor_identity_id
    where v.unit_id = y.unit_id and v.start_year = y.start_year and v.organizer_id = y.organizer_id and v.version <= y.version
      and e.actor_identity_id is not null and e.actor_role in ('huvudman', 'rektor', 'administrator')
      and e.action in ('lasar_create', 'lasar_reset_to_proposal', 'lasar_comment', 'lasar_submit', 'lasar_withdraw', 'lasar_return', 'lasar_approve')
    order by e.created_at desc, e.id desc limit 500) h
$$;

-- Gruppnycklar som inte är stabila grupp-ID (lasar-groups.ts) visas inte; de förs över i plan 08 (LASAR-04).
create function public.lasar_calendar_json(y public.school_years) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('versionId', y.id, 'version', y.version, 'status', y.status, 'revision', y.revision,
    'terms', jsonb_build_object('ht', jsonb_build_object('start', y.ht_start, 'end', y.ht_end), 'vt', jsonb_build_object('start', y.vt_start, 'end', y.vt_end)),
    'exceptions', coalesce((select jsonb_object_agg(d.day::text, jsonb_strip_nulls(jsonb_build_object('kind', d.kind, 'note', d.note)))
      from public.school_year_days d where d.school_year_id = y.id), '{}'::jsonb),
    'groupDays', coalesce((select jsonb_object_agg(g.group_key, g.days) from (
      select x.group_key, jsonb_object_agg(x.day::text, jsonb_strip_nulls(jsonb_build_object('cause', x.cause, 'note', x.note))) days
        from public.school_year_group_days x where x.school_year_id = y.id
         and x.group_key ~ '^(arskurs:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:(ar[1-3]|ak[1-9]|vecka)|klass:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'
       group by x.group_key) g), '{}'::jsonb),
    'shortWeeks', coalesce((select jsonb_object_agg(w.group_key, jsonb_build_object('weekday', w.weekday, 'reason', w.reason, 'columnId', w.column_id))
      from public.school_year_short_weeks w where w.school_year_id = y.id
       and w.group_key ~ '^(arskurs:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:(ar[1-3]|ak[1-9]|vecka)|klass:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$'), '{}'::jsonb),
    'frameVersionId', null, 'contentHash', coalesce(y.content_hash, public.lasar_content_hash(y.id)), 'decidedOn', y.decided_on,
    'history', public.lasar_history(y))
$$;

-- Hela läsningen för en skola, ett läsår och vald (eller förvald) version. Förmågorna följer aktörens funktion
-- och versionens status; knappar i vyn styrs bara av dem (A-01).
create function public.lasar_detail(a public.access_assignments, unit uuid, year integer, version_id uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_unit public.school_units; v_year public.school_years; v_versions jsonb; v_types jsonb; v_school boolean := a.function in ('rektor', 'administrator');
  v_open boolean; v_sent boolean; v_caps jsonb;
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
    'capabilities', v_caps, 'editableFrom', null, 'changeRequest', null, 'review', '[]'::jsonb, 'frame', null, 'groups', '[]'::jsonb,
    'teaching', jsonb_build_object('classes', '[]'::jsonb, 'imClassIds', '[]'::jsonb),
    'previousYearAvailable', (public.lasar_current(unit, year - 1)).id is not null);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Skrivningar i en öppen version
-- ---------------------------------------------------------------------------
-- Förslagets lov- och studiedagar: varje dag ska vara en ändringsbar vardag i versionens terminer.
create function public.lasar_proposal_days(y public.school_years, exceptions jsonb) returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_day record; v_date date; v_kind text; v_note text;
begin
  if jsonb_typeof(exceptions) is distinct from 'object' or (select count(*) from jsonb_object_keys(exceptions)) > 400 then
    raise exception 'Ogiltigt förslag.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  for v_day in select e.key, e.value from jsonb_each(exceptions) e loop
    v_date := public.lasar_date(to_jsonb(v_day.key));
    perform public.lasar_shape(v_day.value, array['kind'], array['note']);
    v_kind := v_day.value ->> 'kind';
    if jsonb_typeof(v_day.value -> 'kind') <> 'string' or v_kind not in ('lovdag', 'studiedag') or not public.lasar_day_editable(y, v_date) then
      raise exception 'Ogiltig dag i förslaget.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    v_note := case when v_day.value ? 'note' then public.lasar_text(v_day.value -> 'note', 200, false) end;
    insert into public.school_year_days (school_year_id, day, kind, note) values (y.id, v_date, v_kind::public.school_day_kind, v_note);
  end loop;
end $$;

-- Förslaget räknas fram i servern med proposeSchoolYear (D-03) och prövas här: datum, terminer och att varje
-- lov- eller studiedag är en ändringsbar vardag. Versionen börjar som utkast med revision 1.
create function public.lasar_create_proposal(a public.access_assignments, unit uuid, year integer, proposal jsonb) returns public.school_years
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_year public.school_years; v_terms jsonb;
begin
  perform public.lasar_shape(proposal, array['terms', 'exceptions']);
  v_terms := public.lasar_shape(proposal -> 'terms', array['ht', 'vt']);
  perform public.lasar_shape(v_terms -> 'ht', array['start', 'end']); perform public.lasar_shape(v_terms -> 'vt', array['start', 'end']);
  if jsonb_typeof(proposal -> 'exceptions') <> 'object' or (select count(*) from jsonb_object_keys(proposal -> 'exceptions')) > 400 then
    raise exception 'Ogiltigt förslag.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  begin
    insert into public.school_years (organizer_id, unit_id, start_year, ht_start, ht_end, vt_start, vt_end, status, version, revision)
    values (a.organizer_id, unit, year, public.lasar_date(v_terms #> '{ht,start}'), public.lasar_date(v_terms #> '{ht,end}'),
      public.lasar_date(v_terms #> '{vt,start}'), public.lasar_date(v_terms #> '{vt,end}'), 'utkast', 1, 1)
    returning * into v_year;
  exception
    when check_violation then raise exception 'Ogiltiga terminer.' using errcode = '22023', hint = 'lasar_invalid';
    when unique_violation then raise exception 'Kalendern finns redan.' using errcode = '40001', hint = 'lasar_revision_conflict';
  end;
  perform public.lasar_proposal_days(v_year, proposal -> 'exceptions');
  return v_year;
end $$;

-- set_days: dagar som får samma slag och anteckning; skoldag tar bort undantaget.
create function public.lasar_set_days(y public.school_years, op jsonb) returns void
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
    if (v_prev is not null and v_date <= v_prev) or not public.lasar_day_editable(y, v_date) then
      raise exception 'Dagen kan inte ändras.' using errcode = '22023', hint = 'lasar_invalid';
    end if;
    v_prev := v_date;
    if v_kind = 'skoldag' then
      delete from public.school_year_days d where d.school_year_id = y.id and d.day = v_date;
    else
      insert into public.school_year_days (school_year_id, day, kind, note) values (y.id, v_date, v_kind::public.school_day_kind, v_note)
      on conflict (school_year_id, day) do update set kind = excluded.kind, note = excluded.note;
    end if;
  end loop;
end $$;

-- set_notes: samma anteckning på markerade lov- och studiedagar; utan note tas anteckningen bort (setNotes).
-- Skoldagar hoppas över; nekas om ingen markerad dag har ett undantag.
create function public.lasar_set_notes(y public.school_years, op jsonb) returns void
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
    update public.school_year_days d set note = v_note where d.school_year_id = y.id and d.day = v_date and public.lasar_day_editable(y, v_date);
    get diagnostics n = row_count; v_changed := v_changed + n;
  end loop;
  if v_changed = 0 then raise exception 'Bara lov- och studiedagar har anteckning.' using errcode = '22023', hint = 'lasar_invalid'; end if;
end $$;

-- set_term: en terminskant. Ordning som i setTerm (fel ordning ger regelkoden term_order) och läsårets två kalenderår.
-- Lov, studiedagar och gruppdagar som inte längre är ändringsbara dagar faller bort, som i modellen.
create function public.lasar_set_term(y public.school_years, op jsonb) returns public.school_years
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_term text; v_edge text; v_date date; v_ht_start date := y.ht_start; v_ht_end date := y.ht_end; v_vt_start date := y.vt_start; v_vt_end date := y.vt_end;
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
  if extract(year from v_ht_start) <> y.start_year or extract(year from v_vt_end) <> y.start_year + 1 then
    raise exception 'Läsåret ligger utanför sina kalenderår.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  update public.school_years x set ht_start = v_ht_start, ht_end = v_ht_end, vt_start = v_vt_start, vt_end = v_vt_end where x.id = y.id returning * into y;
  delete from public.school_year_days d where d.school_year_id = y.id and not public.lasar_day_editable(y, d.day);
  delete from public.school_year_group_days g where g.school_year_id = y.id and not public.lasar_day_editable(y, g.day);
  return y;
end $$;

-- reset_to_proposal: terminer och lov- och studiedagar enligt serverns förslag (proposeSchoolYear, D-03);
-- gruppdagar och korta veckor ligger kvar, som i resetToProposal.
create function public.lasar_reset_proposal(y public.school_years, proposal jsonb) returns public.school_years
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_terms jsonb;
begin
  perform public.lasar_shape(proposal, array['terms', 'exceptions']);
  v_terms := public.lasar_shape(proposal -> 'terms', array['ht', 'vt']);
  perform public.lasar_shape(v_terms -> 'ht', array['start', 'end']); perform public.lasar_shape(v_terms -> 'vt', array['start', 'end']);
  delete from public.school_year_days d where d.school_year_id = y.id;
  begin
    update public.school_years x set ht_start = public.lasar_date(v_terms #> '{ht,start}'), ht_end = public.lasar_date(v_terms #> '{ht,end}'),
      vt_start = public.lasar_date(v_terms #> '{vt,start}'), vt_end = public.lasar_date(v_terms #> '{vt,end}')
     where x.id = y.id returning * into y;
  exception when check_violation then raise exception 'Ogiltiga terminer.' using errcode = '22023', hint = 'lasar_invalid';
  end;
  perform public.lasar_proposal_days(y, proposal -> 'exceptions');
  return y;
end $$;

-- Låser versionen för ändring och kontrollerar mål, huvudman och revision.
create function public.lasar_lock_version(a public.access_assignments, unit uuid, year integer, version_id uuid) returns public.school_years
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare v_year public.school_years;
begin
  select * into v_year from public.school_years s where s.id = version_id for update;
  if not found or v_year.unit_id <> unit or v_year.start_year <> year or v_year.organizer_id <> a.organizer_id then
    raise exception 'Kalenderversionen finns inte.' using errcode = '40001', hint = 'lasar_not_found';
  end if;
  return v_year;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Ingångar
-- ---------------------------------------------------------------------------
create function public.lasar_read(input jsonb) returns jsonb
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
  perform public.lasar_scope(a, v_unit);
  v_detail := public.lasar_detail(a, v_unit, v_year, v_version);
  perform public.lasar_audit('lasar_read', 'school_year', (v_detail #>> '{calendar,versionId}')::uuid,
    jsonb_build_object('unitId', v_unit, 'schoolYear', v_year));
  return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'actor', jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id), 'result', v_detail);
end $$;

-- Kommandon (kontraktets ops) och beslut (action) i samma journal. Ordning: aktör, storlek, tolkning, skolenhet,
-- lås på kommando-id, exakt återspelning, payload-hash, behörighet per åtgärd, status, revision, skrivning,
-- kvitto, journal, historik och logg. Åtgärder i denna version: create (källan proposal), set_days, set_notes, set_term,
-- reset_to_proposal och comment samt besluten submit, withdraw, return och approve. Övriga ger lasar_unsupported.
create function public.lasar_command(input jsonb) returns jsonb
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

-- Statusvägen (T-05.1.1-21, T-05.1.1-22): utfallet för ett kommando-id efter ett uteblivet svar, utan att kommandot
-- utförs igen. Bara samma aktör, uppdrag, skolenhet och läsår får läsa utfallet; finns inget journalfört kommando
-- blir svaret not_found. Låset på kommando-id väntar ut ett kommando som pågår.
create function public.lasar_status(input jsonb) returns jsonb
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
  perform public.lasar_scope(a, v_unit);
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
  perform public.lasar_audit('lasar_status', 'school_year', v_row.school_year_id,
    jsonb_build_object('commandId', v_request, 'unitId', v_unit, 'schoolYear', v_year));
  return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'actor', jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id), 'result', v_result);
end $$;

-- ---------------------------------------------------------------------------
-- 11. Stängt tills grant-migrationen
-- ---------------------------------------------------------------------------
revoke all on function public.lasar_current(uuid, integer), public.lasar_school_days(uuid), public.lasar_content_hash_json(jsonb),
  public.lasar_content_hash(uuid), public.lasar_shape(jsonb, text[], text[]), public.lasar_uuid(jsonb), public.lasar_int(jsonb, integer, integer),
  public.lasar_date(jsonb), public.lasar_text(jsonb, integer, boolean, boolean), public.lasar_target(jsonb), public.lasar_actor(),
  public.lasar_scope(public.access_assignments, uuid), public.lasar_audit(text, text, uuid, jsonb), public.lasar_day_editable(public.school_years, date),
  public.lasar_rules(uuid), public.lasar_require_rules(uuid), public.lasar_calendar_json(public.school_years),
  public.lasar_detail(public.access_assignments, uuid, integer, uuid), public.lasar_create_proposal(public.access_assignments, uuid, integer, jsonb),
  public.lasar_set_days(public.school_years, jsonb), public.lasar_lock_version(public.access_assignments, uuid, integer, uuid),
  public.lasar_event_actor(), public.lasar_display_name(text), public.lasar_history_add(uuid, text, text), public.lasar_history(public.school_years),
  public.lasar_proposal_days(public.school_years, jsonb), public.lasar_set_notes(public.school_years, jsonb), public.lasar_set_term(public.school_years, jsonb),
  public.lasar_reset_proposal(public.school_years, jsonb),
  public.lasar_read(jsonb), public.lasar_command(jsonb), public.lasar_status(jsonb)
  from public, anon, authenticated, service_role, skolplattform_worker;
