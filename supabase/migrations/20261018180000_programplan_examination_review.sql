-- Dated school review for the national vocational cohort beginning HT 2028.
-- Internal planning evidence only: no fabricated official exam identifier or student result.
-- No historical rows/receipts are backfilled. Existing row identity and 100-point frame remain.
create function public.phase5_programplan_examination_valid(examination jsonb, program_code text, started_on text) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare text_length integer;
begin
 if not coalesce(program_code=any(array['BA25','BF25','EE25','FR25','FS25','FT25','HT25','IN25','NB25','RL25','VF25','VO25']) and started_on>='2028-07-02',false)
  or not public.phase5_programplan_shape(examination,array['model','appliesToStart','checkedOn','referenceUrl','referenceText']) then return false;end if;
 if examination->>'model' not in ('vocational_exam','diploma_work')
  or jsonb_typeof(examination->'model') is distinct from 'string'
  or not public.phase5_programplan_date(examination->'appliesToStart')
  or examination->>'appliesToStart' is distinct from started_on
  or not public.phase5_programplan_date(examination->'checkedOn') then return false;end if;
 if (examination->>'checkedOn')::date>public.phase5_programplan_today()
  or jsonb_typeof(examination->'referenceUrl') is distinct from 'string'
  or (select coalesce(sum(case when octet_length(c)=4 then 2 else 1 end),0) from regexp_split_to_table(examination->>'referenceUrl','') c)>1000
  or (examination->>'referenceUrl') !~* '^https://([a-z0-9-]+\.)*skolverket\.se([/?#][^[:space:]\\]*)?$'
  or examination->>'referenceUrl' ~ '[[:cntrl:]]'
  or jsonb_typeof(examination->'referenceText') is distinct from 'string'
  or examination->>'referenceText'='' or examination->>'referenceText' is distinct from btrim(examination->>'referenceText',E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)) then return false;end if;
 select coalesce(sum(case when octet_length(c)=4 then 2 else 1 end),0)::integer into text_length from regexp_split_to_table(examination->>'referenceText','') c;
 return text_length between 1 and 2000;
exception when others then return false;
end $$;

