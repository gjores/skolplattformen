-- VB16. A timetable-owned preparation exists before class links or pupils do.
-- Local planning metadata; Group/Activity identities remain in the existing elective module.
create table public.elective_preparations (
 id uuid primary key, unit_id uuid not null references public.school_units(id), plan_id uuid not null references public.timplans(id),
 school_year integer not null check(school_year between 2000 and 2100), column_id text not null,
 revision integer not null check(revision>0), applied_revision integer, draft jsonb not null, source_hash text not null,
 applied_draft jsonb, applied_source_hash text, materialized jsonb not null default '[]',
 unique(unit_id,plan_id,school_year,column_id), check(applied_revision is null or applied_revision<=revision)
);
create table public.elective_preparation_versions (
 preparation_id uuid not null references public.elective_preparations(id),revision integer not null,
 draft jsonb not null,source_hash text not null,actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),created_at timestamptz not null default clock_timestamp(),
 primary key(preparation_id,revision)
);
create table public.elective_preparation_commands (
 command_id uuid primary key,unit_id uuid not null references public.school_units(id),plan_id uuid not null references public.timplans(id),
 school_year integer not null,column_id text not null,action text not null check(action in ('save','apply')),
 payload_hash text not null,actor_identity_id uuid not null references public.identities(id),assignment_id uuid not null references public.access_assignments(id),
 envelope jsonb not null,created_at timestamptz not null default clock_timestamp()
);
do $$declare n text;begin foreach n in array array['elective_preparations','elective_preparation_versions','elective_preparation_commands'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);end loop;end $$;
create trigger elective_preparation_versions_immutable before update or delete or truncate on public.elective_preparation_versions for each statement execute function public.elective_time_immutable();
create trigger elective_preparation_commands_immutable before update or delete or truncate on public.elective_preparation_commands for each statement execute function public.elective_time_immutable();

create function public.elective_preparation_scope(input jsonb) returns void
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
begin perform public.tjanst_uuid(input->'unitId');perform public.tjanst_uuid(input->'planId');
 if not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or jsonb_typeof(input->'columnId') is distinct from 'string'
 or input->>'columnId'!~'^(ar[1-3]|ak[1-9])$' then raise exception 'Invalid preparation scope' using errcode='22023',hint='elective_preparation_invalid';end if;
end $$;

