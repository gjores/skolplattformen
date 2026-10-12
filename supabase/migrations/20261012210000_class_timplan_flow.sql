-- Explicit class/year links. Existing names and plan IDs are never migrated or moved.
alter table public.class_timplans add column class_id uuid references public.school_classes(id) on delete restrict;
alter table public.class_timplans add column revision integer not null default 0 check(revision>=0);
create unique index class_timplans_class_year on public.class_timplans(class_id,start_year) where class_id is not null;
create table public.class_plan_commands (
 command_id uuid primary key, actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),
 request jsonb not null, reply jsonb not null, created_at timestamptz not null default now()
);
alter table public.class_plan_commands enable row level security;
alter table public.class_plan_commands force row level security;
revoke all on public.class_plan_commands from public,anon,authenticated,service_role,skolplattform_worker;
create function public.phase5_class_receipt_guard() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Class command receipt is immutable' using errcode='42501';end $$;
create trigger class_plan_commands_immutable before update or delete on public.class_plan_commands for each row execute function public.phase5_class_receipt_guard();
create trigger class_plan_commands_no_truncate before truncate on public.class_plan_commands for each statement execute function public.phase5_class_receipt_guard();

create function public.phase5_class_start_year(p public.timplans) returns integer
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d date;t text;
begin
 t:=p.gym_basis->'basisReference'->>'startedOn';
 if t is null or t !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null;end if;
 begin d:=t::date;exception when others then return null;end;
 if to_char(d,'YYYY-MM-DD')<>t or extract(year from d) not between 2000 and 2100 then return null;end if;
 return extract(year from d)::integer-case when extract(month from d)<7 then 1 else 0 end;
end $$;
create function public.phase5_class_blockers(p public.timplans,o public.offerings) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare y integer;messages jsonb:='[]';
begin
 y:=public.phase5_class_start_year(p);
 if y is null or y not between 2000 and 2100 then messages:=messages||jsonb_build_array('Timplanen saknar ett giltigt fryst startdatum. Skapa en ny version med verifierat underlag.');
 elsif o.start_year is not null and o.start_year<>y then messages:=messages||jsonb_build_array('Utbildningens kullstart stämmer inte med timplanens frysta underlag. Kontrollera utbildningen innan klassen kopplas.');end if;
 if public.phase5_plan_decision_profile(p.gym_basis) is null then messages:=messages||jsonb_build_array('Timplanen saknar ett stött nationellt Gy25-underlag.');end if;
 if o.archived_at is not null then messages:=messages||jsonb_build_array('Utbildningen är arkiverad.');end if;
 return messages;
end $$;
create function public.phase5_class_scope(plan_id uuid,writing boolean default false) returns public.timplans
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;o public.offerings;
begin
 select * into p from public.timplans where id=plan_id;
 if not found or p.gym_basis is null then raise exception 'Class plan denied' using errcode='42501';end if;
 o:=public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,writing);
 select * into p from public.timplans where id=plan_id for update;
 if writing and (p.status<>'faststalld' or jsonb_array_length(public.phase5_class_blockers(p,o))>0) then raise exception 'Class plan not ready' using errcode='40001',hint='class_plan_not_ready';end if;
 return p;
end $$;
create function public.phase5_class_audit(object_id uuid,operation text,details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if object_id is null or operation not in ('class_plan_read','class_created','class_plan_linked') then raise exception 'Invalid class audit' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,
 case when operation='class_plan_read' then 'timplan' else 'class' end,object_id,'ok',details);
 exception when others then raise exception 'Class audit unavailable' using errcode='55000';end;
end $$;

-- New identified links are protected by real school mandate; legacy links keep
-- their original compatibility path. No approval action writes this table.
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
create policy class_timplans_identified_rpc_only on public.class_timplans as restrictive for all to public using(class_id is null) with check(class_id is null);

