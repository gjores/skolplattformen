-- NAMED-TIMPLANS-UX-03. Private commands only; old scope-wide unique indexes
-- remain until the series-aware decision migration. No new Worker grants here.
create table public.named_timplan_commands (
 command_id uuid primary key, operation text not null check(operation in ('create','rename')),
 organizer_id uuid not null references public.organizers(id),unit_id uuid not null references public.school_units(id),
 actor_identity_id uuid not null references public.identities(id),assignment_id uuid not null references public.access_assignments(id),
 plan_id uuid not null references public.timplans(id) on delete restrict,
 series_id uuid not null references public.timplan_series(id) on delete restrict,
 request jsonb not null,reply jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create table public.timplan_series_name_events (
 id uuid primary key default gen_random_uuid(),series_id uuid not null references public.timplan_series(id) on delete restrict,
 command_id uuid not null unique references public.named_timplan_commands(command_id) deferrable initially deferred,
 revision integer not null check(revision>0),old_name text not null,new_name text not null,
 actor_identity_id uuid not null references public.identities(id),session_id uuid not null references public.app_sessions(id),
 membership_id uuid not null references public.memberships(id),assignment_id uuid not null references public.access_assignments(id),
 created_at timestamptz not null default clock_timestamp(),unique(series_id,revision),
 check(public.phase5_timplan_series_name(old_name) and public.phase5_timplan_series_name(new_name))
);
alter table public.named_timplan_commands enable row level security;
alter table public.named_timplan_commands force row level security;
alter table public.timplan_series_name_events enable row level security;
alter table public.timplan_series_name_events force row level security;
revoke all on public.named_timplan_commands,public.timplan_series_name_events from public,anon,authenticated,service_role,skolplattform_worker;
create trigger named_timplan_commands_immutable before update or delete on public.named_timplan_commands
 for each row execute function public.phase5_gym_timplan_receipt_guard();
create trigger named_timplan_commands_no_truncate before truncate on public.named_timplan_commands
 for each statement execute function public.phase5_gym_timplan_receipt_guard();
create trigger timplan_series_name_events_immutable before update or delete on public.timplan_series_name_events
 for each row execute function public.phase5_gym_timplan_receipt_guard();
create trigger timplan_series_name_events_no_truncate before truncate on public.timplan_series_name_events
 for each statement execute function public.phase5_gym_timplan_receipt_guard();

create function public.phase5_named_timplan_series_json(target_series uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',s.id,'name',s.name,'revision',s.revision) from public.timplan_series s where s.id=target_series
$$;

create function public.phase5_named_timplan_audit(target_series uuid,operation text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if target_series is null or operation is null or operation not in ('named_timplan_created','timplan_name_changed') then
  raise exception 'Invalid named timplan audit' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,
   operation,'timplan_series',target_series,'ok','{}');
 exception when others then raise exception 'Named timplan audit unavailable' using errcode='55000';end;
end $$;

-- Called only after source/series/predecessor locks and revision checks. Copy
-- exactly matching rows/term allocations; unknown or changed rows stay empty.
create function public.phase5_named_timplan_copy_rows(target_plan uuid,source_basis jsonb,copy_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare previous public.timplans;r jsonb;d jsonb;old_r jsonb;old_d jsonb;h smallint[];mask boolean[];carried integer:=0;reset integer:=0;
begin
 if copy_plan is not null then select * into previous from public.timplans where id=copy_plan;end if;
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
 return jsonb_build_object('carriedRows',carried,'resetRows',reset);
end $$;

create function public.phase5_named_timplan_uuid(v jsonb) returns uuid
language plpgsql immutable set search_path=pg_catalog as $$
begin
 if jsonb_typeof(v) is distinct from 'string' or (v#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  raise exception 'Invalid named timplan identity' using errcode='22023';end if;
 return (v#>>'{}')::uuid;
end $$;

create function public.phase5_named_timplan_create(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;session public.app_sessions;p public.point_plans;o public.offerings;previous public.timplans;
 receipt public.named_timplan_commands;series public.timplan_series;request_id uuid;source_id uuid;target_unit uuid;copy_id uuid;
 requested_name text;source jsonb;reply jsonb;created uuid;counts jsonb;
begin
 if not public.phase5_programplan_shape(q,array['commandId','sourcePlanId','expectedSourceRevision','expectedEducationRevision','unitId','name','copyFromPlanId','expectedCopyFromRevision'])
  or not public.phase5_programplan_integer(q->'expectedSourceRevision',0,2147483647)
  or not public.phase5_programplan_integer(q->'expectedEducationRevision',0,2147483647)
  or jsonb_typeof(q->'name') is distinct from 'string' or not public.phase5_timplan_series_name(q->>'name')
  or (q->'copyFromPlanId'='null'::jsonb) is distinct from (q->'expectedCopyFromRevision'='null'::jsonb)
  or (q->'expectedCopyFromRevision'<>'null'::jsonb and not public.phase5_programplan_integer(q->'expectedCopyFromRevision',0,2147483647)) then
  raise exception 'Invalid named timplan command' using errcode='22023';end if;
 begin
  request_id:=public.phase5_named_timplan_uuid(q->'commandId');source_id:=public.phase5_named_timplan_uuid(q->'sourcePlanId');target_unit:=public.phase5_named_timplan_uuid(q->'unitId');copy_id:=case when q->'copyFromPlanId'='null'::jsonb then null else public.phase5_named_timplan_uuid(q->'copyFromPlanId') end;
 exception when invalid_text_representation then raise exception 'Invalid named timplan identity' using errcode='22023';end;
 if request_id is null or source_id is null or target_unit is null or jsonb_typeof(q->'commandId')<>'string'
  or jsonb_typeof(q->'sourcePlanId')<>'string' or jsonb_typeof(q->'unitId')<>'string'
  or (copy_id is not null and jsonb_typeof(q->'copyFromPlanId')<>'string') then
  raise exception 'Invalid named timplan identity' using errcode='22023';end if;
 requested_name:=q->>'name';a:=public.phase5_programplan_actor();session:=public.phase5_programplan_session_check();
 select * into p from public.point_plans where id=source_id and organizer_id=a.organizer_id;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 o:=public.phase5_gym_timplan_scope(p.offering_id,target_unit,true);
 select * into p from public.point_plans where id=source_id for update;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5531));
 if exists(select 1 from public.gym_timplan_receipts where command_id=request_id) then
  raise exception 'Named timplan command conflict' using errcode='40001',hint='named_timplan_conflict';end if;
 select * into receipt from public.named_timplan_commands where command_id=request_id;
 if found then
  if receipt.operation<>'create' or receipt.organizer_id<>a.organizer_id or receipt.unit_id<>target_unit
   or receipt.actor_identity_id<>session.identity_id or receipt.assignment_id<>a.id or receipt.request is distinct from q then
   raise exception 'Named timplan command conflict' using errcode='40001',hint='named_timplan_conflict';end if;
  perform public.phase5_gym_timplan_scope(o.id,target_unit,true);
  perform public.phase5_named_timplan_audit(receipt.series_id,'named_timplan_created');
  return jsonb_build_object('reply',receipt.reply||jsonb_build_object('replayed',true),'plan',public.phase5_gym_timplan_result(receipt.plan_id));
 end if;
 if p.revision<>(q->>'expectedSourceRevision')::integer or o.lifecycle_revision<>(q->>'expectedEducationRevision')::integer then
  raise exception 'Gym timplan source conflict' using errcode='40001',hint='named_timplan_conflict';end if;
 source:=public.phase5_gym_timplan_source(p.id);perform public.phase5_gym_timplan_require_source(source);
 -- The school/offering locks serialize names across newly-created series.
 if exists(select 1 from public.timplan_series s where s.offering_id=o.id and s.unit_id=target_unit and s.normalized_name=lower(requested_name)) then
  raise exception 'Named timplan name exists' using errcode='40001',hint='timplan_name_conflict';end if;
 if copy_id is not null then
  select * into previous from public.timplans where id=copy_id;
  if not found or previous.organizer_id<>o.organizer_id or previous.offering_id<>o.id or previous.unit_id<>target_unit or previous.gym_basis is null then
   raise exception 'Gym timplan copy denied' using errcode='42501';end if;
  perform 1 from public.timplan_series where id=previous.series_id for update;
  select * into previous from public.timplans where id=copy_id for update;
  if previous.revision<>(q->>'expectedCopyFromRevision')::integer then
   raise exception 'Gym timplan copy conflict' using errcode='40001',hint='named_timplan_conflict';end if;
 end if;
 insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name)
 values(o.organizer_id,o.id,target_unit,requested_name,lower(requested_name)) returning * into series;
 insert into public.timplans(organizer_id,offering_id,unit_id,series_id,version,status,basis,catalog_fetched,gym_basis,source_programplan_id)
 values(o.organizer_id,o.id,target_unit,series.id,1,'utkast','Programplan v'||p.version,
  (select (payload->'source'->>'fetched')::date from public.programplan_catalogs where catalog_id=p.catalog_id),source,p.id) returning id into created;
 counts:=public.phase5_named_timplan_copy_rows(created,source,copy_id);
 insert into public.timplan_events(timplan_id,actor_role,action) values(created,'rektor','gym_timplan_created');
 reply:=jsonb_build_object('id',created,'offeringId',o.id,'unitId',target_unit,'version',1,'revision',0,'sourcePlanId',p.id,'sourceRevision',p.revision,
  'replayed',false,'series',public.phase5_named_timplan_series_json(series.id))||counts;
 insert into public.named_timplan_commands(command_id,operation,organizer_id,unit_id,actor_identity_id,assignment_id,plan_id,series_id,request,reply)
 values(request_id,'create',o.organizer_id,target_unit,session.identity_id,a.id,created,series.id,q,reply);
 perform public.phase5_named_timplan_audit(series.id,'named_timplan_created');
 return jsonb_build_object('reply',reply,'plan',public.phase5_gym_timplan_result(created));
end $$;

create function public.phase5_named_timplan_rename(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;session public.app_sessions;p public.timplans;o public.offerings;series public.timplan_series;
 receipt public.named_timplan_commands;request_id uuid;target_plan uuid;target_series uuid;requested_name text;reply jsonb;
begin
 if not public.phase5_programplan_shape(q,array['commandId','planId','seriesId','expectedSeriesRevision','name'])
  or not public.phase5_programplan_integer(q->'expectedSeriesRevision',0,2147483646)
  or jsonb_typeof(q->'name') is distinct from 'string' or not public.phase5_timplan_series_name(q->>'name') then
  raise exception 'Invalid timplan rename' using errcode='22023';end if;
 begin request_id:=public.phase5_named_timplan_uuid(q->'commandId');target_plan:=public.phase5_named_timplan_uuid(q->'planId');target_series:=public.phase5_named_timplan_uuid(q->'seriesId');
 exception when invalid_text_representation then raise exception 'Invalid timplan identity' using errcode='22023';end;
 if request_id is null or target_plan is null or target_series is null or jsonb_typeof(q->'commandId')<>'string'
  or jsonb_typeof(q->'planId')<>'string' or jsonb_typeof(q->'seriesId')<>'string' then
  raise exception 'Invalid timplan identity' using errcode='22023';end if;
 requested_name:=q->>'name';a:=public.phase5_programplan_actor();session:=public.phase5_programplan_session_check();
 select * into p from public.timplans where id=target_plan and organizer_id=a.organizer_id;
 if not found or p.gym_basis is null then raise exception 'Gym timplan denied' using errcode='42501';end if;
 o:=public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,true);
 select * into series from public.timplan_series where id=target_series for update;
 if not found or series.id<>p.series_id or (series.organizer_id,series.offering_id,series.unit_id) is distinct from (p.organizer_id,p.offering_id,p.unit_id) then
  raise exception 'Gym timplan denied' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5531));
 if exists(select 1 from public.gym_timplan_receipts where command_id=request_id) then
  raise exception 'Named timplan command conflict' using errcode='40001',hint='named_timplan_conflict';end if;
 select * into receipt from public.named_timplan_commands where command_id=request_id;
 if found then
  if receipt.operation<>'rename' or receipt.organizer_id<>a.organizer_id or receipt.unit_id<>p.unit_id
   or receipt.actor_identity_id<>session.identity_id or receipt.assignment_id<>a.id or receipt.request is distinct from q then
   raise exception 'Named timplan command conflict' using errcode='40001',hint='named_timplan_conflict';end if;
  perform public.phase5_named_timplan_audit(series.id,'timplan_name_changed');return receipt.reply||jsonb_build_object('replayed',true);
 end if;
 if series.revision<>(q->>'expectedSeriesRevision')::integer then
  raise exception 'Named timplan revision conflict' using errcode='40001',hint='named_timplan_conflict';end if;
 if exists(select 1 from public.timplan_series s where s.offering_id=o.id and s.unit_id=p.unit_id and s.id<>series.id and s.normalized_name=lower(requested_name)) then
  raise exception 'Named timplan name exists' using errcode='40001',hint='timplan_name_conflict';end if;
 update public.timplan_series set name=requested_name,normalized_name=lower(requested_name),revision=revision+1 where id=series.id;
 insert into public.timplan_series_name_events(series_id,command_id,revision,old_name,new_name,actor_identity_id,session_id,membership_id,assignment_id)
 values(series.id,request_id,series.revision+1,series.name,requested_name,session.identity_id,session.id,a.membership_id,a.id);
 reply:=jsonb_build_object('planId',p.id,'series',public.phase5_named_timplan_series_json(series.id),'replayed',false);
 insert into public.named_timplan_commands(command_id,operation,organizer_id,unit_id,actor_identity_id,assignment_id,plan_id,series_id,request,reply)
 values(request_id,'rename',o.organizer_id,p.unit_id,session.identity_id,a.id,p.id,series.id,q,reply);
 perform public.phase5_named_timplan_audit(series.id,'timplan_name_changed');return reply;
end $$;

-- Preserve the existing endpoint and immutable old receipt shape. On replay its
-- historical behavior still reports the current plan revision, never new name
-- fields. The separate current plan projection carries metadata after plan05.
create or replace function public.phase5_create_gym_timplan(command_id uuid,source_plan_id uuid,expected_source_revision integer,expected_education_revision integer,
 unit_id uuid,predecessor_plan_id uuid,expected_predecessor_revision integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;p public.point_plans;o public.offerings;previous public.timplans;receipt public.gym_timplan_receipts;
 source jsonb;request jsonb;reply jsonb;created uuid;latest integer;target_series uuid;counts jsonb;series_count integer;
begin
 if command_id is null or source_plan_id is null or unit_id is null or expected_source_revision is null or expected_source_revision<0
 or expected_education_revision is null or expected_education_revision<0 or (predecessor_plan_id is null)<>(expected_predecessor_revision is null)
 or expected_predecessor_revision<0 then raise exception 'Invalid gym timplan create' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();select * into p from public.point_plans where id=source_plan_id and organizer_id=a.organizer_id;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 o:=public.phase5_gym_timplan_scope(p.offering_id,unit_id,true);
 request:=jsonb_build_object('commandId',command_id,'sourcePlanId',source_plan_id,'expectedSourceRevision',expected_source_revision,'expectedEducationRevision',expected_education_revision,
 'unitId',unit_id,'predecessorPlanId',predecessor_plan_id,'expectedPredecessorRevision',expected_predecessor_revision);
 perform pg_advisory_xact_lock(hashtextextended(command_id::text,5531));
 if exists(select 1 from public.named_timplan_commands c where c.command_id=phase5_create_gym_timplan.command_id) then
  raise exception 'Gym timplan receipt conflict' using errcode='40001';end if;
 select * into receipt from public.gym_timplan_receipts where gym_timplan_receipts.command_id=phase5_create_gym_timplan.command_id for update;
 if found then
  if receipt.actor_identity_id<>public.current_identity_id() or receipt.assignment_id<>a.id or receipt.unit_id<>unit_id or receipt.organizer_id<>a.organizer_id or receipt.request<>request then
   raise exception 'Gym timplan receipt conflict' using errcode='40001';end if;
  select * into previous from public.timplans where id=receipt.timplan_id;
  perform public.phase5_gym_timplan_scope(previous.offering_id,previous.unit_id,true);
  perform 1 from public.timplan_series where id=previous.series_id for update;
  select * into previous from public.timplans where id=receipt.timplan_id for update;
  reply:=receipt.reply||jsonb_build_object('replayed',true,'revision',previous.revision);
  perform public.phase5_gym_timplan_audit(previous.id,'gym_timplan_created');
  return jsonb_build_object('reply',reply,'plan',public.phase5_gym_timplan_result(previous.id));
 end if;
 select * into p from public.point_plans where id=source_plan_id for update;
 o:=public.phase5_gym_timplan_scope(p.offering_id,unit_id,true);
 if p.revision<>expected_source_revision or o.lifecycle_revision<>expected_education_revision then raise exception 'Gym timplan source conflict' using errcode='40001';end if;
 source:=public.phase5_gym_timplan_source(p.id);perform public.phase5_gym_timplan_require_source(source);
 if predecessor_plan_id is null then
  select count(*)::integer into series_count from public.timplan_series s where s.offering_id=o.id and s.unit_id=phase5_create_gym_timplan.unit_id;
  select s.id into target_series from public.timplan_series s where s.offering_id=o.id and s.unit_id=phase5_create_gym_timplan.unit_id and s.legacy_default for update;
  if series_count>1 or (series_count=1 and target_series is null) then
   raise exception 'Choose the named timplan explicitly' using errcode='40001',hint='named_timplan_choice_required';end if;
  if exists(select 1 from public.timplans t where t.series_id=target_series and t.status in ('utkast','forslag','atersand')) then
   raise exception 'Gym timplan open version exists' using errcode='40001';end if;
 else
  select * into previous from public.timplans t where t.id=predecessor_plan_id;
  if not found or previous.offering_id<>o.id or previous.unit_id<>unit_id or previous.organizer_id<>o.organizer_id then
   raise exception 'Gym timplan predecessor conflict' using errcode='40001';end if;
  target_series:=previous.series_id;
  perform 1 from public.timplan_series where id=target_series for update;
  select * into previous from public.timplans t where t.id=predecessor_plan_id for update;
  if previous.status not in ('utkast','atersand','faststalld') or previous.revision<>expected_predecessor_revision then
   raise exception 'Gym timplan predecessor conflict' using errcode='40001';end if;
  perform public.phase5_gym_timplan_scope(previous.offering_id,previous.unit_id,true);
  if previous.status in ('utkast','atersand') then
   update public.timplans set status='ersatt',revision=revision+1 where id=previous.id;
   insert into public.timplan_events(timplan_id,actor_role,action) values(previous.id,'rektor','gym_timplan_superseded');
  elsif exists(select 1 from public.timplans t where t.series_id=target_series and t.status in ('utkast','forslag','atersand')) then
   raise exception 'Gym timplan open version exists' using errcode='40001';
  end if;
 end if;
 select coalesce(max(t.version),0) into latest from public.timplans t where t.series_id=target_series;
 insert into public.timplans(organizer_id,offering_id,unit_id,series_id,version,status,basis,catalog_fetched,gym_basis,source_programplan_id)
 values(o.organizer_id,o.id,unit_id,target_series,latest+1,'utkast','Programplan v'||p.version,
  (select (payload->'source'->>'fetched')::date from public.programplan_catalogs where catalog_id=p.catalog_id),source,p.id) returning id into created;
 counts:=public.phase5_named_timplan_copy_rows(created,source,predecessor_plan_id);
 insert into public.timplan_events(timplan_id,actor_role,action) values(created,'rektor','gym_timplan_created');
 reply:=jsonb_build_object('id',created,'offeringId',o.id,'unitId',unit_id,'version',latest+1,'revision',0,'sourcePlanId',p.id,'sourceRevision',p.revision,'replayed',false)||counts;
 insert into public.gym_timplan_receipts(command_id,organizer_id,unit_id,actor_identity_id,assignment_id,timplan_id,request,reply)
 values(command_id,o.organizer_id,unit_id,public.current_identity_id(),a.id,created,request,reply);
 perform public.phase5_gym_timplan_audit(created,'gym_timplan_created');
 return jsonb_build_object('reply',reply,'plan',public.phase5_gym_timplan_result(created));
end $$;

revoke all on function public.phase5_named_timplan_series_json(uuid),public.phase5_named_timplan_audit(uuid,text),
 public.phase5_named_timplan_uuid(jsonb),public.phase5_named_timplan_copy_rows(uuid,jsonb,uuid),public.phase5_named_timplan_create(jsonb),public.phase5_named_timplan_rename(jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;

-- Existing quarantined signature and ACL are preserved.
-- New cohorts are independent drafts. Copy the complete bundle atomically.
create or replace function public.copy_offering_cohort(source_id uuid, target_year integer)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  src public.offerings; pp public.point_plans; tp public.timplans;
  new_id uuid; new_pp uuid; new_tp uuid; target_cohort text;
begin
  if public.current_app_role() is distinct from 'huvudman' then
    raise exception 'Bara huvudmannen kopierar utbildningar.';
  end if;
  if target_year is null or target_year < 2000 or target_year > 2100 then raise exception 'Ange ett giltigt startår.'; end if;
  select * into src from public.offerings where id = source_id and organizer_id = public.current_organizer_id() for update;
  if not found then raise exception 'Utbildningen finns inte.'; end if;
  -- This quarantined legacy copy cannot silently choose one of parallel plans.
  -- The protected programframe copy keeps its established explicit scope.
  if (select count(distinct series_id) from public.timplans where offering_id=source_id)>1 then
    raise exception 'Choose a named timplan before copying' using errcode='40001',hint='named_timplan_choice_required';
  end if;
  if target_year <= coalesce(substring(src.cohort from '(20[0-9]{2})')::integer, 1999) then
    raise exception 'Den nya kullen ska börja efter den ursprungliga.';
  end if;
  target_cohort := case when src.kind = 'gymnasium' then 'Elever som börjar HT ' || target_year
    else 'Läsåret ' || target_year || '/' || right((target_year + 1)::text, 2) end;
  perform pg_advisory_xact_lock(hashtextextended(src.unit_id::text || src.name || target_cohort, 0));
  if exists(select 1 from public.offerings where unit_id = src.unit_id and name = src.name and kind = src.kind and cohort = target_cohort) then
    raise exception 'Utbildningen finns redan för den kullen.';
  end if;
  insert into public.offerings(organizer_id, unit_id, kind, name, local_code, program_code, orientation_code, grades, cohort, status, catalog_fetched, created_by)
    values(src.organizer_id, src.unit_id, src.kind, src.name, src.local_code, src.program_code, src.orientation_code, src.grades, target_cohort, 'planerad', src.catalog_fetched, auth.uid()) returning id into new_id;
  select * into pp from public.point_plans where offering_id = source_id and status <> 'ersatt' order by version desc limit 1;
  if found then
    insert into public.point_plans(organizer_id, offering_id, version, specialization, catalog_fetched, created_by)
      values(src.organizer_id, new_id, 1, pp.specialization, pp.catalog_fetched, auth.uid()) returning id into new_pp;
    insert into public.point_plan_events(point_plan_id, actor, actor_role, action, comment)
      values(new_pp, auth.uid(), 'huvudman', 'Kopierad till ny kull', 'Utgår från ' || src.cohort || ', poängplan v' || pp.version || '. Nytt beslut behövs.');
  end if;
  select * into tp from public.timplans where offering_id = source_id and status <> 'ersatt' order by version desc limit 1;
  if found then
    insert into public.timplans(organizer_id, offering_id, version, basis, catalog_fetched, created_by)
      values(src.organizer_id, new_id, 1, case when new_pp is not null then 'Poängplan v1' else tp.basis end, tp.catalog_fetched, auth.uid()) returning id into new_tp;
    insert into public.timplan_cells(timplan_id, row_id, hours) select new_tp, row_id, hours from public.timplan_cells where timplan_id = tp.id;
    insert into public.timplan_events(timplan_id, actor, actor_role, action, comment)
      values(new_tp, auth.uid(), 'huvudman', 'Kopierad till ny kull', 'Utgår från ' || src.cohort || ', timplan v' || tp.version || '. Nytt beslut behövs.');
  end if;
  insert into public.organisation_events(organizer_id, actor, actor_role, action, comment)
    values(src.organizer_id, auth.uid(), 'huvudman', 'Utbildning kopierad', src.name || ': ' || src.cohort || ' → ' || target_cohort);
  return new_id;
end $$;
