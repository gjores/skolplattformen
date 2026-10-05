-- 05-23 C: school-scoped package selections. Actual protected definitions inventoried before replacement.
create table public.programplan_unit_packages (
 plan_id uuid not null references public.point_plans(id) on delete cascade,
 offering_id uuid not null,unit_id uuid not null,organizer_id uuid not null,
 revision integer not null check(revision>0),selections jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default clock_timestamp(),updated_by_assignment uuid not null references public.access_assignments(id),
 primary key(plan_id,unit_id),
 foreign key(offering_id,unit_id,organizer_id) references public.offering_units(offering_id,unit_id,organizer_id),
 check(jsonb_typeof(selections)='array' and jsonb_array_length(selections)<=16)
);
alter table public.programplan_unit_packages enable row level security;
revoke all on public.programplan_unit_packages from public,anon,authenticated,service_role,skolplattform_worker;
CREATE OR REPLACE FUNCTION public.phase5_programplan_actor()
 RETURNS access_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; corr uuid; node public.access_assignments; cursor_id uuid; seen uuid[]:='{}';
begin
 perform public.phase5_programplan_session_check();
 begin corr:=nullif(current_setting('app.correlation_id',true),'')::uuid;
 exception when invalid_text_representation then raise exception 'Programplan audit unavailable' using errcode='55000'; end;
 if corr is null then raise exception 'Programplan audit unavailable' using errcode='55000'; end if;
 a:=public.phase3_actor();
 -- Refresh after the actual customer-lock wait. GUC role never supplies authority.
 perform public.phase5_programplan_session_check();
 if a.function not in ('huvudman','rektor','administrator') then raise exception 'Programplan denied' using errcode='42501'; end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.phase5_programplan_event_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; s public.app_sessions; metadata jsonb; item jsonb;
