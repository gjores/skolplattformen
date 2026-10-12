---
phase: 05-bevarade-utbildnings-och-klassfloden
verified: 2026-10-12
scope: OPERATIONAL-01–04
status: passed
verification_level: independent-static-and-evidence-review-bounded
score: "8/8 mål stödda i källa och lokala syntetiska SQL-/API-/browserbevis"
gaps: []
pending_evidence: []
human_acceptance: "Öppen separat fasacceptans; hindrar inte färdigställande av denna beställda avgränsning."
---

# Oberoende verifiering av den avgränsade operativa kedjan

Granskningen följer `gsd-verifier/SKILL.md`: observerbara mål, faktiska implementationer och deras kopplingar har kontrollerats. Det här är en källgranskning, inte ett nytt databas- eller användarprov. Inga DB-kontakter, produktändringar eller testkörningar utfördes av granskaren i denna deluppgift. Root och backendagenten har separat genomfört beteendeverifieringen vars bevis granskats här. OPERATIONAL-05:s underhåll redovisas i sin egen sammanfattning.

## Mål och faktiska kopplingar

| Mål | Statisk status | Belägg och gräns |
| --- | --- | --- |
| Mandatbunden beständig klass och explicit timplanskoppling | Stöds | `/api/klasser/underlag`, `/skapa`, `/koppla` använder `protectedRoute`, strikt kontrakt och serverfunktioner som anropar de två slutna SQL-entrypointsen. Huvudmannen läser; rektor/admin skriver med MFA och muterande CSRF-skydd. SQL härleder kund/skola/utbildning från aktuell session och mandat. Verklig HTTP-verifiering för BF25/BA25 passerar 18/18 vardera. |
| Stabil klassidentitet och säker adoption av äldre namnkoppling | Stöds | Nullable `class_id`, revisionsvillkor, unik klass/läsår-koppling och immutabla kommandokvitton. Äldre kopplingar massmigreras inte. Adoption kräver aktuell tidigare version/revision och samma utbildning/skola. Identifierad koppling får inte göras om till anonym namnkoppling. |
| Korrekt kull/läsår/årskolumn | Stöds; regression PASS | `phase5_class_start_year` härleder akademiskt år från fryst `startedOn` med 1 juli-gräns. Installerad forwardmigration 240000 jämför kalenderår mot kalenderår. SA25/BF25 med januaristart har 6/6 kontroller PASS över hela kedjan; verkligt fel kalenderår blockeras fortfarande. |
| Klassflöde med beständigt återläst resultat och säkert omförsök | Stöds statiskt | `ProtectedClassTimplans` anropar verkliga API-rutter, validerar svar, återläser efter kommando och registrerar osparad/okänd status. Vid tappat eller oklart svar behålls exakt commandId/request och navigation spärras tills kvittot bekräftats. Konflikt kräver nytt underlag. Dator-/telefon-fixturproven är uttryckligen mockade och får inte redovisas som verklig DB-kedja. |
| Alla uppgifter nås med egna först och korrekta globala räknare | Stöds statiskt | `phase5_plan_decision_items` avgränsar mandat före klassificering och sorterar egna uppgifter före sidindelning. Kompatibel inkorg behåller max 500 synliga poster men total/global counts; `/api/planbeslut/lista` söker hela urvalet och returnerar 50 per sida med separat filtrerat count. Klienten använder global inkorg för toppindikator och sidresultat för urvalet. |
| Beslutsskeden syns i programplanslistan och rollbyten blandar inte resultat | Stöds statiskt | Beslutsskede finns serverstyrt i årsradens planreference. Programplansfilter accepterar inskickad/återsänd separat från lagrad status `utkast`. URL-normalisering bevarar filtren. Inboxresultat binds till scopeKey/urval/revision och aborterar föregående urval; global inbox visas bara för laddat aktuellt scope. |
| Ny timplansversion är nåbar utan automatisk flytt av klasskopplingar | Stöds statiskt | Timplansvyn visar Skapa ny version, hämtar aktuell källa, går till befintligt utkast när sådant finns och återanvänder skyddat skapandekommando. Dialogen beskriver bevarade gamla klasser/timmar. Klasslänk skrivs bara via uttryckligt klasskommando. Befintlig programplansvys klonväg är fortsatt ansluten. Verklig BF25-/BA25-kedja verifierar att gamla länkar består tills uttryckligt byte och att årslistan följer vald version. |
| Verklig källändring skiljs från beslutsmetadata och prestanda beläggs | Innehåll och SQL-mätning stöds | SQL lämnar både aktuell källidentitet och aktuellt källinnehåll. Servern validerar deras inbördes identitet, jämför kanoniskt innehåll och bortser från revision/status/educationRevision/archived. Nytt plan-ID/version eller ändrad ram ger fortsatt varning. Samma SQL-fixtur med 520 extra rader går från timeout vid 10 sekunder för rektor till cirka 509 ms. Även lokala OIDC-/HTTP-mätningar visar lägre medianer för alla tre roller; kvarvarande fler-sekunderslatens beskrivs nedan. |

