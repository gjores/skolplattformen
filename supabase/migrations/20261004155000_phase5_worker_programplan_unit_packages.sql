-- 05-23 C: exact two-entrypoint grant after built Worker preflight and restored previous ACL.
revoke execute on function public.phase5_read_programplan_unit_packages(uuid),public.phase5_write_programplan_unit_packages(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.phase5_read_programplan_unit_packages(uuid),public.phase5_write_programplan_unit_packages(uuid,uuid,integer,text,jsonb) to skolplattform_worker;
