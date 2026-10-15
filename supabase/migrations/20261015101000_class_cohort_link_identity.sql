-- CLASS-COHORT-03. Keep the historical name/year primary key and every row.
-- Identified relations use class ID first; names only constrain legacy storage.
create function public.phase5_class_cohort_year_fits(c public.school_classes,school_year integer) returns boolean
language sql immutable set search_path=pg_catalog,public as $$
 select school_year between 2000 and 2100
  and (c.starts_on is null or c.starts_on<=make_date(school_year+1,6,30))
  and (c.ends_on is null or c.ends_on>=make_date(school_year,7,1))
$$;

create function public.phase5_class_legacy_matches(c public.school_classes,l public.class_timplans) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select l.class_id is null and l.unit_id=c.unit_id and l.class_name=c.name
  and exists(select 1 from public.timplans t where t.id=l.timplan_id and t.unit_id=c.unit_id
   and t.organizer_id=c.organizer_id and t.offering_id=c.offering_id and public.phase5_class_start_year(t)=c.start_year)
  and (select count(*) from public.school_classes candidate where candidate.customer_id=c.customer_id
   and candidate.organizer_id=c.organizer_id and candidate.unit_id=c.unit_id
   and candidate.offering_id=c.offering_id and candidate.name=c.name)=1
$$;
revoke all on function public.phase5_class_cohort_year_fits(public.school_classes,integer),
 public.phase5_class_legacy_matches(public.school_classes,public.class_timplans)
 from public,anon,authenticated,service_role,skolplattform_worker;

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
 jsonb_build_object('planId',t.id,'version',t.version,'status',t.status,'columnId',l.column_id,'revision',l.revision,'legacy',l.class_id is null) end) order by c.name,c.start_year,c.id),'[]') into classes
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
 'educationName',o.name,'cohort',o.cohort,'startYear',y,'version',p.version,'status',p.status,'revision',p.revision),'schoolYear',school_year,
 'canManage',a.function in ('rektor','administrator') and p.status='faststalld' and jsonb_array_length(blockers)=0,'blockers',blockers,'classes',classes,'linkedClasses',linked);
end $$;

create or replace function public.validate_class_timplan() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.offerings;p public.timplans;c public.school_classes;y integer;
begin
 if new.class_id is not null then
  p:=public.phase5_class_scope(new.timplan_id,true);
  select * into c from public.school_classes where id=new.class_id;
  y:=public.phase5_class_start_year(p);
  if c.id is null or c.unit_id<>new.unit_id or c.unit_id<>p.unit_id or c.offering_id<>p.offering_id or c.organizer_id<>p.organizer_id
    or c.name<>new.class_name or c.start_year<>y or new.start_year not between y and y+2
    or not public.phase5_class_cohort_year_fits(c,new.start_year)
    or new.column_id<>'ar'||(new.start_year-y+1)::text then raise exception 'Invalid class year' using errcode='22023';end if;
  if tg_op='UPDATE' and (new.unit_id<>old.unit_id or new.class_name<>old.class_name or new.start_year<>old.start_year
    or (old.class_id is not null and new.class_id<>old.class_id) or new.revision<>old.revision+1) then raise exception 'Class revision conflict' using errcode='40001';end if;
  if tg_op='INSERT' and new.revision<>0 then raise exception 'Class revision conflict' using errcode='40001';end if;
 else
  if tg_op='UPDATE' and old.class_id is not null then raise exception 'Identified class link cannot be detached' using errcode='42501';end if;
  select * into p from public.timplans where id=new.timplan_id;
  if not found or p.status<>'faststalld' then raise exception 'Välj en fastställd timplan.';end if;
  select * into o from public.offerings where id=p.offering_id;
  if not found or p.unit_id<>new.unit_id then raise exception 'Timplanen hör till en annan skolenhet.';end if;
  if (o.kind='gymnasium' and new.column_id not in ('ar1','ar2','ar3'))
   or (o.kind='grundskola' and new.column_id not in (select 'ak'||g from unnest(coalesce(o.grades,array[1,2,3,4,5,6,7,8,9]::smallint[])) g))
   or (o.kind='introduktionsprogram' and new.column_id<>'vecka') then raise exception 'Välj en årskurs som finns i timplanen.';end if;
 end if;
 new.updated_at:=now();return new;
end $$;

create or replace function public.phase5_class_command(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;a public.access_assignments;c public.school_classes;old public.class_timplans;receipt public.class_plan_commands;
 operation text;cmd_id uuid;reply jsonb;y integer;school_year integer;expected integer;previous uuid;target_class uuid;n text;conflict_constraint text;identified boolean;
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
   if identified then
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
  reply:=jsonb_build_object('classId',c.id,'schoolYear',school_year,'planId',p.id,'columnId',q->>'columnId','revision',coalesce(expected,-1)+1,'replayed',false);
  perform public.phase5_class_audit(c.id,'class_plan_linked',jsonb_build_object('from',previous,'to',p.id,'schoolYear',school_year));
 end if;
 insert into public.class_plan_commands(command_id,actor_identity_id,assignment_id,request,reply) values(cmd_id,public.current_identity_id(),a.id,q,reply);
 return reply;
end $$;
