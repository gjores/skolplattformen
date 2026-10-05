-- Förberedande skolvisa gymnasietimutkast. Inga beslut eller garantier införs.
-- Additive nullable fields preserve every original value and timestamp.
alter table public.timplans add column gym_basis jsonb,
 add column source_programplan_id uuid references public.point_plans(id) on delete restrict,
 add constraint timplans_gym_binding check ((gym_basis is null)=(source_programplan_id is null));
alter table public.timplan_cells add column allocated boolean[];
alter table public.timplan_events
 add column actor_identity_id uuid references public.identities(id),
 add column session_id uuid references public.app_sessions(id),
 add column membership_id uuid references public.memberships(id),
 add column assignment_id uuid references public.access_assignments(id);
create table public.gym_timplan_receipts (
 command_id uuid primary key, organizer_id uuid not null references public.organizers(id),
 unit_id uuid not null references public.school_units(id),
 actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),
 timplan_id uuid not null references public.timplans(id) on delete restrict,
 request jsonb not null,reply jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.gym_timplan_receipts enable row level security;
revoke all on public.gym_timplan_receipts from public,anon,authenticated,service_role,skolplattform_worker;

-- Existing legacy table grants stay exactly as they are. New GY rows are only
-- reachable through the closed SECURITY DEFINER RPCs and their required audit.
-- Restrictive policies also guard future ordinary-role grants; no join can hide
-- the parent and accidentally turn an allocation into an allowed legacy row.
create policy timplans_gym_rpc_only on public.timplans as restrictive for all to public
 using(gym_basis is null) with check(gym_basis is null);
create policy timplan_cells_gym_rpc_only on public.timplan_cells as restrictive for all to public
 using(allocated is null) with check(allocated is null);
create policy timplan_events_gym_rpc_only on public.timplan_events as restrictive for all to public
 using(actor_identity_id is null and session_id is null and membership_id is null and assignment_id is null)
 with check(actor_identity_id is null and session_id is null and membership_id is null and assignment_id is null);

-- Keep the legacy ACL exactly. Its old projection cannot expose a new six-term
-- matrix, because it has no allocation mask and treats an empty cell as zero.
create or replace function public.phase5_timplan_scope(plan_id uuid,writing boolean default false)
returns public.timplans language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;p public.timplans;
begin
 a:=public.phase3_actor();
 if a.function not in ('huvudman','rektor') or (writing and a.function<>'rektor') then raise exception 'Planning denied' using errcode='42501';end if;
 select t.* into p from public.timplans t
 join public.offerings o on o.id=t.offering_id and o.organizer_id=t.organizer_id
 join public.school_units s on s.id=t.unit_id and s.organizer_id=o.organizer_id
 join public.organizers g on g.id=t.organizer_id and g.customer_id=a.customer_id
 join public.mandate_units u on u.assignment_id=a.id and u.unit_id=s.id
 where t.id=plan_id and t.organizer_id=a.organizer_id and t.gym_basis is null;
 if not found then raise exception 'Planning denied' using errcode='42501';end if;
 return p;
end $$;

-- A user's own school is enough for its hours, even with a shared programframe.
-- Session -> customer/mandate -> school -> offering -> program -> timplan lock order.
create function public.phase5_gym_timplan_scope(offering_id uuid,target_unit uuid,writing boolean default false)
returns public.offerings language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;o public.offerings;
begin
 a:=public.phase5_programplan_actor();
 if writing and a.function not in ('rektor','administrator') then raise exception 'Gym timplan denied' using errcode='42501';end if;
 perform 1 from public.school_units u join public.organizers g on g.id=u.organizer_id
 join public.mandate_units m on m.unit_id=u.id and m.assignment_id=a.id
 where u.id=target_unit and u.organizer_id=a.organizer_id and g.customer_id=a.customer_id for update of u;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 select f.* into o from public.offerings f join public.offering_units x on x.offering_id=f.id and x.organizer_id=f.organizer_id and x.unit_id=target_unit
 where f.id=phase5_gym_timplan_scope.offering_id and f.organizer_id=a.organizer_id and f.kind='gymnasium' for update of f;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 a:=public.phase5_programplan_actor();
 if not exists(select 1 from public.mandate_units m join public.school_units u on u.id=m.unit_id and u.organizer_id=a.organizer_id
 join public.organizers g on g.id=u.organizer_id and g.customer_id=a.customer_id
 join public.offering_units x on x.unit_id=u.id and x.offering_id=o.id and x.organizer_id=o.organizer_id
 where m.assignment_id=a.id and u.id=target_unit) or (writing and a.function not in ('rektor','administrator')) then
 raise exception 'Gym timplan denied' using errcode='42501';end if;
 select * into o from public.offerings where id=o.id;
 if writing and o.archived_at is not null then raise exception 'Gym timplan archived' using errcode='42501',hint='gym_timplan_archived';end if;
 return o;
