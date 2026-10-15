-- NAMED-TIMPLANS-UX-05. Read-only projections: series identity is explicit;
-- current names never rewrite frozen source, version names or command receipts.
create function public.phase5_named_timplan_plan_series(plan_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 select jsonb_build_object('id',s.id,'name',s.name,'revision',s.revision) into result
 from public.timplans t join public.timplan_series s on s.id=t.series_id
  and s.organizer_id=t.organizer_id and s.offering_id=t.offering_id and s.unit_id=t.unit_id
 where t.id=plan_id;
 if result is null then raise exception 'Timplan series scope missing' using errcode='22023';end if;
 return result;
end $$;

-- All exact year bindings in each independent series; otherwise that series'
-- current candidate. A class on A must never hide B. Scope is checked by callers.
create function public.phase5_named_timplan_candidates(education_id uuid,school_id uuid,school_year integer,requested_status text)
returns setof public.timplans language sql stable security definer set search_path=pg_catalog,public as $$
 select t.* from public.timplans t where t.offering_id=education_id and t.unit_id=school_id
 and (exists(select 1 from public.class_timplans ct where ct.timplan_id=t.id and ct.unit_id=school_id and ct.start_year=school_year)
 or (not exists(select 1 from public.class_timplans ct join public.timplans bound on bound.id=ct.timplan_id
   where ct.unit_id=school_id and ct.start_year=school_year and bound.series_id=t.series_id
    and bound.offering_id=education_id and bound.unit_id=school_id)
  and t.id=(select candidate.id from public.timplans candidate where candidate.series_id=t.series_id
    and candidate.offering_id=education_id and candidate.unit_id=school_id
    and (requested_status='all' or candidate.status::text=requested_status)
   order by case when (select o.kind from public.offerings o where o.id=education_id)<>'gymnasium' then 0
    when candidate.status in ('utkast','forslag','atersand') then 0
    when candidate.status='faststalld' then 1 else 2 end,candidate.version desc,candidate.id limit 1)))
$$;
revoke all on function public.phase5_named_timplan_plan_series(uuid),public.phase5_named_timplan_candidates(uuid,uuid,integer,text)
 from public,anon,authenticated,service_role,skolplattform_worker;


create or replace function public.phase5_gym_timplan_result(plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;o public.offerings;a public.access_assignments;catalog jsonb;current_source jsonb;values jsonb;
begin
 select * into p from public.timplans where id=plan_id;
 if p.gym_basis is null then raise exception 'Gym legacy basis unavailable' using errcode='42501',hint='gym_timplan_legacy';end if;
 select * into o from public.offerings where id=p.offering_id;
 a:=public.phase3_actor();select payload into catalog from public.programplan_catalogs where catalog_id=p.gym_basis->>'catalogId';
 select jsonb_build_object('planId',q.id,'version',q.version,'revision',q.revision,'status',q.status) into current_source
 from public.point_plans q where q.offering_id=p.offering_id and q.organizer_id=p.organizer_id order by version desc,id limit 1;
 select coalesce(jsonb_object_agg(c.row_id,(select jsonb_agg(case when c.allocated[n] then to_jsonb(c.hours[n]) else 'null'::jsonb end order by n) from generate_series(1,6) n)),'{}'::jsonb)
 into values from public.timplan_cells c where c.timplan_id=p.id;
 return jsonb_build_object('id',p.id,'offeringId',p.offering_id,'unitId',p.unit_id,'schoolName',(select name from public.school_units where id=p.unit_id),
 'version',p.version,'revision',p.revision,'status',p.status,'series',public.phase5_named_timplan_plan_series(p.id),'nameAtCreation',p.name_at_creation,'source',p.gym_basis,'catalog',catalog,'currentSource',current_source,'currentSourceBasis',case when current_source is null then null else public.phase5_gym_timplan_source((current_source->>'planId')::uuid) end,'hours',values,
 'canPlan',a.function in ('rektor','administrator') and p.status in ('utkast','atersand') and o.archived_at is null,'archived',o.archived_at is not null);
end $$;

create or replace function public.phase5_gym_timplan_underlag(source_plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.point_plans;a public.access_assignments;o public.offerings;units jsonb;source jsonb;catalog jsonb;unit uuid;
begin
 a:=public.phase5_programplan_actor();select * into p from public.point_plans where id=source_plan_id and organizer_id=a.organizer_id;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 select x.unit_id into unit from public.offering_units x join public.mandate_units m on m.unit_id=x.unit_id and m.assignment_id=a.id where x.offering_id=p.offering_id and x.organizer_id=a.organizer_id order by x.unit_id limit 1;
 if unit is null then raise exception 'Gym timplan denied' using errcode='42501';end if;
 o:=public.phase5_gym_timplan_scope(p.offering_id,unit,false);
 select * into p from public.point_plans where id=source_plan_id for update;
 a:=public.phase5_programplan_actor();source:=public.phase5_gym_timplan_source(p.id);
 select payload into catalog from public.programplan_catalogs where catalog_id=p.catalog_id;
 select coalesce(jsonb_agg(jsonb_build_object('unitId',u.id,'schoolName',u.name,'canPlan',a.function in ('rektor','administrator') and o.archived_at is null,
 'plans',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'version',t.version,'revision',t.revision,'status',t.status,
 'series',public.phase5_named_timplan_plan_series(t.id),'sourcePlanId',t.source_programplan_id,'sourceRevision',t.gym_basis->'revision','sourceVersion',t.gym_basis->'version') order by (public.phase5_named_timplan_plan_series(t.id)->>'name') collate "C",t.series_id,t.version desc,t.id)
 from public.timplans t where t.offering_id=o.id and t.unit_id=u.id and t.organizer_id=o.organizer_id),'[]'::jsonb)) order by u.name,u.id),'[]'::jsonb)
 into units from public.offering_units x join public.school_units u on u.id=x.unit_id and u.organizer_id=x.organizer_id
 join public.mandate_units m on m.unit_id=u.id and m.assignment_id=a.id where x.offering_id=o.id and x.organizer_id=o.organizer_id;
 perform public.phase5_gym_timplan_audit(p.id,'gym_timplan_basis_read');return jsonb_build_object('source',source,'catalog',catalog,'units',units);
