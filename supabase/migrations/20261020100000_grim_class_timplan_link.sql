-- 05.1-01 (D-21): GR/IM får skyddad, identifierad klass–timplanskoppling enligt Gy25-mönstret.
-- GR/IM-utbildningar är läsårsramar: klassens och kopplingens läsår är offerings.start_year.
-- Kolumnen väljs uttryckligen: GR ak{n} inom offerings.grades, IM bara vecka. Årskursen lagras på kopplingen.
-- Återanvänder class_timplans och journalen class_plan_commands. Gy25-grenen och namngrenen i
-- validate_class_timplan är ordagrant oförändrade; phase5_class_legacy_matches och phase5_timplan_scope rörs inte.
-- Namnrader från demosidan blir identifierade bara genom rektors uttryckliga kommando.
-- SS 12000: klassen ↔ Group (groupType Klass) med stabilt school_classes.id; kopplingen är intern.

create function public.phase51_grim_uuid(v jsonb) returns uuid
language plpgsql immutable set search_path=pg_catalog,public as $$
begin
 if jsonb_typeof(v) is distinct from 'string' or (v#>>'{}')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
  raise exception 'Invalid GR/IM class ID' using errcode='22023';end if;
 return (v#>>'{}')::uuid;
end $$;

create function public.phase51_grim_class_column(o public.offerings,column_id text) returns boolean
language sql stable set search_path=pg_catalog,public as $$
 select column_id is not null and case o.kind
  when 'grundskola' then column_id in (select 'ak'||g from unnest(coalesce(o.grades,array[1,2,3,4,5,6,7,8,9]::smallint[])) g)
  when 'introduktionsprogram' then column_id='vecka'
  else false end
$$;

create function public.phase51_grim_class_blockers(p public.timplans,o public.offerings) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare messages jsonb:='[]';
begin
 if o.start_year is null or o.start_year not between 2000 and 2100 then
  messages:=messages||jsonb_build_array('Utbildningen saknar ett giltigt läsår. Kontrollera utbildningen innan klasser kopplas.');end if;
 if o.archived_at is not null then messages:=messages||jsonb_build_array('Utbildningen är arkiverad.');end if;
 return messages;
end $$;

-- Speglar phase5_class_scope: läs för huvudman, rektor och administratör med skolan i mandatet,
-- skriv bara för rektor och administratör, och bara på en fastställd plan.
create function public.phase51_grim_class_scope(plan_id uuid,writing boolean default false) returns public.timplans
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;p public.timplans;o public.offerings;
begin
 a:=public.phase5_programplan_actor();
 if writing and a.function not in ('rektor','administrator') then raise exception 'GR/IM class denied' using errcode='42501';end if;
 select * into p from public.timplans where id=plan_id;
 if not found or p.gym_basis is not null or p.organizer_id<>a.organizer_id then raise exception 'GR/IM class denied' using errcode='42501';end if;
 perform 1 from public.school_units u join public.organizers g on g.id=u.organizer_id
 join public.mandate_units m on m.unit_id=u.id and m.assignment_id=a.id
 where u.id=p.unit_id and u.organizer_id=a.organizer_id and g.customer_id=a.customer_id for update of u;
 if not found then raise exception 'GR/IM class denied' using errcode='42501';end if;
 select f.* into o from public.offerings f join public.offering_units x on x.offering_id=f.id and x.organizer_id=f.organizer_id and x.unit_id=p.unit_id
 where f.id=p.offering_id and f.organizer_id=a.organizer_id and f.kind in ('grundskola','introduktionsprogram') for update of f;
 if not found then raise exception 'GR/IM class denied' using errcode='42501';end if;
 a:=public.phase5_programplan_actor();
 if not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=p.unit_id)
  or (writing and a.function not in ('rektor','administrator')) then raise exception 'GR/IM class denied' using errcode='42501';end if;
 select * into p from public.timplans where id=plan_id for update;
 if writing and p.status<>'faststalld' then raise exception 'GR/IM class plan not decided' using errcode='42501',hint='grim_class_plan_not_decided';end if;
 if writing and jsonb_array_length(public.phase51_grim_class_blockers(p,o))>0 then raise exception 'GR/IM class plan not ready' using errcode='40001',hint='class_plan_not_ready';end if;
 return p;
end $$;

create function public.phase51_grim_class_audit(object_id uuid,operation text,details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if object_id is null or operation not in ('grim_class_read','grim_class_created','grim_class_linked') then raise exception 'Invalid GR/IM class audit' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,
 case when operation='grim_class_read' then 'timplan' else 'class' end,object_id,'ok',details);
 exception when others then raise exception 'GR/IM class audit unavailable' using errcode='55000';end;
end $$;

-- En namnrad blir kandidat bara för exakt en klass med samma skola, namn och läsår,
-- och bara om radens timplan är en GR/IM-plan för samma utbildning och skola.
create function public.phase51_grim_legacy_matches(c public.school_classes,l public.class_timplans) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select l.class_id is null and l.unit_id=c.unit_id and l.class_name=c.name and l.start_year=c.start_year
  and exists(select 1 from public.timplans t where t.id=l.timplan_id and t.gym_basis is null and t.unit_id=c.unit_id
   and t.organizer_id=c.organizer_id and t.offering_id=c.offering_id)
  and (select count(*) from public.school_classes candidate where candidate.customer_id=c.customer_id
   and candidate.organizer_id=c.organizer_id and candidate.unit_id=c.unit_id and candidate.name=c.name and candidate.start_year=c.start_year)=1
$$;

create or replace function public.validate_class_timplan() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.offerings;p public.timplans;c public.school_classes;y integer;
begin
 if new.class_id is not null and exists(select 1 from public.timplans t where t.id=new.timplan_id and t.gym_basis is null) then
  -- 05.1 D-21: GR/IM är läsårsramar. Klass, koppling och utbildning har samma läsår; kolumnen väljs uttryckligen.
  p:=public.phase51_grim_class_scope(new.timplan_id,true);
  select * into o from public.offerings where id=p.offering_id;
  select * into c from public.school_classes where id=new.class_id;
  if c.id is null or c.unit_id<>new.unit_id or c.unit_id<>p.unit_id or c.offering_id<>p.offering_id or c.organizer_id<>p.organizer_id
    or ((tg_op='INSERT' or old.class_id is null) and c.name<>new.class_name)
    or o.start_year is null or c.start_year<>o.start_year or new.start_year<>o.start_year
    or not public.phase5_class_cohort_year_fits(c,new.start_year)
    or not public.phase51_grim_class_column(o,new.column_id) then raise exception 'Invalid class year' using errcode='22023';end if;
  if tg_op='UPDATE' and (new.unit_id<>old.unit_id or new.class_name<>old.class_name or new.start_year<>old.start_year
    or (old.class_id is not null and new.class_id<>old.class_id) or new.revision<>old.revision+1) then raise exception 'Class revision conflict' using errcode='40001';end if;
  if tg_op='INSERT' and new.revision<>0 then raise exception 'Class revision conflict' using errcode='40001';end if;
 elsif new.class_id is not null then
  p:=public.phase5_class_scope(new.timplan_id,true);
  select * into c from public.school_classes where id=new.class_id;
  y:=public.phase5_class_start_year(p);
  -- Existing identified rows keep their historical name key. Name matching is
  -- required only when inserting or explicitly adopting a name-only relation.
  if c.id is null or c.unit_id<>new.unit_id or c.unit_id<>p.unit_id or c.offering_id<>p.offering_id or c.organizer_id<>p.organizer_id
    or ((tg_op='INSERT' or old.class_id is null) and c.name<>new.class_name)
    or c.start_year<>y or new.start_year not between y and y+2
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


create function public.phase51_grim_class_underlag(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;o public.offerings;a public.access_assignments;classes jsonb;legacy jsonb;columns jsonb;blockers jsonb;y integer;
begin
 if not public.phase5_programplan_shape(q,array['planId']) then raise exception 'Invalid GR/IM class request' using errcode='22023';end if;
 p:=public.phase51_grim_class_scope(public.phase51_grim_uuid(q->'planId'),false);a:=public.phase5_programplan_actor();
 select * into o from public.offerings where id=p.offering_id;
 if (select count(*) from public.school_classes c where c.offering_id=p.offering_id and c.unit_id=p.unit_id)>2000
  or (select count(*) from public.class_timplans l where l.timplan_id=p.id)>2000 then raise exception 'Class result too large' using errcode='40001',hint='class_plan_limit';end if;
 blockers:=public.phase51_grim_class_blockers(p,o);
 if p.status<>'faststalld' then blockers:=blockers||jsonb_build_array('Timplanen är inte fastställd. Bara en fastställd timplan kan kopplas till klasser.');end if;
 y:=case when o.start_year between 2000 and 2100 then o.start_year end;
 select coalesce(jsonb_agg(jsonb_build_object('id','ak'||g,'label','Åk '||g) order by g),'[]') into columns
 from unnest(case when o.kind='grundskola' then coalesce(o.grades,array[1,2,3,4,5,6,7,8,9]::smallint[]) else array[]::smallint[] end) g;
 if o.kind='introduktionsprogram' then columns:=jsonb_build_array(jsonb_build_object('id','vecka','label','Per vecka'));end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'startYear',c.start_year,
  'link',case when l.timplan_id is null then null else jsonb_build_object('planId',t.id,'series',public.phase5_named_timplan_plan_series(t.id),'version',t.version,'status',t.status,'columnId',l.column_id,'revision',l.revision) end,
  'candidate',case when n.timplan_id is null then null else jsonb_build_object('planId',nt.id,'series',public.phase5_named_timplan_plan_series(nt.id),'version',nt.version,'status',nt.status,'columnId',n.column_id,'revision',n.revision) end)
  order by c.name,c.id),'[]') into classes
 from public.school_classes c
 left join public.class_timplans l on l.class_id=c.id and l.start_year=c.start_year
 left join public.timplans t on t.id=l.timplan_id
 left join public.class_timplans n on l.timplan_id is null and n.class_id is null and n.unit_id=c.unit_id and n.class_name=c.name and n.start_year=c.start_year
  and public.phase51_grim_legacy_matches(c,n)
 left join public.timplans nt on nt.id=n.timplan_id
 where y is not null and c.start_year=y and c.offering_id=p.offering_id and c.unit_id=p.unit_id and c.customer_id=a.customer_id and c.organizer_id=a.organizer_id;
 -- Namnrader för planen utan klass: underlag för att skapa klassen innan den kopplas. Aldrig verifierat behov.
 select coalesce(jsonb_agg(jsonb_build_object('className',l.class_name,'columnId',l.column_id,'revision',l.revision) order by l.class_name),'[]') into legacy
 from public.class_timplans l where y is not null and l.timplan_id=p.id and l.class_id is null and l.unit_id=p.unit_id and l.start_year=y
  and not exists(select 1 from public.school_classes c where c.unit_id=l.unit_id and c.name=l.class_name and c.start_year=l.start_year);
 perform public.phase51_grim_class_audit(p.id,'grim_class_read');
 return jsonb_build_object('plan',jsonb_build_object('id',p.id,'offeringId',p.offering_id,'unitId',p.unit_id,'schoolName',(select name from public.school_units where id=p.unit_id),
  'educationName',o.name,'kind',o.kind,'series',public.phase5_named_timplan_plan_series(p.id),'version',p.version,'status',p.status,'revision',p.revision),
  'schoolYear',y,'columns',columns,'canManage',a.function in ('rektor','administrator') and p.status='faststalld' and jsonb_array_length(blockers)=0,
  'blockers',blockers,'classes',classes,'legacyRows',legacy);
