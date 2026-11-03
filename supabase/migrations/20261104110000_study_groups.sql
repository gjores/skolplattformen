-- VP-03. App-wide teaching groups with dated pupil memberships. Intended SS 12000 meaning: Group with type
-- Undervisning and GroupMembership with inclusive dates. Administrative classes, school placements and the old
-- elective teaching_groups are never written here. No export or verified standard exchange is claimed.
create table public.study_groups (
 id uuid primary key, unit_id uuid not null references public.school_units(id), organizer_id uuid not null references public.organizers(id),
 school_year integer not null check(school_year between 2000 and 2100),
 name text not null check(char_length(name) between 1 and 200 and btrim(name)<>''),
 starts_on date not null, ends_on date not null,
 subject_code text, subject_version integer, item_code text, points integer, language_code text,
 minutes_ht integer not null check(minutes_ht between 0 and 100000), minutes_vt integer not null check(minutes_vt between 0 and 100000),
 parallel_set_id uuid not null, origin_kind text not null check(origin_kind in ('valplan','classes','manual')),
 valplan_id uuid references public.valplans(id), valplan_course_id uuid,
 revision integer not null check(revision>0), active boolean not null default true,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(id,parallel_set_id), unique(id,unit_id),
 foreign key(valplan_course_id,valplan_id) references public.valplan_courses(id,valplan_id),
 check(ends_on>=starts_on and starts_on>=make_date(school_year,7,1) and ends_on<=make_date(school_year+1,6,30)),
 check((subject_code is null)=(item_code is null) and (subject_code is null)=(subject_version is null) and (subject_code is null)=(points is null)
  and (language_code is null or subject_code is not null)),
 check((origin_kind='valplan')=(valplan_id is not null) and (valplan_id is null)=(valplan_course_id is null))
);
create table public.study_group_classes (
 group_id uuid not null references public.study_groups(id), class_id uuid not null references public.school_classes(id), primary key(group_id,class_id)
);
-- One membership per pupil and parallel set at a time; a set of one group covers overlap in the same group.
create table public.study_group_memberships (
 id uuid primary key, group_id uuid not null, parallel_set_id uuid not null, unit_id uuid not null,
 pupil_id uuid not null references public.pupils(id), starts_on date not null check(isfinite(starts_on)), ends_on date not null check(isfinite(ends_on) and ends_on>=starts_on),
 source text not null check(source in ('class','choice','manual')), source_ref uuid,
 cancelled_at timestamptz, recorded_by_assignment_id uuid not null references public.access_assignments(id), created_at timestamptz not null default clock_timestamp(),
 previous_membership_id uuid references public.study_group_memberships(id),
 foreign key(group_id,parallel_set_id) references public.study_groups(id,parallel_set_id),
 foreign key(group_id,unit_id) references public.study_groups(id,unit_id),
 exclude using gist(pupil_id with =,parallel_set_id with =,daterange(starts_on,ends_on,'[]') with &&) where(cancelled_at is null)
);
create table public.study_group_history (
 id bigint generated always as identity primary key, group_id uuid not null references public.study_groups(id), command_id uuid not null,
 action text not null, detail jsonb not null, actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id), created_at timestamptz not null default clock_timestamp()
);
create table public.study_group_commands (
 command_id uuid primary key, unit_id uuid not null references public.school_units(id), school_year integer not null, action text not null,
 payload_hash text not null, actor_identity_id uuid not null references public.identities(id), assignment_id uuid not null references public.access_assignments(id),
 envelope jsonb not null, created_at timestamptz not null default clock_timestamp()
);
do $$declare n text;begin foreach n in array array['study_groups','study_group_classes','study_group_memberships','study_group_history','study_group_commands'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);end loop;end $$;
create trigger study_group_history_immutable before update or delete or truncate on public.study_group_history for each statement execute function public.elective_time_immutable();
create trigger study_group_commands_immutable before update or delete or truncate on public.study_group_commands for each statement execute function public.elective_time_immutable();

create function public.study_group_invalid(reason text default 'study_group_invalid') returns void
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
begin raise exception 'Invalid study group' using errcode='22023',hint=reason;end $$;

