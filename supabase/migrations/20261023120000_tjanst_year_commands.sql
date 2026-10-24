-- 05.1-18 / D-25–D-27. Same plan journal, explicit contexts, atomic first mutation and batches.
-- SS 12000: stable Person/Group/Duty relations; no new identities, mandates or external exchange.
-- Legacy parsing is restricted to matching an already persisted command. Never a new write fallback.

create function public.tjanst_plan_parse_legacy(input jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare action_name text;p jsonb;payload jsonb;t jsonb;teachers jsonb:='[]';rows jsonb;
begin
 if jsonb_typeof(input) is distinct from 'object' or jsonb_typeof(input->'action') is distinct from 'string'
  or input->>'action' not in ('create_draft','add_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','discard_draft','publish')
  or not public.phase5_programplan_shape(input,array['commandId','unitId','schoolYear','action','expectedRevision','payloadHash','payload']
   ||case when input->>'action'='publish' then array['expectedContentHash'] else '{}'::text[] end)
  or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483647)
  or jsonb_typeof(input->'payloadHash') is distinct from 'string' or input->>'payloadHash'!~'^sha256:[0-9a-f]{64}$'
  or (input->>'action'='publish' and (jsonb_typeof(input->'expectedContentHash') is distinct from 'string' or input->>'expectedContentHash'!~'^sha256:[0-9a-f]{64}$')) then
  raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
 action_name:=input->>'action';p:=input->'payload';
 if action_name='create_draft' then
  if not public.phase5_programplan_shape(p,array['basedOnVersionId']) then raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object('basedOnVersionId',case when p->'basedOnVersionId'='null'::jsonb then null else public.tjanst_uuid(p->'basedOnVersionId') end);
 elsif action_name='add_teacher' then
  if not public.phase5_programplan_shape(p,array['personId']) then raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object('personId',public.tjanst_uuid(p->'personId'));
 elsif action_name='save_row' then
  if not public.phase5_programplan_shape(p,array['rowId','sourceKind','sourceKey','personId','teacherHt','teacherVt','comment'])
   or p->>'sourceKind' is distinct from 'class_timplan' or jsonb_typeof(p->'sourceKey') is distinct from 'string'
   or not public.phase5_programplan_integer(p->'teacherHt',0,200000) or not public.phase5_programplan_integer(p->'teacherVt',0,200000)
   or (p->>'teacherHt')::integer+(p->>'teacherVt')::integer=0 then
   raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  if not public.phase5_apl_text(p->'comment',2000,true) then raise exception 'Invalid comment' using errcode='22023',hint='tjanst_comment_too_long';end if;
  payload:=jsonb_build_object('rowId',case when p->'rowId'='null'::jsonb then null else public.tjanst_uuid(p->'rowId') end,'sourceKind','class_timplan',
   'sourceKey',p->'sourceKey','personId',case when p->'personId'='null'::jsonb then null else public.tjanst_uuid(p->'personId') end,
   'teacherHt',p->'teacherHt','teacherVt',p->'teacherVt','comment',p->'comment');
 elsif action_name in ('delete_row','delete_special','dissolve_joint') then
  if not public.phase5_programplan_shape(p,array[case action_name when 'delete_row' then 'rowId' when 'delete_special' then 'specialId' else 'jointId' end]) then
   raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object(case action_name when 'delete_row' then 'rowId' when 'delete_special' then 'specialId' else 'jointId' end,
   public.tjanst_uuid(p->case action_name when 'delete_row' then 'rowId' when 'delete_special' then 'specialId' else 'jointId' end));
 elsif action_name='save_special' then
  if not public.phase5_programplan_shape(p,array['specialId','kind','label','personId','classId','ht','vt','comment'])
   or jsonb_typeof(p->'kind') is distinct from 'string' or p->>'kind' not in ('mentor','programansvar','speciallarare','annat')
   or not public.phase5_apl_text(p->'label',200,false)
   or not public.phase5_programplan_integer(p->'ht',0,200000) or not public.phase5_programplan_integer(p->'vt',0,200000)
   or (p->>'ht')::integer+(p->>'vt')::integer=0 or (p->'classId'<>'null'::jsonb and p->>'kind'<>'mentor') then
   raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  if not public.phase5_apl_text(p->'comment',2000,true) then raise exception 'Invalid comment' using errcode='22023',hint='tjanst_comment_too_long';end if;
  payload:=jsonb_build_object('specialId',case when p->'specialId'='null'::jsonb then null else public.tjanst_uuid(p->'specialId') end,'kind',p->'kind','label',p->'label',
   'personId',case when p->'personId'='null'::jsonb then null else public.tjanst_uuid(p->'personId') end,
   'classId',case when p->'classId'='null'::jsonb then null else public.tjanst_uuid(p->'classId') end,'ht',p->'ht','vt',p->'vt','comment',p->'comment');
 elsif action_name='save_joint' then
  if not public.phase5_programplan_shape(p,array['jointId','name','rowIds','teachers']) or not public.phase5_apl_text(p->'name',200,false)
   or jsonb_typeof(p->'rowIds') is distinct from 'array' or jsonb_typeof(p->'teachers') is distinct from 'array'
   or jsonb_array_length(p->'rowIds')>200 or jsonb_array_length(p->'teachers')>2000 then
   raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  select coalesce(jsonb_agg(to_jsonb(public.tjanst_uuid(x.value)) order by x.n),'[]'::jsonb) into rows from jsonb_array_elements(p->'rowIds') with ordinality x(value,n);
  if (select count(distinct x.value) from jsonb_array_elements(rows) x)<>jsonb_array_length(rows) then raise exception 'Duplicate row' using errcode='22023',hint='tjanst_duplicate_row';end if;
  if jsonb_array_length(rows)<2 then raise exception 'Too few rows' using errcode='22023',hint='tjanst_joint_too_few';end if;
  for t in select x.value from jsonb_array_elements(p->'teachers') x loop
   if not public.phase5_programplan_shape(t,array['personId','ht','vt']) or not public.phase5_programplan_integer(t->'ht',0,200000)
    or not public.phase5_programplan_integer(t->'vt',0,200000) or (t->>'ht')::integer+(t->>'vt')::integer=0 then
    raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
   teachers:=teachers||jsonb_build_array(jsonb_build_object('personId',public.tjanst_uuid(t->'personId'),'ht',t->'ht','vt',t->'vt'));
  end loop;
  if (select count(distinct x.value->>'personId') from jsonb_array_elements(teachers) x)<>jsonb_array_length(teachers) then
   raise exception 'Duplicate teacher' using errcode='22023',hint='tjanst_duplicate_row';end if;
  payload:=jsonb_build_object('jointId',case when p->'jointId'='null'::jsonb then null else public.tjanst_uuid(p->'jointId') end,'name',p->'name','rowIds',rows,'teachers',teachers);
 else
  if p is distinct from '{}'::jsonb then raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:='{}'::jsonb;
 end if;
 return jsonb_build_object('commandId',public.tjanst_uuid(input->'commandId'),'unitId',public.tjanst_uuid(input->'unitId'),'schoolYear',input->'schoolYear',
  'action',action_name,'expectedRevision',input->'expectedRevision','payloadHash',input->'payloadHash','payload',payload)
  ||case when action_name='publish' then jsonb_build_object('expectedContentHash',input->'expectedContentHash') else '{}'::jsonb end;
