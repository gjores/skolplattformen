-- VP-14. En elev kan inte välja en kurs eleven redan har, varken själv eller genom skolan (F-08, G6, G7). valplan_pupil_held_courses ger
-- elevens kurser med källa, timplan eller val, och studieplanerna lägger senare till sin källa där utan att valen ändras. Samma kurs är
-- samma ämneskod, nivåkod och språk, oavsett ämnesversion. Alternativa ämnen och valpaket räknas inte: underlaget visar inte vilket eleven
-- läser. Val som redan finns ändras inte, utan får läget course_held. Ingen ny tabell. Inga objekt i SS 12000 ändras: kontrollen är lokal
-- planering, kursreferensen bevarar ämne, version och nivå, och den säger inget om StudyPlan eller betyg.

-- The state before the check of held courses. Held courses ask this one, so two choices never wait for each other's state.
create function public.valplan_choice_base_state(c public.valplan_choices) returns text
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

-- Fixed rows on the class's timplaner during the whole education, with the school year they are read. A year linked to another plan
-- reads that plan instead. A year without a link keeps the plan, since the class is linked once. A fixed row carries no language.
create function public.valplan_class_fixed(klass uuid) returns table(subject_code text,item_code text,school_year integer)
language sql stable security definer set search_path=pg_catalog,public as $$
 select distinct split_part(d.value->>'rowKey',':',2),split_part(d.value->>'rowKey',':',4),p.cohort+y.n
 from public.class_timplans l join public.timplans t on t.id=l.timplan_id
 cross join lateral (select public.phase5_class_start_year(t) cohort) p
 cross join lateral jsonb_array_elements(coalesce(t.gym_basis->'distribution','[]'::jsonb)) d
 cross join generate_series(0,2) y(n)
 where l.class_id=klass and split_part(d.value->>'rowKey',':',1) in ('foundation','programmeSpecific','orientation','specialization')
  and coalesce((d.value->'points'->>(2*y.n))::integer,0)+coalesce((d.value->'points'->>(2*y.n+1))::integer,0)>0
  and not exists(select 1 from public.class_timplans o where o.class_id=klass and o.start_year=p.cohort+y.n and o.timplan_id<>l.timplan_id)
$$;

-- The courses the pupil has outside this block. The class of the block's year counts for the whole education, an earlier class for the
-- years the pupil was in it. A choice counts from every other block and year at the school until it is changed or declined.
create function public.valplan_pupil_held_courses(v public.valplans,pupil uuid) returns table(subject_code text,item_code text,language_code text,source text)
language sql stable security definer set search_path=pg_catalog,public as $$
 select f.subject_code,f.item_code,null::text,'timplan' from public.pupil_class_memberships m cross join lateral public.valplan_class_fixed(m.class_id) f
 where m.pupil_id=pupil and m.unit_id=v.unit_id and (
  (m.starts_on<=make_date(v.school_year+1,6,30) and coalesce(m.ends_on,'infinity'::date)>=make_date(v.school_year,7,1))
  or (m.starts_on<=make_date(f.school_year+1,6,30) and coalesce(m.ends_on,'infinity'::date)>=make_date(f.school_year,7,1)))
 union
 select vc.subject_code,vc.item_code,vc.language_code,'val' from public.valplan_choices c join public.valplan_rounds r on r.id=c.round_id
  cross join lateral unnest(c.course_ids) k(course_id) join public.valplan_courses vc on vc.id=k.course_id and vc.active
 where c.pupil_id=pupil and r.unit_id=v.unit_id and r.valplan_id<>v.id and public.valplan_choice_base_state(c)<>'guardian_declined'
$$;