## Konkreta fynd och uppföljning

### P2 åtgärdad och verifierad: vårstart blockerades trots korrekt fryst akademiskt år

Utbildningsskapandet skriver `offerings.start_year = extract(year from startedOn)`. För exempelvis januari år Y är detta Y, medan `phase5_class_start_year` med rätta returnerar Y−1. Den nya blockeraren jämför dessa direkt och visar felaktigt att kullstarten inte stämmer. Det befintliga Jun/Jul-testet provar endast datumhelpern och upptäcker inte felet i hela flödet. Backendagenten bekräftade semantikskillnaden. Forwardmigration `20261012240000_class_start_calendar.sql` är nu källgranskad: kalenderfältet jämförs med fryst kalenderår, medan klass och kolumn fortsatt använder akademiskt år. `verify-class-start-calendar.mjs` provar skapande → två fastställanden → klass → årskoppling för både SA25 och BF25 med januaristart. Verifierarens privata rapport visar 6/6 PASS, återställd rollback och installerad rättning. Både verify/apply bevarar samtliga 20 kontrollerade tabeller. Bevisens källhashar matchar aktuell kod. Fyndet är stängt.

### P2 åtgärdad i källan: Läs om tappade osparat klassnamn

Timplansvyns övre Läs om gick direkt till `openPlan`, som avmonterar klassformuläret. Knappen kontrollerade inte `classDirty`. Root har lagt till den spärren; ny källäsning visar att knappen nu inaktiveras även när klassformuläret är osparat. Rootloggar visar nu 56/56 dator-/telefonprov passerade efter de sista UI-ändringarna. Root har dessutom återställt timplansvyns verifierade navigeringstoken när förberedelse av ny version avbryts utan att vyn byts.

Inga andra konkreta P1/P2-fel har identifierats i det lästa underlaget. Den efterföljande faktiska API-/browserkedjan har också passerat inom redovisad lokal syntetisk omfattning.

## Säkerhet och bevarande

- SQL-entrypointsen för klasskommandon kontrollerar riktig aktuell session, kund, uppdragskedja och skolmandat; klientens rollval ger inte rättigheter.
- Kommandokvitton kontrollerar aktör, mandat och hela requesten innan omförsök. En ny godkänd version flyttar inte gamla klasskopplingar.
- Formulärets dubbla navigeringsskydd skiljer osparad text från ett osäkert kommando. Osäkert kommando får inte bli ett nytt kommando med nytt ID.
- Direkta klientbehörigheter till identifierade klasskopplingar begränsas; känsliga SQL-hjälpare och receipt-tabellen exponeras inte till appklienten.
- Källjämförelsen bevarar det frysta underlaget i svaret. Endast aktuellt varningsläge ändras; ett fastställande av samma innehåll skriver inte om snapshoten.
- Inga TODO-/placeholderimplementationer hittades i nya klasskomponenter, klasskontrakt/serverlager eller de tre granskade SQL-migrationerna.

## Kravstatus och fortsatt verifiering

ADMIN-04 och PLANERING-04 får en verklig implementation för beständig klass och uttrycklig versionskoppling, med verifierad vårstartsfix och installerad syntetisk BF25-/BA25-kedja. Detta belägger delkraven inom OPERATIONAL-01–04, inte automatiskt hela fasens äldre omfattning. ADMIN-02/PLANERING-03/05 har statiskt ansluten rollinkorg och skedefilter. ADMIN-03:s fulla kullkopiering är en äldre separat omfattning; en ny timplansversion är inte i sig bevis för hela kullkopieringen.

Granskaren har nu läst följande aktuella loggar:

- `web/outputs/operational-all-ui.log`: 56/56 dator-/telefonprov PASS, inklusive klassflöde, omförsök, ny version samt tre rollers sökning/sidindelning och skedefilter. Dessa är komponent-/HTTP-fixturprov, inte verklig DB-kedja.
- `web/outputs/operational-node.log`: 129/129 PASS.
- `web/outputs/operational-build.log`: Build complete.
- `web/outputs/operational-docs.log`: Generated static files, success.
- Tsc-/lint-loggar är tomma; root rapporterar båda kommandonas exitkod som PASS.

Backendagenten har separat rapporterat rollbackprovet med 56 kontroller för ursprungliga klassmigrationen. Granskaren har inte kört dessa kontroller. Slutliga SQL-bevis, vårstartsregression och installerat bygge har nu kontrollerats nedan; även verklig BF25-/BA25-API-/browserkedja på installerat slutbygge har nu passerat enligt bevisen nedan.

Quickreview av `230000_gym_source_content` och dess verifierare: endast den förväntade resultatfunktionen byts; återställning av den gamla definitionen används för kontroll mot hel DDL-/ACL-fingerprint. Faktiska SA25/BF25-fixturer jämför fryst och aktuell källa i rollback. Negativa tester av verklig innehållsändring och motsägande aktuell metadata finns i de passerade serverproven. Inga ytterligare konkreta P1/P2-fynd identifierades.

## Nya kontrollerade SQL- och installationsbevis

Granskaren har läst följande privata rapporter utan att köra databasjobb. Samtliga rapporterade källhashar matchar nuvarande filer; inga källavvikelser hittades.

| Privat rapport | Resultat | Bevarande |
| --- | --- | --- |
| `/private/tmp/operational-decisions-rollback-final2.json` | 45/45 PASS; rollback genomförd | Samtliga 19 tabellers före-/efterhashar lika |
| `/private/tmp/operational-decisions-ddl-verify.json` och `operational-decisions-ddl-apply.json` | PASS; rollback verifierad, därefter committed installation av 220000 | Samtliga 20 tabellers före-/efterhashar lika |
| `/private/tmp/operational-source-verify.json` och `operational-source-apply.json` | 4/4 PASS vid både verify och apply; 230000 installerad | Samtliga 20 tabellers före-/efterhashar lika |
| `/private/tmp/class-start-calendar-verify.json` och `class-start-calendar-apply.json` | 6/6 vårstartskontroller PASS i verify; källbundet apply installerar 240000 | Samtliga 20 tabellers före-/efterhashar lika |

`class-start-calendar-apply.json` kör inte sex nya regressionskontroller: installationen är bunden till det redan passerade verifieringsbeviset och dess källhashar. Rapporternas bevarandeomfattning är angivna kontrollerade tabeller, inte en fristående jämförelse av hela databasen.

`web/outputs/operational-install.json` anger installerad revision `0ab206494909936cd6e40135cd72fc2502e8115b` med 188 byteverifierade filer. Root rapporterar health/workerd PASS och aktuella app-/handboksbyggen, TypeScript och lint PASS. Den installerade revisionen är belagd, och BF25-/BA25-proven nedan använder samma bygge.

### Verklig lokal API-/browserkedja för yrkesprogram

`/private/tmp/class-timplan-api-bf2.json` och `/private/tmp/class-timplan-api-ba.json` visar vardera 18/18 PASS, `apiVerified: true` och Workerbygge `0ab206494909936cd6e40135cd72fc2502e8115b`. Granskaren har läst alla kontrollresultat och jämfört rapporternas källhashar med aktuell kod utan avvikelse. Detta är verklig lokal skyddad API-trafik mot syntetiska data, till skillnad från UI-fixturproven.

Proven omfattar skapande med beständig klassidentitet, samma kommandos omförsök, dubblett-/stale-tab-konflikter, huvudmannens läsrätt utan skrivrätt, annan skolas nekade åtkomst, MFA/CSRF/sessionsepoch, exakt versions-/årskoppling, nekad draftversion, bevarad gammal klasskoppling efter nytt fastställande samt uttryckligt byte och årslistans rätta timmar. Ett simulerat fel i slutlig Worker-audit återställer både klass och kvitto.

Båda rapporterna visar återställda ACL, oförändrad tidigare verksamhetsdata och borttagna tillfälliga verksamhetsfixturer. Tillkomna säkerhetsspår bevarades avsiktligt: 161 respektive 151 auditposter och fyra auditankare per körning. Verifieringens driftåterställning ska alltså inte beskrivas som identisk hel databas före/efter.

