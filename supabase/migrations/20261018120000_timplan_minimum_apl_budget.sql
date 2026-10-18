-- Reserve the vocational minimum (15 weeks x 23 GUT hours = 345 hours)
-- in the annual APL table before submit/approve. No period/date requirement.
-- Existing frozen receipts, rows, ACL and draft-save commands are unchanged.
-- The decision command already rejects blockers and locks the timetable.
create or replace function public.phase5_plan_decision_detail(target_kind text,target_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;o public.offerings;p public.point_plans;t public.timplans;
 review public.plan_decision_reviews;source jsonb;current_source jsonb;catalog jsonb;hours jsonb:='[]';
 stage text;revision integer;version integer;school_name text;unit_id uuid;actions jsonb:='[]';
 blockers jsonb:='[]';checks jsonb;history jsonb;links jsonb;basis_hash text;next_actor text;
 can_write boolean:=false;total_hours bigint;missing boolean;source_info text;profile jsonb;series jsonb;apl jsonb;time_rows jsonb;total_minutes bigint;apl_minutes bigint;v2 boolean:=false;
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
   profile:=public.phase5_plan_decision_profile(source);
   time_rows:=public.phase5_timplan_time_rows(t.id);
   if exists(select 1 from public.timplan_time_models m cross join lateral jsonb_array_elements(m.copy_review) r where m.plan_id=t.id and r->'resolution'='null'::jsonb) then
    blockers:=blockers||jsonb_build_array('Kopieringen har tidsrader som behöver granskas innan timplanen godkänns.');end if;
   select coalesce(sum((v#>>'{}')::bigint),0) into total_minutes from jsonb_each(time_rows) r cross join lateral jsonb_array_elements((r.value->'schoolMinutes')||(r.value->'annualAplMinutes')) v;
   missing:=exists(select 1 from jsonb_array_elements(source->'distribution') d cross join generate_series(0,5) i where (d->'points'->>i)::integer>0 and time_rows->(d->>'rowKey')->'schoolMinutes'->>i is null)
    or (profile->'vocational'='true'::jsonb and exists(select 1 from jsonb_array_elements(source->'distribution') d cross join generate_series(0,2) i where ((d->'points'->>(i*2))::integer>0 or (d->'points'->>(i*2+1))::integer>0) and time_rows->(d->>'rowKey')->'annualAplMinutes'->>i is null))
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
  -- The table reserves a minimum APL budget. Detailed periods remain a later process.
  if profile->'vocational'='true'::jsonb then
   if not v2 then
    blockers:=blockers||jsonb_build_array('Byt till timtabellen med separat APL per årskurs innan timplanen skickas för godkännande.');
   else
    select coalesce(sum((v#>>'{}')::bigint),0) into apl_minutes from jsonb_each(time_rows) r cross join lateral jsonb_array_elements(r.value->'annualAplMinutes') v;
    if apl_minutes<20700 then blockers:=blockers||jsonb_build_array('Planera minst 345 timmar APL i timplanen. Perioder och veckor planeras senare.');end if;
   end if;
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
   jsonb_build_object('id',case when target_kind='programplan' then 'apl' else 'apl-budget' end,'label',case when target_kind='programplan' then 'APL:s omfattning och förläggning ska granskas separat efter timplanen.' else 'Jag har granskat den planerade APL-tiden i timplanens total. Perioder och förläggning granskas separat.' end));
 end if;
 if o.archived_at is not null then blockers:=blockers||jsonb_build_array('Utbildningen är arkiverad.');end if;
 blockers:=blockers||public.phase5_plan_decision_source_blockers(source);

 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select coalesce(jsonb_agg(jsonb_build_object('unitId',ou.unit_id,'organizerId',ou.organizer_id) order by ou.unit_id),'[]') into links
  from public.offering_units ou where ou.offering_id=o.id;
 select coalesce(jsonb_agg(jsonb_build_object('action',h.action,'at',h.occurred_at,'actorName',h.actor_name,'comment',h.comment,'nameAtDecision',h.name_at_decision) order by h.occurred_at desc,h.id desc),'[]')
  into history from (select * from public.plan_decision_history h where h.kind=target_kind and h.plan_id=target_id and h.organizer_id=o.organizer_id order by occurred_at desc,id desc limit 1000) h;
 basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('rules',case when target_kind='timplan' then 'gy25-timetable-apl-minimum-2026-10-18-v1' else 'gy25-national-programs-2026-10-12-v2' end,
  'kind',target_kind,'planId',target_id,'revision',revision,'source',source,'currentSource',current_source,
  'hours',hours,'stage',stage,'decisionRevision',coalesce(review.revision,0),'links',links,
  'educationRevision',o.lifecycle_revision,'archived',o.archived_at,'phase',public.phase5_programplan_phase(o))::text,'UTF8')),'hex');
 if target_kind='timplan' then
  basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('basisHash',basis_hash,'series',series)::text,'UTF8')),'hex');
 end if;
 if v2 then basis_hash:='sha256:'||encode(sha256(convert_to(public.phase5_apl_canonical(jsonb_build_array('time_decision_v2',basis_hash,time_rows::text,(select copy_review::text from public.timplan_time_models where plan_id=target_id))),'UTF8')),'hex');end if;

 next_actor:=case when stage='submitted' or (a.function='huvudman' and actions ? 'approve' and jsonb_array_length(blockers)=0) then 'huvudman' when stage in ('draft','returned') then 'rektor' else null end;
 return jsonb_build_object('contractVersion',case when target_kind='timplan' then 'timetable_decision_v2' else 'apl_decision_v1' end,'apl',null,'series',series,'kind',target_kind,'planId',target_id,'offeringId',o.id,'unitId',unit_id,
  'educationName',o.name,'schoolName',school_name,'version',version,'stage',stage,'nextActor',next_actor,
  'revision',revision,'decisionRevision',coalesce(review.revision,0),'basisHash',basis_hash,'actions',actions,
  'blockers',blockers,'checks',checks,'history',history,'sourceInfo',source_info,'source',source,'catalog',catalog) || case when v2 then jsonb_build_object('timeModel','school_terms_annual_apl_v2','timeRows',time_rows,'timeCopyReview',(select copy_review from public.timplan_time_models where plan_id=target_id)) else jsonb_build_object('hours',hours) end;
end $$;
