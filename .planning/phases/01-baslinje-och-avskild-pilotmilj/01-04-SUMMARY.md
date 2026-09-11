---
phase: 01-baslinje-och-avskild-pilotmilj
plan: 04
subsystem: testing
tags: [fixtures, node-test, typescript, organisation-model, admin-model, timplan-model]

# Dependency graph
requires:
  - phase: 01-01
    provides: Git-baslinje för web/ så att fixturen kan versionshanteras
provides:
  - createPilotFixture() i web/lib/pilot-fixtures.ts — en huvudman, en grundskola och ett gymnasium med stabila ID:n
  - 24 syntetiska elever i fyra klasser med konsekventa skolreferenser (organisation, classes, pupils, admin)
  - Hjälparna pupilsForUnit, adminForUnit, schoolLabel samt konstanterna PILOT_UNIT_GR/PILOT_UNIT_GY
  - studyPlanFromOffering exporterad och deriveClasses med Pick<AdminState,'pupils'> i admin-model.ts
affects: [01-07 pilotvyer, 01-08 browserprov, 04 elevregister, 05 klasser och grupper]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixturer bygger egna organisationsobjekt med stabila ID:n i stället för att patcha createOrganisationState()"
    - "Historikposter i fixturer får fasta id/time så att två anrop blir deepEqual (uid()/clock() undviks)"
    - "Per-skola-avgränsning via adminForUnit(f, unitId) → Pick<AdminState,'pupils'> som deriveClasses accepterar"

key-files:
  created:
    - web/lib/pilot-fixtures.ts
    - web/lib/pilot-fixtures.test.mjs
  modified:
    - web/lib/admin-model.ts

key-decisions:
  - "Fixturens tillstånd (permits) anges som 'Huvudmannens beslut' med kommunala diarienummer eftersom huvudmannen är kommunal; Skolinspektionens godkännande gäller enskilda huvudmän"
  - "Likhetstestet mellan två anrop jämför organisation/admin/classes/pupils/units strikt och timplanerna strukturellt, eftersom timplan-model sätter plan- och historik-ID:n med uid()"

patterns-established:
  - "Klass-ID: klass:{skolenhetskod}:{klassnamn}; elev-ID: E-2001…E-2024; skolenheter 99999902 (GR) och 99999903 (GY)"
  - "Utbildnings-ID gr/sa25/ek25 behålls oförändrade så att createTimplanState och studyPlanFromOffering fungerar utan ändring"

requirements-completed: [BASE-01, BASE-02]

# Metrics
duration: 5min
completed: 2026-09-11
---

# Phase 01 Plan 04: Pilotfixtur med två exempelskolor Summary

**Sammanhängande syntetisk skolvärld: Exempelstads kommun med Björkhagens grundskola (4A, 7B) och Exempelstads gymnasium (SA26A, EK26A), 24 elever med stabila ID:n, timplaner och studieplaner ur befintliga modeller — täckt av 12 invarianttester.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-11T10:20:58Z
- **Completed:** 2026-09-11T10:25:04Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 3

## Accomplishments

- `createPilotFixture()` ger per anrop nya, oberoende objekt: organisation (2 skolenheter, 4 utbildningar, 4 uppdrag), timplaner via `createTimplanState`, adminregister med 24 elever, `classes` och `pupils`.
- Gymnasieeleverna får studieplan ur `studyPlanFromOffering` mot fastställda poängplaner (pp-sa, pp-ek); grundskoleeleverna ligger i gruppen `gr-sv`. Saknad poängplan kastar `Poängplan saknas för …` så att brutna ID:n upptäcks direkt.
- Kullkopiering (`copyCohort`) mot fixturen lämnar organisation, timplaner och elever orörda; kopian hör till gymnasiet.
- Fixturen innehåller inga personnummer, adresser eller kontaktuppgifter och refererar inte till den gamla enskolefixturen (`99999901`/`Testskolan`).

## Fixturens ID-tabell

| Objekt | ID | Namn / innehåll |
|--------|----|-----------------|
| Huvudman | org.nr 2120009999 | Exempelstads kommun (Kommunal) |
| Skolenhet GR | 99999902 | Björkhagens grundskola — GR, årskurs 1–9; `activeUnitId` |
| Skolenhet GY | 99999903 | Exempelstads gymnasium — GY, program SA, EK |
| Utbildning | gr | Grundskola, unit 99999902, aktiv, ingen poängplan |
| Utbildning | sa25 | Samhällsvetenskap SA25/SASAP, unit 99999903, aktiv, poängplan pp-sa fastställd 2026-05-06 |
| Utbildning | ek25 | Ekonomi EK25/EKEKI, unit 99999903, aktiv, poängplan pp-ek fastställd 2026-05-06 |
| Utbildning | es-foto | Foto och rörlig bild ES25/ESBIF, unit 99999903, planerad, poängplan pp-es-foto utkast |
| Klass | klass:99999902:4A | grundskola, årskurs 4, elever E-2001–E-2006 |
| Klass | klass:99999902:7B | grundskola, årskurs 7, elever E-2007–E-2012 |
| Klass | klass:99999903:SA26A | gymnasium, kull 2026, sa25, elever E-2013–E-2018 |
| Klass | klass:99999903:EK26A | gymnasium, kull 2026, ek25, elever E-2019–E-2024 |
| Uppdrag | rektor-robin | Robin Berg, rektor för 99999902 och 99999903 |
| Uppdrag | larare-sam | Sam Nilsson, lärare 99999902 (mentor GR) |
| Uppdrag | larare-mira / larare-alex | Mira Ek (mentor SA26A) / Alex Lind (mentor EK26A), lärare 99999903 |

