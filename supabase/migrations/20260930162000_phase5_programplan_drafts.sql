-- Internal SQL foundation only. No decision command, route, or Worker grant.
alter table public.point_plans
 add column revision integer not null default 0 check (revision>=0),
 add column catalog_id text references public.programplan_catalogs(catalog_id),
 add column basis_reference jsonb,
 add constraint point_plans_catalog_binding check (
  (catalog_id is null and basis_reference is null) or
  (catalog_id is not null and basis_reference is not null and jsonb_typeof(basis_reference)='object'
   and basis_reference->>'catalogId'=catalog_id)
 );
alter table public.point_plan_events
 add column actor_identity_id uuid references public.identities(id),
 add column session_id uuid references public.app_sessions(id),
 add column membership_id uuid references public.memberships(id),
 add column assignment_id uuid references public.access_assignments(id);
-- Old history is retained; new history is written only inside closed commands.
revoke select,insert,update,delete,truncate,references,trigger on public.point_plan_events from public,anon,authenticated,skolplattform_worker;
revoke select,insert,update,delete,truncate,references,trigger on public.point_plans from public,anon,authenticated,skolplattform_worker;

create function public.phase5_programplan_session_check() returns public.app_sessions
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare s public.app_sessions; sid uuid; identity_id uuid; membership_id uuid; assignment_id uuid;
begin
 begin
  sid:=nullif(current_setting('app.session_id',true),'')::uuid;
  identity_id:=public.current_identity_id(); membership_id:=nullif(current_setting('app.membership_id',true),'')::uuid; assignment_id:=public.current_assignment_id();
 exception when invalid_text_representation then raise exception 'Programplan denied' using errcode='42501'; end;
 if sid is null or identity_id is null or membership_id is null or assignment_id is null then raise exception 'Programplan denied' using errcode='42501'; end if;
 -- Always before the customer lock on the first invocation, including postgres fixtures.
 select * into s from public.app_sessions where id=sid for update;
 if not found or s.identity_id is distinct from identity_id or s.membership_id is distinct from membership_id or s.assignment_id is distinct from assignment_id
  or s.revoked_at is not null or s.expires_at<=clock_timestamp() or s.absolute_expires_at<=clock_timestamp()
  or not isfinite(s.expires_at) or not isfinite(s.absolute_expires_at) then raise exception 'Programplan denied' using errcode='42501'; end if;
 return s;
end $$;
create function public.phase5_programplan_actor() returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; corr uuid; node public.access_assignments; cursor_id uuid; seen uuid[]:='{}';
begin
 perform public.phase5_programplan_session_check();
 begin corr:=nullif(current_setting('app.correlation_id',true),'')::uuid;
 exception when invalid_text_representation then raise exception 'Programplan audit unavailable' using errcode='55000'; end;
 if corr is null then raise exception 'Programplan audit unavailable' using errcode='55000'; end if;
 a:=public.phase3_actor();
 -- Refresh after the actual customer-lock wait. GUC role never supplies authority.
 perform public.phase5_programplan_session_check();
 if a.function not in ('huvudman','rektor') then raise exception 'Programplan denied' using errcode='42501'; end if;
 -- Defense in depth for a deliberately broken FK relation: the whole issuing
 -- chain must still link each membership and organizer to its actual customer.
 cursor_id:=a.id;
 loop
  if cursor_id=any(seen) or cardinality(seen)>=64 then raise exception 'Programplan denied' using errcode='42501'; end if;
  seen:=array_append(seen,cursor_id);
  select * into node from public.access_assignments where id=cursor_id;
  if not found or not exists(select 1 from public.memberships m join public.customers c on c.id=m.customer_id join public.identities i on i.id=m.identity_id
   where m.id=node.membership_id and m.customer_id=node.customer_id and m.status='active' and c.closed_at is null)
   or (node.organizer_id is not null and not exists(select 1 from public.organizers g where g.id=node.organizer_id and g.customer_id=node.customer_id))
   or exists(select 1 from public.mandate_units m left join public.school_units u on u.id=m.unit_id
    where m.assignment_id=node.id and (u.id is null or u.organizer_id is distinct from node.organizer_id)) then
   raise exception 'Programplan denied' using errcode='42501'; end if;
  exit when node.parent_assignment_id is null;
  cursor_id:=node.parent_assignment_id;
 end loop;
 return a;
