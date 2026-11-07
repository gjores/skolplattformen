-- VP-12. Klasser väljs i blocket (F-04, F-05). En rad får delas av flera block, men en klass på raden finns i högst ett.
-- Blocket sparar urkryssade klasser, så en klass som kopplas senare ingår tills någon kryssar ur den. Befintliga block får
-- inga urkryssade klasser och behåller därmed sina klasser. Lokal planering: inga objekt i SS 12000 ändras. Klass är
-- fortsatt Group av typen Klass och undervisningsgrupp Group av typen Undervisning. Behörigheter följer med create or replace.
alter table public.valplan_rows drop constraint valplan_rows_unit_id_school_year_timplan_id_row_key_year_key;
create index valplan_rows_row_idx on public.valplan_rows(unit_id,school_year,timplan_id,row_key,year);
create table public.valplan_row_excluded_classes (
 valplan_id uuid not null, timplan_id uuid not null, row_key text not null, year smallint not null,
 class_id uuid not null references public.school_classes(id),
 primary key(valplan_id,timplan_id,row_key,year,class_id),
 foreign key(valplan_id,timplan_id,row_key,year) references public.valplan_rows(valplan_id,timplan_id,row_key,year) on delete cascade
);
alter table public.valplan_row_excluded_classes enable row level security;
alter table public.valplan_row_excluded_classes force row level security;
revoke all on public.valplan_row_excluded_classes from public,anon,authenticated,service_role,skolplattform_worker;

-- Pupils with a choice in the block, per class. Only a count: the view asks before a class with choices is unticked (G8).
create function public.valplan_class_choices(v public.valplans) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('classId',x.class_id,'pupils',x.pupils) order by x.class_id),'[]') from (
  select m.class_id,count(distinct c.pupil_id)::integer pupils from public.valplan_rounds r join public.valplan_choices c on c.round_id=r.id
  join public.pupil_class_memberships m on m.pupil_id=c.pupil_id and m.unit_id=v.unit_id
   and m.starts_on<=make_date(v.school_year+1,6,30) and coalesce(m.ends_on,'infinity'::date)>=make_date(v.school_year,7,1)
  where r.valplan_id=v.id group by m.class_id) x
$$;
-- True when the class is in a block on the row and every such block has groups. Two blocks with the class wait until both have
-- groups, so a later linked class is never treated as organized by accident.
create function public.valplan_class_organized(blocks jsonb,class_id text) returns boolean
language sql immutable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from jsonb_array_elements(blocks) b where not b.value->'excluded' ? class_id)
  and not exists(select 1 from jsonb_array_elements(blocks) b where not b.value->'excluded' ? class_id and not (b.value->>'grouped')::boolean)
$$;