end $$;

create or replace function public.tjanst_plan_parse(input jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare action_name text:=input->>'action';p jsonb:=input->'payload';ctx jsonb;q jsonb;
begin
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>65536 then
  raise exception 'Invalid command size' using errcode='22023',hint='tjanst_input_too_large';end if;
 if action_name='create_draft' then raise exception 'Reload current planning before editing' using errcode='22023',hint='tjanst_context_required';end if;
 if action_name in ('move','bulk') then
  if not public.phase5_programplan_shape(input,array['commandId','unitId','schoolYear','action','expectedRevision','payloadHash','payload'])
   or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483647)
   or coalesce(input->>'payloadHash','')!~'^sha256:[a-f0-9]{64}$'
   or not public.phase5_programplan_shape(p,array['action','baseVersionId','items','expectedPreviewHash']) or p->>'action' is distinct from action_name
   or coalesce(p->>'expectedPreviewHash','')!~'^sha256:[a-f0-9]{64}$' then
   raise exception 'Invalid batch command' using errcode='22023',hint='tjanst_invalid';end if;
  perform public.tjanst_uuid(input->'commandId');perform public.tjanst_uuid(input->'unitId');
  -- All batch item/scalar rules are checked by the independent year_batch calculator under the customer lock.
  return input;
 end if;
 if action_name='save_row' then
  ctx:=p->'planningContext';
  if not public.phase5_programplan_shape(ctx,array['baseVersionId','expectedBasisHash','choice']) then
   raise exception 'Planning context required' using errcode='22023',hint='tjanst_context_required';end if;
  perform public.tjanst_year_choice(ctx->'choice');
  if ctx->'choice'->'personId' is distinct from p->'personId' then raise exception 'Teacher choice mismatch' using errcode='22023',hint='tjanst_choice_mismatch';end if;
  perform public.tjanst_year_payload('row',p-'planningContext');
  q:=public.tjanst_plan_parse_legacy(jsonb_set(input,'{payload}',p-'planningContext'));
  if split_part(p->>'sourceKey',':',3) is distinct from input->>'schoolYear' then raise exception 'Source year mismatch' using errcode='22023',hint='tjanst_invalid';end if;
  q:=jsonb_set(q,'{payload}',q->'payload'||jsonb_build_object('planningContext',ctx));
 else
  if action_name is null or action_name not in ('add_teacher','remove_teacher','delete_row','save_special','delete_special','save_joint','dissolve_joint','discard_draft','publish') then
   raise exception 'Invalid command action' using errcode='22023',hint='tjanst_invalid';end if;
  ctx:=p->'mutationContext';
  if not public.phase5_programplan_shape(ctx,array['baseVersionId','expectedBasisHash']) then
   raise exception 'Mutation context required' using errcode='22023',hint='tjanst_context_required';end if;
  if action_name='save_special' then perform public.tjanst_year_payload('special',p-'mutationContext');end if;
  if action_name='remove_teacher' then
   if not public.phase5_programplan_shape(p-'mutationContext',array['personId']) then raise exception 'Invalid teacher removal' using errcode='22023',hint='tjanst_invalid';end if;
   perform public.tjanst_uuid(p->'personId');
   q:=jsonb_set(public.tjanst_plan_parse_legacy(jsonb_set(jsonb_set(input,'{action}','"add_teacher"'::jsonb),'{payload}',p-'mutationContext')),'{action}','"remove_teacher"'::jsonb);
  else q:=public.tjanst_plan_parse_legacy(jsonb_set(input,'{payload}',p-'mutationContext'));end if;
  q:=jsonb_set(q,'{payload}',q->'payload'||jsonb_build_object('mutationContext',ctx));
 end if;
 if coalesce(ctx->>'expectedBasisHash','')!~'^sha256:[a-f0-9]{64}$' then raise exception 'Invalid context hash' using errcode='22023',hint='tjanst_invalid';end if;
 if ctx->'baseVersionId'<>'null'::jsonb then perform public.tjanst_uuid(ctx->'baseVersionId');end if;
 if action_name in ('discard_draft','publish') and ctx->'baseVersionId'='null'::jsonb then
  raise exception 'Draft required' using errcode='22023',hint='tjanst_invalid';end if;
 return q;
