# Baslinje för den befintliga appen

**Datum:** 2026-09-12
**Revision:** 564d067 (arbetsträdet vid skrivning; den fulla kontrollkörningen nedan gjordes på revision 7d289d5 med CSS-rättningen i arbetsträdet, som därefter committades som 564d067)
**Baslinjetagg:** fas1-baslinje (917313bac9b852a4e494ac5e63b5492f77cb0bb5)
**Provmiljöer:** exempelläge i minnet (dator/telefon), lokalt baseline-mål (6 migrationer), lokalt protected-mål (7 migrationer)

Rapporten redovisar vad som faktiskt har prövats i fas 1, på vilken revision, i vilken miljö och med vilket utfall. Den skiljer aktuella bevis (resultatmatrisen) från äldre körningar (historik) och räknar inga kända fel som godkänd funktion. Resultatfilerna under `work/pilot/results/` är den primära källan; siffror och revisioner i matrisen är hämtade därifrån, inte ur minnet.

## Återgång till baslinjen

Baslinjen är den annoterade Git-taggen `fas1-baslinje` (commit `917313b`). Den omfattar `web/` (app, komponenter, modeller, skript, `package.json` + `package-lock.json`), `supabase/config.toml`, sex migrationer och `work/` — 123 filer utan `.env.local`, `node_modules`, `dist`, byggen eller nycklar.

Tre sätt att återgå:

```bash
# 1. Läs baslinjen i den befintliga arbetskopian (detached HEAD; gå tillbaka med git switch -)
git checkout fas1-baslinje

# 2. Öppna baslinjen i en separat katalog bredvid projektet
git worktree add ../skolplattform-baslinje fas1-baslinje

# 3. Återställningsprov: arkivera taggen i en tmp-katalog, npm ci, modelltester, typkontroll och bygge
export PATH="/opt/homebrew/opt/node@25/bin:$PATH"
node work/pilot/verify-baseline.mjs          # skriver work/pilot/results/baseline-restore.json
node work/pilot/verify-baseline.mjs --skip-build   # snabbare, utan vinext-bygge
```

Vad som **inte** ingår i en återgång:

- `web/.env.local`, byggkataloger (`dist/`, `.wrangler/`) och `node_modules/` — de är lokala och ignorerade. Återställningsprovet kör med tomma `NEXT_PUBLIC_SUPABASE_*`-värden och förutsätter inga nycklar.
- De lokala databasmålen under `work/pilot/targets/` (gitignorerade, maskinspecifika). De återskapas med `node work/pilot/prepare-local.mjs --target baseline|protected` (kräver Docker).
- **Demoåtkomst öppnas inte av en återgång.** Karantänmigrationen `20260911120000_quarantine_demo_access.sql` finns bara i protected-målets migrationskedja (7 migrationer). Baseline-målet (6 migrationer) är ett disponibelt lokalt mål med den gamla appens beteende och används enbart för de positiva regressionsflödena. Den gamla molndemon är orörd: dess installerade tillstånd har inte inspekterats, inte ändrats och är inte verifierat i fas 1.

Kända egenskaper i baslinjen som inte är avvikelser: bygget varnar för chunkar över 500 kB; modellsviten på taggen är 85 tester i åtta filer.

## Resultatmatris

Lager: **modell** = `node:test` mot `web/lib/*-model.ts`; **databas** = riktiga skrivningar mot lokalt Supabase-mål; **browser** = Playwright mot egen dev-/preview-server; **transport** = riktiga lagerfunktioner mot fake-PostgREST i minnet; **restore/SQL/API** enligt kolumnen Kommando. Alla kommandon i `web/` förutsätter `export PATH="/opt/homebrew/opt/node@25/bin:$PATH"`; kommandon i `work/pilot/` körs från projektroten.

Den fulla körningen `npm run verify:phase1` (12 steg, 52,9 s) gjordes 2026-09-11T22:08Z på revision 7d289d5 med rättningen av `.og-unit-switch` i arbetsträdet (committad som 564d067). Totalstatus **PASS**: 11 PASS, 1 KNOWN-ISSUE (sparordning), 1 SKIPPED (återställning, kräver `--with-restore`). Belägg: `work/pilot/results/phase1-summary.json`.

