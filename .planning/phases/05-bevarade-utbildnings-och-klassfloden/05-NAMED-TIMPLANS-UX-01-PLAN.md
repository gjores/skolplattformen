---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-01
type: execute
wave: 1
depends_on: []
files_modified: ["web/app/protected-class-cohorts.tsx", "web/app/protected-class-cohorts.css", "web/e2e/class-cohort.spec.ts", "docs/handbok/programplaner.md"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["Användaren ser alla sparade klasser utan dropdown.", "Sparat, markerat och kopplat blandas inte ihop.", "Befintlig återhämtning, mandat och klassidentitet fungerar som tidigare."]
  artifacts: ["web/app/protected-class-cohorts.tsx", "web/app/protected-class-cohorts.css", "web/e2e/class-cohort.spec.ts", "docs/handbok/programplaner.md"]
  key_links: ["Befintliga klasser → samtidigt synlig klasslista", "Bevara sparsäkerhet och beskriv det synliga flödet"]
---

<objective>
Visa sparade klasser samtidigt och gör skapa–granska–spara begripligt utan datamodelländring.

Resultatet ingår i det avgränsade gapet, inte i ett automatiskt godkännande av hela fas 5.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md
</context>

<tasks>

<task type="auto">
<name>1. Befintliga klasser → samtidigt synlig klasslista</name>
<files>web/app/protected-class-cohorts.tsx, web/app/protected-class-cohorts.css</files>
<action>Läs aktuell komponent och v2-underlaget. Ersätt rullistan som väljer en klass för läsning med semantisk lista/kort över samtliga sparade klasser, med namn, första läsår och läsbara giltighetsuppgifter. Markera tydligt Sparade klasser. Ingen kryssruta i denna läsyta får antyda timplanskoppling. Bevara klass-ID, datahämtning, behörighetsläge och befintligt API. Gör huvudåtgärden för aktuellt skede tydlig och flytta längre förklaringar till sekundär hjälp; utkast får ingen grön färdigmarkering. Teknisk återläsning ska vara sekundär vid normalt läge men säkerhetsfel/osäkert utfall får aldrig gömmas. Denna uppgift inför inga nya props eller navigationskontrakt.</action>
<verify>Kör relevanta befintliga class-cohort.spec.ts-fall på dator och telefon; kontrollera båda klassnamnen samtidigt utan listval, huvudåtgärd och tangentbord/fokus. Kör npx tsc --noEmit och npx oxlint app/protected-class-cohorts.tsx från web.</verify>
<done>Två sparade klasser är samtidigt synliga; att läsa listan kan inte misstolkas som sparning eller koppling.</done>
</task>

<task type="auto">
<name>2. Bevara sparsäkerhet och beskriv det synliga flödet</name>
<files>web/e2e/class-cohort.spec.ts, docs/handbok/programplaner.md</files>
<action>Anpassa endast meningsfulla befintliga UI-förväntningar som berör ändrad presentation. Behåll journal, MFA, kvittoåterläsning, osäker status, uppdragsbyte, unmount/avbrott och navigationens spärrar oförändrade. Uppdatera endast klassorganisationens handbokstext så att skapade klasser, sparat resultat och separat timplanskoppling skiljs åt. Inga påståenden om ännu ej byggda namngivna planer.</action>
<verify>Kör hela berörd class-cohort-svit på Chromium dator och WebKit telefon utan borttagna säkerhetsfall; granska egna skärmbilder, minst 44px pekmål och ingen horisontell sidöverströmning. Kör npm run docs:build från roten.</verify>
<done>Presentationsändringen är provad i båda formaten och handboken beskriver faktiskt implementerat beteende.</done>
</task>

</tasks>

<verification>
Kör relevanta befintliga class-cohort.spec.ts-fall på dator och telefon; kontrollera båda klassnamnen samtidigt utan listval, huvudåtgärd och tangentbord/fokus. Kör npx tsc --noEmit och npx oxlint app/protected-class-cohorts.tsx från web. Kör hela berörd class-cohort-svit på Chromium dator och WebKit telefon utan borttagna säkerhetsfall; granska egna skärmbilder, minst 44px pekmål och ingen horisontell sidöverströmning. Kör npm run docs:build från roten.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- Användaren ser alla sparade klasser utan dropdown.
- Sparat, markerat och kopplat blandas inte ihop.
- Befintlig återhämtning, mandat och klassidentitet fungerar som tidigare.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-01-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
