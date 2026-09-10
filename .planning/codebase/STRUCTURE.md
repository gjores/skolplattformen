# Structure

Kartlagt 2026-09-10.

| Sökväg | Ansvar |
|---|---|
| `web/app/` | Sidram, arbetsytor, formulär, kalender, timplan och gemensam CSS |
| `web/app/api/skolenhet/route.ts` | Läsanrop till skolenhetsregistret |
| `web/lib/*-model.ts` | Domänmodeller och ändringsregler |
| `web/lib/*-store.ts` | Supabase-läsning och skrivning |
| `web/lib/database.types.ts` | Genererade databastyper |
| `web/lib/*.test.mjs` | Modelltester |
| `web/components/` | Delade UI-komponenter från appens grund |
| `web/scripts/` | Kataloghämtning och telefonförhandsvisning |
| `supabase/migrations/` | Versionshanterad databasstruktur, policyer och SQL-funktioner |
| `work/supabase/` | Separata verifierings- och demoverktyg; flera skriver till ansluten databas |
| `docs/` | Research, produktunderlag och daterad bygg-/granskningshistorik |
| `.planning/` | Aktiv GSD-kontext, krav, forskning och färdplan |

Det fanns ingen `.planning/` eller Git-historik före denna initiering. Nya planeringsdokument ska inte framställa historiska implementationer som genomförda GSD-faser.