create function public.study_group_document(g public.study_groups) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',g.id,'unitId',g.unit_id,'schoolYear',g.school_year,'name',g.name,'startsOn',g.starts_on,'endsOn',g.ends_on,
  'course',case when g.subject_code is null then null else jsonb_build_object('subjectCode',g.subject_code,'subjectVersion',g.subject_version,'itemCode',g.item_code,'points',g.points,'languageCode',g.language_code) end,
  'minutesHt',g.minutes_ht,'minutesVt',g.minutes_vt,'parallelSetId',g.parallel_set_id,
  'classIds',(select coalesce(jsonb_agg(c.class_id order by c.class_id),'[]') from public.study_group_classes c where c.group_id=g.id),
  'origin',case g.origin_kind when 'valplan' then jsonb_build_object('kind','valplan','valplanId',g.valplan_id,'courseId',g.valplan_course_id) else jsonb_build_object('kind',g.origin_kind) end,
  'revision',g.revision,'active',g.active)
$$;

-- Pupils the actor may see, with their class memberships in the unit during the school year.
create function public.study_group_pupils(a public.access_assignments,unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'classIds',
   (select coalesce(jsonb_agg(distinct m.class_id order by m.class_id),'[]') from public.pupil_class_memberships m where m.pupil_id=p.id and m.unit_id=unit
     and m.starts_on<=make_date(school_year+1,6,30) and coalesce(m.ends_on,'infinity'::date)>=make_date(school_year,7,1))) order by p.display_name collate "C",p.id),'[]')
 from public.pupils p
 where exists(select 1 from public.pupil_placements pp where pp.pupil_id=p.id and pp.unit_id=unit
   and pp.starts_on<=make_date(school_year+1,6,30) and coalesce(pp.ends_on,'infinity'::date)>=make_date(school_year,7,1))
  and public.phase4_scope(a.id,p.id,unit) and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))
$$;

create function public.study_group_projection(a public.access_assignments,unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('contractVersion','study_group_v1','unitId',unit,'schoolYear',school_year,
  'groups',(select coalesce(jsonb_agg(public.study_group_document(g) order by g.name collate "C",g.id),'[]') from public.study_groups g where g.unit_id=unit and g.school_year=study_group_projection.school_year),
  'memberships',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'groupId',m.group_id,'pupilId',m.pupil_id,'startsOn',m.starts_on,'endsOn',m.ends_on,'source',m.source,'sourceRef',m.source_ref) order by m.group_id,m.starts_on,m.id),'[]')
   from public.study_group_memberships m join public.study_groups g on g.id=m.group_id join public.pupils p on p.id=m.pupil_id
   where g.unit_id=unit and g.school_year=study_group_projection.school_year and m.cancelled_at is null
    and public.phase4_scope(a.id,p.id,unit) and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))),
  'pupils',public.study_group_pupils(a,unit,school_year))
$$;

create function public.study_group_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;begin
 if not coalesce(public.phase5_programplan_shape(input,array['unitId','schoolYear']),false) or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) then perform public.study_group_invalid();end if;
 a:=public.elective_staff_scope(public.tjanst_uuid(input->'unitId'));
 return jsonb_build_object('contractVersion','study_group_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),
  'result',public.study_group_projection(a,(input->>'unitId')::uuid,(input->>'schoolYear')::integer));
end $$;

