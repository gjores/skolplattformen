-- Rektor may create a first draft and copy a later cohort to one currently
-- mandated school. Shared source plans are read in that school's context;
-- their other school links never enter the rector's new offering.
-- Existing signatures, grants, receipts, locks, audit and HM approval remain.


create or replace function public.phase5_programplan_selection(unit_id uuid,catalog_id text,program_ref jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; payload jsonb; result jsonb;
begin
 a:=public.phase5_programplan_actor();
 if (catalog_id is not null and (unit_id is null or catalog_id!~'^sha256:[0-9a-f]{64}$')) or (program_ref is not null and catalog_id is null)
 or (program_ref is not null and (jsonb_typeof(program_ref)<>'object' or (select count(*) from jsonb_object_keys(program_ref))<>2 or not program_ref?'code' or not program_ref?'version')) then
 raise exception 'Invalid selection' using errcode='22023';end if;
 if unit_id is not null then perform public.phase5_programplan_unit(unit_id);end if;
 if catalog_id is not null then select c.payload into payload from public.programplan_catalogs c where c.catalog_id=phase5_programplan_selection.catalog_id;
 if not found then raise exception 'Invalid catalog' using errcode='22023';end if;end if;
 select jsonb_build_object('units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name,u.id)
 from public.school_units u join public.organizers g on g.id=u.organizer_id and g.customer_id=a.customer_id
 join public.mandate_units m on m.assignment_id=a.id and m.unit_id=u.id
 where u.organizer_id=a.organizer_id and exists(select 1 from public.school_unit_types t where t.unit_id=u.id and t.school_type='GY')),'[]'::jsonb),
 'canCreateEducation',a.function in ('huvudman','rektor'),'catalogs',case when unit_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('catalogId',c.catalog_id,'source',c.payload->'source') order by c.catalog_id) from public.programplan_catalogs c),'[]'::jsonb) end,
 'selection',jsonb_build_object('unitId',unit_id,'catalogId',catalog_id,'programRef',program_ref),'payload',payload,'decisionReady',false) into result;
 perform public.phase5_programplan_education_audit('programplan_selection_read',null,'education_collection');return result;
end $$;

create or replace function public.phase5_programplan_organisation_actor() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;
begin
 if new.action in ('programplan_education_created','programplan_education_deleted','programplan_education_archived',
  'programplan_education_restored','programplan_education_updated','programplan_education_units_changed') then
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if (a.function<>'huvudman' and not (a.function='rektor' and new.action='programplan_education_created')) or new.organizer_id<>a.organizer_id then raise exception 'Education event denied' using errcode='42501';end if;
 new.actor:=null;new.actor_role:=a.function::text::public.app_role;new.actor_identity_id:=s.identity_id;new.session_id:=s.id;new.membership_id:=a.membership_id;new.assignment_id:=a.id;
 else
 if new.actor_identity_id is not null or new.session_id is not null or new.membership_id is not null or new.assignment_id is not null then raise exception 'Invalid legacy event' using errcode='22023';end if;
 if public.current_actor_auth_user_id() is null or public.current_app_role() is null then raise exception 'History denied' using errcode='42501';end if;
 new.actor:=public.current_actor_auth_user_id();new.actor_role:=public.current_app_role();end if;return new;
end $$;

