---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: programplan-timplan-transition
verified: 2026-10-05T22:04:49Z
verified_local_date: 2026-10-06
status: passed
score: "5/5 avgränsade målsanningar verifierade; 60/60 aktuella browserfall passerar"
verification_scope: "Förberedande skolvisa gymnasietimutkast från en färdig sparad programram"
source_commit: 3ae5fe5a7f1c4a58c454d28d474a6cbaa9cd6c5b
worker_build_revision: 3ae5fe5a7f1c4a58c454d28d474a6cbaa9cd6c5b
requirements: [ADMIN-02, ADMIN-04]
full_phase_status: open
human_status: awaiting_user
remaining_verification: []
---

# Ursprunglig verifiering av programplan → skolans timutkast

Den beställda övergångens fem målsanningar är **PASS** med verkliga kod-, SQL-, Worker- och browserbevis. Vid denna ursprungliga verifiering körde vanlig lokal `3012` samma skyddade bygge som de 18 godkända gymtimplansproven: `3ae5fe5`, med 174 byteidentiska artefaktfiler. Även samtliga 42 angränsande browserregressioner passerar; totalt 60/60 aktuella fall med 60 städningsbilagor. Efter hela matrisen är 14 ursprungliga verksamhetstabellers fulla rader och 18 befintliga scenarier fortfarande exakt bevarade. Den här rapportens PASS gäller den avgränsade övergången och slutgodkänner inte ADMIN-02/03/04, hela 05-23/E, fas 5, verklig kommunanslutning eller användarens begriplighetsprov.

**Senare ändring 2026-10-06:** Radens timdialog är ersatt med direkta terminsceller och radvis autospar på `5dd7baf`, som nu kör på vanlig 3012. Den nya avgränsade kontrollen har 26/26 dator-/telefonprov och riktade modell/server 24 PASS. [Rättningsrapporten](../../debug/gym-timplan-inline-hours.md) och [aktuellt kontrollindex](../../../work/pilot/results/phase5-gym-inline-hours-checks.json) redovisar nya bevis samt den bevarade initiala baslinjeavvikelsen och kompletterande PASS från provstart. Nedanstående fulla SQL/API/regressionsbevis gäller ursprungliga `3ae5fe5`; de påstås inte omkörda för cellrättningen.

Beställningen och planen är från 2026-10-05. Avslutande verifiering sker 2026-10-06 svensk tid; råbevisens ursprungliga UTC-tider behålls.

Verifieringsmålet är [den avgränsade övergångsplanen](05-PROGRAMPLAN-TIMPLAN-TRANSITION-PLAN.md): fortsätta från utbildningens färdiga **sparade** poäng- och terminsram till en viss skolas beständiga timutkast, fylla och återläsa timmar, återgå till använd programversion och uttryckligen skapa ny timversion när underlaget ändras. Formella program- och timplansbeslut ingår inte. Syntetiska positiva körfall använder SA:s verifierade 2 500-poängsram; okänd yrkesram ges ingen gissad total.

## Målsanningar och faktiska bevis

| Målsanning | Status | Kodkoppling och observerat beteende |
| --- | --- | --- |
| Användaren fortsätter från en färdig sparad programram till rätt skolas riktiga redigerbara timutkast. | VERIFIED | `ProtectedProgramplanWorkspace` skickar sparat plan-ID genom `onTimplan`. `ProtectedHome.goToTimplan`, `loadUnderlag` och `openPlan` leder till de fyra riktiga gymvägarna. RPC skapar en skolbunden beständig version. Browser T01 provar skapa, spara, återläsa, reload med samma timplans-ID samt exakt källplan och retur med bevarat årval. T04 provar konkret kompletteringsbesked utan tom timplan. API `source-school-scope`, `create-two-schools-replay` och `source-not-ready` passerar på vanlig 3012. |
| Programutkast kan användas som planeringsunderlag utan att källan eller timmarna påstås fastställda. | VERIFIED | SQL accepterar komplett `utkast` eller giltig `faststalld` källa och skapar endast `utkast` med fryst verklig källstatus. TS kräver strukturell beredskap före commit. UI skiljer timutkast, källstatus och revision; ingen beslutsknapp byggs. SQL #5 och browser T01 provar utkastkälla. API provar att en giltig beslutad källa förblir användbar trots en högre programutkastversion, utan omskrivning av beslutet. |
| Programramens poäng, fasta rader, alternativ och valblock kopieras exakt; timmar fylls separat. | VERIFIED | `projectSource` verifierar hela sparade katalogens SHA-256, resolverar exakt referens, jämför ordnade `key + points`, använder sparade sex poängterminer och kör `analyseProgramplan.ready`. SQL fryser `gym_basis` och käll-ID. Sex timmar lagras med separat `allocated`-mask. SQL #8–11/#20–21 och T01 visar blankt ≠ angivet 0, nekad inaktiv termin och oförändrad programrad; API provar även omvänd nivåordning med atomisk rollback. Svenska/SvA och block är egna ramrader som räknas en gång. Ingen 0,9-omvandling finns. |
| Samma programram kan ge olika skolors timmar och ingen klasskoppling flyttas. | VERIFIED | `timplans.unit_id` och skolvis versionskontroll används av live `phase5_gym_timplan_scope`. HM läser; rektor och administrator skriver inom den aktuella skolan. T02 och API provar två skolor med olika timmar, HM-läsvy, admin-GY-skrivning och nekad främmande skola. `legacy-class-preservation` samt fulla originalhashar visar att befintliga klasslänkar och GR/IM-rader består. |
| Ändrat programunderlag kräver ett uttryckligt nytt timutkast; gamla timmar och källversioner bevaras. | VERIFIED | `sourceChanged` jämför aktuellt program-ID/version/revision mot fryst källa. UI kräver nyversionshandling med exakt käll- och föregångarrevision. SQL kopierar bara identiskt `rowKey + points + pointTerms`; ändrade rader börjar blankt. T03, SQL #22–29 och API `source-replacement` provar ny version, bevarad föregångarmatris och fryst källa. Beslutad föregångare lämnas helt orörd. T06 och samtidig create visar att återförsök med samma kommando ger ett ID. |

