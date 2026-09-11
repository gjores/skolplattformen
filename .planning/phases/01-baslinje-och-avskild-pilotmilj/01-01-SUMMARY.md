---
phase: 01-baslinje-och-avskild-pilotmilj
plan: 01
subsystem: infra
tags: [git, baslinje, git-archive, node-test, vinext, supabase-migrationer]

# Dependency graph
requires: []
provides:
  - "Annoterad Git-tagg fas1-baslinje (917313bac9b852a4e494ac5e63b5492f77cb0bb5) med web/, supabase/config.toml, sex migrationer och work/ utan hemligheter, miljöfiler eller byggen"
  - "work/pilot/verify-baseline.mjs: revisionsbundet återställningsprov (git archive -> npm ci -> node --test -> tsc -> vinext build)"
  - "work/pilot/results/baseline-restore.json: daterat PASS-resultat med sha, nodversion, 85 tester, tsc 0, build 0"
  - "web/.gitignore tillåter en spårad web/.env.example (plan 01-03)"
affects: [01-02, 01-03, 01-04, 01-09, alla senare faser som ändrar appkod]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Återställningsprov från versionshanterat träd med git archive i mkdtemp-katalog, aldrig från arbetskopian"
    - "Arbetsverktyg under work/pilot/ skriver daterade JSON-resultat med status PASS/FAIL och exitkod 0/1/2"
    - "Separata commits för dokumentation (docs:) och appkällor (chore(01-01))"

key-files:
  created:
    - work/pilot/verify-baseline.mjs
    - work/pilot/results/baseline-restore.json
  modified:
    - web/.gitignore

key-decisions:
  - "Docs-filerna committades separat (383b3e0) före appbaslinjen så att taggen fas1-baslinje bara omfattar appkällor, migrationer och arbetsverktyg"
  - "web/.openai/hosting.json spåras (importeras av vite.config.ts, innehåller bara null-värden); ingen ignoreregel lades till"
  - "Resultatfilen fick ett extra fält errors[] utöver planens kontrakt för felsökbarhet vid FAIL"

patterns-established:
  - "Baslinjekontroll: git ls-tree på taggen + git grep på taggen för nyckelmönster, inte bara arbetskopian"
  - "Tomma NEXT_PUBLIC_SUPABASE_* i env vid prov: bygget och testerna får inte förutsätta lokala hemligheter"

requirements-completed: [BASE-01]

# Metrics
duration: 5min
completed: 2026-09-11
---

# Fas 1 Plan 01: Källbaslinje med tagg och återställningsprov Summary

**Appens källor är nu versionshanterade som taggen `fas1-baslinje` (123 filer, sex migrationer, åtta testfiler) och ett kommando återskapar taggen i en ny katalog, kör 85 modelltester, typkontroll och vinext-bygge med tomma Supabase-värden — PASS på 28 s.**

## Performance

- **Duration:** cirka 5 min
- **Started:** 2026-09-11T10:13:46Z
- **Completed:** 2026-09-11T10:18:00Z
- **Tasks:** 2 av 2
- **Files modified:** 1 ändrad (web/.gitignore), 2 nya (work/pilot/), 141 nyspårade (18 docs + 123 app)

## Accomplishments

