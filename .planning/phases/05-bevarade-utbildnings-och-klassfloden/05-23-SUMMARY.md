---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "23"
status: in_progress
completed_steps: [A, B, C, D]
next_step: E
requirements: [ADMIN-02, ADMIN-03]
requirements-finally-verified: []
human_result: user_reported_pass_current_basic_flow
human_result_date: 2026-10-06
worker_build_revision: a7c78e18584327374f916fa070525db48225c34f
verification_worker_build_revision: e9ca1e7faa9c0a3ba51e3a430fc46c6e3b4a2a15
---

# 05-23 — full poängsumma och valbara block

**Teknisk E 2026-10-06 — fortfarande öppen:** Full SQL 2 512/2 512 och modell/server 674/674 PASS. Fokusbuggen efter Flytta nivån med aktivt ofördeladfilter är rättad och hela terminsomgången 25/25 PASS på dator/telefon. På rättat separat bygge `e9ca1e7` passerar även block 6, ram 10 och livscykel 20; programplaner ger 31/40, med tidsgränser/väntelägen som behöver utredas. Slutlig timplans-/API-matris återstår på samma artefakt. En egen timeout-fixtur städad; alla 14 ursprungliga helradsmängder inklusive tidsstämplar, ACL och funktionsfingeravtryck PASS efter städningen. Vanlig 3012 svarade först inte vid efterläsningen. Efter verifierad återstart från samma `5dd7baf`-bygge är alla 719 artefaktfiler oförändrade och samma 18 scenarier/44 auditpar PASS utan omförberedelse; första otillgängligheten bevaras. Se [E-mellanläge](05-23-E-VERIFICATION.md). 05-23 är in_progress, 98 planer/77 genomförda och 3/8 faser verifierade. Båda nya gapen och ADMIN-02/03/04 består; 05-36–43 är planerade men inte påbörjade.

**Användarresultat 2026-10-06:** Det aktuella grundflödet är användarrapporterat godkänt genom ”detta funkar!”. [Samlat användarresultat](05-PROGRAMPLAN-USER-TRIAL.md) redovisar moment och ospecificerade enheter/roller. Grundflödets mänskliga vänteläge är avslutat; äldre awaiting_user nedan är historik och borttagna editorprov godkänns inte retroaktivt. Hela 05-23 är fortsatt in_progress: E:s tekniska fullplansverifiering och ADMIN-02/03 återstår.

**Senaste förtydligande 2026-10-06:** ”Behåll blockramarna, ta bort blockhanteringen.” Befintliga ramar/poäng/terminer består; blockeditorn och skapa/dela/ändra/ta bort block finns inte längre i programplansvyn. Avgränsad rättning klar på 3012 (`a7c78e1`): blockbrowser 6, ram 10 och timövergång 4 PASS på dator/telefon, typ/lint/bygge/handbok PASS. Färsk 14-tabellsbaslinje och 18 scenarier/44 auditpar bevarade. Första ram-FAIL bevarad, kvarvarande API:s 409-skydd fortsatt prövat. Se [rättningen](../../debug/programplan-block-controls.md) och `phase5-programplan-block-controls-*.json`. Historiska block-/paketeditorprov nedan beskriver tidigare UI; hela 05-23/E och ADMIN-02/03/04 är fortsatt öppna.

Steg A, B, C och D är genomförda och automatiskt verifierade lokalt med syntetiska data enligt tidigare beställning. **Senare användarbeslut 2026-10-05 tar bort paketen från programplansvyn:** fasta nivåer, blockpoäng, terminsram och skolkopplingar består. Skolans paketval, bibliotek och paketanalys ingår inte längre i denna arbetsyta. Äldre lagrade uppgifter och backendens versions-/mandatskydd bevaras; separat skolutbud/elevval/organisation är ännu inte implementerat. Se den avgränsade REMOVE-PACKAGES-PLAN och aktuella resultat nedan. Hela 05-23 är fortfarande in_progress: E:s fullplansverifiering återstår enligt reviderad ram. Det aktuella grundflödet är användarrapporterat godkänt 2026-10-06; se avgränsningen ovan. C/D:s paketUI-resultat nedan är historiska, inte aktuella UI-bevis.

