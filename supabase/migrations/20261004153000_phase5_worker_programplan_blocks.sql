-- 05-23 B: only after successful built-Worker block preflight and exact ACL restoration.
revoke execute on function public.phase5_replace_programplan_blocks(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.phase5_replace_programplan_blocks(uuid,integer,jsonb) to skolplattform_worker;