CREATE OR REPLACE FUNCTION public.phase5_create_programplan_education(command_id uuid, unit_id uuid, name text, local_code text, cohort text, basis_reference jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare started date;a public.access_assignments;s public.app_sessions;u public.school_units;receipt public.programplan_education_receipts;request jsonb;o public.offerings;p jsonb;result jsonb;fetched date;
begin
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function not in ('huvudman','rektor') then raise exception 'Education denied' using errcode='42501';end if;
 u:=public.phase5_programplan_unit(unit_id,false);
 if command_id is null or name is null or char_length(name)>120 or char_length(btrim(name))=0 or cohort is null or char_length(cohort)>120 or char_length(btrim(cohort))=0
 or (local_code is not null and (char_length(local_code)>80 or char_length(btrim(local_code))=0)) then raise exception 'Invalid education' using errcode='22023';end if;
 perform public.phase5_programplan_require_current_shape(basis_reference);
 request:=jsonb_build_object('commandId',command_id,'unitId',unit_id,'name',btrim(name),'localCode',case when local_code is null then null else btrim(local_code) end,'cohort',btrim(cohort),'basisReference',basis_reference);
 perform pg_advisory_xact_lock(hashtextextended(command_id::text,515));
 select * into receipt from public.programplan_education_receipts r where r.command_id=phase5_create_programplan_education.command_id;
 if found then
 if receipt.identity_id<>s.identity_id or receipt.customer_id<>a.customer_id or receipt.organizer_id<>a.organizer_id or receipt.unit_id<>u.id then raise exception 'Education conflict' using errcode='40001';end if;
 if receipt.request is distinct from request then raise exception 'Education conflict' using errcode='40001';end if;
 -- En borttagen utbildning återskapas aldrig: replay ger konflikt.
 if not exists(select 1 from public.offerings f where f.id=receipt.offering_id) then raise exception 'Education conflict' using errcode='40001';end if;
 perform public.phase5_programplan_unit(receipt.unit_id,false);
 perform public.phase5_programplan_education_audit('programplan_education_created',receipt.offering_id,'education');
 return receipt.initial_result||jsonb_build_object('replayed',true);end if;
 if exists(select 1 from public.offerings f where f.organizer_id=a.organizer_id and f.unit_id=u.id and f.kind='gymnasium'
 and f.program_code is not distinct from basis_reference->'programRef'->>'code' and f.orientation_code is not distinct from basis_reference->>'orientationCode'
 and btrim(f.name)=btrim(phase5_create_programplan_education.name) and btrim(f.cohort)=btrim(phase5_create_programplan_education.cohort) and case when f.local_code is null then null else btrim(f.local_code) end is not distinct from request->>'localCode') then
 raise exception 'Education conflict' using errcode='40001';end if;
 -- D-04: ny utbildning eller kopia kräver start efter i dag (Europe/Stockholm).
 begin started:=(basis_reference->>'startedOn')::date; exception when others then raise exception 'Invalid education' using errcode='22023'; end;
 if started is null then raise exception 'Invalid education' using errcode='22023'; end if;
 if started<=public.phase5_programplan_today() then raise exception 'Education start passed' using errcode='22023',hint='programplan_start_passed'; end if;
 select (c.payload->'source'->>'fetched')::date into fetched from public.programplan_catalogs c where c.catalog_id=basis_reference->>'catalogId';
 if not found then raise exception 'Invalid catalog' using errcode='22023';end if;
 insert into public.offerings(organizer_id,unit_id,kind,name,local_code,cohort,status,program_code,orientation_code,start_year,catalog_fetched)
 values(a.organizer_id,u.id,'gymnasium',btrim(name),request->>'localCode',btrim(cohort),'planerad',basis_reference->'programRef'->>'code',basis_reference->>'orientationCode',null,fetched) returning * into o;
 -- Startåret sätts efter första utkastet, så att utkastets exakta start (inte bara året) avgör statusen.
 p:=public.phase5_create_programplan_draft(o.id,0,basis_reference);
 update public.offerings set start_year=extract(year from started)::integer where id=o.id returning * into o;
 insert into public.organisation_events(organizer_id,actor_role,action) values(a.organizer_id,a.function::text::public.app_role,'programplan_education_created');
 result:=jsonb_build_object('commandId',command_id,'education',public.phase5_programplan_education(o),'plan',p,'replayed',false);
 insert into public.programplan_education_receipts(command_id,identity_id,customer_id,organizer_id,unit_id,offering_id,plan_id,request,initial_result)
 values(command_id,s.identity_id,a.customer_id,a.organizer_id,u.id,o.id,(p->>'id')::uuid,request,result);
 perform public.phase5_programplan_unit(u.id,false);perform public.phase5_programplan_education_audit('programplan_education_created',o.id,'education');return result;
end $function$;

create or replace function public.phase5_programplan_education_status(command_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;r public.programplan_education_receipts;result jsonb;
begin
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function not in ('huvudman','rektor') then raise exception 'Education denied' using errcode='42501';end if;
 if command_id is null then raise exception 'Invalid education command' using errcode='22023';end if;
 select * into r from public.programplan_education_receipts c where c.command_id=phase5_programplan_education_status.command_id
 and c.identity_id=s.identity_id and c.customer_id=a.customer_id and c.organizer_id=a.organizer_id;
 if found and exists(select 1 from public.offerings f where f.id=r.offering_id) then perform public.phase5_programplan_unit(r.unit_id,false);result:=(r.initial_result-'replayed')||jsonb_build_object('status','created');
 else result:=jsonb_build_object('commandId',command_id,'status','not_found');end if;
 perform public.phase5_programplan_education_audit('programplan_education_status_read',command_id,'education_command');return result;
end $$;

create or replace function public.phase5_programplan_copy_audit(operation text, object_id uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
 if operation is null or operation not in ('programplan_education_copied','programplan_copy_status_read') or object_id is null then
  raise exception 'Invalid copy audit' using errcode='22023'; end if;
 a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check();
 if a.function not in ('huvudman','rektor') then raise exception 'Copy denied' using errcode='42501'; end if;
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,
   operation,case when operation='programplan_copy_status_read' then 'education_command' else 'education' end,object_id,'ok','{}');
 exception when others then raise exception 'Copy audit unavailable' using errcode='55000'; end;
end $$;

create or replace function public.phase5_copy_programplan_education(command_id uuid, source_plan_id uuid, expected_source_revision integer,
 expected_education_revision integer, unit_id uuid, name text, local_code text, cohort text, basis_reference jsonb, status_only boolean) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; o public.offerings; p public.point_plans;
 r public.programplan_education_receipts; full_request jsonb; result jsonb; reference jsonb; distribution jsonb;
 units uuid[]; school_id uuid; created_id uuid; offering_id uuid; started date; source_start date;
begin
 -- Session/customer locks and live authority precede any receipt inspection.
 a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check();
 if a.function not in ('huvudman','rektor') then raise exception 'Copy denied' using errcode='42501',hint='programplan_mandate'; end if;
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
 if a.function='rektor' then
  -- The selected school is both an actual source link and a current mandate.
  -- The source's primary school may belong to a different principal.
  perform public.phase5_programplan_unit(unit_id,false);
  if not exists(select 1 from public.offering_units ou where ou.offering_id=o.id
   and ou.organizer_id=o.organizer_id and ou.unit_id=phase5_copy_programplan_education.unit_id) then
   raise exception 'Copy denied' using errcode='42501',hint='programplan_mandate'; end if;
  units:=array[unit_id];
 else
  if unit_id<>o.unit_id then raise exception 'Copy school differs' using errcode='22023'; end if;
  select array_agg(ou.unit_id order by ou.unit_id) into units from public.offering_units ou where ou.offering_id=o.id and ou.organizer_id=o.organizer_id;
  if units is null or cardinality(units)>100 then raise exception 'Invalid copy schools' using errcode='22023'; end if;
  foreach school_id in array units loop perform public.phase5_programplan_unit(school_id,true); end loop;
 end if;
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
 foreach school_id in array units loop perform public.phase5_programplan_unit(school_id,a.function='huvudman'); end loop;
 perform public.phase5_programplan_copy_audit('programplan_education_copied',offering_id);
 return result;
end $$;
