-- Activate only with the coherent named-plan Worker and preceding package migrations.
revoke all on function public.phase5_named_timplan_create(jsonb),public.phase5_named_timplan_rename(jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.phase5_named_timplan_create(jsonb),public.phase5_named_timplan_rename(jsonb)
 to skolplattform_worker;
