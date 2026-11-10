-- 05.1.1-06/07: separat granskad öppning av läsårskalenderns ingångar för Workern (läsning, kommando och status).
-- Inga tabellrättigheter och inga andra funktioner öppnas; all åtkomst går via security definer-ingångarna,
-- som själva prövar session, aktör, skolenhet och huvudman.
grant execute on function public.lasar_read(jsonb) to skolplattform_worker;
grant execute on function public.lasar_command(jsonb) to skolplattform_worker;
grant execute on function public.lasar_status(jsonb) to skolplattform_worker;