end $$;

create function public.phase5_gym_timplan_source(plan_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.point_plans;o public.offerings;rows jsonb:='[]';distribution jsonb:='[]';
begin
 select * into p from public.point_plans where id=plan_id;
 select * into o from public.offerings where id=p.offering_id and organizer_id=p.organizer_id;
 if p.id is null or o.id is null or o.kind<>'gymnasium' then raise exception 'Gym timplan denied' using errcode='42501';end if;
 if p.basis_reference is not null then rows:=public.phase5_programplan_term_rows(p.basis_reference);distribution:=p.term_distribution;end if;
 return jsonb_build_object('planId',p.id,'offeringId',o.id,'version',p.version,'revision',p.revision,'status',p.status,
 'catalogId',p.catalog_id,'basisReference',p.basis_reference,'distribution',distribution,'rows',rows,'educationRevision',o.lifecycle_revision,
 'education',jsonb_build_object('name',o.name,'cohort',o.cohort,'programCode',o.program_code,'orientationCode',o.orientation_code),'archived',o.archived_at is not null);
end $$;

create function public.phase5_gym_timplan_require_source(source jsonb) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare catalog jsonb;program jsonb;r jsonb;d jsonb;sum_points integer;
begin
 if source->>'status' not in ('utkast','faststalld') or source->'archived'<>'false'::jsonb
 or source->'basisReference'='null'::jsonb or not(source->'basisReference' ? 'choiceBlocks') then
 raise exception 'Gym source not ready' using errcode='40001',hint='gym_timplan_source_not_ready';end if;
 perform public.phase5_programplan_validate_terms(source->'basisReference',source->'distribution');
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select value into program from jsonb_array_elements(catalog->'programs')
 where value->>'code'=source->'basisReference'->'programRef'->>'code' and value->'version'=source->'basisReference'->'programRef'->'version';
 if program->>'category' is distinct from 'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION'
 or (select coalesce(sum((value->>'points')::integer),0) from jsonb_array_elements(source->'rows'))<>2500
 or (select coalesce(sum((value->>'points')::integer),0) from jsonb_array_elements(source->'basisReference'->'choiceBlocks') where value->>'kind'='individualChoice')<>200 then
 raise exception 'Gym source not ready' using errcode='40001',hint='gym_timplan_source_not_ready';end if;
 for r in select value from jsonb_array_elements(source->'rows') loop
  select value into d from jsonb_array_elements(source->'distribution') where value->>'rowKey'=r->>'key';
  select coalesce(sum(value::integer),0) into sum_points from jsonb_array_elements_text(d->'points');
  if sum_points<>(r->>'points')::integer then raise exception 'Gym source not ready' using errcode='40001',hint='gym_timplan_source_not_ready';end if;
 end loop;
 -- The Worker independently checks level order and the exact catalog program frame
 -- inside the same outer transaction before commit. It cannot trust client ready.
end $$;

create function public.phase5_gym_timplan_audit(object_id uuid,operation text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if object_id is null or operation not in ('gym_timplan_basis_read','gym_timplan_created','gym_timplan_read','gym_timplan_row_changed') then
 raise exception 'Invalid gym timplan audit' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,
 case when operation='gym_timplan_basis_read' then 'programplan' else 'timplan' end,object_id,'ok','{}'::jsonb);
 exception when others then raise exception 'Gym timplan audit unavailable' using errcode='55000';end;
end $$;

create function public.phase5_gym_timplan_event_actor() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;p public.timplans;
begin
 if new.action in ('gym_timplan_created','gym_timplan_row_changed','gym_timplan_superseded') then
  select * into p from public.timplans where id=new.timplan_id;
  perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,true);
  a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
  new.actor:=null;new.actor_role:=a.function::text::public.app_role;
  new.actor_identity_id:=s.identity_id;new.session_id:=s.id;new.membership_id:=a.membership_id;new.assignment_id:=a.id;
 else
  if exists(select 1 from public.timplans p where p.id=new.timplan_id and p.gym_basis is not null) then
   raise exception 'Gym history requires the guarded command' using errcode='42501';end if;
  if new.actor_identity_id is not null or new.session_id is not null or new.membership_id is not null or new.assignment_id is not null or new.action like 'gym_timplan_%'
  or public.current_actor_auth_user_id() is null or public.current_app_role() is null then raise exception 'History denied' using errcode='42501';end if;
  new.actor:=public.current_actor_auth_user_id();new.actor_role:=public.current_app_role();
 end if;return new;
