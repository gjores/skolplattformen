# Fas 5 — aktuellt startunderlag

Datum 2026-09-29. Kodrevision före fasplanering: `80a6e1c`. Endast lokala modell-/transportprov, ingen ansluten drift verifierad här.

## Körda kontroller

- `node --test lib/cohort-model.test.mjs lib/organisation-model.test.mjs lib/timplan-model.test.mjs` i web/: PASS 30/30, inga överhoppade, 437 ms. Befintliga rena verksamhetsregler för utbildningar, kullkopiering och klasskoppling bevarade i provmodellerna.
- `node --test lib/save-order.repro.mjs` i web/: FAIL 2/2, 726 ms. Fördröjd äldre skrivning återställer 100 efter att 200 sparats. Snabb ändring efter skapande använder lokalt modell-ID och avvisas av FK. Provtransporten är syntetisk; lagringsfunktionerna är de verkliga äldre funktionerna.

Det röda resultatet är reproducerat fel, inte ett miljöhinder eller godkänd funktion. Skyddad beständig timplans-/läsårsredigering får inte öppnas innan motsvarande regression är grön. Nya skyddade kommandon måste prövas mot databas och API, utöver dessa modellprov.

## Kodkontrollerad ansvarsfördelning att bevara

| Åtgärd | Befintlig regel | Kodkälla |
| --- | --- | --- |
| Importera skola, definiera utbildning | Huvudman | organisation-model.ts:385,494 |
| Ändra poängplansutkast | Huvudman eller rektor | organisation-model.ts:579,596 |
| Fastställa poängplan | Huvudman | organisation-model.ts:606 |
| Ändra/skicka/ta tillbaka timplansförslag | Rektor | timplan-model.ts:570,586,618,629 |
| Återsända/fastställa timplan | Huvudman | timplan-model.ts:636,645 |
| Ändra/skicka/ta tillbaka läsårsförslag | Rektor | lasar-model.ts:617,793,803 |
| Återsända/fastställa/återöppna läsår | Huvudman | lasar-model.ts:809,817,829 |
| Kopiera utbildning till ny kull | Huvudman | 20260908120000_cohorts_classes.sql |
| Klass–timplanskoppling | Huvudman eller rektor, fastställd plan vid vald skola | Samma migration, validate_class_timplan |

Detta är klient-/äldre SQL-regler att föra över till aktuell mandatkontroll, inte belägg för att dagens skyddade server redan erbjuder operationerna. Administratör, lärare och support får inte nya skrivrättigheter genom denna inventering.

## Bevarande och luckor

Kullkopieringens befintliga SQL skapar ny utbildning och planutkast/version 1 med nya ID:n samt en ny kopieringshändelse. Den kopierar inte elever, klasser, tillstånd eller gamla beslutshändelser. Klasskopplingens gamla nyckel består av skola, namn och startår; övergång till beständigt klass-ID får endast mappa entydiga befintliga kopplingar och måste redovisa tvetydigheter.

Fas 4 är fortsatt öppen: partialt mänskligt användarprov, datumanmärkning och separat fasverifiering återstår. Användarens instruktion att gå vidare till fas 5 är inte en uppgift om att dessa prov har utförts. Förberedelser kan genomföras nu; slutligt bevis måste hålla fasernas status isär.

## Uppföljning 05-02

Startproven ovan är historik före rättning. 05-02 rättade lokalt lager/kö/ID-mappning på 174f6d8, med 346/346 ordinarie tester PASS inklusive 9 lager- och 3 köprov. Den nya skyddade datavägen och UI-omläsningssvar är fortfarande obevisade. Se 05-02-SUMMARY.md för faktisk prov-/bygggräns.

## Uppföljning 05-07 — 2026-09-30

Efter 05-03–05-06:s timplansdelbevis har 05-07 byggt strikt programplansreferensgrund på 6922ce7, inte bara ett inventeringsdokument. Exakt katalogfingerprint, versions-/datum-/inriktnings-/nivåprövning och integritetsverifierad fryst serverinstans finns. Riktade 21/21 och full modell/server/generator 451/451, typ/lint, bytekontroll och skyddat bygge PASS; oberoende strukturell granskning 5/5. Inga legacy-modeller eller originalsnapshot ändrade. Se 05-07-SUMMARY och maskinrapporten phase5-07-catalog.json.