Score avser dessa fem avgränsade verksamhetsbeteenden. Angränsande regressioner redovisas separat nedan och passerar på samma aktuella käll-/byggrevision.

## Artefakter och kritiska kopplingar

Samtliga nedanstående artefakter finns, har substantiell implementation och används i den skyddade appen. Kodgranskningen fann inga tomma handlers, platshållarimplementationer eller saknade API-kopplingar.

| Artefakt | Verifierad funktion |
| --- | --- |
| [gym-timplan.ts](../../../web/lib/gym-timplan.ts) | Slutna begäranden/svar, exakta sex timmar, null/0, fullständig fryst radmatris, källändring och redigering enbart av utkast. |
| [server/gym-timplan.ts](../../../web/lib/server/gym-timplan.ts) | Full kataloghash, exakt resolverad källa, strukturell analys, kvittensbunden create/replay och minimerade fel. Create-snapshot verifieras innan den yttre transaktionen får commit. |
| [gymroutes](../../../web/app/api/timplaner/gym) | Fyra slutna POST-vägar använder den faktiska servermodellen och RPC-resultaten. Läsning har required audit; skapa/helrad har required audit, MFA/CSRF och rektor/admin-scope. |
| [gymtimplansvyn](../../../web/app/protected-gym-timplan-workspace.tsx), [Home](../../../web/app/protected-home.tsx), [programplansvyn](../../../web/app/protected-programplan-workspace.tsx) | Riktigt skapa/öppna/spara/återläsa, skolval, källretur, URL med server-ID, skydd av osparat arbete, konfliktjämförelse och säkert återförsök. Senast öppnad plan och årval rensas vid session-/uppdragsbyte. |
| [foundation-SQL](../../../supabase/migrations/20261005110000_phase5_gym_timplan_transition.sql) | Fryst källa och FK, skolavgränsning, CAS, kvittens, oföränderlig historik, sextermsguard, deferred fullmatriskontroll och atomisk audit. |
| [exakt Worker-grant](../../../supabase/migrations/20261005111000_phase5_worker_gym_timplan_transition.sql) | Öppnar endast fyra nya RPC-signaturer efter verklig preflight. Hjälpfunktioner, receipts och klientroller förblir stängda. |
| [handbok programplaner](../../../docs/handbok/programplaner.md), [handbok timplaner](../../../docs/handbok/timplaner.md) | Förklarar sparat underlag, separata timmar, skolans versioner, roller, retur och uttrycklig uppdatering utan att påstå formella beslut eller garanterad undervisningstid. |

Den fullständiga sparade katalogen används vid projektion, inte dagens repoartefakt eller en klientprojektion. Katalogens befintliga insert-hashguard samt update/delete/truncate-spärr gör dess innehåll oföränderligt. Timplanens `gym_basis` och käll-ID skyddas separat av den nya guard-triggern. Lästa timversioner bedöms mot sin frysta struktur; en ändrad aktuell programplan skriver inte om gamla timmar.

SQL kontrollerar full poängram, tillåten källa och alla poängterminer. Worker kontrollerar dessutom kataloghash, exakt ram och nivåordning i samma yttre transaktion. Det är kombinationen som är den fullständiga create-grinden; klientens `ready` är inget behörighetsbevis.

