-- 05.1-33 / D-31: flera lärare på samma behov. Delningsform (en i taget eller samtidigt) och betygsansvar per behov och version.
-- Framåtmigration: installerade migrationer ändras inte. Nya tabeller har tvingad RLS och inga rättigheter; nya funktioner är stängda.
-- Inga nya ingångar: save_sharing och clear_sharing går genom tjanst_plan_command med mutationContext.
-- Innehållshashen är oförändrad för versioner utan delning, så publicerad historik och äldre hashar består.
-- Skollagen 3 kap. 16 §: betyg beslutas av den eller de lärare som bedriver undervisningen; minst en betygssättare krävs.
-- SS 12000 (avsedd kompatibilitet, ej verifierad): behovet ↔ Activity med flera lärartilldelningar (Duty) med egen tid;
-- en i taget ↔ olika perioder, samtidigt ↔ samma period. Inget informationsutbyte provas.

-- 1. Tabeller.
create table public.tjanst_need_sharing (
 version_id uuid not null references public.tjanst_versions(id),
 source_key text not null check(char_length(source_key) between 1 and 400),
 mode text not null check(mode in ('sequential','concurrent')),
 primary key(version_id,source_key)
);
create table public.tjanst_need_graders (
 version_id uuid not null,
 source_key text not null,
 staff_person_id uuid not null references public.staff_people(id),
 primary key(version_id,source_key,staff_person_id),
 foreign key(version_id,source_key) references public.tjanst_need_sharing(version_id,source_key)
);
do $$declare n text;begin
 foreach n in array array['tjanst_need_sharing','tjanst_need_graders'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('alter table public.%I force row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);
 end loop;
end $$;
-- Delning och betygssättare ändras bara i utkast (samma regel som raderna).
create trigger tjanst_need_sharing_guard before insert or update or delete on public.tjanst_need_sharing for each row execute function public.tjanst_version_guard();
create trigger tjanst_need_sharing_no_truncate before truncate on public.tjanst_need_sharing for each statement execute function public.tjanst_version_guard();
create trigger tjanst_need_graders_guard before insert or update or delete on public.tjanst_need_graders for each row execute function public.tjanst_version_guard();
create trigger tjanst_need_graders_no_truncate before truncate on public.tjanst_need_graders for each statement execute function public.tjanst_version_guard();

-- 2. Mutationer (anropas bara via tjanst_year_apply_one).
create function public.tjanst_plan_save_sharing(d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);sk text:=p->>'sourceKey';teachers uuid[];graders uuid[];
begin
 -- Delningen gäller lärarna med egen rad utanför samläsning, samma urval som hindret shared_need_unspecified räknar.
 select array_agg(distinct r.staff_person_id) into teachers from public.tjanst_rows r where r.version_id=v.id and r.source_key=sk and r.staff_person_id is not null
  and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id);
 if coalesce(cardinality(teachers),0)<2 then
  if exists(select 1 from public.tjanst_rows r join public.tjanst_joint_members m on m.row_id=r.id where r.version_id=v.id and r.source_key=sk) then
   raise exception 'Joint need cannot be shared' using errcode='22023',hint='tjanst_sharing_joint';end if;
  raise exception 'Sharing needs two teachers' using errcode='22023',hint='tjanst_sharing_too_few';end if;
 select array_agg(distinct (x.value#>>'{}')::uuid) into graders from jsonb_array_elements(p->'graderPersonIds') x;
 if coalesce(cardinality(graders),0)=0 or not graders<@teachers then raise exception 'Invalid graders' using errcode='22023',hint='tjanst_sharing_grader';end if;
 insert into public.tjanst_need_sharing(version_id,source_key,mode) values(v.id,sk,p->>'mode')
 on conflict(version_id,source_key) do update set mode=excluded.mode;
 delete from public.tjanst_need_graders g where g.version_id=v.id and g.source_key=sk;
 insert into public.tjanst_need_graders(version_id,source_key,staff_person_id) select v.id,sk,x from unnest(graders) x;
 return v.id;
end $$;
create function public.tjanst_plan_clear_sharing(d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);sk text:=p->>'sourceKey';
begin
 delete from public.tjanst_need_graders g where g.version_id=v.id and g.source_key=sk;
 delete from public.tjanst_need_sharing s where s.version_id=v.id and s.source_key=sk;
 if not found then raise exception 'No sharing' using errcode='22023',hint='tjanst_invalid';end if;
 return v.id;
end $$;

-- 3. Tolkning: save_sharing och clear_sharing (mutationContext).
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
 elsif action_name in ('save_sharing','clear_sharing') then
  -- 05.1-33: delning per behov (D-31). Egen tolkning; den äldre tolkaren känner inte åtgärderna.
  ctx:=p->'mutationContext';
  if not public.phase5_programplan_shape(ctx,array['baseVersionId','expectedBasisHash']) then
   raise exception 'Mutation context required' using errcode='22023',hint='tjanst_context_required';end if;
  if not public.phase5_programplan_shape(input,array['commandId','unitId','schoolYear','action','expectedRevision','payloadHash','payload'])
   or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483647)
   or coalesce(input->>'payloadHash','')!~'^sha256:[0-9a-f]{64}$'
   or not public.phase5_programplan_shape(p-'mutationContext',case when action_name='save_sharing' then array['sourceKey','mode','graderPersonIds'] else array['sourceKey'] end)
   or jsonb_typeof(p->'sourceKey') is distinct from 'string' or char_length(p->>'sourceKey') not between 1 and 400
   or split_part(p->>'sourceKey',':',3) is distinct from input->>'schoolYear'
   or (action_name='save_sharing' and (p->>'mode' is null or p->>'mode' not in ('sequential','concurrent') or jsonb_typeof(p->'graderPersonIds') is distinct from 'array'
    or jsonb_array_length(p->'graderPersonIds') not between 1 and 20)) then
   raise exception 'Invalid sharing command' using errcode='22023',hint='tjanst_invalid';end if;
  q:=jsonb_build_object('commandId',public.tjanst_uuid(input->'commandId'),'unitId',public.tjanst_uuid(input->'unitId'),'schoolYear',input->'schoolYear',
   'action',action_name,'expectedRevision',input->'expectedRevision','payloadHash',input->'payloadHash',
   'payload',jsonb_build_object('sourceKey',p->'sourceKey','mutationContext',ctx)
    ||case when action_name='save_sharing' then jsonb_build_object('mode',p->'mode','graderPersonIds',
      (select jsonb_agg(to_jsonb(public.tjanst_uuid(x.value)) order by x.n) from jsonb_array_elements(p->'graderPersonIds') with ordinality x(value,n))) else '{}'::jsonb end);
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
-- 4. Utförande av de nya åtgärderna.
create or replace function public.tjanst_year_apply_one(a public.access_assignments,d public.tjanst_distributions,action_name text,p jsonb,base_version uuid,version uuid) returns uuid
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
 elsif action_name='save_sharing' then return public.tjanst_plan_save_sharing(d,mapped);
 elsif action_name='clear_sharing' then return public.tjanst_plan_clear_sharing(d,mapped);
 else raise exception 'Invalid internal mutation' using errcode='22023';end if;
end $$;
-- 5. Flytt: betygssättare följer personbytet.
create or replace function public.tjanst_year_apply_batch(a public.access_assignments,d public.tjanst_distributions,batch jsonb,base_version uuid,version uuid,preview jsonb) returns void
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
 -- 05.1-33: betygssättare följer ett uttryckligt personbyte på behovet; en flytt till Vakant tar bort betygsansvaret.
 for pair in select distinct e.value->>'sourceKey' source_key,i.value->>'fromPersonId' old_person,i.value->'choice'->>'personId' new_person
  from jsonb_array_elements(batch->'items') i join jsonb_array_elements(preview->'items') e on e.value->>'itemKey'=i.value->>'itemKey'
  where i.value->>'kind'='row' loop
  if pair.new_person is not null and not exists(select 1 from public.tjanst_need_graders g where g.version_id=version and g.source_key=pair.source_key and g.staff_person_id=pair.new_person::uuid) then
   update public.tjanst_need_graders set staff_person_id=pair.new_person::uuid where version_id=version and source_key=pair.source_key and staff_person_id=pair.old_person::uuid;
  else delete from public.tjanst_need_graders where version_id=version and source_key=pair.source_key and staff_person_id=pair.old_person::uuid;end if;
 end loop;
end $$;
-- 6. Kopiering till nytt utkast.
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
 -- 05.1-33: delning och betygssättare följer med till nytt utkast (behovsnyckeln är stabil inom läsåret).
 insert into public.tjanst_need_sharing(version_id,source_key,mode) select target_version,ns.source_key,ns.mode from public.tjanst_need_sharing ns where ns.version_id=source_version;
 insert into public.tjanst_need_graders(version_id,source_key,staff_person_id) select target_version,ng.source_key,ng.staff_person_id from public.tjanst_need_graders ng where ng.version_id=source_version;
end $$;
-- 7. Innehållshash.
create or replace function public.tjanst_version_hash(version uuid) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.tjanst_hash(jsonb_build_array('tjanst_content_v2',d.unit_id,d.school_year,
  coalesce((select jsonb_agg(t.staff_person_id order by t.staff_person_id) from public.tjanst_version_teachers t where t.version_id=v.id),'[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_array(r.lineage_id,r.source_key,r.staff_person_id,r.link_revision,r.timplan_id,r.timplan_version,r.link_column,
    r.need_ht_minutes,r.need_vt_minutes,r.need_basis,r.teacher_ht_minutes,r.teacher_vt_minutes,r.comment) order by r.lineage_id)
   from public.tjanst_rows r where r.version_id=v.id),'[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_array(s.lineage_id,s.kind,s.label,s.staff_person_id,s.class_id,s.ht_minutes,s.vt_minutes,s.comment) order by s.lineage_id)
   from public.tjanst_special_assignments s where s.version_id=v.id),'[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_array(g.lineage_id,g.name,
     (select jsonb_agg(r.lineage_id order by r.lineage_id) from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id),
     (select jsonb_agg(jsonb_build_array(t.staff_person_id,t.ht_minutes,t.vt_minutes) order by t.staff_person_id) from public.tjanst_joint_teacher_time t where t.group_id=g.id))
    order by g.lineage_id) from public.tjanst_joint_groups g where g.version_id=v.id),'[]'::jsonb))
  -- 05.1-33: delning läggs bara till när den finns, så hashen för versioner utan delning är oförändrad.
  ||case when exists(select 1 from public.tjanst_need_sharing s where s.version_id=v.id) then jsonb_build_array(jsonb_build_array('sharing_v1',
   (select jsonb_agg(jsonb_build_array(s.source_key,s.mode,(select jsonb_agg(g.staff_person_id order by g.staff_person_id) from public.tjanst_need_graders g
     where g.version_id=s.version_id and g.source_key=s.source_key)) order by s.source_key) from public.tjanst_need_sharing s where s.version_id=v.id))) else '[]'::jsonb end)
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id where v.id=version
$$;
-- 8. Publiceringshinder.
create or replace function public.tjanst_plan_blockers(a public.access_assignments,v public.tjanst_versions,unit uuid,school_year integer,needs jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb:='[]';
begin
 if v.id is null or v.status<>'draft' then return result;end if;
 if not exists(select 1 from public.tjanst_rows r where r.version_id=v.id) then
  result:=result||jsonb_build_array(jsonb_build_object('code','empty_draft','message','Utkastet har inga tjänsterader. Lägg till minst en rad före publicering.'));end if;
 if exists(select 1 from public.tjanst_rows r where r.version_id=v.id and (public.tjanst_row_json(r,(select x.value||jsonb_build_object('link',c.value->'link')
   from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') x where x.value->>'sourceKey'=r.source_key limit 1))->>'stale')::boolean) then
  result:=result||jsonb_build_array(jsonb_build_object('code','stale_rows','message','Underlaget har ändrats för en eller flera rader. Spara raderna på nytt efter granskning.'));end if;
 if exists(select 1 from (select t.staff_person_id p from public.tjanst_version_teachers t where t.version_id=v.id
   union select r.staff_person_id from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id is not null
   union select s.staff_person_id from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id is not null) x
   where not public.tjanst_person_at_school(a,x.p,unit,school_year)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','person_not_at_school','message','En lärare saknar giltigt skoluppdrag på skolan för läsåret.'));end if;
 -- WR-02 (D-16): samläsningens regler prövas också vid publicering, även för data från före rättelsen.
 if exists(select 1 from public.tjanst_joint_groups g where g.version_id=v.id and (
   (select count(distinct r.class_id) from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id)<2
   or exists(select 1 from public.tjanst_joint_teacher_time t where t.group_id=g.id and not exists(select 1 from public.tjanst_joint_members m
    join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id and r.staff_person_id=t.staff_person_id)))) then
  result:=result||jsonb_build_array(jsonb_build_object('code','joint_invalid','message','En samläsning uppfyller inte reglerna: raderna ska finnas i minst två klasser, och lärartid får bara gälla lärare som har en rad i gruppen. Ändra eller lös upp samläsningen.'));end if;
 -- D-28: en samläsning har samma lärare för alla rader (eller bara vakanta rader); äldre blandade grupper repareras aldrig automatiskt.
 if exists(select 1 from public.tjanst_joint_groups g where g.version_id=v.id and (
   (select count(distinct coalesce(r.staff_person_id::text,'vakant')) from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id)>1
   or (select count(*) from public.tjanst_joint_teacher_time t where t.group_id=g.id)>1)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','joint_mixed_teachers','message','En samläsning har flera lärare. En samläsning ska ha samma lärare för alla klasser. Flytta uppdragen till samma lärare eller lös upp samläsningen.'));end if;
 -- 05.1-33 / D-31: två eller fler lärare med tid på samma behov kräver en angiven delningsform och minst en betygssättare med tid.
 if exists(select 1 from (select r.source_key from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id is not null
   and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id) group by r.source_key having count(distinct r.staff_person_id)>1) x
   where not exists(select 1 from public.tjanst_need_sharing s where s.version_id=v.id and s.source_key=x.source_key)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','shared_need_unspecified','message','Två eller fler lärare har tid på samma kurs i en klass utan angiven delning. Ange om de undervisar en i taget eller samtidigt.'));end if;
 if exists(select 1 from public.tjanst_need_sharing s where s.version_id=v.id
   and (select count(distinct r.staff_person_id) from public.tjanst_rows r where r.version_id=v.id and r.source_key=s.source_key and r.staff_person_id is not null
    and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id))>1
   and not exists(select 1 from public.tjanst_need_graders g join public.tjanst_rows r on r.version_id=v.id and r.source_key=g.source_key and r.staff_person_id=g.staff_person_id
    where g.version_id=v.id and g.source_key=s.source_key and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id))) then
  result:=result||jsonb_build_array(jsonb_build_object('code','grader_missing','message','En delad kurs saknar lärare som sätter betyg. Ange vem eller vilka av lärarna som sätter betyget.'));end if;
 return result;
end $$;
-- 9. Läsning: delning och nya åtgärder.
create or replace function public.tjanst_plan_projection(a public.access_assignments,unit uuid,school_year integer,version_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d public.tjanst_distributions;v public.tjanst_versions;published public.tjanst_versions;needs jsonb;rows jsonb;teachers jsonb;versions jsonb;blockers jsonb;
 specials jsonb;joints jsonb;sharing jsonb;history boolean:=version_id is not null;editing boolean;actions text[]:='{}';result jsonb;
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
 select coalesce(jsonb_agg(jsonb_build_object('sourceKey',s.source_key,'mode',s.mode,'graderPersonIds',
   (select coalesce(jsonb_agg(g.staff_person_id order by g.staff_person_id),'[]'::jsonb) from public.tjanst_need_graders g where g.version_id=s.version_id and g.source_key=s.source_key))
   order by s.source_key collate "C"),'[]'::jsonb) into sharing
 from public.tjanst_need_sharing s where s.version_id=v.id;
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
  actions:=array['add_teacher','remove_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','move','bulk','save_sharing','clear_sharing'];
  if coalesce(v.status='draft',false) then
   actions:=actions||'discard_draft'::text;
   if a.function='rektor' and jsonb_array_length(blockers)=0 then actions:=actions||'publish'::text;end if;
  end if;
 end if;
 result:=jsonb_build_object('contractVersion','tjanst_v1','unitId',unit,'schoolName',(select u.name from public.school_units u where u.id=unit),
  'schoolYear',school_year,'revision',coalesce(d.revision,0),'version',case when v.id is null then null else public.tjanst_version_json(v) end,
  'versions',versions,'teachers',teachers,
  'classes',(select coalesce(jsonb_agg(c.value-'needs'||jsonb_build_object('aplMinutes',public.tjanst_class_apl_minutes(c.value->'link'),'needs',(select coalesce(jsonb_agg(x.value-'classId'-'link'),'[]'::jsonb)
    from jsonb_array_elements(c.value->'needs') x))),'[]'::jsonb) from jsonb_array_elements(needs) c),
  'rows',rows,'specials',specials,'joints',joints,'sharing',sharing,'actions',to_jsonb(actions),'blockers',blockers,
  'capabilities',jsonb_build_object('canEdit',editing,
   'canPublish',editing and coalesce(v.status='draft',false) and a.function='rektor' and jsonb_array_length(blockers)=0,'canReadHistory',true));
 -- Återkoppling (TJANST-05): bara för rektor och administratör och bara för den aktuella publicerade versionen.
 select * into published from public.tjanst_versions x where x.distribution_id=d.id and x.status='published';
 if not history and published.id is not null and a.function in ('rektor','administrator') then result:=result||jsonb_build_object('feedback',public.tjanst_feedback_json(published.id));end if;
 return result;
end $$;
-- 10. Statuskvitto för de nya åtgärderna.
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
  when 'plan' then array['create_draft','add_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','discard_draft','publish','move','bulk','remove_teacher','save_sharing','clear_sharing']
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
-- 11. Huvudmannens summor.
create or replace function public.tjanst_school_sums(version uuid,unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare teaching_ht bigint;teaching_vt bigint;special_ht bigint;special_vt bigint;vacant_ht bigint;vacant_vt bigint;un_ht bigint:=0;un_vt bigint:=0;
 needs jsonb;n jsonb;cov_ht bigint;cov_vt bigint;
begin
 select coalesce(sum(r.teacher_ht_minutes) filter (where r.staff_person_id is not null),0),coalesce(sum(r.teacher_vt_minutes) filter (where r.staff_person_id is not null),0),
  coalesce(sum(r.teacher_ht_minutes) filter (where r.staff_person_id is null),0),coalesce(sum(r.teacher_vt_minutes) filter (where r.staff_person_id is null),0)
 into teaching_ht,teaching_vt,vacant_ht,vacant_vt
 from public.tjanst_rows r where r.version_id=version and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id);
 select teaching_ht+coalesce(sum(t.ht_minutes),0),teaching_vt+coalesce(sum(t.vt_minutes),0) into teaching_ht,teaching_vt
 from public.tjanst_joint_teacher_time t join public.tjanst_joint_groups g on g.id=t.group_id where g.version_id=version;
 select coalesce(sum(s.ht_minutes) filter (where s.staff_person_id is not null),0),coalesce(sum(s.vt_minutes) filter (where s.staff_person_id is not null),0),
  vacant_ht+coalesce(sum(s.ht_minutes) filter (where s.staff_person_id is null),0),vacant_vt+coalesce(sum(s.vt_minutes) filter (where s.staff_person_id is null),0)
 into special_ht,special_vt,vacant_ht,vacant_vt from public.tjanst_special_assignments s where s.version_id=version;
 needs:=public.tjanst_needs(unit,school_year);
 for n in select x.value from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') x where c.value->'link'<>'null'::jsonb loop
  select coalesce(sum(r.teacher_ht_minutes),0),coalesce(sum(r.teacher_vt_minutes),0) into cov_ht,cov_vt from public.tjanst_rows r
  where r.version_id=version and r.source_key=n->>'sourceKey' and r.staff_person_id is not null and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id);
  -- 05.1-33: samtidig undervisning täcker behovet en gång (största lärartiden per termin).
  if exists(select 1 from public.tjanst_need_sharing s where s.version_id=version and s.source_key=n->>'sourceKey' and s.mode='concurrent') then
   select coalesce(max(r.teacher_ht_minutes),0),coalesce(max(r.teacher_vt_minutes),0) into cov_ht,cov_vt from public.tjanst_rows r
   where r.version_id=version and r.source_key=n->>'sourceKey' and r.staff_person_id is not null and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id);
  end if;
  select cov_ht+coalesce(sum(t.ht_minutes),0),cov_vt+coalesce(sum(t.vt_minutes),0) into cov_ht,cov_vt from public.tjanst_joint_teacher_time t
  where t.group_id in (select distinct m.group_id from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where r.version_id=version and r.source_key=n->>'sourceKey');
  if n->'needHt'<>'null'::jsonb then un_ht:=un_ht+greatest(0,(n->>'needHt')::bigint-cov_ht);end if;
  if n->'needVt'<>'null'::jsonb then un_vt:=un_vt+greatest(0,(n->>'needVt')::bigint-cov_vt);end if;
 end loop;
 return jsonb_build_object('teaching',jsonb_build_object('ht',teaching_ht,'vt',teaching_vt),'special',jsonb_build_object('ht',special_ht,'vt',special_vt),
  'vacant',jsonb_build_object('ht',vacant_ht,'vt',vacant_vt),'unallocated',jsonb_build_object('ht',un_ht,'vt',un_vt),
  'unlinkedClasses',(select count(*) from jsonb_array_elements(needs) c where c.value->'link'='null'::jsonb));
end $$;
-- 12. Min tjänst: delning och betygsansvar på egen rad.
create or replace function public.tjanst_self_projection(a public.access_assignments) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.staff_people:=public.tjanst_self_person(a);publications jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('versionId',v.id,'versionNo',v.version_no,'unitId',d.unit_id,
   'schoolName',(select u.name from public.school_units u where u.id=d.unit_id),'schoolYear',d.school_year,
   'publishedAt',to_char(v.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'contentHash',v.content_hash,
   'rows',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'className',c.name,'rowKey',r.timplan_row_key,'label',r.need_label,
     'ht',r.teacher_ht_minutes,'vt',r.teacher_vt_minutes,
     'sharing',(select jsonb_build_object('mode',s.mode,
       'colleagues',coalesce((select jsonb_agg(distinct left(o.given_name||' '||o.family_name,200)) from public.tjanst_rows o_r join public.staff_people o on o.id=o_r.staff_person_id
         where o_r.version_id=v.id and o_r.source_key=r.source_key and o.id<>p.id and not exists(select 1 from public.tjanst_joint_members om where om.row_id=o_r.id)),'[]'::jsonb),
       'grader',exists(select 1 from public.tjanst_need_graders g where g.version_id=v.id and g.source_key=r.source_key and g.staff_person_id=p.id))
      from public.tjanst_need_sharing s where s.version_id=v.id and s.source_key=r.source_key and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id)),
     'joint',(select jsonb_build_object('jointId',g.id,'name',g.name,
       'colleagues',coalesce((select jsonb_agg(left(o.given_name||' '||o.family_name,200) order by o.family_name collate "C",o.given_name collate "C")
         from public.tjanst_joint_teacher_time t join public.staff_people o on o.id=t.staff_person_id where t.group_id=g.id and o.id<>p.id),'[]'::jsonb),
       'ht',coalesce((select t.ht_minutes from public.tjanst_joint_teacher_time t where t.group_id=g.id and t.staff_person_id=p.id),0),
       'vt',coalesce((select t.vt_minutes from public.tjanst_joint_teacher_time t where t.group_id=g.id and t.staff_person_id=p.id),0))
      from public.tjanst_joint_members m join public.tjanst_joint_groups g on g.id=m.group_id where m.row_id=r.id))
     order by c.name collate "C",r.need_label collate "C",r.id),'[]'::jsonb)
    from public.tjanst_rows r join public.school_classes c on c.id=r.class_id where r.version_id=v.id and r.staff_person_id=p.id),
   'specials',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'label',s.label,'className',(select c.name from public.school_classes c where c.id=s.class_id),
     'ht',s.ht_minutes,'vt',s.vt_minutes) order by s.kind,s.label collate "C",s.id),'[]'::jsonb)
    from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id=p.id),
   'acknowledgedAt',(select to_char(f.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from public.tjanst_feedback f where f.version_id=v.id and f.staff_person_id=p.id and f.kind='ack'),
   'comments',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'body',f.body,'at',to_char(f.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by f.created_at,f.id),'[]'::jsonb)
    from public.tjanst_feedback f where f.version_id=v.id and f.staff_person_id=p.id and f.kind='comment'))
   order by d.school_year desc,d.unit_id),'[]'::jsonb) into publications
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id
 where v.status='published' and d.customer_id=a.customer_id and d.organizer_id=a.organizer_id
  and d.unit_id=any(public.tjanst_self_unit_ids(a))
  and (exists(select 1 from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_version_teachers t where t.version_id=v.id and t.staff_person_id=p.id));
 return jsonb_build_object('contractVersion','tjanst_v1','person',jsonb_build_object('id',p.id,'displayName',left(p.given_name||' '||p.family_name,200)),
  'publications',publications,'capabilities',jsonb_build_object('canAck',true,'canComment',true));
end $$;
-- 13. Nya hjälpfunktioner är stängda; inga nya ingångar.
revoke all on function public.tjanst_plan_save_sharing(public.tjanst_distributions,jsonb),public.tjanst_plan_clear_sharing(public.tjanst_distributions,jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;
