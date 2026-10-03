-- 05-18: version-bound six-term allocations. Closed foundation: no new Worker grants.
alter table public.point_plans add column term_distribution jsonb not null default '[]'::jsonb
 check (jsonb_typeof(term_distribution)='array' and jsonb_array_length(term_distribution)<=2000);

create function public.phase5_programplan_term_rows(reference jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare resolution jsonb; payload jsonb; program jsonb; orientation jsonb; block jsonb; subject jsonb; level jsonb; selected jsonb;
 rows jsonb:='[]'; part text; key text;
begin
 resolution:=public.phase5_resolve_programplan_basis(reference);
 if resolution->>'status' is distinct from 'resolved' then raise exception 'Invalid programplan terms' using errcode='22023'; end if;
 select c.payload into payload from public.programplan_catalogs c where c.catalog_id=reference->>'catalogId';
 select value into program from jsonb_array_elements(payload->'programs') where value->>'code'=reference->'programRef'->>'code' and value->'version'=reference->'programRef'->'version';
 select value into orientation from jsonb_array_elements(program->'orientations') where value->>'code'=reference->>'orientationCode';
 foreach part in array array['foundation','programmeSpecific','orientation'] loop
  block:=case when part='orientation' then coalesce(orientation->'subjects','[]'::jsonb) else program->part end;
  for subject in select value from jsonb_array_elements(block) loop
   if subject->'optional'='false'::jsonb and subject->'subjectVersion'<>'null'::jsonb then
    for level in select value from jsonb_array_elements(subject->'levels') loop
     key:=part||':'||(subject->>'code')||':'||((subject->>'subjectVersion')::numeric::integer)::text||':'||(level->>'code');
     rows:=rows||jsonb_build_array(jsonb_build_object('key',key,'points',level->'points'));
    end loop;
   end if;
  end loop;
 end loop;
 for selected in select value from jsonb_array_elements(reference->'specializationRefs') loop
  key:='specialization:'||(selected->>'subjectCode')||':'||((selected->>'subjectVersion')::numeric::integer)::text||':'||(selected->>'itemCode');
  rows:=rows||jsonb_build_array(jsonb_build_object('key',key,'points',selected->'points'));
 end loop;
 return rows||'[{"key":"meta:individualChoice","points":200},{"key":"meta:diplomaWork","points":100}]'::jsonb;
end $$;
create function public.phase5_programplan_validate_terms(reference jsonb, distribution jsonb) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare rows jsonb; entry jsonb; cell jsonb; allowed jsonb; seen text[]:='{}'; key text; total integer;
begin
 if not public.phase5_programplan_array(distribution,2000) then raise exception 'Invalid programplan terms' using errcode='22023'; end if;
 -- Legacy plans can carry only the empty distribution until explicitly bound.
 if reference is null then
  if distribution<>'[]'::jsonb then raise exception 'Invalid programplan terms' using errcode='22023'; end if;
  return;
 end if;
 rows:=public.phase5_programplan_term_rows(reference);
 for entry in select value from jsonb_array_elements(distribution) loop
  if not public.phase5_programplan_shape(entry,array['rowKey','points']) or not public.phase5_programplan_text(entry->'rowKey',320)
   or not public.phase5_programplan_array(entry->'points',6) then raise exception 'Invalid programplan terms' using errcode='22023'; end if;
  if jsonb_array_length(entry->'points')<>6 then raise exception 'Invalid programplan terms' using errcode='22023'; end if;
  key:=entry->>'rowKey';
  if key=any(seen) then raise exception 'Invalid programplan terms' using errcode='22023'; end if;
  seen:=array_append(seen,key);
  select value into allowed from jsonb_array_elements(rows) where value->>'key'=key;
  if not found then raise exception 'Invalid programplan terms' using errcode='22023'; end if;
  total:=0;
  for cell in select value from jsonb_array_elements(entry->'points') loop
   if not public.phase5_programplan_integer(cell,0,10000) then raise exception 'Invalid programplan terms' using errcode='22023'; end if;
   total:=total+(cell#>>'{}')::integer;
  end loop;
  if total>(allowed->>'points')::integer then raise exception 'Invalid programplan terms' using errcode='22023'; end if;
 end loop;
end $$;
create function public.phase5_programplan_terms_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and new.term_distribution is distinct from old.term_distribution then
  if old.status<>'utkast' then raise exception 'Programplan version locked' using errcode='42501'; end if;
  if new.revision<>old.revision+1 then raise exception 'Programplan revision required' using errcode='40001'; end if;
 end if;
 -- Basis edits cannot orphan an allocated level. Clear the row explicitly first.
 perform public.phase5_programplan_validate_terms(new.basis_reference,new.term_distribution);
 return new;
end $$;
create trigger point_plans_programplan_terms_guard before insert or update on public.point_plans for each row execute function public.phase5_programplan_terms_guard();

create function public.phase5_programplan_terms_audit(plan_id uuid, operation text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; i public.identities; s public.app_sessions;
begin
 if operation is null or operation not in ('programplan_terms_read','programplan_terms_changed') then raise exception 'Invalid programplan operation' using errcode='22023'; end if;
 a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check(); perform public.phase5_programplan_scope(plan_id);
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'programplan',plan_id,'ok','{}'::jsonb);
 exception when others then raise exception 'Programplan audit unavailable' using errcode='55000'; end;
end $$;
create function public.phase5_read_programplan_terms(plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.point_plans; result jsonb;
begin
 perform public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for update;
 perform public.phase5_programplan_scope(p.id);
 perform public.phase5_programplan_validate_terms(p.basis_reference,p.term_distribution);
 result:=jsonb_build_object('planId',p.id,'revision',p.revision,'status',p.status,'distribution',p.term_distribution);
 perform public.phase5_programplan_terms_audit(p.id,'programplan_terms_read'); return result;
end $$;
create function public.phase5_write_programplan_terms(plan_id uuid, expected_revision integer, distribution jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.point_plans; result jsonb;
begin
 perform public.phase5_programplan_scope(plan_id);
 select * into p from public.point_plans where id=plan_id for update;
 perform public.phase5_programplan_scope(p.id);
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid programplan revision' using errcode='22023'; end if;
 if p.revision<>expected_revision then raise exception 'Programplan revision conflict' using errcode='40001'; end if;
 if p.status<>'utkast' or p.catalog_id is null then raise exception 'Programplan version locked' using errcode='42501'; end if;
 perform public.phase5_programplan_validate_terms(p.basis_reference,distribution);
 update public.point_plans set term_distribution=distribution,revision=revision+1 where id=p.id;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,'huvudman','programplan_terms_changed');
 result:=jsonb_build_object('planId',p.id,'revision',p.revision+1,'status',p.status,'distribution',distribution);
 perform public.phase5_programplan_terms_audit(p.id,'programplan_terms_changed'); return result;
end $$;

create or replace function public.phase5_programplan_event_actor() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions;
begin
 if new.action in ('programplan_basis_bound','programplan_specialization_changed','programplan_draft_created','programplan_draft_cloned','programplan_terms_changed') then
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

create or replace function public.phase5_clone_programplan_draft(source_plan_id uuid, expected_source_revision integer, expected_latest_version integer, explicit_legacy_basis jsonb default null) returns jsonb
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
  insert into public.point_plans(organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference,term_distribution)
  values(o.organizer_id,o.id,latest+1,'utkast',p.specialization,reference->>'catalogId',reference,p.term_distribution) returning id into created;
 exception when unique_violation then raise exception 'Programplan version conflict' using errcode='40001'; end;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(created,'huvudman','programplan_draft_cloned');
 result:=public.phase5_programplan_result(created); perform public.phase5_programplan_audit(created,'programplan_draft_cloned',p.id); return result;
end $$;

revoke all on function public.phase5_programplan_term_rows(jsonb),
 public.phase5_programplan_validate_terms(jsonb,jsonb),public.phase5_programplan_terms_guard(),
 public.phase5_programplan_terms_audit(uuid,text),public.phase5_read_programplan_terms(uuid),
 public.phase5_write_programplan_terms(uuid,integer,jsonb) from public,anon,authenticated,skolplattform_worker;