## Steg A — nya planer, svenskrader och blockramar

Historiska genomförandeavsnitt följer nedan. Aktuell avgränsad rättning dokumenteras sist i denna SUMMARY.

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

### Historisk överlämning från B — före genomförandet av C

A och B är klara; hela planen och ADMIN-02/ADMIN-03 förblir öppna. Läs STATE, 05-23-PLAN/CONTEXT och A/B-bevis. Nästa nya executorsession genomför C: skolans språkpaket och terminsram, mandat för huvudman/rektor/administrator, utfällbar blockrad och skrivskydd över andra skolor. Inventera aktuella SQL-definitioner (inklusive 152100) före ersättning; exakt 17 Worker-entrypoints är baslinjen. Separat C-preflight krävs innan 155000-grant. Generella valpaket för fördjupning/IV/HU/NA hör till D; full regression och slutligt mänskligt paketprov till E.

05-17 saknar PLAN och är ingen förutsättning för A/B. Yrkesprogrammets total/bortval och yrkesfastställande kräver separat 05-17-arbete; inga totalsummor gissas. 05-25 väntar på hela 05-23.

Mänskligt A/B-prov: `awaiting_user` — ny SA-plan, Svenska/SvA 1–3, IV 2×100, fördjupningsblock, fördela/spara/läs om och ny version av äldre plan på dator/telefon. Paketval kan ännu inte provas i appen.

## Steg C — skolans språkpaket

Huvudman, rektor och skoladministratör kan välja och fördela språkpaket för skolor i sitt mandat via **Visa paket** på blockraden. Andra skolors paket kan läsas i en delad plan. Administrator läser listans programnamn och planer men får inte skapa, klona eller ändra planens ram/nivåer. Fastställd/ersatt version och passerad kullstart hindrar inte skolans paketarbete; arkiverad utbildning är låst. Paketens skolvisa revision ändras, medan programplanens hela rad och revision bevaras.

- Franska, spanska och tyska har sex uttryckliga startförslag. Förslaget sparas först efter användarval. Övriga katalogbundna språkstarter, svenskt teckenspråk, modersmål och minoritetsspråk valideras med exakt nivåordning och poäng; programfördjupning filtreras mot programmets tillåtna nivåer och redan fasta nivåer. 42 lokala språkkoder och 18 trappor har TS–SQL-paritet. Exportkoder till Skolverket/UHR är uttryckligen **inte verifierade**.
- Varje paket har sex terminer och ska följa blockets terminsram. Ofullständig fördelning kan sparas och visas i analysen; ogiltiga nivåer eller överpoäng nekas. Analysen skiljer skolorna åt och visar ramfel, nivåordningsfel och överlappningsrisk med mål till rätt skola, paketnivå och synlig årskurs. IV:s ämnesrättigheter analyseras per skola.
- Utfällningen ligger under den enda blockraden och tillför ingen stor informationsruta. Telefon visar vald årskurs. Radvis sparning köar en sista ändring under pågående sparning; okänt svar stäms av genom läsning utan blind omskrivning. Monoton sammanslagning per skola hindrar sena helsvar från att återställa nyare paket. Osparade paket bevaras vid filtrering och blockerar strukturbyte/kopiering tills de hanterats.
- Sparade paket skyddar skol-/blockborttagning och ändrad blockpoäng med konkret besked. Ny version kopierar skolrader med revision 1 och redovisar antal kopierade skolrader. UI-kopia till en ny elevkull kopierar två skolors exakta paket efter skolvalet och namnger skolan vid fel; originalets hela plan, paket och historik bevaras.

### Tillämpning och kontroller