end $$;

-- Map only IDs belonging to the checked current base version and its same-distribution copy.
create function public.tjanst_year_map_id(kind text,object_id uuid,source_version uuid,target_version uuid) returns uuid
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare matches uuid[];
begin
 if object_id is null then return null;end if;
 if not exists(select 1 from public.tjanst_versions s join public.tjanst_versions t on t.distribution_id=s.distribution_id
  where s.id=source_version and t.id=target_version and t.status='draft') then
  raise exception 'Version mapping denied' using errcode='42501';end if;
 if kind='row' then select array_agg(n.id) into matches from public.tjanst_rows s join public.tjanst_rows n on n.lineage_id=s.lineage_id and n.version_id=target_version where s.id=object_id and s.version_id=source_version;
 elsif kind='special' then select array_agg(n.id) into matches from public.tjanst_special_assignments s join public.tjanst_special_assignments n on n.lineage_id=s.lineage_id and n.version_id=target_version where s.id=object_id and s.version_id=source_version;
 elsif kind='joint' then select array_agg(n.id) into matches from public.tjanst_joint_groups s join public.tjanst_joint_groups n on n.lineage_id=s.lineage_id and n.version_id=target_version where s.id=object_id and s.version_id=source_version;
 else raise exception 'Invalid mapping kind' using errcode='22023';end if;
 if coalesce(cardinality(matches),0)<>1 then raise exception 'Unmatched planning object' using errcode='40001',hint='tjanst_stale_basis';end if;
 return matches[1];
end $$;