| # | Flöde | Skolform | Lager | Provmiljö | Revision | Datum | Kommando | Förväntat | Faktiskt | Belägg |
|---|-------|----------|-------|-----------|----------|-------|----------|-----------|----------|--------|
| 1a | Gymnasieutbildning skapas | Gymnasium | modell | node:test i minnet | 7d289d5 | 2026-09-11T22:08Z | `node --test lib/organisation-model.test.mjs` (ingår i steget `modeller`, 11 filer, 108 prov) | utbildning med program/inriktning skapas, poängplan följer | PASS | `work/pilot/results/phase1-summary.json` steg `modeller`; `web/lib/organisation-model.test.mjs` |
| 1b | Gymnasieutbildning skapas | Gymnasium | databas | baseline-mål, 6 migrationer | 7d289d5 | 2026-09-11T22:08Z | `node work/pilot/verify-baseline-db.mjs` flöde `utbildning-och-kurs-niva` | SA25/SASAP skapas, poängplan v1 läses tillbaka | PASS | `work/pilot/results/baseline-db.json` flows[0] |
| 1c | Gymnasieutbildning skapas | Gymnasium | browser | dev:example:test 5191, Chrome 1440×900 + iPhone 13/WebKit | 7d289d5 | 2026-09-11T22:07Z | `npx playwright test` — `phase1-baseline.spec.ts` test 3 | `Lägg till utbildning` → raden listas som Planerad | PASS (desktop + phone) | `work/pilot/results/phase1-summary.json` steg `browser`; `web/e2e/phase1-baseline.spec.ts` |
| 2a | Kurs-/nivåtillägg i poängplan | Gymnasium | modell | node:test i minnet | 7d289d5 | 2026-09-11T22:08Z | `node --test lib/organisation-model.test.mjs` | nivå läggs till i utkast, fastställd plan ändras inte | PASS | `work/pilot/results/phase1-summary.json` steg `modeller`; `web/lib/organisation-model.test.mjs` |
| 2b | Kurs-/nivåtillägg i poängplan | Gymnasium | databas | baseline-mål | 7d289d5 | 2026-09-11T22:08Z | `verify-baseline-db.mjs` flöde `utbildning-och-kurs-niva` | HIST3000X läggs till (2 nivåer vid omläsning); fastställd nekas | PASS — `En fastställd poängplan ändras inte` | `work/pilot/results/baseline-db.json` flows[0] |
| 2c | Kurs-/nivåtillägg i poängplan | Gymnasium | browser | dev:example:test 5191 | 7d289d5 | 2026-09-11T22:07Z | `phase1-baseline.spec.ts` test 4 | kryssruta i utkastet ändrar raden `Summa` | PASS (desktop + phone) | `web/e2e/phase1-baseline.spec.ts`; `work/pilot/results/phase1-summary.json` |
| 3a | Kopiering till ny elevkull | Gymnasium | modell | node:test i minnet | 7d289d5 | 2026-09-11T22:08Z | `node --test lib/cohort-model.test.mjs` | kopia är oberoende, källan orörd | PASS | `web/lib/cohort-model.test.mjs`; `work/pilot/results/phase1-summary.json` steg `modeller` |
| 3b | Kopiering till ny elevkull | Gymnasium | databas | baseline-mål | 7d289d5 | 2026-09-11T22:08Z | `verify-baseline-db.mjs` flöde `kullkopiering-fristaende` | HT 2027 planerad, poängplan/timplan som utkast, dubblett/tidigare kull nekas, 0 klasskopplingar | PASS | `work/pilot/results/baseline-db.json` flows[1] |
| 3c | Kopiering till ny elevkull | Gymnasium | browser | dev:example:test 5191 | 7d289d5 | 2026-09-11T22:07Z | `phase1-baseline.spec.ts` test 5 | ny rad `Elever som börjar HT 2027` Planerad/Utkast v1; original Aktiv | PASS (desktop + phone) | `web/e2e/phase1-baseline.spec.ts`; `work/pilot/results/phase1-summary.json` |
| 4a | Klass–timplanskoppling, fast version | Gymnasium | modell | node:test i minnet | 7d289d5 | 2026-09-11T22:08Z | `node --test lib/cohort-model.test.mjs` | koppling pekar på fastställd version och flyttas inte | PASS | `web/lib/cohort-model.test.mjs`; `work/pilot/results/phase1-summary.json` steg `modeller` |
| 4b | Klass–timplanskoppling, fast version | Gymnasium | databas | baseline-mål | 7d289d5 | 2026-09-11T22:08Z | `verify-baseline-db.mjs` flöde `klass-timplan-fast-version` | nekas före beslut, sparas efter, annan skolenhet nekas, ersatt version behåller timplan_id | PASS | `work/pilot/results/baseline-db.json` flows[2] |
| 4c | Klass–timplanskoppling, fast version | Gymnasium | browser | dev:example:test 5191 | 7d289d5 | 2026-09-11T22:07Z | `phase1-baseline.spec.ts` test 6 | `Koppla klass` SA26A → Version 1; `Ny version` (v2) flyttar inte kopplingen | PASS (desktop + phone) | `web/e2e/phase1-baseline.spec.ts`; `work/pilot/results/phase1-summary.json` |
| 5a | Grundskolans planflöde | Grundskola | modell | node:test i minnet | 7d289d5 | 2026-09-11T22:08Z | `node --test lib/timplan-model.test.mjs` | stadie-timmar och versioner enligt modellregler | PASS | `web/lib/timplan-model.test.mjs`; `work/pilot/results/phase1-summary.json` steg `modeller` |
| 5b | Grundskolans planflöde | Grundskola | databas | baseline-mål | 7d289d5 | 2026-09-11T22:08Z | `verify-baseline-db.mjs` flöde `grundskola-timplan` | utbildning åk 1–9 utan poängplan, fastställd timplan, 4A kopplad till ak4, ar1 nekas | PASS | `work/pilot/results/baseline-db.json` flows[3] |
| 5c | Grundskolans planflöde | Grundskola | browser | dev:example:test 5191 | 7d289d5 | 2026-09-11T22:07Z | `phase1-baseline.spec.ts` test 7 | Matematik-cell i utkast v2 kan sättas till 123 | PASS (desktop + phone) | `web/e2e/phase1-baseline.spec.ts`; `work/pilot/results/phase1-summary.json` |
| 6 | Skolbyte bevarar ändring / omläsning börjar om | Båda | browser | dev:example:test 5191 | 7d289d5 | 2026-09-11T22:07Z | `phase1-baseline.spec.ts` test 7–8 | 123 kvar efter byte GR→GY→GR; borta efter `reload`; inget `Sparat i databasen`/`Sparar…` | PASS (desktop + phone) | `web/e2e/phase1-baseline.spec.ts`; `work/pilot/results/phase1-summary.json` |
| 7 | Källbaslinje återställs | — | restore | tmp-katalog ur `git archive fas1-baslinje`, tom Supabase-miljö | 917313b | 2026-09-11T10:16Z | `node work/pilot/verify-baseline.mjs` | npm ci, 85 modelltester, tsc 0, bygge 0 | PASS (85/0, tscExit 0, buildExit 0, 27,9 s). Steget `återställning` i verify:phase1 var SKIPPED (kräver `--with-restore`) | `work/pilot/results/baseline-restore.json` |
| 8 | Karantän: installerade rättigheter | — | SQL (pgTAP) | protected-mål, 7 migrationer, 127.0.0.1:56321 | 6fc7796 (omkörd på 7d289d5 i verify:phase1) | 2026-09-11T10:38Z / 22:08Z | `supabase --workdir work/pilot/targets/protected test db --local` | anon/authenticated/PUBLIC saknar rättigheter i public, Storage-policyer borta, rader bevarade | PASS — `All tests successful`, Tests=52 | `work/pilot/results/sql-isolation.txt`; `phase1-summary.json` steg `sql-karantän`; `supabase/tests/phase1_isolation.test.sql` |
| 9 | Karantän: API-väg, tre identiteter | — | API | protected-mål, 7 migrationer | 7d289d5 | 2026-09-11T22:08Z | `node work/pilot/verify-isolation.mjs` | anon, gammal anonym HM-profil (mintad JWT) och provkonto nekas i REST/RPC/Storage/GraphQL; anonym inloggning av; rader oförändrade | PASS — 58 DENIED, 0 ALLOWED, 3 INFO, `unchanged: true` | `work/pilot/results/isolation.json` |
| 10 | Byggd exempelvy/blockerad start utan backend-anrop | — | browser | dev:blocked:test 5192 + preview:example 3011 (byggt paket) | 7d289d5 | 2026-09-11T22:07Z | `npx playwright test` — `phase1-isolation.spec.ts` (3 prov, projekt `blocked` + `built`) | blockerad start visar bara `Arbetsytan är inte tillgänglig ännu`; byggd vy gör inga anrop till främmande värd/`/auth/v1/`/`/rest/v1/`/`/rpc/`, inga `sb-`-nycklar; `build-mode.json` mode example | PASS (3/3) | `web/e2e/phase1-isolation.spec.ts`; `work/pilot/results/phase1-summary.json` steg `browser` |
| 11 | Konkurrerande sparningar (samma cell) | — | transport | fake-PostgREST i minnet, riktiga `persistTimplans`/`loadTimplans`, första upsert fördröjd 150 ms | 7d289d5 | 2026-09-11T22:08Z | `node --test lib/save-order.repro.mjs` (steget `sparordning`, ej obligatoriskt) | senaste inmatning (200) finns i lagret | KNOWN-ISSUE (röd som väntat): lagret har 100, omläsning ger 100 — äldre sparning vinner | `web/lib/save-order.repro.mjs`; `work/pilot/results/phase1-summary.json` `knownIssues[0]` |
| 12 | Redigering direkt efter skapande (lokalt id) | — | transport | samma fil, scenario 2, FK-emulering 23503 | 7d289d5 | 2026-09-11T22:08Z | `node --test lib/save-order.repro.mjs` | andra sparningen använder lagrets id, ändringen 30 når lagret | KNOWN-ISSUE (röd som väntat): skrivning mot modellens id avvisas av FK, `Kunde inte spara timplanens timmar` | `web/lib/save-order.repro.mjs`; `work/pilot/results/phase1-summary.json` `knownIssues[0]` |
| 13 | Pekytor 44 px, 320 px, tangentbord/fokus, skolföljande Elever-vy | Båda | browser | dev:example:test 5191, iPhone 13/WebKit + Chrome | 7d289d5 (+ CSS-rättning, committad 564d067) | 2026-09-11T22:07Z | `phase1-baseline.spec.ts` test 9–12 | alla ändrade kontroller ≥ 44 px på telefon; `scrollWidth ≤ 321` vid 320 px; Escape återför fokus; 4A/7B vs SA26A/EK26A | PASS efter rättning av `.og-unit-switch` (`appearance:none` + egen pil). Före rättningen mätte WebKit 358×26 px och provet var rött (körning på 7c7c760, totalstatus FAIL). Fysisk telefon: väntar på checkpoint | `web/e2e/phase1-baseline.spec.ts`; `work/pilot/results/phase1-summary.json`; `.planning/phases/01-baslinje-och-avskild-pilotmilj/deferred-items.md` |

