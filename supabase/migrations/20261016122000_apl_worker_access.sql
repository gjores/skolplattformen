-- Activate together with the APL server and both preceding APL migrations.
-- Only the three authenticated entry points are exposed; helpers and tables remain closed.
revoke all on function public.phase5_apl_plan_read(uuid), public.phase5_apl_plan_command(jsonb), public.phase5_apl_plan_status(jsonb)
 from public, anon, authenticated, service_role;
grant execute on function public.phase5_apl_plan_read(uuid), public.phase5_apl_plan_command(jsonb), public.phase5_apl_plan_status(jsonb)
 to skolplattform_worker;
