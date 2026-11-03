-- VP-02. A valplan is a school's elective course offering for one school year. It fills choice-block rows in one or
-- more approved GY timplaner and owns the courses' teaching time (VP-CONTEXT D-03). Local planning information;
-- teaching groups and memberships are separate (VP-03). Nothing here changes timplaner, classes or tjänstefördelning.
create table public.valplans (
 id uuid primary key, unit_id uuid not null references public.school_units(id), organizer_id uuid not null references public.organizers(id),
 school_year integer not null check(school_year between 2000 and 2100),
 kind text not null check(kind in ('modernLanguage','individualChoice','specialization')),
 name text not null check(char_length(name) between 1 and 200 and btrim(name)<>''),
 catalog_id text not null references public.programplan_catalogs(catalog_id), revision integer not null check(revision>0),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(id,unit_id,school_year)
);
create table public.valplan_courses (
 id uuid primary key, valplan_id uuid not null references public.valplans(id), position integer not null check(position>=0),
 subject_code text not null check(char_length(subject_code) between 1 and 96), subject_version integer not null check(subject_version>0),
 item_code text not null check(char_length(item_code) between 1 and 96), points integer not null check(points between 1 and 10000),
 language_code text check(language_code is null or char_length(language_code) between 1 and 16),
 name text not null check(char_length(name) between 1 and 200 and btrim(name)<>''),
 minutes_ht integer not null check(minutes_ht between 0 and 100000), minutes_vt integer not null check(minutes_vt between 0 and 100000),
 active boolean not null default true, unique(id,valplan_id)
);
create table public.valplan_course_classes (
 course_id uuid not null references public.valplan_courses(id), class_id uuid not null references public.school_classes(id), primary key(course_id,class_id)
);
-- One valplan per timplan row and year column in a school year.
create table public.valplan_rows (
 valplan_id uuid not null, unit_id uuid not null, school_year integer not null, timplan_id uuid not null references public.timplans(id),
 row_key text not null check(row_key ~ '^block:[a-z][a-z0-9]{0,15}$'), year smallint not null check(year between 1 and 3),
 primary key(valplan_id,timplan_id,row_key,year), unique(unit_id,school_year,timplan_id,row_key,year),
 foreign key(valplan_id,unit_id,school_year) references public.valplans(id,unit_id,school_year)
);
create table public.valplan_versions (
 valplan_id uuid not null references public.valplans(id), revision integer not null, document jsonb not null,
 actor_identity_id uuid not null references public.identities(id), assignment_id uuid not null references public.access_assignments(id),
 created_at timestamptz not null default clock_timestamp(), primary key(valplan_id,revision)
);
create table public.valplan_commands (
 command_id uuid primary key, unit_id uuid not null references public.school_units(id), school_year integer not null, valplan_id uuid not null,
 action text not null check(action='save'), payload_hash text not null, actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id), envelope jsonb not null, created_at timestamptz not null default clock_timestamp()
);
do $$declare n text;begin foreach n in array array['valplans','valplan_courses','valplan_course_classes','valplan_rows','valplan_versions','valplan_commands'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);end loop;end $$;
create trigger valplan_versions_immutable before update or delete or truncate on public.valplan_versions for each statement execute function public.elective_time_immutable();
create trigger valplan_commands_immutable before update or delete or truncate on public.valplan_commands for each statement execute function public.elective_time_immutable();

create function public.valplan_invalid(reason text default 'valplan_invalid') returns void
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
begin raise exception 'Invalid valplan' using errcode='22023',hint=reason;end $$;

-- Choice-block rows of approved GY timplaner whose year column falls in the school year, with real class links.
create function public.valplan_row_contexts(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare t public.timplans;o public.offerings;f jsonb;pts jsonb;mins jsonb;cohort integer;y integer;idx integer;key text;
 classes jsonb;out jsonb:='[]';begin
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
   continue when f->>'kind' not in ('modernLanguage','individualChoice','specialization');
   key:='block:'||(f->>'id');pts:=null;mins:=null;
   select v.value->'points' into pts from jsonb_array_elements(t.gym_basis->'distribution') v where v.value->>'rowKey'=key;
   continue when pts is null or coalesce((pts->>idx)::integer,0)+coalesce((pts->>(idx+1))::integer,0)=0;
   if exists(select 1 from public.timplan_time_models m where m.plan_id=t.id) then
    select c.school_minutes into mins from public.timplan_time_cells_v2 c where c.plan_id=t.id and c.row_key=key;
   end if;
   out:=out||jsonb_build_array(jsonb_build_object('timplanId',t.id,'timplanVersion',t.version,'rowKey',key,'year',y,'rowKind','block','blockKind',f->>'kind',
    'points',coalesce((pts->>idx)::integer,0)+coalesce((pts->>(idx+1))::integer,0),
    'minutesHt',case when mins is null then null else coalesce((mins->>idx)::integer,0) end,'minutesVt',case when mins is null then null else coalesce((mins->>(idx+1))::integer,0) end,
    'classIds',(select coalesce(jsonb_agg(c->'id'),'[]') from jsonb_array_elements(classes) c),'allowedLevelKeys',null,
    'linkedValplanId',(select to_jsonb(r.valplan_id) from public.valplan_rows r where r.unit_id=unit and r.school_year=valplan_row_contexts.school_year and r.timplan_id=t.id and r.row_key=key and r.year=y),
    'planName',coalesce(public.phase5_named_timplan_plan_series(t.id)->>'name',o.name),'rowLabel',f->>'name','classes',classes));
  end loop;
 end loop;
 return out;
end $$;

create function public.valplan_document(v public.valplans) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',v.id,'unitId',v.unit_id,'schoolYear',v.school_year,'kind',v.kind,'name',v.name,'revision',v.revision,
  'courses',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'subjectCode',c.subject_code,'subjectVersion',c.subject_version,'itemCode',c.item_code,'points',c.points,
    'languageCode',c.language_code,'name',c.name,'minutesHt',c.minutes_ht,'minutesVt',c.minutes_vt,
    'classIds',(select jsonb_agg(cc.class_id order by cc.class_id) from public.valplan_course_classes cc where cc.course_id=c.id)) order by c.position,c.id),'[]')
   from public.valplan_courses c where c.valplan_id=v.id and c.active),
  'rows',(select coalesce(jsonb_agg(jsonb_build_object('timplanId',r.timplan_id,'timplanVersion',t.version,'rowKey',r.row_key,'year',r.year) order by r.timplan_id,r.row_key,r.year),'[]')
   from public.valplan_rows r join public.timplans t on t.id=r.timplan_id where r.valplan_id=v.id))