create function public.elective_preparation_projection(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare t public.timplans;o public.offerings;a public.access_assignments;h public.elective_preparations;d public.elective_time_details;
 frames jsonb:='[]';classes jsonb:='[]';blockers jsonb:='[]';f jsonb;pts jsonb;mins jsonb;codes jsonb;allowed jsonb;basis jsonb;
 cohort_year integer;idx integer;points_ht integer;points_vt integer;ht integer;vt integer;grades smallint[];hrs smallint[];allocated boolean[];p integer;
 key text;kind text;label text;existing_blocks jsonb;source_hash text;prep jsonb:='null';body jsonb;begin
 perform public.elective_preparation_scope(input);a:=public.elective_staff_scope((input->>'unitId')::uuid);
 select * into t from public.timplans where id=(input->>'planId')::uuid;select * into o from public.offerings where id=t.offering_id;
 if t.id is null or t.unit_id is distinct from (input->>'unitId')::uuid or o.unit_id is distinct from t.unit_id or t.organizer_id<>a.organizer_id then raise exception 'Preparation denied' using errcode='42501';end if;
 if (o.kind='gymnasium' and input->>'columnId'!~'^ar[1-3]$') or (o.kind='grundskola' and input->>'columnId'!~'^ak[1-9]$') or o.kind not in ('gymnasium','grundskola') then raise exception 'Unsupported preparation' using errcode='22023',hint='elective_preparation_invalid';end if;
 if t.status<>'faststalld' then blockers:=blockers||jsonb_build_array('Timplansversionen är inte godkänd för ny förberedelse.');end if;
 select coalesce(jsonb_agg(jsonb_build_object('classId',sc.id,'className',sc.name,'linkRevision',l.revision) order by sc.name collate "C",sc.id),'[]') into classes
 from public.class_timplans l join public.school_classes sc on sc.id=l.class_id
 where l.unit_id=t.unit_id and l.timplan_id=t.id and l.start_year=(input->>'schoolYear')::integer and l.column_id=input->>'columnId'
 and public.phase5_class_cohort_year_fits(sc,(input->>'schoolYear')::integer);
 if o.kind='gymnasium' then
  blockers:=blockers||public.phase5_class_blockers(t,o);cohort_year:=public.phase5_class_start_year(t);
  if cohort_year is not null and (input->>'schoolYear')::integer<>cohort_year+substr(input->>'columnId',3)::integer-1 then blockers:=blockers||jsonb_build_array('Valt läsår stämmer inte med årskolumnen och timplanens frysta kullstart.');end if;
  if t.gym_basis is null then blockers:=blockers||jsonb_build_array('Timplanen saknar versionsbundet gymnasieunderlag.');
  else
   idx:=2*(substr(input->>'columnId',3)::integer-1);basis:=t.gym_basis->'basisReference';
   for f in select value from jsonb_array_elements(coalesce(basis->'choiceBlocks','[]')) loop
    key:='block:'||(f->>'id');kind:=f->>'kind';continue when kind not in ('modernLanguage','individualChoice','specialization');
    pts:=null;select v.value->'points' into pts from jsonb_array_elements(t.gym_basis->'distribution') v where v.value->>'rowKey'=key;
    continue when pts is null or coalesce((pts->>idx)::integer,0)+coalesce((pts->>(idx+1))::integer,0)=0;
    points_ht:=(pts->>idx)::integer;points_vt:=(pts->>(idx+1))::integer;ht:=null;vt:=null;
    if exists(select 1 from public.timplan_time_models m where m.plan_id=t.id) then
     select school_minutes into mins from public.timplan_time_cells_v2 c where c.plan_id=t.id and c.row_key=key;
     ht:=case when points_ht=0 then 0 else (mins->>idx)::integer end;vt:=case when points_vt=0 then 0 else (mins->>(idx+1))::integer end;
    else
     select c.hours,c.allocated into hrs,allocated from public.timplan_cells c where c.timplan_id=t.id and c.row_id=key;
     if coalesce(allocated[idx+1],false) or coalesce(allocated[idx+2],false) then
      ht:=(coalesce(hrs[idx+1],0)+coalesce(hrs[idx+2],0))*30;vt:=ht;
     end if;
    end if;
    allowed:='{}';
    for p in select distinct (it.value->>'points')::integer from public.programplan_catalogs pc cross join lateral jsonb_array_elements(pc.payload->'subjects') sub cross join lateral jsonb_array_elements(sub.value->'items') it
     where pc.catalog_id=t.gym_basis->>'catalogId' and sub.value->>'typeOfSyllabus'='GRADE_SUBJECT_SYLLABUS' and (it.value->>'points')::integer<=points_ht+points_vt loop
     codes:=public.elective_option_codes(t.id,kind,p);if jsonb_array_length(codes)>0 then allowed:=allowed||jsonb_build_object(p::text,codes);end if;
    end loop;
    d:=null;select * into d from public.elective_time_details x where x.unit_id=t.unit_id and x.school_year=(input->>'schoolYear')::integer and x.timplan_id=t.id and x.row_key=key and x.column_id=input->>'columnId';
    select coalesce(jsonb_agg(v.item order by v.item->>'name' collate "C",v.item->>'id'),'[]') into existing_blocks from (
     select jsonb_build_object('id',eb.id,'name',eb.name,'revision',eb.revision,'classIds',jsonb_agg(distinct bs.class_id order by bs.class_id)) item
     from public.elective_blocks eb join public.elective_block_sources bs on bs.block_id=eb.id and bs.active
     where eb.unit_id=t.unit_id and eb.school_year=(input->>'schoolYear')::integer and eb.organization_retired_at is null
      and bs.timplan_id=t.id and bs.source_ref->>'rowKey'=key and bs.source_ref->>'column'=input->>'columnId'
     group by eb.id
    ) v;
    frames:=frames||jsonb_build_array(jsonb_build_object('existingBlocks',existing_blocks,'rowKey',key,'label',f->>'name','kind',kind,'pointsHt',points_ht,'pointsVt',points_vt,'needHt',ht,'needVt',vt,
     'needBasis',case when exists(select 1 from public.timplan_time_models m where m.plan_id=t.id) then 'terms' else 'even_split' end,'allowedCodesByPoints',allowed,'detailId',d.id,'detailRevision',coalesce(d.revision,0),'appliedDetailRevision',d.applied_revision));
   end loop;
  end if;
 else
  if o.archived_at is not null then blockers:=blockers||jsonb_build_array('Utbildningen är arkiverad.');end if;
  -- Approved legacy GR cells have positional arrays, but no frozen grade map. Never turn today's offering.grades into historical evidence.
  blockers:=blockers||jsonb_build_array('Timplanens historiska årskurskarta är inte verifierad. Valbara block kan inte förberedas från dessa positionskolumner ännu.');
 end if;
 if jsonb_array_length(frames)=0 then blockers:=blockers||jsonb_build_array('Inga stödda valramar finns i den här timplanskolumnen.');end if;
 body:=jsonb_build_object('contractVersion','elective_preparation_v1','unitId',input->'unitId','planId',t.id,'schoolYear',input->'schoolYear','columnId',input->'columnId',
 'catalogId',t.gym_basis->>'catalogId','planName',coalesce(public.phase5_named_timplan_plan_series(t.id)->>'name',o.name),'planVersion',t.version,'planRevision',t.revision,'schoolform',o.kind,'frames',frames,'classes',classes,'blockers',blockers);
 source_hash:=substr(public.tjanst_hash(body),8);
 select * into h from public.elective_preparations x where x.unit_id=t.unit_id and x.plan_id=t.id and x.school_year=(input->>'schoolYear')::integer and x.column_id=input->>'columnId';
 if h.id is not null then prep:=jsonb_build_object('id',h.id,'revision',h.revision,'appliedRevision',h.applied_revision,'draft',h.draft,'sourceHash',h.source_hash,
  'materializedBlockIds',(select coalesce(jsonb_agg(x.value->'blockId'),'[]') from jsonb_array_elements(h.materialized) x));end if;
 return body||jsonb_build_object('sourceHash',source_hash,'preparation',prep);
end $$;

create function public.elective_preparation_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;body jsonb;begin
 perform public.elective_require_shape(input,array['unitId','planId','schoolYear','columnId']);a:=public.elective_staff_scope((input->>'unitId')::uuid);body:=public.elective_preparation_projection(input);
 perform public.elective_staff_audit('elective_read',(input->>'planId')::uuid,(input->>'unitId')::uuid);
 return jsonb_build_object('contractVersion','elective_preparation_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',body);
end $$;

-- A detail revision is a source precondition, not a change to the desired organisation.
create function public.elective_preparation_content(draft jsonb) returns jsonb
language sql immutable security definer set search_path=pg_catalog,public as $$
 select jsonb_set(draft,'{frames}',coalesce((select jsonb_agg(x.value-'expectedDetailRevision') from jsonb_array_elements(draft->'frames') x),'[]'))
$$;

create function public.elective_preparation_validate(draft jsonb,source_read jsonb,applying boolean) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare fd jsonb;frame jsonb;slot jsonb;op jsonb;g jsonb;v jsonb;sub jsonb;item jsonb;all_ids uuid[]:='{}';frame_keys text[]:='{}';classes uuid[]:='{}';
 id uuid;opt_ids uuid[];sum_ph integer;sum_pv integer;sum_ht integer;sum_vt integer;n integer;i integer;ph integer;pv integer;ht integer;vt integer;expected jsonb;actual jsonb;begin
 perform public.elective_require_shape(draft,array['id','classIds','frames']);id:=public.tjanst_uuid(draft->'id');all_ids:=array_append(all_ids,id);
 if not public.phase5_programplan_array(draft->'classIds',250) or not public.phase5_programplan_array(draft->'frames',20) then raise exception 'Invalid preparation' using errcode='22023',hint='elective_preparation_invalid';end if;
 for v in select value from jsonb_array_elements(draft->'classIds') loop
  id:=public.tjanst_uuid(v);if id=any(classes) or not exists(select 1 from jsonb_array_elements(source_read->'classes') c where c.value->>'classId'=id::text) then raise exception 'Class link changed' using errcode='40001',hint='elective_preparation_source_conflict';end if;classes:=array_append(classes,id);
 end loop;
 if applying and (cardinality(classes)=0 or cardinality(classes)>100 or jsonb_array_length(draft->'frames')=0) then raise exception 'Choose classes and frames' using errcode='22023',hint='elective_preparation_classes_missing';end if;
 for fd in select value from jsonb_array_elements(draft->'frames') loop
  perform public.elective_require_shape(fd,array['rowKey','detailId','expectedDetailRevision','profile','slots']);frame:=null;
  select value into frame from jsonb_array_elements(source_read->'frames') f where f.value->>'rowKey'=fd->>'rowKey';
  if frame is null or fd->>'rowKey'=any(frame_keys) then raise exception 'Frame changed' using errcode='40001',hint='elective_preparation_source_conflict';end if;frame_keys:=array_append(frame_keys,fd->>'rowKey');
  id:=public.tjanst_uuid(fd->'detailId');if id=any(all_ids) then raise exception 'Duplicate identity' using errcode='22023',hint='elective_preparation_invalid';end if;all_ids:=array_append(all_ids,id);
  if not public.phase5_programplan_integer(fd->'expectedDetailRevision',0,2147483645) or fd->'expectedDetailRevision' is distinct from frame->'detailRevision'
   or (frame->'detailId'<>'null'::jsonb and frame->'detailId' is distinct from fd->'detailId') then raise exception 'Time detail changed' using errcode='40001',hint='elective_preparation_source_conflict';end if;
  if fd->>'profile' is null or fd->>'profile' not in ('single','terms','even','custom') or not public.phase5_programplan_array(fd->'slots',16) then raise exception 'Invalid preparation profile' using errcode='22023',hint='elective_preparation_invalid';end if;
  n:=jsonb_array_length(fd->'slots');if n=0 then if applying then raise exception 'No course slots' using errcode='22023',hint='elective_preparation_invalid';else continue;end if;end if;
  if frame->'needHt'='null'::jsonb or frame->'needVt'='null'::jsonb then raise exception 'Frame time is unknown' using errcode='22023',hint='elective_preparation_time_missing';end if;
  ph:=(frame->>'pointsHt')::integer;pv:=(frame->>'pointsVt')::integer;ht:=(frame->>'needHt')::integer;vt:=(frame->>'needVt')::integer;
  sum_ph:=0;sum_pv:=0;sum_ht:=0;sum_vt:=0;i:=0;
  for slot in select value from jsonb_array_elements(fd->'slots') loop
   perform public.elective_require_shape(slot,array['positionId','blockId','name','pointsHt','pointsVt','needHt','needVt','options','groups']);
   for v in select value from jsonb_array_elements(jsonb_build_array(slot->'positionId',slot->'blockId')) loop id:=public.tjanst_uuid(v);if id=any(all_ids) then raise exception 'Duplicate identity' using errcode='22023',hint='elective_preparation_invalid';end if;all_ids:=array_append(all_ids,id);end loop;
   if not public.phase5_apl_text(slot->'name',160,false) or btrim(slot->>'name') is distinct from slot->>'name'
    or not public.phase5_programplan_integer(slot->'needHt',0,6000000) or not public.phase5_programplan_integer(slot->'needVt',0,6000000)
    or (slot->>'needHt')::integer+(slot->>'needVt')::integer=0 or not public.phase5_programplan_array(slot->'options',100) or not public.phase5_programplan_array(slot->'groups',200) then raise exception 'Invalid course slot' using errcode='22023',hint='elective_preparation_invalid';end if;
   if ph is null then
    if slot->'pointsHt'<>'null'::jsonb or slot->'pointsVt'<>'null'::jsonb or n<>1 or fd->>'profile'<>'single' then raise exception 'GR has no gymnasium points' using errcode='22023',hint='elective_preparation_invalid';end if;
   elsif not public.phase5_programplan_integer(slot->'pointsHt',0,10000) or not public.phase5_programplan_integer(slot->'pointsVt',0,10000)
    or (slot->>'pointsHt')::integer+(slot->>'pointsVt')::integer<=0 or (slot->>'pointsHt')::integer=0 and (slot->>'needHt')::integer<>0 or (slot->>'pointsVt')::integer=0 and (slot->>'needVt')::integer<>0 then raise exception 'Invalid points/time' using errcode='22023',hint='elective_preparation_invalid';end if;
   actual:=jsonb_build_array(slot->'pointsHt',slot->'pointsVt',slot->'needHt',slot->'needVt');expected:=actual;
   if fd->>'profile'='single' then if n<>1 then raise exception 'Invalid single profile' using errcode='22023',hint='elective_preparation_invalid';end if;expected:=jsonb_build_array(ph,pv,ht,vt);
   elsif fd->>'profile'='terms' then
    if n<>2 or ph is null or ph<=0 or pv<=0 or ht<=0 or vt<=0 then raise exception 'Invalid term profile' using errcode='22023',hint='elective_preparation_invalid';end if;
    expected:=case when i=0 then jsonb_build_array(ph,0,ht,0) else jsonb_build_array(0,pv,0,vt) end;
   elsif fd->>'profile'='even' then
    if n<>2 or ph is null or (ph+pv)%2<>0 or ph+pv<2 or ph=1 or pv=1 then raise exception 'Invalid equal profile' using errcode='22023',hint='elective_preparation_invalid';end if;
    expected:=case when i=0 then jsonb_build_array((ph+1)/2,(ph+pv)/2-(ph+1)/2,(ht+1)/2,(vt+1)/2) else jsonb_build_array(ph-(ph+1)/2,pv-((ph+pv)/2-(ph+1)/2),ht/2,vt/2) end;
   end if;
   if actual is distinct from expected then raise exception 'Profile and explicit allocation differ' using errcode='22023',hint='elective_preparation_invalid';end if;
   sum_ph:=sum_ph+coalesce((slot->>'pointsHt')::integer,0);sum_pv:=sum_pv+coalesce((slot->>'pointsVt')::integer,0);sum_ht:=sum_ht+(slot->>'needHt')::integer;sum_vt:=sum_vt+(slot->>'needVt')::integer;i:=i+1;
   if applying and (jsonb_array_length(slot->'options')=0 or jsonb_array_length(slot->'groups')=0) then raise exception 'Offering and groups required' using errcode='22023',hint='elective_preparation_options_missing';end if;
   opt_ids:='{}';
   for op in select value from jsonb_array_elements(slot->'options') loop
    perform public.elective_require_shape(op,array['id','name','subjectCode','levelCode','language','points']);id:=public.tjanst_uuid(op->'id');
    if id=any(all_ids) or not public.phase5_apl_text(op->'name',200,false) or not public.phase5_programplan_text(op->'subjectCode',80) or not public.phase5_programplan_text(op->'levelCode',80)
     or not coalesce(public.elective_language_valid(op->>'levelCode',op->>'language'),false)
     or not coalesce(frame->'allowedCodesByPoints'->coalesce(((slot->>'pointsHt')::integer+(slot->>'pointsVt')::integer)::text,'null') ? (op->>'levelCode'),false)
     or op->'points' is distinct from (case when ph is null then 'null'::jsonb else to_jsonb((slot->>'pointsHt')::integer+(slot->>'pointsVt')::integer) end) then raise exception 'Option outside frame' using errcode='22023',hint='elective_option_not_allowed';end if;
    if ph is not null then
     sub:=null;item:=null;select s.value,it.value into sub,item from public.timplans tp join public.programplan_catalogs pc on pc.catalog_id=tp.gym_basis->>'catalogId'
      cross join lateral jsonb_array_elements(pc.payload->'subjects') s cross join lateral jsonb_array_elements(s.value->'items') it
      where tp.id=(source_read->>'planId')::uuid and s.value->>'code'=op->>'subjectCode' and it.value->>'code'=op->>'levelCode' and it.value->'points'=op->'points' limit 1;
     if sub is null or item is null then raise exception 'Option identity mismatch' using errcode='22023',hint='elective_option_not_allowed';end if;
    elsif op->'subjectCode' is distinct from op->'levelCode' then raise exception 'Invalid GR subject identity' using errcode='22023',hint='elective_option_not_allowed';end if;
    all_ids:=array_append(all_ids,id);opt_ids:=array_append(opt_ids,id);
    if applying and not exists(select 1 from jsonb_array_elements(slot->'groups') gg where gg.value->'optionId'=op->'id') then raise exception 'Option has no group' using errcode='22023',hint='elective_preparation_groups_missing';end if;
   end loop;
   for g in select value from jsonb_array_elements(slot->'groups') loop
    perform public.elective_require_shape(g,array['id','optionId','name','classIds','estimatedPupils']);id:=public.tjanst_uuid(g->'id');
    if id=any(all_ids) or not (public.tjanst_uuid(g->'optionId')=any(opt_ids)) or not public.phase5_apl_text(g->'name',200,false)
     or not public.phase5_programplan_array(g->'classIds',250) or (g->'estimatedPupils'<>'null'::jsonb and not public.phase5_programplan_integer(g->'estimatedPupils',0,10000))
     or applying and jsonb_array_length(g->'classIds')=0 then raise exception 'Invalid group' using errcode='22023',hint='elective_preparation_invalid';end if;
    all_ids:=array_append(all_ids,id);
    if exists(select 1 from jsonb_array_elements(g->'classIds') ci where not (public.tjanst_uuid(ci.value)=any(classes)))
     or (select count(*)<>count(distinct value) from jsonb_array_elements(g->'classIds')) then raise exception 'Group class mismatch' using errcode='22023',hint='elective_preparation_invalid';end if;
   end loop;
  end loop;
  if sum_ht<>ht or sum_vt<>vt or ph is not null and (sum_ph<>ph or sum_pv<>pv) then raise exception 'Whole frame must be preserved' using errcode='22023',hint='elective_preparation_total';end if;
 end loop;
end $$;

create function public.elective_preparation_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
<<prep_command>>
declare a public.access_assignments;h public.elective_preparations;j public.elective_preparation_commands;s public.elective_school_state;
 scope jsonb;basis jsonb;desired jsonb:=input->'draft';fd jsonb;slot jsonb;frame jsonb;g jsonb;refs jsonb;groups jsonb;positions jsonb;native jsonb;meta jsonb;state jsonb;
 materialized jsonb:='[]';block_ids jsonb;result jsonb;envelope jsonb;request_hash text;command uuid;unit uuid;plan uuid;year integer;next_revision integer;noop boolean:=false;first_class_id uuid;
 b public.elective_blocks;td public.elective_time_details;begin
 perform public.elective_require_shape(input,array['unitId','planId','schoolYear','columnId','contractVersion','action','commandId','expectedRevision','expectedSourceHash','draft']);perform public.elective_preparation_scope(input);
 if input->>'contractVersion' is distinct from 'elective_preparation_v1' or input->>'action' is null or input->>'action' not in ('save','apply')
  or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483645) or input->>'expectedSourceHash' is null or input->>'expectedSourceHash'!~'^[a-f0-9]{64}$'
  or octet_length(public.tjanst_canonical(input))>512000 then raise exception 'Invalid preparation command' using errcode='22023',hint='elective_preparation_invalid';end if;
 unit:=(input->>'unitId')::uuid;plan:=(input->>'planId')::uuid;year:=(input->>'schoolYear')::integer;command:=public.tjanst_uuid(input->'commandId');a:=public.elective_staff_scope(unit);
 perform pg_advisory_xact_lock(hashtextextended(command::text,5527));s:=public.elective_lock_school(unit);a:=public.elective_staff_scope(unit);request_hash:=substr(public.tjanst_hash(input),8);
 select * into j from public.elective_preparation_commands where command_id=command;
 if j.command_id is not null then
  if j.unit_id<>unit or j.plan_id<>plan or j.school_year<>year or j.column_id<>input->>'columnId' or j.action<>input->>'action' or j.payload_hash<>request_hash
   or j.actor_identity_id::text<>current_setting('app.identity_id',true) or j.assignment_id<>a.id then raise exception 'Preparation command collision' using errcode='40001',hint='elective_preparation_command_conflict';end if;
  perform public.elective_staff_audit('elective_command',command,unit);return jsonb_set(j.envelope,'{result,receipt,replayed}','true');
 end if;
 -- One timetable, then all its real annual links in stable order; no guessed class reference is ever fabricated.
 perform 1 from public.timplans where id=plan for update;
 perform 1 from public.class_timplans where timplan_id=plan and start_year=year order by class_id for share;
 scope:=jsonb_build_object('unitId',unit,'planId',plan,'schoolYear',year,'columnId',input->'columnId');basis:=public.elective_preparation_projection(scope);
 if jsonb_array_length(basis->'blockers')>0 then raise exception 'Timetable preparation source is unavailable' using errcode='40001',hint='elective_preparation_source_conflict';end if;
 if basis->>'sourceHash' is distinct from input->>'expectedSourceHash' then raise exception 'Preparation source changed' using errcode='40001',hint='elective_preparation_source_conflict';end if;
 select * into h from public.elective_preparations x where x.unit_id=unit and x.plan_id=plan and x.school_year=year and x.column_id=input->>'columnId' for update;
 if (h.id is null and ((input->>'expectedRevision')::integer<>0 or exists(select 1 from public.elective_preparations where id=public.tjanst_uuid(desired->'id'))))
  or (h.id is not null and (h.id<>public.tjanst_uuid(desired->'id') or h.revision<>(input->>'expectedRevision')::integer)) then raise exception 'Preparation revision changed' using errcode='40001',hint='elective_preparation_revision_conflict';end if;
 perform public.elective_preparation_validate(desired,basis,input->>'action'='apply');
 if input->>'action'='apply' and h.applied_revision is not null then
  if public.elective_preparation_content(desired) is distinct from public.elective_preparation_content(h.applied_draft)
   or h.applied_source_hash is distinct from basis->>'sourceHash' then raise exception 'Applied organisation requires explicit reconciliation' using errcode='40001',hint='elective_preparation_in_use';end if;
  -- Reapplying the same organisation after pupil choice or staffing is a no-op, never a child overwrite.
  for state in select value from jsonb_array_elements(h.materialized) loop
   select * into b from public.elective_blocks where id=(state->>'blockId')::uuid for share;
   if b.id is null or b.revision<>(state->>'revision')::integer or b.applied_revision is distinct from (state->>'appliedRevision')::integer or b.organization_retired_at is not null then raise exception 'Created block was edited' using errcode='40001',hint='elective_preparation_in_use';end if;
  end loop;
  materialized:=h.materialized;noop:=true;
 end if;
 if input->>'action'='apply' and not noop then
  -- Protect all existing non-retired organisations, including those built outside this preparation.
  for fd in select value from jsonb_array_elements(desired->'frames') loop
   if exists(select 1 from public.elective_block_sources bs join public.elective_blocks eb on eb.id=bs.block_id
    where bs.timplan_id=plan and eb.school_year=year and eb.unit_id=unit and eb.organization_retired_at is null and bs.active
     and bs.source_ref->>'rowKey'=fd->>'rowKey' and bs.source_ref->>'column'=input->>'columnId') then
    raise exception 'Frame already has organised blocks' using errcode='40001',hint='elective_preparation_frame_in_use';end if;
   -- Existing manual positions have not been read/reviewed by this preparation. Never infer adoption from a revision alone.
   select value into frame from jsonb_array_elements(basis->'frames') f where f.value->>'rowKey'=fd->>'rowKey';
   if h.applied_revision is null and (frame->>'detailRevision')::integer>0 then
    raise exception 'Existing time spaces require review in the original time editor' using errcode='40001',hint='elective_preparation_time_in_use';end if;
  end loop;
  for fd in select value from jsonb_array_elements(desired->'frames') loop
   select value into frame from jsonb_array_elements(basis->'frames') f where f.value->>'rowKey'=fd->>'rowKey';
   if basis->>'schoolform'='gymnasium' then
    first_class_id:=(desired->'classIds'->>0)::uuid;
    native:=jsonb_build_object('unitId',unit,'schoolYear',year,'frameSourceKey','class_timplan:'||first_class_id::text||':'||year::text||':'||(fd->>'rowKey'));
    meta:=public.elective_time_parent(native,true);
    -- Prove the direct, classless budget is identical to the actual class source used for group creation.
    if (meta#>'{frame,pointsHt}',meta#>'{frame,pointsVt}',meta#>'{frame,needHt}',meta#>'{frame,needVt}',meta#>'{frame,needBasis}') is distinct from
     (frame->'pointsHt',frame->'pointsVt',frame->'needHt',frame->'needVt',frame->'needBasis') then raise exception 'Class budget and timetable disagree' using errcode='40001',hint='elective_preparation_source_conflict';end if;
    select jsonb_agg(jsonb_build_object('id',v.value->'positionId','name',v.value->'name','pointsHt',v.value->'pointsHt','pointsVt',v.value->'pointsVt','needHt',v.value->'needHt','needVt',v.value->'needVt')) into positions from jsonb_array_elements(fd->'slots') v;
    perform public.elective_timplan_time_command(native||jsonb_build_object('contractVersion','elective_timplan_time_v1','action','apply','commandId',gen_random_uuid(),'detailId',fd->'detailId','expectedRevision',fd->'expectedDetailRevision',
      'expectedParentHash',meta#>'{frame,parentHash}','expectedLinkRevision',meta->'linkRevision','positions',positions));
   end if;
   for slot in select value from jsonb_array_elements(fd->'slots') loop
    select coalesce(jsonb_agg(v.value order by v.value->>'sourceKey' collate "C"),'[]') into refs from jsonb_array_elements(public.elective_sources(unit,year)) v
     where v.value->>'timplanId'=plan::text and v.value->>'column'=input->>'columnId' and v.value->>'rowKey'=fd->>'rowKey'
      and v.value->>'classId' in(select value from jsonb_array_elements_text(desired->'classIds'))
      and (basis->>'schoolform'='grundskola' or v.value#>>'{timeDetailRef,positionId}'=slot->>'positionId');
    if jsonb_array_length(refs)<>jsonb_array_length(desired->'classIds') then raise exception 'Actual class source unavailable' using errcode='40001',hint='elective_preparation_source_conflict';end if;
    groups:='[]';
    for g in select value from jsonb_array_elements(slot->'groups') loop
     groups:=groups||jsonb_build_array(jsonb_build_object('id',g->'id','optionId',g->'optionId','name',g->'name','startsOn',make_date(year,7,1),'endsOn',make_date(year+1,6,30),'classIds',g->'classIds','estimatedPupils',g->'estimatedPupils',
      'sourceKeys',(select jsonb_agg(v.value->'sourceKey' order by v.value->>'sourceKey' collate "C") from jsonb_array_elements(refs) v where v.value->>'classId' in(select value from jsonb_array_elements_text(g->'classIds')))));
    end loop;
    native:=jsonb_build_object('unitId',unit,'schoolYear',year,'payload',jsonb_build_object('expectedBlockRevision',null,'block',jsonb_build_object('id',slot->'blockId','kind',frame->'kind','name',slot->'name','startsOn',make_date(year,7,1),'endsOn',make_date(year+1,6,30),'sourceRefs',refs,'options',slot->'options','groups',groups)));
    meta:=public.elective_save_block(native);select * into b from public.elective_blocks where id=(slot->>'blockId')::uuid;
    perform public.elective_apply_groups(jsonb_build_object('unitId',unit,'schoolYear',year,'payload',jsonb_build_object('blockId',b.id,'expectedBlockRevision',b.revision)));
    select * into b from public.elective_blocks where id=(slot->>'blockId')::uuid;
    materialized:=materialized||jsonb_build_array(jsonb_build_object('blockId',b.id,'revision',b.revision,'appliedRevision',b.applied_revision));
   end loop;
  end loop;
  update public.elective_school_state set revision=revision+1 where unit_id=unit;
 end if;
 next_revision:=coalesce(h.revision,0)+1;
 if h.id is null then
  insert into public.elective_preparations(id,unit_id,plan_id,school_year,column_id,revision,draft,source_hash)
  values((desired->>'id')::uuid,unit,plan,year,input->>'columnId',next_revision,desired,input->>'expectedSourceHash') returning * into h;
 else update public.elective_preparations set revision=next_revision,draft=prep_command.desired,source_hash=input->>'expectedSourceHash' where id=h.id returning * into h;end if;
 if input->>'action'='apply' then
  update public.elective_preparations set applied_revision=next_revision,applied_draft=prep_command.desired,materialized=prep_command.materialized,
   applied_source_hash=public.elective_preparation_projection(scope)->>'sourceHash' where id=h.id returning * into h;
 end if;
 insert into public.elective_preparation_versions(preparation_id,revision,draft,source_hash,actor_identity_id,assignment_id)
 values(h.id,next_revision,desired,input->>'expectedSourceHash',current_setting('app.identity_id',true)::uuid,a.id);
 basis:=public.elective_preparation_projection(scope);select coalesce(jsonb_agg(v.value->'blockId'),'[]') into block_ids from jsonb_array_elements(h.materialized) v;
 result:=jsonb_build_object('receipt',scope||jsonb_build_object('commandId',command,'action',input->'action','payloadHash',request_hash,'preparationId',h.id,'revision',h.revision,'appliedRevision',h.applied_revision,'blockIds',block_ids,'replayed',false),'read',basis);
 envelope:=jsonb_build_object('contractVersion','elective_preparation_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',result);
 perform public.elective_staff_audit('elective_command',command,unit);
 insert into public.elective_preparation_commands(command_id,unit_id,plan_id,school_year,column_id,action,payload_hash,actor_identity_id,assignment_id,envelope)
 values(command,unit,plan,year,input->>'columnId',input->>'action',request_hash,current_setting('app.identity_id',true)::uuid,a.id,envelope);return envelope;
end $$;

create function public.elective_preparation_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;j public.elective_preparation_commands;scope jsonb;begin
 perform public.elective_require_shape(input,array['unitId','planId','schoolYear','columnId','commandId','action','payloadHash']);perform public.elective_preparation_scope(input);
 if input->>'action' is null or input->>'action' not in ('save','apply') or input->>'payloadHash' is null or input->>'payloadHash'!~'^[a-f0-9]{64}$' then raise exception 'Invalid preparation status' using errcode='22023',hint='elective_preparation_invalid';end if;
 a:=public.elective_staff_scope((input->>'unitId')::uuid);perform public.tjanst_uuid(input->'commandId');
 perform pg_advisory_xact_lock(hashtextextended(input->>'commandId',5527));
 select * into j from public.elective_preparation_commands where command_id=(input->>'commandId')::uuid;
 if j.command_id is not null and (j.unit_id<>(input->>'unitId')::uuid or j.plan_id<>(input->>'planId')::uuid or j.school_year<>(input->>'schoolYear')::integer or j.column_id<>input->>'columnId'
  or j.action<>input->>'action' or j.payload_hash<>input->>'payloadHash' or j.actor_identity_id::text<>current_setting('app.identity_id',true) or j.assignment_id<>a.id) then raise exception 'Preparation status denied' using errcode='40001',hint='elective_preparation_command_conflict';end if;
 perform public.elective_staff_audit('elective_status',(input->>'commandId')::uuid,(input->>'unitId')::uuid);
 return jsonb_build_object('contractVersion','elective_preparation_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),
  'result',case when j.command_id is null then jsonb_build_object('state','not_found','result',null) else jsonb_build_object('state','found','result',jsonb_set(j.envelope->'result','{receipt,replayed}','true')) end);
end $$;

do $$declare fn regprocedure;begin for fn in select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'elective_preparation_%' loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role,skolplattform_worker',fn);
end loop;end $$;
grant execute on function public.elective_preparation_read(jsonb),public.elective_preparation_command(jsonb),public.elective_preparation_status(jsonb) to skolplattform_worker;
