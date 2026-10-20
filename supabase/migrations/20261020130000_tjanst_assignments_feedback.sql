-- 05.1-08: specialuppdrag, samläsning, lärarens återkoppling och huvudmannens bemanning (etapp 1).
-- Ovanpå 20261020120000: nya tabeller, ny tolkning och dispatcher i tjanst_plan_command, nya läsfunktioner. Hjälpfunktionerna
-- för befintliga åtgärder (create_draft, add_teacher, save_row, delete_row, publish) ändras inte.
-- SS 12000 (avsedd kompatibilitet): mentor med klass ↔ Duty.assignmentRole (Mentor + group); programansvar, speciallärare
-- utan grupp och annat får ingen grupp och ingen Activity; samläsning ↔ en Activity med flera groups och teachers[] en gång.

-- 1. Tabeller.
create table public.tjanst_special_assignments (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.tjanst_versions(id),
 lineage_id uuid not null,
 kind text not null check(kind in ('mentor','programansvar','speciallarare','annat')),
 label text not null check(char_length(label) between 1 and 200),
 staff_person_id uuid references public.staff_people(id),
 class_id uuid references public.school_classes(id),
 ht_minutes integer not null check(ht_minutes between 0 and 200000),
 vt_minutes integer not null check(vt_minutes between 0 and 200000),
 comment text not null default '' check(char_length(comment)<=2000),
 -- TJANST-02: ingen påhittad grupp; bara mentor kan ha en klass.
 check(class_id is null or kind='mentor'),
 check(ht_minutes+vt_minutes>0)
);
create unique index tjanst_special_lineage on public.tjanst_special_assignments(version_id,lineage_id);
create table public.tjanst_joint_groups (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.tjanst_versions(id),
 lineage_id uuid not null,
 name text not null check(char_length(name) between 1 and 200)
);
create unique index tjanst_joint_lineage on public.tjanst_joint_groups(version_id,lineage_id);
create table public.tjanst_joint_members (
 group_id uuid not null references public.tjanst_joint_groups(id),
 row_id uuid not null unique references public.tjanst_rows(id),
 primary key(group_id,row_id)
);
create table public.tjanst_joint_teacher_time (
 group_id uuid not null references public.tjanst_joint_groups(id),
 staff_person_id uuid not null references public.staff_people(id),
 ht_minutes integer not null check(ht_minutes between 0 and 200000),
 vt_minutes integer not null check(vt_minutes between 0 and 200000),
 primary key(group_id,staff_person_id),
 check(ht_minutes+vt_minutes>0)
);
-- Kvittens och kommentar: oföränderliga; högst en kvittens per version och person. Kvittens betyder inte acceptans.
create table public.tjanst_feedback (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.tjanst_versions(id),
 staff_person_id uuid not null references public.staff_people(id),
 kind text not null check(kind in ('ack','comment')),
 body text check(body is null or char_length(body) between 1 and 2000),
 actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),
 created_at timestamptz not null default clock_timestamp(),
 check((kind='comment')=(body is not null))
);
create unique index tjanst_feedback_one_ack on public.tjanst_feedback(version_id,staff_person_id) where kind='ack';

