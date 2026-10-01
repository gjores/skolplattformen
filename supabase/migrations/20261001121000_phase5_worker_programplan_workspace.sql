-- 05-10: only after full workspace API preflight and exact ACL restoration.
revoke execute on function public.phase5_list_programplan_offerings(integer),
 public.phase5_programplan_workspace(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.phase5_list_programplan_offerings(integer),
 public.phase5_programplan_workspace(uuid,integer,text) to skolplattform_worker;