Migration 154000 (`443a8e4a3f56872491cb13b29cad88e12765d47dac71f536bbcf8cd299483541`) bygger den stängda skolpaketstabellen, kontrakt och kommandon från aktuellt inventerade definitioner. Migration 155000 (`fb873b7f1041dd8c2598c7c135a36f19da9b12b1256837289b33dc610d5a19f2`) öppnar bara två nya Worker-entrypoints efter separat 16/16 preflight och återställda ACL. Totalt 19. Båda är tillämpade och journalförda på isolerat protected utan reset. Ingen tillämpad fil ändrades. Föredefinitioner: [C-FUNCTION-INVENTORY](05-23-C-FUNCTION-INVENTORY.md).

| Kontroll | Resultat |
|---|---|
| Node modell/server / harness | 629/629 / 5/5 PASS |
| TypeScript, oxlint, skyddat bygge, handbok | PASS |
| SQL riktat | 13 programplansfiler 986/986 samt två timplansfiler 86/86 PASS i yttre rollback; nya C-filen 74/74 ingår i de 986 |
| TS–SQL-paritet / bevarande | 534/534; hela språk-/trappinventeringen identisk / tio gamla helradsmängder, gamla ACL och ej ersatta definitioner bevarade; rollback återställer allt |
| C-API preflight / slutlig Worker | 16/16 / 16/16 PASS; MFA/CSRF, skolmandat, adminläsning, CAS, arkivlås, auditrollback och klientnekanden |
| API-regression | B 11/11, programplan 48/48, terminer 31/31, livscykel 39/39, utbildning 43/43 PASS; full verksamhet och cleanup PASS |
| Paketbrowser / regression | 16/16; block 6/6, programplan 40/40, terminer 25/25 (+1 avsiktligt hoppat), livscykel 20/20 över basomgång 18 + riktat omprov 2 PASS på dator/telefon |
| Full SQL | **FAIL 2411/2412 i 34 filer**, bara känt äldre `phase2_audit` #13 (`History denied` mot förväntad serverkontext); alla fas 5-filer PASS. Kördes efter C-grunden, före permanent C-grant; riktad C-grant och aktuell 19-entrypoints-Worker har egna verkliga bevis |
| Ordinarie 3012 | C-API 16/16 PASS; 18 aktuella bevarade scenarier och 44 auditpar per read-only omgång före/efter; elva hela verksamhetstabeller och aktuella scenarier identiska |

Produktkod verifierades på `8c719eedd4ce5cff8978fd1307e4cb065b9c1bd4`; slutligt Workerbygge är `9790c540059a22b9bb01c55090123b5634294319`. Enda skillnaden är livscykelprovets uttryckliga förväntning att skolpaketsåtgärder finns även när själva planen är skrivskyddad. API/browser, bevarande och minimerade rapporter: `work/pilot/results/phase5-23-c-*.json`. Lokala rårapporter, loggar och bilder ligger i `web/test-results/phase5-23-c-final/`. Historisk preflight från `b16687e` bevisar granttidens kod; senare UI-/harnessrättningar har färska normala API/browserbevis. Den första preflighten 15/16 och två browseromgångar 10/16 respektive 15/16 är bevarade som FAIL. Slutlig full paketomgång 16/16 ersätter dem inte i historiken. Livscykelns första 18/20 och ett 0/2-omprov stoppat av käll-/bygggrinden är också bevarade; korrekt byggt riktat omprov ger 2/2 och samlad täckning 20.

Verkliga provfynd rättades: adminlistans läsuppslag nekades; språkfältets tillgängliga namn var otydligt; telefonfokus kom före rätt årskursrender; initiala sparade paket kunde tappas vid remontering och filtrering kunde dölja osparade paket. Ett B05-prov hade först samma ram som paketet och korrigerades till separat ramavvikelse utan att sänka verksamhetskravet. En äldre Node-förväntning om nekad adminläsning uppdaterades; slutlig svit passerar med skrivningar fortsatt nekade. Oberoende granskning och verifiering: [C-VERIFICATION](05-23-C-VERIFICATION.md). Automatisk syntetisk verifiering är inte interaktiv IdP/MFA, mänskligt begriplighetsgodkännande eller verklig kommunanslutning.

