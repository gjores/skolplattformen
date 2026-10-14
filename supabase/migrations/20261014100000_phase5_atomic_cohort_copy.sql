-- Atomic later-cohort copy. Closed foundation; activation is separately reviewed.
-- The established creation receipt is an immutable revision-0 snapshot. Terms
-- and schools finish in this transaction before it becomes externally visible.
create function public.phase5_programplan_copy_audit(operation text, object_id uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
 if operation is null or operation not in ('programplan_education_copied','programplan_copy_status_read') or object_id is null then
  raise exception 'Invalid copy audit' using errcode='22023'; end if;
 a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Copy denied' using errcode='42501'; end if;
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,
   operation,case when operation='programplan_copy_status_read' then 'education_command' else 'education' end,object_id,'ok','{}');
 exception when others then raise exception 'Copy audit unavailable' using errcode='55000'; end;
end $$;

create function public.phase5_copy_programplan_education(command_id uuid, source_plan_id uuid, expected_source_revision integer,
 expected_education_revision integer, unit_id uuid, name text, local_code text, cohort text, basis_reference jsonb, status_only boolean) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; o public.offerings; p public.point_plans;
 r public.programplan_education_receipts; full_request jsonb; result jsonb; reference jsonb; distribution jsonb;
 units uuid[]; school_id uuid; created_id uuid; offering_id uuid; started date; source_start date;
