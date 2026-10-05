---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "23"
status: in_progress
completed_steps: [A, B]
next_step: C
requirements: [ADMIN-02, ADMIN-03]
requirements-finally-verified: []
human_result: awaiting_user
worker_build_revision: 2b452370d66c11277c9783cdee428c7f15925df7
---

# 05-23 — full poängsumma och valbara block

Steg A och B är genomförda och automatiskt verifierade lokalt med syntetiska data. Nya och uppgraderade utkast har Svenska/SvA-rader och valbara block. Huvudman/rektor kan dela individuellt val och lägga till fördjupningsblock. Hela 05-23 är fortfarande in_progress: skolornas paketval och fullplansverifiering återstår i C–E. Mänsklig begriplighetsbedömning är awaiting_user. Avsnitt A nedan är dess historiska leveransbevis; B anger aktuellt beteende och bygge.

## Steg A — nya planer, svenskrader och blockramar

Källcommits: `ef365fc` (grundformen), `84ba403` (legacy-förhandsvisning) och `b819a50` (numerisk SQL-rättning). Migrationerna `20261004150000_phase5_programplan_choice_blocks.sql` och `20261004150100_phase5_programplan_block_numeric.sql` är tillämpade och journalförda på det isolerade målet `protected`. Ingen reset eller verksamhetsbackfill har gjorts. Aktuella före-definitioner inventerades med `pg_get_functiondef`; se [FUNCTION-INVENTORY](05-23-FUNCTION-INVENTORY.md).

- Nytt underlag har `choiceBlocks`. Katalogens Svenska/SvA-alternativ blir tre terminsrader à 100 p. Slotblockens id, namn och poäng kommer från den pinnade katalogen; individuellt val har en 200-poängsram. Exakt en rad per block, ingen v2-rad `meta:individualChoice`.
- Alla 29 program och 70 inriktningskombinationer prövas i TS och SQL. SA:s tre inriktningar når 2 500 p med 300 p vald programfördjupning. Ny plan utan den fördjupningen visar kvarstående poäng mot programmets total; inga nivåer läggs till utan användarval.
- Block-id följer det beslutade kontraktet, inklusive giltiga `constructor`/`prototype`, med säkra listor/Map. Ogiltiga former, dubbla id, slotavvikelser och fel IV-summa nekas.
- Nya skapandevägar skickar v2. Lagrade legacyplaner, deras förhandsvisningar och kopiering behåller sitt faktiska gamla underlag. Reply-kontrollen jämför också pinnade block och nekar tappade eller ändrade block.
- Inga nya grants. Exakt tidigare 16 Worker-entrypoints; nya interna hjälpare är stängda för klienter, Worker och service_role. Befintliga ACL och ej ersatta definitioner bevaras.
- Handboken beskriver verifierade nya rader och tydligt att äldre utkast och paketval återstår. Den är byggd utan publicering.

### Kontroller och rapporter

Minimerade rapporter ligger i `work/pilot/results/phase5-23-a-*.json`. Lokala rårapporter, loggar och bilder finns i `web/test-results/phase5-23-a-final/`. Orörda rårapporter har SHA i browserrapporten; `*-local.json` och `report-paths.json` flyttar bilagornas sökvägar inför städning av byggkopian.

| Kontroll | Resultat |
|---|---|
| Node modell/server | Slutligt 593/593 PASS |
| TypeScript, oxlint, skyddat bygge, handboksbygge, diff-kontroll | PASS |
| Riktad SQL | Först 312/312; efter numerikrättningen 326/326 PASS |
| TS/SQL-katalogparitet i rollback | 142/142 PASS, legacy/v2 för 70 kombinationer och två kontrakts-id |
| Numerisk RED/GREEN | Före rättning 3/326 FAIL med `22P02`; efter rättning 326/326 PASS. 14 rå-JSON-fall |
| Faktisk migration och numerikrättning | PASS: nio hela tabellmängder, tidigare ACL och andra definitioner oförändrade, journalposter finns |
| A-API, faktisk byggd Worker | 3/3 PASS, nio ordnade TS/SQL-vektorer, v2 skapa/spara/återläsa, revision och parade auditspår |
| Termins-API | 31/31 PASS |
| B01 på dator och iPhone 13 | 2/2 PASS på `84ba403`, sedan 2/2 på slutligt `b819a50` |
| Programplansbrowser / terminsbrowser | 40/40 och 25/25 PASS, ett avsiktligt hoppat datorfall för telefonlayout |
| Städningsbilagor | 68/68 i första matrisen och 2/2 i slutligt B01: noll egna kvarvarande verksamhetsrader/felinjektioner. Append-only audit och nödvändiga ankare behålls |
| Full SQL, 31 filer | **FAIL 2289/2290**, enbart det tidigare kända `phase2_audit` #13 |
| Användarprov före/efter serverbyte | 18 aktuella scenarier över nio utbildningar/två roller, 44 auditloggade läsningar per omgång, verksamhetsrader bevarade |