create or replace function public.valplan_row_contexts(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare t public.timplans;o public.offerings;f jsonb;pts jsonb;mins jsonb;cohort integer;y integer;idx integer;key text;
 classes jsonb;out jsonb:='[]';hrs smallint[];alloc boolean[];ht integer;vt integer;begin
 for t in select x.* from public.timplans x join public.offerings ox on ox.id=x.offering_id
  where x.unit_id=unit and x.status='faststalld' and x.gym_basis is not null and ox.kind='gymnasium' and ox.archived_at is null
  order by x.id loop
  select * into o from public.offerings where id=t.offering_id;
  cohort:=public.phase5_class_start_year(t);continue when cohort is null;
  y:=school_year-cohort+1;continue when y<1 or y>3;
  -- Older approved versions only count while classes are still linked to them for the year.
  continue when exists(select 1 from public.timplans n where n.series_id=t.series_id and n.status='faststalld' and n.version>t.version)
   and not exists(select 1 from public.class_timplans l where l.timplan_id=t.id and l.start_year=school_year and l.column_id='ar'||y);
  idx:=2*(y-1);
  select coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name) order by sc.name collate "C",sc.id),'[]') into classes
   from public.class_timplans l join public.school_classes sc on sc.id=l.class_id
   where l.unit_id=t.unit_id and l.timplan_id=t.id and l.start_year=school_year and l.column_id='ar'||y;
  for f in select value from jsonb_array_elements(coalesce(t.gym_basis->'basisReference'->'choiceBlocks','[]')) loop
   continue when f->>'kind' not in ('modernLanguage','languageSubject','naturalScience','individualChoice','specialization');
   key:='block:'||(f->>'id');pts:=null;mins:=null;
   select v.value->'points' into pts from jsonb_array_elements(t.gym_basis->'distribution') v where v.value->>'rowKey'=key;
   continue when pts is null or coalesce((pts->>idx)::integer,0)+coalesce((pts->>(idx+1))::integer,0)=0;
   ht:=null;vt:=null;
   if exists(select 1 from public.timplan_time_models m where m.plan_id=t.id) then
    select c.school_minutes into mins from public.timplan_time_cells_v2 c where c.plan_id=t.id and c.row_key=key;
    if mins is not null then ht:=coalesce((mins->>idx)::integer,0);vt:=coalesce((mins->>(idx+1))::integer,0);end if;
   else
    -- Older plans keep hours per term; the year is split evenly, exactly as in tjänstefördelningen.
    hrs:=null;alloc:=null;select c.hours,c.allocated into hrs,alloc from public.timplan_cells c where c.timplan_id=t.id and c.row_id=key;
    if coalesce((pts->>idx)::integer,0)>0 and alloc[idx+1] then ht:=hrs[idx+1];end if;
    if coalesce((pts->>(idx+1))::integer,0)>0 and alloc[idx+2] then vt:=hrs[idx+2];end if;
    if ht is not null or vt is not null then ht:=(coalesce(ht,0)+coalesce(vt,0))*30;vt:=ht;end if;
   end if;
   out:=out||jsonb_build_array(jsonb_build_object('timplanId',t.id,'timplanVersion',t.version,'rowKey',key,'year',y,'rowKind','block','blockKind',f->>'kind',
    'points',coalesce((pts->>idx)::integer,0)+coalesce((pts->>(idx+1))::integer,0),
    'minutesHt',ht,'minutesVt',vt,
    'classIds',(select coalesce(jsonb_agg(c->'id'),'[]') from jsonb_array_elements(classes) c),'allowedLevelKeys',null,
    'blocks',(select coalesce(jsonb_agg(jsonb_build_object('valplanId',r.valplan_id,'classIds',(select coalesce(jsonb_agg(c.value->'id' order by c.n),'[]') from jsonb_array_elements(classes) with ordinality c(value,n)
      where not exists(select 1 from public.valplan_row_excluded_classes e where e.valplan_id=r.valplan_id and e.timplan_id=r.timplan_id and e.row_key=r.row_key and e.year=r.year and e.class_id=(c.value->>'id')::uuid))) order by r.valplan_id),'[]')
     from public.valplan_rows r where r.unit_id=unit and r.school_year=valplan_row_contexts.school_year and r.timplan_id=t.id and r.row_key=key and r.year=y),
    'planName',coalesce(public.phase5_named_timplan_plan_series(t.id)->>'name',o.name),'rowLabel',f->>'name','classes',classes));
  end loop;
 end loop;
 return out;
end $$;