Vanlig 3012 är omstartad med verifierat C-bygge. Äldre klientfiler bevarades; privata `.dev.vars`/låsfiler kopierades inte. Befintliga användarplaner återskapades inte och öppna flikar laddas inte om automatiskt. Egen byggkopia städad efter råbevis, serverkontroll och källpush. 05-22:s fyra historiska updated_at-avvikelser förblir PARTIAL.

### Historisk överlämning från C — före genomförandet av D

A/B/C är automatiskt verifierade lokalt. **Hela 05-23 är in_progress och ADMIN-02/ADMIN-03 är Pending.** D ska leverera generella ämnespaket i IV/fördjupning/HU/NA och deras versionsbundna urval; E full regression och mänskligt paketprov. Utgå från aktuell 19-entrypoints-baslinje, C:s SQL-definitioner och paketkopiering. Separat D-preflight krävs före 157000-grant. 05-25 väntar på hela 05-23; yrkesfastställande kräver dessutom 05-17, som fortfarande saknar PLAN.

Mänskligt C-prov är **awaiting_user**: öppna Visa paket, välj skola, pröva språkförslag och terminsändring, följ analysåtgärd och bedöm dator/telefon. Ingen automatisk rapport tillskriver användaren ett godkännande.


## Steg D — skolans versionsbundna ämnespaket

Huvudman, rektor och skoladministratör kan skapa ämnespaket för egna mandatsskolor och välja dem i individuellt val, programfördjupning och HU/NA:s ämnesblock. Huvudmannen kan även skapa paket för alla egna skolor. **Visa paket** öppnar skolans val och terminer; **Lägg till paket** öppnar ett kompakt formulär med ämnestyp, tillåtna nivåer och poäng. Inga nya stora informationsrutor har tillförts.

- Varje paketversion är oföränderlig. Ny version ändrar inte tidigare val; de pekar på exakt paket-id och version. Samma version kan återanvändas i flera planer. Ett paket motsvarar blockets poäng och katalog. Fasta nivåer, inklusive Svenska/SvA-alternativ, får inte återväljas. HU/NA och fördjupning har ämnes-/nivåfilter; moderna språk använder fortfarande C:s separata språkform.
- Servern kontrollerar både källans och målets skolmandat. Rektor/administrator kan inte versionera huvudmannens gemensamma källa. Andra skolors listning visar endast exakta redan valda versioner i läsbara delade planer. Direkt klientåtkomst till tabell och interna funktioner är stängd. Skrivningar kräver MFA/CSRF, senaste version och både DB-/Worker-audit.
- Tappat svar följs av återläsning före ny skrivning. Verklig versionskonflikt behåller formulärets värden och blockerar överskrivning. Laddning väntar på samtliga skolors bibliotek; byte/omläsning skyddar osparade paket och sena svar. Global sammanslagning bevarar äldre valda versioner.
- IV-analysen samlar skolans samtliga IV-block. Identiska nivåer i flera block ger risk; saknad idrott/yrkesbehörighet ger risk och hindrar inte i sig Klar för beslut. Den exakta estetiska ämneslistan kunde inte beläggas i den avgränsade primärkällesökningen och visas **Att kontrollera**. Detta är inget bevis för att föreskrift saknas. Jämförbara nivåer och språkexportkoder är också fortsatt overifierade.

### Migration och källkedja

Foundation 156000 är tillämpad och journalförd på isolerat protected utan reset: SHA256 `7e087cfd70c589fc979817a489ea0d52512be1f4ca85523baf8798caf20cfa38`. Separat Worker-grant 157000: SHA256 `2e236c16180f539722e7098d88a8d2a2575824d9804a2a51f07594fe71956ea2`. Grant öppnades först efter faktisk 11/11 preflight och återställda ACL, exakt **19 → 21 → 19** i provet; permanent slutläge är **21**. Inga tillämpade migrationsfiler ändrades. Aktuella föredefinitioner/ACL och rollbackbevis: [D-FUNCTION-INVENTORY](05-23-D-FUNCTION-INVENTORY.md).