API och slutligt B01 använder samma käll- och byggrevision `b819a50c0116194e52fdf089ee7f7d134640da2c`. Program-/terminsregression och termins-API använder `84ba403`; produktkod i `web/app` och `web/lib` samt dessa browserprov är identisk med slutrevisionen. Rättningen ändrar endast SQL:s konvertering av redan validerade heltal, dess test, målskydd och A-harnessens källbevis. Hela SQL-regressionen kördes igen efter rättningen.

Dator-/telefonbilder är visuellt granskade: läsbara Svenska/SvA-rader, blockramar, 2 500/2 500, sparstatus och årskursväxling. Ingen global sidöverströmning. Det är agentens kontroll, inte användarens begriplighetsgodkännande eller verklig kommunanslutning. API/browser använder mintade lokala syntetiska sessioner mot riktig Worker och PostgreSQL; interaktiv OIDC/MFA-bedömning härleds inte ur dem.

### Avvikelser och bevarande

- Tillämpad migration 150000 är byteidentisk med sitt tillämpningsbevis. Slutgranskningen fann att giltigt rå-JSON `200.0` gav castfel. Separat 150100, från aktuell funktionsdefinition, normaliserar med `numeric::integer` först efter heltalsvalidering. RED och GREEN bevaras. Ingen tillämpad fil har redigerats.
- Steg A behöver även workspace-pinning, förslagsrangordning, reply-test och handbok för att nya skapandevägar faktiskt ska fungera. De avgränsade beroendena ligger i källcommiten; senare steg B:s blockkommandon/analys är inte genomförda.
- Skyddat bygge/server på 3059 kördes i egen ignorerad byggkopia med samma kontrollerade runner, i stället för att låta restart-scriptet skriva över den aktiva 3012-katalogen. Den gamla servern hölls igång tills slutbygget var prövat. Vid kopiering följde byggserverns privata restfiler med; ägarskapsskyddet stoppade starten, kopiorna togs bort, och 3012 startades med egna inställningar. Inga hemligheter versionshanterades.
- Vanlig 3012 kör slutligt `b819a50` och behåller 35 tidigare klientfiler för öppna flikar. Ingen automatisk omladdning eller återskapande av användarplaner. Byggkopian och föregående byggbackup städas efter att råbevisen bevarats.
- Under första read-only inventeringen tillkom verksamhetsrader från annat aktivt flöde. Dessa behölls. Delmängdsbevis identifierar alla ursprungliga rader; migrationerna har dessutom separata helradsbevis före/efter. 05-22:s historiska fyra ändrade `updated_at` återställs inte genom A och förblir PARTIAL.
- Full SQL:s äldre auditfall förväntar annan feltext. Det räknas som FAIL och är inte dolt som ett godkänt prov. Alla fas 5-filer passerar.

## Steg B — äldre utkast, blockändring och terminsanalys

Källcommits: `b6675af` (B), `50c830a` (fixtur/låssvar), `939e109` (historisk blockkloning), `3223297` (ersatt källfixtur), `1978024` (browserförväntningar), `2b45237` (verklig mobilbreddsrättning) och `6fadda4` (utbildningsharness). Slutlig produkt-/Workerrevision är `2b452370d66c11277c9783cdee428c7f15925df7`; den sista commiten ändrar endast testharnessen, vars produktkällor är identiska med bygget.

