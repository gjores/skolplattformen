-- Explicit versions of a timetable frame's internal choice positions. Parent timplan remains unchanged.
-- SS12000: local planning metadata, not a new Group or standard export. Activity time inherits these explicit minutes.
create table public.elective_time_details (
 id uuid primary key,unit_id uuid not null references public.school_units(id),school_year integer not null,
 timplan_id uuid not null references public.timplans(id),row_key text not null,column_id text not null,
 revision integer not null check(revision>0),applied_revision integer check(applied_revision>0 and applied_revision<=revision),
 unique(unit_id,school_year,timplan_id,row_key,column_id)
);
create table public.elective_time_versions (
 detail_id uuid not null references public.elective_time_details(id),revision integer not null check(revision>0),
 frame jsonb not null,positions jsonb not null,actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),created_at timestamptz not null default clock_timestamp(),primary key(detail_id,revision)
);
create table public.elective_time_commands (
 command_id uuid primary key,unit_id uuid not null references public.school_units(id),school_year integer not null,
 frame_source_key text not null,action text not null check(action in ('save','apply')),payload_hash text not null check(payload_hash~'^[0-9a-f]{64}$'),
 actor_identity_id uuid not null references public.identities(id),assignment_id uuid not null references public.access_assignments(id),
 envelope jsonb not null,created_at timestamptz not null default clock_timestamp()
);
do $$declare n text;begin foreach n in array array['elective_time_details','elective_time_versions','elective_time_commands'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);end loop;end $$;
create function public.elective_time_immutable() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin raise exception 'Time detail history is immutable' using errcode='42501';end $$;
create trigger elective_time_versions_immutable before update or delete or truncate on public.elective_time_versions for each statement execute function public.elective_time_immutable();
create trigger elective_time_commands_immutable before update or delete or truncate on public.elective_time_commands for each statement execute function public.elective_time_immutable();

create function public.elective_time_scope(input jsonb) returns void language plpgsql immutable security definer set search_path=pg_catalog,public as $$
begin
 if not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or jsonb_typeof(input->'frameSourceKey') is distinct from 'string'
 or input->>'frameSourceKey'!~'^class_timplan:[0-9a-f-]{36}:[0-9]{4}:block:[a-z][a-z0-9]{0,15}$'
 or split_part(input->>'frameSourceKey',':',3) is distinct from input->>'schoolYear' then raise exception 'Invalid time detail scope' using errcode='22023',hint='elective_time_invalid';end if;
 perform public.tjanst_uuid(input->'unitId');perform public.tjanst_uuid(to_jsonb(split_part(input->>'frameSourceKey',':',2)));