end $$;

create or replace function public.phase5_class_underlag(plan_id uuid,school_year integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;o public.offerings;a public.access_assignments;classes jsonb;linked jsonb;blockers jsonb;y integer;
begin
 if school_year is null or school_year not between 2000 and 2100 then raise exception 'Invalid class year' using errcode='22023';end if;
 p:=public.phase5_class_scope(plan_id,false);a:=public.phase5_programplan_actor();select * into o from public.offerings where id=p.offering_id;
 if (select count(*) from public.school_classes c where c.offering_id=p.offering_id and c.unit_id=p.unit_id)>2000
  or (select count(*) from public.class_timplans l where l.timplan_id=p.id)>2000 then raise exception 'Class result too large' using errcode='40001',hint='class_plan_limit';end if;
 y:=public.phase5_class_start_year(p);if y not between 2000 and 2100 then y:=null;end if;blockers:=public.phase5_class_blockers(p,o);
 if y is not null and school_year not between y and y+2 then blockers:=blockers||jsonb_build_array('Välj ett läsår inom timplanens tre gymnasieår.');end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'startYear',c.start_year,'link',case when l.timplan_id is null then null else
 jsonb_build_object('planId',t.id,'series',public.phase5_named_timplan_plan_series(t.id),'version',t.version,'status',t.status,'columnId',l.column_id,'revision',l.revision,'legacy',l.class_id is null) end) order by c.name,c.start_year,c.id),'[]') into classes
 from public.school_classes c left join lateral (
  select link.* from public.class_timplans link where link.class_id=c.id and link.start_year=school_year
  union all
  select link.* from public.class_timplans link where link.class_id is null and link.unit_id=c.unit_id
   and link.class_name=c.name and link.start_year=school_year and public.phase5_class_legacy_matches(c,link)
   and not exists(select 1 from public.class_timplans identified where identified.class_id=c.id and identified.start_year=school_year)
 ) l on true
 left join public.timplans t on t.id=l.timplan_id
 where c.offering_id=p.offering_id and c.unit_id=p.unit_id and c.customer_id=a.customer_id and c.organizer_id=a.organizer_id;
 select coalesce(jsonb_agg(jsonb_build_object('classId',l.class_id,'className',l.class_name,'classStartYear',c.start_year,'schoolYear',l.start_year,'columnId',l.column_id,'revision',l.revision,'legacy',l.class_id is null) order by l.start_year,l.class_name),'[]') into linked
 from public.class_timplans l left join public.school_classes c on c.id=l.class_id where l.timplan_id=p.id and l.unit_id=p.unit_id;
 perform public.phase5_class_audit(p.id,'class_plan_read');
 return jsonb_build_object('plan',jsonb_build_object('id',p.id,'offeringId',p.offering_id,'unitId',p.unit_id,'schoolName',(select name from public.school_units where id=p.unit_id),
 'educationName',o.name,'cohort',o.cohort,'series',public.phase5_named_timplan_plan_series(p.id),'startYear',y,'version',p.version,'status',p.status,'revision',p.revision),'schoolYear',school_year,
 'canManage',a.function in ('rektor','administrator') and p.status='faststalld' and jsonb_array_length(blockers)=0,'blockers',blockers,'classes',classes,'linkedClasses',linked);
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
  having count(distinct jsonb_build_array(jr->'source',jr->'start',(select jsonb_agg(c-'hourValues' order by c->>'rowKey') from jsonb_array_elements(jr->'cells') c)))>1) then
  raise exception 'Planning source conflict' using errcode='40001';end if;
 return result;
