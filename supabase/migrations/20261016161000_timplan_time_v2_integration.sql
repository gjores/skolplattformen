-- Activate only with the complete V2-aware Worker and UI. No existing plan backfill.

create or replace function public.phase5_gym_timplan_result(plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;o public.offerings;a public.access_assignments;catalog jsonb;current_source jsonb;values jsonb;result jsonb;
begin
 select * into p from public.timplans where id=plan_id;
 if p.gym_basis is null then raise exception 'Gym legacy basis unavailable' using errcode='42501',hint='gym_timplan_legacy';end if;
 select * into o from public.offerings where id=p.offering_id;
 a:=public.phase3_actor();select payload into catalog from public.programplan_catalogs where catalog_id=p.gym_basis->>'catalogId';
 select jsonb_build_object('planId',q.id,'version',q.version,'revision',q.revision,'status',q.status) into current_source
 from public.point_plans q where q.offering_id=p.offering_id and q.organizer_id=p.organizer_id order by version desc,id limit 1;
 select coalesce(jsonb_object_agg(c.row_id,(select jsonb_agg(case when c.allocated[n] then to_jsonb(c.hours[n]) else 'null'::jsonb end order by n) from generate_series(1,6) n)),'{}'::jsonb)
 into values from public.timplan_cells c where c.timplan_id=p.id;
 result:=jsonb_build_object('id',p.id,'offeringId',p.offering_id,'unitId',p.unit_id,'schoolName',(select name from public.school_units where id=p.unit_id),
 'version',p.version,'revision',p.revision,'status',p.status,'series',public.phase5_named_timplan_plan_series(p.id),'nameAtCreation',p.name_at_creation,'source',p.gym_basis,'catalog',catalog,'currentSource',current_source,'currentSourceBasis',case when current_source is null then null else public.phase5_gym_timplan_source((current_source->>'planId')::uuid) end,'hours',values,
 'canPlan',a.function in ('rektor','administrator') and p.status in ('utkast','atersand') and o.archived_at is null,'archived',o.archived_at is not null);
 if exists(select 1 from public.timplan_time_models tm where tm.plan_id=p.id) then
 result:=(result-'hours')||jsonb_build_object('timeModel','school_terms_annual_apl_v2','timeRows',public.phase5_timplan_time_rows(p.id),
 'timeCopyReview',(select copy_review from public.timplan_time_models tm where tm.plan_id=p.id));
 end if;
 return result;
end $$;

create or replace function public.phase5_write_gym_timplan_row(plan_id uuid,expected_revision integer,row_key text,row_hours jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;r jsonb;v integer;h smallint[]:='{}';mask boolean[]:='{}';points jsonb;
begin
 if expected_revision is null or expected_revision<0 or row_key is null or not public.phase5_programplan_array(row_hours,6) or jsonb_array_length(row_hours)<>6 then
 raise exception 'Invalid gym timplan row' using errcode='22023';end if;
 select * into p from public.timplans where id=plan_id;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,true);
 select * into p from public.timplans where id=plan_id for update;
 perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,true);
 if p.gym_basis is null or p.status not in ('utkast','atersand') then raise exception 'Gym timplan version locked' using errcode='42501';end if;
 if exists(select 1 from public.timplan_time_models tm where tm.plan_id=p.id) then raise exception 'Läs in tabellen med skoltimmar och års-APL.' using errcode='40001',hint='time_model_conflict';end if;
 if p.revision<>expected_revision then raise exception 'Gym timplan revision conflict' using errcode='40001';end if;
 select d->'points' into points from jsonb_array_elements(p.gym_basis->'distribution') d where d->>'rowKey'=row_key;
 if points is null then raise exception 'Invalid gym timplan row' using errcode='22023';end if;
 for v in 0..5 loop
  r:=row_hours->v;
  if r<>'null'::jsonb and not public.phase5_programplan_integer(r,0,2000) then raise exception 'Invalid gym timplan hours' using errcode='22023';end if;
  if (points->>v)::integer=0 and r<>'null'::jsonb then raise exception 'Inactive gym timplan term' using errcode='22023';end if;
  h:=array_append(h,case when r='null'::jsonb then 0 else (r#>>'{}')::numeric::smallint end);mask:=array_append(mask,r<>'null'::jsonb);
 end loop;
 update public.timplan_cells set hours=h,allocated=mask where timplan_id=p.id and row_id=row_key;
 if not found then raise exception 'Invalid gym timplan matrix' using errcode='22023';end if;
 update public.timplans set revision=revision+1 where id=p.id;
 insert into public.timplan_events(timplan_id,actor_role,action) values(p.id,'rektor','gym_timplan_row_changed');
 perform public.phase5_gym_timplan_audit(p.id,'gym_timplan_row_changed');return jsonb_build_object('id',p.id,'revision',p.revision+1,'rowKey',row_key,'hours',row_hours);
end $$;

create or replace function public.phase5_apl_hash_payload(gym jsonb,organizer uuid,apl jsonb,reviews jsonb,program jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare source_data jsonb:=gym->'source'; basis_data jsonb:=gym->'source'->'basisReference';
 row_data jsonb; row_key text; row_part text; row_kind text; block_kind text; block_count integer;
 row_terms jsonb; row_hours jsonb; rows_payload jsonb:='[]'::jsonb;
 apl_payload jsonb:='null'::jsonb; period_data jsonb; periods_payload jsonb:='[]'::jsonb;
 contents_payload jsonb; allocations_payload jsonb; review_data jsonb; reviews_payload jsonb:='[]'::jsonb;
 resolution_payload jsonb;
begin
 if organizer is null or jsonb_typeof(gym) is distinct from 'object'
  or jsonb_typeof(source_data->'rows') is distinct from 'array'
  or jsonb_typeof(source_data->'distribution') is distinct from 'array'
  or jsonb_typeof(basis_data) is distinct from 'object'
  or jsonb_typeof(reviews) is distinct from 'array'
  or jsonb_typeof(program) is distinct from 'object' then
  raise exception 'APL hash context missing' using errcode='22023',hint='apl_invalid_contract';
 end if;
 -- projectGymTimplan derives these attributes from the verified source's exact
 -- catalog/rows. Raw source.rows contains key+points, not the UI rowKind/part.
 for row_data in select item.value from jsonb_array_elements(source_data->'rows') item(value)
  order by (item.value->>'key') collate "C" loop
  row_key:=row_data->>'key';
  if row_key like 'block:%' then
   row_kind:='block';
   select count(*),min(item.value->>'kind') into block_count,block_kind
    from jsonb_array_elements(coalesce(basis_data->'choiceBlocks','[]'::jsonb)) item(value)
    where item.value->>'id'=substr(row_key,7);
   if block_count<>1 then raise exception 'APL hash block does not match frozen source' using errcode='22023',hint='apl_invalid_contract';end if;
   row_part:=case block_kind when 'modernLanguage' then 'programmeSpecific' when 'languageSubject' then 'orientation'
    when 'naturalScience' then 'orientation' when 'specialization' then 'specialization' when 'individualChoice' then 'individualChoice' else null end;
  elsif row_key like 'alternative:%' then row_kind:='alternative';row_part:=split_part(row_key,':',2);
  elsif row_key='meta:diplomaWork' then row_kind:='diplomaWork';row_part:='diplomaWork';
  elsif row_key='meta:individualChoice' then
   -- Exactly matches the legacy GymTimplan projection. APL readiness still
   -- rejects this unspecified frame as verified subject-level content.
   row_kind:='fixed';row_part:='individualChoice';
  else row_kind:='fixed';row_part:=split_part(row_key,':',1);end if;
  if row_part is null or row_part not in ('foundation','programmeSpecific','orientation','specialization','individualChoice','diplomaWork') then
   raise exception 'APL hash row part invalid' using errcode='22023',hint='apl_invalid_contract';
  end if;
  select item.value->'points' into row_terms from jsonb_array_elements(source_data->'distribution') item(value)
   where item.value->>'rowKey'=row_key;
  row_terms:=coalesce(row_terms,'[0,0,0,0,0,0]'::jsonb);
  row_hours:=case when gym->>'timeModel'='school_terms_annual_apl_v2' then gym->'timeRows'->row_key->'schoolMinutes' else gym->'hours'->row_key end;
  if jsonb_typeof(row_terms) is distinct from 'array' or jsonb_array_length(row_terms)<>6
   or jsonb_typeof(row_hours) is distinct from 'array' or jsonb_array_length(row_hours)<>6 then
   raise exception 'APL hash term matrix missing' using errcode='22023',hint='apl_invalid_contract';
  end if;
  rows_payload:=rows_payload||jsonb_build_array(jsonb_build_array(row_key,row_data->'points',row_part,row_kind,row_terms,row_hours) || case when gym->>'timeModel'='school_terms_annual_apl_v2' then jsonb_build_array(gym->'timeRows'->row_key->'annualAplMinutes') else '[]'::jsonb end);
 end loop;

 if apl is not null and apl<>'null'::jsonb then
  for period_data in select item.value from jsonb_array_elements(apl->'periods') item(value)
   order by (item.value->>'id') collate "C" loop
   select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'description')
    order by (item.value->>'rowKey') collate "C"),'[]'::jsonb) into contents_payload
    from jsonb_array_elements(period_data->'contents') item(value);
   select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'termIndex',item.value->'gutMinutes')
    order by (item.value->>'rowKey') collate "C",(item.value->>'termIndex')::integer),'[]'::jsonb) into allocations_payload
    from jsonb_array_elements(period_data->'allocations') item(value);
   periods_payload:=periods_payload||jsonb_build_array(jsonb_build_array(
    period_data->'id',period_data->'name',period_data->'startsOn',period_data->'endsOn',period_data->'schoolYear',
    jsonb_build_array(period_data->'extent'->'basis',period_data->'extent'->'weeks',period_data->'extent'->'reviewed',period_data->'extent'->'reviewNote'),
    contents_payload,allocations_payload) || case when period_data ? 'plannedTermIndex'
     then jsonb_build_array(jsonb_build_array('planned_term_v1',period_data->'plannedTermIndex')) else '[]'::jsonb end);
  end loop;
  apl_payload:=jsonb_build_array(apl->'contractVersion',apl->'educationForm',apl->'classification',periods_payload);
 end if;

 for review_data in select item.value from jsonb_array_elements(reviews) item(value)
  order by (item.value->>'id') collate "C" loop
  select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'description')
   order by (item.value->>'rowKey') collate "C"),'[]'::jsonb) into contents_payload
   from jsonb_array_elements(review_data->'contents') item(value);
  select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'termIndex',item.value->'gutMinutes')
   order by (item.value->>'rowKey') collate "C",(item.value->>'termIndex')::integer),'[]'::jsonb) into allocations_payload
   from jsonb_array_elements(review_data->'allocations') item(value);
  resolution_payload:=case when review_data->'resolution' is null or review_data->'resolution'='null'::jsonb then 'null'::jsonb
   else jsonb_build_array(review_data->'resolution'->'actorId',review_data->'resolution'->'assignmentId',review_data->'resolution'->'at',review_data->'resolution'->'note') end;
  reviews_payload:=reviews_payload||jsonb_build_array(jsonb_build_array(review_data->'id',review_data->'sourcePlanId',review_data->'sourceVersion',
   review_data->'sourcePeriodId',review_data->'sourcePeriodName',review_data->'reason',contents_payload,allocations_payload,resolution_payload));
 end loop;

 return jsonb_build_array(case when gym->>'timeModel'='school_terms_annual_apl_v2' then 'apl_content_v2' else 'apl_content_v1' end,
  jsonb_build_array(organizer::text,gym->'unitId',gym->'offeringId',gym->'id',gym->'series'->'id',gym->'version'),
  jsonb_build_array(source_data->'planId',source_data->'version',source_data->'catalogId',basis_data->'startedOn',
   source_data->'education'->'programCode',source_data->'education'->'orientationCode',program->'version',program->'category',
   program->'startDate',program->'endDate',program->'canceledDate',program->'sourceSupported'),
  rows_payload,apl_payload,reviews_payload) || case when gym->>'timeModel'='school_terms_annual_apl_v2' then jsonb_build_array((select coalesce(jsonb_agg(jsonb_build_array(x->'id',x->'contractVersion',x->'sourcePlanId',x->'sourceVersion',x->'rowKey',x->'reason',x#>'{row,schoolMinutes}',x#>'{row,annualAplMinutes}',case when x->'resolution'='null'::jsonb then 'null'::jsonb else jsonb_build_array(x#>'{resolution,actorId}',x#>'{resolution,assignmentId}',x#>'{resolution,at}',x#>'{resolution,note}') end)),'[]') from jsonb_array_elements(gym->'timeCopyReview') x)) else '[]'::jsonb end;
end $$;

create or replace function public.phase5_apl_allocation_issues(gym jsonb, apl jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare
 rows_by_key jsonb; points_by_key jsonb; period jsonb; allocation jsonb; cell jsonb;
 row_key text; term_index integer; total_hours integer;annual boolean:=gym->>'timeModel'='school_terms_annual_apl_v2'; cell_key text;
 cell_totals jsonb:='{}'::jsonb; cell_order jsonb:='[]'::jsonb; issues jsonb:='[]'::jsonb;
begin
 select coalesce(jsonb_object_agg(r->>'key',r),'{}'::jsonb) into rows_by_key
 from jsonb_array_elements(gym#>'{source,rows}') r;
 select coalesce(jsonb_object_agg(d->>'rowKey',d->'points'),'{}'::jsonb) into points_by_key
 from jsonb_array_elements(gym#>'{source,distribution}') d;
 for period in select value from jsonb_array_elements(apl->'periods') loop
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   row_key:=allocation->>'rowKey';term_index:=(allocation->>'termIndex')::integer;
   if not rows_by_key ? row_key then
    issues:=issues||jsonb_build_array(jsonb_build_object('code','unknown_content',
     'message','Tiden avser innehåll som saknas i den här frysta programkällan. Fördelningen behöver rättas.'));
    continue;
   end if;
   if (points_by_key->row_key->>term_index)::integer=0 then
    issues:=issues||jsonb_build_array(jsonb_build_object('code','inactive_term',
     'message','APL-tid får bara fördelas på en termin där innehållet ingår.'));
    continue;
   end if;
   total_hours:=case when annual then (gym->'timeRows'->row_key->'annualAplMinutes'->>(term_index/2))::integer else (gym->'hours'->row_key->>term_index)::integer*60 end;
   if total_hours is null then
    issues:=issues||jsonb_build_array(jsonb_build_object('code','allocation_without_total',
     'message',case when annual then 'Ange först års-APL för innehållet och årskursen.' else 'Fördela först totaltimmarna i timplanen. APL ingår i dessa timmar.' end));
   end if;
   -- JSON array serialization is an injective private map key, not the content-hash protocol.
   cell_key:=jsonb_build_array(row_key,case when annual then term_index/2 else term_index end)::text;
   if not cell_totals ? cell_key then
    cell_order:=cell_order||jsonb_build_array(jsonb_build_object('key',cell_key,'rowKey',row_key,'termIndex',term_index));
   end if;
   cell_totals:=jsonb_set(cell_totals,array[cell_key],to_jsonb(coalesce((cell_totals->>cell_key)::bigint,0)+(allocation->>'gutMinutes')::bigint),true);
  end loop;
 end loop;
 -- Preserve Map insertion order: allocation-level problems precede aggregate cell problems.
 for cell in select value from jsonb_array_elements(cell_order) loop
  total_hours:=case when annual then (gym->'timeRows'->(cell->>'rowKey')->'annualAplMinutes'->>((cell->>'termIndex')::integer/2))::integer else (gym->'hours'->(cell->>'rowKey')->>((cell->>'termIndex')::integer))::integer*60 end;
  if total_hours is not null and (cell_totals->>(cell->>'key'))::bigint>total_hours::bigint then
   issues:=issues||jsonb_build_array(jsonb_build_object('code','allocation_exceeds_total',
    'message',case when annual then 'Periodernas APL-tid överstiger angiven års-APL.' else 'APL-andelen överstiger sparad total tid. Justera APL-fördelningen eller totaltimmarna innan du sparar.' end));
  end if;
 end loop;
 return issues;
end $$;

create or replace function public.phase5_apl_confirmation_blockers(gym jsonb, apl jsonb, reviews jsonb, program jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare
 blockers jsonb:='[]'::jsonb; rows_by_key jsonb; period jsonb; content jsonb; allocation jsonb; issue jsonb;
 started date; first_date date; last_date date; start_year integer; period_year integer; year integer; idx integer;
 term_starts date[]:='{}'::date[]; term_ends date[]:='{}'::date[]; term_indices integer[];
 supported boolean; complete_dates boolean; periods_overlap boolean:=false; capacity_conflict boolean:=false;
 weeks integer; reviewed_weeks integer:=0; reviewed_known boolean:=true; expected_minutes bigint; allocated_minutes bigint;
 first_week integer; last_week integer; candidate integer; occupied_end integer; n integer; overlap_count integer;
 -- PG17 is the configured target. Merged integer ranges implement the same earliest-free-week
 -- set as TS, without a date-span loop or quadratic scan over up to 16,000 assigned weeks.
 used_weeks int4multirange:='{}'::int4multirange; interval_row record;
begin
 if apl is null or apl='null'::jsonb then
  return jsonb_build_array('Planen saknar strukturerat APL-underlag. Befintliga timmar har ännu ingen granskad APL-fördelning.');
 end if;
 started:=(gym#>>'{source,basisReference,startedOn}')::date;
 supported:=coalesce(apl->>'educationForm'='school_based' and (program->>'sourceSupported')::boolean
  and program->>'category'='VOCATIONAL_PROGRAM'
  and program->>'code'=any(array['BA25','BF25','EE25','FR25','FS25','FT25','HT25','IN25','NB25','RL25','VF25','VO25'])
  and started is not null and started>=date '2025-07-01' and started<date '2028-07-02'
  and program->>'startDate' is not null and started>=(program->>'startDate')::date
  and (program->>'endDate' is null or started<=(program->>'endDate')::date)
  and (program->>'canceledDate' is null or started<(program->>'canceledDate')::date),false);
 if apl->>'educationForm'='unknown' then
  blockers:=blockers||jsonb_build_array('Välj utbildningsform innan omfattningen granskas.');
 elsif apl->>'educationForm'='apprenticeship' then
  blockers:=blockers||jsonb_build_array('Lärlingsutbildning kräver en annan beräkningsgrund som inte stöds i denna etapp.');
 elsif not supported then
  blockers:=blockers||jsonb_build_array('APL-reglerna är inte verifierade för den här frysta programkällan och elevkullen.');
 end if;
 if apl->>'classification'<>'complete' then
  blockers:=blockers||jsonb_build_array('Granska hur den befintliga totaltiden fördelas mellan APL och skolförlagd undervisning.');
 end if;
 if exists(select 1 from jsonb_array_elements(reviews) r where r->'resolution'='null'::jsonb) then
  blockers:=blockers||jsonb_build_array('Kopieringen innehåller tid eller innehåll som inte kunde överföras till den nya källan. Granska varje bevarad punkt och dokumentera hur den har hanterats.');
 end if;
 if jsonb_array_length(apl->'periods')=0 then blockers:=blockers||jsonb_build_array('Lägg till planerade APL-perioder.');end if;
 if exists(
  select 1 from jsonb_array_elements(gym#>'{source,rows}') r
  join jsonb_array_elements(gym#>'{source,distribution}') d on d->>'rowKey'=r->>'key'
  cross join generate_series(0,5) i
  where (d->'points'->>i)::integer<>0 and (case when gym->>'timeModel'='school_terms_annual_apl_v2' then gym->'timeRows'->(r->>'key')->'schoolMinutes'->>i else gym->'hours'->(r->>'key')->>i end) is null
 ) then blockers:=blockers||jsonb_build_array('Timplanen saknar totaltimmar i ett eller flera aktiva terminsfält.');end if;
 for issue in select value from jsonb_array_elements(public.phase5_apl_allocation_issues(gym,apl)) loop
  blockers:=blockers||jsonb_build_array(issue->>'message');
 end loop;
 if started is not null then
  start_year:=extract(year from started)::integer-case when extract(month from started)<7 then 1 else 0 end;
  if start_year between 2000 and 2100 then
   for idx in 0..5 loop
    year:=start_year+idx/2;
    term_starts:=array_append(term_starts,case when idx%2=0 then make_date(year,7,1) else make_date(year+1,1,1) end);
    term_ends:=array_append(term_ends,make_date(year+1,case when idx%2=0 then 1 else 7 end,1));
   end loop;
  end if;
 end if;
 -- spring_start_review is deliberately absent: it is a nonblocking review in projectAplPlan.
 -- Every overlapping pair contributes the same message before per-period issues.
 -- Pair counting preserves the blocker sequence without sorting projection-only identifiers.
 select count(*)::integer into overlap_count
 from jsonb_array_elements(apl->'periods') with ordinality a(value,position)
 cross join jsonb_array_elements(apl->'periods') with ordinality b(value,position)
 where a.position<b.position and a.value->>'startsOn' is not null and a.value->>'endsOn' is not null
  and b.value->>'startsOn' is not null and b.value->>'endsOn' is not null
  and a.value->>'startsOn'<=b.value->>'endsOn' and b.value->>'startsOn'<=a.value->>'endsOn';
 periods_overlap:=overlap_count>0;
 for n in 1..overlap_count loop
  blockers:=blockers||jsonb_build_array('Perioderna överlappar för samma planeringsgrupp. Omfattningen får inte räknas dubbelt.');
 end loop;
 select coalesce(jsonb_object_agg(r->>'key',r),'{}'::jsonb) into rows_by_key
 from jsonb_array_elements(gym#>'{source,rows}') r;
 for period in select value from jsonb_array_elements(apl->'periods') loop
  first_date:=(period->>'startsOn')::date;last_date:=(period->>'endsOn')::date;
  complete_dates:=first_date is not null and last_date is not null;
  weeks:=(period#>>'{extent,weeks}')::integer;
  if period->>'name'='' or not complete_dates or period->>'schoolYear' is null or jsonb_array_length(period->'contents')=0 then
   blockers:=blockers||jsonb_build_array('Fyll i periodens namn, datum, läsår och innehåll.');
  end if;
  if period#>>'{extent,basis}'<>'whole_weeks' or weeks is null or not (period#>>'{extent,reviewed}')::boolean then
   blockers:=blockers||jsonb_build_array('Omfattningen behöver granskas. Delveckor och osäkert underlag räknas inte automatiskt om till GUT.');
  end if;
  if complete_dates then
   first_week:=(first_date-(extract(isodow from first_date)::integer-1)-date '1969-12-29')/7;
   last_week:=(last_date-(extract(isodow from last_date)::integer-1)-date '1969-12-29')/7;
   if weeks is not null and weeks>last_week-first_week+1 then
    blockers:=blockers||jsonb_build_array('Uppgivna hela veckor överstiger antalet berörda kalenderveckor. Kontrollera datum och omfattning.');
   end if;
  end if;
  if first_date is not null and period->>'schoolYear' is not null then
   period_year:=extract(year from first_date)::integer-case when extract(month from first_date)<7 then 1 else 0 end;
   if period_year<>(period->>'schoolYear')::integer then
    blockers:=blockers||jsonb_build_array('Periodens första datum stämmer inte med valt läsår.');
   end if;
  end if;
  if started is not null and first_date is not null and first_date<started then
   blockers:=blockers||jsonb_build_array('Perioden börjar före utbildningens frysta startdatum.');
  end if;
  term_indices:='{}'::integer[];
  if complete_dates then
   if cardinality(term_starts)=6 then
    for idx in 0..5 loop
     if first_date<term_ends[idx+1] and last_date>=term_starts[idx+1] then term_indices:=array_append(term_indices,idx);end if;
    end loop;
   end if;
   if cardinality(term_starts)<>6 or first_date<term_starts[1] or last_date>=term_ends[6] then
    blockers:=blockers||jsonb_build_array('Perioden ligger helt eller delvis utanför timplanens sex terminsintervall.');
   end if;
  end if;
  for content in select value from jsonb_array_elements(period->'contents') loop
   if not rows_by_key ? (content->>'rowKey') then
    blockers:=blockers||jsonb_build_array('Innehållskopplingen saknas i den här frysta programkällan och behöver granskas.');
   elsif starts_with(content->>'rowKey','block:') or starts_with(content->>'rowKey','alternative:') or starts_with(content->>'rowKey','meta:') then
    blockers:=blockers||jsonb_build_array('Kopplingen är ett valbart block eller annat ospecificerat innehåll, inte en verifierad ämnesnivå.');
   end if;
   if content->>'description'='' then
    blockers:=blockers||jsonb_build_array('Beskriv vilken del av ämnesnivån som planeras på arbetsplatsen.');
   end if;
  end loop;
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   if complete_dates and not (allocation->>'termIndex')::integer=any(term_indices) then
    blockers:=blockers||jsonb_build_array('Tidsfördelningen avser en termin utanför periodens datum. Fördela tiden uttryckligt mellan berörda terminer.');
   end if;
  end loop;
  expected_minutes:=null;
  if supported and (period#>>'{extent,reviewed}')::boolean and period#>>'{extent,basis}'='whole_weeks' and weeks is not null then
   expected_minutes:=weeks::bigint*23*60;
  end if;
  select coalesce(sum((a->>'gutMinutes')::bigint),0) into allocated_minutes from jsonb_array_elements(period->'allocations') a;
  if expected_minutes is not null and expected_minutes<>allocated_minutes then
   blockers:=blockers||jsonb_build_array('Fördela periodens hela GUT-omfattning exakt en gång mellan innehåll och terminer.');
  end if;
  if not supported or period#>>'{extent,basis}'<>'whole_weeks' or weeks is null then reviewed_known:=false;
  elsif (period#>>'{extent,reviewed}')::boolean then reviewed_weeks:=reviewed_weeks+weeks;end if;
 end loop;
 -- Earliest deadline, then earliest start, allocating only declared week units.
 -- Adjacent int4 ranges merge; jumping to upper(occupied range) is exactly TS's while-used loop.
 for interval_row in
  select (p.first_date-(extract(isodow from p.first_date)::integer-1)-date '1969-12-29')/7 as first,
   (p.last_date-(extract(isodow from p.last_date)::integer-1)-date '1969-12-29')/7 as last,p.count
  from (
   select (value->>'startsOn')::date first_date,(value->>'endsOn')::date last_date,(value#>>'{extent,weeks}')::integer count
   from jsonb_array_elements(apl->'periods')
   where value->>'startsOn' is not null and value->>'endsOn' is not null
    and value#>>'{extent,basis}'='whole_weeks' and value#>>'{extent,weeks}' is not null
  ) p order by last,first
 loop
  candidate:=interval_row.first;
  for n in 1..interval_row.count loop
   select upper(occupied) into occupied_end from unnest(used_weeks) occupied where candidate<@occupied;
   if found then candidate:=occupied_end;end if;
   if candidate>interval_row.last then capacity_conflict:=true;exit;end if;
   used_weeks:=used_weeks+int4multirange(int4range(candidate,candidate+1,'[)'));
   candidate:=candidate+1;
  end loop;
  if capacity_conflict then exit;end if;
 end loop;
 if capacity_conflict then
  blockers:=blockers||jsonb_build_array('Periodernas uppgivna hela APL-veckor ryms inte i olika berörda kalenderveckor. Kontrollera förläggning och omfattning.');
 end if;
 if supported and not periods_overlap and not capacity_conflict and reviewed_known and reviewed_weeks<15 then
  blockers:=blockers||jsonb_build_array('Minst 15 hela granskade APL-veckor behöver planeras för den här utbildningsformen.');
 end if;
 if gym->>'timeModel'='school_terms_annual_apl_v2' then
  if exists(select 1 from jsonb_array_elements(coalesce(gym->'timeCopyReview','[]')) x where x->'resolution'='null'::jsonb) then blockers:=blockers||jsonb_build_array('Kopieringen har tidsrader som behöver granskas. Skapa en plan med verifierbar källa innan beslut.');end if;
  if exists(select 1 from jsonb_each(gym->'timeRows') r cross join generate_series(0,2) yr
   join jsonb_array_elements(gym#>'{source,distribution}') d on d->>'rowKey'=r.key
   where ((d->'points'->>(yr*2))::integer>0 or (d->'points'->>(yr*2+1))::integer>0)
   and ((r.value->'annualAplMinutes'->>yr) is null or (r.value->'annualAplMinutes'->>yr)::bigint is distinct from
    (select coalesce(sum((a->>'gutMinutes')::bigint),0) from jsonb_array_elements(apl->'periods') p cross join lateral jsonb_array_elements(p->'allocations') a where a->>'rowKey'=r.key and (a->>'termIndex')::integer/2=yr))) then
   blockers:=blockers||jsonb_build_array('Fördela all angiven års-APL på perioder innan förläggningen bekräftas.');end if;
 end if;
 return blockers;
end $$;

create or replace function public.phase5_apl_plan_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;target_plan uuid;request_id uuid;p public.timplans;a public.access_assignments;s public.app_sessions;r public.apl_plan_commands;
 gym jsonb;previous jsonb;next_plan jsonb;reviews jsonb;program jsonb;content_hash text;next_hash text;changed boolean;receipt jsonb;detail jsonb;envelope jsonb;
 period jsonb;content jsonb;allocation jsonb;resolution jsonb;confirmation_id uuid;now_at timestamptz;actor_name text;blockers jsonb;action_name text;
begin
 q:=public.phase5_apl_plan_request(input);target_plan:=(q->>'planId')::uuid;request_id:=(q->>'commandId')::uuid;
 p:=public.phase5_apl_plan_scope(target_plan,false);a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function not in ('rektor','administrator') or (q->>'action'='confirm' and a.function<>'rektor') then
  raise exception 'APL-åtgärden kräver aktuellt skolmandat.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5541));
 select * into r from public.apl_plan_commands where command_id=request_id;
 if found then
  if (r.plan_id,r.organizer_id,r.unit_id,r.actor_identity_id,r.assignment_id,r.action,r.request)
    is distinct from (p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q->>'action',q) then
   raise exception 'APL-kommandot har ändrats.' using errcode='40001',hint='apl_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 p:=public.phase5_apl_plan_scope(target_plan,true);
 if p.revision<>(q->>'expectedRevision')::integer then raise exception 'APL-underlaget har ändrats. Läs in det igen.' using errcode='40001',hint='apl_revision_conflict';end if;
 gym:=public.phase5_gym_timplan_result(p.id);previous:=public.phase5_apl_plan_value(p.id);reviews:=public.phase5_apl_copy_review(p.id);program:=public.phase5_apl_program(gym);
 if program->>'category' is distinct from 'VOCATIONAL_PROGRAM' then raise exception 'APL används inte på högskoleförberedande program.' using errcode='22023',hint='apl_not_vocational';end if;
 content_hash:=public.phase5_apl_hash_value(gym,p.organizer_id,previous,reviews,program);
 insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),p.id);
 now_at:=date_trunc('milliseconds',clock_timestamp());
 if q->>'action'='save' then
  next_plan:=q->'plan';perform public.phase5_apl_validate_allocations(gym,next_plan);
  for resolution in select value from jsonb_array_elements(q->'copyReviewResolutions') loop
   if not exists(select 1 from public.apl_plan_copy_reviews c where c.id=(resolution->>'id')::uuid and c.plan_id=p.id and c.resolved_at is null) then
    raise exception 'Granskningspunkten finns inte eller är redan hanterad. Läs in APL-underlaget igen.' using errcode='22023',hint='invalid_copy_review_resolution';end if;
  end loop;
  next_hash:=public.phase5_apl_hash_value(gym,p.organizer_id,next_plan,reviews,program);
  changed:=next_hash<>content_hash or jsonb_array_length(q->'copyReviewResolutions')>0;
  if changed then
   insert into public.apl_plan_underlag(plan_id,organizer_id,unit_id,offering_id,education_form,classification,created_at,updated_at)
   values(p.id,p.organizer_id,p.unit_id,p.offering_id,next_plan->>'educationForm',next_plan->>'classification',now_at,now_at)
   on conflict(plan_id) do update set education_form=excluded.education_form,classification=excluded.classification,updated_at=excluded.updated_at;
   delete from public.apl_plan_periods where plan_id=p.id;
   for period in select value from jsonb_array_elements(next_plan->'periods') loop
    insert into public.apl_plan_periods(id,plan_id,name,starts_on,ends_on,school_year,extent_basis,whole_weeks,reviewed,review_note,planned_term_index)
    values((period->>'id')::uuid,p.id,period->>'name',(period->>'startsOn')::date,(period->>'endsOn')::date,(period->>'schoolYear')::integer,
     period#>>'{extent,basis}',(period#>>'{extent,weeks}')::integer,(period#>>'{extent,reviewed}')::boolean,period#>>'{extent,reviewNote}',(period->>'plannedTermIndex')::integer);
    for content in select value from jsonb_array_elements(period->'contents') loop
     insert into public.apl_period_contents(plan_id,period_id,row_key,description) values(p.id,(period->>'id')::uuid,content->>'rowKey',content->>'description');
    end loop;
    for allocation in select value from jsonb_array_elements(period->'allocations') loop
     insert into public.apl_time_allocations(plan_id,period_id,row_key,term_index,gut_minutes)
     values(p.id,(period->>'id')::uuid,allocation->>'rowKey',(allocation->>'termIndex')::integer,(allocation->>'gutMinutes')::integer);
    end loop;
   end loop;
   for resolution in select value from jsonb_array_elements(q->'copyReviewResolutions') loop
    update public.apl_plan_copy_reviews set resolved_actor_id=s.identity_id,resolved_assignment_id=a.id,resolved_at=now_at,resolution_note=resolution->>'note'
    where id=(resolution->>'id')::uuid and plan_id=p.id and resolved_at is null;
   end loop;
   update public.timplans set revision=revision+1 where id=p.id returning * into p;
  end if;
  action_name:=case when changed then 'apl_plan_saved' else 'apl_plan_unchanged' end;
 else
  if content_hash<>q->>'expectedContentHash' then raise exception 'APL-innehållet har ändrats. Granska det igen.' using errcode='40001',hint='apl_content_conflict';end if;
  blockers:=public.phase5_apl_confirmation_blockers(gym,previous,reviews,program);
  if jsonb_array_length(blockers)>0 then raise exception 'APL-underlaget behöver kompletteras innan förläggningen kan bekräftas.' using errcode='40001',hint='apl_confirmation_blocked',detail=blockers::text;end if;
  if (select count(*) from public.apl_rector_confirmations e where e.plan_id=p.id)>=1000 then
   raise exception 'Skapa en ny timplansversion för fortsatt granskning.' using errcode='40001',hint='apl_confirmation_limit';end if;
  select i.display_name into actor_name from public.identities i where i.id=s.identity_id;
  if not public.phase5_apl_text(to_jsonb(actor_name),200,false) then actor_name:='Rektor';end if;
  changed:=true;confirmation_id:=gen_random_uuid();
  update public.timplans set revision=revision+1 where id=p.id returning * into p;
  insert into public.apl_rector_confirmations(id,plan_id,unit_id,actor_id,assignment_id,actor_name,occurred_at,revision,content_hash,comment)
  values(confirmation_id,p.id,p.unit_id,s.identity_id,a.id,actor_name,now_at,p.revision,content_hash,q->>'comment');
  action_name:='apl_placement_confirmed';
 end if;
 detail:=public.phase5_apl_plan_projection(p.id);
 receipt:=jsonb_build_object('contractVersion','structured_v1','commandId',request_id,'planId',p.id,'action',q->>'action','revision',p.revision,
  'changed',changed,'replayed',false,'contentHash',detail->'contentHash','confirmationId',confirmation_id);
 envelope:=jsonb_build_object('contractVersion','apl_sql_v1','basis',public.phase5_apl_plan_basis(p.id),'result',jsonb_build_object('receipt',receipt,'detail',detail));
 insert into public.apl_plan_commands(command_id,plan_id,organizer_id,unit_id,actor_identity_id,assignment_id,action,request,envelope)
 values(request_id,p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q->>'action',q,envelope);
 perform public.phase5_apl_plan_audit(p.id,action_name);
 delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=p.id;
 return envelope;
end $$;

create or replace function public.phase5_apl_plan_projection(target_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;a public.access_assignments;gym jsonb;plan jsonb;reviews jsonb;program jsonb;history jsonb;editable boolean;
begin
 select * into p from public.timplans where id=target_plan;
 a:=public.phase5_programplan_actor();gym:=public.phase5_gym_timplan_result(p.id);
 plan:=public.phase5_apl_plan_value(p.id);reviews:=public.phase5_apl_copy_review(p.id);program:=public.phase5_apl_program(gym);
 if plan is not null then
  plan:=public.phase5_apl_plan_parse(plan);perform public.phase5_apl_validate_allocations(gym,plan);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'planId',e.plan_id,'unitId',e.unit_id,'actorId',e.actor_id,'assignmentId',e.assignment_id,
  'actorName',e.actor_name,'at',to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'revision',e.revision,'contentHash',e.content_hash,'comment',e.comment) order by e.revision),'[]') into history
 from public.apl_rector_confirmations e where e.plan_id=p.id;
 editable:=program->>'category'='VOCATIONAL_PROGRAM' and p.status in ('utkast','atersand') and gym->'archived'='false'::jsonb;
 return jsonb_build_object('contractVersion','structured_v1','planId',p.id,'revision',p.revision,'organizerId',p.organizer_id,
  'program',program,'plan',plan,'copyReview',reviews,'contentHash',public.phase5_apl_hash_value(gym,p.organizer_id,plan,reviews,program),
  'confirmations',history,'capabilities',jsonb_build_object('canSave',editable and a.function in ('rektor','administrator'),'canConfirm',editable and a.function='rektor'));
end $$;

create or replace function public.phase5_plan_decision_detail(target_kind text,target_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;o public.offerings;p public.point_plans;t public.timplans;
 review public.plan_decision_reviews;source jsonb;current_source jsonb;catalog jsonb;hours jsonb:='[]';
 stage text;revision integer;version integer;school_name text;unit_id uuid;actions jsonb:='[]';
 blockers jsonb:='[]';checks jsonb;history jsonb;links jsonb;basis_hash text;next_actor text;
 can_write boolean:=false;total_hours bigint;missing boolean;source_info text;profile jsonb;series jsonb;apl jsonb;time_rows jsonb;total_minutes bigint;v2 boolean:=false;
begin
 if target_kind is null or target_kind not in ('programplan','timplan') or target_id is null then
 raise exception 'Invalid plan decision read' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();
 if target_kind='programplan' then
  o:=public.phase5_programplan_scope(target_id);
  select * into p from public.point_plans where id=target_id for update;
  o:=public.phase5_programplan_scope(target_id);a:=public.phase5_programplan_actor();
  source:=public.phase5_gym_timplan_source(p.id);current_source:=source;
  stage:=case p.status when 'faststalld' then 'approved' when 'ersatt' then 'replaced' else 'draft' end;
  revision:=p.revision;version:=p.version;
  select * into review from public.plan_decision_reviews where kind=target_kind and plan_id=target_id for update;
  if p.status='utkast' and review.stage in ('submitted','returned') then stage:=review.stage;end if;
  can_write:=a.function in ('huvudman','rektor') and o.archived_at is null
   and public.phase5_programplan_phase(o)='framtida'
   and not exists(select 1 from public.offering_units ou where ou.offering_id=o.id
    and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id));
  if can_write then
   if stage in ('draft','returned') and a.function='rektor' then actions:='["submit"]';end if;
   if stage='submitted' and a.function='rektor' then actions:='["withdraw"]';end if;
   if stage='draft' and a.function='huvudman' then actions:='["approve"]';end if;
   if stage='submitted' and a.function='huvudman' then actions:='["return","approve"]';end if;
  end if;
  if public.phase5_programplan_phase(o)<>'framtida' then blockers:=blockers||jsonb_build_array('Programplanen är låst eftersom elevkullen har startat eller startläget är okänt.');end if;
  checks:=jsonb_build_array(jsonb_build_object('id','structure','label','Jag har granskat att programstruktur, nivåer och terminsordning gäller elevkullen.'),
   jsonb_build_object('id','choices','label','Jag har granskat att alternativa ämnen och valbara ramar ger varje elev en fullständig studiegång.'));
 else
  select * into t from public.timplans where id=target_id;
  if t.id is null or t.gym_basis is null then raise exception 'Plan decision denied' using errcode='42501';end if;
  o:=public.phase5_gym_timplan_scope(t.offering_id,t.unit_id,false);
  -- Keep established program-before-timplan order, including concurrent source decisions.
  perform 1 from public.point_plans where id=t.source_programplan_id for update;
  perform 1 from public.timplan_series where id=t.series_id for update;
  series:=public.phase5_named_timplan_series_json(t.series_id);
  select * into t from public.timplans where id=target_id for update;
  o:=public.phase5_gym_timplan_scope(t.offering_id,t.unit_id,false);a:=public.phase5_programplan_actor();
  source:=t.gym_basis;current_source:=public.phase5_gym_timplan_source(t.source_programplan_id);
  revision:=t.revision;version:=t.version;unit_id:=t.unit_id;
  select name into school_name from public.school_units where id=t.unit_id;
  stage:=case t.status when 'forslag' then 'submitted' when 'atersand' then 'returned' when 'faststalld' then 'approved' when 'ersatt' then 'replaced' else 'draft' end;
  select * into review from public.plan_decision_reviews where kind=target_kind and plan_id=target_id for update;
  if o.archived_at is null then
   if stage in ('draft','returned') and a.function in ('rektor','administrator') then actions:='["submit"]';end if;
   if stage='submitted' and a.function in ('rektor','administrator') then actions:='["withdraw"]';end if;
   if stage='submitted' and a.function='huvudman' then actions:='["return","approve"]';end if;
  end if;
  v2:=exists(select 1 from public.timplan_time_models where plan_id=t.id);
  if v2 then
   time_rows:=public.phase5_timplan_time_rows(t.id);
   select coalesce(sum((v#>>'{}')::bigint),0) into total_minutes from jsonb_each(time_rows) r cross join lateral jsonb_array_elements((r.value->'schoolMinutes')||(r.value->'annualAplMinutes')) v;
   missing:=exists(select 1 from jsonb_array_elements(source->'distribution') d cross join generate_series(0,5) i where (d->'points'->>i)::integer>0 and time_rows->(d->>'rowKey')->'schoolMinutes'->>i is null)
    or exists(select 1 from jsonb_array_elements(source->'distribution') d cross join generate_series(0,2) i where ((d->'points'->>(i*2))::integer>0 or (d->'points'->>(i*2+1))::integer>0) and time_rows->(d->>'rowKey')->'annualAplMinutes'->>i is null)
    or exists(select 1 from jsonb_each(time_rows) r where (select coalesce(sum((v#>>'{}')::bigint),0) from jsonb_array_elements((r.value->'schoolMinutes')||(r.value->'annualAplMinutes')) v)=0);
   if (select count(*) from jsonb_object_keys(time_rows))<>jsonb_array_length(source->'rows') or missing then blockers:=blockers||jsonb_build_array('Fördela undervisningstiden i alla aktiva terminsfält innan timplanen skickas för godkännande.');end if;
   profile:=public.phase5_plan_decision_profile(source);
   if profile is not null and total_minutes<(profile->>'hours')::bigint*60 then blockers:=blockers||jsonb_build_array('Timplanen innehåller färre än '||replace(to_char((profile->>'hours')::integer,'FM9 999'),chr(160),' ')||' planerade undervisningstimmar.');end if;
  else
  select coalesce(jsonb_agg(jsonb_build_object('rowKey',c.row_id,'hours',
   (select jsonb_agg(case when c.allocated[n] then to_jsonb(c.hours[n]) else 'null'::jsonb end order by n) from generate_series(1,6) n)) order by c.row_id),'[]')
   into hours from public.timplan_cells c where c.timplan_id=t.id;
  select coalesce(sum(c.hours[n]),0),coalesce(bool_or((d->'points'->>(n-1))::integer>0 and not c.allocated[n]),false)
   into total_hours,missing from public.timplan_cells c
   cross join lateral jsonb_array_elements(t.gym_basis->'distribution') d cross join generate_series(1,6) n
   where c.timplan_id=t.id and d->>'rowKey'=c.row_id;
  if jsonb_array_length(hours)<>jsonb_array_length(source->'rows') or missing
   or exists(select 1 from public.timplan_cells c where c.timplan_id=t.id and (select coalesce(sum(v),0) from unnest(c.hours) v)=0) then
   blockers:=blockers||jsonb_build_array('Fördela undervisningstiden i alla aktiva terminsfält innan timplanen skickas för godkännande.');end if;
  profile:=public.phase5_plan_decision_profile(source);
  if profile is not null and total_hours<(profile->>'hours')::integer then
   blockers:=blockers||jsonb_build_array('Timplanen innehåller färre än '||replace(to_char((profile->>'hours')::integer,'FM9 999'),chr(160),' ')||' planerade undervisningstimmar.');end if;
  end if;
  if current_source->>'status' is distinct from 'faststalld' then blockers:=blockers||jsonb_build_array('Huvudmannen behöver först fastställa timplanens programplansversion.');end if;
  if public.phase5_plan_decision_source_content(source) is distinct from public.phase5_plan_decision_source_content(current_source) then
   blockers:=blockers||jsonb_build_array('Programplanens innehåll har ändrats. Skapa en ny timplansversion från det aktuella underlaget.');end if;
  checks:=jsonb_build_array(jsonb_build_object('id','teacher-led','label','Jag har granskat att timmarna avser undervisning och att annan aktivitet inte räknas som undervisningstid.'),
   jsonb_build_object('id','choice-paths','label','Jag har granskat att alla möjliga ämnesval och alternativa studiegångar får minst den garanterade undervisningstiden.'));
  source_info:='Programplan version '||(source->>'version')||' · fryst revision '||(source->>'revision');
 end if;
 profile:=public.phase5_plan_decision_profile(source);
 if profile->'vocational'='true'::jsonb then
  checks:=checks||jsonb_build_array(
   jsonb_build_object('id','eligibility','label','Jag har kontrollerat att engelska nivå 1–2 och svenska eller svenska som andraspråk nivå 1–3 ingår i den gemensamma planen. Individuella bortval hanteras separat.'),
   jsonb_build_object('id','apl','label',case when target_kind='programplan' then 'Jag har kontrollerat minst 15 veckors APL, eller mer än halva utbildningen vid lärlingsutbildning. Varje APL-vecka räknas som 23 timmar och ingår bara en gång i timplanens total.' else 'Jag har granskat APL-periodernas omfattning, innehåll och inkluderade undervisningstid samt rektors aktuella bekräftelse av förläggningen.' end));
 end if;
 if o.archived_at is not null then blockers:=blockers||jsonb_build_array('Utbildningen är arkiverad.');end if;
 blockers:=blockers||public.phase5_plan_decision_source_blockers(source);
 if target_kind='timplan' then
  apl:=public.phase5_apl_decision_underlag(target_id);
  -- Historical approved/replaced plans remain readable without a retroactive task.
  if apl is not null and stage in ('draft','returned','submitted') then blockers:=blockers||(apl->'blockers');end if;
 end if;
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select coalesce(jsonb_agg(jsonb_build_object('unitId',ou.unit_id,'organizerId',ou.organizer_id) order by ou.unit_id),'[]') into links
  from public.offering_units ou where ou.offering_id=o.id;
 select coalesce(jsonb_agg(jsonb_build_object('action',h.action,'at',h.occurred_at,'actorName',h.actor_name,'comment',h.comment,'nameAtDecision',h.name_at_decision) order by h.occurred_at desc,h.id desc),'[]')
  into history from (select * from public.plan_decision_history h where h.kind=target_kind and h.plan_id=target_id and h.organizer_id=o.organizer_id order by occurred_at desc,id desc limit 1000) h;
 basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('rules','gy25-national-programs-2026-10-12-v2',
  'kind',target_kind,'planId',target_id,'revision',revision,'source',source,'currentSource',current_source,
  'hours',hours,'stage',stage,'decisionRevision',coalesce(review.revision,0),'links',links,
  'educationRevision',o.lifecycle_revision,'archived',o.archived_at,'phase',public.phase5_programplan_phase(o))::text,'UTF8')),'hex');
 if target_kind='timplan' then
  basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('basisHash',basis_hash,'series',series)::text,'UTF8')),'hex');
 end if;
 if v2 then basis_hash:='sha256:'||encode(sha256(convert_to(public.phase5_apl_canonical(jsonb_build_array('time_decision_v2',basis_hash,time_rows::text)),'UTF8')),'hex');end if;
 if apl is not null then
  basis_hash:='sha256:'||encode(sha256(convert_to(public.phase5_apl_canonical(jsonb_build_array(
   'apl_decision_v1',basis_hash,apl#>>'{detail,contentHash}',apl->'currentConfirmationId')),'UTF8')),'hex');
 end if;
 next_actor:=case when stage='submitted' or (a.function='huvudman' and actions ? 'approve' and jsonb_array_length(blockers)=0) then 'huvudman' when stage in ('draft','returned') then 'rektor' else null end;
 return jsonb_build_object('contractVersion','apl_decision_v1','apl',apl,'series',series,'kind',target_kind,'planId',target_id,'offeringId',o.id,'unitId',unit_id,
  'educationName',o.name,'schoolName',school_name,'version',version,'stage',stage,'nextActor',next_actor,
  'revision',revision,'decisionRevision',coalesce(review.revision,0),'basisHash',basis_hash,'actions',actions,
  'blockers',blockers,'checks',checks,'history',history,'sourceInfo',source_info,'source',source,'catalog',catalog) || case when v2 then jsonb_build_object('timeModel','school_terms_annual_apl_v2','timeRows',time_rows) else jsonb_build_object('hours',hours) end;
end $$;

create or replace function public.phase5_apl_copy_structure(source_plan uuid,target_plan uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
 source_row public.timplans;target_row public.timplans;a public.access_assignments;
 source_apl jsonb;source_gym jsonb;target_gym jsonb;source_program jsonb;target_program jsonb;trusted_source boolean;
 source_reviews jsonb;new_reviews jsonb:='[]'::jsonb;review jsonb;review_count integer;
 next_apl jsonb;next_periods jsonb:='[]'::jsonb;period jsonb;content jsonb;allocation jsonb;next_period jsonb;
 active_contents jsonb;active_allocations jsonb;loss_contents jsonb;loss_allocations jsonb;loss_reason text;reason text;
 target_keys jsonb;target_points jsonb;cell_totals jsonb;row_key text;term_index integer;cell_key text;cell_total integer;
 new_period_id uuid;now_at timestamptz;
begin
 if source_plan is null then return;end if;
 if target_plan is null or source_plan=target_plan then raise exception 'Ogiltig APL-kopiering.' using errcode='22023';end if;
 -- Both creators already hold the school/offering, program and source-series/plan locks.
 -- Recheck the actual scope, then reuse those row locks; never demand an editable source.
 select * into target_row from public.timplans where id=target_plan;
 select * into source_row from public.timplans where id=source_plan;
 if target_row.id is null or source_row.id is null or target_row.gym_basis is null or source_row.gym_basis is null
  or (target_row.organizer_id,target_row.unit_id,target_row.offering_id)
    is distinct from (source_row.organizer_id,source_row.unit_id,source_row.offering_id) then
  raise exception 'APL-kopieringen saknar samma skola och utbildning.' using errcode='42501';end if;
 perform public.phase5_gym_timplan_scope(target_row.offering_id,target_row.unit_id,true);
 select * into source_row from public.timplans where id=source_plan for update;
 select * into target_row from public.timplans where id=target_plan for update;
 a:=public.phase5_programplan_actor();
 if a.function not in ('rektor','administrator') or a.organizer_id<>target_row.organizer_id
  or target_row.status<>'utkast' or target_row.revision<>0
  or exists(select 1 from public.apl_plan_underlag u where u.plan_id=target_plan)
  or exists(select 1 from public.apl_rector_confirmations c where c.plan_id=target_plan)
  or exists(select 1 from public.apl_plan_commands c where c.plan_id=target_plan)
  or exists(select 1 from public.timplan_events e where e.timplan_id=target_plan)
  or exists(select 1 from public.named_timplan_commands c where c.plan_id=target_plan)
  or exists(select 1 from public.gym_timplan_receipts c where c.timplan_id=target_plan)
  or exists(select 1 from public.apl_plan_write_permits w where w.transaction_id=txid_current() and w.backend_id=pg_backend_pid() and w.plan_id=target_plan) then
  raise exception 'APL får bara initieras på det nya tomma utkastet.' using errcode='42501';end if;
 -- The hook precedes both creation event and receipt. Checking these also works
 -- under a caller savepoint, unlike comparing tuple xmin with the top-level XID.
 source_apl:=public.phase5_apl_plan_value(source_plan);
 if source_apl is null then return;end if;
 source_apl:=public.phase5_apl_plan_parse(source_apl);
 source_gym:=public.phase5_gym_timplan_result(source_plan);target_gym:=public.phase5_gym_timplan_result(target_plan);
 perform public.phase5_apl_validate_allocations(source_gym,source_apl);
 source_program:=public.phase5_apl_program(source_gym);target_program:=public.phase5_apl_program(target_gym);
 trusted_source:=coalesce((source_program->>'sourceSupported')::boolean and (target_program->>'sourceSupported')::boolean,false);
 source_reviews:=public.phase5_apl_copy_review(source_plan);
 if jsonb_array_length(source_reviews)>1000 then
  raise exception 'För många granskningspunkter för säker APL-kopiering.' using errcode='40001',hint='apl_copy_review_limit';end if;
 for review in select value from jsonb_array_elements(source_reviews) where value->'resolution'='null'::jsonb loop
  -- Keep the original source plan/version/period, including inherited losses.
  -- Only the new review identity and unresolved status belong to this copy.
  new_reviews:=new_reviews||jsonb_build_array(review||jsonb_build_object('id',gen_random_uuid(),'resolution',null));
 end loop;
 select coalesce(jsonb_object_agg(r->>'key',r),'{}'::jsonb) into target_keys from jsonb_array_elements(target_gym#>'{source,rows}') r;
 select coalesce(jsonb_object_agg(d->>'rowKey',d->'points'),'{}'::jsonb) into target_points from jsonb_array_elements(target_gym#>'{source,distribution}') d;
 -- Decide all-or-nothing for each cell across every period. A period's input
 -- ordering must not decide which subset of a too-large cell happens to survive.
 select coalesce(jsonb_object_agg(c.cell_key,to_jsonb(c.minutes)),'{}'::jsonb) into cell_totals from (
  select jsonb_build_array(x->>'rowKey',case when source_gym->>'timeModel'='school_terms_annual_apl_v2' then (x->>'termIndex')::integer/2 else (x->>'termIndex')::integer end)::text cell_key,sum((x->>'gutMinutes')::bigint) minutes
  from jsonb_array_elements(source_apl->'periods') p cross join lateral jsonb_array_elements(p->'allocations') x
  group by jsonb_build_array(x->>'rowKey',case when source_gym->>'timeModel'='school_terms_annual_apl_v2' then (x->>'termIndex')::integer/2 else (x->>'termIndex')::integer end)::text
 ) c;
 for period in select value from jsonb_array_elements(source_apl->'periods') loop
  active_contents:='[]'::jsonb;active_allocations:='[]'::jsonb;
  loss_contents:='{"missing_row":[],"inactive_term":[],"insufficient_total":[],"unverified_source":[]}'::jsonb;
  loss_allocations:=loss_contents;
  for content in select value from jsonb_array_elements(period->'contents') loop
   row_key:=content->>'rowKey';loss_reason:=null;
   if not trusted_source then loss_reason:='unverified_source';
   elsif not target_keys ? row_key then loss_reason:='missing_row';end if;
   if loss_reason is null then active_contents:=active_contents||jsonb_build_array(content);
   else loss_contents:=jsonb_set(loss_contents,array[loss_reason],(loss_contents->loss_reason)||jsonb_build_array(content));end if;
  end loop;
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   row_key:=allocation->>'rowKey';term_index:=(allocation->>'termIndex')::integer;
   cell_key:=jsonb_build_array(row_key,case when target_gym->>'timeModel'='school_terms_annual_apl_v2' then term_index/2 else term_index end)::text;
   cell_total:=case when target_gym->>'timeModel'='school_terms_annual_apl_v2' then (target_gym->'timeRows'->row_key->'annualAplMinutes'->>(term_index/2))::integer else (target_gym->'hours'->row_key->>term_index)::integer*60 end;
   loss_reason:=null;
   if not trusted_source then loss_reason:='unverified_source';
   elsif not target_keys ? row_key then loss_reason:='missing_row';
   elsif coalesce((target_points->row_key->>term_index)::integer,0)=0 then loss_reason:='inactive_term';
   elsif cell_total is null or (cell_totals->>cell_key)::bigint>cell_total::bigint then loss_reason:='insufficient_total';end if;
   if loss_reason is null then active_allocations:=active_allocations||jsonb_build_array(allocation);
   else
    loss_allocations:=jsonb_set(loss_allocations,array[loss_reason],(loss_allocations->loss_reason)||jsonb_build_array(allocation));
    if not exists(select 1 from jsonb_array_elements(loss_contents->loss_reason) c where c->>'rowKey'=row_key) then
     select value into content from jsonb_array_elements(period->'contents') where value->>'rowKey'=row_key;
     if content is null then raise exception 'APL-källan saknar innehåll för förlorad tid.' using errcode='22023',hint='allocation_without_content';end if;
     loss_contents:=jsonb_set(loss_contents,array[loss_reason],(loss_contents->loss_reason)||jsonb_build_array(content));
    end if;
   end if;
  end loop;
  new_period_id:=gen_random_uuid();
  next_period:=period||jsonb_build_object('id',new_period_id,'contents',active_contents,'allocations',active_allocations,
   'extent',(period->'extent')||jsonb_build_object('reviewed',false,'reviewNote',''));
  next_periods:=next_periods||jsonb_build_array(next_period);
  foreach reason in array array['missing_row','inactive_term','insufficient_total','unverified_source'] loop
   if jsonb_array_length(loss_contents->reason)>0 or jsonb_array_length(loss_allocations->reason)>0 then
    new_reviews:=new_reviews||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'sourcePlanId',source_plan,
     'sourceVersion',source_row.version,'sourcePeriodId',period->'id','sourcePeriodName',period->'name','reason',reason,
     'contents',loss_contents->reason,'allocations',loss_allocations->reason,'resolution',null));
   end if;
  end loop;
  if jsonb_array_length(new_reviews)>1000 then
   raise exception 'För många granskningspunkter för säker APL-kopiering.' using errcode='40001',hint='apl_copy_review_limit';end if;
 end loop;
 next_apl:=public.phase5_apl_plan_parse(source_apl||jsonb_build_object('classification','unreviewed','periods',next_periods));
 perform public.phase5_apl_validate_allocations(target_gym,next_apl);
 -- Only this private initialization owns this exact permit; no caller-supplied
 -- session flag and no generic table permission are introduced.
 insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),target_plan);
 now_at:=date_trunc('milliseconds',clock_timestamp());
 insert into public.apl_plan_underlag(plan_id,organizer_id,unit_id,offering_id,education_form,classification,created_at,updated_at)
 values(target_plan,target_row.organizer_id,target_row.unit_id,target_row.offering_id,next_apl->>'educationForm','unreviewed',now_at,now_at);
 for period in select value from jsonb_array_elements(next_apl->'periods') loop
  insert into public.apl_plan_periods(id,plan_id,name,starts_on,ends_on,school_year,extent_basis,whole_weeks,reviewed,review_note,planned_term_index)
  values((period->>'id')::uuid,target_plan,period->>'name',(period->>'startsOn')::date,(period->>'endsOn')::date,(period->>'schoolYear')::integer,
   period#>>'{extent,basis}',(period#>>'{extent,weeks}')::integer,false,'',(period->>'plannedTermIndex')::integer);
  for content in select value from jsonb_array_elements(period->'contents') loop
   insert into public.apl_period_contents(plan_id,period_id,row_key,description) values(target_plan,(period->>'id')::uuid,content->>'rowKey',content->>'description');
  end loop;
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   insert into public.apl_time_allocations(plan_id,period_id,row_key,term_index,gut_minutes)
   values(target_plan,(period->>'id')::uuid,allocation->>'rowKey',(allocation->>'termIndex')::integer,(allocation->>'gutMinutes')::integer);
  end loop;
 end loop;
 for review in select value from jsonb_array_elements(new_reviews) loop
  insert into public.apl_plan_copy_reviews(id,plan_id,source_plan_id,source_version,source_period_id,source_period_name,reason,contents,allocations)
  values((review->>'id')::uuid,target_plan,(review->>'sourcePlanId')::uuid,(review->>'sourceVersion')::integer,
   (review->>'sourcePeriodId')::uuid,review->>'sourcePeriodName',review->>'reason',review->'contents',review->'allocations');
 end loop;
 -- Guards validate provenance and every lost content/allocation tuple. Recheck
 -- the complete persisted active matrix before the creation's own receipt/audit.
 perform public.phase5_apl_plan_parse(public.phase5_apl_plan_value(target_plan));
 perform public.phase5_apl_validate_allocations(public.phase5_gym_timplan_result(target_plan),public.phase5_apl_plan_value(target_plan));
 perform public.phase5_apl_copy_audit(source_plan,target_plan);
 delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=target_plan;
end $$;

create or replace function public.phase5_named_timplan_copy_rows(target_plan uuid,source_basis jsonb,copy_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare previous public.timplans;r jsonb;d jsonb;old_r jsonb;old_d jsonb;h smallint[];mask boolean[];carried integer:=0;reset integer:=0;target public.timplans;v2 boolean;reviews jsonb:='[]';rv jsonb;points jsonb;school jsonb;annual jsonb;i integer;loss jsonb;src record;
begin
 if copy_plan is not null then select * into previous from public.timplans where id=copy_plan;end if;
 select * into target from public.timplans where id=target_plan;
 v2:=exists(select 1 from public.timplan_time_models where plan_id=copy_plan)
  or (copy_plan is null and public.phase5_plan_decision_profile(source_basis)->'vocational'='true'::jsonb
   and jsonb_array_length(public.phase5_plan_decision_source_blockers(source_basis))=0);
 if v2 then
  if copy_plan is not null then select coalesce(jsonb_agg(x||jsonb_build_object('id',gen_random_uuid())),'[]') into reviews from public.timplan_time_models m cross join lateral jsonb_array_elements(m.copy_review) x where m.plan_id=copy_plan and x->'resolution'='null'::jsonb;end if;
  -- Every lost row is kept with its actual plan/version/row and exact minutes.
  -- No fake period ID is manufactured for an annual budget.
  if copy_plan is not null then
   for src in select * from public.timplan_time_cells_v2 where plan_id=copy_plan loop
    select value into old_r from jsonb_array_elements(previous.gym_basis->'rows') where value->>'key'=src.row_key;
    select value into r from jsonb_array_elements(source_basis->'rows') where value->>'key'=src.row_key;
    select value into old_d from jsonb_array_elements(previous.gym_basis->'distribution') where value->>'rowKey'=src.row_key;
    select value into d from jsonb_array_elements(source_basis->'distribution') where value->>'rowKey'=src.row_key;
    if old_r is distinct from r or old_d is distinct from d then
     reviews:=reviews||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'resolution',null,'contractVersion','time_copy_review_v2','sourcePlanId',copy_plan,'sourceVersion',previous.version,
      'rowKey',src.row_key,'reason',case when r is null then 'missing_row' else 'changed_source' end,
      'row',jsonb_build_object('schoolMinutes',src.school_minutes,'annualAplMinutes',src.annual_apl_minutes)));
    end if;
   end loop;
  end if;
  insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),target_plan);
  insert into public.timplan_time_models(plan_id,model,origin,source_plan_id,source_version,copy_review)
   values(target_plan,'school_terms_annual_apl_v2',case when copy_plan is null then 'new' else 'copy' end,copy_plan,previous.version,reviews);
  for r in select value from jsonb_array_elements(source_basis->'rows') loop
   select value into d from jsonb_array_elements(source_basis->'distribution') where value->>'rowKey'=r->>'key';
   select value into old_r from jsonb_array_elements(previous.gym_basis->'rows') where value->>'key'=r->>'key';
   select value into old_d from jsonb_array_elements(previous.gym_basis->'distribution') where value->>'rowKey'=r->>'key';
   if old_r=r and old_d=d then
    select jsonb_build_object('schoolMinutes',school_minutes,'annualAplMinutes',annual_apl_minutes) into rv from public.timplan_time_cells_v2 where plan_id=copy_plan and row_key=r->>'key';
    if rv is null then raise exception 'Källans tidsrad saknas.' using errcode='22023';end if;carried:=carried+1;
   else rv:='{"schoolMinutes":[null,null,null,null,null,null],"annualAplMinutes":[null,null,null]}'::jsonb;reset:=reset+1;end if;
   insert into public.timplan_time_cells_v2(plan_id,row_key,school_minutes,annual_apl_minutes) values(target_plan,r->>'key',rv->'schoolMinutes',rv->'annualAplMinutes');
  end loop;
  delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=target_plan;
  perform public.phase5_apl_copy_structure(copy_plan,target_plan);
  return jsonb_build_object('carriedRows',carried,'resetRows',reset);
 end if;
 for r in select value from jsonb_array_elements(source_basis->'rows') loop
  h:=array[0,0,0,0,0,0]::smallint[];mask:=array[false,false,false,false,false,false];old_r:=null;old_d:=null;
  select value into d from jsonb_array_elements(source_basis->'distribution') where value->>'rowKey'=r->>'key';
  if previous.gym_basis is not null then
   select value into old_r from jsonb_array_elements(previous.gym_basis->'rows') where value->>'key'=r->>'key';
   select value into old_d from jsonb_array_elements(previous.gym_basis->'distribution') where value->>'rowKey'=r->>'key';
  end if;
  if old_r=r and old_d=d then
   select hours,allocated into h,mask from public.timplan_cells where timplan_id=previous.id and row_id=r->>'key';
   if not found then raise exception 'Invalid predecessor matrix' using errcode='22023';end if;
   carried:=carried+1;
  else reset:=reset+1;end if;
  insert into public.timplan_cells(timplan_id,row_id,hours,allocated) values(target_plan,r->>'key',h,mask);
 end loop;
 perform public.phase5_apl_copy_structure(copy_plan,target_plan);
 return jsonb_build_object('carriedRows',carried,'resetRows',reset);
end $$;

-- Only authenticated entry points; all private helpers remain closed.
grant execute on function public.phase5_timplan_time_command(jsonb),public.phase5_timplan_time_status(jsonb),public.phase5_timplan_time_transition_basis(uuid) to skolplattform_worker;


create or replace function public.phase5_planning_year_gym_cells(source jsonb, timplan_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare expected jsonb; r jsonb; d jsonb; result jsonb:='[]'; hv jsonb; member text; part text; seen text[]:='{}'; key text;tv jsonb;v2 boolean;
begin
 v2:=exists(select 1 from public.timplan_time_models m where m.plan_id=phase5_planning_year_gym_cells.timplan_id);
 if source->'basisReference'='null'::jsonb then return '[]';end if;
 if timplan_id is not null and exists(select 1 from public.timplan_cells c where c.timplan_id=phase5_planning_year_gym_cells.timplan_id and
  (array_ndims(c.hours) is distinct from 1 or array_lower(c.hours,1) is distinct from 1 or cardinality(c.hours)<>6 or
   array_ndims(c.allocated) is distinct from 1 or array_lower(c.allocated,1) is distinct from 1 or cardinality(c.allocated)<>6)) then raise exception 'Invalid frozen planning dimensions' using errcode='22023';end if;
 expected:=public.phase5_programplan_term_rows(source->'basisReference');
 if source->'rows' is distinct from expected or source->>'catalogId' is distinct from source#>>'{basisReference,catalogId}' then
 raise exception 'Invalid frozen planning inventory' using errcode='22023';end if;
 perform public.phase5_programplan_validate_terms(source->'basisReference',source->'distribution');
 for r in select value from jsonb_array_elements(expected) loop
  key:=r->>'key';
  if split_part(key,':',1) not in ('block','meta') then
   part:=split_part(key,':',case when key like 'alternative:%' then 2 else 1 end);
   for member in select unnest(string_to_array(regexp_replace(key,case when key like 'alternative:%' then '^alternative:[^:]+:' else '^[^:]+:' end,''),'+')) loop
    if part||':'||member=any(seen) then raise exception 'Overlapping planning inventory' using errcode='22023';end if;
    seen:=array_append(seen,part||':'||member);
   end loop;
  end if;
  select value into d from jsonb_array_elements(source->'distribution') where value->>'rowKey'=key;
  hv:=null;
  if timplan_id is not null and d is not null then
   select jsonb_agg(case when (d->'points'->>(i-1))::integer>0 and c.allocated[i] then to_jsonb(c.hours[i]) else 'null'::jsonb end order by i)
   into hv from public.timplan_cells c cross join generate_series(1,6) i where c.timplan_id=phase5_planning_year_gym_cells.timplan_id and c.row_id=key;
  end if;
  if v2 then
   select jsonb_build_object('schoolMinutes',school_minutes,'annualAplMinutes',annual_apl_minutes) into tv from public.timplan_time_cells_v2 where plan_id=phase5_planning_year_gym_cells.timplan_id and row_key=key;
   perform public.phase5_timplan_time_row(tv,d->'points');
   result:=result||jsonb_build_array(jsonb_build_object('rowKey',key,'points',(r->>'points')::integer,'pointTerms',d->'points','hourValues',null,'timeModel','school_terms_annual_apl_v2')||tv);
  else
   result:=result||jsonb_build_array(jsonb_build_object('rowKey',key,'points',(r->>'points')::integer,'pointTerms',d->'points','hourValues',hv));
  end if;
 end loop;
 if timplan_id is not null and exists(select 1 from public.timplan_cells c where c.timplan_id=phase5_planning_year_gym_cells.timplan_id
  and not exists(select 1 from jsonb_array_elements(expected) er where er->>'key'=c.row_id)) then
 raise exception 'Unknown frozen planning row' using errcode='22023';end if;
 return result;
end $$;

create function public.phase5_planning_year_measure_numeric(known numeric, complete boolean) returns jsonb
language sql immutable set search_path=pg_catalog as $$select jsonb_build_object('value',case when complete then known end,'known',known,'complete',complete)$$;
revoke all on function public.phase5_planning_year_measure_numeric(numeric,boolean) from public,anon,authenticated,service_role,skolplattform_worker;

create or replace function public.phase5_planning_year_metrics(r jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare c jsonb; i integer; selected integer[]; p bigint:=0; h numeric:=0; pc boolean; hc boolean;
begin
 selected:=case when r->>'schoolform'='gymnasium' and r->'relativeYear'<>'null'::jsonb then
  array[((r->>'relativeYear')::integer-1)*2,((r->>'relativeYear')::integer-1)*2+1]
  when r->>'schoolform'='introduktionsprogram' then array[0] else null end;
 pc:=r->'plan'<>'null'::jsonb and selected is not null and jsonb_array_length(r->'cells')>0;hc:=pc;
 for c in select value from jsonb_array_elements(r->'cells') loop
  if r->>'schoolform'='gymnasium' and (c->'pointTerms'='null'::jsonb or
   (select coalesce(sum(value::integer),0) from jsonb_array_elements_text(c->'pointTerms'))<>(c->>'points')::integer) then pc:=false;hc:=false;end if;
  if selected is null then continue;end if;
  foreach i in array selected loop
   if r->>'schoolform'='gymnasium' then p:=p+coalesce((c->'pointTerms'->>i)::integer,0);end if;
   if r->>'schoolform'='gymnasium' and c->'pointTerms'->i='0'::jsonb then continue;end if;
   if c->>'timeModel'='school_terms_annual_apl_v2' then
    if c->'schoolMinutes'->>i is null then hc:=false;else h:=h+(c->'schoolMinutes'->>i)::numeric/60;end if;
   else
    if c->'hourValues'->>i is null then hc:=false;else h:=h+(c->'hourValues'->>i)::integer;end if;
   end if;
  end loop;
  if c->>'timeModel'='school_terms_annual_apl_v2' and selected is not null and ((c->'pointTerms'->>selected[1])::integer>0 or (c->'pointTerms'->>selected[2])::integer>0) then
   if c->'annualAplMinutes'->>(selected[1]/2) is null then hc:=false;else h:=h+(c->'annualAplMinutes'->>(selected[1]/2))::numeric/60;end if;
  end if;
 end loop;
 return jsonb_build_object('points',case when r->>'schoolform'='gymnasium' then public.phase5_planning_year_measure(p,pc) end,
  'hours',public.phase5_planning_year_measure_numeric(h,hc),'classCount',public.phase5_planning_year_measure(jsonb_array_length(r->'classes'),
   not (r->'diagnostics' ?| array['missing-class','ambiguous-class'])));
end $$;

create or replace function public.phase5_planning_year_totals(q jsonb, items jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare r jsonb;c jsonb;metric jsonb;selected integer[];i integer;points bigint:=0;annual numeric:=0;weekly numeric:=0;
 pc boolean:=true;ac boolean:=true;wc boolean:=true;cc boolean:=true;forecast boolean:=false;seenp jsonb:='{}';seenh jsonb:='{}';classes text[]:='{}';k text;amount numeric;
begin
 for r in select value from jsonb_array_elements(items) loop
  metric:=public.phase5_planning_year_metrics(r);
  if r->>'schoolform'='gymnasium' and metric#>>'{points,complete}'='false' then pc:=false;end if;
  if q->>'view'='timplan' and metric#>>'{hours,complete}'='false' then
   if r->>'schoolform'='introduktionsprogram' then wc:=false;else ac:=false;end if;end if;
  if metric#>>'{classCount,complete}'='false' then cc:=false;end if;
  if r->>'underlag'='forecast' then forecast:=true;end if;
  for c in select value from jsonb_array_elements(r->'classes') loop
   if not c->>'id'=any(classes) then classes:=array_append(classes,c->>'id');end if;end loop;
  selected:=case when r->>'schoolform'='gymnasium' and r->'relativeYear'<>'null'::jsonb then array[((r->>'relativeYear')::integer-1)*2,((r->>'relativeYear')::integer-1)*2+1]
   when r->>'schoolform'='introduktionsprogram' then array[0] else null end;
  if selected is null or r->'plan'='null'::jsonb then continue;end if;
  for c in select value from jsonb_array_elements(r->'cells') loop
   k:=jsonb_build_array(r#>>'{source,planId}',r#>'{source,version}',selected[1]/2,c->>'rowKey')::text;
   if r->'source'<>'null'::jsonb and not seenp ? k then
    foreach i in array selected loop points:=points+coalesce((c->'pointTerms'->>i)::integer,0);end loop;seenp:=seenp||jsonb_build_object(k,true);end if;
   k:=jsonb_build_array(r#>>'{plan,id}',r#>'{plan,version}',r->>'unitId',case when r->>'schoolform'='gymnasium' then (selected[1]/2)::text else 'vecka' end,c->>'rowKey')::text;
   if q->>'view'='timplan' and not seenh ? k then
    amount:=0;foreach i in array selected loop
     if r->>'schoolform'='gymnasium' and c->'pointTerms'->i='0'::jsonb then continue;end if;
     amount:=amount+case when c->>'timeModel'='school_terms_annual_apl_v2' then coalesce((c->'schoolMinutes'->>i)::numeric,0)/60 else coalesce((c->'hourValues'->>i)::numeric,0) end;end loop;
    if c->>'timeModel'='school_terms_annual_apl_v2' then amount:=amount+coalesce((c->'annualAplMinutes'->>(selected[1]/2))::numeric,0)/60;end if;
    if r->>'schoolform'='introduktionsprogram' then weekly:=weekly+amount;else annual:=annual+amount;end if;
    seenh:=seenh||jsonb_build_object(k,true);
   end if;
  end loop;
 end loop;
 return jsonb_build_object('points',case when q->>'schoolform'='gymnasium' then public.phase5_planning_year_measure(points,pc) end,
  'annualHours',public.phase5_planning_year_measure_numeric(annual,ac),'weeklyHours',public.phase5_planning_year_measure_numeric(weekly,wc),
  'classCount',public.phase5_planning_year_measure(cardinality(classes),cc),'hasForecast',forecast);
end $$;

create or replace function public.phase5_planning_year_rows(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; item record; tp record; pp record; b record; matched jsonb; cnt integer; cl jsonb; app jsonb; col text;
 source jsonb; cells jsonb; r jsonb; result jsonb:='[]'; diagnostics text[]; started text; sy integer; rel integer;
 relation text; underlag text; map jsonb; form text:=q->>'schoolform'; year integer; metrics jsonb;
 cache_keys jsonb[]:='{}'; cache_rows jsonb[]:='{}'; cache_cells jsonb[]:='{}';
 cache_key jsonb; cache_index integer; cached_cell_count integer:=0;
 cache_names jsonb[]:='{}'; names_index integer; pinned_names jsonb; catalog_program jsonb; search_details jsonb;
begin
 perform public.phase5_planning_year_validate(q);a:=public.phase5_planning_year_actor();year:=(q->>'schoolYear')::integer;
 -- Scope before plans, filters, counts and sorting. offering_units is authoritative for GY, legacy exact unit for GR/IM.
 for item in select o.*,u.id planning_unit,u.name school_name from public.offerings o join public.school_units u on u.organizer_id=o.organizer_id
 join public.mandate_units m on m.unit_id=u.id and m.assignment_id=a.id
 where o.organizer_id=a.organizer_id and o.kind::text=form and (q->'unitId'='null'::jsonb or u.id=(q->>'unitId')::uuid)
 and (case when form='gymnasium' then exists(select 1 from public.offering_units ou where ou.offering_id=o.id and ou.unit_id=u.id) else o.unit_id=u.id end)
 order by u.id,o.id loop
  for tp in
   select p.id,p.version,p.revision,p.status::text status,null::uuid series_id,null::jsonb gym_basis,p.catalog_id,p.basis_reference,p.term_distribution from public.point_plans p
    where q->>'view'='programplan' and p.offering_id=item.id and p.organizer_id=a.organizer_id
   union all
   select t.id,t.version,t.revision,t.status::text,t.series_id,t.gym_basis,null::text,null::jsonb,null::jsonb
    from public.phase5_named_timplan_candidates(item.id,item.planning_unit,year,q->>'status') t
    where q->>'view'='timplan' and t.organizer_id=a.organizer_id
   union all select null::uuid,null::integer,null::integer,null::text,null::uuid,null::jsonb,null::text,null::jsonb,null::jsonb
    where q->>'view'='programplan' and not exists(select 1 from public.point_plans p where p.offering_id=item.id)
  loop
   source:=null;cells:='[]';diagnostics:='{}';started:=null;sy:=null;rel:=null;relation:='unknown';map:=null;
   pinned_names:=null;catalog_program:=null;names_index:=null;
   if tp.id is null then diagnostics:=array_append(diagnostics,'missing-plan');end if;
   if form='gymnasium' and tp.id is not null then
    cache_key:=null;cache_index:=null;
    if q->>'view'='programplan' then
     if tp.basis_reference is not null then
      cache_key:=jsonb_build_array(tp.catalog_id,tp.basis_reference,tp.term_distribution);
      cache_index:=array_position(cache_keys,cache_key);
     end if;
     if cache_index is null then source:=public.phase5_gym_timplan_source(tp.id);
     else
      -- Exact full-key equality reuses only authenticated canonical inventory.
      -- Identity, revision and education always come from this actual scoped row.
      source:=jsonb_build_object('planId',tp.id,'offeringId',item.id,'version',tp.version,'revision',tp.revision,'status',tp.status,
       'catalogId',tp.catalog_id,'basisReference',tp.basis_reference,'distribution',tp.term_distribution,'rows',cache_rows[cache_index],
       'educationRevision',item.lifecycle_revision,'education',jsonb_build_object('name',item.name,'cohort',item.cohort,
        'programCode',item.program_code,'orientationCode',item.orientation_code),'archived',item.archived_at is not null);
     end if;
    else source:=tp.gym_basis;end if;
    if source is not null and source->'basisReference'<>'null'::jsonb then
     if source->>'offeringId' is distinct from item.id::text or (q->>'view'='timplan' and not exists(select 1 from public.point_plans p
      where p.id=(source->>'planId')::uuid and p.offering_id=item.id and p.organizer_id=a.organizer_id and p.version=(source->>'version')::integer)) then
      raise exception 'Invalid frozen planning source' using errcode='22023';end if;
     if q->>'view'='programplan' and cache_index is not null then cells:=cache_cells[cache_index];
     else
      cells:=public.phase5_planning_year_gym_cells(source,case when q->>'view'='timplan' then tp.id end);
      if q->>'view'='programplan' and cache_key is not null and cardinality(cache_keys)<128
       and cached_cell_count+jsonb_array_length(cells)<=50000 then
       cache_keys:=array_append(cache_keys,cache_key);cache_rows:=array_append(cache_rows,source->'rows');
       cache_cells:=array_append(cache_cells,cells);cached_cell_count:=cached_cell_count+jsonb_array_length(cells);
       cache_names:=array_append(cache_names,null::jsonb);names_index:=cardinality(cache_keys);
      end if;
     end if;
     started:=source#>>'{basisReference,startedOn}';
     sy:=public.phase5_planning_year_academic_date(started::date);
     if sy is null or sy not between 1 and 9996 then raise exception 'Invalid planning start' using errcode='22023';end if;
     rel:=year-sy+1;
     relation:=case when rel<1 then 'future' when rel>3 then 'finished' when rel=1 then 'new' else 'continuing' end;
     if rel not between 1 and 3 then rel:=null;diagnostics:=array_append(diagnostics,'outside-three-years');end if;
     if extract(month from started::date)<7 and exists(select 1 from jsonb_array_elements(cells) c cross join generate_series(0,5) i
      where make_date(sy+i/2+case when i%2=1 then 1 else 0 end,case when i%2=0 then 7 else 1 end,1)<started::date
       and coalesce((c->'pointTerms'->>i)::integer,0)+coalesce((c->'hourValues'->>i)::integer,0)>0) then
      diagnostics:=array_append(diagnostics,'allocation-before-start');end if;
     -- Existing source/inventory/distribution/start validation precedes this narrow lookup.
     -- A full-key hit already carries the same verified pinned program and orientation.
     if q->>'view'='programplan' and cache_index is not null then pinned_names:=cache_names[cache_index];
     else
      select program.value into catalog_program from public.programplan_catalogs catalog
       cross join lateral jsonb_array_elements(catalog.payload->'programs') program(value)
       where catalog.catalog_id=source->>'catalogId'
        and program.value->>'code'=source#>>'{basisReference,programRef,code}'
        and program.value->'version'=source#>'{basisReference,programRef,version}';
      pinned_names:=jsonb_build_object('programName',catalog_program->'name','orientationName',
       (select orientation.value->'name' from jsonb_array_elements(catalog_program->'orientations') orientation(value)
        where orientation.value->>'code'=source#>>'{basisReference,orientationCode}'));
      if names_index is not null then cache_names[names_index]:=pinned_names;end if;
     end if;
    else source:=null;diagnostics:=array_append(diagnostics,'missing-source');end if;
   elsif form<>'gymnasium' and tp.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('rowKey',k,'points',null,'pointTerms',null,'hourValues',case when array_ndims(c.hours)=1 and cardinality(c.hours) between 1 and case when form='grundskola' then 9 else 1 end and not exists(select 1 from unnest(c.hours) h where h is null or h<0 or h>2000) then to_jsonb(c.hours) end) order by k),'[]') into cells
    from (select unnest(case when form='grundskola' then array['bild','engelska','hkk','idrott','matematik','musik','no','biologi','fysik','kemi','so','geografi','historia','religion','samhallskunskap','slojd','svenska','teknik','sprakval','skolansval']
     else array['im-sv','im-ma','im-en','im-sh','im-idh','im-praktik','im-mentor'] end) k
     union select c.row_id from public.timplan_cells c where c.timplan_id=tp.id) keys
    left join public.timplan_cells c on c.timplan_id=tp.id and c.row_id=keys.k;
    if form='grundskola' and exists(select 1 from jsonb_array_elements(cells) cell where cell->>'rowKey' <> all(array['bild','engelska','hkk','idrott','matematik','musik','no','biologi','fysik','kemi','so','geografi','historia','religion','samhallskunskap','slojd','svenska','teknik','sprakval','skolansval'])) then
     diagnostics:=array_append(diagnostics,'unknown-row');end if;
   end if;
   if exists(select 1 from jsonb_array_elements(cells) cell where (form<>'gymnasium' and (cell->>'rowKey' !~* '^[a-z0-9][a-z0-9_-]{0,95}$' or cell->>'rowKey' in ('constructor','prototype','__proto__')))) then raise exception 'Invalid legacy planning row' using errcode='22023';end if;
   if form='gymnasium' and sy is null then diagnostics:=array_append(diagnostics,'unverified-start');end if;
   if form='grundskola' then map:='{"kind":"unknown"}';end if;
   -- Codes are this scoped offering's own metadata, including missing/legacy plans.
   -- Only exact source-code agreement permits pinned names; never infer latest names.
   search_details:=jsonb_build_object('localCode',item.local_code,'programCode',item.program_code,'orientationCode',item.orientation_code,
    'programName',case when item.program_code=source#>>'{basisReference,programRef,code}' then pinned_names->'programName' end,
    'orientationName',case when item.program_code=source#>>'{basisReference,programRef,code}'
     and item.orientation_code=source#>>'{basisReference,orientationCode}' then pinned_names->'orientationName' end);
   -- One row per actual GR column; GY/IM retain one frame and resolve all its class references.
   for b in select distinct case when form='grundskola' then ct.column_id else null end column_id,true bound
    from public.class_timplans ct where q->>'view'='timplan' and ct.timplan_id=tp.id and ct.unit_id=item.planning_unit and ct.start_year=year
    union all select null,false where not exists(select 1 from public.class_timplans ct
     where q->>'view'='timplan' and ct.timplan_id=tp.id and ct.unit_id=item.planning_unit and ct.start_year=year)
   loop
    app:=null;cl:='[]';col:=b.column_id;matched:=to_jsonb(diagnostics);
    underlag:=case when tp.id is null then 'missing' when b.bound then 'class-bound' when year<public.phase5_planning_year_academic_date((clock_timestamp() at time zone 'Europe/Stockholm')::date) then 'forecast' else 'planning' end;
    if underlag='forecast' then matched:=matched||'"forecast"'::jsonb;end if;
    if b.bound then
     if form='gymnasium' and rel is not null and exists(select 1 from public.class_timplans ct
      where ct.timplan_id=tp.id and ct.unit_id=item.planning_unit and ct.start_year=year and ct.column_id<>'ar'||rel::text) then
      raise exception 'Planning binding conflict' using errcode='40001',hint='planning_year_binding_mismatch';end if;
     app:=jsonb_build_object('schoolYear',year,'planId',tp.id,'version',tp.version,'columnId',col);
     for pp in select ct.* from public.class_timplans ct where ct.timplan_id=tp.id and ct.unit_id=item.planning_unit
      and ct.start_year=year and (form<>'grundskola' or ct.column_id=col) order by ct.class_name collate "C" loop
      select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'customerId',sc.customer_id,'unitId',sc.unit_id,'offeringId',sc.offering_id)),'[]') into cnt,r
       from public.school_classes sc where sc.customer_id=a.customer_id and sc.organizer_id=a.organizer_id and sc.unit_id=item.planning_unit
        and sc.offering_id=item.id and ((pp.class_id is not null and sc.id=pp.class_id)
         or (pp.class_id is null and upper(btrim(sc.name))=pp.class_name
          and not exists(select 1 from public.class_timplans identified where identified.class_id=sc.id and identified.start_year=year)));
      if cnt=1 then cl:=cl||r;else matched:=matched||to_jsonb(case when cnt=0 then 'missing-class'::text else 'ambiguous-class' end);end if;
     end loop;
    end if;
    if jsonb_array_length(cells)>2000 or jsonb_array_length(cl)>1000 then raise exception 'Planning row limit' using errcode='54000';end if;
    if form='grundskola' then matched:=matched||to_jsonb(case when b.bound then 'unverified-column-map'::text else 'missing-binding' end);end if;
    r:=jsonb_build_object('customerId',a.customer_id,'unitId',item.planning_unit,'offeringId',item.id,'schoolName',item.school_name,
     'educationName',item.name,'cohort',item.cohort,'schoolform',form,'searchDetails',search_details,'plan',case when tp.id is not null then jsonb_build_object('id',tp.id,'version',tp.version,'revision',tp.revision,'status',tp.status,'decisionStage',case when tp.status='faststalld' then 'approved' when tp.status='ersatt' then 'replaced' when tp.status='forslag' then 'submitted' when tp.status='atersand' then 'returned' when q->>'view'='programplan' then coalesce((select d.stage from public.plan_decision_reviews d where d.kind='programplan' and d.plan_id=tp.id),'draft') else 'draft' end) end,
     'source',case when source is not null then jsonb_build_object('planId',source->'planId','offeringId',source->'offeringId','version',source->'version','revision',source->'revision') end,
     'start',jsonb_build_object('provenance',case when sy is null then 'legacy' when q->>'view'='programplan' then 'program-version' else 'timplan-source' end,
      'startedOn',started,'academicYear',null,'legacyYear',case when item.start_year between 2000 and 2100 then item.start_year end),
     'series',case when q->>'view'='timplan' and form='gymnasium' and tp.id is not null then public.phase5_named_timplan_plan_series(tp.id) end,
     'relativeYear',rel,'relation',relation,'underlag',underlag,'archived',item.archived_at is not null,'columnMap',map,'application',app,'classes',cl,'cells',cells,'diagnostics',matched);
    -- Program frame stays singular. Every relevant school plan reference keeps
    -- its own series and frozen program source; no arbitrary school-wide LIMIT 1.
    if q->>'view'='programplan' then
     r:=r||jsonb_build_object('schoolTimplans',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'version',t.version,'revision',t.revision,'status',t.status,
      'series',public.phase5_named_timplan_plan_series(t.id),
      'unitId',t.unit_id,'offeringId',t.offering_id,'sourcePlanId',t.source_programplan_id,'sourceVersion',p.version)
      order by (public.phase5_named_timplan_plan_series(t.id)->>'name') collate "C",t.series_id,t.version desc,t.id)
      from public.phase5_named_timplan_candidates(item.id,item.planning_unit,year,'all') t
      join public.point_plans p on p.id=t.source_programplan_id and p.offering_id=item.id and p.organizer_id=a.organizer_id
      where t.organizer_id=a.organizer_id),'[]'::jsonb));
     if jsonb_array_length(r->'schoolTimplans')>2000 then raise exception 'Planning school reference limit' using errcode='54000';end if;
    end if;
    metrics:=public.phase5_planning_year_metrics(r);
    if form='gymnasium' and metrics#>>'{points,complete}'='false' then matched:=matched||'"missing-points"'::jsonb;end if;
    if q->>'view'='timplan' and metrics#>>'{hours,complete}'='false' then matched:=matched||'"missing-hours"'::jsonb;end if;
    select coalesce(jsonb_agg(d order by d),'[]') into matched from (select distinct value d from jsonb_array_elements(matched)) d;
    r:=jsonb_set(r,'{diagnostics}',matched);
    if (q->>'status'='all' or (case when q->>'view'='programplan' and q->>'status' in ('forslag','atersand') then r#>>'{plan,decisionStage}'=case q->>'status' when 'forslag' then 'submitted' else 'returned' end else tp.status=q->>'status' end)) and (q->>'archive'='all' or (item.archived_at is not null)=(q->>'archive'='archived'))
     and (q->>'cohortRelation'='all' or (q->>'cohortRelation'='relevant' and relation in ('new','continuing','unknown')) or q->>'cohortRelation'=relation)
     and (q->'grade'='null'::jsonb or (case when form='gymnasium' then rel when form='grundskola' then substring(col from 3)::integer end)=(q->>'grade')::integer)
     and (q->>'query'='' or strpos(lower(coalesce(item.name,'')||' '||coalesce(item.cohort,'')||' '||coalesce(item.school_name,'')||' '
      ||coalesce(search_details->>'localCode','')||' '||coalesce(search_details->>'programCode','')||' '
      ||coalesce(search_details->>'orientationCode','')||' '||coalesce(search_details->>'programName','')||' '
      ||coalesce(search_details->>'orientationName','')||' '||coalesce(r#>>'{series,name}','')||' '
      ||coalesce((select string_agg(ref#>>'{series,name}',' ') from jsonb_array_elements(r->'schoolTimplans') ref),'')),lower(q->>'query'))>0) then result:=result||jsonb_build_array(r);end if;
   end loop;
  end loop;
 end loop;
 if jsonb_array_length(result)>10000 or (select coalesce(sum(jsonb_array_length(jr->'cells')),0) from jsonb_array_elements(result) jr)>50000
  or (select coalesce(sum(jsonb_array_length(jr->'classes')),0) from jsonb_array_elements(result) jr)>50000 then raise exception 'Planning result limit' using errcode='54000';end if;
 -- Contradicting revisions of one shared frame must not produce a plausible aggregate or mixed pages.
 if exists(select 1 from jsonb_array_elements(result) jr where jr->'source'<>'null'::jsonb group by jr#>>'{source,planId}'
  having count(distinct jsonb_build_array(jr->'source',jr->'start',(select jsonb_agg(c-array['hourValues','timeModel','schoolMinutes','annualAplMinutes'] order by c->>'rowKey') from jsonb_array_elements(jr->'cells') c)))>1) then
  raise exception 'Planning source conflict' using errcode='40001';end if;
 return result;
end $$;
