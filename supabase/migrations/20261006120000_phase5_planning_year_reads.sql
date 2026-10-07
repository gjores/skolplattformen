-- Läsårsplanering: nya stängda läsprojektioner. Ingen backfill eller verksamhetsmutation.
create function public.phase5_planning_year_actor() returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 -- Locks/rechecks the real session and customer/issuing mandate chain, independent of pupil scopes.
 return public.phase5_programplan_actor();
end $$;

create function public.phase5_planning_year_academic_date(started_on date) returns integer
language sql immutable set search_path=pg_catalog as $$
 select case when started_on is not null and isfinite(started_on) then
 extract(year from started_on)::integer-case when extract(month from started_on)<7 then 1 else 0 end end
$$;

create function public.phase5_planning_year_audit(operation text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
 if operation is null or operation not in ('planning_year_selection_read','planning_year_list_read','planning_year_overview_read') then
  raise exception 'Invalid planning audit' using errcode='22023'; end if;
 a:=public.phase5_planning_year_actor(); s:=public.phase5_programplan_session_check();
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,
   action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,
   operation,'planning_year_collection',null,'ok','{}'::jsonb);
 exception when others then raise exception 'Planning audit unavailable' using errcode='55000'; end;
end $$;

create function public.phase5_planning_year_selection() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; today date; result jsonb;
begin
 a:=public.phase5_planning_year_actor(); today:=(clock_timestamp() at time zone 'Europe/Stockholm')::date;
 select jsonb_build_object('customerId',a.customer_id,'serverDate',to_char(today,'YYYY-MM-DD'),
  'currentYear',public.phase5_planning_year_academic_date(today),'minimumYear',2000,'maximumYear',2100,
  'units',coalesce(jsonb_agg(jsonb_build_object('unitId',u.id,'schoolName',u.name,'canRead',jsonb_build_object(
   'programplan',true,'gymnasium',true,'grundskola',a.function in ('huvudman','rektor'),'introduktionsprogram',a.function in ('huvudman','rektor')))
   order by u.name collate "C",u.id),'[]'::jsonb)) into result
 from public.school_units u join public.mandate_units m on m.unit_id=u.id and m.assignment_id=a.id
 join public.organizers g on g.id=u.organizer_id and g.customer_id=a.customer_id
 where u.organizer_id=a.organizer_id;
 if jsonb_array_length(result->'units')>1000 then raise exception 'Planning scope limit' using errcode='54000';end if;
 perform public.phase5_planning_year_audit('planning_year_selection_read');
 return result;
end $$;

-- Helpers and entrypoints remain inaccessible to ordinary clients and the Worker.
revoke all on function public.phase5_planning_year_actor(),public.phase5_planning_year_academic_date(date),
 public.phase5_planning_year_audit(text),public.phase5_planning_year_selection()
 from public,anon,authenticated,service_role,skolplattform_worker;