Alla elever har `placementStart` 2026-08-17 och status Aktiv. Antalet 24 är ett provförslag inom D-03, inte pilotvolym.

## Tester

12 nya tester i `web/lib/pilot-fixtures.test.mjs` (node:test). Hela modellsviten: 108 tester passerar (85 baslinje + 12 här + 11 från parallella planer i vågen), `npx tsc --noEmit` och `npx oxlint lib` utan fel (Node 25).

## Exportändringar i admin-model.ts

1. `function studyPlanFromOffering(` → `export function studyPlanFromOffering(` — fixturen bygger Gy25-studieplaner med samma regel som `createAdminState`.
2. `deriveClasses(state: AdminState)` → `deriveClasses(state: Pick<AdminState, 'pupils'>)` — funktionen använder bara `state.pupils`; `adminForUnit` kan då ge en per-skola-vy utan att kopiera hela adminstaten.

Inga beteendeändringar; `lib/admin-model.test.mjs` (17 tester) passerar oförändrat.

## Task Commits

1. **Task 1: RED — pilot-fixtures.test.mjs och exportändringar** - `40a635b` (test)
2. **Task 2: GREEN — pilot-fixtures.ts** - `9e3eb00` (feat)

## Files Created/Modified

- `web/lib/pilot-fixtures.ts` - `createPilotFixture`, `PILOT_ORGANIZER`, `PILOT_UNIT_GR`, `PILOT_UNIT_GY`, typerna `PilotClass`/`PilotPupil`/`PilotFixture`, hjälparna `pupilsForUnit`, `adminForUnit`, `schoolLabel`
- `web/lib/pilot-fixtures.test.mjs` - 12 invarianttester (skolor, utbildningar, timplaner, uppdrag, elever, klasser, admin, per-skola-härledning, etiketter, oberoende, kullkopiering, inga gamla referenser)
- `web/lib/admin-model.ts` - två exportändringar enligt ovan

## Decisions Made

- **Tillstånd:** Utbildningarnas `permits` anges med `issuer: 'Huvudmannens beslut'` och kommunala referenser (KS/BUN) i stället för Skolinspektionen som i enskolefixturen, eftersom huvudmannen här är en kommun. Övriga fält (datum, giltighet, poängplaner) kopierades enligt planen.
- **Likhetstest (behavior 10):** `createTimplanState` sätter timplanernas `id` och historikens `id` med `uid()`. Testet jämför därför organisation, admin, classes, pupils och units med `deepEqual` och timplanerna strukturellt (educationId, version, status, cells). Fixturens egna historikposter har fasta ID:n och tider. Alternativet — att skriva om ID:n i timplanerna efter skapandet — hade brutit mot planens avsikt att inte röra befintliga modellregler.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Väntade in parallell plan innan tsc**
- **Found during:** Task 1 (RED-verifiering)
- **Issue:** `npx tsc --noEmit` föll i `organisation-store.ts`/`planning-store.ts` (saknad export `signInDemo` i `supabase.ts`); `supabase.ts` var ändrad 18 sekunder tidigare av plan 01-03.
- **Fix:** Ingen kodändring. Kontrollerade mtime, körde om enligt planens anvisning; tsc passerade när 01-03 var klar.
- **Files modified:** inga
- **Verification:** `npx tsc --noEmit` exit 0 före RED- och GREEN-commit
- **Committed in:** —

---

**Total deviations:** 1 (Rule 3, ingen kodändring). De två besluten ovan är preciseringar av planens behavior 10 och permit-fälten, inte scope-utökning.
**Impact on plan:** Inga.

## Issues Encountered

Första versionen av fixturens filkommentar nämnde `createOrganisationState()`, som acceptanskriteriet förbjuder som sträng i filen; omformulerat före GREEN-commit.

## User Setup Required

None - no external service configuration required.

## Known Stubs

Inga. Alla fält är fyllda med syntetiska värden; `placementEnd` är avsiktligt frivilligt och saknas för aktiva elever.

## Next Phase Readiness

- Plan 01-07 (pilotvyer) kan importera `createPilotFixture`, `PILOT_UNIT_GR/GY`, `adminForUnit` och `schoolLabel` för per-skola-vyer; `deriveClasses(adminForUnit(f, unitId))` ger exakt skolans klasser.
- Plan 01-08 (browserprov) kan referera till stabila ID:n (`E-2001`, `klass:99999903:SA26A` osv).
- Läsår skapas inte av fixturen; vyerna anropar `createLasarState(unitId, schoolTypes)` per skolenhet som förut.
- Kravstatus i REQUIREMENTS.md rörs inte här; plan 01-09 markerar BASE-01/BASE-02 efter checkpoint.

---
*Phase: 01-baslinje-och-avskild-pilotmilj*
*Completed: 2026-09-11*

## Self-Check: PASSED

- Filer: web/lib/pilot-fixtures.ts, web/lib/pilot-fixtures.test.mjs, 01-04-SUMMARY.md finns
- Commits: 40a635b (test), 9e3eb00 (feat) finns i git log
