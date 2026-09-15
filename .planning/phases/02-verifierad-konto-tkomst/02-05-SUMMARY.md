---
phase: 02-verifierad-konto-tkomst
plan: 05
subsystem: database
tags: [postgres, supabase, rls, pgtap, access-control, audit-log]

requires:
  - phase: 02-verifierad-konto-tkomst
    provides: Skyddad Worker, serverlagrade sessioner och verifierat Keycloak-flöde från plan 02-01–02-04
provides:
  - Kundbundna uppdrag med funktion, giltighet och organisations-/skolenhetskontext
  - Kundisolerade inbjudningar, registeruppslag och append-only säkerhetslogg
  - Serverstyrda aktörsfält och databaskontrollerade kontextbindningar
  - Förlustfri uppgradering från fas 1 med stängd demokund
affects: [02-06, behorighetsvaxling, leverantorsdrift, sakerhetsgranskning]

tech-stack:
  added: []
  patterns: [serverstyrda GUC-kontexter, sammansatta FK-bindningar, append-only trigger, isolerad upgrade-verifiering]

key-files:
  created:
    - supabase/migrations/20260913200000_phase2_access_model.sql
    - supabase/tests/phase2_audit.test.sql
  modified:
    - work/pilot/sql/phase2-fixtures.sql
    - work/pilot/sql/protected-fixtures.sql
    - supabase/tests/phase1_isolation.test.sql
    - supabase/tests/phase2_access.test.sql
    - work/pilot/prepare-local.mjs
    - work/pilot/results/isolation.json
    - work/pilot/results/spike.json

key-decisions:
  - "Varje huvudman får en egen kund utifrån organizer.id; namnlika huvudmän sammanförs aldrig."
  - "Serveraktören hämtas från transaktionslokala verifierade JWT-claims via public.current_actor_auth_user_id(), eftersom Worker inte äger Supabases auth-schema."
  - "Registersnapshotar utan entydigt huvudmannaurspung lämnas NULL och blir oåtkomliga i stället för att gissas eller raderas."

patterns-established:
  - "Serverkontext: Worker sätter kund, huvudman, funktion, identitet och verifierade claims transaktionslokalt innan RLS-skyddat arbete."
  - "Förlustfri migration: fas 1-schema och fixturer installeras först, därefter körs fas 2 som en verklig uppgradering."
  - "Audit: databastriggers skriver aktör och roll och security_events kan varken uppdateras eller raderas."

requirements-completed: [IAM-03, ACL-01, AUDIT-01]

duration: 28min
completed: 2026-09-15
---

# Phase 2 Plan 5: Kundbunden åtkomstmodell och säkerhetslogg Summary

**Postgresmodell med tidsbegränsade uppdrag, kundisolerad RLS, oföränderlig säkerhetslogg och serververifierade aktörer, uppgraderad utan att befintliga rader raderades**

## Performance

- **Duration:** 28 min
- **Started:** 2026-09-15T06:37:27Z
- **Completed:** 2026-09-15T07:05:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Införde `access_assignments`, `invitations`, `security_events` och `denial_buckets` med kundbindning, giltighetsdatum, korsobjektskontroller och RLS för Worker.
- Backfillade tre befintliga huvudmän utan dataförlust. Demohuvudmannen hamnade i den stängda kunden `20000000-0000-4000-8000-0000000000de`, medan två namnlika huvudmän fick två skilda kunder.
- Gjorde `security_events` oföränderlig även för tabellägaren och lät händelsetriggers ersätta klientskickad aktör och roll med serverkontext.
- Tog bort `bootstrap_demo_profile`, stängde klientåtkomst till de nya tabellerna och gjorde tvetydiga registersnapshotar oåtkomliga utan att radera dem.
- Verifierade 12 daterade uppdrag, 58 nekade klientoperationer utan ändrade rader, 137 pgTAP-assertioner och fem kompletta skyddade webbläsarflöden.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration — uppdrag, inbjudan, säkerhetslogg, kundkoppling och aktörstriggers** - `61ad1c8` (feat)
2. **Task 2: Daterade uppdragsfixturer och fas 1-regression** - `399f5ea` (feat)
3. **Task 3: Kundisolering, append-only audit och serverstyrda aktörer i pgTAP** - `22b90c8` (test)

**Plan corrections:** `339a663` (fix: repeterbar IdP- och sessionstestmiljö)

## Files Created/Modified