do $$declare n text;begin
 foreach n in array array['tjanst_special_assignments','tjanst_joint_groups','tjanst_joint_members','tjanst_joint_teacher_time','tjanst_feedback'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('alter table public.%I force row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);
 end loop;
end $$;

-- Specialuppdrag och samläsningsgrupper ändras bara i utkast (samma regel som raderna).
create trigger tjanst_special_guard before insert or update or delete on public.tjanst_special_assignments for each row execute function public.tjanst_version_guard();
create trigger tjanst_special_no_truncate before truncate on public.tjanst_special_assignments for each statement execute function public.tjanst_version_guard();
create trigger tjanst_joint_groups_guard before insert or update or delete on public.tjanst_joint_groups for each row execute function public.tjanst_version_guard();
create trigger tjanst_joint_groups_no_truncate before truncate on public.tjanst_joint_groups for each statement execute function public.tjanst_version_guard();
create function public.tjanst_joint_child_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_status text;
begin
 if tg_op='TRUNCATE' then raise exception 'Tjänstefördelningens versioner får inte tömmas.' using errcode='42501';end if;
 select v.status into v_status from public.tjanst_joint_groups g join public.tjanst_versions v on v.id=g.version_id
 where g.id=case when tg_op='DELETE' then old.group_id else new.group_id end;
 if v_status is distinct from 'draft' or (tg_op='UPDATE' and old.group_id<>new.group_id) then raise exception 'Bara ett utkast kan ändras.' using errcode='42501';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger tjanst_joint_members_guard before insert or update or delete on public.tjanst_joint_members for each row execute function public.tjanst_joint_child_guard();
create trigger tjanst_joint_members_no_truncate before truncate on public.tjanst_joint_members for each statement execute function public.tjanst_joint_child_guard();
create trigger tjanst_joint_time_guard before insert or update or delete on public.tjanst_joint_teacher_time for each row execute function public.tjanst_joint_child_guard();
create trigger tjanst_joint_time_no_truncate before truncate on public.tjanst_joint_teacher_time for each statement execute function public.tjanst_joint_child_guard();
create function public.tjanst_feedback_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin raise exception 'Lärarens återkoppling är oföränderlig.' using errcode='42501';end $$;
create trigger tjanst_feedback_immutable before update or delete on public.tjanst_feedback for each row execute function public.tjanst_feedback_guard();
create trigger tjanst_feedback_no_truncate before truncate on public.tjanst_feedback for each statement execute function public.tjanst_feedback_guard();

-- 2. Audit med egen-vägens kommandon och bemanningen tillagda.
create or replace function public.tjanst_audit(operation text,object_type text,object_id uuid,details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if operation is null or operation not in ('tjanst_personal_read','tjanst_personal_status_read','tjanst_person_created','tjanst_person_updated',
   'tjanst_draft_teacher_created','tjanst_employment_saved','tjanst_duties_saved',
   'tjanst_plan_read','tjanst_plan_command','tjanst_plan_published','tjanst_plan_status_read','tjanst_self_read',
   'tjanst_self_command','tjanst_self_status_read','tjanst_staffing_read')
  or object_type is null or object_type not in ('staff_person','tjanst_command','tjanst_distribution','tjanst_version','organizer')
  or not coalesce(public.tjanst_audit_details(details),false) then
  raise exception 'Invalid service allocation audit' using errcode='22023',hint='tjanst_invalid';end if;
 a:=public.phase3_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,object_type,object_id,'ok',details);
 exception when others then raise exception 'Service allocation audit unavailable' using errcode='55000';end;
end $$;

-- 3. Innehållshashen omfattar också specialuppdrag och samläsningar.
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
    order by g.lineage_id) from public.tjanst_joint_groups g where g.version_id=v.id),'[]'::jsonb)))
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id where v.id=version
$$;

-- 4. Tolkning med specialuppdrag och samläsning (speglar parsePlanCommand i web/lib/tjanst-contract.ts).
create or replace function public.tjanst_plan_parse(input jsonb) returns jsonb
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

