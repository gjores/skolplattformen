---
phase: 05-bevarade-utbildnings-och-klassfloden
package: PLANNING-FLOW-UX
status: planned
created: 2026-10-18
user_decision: timtabellen_godkanns_forst_apl_granskas_separat
---
# Enklare programplaner och timplaner, APL i ett senare steg

## Beställning och beslutad avgränsning

2026-10-18 bekräftade användaren att års-APL fungerar och beställde enklare UI i hela program-/timplansflödet, mindre tekniska knappar och flytt av den återstående APL-planeringen till en efterföljande process. I program-/timplansarbetet ska tabellerna vara huvudinnehåll; Skola HT/VT och APL per årskurs ligger kvar i timtabellen. Användaren svarade därefter **ja till att huvudmannen godkänner timtabellen först och APL granskas separat**. Det ersätter ANNUAL-paketets tidigare uttryckliga begränsning att timplansbeslut väntar på full APL-förläggning.

Huvudmannen godkänner fortsatt programplan och timplan. Rektor/skoladministratör arbetar endast inom befintligt skolmandat; rektor bekräftar APL-förläggningen och huvudmannen markerar den som granskad genom en separat händelse. Genomförandets uttryckliga val är en åtgärd Granska APL, bunden till aktuell rektorsbekräftelse, APL-innehåll och godkänd timplansrevision. Huvudmannen får ingen rätt att ändra perioderna. Granskat betyder inte genomfört eller närvarobekräftat. Utbildningskrav eller genomförande bevisas inte av att timtabellen är godkänd.

## Färsk kartläggning och kritisk koppling

Discovery nivå 0: befintliga interna modeller/komponenter/API återanvänds, inga nya bibliotek eller externa anslutningar. Äldre `.planning/codebase/ARCHITECTURE.md` lästes som orientering; dagens skyddade kod verifierades direkt och avviker väsentligt från den äldre direktdatabasbeskrivningen.

- `web/app/protected-gym-timplan-workspace.tsx` monterar beslutsyta, klasskopplingar, timtabell och `ProtectedAplPlan` i samma vy; många åtgärder visas före tabellen.
- `web/app/protected-home.tsx` och `web/lib/protected-plan-location.ts` äger skyddad navigation, URL, historik och skol-/läsårsval. APL saknar egen arbetsyta.
- `phase5_plan_decision_detail` i `20261016161000_timplan_time_v2_integration.sql` inkluderar APL-blockerare och APL-bekräftelse i timplanens beslutshash. `web/lib/server/plan-decision.ts` räknar självständigt om samma villkor.
- `phase5_apl_plan_scope` i `20261016120000_apl_planning.sql` tillåter skrivning endast i utkast/återsänd timplan. APL save/confirm i integrationen ökar `timplans.revision`. Därför räcker inte en flytt av JSX eller borttagen klientspärr.
- Gamla APL-/beslutskvitton innehåller frysta resultat. De måste återspelas i sitt ursprungliga kontrakt. Ändrade APL-detaljer efter godkänd tabell får inte i efterhand ändra innebörden av timplansbeslutet.

## Avsett användarflöde

1. **Programplan:** välj program/inriktning och arbeta i ämnes-/poängtabellen. Visa sparstatus, nästa huvudsakliga åtgärd och nödvändiga kompletteringar. Granskning och huvudmannens beslut finns kvar. Kopiera till nästa kull, namn, historik och övriga sällanåtgärder samlas tydligt under Fler alternativ.
2. **Timplan:** arbeta i Skola HT/VT och års-APL, använd Fördela timmar och se total/GUT. Programplan, klasskopplingar och beslut är tillgängliga via tydliga avgränsade åtgärder, inte långa paneler framför tabellen. Timtabellen kan skickas/godkännas utan sparade APL-perioder.
3. **APL-planering:** egen tydlig destination efter Programplaner/Timplaner (vy=apl-planering; internt säker PlanLocation view=timplaner med process=apl), med exakt skola, utbildning, timplan och version. Här finns utbildningsform, perioder, veckor/datum, ämnesinnehåll, fördelad/kvarvarande års-APL, kopieringsgranskning och rektors bekräftelse. Årsramen ändras i timplanen. Godkänd timplan ger inte etiketten APL klar. Befintlig APL före timplansbeslut bevaras och går att hitta.

## Modell- och beslutsregler