- `supabase/migrations/20260913200000_phase2_access_model.sql` - Datamodell, backfill, RLS, grants, kontexthjälpare, integritetskontroller och aktörstriggers.
- `work/pilot/sql/phase2-fixtures.sql` - Tolv daterade uppdrag för de två syntetiska kunderna.
- `work/pilot/sql/protected-fixtures.sql` - Förmigrationsrader som bevisar separat kundbackfill och tvetydig registerproveniens.
- `supabase/tests/phase1_isolation.test.sql` - 52 uppdaterade fas 1-regressionsassertioner efter avsiktligt borttagen demofunktion.
- `supabase/tests/phase2_access.test.sql` - 66 assert för uppdragsgiltighet, kundisolering, bindningar och klientkarantän.
- `supabase/tests/phase2_audit.test.sql` - 19 assert för append-only-logg, aktörstriggers, granskarvy och nekandeaggregering.
- `work/pilot/prepare-local.mjs` - Målskyddad fas 1→fas 2-uppgradering, säkert undertryckt CLI-utdata och konsekvent IdP-återanvändning.
- `work/pilot/results/isolation.json` - Godkänt API-isoleringsprov med 58 nekade operationer och oförändrade rader.
- `work/pilot/results/spike.json` - Godkänt skyddat OIDC/TOTP-regressionsprov efter migrationen.

## Decisions Made

- Kundbackfill utgår från huvudmannens ID och skapar en separat kund per huvudman. Visningsnamnet används aldrig för identitet eller sammanfogning.
- `current_actor_auth_user_id()` läser en verifierad `sub` från Workerns transaktionslokala JWT-claims. Detta undviker en otillåten beroendekedja till Supabases separat ägda `auth`-schema och behåller servern som ensam källa till aktören.
- Registersnapshotar backfillas bara när en skolenehetskod pekar entydigt på en huvudman. Tvetydiga historiska rader finns kvar med `organizer_id = NULL` och exponeras inte av RLS.
- Vanlig lösenordsinloggning med `acr=1` och `amr=pwd` behandlas fortsatt inte som administrativ MFA. Den här planen bygger data- och logggrunden; `requireMfa` fortsätter att styra skyddade administrativa flöden.

## Verification

- `node work/pilot/prepare-local.mjs --target protected --with-idp --fresh` — PASS, endast det isolerade loopback-målet `supabase_db_skolplattform-pilot-protected`, 9 migrationer.
- Förmigrationskontroll och efterkontroll — alla 3 huvudmän och den befintliga profilraden bevarade; 0 huvudmän utan kund; namnlika huvudmän hade 2 skilda kund-ID; tvetydig snapshot låg kvar utan huvudmannakoppling.
- `node work/pilot/verify-isolation.mjs` med projektets Node 25 i målkonfiguration utan extern IdP — PASS, 58 nekade och 0 tillåtna klientoperationer, oförändrade radantal.
- `node work/pilot/run-sql-tests.mjs` efter slutlig IdP-återställning — PASS, 3 filer och 137 tester (52 + 66 + 19).
- `npm run e2e:protected` — PASS, 5/5 skyddade browserprov inklusive TOTP, identitetsregistrering, spärr, utloggning vid IdP-avbrott och manipulerade callbacks.
- Efter pgTAP-rollback: 12 uppdrag kvar och inga testskapade audit- eller organisationshändelser kvar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rättade fas 1-kolumnnamnet för skolenhetskod**
- **Found during:** Task 1
- **Issue:** Den första migrationen refererade till `school_units.unit_code`, medan det verifierade schemat använder `school_units.code`.
- **Fix:** Bytte backfillfrågan till den faktiska kolumnen.
- **Files modified:** `supabase/migrations/20260913200000_phase2_access_model.sql`
- **Verification:** Full uppgradering med 9 migrationer passerade.
- **Committed in:** `61ad1c8`

**2. [Rule 2 - Missing Critical] Gjorde aktörsuppslag möjligt för den begränsade Workern**
- **Found during:** Task 1
- **Issue:** Den lokala migrationsrollen kunde inte ge Worker åtkomst till Supabases `auth`-schema, så direkt `auth.uid()` gav `permission denied for schema auth`.
- **Fix:** Lade till `public.current_actor_auth_user_id()` som läser verifierade JWT-claims från serverns transaktionslokala GUC och använde den i aktörstriggers och serverfunktioner.
- **Files modified:** `supabase/migrations/20260913200000_phase2_access_model.sql`
- **Verification:** Rullat Worker-anrop skrev exakt verifierad aktör och rollen `huvudman`; auditproven bevisade att klientvärden skrivs över.
- **Committed in:** `61ad1c8`