Levande session och mandat kontrolleras före och efter låsväntan. Det verkliga API-provet observerar Worker som blockerad via `pg_stat_activity`, avslutar sedan mandatet och visar nekad radskrivning utan ändrad verksamhetsrad eller success-audit. Samtidiga identiska create-kommandon ger en version och en replay; samtidig samma-revision-skrivning ger en vinnare och en CAS-konflikt. Både sent DB-auditfel och Worker-auditfel rullar tillbaka skapa och timrad.

Äldre tabell-ACL bevaras. Tre restriktiva RLS-policyer stänger nya GY-planer, tilldelningsmasker och identitetsbunden timhistorik även för Worker med äldre roll-GUCs. SQL och riktig Worker provar råa reads/updates/inserts; Worker har varken superuser eller BYPASSRLS. Den äldre `phase5_timplan_scope` nekar den nya gymgrunden, så gamla read/cell-kontrakt kan inte kringgå sextermsformatet.

## Utförda kontroller

| Kontroll | Faktiskt resultat och underlag |
| --- | --- |
| Modeller/server/harness | 524 modellprov, 150 serverprov och 9 harnessprov passerar; inga misslyckade eller överhoppade prov i dessa körningar. Lokala slutloggar: `gym-timplan-model-final.log`, `gym-timplan-server-tests.log`, `gym-timplan-harness-final.log`. |
| Typ/lint/appbygge | Typkontroll och oxlint passerar. Skyddat bygge av `3ae5fe5` passerar. Byggets native-config-/chunk-varningar redovisas i loggen; de är inte byggfel. Lokala slutloggar: `gym-timplan-tsc-repair.log`, `gym-timplan-lint-final4.log`, `gym-timplan-build-repair.log`. |
| Handbok | `docs:build` genererar statiska filer. Docusaurus updaterkontrollvarning är separat från lyckad kompilering. Underlag: lokal `gym-timplan-docs-final.log`. |
| Sluten foundation före grants | [Foundation rollback](../../../work/pilot/results/phase5-gym-timplan-foundation-rollback.json): 37 pgTAP + 10 kontrollpunkter PASS. Originalrader/tidsstämplar, äldre funktions-/tabell-ACL och migrationsjournal består; endast nya nullable fält tillkommer. Exakt tidigare 21 Worker-entrypoints verifieras före öppning. |
| SQL efter permanent grant | [Aktuellt SQL-prov](../../../work/pilot/results/phase5-gym-timplan-sql-current.json): 37/37 PASS i rollback, utan reset. Originalrader samt ACL/journal/definitioner bevarade. Aktuell test- och foundationhash matchar koden. SQL #2 accepterar enbart helt stängd Worker eller alla fyra exakta RPC-rättigheter; klienter och helpers förblir stängda. |
| Worker-preflight före permanent grant | [Preflight attempt1](../../../work/pilot/results/phase5-gym-timplan-preflight-attempt1.json): 11 fall/157 kontroller PASS på byggd `c6aaa78`, med tillfälliga fyra RPC-grants och exakt ACL återställd efteråt. Städning och bevarande passerar. Den senare telefonrättningen och slutbygget har egna nya API-/browserbevis nedan. |
| Verklig Worker på slutbygget | [API repair](../../../work/pilot/results/phase5-gym-timplan-api-repair.json): 11 fall/157 kontroller PASS. [API vanlig 3012](../../../work/pilot/results/phase5-gym-timplan-api-3012.json): samma 11/157 PASS efter serverbyte, full städning och bevarade 14 originaltabeller. Testernas källhashar matchar aktuell kod. |
| Dator och telefon | [Browser verifierat](../../../work/pilot/results/phase5-gym-timplan-browser-verified.json) och [rå attempt2](../../../work/pilot/results/phase5-gym-timplan-browser-attempt2.json): 18/18 PASS, Chromium/WebKit, 0 retries/flaky/skips, 18 städningsbilagor, inga egna verksamhetsrader kvar. 20 geometri-/bildbevis, varav 10 dator/10 telefon, har granskats; dokumentet håller telefonbredd och tabellen rullar lokalt. |
| Bevarande efter serverbyte och hela regressionsmatrisen | [Runtime före](../../../work/pilot/results/phase5-gym-timplan-runtime-before.json)/[slutligt efter](../../../work/pilot/results/phase5-gym-timplan-runtime-after.json): 18 bevarade syntetiska användarscenarier, 44 auditpar och exakt samma fulla helradshashar för 14 tabeller efter samtliga regressioner. [Artefaktkopiering](../../../work/pilot/results/phase5-gym-timplan-artifact-copy.json): 174 filer utan byteavvikelse; äldre klientfiler behålls. |
| Angränsande browserregressioner | [Legacytimplan 22/22](../../../work/pilot/results/phase5-gym-timplan-regression-legacy.json), [programram 10/10](../../../work/pilot/results/phase5-gym-timplan-regression-frame.json), [valblock 6/6](../../../work/pilot/results/phase5-gym-timplan-regression-blocks.json), [skrivskyddad terminsanalys 2/2](../../../work/pilot/results/phase5-gym-timplan-regression-termsreadonly.json) och [L07 2/2](../../../work/pilot/results/phase5-gym-timplan-regression-lifecycleL07.json): samtliga 42 PASS, 0 skips/unexpected/flaky/global errors, exakt `3ae5fe5` i både source och build. |

