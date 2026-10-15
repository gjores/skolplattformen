---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-01
status: completed
completed: 2026-10-15
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
subsystem: klasskoppling
requires: [05-OPERATIONAL-01]
provides: [separata planeringsår och tillämpningsläsår, verifierat SQL-nekande före kullstart]
affects: [CLASS-COHORT-02, CLASS-COHORT-08, CLASS-COHORT-09]
tech-stack:
  added: []
  patterns: [målskyddat rollbackprov av installerade funktioner]
key-files:
  modified:
    - web/app/protected-class-timplans.tsx
    - web/app/protected-class-timplans.css
    - web/e2e/operational-class-timplan.spec.ts
    - web/e2e/fixtures/operational-preview.tsx
    - work/pilot/verify-class-timplans.mjs
---

# CLASS-COHORT-01: tydligt läsår för klassens timplan

Klasspanelen visar valt planeringsår, fryst utbildningsstart och första läsår separat. Endast underlagets tre giltiga läsår kan väljas för koppling, med Årskurs 1–3. Ett ärvt år utanför intervallet ger en läsande förklaring och kräver ett uttryckligt giltigt årsval; planeringskontexten och befintliga versionslänkar ändras inte automatiskt.

## Genomförda uppgifter

1. **Datum och årsval:** giltighetskontroll mellan fryst exakt datum och serverns första läsår enligt juli-gränsen. Saknat eller motsägande underlag spärrar skrivning. Giltigt tidigare läsår inom kullen fungerar. Fokus återställs till årsvalet efter omläsning, och fel vid omläsning spärrar det kvarhållna underlaget tills en ny läsning lyckas. Revision, osäkert sparutfall och samma request vid återhämtning bevaras.
2. **Faktiskt negativt SQL-prov:** `schoolYear=firstYear-1` provas genom `phase5_class_command` för SA25 och BF25. SQLSTATE 22023 krävs, med oförändrade fullständiga klass-, länk-, kvitto-, elev-, placerings- och medlemskapsrader samt återläst länklista. Nytt `--applied` kräver privat `--out`, verifierar installerade migrationsversioner, åtta funktionskroppar och exekveringsegenskaper mot källan, och kör utan migrations-DDL. Ursprungligt migrationsläge finns kvar men nekar installerat schema.

Taskcommits:

- `a5276fd` — `fix(05-CLASS-COHORT-01): skilj klassens lasar fran planeringsaret`
- `911008e` — `test(05-CLASS-COHORT-01): verifiera klassar och installerat SQL-skydd`

Basrevision var `73c679e`; aktuella prövade taskkällor finns i `911008e45bc1a51e847617ea00cf6b9ea33c3489`. Källhashar och privata bevisreferenser är sparade i `/private/tmp/class-cohort-01-source-evidence.json`.

## Färska kontroller

| Kommando | Resultat | Bevis och gräns |
| --- | --- | --- |
| `node work/pilot/verify-class-timplans.mjs --applied --out /private/tmp/class-cohort-year-before-start.json` | PASS, exit 0, 60 kontroller | Faktisk lokal PostgreSQL; målskyddet `assertTarget('protected')`, syntetiska egna fixturer, rollback. Alla 61 public-tabellers fullradshashar samt DDL/ACL/migrationsjournal exakt bevarade. |
| `npx playwright test -c playwright.usability.config.ts operational-class-timplan.spec.ts` i `web/` | PASS, exit 0, 36/36, inga skips/retries | Dator och iPhone 13, syntetiska API-svar. Höst/januari/30 juni/1 juli, URL-år före/efter intervallet, äldre giltigt år, null/motsägelse, historiska länkar, osäkert svar, konflikt, tangentbord/fokus och felad/lyckad omläsning. |
| `node --test lib/class-timplan*.test.mjs` i `web/` | PASS, exit 0, 5/5 | Strikta klasskontrakt; separat från SQL och browser. |
| `npx tsc --noEmit` i `web/` | PASS, exit 0 | `/private/tmp/class-cohort-01-tsc-final.log` |
| `npx oxlint app lib` i `web/` | PASS, exit 0 | `/private/tmp/class-cohort-01-lint.log` |
| `npm run build:protected` i separat källkopia | PASS, exit 0 | Rootagentens `/private/tmp/class-cohort-01-build-result.json` och `class-cohort-01-build.log`; 435 spårade webbappfiler. Ingen ändring av ordinarie runtime 3012. |
| `git diff --check` | PASS, exit 0 | Inga whitespacefel i ändringarna. |