**3. [Rule 2 - Security] Undertryckte CLI-utdata som kunde visa lokala nycklar**
- **Found during:** Task 2
- **Issue:** `supabase start` skrev tillfälliga lokala API- och lagringsnycklar i terminalutdata vid konfigurationsbyte.
- **Fix:** Fångade startkommandots utdata och publicerade bara mål, port och migrationssammanfattning.
- **Files modified:** `work/pilot/prepare-local.mjs`
- **Verification:** Nästa omstart visade inga nycklar; inga hemligheter finns i Git.
- **Committed in:** `399f5ea`

**4. [Rule 1 - Test correctness] Anpassade borttagen demofunktions förväntade klientfel**
- **Found during:** Task 2
- **Issue:** Den karantänlagda `public`-schemagränsen ger `42501` innan PostgreSQL gör funktionsuppslag, inte planens `42883`.
- **Fix:** Behöll katalogassertionerna som bevisar fysisk frånvaro och lät klientprovet förvänta schemats tidigare nekande.
- **Files modified:** `supabase/tests/phase1_isolation.test.sql`
- **Verification:** Fas 1-regressionen passerade 52/52.
- **Committed in:** `399f5ea`

**5. [Rule 3 - Blocking] Kör API-isolering med projektets stödda Node-version**
- **Found during:** Task 2
- **Issue:** Systemets Node 20 saknade den WebSocket-implementation som provet kräver.
- **Fix:** Körde verifieringen med projektets Node 25 enligt `engines`-kravet.
- **Files modified:** Inga källfiler.
- **Verification:** 58/58 operationer nekades och radantal förblev oförändrade.
- **Committed in:** N/A

**6. [Rule 3 - Blocking] Återskapa IdP när privata uppgifter inte kan återanvändas**
- **Found during:** Övergripande regression efter Task 3
- **Issue:** En körning utan IdP kunde ersätta manifestet medan den gamla Keycloak-containern låg kvar; nästa IdP-körning skapade nya hemligheter men återanvände den gamla realmen.
- **Fix:** `prepare-local` återimporterar realmen när manifestet saknar en fullständig återanvändbar IdP-uppsättning.
- **Files modified:** `work/pilot/prepare-local.mjs`
- **Verification:** Ny isolerad IdP-start gav korrekt issuer och browserproven passerade 5/5.
- **Committed in:** `339a663`

**7. [Rule 1 - Test isolation] Avgränsade sessionsassertioner till egna fixturer**
- **Found during:** Övergripande regression efter Task 3
- **Issue:** Browserprovet lämnade giltiga kundsessioner, och pgTAP räknade dem tillsammans med sina egna två provsessioner.
- **Fix:** Identifierade testets egna rader med deras deterministiska `token_hash` i läs-, update- och oförändradhetsassertionerna.
- **Files modified:** `supabase/tests/phase2_access.test.sql`
- **Verification:** Full pgTAP passerade 137/137 efter browserkörningen.
- **Committed in:** `339a663`

---

**Total deviations:** 7 auto-fixed (3 bugs/test correctness, 2 missing critical/security, 2 blocking)
**Impact on plan:** Rättningarna krävdes för säker serveraktör, hemlighetsfri verifieringsutdata och repeterbara regressionsprov. Datamodellens beslut och leveransomfattning ändrades inte.

## Issues Encountered

- Isoleringsprovet måste köras utan extern IdP-konfiguration eftersom dess äldre e-postinloggningsfixtur avsiktligt är avstängd i den slutliga IdP-konfigurationen. Samma mål, databas och nio migrationer användes; därefter återställdes IdP-konfigurationen och både pgTAP och det skyddade browserflödet kördes igen.
- En avbruten preview lämnade privata byggrestfiler utan lyssnande process. Restfilerna togs bort och nästa server skapade dem på nytt med aktuellt manifest.

## Known Stubs

None - inga tomma datakällor, platshållare eller uppskjutna implementationsstubbar infördes.

## User Setup Required

None - all verifiering använder den isolerade lokala provmiljön och syntetiska data.

## Next Phase Readiness

- Plan 02-06 kan använda `access_assignments`, serverns GUC-kontext och append-only-loggen för verklig kontextväxling och nekandeloggning.
- Ingen verklig kommun- eller elevregisteranslutning har verifierats; denna leverans gäller den lokala skyddade provmiljön.

## Self-Check: PASSED

- Samtliga nio skapade eller ändrade filer finns.
- Commits `61ad1c8`, `399f5ea`, `22b90c8` och `339a663` finns i Git-historiken.
- Inga spårade filer raderades av planens commits.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-15*