begin
 if new.action in ('programplan_basis_bound','programplan_specialization_changed','programplan_blocks_changed','programplan_draft_created','programplan_draft_cloned','programplan_terms_changed','programplan_unit_packages_changed') then
  a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check();
  perform public.phase5_programplan_scope(new.point_plan_id);
  if a.function='administrator' and new.action<>'programplan_unit_packages_changed' then raise exception 'Programplan denied' using errcode='42501'; end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.phase5_change_programplan_education(offering_id uuid, expected_revision integer, command text, details jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; o public.offerings; versions integer; decided boolean; p public.point_plans; current_start date; started date;
 new_name text; new_code text; new_cohort text; start_changed boolean:=false; operation text; unit_ids uuid[]; school_id uuid; added integer; removed integer;
begin
 a:=public.phase5_programplan_actor(); perform public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501',hint='programplan_mandate'; end if;
 if offering_id is null or expected_revision is null or expected_revision<0 or command is null or command not in ('delete','archive','restore','update','units')
  or details is null or jsonb_typeof(details)<>'object' then raise exception 'Invalid education command' using errcode='22023'; end if;
 if command not in ('update','units') and details<>'{}'::jsonb then raise exception 'Invalid education command' using errcode='22023'; end if;
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
 if command='units' then
  if (select count(*) from jsonb_object_keys(details))<>1 or not details?'unitIds'
   or jsonb_typeof(details->'unitIds') is distinct from 'array' then raise exception 'Invalid education command' using errcode='22023'; end if;
  if jsonb_array_length(details->'unitIds') not between 1 and 100
   or exists(select 1 from jsonb_array_elements(details->'unitIds') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid education command' using errcode='22023'; end if;
  select array_agg(v::uuid order by v::uuid) into unit_ids from jsonb_array_elements_text(details->'unitIds') v;
  if cardinality(unit_ids)<>(select count(distinct v) from unnest(unit_ids) v) then raise exception 'Invalid education command' using errcode='22023'; end if;
  -- Lås både nuvarande och begärda skolor före scope i gemensam id-ordning.
  -- Mandat/kund är kontrollerat; främmande skolor låses aldrig.
  perform 1 from public.school_units u where u.organizer_id=a.organizer_id and (u.id=any(unit_ids) or exists(select 1 from public.offering_units ou where ou.offering_id=phase5_change_programplan_education.offering_id and ou.unit_id=u.id)) order by u.id for update;
 end if;
 -- Låsordning: session -> kund -> skolor (scope) -> utbildning -> planer.
 o:=public.phase5_programplan_scope(null,offering_id);
 perform 1 from public.point_plans pp where pp.offering_id=o.id order by pp.id for update;
 select * into o from public.offerings where id=o.id;
 if command in ('delete','update') then perform public.phase5_programplan_writable(o,true);
 elsif o.organizer_id<>a.organizer_id or exists(select 1 from public.offering_units ou where ou.offering_id=o.id and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) then
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
 if command='units' then
  if not o.unit_id=any(unit_ids) then raise exception 'Invalid education command' using errcode='22023'; end if;
  if o.archived_at is not null then raise exception 'Programplan archived' using errcode='42501',hint='programplan_archived'; end if;
  select count(*)::integer into removed from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids);
  select count(*)::integer into added from unnest(unit_ids) u where not exists(select 1 from public.offering_units ou where ou.offering_id=o.id and ou.unit_id=u);
  if removed>0 and public.phase5_programplan_phase(o) is distinct from 'framtida' then raise exception 'Programplan started' using errcode='42501',hint='programplan_started'; end if;
  -- Varje ändrad skola kontrolleras igen med samma GY-/huvudmanna-/mandatregel.
  for school_id in select u from unnest(unit_ids) u where not exists(select 1 from public.offering_units ou where ou.offering_id=o.id and ou.unit_id=u)
   union select ou.unit_id from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids) order by 1 loop
   perform public.phase5_programplan_unit(school_id,true);
  end loop;
  -- FK skyddar också mot samtidiga referenser. Här får klienten en verksamhetsorsak.
  -- Före nästa migration saknar timplans unit_id; huvudskolan är då dess enda skola.
  if exists(select 1 from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids)
   and (exists(select 1 from public.school_classes c where c.offering_id=o.id and c.unit_id=ou.unit_id)
    or exists(select 1 from public.pupil_placements pl where pl.offering_id=o.id and pl.unit_id=ou.unit_id)
    or exists(select 1 from public.timplans t where t.offering_id=o.id and coalesce((to_jsonb(t)->>'unit_id')::uuid,o.unit_id)=ou.unit_id))) then
   raise exception 'Education in use' using errcode='55006',hint='programplan_in_use'; end if;
  if exists(select 1 from public.programplan_unit_packages up where up.offering_id=o.id and not up.unit_id=any(unit_ids) and exists(select 1 from jsonb_array_elements(up.selections) b where jsonb_array_length(b->'entries')>0)) then raise exception 'Education has package selections' using errcode='55006',hint='programplan_unit_packages_in_use';end if;
  -- Empty package rows are revision receipts, not a school dependency.
  delete from public.programplan_unit_packages up where up.offering_id=o.id and not up.unit_id=any(unit_ids);
  delete from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids);
  insert into public.offering_units(offering_id,unit_id,organizer_id) select o.id,u,o.organizer_id from unnest(unit_ids) u on conflict do nothing;
  update public.offerings set lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_units_changed';
 elsif command='archive' then
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
 perform public.phase5_programplan_lifecycle_audit(operation,o.id,case when command='units' then jsonb_build_object('added',added,'removed',removed) when command='update' then jsonb_build_object('startChanged',start_changed) else '{}'::jsonb end);
 return jsonb_build_object('offeringId',o.id,'command',command,'lifecycle',public.phase5_programplan_lifecycle(o));
