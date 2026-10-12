# Nästa sammanhängande planeringsflöde — 2026-10-12

Status: planerat på uttrycklig användarbeställning; inga nya genomförandebevis ännu.

Användaren godkänner föreslagen fortsättning med ”japp kör! Sen måste vi rensa databasen också på skit som inte ska ligga där”: klass till fastställd timplan, tydligare beslutsköer, ny version och uppmätt läsprestanda. Tidigare beslut består: programutkast får finnas ensamma, GY-timplaner kräver programunderlag, huvudmannen skickar tillbaka inskickade planer med kommentar; fastställda planer återöppnas inte.

Databasstädning börjar med läsande inventering. Otydlig raderingsomfattning får inte bli bred reset. Utkast, okopplade men avsiktliga programplaner, äldre versioner, beslut, klasskopplingar och säkerhetslogg är inte skräp i sig. En konkret kandidatuppsättning med orsak, beroenden, privat backup och återställningsväg tas fram innan eventuell radering. Säkert identifierade egna överblivna provgrafer kan hanteras inom avgränsat ägarskap; andra verksamhetsrader kräver användarens val mellan konkreta kandidater.

## Färsk kodinventering

- `school_classes` är beständig klassgrund; dagens protected elev-API väljer klasser men skapar dem inte.
- `class_timplans` använder skola, klassnamn och läsår samt exakt timplan-ID/kolumn. Det saknas protected klasskommandon och beständig klass-ID-koppling.
- Migrationerna `20261004140000_phase5_offering_unit_linkage.sql` och `20261004141000_phase5_timplan_units.sql` har redan stöd för delade utbildningars skolrelationer och skolbundna timplaner. Äldre schemakartor är inte dagens sanning.
- `phase5_plan_decision_inbox()` beräknar fullt beslutsunderlag per plan, returnerar endast första 500 och saknar sökning/sidor. UI visar egna före väntande först efter trunkeringen.
- Programlistans nuvarande statuskontrakt tillåter inte `forslag`/`atersand`; separat beslutsskede lagras utanför programplanens status och måste filtreras servervägen.
- `sourceChanged` i `web/lib/server/gym-timplan.ts` jämför revision och kan varna vid enbart fastställande. Innehållsmatchning måste skiljas från revisions-/beslutsmetadata utan att släppa källkontroll.
- Senaste programplansredigeringens fokus- och bakgrundsläsningsrättning ska bevaras.

## Planer, ägarskap och ordning

| Plan | Innehåll | Utförare | Beroende |
| --- | --- | --- | --- |
| 01 | Klasskontrakt, SQL, skyddat API | Klassagent | Inget |
| 02 | Klassens UI och konkret timplanskoppling | Root | 01 |
| 03 | Beslutsinkorg, sökning/sidor, skedefilter, uppmätt SQL | Inkorgsagent | Inget |
| 04 | Ny versionsväg och meningsfull källvarning | Root | 02 (samma gymvy) |
| 05 | Läsande datainventering och konkret städningsförslag | Inventeringsagent | Inget |
| 06 | Samlad faktisk verifiering, handbok, lokal leverans | Root | 01–05 |

Högst tre agenter plus root. Migration 01 använder `20261012210000`, plan 03 `20261012220000` och root källjämförelse `20261012230000`; ingen agent applicerar SQL utan samordning. DB-fixturer, bevarandebaslinjer och installation körs seriellt. Root äger `protected-gym-timplan-workspace.tsx`, versionsväg, produktbyggnad, handbok och slutstatus. Inkorgsagent äger beslutskontrakt/API/UI samt beslutsskedefilter i planeringslistan. Modell-/kontraktstest föregår databas- och UI-bevis. Ingen förändring i personuppgifter eller elevers klassplacering ingår.

## Krav och verifieringsgräns

ADMIN-04 är primär spårning för beständig klass → fastställd version → läsårsunderlag och bevarad länk vid ny version. ADMIN-02 stöds av tydlig nyversion/beslut; ADMIN-03 regression bevarar kullkopiering utan elever/klasser/beslut. PLANERING-01/03/04/05 omfattar kontext, sök/paging, exakt årsprojektion och verklig skyddad verifiering. Varje plan får egen SUMMARY. Slutlig VERIFICATION redovisar både passerade bevis och kvarstående fullkravsgränser; inga gamla totalsiffror eller fasgodkännanden skrivs om på planeringsunderlag.