-- 5. Nya åtgärder.
create function public.tjanst_plan_copy_extras(source_version uuid,target_version uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare g public.tjanst_joint_groups;new_group uuid;
begin
 if source_version is null then return;end if;
 insert into public.tjanst_special_assignments(version_id,lineage_id,kind,label,staff_person_id,class_id,ht_minutes,vt_minutes,comment)
 select target_version,s.lineage_id,s.kind,s.label,s.staff_person_id,s.class_id,s.ht_minutes,s.vt_minutes,s.comment from public.tjanst_special_assignments s where s.version_id=source_version;
 for g in select * from public.tjanst_joint_groups x where x.version_id=source_version loop
  insert into public.tjanst_joint_groups(version_id,lineage_id,name) values(target_version,g.lineage_id,g.name) returning id into new_group;
  -- Medlemmarna följer raderna via lineage_id till den nya versionens rader.
  insert into public.tjanst_joint_members(group_id,row_id)
  select new_group,nr.id from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id
   join public.tjanst_rows nr on nr.version_id=target_version and nr.lineage_id=r.lineage_id where m.group_id=g.id;
  insert into public.tjanst_joint_teacher_time(group_id,staff_person_id,ht_minutes,vt_minutes)
  select new_group,t.staff_person_id,t.ht_minutes,t.vt_minutes from public.tjanst_joint_teacher_time t where t.group_id=g.id;
 end loop;
end $$;
create function public.tjanst_plan_save_special(a public.access_assignments,d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);person uuid:=(p->>'personId')::uuid;klass uuid:=(p->>'classId')::uuid;saved uuid;
begin
 if person is not null then
  if not public.tjanst_person_at_school(a,person,d.unit_id,d.school_year) then raise exception 'Person not at school' using errcode='22023',hint='tjanst_person_not_at_school';end if;
  insert into public.tjanst_version_teachers(version_id,staff_person_id) values(v.id,person) on conflict do nothing;
 end if;
 if klass is not null and not exists(select 1 from public.school_classes c where c.id=klass and c.unit_id=d.unit_id and c.customer_id=a.customer_id
   and public.phase5_class_cohort_year_fits(c,d.school_year)) then raise exception 'Class not at school' using errcode='22023',hint='tjanst_invalid';end if;
 if p->'specialId'='null'::jsonb then
  insert into public.tjanst_special_assignments(version_id,lineage_id,kind,label,staff_person_id,class_id,ht_minutes,vt_minutes,comment)
  values(v.id,gen_random_uuid(),p->>'kind',p->>'label',person,klass,(p->>'ht')::integer,(p->>'vt')::integer,p->>'comment') returning id into saved;
 else
  update public.tjanst_special_assignments set kind=p->>'kind',label=p->>'label',staff_person_id=person,class_id=klass,ht_minutes=(p->>'ht')::integer,
   vt_minutes=(p->>'vt')::integer,comment=p->>'comment' where id=(p->>'specialId')::uuid and version_id=v.id returning id into saved;
  if saved is null then raise exception 'Unknown special assignment' using errcode='22023',hint='tjanst_invalid';end if;
 end if;
 return v.id;
end $$;
create function public.tjanst_plan_delete_special(d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);deleted uuid;
begin
 delete from public.tjanst_special_assignments where id=(p->>'specialId')::uuid and version_id=v.id returning id into deleted;
 if deleted is null then raise exception 'Unknown special assignment' using errcode='22023',hint='tjanst_invalid';end if;
 return v.id;
end $$;
-- D-16: minst två rader i minst två klasser; en rad i högst en grupp; lärartid bara för lärare bland radernas lärare.
create function public.tjanst_plan_save_joint(d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);g public.tjanst_joint_groups;ids uuid[];
begin
 ids:=array(select (x.value#>>'{}')::uuid from jsonb_array_elements(p->'rowIds') x);
 if (select count(*) from public.tjanst_rows r where r.version_id=v.id and r.id=any(ids))<>cardinality(ids) then raise exception 'Unknown row' using errcode='22023',hint='tjanst_invalid';end if;
 if (select count(distinct r.class_id) from public.tjanst_rows r where r.id=any(ids))<2 then raise exception 'Too few classes' using errcode='22023',hint='tjanst_joint_too_few';end if;
 if p->'jointId'<>'null'::jsonb then
  select * into g from public.tjanst_joint_groups x where x.id=(p->>'jointId')::uuid and x.version_id=v.id;
  if not found then raise exception 'Unknown joint group' using errcode='22023',hint='tjanst_invalid';end if;
 end if;
 if exists(select 1 from public.tjanst_joint_members m where m.row_id=any(ids) and m.group_id is distinct from g.id) then
  raise exception 'Row already joint' using errcode='22023',hint='tjanst_joint_already';end if;
 if exists(select 1 from jsonb_array_elements(p->'teachers') t where not exists(select 1 from public.tjanst_rows r where r.id=any(ids)
   and r.staff_person_id=(t.value->>'personId')::uuid)) then raise exception 'Teacher not on joint rows' using errcode='22023',hint='tjanst_invalid';end if;
 if g.id is null then insert into public.tjanst_joint_groups(version_id,lineage_id,name) values(v.id,gen_random_uuid(),p->>'name') returning * into g;
 else
  update public.tjanst_joint_groups set name=p->>'name' where id=g.id;
  delete from public.tjanst_joint_members where group_id=g.id;delete from public.tjanst_joint_teacher_time where group_id=g.id;
 end if;
 insert into public.tjanst_joint_members(group_id,row_id) select g.id,unnest(ids);
 insert into public.tjanst_joint_teacher_time(group_id,staff_person_id,ht_minutes,vt_minutes)
 select g.id,(t.value->>'personId')::uuid,(t.value->>'ht')::integer,(t.value->>'vt')::integer from jsonb_array_elements(p->'teachers') t;
 return v.id;
end $$;
-- Upplösning behåller raderna och deras egen tid.
create function public.tjanst_plan_dissolve_joint(d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);g uuid;
begin
 select x.id into g from public.tjanst_joint_groups x where x.id=(p->>'jointId')::uuid and x.version_id=v.id;
 if g is null then raise exception 'Unknown joint group' using errcode='22023',hint='tjanst_invalid';end if;
 delete from public.tjanst_joint_members where group_id=g;delete from public.tjanst_joint_teacher_time where group_id=g;delete from public.tjanst_joint_groups where id=g;
 return v.id;
end $$;

-- 6. Läsning: specialuppdrag, samläsning (rader bär jointGroupId) och, för rektor och administratör, återkoppling för
-- den publicerade versionen. Lärarkolumner omfattar också personer i specialuppdrag och samläsning.
create function public.tjanst_feedback_json(version uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('versionNo',v.version_no,
  'teachers',coalesce((select jsonb_agg(jsonb_build_object('personId',p.id,'name',left(p.given_name||' '||p.family_name,200),
    'acknowledgedAt',(select to_char(f.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from public.tjanst_feedback f where f.version_id=v.id and f.staff_person_id=p.id and f.kind='ack'))
    order by p.family_name collate "C",p.given_name collate "C",p.id) from public.staff_people p where p.id in (
     select r.staff_person_id from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id is not null
     union select s.staff_person_id from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id is not null)),'[]'::jsonb),
  'comments',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'personId',f.staff_person_id,'name',left(p.given_name||' '||p.family_name,200),
    'at',to_char(f.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'body',f.body) order by f.created_at,f.id)
   from public.tjanst_feedback f join public.staff_people p on p.id=f.staff_person_id where f.version_id=v.id and f.kind='comment'),'[]'::jsonb))
 from public.tjanst_versions v where v.id=version
$$;
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
 if not history and coalesce(v.status='draft',false) and exists(select 1 from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id is not null
   and not public.tjanst_person_at_school(a,s.staff_person_id,unit,school_year)) and not blockers @> '[{"code":"person_not_at_school"}]'::jsonb then
  blockers:=blockers||jsonb_build_array(jsonb_build_object('code','person_not_at_school','message','En lärare saknar giltigt skoluppdrag på skolan för läsåret.'));end if;
 editing:=not history and a.function in ('rektor','administrator');
 if editing and coalesce(v.status='draft',false) then actions:=array['add_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','discard_draft'];
  if a.function='rektor' and jsonb_array_length(blockers)=0 then actions:=actions||'publish'::text;end if;
 elsif editing then actions:=array['create_draft'];end if;
 result:=jsonb_build_object('contractVersion','tjanst_v1','unitId',unit,'schoolName',(select u.name from public.school_units u where u.id=unit),
  'schoolYear',school_year,'revision',coalesce(d.revision,0),'version',case when v.id is null then null else public.tjanst_version_json(v) end,
  'versions',versions,'teachers',teachers,
  'classes',(select coalesce(jsonb_agg(c.value-'needs'||jsonb_build_object('needs',(select coalesce(jsonb_agg(x.value-'classId'-'link'),'[]'::jsonb)
    from jsonb_array_elements(c.value->'needs') x))),'[]'::jsonb) from jsonb_array_elements(needs) c),
  'rows',rows,'specials',specials,'joints',joints,'actions',to_jsonb(actions),'blockers',blockers,
  'capabilities',jsonb_build_object('canEdit',editing and coalesce(v.status='draft',false),
   'canPublish',editing and coalesce(v.status='draft',false) and a.function='rektor' and jsonb_array_length(blockers)=0,'canReadHistory',true));
 -- Återkoppling (TJANST-05): bara för rektor och administratör och bara för den aktuella publicerade versionen.
 select * into published from public.tjanst_versions x where x.distribution_id=d.id and x.status='published';
 if not history and published.id is not null and a.function in ('rektor','administrator') then result:=result||jsonb_build_object('feedback',public.tjanst_feedback_json(published.id));end if;
 return result;
end $$;

-- 7. Ny dispatcher.
create or replace function public.tjanst_plan_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;request_id uuid;action_name text;unit uuid;year integer;a public.access_assignments;s public.app_sessions;r public.tjanst_commands;
 d public.tjanst_distributions;version uuid;target jsonb;detail jsonb;receipt jsonb;envelope jsonb;discarded uuid;
begin
 q:=public.tjanst_plan_parse(input);request_id:=(q->>'commandId')::uuid;action_name:=q->>'action';unit:=(q->>'unitId')::uuid;year:=(q->>'schoolYear')::integer;
 a:=public.tjanst_actor('plan');s:=public.phase5_programplan_session_check();
 if a.function not in ('rektor','administrator') or (action_name='publish' and a.function<>'rektor') then raise exception 'Service allocation command denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);
 if public.tjanst_hash(jsonb_build_array('tjanst_payload_v1',action_name,input->'payload'))<>q->>'payloadHash' then
  raise exception 'Payload hash mismatch' using errcode='22023',hint='tjanst_payload_hash';end if;
 target:=jsonb_build_object('unitId',unit,'schoolYear',year,'versionId',null,'personId',null);
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5561));
 select * into r from public.tjanst_commands where command_id=request_id;
 if found then
  if (r.family,r.action,r.customer_id,r.organizer_id,r.actor_identity_id,r.assignment_id,r.target,r.request)
    is distinct from ('plan',action_name,a.customer_id,a.organizer_id,s.identity_id,a.id,target,q) then
   raise exception 'Service allocation command changed' using errcode='40001',hint='tjanst_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 insert into public.tjanst_distributions(customer_id,organizer_id,unit_id,school_year) values(a.customer_id,a.organizer_id,unit,year) on conflict(unit_id,school_year) do nothing;
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=year for update;
 if d.customer_id<>a.customer_id or d.organizer_id<>a.organizer_id then raise exception 'Service allocation denied' using errcode='42501';end if;
 if d.revision<>(q->>'expectedRevision')::integer then raise exception 'Service allocation revision conflict' using errcode='40001',hint='tjanst_revision_conflict';end if;
 if action_name='create_draft' then
  version:=public.tjanst_plan_create_draft(a,s,d,q->'payload');
  perform public.tjanst_plan_copy_extras((select v.based_on_version_id from public.tjanst_versions v where v.id=version),version);
 elsif action_name='add_teacher' then version:=public.tjanst_plan_add_teacher(a,d,q->'payload');
 elsif action_name='save_row' then version:=public.tjanst_plan_save_row(a,d,q->'payload');
 elsif action_name='delete_row' then
  -- En rad i en samläsning lämnar gruppen först; gruppen måste därefter fortfarande uppfylla regeln.
  if exists(select 1 from public.tjanst_joint_members m where m.row_id=(q->'payload'->>'rowId')::uuid) then
   raise exception 'Row is joint' using errcode='22023',hint='tjanst_joint_already';end if;
  version:=public.tjanst_plan_delete_row(d,q->'payload');
 elsif action_name='save_special' then version:=public.tjanst_plan_save_special(a,d,q->'payload');
 elsif action_name='delete_special' then version:=public.tjanst_plan_delete_special(d,q->'payload');
 elsif action_name='save_joint' then version:=public.tjanst_plan_save_joint(d,q->'payload');
 elsif action_name='dissolve_joint' then version:=public.tjanst_plan_dissolve_joint(d,q->'payload');
 elsif action_name='discard_draft' then
  version:=(public.tjanst_current_draft(d)).id;update public.tjanst_versions set status='discarded' where id=version;discarded:=version;
 else version:=public.tjanst_plan_publish(a,s,d,q);
 end if;
 update public.tjanst_distributions set revision=revision+1 where id=d.id returning * into d;
 detail:=public.tjanst_plan_projection(a,unit,year,null);
 receipt:=jsonb_build_object('commandId',request_id,'action',action_name,'versionId',version,'revision',d.revision,
  'contentHash',coalesce((select v.content_hash from public.tjanst_versions v where v.id=version),public.tjanst_version_hash(version)),'replayed',false,'changed',true);
 envelope:=jsonb_build_object('contractVersion','tjanst_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),
  'result',jsonb_build_object('receipt',receipt,'detail',detail));
 insert into public.tjanst_commands(command_id,family,action,customer_id,organizer_id,target,actor_identity_id,assignment_id,request,envelope)
 values(request_id,'plan',action_name,a.customer_id,a.organizer_id,target,s.identity_id,a.id,q,envelope);
 perform public.tjanst_audit(case when action_name='publish' then 'tjanst_plan_published' else 'tjanst_plan_command' end,'tjanst_version',version,
  jsonb_build_object('commandId',request_id,'action',action_name,'revision',d.revision,'unitId',unit,'schoolYear',year,'discarded',discarded is not null));
 return envelope;
