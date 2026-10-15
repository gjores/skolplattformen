-- Rollback-only blocks. The private runner supplies cohort_context using
-- approvedClassFixture and records original rows before installing migration.
-- No production records, grants, trigger disabling or persistent apply.
create temporary table cohort_checks(name text primary key) on commit drop;
create function pg_temp.cohort_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion: %',label;end if;
 insert into cohort_checks values(label);end $$;
create function pg_temp.cohort_denied(statement text,code text,hint text,label text) returns void language plpgsql as $$
declare actual_code text;actual_hint text;
begin
 begin execute statement;exception when others then get stacked diagnostics actual_code=returned_sqlstate,actual_hint=pg_exception_hint;end;
 perform pg_temp.cohort_assert(actual_code=code and (hint is null or actual_hint=hint),label);
end $$;

create function pg_temp.cohort_decision(plan uuid,action text) returns jsonb language plpgsql as $$
declare b jsonb;d jsonb;
begin
 b:=public.phase5_plan_decision_basis('programplan',plan);d:=coalesce(b->'detail',b);
 return public.phase5_plan_decision_command(jsonb_build_object('kind','programplan','planId',plan,'commandId',gen_random_uuid(),
  'action',action,'expectedRevision',d->'revision','expectedDecisionRevision',d->'decisionRevision','basisHash',d->'basisHash','comment','',
  'confirmedChecks',(select jsonb_agg(v->'id') from jsonb_array_elements(d->'checks') v)));
end $$;

do $$
declare x jsonb;old_class public.school_classes;c public.school_classes;r jsonb;q jsonb;started date;f record;role_name text;
 draft public.point_plans;o public.offerings;before_rows jsonb;new_class uuid;reference jsonb;