SQL-rapportens SHA256 är `2df162c9b559e13c8d86ea5123d0e8b0984da74a00f4638f9e80ff522c70ef32`. Databasfingeravtrycket före/efter är `2783b69936aabccfe1945f038ba10223adb1cc4398d9391408c45638410c9461`. Alla åtta verifierade definitioner kontrollerades även efter rollback. Testsetupens tillfälliga audit-feltrigger rullas tillbaka; inga migrationer installerades.

Slutlig browserrapport: `/private/tmp/class-cohort-01-ui-results.json`; logg: `/private/tmp/class-cohort-01-ui-pass.log`. Vårstartens skärmbilder på dator och telefon har granskats visuellt: tydligt separerade datum/år, läsbara kontroller, ingen horisontell överströmning. Övriga startdatum och bevarande av klasslänkar har automatiska browserkontroller och bilder under `web/test-results/`. Detta är komponentprov med simulerat API, inte verklig Worker/OIDC-kedja; sådan verifiering ligger i plan08.

Byggmanifestets SHA256 är `ddc965b8d483ed3bd6076e76bc2a088e5df59b114afd3d0be10e2d2d9b051d8f`. Produktkällorna var oförändrade under bygget; endast browserprovfilen ändrades. Källkopian saknade Gitmetadata, så byggmarkören är okänd. Detta är kompileringsbevis, inte releasebevis eller bevis för att 3012 kör ändringen. Rootagentens oberoende diff-/SQL-granskning rapporterade inga blockerande fynd.

## Avvikelser och första fel

- Provfixturen `operational-preview.tsx` behövde queryparametrar för fryst datum och planeringsår; annars var båda hårdkodade. Orkestreraren godkände denna femte avgränsade fil. Inget produkt-API utökades.
- Första browserkörningen nådde inte localhost på grund av sandboxens nätbegränsning. Den målbegränsade körningen med utökad verktygsbehörighet gav 30 PASS och fyra fokusfel på dator. Fokusförlust vid tillfälligt disabled årsval rättades. Nästa körning gav 34 PASS och två felaktiga testförväntningar: `ApiError` visar säkert kodbaserat meddelande och ignorerar rå `message`. Förväntan rättades; slutkörningen gav 36 PASS. Loggarna `class-cohort-01-ui.log` och `class-cohort-01-ui-final.log` bevarar tidigare försök i `/private/tmp/`.
- SQL:s första sandboxförsök kunde inte läsa Dockerstatus och rapporterade därför mål ej startat. Ingen miljö startades eller återställdes. Samma målskyddade kommando med verktygsbehörighet verifierade den redan körande lokala miljön och passerade.
- Handbokens sammanhängande klassflöde och lokal leverans är avsiktligt plan09:s uppgifter enligt paketet; ingen publicering eller uppdatering av 3012 ingår här.

## Krav och SS 12000

ADMIN-04/PLANERING-04 har nytt avgränsat bevis för rätt årsval och servernekande före start, och PLANERING-05 har nya lokala SQL-/browserkontroller. ADMIN-03 berörs endast av bevarande; ingen ny kullkopieringsacceptans eller full kravstängning görs. Tidigare godkänt kopieringsprov består.

Avstämningen följer paketets SS 12000:2024 / OpenAPI 2.1.0. Klassens stabila ID (`Group.id` i avsedd mappning) och tillämpningsläsår/versionslänk hålls separata; planeringsår blir varken klassidentitet, klassgiltighet eller elevmedlemskap. Ingen datamodell eller extern identitet ändras i denna plan. Intern en-utbildning-per-klass, äldre namnnycklar och okända klassdatum kvarstår som dokumenterade begränsningar. Faktiskt standardutbyte, export och kommunanslutning är inte provade.

Nästa beroende är CLASS-COHORT-02. Paketets fortsatta schema, tidiga klassflöde, samlade Workerprov, handbok, leverans och mänskliga begriplighetskontroll återstår. Rootagenten uppdaterar gemensam status och sköter push/fjärrverifiering separat.
