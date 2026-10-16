---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-ANNUAL-02
type: execute
status: completed
wave: 2
depends_on: [APL-ANNUAL-01]
autonomous: true
files_modified:
  - supabase/migrations/20261016161000_timplan_time_v2_integration.sql
  - web/lib/gym-timplan.ts
  - web/lib/apl-plan.ts
  - web/lib/plan-decision.ts
  - web/lib/server/gym-timplan.ts
  - web/lib/server/apl-plan.ts
  - web/lib/server/plan-decision.ts
  - web/lib/server/named-timplan.ts
  - web/lib/gym-timplan-distribution.ts
  - web/lib/server/gym-timplan-distribution.ts
  - web/app/api/timplaner/gym/tidsmodell/route.ts
  - web/app/api/timplaner/gym/tidsrad/route.ts
  - web/app/api/timplaner/gym/tidsstatus/route.ts
  - work/pilot/verify-timplan-time-v2.mjs
must_haves:
  truths:
    - Alla totaler och beslut använder samma modell och räknar APL en gång.
    - Ny tom plan får V2 medan historiska planer och kvitton behåller sin betydelse.
    - Periodförläggning, kopiering och autofördelning bevarar årsramen och aktuella mandat.
  artifacts:
    - supabase/migrations/20261016161000_timplan_time_v2_integration.sql
    - web/app/api/timplaner/gym/tidsmodell/route.ts
    - web/app/api/timplaner/gym/tidsrad/route.ts
    - web/app/api/timplaner/gym/tidsstatus/route.ts
  key_links:
    - SQL-read/projection och Worker strikt parser väljer samma tidsmodell.
    - Beslutets hash omfattar minutmatris och periodunderlag; gamla kvitton verifieras mot sin frysta version.
    - Autofördelning reserverar års-APL och skriver enbart skolminuter i en transaktion.
---