Källkontrollen jämförde aktuellt offentligt API med snapshoten för endast SA25/EK25/ES25:s version/startdatum. Ingen kataloguppdatering eller DB-mutation skedde. Nationella språk-/nivåval och ram-/beslutsregler är fortsatt olösta; `resolved` ger aldrig skriv-/beslutsrätt. Atomiskt mandatavgränsat/auditerat programplans-SQL och separat API/UI återstår. Startprovens äldre status ovan ska läsas tillsammans med respektive senare delplans konkreta bevis, inte som ny körstatus. Fas 4:s mänskliga checkpoint är fortsatt öppen.

## Uppföljning 05-08 — 2026-09-30

Stängd SQL-katalog c357f64 och utkastskommandon 244d1e2; faktisk samtidighets-/städningsharness bf278d8, äldre loggprov b0bf476. Katalog 60/60, utkast 108/108 och riktad SQL-regression 464/464 PASS (timplan 77, Worker/session 27, list/kolumn 59, mandat 243, audit 19, registerkonflikt 19, äldre säkerhetsaudit 20). Full modell/server/generator 455/455 samt harnesssäkerhet 5/5, typ/lint och båda artefakternas bytekontroll PASS. Faktiska separata anslutningar visar 6/6 observerade låsväntansfall: samtidig replace/bind/clone-CAS, stale revision efter planradlås, återkallat givarmandat och utgången session efter kundlåsväntan. Separat yttre SQL-caller-rollback bevarar data/historik/audit. Alla 42 TS/SQL-jämförelser PASS, inklusive alla 29 program, Gy11/GR och felreferenser; ofullständiga språk-/nivå-/programregler bevaras och decisionReady=false.

Ursprungliga plan-/utbildnings-/historikfält har samma hash före/efter. Egna syntetiska kunder/sessioner/planer/utbildningar/mandat är noll efter cleanup; 3 DB-säkerhetshändelser och 1 refererad identitet bevaras som auditankare. Nya tabeller/funktioner och gamla direkta programplans-/historikrättigheter stängda; Worker har exakt de tre tidigare fas 5-timplanskommandona. Ingen verklig Worker-audit, HTTP/MFA eller UI prövad/öppnad här. Inget nytt app-/handboksbygge eller browserprov motiverat av SQL/scriptändringen; tidigare bevis är historik. Oberoende GSD-granskning 6/6 delplans-must-haves. Se 05-08-SUMMARY och work/pilot/results/phase5-08-foundation.json samt refererade resultatfiler. ADMIN-02 och hela fas 5 är fortsatt Pending/öppna; nationella beslutsregler, skyddad API/UI, fastställande, kullkopiering och klasskoppling återstår. Fas 4:s mänskliga checkpoint kvarstår.

## Uppföljning 05-09 och 05-12 — 2026-10-01

05-09:s fem skyddade programplanskommandon passerar full API-preflight 48/48 och slutprov 48/48 genom byggd Worker 2477d57 och verklig databas. Smal grant cf40dbc öppnar exakt fem nya signaturer efter bytejämförd återställd preflight-ACL, totalt åtta fas 5-entrypoints. SQL-regression 663/663, tidigare timplans-API 39/39, paritet 42/42, sex observerade programplanslås + yttre rollback och fyra timplanslås PASS. Full modell/server/generator 480 och separat harness 13 PASS vid genomförandet. Alla fem kommandon har verkliga DB-/Worker-loggfel med atomisk återställning och sessions-/mandat-/roll-/kundgränser. Ursprungliga verksamhetsrader är hashidentiska före/efter, egna huvud-/främmandegrafer städade, append-only säkerhetsloggar och ankare bevarade. Rootens oberoende granskning 6/6 PASS; samtliga 18 API-källhashar matchade aktuell kod. Se 05-09-SUMMARY/REVIEW och phase5-09-*.json.

