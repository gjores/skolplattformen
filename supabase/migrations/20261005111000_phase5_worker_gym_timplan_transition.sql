-- Exact entrypoints only, after actual built Worker preflight and restored ACL.
revoke all on function public.phase5_gym_timplan_underlag(uuid),public.phase5_create_gym_timplan(uuid,uuid,integer,integer,uuid,uuid,integer),public.phase5_read_gym_timplan(uuid),public.phase5_write_gym_timplan_row(uuid,integer,text,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.phase5_gym_timplan_underlag(uuid),public.phase5_create_gym_timplan(uuid,uuid,integer,integer,uuid,uuid,integer),public.phase5_read_gym_timplan(uuid),public.phase5_write_gym_timplan_row(uuid,integer,text,jsonb) to skolplattform_worker;
