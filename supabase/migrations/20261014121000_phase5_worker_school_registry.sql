-- Activate only the two reviewed entrypoints after actual Worker preflight.
revoke all on function public.phase5_school_registry_list(),public.phase5_school_registry_save(jsonb,jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.phase5_school_registry_list(),public.phase5_school_registry_save(jsonb,jsonb,jsonb,boolean) to skolplattform_worker;