Regressionernas städningssammanställningar finns för [legacy](../../../work/pilot/results/phase5-gym-timplan-regression-legacy-summary.json), [programram](../../../work/pilot/results/phase5-gym-timplan-regression-frame-summary.json), [valblock](../../../work/pilot/results/phase5-gym-timplan-regression-blocks-summary.json), [terminsanalys](../../../work/pilot/results/phase5-gym-timplan-regression-termsreadonly-summary.json) och [L07](../../../work/pilot/results/phase5-gym-timplan-regression-lifecycleL07-summary.json). De innehåller 42 städningar med tom `nonzero`. Tillsammans med gymtimplanens 18 blir det 60 ägda städningar. De äldre fixturesammanställningarna saknar egna fulltabellhashar; det avslutande `runtime-after` styrker därför separat bevarande av samtliga 14 originaltabeller efter alla körningar. Bildserierna för regressionerna är granskade, utöver gymtimplansprovets 20 redovisade bild-/geometrikontroller.

Alla produktprov gäller den lokala skyddade miljön och syntetiska data. SQL-proven använder rollback; produkt-/browserprov har ägd städning. Audit är append-only och behålls. Bilder och lokala loggar ligger utanför Git; beständiga JSON-bevis innehåller granskad syntetisk verifieringsmetadata. Detta är inte en verklig kommun- eller elevregisteranslutning.

## Bevarade första avvikelser och öppna större krav

Följande misslyckade körningar bevaras separat från senare PASS: [foundation attempt2](../../../work/pilot/results/phase5-gym-timplan-foundation-attempt-02-fail.json), [browser attempt1](../../../work/pilot/results/phase5-gym-timplan-browser-attempt1.json) och [legacyregressionens första uppsättningshinder](../../../work/pilot/results/phase5-gym-timplan-regression-legacy-first-fail.json). Den sista guardvägran inträffade före fixture eftersom den äldre testguarden krävde en rootmarkör; den är inget genomfört eller passerat legacybeteendeprov. Telefonens första overflow rättades och slutbygget provades på nytt med full bild-/geometrikontroll. Det allra första parameterambiguösa SQL-felets original-JSON skrevs över; bara körutdata finns kvar som ursprungligt bevis.

De historiska avvikelserna från tidigare leveranser består: full SQL-svits äldre `phase2_audit#13` är **FAIL**; 05-22:s första backfill ändrade fyra timplans `updated_at` och är **PARTIAL** för historisk metadata. Den här leveransens bevarande från sitt aktuella före-läge reparerar inte dessa tidigare avvikelser.

| Krav/arbete | Status efter denna verifiering |
| --- | --- |
| ADMIN-02 | Pending. Nytt delbevis för sparad programram → skolans timutkast; fulla beslutsregler och mänsklig begriplighet återstår. |
| ADMIN-03 | Pending. Kullkopiering och dess fulla godkännande avgörs inte här; timutkast kopieras inte automatiskt till nästa kull. |
| ADMIN-04 | Pending. Klasslänkar bevaras och flyttas inte av ny timversion. Ny klasskopplingshandling, fastställande, fullständigt läsårsunderlag och mänskligt prov ingår inte i övergången. |
| Hela 05-23/E och fas 5 | Öppna. Detta är ett avgränsat kompletterande genomförande, inte slutverifiering av hela fasen. |
| 05-17, program-/timplansbeslut och skolorganisation | Öppna. Yrkesprofil, juridisk beslutsberedskap, garanterad tid, elevval, individuella studieplaner, språkgruppers dagar och bemanning får inga fabricerade leveranser. Paket återinförs inte i programplanen. |

## Mänsklig verifiering

Användarens verksamhetsbedömning förblir `awaiting_user`: på vanlig 3012, välj den sparade programplanens **Timplan**, granska att poäng och timmar är begripliga, fyll/spara en timrad och återgå till rätt programversion och skola. På telefon ska årskursval, lokal tabellrullning och sparstatus gå att använda utan att hela sidan blir bredare. De automatiska flödesproven och den granskade bildserien stöder beteendet men är inget påhittat mänskligt godkännande och inget krav på nytt tillstånd för redan beställd implementation.

Verifierat av GSD-verifier genom läsgranskning av aktuell kod och verkliga bevis. Inga DB-anrop, produktändringar eller teständringar utfördes under denna slutgranskning.
