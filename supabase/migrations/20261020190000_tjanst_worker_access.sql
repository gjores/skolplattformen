-- 05.1-09: Worker-rättigheter för tjänstefördelningen. Installeras sist av fasens migrationer (efter 20261020140000).
-- Alla tjanst_*- och phase51_*-funktioner stängs för public, anon, authenticated, service_role och skolplattform_worker.
-- Därefter får skolplattform_worker EXECUTE på exakt de tio tjanst-entrypointsen och GR/IM-kopplingens två (20261020100100).
-- Hjälpfunktioner, triggerfunktioner, alla tjanst_*-tabeller och fasens fyra personaltabeller förblir stängda. Inga
-- tabellrättigheter ges. Den äldre staff_assignment_bindings (fas 3) berörs inte.
do $$
declare f regprocedure; t regclass;
begin
 for f in select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'tjanst\_%' or p.proname like 'phase51\_%') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role,skolplattform_worker',f);
 end loop;
 for t in select c.oid::regclass from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v','m','S','p') and (c.relname like 'tjanst\_%'
   or c.relname in ('staff_people','staff_employments','staff_school_duties','staff_person_bindings')) loop
  execute format('revoke all on %s from public,anon,authenticated,service_role,skolplattform_worker',t);
 end loop;
end $$;

grant execute on function public.tjanst_personal_read(jsonb),public.tjanst_personal_command(jsonb),public.tjanst_personal_status(jsonb),
 public.tjanst_plan_read(jsonb),public.tjanst_plan_command(jsonb),public.tjanst_plan_status(jsonb),
 public.tjanst_self_read(jsonb),public.tjanst_self_command(jsonb),public.tjanst_self_status(jsonb),
 public.tjanst_staffing_read(jsonb),
 public.phase51_grim_class_underlag(jsonb),public.phase51_grim_class_command(jsonb)
 to skolplattform_worker;
