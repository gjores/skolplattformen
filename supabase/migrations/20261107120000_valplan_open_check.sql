-- VP-13. Blocket kan inte öppnas för elevval med fel kvar (F-06, G3, G5, G8). Samma regel som valplanCheck i web/lib/valplan-model.ts:
-- blocket har kurser med tid, varje klass i blocket ligger i ett block och en rad, och varje klass kan nå exakt sina poäng med kurser
-- den får läsa. Prövas när valet öppnas, också när det öppnas igen. Ett redan öppet val stängs inte. Ingen ny tabell, och inga objekt
-- i SS 12000 ändras: blocket och kontrollen är lokal planering. Klass är fortsatt Group av typen Klass.

-- Each course counts once, as in a pupil's choice.
create function public.valplan_points_reachable(course_points integer[],target integer) returns boolean
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare reach integer[]:=array[0];p integer;begin
 foreach p in array coalesce(course_points,'{}'::integer[]) loop
  reach:=array(select s from unnest(reach) s union select s+p from unnest(reach) s where s+p<=target);
 end loop;
 return target=any(reach);
end $$;

-- The reason the block cannot open, or null. A class is checked against the row it reads through this block, so an unticked class
-- counts in its own block. A class in two blocks on a row, or in two rows of the block, has no single target and stops the opening.
create function public.valplan_round_problem(v public.valplans) returns text
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare contexts jsonb:=public.valplan_row_contexts(v.unit_id,v.school_year);own jsonb;c jsonb;offered uuid[];begin
 if not exists(select 1 from public.valplan_rows x where x.valplan_id=v.id) or not exists(select 1 from public.valplan_courses x where x.valplan_id=v.id and x.active) then return 'valplan_round_empty';end if;
 if exists(select 1 from public.valplan_rows x where x.valplan_id=v.id and not exists(select 1 from jsonb_array_elements(contexts) r
   where r.value->>'timplanId'=x.timplan_id::text and r.value->>'rowKey'=x.row_key and (r.value->>'year')::integer=x.year)) then return 'valplan_round_row';end if;
 select coalesce(jsonb_agg(jsonb_build_object('classId',k.value,'points',r.value->'points')),'[]') into own
  from jsonb_array_elements(contexts) r cross join lateral jsonb_array_elements(r.value->'blocks') b cross join lateral jsonb_array_elements_text(b.value->'classIds') k
  where b.value->>'valplanId'=v.id::text;
 if jsonb_array_length(own)=0 then return 'valplan_round_no_classes';end if;
 if exists(select 1 from jsonb_array_elements(contexts) r cross join lateral jsonb_array_elements(r.value->'blocks') b cross join lateral jsonb_array_elements_text(b.value->'classIds') k
   cross join lateral jsonb_array_elements(r.value->'blocks') o where b.value->>'valplanId'=v.id::text and o.value->>'valplanId'<>v.id::text and o.value->'classIds' ? k.value) then return 'valplan_round_doubled';end if;
 if exists(select 1 from jsonb_array_elements(own) x group by x.value->>'classId' having count(*)>1) then return 'valplan_round_rows';end if;
 if exists(select 1 from public.valplan_courses x where x.valplan_id=v.id and x.active and x.minutes_ht+x.minutes_vt=0) then return 'valplan_round_time';end if;
 for c in select value from jsonb_array_elements(own) loop
  offered:=public.valplan_pupil_courses(v,c);
  if not public.valplan_points_reachable((select array_agg(x.points) from public.valplan_courses x where x.id=any(offered)),(c->>'points')::integer) then return 'valplan_round_points';end if;
 end loop;
 return null;
end $$;

-- Pupils with a choice of each course, in all and per class. Only counts: the view asks before a course or a class is removed (G8).
create function public.valplan_course_choices(v public.valplans) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 with picked as (select distinct c.pupil_id,k.course_id from public.valplan_rounds r join public.valplan_choices c on c.round_id=r.id
   cross join lateral unnest(c.course_ids) k(course_id) join public.valplan_courses vc on vc.id=k.course_id and vc.active where r.valplan_id=v.id)
 select coalesce(jsonb_agg(jsonb_build_object('courseId',x.course_id,'pupils',x.pupils,'classes',(
   select coalesce(jsonb_agg(jsonb_build_object('classId',y.class_id,'pupils',y.pupils) order by y.class_id),'[]') from (
    select m.class_id,count(distinct p.pupil_id)::integer pupils from picked p join public.pupil_class_memberships m on m.pupil_id=p.pupil_id and m.unit_id=v.unit_id
     and m.starts_on<=make_date(v.school_year+1,6,30) and coalesce(m.ends_on,'infinity'::date)>=make_date(v.school_year,7,1)
    where p.course_id=x.course_id group by m.class_id) y)) order by x.course_id),'[]')
 from (select p.course_id,count(*)::integer pupils from picked p group by p.course_id) x
$$;

create or replace function public.valplan_projection(unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('contractVersion','valplan_v1','unitId',unit,'schoolYear',school_year,
  'valplans',(select coalesce(jsonb_agg(jsonb_build_object('catalogId',v.catalog_id,'valplan',public.valplan_document(v),'choiceCounts',public.valplan_class_choices(v),'courseChoices',public.valplan_course_choices(v)) order by v.name collate "C",v.id),'[]')
   from public.valplans v where v.unit_id=unit and v.school_year=valplan_projection.school_year),
  'rows',public.valplan_row_contexts(unit,school_year))
$$;

create or replace function public.valplan_choice_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;st public.elective_school_state;j public.valplan_choice_commands;v public.valplans;r public.valplan_rounds;c public.valplan_choices;
 p jsonb;unit uuid;year integer;command uuid;pupil uuid;closes date;request_hash text;receipt jsonb;envelope jsonb;action text;courses uuid[];identity uuid;problem text;begin
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
  -- G5: the same rule as Kontroll in the view, so the opening is refused without the view too.
  problem:=public.valplan_round_problem(v);
  if problem is not null then perform public.valplan_choice_invalid(problem);end if;
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

revoke all on function public.valplan_points_reachable(integer[],integer),public.valplan_round_problem(public.valplans),public.valplan_course_choices(public.valplans) from public,anon,authenticated,service_role,skolplattform_worker;
