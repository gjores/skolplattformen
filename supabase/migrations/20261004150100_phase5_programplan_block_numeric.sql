-- 05-23 A correction: normalize already-validated integral JSON numbers before summing.
-- Current definition was read with pg_get_functiondef from the protected target.
CREATE OR REPLACE FUNCTION public.phase5_programplan_choice_block_diagnostics(reference jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  if block->>'kind'='individualChoice' then total:=total+(block->>'points')::numeric::integer; end if;
 end loop;
 for slot in select value from jsonb_array_elements(required) loop
  if not slot->>'id'=any(seen) then diagnostics:=diagnostics||'[{"code":"missing_slot_block"}]'::jsonb; end if;
 end loop;
 if total<>200 then diagnostics:=diagnostics||'[{"code":"individual_choice_points_mismatch"}]'::jsonb; end if;
 return diagnostics;
end $function$;

revoke all on function public.phase5_programplan_choice_block_diagnostics(jsonb)
 from public,anon,authenticated,skolplattform_worker,service_role;