end $$;

create or replace function public.phase5_planning_year_sorted(q jsonb, items jsonb) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(r order by
  case when q->>'direction'='asc' then txt end collate "C" asc nulls last,
  case when q->>'direction'='desc' then txt end collate "C" desc nulls last,
  case when q->>'direction'='asc' then num end asc nulls last,
  case when q->>'direction'='desc' then num end desc nulls last,
  r->>'schoolName' collate "C",r->>'educationName' collate "C",r->>'cohort' collate "C",r#>>'{series,name}' collate "C",r#>>'{series,id}',(r#>>'{plan,version}')::integer,
  r->>'unitId',r->>'offeringId',r#>>'{plan,id}',r#>>'{application,columnId}'),'[]')
 from (select r,case q->>'sort' when 'name' then r->>'educationName' when 'school' then r->>'schoolName' when 'cohort' then r->>'cohort' when 'status' then r#>>'{plan,status}' end txt,
  case q->>'sort' when 'version' then (r#>>'{plan,version}')::bigint when 'grade' then case when r->>'schoolform'='gymnasium' then (r->>'relativeYear')::bigint else substring(r#>>'{application,columnId}' from 3)::bigint end
   when 'points' then (public.phase5_planning_year_metrics(r)#>>'{points,value}')::bigint when 'hours' then (public.phase5_planning_year_metrics(r)#>>'{hours,value}')::bigint end num
  from jsonb_array_elements(items) r) s
$$;

-- Existing revision hashes include complete sorted rows, so series names,
-- series revisions and every plural school reference participate automatically.
-- Existing totals deduplicate source points, plan-version/year/column hours and
-- class IDs. Hours mean "Summa i de visade timplanerna", never staff demand or
-- multiplied class hours; each named plan retains its own visible row metrics.
-- Class command receipts and all business writes remain unchanged.
