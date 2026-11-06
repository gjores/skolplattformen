-- A gymnasium class is linked once. The link is stored per school year, because service allocation and valplans
-- read it so, but one command now covers the chosen year and the rest of the plan.
create function public.phase5_class_following(c public.school_classes,p public.timplans,from_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare first_year integer:=public.phase5_class_start_year(p);year_value integer;l public.class_timplans;result jsonb:='[]';
begin
 if first_year is null or c.start_year<>first_year or from_year not between first_year and first_year+2 then return result;end if;
 for year_value in from_year+1..first_year+2 loop
  continue when not public.phase5_class_cohort_year_fits(c,year_value);
  select * into l from public.class_timplans x where x.class_id=c.id and x.start_year=year_value;
  if not found then select * into l from public.class_timplans x where x.unit_id=c.unit_id and x.class_name=c.name and x.start_year=year_value;end if;
  result:=result||jsonb_build_object('schoolYear',year_value,
   'status',case when l.timplan_id is null then 'new'
    when l.class_id is distinct from c.id and not public.phase5_class_legacy_matches(c,l) then 'occupied'
    when l.class_id=c.id and l.timplan_id=p.id then 'same' else 'change' end,
   'current',case when l.timplan_id is null or (l.class_id is distinct from c.id and not public.phase5_class_legacy_matches(c,l)) then null
    else (select jsonb_build_object('planId',t.id,'version',t.version,'seriesName',public.phase5_named_timplan_plan_series(t.id)->>'name') from public.timplans t where t.id=l.timplan_id) end);
 end loop;
 return result;
end $$;
revoke all on function public.phase5_class_following(public.school_classes,public.timplans,integer) from public,anon,authenticated,service_role,skolplattform_worker;

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
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'startYear',c.start_year,'following',case when y is null then '[]'::jsonb else public.phase5_class_following(c,p,school_year) end,'link',case when l.timplan_id is null then null else
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

create or replace function public.phase5_class_command(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;a public.access_assignments;c public.school_classes;old public.class_timplans;receipt public.class_plan_commands;
 operation text;cmd_id uuid;reply jsonb;y integer;school_year integer;expected integer;previous uuid;target_class uuid;n text;conflict_constraint text;identified boolean;
 unchanged boolean:=false;item jsonb;year_value integer;year_column text;following_years jsonb:='[]';skipped_years jsonb:='[]';
begin
 operation:=q->>'operation';
 if operation='create' then
  if not public.phase5_programplan_shape(q,array['operation','commandId','planId','expectedPlanRevision','name','startYear']) then raise exception 'Invalid class command' using errcode='22023';end if;
 elsif operation='link' then
  if not public.phase5_programplan_shape(q,array['operation','commandId','classId','schoolYear','planId','expectedPlanRevision','columnId','expectedLinkRevision','previousPlanId']) then raise exception 'Invalid class command' using errcode='22023';end if;
 else raise exception 'Invalid class command' using errcode='22023';end if;
 cmd_id:=(q->>'commandId')::uuid;
 if cmd_id is null or q->>'planId' is null or jsonb_typeof(q->'expectedPlanRevision')<>'number' or q->>'expectedPlanRevision'!~'^[0-9]+$' then raise exception 'Invalid class command' using errcode='22023';end if;
 p:=public.phase5_class_scope((q->>'planId')::uuid,false);a:=public.phase5_programplan_actor();
 if a.function not in ('rektor','administrator') then raise exception 'Class command denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(cmd_id::text,5521));
 select * into receipt from public.class_plan_commands r where r.command_id=cmd_id;
 if found then
  if receipt.actor_identity_id<>public.current_identity_id() or receipt.assignment_id<>a.id or receipt.request<>q then raise exception 'Class receipt conflict' using errcode='40001';end if;
  perform public.phase5_class_audit(coalesce(receipt.reply->>'classId',receipt.reply->>'id')::uuid,case operation when 'create' then 'class_created' else 'class_plan_linked' end);
  return receipt.reply||jsonb_build_object('replayed',true);
 end if;
 p:=public.phase5_class_scope(p.id,true);y:=public.phase5_class_start_year(p);
 if p.revision<>(q->>'expectedPlanRevision')::integer then raise exception 'Class plan revision conflict' using errcode='40001';end if;
 if operation='create' then
  n:=q->>'name';
  if jsonb_typeof(q->'name')<>'string' or n is null or length(n) not between 1 and 60 or n<>upper(btrim(n)) or n~'[[:cntrl:]]'
   or jsonb_typeof(q->'startYear')<>'number' or q->>'startYear'!~'^[0-9]+$' or (q->>'startYear')::integer<>y then raise exception 'Invalid class' using errcode='22023';end if;
  insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year)
  values(a.customer_id,p.organizer_id,p.unit_id,p.offering_id,n,y) returning * into c;
  reply:=jsonb_build_object('id',c.id,'name',c.name,'startYear',c.start_year,'replayed',false);
  perform public.phase5_class_audit(c.id,'class_created');
 else
  target_class:=(q->>'classId')::uuid;school_year:=(q->>'schoolYear')::integer;expected:=(q->>'expectedLinkRevision')::integer;previous:=(q->>'previousPlanId')::uuid;
  if target_class is null or school_year is null or jsonb_typeof(q->'schoolYear')<>'number' or q->>'schoolYear'!~'^[0-9]+$'
   or school_year not between y and y+2 or q->>'columnId' is null or q->>'columnId'<>'ar'||(school_year-y+1)::text
   or (expected is null)<>(previous is null) or expected<0
   or (expected is not null and (jsonb_typeof(q->'expectedLinkRevision')<>'number' or q->>'expectedLinkRevision'!~'^[0-9]+$')) then raise exception 'Invalid class link' using errcode='22023';end if;
  select * into c from public.school_classes where id=target_class and customer_id=a.customer_id and organizer_id=a.organizer_id and unit_id=p.unit_id and offering_id=p.offering_id for update;
  if not found then raise exception 'Class link denied' using errcode='42501';end if;
  if c.start_year<>y then raise exception 'Class cohort mismatch' using errcode='40001',hint='class_plan_not_ready';end if;
  if not public.phase5_class_cohort_year_fits(c,school_year) then
   raise exception 'Class validity does not overlap school year' using errcode='40001',hint='class_plan_not_ready';end if;
  -- Same lock key for competing identified inserts, independent of offering.
  perform pg_advisory_xact_lock(hashtextextended(c.unit_id::text||':'||c.name||':'||school_year::text,5522));
  select * into old from public.class_timplans l where l.class_id=c.id and l.start_year=school_year for update;
  identified:=found;
  if not identified then
   -- Lock the occupied historical key before deciding whether it can be adopted.
   select * into old from public.class_timplans l where l.unit_id=c.unit_id and l.class_name=c.name and l.start_year=school_year for update;
   if found and (old.class_id is not null or not public.phase5_class_legacy_matches(c,old)) then
    raise exception 'Class name and school year occupied' using errcode='40001',hint='class_name_year_conflict';end if;
  end if;
  if old.timplan_id is not null then
   if expected is null or old.revision<>expected or old.timplan_id<>previous then
    raise exception 'Class link revision conflict' using errcode='40001';end if;
   if identified and old.timplan_id=p.id and old.column_id=q->>'columnId' then
    -- Only later years were missing. A new revision would mark service rows stale for nothing.
    unchanged:=true;
   elsif identified then
    update public.class_timplans set timplan_id=p.id,column_id=q->>'columnId',revision=old.revision+1
     where class_id=c.id and start_year=school_year;
   else
    update public.class_timplans set class_id=c.id,timplan_id=p.id,column_id=q->>'columnId',revision=old.revision+1
     where unit_id=old.unit_id and class_name=old.class_name and start_year=old.start_year and class_id is null
      and timplan_id=previous and revision=expected;
   end if;
  else
   if expected is not null then raise exception 'Class link revision conflict' using errcode='40001';end if;
   begin
    insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id,class_id) values(c.unit_id,c.name,school_year,p.id,q->>'columnId',c.id);
   exception when unique_violation then
    get stacked diagnostics conflict_constraint=constraint_name;
    if conflict_constraint in ('class_timplans_pkey','class_timplans_class_year') then
     raise exception 'Class name and school year occupied' using errcode='40001',hint='class_name_year_conflict';end if;
    raise;
   end;
  end if;
  -- A link holds for the rest of the plan: later years follow, earlier years stay. Locks in year order, as above.
  for year_value in school_year+1..y+2 loop
   perform pg_advisory_xact_lock(hashtextextended(c.unit_id::text||':'||c.name||':'||year_value::text,5522));
  end loop;
  for item in select value from jsonb_array_elements(public.phase5_class_following(c,p,school_year)) loop
   year_value:=(item->>'schoolYear')::integer;year_column:='ar'||(year_value-y+1)::text;
   if item->>'status'='occupied' then skipped_years:=skipped_years||to_jsonb(year_value);continue;end if;
   if item->>'status'='change' then
    update public.class_timplans set class_id=c.id,timplan_id=p.id,column_id=year_column,revision=revision+1
     where start_year=year_value and (class_id=c.id or (class_id is null and unit_id=c.unit_id and class_name=c.name));
   elsif item->>'status'='new' then
    insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id,class_id) values(c.unit_id,c.name,year_value,p.id,year_column,c.id);
   end if;
   following_years:=following_years||to_jsonb(year_value);
  end loop;
  reply:=jsonb_build_object('classId',c.id,'schoolYear',school_year,'planId',p.id,'columnId',q->>'columnId','revision',case when unchanged then expected else coalesce(expected,-1)+1 end,
   'followingYears',following_years,'skippedYears',skipped_years,'replayed',false);
  perform public.phase5_class_audit(c.id,'class_plan_linked',jsonb_build_object('from',previous,'to',p.id,'schoolYear',school_year,'followingYears',following_years,'skippedYears',skipped_years));
 end if;
 insert into public.class_plan_commands(command_id,actor_identity_id,assignment_id,request,reply) values(cmd_id,public.current_identity_id(),a.id,q,reply);
 return reply;
end $$;