Browserkörningens lokala rapport `web/test-results/phase1-e2e.json` (ignorerad i Git) visar för samma körning `expected 26, skipped 1, unexpected 0` — det överhoppade provet är pekyteprovet i projektet `desktop`, som avsiktligt bara mäts på telefon.

Inget steg var BLOCKED i den fulla körningen: Docker-daemonen svarade och båda målen var igång. Utan Docker rapporterar `verify:phase1` stegen 7–11 som BLOCKED (exit 3), aldrig PASS; det kontrollerades i plan 01-10 genom att tillfälligt flytta protected-målets manifest.

## Historik (inte aktuella bevis)

- `docs/granskning-2026-09-07.md` — bygg-, databas- och webbläsarprov 2026-09-07 mot den gemensamma molndemon, utan Git-historik. Fynden P1 (äldre sparning vinner) och P2 (förslag efter import, skolval återställs efter sparning) är alltjämt relevanta som beskrivning av felen, men körningarna är inte bevis.
- `docs/elevkullar-och-klasskopplingar.md` — 80 modelltester och `work/supabase/verify-cohorts.mjs` mot Supabase-projektet `skolplattform-dev` 2026-09-08. Skriptet importerar den nu borttagna `signInDemo` och är märkt som historik i `work/supabase/README.md`.
- Kodkartans 85 modelltester 2026-09-11 (`.planning/codebase/TESTING.md`, Node 24) — samma svit som återställningsprovet kör på taggen, men körningen i kartan gjordes på ett arbetsträd utan Git-baslinje.