Produktcommits `b4816c7`, `654423d` och `1388361`; provunderlag `9aab07c`, `a4e6ad6` och `a307d26`. Slutlig Workerrevision **a307d26d0e6ca712e07a96b052a01c451b18b966** har samma produktkod i app/lib/SQL som browserbygget a4e6ad6 och preflightbygget 1388361. Preflightens källhashar beskriver granttidens kod; senare provverktygsändringar har färska normala API-/paritetsbevis.

### Faktiska kontroller

| Kontroll | Resultat |
|---|---|
| Modell/server, harness | 646/646 och 5/5 PASS |
| TypeScript, oxlint, skyddat bygge, handbok | PASS; slutligt bygge a307d26 i egen byggkopia |
| Riktad SQL och historiska beroenden | 137 + 428 = 565 PASS i yttre rollback; gamla ACL/funktioner och hela originalmängder bevarade |
| Samma konkreta TS/SQL-vektorer | 33/33 PASS; katalog, datum, typ, fasta alternativ, poäng, fördelning, gamla versioner och klientnekanden |
| D-preflight, permanent grant, normalt D-API | 11/11 PASS; separat grant utan reset; slutligt API 11/11 på 21-entrypoints-Worker |
| Färsk API-regression på a307d26 | C 16/16, B 11/11, programplan 48/48, terminer 31/31, livscykel 39/39, utbildningar 43/43 PASS |
| D-browser, dator och iPhone 13 | 6/6 PASS: IV 2×100/versionsbindning, NAVE och verkligt tappat svar/409 |
| C/B-browserregression | 16/16 och 6/6 PASS på produktidentiskt a4e6ad6; samtliga 28 browserfixturer städade, append-only audit/ankare behållna |
| Visuell kontroll | Fyra originalbilder på dator/telefon granskade; långa paketnamn, knappar och terminsfält ryms |
| Ordinarie 3012 | D-API 11/11 PASS på a307d26; 18 befintliga scenarier, 44 auditpar per läsomgång och tolv hela originaltabeller identiska före/efter D och slutligt API |
| Full SQL | Inte omkörd i D. C:s senaste fullsvit är historiskt **FAIL 2411/2412**, endast äldre phase2_audit #13. 05-22:s fyra historiska updated_at-avvikelser förblir PARTIAL |

Versionshanterade minimerade rapporter: `work/pilot/results/phase5-23-d-*.json`. Lokala rå-TAP ligger under `/private/tmp/phase5-23-d/`; råbrowserrapporter, bilagor och bildhashar under `web/test-results/phase5-23-d-*`. Sammanfattade kontroller och logghashar finns i `phase5-23-d-checks.json`. Oberoende målgranskning: [D-VERIFICATION](05-23-D-VERIFICATION.md).

### Rättade fynd och bevarande

C:s SQL-validerare läste fasta nivåer/fördjupning via ett obefintligt `resolution.basis`. D kontrollerar verkliga terminsrader och den pinnade katalogen; både TS/SQL-vektorer och faktiskt API bevisar spärrarna. Granskningens dialog-/scope-/laddningsfynd rättades och proverna omfattar sena svar, global versionssammanslagning, omläsning och osparade värden.

Två första browseromgångar var 4/6 med NAVE-provfel (JSON-importattribut, därefter ofullständigt regionnamn). Rå FAIL-rapporter behålls; slutlig komplett omgång är 6/6. Första paritetsomgången stoppades av provets hashfunktion för en avsiktlig bråkvektor och är också bevarad. Inga misslyckade omgångar döps om till godkända. NAVE-fixturen är avsiktligt 2200/2500: dess PASS bevisar paketflödet, inte en färdig NA-plan.

Första övergripande runtimejämförelsen var **FAIL**: offering_units 267→341, medan övriga elva tabeller och alla 18 scenarier var identiska. En äldre gemensam provstädning stängde av FK-cascade utan att explicit rensa skolkopplingar. Huvud-API:s tidigare hashkontroll omfattade inte tabellen. Rapporten `program-api-before-cleanup-fix` bevarar det tidigare gröna beteendeprovet med ofullständigt städningsbevis; `runtime-first-fail` bevarar fyndet.

