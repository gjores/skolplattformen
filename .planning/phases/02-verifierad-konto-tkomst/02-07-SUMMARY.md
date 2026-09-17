---
phase: 02-verifierad-konto-tkomst
plan: 07
subsystem: auth
tags: [invitations, mfa, revocation, rls, audit-log, postgres]

requires:
  - phase: 02-verifierad-konto-tkomst
    provides: Serverlagrade sessioner, kundbunden RLS, exakt MFA-profil och protectedRoute från plan 02-01–02-06
provides:
  - Person- och utfärdarbindna engångsinbjudningar som aldrig lagrar token i klartext
  - MFA-skyddad inlösen som skapar medlemskap, uppdrag och audit atomiskt
  - Kundadministrativ inbjudan, medlemskapsspärr och uppdragsavslut
  - Kundisolerad medlemslista och omedelbar sessionsrevokering
affects: [02-08, 02-09, 02-10, 02-11, IAM-01, IAM-05]

tech-stack:
  added: []
  patterns: [personbunden-engangsinbjudan, select-for-update-inlosen, mfa-skyddad-revokering, existensdoljande-404, sokbar-jsonb-audit]

key-files:
  created:
    - web/lib/invitation-rules.ts
    - web/lib/invitation-rules.test.mjs
    - work/pilot/invite.mjs
    - web/app/api/inbjudan/losen/route.ts
    - web/app/api/kund/inbjudan/route.ts
    - web/app/api/kund/medlemskap/sparr/route.ts
    - web/app/api/kund/uppdrag/avsluta/route.ts
    - web/app/api/kund/medlemmar/route.ts
  modified:
    - web/lib/server/events.ts

key-decisions:
  - "Första företrädaren etableras endast genom en leverantörsutfärdad inbjudan bunden till exakt issuer och subject; namn, e-post, domän och organisationsnummer ger aldrig medlemskap."
  - "Inlösen låser tokenraden och prövar MFA, session, issuer, subject, tid och used_at innan medlemskap eller uppdrag skapas."
  - "Spärr återkallar befintliga sessioner som komfort, medan live-prövningen av medlemskap och uppdrag är den bestående säkerhetsgarantin."
  - "Hävning av spärr återaktiverar aldrig gamla sessioner; användaren måste logga in på nytt."

patterns-established:
  - "Inbjudan: sha256(token) i databasen, token en gång i URL-fragmentet, exact issuer+subject och SELECT FOR UPDATE vid inlösen."
  - "Känslig kundmutation: protectedRoute + kundadmin + exakt MFA + RLS-filter + security_events i samma transaktion."
  - "Existensdöljning: främmande och obefintliga medlemskaps- eller uppdrags-ID ger samma 404-form."

requirements-completed: [IAM-01, IAM-05]

duration: 25min
completed: 2026-09-17
---

# Phase 2 Plan 7: Personbunden inbjudan och omedelbar åtkomstspärr Summary

**Personbundna engångsinbjudningar med låst inlösen, exakt MFA-prövning och kundisolerad återkallelse av medlemskap, uppdrag och sessioner**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-17T08:00:00Z
- **Completed:** 2026-09-17T08:25:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Lade till delade, testade regler för 256-bitars inbjudningstoken, SHA-256-hash, tillåtna grants, giltighetstid och exakt issuer/subject-prövning.
- Byggde leverantörens målskyddade CLI som skapar en personbunden inbjudan och en `source=cli`-händelse atomiskt, och endast skriver klartexttokenen en gång som URL-fragment.
- Byggde MFA-skyddad inlösen utan tidigare kundkontext. Samtidiga försök låser samma inbjudan så exakt ett lyckas; medlemskap, uppdrag, användmarkering och audit ligger i samma transaktion.
- Gav kundadministratören en MFA-skyddad väg för att bjuda in fler och en tokenfri kundlista över inbjudningar.
- Lade till spärr/häv spärr, sessionsrevokering, uppdragsavslut och kundisolerad medlemslista. Främmande kunds ID röjs aldrig.
- Rättade auditlagrets JSONB-bindning så `details.code`, proof och annan allowlistad metadata kan sökas och verifieras som JSON-objekt.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests för inbjudningsregler** - `f833ad8` (test)
2. **Task 1 GREEN: Inbjudningsregler och leverantörs-CLI** - `6d7f539` (feat)
3. **Task 2: MFA-bunden inlösen och kundadmin-inbjudan** - `6e4fa56` (feat)
4. **Task 3: Spärr, uppdragsavslut, medlemslista och sökbar audit** - `b479ac5` (feat)

