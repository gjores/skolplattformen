---
phase: 01-baslinje-och-avskild-pilotmilj
plan: 10
subsystem: testing
tags: [known-issue, save-order, persistTimplans, verify-phase1, aggregator, pgtap, playwright, BASE-01, BASE-02]

# Dependency graph
requires:
  - phase: 01-03
    provides: installClientForTests och rena laddare (transportmönstret från store-isolation.test.mjs)
  - phase: 01-05
    provides: prepare-local/verify-target med manifest per mål och pgTAP-filen supabase/tests/phase1_isolation.test.sql
  - phase: 01-06
    provides: verify-isolation.mjs och verify-baseline-db.mjs med exitkoder 0/1/3
  - phase: 01-08
    provides: Playwright-konfiguration, npm-scripten e2e och verify:phase1, ett känt rött pekyteprov i phone
provides:
  - web/lib/save-order.repro.mjs — röd reproducerare av sparordningsfelet mot riktiga persistTimplans/loadTimplans, märkt KNOWN-ISSUE med ägare fas 5, utanför den gröna sviten
  - web/scripts/verify-phase1.mjs — sammanställare med 12 steg, PASS/PASS-PARTIAL/FAIL/BLOCKED, --with-restore, --skip-browser, --out; kopierar pgTAP-filer till protected-målet före supabase test db
  - work/pilot/results/phase1-summary.json — den fulla körningens delresultat och totalstatus (FAIL på grund av det kända pekyteprovet)