create or replace function public.tjanst_plan_copy_extras(source_version uuid,target_version uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare g public.tjanst_joint_groups;new_group uuid;expected_count integer;actual_count integer;
begin
 if source_version is null then return;end if;
 if not exists(select 1 from public.tjanst_versions s join public.tjanst_versions t on t.distribution_id=s.distribution_id
  where s.id=source_version and t.id=target_version and t.status='draft' and t.based_on_version_id=s.id) then
  raise exception 'Copy scope denied' using errcode='42501';end if;
 if exists(select 1 from public.tjanst_joint_groups source_group join public.tjanst_joint_members m on m.group_id=source_group.id
  join public.tjanst_rows r on r.id=m.row_id where source_group.version_id=source_version and r.version_id<>source_version) then
  raise exception 'Invalid group source' using errcode='40001',hint='tjanst_stale_basis';end if;
 insert into public.tjanst_special_assignments(version_id,lineage_id,kind,label,staff_person_id,class_id,ht_minutes,vt_minutes,comment)
 select target_version,s.lineage_id,s.kind,s.label,s.staff_person_id,s.class_id,s.ht_minutes,s.vt_minutes,s.comment from public.tjanst_special_assignments s where s.version_id=source_version;
 for g in select * from public.tjanst_joint_groups x where x.version_id=source_version loop
  insert into public.tjanst_joint_groups(version_id,lineage_id,name) values(target_version,g.lineage_id,g.name) returning id into new_group;
  select count(*) into expected_count from public.tjanst_joint_members m where m.group_id=g.id;
  insert into public.tjanst_joint_members(group_id,row_id)
  select new_group,public.tjanst_year_map_id('row',m.row_id,source_version,target_version) from public.tjanst_joint_members m where m.group_id=g.id;
  get diagnostics actual_count=row_count;
  if actual_count<>expected_count then raise exception 'Incomplete joint copy' using errcode='40001',hint='tjanst_stale_basis';end if;
  insert into public.tjanst_joint_teacher_time(group_id,staff_person_id,ht_minutes,vt_minutes)
  select new_group,t.staff_person_id,t.ht_minutes,t.vt_minutes from public.tjanst_joint_teacher_time t where t.group_id=g.id;
 end loop;
end $$;

create function public.tjanst_year_ensure_draft(a public.access_assignments,s public.app_sessions,d public.tjanst_distributions,base_version uuid) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions;version uuid;
begin
 select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status in ('draft','published') order by (x.status='draft') desc limit 1;
 if v.id is distinct from base_version then raise exception 'Planning changed' using errcode='40001',hint='tjanst_stale_basis';end if;
 if v.status='draft' then return v.id;end if;
 version:=public.tjanst_plan_create_draft(a,s,d,jsonb_build_object('basedOnVersionId',base_version));
 perform public.tjanst_plan_copy_extras(base_version,version);
 return version;
end $$;

create function public.tjanst_year_apply_one(a public.access_assignments,d public.tjanst_distributions,action_name text,p jsonb,base_version uuid,version uuid) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare mapped jsonb:=p;rows jsonb;mapped_row_id uuid;
begin
 if action_name in ('save_row','delete_row') then mapped:=jsonb_set(p,'{rowId}',coalesce(to_jsonb(public.tjanst_year_map_id('row',(p->>'rowId')::uuid,base_version,version)),'null'::jsonb));
 elsif action_name in ('save_special','delete_special') then mapped:=jsonb_set(p,'{specialId}',coalesce(to_jsonb(public.tjanst_year_map_id('special',(p->>'specialId')::uuid,base_version,version)),'null'::jsonb));
 elsif action_name in ('save_joint','dissolve_joint') then
  mapped:=jsonb_set(p,'{jointId}',coalesce(to_jsonb(public.tjanst_year_map_id('joint',(p->>'jointId')::uuid,base_version,version)),'null'::jsonb));
  if action_name='save_joint' then
   select jsonb_agg(to_jsonb(public.tjanst_year_map_id('row',(x.value#>>'{}')::uuid,base_version,version)) order by x.n) into rows from jsonb_array_elements(p->'rowIds') with ordinality x(value,n);
   if jsonb_array_length(rows)<>jsonb_array_length(p->'rowIds') then raise exception 'Incomplete group mapping' using errcode='40001',hint='tjanst_stale_basis';end if;
   mapped:=jsonb_set(mapped,'{rowIds}',rows);
  end if;
 end if;
 if action_name='save_row' then return public.tjanst_plan_save_row(a,d,mapped);
 elsif action_name='save_special' then return public.tjanst_plan_save_special(a,d,mapped);
 elsif action_name='add_teacher' then return public.tjanst_plan_add_teacher(a,d,mapped);
 elsif action_name='remove_teacher' then
  if exists(select 1 from public.tjanst_rows r where r.version_id=version and r.staff_person_id=(p->>'personId')::uuid)
   or exists(select 1 from public.tjanst_special_assignments s where s.version_id=version and s.staff_person_id=(p->>'personId')::uuid)
   or exists(select 1 from public.tjanst_joint_teacher_time t join public.tjanst_joint_groups g on g.id=t.group_id where g.version_id=version and t.staff_person_id=(p->>'personId')::uuid) then
   raise exception 'Teacher column is not empty' using errcode='22023',hint='tjanst_teacher_not_empty';end if;
  delete from public.tjanst_version_teachers t where t.version_id=version and t.staff_person_id=(p->>'personId')::uuid;
  if not found then raise exception 'Teacher column is not present' using errcode='22023',hint='tjanst_teacher_not_found';end if;
  return version;
 elsif action_name='delete_row' then
  mapped_row_id:=(mapped->>'rowId')::uuid;
  if exists(select 1 from public.tjanst_joint_members m where m.row_id=mapped_row_id) then raise exception 'Row is joint' using errcode='22023',hint='tjanst_joint_already';end if;
  return public.tjanst_plan_delete_row(d,mapped);
 elsif action_name='delete_special' then return public.tjanst_plan_delete_special(d,mapped);
 elsif action_name='save_joint' then return public.tjanst_plan_save_joint(d,mapped);
 elsif action_name='dissolve_joint' then return public.tjanst_plan_dissolve_joint(d,mapped);
 else raise exception 'Invalid internal mutation' using errcode='22023';end if;
end $$;

create function public.tjanst_year_apply_batch(a public.access_assignments,d public.tjanst_distributions,batch jsonb,base_version uuid,version uuid,preview jsonb) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare item jsonb;entry jsonb;object_id uuid;person uuid;grp uuid;pair record;
begin
 if batch->>'action'='bulk' then
  for item in select x.value from jsonb_array_elements(batch->'items') x loop
   perform public.tjanst_year_apply_one(a,d,case when item->>'kind'='row' then 'save_row' else 'save_special' end,(item->'payload')-'planningContext',base_version,version);
  end loop;
  return;
 end if;
 -- Reserve temporary unique source keys inside this transaction so an explicit permutation of people
 -- cannot hit an intermediate unique-index collision. Original keys are restored before any reply/journal.
 for item in select x.value from jsonb_array_elements(batch->'items') x where x.value->>'kind'='row' loop
  object_id:=public.tjanst_year_map_id('row',(item->>'id')::uuid,base_version,version);
  update public.tjanst_rows set timplan_row_key='__move_'||id::text,source_key='class_timplan:'||class_id::text||':'||school_year::text||':__move_'||id::text where id=object_id and version_id=version;
 end loop;
 -- Move keeps source/student snapshots and teacher minutes exactly. Only the explicitly chosen person changes.
 -- Preview already checks whole teacher/group selection and all final person/source collisions.
 for item in select x.value from jsonb_array_elements(batch->'items') x loop
  person:=(item->'choice'->>'personId')::uuid;
  object_id:=public.tjanst_year_map_id(item->>'kind',(item->>'id')::uuid,base_version,version);
  if person is not null then insert into public.tjanst_version_teachers(version_id,staff_person_id) values(version,person) on conflict do nothing;end if;
  if item->>'kind'='row' then
   select x.value into entry from jsonb_array_elements(preview->'items') x where x.value->>'itemKey'=item->>'itemKey';
   update public.tjanst_rows set staff_person_id=person,source_key=entry->>'sourceKey',
    timplan_row_key=substring(entry->>'sourceKey' from length('class_timplan:'||class_id::text||':'||school_year::text||':')+1) where id=object_id and version_id=version;
  else update public.tjanst_special_assignments set staff_person_id=person where id=object_id and version_id=version;end if;
 end loop;
 for pair in select distinct e.value->>'jointGroupId' group_id,i.value->>'fromPersonId' old_person,i.value->'choice'->>'personId' new_person
  from jsonb_array_elements(batch->'items') i join jsonb_array_elements(preview->'items') e on e.value->>'itemKey'=i.value->>'itemKey'
  where e.value->>'jointGroupId' is not null loop
  grp:=public.tjanst_year_map_id('joint',pair.group_id::uuid,base_version,version);
  update public.tjanst_joint_teacher_time set staff_person_id=pair.new_person::uuid where group_id=grp and staff_person_id=pair.old_person::uuid;
  if not found then raise exception 'Joint teacher missing' using errcode='40001',hint='tjanst_stale_basis';end if;
 end loop;
end $$;

create or replace function public.tjanst_plan_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;request_id uuid;action_name text;unit uuid;year integer;a public.access_assignments;s public.app_sessions;r public.tjanst_commands;
 d public.tjanst_distributions;version uuid;target jsonb;detail jsonb;receipt jsonb;envelope jsonb;discarded uuid;
 core jsonb;base jsonb;ctx jsonb;support jsonb;preview jsonb;issue text;base_version uuid;
begin
 -- Current authority is checked even for old receipts; no parser/replay path bypasses the customer lock.
 a:=public.tjanst_actor('plan');s:=public.phase5_programplan_session_check();
 if a.function not in ('rektor','administrator') then raise exception 'Service allocation command denied' using errcode='42501';end if;
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>65536 then raise exception 'Invalid command' using errcode='22023',hint='tjanst_input_too_large';end if;
 request_id:=public.tjanst_uuid(input->'commandId');unit:=public.tjanst_uuid(input->'unitId');
 perform public.tjanst_plan_scope(a,unit);
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5561));
 select * into r from public.tjanst_commands where command_id=request_id;
 if found then
  -- Explicit legacy normalization ONLY for an existing persisted legacy command.
  if r.action not in ('move','bulk') and not (r.request->'payload' ? 'planningContext') and not (r.request->'payload' ? 'mutationContext') then
   q:=public.tjanst_plan_parse_legacy(input);
  else q:=public.tjanst_plan_parse(input);end if;
  target:=jsonb_build_object('unitId',unit,'schoolYear',q->'schoolYear','versionId',null,'personId',null);
  if (r.family,r.action,r.customer_id,r.organizer_id,r.actor_identity_id,r.assignment_id,r.target,r.request)
    is distinct from ('plan',q->>'action',a.customer_id,a.organizer_id,s.identity_id,a.id,target,q) then
   raise exception 'Service allocation command changed' using errcode='40001',hint='tjanst_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 q:=public.tjanst_plan_parse(input);action_name:=q->>'action';year:=(q->>'schoolYear')::integer;
 if action_name='publish' and a.function<>'rektor' then raise exception 'Publish denied' using errcode='42501';end if;
 if public.tjanst_hash(jsonb_build_array('tjanst_payload_v1',action_name,input->'payload'))<>q->>'payloadHash' then
  raise exception 'Payload hash mismatch' using errcode='22023',hint='tjanst_payload_hash';end if;
 core:=public.tjanst_year_core(a,unit,year);base:=core->'base';base_version:=(base->>'baseVersionId')::uuid;
 if (base->>'currentRevision')::integer<>(q->>'expectedRevision')::integer then raise exception 'Planning revision changed' using errcode='40001',hint='tjanst_revision_conflict';end if;
 if action_name in ('move','bulk') then
  preview:=public.tjanst_year_batch(core,(q->'payload')-'expectedPreviewHash');
  if preview->>'previewHash'<>q->'payload'->>'expectedPreviewHash' or jsonb_array_length(preview->'blockers')>0 then
   raise exception 'Preview changed or blocked' using errcode='40001',hint='tjanst_stale_basis';end if;
 elsif action_name='save_row' then
  ctx:=q->'payload'->'planningContext';
  if ctx->'baseVersionId' is distinct from base->'baseVersionId' then raise exception 'Planning base changed' using errcode='40001',hint='tjanst_stale_basis';end if;
  support:=public.tjanst_year_row(core,q->'payload'->>'sourceKey',(q->'payload'->>'rowId')::uuid);
  if ctx->>'expectedBasisHash'<>support->>'basisHash' then raise exception 'Planning basis changed' using errcode='40001',hint='tjanst_stale_basis';end if;
  issue:=public.tjanst_year_choice_blocker(core,ctx->'choice',support);
  if issue is not null then raise exception 'Teacher choice changed' using errcode='40001',hint=case when issue='person_unavailable' then 'tjanst_stale_person' else 'tjanst_stale_evidence' end;end if;
 else
  ctx:=q->'payload'->'mutationContext';
  if ctx->'baseVersionId' is distinct from base->'baseVersionId' or ctx->>'expectedBasisHash'<>(public.tjanst_year_catalog(core))->>'basisHash' then
   raise exception 'Mutation basis changed' using errcode='40001',hint='tjanst_stale_basis';end if;
 end if;
 if action_name='save_special' and q#>>'{payload,kind}'='mentor' and not exists(select 1 from jsonb_array_elements(core->'needs') n where n->>'classId'=q#>>'{payload,classId}') then
  raise exception 'Mentor class is outside current year' using errcode='22023',hint='tjanst_unknown_source';end if;
 -- All stale checks precede business writes. The customer lock also protects an absent distribution.
 insert into public.tjanst_distributions(customer_id,organizer_id,unit_id,school_year) values(a.customer_id,a.organizer_id,unit,year) on conflict(unit_id,school_year) do nothing;
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=year for update;
 if d.customer_id<>a.customer_id or d.organizer_id<>a.organizer_id then raise exception 'Planning denied' using errcode='42501';end if;
 if action_name in ('publish','discard_draft') then
  version:=(public.tjanst_current_draft(d)).id;
  if version is distinct from base_version then raise exception 'Draft changed' using errcode='40001',hint='tjanst_stale_basis';end if;
  if action_name='publish' then version:=public.tjanst_plan_publish(a,s,d,q);
  else update public.tjanst_versions set status='discarded' where id=version;discarded:=version;end if;
 else
  version:=public.tjanst_year_ensure_draft(a,s,d,base_version);
  if action_name in ('move','bulk') then perform public.tjanst_year_apply_batch(a,d,q->'payload',base_version,version,preview);
  else perform public.tjanst_year_apply_one(a,d,action_name,(q->'payload')-'planningContext'-'mutationContext',base_version,version);end if;
 end if;
 update public.tjanst_distributions set revision=revision+1 where id=d.id returning * into d;
 target:=jsonb_build_object('unitId',unit,'schoolYear',year,'versionId',null,'personId',null);
 detail:=public.tjanst_plan_projection(a,unit,year,null);
 receipt:=jsonb_build_object('commandId',request_id,'action',action_name,'versionId',version,'revision',d.revision,
  'contentHash',coalesce((select v.content_hash from public.tjanst_versions v where v.id=version),public.tjanst_version_hash(version)),'replayed',false,'changed',true);
 envelope:=jsonb_build_object('contractVersion','tjanst_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),'result',jsonb_build_object('receipt',receipt,'detail',detail));
 insert into public.tjanst_commands(command_id,family,action,customer_id,organizer_id,target,actor_identity_id,assignment_id,request,envelope)
 values(request_id,'plan',action_name,a.customer_id,a.organizer_id,target,s.identity_id,a.id,q,envelope);
 perform public.tjanst_audit(case when action_name='publish' then 'tjanst_plan_published' else 'tjanst_plan_command' end,'tjanst_version',version,
  jsonb_build_object('commandId',request_id,'action',action_name,'revision',d.revision,'unitId',unit,'schoolYear',year,'discarded',discarded is not null));
 return envelope;
end $$;

create or replace function public.tjanst_plan_projection(a public.access_assignments,unit uuid,school_year integer,version_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d public.tjanst_distributions;v public.tjanst_versions;published public.tjanst_versions;needs jsonb;rows jsonb;teachers jsonb;versions jsonb;blockers jsonb;
 specials jsonb;joints jsonb;history boolean:=version_id is not null;editing boolean;actions text[]:='{}';result jsonb;
begin
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=tjanst_plan_projection.school_year;
 if history then
  select * into v from public.tjanst_versions x where x.id=version_id and x.distribution_id=d.id and x.status in ('published','superseded');
  if not found then raise exception 'Service allocation denied' using errcode='42501';end if;
 else
  select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status in ('draft','published') order by (x.status='draft') desc limit 1;
 end if;
 needs:=public.tjanst_needs(unit,school_year);
 select coalesce(jsonb_agg(jsonb_set(public.tjanst_row_json(r,(select x.value||jsonb_build_object('link',c.value->'link') from jsonb_array_elements(needs) c
   cross join lateral jsonb_array_elements(c.value->'needs') x where x.value->>'sourceKey'=r.source_key limit 1)),'{jointGroupId}',
   coalesce((select to_jsonb(m.group_id) from public.tjanst_joint_members m where m.row_id=r.id),'null'::jsonb))
   order by r.source_key collate "C",r.staff_person_id nulls last,r.id),'[]'::jsonb) into rows from public.tjanst_rows r where r.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'lineageId',s.lineage_id,'kind',s.kind,'label',s.label,'personId',s.staff_person_id,'classId',s.class_id,
   'ht',s.ht_minutes,'vt',s.vt_minutes,'comment',s.comment) order by s.kind,s.label collate "C",s.id),'[]'::jsonb) into specials
 from public.tjanst_special_assignments s where s.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'lineageId',g.lineage_id,'name',g.name,
   'rowIds',(select coalesce(jsonb_agg(m.row_id order by m.row_id),'[]'::jsonb) from public.tjanst_joint_members m where m.group_id=g.id),
   'teachers',(select coalesce(jsonb_agg(jsonb_build_object('personId',t.staff_person_id,'ht',t.ht_minutes,'vt',t.vt_minutes) order by t.staff_person_id),'[]'::jsonb)
    from public.tjanst_joint_teacher_time t where t.group_id=g.id)) order by g.name collate "C",g.id),'[]'::jsonb) into joints
 from public.tjanst_joint_groups g where g.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('personId',p.id,'displayName',left(p.given_name||' '||p.family_name,200),'draft',p.status='draft',
   'shareHere',(select max(s.percent) from public.staff_school_duties s where s.staff_person_id=p.id and s.unit_id=unit
     and daterange(s.starts_on,s.ends_on,'[]')&&daterange(make_date(school_year,7,1),make_date(school_year+1,6,30),'[]')))
   order by p.family_name collate "C",p.given_name collate "C",p.id),'[]'::jsonb) into teachers
 from public.staff_people p where p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
  and (exists(select 1 from public.tjanst_version_teachers t where t.version_id=v.id and t.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_joint_teacher_time t join public.tjanst_joint_groups g on g.id=t.group_id where g.version_id=v.id and t.staff_person_id=p.id));
 select coalesce(jsonb_agg(public.tjanst_version_json(x) order by x.version_no desc),'[]'::jsonb) into versions
 from public.tjanst_versions x where x.distribution_id=d.id and x.status<>'discarded';
 blockers:=case when history then '[]'::jsonb else public.tjanst_plan_blockers(a,v,unit,school_year,needs) end;
 editing:=not history and a.function in ('rektor','administrator');
 if editing then
  actions:=array['add_teacher','remove_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','move','bulk'];
  if coalesce(v.status='draft',false) then
   actions:=actions||'discard_draft'::text;
   if a.function='rektor' and jsonb_array_length(blockers)=0 then actions:=actions||'publish'::text;end if;
  end if;
 end if;
 result:=jsonb_build_object('contractVersion','tjanst_v1','unitId',unit,'schoolName',(select u.name from public.school_units u where u.id=unit),
  'schoolYear',school_year,'revision',coalesce(d.revision,0),'version',case when v.id is null then null else public.tjanst_version_json(v) end,
  'versions',versions,'teachers',teachers,
  'classes',(select coalesce(jsonb_agg(c.value-'needs'||jsonb_build_object('needs',(select coalesce(jsonb_agg(x.value-'classId'-'link'),'[]'::jsonb)
    from jsonb_array_elements(c.value->'needs') x))),'[]'::jsonb) from jsonb_array_elements(needs) c),
  'rows',rows,'specials',specials,'joints',joints,'actions',to_jsonb(actions),'blockers',blockers,
  'capabilities',jsonb_build_object('canEdit',editing,
   'canPublish',editing and coalesce(v.status='draft',false) and a.function='rektor' and jsonb_array_length(blockers)=0,'canReadHistory',true));
 -- Återkoppling (TJANST-05): bara för rektor och administratör och bara för den aktuella publicerade versionen.
 select * into published from public.tjanst_versions x where x.distribution_id=d.id and x.status='published';
 if not history and published.id is not null and a.function in ('rektor','administrator') then result:=result||jsonb_build_object('feedback',public.tjanst_feedback_json(published.id));end if;
 return result;