$$;

create function public.valplan_projection(unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('contractVersion','valplan_v1','unitId',unit,'schoolYear',school_year,
  'valplans',(select coalesce(jsonb_agg(jsonb_build_object('catalogId',v.catalog_id,'valplan',public.valplan_document(v)) order by v.name collate "C",v.id),'[]')
   from public.valplans v where v.unit_id=unit and v.school_year=valplan_projection.school_year),
  'rows',public.valplan_row_contexts(unit,school_year))
$$;

create function public.valplan_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;begin
 if not coalesce(public.phase5_programplan_shape(input,array['unitId','schoolYear']),false) or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) then perform public.valplan_invalid();end if;
 a:=public.elective_staff_scope(public.tjanst_uuid(input->'unitId'));
 return jsonb_build_object('contractVersion','valplan_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),
  'result',public.valplan_projection((input->>'unitId')::uuid,(input->>'schoolYear')::integer));
end $$;

create function public.valplan_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;j public.valplan_commands;v public.valplans;existing public.valplan_courses;doc jsonb;c jsonb;r jsonb;ctx jsonb;contexts jsonb;
 linked_classes jsonb:='[]';subject jsonb;item jsonb;unit uuid;year integer;command uuid;plan_id uuid;request_hash text;next_revision integer;pos integer:=0;
 starts date;envelope jsonb;cid uuid;begin
 if not coalesce(public.phase5_programplan_shape(input,array['contractVersion','commandId','action','unitId','schoolYear','expectedRevision','catalogId','valplan']),false)
  or input->>'contractVersion' is distinct from 'valplan_v1' or input->>'action' is distinct from 'save'
  or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483645)
  or jsonb_typeof(input->'catalogId') is distinct from 'string' or octet_length(public.tjanst_canonical(input))>512000 then perform public.valplan_invalid();end if;
 unit:=public.tjanst_uuid(input->'unitId');year:=(input->>'schoolYear')::integer;command:=public.tjanst_uuid(input->'commandId');doc:=input->'valplan';
 if not coalesce(public.phase5_programplan_shape(doc,array['id','unitId','schoolYear','kind','name','revision','courses','rows']),false)
  or public.tjanst_uuid(doc->'unitId')<>unit or doc->'schoolYear' is distinct from input->'schoolYear'
  or doc->>'kind' is null or doc->>'kind' not in ('modernLanguage','individualChoice','specialization')
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
  if not coalesce(public.phase5_programplan_shape(r,array['timplanId','timplanVersion','rowKey','year']),false) or not public.phase5_programplan_integer(r->'year',1,3) then perform public.valplan_invalid();end if;
  select value into ctx from jsonb_array_elements(contexts) x where x.value->>'timplanId'=r->>'timplanId' and x.value->>'rowKey'=r->>'rowKey' and x.value->'year'=r->'year';
  if ctx is null or ctx->'timplanVersion' is distinct from r->'timplanVersion' then raise exception 'Valplan row unavailable' using errcode='40001',hint='valplan_row_conflict';end if;
  if ctx->>'blockKind'<>doc->>'kind' then perform public.valplan_invalid('valplan_row_kind');end if;
  if ctx->>'linkedValplanId' is not null and (ctx->>'linkedValplanId')::uuid<>plan_id then raise exception 'Valplan row linked elsewhere' using errcode='40001',hint='valplan_row_conflict';end if;
  linked_classes:=linked_classes||(ctx->'classIds');ctx:=null;
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
 select * into v from public.valplans where id=plan_id;
 insert into public.valplan_versions(valplan_id,revision,document,actor_identity_id,assignment_id)
 values(plan_id,v.revision,public.valplan_document(v),current_setting('app.identity_id',true)::uuid,a.id);
 envelope:=jsonb_build_object('contractVersion','valplan_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),
  'result',jsonb_build_object('receipt',jsonb_build_object('commandId',command,'valplanId',plan_id,'revision',v.revision,'replayed',false),'read',public.valplan_projection(unit,year)));
 insert into public.valplan_commands(command_id,unit_id,school_year,valplan_id,action,payload_hash,actor_identity_id,assignment_id,envelope)
 values(command,unit,year,plan_id,'save',request_hash,current_setting('app.identity_id',true)::uuid,a.id,envelope);
 return envelope;
end $$;

do $$declare n text;begin foreach n in array array['valplan_invalid(text)','valplan_row_contexts(uuid,integer)','valplan_document(public.valplans)','valplan_projection(uuid,integer)','valplan_read(jsonb)','valplan_command(jsonb)'] loop
 execute format('revoke all on function public.%s from public,anon,authenticated,service_role',n);end loop;end $$;
grant execute on function public.valplan_read(jsonb),public.valplan_command(jsonb) to skolplattform_worker;
