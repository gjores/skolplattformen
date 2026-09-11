---
phase: 01-baslinje-och-avskild-pilotmilj
plan: 05
subsystem: database
tags: [supabase, postgres, pgtap, docker, revoke, default-privileges, storage, isolation]

# Dependency graph
requires:
  - phase: 01-01
    provides: taggen fas1-baslinje med exakt sex migrationer (baseline-målets kedja)
provides:
  - Två disponibla lokala Supabase-mål (baseline 553xx, protected 563xx) med egna projekt-ID, portar, volymer och manifest under work/pilot/targets/
  - Målskydd assertTarget() som vägrar molnvariabler, --linked/--db-url, okända mål och icke-loopback-manifest
  - Karantänmigration 20260911120000_quarantine_demo_access.sql som stänger klientrollernas rättigheter i public och Storage-policyerna för tillstand
  - pgTAP-prov (52 assertioner) av effektiva rättigheter, körda mot protected-målet med All tests successful
  - Fixturer för protected (gammal anonym HM-profil, provkonto, Karantänskolan, fil i bucket tillstand)
affects: [01-06, 01-08, 01-10, fas 2 (öppna verifierade åtkomstvägar)]

# Tech tracking
tech-stack:
  added: [pgTAP (extensions-schema, via supabase test db / pg_prove 3.36)]
  patterns: [workdir-per-mål med manifest.json, assertTarget() före varje prov, effektiva rättigheter provas med has_*_privilege + faktiska satser som klientroll]

key-files:
  created:
    - work/pilot/prepare-local.mjs
    - work/pilot/verify-target.mjs
    - work/pilot/targets/.gitignore
    - work/pilot/sql/protected-fixtures.sql
    - supabase/migrations/20260911120000_quarantine_demo_access.sql
    - supabase/tests/phase1_isolation.test.sql
    - work/pilot/results/sql-isolation.txt
  modified: []

key-decisions:
  - "CLI:ns versionscache <workdir>/supabase/.temp tas bort efter varje supabase-anrop i båda skripten, så att .temp aldrig finns i ett provmål"
  - "supabase_admins defaultprivilegier i public lämnas orörda: postgres saknar rätt att ändra dem (samma som i molnet) och de gäller bara objekt supabase_admin själv skapar; pgTAP F-provet bevisar att objekt skapade av migrationsrollen nekas"
  - "Timplanfixturen läggs som utkast, får celler och fastställs därefter, eftersom before-triggern guard_timplan_cells låser celler i en fastställd version"

patterns-established:
  - "Provmål: node work/pilot/prepare-local.mjs --target <mål> → manifest.json → assertTarget(<mål>) före varje potentiellt skrivande prov"
  - "Nekande bevisas som effektiv rättighet (has_*_privilege) plus faktisk sats med SQLSTATE 42501 plus oförändrat radantal"

requirements-completed: [BASE-02]

# Metrics
duration: 18min
completed: 2026-09-11
---

# Phase 01 Plan 05: Lokala provmål, databaskarantän och pgTAP-bevis Summary

**Två avskilda lokala Supabase-mål med målskydd, en karantänmigration som tar bort anon/authenticated/PUBLIC:s rättigheter på tabeller, sekvenser, funktioner, schema, framtida objekt och Storage-policyer, bevisad med 52 pgTAP-assertioner mot installerade rättigheter (All tests successful).**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-11T10:21:10Z
- **Completed:** 2026-09-11T10:38:37Z
- **Tasks:** 3 av 3
- **Files modified:** 7 skapade

## Docker-status och körmiljö

- Docker-daemonen svarade (`docker info` OK) vid start; ingen BLOCKED-väg behövde tas. Preflight med `open -a Docker` och 120 s pollning finns i skriptet men aktiverades inte.
- Supabase CLI 2.78.1, pg_prove 3.36 (bild hämtad vid första `test db`), psql-klient 14.15 mot lokal PG17. Inga `--linked`, molnnycklar eller `SUPABASE_ACCESS_TOKEN` användes.
- Båda målen lämnas igång för planerna 01-06/01-10. Stoppa med `node work/pilot/prepare-local.mjs --target <mål> --stop`.

