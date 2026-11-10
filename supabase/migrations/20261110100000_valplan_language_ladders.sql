-- VP-16. Valbara block följer programplanens språktrappor (web/lib/programplan-languages.ts) i stället för de fyra koderna för moderna
-- språk. Moderna språk får också modersmål, svenskt teckenspråk för hörande och de nationella minoritetsspråken (05-23 D-06, 4 kap. 10 a
-- och 17 §§). Språkämne är oförändrat enligt 4 kap. 1 a §. Trappan avgör språket: moderna språk och modersmål väljer ett, teckenspråk har
-- inget och ett minoritetsspråk har trappans. Bara kommandots kontroll ändras, inga tabeller och inga rader. Inga objekt i SS 12000 ändras:
-- språket hör till kursreferensen i den lokala planeringen, och språkkoderna är lokala.
-- 'pick' when the school picks a language, 'none' for a ladder without one, the given code for a minority language and null outside
-- the ladders. valplanLanguageRule in web/lib/valplan-model.ts agrees, and verify-valplan-sql compares them.
create function public.valplan_language_rule(subject text) returns text
language sql immutable security definer set search_path=pg_catalog,public as $$
 select case
  when subject in ('MODY','MODG','MODO','MODF','MODE') then 'pick'
  when subject in ('SVEY','SVEG','SVEO','SVEF') then 'none'
  when subject ~ '^(FIN|JID|MEA|ROM|SAM)[XYW]$' then case left(subject,3) when 'FIN' then 'fi' when 'JID' then 'yi' when 'MEA' then 'fit' when 'ROM' then 'rom' else 'se' end
 end
$$;
revoke all on function public.valplan_language_rule(text) from public,anon,authenticated,service_role,skolplattform_worker;

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
   or (case coalesce(public.valplan_language_rule(c->>'subjectCode'),'none') when 'pick' then jsonb_typeof(c->'languageCode')='string'
        when 'none' then jsonb_typeof(c->'languageCode')='null' else c->>'languageCode' is not distinct from public.valplan_language_rule(c->>'subjectCode') end) is not true
   or doc->>'kind'='modernLanguage' and public.valplan_language_rule(c->>'subjectCode') is null
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
