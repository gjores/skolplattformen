# Atomär kullkopiering — beslutad avgränsning

Datum: 2026-10-14. Status: genomförandeunderlag; implementation och nya bevis återstår.

## Beställning och tidigare beslut

Användaren beställer genomgång av fas 5 och fortsatt arbete tills ett nytt mänskligt prov behövs. Beslutskedjans svar ”Allt funkar” 2026-10-12 gäller den lokala stödda gymnasiekedjan. Det svaret godkänner inte kullkopiering, klasskoppling eller hela fasen.

ADMIN-03 kräver att huvudmannen kan kopiera utbildningsupplägg till en senare elevkull med egna utkast utan elever, klasser och tidigare beslut. Senare användarbeslut tar bort paket från programplanen: **ram, terminsfördelning och skolval följer med**. Tidigare skolutbud/paketval, timplaner, elev-/klasskopplingar och planbeslut följer inte med. Behörigheter och denna avgränsning är redan beslutade; inga nya produktfrågor behövs.

## Färsk kodgranskning

`web/app/protected-programplan-workspace.tsx`, `saveCopy` och `openCreatedCopy`, skapar först utbildning/utkast via `/api/programplaner/utbildning/skapa`. Därefter kopieras terminer och skolor med separata HTTP-kommandon. Efterstegens fel kan lämna en beständig delvis färdig kopia. När en tidigare osäker begäran följs upp och status redan är `created`, öppnas den nya planen utan dessa eftersteg. Den positiva historiska F03-kedjan visar lyckade steg, inte atomär felhantering.

`phase5_create_programplan_education` skapar redan utbildning/utkast och ett requestbundet kvitto i samma transaktion. Befintliga termins-/skolkommandon har revision, mandat och audit. Dessa är lämpliga byggdelar för ett samlat serverkommando. Den befintliga klientparsern för skapande kräver revision 0. Kopiekvittot kan därför återanvända det ursprungliga oföränderliga skapandesvaret, medan den aktuella kopieplanens slutrevision återläses separat efter att hela transaktionen är klar.

## Genomförandeval

- En ny SQL-entrypoint skapar hela kopian i en transaktion, eller läser status när `status_only = true`. Statusläget får aldrig skapa eller komplettera något.
- `/api/programplaner/utbildning/kopiera` och `/api/programplaner/utbildning/kopiera/status` tar samma strikta kopieringsrequest. Klienten skickar ett stabilt kommando-ID, källplan-ID, förväntad planrevision och utbildningsrevision, målskola/namn/elevkull/lokal kod samt full aktuellt uppgraderad v2-`basisReference` med den nya starten. Servern jämför det förväntade underlaget med den sparade källan; klientinnehåll är aldrig ensam kopieringskälla.
- Ny start ska vara ett verkligt giltigt datum efter i dag och senare än källkullens start. Namn/elevkull/lokal kod följer befintliga valideringsgränser.
- Servern låser och återkontrollerar källutbildning, exakt källversion, revisioner, berörda skolor och aktuellt huvudmannamandat. Den kopierar den sparade ramen, terminsfördelningen och samtliga behöriga skolkopplingar. Fullt v2-underlag valideras även i SQL; en äldre källa måste uppgraderas konsekvent med befintlig uppgraderingsregel.
- Återanvänd befintliga kommandon för utbildning, terminer och skolor inom samma transaktion om de kan återanvändas utan att försvaga lås-/mandat-/auditregler. Utöka kvittots request med källplan-ID och båda källrevisionerna så att identisk målrequest från annan källa aldrig blir samma kommando. Fastställt kontrakt: samma sex fält som skapa (`commandId`, `unitId`, `name`, `localCode`, `cohort`, `basisReference`) plus `sourcePlanId`, `expectedSourceRevision` och `expectedEducationRevision`. Kvittots request kompletteras serverinternt med dessa tre källfält och binder hela kopieringsbegäran.
- Kopiekvittot sparas som ett oföränderligt bevis över **hela** requesten och det initiala skapanderesultatet. Replay och status ska ge samma initiala resultat även efter senare redigering av kopian eller källan, med aktuell mandatkontroll. Samma kommando-ID med ändrat innehåll ger konflikt.
- En ny version 1 med status `utkast` och utbildning `planerad` skapas. Terminskommandot ökar revisionen inom samma transaktion. Kvittots oföränderliga `initial_result` beskriver skapandeögonblickets revision 0 för kompatibilitet med befintlig skapande-/statusparser; det betyder inte att aktuell slutrevision är 0. Ett kopieresultat får returneras först när hela transaktionen är klar. Klienten återläser alltid den exakt skapade planen via `openEducation`, inklusive aktuell revision, terminer och skolor. Inget tidigare beslut kopieras. Källans hela rader, tidsstämplar, historik och kopplingar förblir oförändrade.
- MFA, CSRF, servermandat, SQL-CAS och obligatorisk DB-/Worker-audit består. Ett fel i något steg, inklusive audit, rullar tillbaka utbildning, plan, skollänkar, kvitto och nya verksamhetshändelser tillsammans.
- SQL definieras utan nya Worker-grants. En separat exakt grantmigration aktiverar endast den nya entrypointen efter rollbackprov och verklig Worker-preflight i avsedd isolerad testmiljö.

## Bevis och mänsklig gräns

Nya prov måste särskilt visa termins-/skol-/auditfel med noll kvarvarande kopiegraf, revisionskonflikt utan skrivning, samtidiga identiska kommandon, requestbunden replay, läsande `status_only`, återkallat mandat och förlorat HTTP-svar. Original och gamla elever/klasser/timplaner/beslut/paket samt äldre audit/identiteter/ACL/journal ska bevaras. SQL-transaktionsprov och isolerad browserfixtur är olika från faktisk byggd Worker och faktisk databas; rapportera dem separat.

Efter automatiska prov, handbok, selektiva commits/push och exakt lokal leverans får användaren ett nytt konkret prov av kopiering och klassens explicita års-/versionskoppling. Stanna där för mänsklig bedömning. Full ADMIN-02/03/04, historisk 05-22 metadataavvikelse, GR/IM-beslut, övriga skolformer och full fasacceptans stängs inte genom denna plan.

## Discovery

Level 0: kodgranskning av befintliga skyddade routes, utbildningskvitto, termins-/skolkommandon, klientens återhämtning, F03 och handbok. Inga externa bibliotek eller nya integrationer behövs.