end $$;

create or replace function public.tjanst_command_ref(input jsonb,expected_family text) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare c jsonb;t jsonb;actions text[];
begin
 if not public.phase5_programplan_shape(input,array['command']) or not public.phase5_programplan_shape(input->'command',array['family','commandId','action','target'])
  or input#>>'{command,family}' is distinct from expected_family or jsonb_typeof(input#>'{command,action}') is distinct from 'string'
  or not public.phase5_programplan_shape(input#>'{command,target}',array['unitId','schoolYear','versionId','personId']) then
  raise exception 'Invalid service allocation status request' using errcode='22023',hint='tjanst_invalid';end if;
 c:=input->'command';t:=c->'target';
 actions:=case expected_family when 'personal' then array['create_person','update_person','create_draft_teacher','save_employment','save_duties']
  when 'plan' then array['create_draft','add_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','discard_draft','publish','move','bulk','remove_teacher']
  when 'self' then array['ack','comment'] end;
 if actions is null or not (c->>'action'=any(actions))
  or (t->'schoolYear'<>'null'::jsonb and not public.phase5_programplan_integer(t->'schoolYear',2000,2100)) then
  raise exception 'Invalid service allocation status request' using errcode='22023',hint='tjanst_invalid';end if;
 return jsonb_build_object('family',expected_family,'commandId',public.tjanst_uuid(c->'commandId'),'action',c->>'action',
  'target',jsonb_build_object('unitId',case when t->'unitId'='null'::jsonb then null else public.tjanst_uuid(t->'unitId') end,
   'schoolYear',t->'schoolYear',
   'versionId',case when t->'versionId'='null'::jsonb then null else public.tjanst_uuid(t->'versionId') end,
   'personId',case when t->'personId'='null'::jsonb then null else public.tjanst_uuid(t->'personId') end));
end $$;


-- All added helpers remain internal. Existing entrypoint ACLs survive CREATE OR REPLACE.
revoke all on function public.tjanst_plan_parse_legacy(jsonb),public.tjanst_year_map_id(text,uuid,uuid,uuid),
 public.tjanst_year_ensure_draft(public.access_assignments,public.app_sessions,public.tjanst_distributions,uuid),
 public.tjanst_year_apply_one(public.access_assignments,public.tjanst_distributions,text,jsonb,uuid,uuid),
 public.tjanst_year_apply_batch(public.access_assignments,public.tjanst_distributions,jsonb,uuid,uuid,jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;