end $$;
drop trigger timplan_events_actor on public.timplan_events;
create trigger timplan_events_actor before insert on public.timplan_events for each row execute function public.phase5_gym_timplan_event_actor();

create function public.phase5_gym_timplan_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and old.gym_basis is not null then
  if (new.id,new.organizer_id,new.offering_id,new.unit_id,new.version,new.gym_basis,new.source_programplan_id,new.basis,new.catalog_fetched,new.created_at,new.created_by,new.decided_on,new.decided_by)
  is distinct from (old.id,old.organizer_id,old.offering_id,old.unit_id,old.version,old.gym_basis,old.source_programplan_id,old.basis,old.catalog_fetched,old.created_at,old.created_by,old.decided_on,old.decided_by)
  or old.status<>'utkast' or new.status not in ('utkast','ersatt') or new.revision<>old.revision+1 then raise exception 'Gym timplan version locked' using errcode='42501';end if;
 elsif tg_op='UPDATE' and new.gym_basis is not null then
  raise exception 'Gym legacy version locked' using errcode='42501';
 end if;
 if new.gym_basis is not null then
  if not public.phase5_programplan_shape(new.gym_basis,array['planId','offeringId','version','revision','status','catalogId','basisReference','distribution','rows','educationRevision','education','archived'])
   or new.gym_basis->>'planId' is distinct from new.source_programplan_id::text
   or new.gym_basis->>'offeringId' is distinct from new.offering_id::text
   or not exists(select 1 from public.offerings o where o.id=new.offering_id and o.organizer_id=new.organizer_id and o.kind='gymnasium')
   or (tg_op='INSERT' and (new.status<>'utkast' or new.revision<>0 or new.decided_on is not null or new.decided_by is not null)) then
   raise exception 'Invalid gym timplan binding' using errcode='22023';end if;
  perform public.phase5_gym_timplan_require_source(new.gym_basis);
 end if;return new;
end $$;
create trigger timplans_gym_guard before insert or update on public.timplans for each row execute function public.phase5_gym_timplan_guard();

create function public.phase5_gym_timplan_cells_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.timplans;point_terms jsonb;v integer;
begin
 select * into p from public.timplans where id=coalesce(new.timplan_id,old.timplan_id);
 if p.gym_basis is null then
  if tg_op<>'DELETE' and new.allocated is not null then raise exception 'Legacy allocation mask denied' using errcode='22023';end if;
  return coalesce(new,old);
 end if;
 if tg_op='DELETE' then return old;end if;
 if not exists(select 1 from jsonb_array_elements(p.gym_basis->'rows') r where r->>'key'=new.row_id)
 or array_ndims(new.hours) is distinct from 1 or array_lower(new.hours,1) is distinct from 1 or cardinality(new.hours)<>6
 or array_position(new.hours,null) is not null or array_ndims(new.allocated) is distinct from 1 or array_lower(new.allocated,1) is distinct from 1
 or cardinality(new.allocated)<>6 or array_position(new.allocated,null) is not null then raise exception 'Invalid gym timplan row' using errcode='22023';end if;
 select d->'points' into point_terms from jsonb_array_elements(p.gym_basis->'distribution') d where d->>'rowKey'=new.row_id;
 for v in 1..6 loop
 if new.hours[v] not between 0 and 2000 or (not new.allocated[v] and new.hours[v]<>0)
 or ((point_terms->>(v-1))::integer=0 and (new.allocated[v] or new.hours[v]<>0)) then raise exception 'Invalid gym timplan row' using errcode='22023';end if;
 end loop;return new;
