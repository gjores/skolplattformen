---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "10"
status: complete
completed: 2026-10-01
requirements: [ADMIN-02]
subsystem: protected-programplan-workspace
requires: [05-09]
provides:
  - Mandatbundet gymnasieurval även för befintlig utbildning utan programplan
  - Exakta versions-, legacy- och hashverifierade katalogunderlag för kommande UI
  - Två nya läsgrants efter full preflight, exakt tio phase5-Worker-signaturer
key-files:
  - web/lib/programplan-workspace-contract.ts
  - web/lib/server/programplan-workspace.ts
  - web/app/api/programplaner/lista/route.ts
  - web/app/api/programplaner/underlag/route.ts
  - supabase/migrations/20261001120000_phase5_programplan_workspace.sql
  - supabase/migrations/20261001121000_phase5_worker_programplan_workspace.sql
  - work/pilot/verify-programplan-workspace-api.mjs
  - docs/programplansgrund-kontrakt.md
commits: [8cca473, 6c04259, 088193e, 2e46660]
worker_build_revision: 088193ed542bb84f6b022c07d3d4fa7c88e34f86
---

# 05-10 — gymnasieurval och exakt programplansunderlag

Huvudman och rektor kan läsa egna befintliga gymnasieutbildningar även utan plan, bläddra versioner och återfinna ordnade äldre fördjupningsval genom skyddat API. Hela den uttryckligt valda lagrade katalogen verifieras innan program-/ämnesunderlag projiceras till klienten. Plan 05-09:s fem utkastkommandon och exakta tolvfältssvar består. Denna plan öppnar inget användargränssnitt, utbildningsskapande eller fastställande. ADMIN-02 är fortsatt Pending för återstående användar- och regelverifiering.

## Kontrakt och behörighet

`POST /api/programplaner/lista` accepterar exakt `{page}`. Svaret har `{offerings,count,page,pageSize:50}`. Utbildningsraderna har exakt tretton fält: id/unitId/schoolName/kind/name/localCode/cohort/startYear/status/programCode/orientationCode/latestVersion/draftId. Nullable lagrade uppgifter förblir nullable. Senaste version är 0 där plan saknas.

`POST /api/programplaner/underlag` accepterar exakt `{offeringId,versionPage,catalogId}`. Svaret har education/versions/versionCount/versionPage/pageSize/catalogs/catalog/decisionReady:false. Versioner har id/version/revision/status/decidedOn/catalogId/basisReference/legacySpecialization. Count/latestVersion/draftId beskriver hela utbildningen även utanför vald sida. Unknown/duplicate äldre fördjupningskoder bevaras i faktisk ordning; start och katalog gissas aldrig från kulltext eller aktuell repo-katalog.

SQL låser verklig session, kund och utbildning och återprövar sessions-/mandatkedjan efter faktisk väntan. Sammanhängande kund–huvudman–skola–utbildning och levande uppdrag krävs. HM/rektor får läsa utan MFA; same-origin och aktuell context epoch krävs. Fria behörighetsfält accepteras inte. `catalogId:null` är uttryckligen inget val. Vald helkatalog måste hashverifieras innan servern lämnar den slutna projektionen status/catalogId/diagnostic/source/program/subjects. Saknad exakt källa eller program/inriktning ger synlig blockering; ingen senaste-reserv. En klientprojektion är inte en egen hashverifierad helkatalog.

Audit är obligatorisk i samma yttre transaktion: `programplan_offerings_listed` → education_collection/null; `programplan_workspace_read` → education/verkligt utbildnings-ID. DB/Worker binder faktisk session, identitet, medlemskap, uppdrag, kund och korrelation. Inga rawpayloads, val eller datum loggas. DB-/Worker-auditfel och efterföljande kataloghash-/formatfel stoppar svar och rollbackar framgången. Läsningarna ändrar inga utbildningar, planval, revisioner, beslut, historia eller explicita klassbindningar.

## Färska bevis

- Egna rena parser-/serverharnessprov: 15/15 PASS; dessa är kontrakt-/adapterbevis, inte faktisk HTTP-integration.
- Importsäkerhet, målvägran, exakt profil, restoration och fullmatris: 19/19 harnessunit PASS.
- Protected-bygge PASS med API-källcommit 8cca473 i bygget 088193e. Färsk typkontroll och bred `oxlint app lib` PASS, inklusive sparse-arrayprovets lintanpassning.
- Faktisk preflight: **38/38 fall, 118/118 kontroller PASS**, exakt hela ACL återställd till åtta innan permanent grant.
- Faktiskt slut-API utan temporära grants: **38/38 fall, 118/118 kontroller PASS**. Två källrutter, HM/rektor/no-MFA, sidning, tom skola/utbildning, alla mandat-/sessions-/roll-/kund-/skolgränser, CSRF/epoch/strictpayload, fem auditfel, klient/helpernekanden och oförändrad verksamhet.
- Katalogintegritetsfall använder endast en egen syntetisk katalograd: gammalt hash-ID med ändrat innehåll ger 500 utan underlag och faktisk yttre rollback av DB-läsaudit. Katalograden städas; riktiga sparade kataloger ändras inte.
- Verklig `pg_blocking_pids`-observation av Worker-väntan på utbildningsrad, faktisk sessionssluttid passerad före låsfrigöring och därefter endast minimerat nekande utan DB-framgång.
- Slutlig SQL: **443/443 PASS** = workspace63, workspaceworker18, programplanworker31, katalog60, utkast108, timplan77, timplanworker27, timplanslista59. Nytt workerprov kräver verklig tio-ACL utan reservgrants. Äldre SQL-prov kör uttrycklig åttaprofil genom två lokala revokes med full rollback; gamla assertions/resultat förblir historiska bevis.
- Tidigare programplans-API med explicit tio-profil: **48/48 fall, 278/278 kontroller PASS**. Tidigare timplans-API/lista: **39/39 fall, 135/135 kontroller PASS**. Inget wildcardinventarium eller ändrad historisk acceptans.
- Programplansparitet **42/42 PASS**; sex observerade låsväntningar och yttre SQL-rollback PASS. Timplanslås **4/4 PASS**. Timplansharness har separat säker `--out` så äldre rapport lämnas kvar.

