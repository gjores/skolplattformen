-- 05.1.1-13 (D-11, LASAR-05): kalenderns sammanfattning för beroende underlag. En gemensam läsväg ger för en skolenhet och ett
-- läsår den gällande fastställda versionen (lasar_current) och den föregående fastställda versionen, var och en med version,
-- beslutsdatum, skoldagar per termin och kontrollsumma. Skoldagarna räknas med lasar_school_days, samma funktion som
-- tjanst_school_weeks använder för tjänstefördelningens IM-behov, så att sammanfattningen och tjänstefördelningen alltid ger samma
-- skoldagar för samma version (T-05.1.1-54). Ett utkast, ett förslag eller en återsänd version ändrar inte sammanfattningen.
-- Läsningen har samma mandatkontroll som kalendern (lasar_actor och lasar_scope): rektor och skoladministratör med skolenheten i
-- sitt aktuella uppdrag och skolans huvudman får läsa, andra nekas (T-05.1.1-40). Läsningen loggas som lasar_summary.
--
-- Bygger på 20261111100000_lasar_versions.sql och 20261111190000_lasar_worker_access.sql (installerade på det skyddade lokala
-- målet och låsta) samt 20261112100000–20261112131000. lasar_audit ersätts med create or replace. Inga rättigheter ges i denna
-- fil; Workerns rätt att köra den nya ingången lasar_summary ges i 20261112141000_lasar_summary_worker_access.sql.
-- Tjänstefördelningens SQL-funktioner (tjanst_*) och tolkar ändras inte; sammanfattningen är en egen läsväg (Pitfall 7).
--
-- SS 12000 (SIS OpenAPI 2.1.0, som anger SS12000:2020): läsår, kalenderversioner och skoldagar saknar objekt i standarden och
-- exporteras inte. Skolenheten (Organisation, organisationType=Skolenhet) anges bara med unit_id. Ingen standardefterlevnad påstås.

-- ---------------------------------------------------------------------------
-- 1. Loggen känner till läsningen
-- ---------------------------------------------------------------------------
-- Som 20261112130000 plus sammanfattningen (lasar_summary).
create or replace function public.lasar_audit(operation text, object_type text, object_id uuid, details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
  if operation is null or operation not in ('lasar_read', 'lasar_command', 'lasar_decision', 'lasar_status', 'lasar_overview', 'lasar_summary')
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

-- ---------------------------------------------------------------------------
-- 2. Sammanfattningen
-- ---------------------------------------------------------------------------
-- En fastställd version som sammanfattning: version, beslutsdatum, skoldagar per termin (lasar_school_days) och kontrollsumma.
-- En fixturkalender utan lagrad kontrollsumma får den beräknade (Pitfall 6). Null om versionen saknas.
create function public.lasar_summary_stat(version_id uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('version', y.version, 'decidedOn', y.decided_on, 'htSchoolDays', (d.days ->> 'htSchoolDays')::integer,
    'vtSchoolDays', (d.days ->> 'vtSchoolDays')::integer, 'contentHash', coalesce(y.content_hash, public.lasar_content_hash(y.id)))
  from public.school_years y cross join lateral (select public.lasar_school_days(y.id) days) d
  where y.id = version_id and y.status = 'faststalld'
$$;

-- Ingången: {unitId, schoolYear} → {contractVersion, unitId, schoolYear, current, previous}. current är den gällande fastställda
-- versionen (samma som tjanst_school_weeks läser) och previous den senaste ersatta fastställda versionen före den. Utan gällande
-- version är båda null.
create function public.lasar_summary(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare a public.access_assignments; s public.app_sessions; v_unit uuid; v_year integer; v_current public.school_years; v_previous uuid;
begin
  a := public.lasar_actor(); s := public.phase5_programplan_session_check();
  if input is null or octet_length(input::text) > 65536 then
    raise exception 'Ogiltig läsning.' using errcode = '22023', hint = 'lasar_invalid';
  end if;
  perform public.lasar_shape(input, array['unitId', 'schoolYear']);
  v_unit := public.lasar_uuid(input -> 'unitId');
  v_year := public.lasar_int(input -> 'schoolYear', 2000, 2100);
  perform public.lasar_scope(a, v_unit);
  v_current := public.lasar_current(v_unit, v_year);
  if v_current.id is not null then
    select y.id into v_previous from public.school_years y
     where y.unit_id = v_unit and y.start_year = v_year and y.status = 'faststalld' and y.superseded_by is not null and y.version < v_current.version
     order by y.version desc limit 1;
  end if;
  perform public.lasar_audit('lasar_summary', 'school_year', v_current.id, jsonb_build_object('unitId', v_unit, 'schoolYear', v_year));
  return jsonb_build_object('contractVersion', 'lasar_sql_v1', 'actor', jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id),
    'result', jsonb_build_object('contractVersion', 'lasar_sql_v1', 'unitId', v_unit, 'schoolYear', v_year,
      'current', public.lasar_summary_stat(v_current.id), 'previous', public.lasar_summary_stat(v_previous)));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Stängt: inga rättigheter för Worker eller klientroller (lasar_summary öppnas i 20261112141000_lasar_summary_worker_access.sql)
-- ---------------------------------------------------------------------------
revoke all on function public.lasar_summary_stat(uuid), public.lasar_summary(jsonb)
  from public, anon, authenticated, service_role, skolplattform_worker;
