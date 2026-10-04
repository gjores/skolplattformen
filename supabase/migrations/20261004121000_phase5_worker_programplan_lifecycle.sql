-- 05-20: endast efter full livscykel-API-preflight med återställd exakt ACL.
revoke execute on function public.phase5_change_programplan_education(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.phase5_change_programplan_education(uuid,integer,text,jsonb) to skolplattform_worker;
