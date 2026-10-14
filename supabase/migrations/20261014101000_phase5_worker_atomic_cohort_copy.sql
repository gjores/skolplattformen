-- Only this exact entrypoint is activated after source-bound actual Worker preflight.
revoke all on function public.phase5_copy_programplan_education(uuid,uuid,integer,integer,uuid,text,text,text,jsonb,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.phase5_copy_programplan_education(uuid,uuid,integer,integer,uuid,text,text,text,jsonb,boolean)
 to skolplattform_worker;
