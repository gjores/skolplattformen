-- National Gy25 vocational plans, source-bound profiles and explicit review controls.
-- Existing saved plans, snapshots, history, receipts, links and permissions stay intact.
-- No legacy approval is reopened. Return continues to apply to submitted plans only.
create function public.phase5_plan_decision_profile(source jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare catalog jsonb;program jsonb;points integer;hours integer;vocational boolean:=false;
begin
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select value into program from jsonb_array_elements(catalog->'programs')
 where value->>'code'=source->'basisReference'->'programRef'->>'code'
 and value->'version'=source->'basisReference'->'programRef'->'version';
 if program->>'category'='PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION'
 and program->>'code' in ('EK25','ES25','HU25','NA25','SA25','TE25') then points:=2500;hours:=2180;
 elsif program->>'category'='VOCATIONAL_PROGRAM' then
  vocational:=true;
  if program->>'code' in ('BF25','HT25','VO25') then points:=2700;hours:=2625;
  elsif program->>'code' in ('BA25','EE25','FR25','FS25','FT25','IN25','NB25','RL25','VF25') then points:=2800;hours:=2720;
  else return null;end if;
 else return null;end if;
 return jsonb_build_object('points',points,'hours',hours,'vocational',vocational);
end $$;
revoke all on function public.phase5_plan_decision_profile(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;

create or replace function public.phase5_gym_timplan_require_source(source jsonb) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare catalog jsonb;program jsonb;r jsonb;d jsonb;sum_points integer;profile jsonb;
begin
 if source->>'status' not in ('utkast','faststalld') or source->'archived'<>'false'::jsonb
 or source->'basisReference'='null'::jsonb or not(source->'basisReference' ? 'choiceBlocks') then
 raise exception 'Gym source not ready' using errcode='40001',hint='gym_timplan_source_not_ready';end if;
 perform public.phase5_programplan_validate_terms(source->'basisReference',source->'distribution');
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select value into program from jsonb_array_elements(catalog->'programs')
 where value->>'code'=source->'basisReference'->'programRef'->>'code' and value->'version'=source->'basisReference'->'programRef'->'version';
 profile:=public.phase5_plan_decision_profile(source);
 if profile is null
 or source->'rows' is distinct from public.phase5_programplan_term_rows(source->'basisReference')
 or (select coalesce(sum((value->>'points')::integer),0) from jsonb_array_elements(source->'rows'))<>(profile->>'points')::integer
 or (select coalesce(sum((value->>'points')::integer),0) from jsonb_array_elements(source->'basisReference'->'choiceBlocks') where value->>'kind'='individualChoice')<>200 then
 raise exception 'Gym source not ready' using errcode='40001',hint='gym_timplan_source_not_ready';end if;
 if profile->'vocational'='true'::jsonb then
  -- The shared plan includes eligibility. Individual student opt-outs never shrink this frame.
  if exists(select 1 from (values ('ENGE',2,false),('SVEN',3,true),('SVEA',3,true)) required(code,levels,optional)
   where not exists(select 1 from jsonb_array_elements(program->'foundation') subject
    where subject->>'code'=required.code and subject->'optional'=to_jsonb(required.optional)
    and subject->'subjectVersion'<>'null'::jsonb and jsonb_array_length(subject->'levels')=required.levels))
   or exists(select 1 from (values ('ENGE1000X'),('ENGE2000X')) needed(code)
   where not exists(select 1 from jsonb_array_elements(source->'rows') row
    where row->>'key' ~ ('^foundation:ENGE:[0-9]+:'||needed.code||'$') and row->'points'='100'::jsonb))
   or exists(select 1 from generate_series(1,3) n where not exists(
    select 1 from jsonb_array_elements(source->'rows') row where row->'points'='100'::jsonb
    and (row->>'key' ~ ('^alternative:foundation:SVEN:[0-9]+:SVEN'||n||'000X[+]SVEA:[0-9]+:SVEA'||n||'000X$')
     or row->>'key' ~ ('^alternative:foundation:SVEA:[0-9]+:SVEA'||n||'000X[+]SVEN:[0-9]+:SVEN'||n||'000X$')))) then
   raise exception 'Gym source eligibility incomplete' using errcode='40001',hint='gym_timplan_source_not_ready';end if;
 end if;
 for r in select value from jsonb_array_elements(source->'rows') loop
  select value into d from jsonb_array_elements(source->'distribution') where value->>'rowKey'=r->>'key';
  select coalesce(sum(value::integer),0) into sum_points from jsonb_array_elements_text(d->'points');
  if sum_points<>(r->>'points')::integer then raise exception 'Gym source not ready' using errcode='40001',hint='gym_timplan_source_not_ready';end if;
 end loop;
 -- The Worker independently checks level order and the exact catalog program frame
 -- inside the same outer transaction before commit. It cannot trust client ready.
end $$;

create or replace function public.phase5_plan_decision_source_blockers(source jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare issues jsonb:='[]';catalog jsonb;program jsonb;started date;
begin
 if source is null or source='null'::jsonb or source->'basisReference' is null or source->'basisReference'='null'::jsonb then
 return jsonb_build_array('Programplanen saknar ett versionsbundet underlag.');end if;
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select value into program from jsonb_array_elements(catalog->'programs')
 where value->>'code'=source->'basisReference'->'programRef'->>'code'
 and value->'version'=source->'basisReference'->'programRef'->'version';
 begin started:=(source->'basisReference'->>'startedOn')::date;
 exception when others then started:=null;end;
 if public.phase5_plan_decision_profile(source)->'vocational'='true'::jsonb and started>=date '2028-07-02' then
 issues:=issues||jsonb_build_array('Beslutsregler för yrkesprov från höstterminen 2028 saknas. Den här elevkullen kan inte fastställas med gymnasiearbete som enda modell.');end if;
 if public.phase5_plan_decision_profile(source) is null or started is null or started<date '2025-07-01'
 or program->>'startDate' is null or started<(program->>'startDate')::date
 or (program->>'endDate' is not null and started>(program->>'endDate')::date)
 or (program->>'canceledDate' is not null and started>=(program->>'canceledDate')::date) then
 issues:=issues||jsonb_build_array('Beslutsreglerna är inte verifierade för den här programtypen och elevkullen.');end if;
 begin
  perform public.phase5_gym_timplan_require_source(source||jsonb_build_object('status','utkast','archived',false));
 exception when sqlstate '22023' or sqlstate '40001' then
  issues:=issues||jsonb_build_array('Programplanens ämnen, poängram och terminsfördelning måste vara fullständiga.');
 end;
 return issues;
end $$;

create or replace function public.phase5_plan_decision_detail(target_kind text,target_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;o public.offerings;p public.point_plans;t public.timplans;
 review public.plan_decision_reviews;source jsonb;current_source jsonb;catalog jsonb;hours jsonb:='[]';
 stage text;revision integer;version integer;school_name text;unit_id uuid;actions jsonb:='[]';
 blockers jsonb:='[]';checks jsonb;history jsonb;links jsonb;basis_hash text;next_actor text;
 can_write boolean:=false;total_hours bigint;missing boolean;source_info text;profile jsonb;
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
   jsonb_build_object('id','apl','label','Jag har kontrollerat minst 15 veckors APL, eller mer än halva utbildningen vid lärlingsutbildning. Varje APL-vecka räknas som 23 timmar och ingår bara en gång i timplanens total.'));
 end if;
 if o.archived_at is not null then blockers:=blockers||jsonb_build_array('Utbildningen är arkiverad.');end if;
 blockers:=blockers||public.phase5_plan_decision_source_blockers(source);
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select coalesce(jsonb_agg(jsonb_build_object('unitId',ou.unit_id,'organizerId',ou.organizer_id) order by ou.unit_id),'[]') into links
  from public.offering_units ou where ou.offering_id=o.id;
 select coalesce(jsonb_agg(jsonb_build_object('action',h.action,'at',h.occurred_at,'actorName',h.actor_name,'comment',h.comment) order by h.occurred_at desc,h.id desc),'[]')
  into history from (select * from public.plan_decision_history h where h.kind=target_kind and h.plan_id=target_id and h.organizer_id=o.organizer_id order by occurred_at desc,id desc limit 1000) h;
 basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('rules','gy25-national-programs-2026-10-12-v2',
  'kind',target_kind,'planId',target_id,'revision',revision,'source',source,'currentSource',current_source,
  'hours',hours,'stage',stage,'decisionRevision',coalesce(review.revision,0),'links',links,
  'educationRevision',o.lifecycle_revision,'archived',o.archived_at,'phase',public.phase5_programplan_phase(o))::text,'UTF8')),'hex');
 next_actor:=case when stage='submitted' or (a.function='huvudman' and actions ? 'approve' and jsonb_array_length(blockers)=0) then 'huvudman' when stage in ('draft','returned') then 'rektor' else null end;
 return jsonb_build_object('kind',target_kind,'planId',target_id,'offeringId',o.id,'unitId',unit_id,
  'educationName',o.name,'schoolName',school_name,'version',version,'stage',stage,'nextActor',next_actor,
  'revision',revision,'decisionRevision',coalesce(review.revision,0),'basisHash',basis_hash,'actions',actions,
  'blockers',blockers,'checks',checks,'history',history,'sourceInfo',source_info,'source',source,'catalog',catalog,'hours',hours);
end $$;