## Valda portblock och migrationer per mål

| Mål | project_id | API | DB | Migrationer | Anonym inloggning | Källa |
|-----|-----------|-----|----|-------------|-------------------|-------|
| baseline | skolplattform-pilot-baseline | 127.0.0.1:55321 | 127.0.0.1:55322 | 6 | true | `git archive fas1-baslinje` (917313b) |
| protected | skolplattform-pilot-protected | 127.0.0.1:56321 | 127.0.0.1:56322 | 7 | false | arbetskopians `supabase/migrations/` + `supabase/tests/` |

Båda genererade config.toml har `[db.seed] enabled = false`, `[analytics] enabled = false`, `[edge_runtime] enabled = false`; studio, mailpit, imgproxy, edge-runtime, logflare, vector och supavisor startas inte.

## pgTAP-plan och resultat

`supabase --workdir work/pilot/targets/protected test db --local` → `All tests successful. Files=1, Tests=52, Result: PASS` (sparat i `work/pilot/results/sql-isolation.txt`, revision 6fc7796).

| Avsnitt | Prov | Vad som bevisas |
|---------|------|-----------------|
| A Schema | 4 | anon/authenticated saknar USAGE på public, service_role behåller, karantänmarkör satt |
| B Tabeller | 6 | ingen SELECT/INSERT/UPDATE/DELETE för klientroller på någon tabell/vy i public; ≥21 tabeller finns kvar |
| C Sekvenser | 1 | ingen USAGE |
| D Funktioner | 13 | bootstrap_demo_profile, copy_offering_cohort, appoint_school_principal, import_school_unit, current_organizer_id, current_app_role stängda för båda rollerna; alla sex finns kvar |
| E Alla funktioner | 1 | ingen EXECUTE i public för klientroller |
| F Framtida objekt | 8 | ny tabell/sekvens/funktion skapad som postgres nekas (defaultprivilegier) |
| G Storage | 3 | inga tillstand_*-policyer, bucket privat, filen bevarad |
| H Bevarade rader | 4 | gammal anonym HM-profil, demohuvudman, båda auth.users-raderna, Karantänskolan finns kvar |
| I Faktisk körning | 12 | som authenticated (sub = gamla anonyma identiteten) och anon kastar select/insert/RPC SQLSTATE 42501; radantal oförändrade efteråt |

Faktisk nekandekod var 42501 (insufficient_privilege) i samtliga fall; ingen justering av förväntad SQLSTATE behövdes.

## Tillägg i migrationen som pgTAP tvingade fram

Inga. Migrationen kördes som skriven i planen. Kontroll av `pg_default_acl` visade att `supabase_admin` också har defaultprivilegier i `public` (tabeller/sekvenser/funktioner till anon/authenticated). `postgres` får inte ändra dem (`permission denied to change default privileges`, prövat lokalt i en återrullad transaktion) och de gäller bara objekt som `supabase_admin` själv skapar — inte migrationer, som körs som `postgres`. F-provet bevisar utfallet för migrationsskapade objekt. Noteras som känd gräns för fas 2.

## Accomplishments

- `work/pilot/prepare-local.mjs` (366 rader): Docker-preflight, portblock med ledighetskontroll, genererad config.toml per mål, `git archive`-kedja för baseline, `db reset --local --no-seed`, manifest, fixturer för protected, `--fresh`/`--stop`/`--exclude-extra`.
- `work/pilot/verify-target.mjs`: `assertTarget()` som modul och CLI; exit 0/1/3. Verifierat: OK från projektroten och från `web/`, `SUPABASE_ACCESS_TOKEN=x` → exit 1, `--linked` → exit 1, okänt mål → exit 1, oförberett mål → exit 3.
- Karantänmigration utan `delete`/`truncate`/`drop table`/`drop function`; `obj_description('public')` börjar med `fas1-karantan`.
- Fixturerna är idempotenta (körda två gånger utan fel).