end $function$
;
CREATE OR REPLACE FUNCTION public.phase5_replace_programplan_blocks(plan_id uuid, expected_revision integer, choice_blocks jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
 if exists(select 1 from public.programplan_unit_packages up cross join lateral jsonb_array_elements(up.selections) sel where up.plan_id=p.id and jsonb_array_length(sel->'entries')>0 and not exists(select 1 from jsonb_array_elements(reference->'choiceBlocks') nb join jsonb_array_elements(p.basis_reference->'choiceBlocks') ob on ob->>'id'=nb->>'id' where nb->>'id'=sel->>'blockId' and nb->'kind'=ob->'kind' and nb->'points'=ob->'points')) then raise exception 'Block has package selections' using errcode='55006',hint='programplan_block_packages_in_use';end if;
 -- The existing terms guard rejects deletion or reduction of an allocated frame.
 update public.point_plans set basis_reference=reference,revision=revision+1 where id=p.id;
 select coalesce(jsonb_agg(b->'id' order by n),'[]'::jsonb) into retired from jsonb_array_elements(p.basis_reference->'choiceBlocks') with ordinality oldblocks(b,n)
  where not exists(select 1 from jsonb_array_elements(reference->'choiceBlocks') v where v->>'id'=b->>'id');
 insert into public.point_plan_events(point_plan_id,actor_role,action,comment) values(p.id,'huvudman','programplan_blocks_changed',jsonb_build_object('retiredBlockIds',retired)::text);
 result:=public.phase5_programplan_result(p.id);perform public.phase5_programplan_audit(p.id,'programplan_blocks_changed');return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.phase5_clone_programplan_draft(source_plan_id uuid, expected_source_revision integer, expected_latest_version integer, explicit_legacy_basis jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; p public.point_plans; latest integer; created uuid; reference jsonb; distribution jsonb; result jsonb; previous_clone_context text; package_units integer;
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
 insert into public.programplan_unit_packages(plan_id,offering_id,unit_id,organizer_id,revision,selections,updated_by_assignment) select created,up.offering_id,up.unit_id,up.organizer_id,1,up.selections,(public.phase5_programplan_actor()).id from public.programplan_unit_packages up where up.plan_id=p.id;
 get diagnostics package_units=row_count;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(created,'huvudman','programplan_draft_cloned');
 result:=public.phase5_programplan_result(created)||jsonb_build_object('copiedPackageUnits',package_units); perform public.phase5_programplan_audit(created,'programplan_draft_cloned',p.id); return result;
end $function$
;
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
 metadata:=case when source_plan_id is null then '{}'::jsonb else jsonb_build_object('sourcePlanId',source_plan_id,'copiedPackageUnits',(select count(*) from public.programplan_unit_packages up where up.plan_id=phase5_programplan_audit.plan_id)) end;
 if source_plan_id is not null and not exists(select 1 from public.point_plans p join public.point_plans n on n.offering_id=p.offering_id and n.organizer_id=p.organizer_id where p.id=source_plan_id and n.id=plan_id and p.status in ('faststalld','ersatt')) then raise exception 'Programplan denied' using errcode='42501'; end if;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'programplan',plan_id,'ok',metadata);
 exception when others then raise exception 'Programplan audit unavailable' using errcode='55000'; end;
end $function$
;

create function public.phase5_programplan_languages() returns jsonb language sql immutable set search_path=pg_catalog,public as $function$ select '[{"code":"fr","name":"Franska"},{"code":"es","name":"Spanska"},{"code":"de","name":"Tyska"},{"code":"it","name":"Italienska"},{"code":"zh","name":"Kinesiska"},{"code":"ja","name":"Japanska"},{"code":"ru","name":"Ryska"},{"code":"ar","name":"Arabiska"},{"code":"pt","name":"Portugisiska"},{"code":"en","name":"Engelska"},{"code":"fi","name":"Finska"},{"code":"yi","name":"Jiddisch"},{"code":"fit","name":"Meänkieli"},{"code":"rom","name":"Romani chib"},{"code":"se","name":"Samiska"},{"code":"so","name":"Somaliska"},{"code":"fa","name":"Persiska"},{"code":"ku","name":"Kurdiska"},{"code":"tr","name":"Turkiska"},{"code":"pl","name":"Polska"},{"code":"uk","name":"Ukrainska"},{"code":"bs","name":"Bosniska"},{"code":"hr","name":"Kroatiska"},{"code":"sr","name":"Serbiska"},{"code":"sq","name":"Albanska"},{"code":"el","name":"Grekiska"},{"code":"ro","name":"Rumänska"},{"code":"hu","name":"Ungerska"},{"code":"vi","name":"Vietnamesiska"},{"code":"th","name":"Thailändska"},{"code":"ti","name":"Tigrinja"},{"code":"am","name":"Amhariska"},{"code":"ur","name":"Urdu"},{"code":"hi","name":"Hindi"},{"code":"bn","name":"Bengali"},{"code":"ta","name":"Tamil"},{"code":"ps","name":"Pashto"},{"code":"nl","name":"Nederländska"},{"code":"da","name":"Danska"},{"code":"no","name":"Norska"},{"code":"is","name":"Isländska"},{"code":"he","name":"Hebreiska"}]'::jsonb $function$;

create function public.phase5_programplan_ladders() returns jsonb language sql immutable set search_path=pg_catalog,public as $function$ select '[{"id":"modern","name":"Moderna språk","languageRequired":true,"languageCode":null,"steps":[{"subjectCode":"MODY","itemCode":"MODY1000X"},{"subjectCode":"MODG","itemCode":"MODG1000X"},{"subjectCode":"MODO","itemCode":"MODO1000X"},{"subjectCode":"MODO","itemCode":"MODO2000X"},{"subjectCode":"MODF","itemCode":"MODF1000X"},{"subjectCode":"MODF","itemCode":"MODF2000X"},{"subjectCode":"MODF","itemCode":"MODF3000X"}]},{"id":"sign","name":"Svenskt teckenspråk för hörande","languageRequired":false,"languageCode":null,"steps":[{"subjectCode":"SVEY","itemCode":"SVEY1000X"},{"subjectCode":"SVEG","itemCode":"SVEG1000X"},{"subjectCode":"SVEO","itemCode":"SVEO1000X"},{"subjectCode":"SVEO","itemCode":"SVEO2000X"},{"subjectCode":"SVEF","itemCode":"SVEF1000X"},{"subjectCode":"SVEF","itemCode":"SVEF2000X"},{"subjectCode":"SVEF","itemCode":"SVEF3000X"}]},{"id":"motherTongue","name":"Modersmål","languageRequired":true,"languageCode":null,"steps":[{"subjectCode":"MODE","itemCode":"MODE1000X"},{"subjectCode":"MODE","itemCode":"MODE2000X"},{"subjectCode":"MODE","itemCode":"MODE3000X"}]},{"id":"FINX","name":"Finska (FINX)","languageRequired":true,"languageCode":"fi","steps":[{"subjectCode":"FINX","itemCode":"FINX1000X"},{"subjectCode":"FINX","itemCode":"FINX2000X"},{"subjectCode":"FINX","itemCode":"FINX3000X"}]},{"id":"FINY","name":"Finska (FINY)","languageRequired":true,"languageCode":"fi","steps":[{"subjectCode":"FINY","itemCode":"FINY1000X"},{"subjectCode":"FINY","itemCode":"FINY2000X"},{"subjectCode":"FINY","itemCode":"FINY3000X"}]},{"id":"FINW","name":"Finska (FINW)","languageRequired":true,"languageCode":"fi","steps":[{"subjectCode":"FINW","itemCode":"FINW1000X"},{"subjectCode":"FINW","itemCode":"FINW2000X"},{"subjectCode":"FINW","itemCode":"FINW3000X"}]},{"id":"JIDX","name":"Jiddisch (JIDX)","languageRequired":true,"languageCode":"yi","steps":[{"subjectCode":"JIDX","itemCode":"JIDX1000X"},{"subjectCode":"JIDX","itemCode":"JIDX2000X"},{"subjectCode":"JIDX","itemCode":"JIDX3000X"}]},{"id":"JIDY","name":"Jiddisch (JIDY)","languageRequired":true,"languageCode":"yi","steps":[{"subjectCode":"JIDY","itemCode":"JIDY1000X"},{"subjectCode":"JIDY","itemCode":"JIDY2000X"},{"subjectCode":"JIDY","itemCode":"JIDY3000X"}]},{"id":"JIDW","name":"Jiddisch (JIDW)","languageRequired":true,"languageCode":"yi","steps":[{"subjectCode":"JIDW","itemCode":"JIDW1000X"},{"subjectCode":"JIDW","itemCode":"JIDW2000X"},{"subjectCode":"JIDW","itemCode":"JIDW3000X"}]},{"id":"MEAX","name":"Meänkieli (MEAX)","languageRequired":true,"languageCode":"fit","steps":[{"subjectCode":"MEAX","itemCode":"MEAX1000X"},{"subjectCode":"MEAX","itemCode":"MEAX2000X"},{"subjectCode":"MEAX","itemCode":"MEAX3000X"}]},{"id":"MEAY","name":"Meänkieli (MEAY)","languageRequired":true,"languageCode":"fit","steps":[{"subjectCode":"MEAY","itemCode":"MEAY1000X"},{"subjectCode":"MEAY","itemCode":"MEAY2000X"},{"subjectCode":"MEAY","itemCode":"MEAY3000X"}]},{"id":"MEAW","name":"Meänkieli (MEAW)","languageRequired":true,"languageCode":"fit","steps":[{"subjectCode":"MEAW","itemCode":"MEAW1000X"},{"subjectCode":"MEAW","itemCode":"MEAW2000X"},{"subjectCode":"MEAW","itemCode":"MEAW3000X"}]},{"id":"ROMX","name":"Romani chib (ROMX)","languageRequired":true,"languageCode":"rom","steps":[{"subjectCode":"ROMX","itemCode":"ROMX1000X"},{"subjectCode":"ROMX","itemCode":"ROMX2000X"},{"subjectCode":"ROMX","itemCode":"ROMX3000X"}]},{"id":"ROMY","name":"Romani chib (ROMY)","languageRequired":true,"languageCode":"rom","steps":[{"subjectCode":"ROMY","itemCode":"ROMY1000X"},{"subjectCode":"ROMY","itemCode":"ROMY2000X"},{"subjectCode":"ROMY","itemCode":"ROMY3000X"}]},{"id":"ROMW","name":"Romani chib (ROMW)","languageRequired":true,"languageCode":"rom","steps":[{"subjectCode":"ROMW","itemCode":"ROMW1000X"},{"subjectCode":"ROMW","itemCode":"ROMW2000X"},{"subjectCode":"ROMW","itemCode":"ROMW3000X"}]},{"id":"SAMX","name":"Samiska (SAMX)","languageRequired":true,"languageCode":"se","steps":[{"subjectCode":"SAMX","itemCode":"SAMX1000X"},{"subjectCode":"SAMX","itemCode":"SAMX2000X"},{"subjectCode":"SAMX","itemCode":"SAMX3000X"}]},{"id":"SAMY","name":"Samiska (SAMY)","languageRequired":true,"languageCode":"se","steps":[{"subjectCode":"SAMY","itemCode":"SAMY1000X"},{"subjectCode":"SAMY","itemCode":"SAMY2000X"},{"subjectCode":"SAMY","itemCode":"SAMY3000X"}]},{"id":"SAMW","name":"Samiska (SAMW)","languageRequired":true,"languageCode":"se","steps":[{"subjectCode":"SAMW","itemCode":"SAMW1000X"},{"subjectCode":"SAMW","itemCode":"SAMW2000X"},{"subjectCode":"SAMW","itemCode":"SAMW3000X"}]}]'::jsonb $function$;

-- Resolves and checks one entry. Missing allocation and frame mismatch remain analysis findings.
create function public.phase5_programplan_validate_selection(reference jsonb, block_id text, entry jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare b jsonb; r jsonb; payload jsonb; l jsonb; subject jsonb; item jsonb; ladder jsonb; start_index integer;
 step jsonb; n integer; total integer:=0; key text; keys text[]:='{}'; d jsonb; v jsonb; allocated integer; resolution jsonb;
begin
 perform public.phase5_programplan_require_current_shape(reference);
 resolution:=public.phase5_resolve_programplan_basis(reference);
 if resolution->>'status' is distinct from 'resolved' then raise exception 'Invalid package selection' using errcode='22023';end if;
 select value into b from jsonb_array_elements(reference->'choiceBlocks') where value->>'id'=block_id;
 if b is null or not public.phase5_programplan_shape(entry,array['ref','distribution'])
  or not public.phase5_programplan_array(entry->'distribution',200) then raise exception 'Invalid package selection' using errcode='22023';end if;
 r:=entry->'ref';
 if not public.phase5_programplan_shape(r,array['type','languageCode','levels']) or r->>'type' is distinct from 'language'
  or jsonb_typeof(r->'languageCode') not in ('null','string') or not public.phase5_programplan_array(r->'levels',7)
  or jsonb_array_length(r->'levels')=0 then raise exception 'Invalid language package' using errcode='22023';end if;
 if r->>'languageCode' is not null and not exists(select 1 from jsonb_array_elements(public.phase5_programplan_languages()) lang where lang->>'code'=r->>'languageCode') then
  raise exception 'Invalid language code' using errcode='22023';end if;
 -- Exactly one contiguous ladder, preserving supplied level order.
 for ladder in select value from jsonb_array_elements(public.phase5_programplan_ladders()) loop
  select ordinality::integer into start_index from jsonb_array_elements(ladder->'steps') with ordinality e(value,ordinality)
   where value->>'subjectCode'=r->'levels'->0->>'subjectCode' and value->>'itemCode'=r->'levels'->0->>'itemCode';
  if start_index is not null then exit;end if;
 end loop;
 if start_index is null or start_index+jsonb_array_length(r->'levels')-1>jsonb_array_length(ladder->'steps')
  or ((ladder->>'languageRequired')::boolean and r->>'languageCode' is null)
  or (not (ladder->>'languageRequired')::boolean and r->>'languageCode' is not null)
  or (ladder->>'languageCode' is not null and ladder->>'languageCode' is distinct from r->>'languageCode') then
  raise exception 'Invalid language ladder' using errcode='22023';end if;
 select c.payload into payload from public.programplan_catalogs c where c.catalog_id=reference->>'catalogId';
 n:=0;
 for l in select value from jsonb_array_elements(r->'levels') loop
  step:=ladder->'steps'->(start_index+n-1);n:=n+1;
  if not public.phase5_programplan_shape(l,array['subjectCode','subjectVersion','itemCode','points'])
   or not public.phase5_programplan_integer(l->'subjectVersion',1,100000)
   or l->>'subjectCode' is distinct from step->>'subjectCode' or l->>'itemCode' is distinct from step->>'itemCode' then raise exception 'Invalid language level' using errcode='22023';end if;
  select value into subject from jsonb_array_elements(payload->'subjects') where value->>'code'=l->>'subjectCode' and value->'version'=l->'subjectVersion';
  select value into item from jsonb_array_elements(coalesce(subject->'items','[]'::jsonb)) where value->>'code'=l->>'itemCode';
  if subject is null or item is null or item->'points' is distinct from l->'points'
   or not (subject->'schoolTypes' ? 'GY') or subject->>'typeOfSyllabus' is distinct from 'GRADE_SUBJECT_SYLLABUS'
   or subject->>'startDate' is null or subject->>'startDate'>reference->>'startedOn'
   or (subject->>'endDate' is not null and subject->>'endDate'<reference->>'startedOn')
   or (subject->>'canceledDate' is not null and subject->>'canceledDate'<=reference->>'startedOn') then raise exception 'Invalid language level' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(resolution->'basis'->'nationalBlocks') nb cross join lateral jsonb_array_elements(nb->'levels') fixed
   where fixed->>'subjectCode'=l->>'subjectCode' and fixed->'subjectVersion'=l->'subjectVersion' and fixed->>'itemCode'=l->>'itemCode')
   or exists(select 1 from jsonb_array_elements(resolution->'basis'->'selectedSpecialization') fixed where fixed->>'subjectCode'=l->>'subjectCode' and fixed->'subjectVersion'=l->'subjectVersion' and fixed->>'itemCode'=l->>'itemCode') then
   raise exception 'Package level already fixed' using errcode='22023';end if;
  if b->>'kind'='naturalScience' then raise exception 'Invalid block package kind' using errcode='22023';end if;
  if b->>'kind'='specialization' and not exists(select 1 from jsonb_array_elements(resolution->'basis'->'specializationOptions') opt where opt->>'subjectCode'=l->>'subjectCode' and opt->'subjectVersion'=l->'subjectVersion' and opt->>'itemCode'=l->>'itemCode') then
   raise exception 'Invalid block package level' using errcode='22023';end if;
  key:=(l->>'subjectCode')||':'||(l->>'subjectVersion')||':'||(l->>'itemCode'); keys:=array_append(keys,key);total:=total+(l->>'points')::integer;
 end loop;
 if total is distinct from (b->>'points')::integer then raise exception 'Package points differ from block' using errcode='22023';end if;
 keys:='{}';
 for d in select value from jsonb_array_elements(entry->'distribution') loop
  if not public.phase5_programplan_shape(d,array['levelKey','points']) or jsonb_typeof(d->'levelKey') is distinct from 'string'
   or not public.phase5_programplan_array(d->'points',6) or jsonb_array_length(d->'points')<>6 then raise exception 'Invalid package distribution' using errcode='22023';end if;
  key:=d->>'levelKey';
  if key=any(keys) then raise exception 'Duplicate package distribution' using errcode='22023';end if;keys:=array_append(keys,key);
  select value into l from jsonb_array_elements(r->'levels') lev(value) where (value->>'subjectCode')||':'||(value->>'subjectVersion')||':'||(value->>'itemCode')=key;
  if l is null then raise exception 'Unknown package level row' using errcode='22023';end if;
  allocated:=0;
  for v in select value from jsonb_array_elements(d->'points') loop
   if not public.phase5_programplan_integer(v,0,10000) then raise exception 'Invalid package points' using errcode='22023';end if;allocated:=allocated+(v#>>'{}')::integer;
  end loop;
  if allocated>(l->>'points')::integer then raise exception 'Package allocation exceeds level' using errcode='22023';end if;
 end loop;
 return jsonb_build_object('key','language:'||coalesce(r->>'languageCode','-')||':'||(select string_agg(lvl->>'itemCode','+' order by ordinality) from jsonb_array_elements(r->'levels') with ordinality e(lvl,ordinality)),
 'ref',r,'levels',r->'levels','points',total,'distribution',entry->'distribution');
end $$;

create function public.phase5_programplan_resolved_selections(plan_id uuid, unit_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.point_plans;up public.programplan_unit_packages;sel jsonb;e jsonb;entries jsonb;selections jsonb:='[]';
begin
 select * into p from public.point_plans where id=plan_id;
 if not found then raise exception 'Programplan denied' using errcode='42501';end if;
 select * into up from public.programplan_unit_packages x where x.plan_id=p.id and x.unit_id=phase5_programplan_resolved_selections.unit_id;
 for sel in select value from jsonb_array_elements(coalesce(up.selections,'[]'::jsonb)) loop
  entries:='[]';
  for e in select value from jsonb_array_elements(sel->'entries') loop entries:=entries||jsonb_build_array(public.phase5_programplan_validate_selection(p.basis_reference,sel->>'blockId',e));end loop;
  selections:=selections||jsonb_build_array(jsonb_build_object('blockId',sel->'blockId','entries',entries));
 end loop;
 return jsonb_build_object('planId',p.id,'unitId',unit_id,'revision',coalesce(up.revision,0),'selections',selections);
end $$;

create function public.phase5_programplan_unit_package_audit(plan_id uuid, operation text, unit_id uuid default null, revision integer default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if operation not in ('programplan_unit_packages_read','programplan_unit_packages_changed')
  or (operation='programplan_unit_packages_changed') is distinct from (unit_id is not null and revision is not null) then raise exception 'Invalid package audit' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'programplan',plan_id,'ok',
 case when unit_id is null then '{}'::jsonb else jsonb_build_object('unitId',unit_id,'packageRevision',revision) end);
 exception when others then raise exception 'Package audit unavailable' using errcode='55000';end;
end $$;

create function public.phase5_programplan_unit_package_result(plan_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('planId',p.id,'units',coalesce((select jsonb_agg(jsonb_build_object('unitId',ou.unit_id,'revision',coalesce(up.revision,0),'selections',coalesce(up.selections,'[]'::jsonb)) order by ou.unit_id)
 from public.offering_units ou left join public.programplan_unit_packages up on up.plan_id=p.id and up.unit_id=ou.unit_id where ou.offering_id=p.offering_id and ou.organizer_id=p.organizer_id),'[]'::jsonb)) from public.point_plans p where p.id=plan_id
$$;

create function public.phase5_read_programplan_unit_packages(plan_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.phase5_programplan_scope(plan_id);perform 1 from public.point_plans p where p.id=plan_id for share;
 result:=public.phase5_programplan_unit_package_result(plan_id);perform public.phase5_programplan_unit_package_audit(plan_id,'programplan_unit_packages_read');return result;
end $$;

create function public.phase5_write_programplan_unit_packages(plan_id uuid,unit_id uuid,expected_revision integer,block_id text,entries jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.offerings;a public.access_assignments;p public.point_plans;up public.programplan_unit_packages;
 e jsonb;resolved jsonb;keys text[]:='{}';selection jsonb;current_revision integer;result jsonb;
begin
 o:=public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for share;
 a:=public.phase5_programplan_actor();
 if not exists(select 1 from public.offering_units ou join public.mandate_units m on m.assignment_id=a.id and m.unit_id=ou.unit_id where ou.offering_id=o.id and ou.organizer_id=a.organizer_id and ou.unit_id=phase5_write_programplan_unit_packages.unit_id) then
  raise exception 'Package school denied' using errcode='42501',hint='programplan_mandate';end if;
 if o.archived_at is not null then raise exception 'Programplan archived' using errcode='42501',hint='programplan_archived';end if;
 if expected_revision is null or expected_revision<0 or expected_revision>2147483646 or not public.phase5_programplan_array(entries,200) then raise exception 'Invalid package selection' using errcode='22023';end if;
 perform public.phase5_programplan_require_current_shape(p.basis_reference);
 if not exists(select 1 from jsonb_array_elements(p.basis_reference->'choiceBlocks') b where b->>'id'=block_id) then raise exception 'Unknown package block' using errcode='22023';end if;
 -- Customer/scope locks precede share(plan), then serialize absent as well as existing school rows.
 perform pg_advisory_xact_lock(hashtextextended(p.id::text||':'||unit_id::text,523));
 select * into up from public.programplan_unit_packages x where x.plan_id=p.id and x.unit_id=phase5_write_programplan_unit_packages.unit_id for update;
 current_revision:=coalesce(up.revision,0);
 if current_revision<>expected_revision then raise exception 'Package revision conflict' using errcode='40001';end if;
 for e in select value from jsonb_array_elements(entries) loop
  resolved:=public.phase5_programplan_validate_selection(p.basis_reference,block_id,e);
  if resolved->>'key'=any(keys) then raise exception 'Duplicate package entry' using errcode='22023';end if;keys:=array_append(keys,resolved->>'key');
 end loop;
 select coalesce(jsonb_agg(s order by n),'[]'::jsonb) into selection from jsonb_array_elements(coalesce(up.selections,'[]'::jsonb)) with ordinality prior(s,n) where s->>'blockId'<>block_id;
 -- Preserve block order from the pinned plan; clearing retains the school revision receipt.
 if jsonb_array_length(entries)>0 then selection:=selection||jsonb_build_array(jsonb_build_object('blockId',block_id,'entries',entries));end if;
 select coalesce(jsonb_agg(s order by n),'[]'::jsonb) into selection from jsonb_array_elements(p.basis_reference->'choiceBlocks') with ordinality b(v,n) join jsonb_array_elements(selection) s on s->>'blockId'=v->>'id';
 insert into public.programplan_unit_packages(plan_id,offering_id,unit_id,organizer_id,revision,selections,updated_by_assignment)
 values(p.id,o.id,unit_id,o.organizer_id,current_revision+1,selection,a.id)
 on conflict on constraint programplan_unit_packages_pkey do update set revision=excluded.revision,selections=excluded.selections,updated_at=clock_timestamp(),updated_by_assignment=excluded.updated_by_assignment;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,a.function::text::public.app_role,'programplan_unit_packages_changed');
 result:=public.phase5_programplan_unit_package_result(p.id);perform public.phase5_programplan_unit_package_audit(p.id,'programplan_unit_packages_changed',unit_id,current_revision+1);return result;
end $$;

-- No new helper or entrypoint opens any role in the foundation migration.
revoke execute on function public.phase5_programplan_languages(),public.phase5_programplan_ladders(),public.phase5_programplan_validate_selection(jsonb,text,jsonb),public.phase5_programplan_resolved_selections(uuid,uuid),public.phase5_programplan_unit_package_audit(uuid,text,uuid,integer),public.phase5_programplan_unit_package_result(uuid),public.phase5_read_programplan_unit_packages(uuid),public.phase5_write_programplan_unit_packages(uuid,uuid,integer,text,jsonb) from public,anon,authenticated,service_role,skolplattform_worker;

-- Bind both table parent edges even for future internal maintenance commands.
create function public.phase5_programplan_unit_package_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if not exists(select 1 from public.point_plans p where p.id=new.plan_id and p.offering_id=new.offering_id and p.organizer_id=new.organizer_id) then raise exception 'Package plan relation denied' using errcode='42501';end if;
 return new;
end $$;
revoke execute on function public.phase5_programplan_unit_package_guard() from public,anon,authenticated,service_role,skolplattform_worker;
create trigger programplan_unit_packages_relation before insert or update on public.programplan_unit_packages for each row execute function public.phase5_programplan_unit_package_guard();