## Files Created/Modified

- `web/lib/invitation-rules.ts` och `web/lib/invitation-rules.test.mjs` - Tokenformat, hash, giltighet, grants samt issuer/subject-prövning med 13 rena prov.
- `work/pilot/invite.mjs` - Protected-only CLI med personbindning, extern verifieringsreferens, PGPASSFILE och atomisk CLI-audit.
- `web/app/api/inbjudan/losen/route.ts` - Låst, engångssäker inlösen med MFA före mandat och identiskt 404 vid ogiltig token.
- `web/app/api/kund/inbjudan/route.ts` - MFA-skyddad utfärdning och tokenfri lista inom aktuell kund.
- `web/app/api/kund/medlemskap/sparr/route.ts` - Spärr/häv spärr, självspärrskydd och återkallelse av öppna sessioner.
- `web/app/api/kund/uppdrag/avsluta/route.ts` - Kundavgränsat avslut med faktisk aktör och bevarad uppdragsreferens.
- `web/app/api/kund/medlemmar/route.ts` - Medlemmar och daterade uppdrag inom vald kund.
- `web/lib/server/events.ts` - JSONB skrivs som JSON-objekt via databasdrivarens typade JSON-bindning.

## Decisions Made

- En inbjudan till första företrädaren får exakt funktionen `kundadmin`. `granskare` kan utfärdas först från en befintlig kundadministratörsväg.
- Inbjudans e-post är endast en visningsuppgift. Avvikelse loggas som `emailMismatch`, men identiteten avgörs enbart av verifierad issuer och subject.
- Inlösen utan befintlig kundkontext använder den låsta appsessionens serverlagrade proof-proveniens; klienten kan inte skicka eller höja MFA-bevis själv.
- Spärr och avslut tillåts endast inom aktuell kund och ger samma `404 not_found` för ett främmande respektive obefintligt ID.
- Återaktivering av ett medlemskap gör inte återkallade cookies giltiga igen.

## Verification

- `node --test lib/*.test.mjs` — PASS, 152/152 prov.
- `npx tsc --noEmit` — PASS.
- `npx oxlint app lib scripts e2e` — PASS.
- `npm run build:protected` — PASS; endast befintliga Vite- och chunkstorleksvarningar.
- `npm run e2e:protected` — PASS, 5/5 byggda Keycloak-/sessionsflöden, inklusive negativa callbacker.
- `node work/pilot/run-sql-tests.mjs` — PASS på ren fixtur, Files=3 och Tests=137.
- Inbjudnings-CLI mot lokalt protected — PASS: 43-teckens token, exakt en oanvänd `leverantor:cli`-rad och exakt en `invitation_issued` med `source=cli`; baseline vägrades.
- Riktad lokal API-/DB-verifiering — PASS: giltig inlösen 201, replay/fel issuer/fel subject/expired/slumpad token 404, orgnr/domän 400 utan medlemskap, samtidighet exakt `[201,404]`, lösenords-MFA 403 och korrekt proof 201.
- Riktad återkallelseverifiering — PASS: spärrad gammal cookie 401, hävning återaktiverade inte cookien, ny session 200, separat direkt DB-spärr utan revokering 403 och avslutat uppdrag 403.
- Kundisolering och audit — PASS: medlemslistor 7 respektive 3, främmande/slumpat ID samma 404-form, och `membership_blocked`, `membership_unblocked`, `assignment_ended` samt `mfa_required` bar Anna och hennes faktiska kundadmin-uppdrag.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Audit correctness] Lagrade säkerhetshändelsens details som verkligt JSONB-objekt**
- **Found during:** Task 3:s auditassertion för nekad MFA.
- **Issue:** `events.ts` använde `JSON.stringify(details)` framför postgres.js JSON-bindning. Resultatet blev en JSON-sträng inuti `jsonb`, så `details->>'code'` gav NULL trots att texten såg ut som JSON.
- **Fix:** Bytte till `tx.json(details)` och gav sanitizer-resultatet en rekursiv, serialiserbar JSON-typ.
- **Files modified:** `web/lib/server/events.ts`
- **Verification:** Omkört API-prov hittade `membership_block/denied` med `details.code=mfa_required`; tsc, oxlint, e2e och pgTAP passerade.
- **Committed in:** `b479ac5`

