-- 05.1-01: Worker får bara GR/IM-klassernas underlag och kommando. Alla hjälpfunktioner förblir stängda.
revoke all on function public.phase51_grim_class_underlag(jsonb),public.phase51_grim_class_command(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.phase51_grim_class_underlag(jsonb),public.phase51_grim_class_command(jsonb) to skolplattform_worker;
