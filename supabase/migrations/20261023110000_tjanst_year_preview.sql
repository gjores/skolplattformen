-- 05.1-17 / D-25–D-27. Current school/year support is read-only except mandatory security audit.
-- No distribution, draft, teacher or row is created by reading. Historical planning is never qualification/actual teaching.
-- SS 12000:2024 ed.4 / OpenAPI2.1.0: own stable Person/Group/Duty references and inclusive dates;
-- student need minutes and teacher minutes stay separate. No external information exchange is claimed.
-- All new functions remain closed to Worker and clients until the separately reviewed grant migration.

create function public.tjanst_year_hash(kind text,value jsonb) returns text
language sql immutable security definer set search_path=pg_catalog,public as $$
 select public.tjanst_hash(jsonb_build_array('tjanst_year_v1',kind,value))
$$;

-- Core data cannot degrade. The scope/actor is supplied only by checked internal callers.
create function public.tjanst_year_core(a public.access_assignments,unit uuid,year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d public.tjanst_distributions;v public.tjanst_versions;needs jsonb;people jsonb:='[]';p public.staff_people;
 duties jsonb;candidate jsonb;calendar jsonb;source_state jsonb;base jsonb;rows jsonb;specials jsonb;joints jsonb;person_hash text;
begin
 if a.function not in ('rektor','administrator') or year is null or year not between 2000 and 2100 then
  raise exception 'Year planning denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=year and x.customer_id=a.customer_id;
 select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status in ('draft','published') order by (x.status='draft') desc,x.version_no desc limit 1;
 needs:=public.tjanst_needs(unit,year); -- exactly once per request, passed through all row/batch calculations
 for p in select x.* from public.staff_people x where x.customer_id=a.customer_id and x.organizer_id=a.organizer_id
  and public.tjanst_person_at_school(a,x.id,unit,year) order by x.family_name collate "C",x.given_name collate "C",x.id loop
  select coalesce(jsonb_agg(jsonb_build_object('dutyId',s.id,'startsOn',s.starts_on,'endsOn',s.ends_on,'percent',s.percent) order by s.starts_on,s.id),'[]') into duties
   from public.staff_school_duties s where s.staff_person_id=p.id and s.unit_id=unit
    and daterange(s.starts_on,s.ends_on,'[]')&&daterange(make_date(year,7,1),make_date(year+1,6,30),'[]');
  if jsonb_array_length(duties)>200 then raise exception 'Duty catalog exceeds explicit limit' using errcode='54000',hint='tjanst_catalog_incomplete';end if;
  person_hash:=public.tjanst_year_hash('person',jsonb_build_object('unitId',unit,'schoolYear',year,'personId',p.id,
    'personRevision',p.revision,'draft',p.status='draft','duties',duties));
  candidate:=jsonb_build_object('personId',p.id,'displayName',left(p.given_name||' '||p.family_name,200),'draft',p.status='draft',
   'shareHere',(select max((x.value->>'percent')::integer) from jsonb_array_elements(duties) x),'duties',duties,
   'personBasisHash',person_hash,'qualificationStatus','unknown');
  people:=people||jsonb_build_array(candidate);
 end loop;
 if jsonb_array_length(people)>5000 then raise exception 'Year catalog exceeds explicit limit' using errcode='54000',hint='tjanst_catalog_incomplete';end if;
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('days',coalesce((select jsonb_agg(to_jsonb(sd) order by sd.day) from public.school_year_days sd where sd.school_year_id=s.id),'[]')) order by s.id),'[]')
  into calendar from public.school_years s where s.unit_id=unit and s.start_year=year;
 -- Include source revisions even where a source change leaves displayed minutes unchanged.
 select coalesce(jsonb_agg(jsonb_build_object('class',to_jsonb(c),'link',to_jsonb(l),'planRevision',t.revision,'planStatus',t.status,
   'planDecision',t.decided_on) order by c.id),'[]') into source_state
  from public.school_classes c join public.offerings o on o.id=c.offering_id left join public.class_timplans l on l.class_id=c.id and l.start_year=year
  left join public.timplans t on t.id=l.timplan_id where c.unit_id=unit and public.phase5_class_cohort_year_fits(c,year)
   and ((o.kind='gymnasium' and c.start_year between year-2 and year) or (o.kind<>'gymnasium' and c.start_year=year));
 select coalesce(jsonb_agg(jsonb_set(public.tjanst_row_json(r,(select n.value||jsonb_build_object('link',c.value->'link')
  from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') n where n.value->>'sourceKey'=r.source_key)),'{jointGroupId}',coalesce((select to_jsonb(m.group_id) from public.tjanst_joint_members m where m.row_id=r.id),'null'::jsonb)) order by r.id),'[]')
  into rows from public.tjanst_rows r where r.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'lineageId',s.lineage_id,'kind',s.kind,'label',s.label,'personId',s.staff_person_id,
  'classId',s.class_id,'ht',s.ht_minutes,'vt',s.vt_minutes,'comment',s.comment) order by s.id),'[]') into specials
  from public.tjanst_special_assignments s where s.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'lineageId',g.lineage_id,'name',g.name,
  'rowIds',coalesce((select jsonb_agg(m.row_id order by m.row_id) from public.tjanst_joint_members m where m.group_id=g.id),'[]'),
  'teachers',coalesce((select jsonb_agg(jsonb_build_object('personId',tt.staff_person_id,'ht',tt.ht_minutes,'vt',tt.vt_minutes) order by tt.staff_person_id)
    from public.tjanst_joint_teacher_time tt where tt.group_id=g.id),'[]')) order by g.id),'[]') into joints from public.tjanst_joint_groups g where g.version_id=v.id;
 base:=jsonb_build_object('contractVersion','tjanst_year_v1','unitId',unit,'schoolYear',year,'currentRevision',coalesce(d.revision,0),'baseVersionId',v.id);
 base:=base||jsonb_build_object('basisHash',public.tjanst_year_hash('basis',jsonb_build_object('customerId',a.customer_id,'actorId',a.membership_id,
  'assignmentId',a.id,'unitId',unit,'schoolYear',year,'baseVersionId',v.id,'currentRevision',coalesce(d.revision,0),'asOf',public.app_today(),
  'needs',needs,'sources',source_state,'calendar',calendar)));
 return jsonb_build_object('base',base,'needs',needs,'candidates',people,'rows',rows,'specials',specials,'joints',joints);