create or replace function public.valplan_document(v public.valplans) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',v.id,'unitId',v.unit_id,'schoolYear',v.school_year,'kind',v.kind,'name',v.name,'revision',v.revision,
  'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'subjectCode',c.subject_code,'subjectVersion',c.subject_version,'itemCode',c.item_code,'points',c.points,
    'languageCode',c.language_code,'name',c.name,'minutesHt',c.minutes_ht,'minutesVt',c.minutes_vt,
    'classIds',(select jsonb_agg(cc.class_id order by cc.class_id) from public.valplan_course_classes cc where cc.course_id=c.id)) order by c.position,c.id),'[]')
   from public.valplan_courses c where c.valplan_id=v.id and c.active),
  'rows',(select coalesce(jsonb_agg(jsonb_build_object('timplanId',r.timplan_id,'timplanVersion',t.version,'rowKey',r.row_key,'year',r.year,
    'excludedClassIds',(select coalesce(jsonb_agg(e.class_id order by e.class_id),'[]') from public.valplan_row_excluded_classes e where e.valplan_id=r.valplan_id and e.timplan_id=r.timplan_id and e.row_key=r.row_key and e.year=r.year)) order by r.timplan_id,r.row_key,r.year),'[]')
   from public.valplan_rows r join public.timplans t on t.id=r.timplan_id where r.valplan_id=v.id))
$$;

