-- 05.1.1-11 (D-09): separat granskad öppning av läsvägen för kalenderstatus per skola för Workern. Inga tabellrättigheter och inga
-- andra funktioner öppnas; lasar_overview är en security definer-ingång som själv prövar session, aktör, aktuella skolenheter och
-- huvudman. Den installerade grant-filen 20261111190000_lasar_worker_access.sql ändras inte.
grant execute on function public.lasar_overview(jsonb) to skolplattform_worker;
