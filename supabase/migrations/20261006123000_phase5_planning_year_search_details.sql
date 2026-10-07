-- SEARCH details: extend one private read definition; owner, grants and data remain unchanged.
-- Preserve the performance full-key cache and its 128-key / 50000-cell bounds.
-- Cached names belong to the verified pinned source, never to the current offering.
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
   select p.id,p.version,p.revision,p.status::text status,null::jsonb gym_basis,p.catalog_id,p.basis_reference,p.term_distribution from public.point_plans p
    where q->>'view'='programplan' and p.offering_id=item.id and p.organizer_id=a.organizer_id
   union all
   select t.id,t.version,t.revision,t.status::text,t.gym_basis,null::text,null::jsonb,null::jsonb from public.timplans t
    where q->>'view'='timplan' and t.offering_id=item.id and t.organizer_id=a.organizer_id and t.unit_id=item.planning_unit
    and (exists(select 1 from public.class_timplans ct where ct.timplan_id=t.id and ct.unit_id=item.planning_unit and ct.start_year=year)
      or (not exists(select 1 from public.class_timplans ct join public.timplans tt on tt.id=ct.timplan_id
       where ct.unit_id=item.planning_unit and ct.start_year=year and tt.offering_id=item.id)
       and t.id=(select tt.id from public.timplans tt where tt.offering_id=item.id and tt.unit_id=item.planning_unit
        and (q->>'status'='all' or tt.status::text=q->>'status') order by tt.version desc,tt.id limit 1)))
   union all select null::uuid,null::integer,null::integer,null::text,null::jsonb,null::text,null::jsonb,null::jsonb
    where case when q->>'view'='programplan' then not exists(select 1 from public.point_plans p where p.offering_id=item.id)
     else not exists(select 1 from public.timplans t where t.offering_id=item.id and t.unit_id=item.planning_unit) end
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
     for pp in select ct.class_name from public.class_timplans ct where ct.timplan_id=tp.id and ct.unit_id=item.planning_unit
      and ct.start_year=year and (form<>'grundskola' or ct.column_id=col) order by ct.class_name collate "C" loop
      select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'customerId',sc.customer_id,'unitId',sc.unit_id,'offeringId',sc.offering_id)),'[]') into cnt,r
       from public.school_classes sc where sc.customer_id=a.customer_id and sc.organizer_id=a.organizer_id and sc.unit_id=item.planning_unit
        and sc.offering_id=item.id and upper(btrim(sc.name))=pp.class_name;
      if cnt=1 then cl:=cl||r;else matched:=matched||to_jsonb(case when cnt=0 then 'missing-class'::text else 'ambiguous-class' end);end if;
     end loop;
    end if;
    if jsonb_array_length(cells)>2000 or jsonb_array_length(cl)>1000 then raise exception 'Planning row limit' using errcode='54000';end if;
    if form='grundskola' then matched:=matched||to_jsonb(case when b.bound then 'unverified-column-map'::text else 'missing-binding' end);end if;
    r:=jsonb_build_object('customerId',a.customer_id,'unitId',item.planning_unit,'offeringId',item.id,'schoolName',item.school_name,
     'educationName',item.name,'cohort',item.cohort,'schoolform',form,'searchDetails',search_details,'plan',case when tp.id is not null then jsonb_build_object('id',tp.id,'version',tp.version,'revision',tp.revision,'status',tp.status) end,
     'source',case when source is not null then jsonb_build_object('planId',source->'planId','offeringId',source->'offeringId','version',source->'version','revision',source->'revision') end,
     'start',jsonb_build_object('provenance',case when sy is null then 'legacy' when q->>'view'='programplan' then 'program-version' else 'timplan-source' end,
      'startedOn',started,'academicYear',null,'legacyYear',case when item.start_year between 2000 and 2100 then item.start_year end),
     'relativeYear',rel,'relation',relation,'underlag',underlag,'archived',item.archived_at is not null,'columnMap',map,'application',app,'classes',cl,'cells',cells,'diagnostics',matched);
    metrics:=public.phase5_planning_year_metrics(r);
    if form='gymnasium' and metrics#>>'{points,complete}'='false' then matched:=matched||'"missing-points"'::jsonb;end if;
    if q->>'view'='timplan' and metrics#>>'{hours,complete}'='false' then matched:=matched||'"missing-hours"'::jsonb;end if;
    select coalesce(jsonb_agg(d order by d),'[]') into matched from (select distinct value d from jsonb_array_elements(matched)) d;
    r:=jsonb_set(r,'{diagnostics}',matched);
    if (q->>'status'='all' or tp.status=q->>'status') and (q->>'archive'='all' or (item.archived_at is not null)=(q->>'archive'='archived'))
     and (q->>'cohortRelation'='all' or (q->>'cohortRelation'='relevant' and relation in ('new','continuing','unknown')) or q->>'cohortRelation'=relation)
     and (q->'grade'='null'::jsonb or (case when form='gymnasium' then rel when form='grundskola' then substring(col from 3)::integer end)=(q->>'grade')::integer)
     and (q->>'query'='' or strpos(lower(coalesce(item.name,'')||' '||coalesce(item.cohort,'')||' '||coalesce(item.school_name,'')||' '
      ||coalesce(search_details->>'localCode','')||' '||coalesce(search_details->>'programCode','')||' '
      ||coalesce(search_details->>'orientationCode','')||' '||coalesce(search_details->>'programName','')||' '
      ||coalesce(search_details->>'orientationName','')),lower(q->>'query'))>0) then result:=result||jsonb_build_array(r);end if;
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