<objective>
Koppla hela den skyddade datavägen innan UI aktiverar V2. Inga parallella totalkällor eller legacy-endpoints får kringgå den nya modellen.
</objective>
<context>
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-PLAN.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-01-SUMMARY.md
@supabase/migrations/20261015201000_named_timplan_commands.sql
@supabase/migrations/20261015203000_named_timplan_reads.sql
@supabase/migrations/20261016121000_apl_plan_decisions.sql
@supabase/migrations/20261016130000_apl_term_intent.sql
@web/lib/server/gym-timplan-distribution.ts
</context>
<tasks>
<task type="auto">
<name>1. Koppla SQL-modellval till läsning, förläggning, beslut och kopiering</name>
<files>supabase/migrations/20261016161000_timplan_time_v2_integration.sql, work/pilot/verify-timplan-time-v2.mjs</files>
<action>Utöka phase5_gym_timplan_result/read och skapande: nytt tomt utkast för redan stödd gymnasial yrkesprofil får V2 (övriga profiler behåller nuvarande modell), nästa version/namngiven kopia behåller källmodell; gamla återspelade skapandekvitton återges oförändrat. Gör mode-medvetna grenar för phase5_apl_allocation_issues/validate_allocations, hash_payload/content_hash, confirmation_blockers, plan_decision_basis/command och named_timplan_copy_rows/apl_copy_structure. V2-periodsumma per ämne/år måste rymmas i angiven års-APL även när skoltid är0; ändring av årscell under periodsumma nekas. Alla årsminuter ska vara periodförlagda inför bekräftelse; tillåt fortfarande preliminär sparning utan perioder. Besluts-GUT och fullständighet använder V2-minuter, kan inte summera gamla cells.hours. Bevara V1:s gamla hash/receipt-envelope och stöd läsning av frysta gamla baser efter övergång. Kopiera exakt endast där frysta ämnesnycklar/aktivitet passar; förlorad skoltid eller års-APL får ett eget versionerat granskningsunderlag med faktisk källa, aldrig ett fabricerat period-ID. Inga bekräftelser följer med en ny version. Behåll klassrelationer och source/låsordning.</action>
<verify>Utöka faktisk SQL-matris: nytillverkad/namngiven kopia/nästa version för både V1/V2; gamla kvitton efter ny modell; förlorad rad/år med exakt proveniens; 15veckors-/årsrams-/GUT-kontroller separat. Försök genom alla gamla rad-, skapa-, kopie-, beslut- och APL-funktioner. Bekräftelse invalideras av ändrad skoltid/års-APL, HM kan inte bekräfta och rektor kan inte fastställa. Kontrollera totalsumma före/efter kopiering och övergång på minutnivå.</verify>
<done>Alla SQL-vägar har uttrycklig modellgren och ett komplett nytt flöde kan genomföras i ägt testmål; inga oförklarade tappade minuter eller ny implicit behörighet.</done>
</task>
<task type="auto">
<name>2. Anslut strikta Worker-kontrakt och mode-medveten autofördelning</name>
<files>web/lib/gym-timplan.ts, web/lib/apl-plan.ts, web/lib/plan-decision.ts, web/lib/server/gym-timplan.ts, web/lib/server/apl-plan.ts, web/lib/server/plan-decision.ts, web/lib/server/named-timplan.ts, web/lib/gym-timplan-distribution.ts, web/lib/server/gym-timplan-distribution.ts, web/app/api/timplaner/gym/tidsmodell/route.ts, web/app/api/timplaner/gym/tidsrad/route.ts, web/app/api/timplaner/gym/tidsstatus/route.ts; tillhörande befintliga .test.mjs och nya timplan-time.test.mjs</files>
<action>Gör GymTimplan till strikt diskriminerad union och återanvänd tidsmodulens summering. Anpassa APL-frozen basis/projektion samt beslutssvar med explicita versioner; gamla receipts parsas i gammalt kontrakt, inga retroaktiva defaultfält i deras canonical data. Publicera tre protectedRoute-vägar för helplansövergång, minutrad och requestbunden status, med mfa/mandat/origin/epoch/CAS/audit. Befintlig /gym/rad avvisar V2 även i serveradapter; ingen unioncast som gör V2 till hours. Autofördelning får en separat V2-gren: totalmål i minuter minus angiven års-APL, fyll/ersätt skolceller endast, bevara nollor och minutrester, uppmärksamma obesvarad APL. Hela fördelningen är en transaktion och reread måste verifiera exakt matris/revision. Inventera samtliga konsumenter med rg efter hours/gymTimplanTotals/phase5_gym_timplan_result; uppdatera faktisk läs-/översikts-/exportkonsument eller neka V2 med tydligt besked. Lista inventeringsresultatet i summary.</action>
<verify>Relevant Node/regressionsmatris, typ/lint. Serverprov testar båda läsmodellerna, authority-injektion, malformed svar, old-command replay, ny annual-route denylist, auditrollback och ofullständigt svar. Distributionsprov visar exakt total efter subhour-konvertering, inga ändrade årsramar/perioder, omöjlig total nekad och ingen delskrivning. SQL-/Worker-paritet behöver omfatta båda modellversionerna.</verify>
<done>Ingen skriv-/beslutsväg tolkar skoltimmar som totaler eller års-APL som extra periodtid. Kontrakten är redo för UI; faktisk OIDC/browser och aktiv installation återstår.</done>
</task>
</tasks>
<verification>Alla V1-regressioner som berör gamla kvitton, klasskoppling, källa och mandat måste fortsätta passera. Låt typfel avslöja glömda consumers; använd inte valfri hours eller breda casts för att tysta dem.</verification>
<success_criteria>ANNUAL-02/03/05/06 har sammanhängande modell-, SQL- och Workerbevis. Inget aktivt appbyte har skett.</success_criteria>
<output>Skapa 05-APL-ANNUAL-02-SUMMARY.md med consumerinventering, bevis och kvarstående UI/actual. Avgränsad commit/push samordnas av root.</output>