Vardera programmet har även verklig skyddad klassvy avläst vid 1440 och 390 px. Backendagenten rapporterar visuell granskning av samtliga fyra bilder. Granskaren har här granskat rapporterna, inte gjort en separat visuell bedömning av bilderna. Dessa avläsningar tillsammans med API-kommandona och de mockade interaktionsproven belägger flödet; de är inte ett manuellt verksamhetsgodkännande.

### Lokal SQL-prestanda

Samma lilla syntetiska urval mätt före/efter ger rektor cirka 243 → 4,3 ms, andra rektorsmandatet cirka 248 → 4,1 ms, huvudman cirka 258 → 241 ms och administratör cirka 304 → 270 ms. Med 520 extra rader avbryts gamla rektorsfrågan vid den avsiktliga 10 000 ms-gränsen (uppmätt cirka 10 405 ms inklusive avbrott), medan nya frågan tar cirka 509 ms för rektor, 623 ms för huvudman och 878 ms för administratör.

Detta visar en förbättring i det verifierade lokala SQL-scenariot. Det finns ingen färdig före-latens för den avbrutna stora frågan, och mätningen bevisar varken produktionens svarstid eller hela HTTP-/browserflödets latens. HTTP-eftermätning på samma urval har nu verifierats separat nedan.

Mänsklig bedömning återstår för hur tydliga rollernas arbetsuppgifter, klassens valda läsår/version och varningar om sparstatus upplevs på dator och telefon. Inga verkliga elev-/kommunintegrationer provas eller godkänns genom dessa lokala syntetiska kontroller.

### Verklig lokal OIDC-/HTTP-mätning och beslutssökning

Granskaren har läst `/private/tmp/operational-decisions-http-before.json` och `/private/tmp/operational-decisions-http-after.json`. Efterrapporten är PASS med 21/21 API-kontroller, faktisk lokal OIDC för huvudman/rektor/administratör och exakt lika före-/efterhashar för 20 verksamhetstabeller. Samma 14 planer har identisk rollfördelning, uppgiftsantal och routinghash före/efter. Sid-API, inskickat/återsänt, egna/väntande, tom sökning med bevarad global räknare samt nekade felaktiga urval och främmande origin är kontrollerade för alla tre roller.

| Roll | HTTP-median före | HTTP-median efter |
| --- | ---: | ---: |
| Huvudman | 4 510 ms | 3 597 ms |
| Rektor | 4 942 ms | 974 ms |
| Administratör | 10 689 ms | 3 254 ms |

Varje median bygger på tre lokala anrop på samma syntetiska urval. Huvudman och administratör har fortfarande ungefär 3–4 sekunders median, och huvudmannens första efteranrop tog 7 319 ms. Förbättringen är mätt, men hela appen ska inte beskrivas som genomgående snabb eller färdigprestandaoptimerad. Kvarstående latens är ett tydligt uppföljningsområde och inte ett nytt funktionsfel i den verifierade beslutskedjan.

### Slutligt läsande browserprov med riktig lokal inloggning

`web/outputs/operational-live.json` och `.log` visar PASS för alla sex kombinationer: huvudman/rektor/administratör vid 1440 respektive 390 px, med faktisk lokal OIDC och öppnad beslutspanel. Huvudmannen ser fyra egna uppgifter/fyra beslut, rektor elva egna uppgifter och administratör tre egna uppgifter; båda senare har noll huvudmannabeslut. Resultaten stämmer mellan dator och telefon samt mot API-beviset. Provet är läsande; mutationernas bevis kommer från de separata verkliga API-kedjorna.

## Avgränsat slutresultat

OPERATIONAL-01–04 passerar den oberoende käll- och bevisgranskningen för den beställda lokala syntetiska omfattningen. Två konkreta fynd har rättats och verifierats, och inga öppna P1/P2-fynd återstår. Det finns inget återstående automatiserat beviskrav i denna granskning. Formell mänsklig fasacceptans, verklig pilot-/kommunanslutning och ytterligare förbättring av kvarvarande huvudmanna-/administratörslatens är separata frågor. Arkiveringen av exakt sex godkända testutbildningar redovisas separat i OPERATIONAL-05 och omfattas inte av detta utlåtandes produktteststatus.
