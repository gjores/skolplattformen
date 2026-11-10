-- 05.1.1-06: separat granskad öppning av läsårskalenderns två ingångar för Workern.
-- Inga tabellrättigheter och inga andra funktioner öppnas; all åtkomst går via security definer-ingångarna,
-- som själva prövar session, aktör, skolenhet och huvudman.
grant execute on function public.lasar_read(jsonb) to skolplattform_worker;
grant execute on function public.lasar_command(jsonb) to skolplattform_worker;
