---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "21"
verified: 2026-10-05T08:23:36.942361+00:00
status: human_needed
score: "4/4 must-haves har strukturellt och lokalt SQL/API/webbläsarbevis"
browser_verification: passed_with_separate_retests
human_verification_status: awaiting_user
requirements: [ADMIN-02, ADMIN-03]
---

# 05-21 — verifiering av programplanens skolor

Målet i `05-21-PLAN.md` är att en programplan kan höra till flera skolor hos samma huvudman med samma versioner överallt, enligt D-03/D-05 i `05-20-CONTEXT.md`. Den oberoende kodgranskningen fann inga blockerande produktfel, inklusive UI-rättningen i `9f80719975d0cb3424ceb92daa0bf78a7378b015`. Lokala SQL-, API-, lås- och livscykelprov på dator/telefon stöder de fyra nödvändiga beteendena. Övriga webbläsarbeteenden har passerat, med två separata omprov och redovisade misslyckade fulla körningar; mänsklig begriplighet är **awaiting_user**. Detta är inget separat godkännande av fas 5 eller verklig pilotdrift.

## Beteenden och bevis

| Must-have | Verifierat stöd | Återstående kontroll |
|---|---|---|
| Huvudmannen väljer egna gymnasieskolor; alla läser samma versioner/innehåll | Migrationen `20261004130000_phase5_programplan_units.sql` innehåller `offering_units`, scoped läsning och kommandot `units`. API-fallet `units-shared-read` bevisar skolval, samma versioner/innehåll hos huvudskolan och B samt B:s liståtkomst. Främmande huvudman, icke-GY och saknat mandat nekas i SQL/API. | L07 PASS och bilder granskade på dator/telefon; mänsklig begriplighet väntar. |
| Tillägg i alla statusar utom arkiv; borttagning endast framtida; huvudskolan bevaras | SQL:s dispatcher kontrollerar arkiv/status efter lås och revision. FK/trigger gör huvudskolan oföränderlig och förbjuder radering av dess koppling medan utbildningen finns. `units-status-rules`, `units-archive-locked` och riktade SQL-prov passerar. | L08 PASS och bilder granskade på dator/telefon; mänsklig begriplighet hos låst borttagning väntar. |
| Skrivning kräver alla skolors mandat; rektor med delmandat kan läsa | `phase5_programplan_scope`/listan använder mandat för någon kopplad skola. `writable` används av befintliga innehållskommandon och kräver alla skolor; livscykeldispatchern gör samma kontroll för skolval/arkiv. API-fallet `units-partial-readonly` provar nekat skrivande och tillåten läsning. | L07 PASS: skrivreglagen saknas och analystexten lovar inte att utkastet kan sparas. Mänsklig begriplighet väntar. |
| Kopiering till ny elevkull tar med skolvalet | `openCreatedCopy` i `protected-programplan-workspace.tsx` hämtar aktuell revision och skickar `units` med källans skolor efter skapande/fördelning. API-fallet `units-copy` bevisar båda skolorna, bevarat original och B:s läsning av kopian. Vid fel i skolsteget visar UI konkret återhämtning under Skolor. | L09 PASS på dator/telefon: skolval/innehåll/original bevaras; simulerat skolstegfel ger besked och lyckad återhämtning. Färdiga återhämtningsbilder granskade; mänskligt prov väntar. |

Kritiska kopplingar är substantiva och inkopplade: arbetsytans Skolor-knapp → `SchoolsDialog` → befintlig skyddad `/api/programplaner/utbildning/livscykel` → strikt requestparser → Worker-transaktion → SQL-dispatcher → strikt svarparser. Listans skolfilter använder alla kopplade skolor inom aktörens mandat. Kopieringskedjan återanvänder samma kommando. Handboken i `docs/handbok/programplaner.md` beskriver delningen och nuvarande begränsning för klasser/elevplaceringar/timplaner.

## Säkerhetsgränser

- SQL använder verkligt uppdrag och sessions-/kundlås. Vid `units` låses unionen av gamla och begärda skolor i id-ordning före utbildningen och planerna. Revision och mandat prövas därefter. Låsprovet visar en vinnare vid samma revision (`40001` för förloraren), bevarade skolor/revision/audit vid rollback samt nekat skrivande när B:s mandat återkallas medan kommandot väntar på kundlåset.
- `offering_units` har RLS och inga direkta privilegier för PUBLIC/anon/authenticated/service_role/Worker. Nya hjälpfunktioner är stängda; ingen ny Worker-grant har införts. API-provet verifierar exakt sexton öppna Worker-funktioner.
- Request/reply är slutna kontrakt. 1–100 unika skol-ID:n, huvudskolans närvaro, rätt identitet/kommando, nästa revision och exakt returnerat skolurval kontrolleras. Rutten kräver huvudman, MFA, samma origin och obligatorisk audit.
- DB- och Worker-auditfel rullar tillbaka skolkopplingar, revision och framgångshändelser (`units-mandatory-db-audit`/`units-mandatory-worker-audit`). Audit för skolval innehåller antal tillagda/borttagna skolor, inga skolnamn eller planinnehåll.
- UI skyddar osparade skolval genom registrerad dirty-status och bekräftad avbrytning; stängning är blockerad under sparande. Detta dirty-skydd är kodgranskat, inget separat körbevis redovisas här. L05 provar konflikt/MFA/okänt svar i livscykeln; L09 provar skolstegets fel och återhämtning vid kopiering.