create function public.study_group_date(v jsonb) returns date
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare d date;begin
 if jsonb_typeof(v) is distinct from 'string' or v#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$' then perform public.study_group_invalid();end if;
 begin d:=(v#>>'{}')::date;exception when others then perform public.study_group_invalid();end;
 if to_char(d,'YYYY-MM-DD')<>v#>>'{}' then perform public.study_group_invalid();end if;return d;
end $$;

-- A pupil may join when visible to the actor and placed at the school for the whole membership.
create function public.study_group_check_pupil(a public.access_assignments,unit uuid,pupil uuid,starts date,ends date) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.pupils;begin
 select * into p from public.pupils where id=pupil;
 if p.id is null or not public.phase4_scope(a.id,p.id,unit) or p.protected_identity and not public.phase4_can_read_protected(p.id,unit) then raise exception 'Pupil denied' using errcode='42501';end if;
 if not exists(select 1 from public.pupil_placements pp where pp.pupil_id=p.id and pp.unit_id=unit and pp.starts_on<=starts and coalesce(pp.ends_on,'infinity'::date)>=ends) then
  perform public.study_group_invalid('study_group_pupil_not_placed');end if;
end $$;

create function public.study_group_add_member(a public.access_assignments,g public.study_groups,command uuid,m jsonb,previous uuid default null) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare mid uuid:=gen_random_uuid();starts date;ends date;begin
 if not coalesce(public.phase5_programplan_shape(m,array['pupilId','startsOn','endsOn','source','sourceRef']),false) or m->>'source' is null or m->>'source' not in ('class','choice','manual')
  or jsonb_typeof(m->'sourceRef') not in ('null','string') then perform public.study_group_invalid();end if;
 starts:=public.study_group_date(m->'startsOn');ends:=public.study_group_date(m->'endsOn');
 if ends<starts or starts<g.starts_on or ends>g.ends_on then perform public.study_group_invalid('study_group_member_period');end if;
 if not g.active then perform public.study_group_invalid('study_group_inactive');end if;
 perform public.study_group_check_pupil(a,g.unit_id,public.tjanst_uuid(m->'pupilId'),starts,ends);
 begin
  insert into public.study_group_memberships(id,group_id,parallel_set_id,unit_id,pupil_id,starts_on,ends_on,source,source_ref,recorded_by_assignment_id,previous_membership_id)
  values(mid,g.id,g.parallel_set_id,g.unit_id,(m->>'pupilId')::uuid,starts,ends,m->>'source',case when m->'sourceRef'='null'::jsonb then null else public.tjanst_uuid(m->'sourceRef') end,a.id,previous);
 exception when exclusion_violation then raise exception 'Pupil already in the parallel set' using errcode='40001',hint='study_group_member_overlap';end;
 insert into public.study_group_history(group_id,command_id,action,detail,actor_identity_id,assignment_id)
 values(g.id,command,'add_member',jsonb_build_object('membershipId',mid,'pupilId',m->'pupilId','startsOn',starts,'endsOn',ends,'source',m->'source','previousMembershipId',previous),current_setting('app.identity_id',true)::uuid,a.id);
 return mid;
end $$;

create function public.study_group_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;j public.study_group_commands;g public.study_groups;target public.study_groups;m public.study_group_memberships;vc public.valplan_courses;vp public.valplans;
 doc jsonb;x jsonb;unit uuid;year integer;command uuid;gid uuid;request_hash text;starts date;ends date;on_date date;envelope jsonb;receipt jsonb;ids jsonb:='[]';begin
 if not coalesce(public.phase5_programplan_shape(input,array['contractVersion','commandId','action','unitId','schoolYear','payload']),false)
  or input->>'contractVersion' is distinct from 'study_group_v1' or input->>'action' is null
  or input->>'action' not in ('save_group','retire_group','add_members','move_member','end_member','cancel_member')
  or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or octet_length(public.tjanst_canonical(input))>512000 then perform public.study_group_invalid();end if;
 unit:=public.tjanst_uuid(input->'unitId');year:=(input->>'schoolYear')::integer;command:=public.tjanst_uuid(input->'commandId');doc:=input->'payload';
 a:=public.elective_staff_scope(unit);
 perform pg_advisory_xact_lock(hashtextextended(command::text,5571));perform pg_advisory_xact_lock(hashtextextended(unit::text||':'||year::text,5572));
 a:=public.elective_staff_scope(unit);request_hash:=substr(public.tjanst_hash(input),8);
 select * into j from public.study_group_commands where command_id=command;
 if j.command_id is not null then
  if j.unit_id<>unit or j.school_year<>year or j.action<>input->>'action' or j.payload_hash<>request_hash
   or j.actor_identity_id::text<>current_setting('app.identity_id',true) or j.assignment_id<>a.id then raise exception 'Study group command collision' using errcode='40001',hint='study_group_command_conflict';end if;
  return jsonb_set(j.envelope,'{result,receipt,replayed}','true');
 end if;
 if input->>'action'='save_group' then
  if not coalesce(public.phase5_programplan_shape(doc,array['id','expectedRevision','name','startsOn','endsOn','course','minutesHt','minutesVt','parallelSetId','classIds','origin']),false)
   or jsonb_typeof(doc->'name') is distinct from 'string' or btrim(doc->>'name')='' or char_length(doc->>'name')>200
   or not public.phase5_programplan_integer(doc->'expectedRevision',0,2147483645) or not public.phase5_programplan_integer(doc->'minutesHt',0,100000) or not public.phase5_programplan_integer(doc->'minutesVt',0,100000)
   or jsonb_typeof(doc->'classIds') is distinct from 'array' or jsonb_array_length(doc->'classIds')>500 or jsonb_typeof(doc->'origin') is distinct from 'object'
   or doc->'origin'->>'kind' is null or doc->'origin'->>'kind' not in ('valplan','classes','manual') then perform public.study_group_invalid();end if;
  gid:=public.tjanst_uuid(doc->'id');starts:=public.study_group_date(doc->'startsOn');ends:=public.study_group_date(doc->'endsOn');
  if ends<starts or starts<make_date(year,7,1) or ends>make_date(year+1,6,30) then perform public.study_group_invalid('study_group_period');end if;
  if (select count(distinct v.value) from jsonb_array_elements(doc->'classIds') v)<>jsonb_array_length(doc->'classIds')
   or exists(select 1 from jsonb_array_elements(doc->'classIds') v where not exists(select 1 from public.school_classes sc where sc.id=public.tjanst_uuid(v.value) and sc.unit_id=unit)) then perform public.study_group_invalid('study_group_class');end if;
  if doc->'origin'->>'kind'='classes' and jsonb_array_length(doc->'classIds')=0 then perform public.study_group_invalid('study_group_class');end if;
  if doc->'course'<>'null'::jsonb and (not coalesce(public.phase5_programplan_shape(doc->'course',array['subjectCode','subjectVersion','itemCode','points','languageCode']),false)
   or jsonb_typeof(doc->'course'->'subjectCode') is distinct from 'string' or jsonb_typeof(doc->'course'->'itemCode') is distinct from 'string'
   or not public.phase5_programplan_integer(doc->'course'->'subjectVersion',1,100000) or not public.phase5_programplan_integer(doc->'course'->'points',1,10000)
   or jsonb_typeof(doc->'course'->'languageCode') not in ('null','string')) then perform public.study_group_invalid();end if;
  if doc->'origin'->>'kind'='valplan' then
   if not coalesce(public.phase5_programplan_shape(doc->'origin',array['kind','valplanId','courseId']),false) then perform public.study_group_invalid();end if;
   select * into vp from public.valplans where id=public.tjanst_uuid(doc->'origin'->'valplanId');
   select * into vc from public.valplan_courses where id=public.tjanst_uuid(doc->'origin'->'courseId') and valplan_id=vp.id and active;
   -- The valplan owns the course and its time (VP-CONTEXT D-03).
   if vp.id is null or vp.unit_id<>unit or vp.school_year<>year or vc.id is null or doc->'course'='null'::jsonb
    or (doc->'course'->>'subjectCode',(doc->'course'->>'subjectVersion')::integer,doc->'course'->>'itemCode',(doc->'course'->>'points')::integer,doc->'course'->>'languageCode')
     is distinct from (vc.subject_code,vc.subject_version,vc.item_code,vc.points,vc.language_code)
    or ((doc->>'minutesHt')::integer,(doc->>'minutesVt')::integer) is distinct from (vc.minutes_ht,vc.minutes_vt) then perform public.study_group_invalid('study_group_valplan_course');end if;
  elsif not coalesce(public.phase5_programplan_shape(doc->'origin',array['kind']),false) then perform public.study_group_invalid();end if;
  select * into g from public.study_groups where id=gid for update;
  if g.id is null and (doc->>'expectedRevision')::integer<>0 or g.id is not null and (g.unit_id<>unit or g.school_year<>year or g.revision<>(doc->>'expectedRevision')::integer) then
   raise exception 'Study group revision changed' using errcode='40001',hint='study_group_revision_conflict';end if;
  if g.id is not null and (g.parallel_set_id<>public.tjanst_uuid(doc->'parallelSetId') or g.origin_kind<>doc->'origin'->>'kind' or g.valplan_course_id is distinct from vc.id) then perform public.study_group_invalid('study_group_identity_fixed');end if;
  if g.id is not null and not g.active then perform public.study_group_invalid('study_group_inactive');end if;
  if g.id is not null and exists(select 1 from public.study_group_memberships x where x.group_id=gid and x.cancelled_at is null and (x.starts_on<starts or x.ends_on>ends)) then perform public.study_group_invalid('study_group_member_period');end if;
  if g.id is null and exists(select 1 from public.study_groups o where o.parallel_set_id=public.tjanst_uuid(doc->'parallelSetId') and (o.unit_id<>unit or o.school_year<>year
   or (o.subject_code,o.subject_version,o.item_code,o.language_code) is distinct from (doc->'course'->>'subjectCode',(doc->'course'->>'subjectVersion')::integer,doc->'course'->>'itemCode',doc->'course'->>'languageCode'))) then
   perform public.study_group_invalid('study_group_parallel_set');end if;
  if g.id is null then
   insert into public.study_groups(id,unit_id,organizer_id,school_year,name,starts_on,ends_on,subject_code,subject_version,item_code,points,language_code,minutes_ht,minutes_vt,parallel_set_id,origin_kind,valplan_id,valplan_course_id,revision)
   values(gid,unit,a.organizer_id,year,doc->>'name',starts,ends,doc->'course'->>'subjectCode',(doc->'course'->>'subjectVersion')::integer,doc->'course'->>'itemCode',(doc->'course'->>'points')::integer,doc->'course'->>'languageCode',
    (doc->>'minutesHt')::integer,(doc->>'minutesVt')::integer,public.tjanst_uuid(doc->'parallelSetId'),doc->'origin'->>'kind',vp.id,vc.id,1);
  else
   if (g.subject_code,g.subject_version,g.item_code,g.points,g.language_code) is distinct from (doc->'course'->>'subjectCode',(doc->'course'->>'subjectVersion')::integer,doc->'course'->>'itemCode',(doc->'course'->>'points')::integer,doc->'course'->>'languageCode')
    then perform public.study_group_invalid('study_group_identity_fixed');end if;
   update public.study_groups set name=doc->>'name',starts_on=starts,ends_on=ends,minutes_ht=(doc->>'minutesHt')::integer,minutes_vt=(doc->>'minutesVt')::integer,revision=revision+1,updated_at=clock_timestamp() where id=gid;
  end if;
  delete from public.study_group_classes where group_id=gid;
  insert into public.study_group_classes(group_id,class_id) select gid,v.value::uuid from jsonb_array_elements_text(doc->'classIds') v;
  select * into g from public.study_groups where id=gid;
  insert into public.study_group_history(group_id,command_id,action,detail,actor_identity_id,assignment_id) values(gid,command,'save_group',public.study_group_document(g),current_setting('app.identity_id',true)::uuid,a.id);
  receipt:=jsonb_build_object('groupId',gid,'revision',g.revision);
 elsif input->>'action'='retire_group' then
  if not coalesce(public.phase5_programplan_shape(doc,array['groupId','expectedRevision']),false) or not public.phase5_programplan_integer(doc->'expectedRevision',1,2147483645) then perform public.study_group_invalid();end if;
  select * into g from public.study_groups where id=public.tjanst_uuid(doc->'groupId') for update;
  if g.id is null or g.unit_id<>unit or g.school_year<>year then raise exception 'Study group denied' using errcode='42501';end if;
  if g.revision<>(doc->>'expectedRevision')::integer then raise exception 'Study group revision changed' using errcode='40001',hint='study_group_revision_conflict';end if;
  if not g.active or exists(select 1 from public.study_group_memberships x where x.group_id=g.id and x.cancelled_at is null and x.ends_on>=current_date) then perform public.study_group_invalid('study_group_in_use');end if;
  update public.study_groups set active=false,revision=revision+1,updated_at=clock_timestamp() where id=g.id returning * into g;
  insert into public.study_group_history(group_id,command_id,action,detail,actor_identity_id,assignment_id) values(g.id,command,'retire_group','{}',current_setting('app.identity_id',true)::uuid,a.id);
  receipt:=jsonb_build_object('groupId',g.id,'revision',g.revision);
 elsif input->>'action'='add_members' then
  if not coalesce(public.phase5_programplan_shape(doc,array['groupId','members']),false) or jsonb_typeof(doc->'members') is distinct from 'array' or jsonb_array_length(doc->'members') not between 1 and 1000 then perform public.study_group_invalid();end if;
  select * into g from public.study_groups where id=public.tjanst_uuid(doc->'groupId') for update;
  if g.id is null or g.unit_id<>unit or g.school_year<>year then raise exception 'Study group denied' using errcode='42501';end if;
  for x in select value from jsonb_array_elements(doc->'members') loop ids:=ids||to_jsonb(public.study_group_add_member(a,g,command,x));end loop;
  receipt:=jsonb_build_object('groupId',g.id,'membershipIds',ids);
 else
  if not coalesce(public.phase5_programplan_shape(doc,case input->>'action' when 'move_member' then array['membershipId','toGroupId','on'] when 'end_member' then array['membershipId','endsOn'] else array['membershipId'] end),false) then perform public.study_group_invalid();end if;
  select * into m from public.study_group_memberships where id=public.tjanst_uuid(doc->'membershipId') for update;
  select * into g from public.study_groups where id=m.group_id;
  if m.id is null or g.unit_id<>unit or g.school_year<>year then raise exception 'Membership denied' using errcode='42501';end if;
  perform public.study_group_check_pupil(a,unit,m.pupil_id,m.starts_on,m.starts_on);
  if m.cancelled_at is not null then perform public.study_group_invalid('study_group_member_closed');end if;
  if input->>'action'='cancel_member' then
   update public.study_group_memberships set cancelled_at=clock_timestamp() where id=m.id;
   insert into public.study_group_history(group_id,command_id,action,detail,actor_identity_id,assignment_id) values(g.id,command,'cancel_member',jsonb_build_object('membershipId',m.id),current_setting('app.identity_id',true)::uuid,a.id);
  elsif input->>'action'='end_member' then
   ends:=public.study_group_date(doc->'endsOn');
   if ends<m.starts_on or ends>m.ends_on then perform public.study_group_invalid('study_group_member_period');end if;
   update public.study_group_memberships set ends_on=ends where id=m.id;
   insert into public.study_group_history(group_id,command_id,action,detail,actor_identity_id,assignment_id) values(g.id,command,'end_member',jsonb_build_object('membershipId',m.id,'endsOn',ends),current_setting('app.identity_id',true)::uuid,a.id);
  else
   on_date:=public.study_group_date(doc->'on');
   select * into target from public.study_groups where id=public.tjanst_uuid(doc->'toGroupId') for update;
   if target.id is null or target.unit_id<>unit or target.school_year<>year then raise exception 'Study group denied' using errcode='42501';end if;
   if target.id=g.id or target.parallel_set_id<>g.parallel_set_id or on_date>m.ends_on then perform public.study_group_invalid('study_group_move');end if;
   -- Same rule as moveStudyGroupMembership: end the day before, or withdraw one that has not started.
   if on_date<=m.starts_on then update public.study_group_memberships set cancelled_at=clock_timestamp() where id=m.id;on_date:=m.starts_on;
   else update public.study_group_memberships set ends_on=on_date-1 where id=m.id;end if;
   insert into public.study_group_history(group_id,command_id,action,detail,actor_identity_id,assignment_id) values(g.id,command,'move_out',jsonb_build_object('membershipId',m.id,'on',on_date),current_setting('app.identity_id',true)::uuid,a.id);
   ids:=jsonb_build_array(public.study_group_add_member(a,target,command,jsonb_build_object('pupilId',m.pupil_id,'startsOn',on_date,'endsOn',least(m.ends_on,target.ends_on),'source',m.source,'sourceRef',m.source_ref),m.id));
  end if;
  receipt:=jsonb_build_object('membershipId',m.id,'membershipIds',ids);
 end if;
 envelope:=jsonb_build_object('contractVersion','study_group_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),
  'result',jsonb_build_object('receipt',receipt||jsonb_build_object('commandId',command,'action',input->>'action','replayed',false),'read',public.study_group_projection(a,unit,year)));
 insert into public.study_group_commands(command_id,unit_id,school_year,action,payload_hash,actor_identity_id,assignment_id,envelope)
 values(command,unit,year,input->>'action',request_hash,current_setting('app.identity_id',true)::uuid,a.id,envelope);
 return envelope;
end $$;

do $$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname ~ '^study_group_' loop
  execute format('revoke all privileges on function %s from public,anon,authenticated,service_role,skolplattform_worker',fn);
 end loop;
end $$;
grant execute on function public.study_group_read(jsonb),public.study_group_command(jsonb) to skolplattform_worker;