create or replace function public.valplan_projection(unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('contractVersion','valplan_v1','unitId',unit,'schoolYear',school_year,
  'valplans',(select coalesce(jsonb_agg(jsonb_build_object('catalogId',v.catalog_id,'valplan',public.valplan_document(v),'choiceCounts',public.valplan_class_choices(v)) order by v.name collate "C",v.id),'[]')
   from public.valplans v where v.unit_id=unit and v.school_year=valplan_projection.school_year),
  'rows',public.valplan_row_contexts(unit,school_year))
$$;

create or replace function public.valplan_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;j public.valplan_commands;v public.valplans;existing public.valplan_courses;doc jsonb;c jsonb;r jsonb;ctx jsonb;contexts jsonb;
 linked_classes jsonb:='[]';row_classes jsonb;subject jsonb;item jsonb;unit uuid;year integer;command uuid;plan_id uuid;request_hash text;next_revision integer;pos integer:=0;
 starts date;envelope jsonb;cid uuid;begin
 if not coalesce(public.phase5_programplan_shape(input,array['contractVersion','commandId','action','unitId','schoolYear','expectedRevision','catalogId','valplan']),false)
  or input->>'contractVersion' is distinct from 'valplan_v1' or input->>'action' is distinct from 'save'
  or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483645)
  or jsonb_typeof(input->'catalogId') is distinct from 'string' or octet_length(public.tjanst_canonical(input))>512000 then perform public.valplan_invalid();end if;
 unit:=public.tjanst_uuid(input->'unitId');year:=(input->>'schoolYear')::integer;command:=public.tjanst_uuid(input->'commandId');doc:=input->'valplan';
 if not coalesce(public.phase5_programplan_shape(doc,array['id','unitId','schoolYear','kind','name','revision','courses','rows']),false)
  or public.tjanst_uuid(doc->'unitId')<>unit or doc->'schoolYear' is distinct from input->'schoolYear'
  or doc->>'kind' is null or doc->>'kind' not in ('modernLanguage','languageSubject','naturalScience','individualChoice','specialization')
  or jsonb_typeof(doc->'name') is distinct from 'string' or btrim(doc->>'name')='' or char_length(doc->>'name')>200
  or jsonb_typeof(doc->'courses') is distinct from 'array' or jsonb_array_length(doc->'courses')>200
  or jsonb_typeof(doc->'rows') is distinct from 'array' or jsonb_array_length(doc->'rows')>200 then perform public.valplan_invalid();end if;
 plan_id:=public.tjanst_uuid(doc->'id');
 a:=public.elective_staff_scope(unit);
 perform pg_advisory_xact_lock(hashtextextended(command::text,5561));perform pg_advisory_xact_lock(hashtextextended(unit::text||':'||year::text,5562));
 a:=public.elective_staff_scope(unit);request_hash:=substr(public.tjanst_hash(input),8);
 select * into j from public.valplan_commands where command_id=command;
 if j.command_id is not null then
  if j.unit_id<>unit or j.school_year<>year or j.valplan_id<>plan_id or j.payload_hash<>request_hash
   or j.actor_identity_id::text<>current_setting('app.identity_id',true) or j.assignment_id<>a.id then raise exception 'Valplan command collision' using errcode='40001',hint='valplan_command_conflict';end if;
  return jsonb_set(j.envelope,'{result,receipt,replayed}','true');
 end if;
 if not exists(select 1 from public.programplan_catalogs where catalog_id=input->>'catalogId') then perform public.valplan_invalid();end if;
 select * into v from public.valplans where id=plan_id for update;
 if v.id is null and (input->>'expectedRevision')::integer<>0 or v.id is not null and (v.unit_id<>unit or v.school_year<>year or v.revision<>(input->>'expectedRevision')::integer) then
  raise exception 'Valplan revision changed' using errcode='40001',hint='valplan_revision_conflict';end if;
 if v.id is not null and v.kind<>doc->>'kind' then perform public.valplan_invalid('valplan_kind_fixed');end if;
 contexts:=public.valplan_row_contexts(unit,year);
 for r in select value from jsonb_array_elements(doc->'rows') loop
  if not coalesce(public.phase5_programplan_shape(r,array['timplanId','timplanVersion','rowKey','year','excludedClassIds']),false) or not public.phase5_programplan_integer(r->'year',1,3)
   or jsonb_typeof(r->'excludedClassIds') is distinct from 'array' or jsonb_array_length(r->'excludedClassIds')>500 then perform public.valplan_invalid();end if;
  if (select count(distinct k.value) from jsonb_array_elements(r->'excludedClassIds') k)<>jsonb_array_length(r->'excludedClassIds')
   or exists(select 1 from jsonb_array_elements(r->'excludedClassIds') k where not exists(select 1 from public.school_classes sc where sc.id=public.tjanst_uuid(k.value) and sc.unit_id=unit)) then perform public.valplan_invalid('valplan_row_class');end if;
  select value into ctx from jsonb_array_elements(contexts) x where x.value->>'timplanId'=r->>'timplanId' and x.value->>'rowKey'=r->>'rowKey' and x.value->'year'=r->'year';
  if ctx is null or ctx->'timplanVersion' is distinct from r->'timplanVersion' then raise exception 'Valplan row unavailable' using errcode='40001',hint='valplan_row_conflict';end if;
  if ctx->>'blockKind'<>doc->>'kind' then perform public.valplan_invalid('valplan_row_kind');end if;
  -- F-05: a row may be shared, but a class on it belongs to one block. A class linked later counts until someone unticks it.
  select coalesce(jsonb_agg(k.value),'[]') into row_classes from jsonb_array_elements(ctx->'classIds') k where not r->'excludedClassIds' @> jsonb_build_array(k.value);
  if jsonb_array_length(ctx->'classIds')>0 and jsonb_array_length(row_classes)=0 then perform public.valplan_invalid('valplan_row_without_classes');end if;
  if exists(select 1 from jsonb_array_elements(ctx->'blocks') b cross join lateral jsonb_array_elements(b.value->'classIds') k where b.value->>'valplanId'<>plan_id::text and row_classes @> jsonb_build_array(k.value)) then
   raise exception 'Class in another valplan' using errcode='40001',hint='valplan_class_in_other_block';end if;
  linked_classes:=linked_classes||row_classes;ctx:=null;
 end loop;
 starts:=make_date(year,7,1);
 for c in select value from jsonb_array_elements(doc->'courses') loop
  if not coalesce(public.phase5_programplan_shape(c,array['id','subjectCode','subjectVersion','itemCode','points','languageCode','name','minutesHt','minutesVt','classIds']),false)
   or jsonb_typeof(c->'name') is distinct from 'string' or btrim(c->>'name')='' or char_length(c->>'name')>200
   or not public.phase5_programplan_integer(c->'minutesHt',0,100000) or not public.phase5_programplan_integer(c->'minutesVt',0,100000)
   or (c->>'minutesHt')::integer+(c->>'minutesVt')::integer=0
   or jsonb_typeof(c->'languageCode') not in ('null','string')
   or (c->>'subjectCode' in ('MODY','MODG','MODO','MODF'))<>(jsonb_typeof(c->'languageCode')='string')
   or doc->>'kind'='modernLanguage' and c->>'subjectCode' not in ('MODY','MODG','MODO','MODF')
   or doc->>'kind'='languageSubject' and c->>'subjectCode' not in ('MODY','MODG','MODO','MODF','ENGE','KLAS','LATI')
   or doc->>'kind'='naturalScience' and c->>'subjectCode' not in ('BIOG','BIOE','FYSK','FYSF','KEMI')
   or jsonb_typeof(c->'classIds') not in ('null','array') or jsonb_typeof(c->'classIds')='array' and jsonb_array_length(c->'classIds')=0 then perform public.valplan_invalid();end if;
  select s.value,i.value into subject,item from public.programplan_catalogs pc cross join lateral jsonb_array_elements(pc.payload->'subjects') s cross join lateral jsonb_array_elements(s.value->'items') i
   where pc.catalog_id=input->>'catalogId' and s.value->>'code'=c->>'subjectCode' and s.value->'version'=c->'subjectVersion' and s.value->'schoolTypes' ? 'GY'
    and s.value->>'typeOfSyllabus'='GRADE_SUBJECT_SYLLABUS' and i.value->>'code'=c->>'itemCode' and i.value->'points'=c->'points';
  if subject is null or subject->>'startDate' is null or starts<(subject->>'startDate')::date or subject->>'endDate' is not null and starts>(subject->>'endDate')::date
   or subject->>'canceledDate' is not null and starts>=(subject->>'canceledDate')::date then perform public.valplan_invalid('valplan_course_not_in_catalog');end if;
  subject:=null;item:=null;
  if jsonb_typeof(c->'classIds')='array' and exists(select 1 from jsonb_array_elements(c->'classIds') k where not linked_classes @> jsonb_build_array(k.value)) then perform public.valplan_invalid('valplan_course_class');end if;
  cid:=public.tjanst_uuid(c->'id');
  select * into existing from public.valplan_courses where id=cid;
  if existing.id is not null and (existing.valplan_id<>plan_id or (existing.subject_code,existing.subject_version,existing.item_code,existing.points,existing.language_code)
   is distinct from (c->>'subjectCode',(c->>'subjectVersion')::integer,c->>'itemCode',(c->>'points')::integer,c->>'languageCode')) then perform public.valplan_invalid('valplan_course_identity');end if;
  existing:=null;
 end loop;
 if (select count(distinct x.value->>'id') from jsonb_array_elements(doc->'courses') x)<>jsonb_array_length(doc->'courses')
  or (select count(distinct (x.value->>'subjectCode',x.value->>'subjectVersion',x.value->>'itemCode',coalesce(x.value->>'languageCode','-'))) from jsonb_array_elements(doc->'courses') x)<>jsonb_array_length(doc->'courses')
  then perform public.valplan_invalid('valplan_duplicate_course');end if;
 next_revision:=coalesce(v.revision,0)+1;
 if v.id is null then
  insert into public.valplans(id,unit_id,organizer_id,school_year,kind,name,catalog_id,revision) values(plan_id,unit,a.organizer_id,year,doc->>'kind',doc->>'name',input->>'catalogId',1);
 else
  update public.valplans set name=doc->>'name',catalog_id=input->>'catalogId',revision=next_revision,updated_at=clock_timestamp() where id=plan_id;
 end if;
 update public.valplan_courses set active=false where valplan_id=plan_id and id not in(select (x.value->>'id')::uuid from jsonb_array_elements(doc->'courses') x);
 for c in select value from jsonb_array_elements(doc->'courses') loop
  insert into public.valplan_courses(id,valplan_id,position,subject_code,subject_version,item_code,points,language_code,name,minutes_ht,minutes_vt,active)
  values((c->>'id')::uuid,plan_id,pos,c->>'subjectCode',(c->>'subjectVersion')::integer,c->>'itemCode',(c->>'points')::integer,c->>'languageCode',c->>'name',(c->>'minutesHt')::integer,(c->>'minutesVt')::integer,true)
  on conflict(id) do update set position=excluded.position,name=excluded.name,minutes_ht=excluded.minutes_ht,minutes_vt=excluded.minutes_vt,active=true;
  delete from public.valplan_course_classes where course_id=(c->>'id')::uuid;
  if jsonb_typeof(c->'classIds')='array' then insert into public.valplan_course_classes(course_id,class_id) select (c->>'id')::uuid,k.value::uuid from jsonb_array_elements_text(c->'classIds') k;end if;
  pos:=pos+1;
 end loop;
 delete from public.valplan_rows where valplan_id=plan_id;
 begin
  insert into public.valplan_rows(valplan_id,unit_id,school_year,timplan_id,row_key,year)
  select plan_id,unit,year,(x.value->>'timplanId')::uuid,x.value->>'rowKey',(x.value->>'year')::smallint from jsonb_array_elements(doc->'rows') x;
 exception when unique_violation then raise exception 'Valplan row linked elsewhere' using errcode='40001',hint='valplan_row_conflict';end;
 insert into public.valplan_row_excluded_classes(valplan_id,timplan_id,row_key,year,class_id)
 select plan_id,(x.value->>'timplanId')::uuid,x.value->>'rowKey',(x.value->>'year')::smallint,k.value::uuid from jsonb_array_elements(doc->'rows') x cross join lateral jsonb_array_elements_text(x.value->'excludedClassIds') k;
 select * into v from public.valplans where id=plan_id;
 insert into public.valplan_versions(valplan_id,revision,document,actor_identity_id,assignment_id)
 values(plan_id,v.revision,public.valplan_document(v),current_setting('app.identity_id',true)::uuid,a.id);
 envelope:=jsonb_build_object('contractVersion','valplan_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),
  'result',jsonb_build_object('receipt',jsonb_build_object('commandId',command,'valplanId',plan_id,'revision',v.revision,'replayed',false),'read',public.valplan_projection(unit,year)));
 insert into public.valplan_commands(command_id,unit_id,school_year,valplan_id,action,payload_hash,actor_identity_id,assignment_id,envelope)
 values(command,unit,year,plan_id,'save',request_hash,current_setting('app.identity_id',true)::uuid,a.id,envelope);
 return envelope;