Dessa körningar avser äldre revisioner och en gemensam molndemo. De ersätts av matrisen ovan och används inte som bevis för aktuell kod.

## Kända fel och ägarskap

| Fel | Belägg | Status | Ägare | Stoppvillkor |
|-----|--------|--------|-------|--------------|
| Äldre timplanssparning vinner över senaste inmatning (`persistTimplans` upsert utan versionsvillkor; `runTimplan`/`runLasar` startar parallella skrivningar och applicerar omläsning ovillkorligt) | `web/lib/save-order.repro.mjs` scenario 1 (röd, 100 vinner över 200); `.planning/codebase/CONCERNS.md` § Known Bugs; `docs/granskning-2026-09-07.md` P1 | KNOWN-ISSUE | Fas 5 (bevarade planeringsflöden, ADMIN-04) | Beständig timplans-/läsårsredigering öppnas inte i skyddat läge förrän reproduceraren är grön; när den blir grön flyttas den in i den ordinarie sviten som regressionsprov |
| Redigering direkt efter skapande kan använda lokalt id (andra sparningen skriver `timplan_cells` mot modellens id, inte lagrets) | `web/lib/save-order.repro.mjs` scenario 2 (röd, FK 23503 avvisar skrivningen) | KNOWN-ISSUE | Fas 5 (ADMIN-04) | Samma villkor: ingen beständig redigering i skyddat läge förrän id-mappningen är rättad och reproduceraren grön |
| Sammanhängande skrivningar utan transaktion (`decidePointPlan` ersätter gällande version före fastställande och händelselogg; timplan/läsår sparar innehåll, status och historik i fristående anrop) | `.planning/codebase/CONCERNS.md` § Tech Debt; `web/lib/organisation-store.ts`, `web/lib/planning-store.ts` | DOKUMENTERAD RISK | Fas 3 (skyddade datavägar) för mandatkontroll och transaktion i databasfunktioner | Inga nya flerstegsskrivningar i klienten; befintliga öppnas inte mot skyddade mål förrän de ligger i avgränsade databasfunktioner |
| Tysta fel i `logEvent` (kontrollerar inte `error`) och `saveGrades` (kontrollerar inte uppdateringen av utbildningarnas årskurser) | `.planning/codebase/CONCERNS.md` § Tech Debt | DOKUMENTERAD RISK | Fas 2 (AUDIT-01) | Serverstyrd händelselogg ersätter klientloggning; klientens felresultat behandlas uttryckligen innan skyddade skrivvägar öppnas |
| Hårdkodade texter i sidomenyn och Elever-vyns kontextrad (**Testskolan**, **Alex Lind**, `Grundskola & gymnasium · … ändringar gäller denna session`) oavsett vald exempelskola; React-varningar om saknad `key` i `OrganisationWorkspace`/`TimplanView` | `.planning/phases/01-baslinje-och-avskild-pilotmilj/deferred-items.md` (01-07, 01-08, 01-10) | UPPSKJUTET UI-FYND | Nästa UI-plan (fas 2 eller senare UI-arbete) | Påverkar inga provresultat och ingen skyddsgräns; rättas innan provmiljön visas för en pilotpartner |