create function public.phase5_class_underlag(plan_id uuid,school_year integer) returns jsonb
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
 from public.school_classes c left join public.class_timplans l on l.unit_id=c.unit_id and l.class_name=c.name and l.start_year=school_year and (l.class_id=c.id or l.class_id is null)
 left join public.timplans t on t.id=l.timplan_id
 where c.offering_id=p.offering_id and c.unit_id=p.unit_id and c.customer_id=a.customer_id and c.organizer_id=a.organizer_id;
 select coalesce(jsonb_agg(jsonb_build_object('classId',l.class_id,'className',l.class_name,'classStartYear',c.start_year,'schoolYear',l.start_year,'columnId',l.column_id,'revision',l.revision,'legacy',l.class_id is null) order by l.start_year,l.class_name),'[]') into linked
 from public.class_timplans l left join public.school_classes c on c.id=l.class_id where l.timplan_id=p.id and l.unit_id=p.unit_id;
 perform public.phase5_class_audit(p.id,'class_plan_read');
 return jsonb_build_object('plan',jsonb_build_object('id',p.id,'offeringId',p.offering_id,'unitId',p.unit_id,'schoolName',(select name from public.school_units where id=p.unit_id),
 'educationName',o.name,'cohort',o.cohort,'startYear',y,'version',p.version,'status',p.status,'revision',p.revision),'schoolYear',school_year,
 'canManage',a.function in ('rektor','administrator') and p.status='faststalld' and jsonb_array_length(blockers)=0,'blockers',blockers,'classes',classes,'linkedClasses',linked);
end $$;

create function public.phase5_class_command(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;a public.access_assignments;c public.school_classes;old public.class_timplans;receipt public.class_plan_commands;
 operation text;cmd_id uuid;reply jsonb;y integer;school_year integer;expected integer;previous uuid;target_class uuid;n text;
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
  select * into old from public.class_timplans l where l.unit_id=c.unit_id and l.class_name=c.name and l.start_year=school_year and (l.class_id=c.id or l.class_id is null) for update;
  if found then
   if expected is null or old.revision<>expected or old.timplan_id<>previous or (old.class_id is not null and old.class_id<>c.id) then raise exception 'Class link revision conflict' using errcode='40001';end if;
   if not exists(select 1 from public.timplans prior where prior.id=old.timplan_id and prior.offering_id=c.offering_id and prior.unit_id=c.unit_id) then raise exception 'Legacy class education mismatch' using errcode='40001',hint='class_plan_not_ready';end if;
   update public.class_timplans set class_id=c.id,timplan_id=p.id,column_id=q->>'columnId',revision=old.revision+1
    where unit_id=c.unit_id and class_name=c.name and start_year=school_year;
  else
   if expected is not null then raise exception 'Class link revision conflict' using errcode='40001';end if;
   insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id,class_id) values(c.unit_id,c.name,school_year,p.id,q->>'columnId',c.id);
  end if;
  reply:=jsonb_build_object('classId',c.id,'schoolYear',school_year,'planId',p.id,'columnId',q->>'columnId','revision',coalesce(expected,-1)+1,'replayed',false);
  perform public.phase5_class_audit(c.id,'class_plan_linked',jsonb_build_object('from',previous,'to',p.id,'schoolYear',school_year));
 end if;
 insert into public.class_plan_commands(command_id,actor_identity_id,assignment_id,request,reply) values(cmd_id,public.current_identity_id(),a.id,q,reply);
 return reply;
end $$;
revoke all on function public.phase5_class_receipt_guard(),public.phase5_class_start_year(public.timplans),public.phase5_class_blockers(public.timplans,public.offerings),public.phase5_class_scope(uuid,boolean),public.phase5_class_audit(uuid,text,jsonb),public.phase5_class_underlag(uuid,integer),public.phase5_class_command(jsonb),public.validate_class_timplan() from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.phase5_class_underlag(uuid,integer),public.phase5_class_command(jsonb) to skolplattform_worker;