end $$;
create function public.phase5_programplan_scope(plan_id uuid, offering_id uuid default null) returns public.offerings
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; o public.offerings;
begin
 a:=public.phase5_programplan_actor();
 select f.* into o from public.offerings f
 join public.school_units u on u.id=f.unit_id and u.organizer_id=f.organizer_id
 join public.organizers g on g.id=f.organizer_id and g.customer_id=a.customer_id
 join public.mandate_units m on m.assignment_id=a.id and m.unit_id=u.id
 where f.organizer_id=a.organizer_id and f.kind='gymnasium'
  and ((plan_id is not null and exists(select 1 from public.point_plans p where p.id=plan_id and p.offering_id=f.id and p.organizer_id=f.organizer_id))
   or (plan_id is null and f.id=offering_id)) for update of f;
 if not found then raise exception 'Programplan denied' using errcode='42501'; end if;
 a:=public.phase5_programplan_actor();
 if not exists(select 1 from public.offerings f join public.school_units u on u.id=f.unit_id and u.organizer_id=f.organizer_id
  join public.organizers g on g.id=f.organizer_id and g.customer_id=a.customer_id
  join public.mandate_units m on m.assignment_id=a.id and m.unit_id=u.id
  where f.id=o.id and f.organizer_id=a.organizer_id and f.kind='gymnasium'
  and (plan_id is null or exists(select 1 from public.point_plans p where p.id=plan_id and p.offering_id=f.id and p.organizer_id=f.organizer_id))) then
  raise exception 'Programplan denied' using errcode='42501'; end if;
 -- Re-read the locked row after any wait; no stale program/unit metadata.
 select * into o from public.offerings where id=o.id;
 return o;
end $$;
create function public.phase5_programplan_validate_basis(reference jsonb, offering public.offerings, previous_choices text[] default null) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare resolution jsonb; choices text[];
begin
 resolution:=public.phase5_resolve_programplan_basis(reference);
 if resolution->>'status' is distinct from 'resolved' or reference->'programRef'->>'code' is distinct from offering.program_code
  or reference->>'orientationCode' is distinct from offering.orientation_code then raise exception 'Invalid programplan basis' using errcode='22023'; end if;
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(reference->'specializationRefs') with ordinality e(value,n);
 if previous_choices is not null and choices is distinct from previous_choices then raise exception 'Legacy choices mismatch' using errcode='22023'; end if;
end $$;
create function public.phase5_programplan_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.offerings; choices text[];
begin
 if tg_op='UPDATE' and old.catalog_id is not null then
  if new.id is distinct from old.id or new.organizer_id is distinct from old.organizer_id or new.offering_id is distinct from old.offering_id
   or new.version is distinct from old.version or new.catalog_id is distinct from old.catalog_id or new.status is distinct from old.status
   or new.decided_on is distinct from old.decided_on or new.decided_by is distinct from old.decided_by or new.created_by is distinct from old.created_by
   or new.created_at is distinct from old.created_at or new.catalog_fetched is distinct from old.catalog_fetched
   or (new.basis_reference-'specializationRefs') is distinct from (old.basis_reference-'specializationRefs') then
   raise exception 'Programplan version locked' using errcode='42501'; end if;
  if old.status<>'utkast' and (new.basis_reference is distinct from old.basis_reference or new.specialization is distinct from old.specialization or new.revision is distinct from old.revision) then
   raise exception 'Programplan version locked' using errcode='42501'; end if;
  if (new.basis_reference is distinct from old.basis_reference or new.specialization is distinct from old.specialization) and new.revision<>old.revision+1 then
   raise exception 'Programplan revision required' using errcode='40001'; end if;
  if new.revision<old.revision then raise exception 'Programplan revision conflict' using errcode='40001'; end if;
 end if;
 if new.catalog_id is null and new.basis_reference is null then return new; end if;
 if new.catalog_id is null or new.basis_reference is null or new.catalog_id is distinct from new.basis_reference->>'catalogId' then raise exception 'Invalid programplan binding' using errcode='22023'; end if;
 if (tg_op='INSERT' or old.catalog_id is null) and (new.status<>'utkast' or new.decided_on is not null or new.decided_by is not null) then
  raise exception 'Programplan version locked' using errcode='42501'; end if;
 select * into o from public.offerings where id=new.offering_id and organizer_id=new.organizer_id and kind='gymnasium';
 if not found then raise exception 'Programplan denied' using errcode='42501'; end if;
 perform public.phase5_programplan_validate_basis(new.basis_reference,o,case when tg_op='UPDATE' and old.catalog_id is null then old.specialization else null end);
 if tg_op='UPDATE' and old.catalog_id is null and (old.status<>'utkast' or new.revision<>old.revision+1) then raise exception 'Programplan version locked' using errcode='42501'; end if;
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(new.basis_reference->'specializationRefs') with ordinality e(value,n);
 if new.specialization is distinct from choices then raise exception 'Programplan choices mismatch' using errcode='22023'; end if;
 return new;
end $$;
create trigger point_plans_programplan_guard before insert or update on public.point_plans for each row execute function public.phase5_programplan_guard();