Inget av felen ovan räknas som godkänd funktion. Raderna 11–12 i matrisen står som KNOWN-ISSUE just därför; `verify:phase1` ger PASS trots dem eftersom steget `sparordning` är icke-obligatoriskt och listas separat under `knownIssues`, aldrig som PASS.

## Vad som inte är verifierat

- **Molndemons faktiska installerade tillstånd.** Inte inspekterat, inte ändrat. Karantänmigrationen är bara bevisad mot det lokala protected-målet; att molndemons installerade rättigheter (bootstrap, grants, anonym inloggning) motsvarar Git är inte visat.
- **Fysisk telefon.** Pekytor, 320 px och avgränsad tabellrullning är bevisade med iPhone 13-emulering i WebKit, inte på en verklig enhet över LAN. Det ingår i checkpointen i plan 01-09 och står som `väntar på checkpoint` i `01-VALIDATION.md` tills användaren bekräftat.
- **Skyddad kontoåtkomst.** Fas 1 skapar ingen Supabase-klient i appen (`hasBackend` är konstant false). Inloggning, mandat och öppnade datavägar hör till fas 2–3.
- **Verklig kommunanslutning, verklig pilotvolym och verkliga elevuppgifter.** Provmiljöns organisation och 24 elever är syntetiska exempel (se `docs/pilot/connection-profile.md`, öppna beroenden OB-01–OB-08). Inget i fas 1 påstår en säker pilot.
- **Återställningsprovet inom `verify:phase1`.** Steget `återställning` kördes bara fristående i plan 01-01 (`baseline-restore.json`); den fulla körningen gjordes utan `--with-restore`.
