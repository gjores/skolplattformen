---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-01
status: implemented_mock_verified
completed: 2026-10-15
subsystem: class-cohort-ui
gap: CLASS-COHORT-UX-01
requires: [CLASS-COHORT-07, CLASS-COHORT-10]
provides: [simultaneously_visible_saved_classes, explicit_create_review_save_status]
affects: [NAMED-TIMPLANS-UX]
---

# Synliga sparade klasser och tydligare sparsteg

Två klasser visas samtidigt i en semantisk lista, med namn, första läsår, giltighet och **Sparad klass**. Läslistan har inget urval som kan förväxlas med en timplanskoppling. Listan gör inget påstående om vilken timplan en klass använder; underlaget innehåller inte den informationen.

## Genomförda uppgifter

1. Rullistan ersatt av synlig klasslista. Hjälpen om klassernas förhållande till programplan/timplan ligger i utfällbar förklaring. Nästa steg beskriver det befintliga kopplingsflödet; huvudmannen och annat läsläge får en läsväg utan uppmaning att skapa eller koppla. Laddnings-/läsfel markerar att listans uppgifter är senast inlästa.
2. Namnsteget skiljer inmatning från sparning; granskningssteget säger **Inte sparat än** och visar den befintliga uttryckliga sparåtgärden. Fokus följer ny rad, borttagen rad och återgång till namnredigering. Normalvyn visar inte återläsningsknappen; fel och osäker sparning behåller återhämtningsåtgärderna. Handboken beskriver listan, sparstatus och separat timplanskoppling.

## Ändrade filer

- `web/app/protected-class-cohorts.tsx`
- `web/app/protected-class-cohorts.css`
- `web/e2e/class-cohort.spec.ts`
- `web/e2e/class-cohort-actual.spec.ts` — endast tre selectorassertions anpassade till listan; faktiska prov har **inte** körts om i denna plan.
- `docs/handbok/programplaner.md` — endast klassorganisationens avsnitt.

## Verifiering

Från `web/`:

- `npx --no-install tsc --noEmit`: PASS efter sista produktändringen.
- `npx --no-install oxlint app/protected-class-cohorts.tsx`: PASS.
- `npx --no-install playwright test class-cohort.spec.ts --config=playwright.usability.config.ts --output=/private/tmp/named-ux01-final`: **60/60 PASS**, Chromium dator och WebKit iPhone 13, inga retries, skips eller flaky. Mockserver på 5194, ingen riktig databas. Körningens JSON: `/private/tmp/named-ux01-final/full-60.json`, SHA256 `447b3b2cc8ac5c963f580b0e873aff252cf01781f297c629ebcd55fad61fc9d2`.
- Samtliga tidigare 28 fall per enhet behållna, plus två per enhet för listans status/giltighet/fokus/44px och huvudmannens läsväg. Alla grenar för journal, MFA, osäkert utfall, kvitto, dubbelklick, konflikter, skola/uppdrag, källbyte och navigation passerar med simulerade API-svar.
- Geometrikontroll i nytt listfall: synliga panelkontroller minst 44×44 CSS-pixlar, ingen horisontell sidöverströmning. Hjälp öppnas med tangentbord. Båda klassnamnen och giltighetsuppgifterna är synliga utan listval.
- Egen bildgranskning av listan samt gransknings-/sparsteget på dator och telefon: läsbara uppgifter och synliga fokusmarkeringar. Bilder finns i körningens utmatningskatalog. Telefonpanelen är fortfarande lång; fortsatt sammanhängande kompakt flöde ingår i kommande planer. Full zoom-/skärmläsargranskning och användarens självständiga begriplighetsprov är inte utförda här.

Från projektroten: `npm run docs:build` PASS. Docusaurus uppdateringskontroll varnade om lokal konfigurationsåtkomst, men själva dokumentationsbygget avslutades med exit 0. `git diff --check` PASS.

Första browserstarten i sandbox stoppades före prov av `listen EPERM` på 5194; godkänd eskalering använde samma isolerade testkonfiguration. Första fulla körningen **58/58 PASS** före den sista textjusteringen för läsläge bevaras i `/private/tmp/named-ux01-browser/full-58.json`. Ett felaktigt typkontrollförsök från paketets överordnade rot nådde inte TypeScript (`npm ENOTFOUND` för saknad lokal tsc); korrekt lokal kontroll från `web/` passerade. Inga beroenden installerades av det försöket.

## Bevarande och SS 12000

Ingen SQL, databas, serverroute, API-form, journalnyckel eller request-/kvittoparser ändrad. Inga användarklasser, klasslänkar eller medlemskap har lästs eller skrivits i riktig databas. 3012 och 3013 har inte startats om eller ändrats. Befintliga mandat, MFA och osäker-sparning-spärrar bevaras i komponenten och dess regressionstest.

SS 12000:2024/OpenAPI 2.1.0 enligt paketets befintliga mappning: klass-ID, organisation, datum och medlemskap bevaras. Den synliga listan visar oförändrat serverunderlag; okända historiska datum förblir okända. Detta är en presentation, inte ett nytt standardutbyte.

## Avvikelser och nästa steg

Planens produktomfattning följd. Actualspecens tre selectors anpassades efter samordning för att inte lämna ett avsiktligt trasigt framtida test; tidigare faktisk verifiering har inte märkts om som ett nytt prov. Ingen ny navigationsprop eller påhittad kopplingsstatus infördes.

Samordnaren hanterar oberoende granskning, avgränsad commit/push och senare kontrollerad lokal leverans. NAMED-TIMPLANS-UX:s modell, flera planer, flerval och övergripande flöde återstår. Gapet CLASS-COHORT-UX-01 och full fas 5 stängs inte av denna plan.
