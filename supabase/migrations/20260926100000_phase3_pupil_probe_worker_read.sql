-- 03-05: öppnar den syntetiska elevläsningen för Workern.
-- Tillämpas först efter att API-provet phase3-pupils visat att varje läsform
-- (lista, elev-ID, ärende, export) skriver sin säkerhetshändelse i samma
-- transaktion före svaret, och att loggfel stoppar läsningen utan innehåll.
-- Funktionen läser endast phase3_probe_*-fixturer och prövar mandatet själv.
revoke all on function public.phase3_read_pupils(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.phase3_read_pupils(uuid,uuid,boolean) to skolplattform_worker;
