---
phase: 02-verifierad-konto-tkomst
plan: 06
subsystem: auth
tags: [authorization, mfa, postgres, rls, audit-log, csrf, context-epoch]

requires:
  - phase: 02-verifierad-konto-tkomst
    provides: Serverlagrade sessioner, lokal Keycloak-profil och kundbunden åtkomstmodell från plan 02-01–02-05
provides:
  - Transaktionell auktorisation mot låst session, medlemskap, uppdrag och kund
  - Profilbunden MFA-prövning som nekar lösenordsinloggning och okänd proveniens
  - Uppdragslista och kontextbyte med sessionsbunden epok
  - Serverhärledd säkerhetslogg med minimerad proof-proveniens och flödningsskydd
affects: [02-07, 02-08, 02-09, 02-10, administrativa-routes, sakerhetsgranskning]

tech-stack:
  added: []
  patterns: [live-auktorisation-i-transaktion, profilbunden-mfa, sessionsbunden-kontextepok, atomisk-audit, aggregerade-nekanden]

key-files:
  created:
    - web/lib/access-rules.ts
    - web/lib/auth-assurance.ts
    - web/lib/server/authz.ts
    - web/lib/server/events.ts
    - web/app/api/context/route.ts
  modified:
    - web/lib/server/db.ts
    - web/lib/server/http.ts
    - web/lib/server/session.ts
    - web/app/api/session/route.ts
    - web/app/api/kund/oversikt/route.ts
    - web/app/api/auth/callback/route.ts
    - web/app/api/auth/logout/route.ts
    - supabase/migrations/20260913200000_phase2_access_model.sql

key-decisions:
  - "Vanlig lokal inloggning med acr=1 och amr=[pwd] räknas aldrig som administrativ MFA; endast exakt lokal issuer, klient, audience, profil, version, anspråkskombination och färsk auth_time godtas."
  - "Kundkontext härleds först ur identitetens egen medlemskaps- eller uppdragsrad och används därefter för en exakt låst omprövning under RLS."
  - "Step-up binds till oförändrad session, identitet, kund, medlemskap, uppdrag och epok; personidentitetsnivå och underskrift förblir unknown."
  - "Klient-IP härleds endast från verifierbar Cloudflare-ingress eller lokal fallback; godtyckligt X-Forwarded-For används inte som säkerhetskälla."

patterns-established:
  - "Skyddad route: requireContext är en hint; withSessionContext låser och härleder all verksamhetskontext på nytt innan funktions- och MFA-prövning."
  - "Mutation och security_events-rad ligger i samma transaktion; saknad händelse eller loggfel rullar tillbaka verksamhetsändringen."
  - "Kontextbyte: session → identitetsägd kandidat → serverhärledd kund-GUC → medlemskap/uppdrag låses och prövas → epok höjs."

requirements-completed: [IAM-03, IAM-04, IAM-05, AUDIT-01]

duration: 30min
completed: 2026-09-17
---

# Phase 2 Plan 6: Transaktionell auktorisation, MFA och uppdragskontext Summary

**Låst live-auktorisation med exakt profilbunden MFA, sessionsbunden kontextepok och atomisk serveraudit för varje administrativ åtgärd**

## Performance

- **Duration:** 30 min
- **Started:** 2026-09-17T07:33:20Z
- **Completed:** 2026-09-17T08:03:05Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- Införde rena regler för uppdragsgiltighet, sortering, etiketter och epok samt en fail-closed MFA-bedömning. Lösenordsinloggning med `acr=1`/`amr=[pwd]` nekas alltid som administrativ MFA.
- Gjorde `protectedRoute` till gemensam serverväg för låst sessions-, medlemskaps-, kund- och uppdragsprövning, funktionskrav, MFA, epok, CSRF och audit i samma transaktion.
- Lade till identitetsfiltrerad uppdragslista, kontextbyte med epokhöjning och en skyddad kundöversikt som använder aktuell RLS-kontext.
- Band step-up till session, identitet, kund, medlemskap, uppdrag och epok. All proof-proveniens skapas på servern, minimeras och lämnar identitetsnivå och underskrift som `unknown`.
- Loggade inloggning, step-up, kontextbyte, utloggning och nekanden med korrelations-ID och faktisk sessionskontext; fler än 20 likadana nekanden per minut aggregeras.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests för uppdrag och MFA-proveniens** - `493379d` (test)
2. **Task 1 GREEN: Rena uppdrags- och MFA-regler** - `340bf26` (feat)
3. **Task 2: Live-auktorisation och atomisk audit** - `7f05491` (feat)
4. **Task 3: Uppdragslista, kontextbyte och auth-händelser** - `6f0a1c2` (feat)