- Huvudman och rektor med mandat för alla planens skolor kan **Dela i block** för individuellt val (sammanlagt 200 p) och **Lägg till valbart block** för programfördjupning. Alla skrivningar går genom riktig Worker med MFA, CSRF, CAS och atomisk DB-/Worker-audit. Administrator har ingen plan-/blockskrivning; dess utökade läsning och skolpaket hör till C.
- Slotblock från katalogen har fast identitet/ram. Ett fördelat block måste tömmas och sparas innan det tas bort eller får andra poäng. Borttagna id får inte återanvändas inom utbildningen. Giltig kloning från en äldre fastställd/ersatt version behåller däremot hela källans blockidentiteter och ändrar inte källan.
- Faktisk migration uppgraderade **13 bundna legacyutkast**, även redan låsta utbildningars utkast. Endast underlag, terminsfördelning och revision+1 ändrades. Alla andra fält, inklusive updated_at, och fastställda/ersatta helrader bevarades. Förevärden sparas i den stängda `programplan_shape_upgrades` utan ny raderingsspärr.
- Gamla terminsrader och deras ordning bevaras, `meta:individualChoice` blir `block:iv1`, nya svenskrader får inte fabricerade nollrader. Legacy-fastställda versioner visas **Ofullständig** med möjlighet till ny version. Analysen räknar programmets total och använder nivåernas starttermin: högre nivå före lägre är fel, gemensam termin är risk, även för Svenska/SvA.
- Handboken anger verifierade blockkommandon och kvarstående skolpaket. Byggd utan publicering.

### Migrationer och bevarande

Tillämpade och journalförda på avsett isolerat `protected`, utan reset:

| Migration | SHA-256 | Bevis |
|---|---|---|
| 151000 block commands | `1c5b41f877d5a464138de6eaae226b12f429d3ad07d3bdb650ba163f81785267` | Oförändrade verksamhetsrader/äldre ACL; nya hjälpare och kommando stängda |
| 152000 shape upgrade | `4d24e8367fed0480c95ed621af5c65e5a6e0b466f52f5539bbd0272b1ae34de5` | Exakt 13 uppgraderade utkast, fullrad/tidsstämplar och stängda föreloggar |
| 152100 clone identity | `26cff31f00878ed5c84983e427ce1fde4885fd11d46764575a4416fa942717cf` | Separat rättning: hela tio verksamhetsmängder, äldre ACL och övriga definitioner oförändrade |
| 153000 Worker blocks | `166bf45c4cd6bc2f8cf25d73dc4fc26ea84d08738f02bfe9996046a2e9579c14` | Efter återställd 11/11 preflight; endast blockgrant, exakt 17 entrypoints |

Aktuella före-definitioner/ACL och triggerläge inventerades innan ersättning; se [B-FUNCTION-INVENTORY](05-23-B-FUNCTION-INVENTORY.md). Ingen tillämpad migrationsfil ändrades. 152100 behövdes när faktisk preflight fann att en utbildningsomfattande retired-ID-spärr också nekade legitim historisk kloning. Kontrollerad, låst källkontext ger just denna kloning tillåtelse; create-draft tömmer kontexten, och återinförande efter borttagning nekas fortfarande.

### Kontroller och rapporter

Minimerade versionshanterade rapporter: `work/pilot/results/phase5-23-b-*.json`. Lokala rårapporter, SHA, loggar, bilder och flyttade bilagor: `web/test-results/phase5-23-b-final/`. Första misslyckade omgångarna behålls; sammanlagd slutlig täckning är uttryckligen från basomgång plus riktade omprov.