## Task Commits

1. **Task 1: prepare-local.mjs och verify-target.mjs** - `4fa1610` (feat)
2. **Task 2: Karantänmigration 20260911120000_quarantine_demo_access.sql** - `6fc7796` (feat)
3. **Task 3: pgTAP-prov phase1_isolation.test.sql** - `1876887` (test)

## Files Created/Modified

- `work/pilot/prepare-local.mjs` - skapar/startar/återställer/stoppar lokala mål och skriver manifest
- `work/pilot/verify-target.mjs` - målskydd (`assertTarget`) före varje prov
- `work/pilot/targets/.gitignore` - `*` + `!.gitignore`; workdirs och manifest spåras aldrig
- `work/pilot/sql/protected-fixtures.sql` - kända rader för negativa prov
- `supabase/migrations/20260911120000_quarantine_demo_access.sql` - karantänen
- `supabase/tests/phase1_isolation.test.sql` - 52 pgTAP-prov
- `work/pilot/results/sql-isolation.txt` - körresultat med datum, migrationsantal och revision

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CLI:ns `.temp`-cache i målets workdir**
- **Found during:** Task 1 (verifieringskommandot kräver `! test -e <workdir>/supabase/.temp`)
- **Issue:** Supabase CLI skriver `supabase/.temp/cli-latest` (versionskontroll-cache) i workdir vid varje anrop, även `status`.
- **Fix:** Båda skripten tar bort `<workdir>/supabase/.temp` efter varje CLI-anrop. Rotens `supabase/.temp` kopieras aldrig.
- **Files modified:** work/pilot/prepare-local.mjs, work/pilot/verify-target.mjs
- **Commit:** 4fa1610

**2. [Rule 1 - Bug] Timplanfixtur mot before-trigger**
- **Found during:** Task 1 (läsning av `guard_timplan_cells`)
- **Issue:** Celler kan inte skrivas i en fastställd timplan, och `on conflict do nothing` hjälper inte eftersom before-triggern kastar före konfliktkontrollen.
- **Fix:** Timplanen läggs som utkast, cellen skrivs villkorat (`where not exists`), därefter `update … set status = 'faststalld'`.
- **Files modified:** work/pilot/sql/protected-fixtures.sql
- **Commit:** 4fa1610

**3. [Rule 1 - Bug] `like` är inte en pgTAP-funktion**
- **Found during:** Task 3 (första körningen gav `function like(text, unknown, unknown) does not exist`)
- **Fix:** `alike(...)` för karantänmarkören.
- **Commit:** 1876887

### Övrigt

- Portblockets reservsteg följer planens exempel (554xx/564xx, dvs. nästa hundratal), inte texten "+1000" som skulle kollidera med det andra målets block.
- Testfilen har 52 prov i stället för planens skiss (ytterligare uttryckliga tabellprov, funktionerna-finns-kvar, båda auth.users-raderna, "ingen dold skrivning"-kontroller). Inget prov togs bort.

## Known Stubs

Inga. `work/pilot/targets/` innehåller genererade workdirs och manifest (gitignorerade, maskinspecifika); de är avsedda körtidsartefakter, inte platshållare.

## Kvarstående för senare planer

- API-vägen (PostgREST, GoTrue, Storage via HTTP) provas i plan 01-06 med samma manifest.
- `supabase_admin`s defaultprivilegier i `public` kan inte ändras av migrationsrollen; fas 2 bör beakta det om objekt någonsin skapas som `supabase_admin`.
- Kravstatus för BASE-02 i REQUIREMENTS.md ändras först av plan 01-09 efter mänsklig kontrollpunkt.

## Self-Check: PASSED
