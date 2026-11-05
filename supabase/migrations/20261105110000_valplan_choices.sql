-- VP-04. Pupils choose courses per valplan. The school opens and closes a round, can register a choice for a pupil and
-- confirms it; guardians answer through the existing school-attested bindings and the school's existing setting. Local
-- process with no SS 12000 counterpart: only confirmed choices reach groups, and then as memberships (Group/GroupMembership).
-- No individual study plan is written. Old elective_rounds and elective_choices are left untouched.
create table public.valplan_rounds(
 id uuid primary key, valplan_id uuid not null unique, unit_id uuid not null, school_year integer not null,
 status text not null check(status in ('open','closed')), closes_on date not null check(isfinite(closes_on)),
 guardian_confirmation boolean not null, policy_revision integer not null check(policy_revision>=0), revision integer not null check(revision>0),
 foreign key(valplan_id,unit_id,school_year) references public.valplans(id,unit_id,school_year)
);
create table public.valplan_choices(
 id uuid primary key, round_id uuid not null references public.valplan_rounds(id), pupil_id uuid not null references public.pupils(id),
 revision integer not null check(revision>0), course_ids uuid[] not null check(cardinality(course_ids) between 1 and 50),
 submitted_at timestamptz not null, submitted_by_identity_id uuid not null references public.identities(id),
 submitted_by_binding_id uuid references public.elective_participant_bindings(id), recorded_by_assignment_id uuid references public.access_assignments(id),
 confirmed_at timestamptz, confirmed_by_assignment_id uuid references public.access_assignments(id),
 unique(round_id,pupil_id), check((submitted_by_binding_id is null)<>(recorded_by_assignment_id is null)), check((confirmed_at is null)=(confirmed_by_assignment_id is null))
);
create table public.valplan_choice_history(
 choice_id uuid not null references public.valplan_choices(id), revision integer not null, body jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(), primary key(choice_id,revision)
);
create table public.valplan_guardian_confirmations(
 id uuid primary key, binding_id uuid not null references public.elective_participant_bindings(id), binding_revision integer not null,
 choice_id uuid not null references public.valplan_choices(id), choice_revision integer not null, decision text not null check(decision in ('approve','decline')),
 decided_at timestamptz not null default clock_timestamp(), unique(binding_id,binding_revision,choice_id,choice_revision)
);
create table public.valplan_choice_commands(
 command_id uuid primary key, unit_id uuid not null references public.school_units(id), school_year integer not null, valplan_id uuid not null references public.valplans(id),
 action text not null, payload_hash text not null, actor_identity_id uuid not null references public.identities(id), assignment_id uuid not null references public.access_assignments(id),
 envelope jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table public.valplan_self_commands(
 command_id uuid primary key, unit_id uuid not null references public.school_units(id), pupil_id uuid not null references public.pupils(id), participant text not null,
 actor_identity_id uuid not null references public.identities(id), binding_id uuid not null references public.elective_participant_bindings(id),
 action text not null, request jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
do $$declare n text;begin foreach n in array array['valplan_rounds','valplan_choices','valplan_choice_history','valplan_guardian_confirmations','valplan_choice_commands','valplan_self_commands'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);end loop;end $$;
create trigger valplan_choice_history_immutable before update or delete or truncate on public.valplan_choice_history for each statement execute function public.elective_time_immutable();
create trigger valplan_guardian_confirmations_immutable before update or delete or truncate on public.valplan_guardian_confirmations for each statement execute function public.elective_time_immutable();
create trigger valplan_choice_commands_immutable before update or delete or truncate on public.valplan_choice_commands for each statement execute function public.elective_time_immutable();
create trigger valplan_self_commands_immutable before update or delete or truncate on public.valplan_self_commands for each statement execute function public.elective_time_immutable();

create function public.valplan_choice_invalid(reason text default 'valplan_choice_invalid') returns void
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
begin raise exception 'Invalid valplan choice' using errcode='22023',hint=reason;end $$;

-- D-05: pupils in classes on the linked rows during the school year, with the points of their row.
create function public.valplan_pupil_row(v public.valplans,pupil uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('classId',m.class_id,'points',(r.value->>'points')::integer)
 from jsonb_array_elements(public.valplan_row_contexts(v.unit_id,v.school_year)) r
 join public.pupil_class_memberships m on m.pupil_id=pupil and m.unit_id=v.unit_id and r.value->'classIds' ? m.class_id::text
  and m.starts_on<=make_date(v.school_year+1,6,30) and coalesce(m.ends_on,'infinity'::date)>=make_date(v.school_year,7,1)
 where r.value->>'linkedValplanId'=v.id::text order by m.starts_on desc,m.class_id limit 1
$$;
-- Courses the pupil may choose in the valplan. Class limits apply; a pupil outside the rows has none of their own.
create function public.valplan_pupil_courses(v public.valplans,pupil_row jsonb) returns uuid[]
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(array_agg(c.id order by c.position),'{}'::uuid[]) from public.valplan_courses c where c.valplan_id=v.id and c.active and pupil_row is not null
  and (c.points<=(pupil_row->>'points')::integer) and (not exists(select 1 from public.valplan_course_classes x where x.course_id=c.id)
   or exists(select 1 from public.valplan_course_classes x where x.course_id=c.id and x.class_id=(pupil_row->>'classId')::uuid))
$$;

create function public.valplan_choice_state(c public.valplan_choices) returns text
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.valplan_rounds;g record;found_required boolean:=false;waiting boolean:=false;d text;begin
 select * into r from public.valplan_rounds where id=c.round_id;
 if exists(select 1 from unnest(c.course_ids) x where not exists(select 1 from public.valplan_courses vc where vc.id=x and vc.valplan_id=r.valplan_id and vc.active)) then return 'course_changed';end if;
 if r.guardian_confirmation then
  for g in select x.* from public.elective_participant_bindings x where x.pupil_id=c.pupil_id and x.unit_id=r.unit_id and x.participant='guardian'
   and x.confirmation_required and x.revoked_at is null and x.starts_on<=public.app_today() and (x.ends_on is null or x.ends_on>=public.app_today()) order by x.id loop
   found_required:=true;d:=null;
   select decision into d from public.valplan_guardian_confirmations gc where gc.binding_id=g.id and gc.binding_revision=g.revision and gc.choice_id=c.id and gc.choice_revision=c.revision;
   if d='decline' then return 'guardian_declined';end if;if d is distinct from 'approve' then waiting:=true;end if;
  end loop;
  if not found_required then return 'guardian_bindings_missing';end if;if waiting then return 'awaiting_guardian';end if;
 end if;
 if c.confirmed_at is not null then return 'confirmed';end if;return 'ready_for_confirmation';
end $$;
create function public.valplan_choice_json(c public.valplan_choices) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',c.id,'roundId',c.round_id,'pupilId',c.pupil_id,'revision',c.revision,'courseIds',to_jsonb(c.course_ids),'state',public.valplan_choice_state(c),
  'submittedBy',case when c.submitted_by_binding_id is null then 'school' else 'participant' end,'submittedAt',to_char(c.submitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'confirmedAt',case when c.confirmed_at is null then null else to_char(c.confirmed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end)
$$;
create function public.valplan_round_json(r public.valplan_rounds) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select case when r.id is null then null else jsonb_build_object('id',r.id,'status',r.status,'closesOn',r.closes_on,'guardianConfirmation',r.guardian_confirmation,'revision',r.revision,
  'accepting',r.status='open' and public.app_today()<=r.closes_on) end
$$;

-- A new revision clears the school's confirmation, and guardian answers are bound to the revision.
create function public.valplan_record_choice(r public.valplan_rounds,pupil uuid,expected integer,courses uuid[],actor uuid,binding uuid,assignment uuid) returns public.valplan_choices
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.valplans;c public.valplan_choices;pupil_row jsonb;offered uuid[];total integer;begin
 select * into v from public.valplans where id=r.valplan_id;
 if courses is null or cardinality(courses)=0 or cardinality(courses)>50 or (select count(distinct x) from unnest(courses) x)<>cardinality(courses) then perform public.valplan_choice_invalid();end if;
 pupil_row:=public.valplan_pupil_row(v,pupil);
 -- D-05: the school may register an exception; a pupil only chooses what the row and class offer.
 if binding is not null then
  if pupil_row is null then raise exception 'Valplan denied' using errcode='42501';end if;
  offered:=public.valplan_pupil_courses(v,pupil_row);
  if not courses<@offered then perform public.valplan_choice_invalid('valplan_choice_course');end if;
 elsif exists(select 1 from unnest(courses) x where not exists(select 1 from public.valplan_courses vc where vc.id=x and vc.valplan_id=v.id and vc.active)) then
  perform public.valplan_choice_invalid('valplan_choice_course');
 end if;
 select sum(vc.points) into total from public.valplan_courses vc where vc.id=any(courses);
 if pupil_row is not null and total<>(pupil_row->>'points')::integer then perform public.valplan_choice_invalid('valplan_choice_points');end if;
 select * into c from public.valplan_choices where round_id=r.id and pupil_id=pupil for update;
 if coalesce(c.revision,0)<>expected then raise exception 'Choice changed' using errcode='40001',hint='elective_choice_conflict';end if;
 if c.id is null then
  insert into public.valplan_choices(id,round_id,pupil_id,revision,course_ids,submitted_at,submitted_by_identity_id,submitted_by_binding_id,recorded_by_assignment_id)
  values(gen_random_uuid(),r.id,pupil,1,courses,clock_timestamp(),actor,binding,assignment) returning * into c;
 else
  update public.valplan_choices set revision=revision+1,course_ids=courses,submitted_at=clock_timestamp(),submitted_by_identity_id=actor,submitted_by_binding_id=binding,
   recorded_by_assignment_id=assignment,confirmed_at=null,confirmed_by_assignment_id=null where id=c.id returning * into c;
 end if;
 insert into public.valplan_choice_history(choice_id,revision,body) values(c.id,c.revision,to_jsonb(c));
 return c;
end $$;

create function public.valplan_choice_projection(a public.access_assignments,v public.valplans) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.valplan_rounds;st public.elective_school_state;begin
 select * into r from public.valplan_rounds where valplan_id=v.id;select * into st from public.elective_school_state where unit_id=v.unit_id;
 return jsonb_build_object('contractVersion','valplan_choice_v1','unitId',v.unit_id,'schoolYear',v.school_year,'valplanId',v.id,'valplanName',v.name,'valplanRevision',v.revision,
  'guardianConfirmation',st.guardian_confirmation,'round',public.valplan_round_json(r),
  'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'points',c.points) order by c.position),'[]') from public.valplan_courses c where c.valplan_id=v.id and c.active),
  'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name) order by sc.name collate "C",sc.id),'[]') from public.school_classes sc where sc.unit_id=v.unit_id),
  'groupCourseIds',(select coalesce(jsonb_agg(distinct g.valplan_course_id),'[]') from public.study_groups g where g.valplan_id=v.id and g.active),
  'pupils',(select coalesce(jsonb_agg(p.value||jsonb_build_object('targetPoints',x.pupil_row->'points','offeredCourseIds',to_jsonb(public.valplan_pupil_courses(v,x.pupil_row)),
     'choice',(select public.valplan_choice_json(c) from public.valplan_choices c where c.round_id=r.id and c.pupil_id=(p.value->>'id')::uuid)) order by p.position),'[]')
   from jsonb_array_elements(public.study_group_pupils(a,v.unit_id,v.school_year)) with ordinality p(value,position)
   cross join lateral (select public.valplan_pupil_row(v,(p.value->>'id')::uuid) pupil_row) x));
end $$;
create function public.valplan_choice_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;v public.valplans;begin
 if not coalesce(public.phase5_programplan_shape(input,array['unitId','schoolYear','valplanId']),false) or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) then perform public.valplan_choice_invalid();end if;
 a:=public.elective_staff_scope(public.tjanst_uuid(input->'unitId'));
 select * into v from public.valplans where id=public.tjanst_uuid(input->'valplanId') and unit_id=(input->>'unitId')::uuid and school_year=(input->>'schoolYear')::integer;
 if v.id is null then raise exception 'Valplan denied' using errcode='42501';end if;
 return jsonb_build_object('contractVersion','valplan_choice_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',public.valplan_choice_projection(a,v));
end $$;

-- One group per course with confirmed pupils. A rerun reuses the course's groups, adds only pupils who are in none of them
-- and never moves anyone: a changed choice leaves an existing membership for the school to handle in Undervisningsgrupper.
create function public.valplan_create_groups(a public.access_assignments,v public.valplans,r public.valplan_rounds) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare vc public.valplan_courses;g public.study_groups;members jsonb;classes jsonb;created integer:=0;added integer:=0;skipped integer:=0;n integer;gid uuid;
 run jsonb:=jsonb_build_object('contractVersion','study_group_v1','unitId',v.unit_id,'schoolYear',v.school_year);begin
 for vc in select x.* from public.valplan_courses x where x.valplan_id=v.id and x.active order by x.position loop
  select coalesce(jsonb_agg(c.id),'[]') into members from public.valplan_choices c where c.round_id=r.id and vc.id=any(c.course_ids) and public.valplan_choice_state(c)='confirmed';
  continue when jsonb_array_length(members)=0;
  select coalesce(jsonb_agg(distinct m.class_id),'[]') into classes from public.valplan_choices c join public.pupil_class_memberships m on m.pupil_id=c.pupil_id and m.unit_id=v.unit_id
   and m.starts_on<=make_date(v.school_year+1,6,30) and coalesce(m.ends_on,'infinity'::date)>=make_date(v.school_year,7,1) where members ? c.id::text;
  select * into g from public.study_groups x where x.valplan_course_id=vc.id and x.active order by x.name collate "C",x.id limit 1;
  if g.id is null then
   gid:=gen_random_uuid();created:=created+1;
   perform public.study_group_command(run||jsonb_build_object('commandId',gen_random_uuid(),'action','save_group','payload',jsonb_build_object('id',gid,'expectedRevision',0,'name',vc.name,
    'startsOn',make_date(v.school_year,7,1),'endsOn',make_date(v.school_year+1,6,30),'course',jsonb_build_object('subjectCode',vc.subject_code,'subjectVersion',vc.subject_version,'itemCode',vc.item_code,'points',vc.points,'languageCode',vc.language_code),
    'minutesHt',vc.minutes_ht,'minutesVt',vc.minutes_vt,'parallelSetId',gen_random_uuid(),'classIds',classes,'origin',jsonb_build_object('kind','valplan','valplanId',v.id,'courseId',vc.id))));
   select * into g from public.study_groups where id=gid;
  elsif exists(select 1 from jsonb_array_elements_text(classes) x where not exists(select 1 from public.study_group_classes sc where sc.group_id=g.id and sc.class_id=x.value::uuid)) then
   perform public.study_group_command(run||jsonb_build_object('commandId',gen_random_uuid(),'action','save_group','payload',public.study_group_document(g)-'unitId'-'schoolYear'-'revision'-'active'
    ||jsonb_build_object('expectedRevision',g.revision,'classIds',(select jsonb_agg(distinct x.value) from (select value from jsonb_array_elements(classes) union select to_jsonb(class_id) from public.study_group_classes where group_id=g.id) x))));
   select * into g from public.study_groups where id=g.id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('pupilId',c.pupil_id,'startsOn',greatest(g.starts_on,pl.starts_on),'endsOn',least(g.ends_on,coalesce(pl.ends_on,g.ends_on)),'source','choice','sourceRef',c.id)),'[]'),count(*)
   into members,n from public.valplan_choices c
   cross join lateral (select pp.starts_on,pp.ends_on from public.pupil_placements pp where pp.pupil_id=c.pupil_id and pp.unit_id=v.unit_id and pp.starts_on<=g.ends_on and coalesce(pp.ends_on,'infinity'::date)>=g.starts_on order by pp.starts_on desc limit 1) pl
   where members ? c.id::text and not exists(select 1 from public.study_group_memberships m where m.pupil_id=c.pupil_id and m.parallel_set_id=g.parallel_set_id and m.cancelled_at is null);
  if n>0 then perform public.study_group_command(run||jsonb_build_object('commandId',gen_random_uuid(),'action','add_members','payload',jsonb_build_object('groupId',g.id,'members',members)));end if;
  added:=added+n;
 end loop;
 select count(*) into skipped from public.valplan_choices c where c.round_id=r.id and public.valplan_choice_state(c)<>'confirmed';
 return jsonb_build_object('created',created,'added',added,'notConfirmed',skipped);
end $$;

create function public.valplan_choice_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;st public.elective_school_state;j public.valplan_choice_commands;v public.valplans;r public.valplan_rounds;c public.valplan_choices;
 p jsonb;unit uuid;year integer;command uuid;pupil uuid;closes date;request_hash text;receipt jsonb;envelope jsonb;action text;courses uuid[];identity uuid;begin
 if not coalesce(public.phase5_programplan_shape(input,array['contractVersion','commandId','action','unitId','schoolYear','valplanId','payload']),false)
  or input->>'contractVersion' is distinct from 'valplan_choice_v1' or input->>'action' is null
  or input->>'action' not in ('set_policy','open_round','close_round','record_choice','confirm_choice','create_groups')
  or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or octet_length(public.tjanst_canonical(input))>64000 then perform public.valplan_choice_invalid();end if;
 unit:=public.tjanst_uuid(input->'unitId');year:=(input->>'schoolYear')::integer;command:=public.tjanst_uuid(input->'commandId');action:=input->>'action';p:=input->'payload';
 a:=public.elective_staff_scope(unit);identity:=current_setting('app.identity_id',true)::uuid;
 perform pg_advisory_xact_lock(hashtextextended(command::text,5573));st:=public.elective_lock_school(unit);request_hash:=substr(public.tjanst_hash(input),8);
 select * into j from public.valplan_choice_commands where command_id=command;
 if j.command_id is not null then
  if j.unit_id<>unit or j.school_year<>year or j.action<>action or j.payload_hash<>request_hash or j.actor_identity_id<>identity or j.assignment_id<>a.id then raise exception 'Valplan choice command collision' using errcode='40001',hint='valplan_choice_command_conflict';end if;
  return jsonb_set(j.envelope,'{result,receipt,replayed}','true');
 end if;
 select * into v from public.valplans where id=public.tjanst_uuid(input->'valplanId') and unit_id=unit and school_year=year for update;
 if v.id is null then raise exception 'Valplan denied' using errcode='42501';end if;
 select * into r from public.valplan_rounds where valplan_id=v.id for update;
 if action='set_policy' then
  if not coalesce(public.phase5_programplan_shape(p,array['guardianConfirmation']),false) or jsonb_typeof(p->'guardianConfirmation') is distinct from 'boolean' then perform public.valplan_choice_invalid();end if;
  update public.elective_school_state set guardian_confirmation=(p->>'guardianConfirmation')::boolean,policy_revision=policy_revision+1,revision=revision+1 where unit_id=unit returning * into st;
  perform public.elective_apply_policy(unit,st.guardian_confirmation,st.policy_revision);
  -- Same rule as open elective rounds: the school's explicit choice applies to what is open now.
  update public.valplan_rounds x set guardian_confirmation=st.guardian_confirmation,policy_revision=st.policy_revision,revision=x.revision+1 where x.unit_id=unit and x.status='open';
  receipt:=jsonb_build_object('guardianConfirmation',p->'guardianConfirmation');
 elsif action='open_round' then
  if not coalesce(public.phase5_programplan_shape(p,array['expectedRevision','closesOn']),false) or not public.phase5_programplan_integer(p->'expectedRevision',0,2147483645) then perform public.valplan_choice_invalid();end if;
  closes:=public.study_group_date(p->'closesOn');
  if closes<public.app_today() then perform public.valplan_choice_invalid('valplan_round_date');end if;
  if not exists(select 1 from public.valplan_rows x where x.valplan_id=v.id) or not exists(select 1 from public.valplan_courses x where x.valplan_id=v.id and x.active) then perform public.valplan_choice_invalid('valplan_round_empty');end if;
  if coalesce(r.revision,0)<>(p->>'expectedRevision')::integer then raise exception 'Round changed' using errcode='40001',hint='valplan_round_conflict';end if;
  -- The school must have taken a stand on guardian confirmation, as for elective rounds.
  if st.guardian_confirmation is null then raise exception 'Policy unset' using errcode='40001',hint='elective_policy_missing';end if;
  if r.id is null then insert into public.valplan_rounds(id,valplan_id,unit_id,school_year,status,closes_on,guardian_confirmation,policy_revision,revision)
   values(gen_random_uuid(),v.id,unit,year,'open',closes,st.guardian_confirmation,st.policy_revision,1) returning * into r;
  -- Reopening keeps the setting the round started with: answers already given keep their meaning.
  else update public.valplan_rounds set status='open',closes_on=closes,revision=revision+1 where id=r.id returning * into r;end if;
  receipt:=jsonb_build_object('roundId',r.id,'revision',r.revision);
 elsif r.id is null then raise exception 'Round missing' using errcode='40001',hint='valplan_round_conflict';
 elsif action='close_round' then
  if not coalesce(public.phase5_programplan_shape(p,array['expectedRevision']),false) or not public.phase5_programplan_integer(p->'expectedRevision',1,2147483645) then perform public.valplan_choice_invalid();end if;
  if r.revision<>(p->>'expectedRevision')::integer then raise exception 'Round changed' using errcode='40001',hint='valplan_round_conflict';end if;
  update public.valplan_rounds set status='closed',revision=revision+1 where id=r.id returning * into r;
  receipt:=jsonb_build_object('roundId',r.id,'revision',r.revision);
 elsif action in ('record_choice','confirm_choice') then
  if not coalesce(public.phase5_programplan_shape(p,case action when 'record_choice' then array['pupilId','expectedChoiceRevision','courseIds'] else array['pupilId','expectedChoiceRevision'] end),false)
   or not public.phase5_programplan_integer(p->'expectedChoiceRevision',0,2147483645) then perform public.valplan_choice_invalid();end if;
  pupil:=public.tjanst_uuid(p->'pupilId');
  if not public.phase4_scope(a.id,pupil,unit) or exists(select 1 from public.pupils x where x.id=pupil and x.protected_identity and not public.phase4_can_read_protected(pupil,unit))
   or not exists(select 1 from public.pupil_placements pp where pp.pupil_id=pupil and pp.unit_id=unit and pp.starts_on<=make_date(year+1,6,30) and coalesce(pp.ends_on,'infinity'::date)>=make_date(year,7,1)) then raise exception 'Pupil denied' using errcode='42501';end if;
  if action='record_choice' then
   if jsonb_typeof(p->'courseIds') is distinct from 'array' or jsonb_array_length(p->'courseIds')>50 then perform public.valplan_choice_invalid();end if;
   select coalesce(array_agg(public.tjanst_uuid(x.value)),'{}'::uuid[]) into courses from jsonb_array_elements(p->'courseIds') x;
   c:=public.valplan_record_choice(r,pupil,(p->>'expectedChoiceRevision')::integer,courses,identity,null,a.id);
  else
   select * into c from public.valplan_choices where round_id=r.id and pupil_id=pupil for update;
   if c.id is null or c.revision<>(p->>'expectedChoiceRevision')::integer then raise exception 'Choice changed' using errcode='40001',hint='elective_choice_conflict';end if;
   if public.valplan_choice_state(c) not in ('ready_for_confirmation','confirmed') then raise exception 'Choice not confirmed' using errcode='40001',hint='elective_confirmation_required';end if;
   update public.valplan_choices set confirmed_at=coalesce(confirmed_at,clock_timestamp()),confirmed_by_assignment_id=coalesce(confirmed_by_assignment_id,a.id) where id=c.id returning * into c;
  end if;
  receipt:=jsonb_build_object('choiceId',c.id,'choiceRevision',c.revision);
 else
  if p<>'{}'::jsonb then perform public.valplan_choice_invalid();end if;
  receipt:=public.valplan_create_groups(a,v,r);
 end if;
 envelope:=jsonb_build_object('contractVersion','valplan_choice_sql_v1','actor',jsonb_build_object('identityId',identity,'assignmentId',a.id),
  'result',jsonb_build_object('receipt',receipt||jsonb_build_object('commandId',command,'action',action,'replayed',false),'read',public.valplan_choice_projection(a,v)));
 insert into public.valplan_choice_commands(command_id,unit_id,school_year,valplan_id,action,payload_hash,actor_identity_id,assignment_id,envelope)
 values(command,unit,year,v.id,action,request_hash,identity,a.id,envelope);
 return envelope;
end $$;

-- Same session and participant authority as Mina val. Only the pupil's own offer, never other pupils or class lists.
create function public.valplan_self_read() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a jsonb;b public.elective_participant_bindings;r public.valplan_rounds;v public.valplans;c public.valplan_choices;pupil_row jsonb;offered uuid[];offers jsonb:='[]';begin
 a:=public.elective_participant_actor();select * into b from public.elective_participant_bindings where id=(a->>'bindingId')::uuid;
 for r in select x.* from public.valplan_rounds x where x.unit_id=b.unit_id order by x.closes_on desc,x.id limit 200 loop
  select * into v from public.valplans where id=r.valplan_id;c:=null;select * into c from public.valplan_choices where round_id=r.id and pupil_id=b.pupil_id;
  pupil_row:=public.valplan_pupil_row(v,b.pupil_id);continue when pupil_row is null and c.id is null;
  offered:=public.valplan_pupil_courses(v,pupil_row);
  offers:=offers||jsonb_build_array(jsonb_build_object('round',public.valplan_round_json(r),'valplanId',v.id,'valplanName',v.name,'kind',v.kind,'schoolYear',v.school_year,'targetPoints',pupil_row->'points',
   'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',vc.id,'name',vc.name,'points',vc.points) order by vc.position),'[]') from public.valplan_courses vc where vc.valplan_id=v.id and (vc.id=any(offered) or vc.id=any(coalesce(c.course_ids,'{}'::uuid[])))),
   'choice',case when c.id is null then null else public.valplan_choice_json(c) end,
   'decision',case when c.id is null then null else (select to_jsonb(gc.decision) from public.valplan_guardian_confirmations gc where gc.binding_id=b.id and gc.binding_revision=b.revision and gc.choice_id=c.id and gc.choice_revision=c.revision) end));
 end loop;
 perform public.elective_participant_audit('elective_self_read',null);
 return jsonb_build_object('contractVersion','valplan_self_v1','epoch',a->'epoch','offers',offers);