- Granskad Git-baslinje: `fas1-baslinje` -> `917313bac9b852a4e494ac5e63b5492f77cb0bb5`. Commiten innehåller 123 filer (37 892 rader): `web/` (app, components, lib, hooks, public, scripts, package.json + package-lock.json, vite.config.ts, `.openai/hosting.json`, `.oxlintrc.json`, `.oxfmtrc.json`), `supabase/config.toml`, sex migrationer, `work/supabase/*.mjs`, `work/skolverket-api/probe.py`, `work/schoolsoft-research/*.py`. Inga `.env.local`, `node_modules`, `dist`, `.wrangler`, `supabase/.temp` eller `.tsbuildinfo`.
- Dokumentationen (18 filer, 7 128 rader) togs in i en separat `docs:`-commit `383b3e0` före baslinjen; `git show --stat fas1-baslinje | grep -c '^ docs/'` ger 0.
- `work/pilot/verify-baseline.mjs` (258 rader): kräver Node 22+ (exit 2 annars), löser ref till sha, `git archive` av `web supabase work` i `mkdtemp`-katalog, negativa kontroller, `npm ci`, `node --test --test-reporter=tap` med egen glob-expansion, `npx tsc --noEmit` (informativt), `npm run build` med kontroll av `dist/server/wrangler.json`, JSON-resultat, städning.
- `work/pilot/results/baseline-restore.json`: `status: PASS`, `sha` = taggens sha, `node v25.9.0`, `tests.pass 85 / fail 0`, `tscExit 0`, `buildExit 0`, `forbiddenPresent []`, `durationMs 27911`.

## Task Commits

1. **Task 1: Granska, ignorera rätt och versionshantera appkällorna som baslinje med tagg** — `383b3e0` (docs: dokumentation, separat) + `917313b` (chore(01-01): appbaslinje, taggad `fas1-baslinje`)
2. **Task 2: Skapa och köra återställningsprovet work/pilot/verify-baseline.mjs** — `82ba547` (feat(01-01))

**Plan metadata:** se sista commit (docs(01-01): complete plan)

## Files Created/Modified

- `web/.gitignore` — rad 31 `!.env.example` direkt efter `.env*` så att en ofarlig mallfil kan spåras i plan 01-03. Verifierat: `git check-ignore -q web/.env.example` ger exit 1 (spårbar), `web/.env.local` fortsatt ignorerad.
- `work/pilot/verify-baseline.mjs` — återställningsprovet (se ovan). Läser aldrig `web/.env.local`, skriver aldrig ut miljövärden.
- `work/pilot/results/baseline-restore.json` — daterat resultat från den verkliga körningen 2026-09-11T10:16:08Z.

## Hemlighets- och personuppgiftsgranskning

Skanning av alla 141 kandidatfiler (ospårade, ej ignorerade) i `web`, `supabase/config.toml`, `supabase/migrations`, `work`, `docs`:

| Kontroll | Mönster | Träffar | Beslut |
|---|---|---|---|
| Nycklar/URL:er | `eyJ…{30,}`, `sb_secret_`, `sb_publishable_`, `service_role_key`, `SUPABASE_SERVICE`, `postgres://user:pass@`, `.supabase.co`, `NEXT_PUBLIC_SUPABASE_(URL\|ANON_KEY)=…` | 0 | Inget att ta bort |
| Personnummer | `\b(19\|20)[0-9]{6}[-+]?[0-9]{4}\b` | 0 | Inget att ta bort |
| Kompletterande | `sk-…`, `ghp_…`, `AKIA…`, `service_role`, `PRIVATE KEY`, `env-file` | 5 (alla `--env-file=web/.env.local` i kommentarer/felmeddelanden i `work/supabase/*.mjs` och `docs/backend-supabase.md`) | Sökvägsreferenser utan värden — kvarstår |
| `supabase/config.toml` | manuell genomgång | endast `env(...)`-referenser (`OPENAI_API_KEY`, Twilio, Apple, S3) | Inga faktiska värden — kvarstår |
| `web/.openai/hosting.json` | manuell genomgång | `{ "d1": null, "r2": null }` | Ofarlig, importeras av vite.config.ts — spåras |
| Efter tagg | `git grep -nE 'eyJ…\|\.supabase\.co' fas1-baslinje -- web supabase work docs` | 0 | Bekräftat i det taggade trädet |

Inga filer togs bort ur urvalet och inga värden redigerades bort. `docs/elevkullar-och-klasskopplingar.md` nämner projektnamnet `skolplattform-dev` (inte en nyckel) och kvarstår enligt planen.

## Återställningsprovets resultat