end $$;
create function public.elective_time_parent(input jsonb,writing boolean default false) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare c jsonb;n jsonb;l jsonb;t public.timplans;frame jsonb;points jsonb;idx integer;ht integer;vt integer;key text;locked_plan uuid;begin
 perform public.elective_time_scope(input);key:=input->>'frameSourceKey';
 if writing then
  select timplan_id into locked_plan from public.class_timplans where class_id=split_part(key,':',2)::uuid and start_year=(input->>'schoolYear')::integer;
  perform 1 from public.timplans where id=locked_plan for update;
  perform 1 from public.class_timplans where class_id=split_part(key,':',2)::uuid and start_year=(input->>'schoolYear')::integer for share;
  if (select timplan_id from public.class_timplans where class_id=split_part(key,':',2)::uuid and start_year=(input->>'schoolYear')::integer) is distinct from locked_plan then
   raise exception 'Time parent link changed' using errcode='40001',hint='elective_time_parent_conflict';end if;
 end if;
 select cl.value,need.value into c,n from jsonb_array_elements(public.tjanst_needs((input->>'unitId')::uuid,(input->>'schoolYear')::integer)) cl
 cross join lateral jsonb_array_elements(cl.value->'needs') need where need.value->>'sourceKey'=key;
 if n is null or c->'link' is null or c->'link'='null'::jsonb then raise exception 'Time frame unavailable' using errcode='22023',hint='elective_time_frame_missing';end if;
 l:=c->'link';select * into t from public.timplans where id=(l->>'timplanId')::uuid;
 if t.unit_id is distinct from (input->>'unitId')::uuid or t.gym_basis is null or l->>'schoolform'<>'gymnasium'
 or n->>'rowKey' not like 'block:%' then raise exception 'Time frame unavailable' using errcode='22023',hint='elective_time_frame_missing';end if;
 if not exists(select 1 from jsonb_array_elements(t.gym_basis#>'{basisReference,choiceBlocks}') b where 'block:'||(b.value->>'id')=n->>'rowKey' and b.value->>'kind' in ('individualChoice','modernLanguage','specialization')) then raise exception 'Time frame unavailable' using errcode='22023',hint='elective_time_frame_missing';end if;
 idx:=2*(substr(l->>'column',3)::integer-1);
 select dist.value->'points' into points from jsonb_array_elements(t.gym_basis->'distribution') dist where dist.value->>'rowKey'=n->>'rowKey';
 if points is null then raise exception 'Time frame unavailable' using errcode='22023',hint='elective_time_frame_missing';end if;
 ht:=case when (points->>idx)::integer=0 and n->'needHt'='null'::jsonb then 0 else (n->>'needHt')::integer end;
 vt:=case when (points->>(idx+1))::integer=0 and n->'needVt'='null'::jsonb then 0 else (n->>'needVt')::integer end;
 if ht is null or vt is null then raise exception 'Active frame time is unknown' using errcode='22023',hint='elective_time_missing';end if;
 frame:=jsonb_build_object('timplanId',t.id,'timplanVersion',t.version,'timplanRevision',t.revision,'rowKey',n->'rowKey','column',l->'column','schoolYear',input->'schoolYear',
 'pointsHt',points->idx,'pointsVt',points->(idx+1),'needHt',ht,'needVt',vt,'needBasis',n->'needBasis');
 frame:=frame||jsonb_build_object('parentHash',substr(public.tjanst_hash(frame),8));
 return jsonb_build_object('unitId',input->'unitId','schoolYear',input->'schoolYear','frameSourceKey',key,'classId',c->'classId','linkRevision',l->'linkRevision','label',n->'label','frame',frame);
end $$;
create function public.elective_time_positions_valid(positions jsonb,frame jsonb) returns void
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare p jsonb;ids uuid[]:='{}';id uuid;field text;sum_ht integer:=0;sum_vt integer:=0;points_ht integer:=0;points_vt integer:=0;begin
 if not public.phase5_programplan_array(positions,32) or jsonb_array_length(positions)=0 then raise exception 'Invalid time positions' using errcode='22023',hint='elective_time_invalid';end if;
 for p in select value from jsonb_array_elements(positions) loop
  perform public.elective_require_shape(p,array['id','name','pointsHt','pointsVt','needHt','needVt']);id:=public.tjanst_uuid(p->'id');
  if id=any(ids) or not public.phase5_apl_text(p->'name',160,false) or btrim(p->>'name') is distinct from p->>'name' then raise exception 'Invalid time position' using errcode='22023',hint='elective_time_invalid';end if;ids:=array_append(ids,id);
  foreach field in array array['pointsHt','pointsVt','needHt','needVt'] loop
   if not public.phase5_programplan_integer(p->field,0,case when field like 'points%' then 10000 else 6000000 end) then raise exception 'Invalid time position' using errcode='22023',hint='elective_time_invalid';end if;
  end loop;
  if (p->>'pointsHt')::integer+(p->>'pointsVt')::integer<=0 or (p->>'needHt')::integer+(p->>'needVt')::integer<=0
   or ((p->>'pointsHt')::integer=0 and (p->>'needHt')::integer<>0) or ((p->>'pointsVt')::integer=0 and (p->>'needVt')::integer<>0) then raise exception 'Invalid time position' using errcode='22023',hint='elective_time_invalid';end if;
  sum_ht:=sum_ht+(p->>'needHt')::integer;sum_vt:=sum_vt+(p->>'needVt')::integer;points_ht:=points_ht+(p->>'pointsHt')::integer;points_vt:=points_vt+(p->>'pointsVt')::integer;
 end loop;
 if (sum_ht,sum_vt,points_ht,points_vt) is distinct from ((frame->>'needHt')::integer,(frame->>'needVt')::integer,(frame->>'pointsHt')::integer,(frame->>'pointsVt')::integer) then raise exception 'Time positions do not preserve frame' using errcode='22023',hint='elective_time_total';end if;
end $$;
create function public.elective_time_projection(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p jsonb;h public.elective_time_details;v public.elective_time_versions;detail jsonb:='null';begin
 p:=public.elective_time_parent(input,false);
 select * into h from public.elective_time_details where unit_id=(input->>'unitId')::uuid and school_year=(input->>'schoolYear')::integer
 and timplan_id=(p#>>'{frame,timplanId}')::uuid and row_key=p#>>'{frame,rowKey}' and column_id=p#>>'{frame,column}';
 if h.id is not null then select * into v from public.elective_time_versions where detail_id=h.id and revision=h.revision;
 detail:=jsonb_build_object('id',h.id,'revision',h.revision,'appliedRevision',h.applied_revision,'frame',v.frame,'positions',v.positions);end if;
 return p||jsonb_build_object('contractVersion','elective_timplan_time_v1','detail',detail);
end $$;
create function public.elective_timplan_time_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;unit uuid;result jsonb;begin
 perform public.elective_require_shape(input,array['unitId','schoolYear','frameSourceKey']);perform public.elective_time_scope(input);unit:=(input->>'unitId')::uuid;
 a:=public.elective_staff_scope(unit);result:=public.elective_time_projection(input);perform public.elective_staff_audit('elective_read',unit,unit);
 return jsonb_build_object('contractVersion','elective_time_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',result);
end $$;
create function public.elective_timplan_time_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;unit uuid;year integer;command uuid;request_hash text;action_name text;scope jsonb;p jsonb;h public.elective_time_details;
 old public.elective_time_commands;next_revision integer;result jsonb;envelope jsonb;begin
 perform public.elective_require_shape(input,array['unitId','schoolYear','frameSourceKey','contractVersion','action','commandId','detailId','expectedRevision','expectedParentHash','expectedLinkRevision','positions']);
 perform public.elective_time_scope(input);unit:=(input->>'unitId')::uuid;year:=(input->>'schoolYear')::integer;command:=public.tjanst_uuid(input->'commandId');action_name:=input->>'action';
 if input->>'contractVersion' is distinct from 'elective_timplan_time_v1' or action_name is null or action_name not in ('save','apply')
 or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483645) or not public.phase5_programplan_integer(input->'expectedLinkRevision',0,2147483646)
 or jsonb_typeof(input->'expectedParentHash') is distinct from 'string' or input->>'expectedParentHash'!~'^[0-9a-f]{64}$' then raise exception 'Invalid time command' using errcode='22023',hint='elective_time_invalid';end if;
 perform public.tjanst_uuid(input->'detailId');a:=public.elective_staff_scope(unit);
 perform pg_advisory_xact_lock(hashtextextended(command::text,5523));perform public.elective_lock_school(unit);a:=public.elective_staff_scope(unit);request_hash:=substr(public.tjanst_hash(input),8);
 select * into old from public.elective_time_commands where command_id=command;
 if old.command_id is not null then
  if old.unit_id<>unit or old.school_year<>year or old.frame_source_key<>input->>'frameSourceKey' or old.actor_identity_id::text<>current_setting('app.identity_id',true) or old.assignment_id<>a.id or old.payload_hash<>request_hash then raise exception 'Time command conflict' using errcode='40001',hint='elective_time_command_conflict';end if;
  perform public.elective_staff_audit('elective_command',command,unit);return jsonb_set(old.envelope,'{result,receipt,replayed}','true');end if;
 scope:=jsonb_build_object('unitId',unit,'schoolYear',year,'frameSourceKey',input->'frameSourceKey');p:=public.elective_time_parent(scope,true);
 if p#>>'{frame,parentHash}' is distinct from input->>'expectedParentHash' or p->'linkRevision' is distinct from input->'expectedLinkRevision' then raise exception 'Time parent changed' using errcode='40001',hint='elective_time_parent_conflict';end if;
 perform public.elective_time_positions_valid(input->'positions',p->'frame');
 select * into h from public.elective_time_details where unit_id=unit and school_year=year and timplan_id=(p#>>'{frame,timplanId}')::uuid and row_key=p#>>'{frame,rowKey}' and column_id=p#>>'{frame,column}' for update;
 if h.id is null then
  if (input->>'expectedRevision')::integer<>0 or exists(select 1 from public.elective_time_details where id=(input->>'detailId')::uuid) then raise exception 'Time detail changed' using errcode='40001',hint='elective_time_revision_conflict';end if;
  insert into public.elective_time_details(id,unit_id,school_year,timplan_id,row_key,column_id,revision,applied_revision)
  values((input->>'detailId')::uuid,unit,year,(p#>>'{frame,timplanId}')::uuid,p#>>'{frame,rowKey}',p#>>'{frame,column}',1,case when action_name='apply' then 1 else null end) returning * into h;next_revision:=1;
 else
  if h.id<>(input->>'detailId')::uuid or h.revision<>(input->>'expectedRevision')::integer then raise exception 'Time detail changed' using errcode='40001',hint='elective_time_revision_conflict';end if;
  next_revision:=h.revision+1;update public.elective_time_details set revision=next_revision,applied_revision=case when action_name='apply' then next_revision else applied_revision end where id=h.id returning * into h;
 end if;
 insert into public.elective_time_versions(detail_id,revision,frame,positions,actor_identity_id,assignment_id)
 values(h.id,next_revision,p->'frame',input->'positions',current_setting('app.identity_id',true)::uuid,a.id);
 if action_name='apply' then update public.elective_school_state set revision=revision+1 where unit_id=unit;end if;
 result:=jsonb_build_object('receipt',scope||jsonb_build_object('commandId',command,'action',action_name,'payloadHash',request_hash,'detailId',h.id,'revision',next_revision,'appliedRevision',h.applied_revision,'replayed',false),'read',public.elective_time_projection(scope));
 envelope:=jsonb_build_object('contractVersion','elective_time_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',result);
 perform public.elective_staff_audit('elective_command',command,unit);
 insert into public.elective_time_commands(command_id,unit_id,school_year,frame_source_key,action,payload_hash,actor_identity_id,assignment_id,envelope)
 values(command,unit,year,input->>'frameSourceKey',action_name,request_hash,current_setting('app.identity_id',true)::uuid,a.id,envelope);return envelope;
end $$;
create function public.elective_timplan_time_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;unit uuid;j public.elective_time_commands;result jsonb;begin
 perform public.elective_require_shape(input,array['unitId','schoolYear','frameSourceKey','commandId','action','payloadHash']);perform public.elective_time_scope(input);unit:=(input->>'unitId')::uuid;
 a:=public.elective_staff_scope(unit);perform public.tjanst_uuid(input->'commandId');
 if jsonb_typeof(input->'action') is distinct from 'string' or input->>'action' not in ('save','apply') or jsonb_typeof(input->'payloadHash') is distinct from 'string' or input->>'payloadHash'!~'^[0-9a-f]{64}$' then raise exception 'Invalid status reference' using errcode='22023',hint='elective_time_invalid';end if;
 select * into j from public.elective_time_commands where command_id=(input->>'commandId')::uuid;
 if j.command_id is null then result:=jsonb_build_object('state','not_found','result',null);
 else
  if j.unit_id<>unit or j.school_year<>(input->>'schoolYear')::integer or j.frame_source_key<>input->>'frameSourceKey' or j.action<>input->>'action' or j.payload_hash<>input->>'payloadHash' or j.actor_identity_id::text<>current_setting('app.identity_id',true) or j.assignment_id<>a.id then raise exception 'Time command conflict' using errcode='40001',hint='elective_time_command_conflict';end if;
  result:=jsonb_build_object('state','found','result',jsonb_set(j.envelope->'result','{receipt,replayed}','true'));end if;
 perform public.elective_staff_audit('elective_status',(input->>'commandId')::uuid,unit);
 return jsonb_build_object('contractVersion','elective_time_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',result);
end $$;
-- Called only by the scoped elective source factory. A draft does not replace the active version.
create or replace function public.elective_expand_time_sources(source jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare h public.elective_time_details;v public.elective_time_versions;p jsonb;part jsonb;result jsonb:='[]';codes jsonb;hint_value text;begin
 if source->>'schoolform'<>'gymnasium' then return jsonb_build_array(source);end if;
 select * into h from public.elective_time_details where unit_id=(source->>'unitId')::uuid and school_year=(source->>'schoolYear')::integer
 and timplan_id=(source->>'timplanId')::uuid and row_key=source->>'rowKey' and column_id=source->>'column';
 if h.id is null or h.applied_revision is null then return jsonb_build_array(source);end if;
 select * into v from public.elective_time_versions where detail_id=h.id and revision=h.applied_revision;
 begin
  p:=public.elective_time_parent(jsonb_build_object('unitId',source->'unitId','schoolYear',source->'schoolYear','frameSourceKey',coalesce(source->'frameSourceKey',source->'sourceKey')),false);
 exception when sqlstate '22023' then
  get stacked diagnostics hint_value=PG_EXCEPTION_HINT;
  if hint_value in ('elective_time_missing','elective_time_frame_missing') then return jsonb_build_array(source);end if;raise;
 end;
 if v.frame->>'parentHash' is distinct from p#>>'{frame,parentHash}' then return jsonb_build_array(source);end if;
 for part in select value from jsonb_array_elements(v.positions) loop
  codes:=public.elective_option_codes(h.timplan_id,source->>'blockKind',(part->>'pointsHt')::integer+(part->>'pointsVt')::integer);
  result:=result||jsonb_build_array(source||jsonb_build_object('frameSourceKey',coalesce(source->'frameSourceKey',source->'sourceKey'),
   'sourceKey',coalesce(source->>'frameSourceKey',source->>'sourceKey')||':position:'||(part->>'id'),'label',left((source->>'label')||' · '||(part->>'name'),300),
   'needHt',part->'needHt','needVt',part->'needVt','allowedOptionCodes',codes,'timeDetailRef',jsonb_build_object('id',h.id,'revision',h.applied_revision,'positionId',part->'id')));
 end loop;return result;
end $$;
-- Every helper remains private. Only reviewed staff entrypoints are callable by the Worker.
revoke all on function public.elective_time_immutable(),public.elective_time_scope(jsonb),public.elective_time_parent(jsonb,boolean),public.elective_time_positions_valid(jsonb,jsonb),public.elective_time_projection(jsonb),
 public.elective_timplan_time_read(jsonb),public.elective_timplan_time_command(jsonb),public.elective_timplan_time_status(jsonb),public.elective_expand_time_sources(jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.elective_timplan_time_read(jsonb),public.elective_timplan_time_command(jsonb),public.elective_timplan_time_status(jsonb) to skolplattform_worker;