end $$;

-- Personen nås via den aktiva bindningen för sessionens medlemskap, och bindningens self-mandat ska fortfarande gälla.
-- En lärare som också har ett gruppmandat läser därför samma egen vy utan att byta uppdrag; utan giltigt self-mandat nekas läsningen.
create or replace function public.tjanst_self_person(a public.access_assignments) returns public.staff_people
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.staff_people;
begin
 if a.function is distinct from 'larare' then raise exception 'Own service denied' using errcode='42501';end if;
 select x.* into p from public.staff_person_bindings b join public.staff_people x on x.id=b.staff_person_id
 where b.membership_id=a.membership_id and b.organizer_id=a.organizer_id and b.customer_id=a.customer_id and b.ended_at is null
  and public.phase3_mandate_is_valid(b.access_assignment_id)
  and exists(select 1 from public.access_assignments m where m.id=b.access_assignment_id and m.scope_kind='self' and m.membership_id=a.membership_id);
 if not found then raise exception 'Own service denied' using errcode='42501';end if;
 return p;
end $$;

-- 8. Lärarens egen väg: specialuppdrag, samläsning (kollegors namn bara inom egen grupp), kvittens och egna kommentarer.
create or replace function public.tjanst_self_projection(a public.access_assignments) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.staff_people:=public.tjanst_self_person(a);publications jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('versionId',v.id,'versionNo',v.version_no,'unitId',d.unit_id,
   'schoolName',(select u.name from public.school_units u where u.id=d.unit_id),'schoolYear',d.school_year,
   'publishedAt',to_char(v.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'contentHash',v.content_hash,
   'rows',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'className',c.name,'rowKey',r.timplan_row_key,'label',r.need_label,
     'ht',r.teacher_ht_minutes,'vt',r.teacher_vt_minutes,
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
  and exists(select 1 from public.mandate_units m join public.staff_person_bindings b on b.access_assignment_id=m.assignment_id
   where b.staff_person_id=p.id and b.membership_id=a.membership_id and b.ended_at is null and m.unit_id=d.unit_id)
  and (exists(select 1 from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_version_teachers t where t.version_id=v.id and t.staff_person_id=p.id));
 return jsonb_build_object('contractVersion','tjanst_v1','person',jsonb_build_object('id',p.id,'displayName',left(p.given_name||' '||p.family_name,200)),
  'publications',publications,'capabilities',jsonb_build_object('canAck',true,'canComment',true));
end $$;

create function public.tjanst_self_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;r public.tjanst_commands;p public.staff_people;request_id uuid;action_name text;version uuid;
 q jsonb;target jsonb;feedback uuid;receipt jsonb;envelope jsonb;
begin
 if jsonb_typeof(input) is distinct from 'object' or jsonb_typeof(input->'action') is distinct from 'string' or input->>'action' not in ('ack','comment')
  or not public.phase5_programplan_shape(input,array['commandId','versionId','action']||case when input->>'action'='comment' then array['body'] else '{}'::text[] end) then
  raise exception 'Invalid own service command' using errcode='22023',hint='tjanst_invalid';end if;
 if input->>'action'='comment' and not public.phase5_apl_text(input->'body',2000,false) then
  raise exception 'Invalid comment' using errcode='22023',hint=case when jsonb_typeof(input->'body')='string' and char_length(input->>'body')>2000 then 'tjanst_comment_too_long' else 'tjanst_invalid' end;end if;
 request_id:=public.tjanst_uuid(input->'commandId');version:=public.tjanst_uuid(input->'versionId');action_name:=input->>'action';
 q:=jsonb_build_object('commandId',request_id,'versionId',version,'action',action_name)||case when action_name='comment' then jsonb_build_object('body',input->'body') else '{}'::jsonb end;
 a:=public.tjanst_actor('self');s:=public.phase5_programplan_session_check();p:=public.tjanst_self_person(a);
 target:=jsonb_build_object('unitId',null,'schoolYear',null,'versionId',version,'personId',null);
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5571));
 select * into r from public.tjanst_commands where command_id=request_id;
 if found then
  if (r.family,r.action,r.customer_id,r.organizer_id,r.actor_identity_id,r.assignment_id,r.target,r.request)
    is distinct from ('self',action_name,a.customer_id,a.organizer_id,s.identity_id,a.id,target,q) then
   raise exception 'Own service command changed' using errcode='40001',hint='tjanst_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 -- Bara en publicerad version där personen har rader eller uppdrag, på en skola i mandatet.
 if not exists(select 1 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id
   where v.id=version and v.status='published' and d.customer_id=a.customer_id and d.organizer_id=a.organizer_id
    and exists(select 1 from public.mandate_units m join public.staff_person_bindings b on b.access_assignment_id=m.assignment_id
     where b.staff_person_id=p.id and b.membership_id=a.membership_id and b.ended_at is null and m.unit_id=d.unit_id)
    and (exists(select 1 from public.tjanst_rows x where x.version_id=v.id and x.staff_person_id=p.id)
     or exists(select 1 from public.tjanst_special_assignments x where x.version_id=v.id and x.staff_person_id=p.id))) then
  raise exception 'Own service denied' using errcode='42501';end if;
 if action_name='ack' then
  -- Kvittens en gång per version: en ny kvittens ger samma kvitto som den första.
  select f.id into feedback from public.tjanst_feedback f where f.version_id=version and f.staff_person_id=p.id and f.kind='ack';
  if feedback is null then
   insert into public.tjanst_feedback(version_id,staff_person_id,kind,body,actor_identity_id,assignment_id) values(version,p.id,'ack',null,s.identity_id,a.id) returning id into feedback;end if;
 else
  insert into public.tjanst_feedback(version_id,staff_person_id,kind,body,actor_identity_id,assignment_id) values(version,p.id,'comment',input->>'body',s.identity_id,a.id) returning id into feedback;
 end if;
 receipt:=jsonb_build_object('commandId',request_id,'action',action_name,'versionId',version,'feedbackId',feedback,'replayed',false);
 envelope:=jsonb_build_object('contractVersion','tjanst_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),
  'result',jsonb_build_object('receipt',receipt,'detail',public.tjanst_self_projection(a)));
 insert into public.tjanst_commands(command_id,family,action,customer_id,organizer_id,target,actor_identity_id,assignment_id,request,envelope)
 values(request_id,'self',action_name,a.customer_id,a.organizer_id,target,s.identity_id,a.id,q,envelope);
 -- Audit bär bara referenser; kommentarstexten skrivs aldrig i security_events (T-05.1-30).
 perform public.tjanst_audit('tjanst_self_command','tjanst_version',version,jsonb_build_object('commandId',request_id,'action',action_name,'feedbackId',feedback));
 return envelope;
