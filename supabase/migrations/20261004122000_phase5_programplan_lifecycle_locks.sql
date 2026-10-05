-- 05-20: D-01/D-04 i alla skrivande programplanskommandon, arkiv och ändrade uppgifter.
-- Kropparna är oförändrade (md5 kontrollerad mot målet) utom ett writable-anrop efter scope-låset.
-- Inga nya grants: dispatchern är redan öppnad efter preflight.
create or replace function public.phase5_bind_programplan_draft(plan_id uuid, expected_revision integer, basis_reference jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
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
 perform public.phase5_programplan_validate_basis(basis_reference,o,p.specialization);
 update public.point_plans set catalog_id=phase5_bind_programplan_draft.basis_reference->>'catalogId',basis_reference=phase5_bind_programplan_draft.basis_reference,revision=revision+1 where id=p.id;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,'huvudman','programplan_basis_bound');
 result:=public.phase5_programplan_result(p.id); perform public.phase5_programplan_audit(p.id,'programplan_basis_bound'); return result;
end $$;
create or replace function public.phase5_replace_programplan_specialization(plan_id uuid, expected_revision integer, specialization_refs jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
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
 reference:=jsonb_set(p.basis_reference,'{specializationRefs}',coalesce(specialization_refs,'null'::jsonb),false);
 perform public.phase5_programplan_validate_basis(reference,o);
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(specialization_refs) with ordinality e(value,n);
 update public.point_plans set basis_reference=reference,specialization=choices,revision=revision+1 where id=p.id;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,'huvudman','programplan_specialization_changed');
 result:=public.phase5_programplan_result(p.id); perform public.phase5_programplan_audit(p.id,'programplan_specialization_changed'); return result;
