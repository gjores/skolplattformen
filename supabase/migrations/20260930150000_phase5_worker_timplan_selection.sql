-- 05-05: tillämpas endast efter godkänd API-preflight och återställd ACL.
revoke execute on function public.phase5_list_timplans(integer) from public,anon,authenticated;
revoke execute on function public.phase5_timplan_scope(uuid,boolean),public.phase5_timplan_audit(uuid,text) from public,anon,authenticated,skolplattform_worker;
grant execute on function public.phase5_list_timplans(integer) to skolplattform_worker;
