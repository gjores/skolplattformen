-- Run only inside the isolated rollback verifier after the exact forward migration.
-- Full mutation/role/return/receipt/hours cases live in verify-vocational-plan-decisions.mjs.
do $$
declare entry record;program jsonb;source jsonb;profile jsonb;checked integer:=0;
begin
 for entry in select catalog_id,payload from public.programplan_catalogs order by catalog_id loop
  for program in select value from jsonb_array_elements(entry.payload->'programs') where value->>'code' in
   ('BA25','BF25','EE25','FR25','FS25','FT25','HT25','IN25','NB25','RL25','VF25','VO25','SA25') loop
   source:=jsonb_build_object('catalogId',entry.catalog_id,'basisReference',jsonb_build_object('programRef',
    jsonb_build_object('code',program->>'code','version',program->'version'),'startedOn','2027-08-01'));
   profile:=public.phase5_plan_decision_profile(source);
   if program->>'code'='SA25' then
    if profile<>jsonb_build_object('points',2500,'hours',2180,'vocational',false) then raise exception 'HE regression';end if;
   elsif program->>'code' in ('BF25','HT25','VO25') then
    if profile<>jsonb_build_object('points',2700,'hours',2625,'vocational',true) then raise exception '2700 profile mismatch';end if;
   else
    if profile<>jsonb_build_object('points',2800,'hours',2720,'vocational',true) then raise exception '2800 profile mismatch';end if;
   end if;
   if profile is null then raise exception 'National profile missing';end if;
   checked:=checked+1;
  end loop;
 end loop;
 if checked<13 then raise exception 'Required frozen national profiles missing';end if;
 if public.phase5_plan_decision_profile('{"catalogId":"unknown","basisReference":{"programRef":{"code":"BF25","version":1}}}') is not null then
  raise exception 'Unknown source trusted';end if;
 if has_function_privilege('skolplattform_worker','public.phase5_plan_decision_profile(jsonb)','execute')
  or has_function_privilege('anon','public.phase5_plan_decision_profile(jsonb)','execute')
  or has_function_privilege('authenticated','public.phase5_plan_decision_profile(jsonb)','execute') then raise exception 'Private profile helper opened';end if;
end $$;