affects: [01-09 (checkpoint och baslinjerapport), fas 2 (fasgrinden), fas 5 (ADMIN-04 sparordning)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reproducerare = .repro.mjs utanför testglobben; assertionerna uttrycker korrekt beteende och röd är det väntade utfallet; after() loggar en KNOWN-ISSUE-rad som sammanställaren läser"
    - "Fake-PostgREST i minnet med fördröjning per anrop (första upsert 150 ms) och FK-emulering (23503) för att visa ordningsfel utan databas"
    - "Sammanställare: varje steg spawnas utan skal via process.execPath och lokala bin-filer; exit ≠ 0, krasch eller saknad fil blir aldrig PASS; pilotskriptens 0/1/3 mappas till PASS/FAIL/BLOCKED"

key-files:
  created:
    - web/lib/save-order.repro.mjs
    - web/scripts/verify-phase1.mjs
    - work/pilot/results/phase1-summary.json
  modified: []

key-decisions:
  - "Reproducerarens andra scenario emulerar FK-villkoret timplan_cells.timplan_id → timplans.id (SQLSTATE 23503) så att utfallet motsvarar en riktig databas: den snabba ändringen mot modellens id avvisas"
  - "Fördröjningen räknas per scenario (resetTables nollställer räknaren), så första upsert i varje scenario är den långsamma"
  - "sql-karantän kräver både exit 0 och texten 'All tests successful' i pg_proves utdata för PASS"
  - "Den fulla körningens totalstatus FAIL committas som den är: browsersteget är obligatoriskt och det kända pekyteprovet är rött; ingen filtrering eller KNOWN-ISSUE-väg för Playwright infördes eftersom planen inte definierar någon"
  - "isolation.json och baseline-db.json skrevs om av delskripten under körningarna men återställdes till committat innehåll (bara datum, revision och signup-UUID skilde; status PASS oförändrad)"

patterns-established:
  - "Snabbkörning: node scripts/verify-phase1.mjs --skip-browser --out <utanför arbetsträdet>; ger högst PASS-PARTIAL"
  - "Fasgrind: npm run verify:phase1 (full) är enda vägen till PASS; SKIPPED och KNOWN-ISSUE räknas aldrig som PASS"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-09-11
---

# Phase 01 Plan 10: Sparordningsreproducerare och sammanställare verify:phase1 Summary

**Det kända sparordningsfelet i `persistTimplans` är reproducerat mot de riktiga lagerfunktionerna (två av två scenarier röda: 100 vinner över 200, och snabb ändring efter skapande skriver mot modellens id och avvisas av främmande nyckeln) och står som KNOWN-ISSUE med ägare fas 5; `npm run verify:phase1` kör fasens 12 kontroller i ordning, kopierar pgTAP-filerna till protected-målet, och gav i full körning 10 obligatoriska PASS, 1 obligatorisk FAIL (browser: det kända pekyteprovet i WebKit), 1 KNOWN-ISSUE och 1 SKIPPED → totalstatus FAIL på 58 s.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-11T21:56:42Z
- **Completed:** 2026-09-11T22:04:05Z
- **Tasks:** 2 av 2
- **Files modified:** 3 skapade

## Docker och mål

Docker svarade; båda målen var igång från 01-05/01-06 (`verify-target.mjs` → OK för protected 127.0.0.1:56321 och baseline 127.0.0.1:55321). Ingen BLOCKED-väg behövde tas i den fulla körningen. BLOCKED-vägen kontrollerades separat genom att tillfälligt flytta protected-manifestet (se nedan).

## Task 1 — `web/lib/save-order.repro.mjs` (`7c7c760`)

Reproducerare med node:test, filnamn `.repro.mjs` så att `node --test lib/*.test.mjs` inte plockar upp den (modellsviten: 108/108 gröna). Klienten injiceras med `installClientForTests(createClient('http://127.0.0.1:1', …, { global: { fetch: fakeFetch } }))`. Fake-transporten har in-memory-tabeller `timplans`, `timplan_cells` (nyckel `timplan_id:row_id`) och `timplan_events`, svarar på RPC `current_organizer_id`, `GET /auth/v1/user`, `POST /rest/v1/timplans` (nytt lager-id), upsert med `resolution=merge-duplicates`, händelser och GET-läsningar; `delay()` fördröjer det första upsert-anropet till `timplan_cells` 150 ms, senare 0 ms; varje anrop loggas med tidsstämpel. `planning-store.ts` är oförändrad (`git diff --stat fas1-baslinje -- web/lib/planning-store.ts` visar bara 01-03:s ändring, senaste commit 8fd61af).

**Faktiskt utfall per scenario (`node --test lib/save-order.repro.mjs`, exit 1):**

| Scenario | Utfall | Belägg ur loggen |
|----------|--------|------------------|
| samma cell: senaste avsedda värde ska finnas i lagret | **FAIL (röd som väntat)** | Båda `persistTimplans` startar; upsert `[100,0,0]` skickas +49 ms och fördröjs 150 ms, upsert `[200,0,0]` skickas +49 ms och når lagret direkt; `[100,0,0]` når lagret +201 ms. Lagret har `MATE = [100, 0, 0]`, omläsning via `loadTimplans` ger `[100, 0, 0]`. Assertionen `deepEqual(stored, [200, 0, 0])` faller. |
| nytt objekt följt av snabb ändring använder lagrets id | **FAIL (röd som väntat)** | Insert ger lagrets id `…000000000001`, cellen `[20,0,0]` skrivs dit. Den andra sparningen hittar `old` på modellens id och skriver `timplan_cells` med `timplan_id = model-4f3c1a2b-lokalt-id` → fake-FK svarar 23503 (`violates foreign key constraint "timplan_cells_timplan_id_fkey"`), `persistTimplans` avvisas med `Kunde inte spara timplanens timmar: …`. Exakt en timplansrad finns, men ändringen `[30,0,0]` nådde aldrig lagret. |

`after()` skriver: `KNOWN-ISSUE: 2 av 2 scenarier röda som väntat (samma cell=FAIL, nytt objekt=FAIL). Ägare: fas 5. Sparordning/id-mappning i persistTimplans är inte rättad.` Om båda scenarierna någon gång blir gröna skrivs i stället `KNOWN-ISSUE: 0 av 2 … utred`, så sammanställaren kan skilja fallen.

Fördröjningen bekräftades i loggen (`fördröjs 150 ms`) och assertionen `slowFirst` kräver den. Felet är alltså reproducerat med kontrollerad transport, inte antaget.

## Task 2 — `web/scripts/verify-phase1.mjs` och `work/pilot/results/phase1-summary.json` (`74afe87`)

Projektrot `path.resolve(fileURLToPath(import.meta.url), '../../..')`. Flaggor `--with-restore`, `--skip-browser`, `--out <sökväg>` (standard `<rot>/work/pilot/results/phase1-summary.json`). Varje steg spawnas utan skal (`process.execPath` + lokal bin: `typescript/bin/tsc`, `oxlint/bin/oxlint`, `@playwright/test/cli.js`, `scripts/run-mode.mjs`; `supabase` från PATH), utdata strömmas och sparas; ett steg som inte kan startas eller avbryts av signal blir FAIL. Pilotskriptens exit 0/1/3 → PASS/FAIL/BLOCKED. Steg 8 läser bara `workdir` ur manifestet (inga nycklar), kopierar `supabase/tests/*.sql` till `<workdir>/supabase/tests/`, kör `supabase --workdir <workdir> test db --local`, tar bort `<workdir>/supabase/.temp` efteråt och kräver både exit 0 och `All tests successful`. Steg 8–9 är BLOCKED om steg 7 inte är PASS; steg 11 BLOCKED om steg 10 inte är PASS. Sparordningssteget är `required: false` och blir KNOWN-ISSUE (exit ≠ 0) eller `KNOWN-ISSUE` med detalj `grön — utred` (exit 0); saknas KNOWN-ISSUE-raden helt (krasch) blir det FAIL och listas ändå under `knownIssues`.

### Full körning `npm run verify:phase1` (Playwright ingår), revision 7c7c760, Node v25.9.0

| # | Steg | Status | Exit | Tid | Obl. | Detalj |
|---|------|--------|------|-----|------|--------|
| 1 | modeller | PASS | 0 | 1,0 s | ja | 10 testfiler, 108 prov |
| 2 | typkontroll | PASS | 0 | 1,7 s | ja | |
| 3 | lint | PASS | 0 | 0,9 s | ja | `oxlint app lib scripts e2e` |
| 4 | exempelbygge | PASS | 0 | 4,2 s | ja | `dist/build-mode.json` mode example |
| 5 | browser | **FAIL** | 1 | 45,1 s | ja | 25 godkända, 1 överhoppad, 1 röd: `[phone] pekytor är minst 44 px på telefon` (WebKit `<select>` 26 px, känt sedan 01-08) |
| 6 | sparordning | KNOWN-ISSUE | 1 | 0,7 s | nej | 2 av 2 scenarier röda som väntat, ägare fas 5 |
| 7 | mål-protected | PASS | 0 | 0,6 s | ja | skolplattform-pilot-protected, 127.0.0.1:56321 |
| 8 | sql-karantän | PASS | 0 | 1,3 s | ja | `phase1_isolation.test.sql` kopierad; pgTAP `Files=1, Tests=52`, All tests successful |
| 9 | api-isolering | PASS | 0 | 1,8 s | ja | 58 nekade, 0 tillåtna, rader oförändrade |
| 10 | mål-baseline | PASS | 0 | 0,2 s | ja | skolplattform-pilot-baseline, 127.0.0.1:55321 |
| 11 | baslinje-db | PASS | 0 | 0,6 s | ja | 4/4 flöden PASS |
| 12 | återställning | SKIPPED | – | 0 s | nej | kräver `--with-restore` |

**Totalstatus: FAIL** (exit 1), total tid **58,1 s**. `knownIssues`: en post (`sparordning: KNOWN-ISSUE: 2 av 2 …`). Enda orsaken till FAIL är det obligatoriska browsersteget, där det enda röda provet är det pekyteprov som 01-08 lämnade rött med avsikt (appfel i `globals.css`, loggat i `deferred-items.md`). Alla säkerhetskontroller (steg 7–9) och alla baslinjekontroller (steg 10–11) är gröna.

### Kontroller utöver den fulla körningen

| Kontroll | Resultat |
|----------|----------|
| Planens `<automated>` för task 1 | exit 0 (grep-villkor, modellsviten 108/108 grön, KNOWN-ISSUE-rad skriven) |
| Planens `<automated>` för task 2 (snabbkörning `--skip-browser --out <scratchpad>`) | exit 0, totalstatus PASS-PARTIAL på 7,3 s (exempelbygge och browser SKIPPED, övriga som ovan); `git diff --quiet -- work/pilot/results/phase1-summary.json` lyckas — den committade filen är den fulla körningen |
| Manifestet `work/pilot/targets/protected/manifest.json` tillfälligt flyttat | exit **3**, steg 7 BLOCKED (exit 3), steg 8–9 BLOCKED utan att köras, steg 10–11 PASS, totalstatus BLOCKED; manifestet återställt och `verify-target --target protected` → OK |
| `<protected workdir>/supabase/tests/phase1_isolation.test.sql` efter steg 8 | finns; `supabase/.temp` finns inte i workdir |
| `npx oxlint` på de två nya filerna | exit 0 |
| `git diff --stat fas1-baslinje -- web/lib/planning-store.ts` | bara 01-03:s ändring (39 rader), inga nya |

## Deviations from Plan

### Avvikelse från acceptanskriterium (inte rättad, avsiktligt)

**Totalstatus i `phase1-summary.json` är FAIL, inte PASS/BLOCKED.** Acceptanskriteriet säger "aldrig FAIL vid överlämning", men browsersteget är obligatoriskt enligt planen och det kända pekyteprovet i `phone` är rött (01-08:s beslut att lämna det rött; appfel i UI-koden utanför denna plans filer). Planen definierar ingen KNOWN-ISSUE-väg för Playwright, och att hoppa över eller filtrera provet skulle göra grinden grön av misstag — exakt det BASE-02 förbjuder. Resultatet redovisas därför ärligt som FAIL med orsak; kontrollpunkten i 01-09 avgör hur fyndet hanteras (rättning av `.og-unit-switch` i `globals.css` eller uttrycklig KNOWN-ISSUE-status). Snabbkörningen visar att allt utom detta prov är grönt.

### Auto-fixed Issues

Inga.

### Övrigt

- Delskripten `verify-isolation.mjs` och `verify-baseline-db.mjs` skriver alltid om sina egna resultatfiler. Efter körningarna återställdes `work/pilot/results/isolation.json` och `baseline-db.json` till committat innehåll (`git checkout`) — de tillhör inte denna plans filer, och skillnaden var enbart datum, revision och signup-användarens UUID, status PASS oförändrad. Baseline-målet har fått ytterligare anonyma sessionsanvändare per körning (känt sedan 01-06; `prepare-local.mjs --target baseline --fresh` återställer).
- Pilotskripten anropas med absoluta sökvägar men redovisas relativt roten i `command`-fältet (`node work/pilot/verify-target.mjs --target protected`), utan nycklar.
- Nytt fynd loggat i `deferred-items.md`: React-varningar `Each child in a list should have a unique "key" prop` i `OrganisationWorkspace`/`TimplanView` i dev-serverns konsol under browserproven (16 förekomster). Påverkar inget provresultat och ligger utanför planen.

## Known Stubs

Inga. Reproduceraren är avsiktligt röd och märkt KNOWN-ISSUE; sammanställaren har inga platshållarsteg.

## Kvarstående för senare planer

- 01-09: ta ställning till pekyteprovet (rätta `appearance` på `.og-unit-switch` eller definiera KNOWN-ISSUE-hantering i sammanställaren) så att den fulla körningen kan ge PASS; pröva på fysisk telefon. Kravstatus för BASE-01/BASE-02 i REQUIREMENTS.md ändras först där.
- Fas 5 (ADMIN-04): kö/generationskontroll i `runTimplan`/`persistTimplans` och id-mappning före nästa skrivning; när `save-order.repro.mjs` blir grön ska den flyttas in i den ordinarie sviten som regressionsprov.
- `--with-restore` kördes inte i denna plan (steg 12 SKIPPED, ej obligatoriskt); återställningsprovet finns från 01-01 (`baseline-restore.json`).

## Task Commits

1. **Task 1: save-order.repro.mjs — röd reproducerare som KNOWN-ISSUE** - `7c7c760` (test)
2. **Task 2: Sammanställaren verify-phase1.mjs och phase1-summary.json** - `74afe87` (test)

## Self-Check: PASSED

Alla tre skapade filer och SUMMARY finns; commits 7c7c760 och 74afe87 finns i historiken.