| Kontroll | Resultat |
|---|---|
| Node modell/server | 609/609 PASS på 939e109; modell/serverkällor oförändrade i slutbygget |
| TypeScript, oxlint, skyddat bygge | PASS; upprepat efter mobilrättning på 2b45237 |
| Handboksbygge | PASS |
| Riktad SQL i rollback | 897/897 före separat klonrättning; därefter 912/912 i tolv filer |
| Upgrade rollback / TS–SQL-paritet | 14 behöriga utkast med exakt helradsbevis / 210/210 vektorer PASS |
| Block-API preflight / faktisk grant | 11/11 PASS, ACL återställd och ursprungliga hela verksamhetsmängder bevarade / endast avsedd grant |
| Block-API slutlig Worker | 11/11 PASS, inklusive historisk kloning, CAS, lås, auditrollback och direkta klientnekanden |
| API-regression | Programplan 48/48, terminer 31/31, livscykel 39/39, utbildningar 43/43 PASS; egna fixturer städade och original bevarade |
| Blockbrowser B01–B03 | 6/6 PASS, dator och iPhone 13, upprepat på slutligt 2b45237 |
| Program-/termins-/livscykelbrowser | Slutlig täckning 40/40, 25/25 (+1 avsiktligt skip), 20/20 PASS |
| Browserstädning | 96 städningsbilagor med noll egna kvarvarande verksamhetsrader/felinjektioner; append-only audit/ankare bevarade |
| Editorns verkliga mobilbredd | RED: högerkant 405,75 > tabellkant 372; GREEN: 359 ≤ 372. Alla fält, knappar och hjälptexter ryms; båda formulären visuellt granskade på dator/telefon |
| Full SQL efter alla rättningar | **FAIL 2337/2338**, endast känt phase2_audit #13 (`History denied` mot förväntad serverkontext); alla fas 5-filer PASS |
| Användarprov före/efter serverbyte | 18 aktuella scenarier/nio utbildningar/två roller och 44 auditloggade läsningar per omgång; befintliga verksamhetsrader bevarade |

Programbrowserns första 38/40 och terminsbrowserns 23/25 (+skip) behålls som FAIL. De nya tre tilläggsraderna krävde mätning av alla knappar i stället för en enda locator; terminsfallet ska visa 200 p kvar när faktiskt 2 300 av 2 500 är fördelade. Dessa prov rättades utan att produktkraven sänktes; omprov 2/2 per svit PASS. Efter mobilrättningen passerar blocksvit 6/6 och programmets pekytefall 2/2. En omkörning mot fel standardport stoppades i uppsättningen; råfel/logg behålls, rätt 3059 ger PASS. Utbildnings-API:s första 40/43 berodde på äldre skolantal, SA-block kopierade till VO och passerat-startdatumets explicita kod; aktuella exakta kontrakt ger 43/43. Preflightens tidiga låsförväntning och konkurrerande fastställda källfixturer korrigerades före grant. Ingen felomgång döps om till godkänd.

En ny oberoende verifierare granskade kodkedja, data, skydd och bilder; se [B-VERIFICATION](05-23-B-VERIFICATION.md). Lokal syntetisk verifiering innebär inte mänskligt begriplighetsgodkännande, interaktiv MFA/IdP-verifiering eller verklig kommunanslutning. 05-22:s historiska fyra updated_at-avvikelser är fortsatt PARTIAL och återställs inte här.

Vanlig **3012 kör slutligt 2b45237**, med tidigare klientfiler bevarade för öppna flikar. Privat `.dev.vars` och låsfiler följde inte med vid byggbytet. Ingen automatisk omladdning eller reset av användarplaner; byggkopian och föregående byggbackup är städade efter bevarande av råbevis och verifierad källpush (6fadda4). Slutlig GSD-beviscommit pushas separat.

### Överlämning till ny session — steg C

A och B är klara; hela planen och ADMIN-02/ADMIN-03 förblir öppna. Läs STATE, 05-23-PLAN/CONTEXT och A/B-bevis. Nästa nya executorsession genomför C: skolans språkpaket och terminsram, mandat för huvudman/rektor/administrator, utfällbar blockrad och skrivskydd över andra skolor. Inventera aktuella SQL-definitioner (inklusive 152100) före ersättning; exakt 17 Worker-entrypoints är baslinjen. Separat C-preflight krävs innan 155000-grant. Generella valpaket för fördjupning/IV/HU/NA hör till D; full regression och slutligt mänskligt paketprov till E.

05-17 saknar PLAN och är ingen förutsättning för A/B. Yrkesprogrammets total/bortval och yrkesfastställande kräver separat 05-17-arbete; inga totalsummor gissas. 05-25 väntar på hela 05-23.

Mänskligt A/B-prov: `awaiting_user` — ny SA-plan, Svenska/SvA 1–3, IV 2×100, fördjupningsblock, fördela/spara/läs om och ny version av äldre plan på dator/telefon. Paketval kan ännu inte provas i appen.