end $$;
create trigger timplan_cells_gym_guard before insert or update or delete on public.timplan_cells for each row execute function public.phase5_gym_timplan_cells_guard();

create function public.phase5_gym_timplan_matrix_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.timplans;pid uuid;
begin
 -- Separate PL/pgSQL expressions: NEW has a different row type on the two tables.
 if tg_table_name='timplans' then pid:=coalesce(new.id,old.id);
 else pid:=coalesce(new.timplan_id,old.timplan_id);end if;
 select * into p from public.timplans where id=pid;
 if p.id is not null and p.gym_basis is not null and ((select count(*) from public.timplan_cells c where c.timplan_id=p.id)<>jsonb_array_length(p.gym_basis->'rows')
 or exists(select 1 from jsonb_array_elements(p.gym_basis->'rows') r where not exists(select 1 from public.timplan_cells c where c.timplan_id=p.id and c.row_id=r->>'key'))) then
 raise exception 'Invalid gym timplan matrix' using errcode='22023';end if;return null;
end $$;
create constraint trigger timplans_gym_matrix after insert or update on public.timplans deferrable initially deferred for each row execute function public.phase5_gym_timplan_matrix_guard();
create constraint trigger timplan_cells_gym_matrix after insert or update or delete on public.timplan_cells deferrable initially deferred for each row execute function public.phase5_gym_timplan_matrix_guard();

create function public.phase5_gym_timplan_receipt_guard() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Immutable gym timplan receipt' using errcode='55000';end $$;
create trigger gym_timplan_receipts_immutable before update or delete on public.gym_timplan_receipts for each row execute function public.phase5_gym_timplan_receipt_guard();
create trigger gym_timplan_receipts_no_truncate before truncate on public.gym_timplan_receipts for each statement execute function public.phase5_gym_timplan_receipt_guard();

create function public.phase5_gym_timplan_result(plan_id uuid) returns jsonb
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
 'version',p.version,'revision',p.revision,'status',p.status,'source',p.gym_basis,'catalog',catalog,'currentSource',current_source,'hours',values,
 'canPlan',a.function in ('rektor','administrator') and p.status='utkast' and o.archived_at is null,'archived',o.archived_at is not null);
end $$;

create function public.phase5_gym_timplan_underlag(source_plan_id uuid) returns jsonb
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
 'sourcePlanId',t.source_programplan_id,'sourceRevision',t.gym_basis->'revision','sourceVersion',t.gym_basis->'version') order by t.version desc,t.id)
 from public.timplans t where t.offering_id=o.id and t.unit_id=u.id and t.organizer_id=o.organizer_id),'[]'::jsonb)) order by u.name,u.id),'[]'::jsonb)
 into units from public.offering_units x join public.school_units u on u.id=x.unit_id and u.organizer_id=x.organizer_id
 join public.mandate_units m on m.unit_id=u.id and m.assignment_id=a.id where x.offering_id=o.id and x.organizer_id=o.organizer_id;
 perform public.phase5_gym_timplan_audit(p.id,'gym_timplan_basis_read');return jsonb_build_object('source',source,'catalog',catalog,'units',units);
end $$;

create function public.phase5_read_gym_timplan(plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;result jsonb;
begin
 select * into p from public.timplans where id=plan_id;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,false);
 select * into p from public.timplans where id=plan_id for update;
 perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,false);
 result:=public.phase5_gym_timplan_result(p.id);perform public.phase5_gym_timplan_audit(p.id,'gym_timplan_read');return result;
end $$;