end $$;

create function public.valplan_self_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a jsonb;r public.valplan_rounds;c public.valplan_choices;g public.elective_participant_bindings;prior public.valplan_self_commands;existing public.valplan_guardian_confirmations;p jsonb;courses uuid[];result jsonb;begin
 perform public.phase4_keys(input,array['unitId','pupilId','participant','expectedBindingRevision','commandId','action','payload']);a:=public.elective_participant_actor();
 if a->>'unitId'<>input->>'unitId' or a->>'pupilId'<>input->>'pupilId' or a->>'participant'<>input->>'participant' then raise exception 'Participant mismatch' using errcode='42501';end if;
 perform public.elective_lock_school((a->>'unitId')::uuid);
 select * into prior from public.valplan_self_commands where command_id=(input->>'commandId')::uuid;
 if found then
  if prior.actor_identity_id<>(a->>'identityId')::uuid or prior.binding_id<>(a->>'bindingId')::uuid or prior.request<>input then raise exception 'Command changed' using errcode='40001',hint='elective_self_conflict';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if (input->>'expectedBindingRevision')::integer<>(a->>'bindingRevision')::integer then raise exception 'Binding changed' using errcode='40001',hint='elective_binding_conflict';end if;
 p:=input->'payload';
 if input->>'action'='submit_choice' and a->>'participant'='pupil' then
  perform public.phase4_keys(p,array['roundId','expectedChoiceRevision','courseIds']);
  select * into r from public.valplan_rounds where id=(p->>'roundId')::uuid and unit_id=(a->>'unitId')::uuid for update;
  if not found then raise exception 'Offering denied' using errcode='42501';end if;
  if r.status<>'open' or public.app_today()>r.closes_on then raise exception 'Round closed' using errcode='40001',hint='elective_round_closed';end if;
  if jsonb_typeof(p->'courseIds') is distinct from 'array' or jsonb_array_length(p->'courseIds')>50 then perform public.valplan_choice_invalid();end if;
  select coalesce(array_agg(public.tjanst_uuid(x.value)),'{}'::uuid[]) into courses from jsonb_array_elements(p->'courseIds') x;
  c:=public.valplan_record_choice(r,(a->>'pupilId')::uuid,(p->>'expectedChoiceRevision')::integer,courses,(a->>'identityId')::uuid,(a->>'bindingId')::uuid,null);
 elsif input->>'action'='confirm_guardian' and a->>'participant'='guardian' then
  perform public.phase4_keys(p,array['choiceId','expectedChoiceRevision','decision']);
  if p->>'decision' is null or p->>'decision' not in ('approve','decline') then raise exception 'Invalid guardian decision' using errcode='22023';end if;
  select x.* into c from public.valplan_choices x join public.valplan_rounds y on y.id=x.round_id where x.id=(p->>'choiceId')::uuid and x.pupil_id=(a->>'pupilId')::uuid and y.unit_id=(a->>'unitId')::uuid for update of x;
  if not found then raise exception 'Child choice denied' using errcode='42501';end if;
  select * into r from public.valplan_rounds where id=c.round_id for update;
  if r.status<>'open' or public.app_today()>r.closes_on then raise exception 'Round closed' using errcode='40001',hint='elective_round_closed';end if;
  if c.revision<>(p->>'expectedChoiceRevision')::integer then raise exception 'Choice changed' using errcode='40001',hint='elective_choice_conflict';end if;
  if not r.guardian_confirmation then raise exception 'Confirmation not required' using errcode='40001',hint='elective_confirmation_conflict';end if;
  select * into g from public.elective_participant_bindings where id=(a->>'bindingId')::uuid for update;
  if not found or g.pupil_id<>c.pupil_id or g.unit_id<>r.unit_id or g.participant<>'guardian' or not g.confirmation_required or g.revoked_at is not null
   or g.starts_on>public.app_today() or (g.ends_on is not null and g.ends_on<public.app_today()) then raise exception 'Guardian relation denied' using errcode='42501';end if;
  select * into existing from public.valplan_guardian_confirmations gc where gc.binding_id=g.id and gc.binding_revision=g.revision and gc.choice_id=c.id and gc.choice_revision=c.revision;
  if found then
   if existing.decision<>p->>'decision' then raise exception 'Decision already recorded' using errcode='40001',hint='elective_confirmation_conflict';end if;
  else insert into public.valplan_guardian_confirmations(id,binding_id,binding_revision,choice_id,choice_revision,decision) values(gen_random_uuid(),g.id,g.revision,c.id,c.revision,p->>'decision');end if;
 else raise exception 'Unsupported participant action' using errcode='42501';end if;
 result:=jsonb_build_object('commandId',input->'commandId','action',input->'action','bindingId',a->'bindingId','choiceId',c.id,'choiceRevision',c.revision,'replayed',false);
 insert into public.valplan_self_commands(command_id,unit_id,pupil_id,participant,actor_identity_id,binding_id,action,request,result)
 values((input->>'commandId')::uuid,(a->>'unitId')::uuid,(a->>'pupilId')::uuid,a->>'participant',(a->>'identityId')::uuid,(a->>'bindingId')::uuid,input->>'action',input,result);
 perform public.elective_participant_audit(case when input->>'action'='confirm_guardian' then 'elective_guardian_confirmed' else 'elective_choice_submitted' end,c.id);return result;
end $$;

do $$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
  and p.proname in ('valplan_choice_invalid','valplan_pupil_row','valplan_pupil_courses','valplan_choice_state','valplan_choice_json','valplan_round_json','valplan_record_choice','valplan_choice_projection','valplan_create_groups','valplan_choice_read','valplan_choice_command','valplan_self_read','valplan_self_command') loop
  execute format('revoke all privileges on function %s from public,anon,authenticated,service_role,skolplattform_worker',fn);
 end loop;
end $$;
grant execute on function public.valplan_choice_read(jsonb),public.valplan_choice_command(jsonb),public.valplan_self_read(),public.valplan_self_command(jsonb) to skolplattform_worker;