## Files Created/Modified

- `web/lib/access-rules.ts` och `web/lib/access-rules.test.mjs` - Giltighet, grupper, sortering, etiketter, Stockholm-datum och epokregler.
- `web/lib/auth-assurance.ts` och `web/lib/auth-assurance.test.mjs` - Exakt profilbunden MFA-bedömning och minimerad serverskriven proof-proveniens.
- `web/lib/server/authz.ts` - Gemensam skyddad route med live-kontext, funktion, MFA, epok och CSRF.
- `web/lib/server/db.ts` - Gemensam låsordning och transaktionslokala GUC-värden härledda från databasen.
- `web/lib/server/events.ts` - Atomiska säkerhetshändelser, rekursiv allowlist och aggregerade nekanden.
- `web/lib/server/http.ts` - Nya felkoder och hashad ingressinformation utan rå IP.
- `web/app/api/session/route.ts` - Identitetsfiltrerad lista över giltiga, kommande och avslutade uppdrag samt serverbedömd MFA-status.
- `web/app/api/context/route.ts` - Same-origin-skyddat kontextbyte med existensdöljning, låsning, epokhöjning och audit.
- `web/app/api/kund/oversikt/route.ts` - Kundöversikt via `protectedRoute` och RLS-begränsade räkningar.
- `web/app/api/auth/callback/route.ts`, `web/app/api/auth/logout/route.ts` och `web/lib/server/session.ts` - Assignment-bunden session, låst step-up, återkallelse och audit.
- `supabase/migrations/20260913200000_phase2_access_model.sql` - Snäva RLS-läsvägar för huvudman/skolenhet som förekommer i identitetens egna uppdrag.

## Decisions Made

- Administrativ MFA kräver exakt den lokala Keycloak-profilens issuer, client ID, audience, profil-ID, profilversion, `acr`, hela `amr`-mängden och en färsk, icke framtida `auth_time`. Enstaka `otp` eller ett numeriskt `acr` räcker aldrig.
- Klientens cookie och request-body används bara för sessionsuppslag och val; behörighet, kund och uppdrag härleds på nytt från låsta databaserader för varje skyddat anrop.
- Ett gammalt `X-Context-Epoch` stoppar anropet med `409 context_changed`. Verksamhets-POST återspelas inte automatiskt.
- Audit innehåller endast allowlistad verksamhetsmetadata och serverbedömd proof. Token, cookie, lösenord, ID-token, e-post och elevnamn filtreras bort.

## Verification

- `node --test lib/*.test.mjs` — PASS, 139/139 prov.
- `npx tsc --noEmit` — PASS.
- `npx oxlint app lib scripts e2e` — PASS.
- `npm run build:protected` — PASS från commit `6f0a1c2`; endast befintliga Vite- och chunkstorleksvarningar.
- Verkliga curl-prov mot `dev:protected:test` och isolerad lokal DB — PASS: session 200 med två uppdrag, kontextbyte 200/epok 2, kundöversikt 200, gammal epok 409, främmande och obefintligt uppdrag 404 med samma svarsform, CSRF 403, kommande/avslutat uppdrag 403.
- Databasinspektion — PASS: `context_changed/ok` och `context/denied` hade svarens korrelations-ID och rätt aktör/kund/uppdrag; riktad logout hade full identitet, medlemskap, kund och uppdrag.
- `npm run e2e:protected` från slutlig byggd revision — PASS, 5/5 skyddade webbläsarflöden. Efter körningen fanns `login/ok=4`, `login/denied=6` och `logout/ok=2`.
- `node work/pilot/run-sql-tests.mjs` — PASS, Files=3 och Tests=137.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Lade till snäv metadata-RLS för egna uppdrag**
- **Found during:** Task 3 (uppdragslistan)
- **Issue:** Identiteten kunde läsa sitt uppdrag men saknade visningsnamn för den huvudman eller skolenhet som det egna uppdraget pekade på.
- **Fix:** Lade SELECT-policyer som endast släpper igenom `organizers` och `school_units` när en identitetsägd `access_assignment` refererar raden.
- **Files modified:** `supabase/migrations/20260913200000_phase2_access_model.sql`
- **Verification:** Fräsch 9-migrationsmiljö, sessionslistan med två kunder samt pgTAP 137/137 passerade.
- **Committed in:** `6f0a1c2`

