-- 05-04: 29/29 real API preflight cases passed against the protected Worker.
-- Only the two audited entrypoints may be called; internal helpers stay closed.
revoke execute on function public.phase5_read_timplan(uuid) from public, anon, authenticated;
revoke execute on function public.phase5_change_timplan_cell(uuid,integer,text,integer,integer) from public, anon, authenticated;
revoke execute on function public.phase5_timplan_scope(uuid,boolean) from public, anon, authenticated, skolplattform_worker;
revoke execute on function public.phase5_timplan_audit(uuid,text) from public, anon, authenticated, skolplattform_worker;
grant execute on function public.phase5_read_timplan(uuid) to skolplattform_worker;
grant execute on function public.phase5_change_timplan_cell(uuid,integer,text,integer,integer) to skolplattform_worker;