CREATE OR REPLACE FUNCTION public.phase5_resolve_programplan_basis(reference jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare cat jsonb; cid text; pr jsonb; p jsonb; o jsonb; selected jsonb; s jsonb; i jsonb; block jsonb; b jsonb; l jsonb; block_id text;
 reason text; started text; diagnostics jsonb:='[]'; unresolved jsonb:='[]'; fixed text[]:='{}'; seen text[]:='{}'; options jsonb:='[]'; base jsonb; handled boolean;
begin
 if jsonb_typeof(reference) is distinct from 'object' or not reference ? 'catalogId' or not reference ? 'programRef' then return public.phase5_programplan_blocked('unpinned_basis'); end if;
 if not reference ? 'startedOn' or reference->'startedOn'='null'::jsonb or reference->>'startedOn'='' then return public.phase5_programplan_blocked('unknown_education_start'); end if;
 if not public.phase5_programplan_shape(reference-'examination',array['catalogId','programRef','orientationCode','startedOn','specializationRefs'])
  and not public.phase5_programplan_shape(reference-'examination',array['catalogId','programRef','orientationCode','startedOn','specializationRefs','choiceBlocks']) then return public.phase5_programplan_blocked('invalid_basis_reference'); end if;
 if jsonb_typeof(reference->'catalogId') is distinct from 'string' or reference->>'catalogId' !~ '^sha256:[0-9a-f]{64}$' then return public.phase5_programplan_blocked('invalid_catalog_id'); end if;
 if reference ? 'examination' and not public.phase5_programplan_examination_valid(reference->'examination',reference#>>'{programRef,code}',reference->>'startedOn') then return public.phase5_programplan_blocked('invalid_basis_reference');end if;
 cid:=reference->>'catalogId'; pr:=reference->'programRef';
 if not public.phase5_programplan_shape(pr,array['code','version']) or not public.phase5_programplan_code(pr->'code') or not public.phase5_programplan_integer(pr->'version',1,100000)
  or not (reference->'orientationCode'='null'::jsonb or public.phase5_programplan_code(reference->'orientationCode'))
  or not public.phase5_programplan_date(reference->'startedOn') or not public.phase5_programplan_array(reference->'specializationRefs',200) then return public.phase5_programplan_blocked('invalid_basis_reference',cid); end if;
 for selected in select value from jsonb_array_elements(reference->'specializationRefs') loop
  if not public.phase5_programplan_shape(selected,array['subjectCode','subjectVersion','itemCode','points']) or not public.phase5_programplan_code(selected->'subjectCode')
   or not public.phase5_programplan_code(selected->'itemCode') or not public.phase5_programplan_integer(selected->'subjectVersion',1,100000) or not public.phase5_programplan_integer(selected->'points',0,10000) then return public.phase5_programplan_blocked('invalid_basis_reference',cid); end if;
 end loop;
 select payload into cat from public.programplan_catalogs where catalog_id=cid;
 if not found then return public.phase5_programplan_blocked('catalog_unavailable',cid,pr); end if;
 select value into p from jsonb_array_elements(cat->'programs') where value->>'code'=pr->>'code';
 if p is null then return public.phase5_programplan_blocked('program_not_found',cid,pr); end if;
 if p->'version' is distinct from pr->'version' then return public.phase5_programplan_blocked('historical_version_missing',cid,pr); end if;
 started:=reference->>'startedOn'; reason:=public.phase5_programplan_date_diagnostic(p,started);
 if reason is not null then return public.phase5_programplan_blocked(reason,cid,pr); end if;
 if reference->'orientationCode'<>'null'::jsonb then
  select value into o from jsonb_array_elements(p->'orientations') where value->>'code'=reference->>'orientationCode';
  if o is null then return public.phase5_programplan_blocked('orientation_not_found',cid,pr); end if;
 elsif jsonb_array_length(p->'orientations')>0 then return public.phase5_programplan_blocked('orientation_required',cid,pr); end if;
 diagnostics:=diagnostics||public.phase5_programplan_choice_block_diagnostics(reference);
 for block_id,block in select 'foundation',p->'foundation' union all select 'programmeSpecific',p->'programmeSpecific' union all select 'orientation',o->'subjects' where o is not null loop
  for b in select value from jsonb_array_elements(block) loop
   base:=jsonb_build_object('blockId',block_id,'subjectCode',b->>'code','points',b->'points');
   handled:=reference ? 'choiceBlocks' and (
    (b->>'code' in ('MOSP','SPRK','NAVE') and jsonb_array_length(b->'levels')=0)
    or exists(select 1 from jsonb_array_elements(public.phase5_programplan_alternative_groups(block)) g,lateral jsonb_array_elements(g) x where x->>'code'=b->>'code'));
   if (b->>'optional')::boolean and not handled then unresolved:=unresolved||jsonb_build_array(base||jsonb_build_object('kind','optional_subject')); end if;
   if jsonb_array_length(b->'levels')=0 then
    if not handled then unresolved:=unresolved||jsonb_build_array(base||jsonb_build_object('kind','subject_levels_unresolved')); end if;
    continue; end if;
   select value into s from jsonb_array_elements(cat->'subjects') where value->>'code'=b->>'code' and value->'version'=b->'subjectVersion';
   if s is null then diagnostics:=diagnostics||jsonb_build_array(jsonb_build_object('code','historical_version_missing','subjectCode',b->>'code','blockId',block_id)); continue; end if;
   diagnostics:=diagnostics||public.phase5_programplan_subject_diagnostics(s,started,block_id);
   for l in select value from jsonb_array_elements(b->'levels') loop fixed:=array_append(fixed,l->>'code'); end loop;
  end loop;
 end loop;
 for b in select value from jsonb_array_elements(p->'specialization') loop
  if jsonb_array_length(b->'levels')=0 then unresolved:=unresolved||jsonb_build_array(jsonb_build_object('kind','subject_levels_unresolved','blockId','specialization','subjectCode',b->>'code','points',b->'points')); continue; end if;
  select value into s from jsonb_array_elements(cat->'subjects') where value->>'code'=b->>'code' and value->'version'=b->'subjectVersion';
  if s is null then diagnostics:=diagnostics||jsonb_build_array(jsonb_build_object('code','historical_version_missing','subjectCode',b->>'code','blockId','specialization')); continue; end if;
  for l in select value from jsonb_array_elements(b->'levels') loop
   if not l->>'code'=any(fixed) then options:=options||jsonb_build_array(jsonb_build_object('subjectCode',s->>'code','subjectVersion',s->'version','itemCode',l->>'code','points',l->'points')); end if;
  end loop;
 end loop;
 for selected in select value from jsonb_array_elements(reference->'specializationRefs') loop
  base:=jsonb_build_object('subjectCode',selected->>'subjectCode','itemCode',selected->>'itemCode');
  if selected->>'itemCode'=any(seen) then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','duplicate_selected_level')); continue; end if;
  seen:=array_append(seen,selected->>'itemCode');
  select value into s from jsonb_array_elements(cat->'subjects') where value->>'code'=selected->>'subjectCode';
  if s is null then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','subject_not_found')); continue; end if;
  if s->'version' is distinct from selected->'subjectVersion' then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','historical_version_missing')); continue; end if;
  diagnostics:=diagnostics||public.phase5_programplan_subject_diagnostics(s,started,'specialization');
  select value into i from jsonb_array_elements(s->'items') where value->>'code'=selected->>'itemCode';
  if i is null then
   reason:=case when exists(select 1 from jsonb_array_elements(cat->'subjects') a, lateral jsonb_array_elements(a->'items') x where x->>'code'=selected->>'itemCode') then 'wrong_subject' else 'item_not_found' end;
   diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code',reason)); continue;
  end if;
  if i->'points' is distinct from selected->'points' then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','points_mismatch')); continue; end if;
  if i->>'code'=any(fixed) then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','fixed_level_duplicate')); continue; end if;
  if not options @> jsonb_build_array(selected) then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','not_specialization_option')); end if;
 end loop;
 unresolved:=unresolved||jsonb_build_array(jsonb_build_object('kind','program_rules_unverified','blockId','program','category',p->>'category'));
 return jsonb_build_object('status',case when jsonb_array_length(diagnostics)=0 then 'resolved' else 'blocked' end,'catalogId',cid,'programRef',pr,'diagnostics',diagnostics,'unresolvedChoices',unresolved,'decisionReady',false);
end $function$;

CREATE OR REPLACE FUNCTION public.phase5_programplan_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; choices text[]; additions jsonb; source_id uuid; source public.point_plans;
begin
 if tg_op='UPDATE' and public.phase5_plan_decision_permitted('programplan',old.id,old.status::text,new.status::text,old.revision) then
  if (to_jsonb(new)-'status'-'revision'-'decided_on'-'decided_identity_id'-'updated_at')
   is distinct from (to_jsonb(old)-'status'-'revision'-'decided_on'-'decided_identity_id'-'updated_at')
   or new.revision<>old.revision+1
   or not ((old.status='utkast' and new.status='faststalld' and new.decided_on is not distinct from public.phase5_programplan_today()
     and new.decided_identity_id is not distinct from public.current_identity_id())
    or (old.status='faststalld' and new.status='ersatt' and new.decided_on is not distinct from old.decided_on
     and new.decided_identity_id is not distinct from old.decided_identity_id)) then
   raise exception 'Invalid program decision transition' using errcode='42501';end if;
  return new;
 end if;
 if (tg_op='INSERT' and new.decided_identity_id is not null)
 or (tg_op='UPDATE' and new.decided_identity_id is distinct from old.decided_identity_id) then
  raise exception 'Program decision identity locked' using errcode='42501';end if;
 if tg_op='UPDATE' and exists(select 1 from public.plan_decision_reviews r where r.kind='programplan' and r.plan_id=old.id and r.stage='submitted')
 and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
  raise exception 'Programplan submitted for review' using errcode='42501',hint='programplan_submitted';end if;
 -- A changed occupational path needs a fresh dated review; no-op edits preserve it.
 if tg_op='UPDATE' and old.catalog_id is not null and
  (new.basis_reference->'specializationRefs' is distinct from old.basis_reference->'specializationRefs'
   or new.basis_reference->'choiceBlocks' is distinct from old.basis_reference->'choiceBlocks'
   or new.basis_reference->'startedOn' is distinct from old.basis_reference->'startedOn') then
  new.basis_reference:=new.basis_reference-'examination';
 end if;
 if tg_op='UPDATE' and old.catalog_id is not null then
  if new.id is distinct from old.id or new.organizer_id is distinct from old.organizer_id or new.offering_id is distinct from old.offering_id
   or new.version is distinct from old.version or new.catalog_id is distinct from old.catalog_id or new.status is distinct from old.status
   or new.decided_on is distinct from old.decided_on or new.decided_by is distinct from old.decided_by or new.created_by is distinct from old.created_by
   or new.created_at is distinct from old.created_at or new.catalog_fetched is distinct from old.catalog_fetched
   or (new.basis_reference-'specializationRefs'-'startedOn'-'choiceBlocks'-'examination') is distinct from (old.basis_reference-'specializationRefs'-'startedOn'-'choiceBlocks'-'examination') then
   raise exception 'Programplan version locked' using errcode='42501'; end if;
  if old.status<>'utkast' and (new.basis_reference is distinct from old.basis_reference or new.specialization is distinct from old.specialization or new.revision is distinct from old.revision) then
   raise exception 'Programplan version locked' using errcode='42501'; end if;
  if (new.basis_reference is distinct from old.basis_reference or new.specialization is distinct from old.specialization) and new.revision<>old.revision+1 then
   raise exception 'Programplan revision required' using errcode='40001'; end if;
  if new.revision<old.revision then raise exception 'Programplan revision conflict' using errcode='40001'; end if;
 end if;
 if new.catalog_id is null and new.basis_reference is null then return new; end if;
 if new.catalog_id is null or new.basis_reference is null or new.catalog_id is distinct from new.basis_reference->>'catalogId' then raise exception 'Invalid programplan binding' using errcode='22023'; end if;
 if tg_op='UPDATE' and old.catalog_id is null and new.basis_reference ? 'examination' then
  raise exception 'Save examination review separately after binding the draft' using errcode='22023';end if;
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
   if new.basis_reference ? 'examination' then raise exception 'Save examination review separately after creating the draft' using errcode='22023';end if;
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

CREATE OR REPLACE FUNCTION public.phase5_programplan_event_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; s public.app_sessions; metadata jsonb; item jsonb;
begin
 if new.action in ('programplan_basis_bound','programplan_specialization_changed','programplan_blocks_changed','programplan_examination_changed','programplan_draft_created','programplan_draft_cloned','programplan_terms_changed','programplan_unit_packages_changed') then
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

CREATE OR REPLACE FUNCTION public.phase5_programplan_audit(plan_id uuid, operation text, source_plan_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; i public.identities; s public.app_sessions; metadata jsonb;
begin
 if operation is null or operation not in ('programplan_read','programplan_basis_bound','programplan_specialization_changed','programplan_blocks_changed','programplan_examination_changed','programplan_draft_created','programplan_draft_cloned')
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

create function public.phase5_set_programplan_examination(target_plan uuid, expected_revision integer, examination jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings;p public.point_plans;result jsonb;
begin
 o:=public.phase5_programplan_scope(target_plan);
 select * into p from public.point_plans where id=target_plan for update;
 o:=public.phase5_programplan_scope(target_plan);
 perform public.phase5_programplan_writable(o,false);
 if expected_revision is null or expected_revision<0 then raise exception 'Invalid programplan revision' using errcode='22023';end if;
 if p.revision<>expected_revision or p.status<>'utkast' then raise exception 'Programplan version conflict' using errcode='40001';end if;
 if p.catalog_id is null or not public.phase5_programplan_examination_valid(examination,p.basis_reference#>>'{programRef,code}',p.basis_reference->>'startedOn') then
  raise exception 'Invalid examination review' using errcode='22023';end if;
 -- Only this immutable version's examination evidence and CAS revision change.
 update public.point_plans set basis_reference=jsonb_set(basis_reference,'{examination}',examination),revision=revision+1 where id=p.id;
 insert into public.point_plan_events(point_plan_id,actor_role,action) values(p.id,'huvudman','programplan_examination_changed');
 result:=public.phase5_programplan_result(p.id);
 perform public.phase5_programplan_audit(p.id,'programplan_examination_changed');return result;
exception when insufficient_privilege then raise;
 when check_violation or not_null_violation or foreign_key_violation then raise exception 'Programplan audit unavailable' using errcode='55000';
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
 reference:=jsonb_set(reference-'examination','{startedOn}',to_jsonb(to_char(started,'YYYY-MM-DD')));
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

create or replace function public.phase5_plan_decision_source_blockers(source jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare issues jsonb:='[]';catalog jsonb;program jsonb;started date;
begin
 if source is null or source='null'::jsonb or source->'basisReference' is null or source->'basisReference'='null'::jsonb then
 return jsonb_build_array('Programplanen saknar ett versionsbundet underlag.');end if;
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select value into program from jsonb_array_elements(catalog->'programs')
 where value->>'code'=source->'basisReference'->'programRef'->>'code'
 and value->'version'=source->'basisReference'->'programRef'->'version';
 begin started:=(source->'basisReference'->>'startedOn')::date;
 exception when others then started:=null;end;
 if public.phase5_plan_decision_profile(source)->'vocational'='true'::jsonb and started>=date '2028-07-02'
 and not public.phase5_programplan_examination_valid(source#>'{basisReference,examination}',source#>>'{basisReference,programRef,code}',source#>>'{basisReference,startedOn}') then
 issues:=issues||jsonb_build_array('Granska examensformen för den här elevkullen. Välj yrkesprov om ett tillämpligt prov finns hos Skolverket, annars gymnasiearbete. Spara valet med källa och kontrolldatum innan planen skickas till huvudmannen.');end if;
 if public.phase5_plan_decision_profile(source) is null or started is null or started<date '2025-07-01'
 or program->>'startDate' is null or started<(program->>'startDate')::date
 or (program->>'endDate' is not null and started>(program->>'endDate')::date)
 or (program->>'canceledDate' is not null and started>=(program->>'canceledDate')::date) then
 issues:=issues||jsonb_build_array('Beslutsreglerna är inte verifierade för den här programtypen och elevkullen.');end if;
 begin
  perform public.phase5_gym_timplan_require_source(source||jsonb_build_object('status','utkast','archived',false));
 exception when sqlstate '22023' or sqlstate '40001' then
  issues:=issues||jsonb_build_array('Programplanens ämnen, poängram och terminsfördelning måste vara fullständiga.');
 end;
 return issues;
end $$;

create or replace function public.phase5_plan_decision_detail(target_kind text,target_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;o public.offerings;p public.point_plans;t public.timplans;
 review public.plan_decision_reviews;source jsonb;current_source jsonb;catalog jsonb;hours jsonb:='[]';
 stage text;revision integer;version integer;school_name text;unit_id uuid;actions jsonb:='[]';
 blockers jsonb:='[]';checks jsonb;history jsonb;links jsonb;basis_hash text;next_actor text;
 can_write boolean:=false;total_hours bigint;missing boolean;source_info text;profile jsonb;series jsonb;apl jsonb;time_rows jsonb;total_minutes bigint;apl_minutes bigint;v2 boolean:=false;
begin
 if target_kind is null or target_kind not in ('programplan','timplan') or target_id is null then
 raise exception 'Invalid plan decision read' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();
 if target_kind='programplan' then
  o:=public.phase5_programplan_scope(target_id);
  select * into p from public.point_plans where id=target_id for update;
  o:=public.phase5_programplan_scope(target_id);a:=public.phase5_programplan_actor();
  source:=public.phase5_gym_timplan_source(p.id);current_source:=source;
  stage:=case p.status when 'faststalld' then 'approved' when 'ersatt' then 'replaced' else 'draft' end;
  revision:=p.revision;version:=p.version;
  select * into review from public.plan_decision_reviews where kind=target_kind and plan_id=target_id for update;
  if p.status='utkast' and review.stage in ('submitted','returned') then stage:=review.stage;end if;
  can_write:=a.function in ('huvudman','rektor') and o.archived_at is null
   and public.phase5_programplan_phase(o)='framtida'
   and not exists(select 1 from public.offering_units ou where ou.offering_id=o.id
    and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id));
  if can_write then
   if stage in ('draft','returned') and a.function='rektor' then actions:='["submit"]';end if;
   if stage='submitted' and a.function='rektor' then actions:='["withdraw"]';end if;
   if stage='draft' and a.function='huvudman' then actions:='["approve"]';end if;
   if stage='submitted' and a.function='huvudman' then actions:='["return","approve"]';end if;
  end if;
  if public.phase5_programplan_phase(o)<>'framtida' then blockers:=blockers||jsonb_build_array('Programplanen är låst eftersom elevkullen har startat eller startläget är okänt.');end if;
  checks:=jsonb_build_array(jsonb_build_object('id','structure','label','Jag har granskat att programstruktur, nivåer och terminsordning gäller elevkullen.'),
   jsonb_build_object('id','choices','label','Jag har granskat att alternativa ämnen och valbara ramar ger varje elev en fullständig studiegång.'));
 else
  select * into t from public.timplans where id=target_id;
  if t.id is null or t.gym_basis is null then raise exception 'Plan decision denied' using errcode='42501';end if;
  o:=public.phase5_gym_timplan_scope(t.offering_id,t.unit_id,false);
  -- Keep established program-before-timplan order, including concurrent source decisions.
  perform 1 from public.point_plans where id=t.source_programplan_id for update;
  perform 1 from public.timplan_series where id=t.series_id for update;
  series:=public.phase5_named_timplan_series_json(t.series_id);
  select * into t from public.timplans where id=target_id for update;
  o:=public.phase5_gym_timplan_scope(t.offering_id,t.unit_id,false);a:=public.phase5_programplan_actor();
  source:=t.gym_basis;current_source:=public.phase5_gym_timplan_source(t.source_programplan_id);
  revision:=t.revision;version:=t.version;unit_id:=t.unit_id;
  select name into school_name from public.school_units where id=t.unit_id;
  stage:=case t.status when 'forslag' then 'submitted' when 'atersand' then 'returned' when 'faststalld' then 'approved' when 'ersatt' then 'replaced' else 'draft' end;
  select * into review from public.plan_decision_reviews where kind=target_kind and plan_id=target_id for update;
  if o.archived_at is null then
   if stage in ('draft','returned') and a.function in ('rektor','administrator') then actions:='["submit"]';end if;
   if stage='submitted' and a.function in ('rektor','administrator') then actions:='["withdraw"]';end if;
   if stage='submitted' and a.function='huvudman' then actions:='["return","approve"]';end if;
  end if;
  v2:=exists(select 1 from public.timplan_time_models where plan_id=t.id);
  if v2 then
   profile:=public.phase5_plan_decision_profile(source);
   time_rows:=public.phase5_timplan_time_rows(t.id);
   if exists(select 1 from public.timplan_time_models m cross join lateral jsonb_array_elements(m.copy_review) r where m.plan_id=t.id and r->'resolution'='null'::jsonb) then
    blockers:=blockers||jsonb_build_array('Kopieringen har tidsrader som behöver granskas innan timplanen godkänns.');end if;
   select coalesce(sum((v#>>'{}')::bigint),0) into total_minutes from jsonb_each(time_rows) r cross join lateral jsonb_array_elements((r.value->'schoolMinutes')||(r.value->'annualAplMinutes')) v;
   missing:=exists(select 1 from jsonb_array_elements(source->'distribution') d cross join generate_series(0,5) i where (d->'points'->>i)::integer>0 and time_rows->(d->>'rowKey')->'schoolMinutes'->>i is null)
    or (profile->'vocational'='true'::jsonb and exists(select 1 from jsonb_array_elements(source->'distribution') d cross join generate_series(0,2) i where ((d->'points'->>(i*2))::integer>0 or (d->'points'->>(i*2+1))::integer>0) and time_rows->(d->>'rowKey')->'annualAplMinutes'->>i is null))
    or exists(select 1 from jsonb_each(time_rows) r where (select coalesce(sum((v#>>'{}')::bigint),0) from jsonb_array_elements((r.value->'schoolMinutes')||(r.value->'annualAplMinutes')) v)=0);
   if (select count(*) from jsonb_object_keys(time_rows))<>jsonb_array_length(source->'rows') or missing then blockers:=blockers||jsonb_build_array('Fördela undervisningstiden i alla aktiva terminsfält innan timplanen skickas för godkännande.');end if;
   profile:=public.phase5_plan_decision_profile(source);
   if profile is not null and total_minutes<(profile->>'hours')::bigint*60 then blockers:=blockers||jsonb_build_array('Timplanen innehåller färre än '||replace(to_char((profile->>'hours')::integer,'FM9 999'),chr(160),' ')||' planerade undervisningstimmar.');end if;
  else
  select coalesce(jsonb_agg(jsonb_build_object('rowKey',c.row_id,'hours',
   (select jsonb_agg(case when c.allocated[n] then to_jsonb(c.hours[n]) else 'null'::jsonb end order by n) from generate_series(1,6) n)) order by c.row_id),'[]')
   into hours from public.timplan_cells c where c.timplan_id=t.id;
  select coalesce(sum(c.hours[n]),0),coalesce(bool_or((d->'points'->>(n-1))::integer>0 and not c.allocated[n]),false)
   into total_hours,missing from public.timplan_cells c
   cross join lateral jsonb_array_elements(t.gym_basis->'distribution') d cross join generate_series(1,6) n
   where c.timplan_id=t.id and d->>'rowKey'=c.row_id;
  if jsonb_array_length(hours)<>jsonb_array_length(source->'rows') or missing
   or exists(select 1 from public.timplan_cells c where c.timplan_id=t.id and (select coalesce(sum(v),0) from unnest(c.hours) v)=0) then
   blockers:=blockers||jsonb_build_array('Fördela undervisningstiden i alla aktiva terminsfält innan timplanen skickas för godkännande.');end if;
  profile:=public.phase5_plan_decision_profile(source);
  if profile is not null and total_hours<(profile->>'hours')::integer then
   blockers:=blockers||jsonb_build_array('Timplanen innehåller färre än '||replace(to_char((profile->>'hours')::integer,'FM9 999'),chr(160),' ')||' planerade undervisningstimmar.');end if;
  end if;
  -- The table reserves a minimum APL budget. Detailed periods remain a later process.
  if profile->'vocational'='true'::jsonb then
   if not v2 then
    blockers:=blockers||jsonb_build_array('Byt till timtabellen med separat APL per årskurs innan timplanen skickas för godkännande.');
   else
    select coalesce(sum((v#>>'{}')::bigint),0) into apl_minutes from jsonb_each(time_rows) r cross join lateral jsonb_array_elements(r.value->'annualAplMinutes') v;
    if apl_minutes<20700 then blockers:=blockers||jsonb_build_array('Planera minst 345 timmar APL i timplanen. Perioder och veckor planeras senare.');end if;
   end if;
  end if;
  if current_source->>'status' is distinct from 'faststalld' then blockers:=blockers||jsonb_build_array('Huvudmannen behöver först fastställa timplanens programplansversion.');end if;
  if public.phase5_plan_decision_source_content(source) is distinct from public.phase5_plan_decision_source_content(current_source) then
   blockers:=blockers||jsonb_build_array('Programplanens innehåll har ändrats. Skapa en ny timplansversion från det aktuella underlaget.');end if;
  checks:=jsonb_build_array(jsonb_build_object('id','teacher-led','label','Jag har granskat att timmarna avser undervisning och att annan aktivitet inte räknas som undervisningstid.'),
   jsonb_build_object('id','choice-paths','label','Jag har granskat att alla möjliga ämnesval och alternativa studiegångar får minst den garanterade undervisningstiden.'));
  source_info:='Programplan version '||(source->>'version')||' · fryst revision '||(source->>'revision');
 end if;
 profile:=public.phase5_plan_decision_profile(source);
 if profile->'vocational'='true'::jsonb then
  checks:=checks||jsonb_build_array(
   jsonb_build_object('id','eligibility','label','Jag har kontrollerat att engelska nivå 1–2 och svenska eller svenska som andraspråk nivå 1–3 ingår i den gemensamma planen. Individuella bortval hanteras separat.'),
   jsonb_build_object('id',case when target_kind='programplan' then 'apl' else 'apl-budget' end,'label',case when target_kind='programplan' then 'APL:s omfattning och förläggning ska granskas separat efter timplanen.' else 'Jag har granskat den planerade APL-tiden i timplanens total. Perioder och förläggning granskas separat.' end));
 end if;
 if o.archived_at is not null then blockers:=blockers||jsonb_build_array('Utbildningen är arkiverad.');end if;
 blockers:=blockers||public.phase5_plan_decision_source_blockers(source);

 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select coalesce(jsonb_agg(jsonb_build_object('unitId',ou.unit_id,'organizerId',ou.organizer_id) order by ou.unit_id),'[]') into links
  from public.offering_units ou where ou.offering_id=o.id;
 select coalesce(jsonb_agg(jsonb_build_object('action',h.action,'at',h.occurred_at,'actorName',h.actor_name,'comment',h.comment,'nameAtDecision',h.name_at_decision) order by h.occurred_at desc,h.id desc),'[]')
  into history from (select * from public.plan_decision_history h where h.kind=target_kind and h.plan_id=target_id and h.organizer_id=o.organizer_id order by occurred_at desc,id desc limit 1000) h;
 basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('rules',case when source#>'{basisReference,examination}' is not null then 'gy25-examination-review-2026-10-18-v1' when target_kind='timplan' then 'gy25-timetable-apl-minimum-2026-10-18-v1' else 'gy25-national-programs-2026-10-12-v2' end,
  'kind',target_kind,'planId',target_id,'revision',revision,'source',source,'currentSource',current_source,
  'hours',hours,'stage',stage,'decisionRevision',coalesce(review.revision,0),'links',links,
  'educationRevision',o.lifecycle_revision,'archived',o.archived_at,'phase',public.phase5_programplan_phase(o))::text,'UTF8')),'hex');
 if target_kind='timplan' then
  basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('basisHash',basis_hash,'series',series)::text,'UTF8')),'hex');
 end if;
 if v2 then basis_hash:='sha256:'||encode(sha256(convert_to(public.phase5_apl_canonical(jsonb_build_array('time_decision_v2',basis_hash,time_rows::text,(select copy_review::text from public.timplan_time_models where plan_id=target_id))),'UTF8')),'hex');end if;

 next_actor:=case when stage='submitted' or (a.function='huvudman' and actions ? 'approve' and jsonb_array_length(blockers)=0) then 'huvudman' when stage in ('draft','returned') then 'rektor' else null end;
 return jsonb_build_object('contractVersion',case when target_kind='timplan' then 'timetable_decision_v2' else 'apl_decision_v1' end,'apl',null,'series',series,'kind',target_kind,'planId',target_id,'offeringId',o.id,'unitId',unit_id,
  'educationName',o.name,'schoolName',school_name,'version',version,'stage',stage,'nextActor',next_actor,
  'revision',revision,'decisionRevision',coalesce(review.revision,0),'basisHash',basis_hash,'actions',actions,
  'blockers',blockers,'checks',checks,'history',history,'sourceInfo',source_info,'source',source,'catalog',catalog) || case when source#>'{basisReference,examination}' is not null then jsonb_build_object('examination',source#>'{basisReference,examination}') else '{}'::jsonb end || case when v2 then jsonb_build_object('timeModel','school_terms_annual_apl_v2','timeRows',time_rows,'timeCopyReview',(select copy_review from public.timplan_time_models where plan_id=target_id)) else jsonb_build_object('hours',hours) end;
end $$;

create or replace function public.phase5_apl_hash_payload(gym jsonb,organizer uuid,apl jsonb,reviews jsonb,program jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare source_data jsonb:=gym->'source'; basis_data jsonb:=gym->'source'->'basisReference';
 row_data jsonb; row_key text; row_part text; row_kind text; block_kind text; block_count integer;
 row_terms jsonb; row_hours jsonb; rows_payload jsonb:='[]'::jsonb;
 apl_payload jsonb:='null'::jsonb; period_data jsonb; periods_payload jsonb:='[]'::jsonb;
 contents_payload jsonb; allocations_payload jsonb; review_data jsonb; reviews_payload jsonb:='[]'::jsonb;
 resolution_payload jsonb;
begin
 if organizer is null or jsonb_typeof(gym) is distinct from 'object'
  or jsonb_typeof(source_data->'rows') is distinct from 'array'
  or jsonb_typeof(source_data->'distribution') is distinct from 'array'
  or jsonb_typeof(basis_data) is distinct from 'object'
  or jsonb_typeof(reviews) is distinct from 'array'
  or jsonb_typeof(program) is distinct from 'object' then
  raise exception 'APL hash context missing' using errcode='22023',hint='apl_invalid_contract';
 end if;
 -- projectGymTimplan derives these attributes from the verified source's exact
 -- catalog/rows. Raw source.rows contains key+points, not the UI rowKind/part.
 for row_data in select item.value from jsonb_array_elements(source_data->'rows') item(value)
  order by (item.value->>'key') collate "C" loop
  row_key:=row_data->>'key';
  if row_key like 'block:%' then
   row_kind:='block';
   select count(*),min(item.value->>'kind') into block_count,block_kind
    from jsonb_array_elements(coalesce(basis_data->'choiceBlocks','[]'::jsonb)) item(value)
    where item.value->>'id'=substr(row_key,7);
   if block_count<>1 then raise exception 'APL hash block does not match frozen source' using errcode='22023',hint='apl_invalid_contract';end if;
   row_part:=case block_kind when 'modernLanguage' then 'programmeSpecific' when 'languageSubject' then 'orientation'
    when 'naturalScience' then 'orientation' when 'specialization' then 'specialization' when 'individualChoice' then 'individualChoice' else null end;
  elsif row_key like 'alternative:%' then row_kind:='alternative';row_part:=split_part(row_key,':',2);
  elsif row_key='meta:diplomaWork' then row_kind:='diplomaWork';row_part:='diplomaWork';
  elsif row_key='meta:individualChoice' then
   -- Exactly matches the legacy GymTimplan projection. APL readiness still
   -- rejects this unspecified frame as verified subject-level content.
   row_kind:='fixed';row_part:='individualChoice';
  else row_kind:='fixed';row_part:=split_part(row_key,':',1);end if;
  if row_part is null or row_part not in ('foundation','programmeSpecific','orientation','specialization','individualChoice','diplomaWork') then
   raise exception 'APL hash row part invalid' using errcode='22023',hint='apl_invalid_contract';
  end if;
  select item.value->'points' into row_terms from jsonb_array_elements(source_data->'distribution') item(value)
   where item.value->>'rowKey'=row_key;
  row_terms:=coalesce(row_terms,'[0,0,0,0,0,0]'::jsonb);
  row_hours:=case when gym->>'timeModel'='school_terms_annual_apl_v2' then gym->'timeRows'->row_key->'schoolMinutes' else gym->'hours'->row_key end;
  if jsonb_typeof(row_terms) is distinct from 'array' or jsonb_array_length(row_terms)<>6
   or jsonb_typeof(row_hours) is distinct from 'array' or jsonb_array_length(row_hours)<>6 then
   raise exception 'APL hash term matrix missing' using errcode='22023',hint='apl_invalid_contract';
  end if;
  rows_payload:=rows_payload||jsonb_build_array(jsonb_build_array(row_key,row_data->'points',row_part,row_kind,row_terms,row_hours) || case when gym->>'timeModel'='school_terms_annual_apl_v2' then jsonb_build_array(gym->'timeRows'->row_key->'annualAplMinutes') else '[]'::jsonb end);
 end loop;

 if apl is not null and apl<>'null'::jsonb then
  for period_data in select item.value from jsonb_array_elements(apl->'periods') item(value)
   order by (item.value->>'id') collate "C" loop
   select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'description')
    order by (item.value->>'rowKey') collate "C"),'[]'::jsonb) into contents_payload
    from jsonb_array_elements(period_data->'contents') item(value);
   select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'termIndex',item.value->'gutMinutes')
    order by (item.value->>'rowKey') collate "C",(item.value->>'termIndex')::integer),'[]'::jsonb) into allocations_payload
    from jsonb_array_elements(period_data->'allocations') item(value);
   periods_payload:=periods_payload||jsonb_build_array(jsonb_build_array(
    period_data->'id',period_data->'name',period_data->'startsOn',period_data->'endsOn',period_data->'schoolYear',
    jsonb_build_array(period_data->'extent'->'basis',period_data->'extent'->'weeks',period_data->'extent'->'reviewed',period_data->'extent'->'reviewNote'),
    contents_payload,allocations_payload) || case when period_data ? 'plannedTermIndex'
     then jsonb_build_array(jsonb_build_array('planned_term_v1',period_data->'plannedTermIndex')) else '[]'::jsonb end);
  end loop;
  apl_payload:=jsonb_build_array(apl->'contractVersion',apl->'educationForm',apl->'classification',periods_payload);
 end if;

 for review_data in select item.value from jsonb_array_elements(reviews) item(value)
  order by (item.value->>'id') collate "C" loop
  select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'description')
   order by (item.value->>'rowKey') collate "C"),'[]'::jsonb) into contents_payload
   from jsonb_array_elements(review_data->'contents') item(value);
  select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'termIndex',item.value->'gutMinutes')
   order by (item.value->>'rowKey') collate "C",(item.value->>'termIndex')::integer),'[]'::jsonb) into allocations_payload
   from jsonb_array_elements(review_data->'allocations') item(value);
  resolution_payload:=case when review_data->'resolution' is null or review_data->'resolution'='null'::jsonb then 'null'::jsonb
   else jsonb_build_array(review_data->'resolution'->'actorId',review_data->'resolution'->'assignmentId',review_data->'resolution'->'at',review_data->'resolution'->'note') end;
  reviews_payload:=reviews_payload||jsonb_build_array(jsonb_build_array(review_data->'id',review_data->'sourcePlanId',review_data->'sourceVersion',
   review_data->'sourcePeriodId',review_data->'sourcePeriodName',review_data->'reason',contents_payload,allocations_payload,resolution_payload));
 end loop;

 return jsonb_build_array(case when gym->>'timeModel'='school_terms_annual_apl_v2' then 'apl_content_v2' else 'apl_content_v1' end,
  jsonb_build_array(organizer::text,gym->'unitId',gym->'offeringId',gym->'id',gym->'series'->'id',gym->'version'),
  jsonb_build_array(source_data->'planId',source_data->'version',source_data->'catalogId',basis_data->'startedOn',
   source_data->'education'->'programCode',source_data->'education'->'orientationCode',program->'version',program->'category',
   program->'startDate',program->'endDate',program->'canceledDate',program->'sourceSupported'),
  rows_payload,apl_payload,reviews_payload) || case when gym->>'timeModel'='school_terms_annual_apl_v2' then jsonb_build_array((select coalesce(jsonb_agg(jsonb_build_array(x->'id',x->'contractVersion',x->'sourcePlanId',x->'sourceVersion',x->'rowKey',x->'reason',x#>'{row,schoolMinutes}',x#>'{row,annualAplMinutes}',case when x->'resolution'='null'::jsonb then 'null'::jsonb else jsonb_build_array(x#>'{resolution,actorId}',x#>'{resolution,assignmentId}',x#>'{resolution,at}',x#>'{resolution,note}') end)),'[]') from jsonb_array_elements(gym->'timeCopyReview') x)) else '[]'::jsonb end || case when basis_data ? 'examination' then jsonb_build_array(jsonb_build_array('examination_v1',basis_data#>'{examination,model}',basis_data#>'{examination,appliesToStart}',basis_data#>'{examination,checkedOn}',basis_data#>'{examination,referenceUrl}',basis_data#>'{examination,referenceText}')) else '[]'::jsonb end;
end $$;

create or replace function public.phase5_apl_confirmation_blockers(gym jsonb, apl jsonb, reviews jsonb, program jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare
 blockers jsonb:='[]'::jsonb; rows_by_key jsonb; period jsonb; content jsonb; allocation jsonb; issue jsonb;
 started date; first_date date; last_date date; start_year integer; period_year integer; year integer; idx integer;
 term_starts date[]:='{}'::date[]; term_ends date[]:='{}'::date[]; term_indices integer[];
 supported boolean; complete_dates boolean; periods_overlap boolean:=false; capacity_conflict boolean:=false;
 weeks integer; reviewed_weeks integer:=0; reviewed_known boolean:=true; expected_minutes bigint; allocated_minutes bigint;
 first_week integer; last_week integer; candidate integer; occupied_end integer; n integer; overlap_count integer;
 -- PG17 is the configured target. Merged integer ranges implement the same earliest-free-week
 -- set as TS, without a date-span loop or quadratic scan over up to 16,000 assigned weeks.
 used_weeks int4multirange:='{}'::int4multirange; interval_row record;
begin
 if apl is null or apl='null'::jsonb then
  return jsonb_build_array('Planen saknar strukturerat APL-underlag. Befintliga timmar har ännu ingen granskad APL-fördelning.');
 end if;
 started:=(gym#>>'{source,basisReference,startedOn}')::date;
 supported:=coalesce(apl->>'educationForm'='school_based' and (program->>'sourceSupported')::boolean
  and program->>'category'='VOCATIONAL_PROGRAM'
  and program->>'code'=any(array['BA25','BF25','EE25','FR25','FS25','FT25','HT25','IN25','NB25','RL25','VF25','VO25'])
  and started is not null and started>=date '2025-07-01' and (started<date '2028-07-02' or public.phase5_programplan_examination_valid(gym#>'{source,basisReference,examination}',program->>'code',gym#>>'{source,basisReference,startedOn}'))
  and program->>'startDate' is not null and started>=(program->>'startDate')::date
  and (program->>'endDate' is null or started<=(program->>'endDate')::date)
  and (program->>'canceledDate' is null or started<(program->>'canceledDate')::date),false);
 if apl->>'educationForm'='unknown' then
  blockers:=blockers||jsonb_build_array('Välj utbildningsform innan omfattningen granskas.');
 elsif apl->>'educationForm'='apprenticeship' then
  blockers:=blockers||jsonb_build_array('Lärlingsutbildning kräver en annan beräkningsgrund som inte stöds i denna etapp.');
 elsif not supported then
  blockers:=blockers||jsonb_build_array('APL-reglerna är inte verifierade för den här frysta programkällan och elevkullen.');
 end if;
 if apl->>'classification'<>'complete' then
  blockers:=blockers||jsonb_build_array('Granska hur den befintliga totaltiden fördelas mellan APL och skolförlagd undervisning.');
 end if;
 if exists(select 1 from jsonb_array_elements(reviews) r where r->'resolution'='null'::jsonb) then
  blockers:=blockers||jsonb_build_array('Kopieringen innehåller tid eller innehåll som inte kunde överföras till den nya källan. Granska varje bevarad punkt och dokumentera hur den har hanterats.');
 end if;
 if jsonb_array_length(apl->'periods')=0 then blockers:=blockers||jsonb_build_array('Lägg till planerade APL-perioder.');end if;
 if exists(
  select 1 from jsonb_array_elements(gym#>'{source,rows}') r
  join jsonb_array_elements(gym#>'{source,distribution}') d on d->>'rowKey'=r->>'key'
  cross join generate_series(0,5) i
  where (d->'points'->>i)::integer<>0 and (case when gym->>'timeModel'='school_terms_annual_apl_v2' then gym->'timeRows'->(r->>'key')->'schoolMinutes'->>i else gym->'hours'->(r->>'key')->>i end) is null
 ) then blockers:=blockers||jsonb_build_array('Timplanen saknar totaltimmar i ett eller flera aktiva terminsfält.');end if;
 for issue in select value from jsonb_array_elements(public.phase5_apl_allocation_issues(gym,apl)) loop
  blockers:=blockers||jsonb_build_array(issue->>'message');
 end loop;
 if started is not null then
  start_year:=extract(year from started)::integer-case when extract(month from started)<7 then 1 else 0 end;
  if start_year between 2000 and 2100 then
   for idx in 0..5 loop
    year:=start_year+idx/2;
    term_starts:=array_append(term_starts,case when idx%2=0 then make_date(year,7,1) else make_date(year+1,1,1) end);
    term_ends:=array_append(term_ends,make_date(year+1,case when idx%2=0 then 1 else 7 end,1));
   end loop;
  end if;
 end if;
 -- spring_start_review is deliberately absent: it is a nonblocking review in projectAplPlan.
 -- Every overlapping pair contributes the same message before per-period issues.
 -- Pair counting preserves the blocker sequence without sorting projection-only identifiers.
 select count(*)::integer into overlap_count
 from jsonb_array_elements(apl->'periods') with ordinality a(value,position)
 cross join jsonb_array_elements(apl->'periods') with ordinality b(value,position)
 where a.position<b.position and a.value->>'startsOn' is not null and a.value->>'endsOn' is not null
  and b.value->>'startsOn' is not null and b.value->>'endsOn' is not null
  and a.value->>'startsOn'<=b.value->>'endsOn' and b.value->>'startsOn'<=a.value->>'endsOn';
 periods_overlap:=overlap_count>0;
 for n in 1..overlap_count loop
  blockers:=blockers||jsonb_build_array('Perioderna överlappar för samma planeringsgrupp. Omfattningen får inte räknas dubbelt.');
 end loop;
 select coalesce(jsonb_object_agg(r->>'key',r),'{}'::jsonb) into rows_by_key
 from jsonb_array_elements(gym#>'{source,rows}') r;
 for period in select value from jsonb_array_elements(apl->'periods') loop
  first_date:=(period->>'startsOn')::date;last_date:=(period->>'endsOn')::date;
  complete_dates:=first_date is not null and last_date is not null;
  weeks:=(period#>>'{extent,weeks}')::integer;
  if period->>'name'='' or not complete_dates or period->>'schoolYear' is null or jsonb_array_length(period->'contents')=0 then
   blockers:=blockers||jsonb_build_array('Fyll i periodens namn, datum, läsår och innehåll.');
  end if;
  if period#>>'{extent,basis}'<>'whole_weeks' or weeks is null or not (period#>>'{extent,reviewed}')::boolean then
   blockers:=blockers||jsonb_build_array('Omfattningen behöver granskas. Delveckor och osäkert underlag räknas inte automatiskt om till GUT.');
  end if;
  if complete_dates then
   first_week:=(first_date-(extract(isodow from first_date)::integer-1)-date '1969-12-29')/7;
   last_week:=(last_date-(extract(isodow from last_date)::integer-1)-date '1969-12-29')/7;
   if weeks is not null and weeks>last_week-first_week+1 then
    blockers:=blockers||jsonb_build_array('Uppgivna hela veckor överstiger antalet berörda kalenderveckor. Kontrollera datum och omfattning.');
   end if;
  end if;
  if first_date is not null and period->>'schoolYear' is not null then
   period_year:=extract(year from first_date)::integer-case when extract(month from first_date)<7 then 1 else 0 end;
   if period_year<>(period->>'schoolYear')::integer then
    blockers:=blockers||jsonb_build_array('Periodens första datum stämmer inte med valt läsår.');
   end if;
  end if;
  if started is not null and first_date is not null and first_date<started then
   blockers:=blockers||jsonb_build_array('Perioden börjar före utbildningens frysta startdatum.');
  end if;
  term_indices:='{}'::integer[];
  if complete_dates then
   if cardinality(term_starts)=6 then
    for idx in 0..5 loop
     if first_date<term_ends[idx+1] and last_date>=term_starts[idx+1] then term_indices:=array_append(term_indices,idx);end if;
    end loop;
   end if;
   if cardinality(term_starts)<>6 or first_date<term_starts[1] or last_date>=term_ends[6] then
    blockers:=blockers||jsonb_build_array('Perioden ligger helt eller delvis utanför timplanens sex terminsintervall.');
   end if;
  end if;
  for content in select value from jsonb_array_elements(period->'contents') loop
   if not rows_by_key ? (content->>'rowKey') then
    blockers:=blockers||jsonb_build_array('Innehållskopplingen saknas i den här frysta programkällan och behöver granskas.');
   elsif starts_with(content->>'rowKey','block:') or starts_with(content->>'rowKey','alternative:') or starts_with(content->>'rowKey','meta:') then
    blockers:=blockers||jsonb_build_array('Kopplingen är ett valbart block eller annat ospecificerat innehåll, inte en verifierad ämnesnivå.');
   end if;
   if content->>'description'='' then
    blockers:=blockers||jsonb_build_array('Beskriv vilken del av ämnesnivån som planeras på arbetsplatsen.');
   end if;
  end loop;
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   if complete_dates and not (allocation->>'termIndex')::integer=any(term_indices) then
    blockers:=blockers||jsonb_build_array('Tidsfördelningen avser en termin utanför periodens datum. Fördela tiden uttryckligt mellan berörda terminer.');
   end if;
  end loop;
  expected_minutes:=null;
  if supported and (period#>>'{extent,reviewed}')::boolean and period#>>'{extent,basis}'='whole_weeks' and weeks is not null then
   expected_minutes:=weeks::bigint*23*60;
  end if;
  select coalesce(sum((a->>'gutMinutes')::bigint),0) into allocated_minutes from jsonb_array_elements(period->'allocations') a;
  if expected_minutes is not null and expected_minutes<>allocated_minutes then
   blockers:=blockers||jsonb_build_array('Fördela periodens hela GUT-omfattning exakt en gång mellan innehåll och terminer.');
  end if;
  if not supported or period#>>'{extent,basis}'<>'whole_weeks' or weeks is null then reviewed_known:=false;
  elsif (period#>>'{extent,reviewed}')::boolean then reviewed_weeks:=reviewed_weeks+weeks;end if;
 end loop;
 -- Earliest deadline, then earliest start, allocating only declared week units.
 -- Adjacent int4 ranges merge; jumping to upper(occupied range) is exactly TS's while-used loop.
 for interval_row in
  select (p.first_date-(extract(isodow from p.first_date)::integer-1)-date '1969-12-29')/7 as first,
   (p.last_date-(extract(isodow from p.last_date)::integer-1)-date '1969-12-29')/7 as last,p.count
  from (
   select (value->>'startsOn')::date first_date,(value->>'endsOn')::date last_date,(value#>>'{extent,weeks}')::integer count
   from jsonb_array_elements(apl->'periods')
   where value->>'startsOn' is not null and value->>'endsOn' is not null
    and value#>>'{extent,basis}'='whole_weeks' and value#>>'{extent,weeks}' is not null
  ) p order by last,first
 loop
  candidate:=interval_row.first;
  for n in 1..interval_row.count loop
   select upper(occupied) into occupied_end from unnest(used_weeks) occupied where candidate<@occupied;
   if found then candidate:=occupied_end;end if;
   if candidate>interval_row.last then capacity_conflict:=true;exit;end if;
   used_weeks:=used_weeks+int4multirange(int4range(candidate,candidate+1,'[)'));
   candidate:=candidate+1;
  end loop;
  if capacity_conflict then exit;end if;
 end loop;
 if capacity_conflict then
  blockers:=blockers||jsonb_build_array('Periodernas uppgivna hela APL-veckor ryms inte i olika berörda kalenderveckor. Kontrollera förläggning och omfattning.');
 end if;
 if supported and not periods_overlap and not capacity_conflict and reviewed_known and reviewed_weeks<15 then
  blockers:=blockers||jsonb_build_array('Minst 15 hela granskade APL-veckor behöver planeras för den här utbildningsformen.');
 end if;
 if gym->>'timeModel'='school_terms_annual_apl_v2' then
  if exists(select 1 from jsonb_array_elements(coalesce(gym->'timeCopyReview','[]')) x where x->'resolution'='null'::jsonb) then blockers:=blockers||jsonb_build_array('Kopieringen har tidsrader som behöver granskas. Skapa en plan med verifierbar källa innan beslut.');end if;
  if exists(select 1 from jsonb_each(gym->'timeRows') r cross join generate_series(0,2) yr
   join jsonb_array_elements(gym#>'{source,distribution}') d on d->>'rowKey'=r.key
   where ((d->'points'->>(yr*2))::integer>0 or (d->'points'->>(yr*2+1))::integer>0)
   and ((r.value->'annualAplMinutes'->>yr) is null or (r.value->'annualAplMinutes'->>yr)::bigint is distinct from
    (select coalesce(sum((a->>'gutMinutes')::bigint),0) from jsonb_array_elements(apl->'periods') p cross join lateral jsonb_array_elements(p->'allocations') a where a->>'rowKey'=r.key and (a->>'termIndex')::integer/2=yr))) then
   blockers:=blockers||jsonb_build_array('Fördela all angiven års-APL på perioder innan förläggningen bekräftas.');end if;
 end if;
 return blockers;
end $$;

create or replace function public.phase5_named_timplan_copy_rows(target_plan uuid,source_basis jsonb,copy_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare previous public.timplans;r jsonb;d jsonb;old_r jsonb;old_d jsonb;h smallint[];mask boolean[];carried integer:=0;reset integer:=0;target public.timplans;v2 boolean;reviews jsonb:='[]';rv jsonb;points jsonb;school jsonb;annual jsonb;i integer;loss jsonb;src record;
begin
 if copy_plan is not null then select * into previous from public.timplans where id=copy_plan;end if;
 select * into target from public.timplans where id=target_plan;
 v2:=exists(select 1 from public.timplan_time_models where plan_id=copy_plan)
  or (copy_plan is null and public.phase5_plan_decision_profile(source_basis)->'vocational'='true'::jsonb
   and jsonb_array_length(public.phase5_plan_decision_source_blockers(source_basis))=0);
 if v2 then
  if copy_plan is not null then select coalesce(jsonb_agg(x||jsonb_build_object('id',gen_random_uuid())),'[]') into reviews from public.timplan_time_models m cross join lateral jsonb_array_elements(m.copy_review) x where m.plan_id=copy_plan and x->'resolution'='null'::jsonb;end if;
  -- Every lost row is kept with its actual plan/version/row and exact minutes.
  -- No fake period ID is manufactured for an annual budget.
  if copy_plan is not null then
   for src in select * from public.timplan_time_cells_v2 where plan_id=copy_plan loop
    select value into old_r from jsonb_array_elements(previous.gym_basis->'rows') where value->>'key'=src.row_key;
    select value into r from jsonb_array_elements(source_basis->'rows') where value->>'key'=src.row_key;
    select value into old_d from jsonb_array_elements(previous.gym_basis->'distribution') where value->>'rowKey'=src.row_key;
    select value into d from jsonb_array_elements(source_basis->'distribution') where value->>'rowKey'=src.row_key;
    if old_r is distinct from r or old_d is distinct from d or (src.row_key='meta:diplomaWork' and (coalesce(previous.gym_basis#>>'{basisReference,examination,model}','diploma_work') is distinct from coalesce(source_basis#>>'{basisReference,examination,model}','diploma_work'))) then
     reviews:=reviews||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'resolution',null,'contractVersion','time_copy_review_v2','sourcePlanId',copy_plan,'sourceVersion',previous.version,
      'rowKey',src.row_key,'reason',case when r is null then 'missing_row' else 'changed_source' end,
      'row',jsonb_build_object('schoolMinutes',src.school_minutes,'annualAplMinutes',src.annual_apl_minutes)));
    end if;
   end loop;
  end if;
  insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),target_plan);
  insert into public.timplan_time_models(plan_id,model,origin,source_plan_id,source_version,copy_review)
   values(target_plan,'school_terms_annual_apl_v2',case when copy_plan is null then 'new' else 'copy' end,copy_plan,previous.version,reviews);
  for r in select value from jsonb_array_elements(source_basis->'rows') loop
   select value into d from jsonb_array_elements(source_basis->'distribution') where value->>'rowKey'=r->>'key';
   select value into old_r from jsonb_array_elements(previous.gym_basis->'rows') where value->>'key'=r->>'key';
   select value into old_d from jsonb_array_elements(previous.gym_basis->'distribution') where value->>'rowKey'=r->>'key';
   if old_r=r and old_d=d and not (r->>'key'='meta:diplomaWork' and (coalesce(previous.gym_basis#>>'{basisReference,examination,model}','diploma_work') is distinct from coalesce(source_basis#>>'{basisReference,examination,model}','diploma_work'))) then
    select jsonb_build_object('schoolMinutes',school_minutes,'annualAplMinutes',annual_apl_minutes) into rv from public.timplan_time_cells_v2 where plan_id=copy_plan and row_key=r->>'key';
    if rv is null then raise exception 'Källans tidsrad saknas.' using errcode='22023';end if;carried:=carried+1;
   else rv:='{"schoolMinutes":[null,null,null,null,null,null],"annualAplMinutes":[null,null,null]}'::jsonb;reset:=reset+1;end if;
   insert into public.timplan_time_cells_v2(plan_id,row_key,school_minutes,annual_apl_minutes) values(target_plan,r->>'key',rv->'schoolMinutes',rv->'annualAplMinutes');
  end loop;
  delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=target_plan;
  perform public.phase5_apl_copy_structure(copy_plan,target_plan);
  return jsonb_build_object('carriedRows',carried,'resetRows',reset);
 end if;
 for r in select value from jsonb_array_elements(source_basis->'rows') loop
  h:=array[0,0,0,0,0,0]::smallint[];mask:=array[false,false,false,false,false,false];old_r:=null;old_d:=null;
  select value into d from jsonb_array_elements(source_basis->'distribution') where value->>'rowKey'=r->>'key';
  if previous.gym_basis is not null then
   select value into old_r from jsonb_array_elements(previous.gym_basis->'rows') where value->>'key'=r->>'key';
   select value into old_d from jsonb_array_elements(previous.gym_basis->'distribution') where value->>'rowKey'=r->>'key';
  end if;
  if old_r=r and old_d=d and not (r->>'key'='meta:diplomaWork' and (coalesce(previous.gym_basis#>>'{basisReference,examination,model}','diploma_work') is distinct from coalesce(source_basis#>>'{basisReference,examination,model}','diploma_work'))) then
   select hours,allocated into h,mask from public.timplan_cells where timplan_id=previous.id and row_id=r->>'key';
   if not found then raise exception 'Invalid predecessor matrix' using errcode='22023';end if;
   carried:=carried+1;
  else reset:=reset+1;end if;
  insert into public.timplan_cells(timplan_id,row_id,hours,allocated) values(target_plan,r->>'key',h,mask);
 end loop;
 perform public.phase5_apl_copy_structure(copy_plan,target_plan);
 return jsonb_build_object('carriedRows',carried,'resetRows',reset);
end $$;

create or replace function public.phase5_apl_copy_structure(source_plan uuid,target_plan uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
 source_row public.timplans;target_row public.timplans;a public.access_assignments;
 source_apl jsonb;source_gym jsonb;target_gym jsonb;source_program jsonb;target_program jsonb;trusted_source boolean;
 source_reviews jsonb;new_reviews jsonb:='[]'::jsonb;review jsonb;review_count integer;
 next_apl jsonb;next_periods jsonb:='[]'::jsonb;period jsonb;content jsonb;allocation jsonb;next_period jsonb;
 active_contents jsonb;active_allocations jsonb;loss_contents jsonb;loss_allocations jsonb;loss_reason text;reason text;
 target_keys jsonb;target_points jsonb;cell_totals jsonb;row_key text;term_index integer;cell_key text;cell_total integer;
 new_period_id uuid;now_at timestamptz;
begin
 if source_plan is null then return;end if;
 if target_plan is null or source_plan=target_plan then raise exception 'Ogiltig APL-kopiering.' using errcode='22023';end if;
 -- Both creators already hold the school/offering, program and source-series/plan locks.
 -- Recheck the actual scope, then reuse those row locks; never demand an editable source.
 select * into target_row from public.timplans where id=target_plan;
 select * into source_row from public.timplans where id=source_plan;
 if target_row.id is null or source_row.id is null or target_row.gym_basis is null or source_row.gym_basis is null
  or (target_row.organizer_id,target_row.unit_id,target_row.offering_id)
    is distinct from (source_row.organizer_id,source_row.unit_id,source_row.offering_id) then
  raise exception 'APL-kopieringen saknar samma skola och utbildning.' using errcode='42501';end if;
 perform public.phase5_gym_timplan_scope(target_row.offering_id,target_row.unit_id,true);
 select * into source_row from public.timplans where id=source_plan for update;
 select * into target_row from public.timplans where id=target_plan for update;
 a:=public.phase5_programplan_actor();
 if a.function not in ('rektor','administrator') or a.organizer_id<>target_row.organizer_id
  or target_row.status<>'utkast' or target_row.revision<>0
  or exists(select 1 from public.apl_plan_underlag u where u.plan_id=target_plan)
  or exists(select 1 from public.apl_rector_confirmations c where c.plan_id=target_plan)
  or exists(select 1 from public.apl_plan_commands c where c.plan_id=target_plan)
  or exists(select 1 from public.timplan_events e where e.timplan_id=target_plan)
  or exists(select 1 from public.named_timplan_commands c where c.plan_id=target_plan)
  or exists(select 1 from public.gym_timplan_receipts c where c.timplan_id=target_plan)
  or exists(select 1 from public.apl_plan_write_permits w where w.transaction_id=txid_current() and w.backend_id=pg_backend_pid() and w.plan_id=target_plan) then
  raise exception 'APL får bara initieras på det nya tomma utkastet.' using errcode='42501';end if;
 -- The hook precedes both creation event and receipt. Checking these also works
 -- under a caller savepoint, unlike comparing tuple xmin with the top-level XID.
 source_apl:=public.phase5_apl_plan_value(source_plan);
 if source_apl is null then return;end if;
 source_apl:=public.phase5_apl_plan_parse(source_apl);
 source_gym:=public.phase5_gym_timplan_result(source_plan);target_gym:=public.phase5_gym_timplan_result(target_plan);
 perform public.phase5_apl_validate_allocations(source_gym,source_apl);
 source_program:=public.phase5_apl_program(source_gym);target_program:=public.phase5_apl_program(target_gym);
 trusted_source:=coalesce((source_program->>'sourceSupported')::boolean and (target_program->>'sourceSupported')::boolean,false);
 source_reviews:=public.phase5_apl_copy_review(source_plan);
 if jsonb_array_length(source_reviews)>1000 then
  raise exception 'För många granskningspunkter för säker APL-kopiering.' using errcode='40001',hint='apl_copy_review_limit';end if;
 for review in select value from jsonb_array_elements(source_reviews) where value->'resolution'='null'::jsonb loop
  -- Keep the original source plan/version/period, including inherited losses.
  -- Only the new review identity and unresolved status belong to this copy.
  new_reviews:=new_reviews||jsonb_build_array(review||jsonb_build_object('id',gen_random_uuid(),'resolution',null));
 end loop;
 select coalesce(jsonb_object_agg(r->>'key',r),'{}'::jsonb) into target_keys from jsonb_array_elements(target_gym#>'{source,rows}') r;
 select coalesce(jsonb_object_agg(d->>'rowKey',d->'points'),'{}'::jsonb) into target_points from jsonb_array_elements(target_gym#>'{source,distribution}') d;
 -- Decide all-or-nothing for each cell across every period. A period's input
 -- ordering must not decide which subset of a too-large cell happens to survive.
 select coalesce(jsonb_object_agg(c.cell_key,to_jsonb(c.minutes)),'{}'::jsonb) into cell_totals from (
  select jsonb_build_array(x->>'rowKey',case when source_gym->>'timeModel'='school_terms_annual_apl_v2' then (x->>'termIndex')::integer/2 else (x->>'termIndex')::integer end)::text cell_key,sum((x->>'gutMinutes')::bigint) minutes
  from jsonb_array_elements(source_apl->'periods') p cross join lateral jsonb_array_elements(p->'allocations') x
  group by jsonb_build_array(x->>'rowKey',case when source_gym->>'timeModel'='school_terms_annual_apl_v2' then (x->>'termIndex')::integer/2 else (x->>'termIndex')::integer end)::text
 ) c;
 for period in select value from jsonb_array_elements(source_apl->'periods') loop
  active_contents:='[]'::jsonb;active_allocations:='[]'::jsonb;
  loss_contents:='{"missing_row":[],"inactive_term":[],"insufficient_total":[],"unverified_source":[]}'::jsonb;
  loss_allocations:=loss_contents;
  for content in select value from jsonb_array_elements(period->'contents') loop
   row_key:=content->>'rowKey';loss_reason:=null;
   if not trusted_source or (row_key='meta:diplomaWork' and coalesce(source_gym#>>'{source,basisReference,examination,model}','diploma_work') is distinct from coalesce(target_gym#>>'{source,basisReference,examination,model}','diploma_work')) then loss_reason:='unverified_source';
   elsif not target_keys ? row_key then loss_reason:='missing_row';end if;
   if loss_reason is null then active_contents:=active_contents||jsonb_build_array(content);
   else loss_contents:=jsonb_set(loss_contents,array[loss_reason],(loss_contents->loss_reason)||jsonb_build_array(content));end if;
  end loop;
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   row_key:=allocation->>'rowKey';term_index:=(allocation->>'termIndex')::integer;
   cell_key:=jsonb_build_array(row_key,case when target_gym->>'timeModel'='school_terms_annual_apl_v2' then term_index/2 else term_index end)::text;
   cell_total:=case when target_gym->>'timeModel'='school_terms_annual_apl_v2' then (target_gym->'timeRows'->row_key->'annualAplMinutes'->>(term_index/2))::integer else (target_gym->'hours'->row_key->>term_index)::integer*60 end;
   loss_reason:=null;
   if not trusted_source or (row_key='meta:diplomaWork' and coalesce(source_gym#>>'{source,basisReference,examination,model}','diploma_work') is distinct from coalesce(target_gym#>>'{source,basisReference,examination,model}','diploma_work')) then loss_reason:='unverified_source';
   elsif not target_keys ? row_key then loss_reason:='missing_row';
   elsif coalesce((target_points->row_key->>term_index)::integer,0)=0 then loss_reason:='inactive_term';
   elsif cell_total is null or (cell_totals->>cell_key)::bigint>cell_total::bigint then loss_reason:='insufficient_total';end if;
   if loss_reason is null then active_allocations:=active_allocations||jsonb_build_array(allocation);
   else
    loss_allocations:=jsonb_set(loss_allocations,array[loss_reason],(loss_allocations->loss_reason)||jsonb_build_array(allocation));
    if not exists(select 1 from jsonb_array_elements(loss_contents->loss_reason) c where c->>'rowKey'=row_key) then
     select value into content from jsonb_array_elements(period->'contents') where value->>'rowKey'=row_key;
     if content is null then raise exception 'APL-källan saknar innehåll för förlorad tid.' using errcode='22023',hint='allocation_without_content';end if;
     loss_contents:=jsonb_set(loss_contents,array[loss_reason],(loss_contents->loss_reason)||jsonb_build_array(content));
    end if;
   end if;
  end loop;
  new_period_id:=gen_random_uuid();
  next_period:=period||jsonb_build_object('id',new_period_id,'contents',active_contents,'allocations',active_allocations,
   'extent',(period->'extent')||jsonb_build_object('reviewed',false,'reviewNote',''));
  next_periods:=next_periods||jsonb_build_array(next_period);
  foreach reason in array array['missing_row','inactive_term','insufficient_total','unverified_source'] loop
   if jsonb_array_length(loss_contents->reason)>0 or jsonb_array_length(loss_allocations->reason)>0 then
    new_reviews:=new_reviews||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'sourcePlanId',source_plan,
     'sourceVersion',source_row.version,'sourcePeriodId',period->'id','sourcePeriodName',period->'name','reason',reason,
     'contents',loss_contents->reason,'allocations',loss_allocations->reason,'resolution',null));
   end if;
  end loop;
  if jsonb_array_length(new_reviews)>1000 then
   raise exception 'För många granskningspunkter för säker APL-kopiering.' using errcode='40001',hint='apl_copy_review_limit';end if;
 end loop;
 next_apl:=public.phase5_apl_plan_parse(source_apl||jsonb_build_object('classification','unreviewed','periods',next_periods));
 perform public.phase5_apl_validate_allocations(target_gym,next_apl);
 -- Only this private initialization owns this exact permit; no caller-supplied
 -- session flag and no generic table permission are introduced.
 insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),target_plan);
 now_at:=date_trunc('milliseconds',clock_timestamp());
 insert into public.apl_plan_underlag(plan_id,organizer_id,unit_id,offering_id,education_form,classification,created_at,updated_at)
 values(target_plan,target_row.organizer_id,target_row.unit_id,target_row.offering_id,next_apl->>'educationForm','unreviewed',now_at,now_at);
 for period in select value from jsonb_array_elements(next_apl->'periods') loop
  insert into public.apl_plan_periods(id,plan_id,name,starts_on,ends_on,school_year,extent_basis,whole_weeks,reviewed,review_note,planned_term_index)
  values((period->>'id')::uuid,target_plan,period->>'name',(period->>'startsOn')::date,(period->>'endsOn')::date,(period->>'schoolYear')::integer,
   period#>>'{extent,basis}',(period#>>'{extent,weeks}')::integer,false,'',(period->>'plannedTermIndex')::integer);
  for content in select value from jsonb_array_elements(period->'contents') loop
   insert into public.apl_period_contents(plan_id,period_id,row_key,description) values(target_plan,(period->>'id')::uuid,content->>'rowKey',content->>'description');
  end loop;
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   insert into public.apl_time_allocations(plan_id,period_id,row_key,term_index,gut_minutes)
   values(target_plan,(period->>'id')::uuid,allocation->>'rowKey',(allocation->>'termIndex')::integer,(allocation->>'gutMinutes')::integer);
  end loop;
 end loop;
 for review in select value from jsonb_array_elements(new_reviews) loop
  insert into public.apl_plan_copy_reviews(id,plan_id,source_plan_id,source_version,source_period_id,source_period_name,reason,contents,allocations)
  values((review->>'id')::uuid,target_plan,(review->>'sourcePlanId')::uuid,(review->>'sourceVersion')::integer,
   (review->>'sourcePeriodId')::uuid,review->>'sourcePeriodName',review->>'reason',review->'contents',review->'allocations');
 end loop;
 -- Guards validate provenance and every lost content/allocation tuple. Recheck
 -- the complete persisted active matrix before the creation's own receipt/audit.
 perform public.phase5_apl_plan_parse(public.phase5_apl_plan_value(target_plan));
 perform public.phase5_apl_validate_allocations(public.phase5_gym_timplan_result(target_plan),public.phase5_apl_plan_value(target_plan));
 perform public.phase5_apl_copy_audit(source_plan,target_plan);
 delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=target_plan;
end $$;

revoke all on function public.phase5_programplan_examination_valid(jsonb,text,text),public.phase5_set_programplan_examination(uuid,integer,jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.phase5_set_programplan_examination(uuid,integer,jsonb) to skolplattform_worker;