**2. [Rule 1 - Security/Correctness] Rättade låsordning under kundscopad UPDATE-RLS**
- **Found during:** Task 3:s verkliga curl-prov
- **Issue:** `FOR UPDATE` krävde kundscopad UPDATE-policy innan kunden hade härletts, så identitetens eget uppdrag blev osynligt och kontextbyte gav felaktigt 404.
- **Fix:** Läser först identitetens egen medlemskaps- eller uppdragskandidat utan lås, sätter kund-GUC från den serververifierade raden och låser därefter exakt samma medlemskap/uppdrag för slutlig omprövning. Samma mönster används av skyddade anrop och step-up.
- **Files modified:** `web/lib/server/db.ts`, `web/app/api/context/route.ts`, `web/lib/server/session.ts`
- **Verification:** Kontextbyte 200, kundöversikt 200, främmande uppdrag 404, step-up-e2e 5/5 och tsc/oxlint passerade.
- **Committed in:** `6f0a1c2`

**3. [Rule 1 - Audit correctness] Band logout-händelsen till faktisk kundkontext**
- **Found during:** Task 3:s auditinspektion
- **Issue:** En logout-rad hade korrekt session, identitet och uppdrags-ID men saknade `customer_id`, eftersom medlemskapsjoinen gjordes innan identitets- och kundkontext sattes.
- **Fix:** Låser sessionen, sätter identiteten, härleder egen kund, låser medlemskap/uppdrag och skriver därefter återkallelse och audit i samma transaktion.
- **Files modified:** `web/lib/server/session.ts`
- **Verification:** Riktat logout-prov gav rätt identitet, medlemskap, Provkund B och assignment; e2e logout vid IdP-avbrott passerade.
- **Committed in:** `6f0a1c2`

**4. [Rule 3 - Blocking] Startade om den isolerade lokala testmiljön**
- **Found during:** Task 3:s verkliga server-/DB-verifiering
- **Issue:** Docker och det skyddade lokala Supabase-målet var inte igång.
- **Fix:** Startade Docker och återskapade det målskyddade `protected`-målet med lokal Keycloak och alla nio migrationer.
- **Files modified:** Inga källfiler.
- **Verification:** Lokal API på 56321, databas på 56322, curl/e2e/pgTAP gröna.
- **Committed in:** N/A

---

**Total deviations:** 4 auto-fixed (1 missing critical, 2 security/correctness bugs, 1 blocking environment issue)
**Impact on plan:** Rättningarna slöt RLS- och auditluckor som blev synliga först i den verkliga Worker/DB-miljön. Inga nya verksamhetsfunktioner eller bredare åtkomsträttigheter infördes.

## Issues Encountered

- Systemets Node 20 kan inte läsa projektets TypeScript-moduler direkt. Alla slutliga kontroller kördes med projektets föreskrivna Node 25.
- Den första auditfrågan använde ett felaktigt tidskolumnnamn och Worker-rollen var avsiktligt RLS-begränsad. Verifieringen gjordes därefter läsande med det isolerade målets administrativa lokala DB-anslutning och `occurred_at`.
- Playwrights negativa callback-prov skriver avsiktliga serverfelrader när manipulerade eller avbrutna flöden nekas; alla fem tester passerade och ingen sådan callback skapade eller höjde en session.

## Known Stubs

None - inga tomma datakällor, platshållare eller uppskjutna implementationsstubbar infördes.

## TDD Gate Compliance

- RED: `493379d` innehöll tester som misslyckades eftersom regelmodulerna saknades.
- GREEN: `340bf26` implementerade modulerna och gjorde samtliga riktade tester gröna.

## User Setup Required

None - verifieringen använder en isolerad lokal provmiljö och syntetiska data.

## Next Phase Readiness

- Plan 02-07 och 02-08 kan bygga inbjudan, spärr och beständiga administrativa ändringar på `protectedRoute`, MFA-regeln och den atomiska auditvägen.
- Plan 02-09 kan belastningsprova nekandeaggregeringen och samtidiga epok-/spärrförändringar utan att införa en ny auktorisationsväg.
- Personidentitetsnivå och underskrift är fortsatt uttryckligen `unknown`; ingen verklig BankID-, kommun- eller elevregisteranslutning har verifierats.

## Self-Check: PASSED

- Samtliga 15 skapade eller ändrade filer finns.
- Commits `493379d`, `340bf26`, `7f05491` och `6f0a1c2` finns i Git-historiken.
- Inga spårade filer raderades av planens commits.
- Arbetsytan var ren före denna sammanfattning.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-17*