Exakt 74 kopplingar från två identifierade, redan borttagna syntetiska provgrafer avgränsades med prov-id, tid och frånvaro av levande kunder/skolor/utbildningar. Före rensning gav exklusion av endast dessa 74 exakt ursprungliga 267 rader och helradshash. Efter transaktionskontrollerad rensning återstod exakt samma originalmängd; äldre kvarvarande provrader lämnades orörda. `cleanup-correction` dokumenterar detta. a307d26 rättar ägarskapskontrollerad städning för paket/skolkopplingar och kräver noll rester; huvud-API hashar nu skolkopplingstabellen och bevakar den delade hjälparkällan. Alla sju API-sviter kördes därefter om sekventiellt. Färsk runtime-after är PASS för samtliga tolv tabeller och 18 scenarier.

Vanlig 3012 kör slutbygget med äldre klientfiler bevarade. Privata miljö-/låsfiler kopierades inte. Inga befintliga användarplaner återskapades, ingen reset och ingen automatisk omladdning. Egen byggkopia städas efter bevarade råbevis och verifierad push. Alla körprov gäller lokala syntetiska data och mintade sessioner; de innebär inte interaktiv IdP-/MFA-acceptans eller verklig kommunanslutning.

### Nästa — steg E i ny executorsession

**A/B/C/D automatiskt verifierade lokalt; hela 05-23 är in_progress och ADMIN-02/ADMIN-03 Pending.** E ska köra fullplansmatrisen, slutlig handbok och mänskligt paketprov från aktuell 21-entrypoints-baslinje. Historiska full-SQL-/metadataavvikelser ska fortsatt redovisas. 05-25 väntar på hela 05-23; yrkesfastställande kräver dessutom 05-17, som fortfarande saknar PLAN.

Mänskligt D-prov är **awaiting_user**: skapa ett paket i Visa paket, välj det och fördela dess nivåer; skapa ny version och kontrollera att gamla val bevaras på dator/telefon. Ingen automatisk rapport tillskriver användaren ett godkännande.

## Senare användarbeslut — paket ur programplanerna, 2026-10-05

Beställning: ”Ändra appen så att det inte finns i programplanerna.” Den avgränsade [REMOVE-PACKAGES-PLAN](05-23-REMOVE-PACKAGES-PLAN.md) är genomförd. Produktkällor: `4fc13a0`; prov-/byggkällor och aktuellt Workerbygge: `848afd40e8acedee1a2d5d1f4d3b801c6cc30d3d`.

Programplansvyn innehåller fasta nivåer, blockens typ/poäng och terminsram. Paketexpansion, paketdialoger, biblioteksladdning och skolvis paketanalys är frikopplade från workspace/board. Öppning, analys, Läs om och kullkopiering skickar inga paketval-/valpaketanrop. Beslutsklarheten använder programmets fasta innehåll och ram; paketens frånvaro, saknade exakta paketversioner eller ofördelat äldre skolutbud stoppar inte en färdig ram. Saknade blockterminer är fortfarande fel. Den fristående paketanalysen och backendens kontrakt/mandat finns kvar.

Kopiera till ny elevkull tar med fasta fördjupningsnivåer, programram, terminer och alla kopplade skolor, utan skolans paketval. Källplan, utbildning, historik och hela gamla paket-/versionsrader bevaras. Backendkloning till ny planversion är oförändrad. Äldre utbud kan fortfarande hindra att en refererad skola/blockram tas bort eller krymps. Beskedet förklarar då att uppgifterna bevaras; blockens explicita `programplan_block_packages_in_use` hanteras före generell 409 så att det inte blir en falsk revisionskonflikt.

Aktuella automatiska prov mot samma byggda Worker, dator och iPhone/WebKit:

- F01–F05: **10/10 PASS**. Tomt utbud, äldre ofördelat IV-paket, HM-kopiering med två skolor, admin/delad rektor som läser utkast och syntetiskt fastställd version, samt verklig 409 vid krympt äldre refererat IV-block. Fastställandet i F04 är uttrycklig syntetisk fixturförberedelse, inte levererat fastställandebeslut. Läs-/kopieringsprov jämför hela originalrader och begär noll paketnätverk från sidan.
- B01–B03: **6/6 PASS**. Full SA25-ram 2 500 p, Svenska/SvA, IV 2 × 100 p, eget fördjupningsblock 200 p med terminsfördelning/återläsning och äldre låst version som får nytt utkast. B08/B09/B11: **6 historiska skips**, aldrig PASS. Paketvyns separata C/D-spec är också uttryckligen historisk.
- Terminer12 och livscykelL07: **2 + 2 PASS**, med skrivskyddad analys och delad plan. Totalt **20 aktuella browserfall**, 20 städningsbilagor med noll egna verksamhets-/paket-/kopplings-/sessionsrader och bevarad audit. Fyra relevanta dator-/telefonbilder granskade; blockeditorernas passande geometri ingår i B02.
- Modell/server **512 + 136 = 648 PASS**, rent browserharness 4 PASS, TypeScript, oxlint, skyddat bygge och handboksbygge PASS. Ingen migration, grantändring, reset eller omförberedelse av användarplaner.
- Vanlig 3012 kör nu det testade bygget som workerd. **166 testade artefaktfiler är byteidentiska efter kopiering**, privata miljöfiler är undantagna och äldre klientfiler bevarade. Current-läsning före/efter: **18/18 scenarier, 44 auditpar per kontroll och 12 kompletta verksamhetstabellers helradshashar oförändrade**, inklusive paket-/versionslagringen.

Bevis: [samlad kontrollrapport](../../../work/pilot/results/phase5-programplan-frame-checks.json), [huvudmatris](../../../work/pilot/results/phase5-programplan-frame-main-browser.json), [block](../../../work/pilot/results/phase5-programplan-frame-blocks-browser.json), [terminer](../../../work/pilot/results/phase5-programplan-frame-terms-readonly-browser.json), [delad plan](../../../work/pilot/results/phase5-programplan-frame-lifecycle-readonly-browser.json) samt runtime-before/after med samma prefix. Rårapporter, loggar och bilder har lokala sökvägar och SHA256 i kontrollrapporterna.

Första matrisen behålls som **FAIL**, 1 PASS/9 FAIL med 10 verifierat städade fixturer. BILD-fixturen hade version 1 trots pinnad katalogversion 2 och nekades korrekt 400. Den ignorerade runtime-kopian saknade Tailwind-utilityCSS, vilket blockerade mobilmenyn. Explicita CSS-källor räckte inte för samma ignorerade placering; slutligt bygge utfördes i separat ägd versionsbunden Git-checkout utanför den ignorerade katalogen och utilities/klick verifierades. Se [första försöket](../../../work/pilot/results/phase5-programplan-frame-attempt1.json). Principen om explicita källor stöds av [Tailwinds dokumentation](https://tailwindcss.com/docs/detecting-classes-in-source-files), men placeringens faktiska prov avgör här. Ett första riktat terminsurval hittade 0 fall; korrekt titelsökning körde 2, och tomt urval räknas inte som PASS.

**Kvarstående:** separat skolutbud/elevval/individuella studieplaner/grupper och tjänstefördelning är inte implementerade här. Programblock innebär inte automatiskt parallellt veckoschema; användarens exempel med en språklärare och språkgrupper på olika dagar består som krav på framtida skolorganisation. Hela 05-23/E är fortfarande in_progress, mänsklig begriplighet awaiting_user och ADMIN-02/ADMIN-03 Pending. Full SQL/E är inte omkörda; äldre audit-FAIL och 05-22:s metadata PARTIAL kvarstår. Berörda 05-25–28 behöver granska skolpaketsantaganden mot detta senare beslut; inga förutsättningsgrindar kringgås. Inga verkliga kommunanslutningsbevis.