create function public.phase5_programplan_event_actor() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions;
begin
 if new.action in ('programplan_basis_bound','programplan_specialization_changed','programplan_draft_created','programplan_draft_cloned') then
  a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check();
  perform public.phase5_programplan_scope(new.point_plan_id);
  new.actor:=null; new.actor_role:=a.function::text::public.app_role;
  new.actor_identity_id:=s.identity_id; new.session_id:=s.id; new.membership_id:=a.membership_id; new.assignment_id:=a.id;
 else
  -- Retain the original auth.users semantics only for original legacy actions.
  if new.actor_identity_id is not null or new.session_id is not null or new.membership_id is not null or new.assignment_id is not null
   or new.action like 'programplan_%' then raise exception 'Invalid programplan history action' using errcode='22023'; end if;
  if public.current_actor_auth_user_id() is null or public.current_app_role() is null then raise exception 'History denied' using errcode='42501'; end if;
  new.actor:=public.current_actor_auth_user_id(); new.actor_role:=public.current_app_role();
 end if;
 return new;
end $$;
drop trigger point_plan_events_actor on public.point_plan_events;
create trigger point_plan_events_actor before insert on public.point_plan_events for each row execute function public.phase5_programplan_event_actor();

create function public.phase5_programplan_result(plan_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'offeringId',p.offering_id,'unitId',o.unit_id,'schoolName',u.name,
  'education',jsonb_build_object('name',o.name,'cohort',o.cohort,'programCode',o.program_code,'orientationCode',o.orientation_code),
  'version',p.version,'revision',p.revision,'status',p.status,'decidedOn',p.decided_on,
  'catalogId',p.catalog_id,'basisReference',p.basis_reference,
  'resolution',(public.phase5_resolve_programplan_basis(p.basis_reference)-'catalogId'-'programRef'))
 from public.point_plans p join public.offerings o on o.id=p.offering_id and o.organizer_id=p.organizer_id
 join public.school_units u on u.id=o.unit_id and u.organizer_id=o.organizer_id where p.id=plan_id
$$;
create function public.phase5_programplan_audit(plan_id uuid, operation text, source_plan_id uuid default null) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; i public.identities; s public.app_sessions; metadata jsonb;
begin
 if operation is null or operation not in ('programplan_read','programplan_basis_bound','programplan_specialization_changed','programplan_draft_created','programplan_draft_cloned')
  or (operation='programplan_draft_cloned') is distinct from (source_plan_id is not null) then raise exception 'Invalid programplan operation' using errcode='22023'; end if;
 a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check();
 perform public.phase5_programplan_scope(plan_id);
 select * into i from public.identities where id=s.identity_id;
 metadata:=case when source_plan_id is null then '{}'::jsonb else jsonb_build_object('sourcePlanId',source_plan_id) end;
 if source_plan_id is not null and not exists(select 1 from public.point_plans p join public.point_plans n on n.offering_id=p.offering_id and n.organizer_id=p.organizer_id where p.id=source_plan_id and n.id=plan_id and p.status in ('faststalld','ersatt')) then raise exception 'Programplan denied' using errcode='42501'; end if;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'programplan',plan_id,'ok',metadata);
 exception when others then raise exception 'Programplan audit unavailable' using errcode='55000'; end;
