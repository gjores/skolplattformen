-- Terminsfördelningen är ett tillägg till Workers skyddade studieplansunderlag.
-- En entydig gruppplacering ger ett valbart planeringsförslag. Faktiska datum
-- hämtas aldrig från gruppmedlemskapet.
create function public.individual_study_plan_date_suggestions(
  pl public.pupil_placements, content jsonb, include_term_dates boolean
)
returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'levelId',level_id,'attemptId',attempt_id,
    'plannedStart',jsonb_build_object('kind','day','date',starts_on),
    'plannedEnd',jsonb_build_object('kind','day','date',ends_on))
    order by level_id,attempt_id),'[]'::jsonb)
  from (
    select l.value->>'id' as level_id, attempt.value->>'id' as attempt_id,
      min(m.starts_on) as starts_on,min(m.ends_on) as ends_on
    from public.study_group_memberships m
    join public.study_groups g on g.id=m.group_id and g.unit_id=m.unit_id
    cross join lateral jsonb_array_elements(content->'levels') l
    cross join lateral jsonb_array_elements(l.value->'attempts') attempt
    where m.pupil_id=pl.pupil_id and m.unit_id=pl.unit_id and g.organizer_id=pl.organizer_id
      and m.cancelled_at is null and g.active
      and m.starts_on>=pl.starts_on and m.ends_on<=coalesce(pl.ends_on,'infinity'::date)
      and not exists (
        select 1 from public.pupil_placements other
        where other.pupil_id=pl.pupil_id and other.unit_id=pl.unit_id and other.id<>pl.id
          and daterange(other.starts_on,other.ends_on,'[]') && daterange(m.starts_on,m.ends_on,'[]'))
      and l.value->>'kind'='gy25_level' and jsonb_array_length(l.value->'attempts')=1
      and g.subject_code=l.value->>'subjectCode' and to_jsonb(g.subject_version)=l.value->'subjectVersion'
      and g.item_code=l.value->>'itemCode' and g.language_code is not distinct from l.value->>'languageCode'
      and (
        (attempt.value->'plannedStart'='null'::jsonb and attempt.value->'plannedEnd'='null'::jsonb)
        or (include_term_dates and attempt.value#>>'{plannedStart,kind}'='term' and attempt.value#>>'{plannedEnd,kind}'='term')
      )
      and attempt.value #>> '{actual,certainty}'='recorded'
      and attempt.value #> '{actual,start}'='null'::jsonb and attempt.value #> '{actual,end}'='null'::jsonb
    group by l.value->>'id',attempt.value->>'id'
    having count(*)=1
  ) suggested
$$;

revoke all on function public.individual_study_plan_date_suggestions(public.pupil_placements,jsonb,boolean)
  from public,anon,authenticated,service_role,skolplattform_worker;

create or replace function public.individual_study_plan_date_suggestions(pl public.pupil_placements, content jsonb)
returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select public.individual_study_plan_date_suggestions(pl,content,false)
$$;

create or replace function public.individual_study_plan_read(input jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  fields text[]:=array['contractVersion','unitId','pupilId','placementId','on','view'];
  a public.access_assignments; pl public.pupil_placements; plan public.individual_study_plans;
  latest public.individual_study_plan_revisions; picked public.individual_study_plan_revisions;
  result jsonb; history jsonb; basis jsonb; program_terms jsonb; on_date date;
  view_name text:=input->>'view';
begin
  if view_name is null or view_name not in ('current','history','options','impact') then
    perform public.individual_study_plan_invalid();
  end if;
  if view_name='history' and input?'revision' then
    if not public.phase5_programplan_integer(input->'revision',1,2147483646) then
      perform public.individual_study_plan_invalid();
    end if;
    fields:=fields||array['revision'];
  elsif view_name='impact' then
    fields:=fields||array['target'];
  elsif view_name='current' then
    if input?'includeDateSuggestions' then
      if input->'includeDateSuggestions' is distinct from 'true'::jsonb then
        perform public.individual_study_plan_invalid();
      end if;
      fields:=fields||array['includeDateSuggestions'];
    end if;
    if input?'includeProgramTerms' then
      if input->'includeProgramTerms' is distinct from 'true'::jsonb then
        perform public.individual_study_plan_invalid();
      end if;
      fields:=fields||array['includeProgramTerms'];
    end if;
    if input?'includeTermDateSuggestions' then
      if input->'includeDateSuggestions' is distinct from 'true'::jsonb
        or input->'includeTermDateSuggestions' is distinct from 'true'::jsonb then
        perform public.individual_study_plan_invalid();
      end if;
      fields:=fields||array['includeTermDateSuggestions'];
    end if;
  end if;
  perform public.phase4_keys(input,fields);
  a:=public.elective_staff_scope(public.tjanst_uuid(input->'unitId'));
  pl:=public.individual_study_plan_scope(input,a);
  on_date:=public.study_group_date(input->'on');
  result:=public.individual_study_plan_scope_json(pl)||jsonb_build_object('view',view_name,'on',on_date);
  if view_name in ('options','impact') then
    result:=result||public.individual_study_plan_impact(input,pl,on_date);
  else
    select * into plan from public.individual_study_plans p where p.placement_id=pl.id;
    select * into latest from public.individual_study_plan_revisions r where r.plan_id=plan.id order by r.revision desc limit 1;
    if view_name='history' and input?'revision' then
      select * into picked from public.individual_study_plan_revisions r
        where r.plan_id=plan.id and r.revision=(input->>'revision')::integer;
    else
      picked:=public.individual_study_plan_on(plan.id,on_date);
    end if;
    select coalesce(jsonb_agg(public.individual_study_plan_revision_json(r,false) order by r.revision desc),'[]'::jsonb)
      into history from public.individual_study_plan_revisions r where r.plan_id=plan.id
      and (r.revision>latest.revision-4999 or r.revision=picked.revision);
    result:=result||jsonb_build_object('history',history);
    if view_name='current' then
      basis:=public.individual_study_plan_basis(pl,false);
      if input?'includeProgramTerms' then
        -- Läs exakt den planrevision som redan ingår i källtoken. Fastställda
        -- terminsrader är låsta, och ett planbyte ger en ny token vid sparandet.
        select jsonb_build_object(
          'cohortStartYear',extract(year from (b.started_on - interval '6 months'))::integer,
          'distribution',p.term_distribution)
        into program_terms
        from public.offerings o
        join public.offering_units u on u.offering_id=o.id and u.organizer_id=o.organizer_id and u.unit_id=pl.unit_id
        join public.point_plans p on p.offering_id=o.id and p.organizer_id=o.organizer_id
        cross join lateral (select (p.basis_reference->>'startedOn')::date as started_on) b
        where o.id=pl.offering_id and o.organizer_id=pl.organizer_id
          and o.lifecycle_revision=(basis->>'offeringRevision')::integer
          and o.start_year between 1900 and 9996 and o.start_year=extract(year from b.started_on)
          and p.id=(basis #>> '{programPlan,id}')::uuid and p.status='faststalld'
          and p.version=(basis #>> '{programPlan,version}')::integer
          and p.revision=(basis #>> '{programPlan,revision}')::integer
          and p.term_distribution<>'[]'::jsonb;
        if program_terms is not null then
          basis:=basis||jsonb_build_object('programTerms',program_terms);
        end if;
      end if;
      result:=result||jsonb_build_object(
        'current',public.individual_study_plan_revision_json(picked,true),
        'draft',case when latest.state='draft' then public.individual_study_plan_revision_json(latest,true) else null end,
        'latestRevision',coalesce(latest.revision,0),
        'canMakeCurrent',a.function='rektor' and coalesce(pl.ends_on,'infinity'::date)>=public.app_today(),
        'sourceToken',basis->>'token','basisStatus',case
          when basis #>> '{path,regime}' <> 'national_gy25' then 'unsupported'
          when basis #>> '{source,catalogId}' is null then 'incomplete' else 'ready' end,
        'basisIssues','[]'::jsonb,'availableLevels','[]'::jsonb,'calendar',basis->'calendar');
      if input?'includeDateSuggestions' then
        result:=result||jsonb_build_object('dateSuggestions',case
          when (latest.state='draft' or latest.revision=picked.revision)
            and coalesce(pl.ends_on,'infinity'::date)>=public.app_today()
            and basis #>> '{path,regime}'='national_gy25' then
            public.individual_study_plan_date_suggestions(pl,latest.content,input?'includeTermDateSuggestions')
          else '[]'::jsonb end);
      end if;
    else
      result:=result||jsonb_build_object('version',public.individual_study_plan_revision_json(picked,true));
    end if;
  end if;
  perform public.individual_study_plan_audit(a,pl,'individual_study_plan_read');
  return public.individual_study_plan_envelope(a,result)||jsonb_build_object(
    'basis',basis,'latest',case when view_name='current' then public.individual_study_plan_revision_json(latest,true) else null end);
end $$;