begin
 select value into x from cohort_context;
 started:=(x->>'startedOn')::date;
 select * into old_class from public.school_classes where id=(x->>'legacyClassId')::uuid;
 perform pg_temp.cohort_assert(old_class.starts_on is null and old_class.ends_on is null and old_class.validity_source='legacy_unknown'
  and old_class.created_at is null and old_class.updated_at is null,'legacy dates and metadata remain unknown');
 foreach role_name in array array['anon','authenticated','service_role','skolplattform_worker'] loop
  for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_class_cohort_%' loop
   perform pg_temp.cohort_assert(not has_function_privilege(role_name,f.oid,'EXECUTE'),'private helper '||role_name||' '||f.oid);
  end loop;
 end loop;
 perform pg_temp.cohort_assert(public.phase5_class_cohort_date('2028-02-29')='2028-02-29','real leap day');
 perform pg_temp.cohort_assert(public.phase5_class_cohort_date('2027-02-29') is null and public.phase5_class_cohort_date('infinity') is null
  and public.phase5_class_cohort_date('-infinity') is null and public.phase5_class_cohort_date('2027-1-01') is null
  and public.phase5_class_cohort_date('0000-01-01') is null and public.phase5_class_cohort_date('10000-01-01') is null,'invalid dates are not source evidence');
 perform pg_temp.cohort_assert(public.phase5_class_cohort_starts_on((x->>'offeringId')::uuid)=started,'exact start with consistent calendar year');
 r:=public.phase5_class_command(x->'legacyRequest');
 perform pg_temp.cohort_assert(r=((x->'legacyReply')||'{"replayed":true}'::jsonb),'historical receipt replays unchanged');
 perform pg_temp.cohort_assert((select starts_on is null and created_at is null from public.school_classes where id=old_class.id),'replay never backfills class');
 q:=(x->'legacyRequest')||jsonb_build_object('commandId',gen_random_uuid(),'name','NEW-DATED');r:=public.phase5_class_command(q);
 select * into c from public.school_classes where id=(r->>'id')::uuid;new_class:=c.id;
 perform pg_temp.cohort_assert(c.starts_on=started and c.ends_on is null and c.validity_source='education_start'
  and c.created_at is not null and c.updated_at=c.created_at and c.created_at>=transaction_timestamp(),'old create receives real separate metadata and exact validity');
 perform pg_temp.cohort_assert((public.phase5_class_command(q)->>'id')::uuid=c.id,'new create replay retains stable class ID');
 perform pg_temp.cohort_denied(format('update public.school_classes set starts_on=%L where id=%L',started,old_class.id),'40001','class_cohort_start_locked','legacy start cannot be fabricated');
 perform pg_temp.cohort_denied(format('update public.school_classes set created_at=clock_timestamp() where id=%L',old_class.id),'40001','class_cohort_start_locked','legacy registration cannot be fabricated');
 update public.school_classes set name='LEGACY-RENAMED' where id=old_class.id;
 perform pg_temp.cohort_assert((select created_at is null and updated_at is not null from public.school_classes where id=old_class.id),'actual legacy change only stamps updated_at');
 perform pg_temp.cohort_denied(format('update public.offerings set start_year=start_year+1 where id=%L',x->>'offeringId'),'40001','class_cohort_start_locked','calendar year locked');
 perform pg_temp.cohort_denied(format('update public.point_plans set basis_reference=jsonb_set(basis_reference,''{startedOn}'',to_jsonb(%L::text)),revision=revision+1 where id=%L',(started+1)::text,x->>'programId'),'40001','class_cohort_start_locked','same calendar year changed exact start locked');
 perform pg_temp.cohort_denied(format('delete from public.point_plans where id=%L',x->>'programId'),'40001','class_cohort_start_locked','bound source deletion locked');
 select * into draft from public.point_plans where id=(x->>'draftPlanId')::uuid;
 select * into o from public.offerings where id=draft.offering_id;
 perform pg_temp.cohort_actor('hm');
 perform pg_temp.cohort_denied(format('select public.phase5_change_programplan_education(%L,%s,''update'',%L::jsonb)',o.id,o.lifecycle_revision,
  jsonb_build_object('name',o.name,'localCode',o.local_code,'cohort',o.cohort,'startedOn',(started+1)::text)::text),'40001','class_cohort_start_locked','lifecycle start update locked');
 update public.point_plans set basis_reference=basis_reference,revision=revision+1 where id=draft.id;
 perform pg_temp.cohort_assert((select revision=draft.revision+1 from public.point_plans where id=draft.id),'unchanged start permits ordinary revision');
 perform pg_temp.cohort_denied(format('insert into public.point_plans(organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference) select organizer_id,offering_id,version+10,''utkast'',specialization,catalog_id,jsonb_set(basis_reference,''{startedOn}'',to_jsonb(%L::text)) from public.point_plans where id=%L',(started+1)::text,draft.id),'40001','class_cohort_start_locked','new version changed start locked');
 select * into draft from public.point_plans where id=(x->>'programId')::uuid;
 r:=public.phase5_clone_programplan_draft(draft.id,draft.revision,draft.version,null);
 perform pg_temp.cohort_assert(public.phase5_class_cohort_starts_on(draft.offering_id)=started and (r->>'id')::uuid<>draft.id,'new version with same start works');
 perform pg_temp.cohort_denied(format('delete from public.offering_units where offering_id=%L and unit_id=%L',x->>'offeringId',x->>'extraUnitId'),'23503',null,'class blocks removing secondary school');
 for f in select * from public.offerings where id in ((x->>'grundId')::uuid,(x->>'imId')::uuid) loop
  insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year)
   values(old_class.customer_id,old_class.organizer_id,old_class.unit_id,f.id,upper('OTHER-'||f.kind::text),2027) returning * into c;
  perform pg_temp.cohort_assert(c.starts_on is null and c.ends_on is null and c.validity_source='legacy_unknown' and c.created_at is not null,'non-Gy25 create '||f.kind);
 end loop;
 update cohort_context set value=value||jsonb_build_object('newClassId',new_class);
end $$;

-- Bounded validity is a pure predicate/constraint probe: no production endpoint
-- currently edits class ends_on. Actual register writes below use open classes.
create temporary table bounded_class (like public.school_classes including constraints);
do $$declare x jsonb;c public.school_classes;begin
 select value into x from cohort_context;select * into c from public.school_classes where id=(x->>'newClassId')::uuid;
 insert into bounded_class select c.*;
 update bounded_class set ends_on=starts_on;
 perform pg_temp.cohort_assert((select ends_on=starts_on from bounded_class),'inclusive one-day class is valid');
 perform pg_temp.cohort_denied('update bounded_class set ends_on=starts_on-1','23514',null,'class end cannot precede start');
 perform pg_temp.cohort_denied('update bounded_class set starts_on=''infinity''','23514',null,'class date cannot be infinite');
 c.ends_on:=c.starts_on+10;
 perform pg_temp.cohort_assert(public.phase5_class_cohort_membership_fits(c,c.starts_on,c.ends_on),'membership includes both class boundaries');
 perform pg_temp.cohort_assert(not public.phase5_class_cohort_membership_fits(c,c.starts_on-1,c.ends_on),'bounded membership cannot precede start');
 perform pg_temp.cohort_assert(not public.phase5_class_cohort_membership_fits(c,c.starts_on,c.ends_on+1),'bounded membership cannot exceed end');
 perform pg_temp.cohort_assert(not public.phase5_class_cohort_membership_fits(c,c.starts_on,null),'open membership cannot overhang known class end');