Resultat: `work/pilot/results/phase5-10-api-preflight.json`, `phase5-10-api.json`, `phase5-10-programplan-api-regression.json`, `phase5-10-timplan-api-regression.json`, `phase5-10-locks.json`, `phase5-10-timplan-locks-regression.json` och separata `phase5-10-phase5_*-sql.json`.

## Tillämpning, säkerhetsgranskning och städning

Det första försöket till beständig 121000-grant avslogs av automatisk godkännandegranskning, som efterfrågade uttryckligare avgränsning för två EXECUTE-rättigheter. Ingen åtgärd kördes och ingen indirekt behörighetsväg användes. Root samlade därefter nytt oberoende läsbevis: assertTarget med IdP, loopback-DB/API, specifik lokal Docker-provcontainer, fortsatt exakt åtta gamla grants och full 38-fallspreflight/restoration/bevarande. En transparent omprövning av exakt samma avgränsade steg godkändes automatiskt. Inget nytt manuellt användargodkännande påstås.

Root tillämpade 121000 och registrerade 120000/121000 i migrationsledger i samma kontrollerade transaktion. Tillämpningsbeviset är separat `phase5-10-grant-application.json`: faktisk tio-ACL, noll PUBLIC/anon/authenticated-EXECUTE och båda ledgerposter. Bara två nya lässignaturer öppnas; helpers och direkta tabeller förblir stängda. Slutliga faktiska API-/SQL-bevis ovan följer efter tillämpning.

Globala före/efter-hashar för planrader, utbildningar, historia, klassbindningar och kataloger är identiska efter API-fixturernas cleanup. Fulla egna verksamhets-/session-/mandatrester är noll. I workspace-matrisen behålls 72 säkerhetshändelser och tre nödvändiga identitetsankare. Programplanslåsprovet behåller tre säkerhetshändelser och ett ankare. Append-only säkerhetsloggen raderas inte. Alla egna triggers och syntetiska korruptkataloger städas; inga främmande triggers tas bort. Samtliga DB-anslutningar och API-previewprocesser från denna plan är avslutade före roots beständiga användarprovsrader.

Fingerprints:

- API-källcommit: `8cca473401a7e2e44714da85480a1c6b1dc79590`.
- Worker-bygge: `088193ed542bb84f6b022c07d3d4fa7c88e34f86` (API-bevis, inget UI-browserbevis).
- Katalog: `sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace`.
- 120000 SHA-256: `1f8efa579c5bc27e5e97edcbcbd4fba0538dec8f31af9862d935114c143094fa`.
- 121000 SHA-256: `944dbc3adbe86aa81c60cdaa5ea1098346ba1b4545494f56883dc619d94198bf`.
- Faktiska källhashar för rutter/server/parser/harness sparas i API-rapporterna; kataloggrundens originalmigrationer skrivs inte om.

## Rättningar och kvarvarande avgränsning

SQL-fixturen rättades så en blockerad medlem har blocked_at och den positiva tomskolekontexten använder ett separat giltigt huvudmannauppdrag. En tidig SQL-källcommit gjordes innan det sista fixturfallet passerade; 088193e rättade detta med färska fulla 63/63 bevis. Workspace-preflightens avsiktligt brutna skolrelation återställdes först med millisekundtrunkering av updated_at i drivrutinen. Explicit text→timestamptz bevarar mikrosekunder; både eget fullfältssnapshot och globala originalhashkrav behölls oförändrade. Den första slutliga timplansliste-SQL-körningen krävde sin historiska åttaprofil; de två lokala revokes lades till och hela berörda filens 59 prov passerade därefter.

05-11 kan nu öppna utbildningslista/versioner, exakt källa, uttrycklig bindning/start, fördjupning, skapa första utkast inom befintlig utbildning och klona en låst källa. UI, handbok, desktop/telefon/keyboard-browserprov och den samlade mänskliga grinden återstår där. Roots 05-12 ger den beställda timplanshandledningen separat.

Skapa/ändra utbildning kräver en separat huvudmannaoperation med servervaliderade namn/localCode/cohort/startYear/status/skolform, CAS/dubblett/audit och bevarade ID:n/elevplaceringar. Fastställande, full nationell regelgrund, schematid, kullkopiering och klasskoppling levereras inte av 05-10. Dessa lokala syntetiska integrationsprov är inte interaktiv IdP, riktig kommunanslutning eller godkänd pilotdrift. Ingen extra mänsklig backendgrind krävs för att fortsätta till 05-11.
