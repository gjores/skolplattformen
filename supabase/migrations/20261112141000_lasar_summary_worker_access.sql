-- 05.1.1-13 (D-11, LASAR-05): separat granskad öppning av kalenderns sammanfattning för Workern. Inga tabellrättigheter och inga
-- andra funktioner öppnas; lasar_summary är en security definer-ingång som själv prövar session, aktör, skolenhet och huvudman.
-- Den installerade grant-filen 20261111190000_lasar_worker_access.sql ändras inte.
grant execute on function public.lasar_summary(jsonb) to skolplattform_worker;
