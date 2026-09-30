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
