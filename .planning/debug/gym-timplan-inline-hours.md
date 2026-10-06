---
status: resolved
created: 2026-10-06
resolved: 2026-10-06
source_commit: 5dd7baf0fc0bd92d7b61f07e01020cef791e0908
worker_build_revision: 5dd7baf0fc0bd92d7b61f07e01020cef791e0908
requirements: [ADMIN-04]
scope: local-synthetic-only
---

# Direkta terminsceller i gymnasiets timplan

Användaren beställer 2026-10-06 att timmar fylls i direkt i tabellens terminsceller, som i programplanen. Det gäller den öppnade gymnasietimplanen, inte den separat registrerade todon om tabellöversikter/sökning/filter/sortering.

## Avgränsning och genomförande

Radens Ändra-knapp och timdialog är ersatta med celler för de aktiva terminerna. Tomt är fortfarande null/ofördelat, 0 är explicit noll, och terminer utan källpoäng saknar inmatning. Befintligt sexterminskommando sparas atomiskt per rad när raden lämnas eller Enter trycks. Flera radskrivningar serialiseras mot aktuell CAS-revision; ny inmatning under sparning bevaras och lokala summeringar/sparstatus visas.

Behåll den verkliga serverns mandat/MFA/CSRF/audit/validering. Konflikt eller okänt svar ska återläsas utan tyst överskrivning; osparade värden finns kvar och användaren jämför innan ny skrivning. Skydda navigation, rensa vid sessionsförlust och bevara läsvy för HM/arkiv/låsta versioner. Ingen SQL-, API-, modell- eller verksamhetsmigration ingår.

## Utförd verifiering

- Typkontroll, lint, 24 riktade befintliga gymmodell-/serverprov, skyddat bygge och uppdaterat handboksbygge PASS.
- Verklig Worker/PostgreSQL på Chromium/dator och WebKit/iPhone: T01–T13, **26/26 PASS**, inga retries, skips eller fel. Tidigare nio övergångsfall använder nu cellinmatning; T10–T13 provar köade radbyten, ogiltiga värden och tappade skriv-/lässvar. Återlästa värden/årssummor, skolmandat, read-only, CAS, osparat skydd och sessionsrensning passerar.
- Samtliga 26 cleanupbilagor visar noll egna verksamhetsrader/sessioner/testtriggers; audit/ankare bevaras. Alla 26 fixturer delar exakt samma bevarade helradsbaslinje för 14 tabeller. Fyra dator-/telefonbilder är visuellt granskade.
- Vanlig 3012 kör det prövade `5dd7baf`: 174 artefaktfiler byteidentiska, äldre klientfiler behållna. 18 befintliga scenarier och 44 auditerade läspar återlästa; de läsningarna ändrar inga verksamhetsrader.

[Samlat kontrollindex](../../work/pilot/results/phase5-gym-inline-hours-checks.json) binder loggar/bilder med SHA-256. [Browserrapporten](../../work/pilot/results/phase5-gym-inline-hours-final-browser.json) innehåller verkliga testresultat, käll-/byggbevis och städningshashar.

## Baslinjeavvikelse bevarad och utredd

Den [första före/efter-jämförelsen](../../work/pilot/results/phase5-gym-inline-hours-runtime-after-initial.json) har **FAIL** och är inte överskriven. Mellan ursprunglig läsning 09:18:06 och första browserfixtur 09:22:14 sparades två verksamhetshändelser: programplanens terminsändring 09:21:26 och ny gymtimplan 09:21:38. Händelserna tillskrivs ingen aktör. De innebär nya rader och en ändrad programfördelning; inga uppgifter återställs för att få kontrollen att passera.

Den [kompletterande bevarandekontrollen](../../work/pilot/results/phase5-gym-inline-hours-preservation.json) är **PASS**: samtliga 26 browserfixturers före/efter och den uppdaterade serverns 14 hela tabeller är identiska med baslinjen vid provstart, inklusive de nytillkomna uppgifterna. De 18 ursprungliga scenarierna är också oförändrade. Bevarandepåståendet gäller denna provstartsbaslinje; det påstår inte att hela databasen är oförändrad sedan första läsningen.

Ingen SQL-, API- eller modelländring ingår. Fulla modell-/server-/SQL-sviter, separat 11/157-API-harness och angränsande legacy-/programplansbrowser kördes inte om i denna avgränsade UI-rättning; tidigare resultat är historik.

Full fas 5, beslut/garanterad undervisningstid, yrkesram och mänskligt begriplighetsgodkännande förblir öppna. Planöversikternas todo är inte genomförd av denna ändring.