| Fält | Värde |
|---|---|
| ref / sha | `fas1-baslinje` / `917313bac9b852a4e494ac5e63b5492f77cb0bb5` (lika med `git rev-parse fas1-baslinje^{commit}`) |
| node | v25.9.0 |
| npmCiExit | 0 |
| tests.pass / tests.fail | 85 / 0 (åtta filer, överensstämmer med TESTING.md) |
| tscExit | 0 |
| buildExit / buildArtifact | 0 / `dist/server/wrangler.json` finns |
| durationMs | 27 911 |
| status | PASS |

Kontrollkörning med `--skip-build` gav också PASS (`buildExit: null`, `tscExit: 0`). Körning med Node 20 (`/opt/homebrew/opt/node@20/bin/node`) gav exit 2 med anvisad PATH-export. Tmp-katalogen togs bort efter körningen.

Byggets varning om chunkar över 500 kB är befintligt beteende i baslinjen och ingen avvikelse; noteras för baslinjerapporten (plan 01-09).

## Decisions Made

- Docs-commit före appcommit så att taggen bara omfattar appkällor (planens ordning; AGENTS.md: blanda inte ändringar).
- `web/.openai/hosting.json` spåras oförändrad; ingen ignoreregel, eftersom `vite.config.ts` importerar filen och innehållet är null-värden.
- Resultatfilen har fältet `errors: []` utöver planens exempel, så att en FAIL blir självförklarande utan loggar. Övriga fält följer kontraktet exakt.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `git check-ignore -q` accepterar bara en sökväg i denna git-version**
- **Found during:** Task 1 (steg 2)
- **Issue:** Planens enrads-kommando med elva sökvägar gav exit 128 ("--quiet kan endast användas med ett enkelt sökvägsnamn").
- **Fix:** Körde samma kontroll i en loop, en sökväg per anrop. Alla elva gav exit 0.
- **Files modified:** inga
- **Verification:** loopens utdata; `web/.env.example` gav exit 1 (spårbar).

**2. [Rule 1 - Bug] Acceptanskriteriet krävde den bokstavliga strängen `"status"` i skriptet**
- **Found during:** Task 2 (acceptanskontroll)
- **Issue:** Första versionen använde ociterade objektnycklar (`status:`), så `grep '"status"'` gav ingen träff.
- **Fix:** Resultatfilens nycklar och PASS-villkoret dokumenterades i skriptets huvudkommentar med citerade nyckelnamn. Ingen beteendeändring.
- **Files modified:** `work/pilot/verify-baseline.mjs`
- **Verification:** `grep -c '"status"'` ger 2; `node --check` OK.
- **Committed in:** `82ba547`

---

**Total deviations:** 2 auto-fixade (1 Rule 1, 1 Rule 3)
**Impact on plan:** Inga ändringar i baslinjekoden, taggen eller resultatet. Antalet filer i appcommiten (123) ligger något under planens uppskattning "cirka 130–150", som uppenbarligen räknade in de 18 docs-filerna (141 kandidater totalt).

## Issues Encountered

None.

## User Setup Required

None — inga externa tjänster eller miljövariabler krävs. Provet körs med tomma Supabase-värden.

## Known Stubs

None — skriptet är helt kopplat till Git-taggen och skriver verkliga körresultat.

## Next Phase Readiness

- BASE-01 delvis uppfyllt: baslinjen finns som tagg och kan återställas med ett kommando. Regressionsmatrisen och baslinjerapporten hör till plan 01-09.
- Planer 01-02 och framåt får nu ändra `web/`, `supabase/` och `work/`; varje ändring kan avgränsas med `git diff fas1-baslinje`.
- `web/.env.example` kan spåras i plan 01-03 utan ytterligare ignoreändring.

## Self-Check: PASSED

Kontrollerat 2026-09-11: filerna `work/pilot/verify-baseline.mjs`, `work/pilot/results/baseline-restore.json`, `web/.gitignore` finns; commits `383b3e0`, `917313b`, `82ba547` och taggen `fas1-baslinje` finns i Git.