## Slutlig UI-rättning och visuella bevis

Commit `9f80719` gör `AnalysisBanner` sparbesked beroende av `changePlan` och om arbetsytan innehåller ett utkast. Båda användningsställena skickar villkoret; ett partiellt mandat, arkiv eller startad plan ger därför inte beskedet ”Du kan spara utkastet”. Ändringen påverkar presentationen och förändrar inte SQL:s mandat-/statuskontroller. Läsgranskningen identifierade ingen blockerare.

L07 väntar på den verkliga analystexten och bevisar att sparbeskedet saknas i B-rektorns läsläge. `chooseSchools` väntar på återläst Skolor-knapp och Engelska i programplanen, så L09:s sista bild visar färdig återhämtning. `web/test-results/phase5-lifecycle.json` redovisar L01–L09 PASS i båda projekten (18/18, inga retries/flaky/skipped). L07–L09:s tio bilder för skolfilter, delat läsläge, låst borttagning, kopierad kull och återhämtning har enligt root granskats, inklusive de färdiga återhämtningsbilderna. Bildbilagornas faktiska sökvägar finns i JSON-rapporten under respektive fall i `web/test-results/phase5-lifecycle/`. Denna granskare läste körresultatet; den visuella bedömningen kommer från root.

## Körda kontroller och avgränsning

| Kontroll | Resultat och källa |
|---|---|
| Riktad skol-SQL | 54/54 PASS; `work/pilot/results/phase5-21-units-sql.json` |
| Hela SQL-sviten | 1917/1918; **FAIL** i `work/pilot/results/phase5-21-sql-all.json`. Det äldre `phase2_audit`-fallet 13 kvarstår enligt genomförarens körlogg; sviten redovisas inte som grön. |
| Verklig byggd Worker och SQL/API | Omkört 39/39 PASS; `work/pilot/results/phase5-21-lifecycle-api.json`, byggrevision `9f80719975d0cb3424ceb92daa0bf78a7378b015`, cleanup PASS och bevarade basdatahashar |
| Verkliga PostgreSQL-lås | 3/3 PASS; `work/pilot/results/phase5-21-units-locks.json` |
| Modell/serverprov och statiska/byggkontroller | Genomföraren rapporterar Node 571/571 samt TypeScript, oxlint, appbygge och handboksbygge PASS. Denna granskare har inte kört om dem. |
| Livscykel i webbläsare | Omkört 18/18 PASS på dator/telefon; `web/test-results/phase5-lifecycle.json`, start 2026-10-05T08:07:03Z |
| Programplan i webbläsare | Full körning **FAIL**, 39/40; datorfall 08 väntade 5 s på listladdning. Separat omprov 1/1 PASS, utan kodändring. Alla 40 beteenden passerade över 39+1. |
| Terminer i webbläsare | Full körning **FAIL**, 14/15 + ett avsiktligt hoppat fall; telefonfall 06 väntade 5 s på sparstatus efter tappat svar. Separat omprov 1/1 PASS med en enda skrivning och återläst revision. |
| Timplan i webbläsare | 20/20 PASS på dator/telefon. |

Root har kompletterat med `work/pilot/results/phase5-21-browser.json`: samma byggrevision i samtliga sviter/omprov, cleanup PASS, inga olösta beteendefall. De två fulla körningarna behåller FAIL; separata omprov redovisas utan försvagade förväntningar.

Resultatfilerna för API och lås har lästs, samtliga fall är PASS och deras `sourceHashes` stämmer mot aktuell källkod. API-fixturer och låsfixturer redovisar cleanup PASS och identiska basdatahashar före/efter. Tillfälliga verksamhets-/sessionsrader och felinjektionsobjekt är städade; avsiktliga append-only audithändelser och ankare finns kvar. Låsprovet är lokalt syntetiskt SQL, inget HTTP-/MFA-bevis; API-provet är lokal syntetisk körning genom riktig Worker. Ingen verklig kommunanslutning eller elevdata verifieras.

05-21 ger delbevis för ADMIN-02 (bevarat utbildnings-/innehållsflöde med skolmandat) och ADMIN-03 (ny kull med samma skolval och bevarat original). Kraven som helhet förblir öppna i fas 5: beslutsregler, övriga planers leveranser och mänskliga prov omfattas inte av detta delbevis. Klasser, elevplaceringar och timplaner på tillagda skolor hör till 05-22; yrkesregler och fastställande hör till efterföljande planer.

## Mänskligt prov — awaiting_user

Prova Skolor med syntetiska data på dator och telefon: lägg till B, kontrollera samma plan som rektor B och att ändringsreglagen saknas; ta bort B före start och kontrollera låst borttagning efter start; kopiera till en senare kull och kontrollera skolorna. Bedöm om Skapad här, delat mandat, statusbegränsningen och återhämtningsbeskedet vid misslyckat skolsteg är begripliga. Automatisk webbläsarkörning ersätter inte användarens bedömning. Inga blockerande kodluckor har identifierats, men väntande prov får inte markeras som passerade.
