-- 05-23 A: v2 basis and stable choice-block frame rows. No data backfill or grants.
-- Same-signature definitions were read from the protected target immediately before editing.
create function public.phase5_programplan_choice_block_diagnostics(reference jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare payload jsonb; program jsonb; orientation jsonb; subject jsonb; block jsonb; slot jsonb;
 required jsonb:='[]'; diagnostics jsonb:='[]'; seen text[]:='{}'; id text; kind text; total integer:=0;
begin
 if not reference ? 'choiceBlocks' then return '[]'::jsonb; end if;
 if not public.phase5_programplan_array(reference->'choiceBlocks',200) then return '[{"code":"invalid_choice_blocks"}]'::jsonb; end if;
 for block in select value from jsonb_array_elements(reference->'choiceBlocks') loop
  if not public.phase5_programplan_shape(block,array['id','kind','points','name'])
   or jsonb_typeof(block->'id') is distinct from 'string' or block->>'id' !~ '^[a-z][a-z0-9]{0,15}$'
   or jsonb_typeof(block->'kind') is distinct from 'string'
   or block->>'kind' not in ('modernLanguage','languageSubject','naturalScience','specialization','individualChoice')
   or not public.phase5_programplan_integer(block->'points',1,10000)
   or not public.phase5_programplan_text(block->'name',1000)
   or btrim(block->>'name',U&'\0009\000a\000b\000c\000d\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff')='' then
   return '[{"code":"invalid_choice_blocks"}]'::jsonb;
  end if;
 end loop;
 select c.payload into payload from public.programplan_catalogs c where c.catalog_id=reference->>'catalogId';
 select value into program from jsonb_array_elements(payload->'programs') where value->>'code'=reference->'programRef'->>'code';
 select value into orientation from jsonb_array_elements(program->'orientations') where value->>'code'=reference->>'orientationCode';
 for subject in select value from jsonb_array_elements(program->'programmeSpecific')
  union all select value from jsonb_array_elements(coalesce(orientation->'subjects','[]'::jsonb)) loop
  if subject->>'code' in ('MOSP','SPRK','NAVE') and jsonb_array_length(subject->'levels')=0 then
   id:=case subject->>'code' when 'MOSP' then 'mosp' when 'SPRK' then 'sprk' else 'nave' end;
   kind:=case subject->>'code' when 'MOSP' then 'modernLanguage' when 'SPRK' then 'languageSubject' else 'naturalScience' end;
   required:=required||jsonb_build_array(jsonb_build_object('id',id,'kind',kind,'points',subject->'points','name',subject->'name'));
  end if;
 end loop;
 for block in select value from jsonb_array_elements(reference->'choiceBlocks') loop
  if block->>'id'=any(seen) then diagnostics:=diagnostics||'[{"code":"duplicate_choice_block"}]'::jsonb; end if;
  seen:=array_append(seen,block->>'id');
  select value into slot from jsonb_array_elements(required) where value->>'id'=block->>'id';
  if slot is not null and (slot->'kind' is distinct from block->'kind' or slot->'points' is distinct from block->'points' or slot->'name' is distinct from block->'name') then
   diagnostics:=diagnostics||'[{"code":"slot_block_mismatch"}]'::jsonb;
  end if;
  if slot is null and (block->>'id' in ('mosp','sprk','nave') or block->>'kind' not in ('specialization','individualChoice')) then
   diagnostics:=diagnostics||'[{"code":"unexpected_slot_block"}]'::jsonb;
  end if;
  if block->>'kind'='individualChoice' then total:=total+(block->>'points')::integer; end if;
 end loop;
 for slot in select value from jsonb_array_elements(required) loop
  if not slot->>'id'=any(seen) then diagnostics:=diagnostics||'[{"code":"missing_slot_block"}]'::jsonb; end if;
 end loop;
 if total<>200 then diagnostics:=diagnostics||'[{"code":"individual_choice_points_mismatch"}]'::jsonb; end if;
 return diagnostics;
end $$;

-- Group optional subjects in catalog order by identical point sequences.
create function public.phase5_programplan_alternative_groups(subjects jsonb) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog,public as $$
declare subject jsonb; signature jsonb; groups jsonb:='[]'; candidate jsonb; result jsonb:='[]'; index integer; found_index integer;
begin
 for subject in select value from jsonb_array_elements(subjects) loop
  if subject->'optional'<>'true'::jsonb or subject->'subjectVersion'='null'::jsonb or jsonb_array_length(subject->'levels')=0 then continue; end if;
  select jsonb_agg(value->'points' order by n) into signature from jsonb_array_elements(subject->'levels') with ordinality e(value,n);
  found_index:=null;
  for candidate,index in select value,(n-1)::integer from jsonb_array_elements(groups) with ordinality e(value,n) loop
   if candidate->'signature'=signature then found_index:=index; exit; end if;
  end loop;
  if found_index is null then groups:=groups||jsonb_build_array(jsonb_build_object('signature',signature,'subjects',jsonb_build_array(subject)));
  else groups:=jsonb_set(groups,array[found_index::text,'subjects'],(groups->found_index->'subjects')||jsonb_build_array(subject)); end if;
 end loop;
 for candidate in select value from jsonb_array_elements(groups) loop
  if jsonb_array_length(candidate->'subjects')>1 then result:=result||jsonb_build_array(candidate->'subjects'); end if;
 end loop;
 return result;
end $$;

CREATE OR REPLACE FUNCTION public.phase5_resolve_programplan_basis(reference jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare cat jsonb; cid text; pr jsonb; p jsonb; o jsonb; selected jsonb; s jsonb; i jsonb; block jsonb; b jsonb; l jsonb; block_id text;
 reason text; started text; diagnostics jsonb:='[]'; unresolved jsonb:='[]'; fixed text[]:='{}'; seen text[]:='{}'; options jsonb:='[]'; base jsonb; handled boolean;
begin
 if jsonb_typeof(reference) is distinct from 'object' or not reference ? 'catalogId' or not reference ? 'programRef' then return public.phase5_programplan_blocked('unpinned_basis'); end if;
 if not reference ? 'startedOn' or reference->'startedOn'='null'::jsonb or reference->>'startedOn'='' then return public.phase5_programplan_blocked('unknown_education_start'); end if;
 if not public.phase5_programplan_shape(reference,array['catalogId','programRef','orientationCode','startedOn','specializationRefs'])
  and not public.phase5_programplan_shape(reference,array['catalogId','programRef','orientationCode','startedOn','specializationRefs','choiceBlocks']) then return public.phase5_programplan_blocked('invalid_basis_reference'); end if;
 if jsonb_typeof(reference->'catalogId') is distinct from 'string' or reference->>'catalogId' !~ '^sha256:[0-9a-f]{64}$' then return public.phase5_programplan_blocked('invalid_catalog_id'); end if;
 cid:=reference->>'catalogId'; pr:=reference->'programRef';
 if not public.phase5_programplan_shape(pr,array['code','version']) or not public.phase5_programplan_code(pr->'code') or not public.phase5_programplan_integer(pr->'version',1,100000)
  or not (reference->'orientationCode'='null'::jsonb or public.phase5_programplan_code(reference->'orientationCode'))
  or not public.phase5_programplan_date(reference->'startedOn') or not public.phase5_programplan_array(reference->'specializationRefs',200) then return public.phase5_programplan_blocked('invalid_basis_reference',cid); end if;
 for selected in select value from jsonb_array_elements(reference->'specializationRefs') loop
  if not public.phase5_programplan_shape(selected,array['subjectCode','subjectVersion','itemCode','points']) or not public.phase5_programplan_code(selected->'subjectCode')
   or not public.phase5_programplan_code(selected->'itemCode') or not public.phase5_programplan_integer(selected->'subjectVersion',1,100000) or not public.phase5_programplan_integer(selected->'points',0,10000) then return public.phase5_programplan_blocked('invalid_basis_reference',cid); end if;
 end loop;
 select payload into cat from public.programplan_catalogs where catalog_id=cid;
 if not found then return public.phase5_programplan_blocked('catalog_unavailable',cid,pr); end if;
 select value into p from jsonb_array_elements(cat->'programs') where value->>'code'=pr->>'code';
 if p is null then return public.phase5_programplan_blocked('program_not_found',cid,pr); end if;
 if p->'version' is distinct from pr->'version' then return public.phase5_programplan_blocked('historical_version_missing',cid,pr); end if;
 started:=reference->>'startedOn'; reason:=public.phase5_programplan_date_diagnostic(p,started);
 if reason is not null then return public.phase5_programplan_blocked(reason,cid,pr); end if;
 if reference->'orientationCode'<>'null'::jsonb then
  select value into o from jsonb_array_elements(p->'orientations') where value->>'code'=reference->>'orientationCode';
  if o is null then return public.phase5_programplan_blocked('orientation_not_found',cid,pr); end if;
 elsif jsonb_array_length(p->'orientations')>0 then return public.phase5_programplan_blocked('orientation_required',cid,pr); end if;
 diagnostics:=diagnostics||public.phase5_programplan_choice_block_diagnostics(reference);
 for block_id,block in select 'foundation',p->'foundation' union all select 'programmeSpecific',p->'programmeSpecific' union all select 'orientation',o->'subjects' where o is not null loop
  for b in select value from jsonb_array_elements(block) loop
   base:=jsonb_build_object('blockId',block_id,'subjectCode',b->>'code','points',b->'points');
   handled:=reference ? 'choiceBlocks' and (
    (b->>'code' in ('MOSP','SPRK','NAVE') and jsonb_array_length(b->'levels')=0)
    or exists(select 1 from jsonb_array_elements(public.phase5_programplan_alternative_groups(block)) g,lateral jsonb_array_elements(g) x where x->>'code'=b->>'code'));
   if (b->>'optional')::boolean and not handled then unresolved:=unresolved||jsonb_build_array(base||jsonb_build_object('kind','optional_subject')); end if;
   if jsonb_array_length(b->'levels')=0 then
    if not handled then unresolved:=unresolved||jsonb_build_array(base||jsonb_build_object('kind','subject_levels_unresolved')); end if;
    continue; end if;
   select value into s from jsonb_array_elements(cat->'subjects') where value->>'code'=b->>'code' and value->'version'=b->'subjectVersion';
   if s is null then diagnostics:=diagnostics||jsonb_build_array(jsonb_build_object('code','historical_version_missing','subjectCode',b->>'code','blockId',block_id)); continue; end if;
   diagnostics:=diagnostics||public.phase5_programplan_subject_diagnostics(s,started,block_id);
   for l in select value from jsonb_array_elements(b->'levels') loop fixed:=array_append(fixed,l->>'code'); end loop;
  end loop;
 end loop;
 for b in select value from jsonb_array_elements(p->'specialization') loop
  if jsonb_array_length(b->'levels')=0 then unresolved:=unresolved||jsonb_build_array(jsonb_build_object('kind','subject_levels_unresolved','blockId','specialization','subjectCode',b->>'code','points',b->'points')); continue; end if;
  select value into s from jsonb_array_elements(cat->'subjects') where value->>'code'=b->>'code' and value->'version'=b->'subjectVersion';
  if s is null then diagnostics:=diagnostics||jsonb_build_array(jsonb_build_object('code','historical_version_missing','subjectCode',b->>'code','blockId','specialization')); continue; end if;
  for l in select value from jsonb_array_elements(b->'levels') loop
   if not l->>'code'=any(fixed) then options:=options||jsonb_build_array(jsonb_build_object('subjectCode',s->>'code','subjectVersion',s->'version','itemCode',l->>'code','points',l->'points')); end if;
  end loop;
 end loop;
 for selected in select value from jsonb_array_elements(reference->'specializationRefs') loop
  base:=jsonb_build_object('subjectCode',selected->>'subjectCode','itemCode',selected->>'itemCode');
  if selected->>'itemCode'=any(seen) then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','duplicate_selected_level')); continue; end if;
  seen:=array_append(seen,selected->>'itemCode');
  select value into s from jsonb_array_elements(cat->'subjects') where value->>'code'=selected->>'subjectCode';
  if s is null then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','subject_not_found')); continue; end if;
  if s->'version' is distinct from selected->'subjectVersion' then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','historical_version_missing')); continue; end if;
  diagnostics:=diagnostics||public.phase5_programplan_subject_diagnostics(s,started,'specialization');
  select value into i from jsonb_array_elements(s->'items') where value->>'code'=selected->>'itemCode';
  if i is null then
   reason:=case when exists(select 1 from jsonb_array_elements(cat->'subjects') a, lateral jsonb_array_elements(a->'items') x where x->>'code'=selected->>'itemCode') then 'wrong_subject' else 'item_not_found' end;
   diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code',reason)); continue;
  end if;
  if i->'points' is distinct from selected->'points' then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','points_mismatch')); continue; end if;
  if i->>'code'=any(fixed) then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','fixed_level_duplicate')); continue; end if;
  if not options @> jsonb_build_array(selected) then diagnostics:=diagnostics||jsonb_build_array(base||jsonb_build_object('code','not_specialization_option')); end if;
 end loop;
 unresolved:=unresolved||jsonb_build_array(jsonb_build_object('kind','program_rules_unverified','blockId','program','category',p->>'category'));
 return jsonb_build_object('status',case when jsonb_array_length(diagnostics)=0 then 'resolved' else 'blocked' end,'catalogId',cid,'programRef',pr,'diagnostics',diagnostics,'unresolvedChoices',unresolved,'decisionReady',false);
end $function$;

create function public.phase5_programplan_choice_blocks(reference jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb:='[]'; block jsonb; part text;
begin
 if public.phase5_resolve_programplan_basis(reference)->>'status' is distinct from 'resolved' then raise exception 'Invalid programplan blocks' using errcode='22023'; end if;
 for block in select value from jsonb_array_elements(coalesce(reference->'choiceBlocks','[]'::jsonb)) loop
  part:=case block->>'kind' when 'modernLanguage' then 'programmeSpecific' when 'languageSubject' then 'orientation' when 'naturalScience' then 'orientation' when 'specialization' then 'specialization' else 'individualChoice' end;
  result:=result||jsonb_build_array(block||jsonb_build_object('part',part,'rowKey','block:'||(block->>'id')));
 end loop;
 return result;
end $$;
CREATE OR REPLACE FUNCTION public.phase5_programplan_term_rows(reference jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare resolution jsonb; payload jsonb; program jsonb; orientation jsonb; block jsonb; subject jsonb; level jsonb; selected jsonb;
 rows jsonb:='[]'; part text; key text; group_subjects jsonb; position integer;
begin
 resolution:=public.phase5_resolve_programplan_basis(reference);
 if resolution->>'status' is distinct from 'resolved' then raise exception 'Invalid programplan terms' using errcode='22023'; end if;
 select c.payload into payload from public.programplan_catalogs c where c.catalog_id=reference->>'catalogId';
 select value into program from jsonb_array_elements(payload->'programs') where value->>'code'=reference->'programRef'->>'code' and value->'version'=reference->'programRef'->'version';
 select value into orientation from jsonb_array_elements(program->'orientations') where value->>'code'=reference->>'orientationCode';
 foreach part in array array['foundation','programmeSpecific','orientation'] loop
  block:=case when part='orientation' then coalesce(orientation->'subjects','[]'::jsonb) else program->part end;
  for subject in select value from jsonb_array_elements(block) loop
   if subject->'optional'='false'::jsonb and subject->'subjectVersion'<>'null'::jsonb then
    for level in select value from jsonb_array_elements(subject->'levels') loop
     key:=part||':'||(subject->>'code')||':'||((subject->>'subjectVersion')::numeric::integer)::text||':'||(level->>'code');
     rows:=rows||jsonb_build_array(jsonb_build_object('key',key,'points',level->'points'));
    end loop;
   end if;
  end loop;
  if reference ? 'choiceBlocks' then
   for group_subjects in select value from jsonb_array_elements(public.phase5_programplan_alternative_groups(block)) loop
    for position in 0..jsonb_array_length(group_subjects->0->'levels')-1 loop
     select 'alternative:'||part||':'||string_agg((value->>'code')||':'||((value->>'subjectVersion')::integer)::text||':'||(value->'levels'->position->>'code'),'+' order by n)
      into key from jsonb_array_elements(group_subjects) with ordinality e(value,n);
     rows:=rows||jsonb_build_array(jsonb_build_object('key',key,'points',group_subjects->0->'levels'->position->'points'));
    end loop;
   end loop;
  end if;
 end loop;
 for selected in select value from jsonb_array_elements(reference->'specializationRefs') loop
  key:='specialization:'||(selected->>'subjectCode')||':'||((selected->>'subjectVersion')::numeric::integer)::text||':'||(selected->>'itemCode');
  rows:=rows||jsonb_build_array(jsonb_build_object('key',key,'points',selected->'points'));
 end loop;
 if not reference ? 'choiceBlocks' then return rows||'[{"key":"meta:individualChoice","points":200},{"key":"meta:diplomaWork","points":100}]'::jsonb; end if;
 for selected in select value from jsonb_array_elements(public.phase5_programplan_choice_blocks(reference)) loop
  rows:=rows||jsonb_build_array(jsonb_build_object('key',selected->'rowKey','points',selected->'points'));
 end loop;
 return rows||'[{"key":"meta:diplomaWork","points":100}]'::jsonb;
end $function$;
CREATE OR REPLACE FUNCTION public.phase5_programplan_validate_basis(reference jsonb, offering offerings, previous_choices text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare resolution jsonb; choices text[];
begin
 resolution:=public.phase5_resolve_programplan_basis(reference);
 if resolution->>'status' is distinct from 'resolved' or reference->'programRef'->>'code' is distinct from offering.program_code
  or reference->>'orientationCode' is distinct from offering.orientation_code then raise exception 'Invalid programplan basis' using errcode='22023'; end if;
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(reference->'specializationRefs') with ordinality e(value,n);
 if previous_choices is not null and choices is distinct from previous_choices then raise exception 'Legacy choices mismatch' using errcode='22023'; end if;
end $function$;

revoke all on function public.phase5_programplan_choice_block_diagnostics(jsonb),
 public.phase5_programplan_alternative_groups(jsonb),public.phase5_programplan_choice_blocks(jsonb)
 from public,anon,authenticated,skolplattform_worker,service_role;
-- Replaced functions preserve existing ACLs; this migration opens no Worker entrypoint.
