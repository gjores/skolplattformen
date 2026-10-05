-- 05-23 B: draft-only choice-block commands and deterministic legacy upgrade helpers.
-- Same-signature definitions were captured from protected via pg_get_functiondef.
create function public.phase5_programplan_require_current_shape(reference jsonb) returns void
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
begin
 if reference is null or not reference ? 'choiceBlocks' then raise exception 'Current programplan shape required' using errcode='22023'; end if;
end $$;
create function public.phase5_programplan_upgrade_shape(reference jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare payload jsonb; program jsonb; orientation jsonb; subject jsonb; blocks jsonb:='[]';
begin
 if public.phase5_resolve_programplan_basis(reference)->>'status' is distinct from 'resolved' then raise exception 'Invalid programplan basis' using errcode='22023'; end if;
 if reference ? 'choiceBlocks' then return reference; end if;
 select c.payload into payload from public.programplan_catalogs c where c.catalog_id=reference->>'catalogId';
 select value into program from jsonb_array_elements(payload->'programs') where value->>'code'=reference->'programRef'->>'code';
 select value into orientation from jsonb_array_elements(program->'orientations') where value->>'code'=reference->>'orientationCode';
 for subject in select value from jsonb_array_elements(program->'programmeSpecific')
  union all select value from jsonb_array_elements(coalesce(orientation->'subjects','[]'::jsonb)) loop
  if subject->>'code' in ('MOSP','SPRK','NAVE') and jsonb_array_length(subject->'levels')=0 then
   blocks:=blocks||jsonb_build_array(jsonb_build_object('id',case subject->>'code' when 'MOSP' then 'mosp' when 'SPRK' then 'sprk' else 'nave' end,
    'kind',case subject->>'code' when 'MOSP' then 'modernLanguage' when 'SPRK' then 'languageSubject' else 'naturalScience' end,'points',subject->'points','name',subject->'name'));
  end if;
 end loop;
 return reference||jsonb_build_object('choiceBlocks',blocks||'[{"id":"iv1","kind":"individualChoice","points":200,"name":"Individuellt val"}]'::jsonb);
end $$;
create function public.phase5_programplan_upgrade_terms(old_reference jsonb, old_distribution jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare reference jsonb; entry jsonb; result jsonb:='[]';
begin
 reference:=public.phase5_programplan_upgrade_shape(old_reference);
 perform public.phase5_programplan_validate_terms(old_reference,old_distribution);
 if old_reference ? 'choiceBlocks' then return old_distribution; end if;
 for entry in select value from jsonb_array_elements(old_distribution) loop
  result:=result||jsonb_build_array(case when entry->>'rowKey'='meta:individualChoice' then entry||jsonb_build_object('rowKey','block:iv1') else entry end);
 end loop;
 perform public.phase5_programplan_validate_terms(reference,result);
 return result;
end $$;

-- Retired IDs live only in the already closed, actor-bound business history.
-- Keeping them across versions prevents assigning a previous block identity to new contents.
create function public.phase5_programplan_require_unused_block_ids(offering_id uuid, reference jsonb) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.point_plan_events e join public.point_plans p on p.id=e.point_plan_id
  cross join lateral jsonb_array_elements_text((case when e.action='programplan_blocks_changed' then e.comment::jsonb else '{"retiredBlockIds":[]}'::jsonb end)->'retiredBlockIds') retired(id)
  where p.offering_id=phase5_programplan_require_unused_block_ids.offering_id and e.action='programplan_blocks_changed'
  and exists(select 1 from jsonb_array_elements(coalesce(reference->'choiceBlocks','[]'::jsonb)) b where b->>'id'=retired.id)) then
  raise exception 'Retired programplan block id' using errcode='22023';end if;
end $$;

CREATE OR REPLACE FUNCTION public.phase5_programplan_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; choices text[];
begin
 if tg_op='UPDATE' and old.catalog_id is not null then
  if new.id is distinct from old.id or new.organizer_id is distinct from old.organizer_id or new.offering_id is distinct from old.offering_id
   or new.version is distinct from old.version or new.catalog_id is distinct from old.catalog_id or new.status is distinct from old.status
   or new.decided_on is distinct from old.decided_on or new.decided_by is distinct from old.decided_by or new.created_by is distinct from old.created_by
   or new.created_at is distinct from old.created_at or new.catalog_fetched is distinct from old.catalog_fetched
   or (new.basis_reference-'specializationRefs'-'startedOn'-'choiceBlocks') is distinct from (old.basis_reference-'specializationRefs'-'startedOn'-'choiceBlocks') then
   raise exception 'Programplan version locked' using errcode='42501'; end if;
  if old.status<>'utkast' and (new.basis_reference is distinct from old.basis_reference or new.specialization is distinct from old.specialization or new.revision is distinct from old.revision) then
   raise exception 'Programplan version locked' using errcode='42501'; end if;
  if (new.basis_reference is distinct from old.basis_reference or new.specialization is distinct from old.specialization) and new.revision<>old.revision+1 then
   raise exception 'Programplan revision required' using errcode='40001'; end if;
  if new.revision<old.revision then raise exception 'Programplan revision conflict' using errcode='40001'; end if;
 end if;
 if new.catalog_id is null and new.basis_reference is null then return new; end if;
 if new.catalog_id is null or new.basis_reference is null or new.catalog_id is distinct from new.basis_reference->>'catalogId' then raise exception 'Invalid programplan binding' using errcode='22023'; end if;
 if tg_op='INSERT' or old.catalog_id is null or old.basis_reference ? 'choiceBlocks' then
  perform public.phase5_programplan_require_current_shape(new.basis_reference);
 end if;
 if (tg_op='INSERT' or old.catalog_id is null) and (new.status<>'utkast' or new.decided_on is not null or new.decided_by is not null) then
  raise exception 'Programplan version locked' using errcode='42501'; end if;
 select * into o from public.offerings where id=new.offering_id and organizer_id=new.organizer_id and kind='gymnasium';
 if not found then raise exception 'Programplan denied' using errcode='42501'; end if;
 perform public.phase5_programplan_require_unused_block_ids(new.offering_id,new.basis_reference);
 perform public.phase5_programplan_validate_basis(new.basis_reference,o,case when tg_op='UPDATE' and old.catalog_id is null then old.specialization else null end);
 if tg_op='UPDATE' and old.catalog_id is null and (old.status<>'utkast' or new.revision<>old.revision+1) then raise exception 'Programplan version locked' using errcode='42501'; end if;
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(new.basis_reference->'specializationRefs') with ordinality e(value,n);
 if new.specialization is distinct from choices then raise exception 'Programplan choices mismatch' using errcode='22023'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_programplan_writable(o offerings, require_hm boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; fresh public.offerings;
begin
 a:=public.phase5_programplan_actor();
 select * into fresh from public.offerings where id=o.id;
 if not found or a.function='administrator' or (require_hm and a.function<>'huvudman') or fresh.organizer_id<>a.organizer_id
 or not exists(select 1 from public.offering_units ou where ou.offering_id=fresh.id and ou.unit_id=fresh.unit_id and ou.organizer_id=fresh.organizer_id)
 or exists(select 1 from public.offering_units ou where ou.offering_id=fresh.id and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) then
  raise exception 'Programplan denied' using errcode='42501',hint='programplan_mandate'; end if;
 if fresh.archived_at is not null then raise exception 'Programplan archived' using errcode='42501',hint='programplan_archived'; end if;
 if public.phase5_programplan_phase(fresh) is distinct from 'framtida' then raise exception 'Programplan started' using errcode='42501',hint='programplan_started'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_bind_programplan_draft(plan_id uuid, expected_revision integer, basis_reference jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; p public.point_plans; result jsonb;
begin
 o:=public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for update;
 o:=public.phase5_programplan_scope(p.id);
 -- 05-20 (D-01/D-04): status, arkiv och mandat i transaktionen efter scope-låset.
 perform public.phase5_programplan_writable(o,false);
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid programplan revision' using errcode='22023'; end if;
 if p.revision<>expected_revision or p.catalog_id is not null then raise exception 'Programplan revision conflict' using errcode='40001'; end if;
 if p.status<>'utkast' then raise exception 'Programplan version locked' using errcode='42501'; end if;
 perform public.phase5_programplan_require_current_shape(basis_reference);
 perform public.phase5_programplan_validate_basis(basis_reference,o,p.specialization);
 update public.point_plans set catalog_id=phase5_bind_programplan_draft.basis_reference->>'catalogId',basis_reference=phase5_bind_programplan_draft.basis_reference,revision=revision+1 where id=p.id;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,'huvudman','programplan_basis_bound');
 result:=public.phase5_programplan_result(p.id); perform public.phase5_programplan_audit(p.id,'programplan_basis_bound'); return result;
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_replace_programplan_specialization(plan_id uuid, expected_revision integer, specialization_refs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; p public.point_plans; reference jsonb; choices text[]; result jsonb;
begin
 o:=public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for update;
 o:=public.phase5_programplan_scope(p.id);
 -- 05-20 (D-01/D-04): status, arkiv och mandat i transaktionen efter scope-låset.
 perform public.phase5_programplan_writable(o,false);
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid programplan revision' using errcode='22023'; end if;
 if p.revision<>expected_revision then raise exception 'Programplan revision conflict' using errcode='40001'; end if;
 if p.status<>'utkast' or p.catalog_id is null then raise exception 'Programplan version locked' using errcode='42501'; end if;
 perform public.phase5_programplan_require_current_shape(p.basis_reference);
 reference:=jsonb_set(p.basis_reference,'{specializationRefs}',coalesce(specialization_refs,'null'::jsonb),false);
 perform public.phase5_programplan_validate_basis(reference,o);
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(specialization_refs) with ordinality e(value,n);
 update public.point_plans set basis_reference=reference,specialization=choices,revision=revision+1 where id=p.id;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,'huvudman','programplan_specialization_changed');
 result:=public.phase5_programplan_result(p.id); perform public.phase5_programplan_audit(p.id,'programplan_specialization_changed'); return result;
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_create_programplan_draft(offering_id uuid, expected_latest_version integer, basis_reference jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; latest integer; created uuid; choices text[]; result jsonb;
begin
 o:=public.phase5_programplan_scope(null,offering_id);
 -- 05-20 (D-01/D-04): status, arkiv och mandat i transaktionen efter scope-låset.
 perform public.phase5_programplan_writable(o,false);
 if expected_latest_version is null or expected_latest_version<0 then raise exception 'Invalid programplan version' using errcode='22023'; end if;
 select coalesce(max(version),0) into latest from public.point_plans where point_plans.offering_id=o.id;
 if latest<>expected_latest_version or exists(select 1 from public.point_plans where point_plans.offering_id=o.id and status='utkast') then raise exception 'Programplan version conflict' using errcode='40001'; end if;
 perform public.phase5_programplan_require_current_shape(basis_reference);
 perform public.phase5_programplan_validate_basis(basis_reference,o);
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(basis_reference->'specializationRefs') with ordinality e(value,n);
 begin
  insert into public.point_plans(organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference)
  values(o.organizer_id,o.id,latest+1,'utkast',choices,basis_reference->>'catalogId',basis_reference) returning id into created;
 exception when unique_violation then raise exception 'Programplan version conflict' using errcode='40001'; end;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(created,'huvudman','programplan_draft_created');
 result:=public.phase5_programplan_result(created); perform public.phase5_programplan_audit(created,'programplan_draft_created'); return result;
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_create_programplan_education(command_id uuid, unit_id uuid, name text, local_code text, cohort text, basis_reference jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare started date;a public.access_assignments;s public.app_sessions;u public.school_units;receipt public.programplan_education_receipts;request jsonb;o public.offerings;p jsonb;result jsonb;fetched date;
begin
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501';end if;
 u:=public.phase5_programplan_unit(unit_id,true);
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
 perform public.phase5_programplan_unit(receipt.unit_id,true);
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
 insert into public.organisation_events(organizer_id,actor_role,action) values(a.organizer_id,'huvudman','programplan_education_created');
 result:=jsonb_build_object('commandId',command_id,'education',public.phase5_programplan_education(o),'plan',p,'replayed',false);
 insert into public.programplan_education_receipts(command_id,identity_id,customer_id,organizer_id,unit_id,offering_id,plan_id,request,initial_result)
 values(command_id,s.identity_id,a.customer_id,a.organizer_id,u.id,o.id,(p->>'id')::uuid,request,result);
 perform public.phase5_programplan_unit(u.id,true);perform public.phase5_programplan_education_audit('programplan_education_created',o.id,'education');return result;
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_clone_programplan_draft(source_plan_id uuid, expected_source_revision integer, expected_latest_version integer, explicit_legacy_basis jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; p public.point_plans; latest integer; created uuid; reference jsonb; distribution jsonb; result jsonb;
begin
 o:=public.phase5_programplan_scope(source_plan_id);
 select * into p from public.point_plans where id=source_plan_id for update;
 o:=public.phase5_programplan_scope(p.id);
 -- 05-20 (D-01/D-04): status, arkiv och mandat i transaktionen efter scope-låset.
 perform public.phase5_programplan_writable(o,false);
 if expected_source_revision is null or expected_source_revision<0 or expected_latest_version is null or expected_latest_version<0 then raise exception 'Invalid programplan version' using errcode='22023'; end if;
 select coalesce(max(version),0) into latest from public.point_plans where offering_id=o.id;
 if p.revision<>expected_source_revision or latest<>expected_latest_version or exists(select 1 from public.point_plans where offering_id=o.id and status='utkast') then raise exception 'Programplan version conflict' using errcode='40001'; end if;
 if p.status not in ('faststalld','ersatt') then raise exception 'Programplan version locked' using errcode='42501'; end if;
 if p.catalog_id is null then
  reference:=explicit_legacy_basis; perform public.phase5_programplan_require_current_shape(reference); perform public.phase5_programplan_validate_basis(reference,o,p.specialization);
 else
  if explicit_legacy_basis is not null then raise exception 'Unexpected legacy basis' using errcode='22023'; end if;
  reference:=public.phase5_programplan_upgrade_shape(p.basis_reference); perform public.phase5_programplan_validate_basis(reference,o,p.specialization);
 end if;
 distribution:=case when p.basis_reference is null then p.term_distribution else public.phase5_programplan_upgrade_terms(p.basis_reference,p.term_distribution) end;
 begin
  insert into public.point_plans(organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference,term_distribution)
  values(o.organizer_id,o.id,latest+1,'utkast',p.specialization,reference->>'catalogId',reference,distribution) returning id into created;
 exception when unique_violation then raise exception 'Programplan version conflict' using errcode='40001'; end;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(created,'huvudman','programplan_draft_cloned');
 result:=public.phase5_programplan_result(created); perform public.phase5_programplan_audit(created,'programplan_draft_cloned',p.id); return result;
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_programplan_audit(plan_id uuid, operation text, source_plan_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; i public.identities; s public.app_sessions; metadata jsonb;
begin
 if operation is null or operation not in ('programplan_read','programplan_basis_bound','programplan_specialization_changed','programplan_blocks_changed','programplan_draft_created','programplan_draft_cloned')
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
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_programplan_event_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; s public.app_sessions; metadata jsonb; item jsonb;
begin
 if new.action in ('programplan_basis_bound','programplan_specialization_changed','programplan_blocks_changed','programplan_draft_created','programplan_draft_cloned','programplan_terms_changed') then
  a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check();
  perform public.phase5_programplan_scope(new.point_plan_id);
  new.actor:=null; new.actor_role:=a.function::text::public.app_role;
  new.actor_identity_id:=s.identity_id; new.session_id:=s.id; new.membership_id:=a.membership_id; new.assignment_id:=a.id;
  if new.action='programplan_blocks_changed' then
   begin metadata:=new.comment::jsonb;exception when others then raise exception 'Invalid block history' using errcode='22023';end;
   if not public.phase5_programplan_shape(metadata,array['retiredBlockIds']) or not public.phase5_programplan_array(metadata->'retiredBlockIds',200) then
    raise exception 'Invalid block history' using errcode='22023';end if;
   for item in select value from jsonb_array_elements(metadata->'retiredBlockIds') loop
    if jsonb_typeof(item) is distinct from 'string' or (item#>>'{}') !~ '^[a-z][a-z0-9]{0,15}$' then raise exception 'Invalid block history' using errcode='22023';end if;
   end loop;
  end if;
 else
  -- Retain the original auth.users semantics only for original legacy actions.
  if new.actor_identity_id is not null or new.session_id is not null or new.membership_id is not null or new.assignment_id is not null
   or new.action like 'programplan_%' then raise exception 'Invalid programplan history action' using errcode='22023'; end if;
  if public.current_actor_auth_user_id() is null or public.current_app_role() is null then raise exception 'History denied' using errcode='42501'; end if;
  new.actor:=public.current_actor_auth_user_id(); new.actor_role:=public.current_app_role();
 end if;
 return new;
end $function$;

create function public.phase5_replace_programplan_blocks(plan_id uuid, expected_revision integer, choice_blocks jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.offerings;p public.point_plans;reference jsonb;result jsonb;retired jsonb;
begin
 o:=public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for update;
 o:=public.phase5_programplan_scope(p.id);perform public.phase5_programplan_writable(o,false);
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid programplan revision' using errcode='22023';end if;
 if p.revision<>expected_revision then raise exception 'Programplan revision conflict' using errcode='40001';end if;
 if p.status<>'utkast' or p.catalog_id is null then raise exception 'Programplan version locked' using errcode='42501';end if;
 perform public.phase5_programplan_require_current_shape(p.basis_reference);
 reference:=jsonb_set(p.basis_reference,'{choiceBlocks}',coalesce(choice_blocks,'null'::jsonb),false);
 perform public.phase5_programplan_validate_basis(reference,o);
 -- The existing terms guard rejects deletion or reduction of an allocated frame.
 update public.point_plans set basis_reference=reference,revision=revision+1 where id=p.id;
 select coalesce(jsonb_agg(b->'id' order by n),'[]'::jsonb) into retired from jsonb_array_elements(p.basis_reference->'choiceBlocks') with ordinality oldblocks(b,n)
  where not exists(select 1 from jsonb_array_elements(reference->'choiceBlocks') v where v->>'id'=b->>'id');
 insert into public.point_plan_events(point_plan_id,actor_role,action,comment) values(p.id,'huvudman','programplan_blocks_changed',jsonb_build_object('retiredBlockIds',retired)::text);
 result:=public.phase5_programplan_result(p.id);perform public.phase5_programplan_audit(p.id,'programplan_blocks_changed');return result;
end $$;
revoke all on function public.phase5_programplan_require_current_shape(jsonb),public.phase5_programplan_require_unused_block_ids(uuid,jsonb),public.phase5_programplan_upgrade_shape(jsonb),
 public.phase5_programplan_upgrade_terms(jsonb,jsonb),public.phase5_replace_programplan_blocks(uuid,integer,jsonb)
 from public,anon,authenticated,skolplattform_worker,service_role;