end $$;

create function public.phase51_grim_class_command(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;o public.offerings;a public.access_assignments;c public.school_classes;old public.class_timplans;receipt public.class_plan_commands;
 action text;cmd_id uuid;reply jsonb;y integer;expected integer;previous uuid;n text;col text;identified boolean;conflict_constraint text;
begin
 action:=q->>'action';
 if action='create' then
  if not public.phase5_programplan_shape(q,array['action','commandId','planId','expectedPlanRevision','name']) then raise exception 'Invalid GR/IM class command' using errcode='22023';end if;
 elsif action='link' then
  if not public.phase5_programplan_shape(q,array['action','commandId','classId','planId','expectedPlanRevision','columnId','expectedLinkRevision','previousPlanId']) then raise exception 'Invalid GR/IM class command' using errcode='22023';end if;
 else raise exception 'Invalid GR/IM class command' using errcode='22023';end if;
 cmd_id:=public.phase51_grim_uuid(q->'commandId');
 if jsonb_typeof(q->'expectedPlanRevision') is distinct from 'number' or q->>'expectedPlanRevision'!~'^(0|[1-9][0-9]{0,8})$' then raise exception 'Invalid GR/IM class command' using errcode='22023';end if;
 p:=public.phase51_grim_class_scope(public.phase51_grim_uuid(q->'planId'),false);a:=public.phase5_programplan_actor();
 if a.function not in ('rektor','administrator') then raise exception 'GR/IM class command denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(cmd_id::text,5531));
 select * into receipt from public.class_plan_commands r where r.command_id=cmd_id;
 if found then
  if receipt.actor_identity_id<>public.current_identity_id() or receipt.assignment_id<>a.id or receipt.request<>q then
   raise exception 'GR/IM class receipt conflict' using errcode='40001',hint='grim_class_command_conflict';end if;
  perform public.phase51_grim_class_audit(coalesce(receipt.reply->>'classId',receipt.reply->>'id')::uuid,case action when 'create' then 'grim_class_created' else 'grim_class_linked' end);
  return receipt.reply||jsonb_build_object('replayed',true);
 end if;
 p:=public.phase51_grim_class_scope(p.id,true);select * into o from public.offerings where id=p.offering_id;y:=o.start_year;
 if p.revision<>(q->>'expectedPlanRevision')::integer then raise exception 'GR/IM class plan revision conflict' using errcode='40001',hint='grim_class_plan_revision';end if;
 if action='create' then
  n:=q->>'name';
  if jsonb_typeof(q->'name') is distinct from 'string' or not public.phase5_class_cohort_name(n) or n<>upper(btrim(n)) then raise exception 'Invalid class' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(p.unit_id::text||':'||n||':'||y::text,5532));
  begin
   insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year)
   values(a.customer_id,p.organizer_id,p.unit_id,p.offering_id,n,y) returning * into c;
  exception when unique_violation then raise exception 'Class name and school year occupied' using errcode='22023',hint='grim_class_duplicate';
  end;
  reply:=jsonb_build_object('id',c.id,'name',c.name,'startYear',c.start_year,'replayed',false);
  perform public.phase51_grim_class_audit(c.id,'grim_class_created',jsonb_build_object('planId',p.id,'schoolYear',y));
 else
  col:=q->>'columnId';
  if jsonb_typeof(q->'columnId') is distinct from 'string' or not public.phase51_grim_class_column(o,col)
   or (q->'expectedLinkRevision'='null'::jsonb)<>(q->'previousPlanId'='null'::jsonb)
   or (q->'expectedLinkRevision'<>'null'::jsonb and (jsonb_typeof(q->'expectedLinkRevision') is distinct from 'number' or q->>'expectedLinkRevision'!~'^(0|[1-9][0-9]{0,8})$')) then
   raise exception 'Invalid GR/IM class link' using errcode='22023';end if;
  expected:=case when q->'expectedLinkRevision'='null'::jsonb then null else (q->>'expectedLinkRevision')::integer end;
  previous:=case when q->'previousPlanId'='null'::jsonb then null else public.phase51_grim_uuid(q->'previousPlanId') end;
  select * into c from public.school_classes where id=public.phase51_grim_uuid(q->'classId') and customer_id=a.customer_id and organizer_id=a.organizer_id
   and unit_id=p.unit_id and offering_id=p.offering_id for update;
  if not found then raise exception 'GR/IM class link denied' using errcode='42501';end if;
  if c.start_year<>y then raise exception 'GR/IM class school year mismatch' using errcode='40001',hint='class_plan_not_ready';end if;
  if not public.phase5_class_cohort_year_fits(c,y) then raise exception 'Class validity does not overlap school year' using errcode='40001',hint='class_plan_not_ready';end if;
  perform pg_advisory_xact_lock(hashtextextended(c.unit_id::text||':'||c.name||':'||y::text,5532));
  select * into old from public.class_timplans l where l.class_id=c.id and l.start_year=y for update;
  identified:=found;
  if not identified then
   select * into old from public.class_timplans l where l.unit_id=c.unit_id and l.class_name=c.name and l.start_year=y for update;
   if found and (old.class_id is not null or not public.phase51_grim_legacy_matches(c,old)) then
    raise exception 'Class name and school year occupied' using errcode='40001',hint='class_name_year_conflict';end if;
  end if;
  if old.timplan_id is not null then
   if expected is null or old.revision<>expected or old.timplan_id<>previous then
    raise exception 'GR/IM class link revision conflict' using errcode='40001',hint='grim_class_link_revision';end if;
   if identified then
    update public.class_timplans set timplan_id=p.id,column_id=col,revision=old.revision+1 where class_id=c.id and start_year=y;
   else
    update public.class_timplans set class_id=c.id,timplan_id=p.id,column_id=col,revision=old.revision+1
     where unit_id=old.unit_id and class_name=old.class_name and start_year=old.start_year and class_id is null and timplan_id=previous and revision=expected;
   end if;
  else
   if expected is not null then raise exception 'GR/IM class link revision conflict' using errcode='40001',hint='grim_class_link_revision';end if;
   begin
    insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id,class_id) values(c.unit_id,c.name,y,p.id,col,c.id);
   exception when unique_violation then
    get stacked diagnostics conflict_constraint=constraint_name;
    if conflict_constraint in ('class_timplans_pkey','class_timplans_class_year') then
     raise exception 'Class name and school year occupied' using errcode='40001',hint='class_name_year_conflict';end if;
    raise;
   end;
  end if;
  reply:=jsonb_build_object('classId',c.id,'schoolYear',y,'planId',p.id,'columnId',col,'revision',coalesce(expected,-1)+1,'adopted',old.timplan_id is not null and not identified,'replayed',false);
  perform public.phase51_grim_class_audit(c.id,'grim_class_linked',jsonb_build_object('from',previous,'to',p.id,'schoolYear',y,'columnId',col));
 end if;
 insert into public.class_plan_commands(command_id,actor_identity_id,assignment_id,request,reply) values(cmd_id,public.current_identity_id(),a.id,q,reply);
 return reply;
end $$;

revoke all on function public.phase51_grim_uuid(jsonb),public.phase51_grim_class_column(public.offerings,text),public.phase51_grim_class_blockers(public.timplans,public.offerings),
 public.phase51_grim_class_scope(uuid,boolean),public.phase51_grim_class_audit(uuid,text,jsonb),public.phase51_grim_legacy_matches(public.school_classes,public.class_timplans),
 public.phase51_grim_class_underlag(jsonb),public.phase51_grim_class_command(jsonb),public.validate_class_timplan()
 from public,anon,authenticated,service_role,skolplattform_worker;

