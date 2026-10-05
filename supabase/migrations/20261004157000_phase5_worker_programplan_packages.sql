-- 05-23 D: exactly two grants after built Worker preflight and restoration of the 19-entrypoint profile.
revoke execute on function public.phase5_save_programplan_package(uuid,integer,jsonb),public.phase5_list_programplan_packages(uuid) from public,anon,authenticated,service_role;
grant execute on function public.phase5_save_programplan_package(uuid,integer,jsonb),public.phase5_list_programplan_packages(uuid) to skolplattform_worker;
