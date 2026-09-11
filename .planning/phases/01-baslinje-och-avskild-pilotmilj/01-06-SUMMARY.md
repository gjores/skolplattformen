---
phase: 01-baslinje-och-avskild-pilotmilj
plan: 06
subsystem: testing
tags: [supabase, postgrest, gotrue, storage, pg_graphql, jwt, isolation, regression, cohorts, class_timplans]

# Dependency graph
requires:
  - phase: 01-05
    provides: lokala provmål baseline/protected med manifest, assertTarget(), karantänmigration och fixturer
provides:
  - work/pilot/verify-isolation.mjs — negativa API-prov (REST, RPC, Auth, Storage, GraphQL) med tre identiteter mot protected-målet och rad-/filkontroll före/efter
  - work/pilot/verify-baseline-db.mjs — fyra positiva regressionsflöden med riktiga skrivningar mot baseline-målet, egna fixturer och städning
  - work/pilot/results/isolation.json (PASS, 58 nekade, 0 tillåtna, rader oförändrade)
  - work/pilot/results/baseline-db.json (4/4 flöden PASS, 6 migrationer, baselineRef 917313b)
affects: [01-09 (baslinjerapport), 01-10, fas 2 (öppna verifierade åtkomstvägar)]

# Tech tracking
tech-stack:
  added: []
  patterns: [supabase-js lånas via createRequire från web/node_modules utan att importera appens klientlager, mintad HS256-JWT med målets lokala jwt_secret för att spela en tidigare anonym identitet, nekande = fel/tomt svar + oförändrad ögonblicksbild via psql]

key-files:
  created:
    - work/pilot/verify-isolation.mjs
    - work/pilot/verify-baseline-db.mjs
    - work/pilot/results/isolation.json
    - work/pilot/results/baseline-db.json
  modified: []

key-decisions:
  - "Signup-provanvändaren (ny@example.test) är skriptets egen fixtur och tas bort som postgres före ögonblicksbilden efteråt; det är den enda avsiktliga skrivningen i isolationsprovet och redovisas som INFO-post"
  - "Baseline-provets anonyma sessionsanvändare lämnas kvar i det disponibla målet: den refereras av organisation_events (kopieringens händelselogg) och loggrader raderas inte av ett prov"
  - "Storage-uppladdningen skickas som application/pdf så att nekandet kommer från RLS (new row violates row-level security policy) och inte från bucketens MIME-filter"

patterns-established:
  - "Negativt API-prov: judge() kräver error != null (eller tom lista) OCH inga data; detail anger vilket, aldrig nycklar/JWT/lösenord"
  - "Positivt baslinjeprov: flow() registrerar PASS/FAIL med detail, aldrig dolt; städning i finally av exakt de skolenheter som skapades"

requirements-completed: [BASE-02, BASE-01]

# Metrics
duration: 25min
completed: 2026-09-11
---

# Phase 01 Plan 06: API-avskiljning och positiva baslinjeflöden Summary

**Karantänen nekar oinloggad anon, en tidigare anonym HM-profil (mintad JWT) och ett provkonto samtliga 18 skyddade operationer via REST, RPC, Storage och GraphQL (58 DENIED, 0 ALLOWED, rader/filer oförändrade), medan de fyra baslinjeflödena (utbildning + kurs/nivå, fristående kullkopia, fast klass–timplansversion, grundskoletimplan) passerar med riktiga skrivningar i baseline-målet.**

## Performance

- **Duration:** ca 25 min aktiv tid (task 1: 10:42–10:44Z commit; task 2: 21:15–21:28Z). Däremellan var körningen avbruten och Docker Desktop nedstängd; båda målen var igång igen när arbetet återupptogs och behövde inte startas om.
- **Started:** 2026-09-11T10:42:24Z
- **Completed:** 2026-09-11T21:28:46Z
- **Tasks:** 2 av 2
- **Files modified:** 4 skapade

## Docker och mål

Docker svarade vid båda arbetspassen. `verify-target.mjs --target protected|baseline` gav OK (API 127.0.0.1:56321 respektive 55321). Inget BLOCKED behövde rapporteras. Efter Docker-omstarten kördes isolationsprovet på nytt mot det levande protected-målet med identiskt resultat (PASS, 58 nekade) — bara datum, signup-användarens UUID och revisionsfältet skilde, så den committade resultatfilen behölls.

## Isolationsprov (BASE-02) — work/pilot/results/isolation.json

Mål: skolplattform-pilot-protected, 7 migrationer. 61 poster i `checks`: 58 DENIED, 3 INFO, 0 ALLOWED. `unchanged: true`.

| Identitet | Poster | Nekade | Nekandeform |
|-----------|--------|--------|-------------|
| anon (oinloggad) | 18 + signInAnonymously | 19 | REST/RPC: SQLSTATE 42501 `permission denied for schema public`; Storage list/remove: tomt svar; download: `Object not found`; upload: `new row violates row-level security policy`; GraphQL: `Unknown field "school_unitsCollection" on type Query` |
| gammalAnonym (mintad JWT, sub …0a01, is_anonymous true, HM-profil finns) | 18 | 18 | samma som ovan — 42501, inte JWT-fel, vilket visar att tokenen godtogs som `authenticated` och därefter nekades av karantänen |
| provkonto (signInWithPassword lyckades, INFO) | 18 | 18 | samma som ovan |
| nyAnvandare (signUp lyckades, INFO) | 2 | 2 | REST 42501, GraphQL okänt fält |
| kontroll | 1 | 1 | karantan-prov.txt kvar, ingen intrang.txt |

Operationer per identitet: school_units select/insert/update/delete, profiles/registry_snapshots/timplan_cells select, RPC bootstrap_demo_profile, current_organizer_id, current_app_role, copy_offering_cohort, appoint_school_principal, import_school_unit, Storage list/download/upload/remove i bucket tillstand, GraphQL school_unitsCollection.