end $$;
create function public.phase5_read_programplan(plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings; p public.point_plans; result jsonb;
begin
 o:=public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for update;
 perform public.phase5_programplan_scope(p.id);
 result:=public.phase5_programplan_result(p.id);
 perform public.phase5_programplan_audit(p.id,'programplan_read');
 return result;
end $$;
create function public.phase5_bind_programplan_draft(plan_id uuid, expected_revision integer, basis_reference jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings; p public.point_plans; result jsonb;
begin
 o:=public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for update;
 o:=public.phase5_programplan_scope(p.id);
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid programplan revision' using errcode='22023'; end if;
 if p.revision<>expected_revision or p.catalog_id is not null then raise exception 'Programplan revision conflict' using errcode='40001'; end if;
 if p.status<>'utkast' then raise exception 'Programplan version locked' using errcode='42501'; end if;
 perform public.phase5_programplan_validate_basis(basis_reference,o,p.specialization);
 update public.point_plans set catalog_id=phase5_bind_programplan_draft.basis_reference->>'catalogId',basis_reference=phase5_bind_programplan_draft.basis_reference,revision=revision+1 where id=p.id;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,'huvudman','programplan_basis_bound');
 result:=public.phase5_programplan_result(p.id); perform public.phase5_programplan_audit(p.id,'programplan_basis_bound'); return result;
end $$;
create function public.phase5_replace_programplan_specialization(plan_id uuid, expected_revision integer, specialization_refs jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings; p public.point_plans; reference jsonb; choices text[]; result jsonb;
begin
 o:=public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for update;
 o:=public.phase5_programplan_scope(p.id);
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid programplan revision' using errcode='22023'; end if;
 if p.revision<>expected_revision then raise exception 'Programplan revision conflict' using errcode='40001'; end if;
 if p.status<>'utkast' or p.catalog_id is null then raise exception 'Programplan version locked' using errcode='42501'; end if;
 reference:=jsonb_set(p.basis_reference,'{specializationRefs}',coalesce(specialization_refs,'null'::jsonb),false);
 perform public.phase5_programplan_validate_basis(reference,o);
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(specialization_refs) with ordinality e(value,n);
 update public.point_plans set basis_reference=reference,specialization=choices,revision=revision+1 where id=p.id;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,'huvudman','programplan_specialization_changed');
 result:=public.phase5_programplan_result(p.id); perform public.phase5_programplan_audit(p.id,'programplan_specialization_changed'); return result;
end $$;
create function public.phase5_create_programplan_draft(offering_id uuid, expected_latest_version integer, basis_reference jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings; latest integer; created uuid; choices text[]; result jsonb;
begin
 o:=public.phase5_programplan_scope(null,offering_id);
 if expected_latest_version is null or expected_latest_version<0 then raise exception 'Invalid programplan version' using errcode='22023'; end if;
 select coalesce(max(version),0) into latest from public.point_plans where point_plans.offering_id=o.id;
 if latest<>expected_latest_version or exists(select 1 from public.point_plans where point_plans.offering_id=o.id and status='utkast') then raise exception 'Programplan version conflict' using errcode='40001'; end if;
 perform public.phase5_programplan_validate_basis(basis_reference,o);
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(basis_reference->'specializationRefs') with ordinality e(value,n);
 begin
  insert into public.point_plans(organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference)
  values(o.organizer_id,o.id,latest+1,'utkast',choices,basis_reference->>'catalogId',basis_reference) returning id into created;
 exception when unique_violation then raise exception 'Programplan version conflict' using errcode='40001'; end;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(created,'huvudman','programplan_draft_created');
 result:=public.phase5_programplan_result(created); perform public.phase5_programplan_audit(created,'programplan_draft_created'); return result;
end $$;
create function public.phase5_clone_programplan_draft(source_plan_id uuid, expected_source_revision integer, expected_latest_version integer, explicit_legacy_basis jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings; p public.point_plans; latest integer; created uuid; reference jsonb; result jsonb;
begin
 o:=public.phase5_programplan_scope(source_plan_id);
 select * into p from public.point_plans where id=source_plan_id for update;
 o:=public.phase5_programplan_scope(p.id);
 if expected_source_revision is null or expected_source_revision<0 or expected_latest_version is null or expected_latest_version<0 then raise exception 'Invalid programplan version' using errcode='22023'; end if;
 select coalesce(max(version),0) into latest from public.point_plans where offering_id=o.id;
 if p.revision<>expected_source_revision or latest<>expected_latest_version or exists(select 1 from public.point_plans where offering_id=o.id and status='utkast') then raise exception 'Programplan version conflict' using errcode='40001'; end if;
 if p.status not in ('faststalld','ersatt') then raise exception 'Programplan version locked' using errcode='42501'; end if;
 if p.catalog_id is null then
  reference:=explicit_legacy_basis; perform public.phase5_programplan_validate_basis(reference,o,p.specialization);
 else
  if explicit_legacy_basis is not null then raise exception 'Unexpected legacy basis' using errcode='22023'; end if;
  reference:=p.basis_reference; perform public.phase5_programplan_validate_basis(reference,o,p.specialization);
 end if;
 begin
  insert into public.point_plans(organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference)
  values(o.organizer_id,o.id,latest+1,'utkast',p.specialization,reference->>'catalogId',reference) returning id into created;
 exception when unique_violation then raise exception 'Programplan version conflict' using errcode='40001'; end;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(created,'huvudman','programplan_draft_cloned');
 result:=public.phase5_programplan_result(created); perform public.phase5_programplan_audit(created,'programplan_draft_cloned',p.id); return result;
end $$;
revoke all on function public.phase5_programplan_session_check(),public.phase5_programplan_actor(),public.phase5_programplan_scope(uuid,uuid),
 public.phase5_programplan_validate_basis(jsonb,public.offerings,text[]),public.phase5_programplan_guard(),public.phase5_programplan_event_actor(),
 public.phase5_programplan_result(uuid),public.phase5_programplan_audit(uuid,text,uuid),public.phase5_read_programplan(uuid),
 public.phase5_bind_programplan_draft(uuid,integer,jsonb),public.phase5_replace_programplan_specialization(uuid,integer,jsonb),
 public.phase5_create_programplan_draft(uuid,integer,jsonb),public.phase5_clone_programplan_draft(uuid,integer,integer,jsonb)
 from public,anon,authenticated,skolplattform_worker;
