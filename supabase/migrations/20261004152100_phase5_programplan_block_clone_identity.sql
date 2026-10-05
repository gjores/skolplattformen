-- 05-23 B: preserve historical block identity when cloning an older sealed source.
-- Applied 151000/152000 remain unchanged. Current definitions inventoried immediately before this fix.
-- No data rewrite, new helper, table, or grant.

CREATE OR REPLACE FUNCTION public.phase5_programplan_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; choices text[]; additions jsonb; source_id uuid; source public.point_plans;
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
 if tg_op='UPDATE' then
  -- Retaining a source block in this version is not introduction of a new identity.
  select coalesce(jsonb_agg(b),'[]'::jsonb) into additions from jsonb_array_elements(coalesce(new.basis_reference->'choiceBlocks','[]'::jsonb)) b
   where not exists(select 1 from jsonb_array_elements(coalesce(old.basis_reference->'choiceBlocks','[]'::jsonb)) prior where prior->>'id'=b->>'id');
  perform public.phase5_programplan_require_unused_block_ids(new.offering_id,new.basis_reference||jsonb_build_object('choiceBlocks',additions));
 else
  begin source_id:=nullif(current_setting('app.programplan_clone_source',true),'')::uuid;
  exception when invalid_text_representation then raise exception 'Invalid programplan clone context' using errcode='22023';end;
  if source_id is null then
   perform public.phase5_programplan_require_unused_block_ids(new.offering_id,new.basis_reference);
  else
   -- The clone command sets this only after source, mandate, status and CAS checks.
   -- Verify the complete preserved source contents rather than trusting the GUC value.
   select * into source from public.point_plans where id=source_id for update;
   if not found or source.status not in ('faststalld','ersatt') or source.catalog_id is null
    or source.organizer_id is distinct from new.organizer_id or source.offering_id is distinct from new.offering_id
    or source.specialization is distinct from new.specialization
    or new.version is distinct from (select coalesce(max(version),0)+1 from public.point_plans where offering_id=new.offering_id)
    or new.basis_reference is distinct from public.phase5_programplan_upgrade_shape(source.basis_reference)
    or new.term_distribution is distinct from public.phase5_programplan_upgrade_terms(source.basis_reference,source.term_distribution) then
    raise exception 'Invalid programplan clone context' using errcode='22023';end if;
  end if;
 end if;
 perform public.phase5_programplan_validate_basis(new.basis_reference,o,case when tg_op='UPDATE' and old.catalog_id is null then old.specialization else null end);
 if tg_op='UPDATE' and old.catalog_id is null and (old.status<>'utkast' or new.revision<>old.revision+1) then raise exception 'Programplan version locked' using errcode='42501'; end if;
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(new.basis_reference->'specializationRefs') with ordinality e(value,n);
 if new.specialization is distinct from choices then raise exception 'Programplan choices mismatch' using errcode='22023'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_clone_programplan_draft(source_plan_id uuid, expected_source_revision integer, expected_latest_version integer, explicit_legacy_basis jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; p public.point_plans; latest integer; created uuid; reference jsonb; distribution jsonb; result jsonb; previous_clone_context text;
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
 previous_clone_context:=current_setting('app.programplan_clone_source',true);
 perform set_config('app.programplan_clone_source',case when p.catalog_id is null then '' else p.id::text end,true);
 begin
  insert into public.point_plans(organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference,term_distribution)
  values(o.organizer_id,o.id,latest+1,'utkast',p.specialization,reference->>'catalogId',reference,distribution) returning id into created;
 exception when others then
  perform set_config('app.programplan_clone_source',coalesce(previous_clone_context,''),true);
  if sqlstate='23505' then raise exception 'Programplan version conflict' using errcode='40001';end if;
  raise;
 end;
 perform set_config('app.programplan_clone_source',coalesce(previous_clone_context,''),true);
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(created,'huvudman','programplan_draft_cloned');
 result:=public.phase5_programplan_result(created); perform public.phase5_programplan_audit(created,'programplan_draft_cloned',p.id); return result;
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_create_programplan_draft(offering_id uuid, expected_latest_version integer, basis_reference jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; latest integer; created uuid; choices text[]; result jsonb; previous_clone_context text;
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
 previous_clone_context:=current_setting('app.programplan_clone_source',true);
 perform set_config('app.programplan_clone_source','',true);
 begin
  insert into public.point_plans(organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference)
  values(o.organizer_id,o.id,latest+1,'utkast',choices,basis_reference->>'catalogId',basis_reference) returning id into created;
 exception when others then
  perform set_config('app.programplan_clone_source',coalesce(previous_clone_context,''),true);
  if sqlstate='23505' then raise exception 'Programplan version conflict' using errcode='40001';end if;
  raise;
 end;
 perform set_config('app.programplan_clone_source',coalesce(previous_clone_context,''),true);
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(created,'huvudman','programplan_draft_created');
 result:=public.phase5_programplan_result(created); perform public.phase5_programplan_audit(created,'programplan_draft_created'); return result;
end $function$;
