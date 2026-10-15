---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-04
status: isolated_sql_verified
completed: 2026-10-15
---

# Beslut inom varje namngiven timplansserie

Versionsnummer och högst en öppen/fastställd version gäller nu varje stabil serie. Fastställande av A2 ersätter endast A1. B1, dess timmar och redan valda klasskopplingar för båda läsåren består. Beslutsunderlag innehåller aktuell serie; namnbyte ogiltigförklarar en tidigare granskning. Ny historik sparar namnet vid beslutet. Gamla kvitton, historikrader och hashvärden skrivs inte om; äldre återspelade svar kompletteras additivt med saknad seriemetadata.

## Verifiering

`node work/pilot/verify-named-timplan-decisions.mjs --out /private/tmp/named-timplan-decisions-04-final.json`: **87/87 PASS**, exit0, full data-/DDL-rollback och egen databascleanup bekräftade. SHA256 `ce82c7954e279a28f78c5b635b8f9c371a9815019c3e3fc54031bcfe4a57c43a`.

Provet använder privat schema-only-kopia av det identifierade lokala målet och enbart repositorybaserade syntetiska fixturer. Inga användarrader eller authdata exporterades. Alla gamla kolumnprojektioner i62 offentliga tabeller bevarades under02/03/04; nya kolumner är uttryckligen undantagna. Detta bevisar syntetisk migrationsbevaring, inte migrering av användarens befintliga data.

Matrisen omfattar två samtidiga fastställda serier,40 extra matematiktimmar i ena utan ändring av den andras celler eller2500 källpoäng, full beslutslivscykel, namnkonflikt med tidigare granskning, historiska namn, separat A2, gamla kvitton, indexskydd för öppna/fastställda versioner, obligatorisk auditrollback, inkorg/sök samt29 befintliga klassfall vardera för SA25 och BF25. Äkta konkurrerande anslutningar återstår i11.

Plan07:s grantmigration provas också: exakt två nya funktionsrättigheter, oförändrade tabellrättigheter, övriga roller fortsatt nekade. Verklig SQL-roll `skolplattform_worker` kan skapa och byta namn genom dessa entrypoints. Detta är SQL-rollprov, inte HTTP/OIDC.

Första körningen stoppade före produktkontroller eftersom runnerns tabellnamnsregex inte tillät siffran i `phase3_probe_cases`; full cleanup lyckades. Rättad runner gav85 PASS. Slutprovet tillför kontroll av andra fastställda versionen samt07-grants och gav87 PASS. Båda äldre resultat bevaras privat som `named-timplan-decisions-04-first.json` och `-second.json`.

## Filer och avgränsning

- `supabase/migrations/20261015202000_named_timplan_decisions.sql`
- `supabase/tests/phase5_named_timplan_decisions.test.sql`
- `work/pilot/verify-named-timplan-decisions.mjs`
- `supabase/migrations/20261015204000_worker_named_timplans.sql` (plan07:s rättighetsdel)

Ingen permanent apply eller runtimeleverans. Samlad SQL-projektionsparitet, verklig samtidighet, HTTP/OIDC, dator/telefon och användbarhetsacceptans återstår. SS12000:2024/OpenAPI2.1.0 enligt paketets dokumenterade mappning: serier/beslut är interna; stabila klasser/organisationer, medlemskap och giltighet ändras inte. Inget verifierat informationsutbyte påstås.