create function public.phase5_planning_year_validate(q jsonb) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; u uuid;
begin
 a:=public.phase5_planning_year_actor();
 if not public.phase5_programplan_shape(q,array['schoolYear','unitId','view','schoolform','query','status','cohortRelation','archive','grade','sort','direction','page','selectionRevision'])
 or not public.phase5_programplan_integer(q->'schoolYear',2000,2100)
 or q->>'view' not in ('programplan','timplan') or q->>'schoolform' not in ('gymnasium','grundskola','introduktionsprogram')
 or (q->'query'<>'""'::jsonb and not public.phase5_programplan_text(q->'query',200)) or q->>'query'<>btrim(q->>'query',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') or q->>'query' ~ '[[:cntrl:]]'
 or exists(select 1 from unnest(array['view','schoolform','status','cohortRelation','archive','sort','direction']) k where jsonb_typeof(q->k)<>'string')
 or q->>'status' not in ('all','utkast','forslag','atersand','faststalld','ersatt')
 or q->>'cohortRelation' not in ('all','relevant','new','continuing','future','finished','unknown')
 or q->>'archive' not in ('active','archived','all') or q->>'sort' not in ('name','school','cohort','version','status','grade','points','hours')
 or q->>'direction' not in ('asc','desc') or not public.phase5_programplan_integer(q->'page',1,100000)
 or (q->'grade'<>'null'::jsonb and not public.phase5_programplan_integer(q->'grade',1,case when q->>'schoolform'='gymnasium' then 3 else 9 end))
 or (q->>'schoolform'='introduktionsprogram' and q->'grade'<>'null'::jsonb)
 or (q->>'schoolform'<>'gymnasium' and q->>'sort'='points')
 or (q->>'view'='programplan' and (q->>'schoolform'<>'gymnasium' or q->>'status' in ('forslag','atersand') or q->>'sort'='hours'))
 or (q->'selectionRevision'<>'null'::jsonb and (jsonb_typeof(q->'selectionRevision')<>'string' or q->>'selectionRevision' !~ '^sha256:[0-9a-f]{64}$'))
 or ((q->>'page')::integer>1 and q->'selectionRevision'='null'::jsonb) then
 raise exception 'Invalid planning selection' using errcode='22023';end if;
 if a.function='administrator' and q->>'schoolform'<>'gymnasium' then raise exception 'Planning denied' using errcode='42501';end if;
 if q->'unitId'<>'null'::jsonb then
  if jsonb_typeof(q->'unitId')<>'string' or q->>'unitId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
   raise exception 'Invalid planning selection' using errcode='22023';end if;
  u:=(q->>'unitId')::uuid;
  if not exists(select 1 from public.mandate_units m join public.school_units s on s.id=m.unit_id
   where m.assignment_id=a.id and m.unit_id=u and s.organizer_id=a.organizer_id) then raise exception 'Planning denied' using errcode='42501';end if;
 end if;
end $$;

-- Catalog resolution authenticates the full row inventory; identical truncation on two schools is insufficient.
create function public.phase5_planning_year_gym_cells(source jsonb, timplan_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare expected jsonb; r jsonb; d jsonb; result jsonb:='[]'; hv jsonb; member text; part text; seen text[]:='{}'; key text;
begin
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
  result:=result||jsonb_build_array(jsonb_build_object('rowKey',key,'points',(r->>'points')::integer,'pointTerms',d->'points','hourValues',hv));
 end loop;
 if timplan_id is not null and exists(select 1 from public.timplan_cells c where c.timplan_id=phase5_planning_year_gym_cells.timplan_id
  and not exists(select 1 from jsonb_array_elements(expected) er where er->>'key'=c.row_id)) then
 raise exception 'Unknown frozen planning row' using errcode='22023';end if;
 return result;
end $$;

create function public.phase5_planning_year_measure(known bigint, complete boolean) returns jsonb
language sql immutable set search_path=pg_catalog as $$select jsonb_build_object('value',case when complete then known end,'known',known,'complete',complete)$$;

-- Shared quantity implementation for sorting, row diagnoses and overview; no calendar or pupil inference.
create function public.phase5_planning_year_metrics(r jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare c jsonb; i integer; selected integer[]; p bigint:=0; h bigint:=0; pc boolean; hc boolean;
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
   if c->'hourValues'->>i is null then hc:=false;else h:=h+(c->'hourValues'->>i)::integer;end if;
  end loop;
 end loop;
 return jsonb_build_object('points',case when r->>'schoolform'='gymnasium' then public.phase5_planning_year_measure(p,pc) end,
  'hours',public.phase5_planning_year_measure(h,hc),'classCount',public.phase5_planning_year_measure(jsonb_array_length(r->'classes'),
   not (r->'diagnostics' ?| array['missing-class','ambiguous-class'])));
end $$;

create function public.phase5_planning_year_rows(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; item record; tp record; pp record; b record; matched jsonb; cnt integer; cl jsonb; app jsonb; col text;
 source jsonb; cells jsonb; r jsonb; result jsonb:='[]'; diagnostics text[]; started text; sy integer; rel integer;
 relation text; underlag text; map jsonb; form text:=q->>'schoolform'; year integer; metrics jsonb;
begin
 perform public.phase5_planning_year_validate(q);a:=public.phase5_planning_year_actor();year:=(q->>'schoolYear')::integer;
 -- Scope before plans, filters, counts and sorting. offering_units is authoritative for GY, legacy exact unit for GR/IM.
 for item in select o.*,u.id planning_unit,u.name school_name from public.offerings o join public.school_units u on u.organizer_id=o.organizer_id
 join public.mandate_units m on m.unit_id=u.id and m.assignment_id=a.id
 where o.organizer_id=a.organizer_id and o.kind::text=form and (q->'unitId'='null'::jsonb or u.id=(q->>'unitId')::uuid)
 and (case when form='gymnasium' then exists(select 1 from public.offering_units ou where ou.offering_id=o.id and ou.unit_id=u.id) else o.unit_id=u.id end)
 order by u.id,o.id loop
  for tp in
   select p.id,p.version,p.revision,p.status::text status,null::jsonb gym_basis from public.point_plans p
    where q->>'view'='programplan' and p.offering_id=item.id and p.organizer_id=a.organizer_id
   union all
   select t.id,t.version,t.revision,t.status::text,t.gym_basis from public.timplans t
    where q->>'view'='timplan' and t.offering_id=item.id and t.organizer_id=a.organizer_id and t.unit_id=item.planning_unit
    and (exists(select 1 from public.class_timplans ct where ct.timplan_id=t.id and ct.unit_id=item.planning_unit and ct.start_year=year)
      or (not exists(select 1 from public.class_timplans ct join public.timplans tt on tt.id=ct.timplan_id
       where ct.unit_id=item.planning_unit and ct.start_year=year and tt.offering_id=item.id)
       and t.id=(select tt.id from public.timplans tt where tt.offering_id=item.id and tt.unit_id=item.planning_unit
        and (q->>'status'='all' or tt.status::text=q->>'status') order by tt.version desc,tt.id limit 1)))
   union all select null::uuid,null::integer,null::integer,null::text,null::jsonb
    where case when q->>'view'='programplan' then not exists(select 1 from public.point_plans p where p.offering_id=item.id)
     else not exists(select 1 from public.timplans t where t.offering_id=item.id and t.unit_id=item.planning_unit) end
  loop
   source:=null;cells:='[]';diagnostics:='{}';started:=null;sy:=null;rel:=null;relation:='unknown';map:=null;
   if tp.id is null then diagnostics:=array_append(diagnostics,'missing-plan');end if;
   if form='gymnasium' and tp.id is not null then
    if q->>'view'='programplan' then source:=public.phase5_gym_timplan_source(tp.id);else source:=tp.gym_basis;end if;
    if source is not null and source->'basisReference'<>'null'::jsonb then
     if source->>'offeringId' is distinct from item.id::text or (q->>'view'='timplan' and not exists(select 1 from public.point_plans p
      where p.id=(source->>'planId')::uuid and p.offering_id=item.id and p.organizer_id=a.organizer_id and p.version=(source->>'version')::integer)) then
      raise exception 'Invalid frozen planning source' using errcode='22023';end if;
     cells:=public.phase5_planning_year_gym_cells(source,case when q->>'view'='timplan' then tp.id end);
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
     'educationName',item.name,'cohort',item.cohort,'schoolform',form,'plan',case when tp.id is not null then jsonb_build_object('id',tp.id,'version',tp.version,'revision',tp.revision,'status',tp.status) end,
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
     and (q->>'query'='' or strpos(lower(item.name||' '||item.cohort||' '||item.school_name),lower(q->>'query'))>0) then result:=result||jsonb_build_array(r);end if;
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

create function public.phase5_planning_year_sorted(q jsonb, items jsonb) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(r order by
  case when q->>'direction'='asc' then txt end collate "C" asc nulls last,
  case when q->>'direction'='desc' then txt end collate "C" desc nulls last,
  case when q->>'direction'='asc' then num end asc nulls last,
  case when q->>'direction'='desc' then num end desc nulls last,
  r->>'schoolName' collate "C",r->>'educationName' collate "C",r->>'cohort' collate "C",(r#>>'{plan,version}')::integer,
  r->>'unitId',r->>'offeringId',r#>>'{plan,id}',r#>>'{application,columnId}'),'[]')
 from (select r,case q->>'sort' when 'name' then r->>'educationName' when 'school' then r->>'schoolName' when 'cohort' then r->>'cohort' when 'status' then r#>>'{plan,status}' end txt,
  case q->>'sort' when 'version' then (r#>>'{plan,version}')::bigint when 'grade' then case when r->>'schoolform'='gymnasium' then (r->>'relativeYear')::bigint else substring(r#>>'{application,columnId}' from 3)::bigint end
   when 'points' then (public.phase5_planning_year_metrics(r)#>>'{points,value}')::bigint when 'hours' then (public.phase5_planning_year_metrics(r)#>>'{hours,value}')::bigint end num
  from jsonb_array_elements(items) r) s
$$;

create function public.phase5_planning_year_revision(q jsonb, items jsonb) returns text
language sql immutable set search_path=pg_catalog,public,extensions as $$
 select 'sha256:'||encode(extensions.digest(jsonb_build_array(q-'page'-'selectionRevision',items)::text,'sha256'),'hex')
$$;

create function public.phase5_planning_year_totals(q jsonb, items jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare r jsonb;c jsonb;metric jsonb;selected integer[];i integer;points bigint:=0;annual bigint:=0;weekly bigint:=0;
 pc boolean:=true;ac boolean:=true;wc boolean:=true;cc boolean:=true;forecast boolean:=false;seenp jsonb:='{}';seenh jsonb:='{}';classes text[]:='{}';k text;amount bigint;
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
     amount:=amount+coalesce((c->'hourValues'->>i)::integer,0);end loop;
    if r->>'schoolform'='introduktionsprogram' then weekly:=weekly+amount;else annual:=annual+amount;end if;
    seenh:=seenh||jsonb_build_object(k,true);
   end if;
  end loop;
 end loop;
 return jsonb_build_object('points',case when q->>'schoolform'='gymnasium' then public.phase5_planning_year_measure(points,pc) end,
  'annualHours',public.phase5_planning_year_measure(annual,ac),'weeklyHours',public.phase5_planning_year_measure(weekly,wc),
  'classCount',public.phase5_planning_year_measure(cardinality(classes),cc),'hasForecast',forecast);
end $$;

create function public.phase5_planning_year_list(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare items jsonb;page_rows jsonb;revision text;result jsonb;
begin
 items:=public.phase5_planning_year_sorted(q,public.phase5_planning_year_rows(q));revision:=public.phase5_planning_year_revision(q,items);
 if q->'selectionRevision'<>'null'::jsonb and q->>'selectionRevision'<>revision then raise exception 'Planning selection changed' using errcode='40001';end if;
 select coalesce(jsonb_agg(r order by n),'[]') into page_rows from jsonb_array_elements(items) with ordinality t(r,n)
  where n>((q->>'page')::integer-1)*50 and n<=(q->>'page')::integer*50;
 result:=jsonb_build_object('selection',q,'selectionRevision',revision,'count',jsonb_array_length(items),'pageSize',50,'rows',page_rows);
 perform public.phase5_planning_year_audit('planning_year_list_read');return result;
end $$;

create function public.phase5_planning_year_overview(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare items jsonb;revision text;result jsonb;
begin
 perform public.phase5_planning_year_validate(q);
 if q->>'page'<>'1' then raise exception 'Invalid overview page' using errcode='22023';end if;
 items:=public.phase5_planning_year_sorted(q,public.phase5_planning_year_rows(q));revision:=public.phase5_planning_year_revision(q,items);
 if q->'selectionRevision'<>'null'::jsonb and q->>'selectionRevision'<>revision then raise exception 'Planning selection changed' using errcode='40001';end if;
 result:=jsonb_build_object('selection',q,'selectionRevision',revision,'count',jsonb_array_length(items),'rows',items,'totals',public.phase5_planning_year_totals(q,items));
 perform public.phase5_planning_year_audit('planning_year_overview_read');return result;
end $$;

revoke all on function public.phase5_planning_year_validate(jsonb),public.phase5_planning_year_gym_cells(jsonb,uuid),
 public.phase5_planning_year_measure(bigint,boolean),public.phase5_planning_year_metrics(jsonb),public.phase5_planning_year_rows(jsonb),
 public.phase5_planning_year_sorted(jsonb,jsonb),public.phase5_planning_year_revision(jsonb,jsonb),public.phase5_planning_year_totals(jsonb,jsonb),
 public.phase5_planning_year_list(jsonb),public.phase5_planning_year_overview(jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;
