-- Apply only after rollback-only SQL proof and real Worker/API preflight with restored ACL.
revoke execute on function public.phase5_read_programplan_terms(uuid),public.phase5_write_programplan_terms(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.phase5_read_programplan_terms(uuid),public.phase5_write_programplan_terms(uuid,integer,jsonb) to skolplattform_worker;