end $$;
create function public.tjanst_self_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare ref jsonb;a public.access_assignments;s public.app_sessions;r public.tjanst_commands;result jsonb;
begin
 ref:=public.tjanst_command_ref(input,'self');
 if ref->'target'->>'versionId' is null or ref->'target'->>'personId' is not null then raise exception 'Invalid own service status request' using errcode='22023',hint='tjanst_invalid';end if;
 a:=public.tjanst_actor('self');s:=public.phase5_programplan_session_check();perform public.tjanst_self_person(a);
 perform pg_advisory_xact_lock(hashtextextended(ref->>'commandId',5571));
 select * into r from public.tjanst_commands where command_id=(ref->>'commandId')::uuid;
 if not found then result:=jsonb_build_object('state','not_found','result',null);
 else
  if (r.family,r.action,r.target,r.customer_id,r.organizer_id,r.actor_identity_id,r.assignment_id)
    is distinct from ('self',ref->>'action',ref->'target',a.customer_id,a.organizer_id,s.identity_id,a.id) then
   raise exception 'Own service command changed' using errcode='40001',hint='tjanst_command_conflict';end if;
  result:=jsonb_build_object('state','completed','result',jsonb_set(r.envelope->'result','{receipt,replayed}','true'::jsonb,false));
 end if;
 perform public.tjanst_audit('tjanst_self_status_read','tjanst_command',(ref->>'commandId')::uuid,jsonb_build_object('action',ref->>'action'));
 return jsonb_build_object('contractVersion','tjanst_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),'result',result);
end $$;

-- 9. Huvudmannens bemanning (TJANST-04, D-01): bara läsning, bara huvudman, per skola i mandatet med publicerad version.
-- Samma regler som tjanst-model.schoolSums: samläst tid en gång, vakant skild, ej fördelad tid bara på kopplade klasser med känt behov.
create function public.tjanst_school_sums(version uuid,unit uuid,school_year integer) returns jsonb
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
  select cov_ht+coalesce(sum(t.ht_minutes),0),cov_vt+coalesce(sum(t.vt_minutes),0) into cov_ht,cov_vt from public.tjanst_joint_teacher_time t
  where t.group_id in (select distinct m.group_id from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where r.version_id=version and r.source_key=n->>'sourceKey');
  if n->'needHt'<>'null'::jsonb then un_ht:=un_ht+greatest(0,(n->>'needHt')::bigint-cov_ht);end if;
  if n->'needVt'<>'null'::jsonb then un_vt:=un_vt+greatest(0,(n->>'needVt')::bigint-cov_vt);end if;
 end loop;
 return jsonb_build_object('teaching',jsonb_build_object('ht',teaching_ht,'vt',teaching_vt),'special',jsonb_build_object('ht',special_ht,'vt',special_vt),
  'vacant',jsonb_build_object('ht',vacant_ht,'vt',vacant_vt),'unallocated',jsonb_build_object('ht',un_ht,'vt',un_vt),
  'unlinkedClasses',(select count(*) from jsonb_array_elements(needs) c where c.value->'link'='null'::jsonb));
end $$;
create function public.tjanst_staffing_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;year integer;units jsonb;vacancies jsonb;
begin
 if not public.phase5_programplan_shape(input,array['schoolYear']) or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) then
  raise exception 'Invalid staffing read' using errcode='22023',hint='tjanst_invalid';end if;
 year:=(input->>'schoolYear')::integer;
 a:=public.tjanst_actor('plan');
 if a.function<>'huvudman' then raise exception 'Staffing denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('unitId',u.id,'schoolName',u.name,
   'published',case when v.id is null then null else jsonb_build_object('versionId',v.id,'versionNo',v.version_no,
     'publishedAt',to_char(v.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) end,
   'sums',case when v.id is null then null else public.tjanst_school_sums(v.id,u.id,year) end) order by u.name collate "C",u.id),'[]'::jsonb) into units
 from public.mandate_units m join public.school_units u on u.id=m.unit_id and u.organizer_id=a.organizer_id
 left join public.tjanst_distributions d on d.unit_id=u.id and d.school_year=year
 left join public.tjanst_versions v on v.distribution_id=d.id and v.status='published'
 where m.assignment_id=a.id;
 select coalesce(jsonb_agg(x.item order by x.item->>'unitId',x.item->>'label',x.item->>'id'),'[]'::jsonb) into vacancies from (
  select jsonb_build_object('unitId',d.unit_id,'kind','row','id',r.id,'label',(select c.name from public.school_classes c where c.id=r.class_id)||' · '||r.need_label,
   'ht',r.teacher_ht_minutes,'vt',r.teacher_vt_minutes) item
  from public.tjanst_rows r join public.tjanst_versions v on v.id=r.version_id and v.status='published' join public.tjanst_distributions d on d.id=v.distribution_id
  where d.school_year=year and r.staff_person_id is null and d.unit_id in (select m.unit_id from public.mandate_units m where m.assignment_id=a.id)
   and d.organizer_id=a.organizer_id
  union all
  select jsonb_build_object('unitId',d.unit_id,'kind','special','id',s.id,'label',s.label,'ht',s.ht_minutes,'vt',s.vt_minutes)
  from public.tjanst_special_assignments s join public.tjanst_versions v on v.id=s.version_id and v.status='published' join public.tjanst_distributions d on d.id=v.distribution_id
  where d.school_year=year and s.staff_person_id is null and d.unit_id in (select m.unit_id from public.mandate_units m where m.assignment_id=a.id)
   and d.organizer_id=a.organizer_id) x;
 perform public.tjanst_audit('tjanst_staffing_read','organizer',a.organizer_id,jsonb_build_object('schoolYear',year));
 return jsonb_build_object('contractVersion','tjanst_v1','schoolYear',year,'units',units,'vacancies',vacancies);
end $$;

revoke all on function public.tjanst_joint_child_guard(),public.tjanst_feedback_guard(),public.tjanst_audit(text,text,uuid,jsonb),public.tjanst_version_hash(uuid),
 public.tjanst_plan_parse(jsonb),public.tjanst_plan_copy_extras(uuid,uuid),public.tjanst_plan_save_special(public.access_assignments,public.tjanst_distributions,jsonb),
 public.tjanst_plan_delete_special(public.tjanst_distributions,jsonb),public.tjanst_plan_save_joint(public.tjanst_distributions,jsonb),
 public.tjanst_plan_dissolve_joint(public.tjanst_distributions,jsonb),public.tjanst_feedback_json(uuid),
 public.tjanst_plan_projection(public.access_assignments,uuid,integer,uuid),public.tjanst_plan_command(jsonb),public.tjanst_self_projection(public.access_assignments),
 public.tjanst_self_person(public.access_assignments),
 public.tjanst_self_command(jsonb),public.tjanst_self_status(jsonb),public.tjanst_school_sums(uuid,uuid,integer),public.tjanst_staffing_read(jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;