end $$;

do $$
declare x jsonb;c public.school_classes;pupil uuid;placement uuid;number text;q jsonb;r jsonb;before_rows jsonb;member uuid;offset_days integer;
begin
 select value into x from cohort_context;select * into c from public.school_classes where id=(x->>'newClassId')::uuid;
 perform pg_temp.cohort_actor('admin');
 for offset_days in -1..1 loop
  pupil:=gen_random_uuid();placement:=gen_random_uuid();
  select personal_number into number from public.synthetic_pupil_numbers n where not exists(select 1 from public.pupils p where p.customer_id=c.customer_id and p.personal_number=n.personal_number) order by personal_number limit 1;
  insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name) values(pupil,c.customer_id,c.organizer_id,'Syntetisk klassperiod',number,'Syntetisk');
  insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on) values(placement,c.customer_id,c.organizer_id,pupil,c.unit_id,c.offering_id,c.starts_on-30);
  q:=jsonb_build_object('pupilId',pupil,'schoolYear',c.start_year,'caseId',null,'expectedVersion',1,'kind','class',
   'payload',jsonb_build_object('placementId',placement,'classId',c.id,'startsOn',c.starts_on+offset_days,'endsOn',null));
  if offset_days=-1 then
   perform pg_temp.cohort_denied(format('select public.phase4_change_pupil(%L::jsonb)',q::text),'22023','class_cohort_membership_period','register class before validity rejected');
   perform pg_temp.cohort_assert((select version=1 from public.pupils where id=pupil) and not exists(select 1 from public.pupil_class_memberships where pupil_id=pupil),'rejected class mutation leaves pupil and membership unchanged');
   q:=jsonb_set(q,'{payload,startsOn}',to_jsonb(c.starts_on));
  end if;
  r:=public.phase4_change_pupil(q);
  perform pg_temp.cohort_assert(r->>'kind'='success','register class at/after start '||offset_days);
  select id into member from public.pupil_class_memberships where pupil_id=pupil;
  perform pg_temp.cohort_denied(format('update public.pupil_class_memberships set starts_on=%L where id=%L',c.starts_on-1,member),'22023','class_cohort_membership_period','direct membership update rejects early date '||offset_days);
  -- Education transfer before/on/after class start retains the future member's
  -- actual period or splits it at an allowed date, never inventing early days.
  q:=jsonb_build_object('pupilId',pupil,'schoolYear',c.start_year,'caseId',null,'expectedVersion',2,'kind','education',
   'payload',jsonb_build_object('placementId',placement,'educationId',x->>'grundId','startsOn',c.starts_on+offset_days));
  r:=public.phase4_change_pupil(q);
  perform pg_temp.cohort_assert(r->>'kind'='success' and not exists(select 1 from public.pupil_class_memberships where pupil_id=pupil and starts_on<c.starts_on),'education transfer preserves valid member dates '||offset_days);
 end loop;
 -- Legacy unknown validity remains permissive for earlier membership.
 insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on)
  values(c.customer_id,c.organizer_id,pupil,c.unit_id,(x->>'legacyClassId')::uuid,placement,c.starts_on-20,c.starts_on-10);
 perform pg_temp.cohort_assert(exists(select 1 from public.pupil_class_memberships where pupil_id=pupil and class_id=(x->>'legacyClassId')::uuid),'legacy class keeps earlier member dates');
end $$;