**2. [Rule 3 - Blocking] Startade om lokal Docker och protected-miljö**
- **Found during:** Task 1:s verkliga CLI-/DB-prov.
- **Issue:** Docker-socketen var sandboxbegränsad och det lokala protected-målet var stoppat.
- **Fix:** Startade Docker Desktop med godkänd eskalering och återskapade endast det disponibla lokala målet med Keycloak och nio migrationer.
- **Files modified:** Inga källfiler.
- **Verification:** CLI-, API-, Keycloak-, pgTAP- och Playwright-proven passerade.
- **Committed in:** N/A

**3. [Rule 3 - Test isolation] Återställde provmålet före slutlig pgTAP**
- **Found during:** Planens slutverifiering.
- **Issue:** Task 2:s avsiktligt skapade syntetiska Provkund A-inbjudan gjorde ett pgTAP-antagande om tom inbjudningslista falskt.
- **Fix:** Återställde det disponibla protected-målet till de versionerade grundfixturerna och körde alla SQL-sviter igen.
- **Files modified:** Inga källfiler.
- **Verification:** Files=3, Tests=137, Result=PASS.
- **Committed in:** N/A

---

**Total deviations:** 3 auto-fixed (1 auditbugg, 2 blockerande lokala testmiljöfrågor)
**Impact on plan:** Auditbeviset blev maskinellt sökbart och slutverifieringen reproducerbar. Ingen ny produktarkitektur eller extern integration infördes.

## Issues Encountered

- Docker-åtkomst krävde eskalering eftersom sandboxen inte fick ansluta till den lokala Docker-socketen.
- Playwrights negativa callbackfall skriver avsiktliga serverfelrader när manipulerade eller avbrutna flöden nekas; alla fem flöden passerade och skapade eller höjde ingen session.

## Known Stubs

None - alla skapade routes har en verklig datakälla, auktorisation och verifierat svar; inga tomma UI-datakällor eller platshållare infördes.

## TDD Gate Compliance

- RED: `f833ad8` innehöll 13 tester som misslyckades eftersom `invitation-rules.ts` saknades.
- GREEN: `6d7f539` implementerade reglerna och gjorde samtliga tester gröna.

## Threat Flags

| Flag | File | Description |
|---|---|---|
| threat_flag: public-token-redemption | `web/app/api/inbjudan/losen/route.ts` | Ny sessionskrävande inlösenväg vid gränsen från engångstoken till medlemskap; skyddad av same-origin, exakt MFA, issuer+subject, tid och lås. |
| threat_flag: administrative-revocation | `web/app/api/kund/medlemskap/sparr/route.ts` | Ny kundadministrativ spärrväg med MFA, RLS, självspärrskydd, sessionsrevokering och atomisk audit. |

## User Setup Required

None - all verifiering använder syntetiska data i det isolerade lokala protected-målet.

## Next Phase Readiness

- Plan 02-08 kan använda de sökbara och atomiska säkerhetshändelserna för granskarvy och första skyddade verksamhetsmutation.
- Plan 02-09 kan samla dessa riktade API-fall i det permanenta regressionsverktyget och belastningsprova samtidighet och existensdöljning.
- Inbjudnings- och spärrvägarna använder lokal Keycloak/TOTP som prov. Ingen verklig BankID-, kommun- eller elevregisteranslutning har aktiverats.

## Self-Check: PASSED

- Samtliga 9 skapade eller ändrade filer finns.
- Commits `f833ad8`, `6d7f539`, `6e4fa56` och `b479ac5` finns i Git-historiken.
- Inga spårade filer raderades av planens commits.
- Arbetsytan var ren före denna sammanfattning.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-17*
