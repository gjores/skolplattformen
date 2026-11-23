-- Motorns sal och varje enskild provvakt kan höra till olika schemautkast.
-- Valfria uppgifter. Tidigare oföränderliga provplaner kan fortfarande läsas.
alter function public.nationella_prov_valid(jsonb, integer) rename to nationella_prov_valid_katalog;

create function public.nationella_prov_valid(doc jsonb, school_year integer) returns boolean
language plpgsql stable set search_path = pg_catalog, public as $$
declare
  booking jsonb;
  motor jsonb;
  guards jsonb;
  unmarked jsonb;
begin
  if not public.nationella_prov_keys(doc, array['granskad', 'bokningar'])
    or jsonb_typeof(doc -> 'bokningar') is distinct from 'array'
    or octet_length(doc::text) > 262144 then
    return false;
  end if;
  if jsonb_array_length(doc -> 'bokningar') > 200 then return false; end if;
  for booking in select value from jsonb_array_elements(doc -> 'bokningar')
    where jsonb_typeof(value) = 'object' and value ? 'motorval' loop
    motor := booking -> 'motorval';
    if jsonb_typeof(motor) is distinct from 'object' or motor = '{}'::jsonb
      or (motor - array['sal','vakter']) <> '{}'::jsonb then return false; end if;
    if motor ? 'sal' and (not public.nationella_prov_uuid(motor -> 'sal')
      or jsonb_typeof(booking -> 'salId') is distinct from 'string') then return false; end if;
    if motor ? 'vakter' then
      guards := motor -> 'vakter';
      if jsonb_typeof(guards) is distinct from 'array' then return false; end if;
      if jsonb_array_length(guards) not between 1 and 20
        or exists (select 1 from jsonb_array_elements(guards) v
          where not public.nationella_prov_keys(v, array['ref','draftId'])
            or not public.nationella_prov_uuid(v -> 'ref')
            or not public.nationella_prov_uuid(v -> 'draftId')
            or not coalesce((booking -> 'vakter') @> jsonb_build_array(v -> 'ref'), false))
        or exists (select 1 from jsonb_array_elements(guards) v group by v -> 'ref' having count(*) > 1)
        then return false; end if;
    end if;
  end loop;
  select coalesce(jsonb_agg(case when jsonb_typeof(item) = 'object' then item - 'motorval' else item end order by position), '[]'::jsonb)
    into unmarked from jsonb_array_elements(doc -> 'bokningar') with ordinality as rows(item, position);
  return public.nationella_prov_valid_katalog(jsonb_set(doc, '{bokningar}', unmarked), school_year);
end $$;

-- Endast en provskrivning och en schemasparning med samma kommando och revisionsspår
-- i samma genomförda motortransaktion är bevis för tidigare motortilldelning.
create function public.schema_prov_motor_history(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare
  unit uuid;
  start_year integer;
  last_revision integer;
  a public.access_assignments;
  s public.app_sessions;
  revisions jsonb;
begin
  perform public.nationella_prov_scope(input, array['revision']);
  if not coalesce(public.phase5_programplan_integer(input -> 'revision', 1, 2147483647), false) then
    raise exception 'Invalid national exam revision' using errcode = '22023', hint = 'nationella_prov_invalid';
  end if;
  unit := (input ->> 'unitId')::uuid;
  start_year := (input ->> 'schoolYear')::integer;
  last_revision := (input ->> 'revision')::integer;
  a := public.nationella_prov_actor(unit);
  s := public.phase5_programplan_session_check();
  select coalesce(jsonb_agg(jsonb_build_object('revision', p.revision, 'document', p.document, 'draftId',
    case when exists (
      select 1 from public.security_events pe
      join public.security_events se on se.correlation_id = pe.correlation_id
        and se.source = 'db' and se.action = 'schema_draft_saved' and se.outcome = 'ok'
        and se.object_id = d.draft_id and se.actor_identity_id = p.actor_identity_id and se.assignment_id = p.assignment_id
        and se.details ->> 'commandId' = p.command_id::text
      join public.security_events me on me.correlation_id = pe.correlation_id and me.source = 'worker'
        and me.action in ('schema_prov_applied','schema_nytt_prov_saved') and me.outcome = 'ok'
        and me.object_id = unit and me.actor_identity_id = p.actor_identity_id and me.assignment_id = p.assignment_id
      where d.draft_id is not null and pe.source = 'db' and pe.action = 'nationella_prov_saved' and pe.outcome = 'ok'
        and pe.object_id = unit and pe.actor_identity_id = p.actor_identity_id and pe.assignment_id = p.assignment_id
        and pe.details ->> 'commandId' = p.command_id::text
    ) then d.draft_id end) order by p.revision), '[]'::jsonb)
    into revisions
    from public.nationella_prov_revisions p
    left join public.schema_draft_commands d on (d.command_id, d.unit_id, d.school_year, d.customer_id, d.organizer_id, d.actor_identity_id, d.assignment_id)
      = (p.command_id, p.unit_id, p.school_year, p.customer_id, p.organizer_id, p.actor_identity_id, p.assignment_id)
    where p.unit_id = unit and p.school_year = start_year and p.customer_id = a.customer_id
      and p.organizer_id = a.organizer_id and p.revision <= last_revision;
  perform public.nationella_prov_audit('nationella_prov_read', unit,
    jsonb_build_object('unitId', unit, 'schoolYear', start_year, 'revision', last_revision), a, s);
  return jsonb_build_object('contractVersion', 'nationella_prov_v1', 'actor',
    jsonb_build_object('identityId', s.identity_id, 'assignmentId', a.id), 'result', jsonb_build_object('revisions', revisions));
end $$;

-- Läs enbart kopplingen till en provrevision som skrevs med den verifierade
-- tömningen. Provhistoriken läses genom det egna skolskyddade kontraktet.
create function public.schema_prov_reset_previous(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path = pg_catalog, public as $$
declare
  prior integer;
  result jsonb;
begin
  prior := (public.schema_reset_previous(jsonb_set(input, '{includeDraft}', 'false'::jsonb)) #>> '{result,previousRevision}')::integer;
  if prior is null then return null; end if;
  select jsonb_build_object('clearedRevision', p.revision, 'previousRevision', p.expected_revision)
    into result from public.schema_draft_commands d
    join public.nationella_prov_revisions p on (p.command_id, p.unit_id, p.school_year, p.customer_id, p.organizer_id, p.actor_identity_id, p.assignment_id)
      = (d.command_id, d.unit_id, d.school_year, d.customer_id, d.organizer_id, d.actor_identity_id, d.assignment_id)
    where d.draft_id = (input ->> 'draftId')::uuid and d.expected_revision = prior
      and exists (select 1 from public.security_events se
        join public.security_events pe on pe.correlation_id = se.correlation_id and pe.source = 'db'
          and pe.action = 'nationella_prov_saved' and pe.outcome = 'ok' and pe.object_id = p.unit_id
          and pe.details ->> 'commandId' = d.command_id::text
        where se.source = 'db' and se.action = 'schema_draft_saved' and se.outcome = 'ok'
          and se.object_id = d.draft_id and se.details ->> 'commandId' = d.command_id::text);
  return result;
end $$;

revoke all on function public.nationella_prov_valid(jsonb, integer), public.schema_prov_motor_history(jsonb),
  public.schema_prov_reset_previous(jsonb) from public, anon, authenticated, service_role, skolplattform_worker;
grant execute on function public.schema_prov_motor_history(jsonb), public.schema_prov_reset_previous(jsonb) to skolplattform_worker;