-- The block's courses the pupil cannot choose, with the reason. Missing language equals missing language; a language differs from none.
-- A course both in the timplan and in another choice gives the timplan as the reason.
create function public.valplan_pupil_blocked(v public.valplans,pupil uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 with held as materialized (select * from public.valplan_pupil_held_courses(v,pupil))
 select coalesce(jsonb_agg(jsonb_build_object('courseId',x.id,'reason',x.reason) order by x.position,x.id),'[]') from (
  select c.id,c.position,min(h.source) reason from public.valplan_courses c
  join held h on h.subject_code=c.subject_code and h.item_code=c.item_code and h.language_code is not distinct from c.language_code
  where c.valplan_id=v.id and c.active group by c.id,c.position) x
$$;

-- A saved choice with a course the pupil already has keeps its courses and its confirmation. The state stops it from being confirmed
-- and from reaching groups until the school or the pupil changes it. Two old choices with the same course both get the state.
create or replace function public.valplan_choice_state(c public.valplan_choices) returns text
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare base text:=public.valplan_choice_base_state(c);v public.valplans;begin
 if base in ('course_changed','guardian_declined') then return base;end if;
 select x.* into v from public.valplans x join public.valplan_rounds r on r.valplan_id=x.id where r.id=c.round_id;
 if exists(select 1 from jsonb_array_elements(public.valplan_pupil_blocked(v,c.pupil_id)) b where (b.value->>'courseId')::uuid=any(c.course_ids)) then return 'course_held';end if;
 return base;
end $$;

-- A new revision clears the school's confirmation, and guardian answers are bound to the revision.
create or replace function public.valplan_record_choice(r public.valplan_rounds,pupil uuid,expected integer,courses uuid[],actor uuid,binding uuid,assignment uuid) returns public.valplan_choices
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
 -- F-08 has no exception: it also holds for the school and for pupils outside the block's classes.
 if exists(select 1 from jsonb_array_elements(public.valplan_pupil_blocked(v,pupil)) b where (b.value->>'courseId')::uuid=any(courses)) then perform public.valplan_choice_invalid('valplan_choice_course_held');end if;
 if (select count(distinct (vc.subject_code,vc.item_code,coalesce(vc.language_code,'-'))) from public.valplan_courses vc where vc.id=any(courses))<>cardinality(courses) then perform public.valplan_choice_invalid('valplan_choice_course_twice');end if;
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

-- The same rule as valplanCheck: a course the class already reads gives it no points. Only the class's fixed rows count here, since the
-- block has no single pupil. A course with a language differs from a fixed row, which has none.
create or replace function public.valplan_round_problem(v public.valplans) returns text
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
  if not public.valplan_points_reachable((select array_agg(x.points) from public.valplan_courses x where x.id=any(offered) and not (x.language_code is null
    and exists(select 1 from public.valplan_class_fixed((c->>'classId')::uuid) f where f.subject_code=x.subject_code and f.item_code=x.item_code))),(c->>'points')::integer) then return 'valplan_round_points';end if;
 end loop;
 return null;
end $$;

-- classCourses: what the classes on the year's rows already read, so the view can stop a course when the block is built (G6).
create or replace function public.valplan_projection(unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 with contexts as materialized (select public.valplan_row_contexts(unit,school_year) value)
 select jsonb_build_object('contractVersion','valplan_v1','unitId',unit,'schoolYear',school_year,
  'valplans',(select coalesce(jsonb_agg(jsonb_build_object('catalogId',v.catalog_id,'valplan',public.valplan_document(v),'choiceCounts',public.valplan_class_choices(v),'courseChoices',public.valplan_course_choices(v)) order by v.name collate "C",v.id),'[]')
   from public.valplans v where v.unit_id=unit and v.school_year=valplan_projection.school_year),
  'rows',x.value,
  'classCourses',(select coalesce(jsonb_agg(jsonb_build_object('classId',k.id,'courses',(select coalesce(jsonb_agg(f.course order by f.course->>'subjectCode',f.course->>'itemCode'),'[]') from (
     select distinct jsonb_build_object('subjectCode',y.subject_code,'itemCode',y.item_code) course from public.valplan_class_fixed(k.id) y) f)) order by k.id),'[]')
   from (select distinct i.value::uuid id from jsonb_array_elements(x.value) r cross join lateral jsonb_array_elements_text(r.value->'classIds') i) k))
 from contexts x
$$;

create or replace function public.valplan_choice_projection(a public.access_assignments,v public.valplans) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.valplan_rounds;st public.elective_school_state;begin
 select * into r from public.valplan_rounds where valplan_id=v.id;select * into st from public.elective_school_state where unit_id=v.unit_id;
 return jsonb_build_object('contractVersion','valplan_choice_v1','unitId',v.unit_id,'schoolYear',v.school_year,'valplanId',v.id,'valplanName',v.name,'valplanRevision',v.revision,
  'guardianConfirmation',st.guardian_confirmation,'round',public.valplan_round_json(r),
  'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'points',c.points) order by c.position),'[]') from public.valplan_courses c where c.valplan_id=v.id and c.active),
  'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name) order by sc.name collate "C",sc.id),'[]') from public.school_classes sc where sc.unit_id=v.unit_id),
  'groupCourseIds',(select coalesce(jsonb_agg(distinct g.valplan_course_id),'[]') from public.study_groups g where g.valplan_id=v.id and g.active),
  'pupils',(select coalesce(jsonb_agg(p.value||jsonb_build_object('targetPoints',x.pupil_row->'points',
     'offeredCourseIds',(select coalesce(jsonb_agg(o.id order by o.n),'[]') from unnest(public.valplan_pupil_courses(v,x.pupil_row)) with ordinality o(id,n) where not exists(select 1 from jsonb_array_elements(x.blocked) b where b.value->>'courseId'=o.id::text)),
     'blockedCourses',x.blocked,
     'choice',(select public.valplan_choice_json(c) from public.valplan_choices c where c.round_id=r.id and c.pupil_id=(p.value->>'id')::uuid)) order by p.position),'[]')
   from jsonb_array_elements(public.study_group_pupils(a,v.unit_id,v.school_year)) with ordinality p(value,position)
   cross join lateral (select public.valplan_pupil_row(v,(p.value->>'id')::uuid) pupil_row,public.valplan_pupil_blocked(v,(p.value->>'id')::uuid) blocked) x));
end $$;

-- Same session and participant authority as Mina val. Only the pupil's own offer, never other pupils or class lists.
-- courses keeps the blocked ones so the pupil sees them, and blockedCourses says why they cannot be chosen.
create or replace function public.valplan_self_read() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a jsonb;b public.elective_participant_bindings;r public.valplan_rounds;v public.valplans;c public.valplan_choices;pupil_row jsonb;offered uuid[];offers jsonb:='[]';begin
 a:=public.elective_participant_actor();select * into b from public.elective_participant_bindings where id=(a->>'bindingId')::uuid;
 for r in select x.* from public.valplan_rounds x where x.unit_id=b.unit_id order by x.closes_on desc,x.id limit 200 loop
  select * into v from public.valplans where id=r.valplan_id;c:=null;select * into c from public.valplan_choices where round_id=r.id and pupil_id=b.pupil_id;
  pupil_row:=public.valplan_pupil_row(v,b.pupil_id);continue when pupil_row is null and c.id is null;
  offered:=public.valplan_pupil_courses(v,pupil_row);
  offers:=offers||jsonb_build_array(jsonb_build_object('round',public.valplan_round_json(r),'valplanId',v.id,'valplanName',v.name,'kind',v.kind,'schoolYear',v.school_year,'targetPoints',pupil_row->'points',
   'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',vc.id,'name',vc.name,'points',vc.points) order by vc.position),'[]') from public.valplan_courses vc where vc.valplan_id=v.id and (vc.id=any(offered) or vc.id=any(coalesce(c.course_ids,'{}'::uuid[])))),
   'blockedCourses',(select coalesce(jsonb_agg(x.value order by x.n),'[]') from jsonb_array_elements(public.valplan_pupil_blocked(v,b.pupil_id)) with ordinality x(value,n) where (x.value->>'courseId')::uuid=any(offered||coalesce(c.course_ids,'{}'::uuid[]))),
   'choice',case when c.id is null then null else public.valplan_choice_json(c) end,
   'decision',case when c.id is null then null else (select to_jsonb(gc.decision) from public.valplan_guardian_confirmations gc where gc.binding_id=b.id and gc.binding_revision=b.revision and gc.choice_id=c.id and gc.choice_revision=c.revision) end));
 end loop;
 perform public.elective_participant_audit('elective_self_read',null);
 return jsonb_build_object('contractVersion','valplan_self_v1','epoch',a->'epoch','offers',offers);
end $$;

revoke all on function public.valplan_choice_base_state(public.valplan_choices),public.valplan_class_fixed(uuid),public.valplan_pupil_held_courses(public.valplans,uuid),public.valplan_pupil_blocked(public.valplans,uuid) from public,anon,authenticated,service_role,skolplattform_worker;