end $$;

-- Catalog-wide mutations bind every currently eligible person's current duty basis.
-- Rows keep a narrower need basis plus an explicit selected person's hash.
create function public.tjanst_year_catalog(core jsonb) returns jsonb
language sql immutable security definer set search_path=pg_catalog,public as $$
 select core->'base'||jsonb_build_object('mode','catalog','candidates',core->'candidates',
  'totalCandidates',jsonb_array_length(core->'candidates'),'basisHash',public.tjanst_year_hash('basis',
   jsonb_build_object('coreBasisHash',core->'base'->'basisHash','people',coalesce((select jsonb_agg(
    jsonb_build_object('personId',p.value->'personId','personBasisHash',p.value->'personBasisHash') order by p.value->>'personId')
    from jsonb_array_elements(core->'candidates') p),'[]'::jsonb))))
$$;

-- Optional historic source has one documented, narrow failure code. Authorization/core/audit are never caught.
-- A stored published hash that no longer matches is not credible recommendation evidence.
create function public.tjanst_year_history(unit uuid,year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions;result jsonb;
begin
 select x.* into v from public.tjanst_versions x join public.tjanst_distributions d on d.id=x.distribution_id
  where d.unit_id=unit and d.school_year=year-1 and x.status='published' order by x.version_no desc limit 1;
 if v.id is null then return '[]'::jsonb;end if;
 if v.content_hash is distinct from public.tjanst_version_hash(v.id) then
  raise exception 'Historical planning evidence unavailable' using errcode='P5101';end if;
 select coalesce(jsonb_agg(jsonb_build_object('unitId',unit,'schoolYear',year-1,'versionId',v.id,'rowId',r.id,'personId',r.staff_person_id,
  'classId',r.class_id,'rowKey',r.timplan_row_key,'sourceKey',r.source_key) order by r.id),'[]') into result
  from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id is not null;
 return result;
end $$;

create function public.tjanst_year_recommendations(core jsonb,need jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare history jsonb;refs jsonb:='[]';r jsonb;c jsonb;reason text;own jsonb;reasons jsonb;result jsonb:='[]';evidence text;
 base jsonb:=core->'base';
begin
 begin history:=public.tjanst_year_history((base->>'unitId')::uuid,(base->>'schoolYear')::integer);
 exception when sqlstate 'P5101' then return jsonb_build_object('recommendationStatus','unavailable','suggestions','[]'::jsonb);end;
 for r in select x.value from jsonb_array_elements(core->'rows') x where x.value->>'classId'=need->>'classId' and x.value->>'personId' is not null loop
  refs:=refs||jsonb_build_array(jsonb_build_object('reason','current_same_class','unitId',base->'unitId','schoolYear',base->'schoolYear',
    'versionId',base->'baseVersionId','rowId',r->'id','personId',r->'personId','classId',r->'classId','rowKey',r->'rowKey','sourceKey',r->'sourceKey'));
 end loop;
 for r in select x.value from jsonb_array_elements(history) x loop
  reason:=case when r->>'classId'=need->>'classId' and r->>'rowKey'=need->>'rowKey' then 'previous_same_class_row'
   when r->>'classId'=need->>'classId' then 'previous_same_class' when r->>'rowKey'=need->>'rowKey' then 'previous_same_row' else null end;
  if reason is not null then refs:=refs||jsonb_build_array(r||jsonb_build_object('reason',reason));end if;
 end loop;
 for c in select x.value from jsonb_array_elements(core->'candidates') x loop
  select coalesce(jsonb_agg(x.value order by x.value->>'reason',x.value->>'versionId',x.value->>'rowId'),'[]') into own
   from jsonb_array_elements(refs) x where x.value->>'personId'=c->>'personId';
  if jsonb_array_length(own)=0 then continue;end if;
  select jsonb_agg(rr.reason order by rr.rank) into reasons from (select distinct x.value->>'reason' reason,
    array_position(array['current_same_class','previous_same_class_row','previous_same_class','previous_same_row'],x.value->>'reason') rank from jsonb_array_elements(own) x) rr;
  evidence:=public.tjanst_year_hash('evidence',jsonb_build_object('unitId',base->'unitId','schoolYear',base->'schoolYear','sourceKey',need->'sourceKey',
   'personId',c->'personId','references',own,'reasons',reasons));
  result:=result||jsonb_build_array(jsonb_build_object('suggestionId',evidence,'personId',c->'personId','evidenceHash',evidence,'reasons',reasons,'references',own));
 end loop;
 return jsonb_build_object('recommendationStatus',case when jsonb_array_length(result)>0 then 'ready' else 'empty' end,'suggestions',result);
end $$;

create function public.tjanst_year_row(core jsonb,source_key text,row_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare need jsonb;r jsonb;base jsonb:=core->'base';
begin
 select n.value||jsonb_build_object('classId',c.value->'classId','className',c.value->'name') into need
  from jsonb_array_elements(core->'needs') c cross join lateral jsonb_array_elements(c.value->'needs') n where n.value->>'sourceKey'=source_key;
 if need is null then raise exception 'Unknown current need' using errcode='22023',hint='tjanst_unknown_source';end if;
 if row_id is not null then
  select x.value into r from jsonb_array_elements(core->'rows') x where x.value->>'id'=row_id::text and x.value->>'sourceKey'=source_key;
  if r is null then raise exception 'Current row denied' using errcode='42501';end if;
 end if;
 base:=base||jsonb_build_object('basisHash',public.tjanst_year_hash('basis',jsonb_build_object('coreBasisHash',base->'basisHash','sourceKey',source_key,'rowId',row_id)));
 return base||jsonb_build_object('mode','row','sourceKey',source_key,'rowId',row_id,'need',need,'currentRow',r,
  'candidates',core->'candidates','totalCandidates',jsonb_array_length(core->'candidates'))||public.tjanst_year_recommendations(core,need);
end $$;

-- Strict scalar validation is repeated in SQL; a client parser is never an authorization boundary.
create function public.tjanst_year_choice(choice jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare kind text:=choice->>'kind';
begin
 if kind='unassigned' then
  if not public.phase5_programplan_shape(choice,array['kind','personId']) or choice->'personId'<>'null'::jsonb then
   raise exception 'Invalid explicit vacancy' using errcode='22023',hint='tjanst_invalid';end if;
 elsif kind in ('manual','suggestion') then
  if not public.phase5_programplan_shape(choice,case when kind='manual' then array['kind','personId','expectedPersonBasisHash'] else array['kind','personId','expectedPersonBasisHash','suggestionId','expectedEvidenceHash'] end)
   or coalesce(choice->>'expectedPersonBasisHash','')!~'^sha256:[a-f0-9]{64}$' then raise exception 'Invalid teacher choice' using errcode='22023',hint='tjanst_invalid';end if;
  perform public.tjanst_uuid(choice->'personId');
  if kind='suggestion' and (not public.phase5_apl_text(choice->'suggestionId',240,false) or coalesce(choice->>'expectedEvidenceHash','')!~'^sha256:[a-f0-9]{64}$') then
   raise exception 'Invalid suggestion choice' using errcode='22023',hint='tjanst_invalid';end if;
 else raise exception 'Explicit teacher choice required' using errcode='22023',hint='tjanst_choice_required';end if;
 return choice;
end $$;

create function public.tjanst_year_choice_blocker(core jsonb,choice jsonb,support jsonb default null) returns text
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare c jsonb;
begin
 perform public.tjanst_year_choice(choice);
 if choice->>'kind'='unassigned' then return null;end if;
 select x.value into c from jsonb_array_elements(core->'candidates') x where x.value->>'personId'=choice->>'personId';
 if c is null or c->>'personBasisHash' is distinct from choice->>'expectedPersonBasisHash' then return 'person_unavailable';end if;
 if choice->>'kind'='suggestion' and (support is null or support->>'recommendationStatus'<>'ready' or not exists(
  select 1 from jsonb_array_elements(support->'suggestions') x where x.value->>'personId'=choice->>'personId'
   and x.value->>'suggestionId'=choice->>'suggestionId' and x.value->>'evidenceHash'=choice->>'expectedEvidenceHash')) then return 'suggestion_unavailable';end if;
 return null;
end $$;

-- Independent payload calculator: never calls the command parser that plan18 will extend.
create function public.tjanst_year_payload(kind text,p jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare ht jsonb;vt jsonb;
begin
 if kind='row' then
  if not public.phase5_programplan_shape(p,array['rowId','sourceKind','sourceKey','personId','teacherHt','teacherVt','comment'])
   or p->>'sourceKind' is distinct from 'class_timplan' or not public.phase5_apl_text(p->'sourceKey',240,false)
   or coalesce(p->>'sourceKey','')!~'^class_timplan:[0-9a-f-]{36}:[0-9]{4}:.{1,160}$' then
   raise exception 'Invalid row payload' using errcode='22023',hint='tjanst_invalid';end if;
  perform public.tjanst_uuid(to_jsonb(split_part(p->>'sourceKey',':',2)));
  if p->'rowId'<>'null'::jsonb then perform public.tjanst_uuid(p->'rowId');end if;
  ht:=p->'teacherHt';vt:=p->'teacherVt';
 elsif kind='special' then
  if not public.phase5_programplan_shape(p,array['specialId','kind','label','personId','classId','ht','vt','comment'])
   or coalesce(p->>'kind','') not in ('mentor','programansvar','speciallarare','annat') or not public.phase5_apl_text(p->'label',200,false)
   or ((p->>'kind'='mentor') is distinct from (p->'classId'<>'null'::jsonb)) then
   raise exception 'Invalid special payload' using errcode='22023',hint='tjanst_invalid';end if;
  if p->'specialId'<>'null'::jsonb then perform public.tjanst_uuid(p->'specialId');end if;
  if p->'classId'<>'null'::jsonb then perform public.tjanst_uuid(p->'classId');end if;
  ht:=p->'ht';vt:=p->'vt';
 else raise exception 'Invalid payload kind' using errcode='22023',hint='tjanst_invalid';end if;
 if p->'personId'<>'null'::jsonb then perform public.tjanst_uuid(p->'personId');end if;
 if not public.phase5_programplan_integer(ht,0,200000) or not public.phase5_programplan_integer(vt,0,200000)
  or (ht#>>'{}')::integer+(vt#>>'{}')::integer=0 or not public.phase5_apl_text(p->'comment',2000,true) then
  raise exception 'Invalid payload time/comment' using errcode='22023',hint='tjanst_invalid';end if;
 return p;
end $$;

-- No table writes. Output and hash bind all selected choices, affected group members and all group teachers' time.
create function public.tjanst_year_batch(core jsonb,batch jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare base jsonb:=core->'base';action text:=batch->>'action';items jsonb:='[]';blockers jsonb:='[]';totals jsonb:='[]';
 item jsonb;p jsonb;choice jsonb;original jsonb;support jsonb;context jsonb;entry jsonb;grp jsonb;other jsonb;t jsonb;after_person jsonb;
 issue text;item_key text;kind text;gid text;affected text[]:='{}';group_ids text[]:='{}';group_state jsonb:='[]';result jsonb;key text;count_objects integer;
begin
 if not public.phase5_programplan_shape(batch,array['action','baseVersionId','items']) or (action is null or action not in ('move','bulk'))
  or jsonb_typeof(batch->'items') is distinct from 'array' then raise exception 'Invalid year batch' using errcode='22023',hint='tjanst_invalid';end if;
 if batch->'baseVersionId'<>'null'::jsonb then perform public.tjanst_uuid(batch->'baseVersionId');end if;
 if batch->'baseVersionId' is distinct from base->'baseVersionId' then raise exception 'Current base changed' using errcode='40001',hint='tjanst_stale_basis';end if;
 if action='move' and batch->'baseVersionId'='null'::jsonb then raise exception 'Move requires current version' using errcode='22023',hint='tjanst_invalid';end if;
 if jsonb_array_length(batch->'items') not between 1 and 100 then raise exception 'Batch limit' using errcode='22023',hint='tjanst_batch_too_large';end if;
 if (select count(distinct x.value->>'itemKey') from jsonb_array_elements(batch->'items') x)<>jsonb_array_length(batch->'items') then
  raise exception 'Duplicate batch key' using errcode='22023',hint='tjanst_duplicate_row';end if;
 for item in select x.value from jsonb_array_elements(batch->'items') x loop
  item_key:=item->>'itemKey';kind:=item->>'kind';issue:=null;gid:=null;original:=null;support:=null;p:=null;
  if not public.phase5_apl_text(item->'itemKey',200,false) or (kind is null or kind not in ('row','special')) then
   raise exception 'Invalid item' using errcode='22023',hint='tjanst_invalid';end if;
  if action='move' then
   if not public.phase5_programplan_shape(item,array['itemKey','kind','id','fromPersonId','choice']) then raise exception 'Invalid move' using errcode='22023',hint='tjanst_invalid';end if;
   perform public.tjanst_uuid(item->'id');perform public.tjanst_uuid(item->'fromPersonId');choice:=public.tjanst_year_choice(item->'choice');
   if choice->>'kind'='suggestion' or choice->'personId'=item->'fromPersonId' then raise exception 'Invalid move choice' using errcode='22023',hint='tjanst_choice_mismatch';end if;
   key:=kind||':'||(item->>'id');if key=any(affected) then raise exception 'Duplicate move object' using errcode='22023',hint='tjanst_duplicate_row';end if;affected:=array_append(affected,key);
   select x.value into original from jsonb_array_elements(case when kind='row' then core->'rows' else core->'specials' end) x
    where x.value->>'id'=item->>'id' and x.value->'personId'=item->'fromPersonId';
   if original is null then issue:='wrong_scope';end if;
   gid:=original->>'jointGroupId';
   entry:=jsonb_build_object('itemKey',item_key,'kind',kind,'id',item->'id','sourceKey',case when kind='row' then original->'sourceKey' else 'null'::jsonb end,
    'classId',original->'classId','jointGroupId',gid,'before',case when original is null then 'null'::jsonb else jsonb_build_object('personId',original->'personId',
      'ht',case when kind='row' then original->'teacherHt' else original->'ht' end,'vt',case when kind='row' then original->'teacherVt' else original->'vt' end) end,
    'after',case when original is null then 'null'::jsonb else jsonb_build_object('personId',choice->'personId',
      'ht',case when kind='row' then original->'teacherHt' else original->'ht' end,'vt',case when kind='row' then original->'teacherVt' else original->'vt' end) end);
   if gid is not null and not gid=any(group_ids) then group_ids:=array_append(group_ids,gid);end if;
  else
   if not public.phase5_programplan_shape(item,case when kind='row' then array['itemKey','kind','payload'] else array['itemKey','kind','payload','choice'] end) then
    raise exception 'Invalid bulk' using errcode='22023',hint='tjanst_invalid';end if;
   p:=item->'payload';context:=p->'planningContext';
   if kind='row' then
    if not public.phase5_programplan_shape(context,array['baseVersionId','expectedBasisHash','choice']) or context->'baseVersionId' is distinct from batch->'baseVersionId'
     or coalesce(context->>'expectedBasisHash','')!~'^sha256:[a-f0-9]{64}$' then raise exception 'Planning context required' using errcode='22023',hint='tjanst_context_required';end if;
    choice:=public.tjanst_year_choice(context->'choice');
    perform public.tjanst_year_payload('row',p-'planningContext');
    if p->'rowId'<>'null'::jsonb or p->'personId' is distinct from choice->'personId' or split_part(p->>'sourceKey',':',3)<>(base->>'schoolYear') then
     raise exception 'Invalid bulk row' using errcode='22023',hint='tjanst_invalid';end if;
    if exists(select 1 from jsonb_array_elements(core->'needs') c cross join lateral jsonb_array_elements(c.value->'needs') n where n.value->>'sourceKey'=p->>'sourceKey') then
     support:=public.tjanst_year_row(core,p->>'sourceKey',null);
     if support->>'basisHash'<>context->>'expectedBasisHash' then issue:='stale_basis';end if;
    else issue:='unknown_need';end if;
    if exists(select 1 from jsonb_array_elements(core->'rows') x where x.value->>'sourceKey'=p->>'sourceKey' and x.value->'personId'=p->'personId')
     or exists(select 1 from jsonb_array_elements(items) x where x.value->>'sourceKey'=p->>'sourceKey' and x.value->'after'->'personId'=p->'personId') then issue:='duplicate_row';end if;
    entry:=jsonb_build_object('itemKey',item_key,'kind',kind,'id',null,'sourceKey',p->'sourceKey','classId',split_part(p->>'sourceKey',':',2),'jointGroupId',null,'before',null,
     'after',jsonb_build_object('personId',p->'personId','ht',p->'teacherHt','vt',p->'teacherVt'));
   else
    choice:=public.tjanst_year_choice(item->'choice');
    perform public.tjanst_year_payload('special',p);
    if p->'specialId'<>'null'::jsonb or choice->>'kind'='suggestion' or choice->'personId' is distinct from p->'personId' or (p->>'kind'='mentor' and p->'classId'='null'::jsonb) then
     raise exception 'Invalid bulk special' using errcode='22023',hint='tjanst_invalid';end if;
    if p->'classId'<>'null'::jsonb and not exists(select 1 from jsonb_array_elements(core->'needs') c where c.value->'classId'=p->'classId') then issue:='unknown_class';end if;
    entry:=jsonb_build_object('itemKey',item_key,'kind',kind,'id',null,'sourceKey',null,'classId',p->'classId','jointGroupId',null,'before',null,
     'after',jsonb_build_object('personId',p->'personId','ht',p->'ht','vt',p->'vt'));
   end if;
   affected:=array_append(affected,'new:'||item_key);
  end if;
  issue:=coalesce(issue,public.tjanst_year_choice_blocker(core,choice,support));
  if batch->'baseVersionId' is distinct from base->'baseVersionId' then issue:='stale_basis';end if;
  if issue is not null then blockers:=blockers||jsonb_build_array(jsonb_build_object('itemKey',item_key,'groupId',gid,'code',issue));end if;
  items:=items||jsonb_build_array(entry);
 end loop;
 -- Whole affected groups are bound, including members/teachers that are NOT moved.
 for grp in select x.value from jsonb_array_elements(core->'joints') x where x.value->>'id'=any(group_ids) loop
  group_state:=group_state||jsonb_build_array(grp||jsonb_build_object('members',(select jsonb_agg(r.value order by r.value->>'id')
   from jsonb_array_elements(core->'rows') r where r.value->>'jointGroupId'=grp->>'id')));
  for key in select 'row:'||(x.value#>>'{}') from jsonb_array_elements(grp->'rowIds') x loop
   if not key=any(affected) then affected:=array_append(affected,key);end if;
  end loop;
  for item in select x.value from jsonb_array_elements(batch->'items') x where x.value->>'kind'='row' and exists(
    select 1 from jsonb_array_elements(items) e where e.value->>'itemKey'=x.value->>'itemKey' and e.value->>'jointGroupId'=grp->>'id') loop
   issue:=null;choice:=item->'choice';
   if exists(select 1 from jsonb_array_elements(core->'rows') r where r.value->>'jointGroupId'=grp->>'id' and r.value->'personId'=item->'fromPersonId'
     and not exists(select 1 from jsonb_array_elements(batch->'items') i where i.value->>'kind'='row' and i.value->'id'=r.value->'id'
       and i.value->'fromPersonId'=item->'fromPersonId' and i.value->'choice'->'personId'=choice->'personId')) then issue:='joint_incomplete';end if;
   if choice->'personId'='null'::jsonb or exists(select 1 from jsonb_array_elements(grp->'teachers') tt where tt.value->'personId'=choice->'personId')
    or exists(select 1 from jsonb_array_elements(batch->'items') i join jsonb_array_elements(items) e on e.value->>'itemKey'=i.value->>'itemKey'
      where e.value->>'jointGroupId'=grp->>'id' and i.value->'fromPersonId'<>item->'fromPersonId' and i.value->'choice'->'personId'=choice->'personId') then issue:='joint_person_collision';end if;
   select x.value into t from jsonb_array_elements(grp->'teachers') x where x.value->'personId'=item->'fromPersonId';
   if t is null then issue:='joint_incomplete';end if;
   if issue is not null then blockers:=blockers||jsonb_build_array(jsonb_build_object('itemKey',item->'itemKey','groupId',grp->'id','code',issue));end if;
   if t is not null and choice->'personId'<>'null'::jsonb and not exists(select 1 from jsonb_array_elements(totals) x where x.value->'jointId'=grp->'id' and x.value->'personId'=choice->'personId') then
    totals:=totals||jsonb_build_array(jsonb_build_object('jointId',grp->'id','personId',choice->'personId','ht',t->'ht','vt',t->'vt'));end if;
  end loop;
 end loop;
 -- Compare final moved rows against ALL other final rows, including other selections and unchanged vacancies.
 if action='move' then
  for entry in select x.value from jsonb_array_elements(items) x where x.value->>'kind'='row' and x.value->'after'<>'null'::jsonb loop
   if exists(select 1 from jsonb_array_elements(core->'rows') r where r.value->'id'<>entry->'id' and r.value->'sourceKey'=entry->'sourceKey'
     and coalesce((select e.value->'after'->'personId' from jsonb_array_elements(items) e where e.value->'id'=r.value->'id' and e.value->'after'<>'null'::jsonb),r.value->'personId')=entry->'after'->'personId') then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('itemKey',entry->'itemKey','groupId',entry->'jointGroupId','code','duplicate_row'));end if;
  end loop;
 end if;
 count_objects:=cardinality(affected);
 if count_objects>100 then for entry in select x.value from jsonb_array_elements(items) x loop
  blockers:=blockers||jsonb_build_array(jsonb_build_object('itemKey',entry->'itemKey','groupId',entry->'jointGroupId','code','batch_too_large'));end loop;end if;
 select coalesce(jsonb_agg(b.value order by b.value->>'itemKey',b.value->>'code',b.value->>'groupId'),'[]') into blockers from (select distinct x.value from jsonb_array_elements(blockers) x) b;
 result:=base||jsonb_build_object('mode','batch','action',action,'items',items,'selectedCount',jsonb_array_length(items),'writeObjectCount',count_objects,'jointTotals',totals,'blockers',blockers);
 return result||jsonb_build_object('previewHash',public.tjanst_year_hash('preview',jsonb_build_object('result',result,'request',batch,
   'candidates',core->'candidates','groups',group_state)));
end $$;

create function public.tjanst_year_preview(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;unit uuid;year integer;mode text;row_id uuid;core jsonb;result jsonb;
begin
 if input is null or octet_length(input::text)>65536 or jsonb_typeof(input) is distinct from 'object' then
  raise exception 'Invalid year preview input' using errcode='22023',hint='tjanst_input_too_large';end if;
 mode:=input->>'mode';
 if (mode is null or mode not in ('catalog','row','batch')) or not public.phase5_programplan_shape(input,case mode when 'catalog' then array['mode','unitId','schoolYear']
   when 'row' then case when input ? 'rowId' then array['mode','unitId','schoolYear','sourceKey','rowId'] else array['mode','unitId','schoolYear','sourceKey'] end
   else array['mode','unitId','schoolYear','batch'] end) or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) then
  raise exception 'Invalid year preview request' using errcode='22023',hint='tjanst_invalid';end if;
 unit:=public.tjanst_uuid(input->'unitId');year:=(input->>'schoolYear')::integer;
 a:=public.tjanst_actor('plan');if a.function not in ('rektor','administrator') then raise exception 'Year preview denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);core:=public.tjanst_year_core(a,unit,year);
 if mode='catalog' then result:=public.tjanst_year_catalog(core);
 elsif mode='row' then
  if not public.phase5_apl_text(input->'sourceKey',240,false) then raise exception 'Invalid source' using errcode='22023',hint='tjanst_invalid';end if;
  if input ? 'rowId' and input->'rowId'<>'null'::jsonb then row_id:=public.tjanst_uuid(input->'rowId');end if;
  result:=public.tjanst_year_row(core,input->>'sourceKey',row_id);
 else result:=public.tjanst_year_batch(core,input->'batch');end if;
 perform public.tjanst_audit('tjanst_year_preview_read','tjanst_distribution',null,
  jsonb_build_object('unitId',unit,'schoolYear',year,'mode',mode,'count',case when mode='batch' then result->'selectedCount' else result->'totalCandidates' end));
 return result;
end $$;

create or replace function public.tjanst_audit(operation text,object_type text,object_id uuid,details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if operation is null or operation not in ('tjanst_personal_read','tjanst_personal_status_read','tjanst_person_created','tjanst_person_updated',
   'tjanst_draft_teacher_created','tjanst_employment_saved','tjanst_duties_saved',
   'tjanst_plan_read','tjanst_plan_command','tjanst_plan_published','tjanst_plan_status_read','tjanst_self_read',
   'tjanst_self_command','tjanst_self_status_read','tjanst_staffing_read','tjanst_year_preview_read')
  or object_type is null or object_type not in ('staff_person','tjanst_command','tjanst_distribution','tjanst_version','organizer')
  or not coalesce(public.tjanst_audit_details(details),false) then
  raise exception 'Invalid service allocation audit' using errcode='22023',hint='tjanst_invalid';end if;
 a:=public.phase3_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,object_type,object_id,'ok',details);
 exception when others then raise exception 'Service allocation audit unavailable' using errcode='55000';end;
end $$;

revoke all on function public.tjanst_year_hash(text,jsonb),public.tjanst_year_core(public.access_assignments,uuid,integer),
 public.tjanst_year_catalog(jsonb),public.tjanst_year_history(uuid,integer),public.tjanst_year_recommendations(jsonb,jsonb),public.tjanst_year_row(jsonb,text,uuid),
 public.tjanst_year_payload(text,jsonb),public.tjanst_year_choice(jsonb),public.tjanst_year_choice_blocker(jsonb,jsonb,jsonb),public.tjanst_year_batch(jsonb,jsonb),public.tjanst_year_preview(jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;