create function public.phase5_create_gym_timplan(command_id uuid,source_plan_id uuid,expected_source_revision integer,expected_education_revision integer,
 unit_id uuid,predecessor_plan_id uuid,expected_predecessor_revision integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;p public.point_plans;o public.offerings;previous public.timplans;receipt public.gym_timplan_receipts;
 source jsonb;request jsonb;reply jsonb;created uuid;latest integer;carried integer:=0;reset integer:=0;r jsonb;old_r jsonb;old_d jsonb;d jsonb;h smallint[];mask boolean[];
begin
 if command_id is null or source_plan_id is null or unit_id is null or expected_source_revision is null or expected_source_revision<0
 or expected_education_revision is null or expected_education_revision<0 or (predecessor_plan_id is null)<>(expected_predecessor_revision is null)
 or expected_predecessor_revision<0 then raise exception 'Invalid gym timplan create' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();select * into p from public.point_plans where id=source_plan_id and organizer_id=a.organizer_id;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 o:=public.phase5_gym_timplan_scope(p.offering_id,unit_id,true);
 request:=jsonb_build_object('commandId',command_id,'sourcePlanId',source_plan_id,'expectedSourceRevision',expected_source_revision,'expectedEducationRevision',expected_education_revision,
 'unitId',unit_id,'predecessorPlanId',predecessor_plan_id,'expectedPredecessorRevision',expected_predecessor_revision);
 select * into receipt from public.gym_timplan_receipts where gym_timplan_receipts.command_id=phase5_create_gym_timplan.command_id for update;
 if found then
  if receipt.actor_identity_id<>public.current_identity_id() or receipt.assignment_id<>a.id or receipt.unit_id<>unit_id or receipt.organizer_id<>a.organizer_id or receipt.request<>request then
  raise exception 'Gym timplan receipt conflict' using errcode='40001';end if;
  select * into previous from public.timplans where id=receipt.timplan_id for update;
  perform public.phase5_gym_timplan_scope(previous.offering_id,previous.unit_id,true);
  reply:=receipt.reply||jsonb_build_object('replayed',true,'revision',previous.revision);
  perform public.phase5_gym_timplan_audit(previous.id,'gym_timplan_created');
  return jsonb_build_object('reply',reply,'plan',public.phase5_gym_timplan_result(previous.id));
 end if;
 select * into p from public.point_plans where id=source_plan_id for update;
 o:=public.phase5_gym_timplan_scope(p.offering_id,unit_id,true);
 if p.revision<>expected_source_revision or o.lifecycle_revision<>expected_education_revision then raise exception 'Gym timplan source conflict' using errcode='40001';end if;
 source:=public.phase5_gym_timplan_source(p.id);perform public.phase5_gym_timplan_require_source(source);
 select coalesce(max(t.version),0) into latest from public.timplans t where t.offering_id=o.id and t.unit_id=phase5_create_gym_timplan.unit_id;
 if predecessor_plan_id is null then
  if exists(select 1 from public.timplans t where t.offering_id=o.id and t.unit_id=phase5_create_gym_timplan.unit_id and t.status in ('utkast','forslag','atersand')) then raise exception 'Gym timplan open version exists' using errcode='40001';end if;
 else
  select * into previous from public.timplans t where t.id=predecessor_plan_id for update;
  if not found or previous.offering_id<>o.id or previous.unit_id<>unit_id or previous.organizer_id<>o.organizer_id or previous.status not in ('utkast','faststalld')
  or previous.revision<>expected_predecessor_revision then raise exception 'Gym timplan predecessor conflict' using errcode='40001';end if;
  perform public.phase5_gym_timplan_scope(previous.offering_id,previous.unit_id,true);
  if previous.status='utkast' then
   update public.timplans set status='ersatt',revision=revision+1 where id=previous.id;
   insert into public.timplan_events(timplan_id,actor_role,action) values(previous.id,'rektor','gym_timplan_superseded');
  elsif exists(select 1 from public.timplans t where t.offering_id=o.id and t.unit_id=phase5_create_gym_timplan.unit_id and t.status in ('utkast','forslag','atersand')) then
   raise exception 'Gym timplan open version exists' using errcode='40001';
  end if;
 end if;
 insert into public.timplans(organizer_id,offering_id,unit_id,version,status,basis,catalog_fetched,gym_basis,source_programplan_id)
 values(o.organizer_id,o.id,unit_id,latest+1,'utkast','Programplan v'||p.version,(select (payload->'source'->>'fetched')::date from public.programplan_catalogs where catalog_id=p.catalog_id),source,p.id) returning id into created;
 for r in select value from jsonb_array_elements(source->'rows') loop
  h:=array[0,0,0,0,0,0]::smallint[];mask:=array[false,false,false,false,false,false];old_r:=null;old_d:=null;
  select value into d from jsonb_array_elements(source->'distribution') where value->>'rowKey'=r->>'key';
  if previous.gym_basis is not null then
   select value into old_r from jsonb_array_elements(previous.gym_basis->'rows') where value->>'key'=r->>'key';
   select value into old_d from jsonb_array_elements(previous.gym_basis->'distribution') where value->>'rowKey'=r->>'key';
  end if;
  if old_r=r and old_d=d then
   select hours,allocated into h,mask from public.timplan_cells where timplan_id=previous.id and row_id=r->>'key';
   if not found then raise exception 'Invalid predecessor matrix' using errcode='22023';end if;carried:=carried+1;
  else reset:=reset+1;end if;
  insert into public.timplan_cells(timplan_id,row_id,hours,allocated) values(created,r->>'key',h,mask);
 end loop;
 insert into public.timplan_events(timplan_id,actor_role,action) values(created,'rektor','gym_timplan_created');
 reply:=jsonb_build_object('id',created,'offeringId',o.id,'unitId',unit_id,'version',latest+1,'revision',0,'sourcePlanId',p.id,'sourceRevision',p.revision,'replayed',false,'carriedRows',carried,'resetRows',reset);
 insert into public.gym_timplan_receipts(command_id,organizer_id,unit_id,actor_identity_id,assignment_id,timplan_id,request,reply)
 values(command_id,o.organizer_id,unit_id,public.current_identity_id(),a.id,created,request,reply);
 perform public.phase5_gym_timplan_audit(created,'gym_timplan_created');return jsonb_build_object('reply',reply,'plan',public.phase5_gym_timplan_result(created));
end $$;

create function public.phase5_write_gym_timplan_row(plan_id uuid,expected_revision integer,row_key text,row_hours jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;r jsonb;v integer;h smallint[]:='{}';mask boolean[]:='{}';points jsonb;
begin
 if expected_revision is null or expected_revision<0 or row_key is null or not public.phase5_programplan_array(row_hours,6) or jsonb_array_length(row_hours)<>6 then
 raise exception 'Invalid gym timplan row' using errcode='22023';end if;
 select * into p from public.timplans where id=plan_id;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,true);
 select * into p from public.timplans where id=plan_id for update;
 perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,true);
 if p.gym_basis is null or p.status<>'utkast' then raise exception 'Gym timplan version locked' using errcode='42501';end if;
 if p.revision<>expected_revision then raise exception 'Gym timplan revision conflict' using errcode='40001';end if;
 select d->'points' into points from jsonb_array_elements(p.gym_basis->'distribution') d where d->>'rowKey'=row_key;
 if points is null then raise exception 'Invalid gym timplan row' using errcode='22023';end if;
 for v in 0..5 loop
  r:=row_hours->v;
  if r<>'null'::jsonb and not public.phase5_programplan_integer(r,0,2000) then raise exception 'Invalid gym timplan hours' using errcode='22023';end if;
  if (points->>v)::integer=0 and r<>'null'::jsonb then raise exception 'Inactive gym timplan term' using errcode='22023';end if;
  h:=array_append(h,case when r='null'::jsonb then 0 else (r#>>'{}')::numeric::smallint end);mask:=array_append(mask,r<>'null'::jsonb);
 end loop;
 update public.timplan_cells set hours=h,allocated=mask where timplan_id=p.id and row_id=row_key;
 if not found then raise exception 'Invalid gym timplan matrix' using errcode='22023';end if;
 update public.timplans set revision=revision+1 where id=p.id;
 insert into public.timplan_events(timplan_id,actor_role,action) values(p.id,'rektor','gym_timplan_row_changed');
 perform public.phase5_gym_timplan_audit(p.id,'gym_timplan_row_changed');return jsonb_build_object('id',p.id,'revision',p.revision+1,'rowKey',row_key,'hours',row_hours);
end $$;

revoke all on function public.phase5_gym_timplan_scope(uuid,uuid,boolean),public.phase5_gym_timplan_source(uuid),public.phase5_gym_timplan_require_source(jsonb),
 public.phase5_gym_timplan_audit(uuid,text),public.phase5_gym_timplan_event_actor(),public.phase5_gym_timplan_guard(),public.phase5_gym_timplan_cells_guard(),
 public.phase5_gym_timplan_matrix_guard(),public.phase5_gym_timplan_receipt_guard(),public.phase5_gym_timplan_result(uuid),
 public.phase5_gym_timplan_underlag(uuid),public.phase5_create_gym_timplan(uuid,uuid,integer,integer,uuid,uuid,integer),public.phase5_read_gym_timplan(uuid),public.phase5_write_gym_timplan_row(uuid,integer,text,jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;