end $$;
create or replace function public.phase5_create_programplan_draft(offering_id uuid, expected_latest_version integer, basis_reference jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings; latest integer; created uuid; choices text[]; result jsonb;
begin
 o:=public.phase5_programplan_scope(null,offering_id);
 -- 05-20 (D-01/D-04): status, arkiv och mandat i transaktionen efter scope-låset.
 perform public.phase5_programplan_writable(o,false);
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
create or replace function public.phase5_clone_programplan_draft(source_plan_id uuid, expected_source_revision integer, expected_latest_version integer, explicit_legacy_basis jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings; p public.point_plans; latest integer; created uuid; reference jsonb; result jsonb;
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
  reference:=explicit_legacy_basis; perform public.phase5_programplan_validate_basis(reference,o,p.specialization);
 else
  if explicit_legacy_basis is not null then raise exception 'Unexpected legacy basis' using errcode='22023'; end if;
  reference:=p.basis_reference; perform public.phase5_programplan_validate_basis(reference,o,p.specialization);
 end if;
 begin
  insert into public.point_plans(organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference,term_distribution)
  values(o.organizer_id,o.id,latest+1,'utkast',p.specialization,reference->>'catalogId',reference,p.term_distribution) returning id into created;
 exception when unique_violation then raise exception 'Programplan version conflict' using errcode='40001'; end;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(created,'huvudman','programplan_draft_cloned');
 result:=public.phase5_programplan_result(created); perform public.phase5_programplan_audit(created,'programplan_draft_cloned',p.id); return result;
end $$;
create or replace function public.phase5_write_programplan_terms(plan_id uuid, expected_revision integer, distribution jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.point_plans; result jsonb;
begin
 perform public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for update;
 perform public.phase5_programplan_scope(p.id);
 -- 05-20 (D-01/D-04): status, arkiv och mandat i transaktionen efter scope-låset.
 perform public.phase5_programplan_writable((select f from public.offerings f where f.id=p.offering_id),false);
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid programplan revision' using errcode='22023'; end if;
 if p.revision<>expected_revision then raise exception 'Programplan revision conflict' using errcode='40001'; end if;
 if p.status<>'utkast' or p.catalog_id is null then raise exception 'Programplan version locked' using errcode='42501'; end if;
 perform public.phase5_programplan_validate_terms(p.basis_reference,distribution);
 update public.point_plans set term_distribution=distribution,revision=revision+1 where id=p.id;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,'huvudman','programplan_terms_changed');
 result:=jsonb_build_object('planId',p.id,'revision',p.revision+1,'status',p.status,'distribution',distribution);
 perform public.phase5_programplan_terms_audit(p.id,'programplan_terms_changed'); return result;
end $$;

create or replace function public.phase5_create_programplan_education(command_id uuid,unit_id uuid,name text,local_code text,cohort text,basis_reference jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare started date;a public.access_assignments;s public.app_sessions;u public.school_units;receipt public.programplan_education_receipts;request jsonb;o public.offerings;p jsonb;result jsonb;fetched date;
begin
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501';end if;
 u:=public.phase5_programplan_unit(unit_id,true);
 if command_id is null or name is null or char_length(name)>120 or char_length(btrim(name))=0 or cohort is null or char_length(cohort)>120 or char_length(btrim(cohort))=0
 or (local_code is not null and (char_length(local_code)>80 or char_length(btrim(local_code))=0)) then raise exception 'Invalid education' using errcode='22023';end if;
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
end $$;

-- Startdatum får ändras i ett utkast (via update-kommandot); övrig basis förblir låst.
create or replace function public.phase5_programplan_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.offerings; choices text[];
begin
 if tg_op='UPDATE' and old.catalog_id is not null then
  if new.id is distinct from old.id or new.organizer_id is distinct from old.organizer_id or new.offering_id is distinct from old.offering_id
   or new.version is distinct from old.version or new.catalog_id is distinct from old.catalog_id or new.status is distinct from old.status
   or new.decided_on is distinct from old.decided_on or new.decided_by is distinct from old.decided_by or new.created_by is distinct from old.created_by
   or new.created_at is distinct from old.created_at or new.catalog_fetched is distinct from old.catalog_fetched
   or (new.basis_reference-'specializationRefs'-'startedOn') is distinct from (old.basis_reference-'specializationRefs'-'startedOn') then
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

create or replace function public.phase5_change_programplan_education(offering_id uuid, expected_revision integer, command text, details jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; o public.offerings; versions integer; decided boolean; p public.point_plans; current_start date; started date;
 new_name text; new_code text; new_cohort text; start_changed boolean:=false; operation text;
begin
 a:=public.phase5_programplan_actor(); perform public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501',hint='programplan_mandate'; end if;
 if offering_id is null or expected_revision is null or expected_revision<0 or command is null or command not in ('delete','archive','restore','update')
  or details is null or jsonb_typeof(details)<>'object' then raise exception 'Invalid education command' using errcode='22023'; end if;
 if command<>'update' and details<>'{}'::jsonb then raise exception 'Invalid education command' using errcode='22023'; end if;
 if command='update' then
  if (select count(*) from jsonb_object_keys(details))<>4 or not details ?& array['name','localCode','cohort','startedOn']
   or jsonb_typeof(details->'name')<>'string' or jsonb_typeof(details->'cohort')<>'string' or jsonb_typeof(details->'localCode') not in ('string','null')
   or jsonb_typeof(details->'startedOn') not in ('string','null') then raise exception 'Invalid education command' using errcode='22023'; end if;
  new_name:=btrim(details->>'name'); new_cohort:=btrim(details->>'cohort'); new_code:=case when details->>'localCode' is null then null else btrim(details->>'localCode') end;
  -- Samma längdkontroll som skapandet.
  if char_length(details->>'name')>120 or char_length(new_name)=0 or char_length(details->>'cohort')>120 or char_length(new_cohort)=0
   or (new_code is not null and (char_length(details->>'localCode')>80 or char_length(new_code)=0)) then raise exception 'Invalid education' using errcode='22023'; end if;
  if details->>'startedOn' is not null then
   if details->>'startedOn' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid education' using errcode='22023'; end if;
   begin started:=(details->>'startedOn')::date; exception when others then raise exception 'Invalid education' using errcode='22023'; end;
  end if;
 end if;
 -- Låsordning: session -> kund (actor) -> utbildning (scope) -> planer.
 o:=public.phase5_programplan_scope(null,offering_id);
 perform 1 from public.point_plans pp where pp.offering_id=o.id order by pp.id for update;
 select * into o from public.offerings where id=o.id;
 if command in ('delete','update') then perform public.phase5_programplan_writable(o,true);
 elsif o.organizer_id<>a.organizer_id or not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=o.unit_id) then
  raise exception 'Education denied' using errcode='42501',hint='programplan_mandate'; end if;
 if o.lifecycle_revision<>expected_revision then raise exception 'Education revision conflict' using errcode='40001'; end if;
 if command='delete' then
  if exists(select 1 from public.school_classes c where c.offering_id=o.id) or exists(select 1 from public.pupil_placements pl where pl.offering_id=o.id)
   or exists(select 1 from public.timplans t where t.offering_id=o.id) or exists(select 1 from public.permits t where t.offering_id=o.id) then
   raise exception 'Education in use' using errcode='55006',hint='programplan_in_use'; end if;
  select count(*)::integer,coalesce(bool_or(pp.status in ('faststalld','ersatt')),false) into versions,decided from public.point_plans pp where pp.offering_id=o.id;
  delete from public.point_plans pp where pp.offering_id=o.id;
  delete from public.offerings f where f.id=o.id;
  insert into public.organisation_events(organizer_id,actor_role,action) values(o.organizer_id,'huvudman','programplan_education_deleted');
  perform public.phase5_programplan_lifecycle_audit('programplan_education_deleted',o.id,jsonb_build_object('versions',versions,'decided',decided));
  return jsonb_build_object('offeringId',o.id,'command',command,'lifecycle',null);
 end if;
 if command='archive' then
  if o.archived_at is not null then raise exception 'Education already archived' using errcode='40001'; end if;
  update public.offerings set archived_at=clock_timestamp(),lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_archived';
 elsif command='restore' then
  if o.archived_at is null then raise exception 'Education not archived' using errcode='40001'; end if;
  update public.offerings set archived_at=null,lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_restored';
 else
  if exists(select 1 from public.offerings f where f.id<>o.id and f.organizer_id=o.organizer_id and f.unit_id=o.unit_id and f.kind='gymnasium'
   and f.program_code is not distinct from o.program_code and f.orientation_code is not distinct from o.orientation_code
   and btrim(f.name)=new_name and btrim(f.cohort)=new_cohort and case when f.local_code is null then null else btrim(f.local_code) end is not distinct from new_code) then
   raise exception 'Education conflict' using errcode='40001'; end if;
  current_start:=public.phase5_programplan_starts_on(o);
  if started is not null and started is distinct from current_start then
   -- Startdatum ändras bara när utbildningen har en enda version som är ett bundet utkast.
   select count(*)::integer into versions from public.point_plans pp where pp.offering_id=o.id;
   select * into p from public.point_plans pp where pp.offering_id=o.id;
   if versions<>1 or p.status<>'utkast' or p.basis_reference is null then raise exception 'Education start locked' using errcode='22023'; end if;
   if started<=public.phase5_programplan_today() then raise exception 'Education start passed' using errcode='22023',hint='programplan_start_passed'; end if;
   update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb(to_char(started,'YYYY-MM-DD'))),revision=revision+1 where id=p.id;
   start_changed:=true;
  end if;
  update public.offerings set name=new_name,local_code=new_code,cohort=new_cohort,
   start_year=case when start_changed then extract(year from started)::integer else start_year end,lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_updated';
 end if;
 insert into public.organisation_events(organizer_id,actor_role,action) values(o.organizer_id,'huvudman',operation);
 perform public.phase5_programplan_lifecycle_audit(operation,o.id,case when command='update' then jsonb_build_object('startChanged',start_changed) else '{}'::jsonb end);
 return jsonb_build_object('offeringId',o.id,'command',command,'lifecycle',public.phase5_programplan_lifecycle(o));
end $$;