- Timplanens godkännande gäller fryst programunderlag och skol-/års-APL-tabell. Programplanens kontrolltext får inte kräva att senare perioder redan är genomförda/granskade. APL-timmar är en ram och bevisar inte hela veckor.
- APL får eget versionsmärkt arbetskontrakt, revision/CAS och scopebundet kvitto. Senare periodskrivning får inte ändra godkända timplansceller, `timplans.revision`, timplansbeslutets hash eller klasskopplingar. En bytekontrollerad migreringsbaslinje kan referera befintlig timplansrevision; inga historiska händelser skrivs om.
- APL är fortsatt bunden till exakt timplans-ID och version; byt inte tyst till senaste serieversion. För ersatt eller arkiverad version bevaras läsning och historik, inga nya ändringar. Kopiera/ny timplansversion kräver fortsatt uttrycklig, spårbar APL-kopiering/granskning.
- APL-spara, rektorsbekräfta och huvudmannens granskning tillåts endast efter fastställd timplan. Befintliga APL-underlag på utkast/återsänd/inskickad timplan bevaras läsbara; gränssnittet förklarar att först färdigställa timtabellen. Detta ska verifieras som en avsiktlig ändring av arbetsordningen, inte döljas som ett behörighetsfel. Ny aktuell APL-bekräftelse avser exakt tabellbasis och APL-innehåll. Ändringar i APL gör tidigare rektorsbekräftelse och huvudmannens granskning inaktuella utan att ändra timplansgodkännandet. Huvudmannens granskning får inte skrivas om aktuellt rektorsunderlag saknas; händelser och kvitton bevaras historiskt.
- Utbildningsform/klassificering, veckor, arbetsmoment, full årsallokering och rektors kontroll kvarstår som villkor för **APL-förläggningens** bekräftelse. Budget utan perioder tillåts för **timtabellens** godkännande men får aldrig visa APL komplett. Högskoleförberedande program saknar APL både i UI och servermandat.
- Behåll MFA, aktuell uppdragskontroll, origin, epoch, CAS, auditrollback och exakt request-ID-replay. Separat process får inte skapa en alternativ svagare skrivväg.

## Paket och beroenden

| Plan | Våg | Resultat | Beror på |
|---|---:|---|---|
| 01 | 1 | Programplanens tabell och begripliga åtgärder | levererat nuläge |
| 02 | 1 | Versionerade separata beslut-/APL-kontrakt | levererat nuläge |
| 03 | 2 | Additiv SQL, APL-livscykel och beslut som håller isär delarna | 02 |
| 04 | 3 | Skyddade servervägar/parsers/journal med kompatibelt replay | 03 |
| 05 | 4 | Timplanstabell i fokus och separat APL-navigation | 01, 04 |
| 06 | 5 | Samlad användarverifiering, handbok och exakt lokal leverans | 05 |

01 och 02–04 har skilda filägare och kan förberedas parallellt. Root äger 05 och integrerar; ingen samtidig redigering av samma fil. Varje plan är 2–3 avgränsade uppgifter med egen SUMMARY och kontrollerad commit/push. Köra endast detta paket, inte alla äldre fas-5-planer.

## Acceptans och kravspårning

| ID | Observerbart resultat | Primärt bevis |
|---|---|---|
| FLOW-01 | Program-/timplanstabellen är huvudytan; nästa steg och sparstatus är begripliga | 01/05 dator+telefon, användarprov |
| FLOW-02 | Programplan→timplan→APL bevarar skola, kull, exakt version och Back/reload | 05/06 browser |
| FLOW-03 | Huvudmannen kan godkänna komplett timtabell utan APL-perioder; APL står tydligt ofärdig | 02–04 SQL/server, 06 faktisk API |
| FLOW-04 | Efter timplansgodkännande kan egen rektor/skoladmin planera perioder; rektor bekräftar; timbeslut/klasskopplingar orörda | 03/04 SQL, 06 faktisk browser inklusive separat HM-granskning |
| FLOW-05 | Årsramar, periodsumma, totalsumma/GUT och kvar att förlägga räknas utan dubbelräkning | modell/SQL/API |
| FLOW-06 | Historiska kvitton/beslut, okända sparsvar, skolgränser och samtidighet förblir säkra | 02–04 negativa test, 06 bevarande |
| FLOW-07 | Högskoleförberedande program visar ingen APL; arbetsplatser/närvaro/genomförande påstås inte finnas | 05/06 positiv laddningskontroll före frånvaroprov |

Detta är lokala acceptanskriterier med anknytning till PLANERING-/ADMIN-kraven, inte nya pilotkrav eller full fasacceptans. Användarens “Funkar!” gäller föregående års-APL-leverans; det är inte acceptans av detta ännu ogenomförda paket.

## SS 12000

Följ projektets avstämda **SS 12000:2024 utgåva 4 / OpenAPI 2.1.0** (se `05-CLASS-COHORT-SS12000.md`). UI-destination, timbudget, APL-planeringsrevision och rektorsbekräftelse är interna arbetsflöden utanför de här använda standardobjekten. Bevara stabila utbildnings-, skolenhets-, klass-/grupp-ID:n, explicita klass–timplansrelationer, giltighet och källansvar. Planerad APL ska inte mappas till Attendance, CalendarEvent eller Placement som om genomförande vore verifierat. Prov: navigation/copy/version och migration måste bevara ID/relation/giltighet; annan skola nekas. Ingen ändrad extern kontraktsversion eller standardcertifiering följer av UI-/beslutsarbetet.

## Leveransgräns

Ingen produktändring är verifierad genom denna plan. Separat kandidat byggs från fryst commit, aldrig aktiv `web/dist-protected`. Migrations- och browserbevis binds till käll-/artefakthash; schema-only isolerad databas och egna syntetiska identiteter används. Installera endast verifierat exakt paket inom användarens auktorisering; bevara samtliga äldre rader/kvitton/rättigheter och kör läsande efterprov på3012. Äldre app som saknar nya kontrakt är inte en säker automatisk rollback efter nya writes. Handbok och slutlig konkret arbetsgång ska färdigställas före leveransbesked.