Separat 05-12 har synlig timplanshandledning i GR/IM-läsvy och ändringsdialog samt handbok. Samtliga 20 browserprov på dator/telefon PASS mot samma protectedbygge, även accepterad IM-ändring med tappat svar/omläsningsfel och bibehållen korrekt skolformstext. Typ/lint, handbok och visuellt granskade bilder PASS. Granskningen rättade skolform vid saknad omläsning och text om bibehållen total undervisningstid. Vägledningen beskriver regler och ansvar; den inför inte nationell matris-/ramkontroll eller fastställande. Se 05-12-SUMMARY och phase5-12-guidance.json.

05-10:s kodgranskning passerar sex kontroller men är uttryckligen begränsad till kod tills aktuella API-/grantbevis finns. 05-11:s användarvy förbereds bakom stängd navigation. Det tidigare användarbeskedet att timplansprov fungerar är registrerat, men ny regelhandledning och programplansvy behöver ett konkret mänskligt prov när all automation är klar. ADMIN-02, fas 5 och fas 4:s separata checkpoint är fortfarande öppna.

## Aktuellt läge efter 05-10/05-11 — 2026-10-02

05-10:s fulla urvals-/underlags-API preflight/final 38/118, SQL 443, programplans-API 48/278 och tidigare timplans-API 39/135 PASS. Två ytterligare exakta läsgrants öppnade efter återställd preflight; totalt tio fas 5-entrypoints. Första automatiska grantgranskningen avslog, och omprövning godkändes efter ny oberoende lokal mål-/ACL-/preflightevidens; inget nytt mänskligt godkännande påstås. Se 05-10-SUMMARY/REVIEW och phase5-10-grant-application.json.

05-11 är genomförd till konkret mänskligt prov: programbrowser 30/30 och full timplansregression 20/20 mot samma c320041bygge, inga skips/retries. Samtliga 50 fixturer städade till noll egna verksamhets-/session-/mandat-/trigger-/functionrester; program679 audit/36 ankare och timplan300/26 bevarade. Modell/server/generator 502, typ/lint, handbok och oberoende kodgranskning 6/6 PASS. Båda sparflödena kräver uttrycklig API-kod plus säkert status/kod-par för redigerbart avslag; malformed/kodlöst svar går genom faktisk osäker omläsning. Fulla actual-write-prov täcker abort, kodlös502 och kodlös400.

Fyra beständiga exempel finns på Syntetisk skola 11. Additiv förberedelse och omkörning bevarar sju egna provrader och ändrad kulltext. Vanlig 3012 utan preload är frisk; faktisk Worker läser fyra initiala scenarier och deras tre planer för två befintliga mandat, 16 auditpar PASS med städade egna sessionsrader. Root har kontrollerat fulla rapportmatriser/source/build/cleanup och dator-/telefonbilder med deras fullPagebegränsning. Se 05-11-SUMMARY/REVIEW, phase5-11-root-verification.json och 05-PROGRAMPLAN-USER-TRIAL.md.

Mänsklig begriplighet/telefonbedömning av programplaner och ny timplanshandledning återstår. Fas 4:s checkpoint, ADMIN-02 och hela fas 5 är öppna. Två tidigare previewavbrott är separata FAIL-omgångar; deras exakta rotorsak är awaiting_evidence i .planning/debug/phase5-preview-exit.md. Nya fulla gröna körningar och frisk 3012 innebär ingen belagd orsaksfix eller verklig IdP-/kommunanslutning.

## Mänskligt UX-fynd och rättning 05-13 — 2026-10-02

Användaren beskriver programplansvyn som ”fullständigt obegripligt UI”. Detta är ett misslyckat begriplighetsprov trots tidigare mekaniska browser-PASS. 05-13 genomför direkt planläsning, ämnen/nivåer/poäng först och tydlig guidad handling. Tekniskt underlag/historik blir sekundärt. Samma mandat-, MFA-, revisions- och källskydd behålls. Färskt fullständigt browserbevis och ny mänsklig bedömning återstår; historiska rapporter ersätter dem inte. Fyra redan sparade användarexempel bevaras. Lokal provkodsknapp verifieras parallellt, separat från programplansrättigheter.