end $$;

create or replace function public.valplan_pupil_row(v public.valplans,pupil uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('classId',m.class_id,'points',(r.value->>'points')::integer)
 from jsonb_array_elements(public.valplan_row_contexts(v.unit_id,v.school_year)) r
 cross join lateral jsonb_array_elements(r.value->'blocks') b
 join public.pupil_class_memberships m on m.pupil_id=pupil and m.unit_id=v.unit_id and b.value->'classIds' ? m.class_id::text
  and m.starts_on<=make_date(v.school_year+1,6,30) and coalesce(m.ends_on,'infinity'::date)>=make_date(v.school_year,7,1)
 where b.value->>'valplanId'=v.id::text order by m.starts_on desc,m.class_id limit 1
$$;

create or replace function public.tjanst_working_needs(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare needs jsonb:=public.tjanst_needs_with_groups(unit,school_year,public.tjanst_group_needs(unit,school_year));applied_frames jsonb;filled jsonb;result jsonb;
begin
 -- b.applied kan vara false efter ett otillämpat namn-/prognos-/poolutkast. Endast senaste
 -- uttryckliga applied_snapshot.sourceRefs gäller medan en tillämpad organisation finns kvar.
 -- Ett återöppnat sparutkast får återta claim i155 men väcker inte den gamla poolen före ny tillämpning.
 select coalesce(jsonb_agg(distinct coalesce(sr.value->>'frameSourceKey',sr.value->>'sourceKey')),'[]'::jsonb) into applied_frames
 from public.elective_blocks b cross join lateral jsonb_array_elements(coalesce(b.applied_snapshot->'sourceRefs','[]'::jsonb)) sr
 where b.unit_id=unit and b.school_year=tjanst_working_needs.school_year and b.organization_retired_at is null
  and exists(select 1 from public.elective_applied_groups ag join public.elective_group_snapshots gs on gs.group_id=ag.group_id and gs.revision=ag.revision where gs.block_id=b.id);
 -- Rows filled by valplans, with each block's unticked classes and whether it has groups. A row counts as organized per class:
 -- the groups carry the need of a class in a block with groups, and every other class on the row waits for organization.
 select coalesce(jsonb_object_agg(x.key,x.blocks),'{}'::jsonb) into filled from (
  select r.timplan_id::text||'|'||r.row_key||'|ar'||r.year::text key,jsonb_agg(jsonb_build_object(
    'excluded',(select coalesce(jsonb_agg(e.class_id),'[]'::jsonb) from public.valplan_row_excluded_classes e where e.valplan_id=r.valplan_id and e.timplan_id=r.timplan_id and e.row_key=r.row_key and e.year=r.year),
    'grouped',exists(select 1 from public.study_groups g where g.valplan_id=r.valplan_id and g.active and g.minutes_ht+g.minutes_vt>0))) blocks
  from public.valplan_rows r where r.unit_id=unit and r.school_year=tjanst_working_needs.school_year group by 1) x;
 if jsonb_array_length(applied_frames)=0 and filled='{}'::jsonb then return needs;end if;
 select coalesce(jsonb_agg(c.value||jsonb_build_object('needs',
  (select coalesce(jsonb_agg(case when applied_frames ? (n.value->>'sourceKey') or filled ? ((c.value->'link'->>'timplanId')||'|'||(n.value->>'rowKey')||'|'||(c.value->'link'->>'column')) then n.value||jsonb_build_object('organizationPending',true) else n.value end order by n.position),'[]'::jsonb)
   from jsonb_array_elements(c.value->'needs') with ordinality n(value,position)
   where not public.valplan_class_organized(filled->((c.value->'link'->>'timplanId')||'|'||(n.value->>'rowKey')||'|'||(c.value->'link'->>'column')),c.value->>'classId'))) order by c.position),'[]'::jsonb) into result
 from jsonb_array_elements(needs) with ordinality c(value,position);
 return result;
end $$;

CREATE OR REPLACE FUNCTION public.tjanst_plan_blockers(a access_assignments, v tjanst_versions, unit uuid, school_year integer, needs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare result jsonb:='[]';
begin
 if v.id is null or v.status<>'draft' then return result;end if;
 if not exists(select 1 from public.tjanst_rows r where r.version_id=v.id) then
  result:=result||jsonb_build_array(jsonb_build_object('code','empty_draft','message','Utkastet har inga tjänsterader. Lägg till minst en rad före publicering.'));end if;
 if exists(select 1 from public.tjanst_rows r where r.version_id=v.id and (public.tjanst_row_json(r,public.tjanst_need(unit,tjanst_plan_blockers.school_year,r.source_key))->>'stale')::boolean) then
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
 if exists(select 1 from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') n where coalesce((n.value->>'organizationPending')::boolean,false)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','organization_pending','message','Valbara tidsutrymmen återstår att organisera i undervisningsgrupper. Välj block för klasser som saknar block och skapa grupperna från det valbara blocket eller under Undervisningsgrupper innan tjänstefördelningen publiceras.'));end if;
 if exists(select 1 from jsonb_array_elements(public.tjanst_group_needs(unit,school_year)) g where (g.value->>'stale')::boolean) then
  result:=result||jsonb_build_array(jsonb_build_object('code','group_sources_changed','message','Underlaget för undervisningsgrupper har ändrats. Granska grupperna och spara dem på nytt.'));end if;
 return result;
end $function$;

revoke all on function public.valplan_class_choices(public.valplans),public.valplan_class_organized(jsonb,text) from public,anon,authenticated,service_role;