Anonym inloggning: `auth.signInAnonymously` → DENIED, 422 `Anonymous sign-ins are disabled`.

Ögonblicksbild före = efter: profiles 1, school_units 1, offerings 1, class_timplans 0, storage tillstand 1, auth.users 2, profiles-md5 oförändrad.

Inga ALLOWED — ingen migrationsändring behövdes. `mv manifest.json …; node verify-isolation.mjs` → `BLOCKED: målet protected är inte förberett`, exit 3. Resultatfilen innehåller ingen JWT (`eyJ…`), inget lösenord och inte `service_role`.

## Baslinjeflöden (BASE-01) — work/pilot/results/baseline-db.json

Mål: skolplattform-pilot-baseline, 6 migrationer, baselineRef 917313bac9b852a4e494ac5e63b5492f77cb0bb5 (taggen fas1-baslinje). Inloggning som den gamla appen (signInAnonymously + bootstrap_demo_profile), tillåtet enbart här enligt D-08.

| Flöde | Status | Belägg |
|-------|--------|--------|
| utbildning-och-kurs-niva | PASS | gymnasieutbildning SA25/SASAP, poängplan v1 ENGE3000X → tillägg HIST3000X ger 2 nivåer vid omläsning; fastställd med decided_on; ändring av fastställd plan nekas (`En fastställd poängplan ändras inte`), specialization kvar |
| kullkopiering-fristaende | PASS | copy_offering_cohort(…, 2027) → cohort `Elever som börjar HT 2027`, status planerad, poängplan utkast med decided_on null och samma nivåer, timplan utkast med samma celler; dubblett → /redan/, 2026 → /efter/; källans celler och status oförändrade; 0 class_timplans |
| klass-timplan-fast-version | PASS | SA27A/2027 mot utkast → /fastställd/; efter beslut sparad (ar1), ak8 → /årskurs/, ar2 uppdaterar; annan skolenhet → /annan skolenhet/; timplan satt till ersatt → kopplingen behåller samma timplan_id; borttagning → 0 rader |
| grundskola-timplan | PASS | grundskoleutbildning åk 1–9 utan poängplan, timplan fastställd; 4A/2026 kopplad till ak4; ar1 → /årskurs/ |

Städning: 3 tillfälliga skolenheter borttagna; `select count(*) … where name like 'Tillfällig kontroll%'` = 0.

## Task Commits

1. **Task 1: verify-isolation.mjs — negativa API-prov** - `519a6ac` (test)
2. **Task 2: verify-baseline-db.mjs — positiva baslinjeflöden** - `db7776b` (test)

## Files Created/Modified

- `work/pilot/verify-isolation.mjs` (324 rader) — tre identiteter, 18 operationer var, signInAnonymously/signUp, psql-ögonblicksbild före/efter, resultat utan hemligheter
- `work/pilot/verify-baseline-db.mjs` (273 rader) — fyra flöden med node:assert/strict, egna fixturer, städning i finally
- `work/pilot/results/isolation.json` — `kind: api-isolation`, status PASS
- `work/pilot/results/baseline-db.json` — `kind: baseline-db`, status PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Signup-provanvändaren skulle ha ändrat auth.users-räkningen**
- **Found during:** Task 1 (planens steg 5 och 6 motsäger varandra när signup är öppen: signUp lyckas och skapar en auth.users-rad, men rowsBefore ska vara lika med rowsAfter)
- **Fix:** Skriptet förstädar `ny@example.test` före ögonblicksbilden och tar bort den självskapade signup-användaren som postgres efter läsproven, redovisat som INFO-post `städning auth.users (postgres)`. Det är den enda avsiktliga skrivningen i provet och gäller bara skriptets egen fixtur.
- **Files modified:** work/pilot/verify-isolation.mjs
- **Commit:** 519a6ac

**2. [Rule 1 - Bug] Egen tilläggsstädning i baseline-provet föll på främmande nyckel**
- **Found during:** Task 2 (första körningen: alla fyra flöden PASS, men skriptets extra borttagning av sessionens anonyma auth-användare gav `organisation_events_actor_fkey`)
- **Fix:** Steget togs bort — det stod inte i planen, och loggrader ska inte raderas av ett prov. Sessionsanvändaren lämnas kvar i det disponibla målet (återställs med `prepare-local.mjs --fresh`). Omkörning: PASS 4/4, exit 0.
- **Files modified:** work/pilot/verify-baseline-db.mjs
- **Commit:** db7776b

### Övrigt

- `appoint_school_principal` anropas med `{ school_id, principal_name }` som planen anger; funktionens signatur är `(uuid, uuid, text)` med defaultvärden, så anropet är giltigt och nekas ändå med 42501.
- Storage-uppladdningen skickas med `application/pdf` (bucketens enda tillåtna MIME-typ) så att nekandet bevisligen kommer från RLS, inte från MIME-filtret.
- Utöver planens 45-poster-minimum finns även kontrollposter för ny signup-användare (REST + GraphQL) och en slutkontroll av Storage-filerna.

## Known Stubs

Inga.

## Kvarstående för senare planer

- Kravstatus för BASE-01/BASE-02 i REQUIREMENTS.md ändras först av plan 01-09 efter mänsklig kontrollpunkt.
- Resultaten är körda mot de lokala målen med revision 3acf443 (isolation, före task 1-committen) respektive 519a6ac (baseline-db); baslinjerapporten (01-09) ska hänvisa till dessa filer.
- Baseline-målet ackumulerar en anonym demoprofil per körning av verify-baseline-db.mjs; `node work/pilot/prepare-local.mjs --target baseline --fresh` återställer.

## Self-Check: PASSED
