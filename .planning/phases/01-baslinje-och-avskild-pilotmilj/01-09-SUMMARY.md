---
phase: 01-baslinje-och-avskild-pilotmilj
plan: 09
subsystem: docs
tags: [baseline, regression-matrix, known-issues, pilot-readme, validation-map, checkpoint, BASE-01, BASE-02, PILOT-01]

# Dependency graph
requires:
  - phase: 01-01
    provides: taggen fas1-baslinje (917313b) och baseline-restore.json (85/0, tsc 0, build 0)
  - phase: 01-02
    provides: docs/pilot/connection-profile.md med OB-01–OB-08
  - phase: 01-06
    provides: isolation.json (58 nekade/0 tillåtna) och baseline-db.json (4/4 flöden)
  - phase: 01-08
    provides: Playwright-proven phase1-baseline.spec.ts (12) och phase1-isolation.spec.ts (3)
  - phase: 01-10
    provides: save-order.repro.mjs (KNOWN-ISSUE) och sammanställaren verify:phase1 med phase1-summary.json
provides:
  - docs/pilot/baseline.md — daterad baslinjerapport med återgång, resultatmatris (23 rader, 12 flöden × lager), historik åtskild och kända fel med ägare
  - docs/pilot/README.md — startanvisning för exempelläge på dator, fysisk telefon, blockerad start, lokala mål och verify:phase1
  - 01-VALIDATION.md — slutlig verifieringskarta med körstatus per rad, wave_0_complete true, manuella resultat godkänt 2026-09-12
  - REQUIREMENTS.md § Traceability — BASE-01, BASE-02, PILOT-01 som "Genomförd — väntar verifiering" (aldrig Verifierad)
