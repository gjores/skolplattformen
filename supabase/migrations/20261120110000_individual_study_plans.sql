-- SP-02. Studieplanen äger sin identitet och sina daterade revisioner. Placering,
-- utbildning, val och katalog läses från sina respektive källor.
create table public.individual_study_plans (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null unique,
  customer_id uuid not null,
  pupil_id uuid not null,
  unit_id uuid not null,
  offering_id uuid not null references public.offerings(id),
  foreign key (placement_id,customer_id,pupil_id,unit_id)
    references public.pupil_placements(id,customer_id,pupil_id,unit_id)
);

create table public.individual_study_plan_revisions (
  plan_id uuid not null references public.individual_study_plans(id),
  revision integer not null check (revision > 0),
  state text not null check (state in ('draft','current')),
  effective_on date check (isfinite(effective_on)),
  recorded_at timestamptz not null default clock_timestamp(),
  catalog_id text references public.programplan_catalogs(catalog_id),
  source_token text not null check (source_token ~ '^sha256:[0-9a-f]{64}$'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  actor_identity_id uuid not null references public.identities(id),
  assignment_id uuid not null references public.access_assignments(id),
  primary key (plan_id,revision),
  check ((state = 'current') = (effective_on is not null)),
  check (catalog_id is not distinct from content #>> '{source,catalogId}')
);
create index individual_study_plan_effective_idx on public.individual_study_plan_revisions
  (plan_id,effective_on desc,revision desc) where state='current';

create table public.individual_study_plan_receipts (
  command_id uuid primary key,
  plan_id uuid not null,
  revision integer not null,
  assignment_id uuid not null references public.access_assignments(id),
  actor_identity_id uuid not null references public.identities(id),
  action text not null check (action in ('prepare_draft','record_actual','record_decision','record_dialogue','make_current')),
  request_hash bytea not null,
  foreign key (plan_id,revision) references public.individual_study_plan_revisions(plan_id,revision)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['individual_study_plans','individual_study_plan_revisions','individual_study_plan_receipts'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker', table_name);
    execute format('create trigger individual_study_plan_immutable before update or delete or truncate on public.%I for each statement execute function public.elective_time_immutable()', table_name);
  end loop;
end $$;

create function public.individual_study_plan_invalid() returns void
language plpgsql immutable set search_path=pg_catalog,public as $$
begin
  raise exception 'Invalid study plan request' using errcode='22023';
end $$;

create function public.individual_study_plan_scope(input jsonb, a public.access_assignments)
returns public.pupil_placements
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare pl public.pupil_placements; p public.pupils; target_unit uuid; target_pupil uuid;
begin
  if input->>'contractVersion' is distinct from 'individual_study_plan_v1' then
    perform public.individual_study_plan_invalid();
  end if;
  target_unit := public.tjanst_uuid(input->'unitId');
  target_pupil := public.tjanst_uuid(input->'pupilId');
  select * into pl from public.pupil_placements
    where id=public.tjanst_uuid(input->'placementId') and customer_id=a.customer_id and organizer_id=a.organizer_id
      and unit_id=target_unit and pupil_id=target_pupil;
  select * into p from public.pupils where id=target_pupil and customer_id=a.customer_id and organizer_id=a.organizer_id;
  if a.scope_kind is distinct from 'school' or pl.id is null or p.id is null
    or not public.phase4_scope(a.id,p.id,target_unit)
    or (p.protected_identity and not public.phase4_can_read_protected(p.id,target_unit)) then
    raise exception 'Study plan denied' using errcode='42501';
  end if;
  return pl;
end $$;

create function public.individual_study_plan_scope_json(pl public.pupil_placements)
returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
  select jsonb_build_object('contractVersion','individual_study_plan_v1','unitId',pl.unit_id,'pupilId',pl.pupil_id,'placementId',pl.id)
$$;

create function public.individual_study_plan_envelope(a public.access_assignments, result jsonb)
returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select jsonb_build_object('contractVersion','individual_study_plan_sql_v1',
    'actor',jsonb_build_object('identityId',public.current_identity_id(),'assignmentId',a.id),'result',result)
$$;

create function public.individual_study_plan_audit(a public.access_assignments, pl public.pupil_placements, operation text)
returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare s public.app_sessions; i public.identities;
begin
  s:=public.phase5_programplan_session_check();
  select * into strict i from public.identities where id=s.identity_id;
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,
    session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,
    s.id,a.membership_id,a.id,a.customer_id,operation,'pupil_placement',pl.id,'ok',jsonb_build_object('unitId',pl.unit_id));
exception when others then
  raise exception 'Study plan audit unavailable' using errcode='55000';
end $$;

create function public.individual_study_plan_revision_json(r public.individual_study_plan_revisions, include_content boolean)
returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select case when r.plan_id is null then null else jsonb_build_object(
    'planId',r.plan_id,'revision',r.revision,'state',r.state,'effectiveOn',r.effective_on,
    'recordedAt',to_char(r.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    || case when include_content then jsonb_build_object('content',r.content) else '{}'::jsonb end end
$$;

create function public.individual_study_plan_on(p_id uuid, on_date date)
returns public.individual_study_plan_revisions
language sql stable security definer set search_path=pg_catalog,public as $$
  select r from public.individual_study_plan_revisions r
  where r.plan_id=p_id and r.state='current' and r.effective_on<=on_date
  order by r.effective_on desc,r.revision desc limit 1
$$;

-- SP-05 fills the scoped, read-only comparison projection through this entry point.
create function public.individual_study_plan_impact(input jsonb, pl public.pupil_placements, on_date date)
returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select case when input->>'view'='options' then jsonb_build_object('status','unavailable','options','[]'::jsonb)
    else jsonb_build_object('status','unavailable','target',input->'target','impact',null) end
$$;

-- Underlaget har skolplaceringens inkluderande datum och versionsbundna källor.
-- Läsårskalendern ger datumstöd och hålls utanför källans versionskontroll.
create function public.individual_study_plan_basis(pl public.pupil_placements, lock_sources boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
 o public.offerings;
 pp public.point_plans;
 catalog_id_found text;
 pinned_catalog_id text;
 pinned_program_version jsonb;
 program_doc jsonb;
 started_on date;
 regime text;
 path jsonb;
 pinned_plan jsonb;
 choice_refs jsonb;
 choices jsonb;
 calendars jsonb;
 basis jsonb;
 higher_education constant text[] := array['EK25','ES25','HU25','NA25','SA25','TE25'];
 vocational constant text[] := array['BA25','BF25','EE25','FR25','FS25','FT25','HT25','IN25','NB25','RL25','VF25','VO25'];
begin
 -- Källskrivarna för utbildning, valplaner och deltagarval delar kundlåset
 -- som RPC:ns mandatkontroll redan håller. Lås befintliga utbildningsrader vid sparande.
 if lock_sources then
  select * into o from public.offerings where id=pl.offering_id and organizer_id=pl.organizer_id for share;
  select * into pp from public.point_plans
   where offering_id=o.id and organizer_id=o.organizer_id and status='faststalld' for share;
 else
  select * into o from public.offerings where id=pl.offering_id and organizer_id=pl.organizer_id;
  select * into pp from public.point_plans
   where offering_id=o.id and organizer_id=o.organizer_id and status='faststalld';
 end if;
 if o.id is null then
  raise exception 'Study plan source denied' using errcode='42501';
 end if;

 -- För en känd kull är 1 juli en gräns för katalogurval. Den fasta
 -- programplanens uttryckligt dokumenterade start väger tyngre.
 started_on := coalesce(
  case when public.phase5_programplan_date(pp.basis_reference->'startedOn')
    then (pp.basis_reference->>'startedOn')::date end,
  make_date(o.start_year,7,1),pl.starts_on);
 regime := case
  when o.kind<>'gymnasium' then 'unsupported'
  when started_on<date '2025-07-01' then 'gy11'
  when o.program_code=any(higher_education) or o.program_code=any(vocational) then 'national_gy25'
  else 'unsupported'
 end;
 path := jsonb_build_object(
  'regime',regime,
  'programCode',case when public.phase5_programplan_code(to_jsonb(o.program_code)) then o.program_code else 'UNKNOWN' end,
  'orientationCode',case when public.phase5_programplan_code(to_jsonb(o.orientation_code)) then o.orientation_code end,
  'apprenticeship',null,'specialVariantCode',null);

 if regime='national_gy25' then
  select r.catalog_id,r.content #> '{source,programVersion}' into pinned_catalog_id,pinned_program_version
   from public.individual_study_plans s join public.individual_study_plan_revisions r on r.plan_id=s.id
   where s.placement_id=pl.id and s.offering_id=o.id and r.catalog_id is not null
   order by r.revision desc limit 1;
  select cat.catalog_id,p.value into catalog_id_found,program_doc
   from public.programplan_catalogs cat
   cross join lateral jsonb_array_elements(cat.payload->'programs') p
   where p.value->>'code'=o.program_code
     and (
       (o.program_code=any(higher_education) and p.value->>'category'='PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION')
       or (o.program_code=any(vocational) and p.value->>'category'='VOCATIONAL_PROGRAM')
     )
     and public.phase5_programplan_date_diagnostic(p.value,to_char(started_on,'YYYY-MM-DD')) is null
   order by coalesce(cat.catalog_id=pinned_catalog_id and p.value->'version'=pinned_program_version,false) desc,
     (coalesce(cat.catalog_id=pp.catalog_id
     and p.value->'version'=pp.basis_reference#>'{programRef,version}'
     and o.program_code=pp.basis_reference#>>'{programRef,code}'
     and o.orientation_code is not distinct from pp.basis_reference->>'orientationCode',false)) desc,
     cat.payload#>>'{source,fetched}' desc,(p.value->>'version')::integer desc,cat.catalog_id collate "C"
   limit 1;

  if catalog_id_found=pp.catalog_id
    and program_doc->'version'=pp.basis_reference#>'{programRef,version}'
    and o.program_code=pp.basis_reference#>>'{programRef,code}'
    and o.orientation_code is not distinct from pp.basis_reference->>'orientationCode' then
   pinned_plan := jsonb_build_object(
    'id',pp.id,'revision',pp.revision,'version',pp.version,
    'specializationRefs',pp.basis_reference->'specializationRefs');
  end if;
 end if;

 -- Ett elevval saknar placerings-ID. Vid två placeringar på samma skola
 -- under valets läsår måste skolan granska vilken utbildning valet gäller.
 with pupil_choices as materialized (
  select c.id,c.revision,c.course_ids,v.id as valplan_id,v.kind as source_kind,
   case v.kind when 'modernLanguage' then 'language' when 'languageSubject' then 'language'
    when 'specialization' then 'specialization' when 'naturalScience' then 'optional' else 'individual' end as kind,
   case when not exists(
     select 1 from public.pupil_placements p
     where p.pupil_id=pl.pupil_id and p.unit_id=pl.unit_id and p.id<>pl.id
       and daterange(p.starts_on,p.ends_on,'[]') && daterange(make_date(v.school_year,7,1),make_date(v.school_year+1,6,30),'[]')
    ) and public.valplan_choice_state(c)='confirmed' then 'confirmed' else 'unresolved' end as state
  from public.valplan_choices c
  join public.valplan_rounds r on r.id=c.round_id
  join public.valplans v on v.id=r.valplan_id and v.unit_id=r.unit_id and v.school_year=r.school_year
  where c.pupil_id=pl.pupil_id and r.unit_id=pl.unit_id and v.organizer_id=pl.organizer_id
    and daterange(pl.starts_on,pl.ends_on,'[]') && daterange(make_date(r.school_year,7,1),make_date(r.school_year+1,6,30),'[]')
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'revision',c.revision) order by c.id),'[]'::jsonb),
  coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'revision',c.revision,'kind',c.kind,'sourceKind',c.source_kind,'state',c.state,
   'levels',case when c.state='confirmed' then (
    select coalesce(jsonb_agg(jsonb_build_object(
     'subjectCode',l.subject_code,'subjectVersion',l.subject_version,'itemCode',l.item_code,
     'languageCode',l.language_code,'points',l.points,'label',l.name) order by l.position,l.id),'[]'::jsonb)
    from public.valplan_courses l where l.id=any(c.course_ids) and l.valplan_id=c.valplan_id and l.active
   ) else '[]'::jsonb end) order by c.id),'[]'::jsonb)
 into choice_refs,choices
 from pupil_choices c;

 select coalesce(jsonb_agg(jsonb_build_object('schoolYear',y.start_year,'htStart',y.ht_start,'htEnd',y.ht_end,
    'vtStart',y.vt_start,'vtEnd',y.vt_end) order by y.start_year),'[]'::jsonb)
 into calendars
 from (
  select start_year,ht_start,ht_end,vt_start,vt_end from public.school_years
  where unit_id=pl.unit_id and organizer_id=pl.organizer_id and status='faststalld' and superseded_by is null
    and ht_start>=make_date(start_year,7,1) and vt_end<=make_date(start_year+1,6,30)
    and daterange(pl.starts_on,pl.ends_on,'[]') && daterange(make_date(start_year,7,1),make_date(start_year+1,6,30),'[]')
  order by start_year desc limit 30
 ) y;

 basis := jsonb_build_object(
  'path',path,
  'source',jsonb_build_object(
   'offeringId',o.id,'placementStartsOn',pl.starts_on,'placementEndsOn',pl.ends_on,
   'catalogId',catalog_id_found,'programVersion',program_doc->'version','choices',choice_refs),
  'startedOn',started_on,'offeringRevision',o.lifecycle_revision,'programPlan',pinned_plan,'choices',choices);
 return basis || jsonb_build_object('calendar',calendars,'token',public.tjanst_hash(basis));
end $$;


create function public.individual_study_plan_read(input jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  fields text[]:=array['contractVersion','unitId','pupilId','placementId','on','view'];
  a public.access_assignments; pl public.pupil_placements; plan public.individual_study_plans;
  latest public.individual_study_plan_revisions; picked public.individual_study_plan_revisions;
  result jsonb; history jsonb; basis jsonb; on_date date;
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
      result:=result||jsonb_build_object(
        'current',public.individual_study_plan_revision_json(picked,true),
        'draft',case when latest.state='draft' then public.individual_study_plan_revision_json(latest,true) else null end,
        'latestRevision',coalesce(latest.revision,0),
        'canMakeCurrent',a.function='rektor' and coalesce(pl.ends_on,'infinity'::date)>=public.app_today(),
        'sourceToken',basis->>'token','basisStatus',case
          when basis #>> '{path,regime}' <> 'national_gy25' then 'unsupported'
          when basis #>> '{source,catalogId}' is null then 'incomplete' else 'ready' end,
        'basisIssues','[]'::jsonb,'availableLevels','[]'::jsonb,'calendar',basis->'calendar');
    else
      result:=result||jsonb_build_object('version',public.individual_study_plan_revision_json(picked,true));
    end if;
  end if;
  perform public.individual_study_plan_audit(a,pl,'individual_study_plan_read');
  return public.individual_study_plan_envelope(a,result)||jsonb_build_object(
    'basis',basis,'latest',case when view_name='current' then public.individual_study_plan_revision_json(latest,true) else null end);
end $$;

create function public.individual_study_plan_receipt_json(q public.individual_study_plan_receipts)
returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('commandId',q.command_id,'action',q.action,'snapshot',public.individual_study_plan_revision_json(r,true))
  from public.individual_study_plan_revisions r where r.plan_id=q.plan_id and r.revision=q.revision
$$;

create function public.individual_study_plan_status(input jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; pl public.pupil_placements; receipt public.individual_study_plan_receipts; cid uuid;
begin
  perform public.phase4_keys(input,array['contractVersion','unitId','pupilId','placementId','commandId']);
  a:=public.elective_staff_scope(public.tjanst_uuid(input->'unitId'));
  pl:=public.individual_study_plan_scope(input,a);
  cid:=public.tjanst_uuid(input->'commandId');
  select q.* into receipt from public.individual_study_plan_receipts q
    join public.individual_study_plans p on p.id=q.plan_id
    where q.command_id=cid and p.placement_id=pl.id
      and q.actor_identity_id=public.current_identity_id() and q.assignment_id=a.id;
  perform public.individual_study_plan_audit(a,pl,'individual_study_plan_status');
  return public.individual_study_plan_envelope(a,public.individual_study_plan_scope_json(pl)
    ||jsonb_build_object('commandId',cid,'receipt',public.individual_study_plan_receipt_json(receipt)));
end $$;

create function public.individual_study_plan_issues(content jsonb)
returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
  select content->'sourceIssues'
    || case when content #>> '{source,catalogId}' is null or content #>> '{source,programVersion}' is null
      then '[{"code":"catalog_missing","field":"path"}]'::jsonb else '[]'::jsonb end
    || case when jsonb_typeof(content #> '{path,apprenticeship}') is distinct from 'boolean'
      then '[{"code":"apprenticeship_unknown","field":"path"}]'::jsonb else '[]'::jsonb end
    || case when exists(select 1 from jsonb_array_elements(content->'levels') l where l->>'kind'='gy25_level')
       and exists(select 1 from jsonb_array_elements(content->'levels') l where l->>'kind'='diploma_work')
      then '[]'::jsonb else '[{"code":"levels_incomplete","field":"levels"}]'::jsonb end
    || case when jsonb_typeof(content->'compulsorySchoolSubjects') is distinct from 'array'
      then '[{"code":"compulsory_school_subjects_unknown","field":"compulsorySchoolSubjects"}]'::jsonb else '[]'::jsonb end
    || case when content #>> '{distanceTeaching,kind}'='none' or
         content #>> '{distanceTeaching,kind}'='applies' and public.phase5_programplan_integer(content #> '{distanceTeaching,minutes}',1,1000000)
      then '[]'::jsonb else '[{"code":"distance_teaching_incomplete","field":"distanceTeaching"}]'::jsonb end
    || (select coalesce(jsonb_agg(jsonb_build_object('code','choice_unresolved','field',c->>'id')),'[]'::jsonb)
      from jsonb_array_elements(content->'choices') c where c->>'state'='unresolved')
$$;

create function public.individual_study_plan_planned_date(value jsonb)
returns text
language plpgsql immutable set search_path=pg_catalog,public as $$
begin
  if value='null'::jsonb then return null; end if;
  if public.phase5_programplan_shape(value,array['kind','date']) and value->>'kind'='day'
    and public.phase5_programplan_date(value->'date') then
    return value->>'date';
  end if;
  if public.phase5_programplan_shape(value,array['kind','schoolYear','term']) and value->>'kind'='term'
    and public.phase5_programplan_integer(value->'schoolYear',1900,9998) and value->>'term' in ('HT','VT') then
    return value->>'schoolYear';
  end if;
  perform public.individual_study_plan_invalid();
  return null;
end $$;

create function public.individual_study_plan_validate_draft(content jsonb, prior jsonb, basis jsonb)
returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  lvl jsonb; prev_level jsonb; attempt jsonb; prev_attempt jsonb; actual jsonb; catalog jsonb;
  planned_start text; planned_end text; language_rule text; identity_count integer;
begin
  if not public.phase5_programplan_shape(content,array['path','source','levels','choices','decisions','compulsorySchoolSubjects','distanceTeaching','dialogue','sourceIssues'])
    or not public.phase5_programplan_shape(content->'path',array['regime','programCode','orientationCode','apprenticeship','specialVariantCode'])
    or jsonb_typeof(content #> '{path,apprenticeship}') not in ('boolean','null')
    or (content->'path')-'apprenticeship' is distinct from (basis->'path')-'apprenticeship'
    or content->'source' is distinct from basis->'source'
    or not public.phase5_programplan_array(content->'levels',150)
    or not public.phase5_programplan_array(content->'choices',150)
    or not public.phase5_programplan_array(content->'sourceIssues',150)
    or not public.phase5_programplan_shape(content->'distanceTeaching',array['kind','minutes'])
    or content #>> '{distanceTeaching,kind}' is null
    or content #>> '{distanceTeaching,kind}' not in ('unknown','none','applies')
    or (content #> '{distanceTeaching,minutes}') <> 'null'::jsonb and
      (content #>> '{distanceTeaching,kind}' <> 'applies' or not public.phase5_programplan_integer(content #> '{distanceTeaching,minutes}',1,1000000))
    or jsonb_typeof(content->'compulsorySchoolSubjects') not in ('array','null')
    or content->'dialogue' is distinct from 'null'::jsonb
    or content->'decisions' is distinct from coalesce(prior->'decisions','[]'::jsonb) then
    perform public.individual_study_plan_invalid();
  end if;
  select payload into catalog from public.programplan_catalogs where catalog_id=basis #>> '{source,catalogId}';
  select count(distinct x->>'id') into identity_count from jsonb_array_elements(content->'levels') x;
  if identity_count<>jsonb_array_length(content->'levels')
    or exists (select 1 from jsonb_array_elements(content->'levels') x
      group by x->'kind',x->'subjectCode',x->'subjectVersion',x->'itemCode',x->'languageCode' having count(*)>1)
    or exists (select 1 from jsonb_array_elements(content->'levels') x
      cross join lateral jsonb_array_elements(x->'attempts') y group by y->'id' having count(*)>1)
    or exists (select 1 from jsonb_array_elements(content->'choices') c where
      not public.phase5_programplan_shape(c,array['id','kind','label','state','levelIds'])
      or c->>'kind' is null or c->>'kind' not in ('orientation','specialization','individual','language','optional')
      or c->>'state' is null or c->>'state' not in ('unresolved','confirmed','not_applicable')
      or not public.phase5_programplan_array(c->'levelIds',150)
      or exists(select 1 from jsonb_array_elements_text(c->'levelIds') ref
        where not exists(select 1 from jsonb_array_elements(content->'levels') n where n->>'id'=ref))) then
    perform public.individual_study_plan_invalid();
  end if;
  for lvl in select value from jsonb_array_elements(content->'levels') loop
    perform public.tjanst_uuid(lvl->'id');
    if not public.phase5_programplan_shape(lvl,array['id','kind','subjectCode','subjectVersion','itemCode','languageCode','label','points','attempts'])
      or not public.phase5_programplan_array(lvl->'attempts',20) or jsonb_array_length(lvl->'attempts')=0
      or not public.phase5_programplan_text(lvl->'label',240)
      or not public.phase5_programplan_integer(lvl->'points',1,10000) then perform public.individual_study_plan_invalid(); end if;
    if lvl->>'kind'='gy25_level' then
      language_rule:=coalesce(public.valplan_language_rule(lvl->>'subjectCode'),'none');
      if not (case language_rule when 'pick' then jsonb_typeof(lvl->'languageCode')='string'
          when 'none' then lvl->'languageCode'='null'::jsonb
          else lvl->>'languageCode'=language_rule end) is true then
        perform public.individual_study_plan_invalid();
      end if;
      if not exists (select 1 from jsonb_array_elements(catalog->'subjects') s
        cross join lateral jsonb_array_elements(s->'items') item
        where s->>'code'=lvl->>'subjectCode' and s->'version'=lvl->'subjectVersion' and s->'schoolTypes'?'GY'
          and s->>'typeOfSyllabus'='GRADE_SUBJECT_SYLLABUS'
          and item->>'code'=lvl->>'itemCode' and item->'points'=lvl->'points') then
        perform public.individual_study_plan_invalid();
      end if;
    elsif lvl->>'kind' is distinct from 'diploma_work' or lvl->>'itemCode' is distinct from 'GYAR'||(basis #>> '{path,programCode}')
      or lvl->'points'<>'100'::jsonb or lvl->>'subjectCode' is not null or lvl->>'subjectVersion' is not null
      or lvl->>'languageCode' is not null then
      perform public.individual_study_plan_invalid();
    end if;
    select value into prev_level from jsonb_array_elements(prior->'levels') where value->>'id'=lvl->>'id';
    if prev_level is not null and prev_level-array['attempts','label'] is distinct from lvl-array['attempts','label'] then
      perform public.individual_study_plan_invalid();
    end if;
    for attempt in select value from jsonb_array_elements(lvl->'attempts') loop
      perform public.tjanst_uuid(attempt->'id');
      if not public.phase5_programplan_shape(attempt,array['id','plannedStart','plannedEnd','actual']) then
        perform public.individual_study_plan_invalid();
      end if;
      planned_start:=public.individual_study_plan_planned_date(attempt->'plannedStart');
      planned_end:=public.individual_study_plan_planned_date(attempt->'plannedEnd');
      if length(planned_start)=10 and length(planned_end)=10 and planned_start>planned_end
        or length(planned_start)=4 and length(planned_end)=4 and
          (planned_start>planned_end or planned_start=planned_end and attempt #>> '{plannedStart,term}'='VT' and attempt #>> '{plannedEnd,term}'='HT')
        or length(planned_start)=4 and length(planned_end)=10 and planned_end<planned_start||'-07-01'
        or length(planned_start)=10 and length(planned_end)=4 and planned_start>((left(planned_end,4)::integer+1)::text||'-06-30') then
        perform public.individual_study_plan_invalid();
      end if;
      select value into prev_attempt from jsonb_array_elements(prev_level->'attempts') where value->>'id'=attempt->>'id';
      actual:=coalesce(prev_attempt->'actual','{"certainty":"recorded","start":null,"end":null}'::jsonb);
      if attempt->'actual' is distinct from actual then perform public.individual_study_plan_invalid(); end if;
    end loop;
  end loop;
  -- Alla registrerade faktiska uppgifter och samtliga beslutade rader måste förbli återläsbara.
  if exists (
    select 1 from jsonb_array_elements(prior->'levels') old_level
      cross join lateral jsonb_array_elements(old_level->'attempts') old_attempt
    where (old_attempt #>> '{actual,start,on}' is not null or old_attempt #>> '{actual,end,on}' is not null
        or old_attempt #>> '{actual,certainty}'='unknown')
      and not exists (select 1 from jsonb_array_elements(content->'levels') new_level
        cross join lateral jsonb_array_elements(new_level->'attempts') new_attempt
        where new_level->>'id'=old_level->>'id' and new_attempt->>'id'=old_attempt->>'id'))
    or exists (select 1 from jsonb_array_elements(content->'decisions') d
       cross join lateral jsonb_array_elements_text((d->'levelIds')||(d->'replacementLevelIds')) ref
       where not exists (select 1 from jsonb_array_elements(content->'levels') l where l->>'id'=ref)) then
    perform public.individual_study_plan_invalid();
  end if;
end $$;

create function public.individual_study_plan_actual(content jsonb, payload jsonb)
returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare coordinates text[]; event jsonb:=payload->'event'; actual jsonb; event_date date;
begin
  perform public.phase4_keys(payload,array['levelId','attemptId','event']);
  perform public.phase4_keys(event,array['kind','on','source']);
  perform public.phase4_keys(event->'source',array['kind','id']);
  perform public.tjanst_uuid(event #> '{source,id}');
  if event #>> '{source,kind}' is null or event #>> '{source,kind}' not in ('school_record','previous_school') then
    perform public.individual_study_plan_invalid();
  end if;
  select array['levels',(l.nr-1)::text,'attempts',(a.nr-1)::text,'actual'] into coordinates
    from jsonb_array_elements(content->'levels') with ordinality l(value,nr)
    cross join lateral jsonb_array_elements(l.value->'attempts') with ordinality a(value,nr)
    where l.value->>'id'=payload->>'levelId' and a.value->>'id'=payload->>'attemptId';
  event_date:=public.study_group_date(event->'on');
  if coordinates is null or event_date>public.app_today() then perform public.individual_study_plan_invalid(); end if;
  actual:=content #> coordinates;
  case event->>'kind'
    when 'started' then
      actual:=jsonb_set(actual,'{start}',event-'kind');
      actual:=jsonb_set(actual,'{certainty}','"recorded"'::jsonb);
    when 'completed','interrupted' then
      if actual->'start'='null'::jsonb and actual->>'certainty'='recorded' then perform public.individual_study_plan_invalid(); end if;
      actual:=jsonb_set(actual,'{end}',event);
    else perform public.individual_study_plan_invalid();
  end case;
  if actual #>> '{start,on}'>actual #>> '{end,on}' then perform public.individual_study_plan_invalid(); end if;
  return jsonb_set(content-'dialogue',coordinates,actual)||'{"dialogue":null}'::jsonb;
end $$;

create function public.individual_study_plan_decision(content jsonb, decision jsonb)
returns jsonb
language plpgsql stable set search_path=pg_catalog,public as $$
declare kind text:=decision->>'kind'; decision_on date; effective_on date; ids jsonb; replacements jsonb;
begin
  perform public.phase4_keys(decision,array['kind','id','reference','decidedOn','effectiveOn','endsOn','scopePoints','levelIds','replacementLevelIds']);
  perform public.phase4_keys(decision->'reference',array['kind','id']);
  perform public.tjanst_uuid(decision->'id');
  perform public.tjanst_uuid(decision #> '{reference,id}');
  decision_on:=public.study_group_date(decision->'decidedOn');
  effective_on:=public.study_group_date(decision->'effectiveOn');
  ids:=decision->'levelIds';
  replacements:=decision->'replacementLevelIds';
  if kind is null or kind not in ('extended','adapted','reduced','eligibility_opt_out','replaced')
    or decision #>> '{reference,kind}' is distinct from (case when kind='reduced' then 'action_programme_decision' else 'school_decision' end)
    or decision_on>public.app_today() or decision_on>effective_on
    or decision->'endsOn'<>'null'::jsonb and public.study_group_date(decision->'endsOn')<effective_on
    or not public.phase5_programplan_array(ids,150) or not public.phase5_programplan_array(replacements,150)
    or (kind='reduced' and not public.phase5_programplan_integer(decision->'scopePoints',1,10000))
    or (kind<>'reduced' and (decision->'scopePoints'<>'null'::jsonb or jsonb_array_length(ids)=0))
    or (kind='replaced' and jsonb_array_length(replacements)=0)
    or (kind not in ('adapted','replaced') and jsonb_array_length(replacements)<>0)
    or exists (select 1 from jsonb_array_elements(content->'decisions') d where d->>'id'=decision->>'id')
    or exists (select 1 from jsonb_array_elements_text(ids||replacements) r
      where not exists (select 1 from jsonb_array_elements(content->'levels') l where l->>'id'=r))
    or (select count(distinct r) from jsonb_array_elements_text(ids||replacements) r) <> jsonb_array_length(ids||replacements)
    then perform public.individual_study_plan_invalid();
  end if;
  return content||jsonb_build_object('dialogue',null,'decisions',(content->'decisions')||jsonb_build_array(decision));
end $$;

create function public.individual_study_plan_command(input jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  cmd jsonb:=input->'command'; payload jsonb:=cmd->'payload'; action text:=cmd->>'action';
  a public.access_assignments; pl public.pupil_placements; plan public.individual_study_plans;
  latest public.individual_study_plan_revisions; receipt public.individual_study_plan_receipts;
  cid uuid; digest bytea; result jsonb; basis jsonb; issues jsonb; next_content jsonb;
  effective date; dialogue_date date; reason text;
begin
  perform public.phase4_keys(input,array['command','content']);
  perform public.phase4_keys(cmd,array['contractVersion','unitId','pupilId','placementId','commandId','expectedRevision','expectedSourceToken','action','payload']);
  if action is null or action not in ('prepare_draft','record_actual','record_decision','record_dialogue','make_current')
    or not public.phase5_programplan_integer(cmd->'expectedRevision',0,2147483645)
    or jsonb_typeof(cmd->'expectedSourceToken') is distinct from 'string' or cmd->>'expectedSourceToken' !~ '^sha256:[0-9a-f]{64}$'
    or jsonb_typeof(payload) is distinct from 'object'
    or action<>'prepare_draft' and input->'content' is distinct from 'null'::jsonb then
    perform public.individual_study_plan_invalid();
  end if;
  a:=public.elective_staff_scope(public.tjanst_uuid(cmd->'unitId'));
  pl:=public.individual_study_plan_scope(cmd,a);
  if action in ('record_decision','make_current') and a.function<>'rektor' then
    raise exception 'Study plan decision denied' using errcode='42501';
  end if;
  -- The customer guard serializes scoped changes. Take the row locks before deriving the source token.
  perform 1 from public.pupils where id=pl.pupil_id for share;
  select * into strict pl from public.pupil_placements where id=pl.id for share;
  select * into plan from public.individual_study_plans p where p.placement_id=pl.id for update;
  select * into latest from public.individual_study_plan_revisions r where r.plan_id=plan.id order by r.revision desc limit 1;
  cid:=public.tjanst_uuid(cmd->'commandId');
  digest:=extensions.digest(convert_to(cmd::text,'UTF8'),'sha256');
  result:=public.individual_study_plan_scope_json(pl)||jsonb_build_object('commandId',cid);
  perform pg_advisory_xact_lock(hashtextextended(cid::text,112001));
  select * into receipt from public.individual_study_plan_receipts q where q.command_id=cid;
  if receipt.command_id is not null then
    if receipt.plan_id is distinct from plan.id or receipt.actor_identity_id is distinct from public.current_identity_id()
      or receipt.assignment_id is distinct from a.id or receipt.request_hash is distinct from digest then
      reason:='command';
    else
      perform public.individual_study_plan_audit(a,pl,'individual_study_plan_replayed');
      return public.individual_study_plan_envelope(a,result||jsonb_build_object('status','saved','receipt',public.individual_study_plan_receipt_json(receipt)));
    end if;
  elsif (cmd->>'expectedRevision')::integer<>coalesce(latest.revision,0) then
    reason:='revision';
  else
    basis:=public.individual_study_plan_basis(pl,true);
    if basis->>'token' is distinct from cmd->>'expectedSourceToken'
      or (action<>'prepare_draft' and latest.plan_id is not null and latest.source_token is distinct from basis->>'token') then
      reason:='source';
    end if;
  end if;
  if reason is not null then
    return public.individual_study_plan_envelope(a,result||jsonb_build_object('status','conflict','reason',reason,'latestRevision',coalesce(latest.revision,0)));
  end if;
  if coalesce(pl.ends_on,'infinity'::date)<public.app_today() or (plan.id is not null and plan.offering_id<>pl.offering_id) then
    raise exception 'Study plan placement closed' using errcode='42501';
  end if;
  if basis #>> '{path,regime}' is distinct from 'national_gy25' then
    return public.individual_study_plan_envelope(a,result||'{"status":"incomplete","issues":[{"code":"unsupported_path","field":"path"}]}'::jsonb);
  end if;
  if latest.plan_id is null and action<>'prepare_draft' then perform public.individual_study_plan_invalid(); end if;
  next_content:=latest.content;
  case action
    when 'prepare_draft' then
      next_content:=input->'content';
      perform public.individual_study_plan_validate_draft(next_content,latest.content,basis);
    when 'record_actual' then
      next_content:=public.individual_study_plan_actual(next_content,payload);
    when 'record_decision' then
      perform public.phase4_keys(payload,array['decision']);
      next_content:=public.individual_study_plan_decision(next_content,payload->'decision');
    when 'record_dialogue' then
      perform public.phase4_keys(payload,array['on']);
      dialogue_date:=public.study_group_date(payload->'on');
      if latest.state<>'draft' or dialogue_date>public.app_today() then perform public.individual_study_plan_invalid(); end if;
      next_content:=next_content||jsonb_build_object('dialogue',jsonb_build_object('on',dialogue_date,'reviewedRevision',latest.revision));
    when 'make_current' then
      perform public.phase4_keys(payload,array['effectiveOn']);
      effective:=public.study_group_date(payload->'effectiveOn');
      if latest.state<>'draft' or effective<pl.starts_on or effective>coalesce(pl.ends_on,'infinity'::date) then
        perform public.individual_study_plan_invalid();
      end if;
      issues:=public.individual_study_plan_issues(next_content);
      if (next_content #>> '{dialogue,reviewedRevision}')::integer is distinct from latest.revision-1 then
        issues:=issues||'[{"code":"dialogue_required","field":"dialogue"}]'::jsonb;
      end if;
      if jsonb_array_length(issues)>0 then
        return public.individual_study_plan_envelope(a,result||jsonb_build_object('status','incomplete','issues',issues));
      end if;
  end case;
  if plan.id is null then
    insert into public.individual_study_plans(placement_id,customer_id,pupil_id,unit_id,offering_id)
      values(pl.id,pl.customer_id,pl.pupil_id,pl.unit_id,pl.offering_id) returning * into plan;
  end if;
  insert into public.individual_study_plan_revisions(plan_id,revision,state,effective_on,catalog_id,source_token,content,actor_identity_id,assignment_id)
    values(plan.id,coalesce(latest.revision,0)+1,case when effective is null then 'draft' else 'current' end,
      effective,next_content #>> '{source,catalogId}',basis->>'token',next_content,public.current_identity_id(),a.id) returning * into latest;
  insert into public.individual_study_plan_receipts(command_id,plan_id,revision,assignment_id,actor_identity_id,action,request_hash)
    values(cid,plan.id,latest.revision,a.id,public.current_identity_id(),action,digest) returning * into receipt;
  perform public.individual_study_plan_audit(a,pl,'individual_study_plan_saved');
  return public.individual_study_plan_envelope(a,result||jsonb_build_object('status','saved','receipt',public.individual_study_plan_receipt_json(receipt)));
end $$;

do $$
declare fn regprocedure;
begin
  for fn in select oid::regprocedure from pg_proc
    where pronamespace='public'::regnamespace and proname ~ '^individual_study_plan_'
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role,skolplattform_worker',fn);
  end loop;
end $$;
grant execute on function public.individual_study_plan_read(jsonb),public.individual_study_plan_command(jsonb),
  public.individual_study_plan_status(jsonb) to skolplattform_worker;