begin
 -- Session/customer locks and live authority precede any receipt inspection.
 a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Copy denied' using errcode='42501',hint='programplan_mandate'; end if;
 if command_id is null or source_plan_id is null or unit_id is null or status_only is null
  or expected_source_revision is null or expected_source_revision<0 or expected_education_revision is null or expected_education_revision<0
  or name is null or char_length(name)>120 or char_length(btrim(name))=0 or cohort is null or char_length(cohort)>120 or char_length(btrim(cohort))=0
  or (local_code is not null and (char_length(local_code)>80 or char_length(btrim(local_code))=0)) then
  raise exception 'Invalid copy command' using errcode='22023'; end if;
 perform public.phase5_programplan_require_current_shape(basis_reference);
 -- Resolve/validate the whole request, including in status/replay. Never use
 -- the request alone as authority for the new copy's contents.
 if public.phase5_resolve_programplan_basis(basis_reference)->>'status' is distinct from 'resolved' then
  raise exception 'Invalid copy basis' using errcode='22023'; end if;
 full_request:=jsonb_build_object('commandId',command_id,'sourcePlanId',source_plan_id,'expectedSourceRevision',expected_source_revision,
  'expectedEducationRevision',expected_education_revision,'unitId',unit_id,'name',btrim(name),
  'localCode',case when local_code is null then null else btrim(local_code) end,'cohort',btrim(cohort),'basisReference',basis_reference);
 -- Lock authorized source and target schools in a single order before the
 -- offering/plan locks taken by the existing scope helper.
 perform 1 from public.school_units u where u.organizer_id=a.organizer_id and
  (u.id=unit_id or exists(select 1 from public.offering_units ou join public.point_plans pp on pp.offering_id=ou.offering_id
    where pp.id=source_plan_id and pp.organizer_id=a.organizer_id and ou.unit_id=u.id)) order by u.id for update;
 o:=public.phase5_programplan_scope(source_plan_id);
 select * into p from public.point_plans pp where pp.id=source_plan_id for update;
 o:=public.phase5_programplan_scope(source_plan_id);
 if unit_id<>o.unit_id then raise exception 'Copy school differs' using errcode='22023'; end if;
 select array_agg(ou.unit_id order by ou.unit_id) into units from public.offering_units ou where ou.offering_id=o.id and ou.organizer_id=o.organizer_id;
 if units is null or cardinality(units)>100 then raise exception 'Invalid copy schools' using errcode='22023'; end if;
 foreach school_id in array units loop perform public.phase5_programplan_unit(school_id,true); end loop;
 perform pg_advisory_xact_lock(hashtextextended(command_id::text,515));
 select * into r from public.programplan_education_receipts c where c.command_id=phase5_copy_programplan_education.command_id;
 if found then
  if r.identity_id<>s.identity_id or r.customer_id<>a.customer_id or r.organizer_id<>a.organizer_id or r.unit_id<>unit_id
   or r.request is distinct from full_request then raise exception 'Copy command conflict' using errcode='40001'; end if;
  -- A cached receipt does not waive today's source or destination mandate.
  -- Do not recheck CAS/start/archive: the completed source may have changed.
  perform public.phase5_programplan_scope(r.plan_id);
  if exists(select 1 from public.offering_units ou where ou.offering_id=r.offering_id
   and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) then
   raise exception 'Copy denied' using errcode='42501'; end if;
  perform public.phase5_programplan_copy_audit(case when status_only then 'programplan_copy_status_read' else 'programplan_education_copied' end,
   case when status_only then command_id else r.offering_id end);
  if status_only then return (r.initial_result-'replayed')||jsonb_build_object('status','created'); end if;
  return r.initial_result||jsonb_build_object('replayed',true);
 end if;
 if status_only then
  perform public.phase5_programplan_copy_audit('programplan_copy_status_read',command_id);
  return jsonb_build_object('commandId',command_id,'status','not_found');
 end if;
 if o.archived_at is not null then raise exception 'Programplan archived' using errcode='42501',hint='programplan_archived'; end if;
 if p.revision<>expected_source_revision or o.lifecycle_revision<>expected_education_revision then
  raise exception 'Copy source revision conflict' using errcode='40001'; end if;
 if p.catalog_id is null or p.basis_reference is null then raise exception 'Bound copy source required' using errcode='22023'; end if;
 reference:=public.phase5_programplan_upgrade_shape(p.basis_reference);
 distribution:=public.phase5_programplan_upgrade_terms(p.basis_reference,p.term_distribution);
 if basis_reference->>'startedOn' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid copy start' using errcode='22023'; end if;
 begin started:=(basis_reference->>'startedOn')::date; source_start:=(p.basis_reference->>'startedOn')::date;
 exception when others then raise exception 'Invalid copy start' using errcode='22023'; end;
 if started is null or source_start is null or started<=source_start or started<=public.phase5_programplan_today() then
  raise exception 'Invalid later cohort start' using errcode='22023',hint='programplan_start_passed'; end if;
 reference:=jsonb_set(reference,'{startedOn}',to_jsonb(to_char(started,'YYYY-MM-DD')));
 if basis_reference is distinct from reference then raise exception 'Copy source basis conflict' using errcode='40001'; end if;
 result:=public.phase5_create_programplan_education(command_id,unit_id,name,local_code,cohort,reference);
 created_id:=(result->'plan'->>'id')::uuid; offering_id:=(result->'education'->>'id')::uuid;
 perform public.phase5_write_programplan_terms(created_id,0,distribution);
 if cardinality(units)>1 then
  perform public.phase5_change_programplan_education(offering_id,0,'units',jsonb_build_object('unitIds',to_jsonb(units)));
 end if;
 -- All statements, including both mandatory audits, share the outer Worker
 -- transaction. The original revision-0 result remains immutable for retries.
 update public.programplan_education_receipts c set request=full_request where c.command_id=phase5_copy_programplan_education.command_id;
 perform public.phase5_programplan_scope(source_plan_id);
 foreach school_id in array units loop perform public.phase5_programplan_unit(school_id,true); end loop;
 perform public.phase5_programplan_copy_audit('programplan_education_copied',offering_id);
 return result;
end $$;

revoke all on function public.phase5_programplan_copy_audit(text,uuid),
 public.phase5_copy_programplan_education(uuid,uuid,integer,integer,uuid,text,text,text,jsonb,boolean)
 from public,anon,authenticated,service_role,skolplattform_worker;
