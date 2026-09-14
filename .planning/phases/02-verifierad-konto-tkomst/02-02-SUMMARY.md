---
phase: 02-verifierad-konto-tkomst
plan: 02
subsystem: database-access
tags: [postgresql, rls, pgtap, identity, sessions, tenant-isolation]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Avskilt protected-mål, lokal Keycloak och målskyddad SQL-körare"
provides:
  - "Dedikerad skolplattform_worker med LOGIN, NOBYPASSRLS och utan DELETE på kärntabeller"
  - "Kund-, identitets-, medlemskaps- och appsessionstabeller med transaktionslokal RLS-kontext"
  - "Två syntetiska kunder, tio externa identiteter och tio medlemskap"
  - "40 pgTAP-prov för worker, klientkarantän, kundisolering och bevarade fas 1-rader"
affects: [02-03, 02-04, 02-05, 02-06, 02-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extern identitet är unik på issuer och subject; e-post och auth_user_id ger inget mandat"
    - "Worker-kontext sätts i lokala GUC:er och RLS begränsar vald kund som andra säkerhetslinje"
    - "Serverlagrade cookiehashar, spärrstatus och återkallelsetid ersätter behörighetsbeslut i token"

key-files:
  created:
    - supabase/migrations/20260913100000_phase2_worker_core.sql
    - work/pilot/sql/phase2-fixtures.sql
    - supabase/tests/phase2_access.test.sql
  modified: []

key-decisions:
  - "Kundadministrativ identitetsläsning kräver både vald kund och serverns app.access_function; övriga funktioner ser bara egen identitet"
  - "Kundadministratören kan läsa och återkalla sessioner endast när sessionens medlemskap hör till vald kund"
  - "FORCE RLS används inte på kärntabellerna eftersom postgres behöver lägga syntetiska fixturer; den separata worker-rollen omfattas av RLS"

patterns-established:
  - "RLS-testning görs med set local role skolplattform_worker och transaktionslokala app.*-värden"
  - "Fixturidentiteter speglar Keycloaks fasta subject men skapar inga inloggningskonton"

requirements-completed: [IAM-05, ACL-01]

# Metrics
duration: 8min
completed: 2026-09-14
---

# Fas 2 Plan 02: Workerns identitets- och sessionsgrund Summary

**Protected-databasen har nu en RLS-bunden Worker-roll, stabil extern identitet via `issuer + subject`, serverlagrade medlemskap och sessioner samt körbara prov som skiljer Provkund A från Provkund B.**

## Performance

- **Duration:** cirka 8 min
- **Started:** 2026-09-14T19:37:19Z
- **Completed:** 2026-09-14T19:44:40Z
- **Tasks:** 3 av 3
- **Files created:** 3

## Accomplishments

- Migration 8 installerar `skolplattform_worker` med `LOGIN`, `NOBYPASSRLS` och utan superuser- eller DELETE-rättighet. Fyra kärntabeller har RLS och klientrollerna `anon` och `authenticated` är fortsatt stängda.
- En person identifieras av unik kombination `issuer + subject`. `auth_user_id`, e-post och visningsnamn är referens- eller visningsfält och ger inget medlemskap eller mandat.
- Spärr av medlemskap och återkallelse av session är serverlagrade rader. Kundadministratörens sessionsåtkomst begränsas till medlemskap i vald kund.
- Syntetiska fixturer ger 2 kunder, 10 identiteter och 10 medlemskap. Två identiteter delar e-post utan att slås ihop; Erik saknar medlemskap och Hanna har medlemskap i båda kunderna.
- Hela pgTAP-körningen gav `Files=2, Tests=92, All tests successful`: fas 1:s 52 prov och fas 2:s 40 nya prov.

## Task Commits

1. **Task 1: Worker-roll, kärntabeller, kontexthjälpare och RLS** — `cba9a5e` (feat)
2. **Task 2: Två provkunder, identiteter och medlemskap** — `455aa81` (feat)
3. **Task 3: pgTAP för grants, RLS och kundisolering** — `1fd5e13` (test)

**Plan metadata:** denna SUMMARY committas separat efter självkontroll.

## Files Created/Modified

- `supabase/migrations/20260913100000_phase2_worker_core.sql` — Worker-roll, kontexthjälpare, fyra kärntabeller, grants och elva RLS-policyer.
- `work/pilot/sql/phase2-fixtures.sql` — idempotenta kunder, Keycloak-identiteter och medlemskap för det lokala protected-målet.
- `supabase/tests/phase2_access.test.sql` — 40 assertions för rollrättigheter, klientkarantän, kundisolering, loginfas, administrativa vyer, sessionsåterkallelse och bevarade rader.

## Decisions Made

- Den bindande preciseringen om kundadministratör och granskare genomfördes med `app.access_function`. RLS kombinerar den serververifierade funktionen med `app.customer_id`; vanlig kundkontext öppnar inte andra identiteter.
- Loginpolicyn tillåter identitets- och sessionsskapande före medlemskap, men endast när servern uttryckligen sätter `app.phase = login`. Kommande callback-frågor måste fortfarande filtrera på verifierad identitet eller tokenhash.
- Tabellägaren postgres får lägga fixturer utan FORCE RLS. Det ger ingen genväg för appen, vars databasanslutning ska använda den separat testade Worker-rollen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rättade datamodifierande pgTAP-frågor**
- **Found during:** Task 3
- **Issue:** Första testversionen lade en `UPDATE`-CTE inuti argumentet till `is()`, vilket PostgreSQL nekade eftersom en datamodifierande CTE måste vara på toppnivå.
- **Fix:** Ersatte de tre fallen med pgTAP `results_eq`, som både utför UPDATE på toppnivå och bevisar exakt antal returnerade rader.
- **Files modified:** `supabase/tests/phase2_access.test.sql`
- **Verification:** hela sviten passerade med 92/92 prov.
- **Committed in:** `1fd5e13`

---

**Total deviations:** 1 auto-fixad (Rule 1)
**Impact on plan:** Endast testsyntax ändrades; åtkomstkontrakt och produktomfattning är oförändrade.

## Issues Encountered

- Direkt lokal databasåtkomst kräver Dockeråtkomst utanför filsystemssandlådan. Alla skrivningar och kontroller riktades mot manifestverifierade `protected` på loopback; inget moln- eller baseline-mål användes.

## User Setup Required

Ingen ytterligare inställning krävs efter den redan genomförda `/etc/hosts`-konfigurationen från plan 02-01. Docker Desktop måste vara igång när protected-målet används.

## Known Stubs

- `app_sessions.assignment_id` saknar avsiktligt främmande nyckel i denna plan. `access_assignments` skapas och nyckeln kopplas i plan 02-05 enligt den granskade fasplanen.
- Proof-kolumnerna lagrar ännu inga verkliga verifieringsbevis. Plan 02-03 skriver verifierad OIDC-proveniens och plan 02-06 bedömer den mot aktuell serverprofil.

## Verification

- `prepare-local --target protected` installerade exakt 8 migrationer och bevarade 1 profil samt 1 huvudman från fas 1.
- Databasrollen rapporterade `LOGIN=true`, `BYPASSRLS=false`, `SUPERUSER=false`.
- Fixturfilen kördes två gånger utan fel och stannade på 2 kunder, 10 identiteter och 10 medlemskap.
- pgTAP: `phase1_isolation` 52/52 och `phase2_access` 40/40, totalt 92/92 PASS.
- Efter rollback: 10 identiteter, 0 provsessioner och Davids medlemskap fortsatt `active`.
- Katalogkontroll: 4 av 4 kärntabeller har RLS och 11 policyer är installerade.
- Planstruktur och `git diff --check`: PASS.

## Next Phase Readiness

- Plan 02-03 kan nu använda Worker-kontot och tabellerna för OIDC-callback, sessionscookie och serverstyrd kontext.
- Plan 02-05 kompletterar medlemskapen med tidsbegränsade uppdrag och kopplar `assignment_id` till `access_assignments`.
- Proven gäller endast syntetiska data i lokal protected-miljö. De utgör ingen verklig kommunanslutning eller BankID-verifiering.

## Self-Check: PASSED

Kontrollerat 2026-09-14: alla tre skapade filer finns; commits `cba9a5e`, `455aa81` och `1fd5e13` finns i Git; assertionantalet är 40 och SUMMARY-filen klarar `git diff --check`.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-14*