affects: [gsd-verifier fas 1, fas 2 (fasgrind verify:phase1), fas 5 (KNOWN-ISSUE sparordning), fas 7/8 (OB-01–OB-08)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Baslinjerapporten hämtar revision/datum/utfall ur resultatfilerna under work/pilot/results/, inte ur minnet; varje matrisrad pekar på fil + fält"
    - "Historiska prov (2026-09-07/08, kodkartans 85 tester) listas separat och räknas inte som bevis för aktuell kod"
    - "Kravstatus går Pending → Genomförd — väntar verifiering (efter användarens checkpoint) → Verifierad (bara gsd-verifier)"

key-files:
  created:
    - docs/pilot/baseline.md
    - docs/pilot/README.md
  modified:
    - .planning/phases/01-baslinje-och-avskild-pilotmilj/01-VALIDATION.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Pekytefelet i WebKit (select 26 px) rättades i globals.css före baslinjerapporten skrevs (564d067, appearance:none med egen pil) i stället för att införa en KNOWN-ISSUE-väg för Playwright; verify:phase1 kördes om i sin helhet och gav PASS"
  - "Resultatmatrisen fick 23 rader (12 flöden uppdelade per lager modell/databas/browser + en rad för pekytor/320 px/tangentbord) så att varje bevis har egen revision, datum och fil"
  - "Konkurrerande sparningar och redigering efter skapande står som KNOWN-ISSUE med ägare fas 5 och stoppvillkor; de räknas inte som godkänd funktion även om fasgrinden är grön"
  - "REQUIREMENTS ändrades först efter användarens godkända checkpoint och bara till 'Genomförd — väntar verifiering'; Verifierad sätts av gsd-verifier"

patterns-established:
  - "Manual-Only Verifications: kolumnen Resultat får bara 'godkänt <ISO-datum>' eller 'Avvikelse: <steg>' efter användarens svar; ingen rad får PASS utan bekräftelse"
  - "Startanvisning: npm run dev:example (dator), npm run build:example && npm run phone (telefon), npm run dev:blocked:test (blockerad start), npm run verify:phase1 (fasgrind)"

requirements-completed: [BASE-01, BASE-02, PILOT-01]

# Metrics
duration: 10min aktivt arbete (task 1–2 00:06–00:14 CEST, task 3 avslut 18:21 CEST efter användarens checkpoint)
completed: 2026-09-12
---

# Phase 01 Plan 09: Baslinjerapport, startanvisning, verifieringskarta och användarens checkpoint Summary

**Fas 1:s bevis är sammanställda i `docs/pilot/baseline.md` (23 matrisrader med revision, datum, kommando och belägg per lager; historik 2026-09-07/08 åtskild; fyra kända fel med ägare fas 2/3/5) och `docs/pilot/README.md`; den fulla fasgrinden `verify:phase1` är PASS efter CSS-rättningen 564d067; användaren har provat provmiljön på dator (1440 px) och fysisk telefon samt läst dokumenten och svarat "godkänt" utan avvikelser, varefter BASE-01, BASE-02 och PILOT-01 står som "Genomförd — väntar verifiering".**

## Performance

- **Duration:** cirka 10 min aktivt (dokument och karta), därefter väntan på användarens manuella prov
- **Started:** 2026-09-11T22:06Z (efter 01-10 och CSS-rättningen)
- **Completed:** 2026-09-12T16:21Z
- **Tasks:** 3 av 3 (2 auto + 1 checkpoint, godkänd)
- **Files modified:** 4 (2 skapade, 2 uppdaterade)

## Sammanhang: CSS-rättningen före planen (564d067)

Plan 01-10 lämnade `verify:phase1` med totalstatus FAIL på grund av det enda röda browserprovet (pekytor i WebKit: `select#exempelskola` 26 px). Orkestratorn rättade det som en avgränsad fix innan 01-09 startade: `.og-unit-switch` fick `appearance:none; -webkit-appearance:none` med egen pil-SVG och högerpadding i `web/app/globals.css` (2 rader). Hela `npm run verify:phase1` kördes om (revision 7d289d5 med rättningen i arbetsträdet): **11 PASS, 1 KNOWN-ISSUE (sparordning), 1 SKIPPED (återställning) → totalstatus PASS, 52,9 s**. `phase1-summary.json`, `isolation.json` och `baseline-db.json` uppdaterades i samma commit; `deferred-items.md` markerar fyndet som åtgärdat. Ingen KNOWN-ISSUE-väg för Playwright infördes — grinden är grön för att felet är rättat, inte för att provet filtrerats. Denna plan ändrade ingen appkod.

## Task 1 — `docs/pilot/baseline.md` och `docs/pilot/README.md` (`aba82d7`)

**baseline.md** (99 rader): datum 2026-09-12, revision 564d067, baslinjetagg `fas1-baslinje` (917313b), tre provmiljöer. Avsnitt exakt enligt planen:

- `## Återgång till baslinjen` — `git checkout fas1-baslinje`, `git worktree add ../skolplattform-baslinje fas1-baslinje`, `node work/pilot/verify-baseline.mjs`; vad som inte ingår (.env.local, byggen, lokala mål) och att återgång inte återöppnar demoåtkomst i något mål.
- `## Resultatmatris` — 23 rader (planens 12 flöden, varav flöde 1–5 uppdelade i modell/databas/browser, plus rad 13 för pekytor/320 px/tangentbord/Elever-vy). Alla värden ur resultatfilerna:

| # | Flöde | Faktiskt |
|---|-------|----------|
| 1a–c | Gymnasieutbildning skapas | PASS (modell, databas flows[0], browser test 3 desktop+phone) |
| 2a–c | Kurs-/nivåtillägg i poängplan | PASS; fastställd nekas |
| 3a–c | Kopiering till ny elevkull | PASS; original orört, 0 klasskopplingar |
| 4a–c | Klass–timplanskoppling, fast version | PASS; ny version flyttar inte kopplingen |
| 5a–c | Grundskolans planflöde | PASS |
| 6 | Skolbyte bevarar / omläsning börjar om | PASS (desktop + phone) |
| 7 | Källbaslinje återställs | PASS 85/0, tsc 0, build 0 (917313b, 2026-09-11T10:16Z); steget i verify:phase1 SKIPPED utan `--with-restore` |
| 8 | Karantän: installerade rättigheter | PASS — pgTAP Tests=52, All tests successful |
| 9 | Karantän: API-väg, tre identiteter | PASS — 58 DENIED, 0 ALLOWED, unchanged |
| 10 | Byggd exempelvy/blockerad start utan backend-anrop | PASS 3/3 |
| 11 | Konkurrerande sparningar (samma cell) | **KNOWN-ISSUE** — lagret har 100, senaste 200 förlorad |
| 12 | Redigering direkt efter skapande (lokalt id) | **KNOWN-ISSUE** — FK 23503, ändringen når inte lagret |
| 13 | Pekytor 44 px, 320 px, tangentbord, Elever-vy | PASS efter 564d067 (före: 358×26 px, rött) |

- `## Historik (inte aktuella bevis)` — 2026-09-07 (granskning mot molndemon), 2026-09-08 (80 modelltester + verify-cohorts mot skolplattform-dev), kodkartans 85 modelltester 2026-09-11, med den obligatoriska meningen att de inte används som bevis för aktuell kod.
- `## Kända fel och ägarskap` — fyra rader: sparordning (KNOWN-ISSUE, fas 5), lokalt id efter skapande (KNOWN-ISSUE, fas 5), flerstegsskrivningar utan transaktion (DOKUMENTERAD RISK, fas 3), tysta fel i logEvent/saveGrades (DOKUMENTERAD RISK, fas 2), var och en med stoppvillkor.
- `## Vad som inte är verifierat` — molndemons installerade tillstånd, skyddad kontoåtkomst (fas 2), verklig kommunanslutning (fas 7); fysisk telefon stod som "väntar på checkpoint" när rapporten skrevs och är nu bekräftad (se task 3).

**README.md** (63 rader): Node 25-PATH, `npm ci`, dator `npm run dev:example`, telefon `npm run build:example && npm run phone`, blockerad start `npm run dev:blocked:test`, lokala mål `prepare-local.mjs --target protected|baseline` / `--stop`, `npm run verify:phase1` (BLOCKED utan Docker, `--with-restore`), förbud (work/supabase mot molnet, verkliga elevuppgifter, nycklar i Git), länkar till baseline.md och connection-profile.md.

Planens `<automated>`-kontroll: exit 0.

## Task 2 — `01-VALIDATION.md` slutlig karta (`6ddb85c`)

Frontmatter `wave_0_complete: true`, `status: executed`; `nyquist_compliant: true` orört. Per-Task Verification Map: alla 20 rader har `File Exists` = Ja och Status PASS/KNOWN-ISSUE, utom checkpointraden 01-09/3 som stod BLOCKED tills task 3. Wave 0 (6/6) och Sign-Off ibockade. Kolumnen `Resultat` tillagd under Manual-Only Verifications med `väntar på checkpoint`. `REQUIREMENTS.md` rördes inte (`git diff --quiet` exit 0). Planens `<automated>`-kontroll: exit 0.

## Task 3 — Checkpoint: användaren provade provmiljön (`b4c3052`)

Användaren följde `docs/pilot/README.md` och checkpointens steg 1–14 och svarade **"godkänt"** 2026-09-12. Resultat per steggrupp, som antecknat i 01-VALIDATION.md:

| Steg | Område | Resultat |
|------|--------|----------|
| 3 | Dator 1440 px: Provmiljö, "Fiktiva skolor och elever.", "Ändringar gäller tills sidan laddas om"; ingen falsk "Sparat i databasen"/"Inloggad" | godkänt |
| 4 | Skolbyte Björkhagen → Exempelstads gymnasium → tillbaka bevarar Matematik = 123 | godkänt |
| 5 | Kopiera till ny elevkull (HT 2027, Planerad, original orört) — uttryckligen bekräftat av användaren; koppla klass SA26A till fastställd version, Ny version flyttar inte | godkänt |
| 6 | Prova som Rektor: båda skolorna kvar, Elever 12 per skola (4A/7B resp. SA26A/EK26A) | godkänt |
| 7 | Omläsning: 123 borta, exemplet börjar om | godkänt |
| 8 | Tangentbord: fokusring, Enter öppnar "Om provmiljön", Escape stänger och återför fokus | godkänt |
| 9 | 200 % zoom utan klippning | godkänt |
| 10–12 | Fysisk telefon via `npm run phone` på samma wifi: märkning utan sidomeny, väljare i full bredd utan sidledsrullning, avgränsad tabellrullning, pekytor ≥ 44 px | godkänt |
| 13 | Blockerad start (`dev:blocked:test`, 127.0.0.1:5192): endast "Arbetsytan är inte tillgänglig ännu" | godkänt |
| 14 | baseline.md och connection-profile.md: inget påstår verklig kommunanslutning, verklig pilotvolym eller "säker pilot" | godkänt |

Inga avvikelser rapporterades. Användaren lyfte samtidigt ett önskemål om en Plan Digital-liknande läsårslins; det är en ny idé, inte en avvikelse i fas 1, och finns som todo (`.planning/todos/pending/2026-09-12-l-s-rslins-…md`, underlag `docs/plan-digital-lasarsmodell.md`).

Efter svaret:
- `01-VALIDATION.md`: de tre raderna under Manual-Only Verifications fick `godkänt 2026-09-12` med steg och revision 564d067; checkpointraden 01-09/3 ändrad från BLOCKED till PASS; 01-08-radens "fysisk telefon väntar på checkpoint" uppdaterad; approval-texten anger att gsd-verifiers fasverifiering återstår.
- `REQUIREMENTS.md` § Traceability: `BASE-01`, `BASE-02` → `Genomförd — väntar verifiering (se docs/pilot/baseline.md)`, `PILOT-01` → `Genomförd — väntar verifiering (se docs/pilot/connection-profile.md)`; Coverage-raden `39 krav är Pending; BASE-01, BASE-02 och PILOT-01 är genomförda i fas 1 och väntar på verifiering`; förklaring av statusnivån tillagd i inledningen; kryssrutorna orörda; ingen rad innehåller `Verifierad`.

Planens `<automated>`-kontroll för task 3: exit 0.

## Deviations from Plan

### Sammanhang utanför planen (inte en avvikelse i 01-09)

**CSS-rättningen 564d067** gjordes av orkestratorn mellan 01-10 och 01-09 (märkt `fix(01-10)`), eftersom 01-10 uttryckligen lämnade beslutet till 01-09-skedet. Det är den enda appkodsändringen i sammanhanget (`web/app/globals.css`, 2 rader) och den verifierades genom full omkörning av `verify:phase1` (PASS) och av användaren på fysisk telefon (steg 12). Denna plan ändrade ingen appkod.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kvarvarande "väntar på checkpoint" i 01-08-raden**
- **Found during:** Task 3
- **Issue:** Per-Task Verification Map-raden för 01-08/2 sade fortfarande "fysisk telefon väntar på checkpoint" efter att checkpointen godkänts.
- **Fix:** Texten ändrad till "fysisk telefon godkänd av användaren 2026-09-12 (01-09 task 3)".
- **Files modified:** 01-VALIDATION.md
- **Commit:** b4c3052

**2. [Rule 2 - Statusdisciplin] Kravkryssrutorna lämnas obockade**
- **Found during:** Statusuppdatering efter SUMMARY
- **Issue:** `gsd-tools requirements mark-complete` bockade `[x]` för BASE-01/BASE-02/PILOT-01, vilket skulle signalera färdigt krav innan gsd-verifier verifierat fasen — i strid med planen ("Skriv aldrig Verifierad") och ROADMAP:s regel att inga krav markeras färdiga utan verifiering.
- **Fix:** Kryssrutorna återställda till `[ ]`; spårbarhetsraderna står kvar som "Genomförd — väntar verifiering". gsd-verifier bockar dem vid fasverifieringen.
- **Files modified:** .planning/REQUIREMENTS.md (nettoresultat: oförändrad mot b4c3052)

Inga andra avvikelser; planen genomfördes som skriven.

## Auth gates

Inga.

## Known Stubs

Inga. Dokumenten innehåller inga platshållare; alla matrisvärden kommer ur resultatfiler.

## Det som förblir öppet efter fas 1

- **KNOWN-ISSUE (ägare fas 5, ADMIN-04):** sparordning i `persistTimplans` (äldre sparning vinner) och skrivning mot lokalt id direkt efter skapande (`web/lib/save-order.repro.mjs`, 2/2 röda). Stoppvillkor: beständig timplans-/läsårsredigering öppnas inte i skyddat läge förrän reproduceraren är grön.
- **Dokumenterade risker:** flerstegsskrivningar utan transaktion (fas 3), tysta fel i `logEvent`/`saveGrades` (fas 2, AUDIT-01).
- **Docker-beroende:** stegen mål-protected, sql-karantän, api-isolering, mål-baseline och baslinje-db i `verify:phase1` ger BLOCKED (exit 3) utan lokal Supabase; i fasens körning var inget BLOCKED. Steget `återställning` är SKIPPED utan `--with-restore` (fristående bevis finns i `baseline-restore.json`).
- **Öppna beroenden OB-01–OB-08** i `docs/pilot/connection-profile.md`: pilotpartner, IdP, kontokälla, registerleverantör/kontrakt, fältlista och skrivansvar, verklig volym, drift/avtal/konsekvensbedömning, skyddsfall och spärr-/återställningsmål. De blockerar fas 4/6/7/8-krav, inte fas 1.
- **Inte verifierat:** molndemons installerade tillstånd (orört, inte inspekterat), skyddad kontoåtkomst (fas 2), verklig kommunanslutning (fas 7).
- **Uppskjutna UI-fynd** (`deferred-items.md`): hårdkodat "Testskolan"/"Alex Lind" i sidomenyn och Elever-vyns kontextrad; React `key`-varningar i OrganisationWorkspace/TimplanView.
- **Kravstatus:** BASE-01, BASE-02, PILOT-01 är "Genomförd — väntar verifiering". `Verifierad` sätts av gsd-verifier efter fasverifieringen.

## Task Commits

1. **Task 1: baseline.md och README.md** — `aba82d7` (docs)
2. **Task 2: slutlig verifieringskarta** — `6ddb85c` (docs)
3. **Task 3: checkpoint godkänd, manuella resultat och kravstatus** — `b4c3052` (docs)

Sammanhang: `564d067` (fix, orkestratorn, före planen) — WebKit-select 44 px och verify:phase1 PASS.

## Self-Check: PASSED

Alla fem filer finns; commits aba82d7, 6ddb85c, b4c3052 (och sammanhangets 564d067) finns i historiken.