do $$
declare x jsonb;p public.point_plans;o public.offerings;c public.school_classes;r jsonb;reference jsonb;copy_id uuid;copy_plan uuid;cloned uuid;next_date date;
begin
 select value into x from cohort_context;select * into p from public.point_plans where id=(x->>'programId')::uuid;
 select * into o from public.offerings where id=p.offering_id;select * into c from public.school_classes where id=(x->>'newClassId')::uuid;
 perform pg_temp.cohort_actor('hm');
 next_date:=(p.basis_reference->>'startedOn')::date+interval '1 year';
 reference:=jsonb_set(public.phase5_programplan_upgrade_shape(p.basis_reference),'{startedOn}',to_jsonb(next_date));
 r:=public.phase5_copy_programplan_education(gen_random_uuid(),p.id,p.revision,o.lifecycle_revision,c.unit_id,'Syntetisk nästa kull',null,'Syntetisk nästa',reference,false);
 copy_id:=(r->'education'->>'id')::uuid;copy_plan:=(r->'plan'->>'id')::uuid;
 perform pg_temp.cohort_assert(public.phase5_class_cohort_starts_on(copy_id)=next_date and not exists(select 1 from public.school_classes where offering_id=copy_id)
  and not exists(select 1 from public.pupil_placements where offering_id=copy_id) and not exists(select 1 from public.class_timplans l join public.timplans t on t.id=l.timplan_id where t.offering_id=copy_id),'actual copy changes cohort without old classes pupils or links');
 select * into o from public.offerings where id=copy_id;
 r:=public.phase5_change_programplan_education(o.id,o.lifecycle_revision,'update',jsonb_build_object('name',o.name,'localCode',o.local_code,'cohort',o.cohort,'startedOn',next_date+1));
 perform pg_temp.cohort_assert(public.phase5_class_cohort_starts_on(copy_id)=next_date+1,'start remains editable before first class');
 -- The copied offering initially has both source schools. Narrow only the own
 -- empty copy before the fixture rector (one-school mandate) submits it.
 select * into o from public.offerings where id=copy_id;
 perform public.phase5_change_programplan_education(copy_id,o.lifecycle_revision,'units',jsonb_build_object('unitIds',jsonb_build_array(c.unit_id)));
 perform pg_temp.cohort_actor('principal');perform pg_temp.cohort_decision(copy_plan,'submit');
 perform pg_temp.cohort_actor('hm');perform pg_temp.cohort_decision(copy_plan,'approve');
 select * into p from public.point_plans where id=copy_plan;
 r:=public.phase5_clone_programplan_draft(p.id,p.revision,p.version,null);cloned:=(r->>'id')::uuid;
 update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb(next_date+2)),revision=revision+1 where id=cloned;
 perform pg_temp.cohort_assert(public.phase5_class_cohort_starts_on(copy_id) is null,'conflicting bound exact dates block source');
 perform pg_temp.cohort_denied(format('insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(%L,%L,%L,%L,''CONFLICT'',%s)',c.customer_id,c.organizer_id,c.unit_id,copy_id,extract(year from next_date)::integer),'40001','class_cohort_source_invalid','ambiguous source blocks new class');
 -- No class exists, so repair the conflicting draft to the original date.
 update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb(next_date+1)),revision=revision+1 where id=cloned;
 perform pg_temp.cohort_assert(public.phase5_class_cohort_starts_on(copy_id)=next_date+1,'repair before first class restores source');
 update public.offerings set start_year=null where id=copy_id;
 perform pg_temp.cohort_assert(public.phase5_class_cohort_starts_on(copy_id) is null and public.phase5_class_cohort_source_date(copy_id)=next_date+1,'unknown calendar metadata blocks new class without losing exact source');
 perform pg_temp.cohort_denied(format('insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(%L,%L,%L,%L,''UNKNOWN'',%s)',c.customer_id,c.organizer_id,c.unit_id,copy_id,extract(year from next_date)::integer),'40001','class_cohort_source_invalid','missing calendar metadata blocks new class');
 perform pg_temp.cohort_denied(format('update public.point_plans set basis_reference=jsonb_set(basis_reference,''{catalogId}'',''"invalid"''::jsonb),revision=revision+1 where id=%L',x->>'draftPlanId'),'40001','class_cohort_start_locked','bound source identity cannot be invalidated');
 select * into p from public.point_plans where id=(x->>'nullCalendarPlanId')::uuid;
 r:=public.phase5_clone_programplan_draft(p.id,p.revision,p.version,null);
 perform pg_temp.cohort_assert((r->>'id')::uuid<>p.id and public.phase5_class_cohort_source_date(p.offering_id)=(p.basis_reference->>'startedOn')::date
  and public.phase5_class_cohort_starts_on(p.offering_id) is null,'legacy null calendar permits same-date new version without fabricating dates');
 perform pg_temp.cohort_assert((select bool_and(starts_on is null and created_at is null) from public.school_classes where offering_id=p.offering_id),'null-calendar legacy class unchanged by new version');
end $$;

