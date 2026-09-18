---
phase: 02-verifierad-konto-tkomst
plan: "09"
subsystem: testing
tags: [worker, postgres, sessions, mfa, tenant-isolation, audit, pgtap]
requires:
  - phase: 02-07
    provides: Personbundna inbjudningar, spärr och avslut av uppdrag
  - phase: 02-08
    provides: Kundavgränsad loggexport och skyddade organisationsändringar
provides:
  - Körbar protected-API-grind för IAM-01, IAM-05, ACL-01 och AUDIT-01
  - Sanerad PASS-rapport med 14 fall och 63 kontroller
  - Regression för korrekt nekandekod för kommande, utgångna och avslutade uppdrag
affects: [02-10, 02-11, 02-12, fasverifiering, pilotacceptans]
tech-stack:
  added: []
  patterns: [målskyddad-api-verifiering, sessionsmintning-med-hash, sekventiella-säkerhetsfall, finally-städning]
key-files:
  created:
    - work/pilot/verify-access.mjs
    - work/pilot/results/access.json
  modified:
    - web/lib/server/db.ts
    - web/lib/access-rules.ts
    - web/lib/access-rules.test.mjs
    - work/pilot/verify-isolation.mjs
key-decisions:
  - API-mintade lokala sessioner prövar redan utfärdade sessionsbevis; de ersätter inte fasens verkliga OIDC-prov.
  - Testkörningen återställer den aktuella minutens flyktiga denial-bucket för determinism men bevarar säkerhetshändelserna.
  - Samma e-post och auth_user_id får aldrig länka kundmedlemskap; issuer och subject förblir identitetsnyckeln.
patterns-established:
  - Varje verifieringsfall rapporterar säkra statuskoder och verksamhetsresultat utan token, cookie, hash eller anslutningssträng.
  - Syntetiska medlemskap, uppdrag och auth-referenser återställs i finally; auditspår lämnas orörda.
requirements-completed: [IAM-01, IAM-05, ACL-01, AUDIT-01]
duration: 19min
completed: 2026-09-18
---

# Phase 2 Plan 9: Körbara acceptansprov för kontoåtkomst Summary

**Den byggda protected-Workern verifieras med 14 sekventiella API/DB-fall för personbunden etablering, gamla sessioner, kundisolering, MFA, serverhärledd aktör och oföränderlig audit.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-18T05:13:58Z
- **Completed:** 2026-09-18T05:33:02Z
- **Tasks:** 2 av 2
- **Files modified:** 6

## Accomplishments

- `verify-access.mjs` startar den byggda protected-Workern, verifierar Worker-rollen, mintar sessionsbevis med samma SHA-256-formel som appen och ger exit 0/1/3 för PASS/FAIL/BLOCKED.
- Planens tolv namngivna fall samt `context-race` och `audit-rollback` passerade: 14/14 fall och 63/63 kontroller. Resultatet innehåller inga tokens, cookies, hashar eller anslutningssträngar.
- En redan utfärdad session nekas direkt efter medlemskapsspärr eller avslutat uppdrag. Kommande, utgångna och återkallade sessioner skiljs åt med rätt kod.
- Inbjudan provas med rätt och fel subject, issuer, giltighet, MFA, återanvändning och två samtidiga inlösen. Exakt en samtidig inlösen lyckas.
- Kända främmande objekt-ID:n, listningar, loggexport och samma e-post/auth-referens röjer eller ärver ingen annan kund.
- Nekandeflödet begränsas till 20 fullständiga händelser plus en suppression även när klienten förfalskar `X-Forwarded-For`; auditfel rullar tillbaka verksamhetsändringen.

## Task Commits

1. **Rule 1: Korrekt liveklassning av kommande uppdrag** — `2c7cec1` (fix)
2. **Task 1: Målskyddad verifieringsram och sex sessions-/MFA-fall** — `4913423` (feat)
3. **Rule 1: Isoleringsprov i OIDC-only protected** — `f3947f8` (fix)
4. **Task 2: Inbjudan, kundisolering, aktör, logg, race och rollback** — `7d24bb6` (test)

**Plan metadata:** denna SUMMARY committas separat efter självkontroll.

## Files Created/Modified

- `work/pilot/verify-access.mjs` — Målskydd, Worker-start, sessionsmintning, API-anrop, 14 fall, resultat och finally-städning.
- `work/pilot/results/access.json` — Sanerat, daterat PASS-resultat med 63 kontroller.
- `web/lib/server/db.ts` — Hämtar uppdragsdatum som text och ger korrekt nekandekod i live-prövningen.
- `web/lib/access-rules.ts` och `web/lib/access-rules.test.mjs` — Delad klassning och regression för kommande, utgånget och uttryckligen avslutat uppdrag.
- `work/pilot/verify-isolation.mjs` — Accepterar endast GoTrue:s exakta besked om avstängd e-postinloggning som ett säkert nekande i OIDC-only protected.

## Decisions Made

- Sessionerna i denna API-grind skapas direkt i det lokala, disponibla målet. Det gör IAM-05 bokstavligt prövbart med redan utfärdad session, medan riktig OIDC och MFA fortsatt bevisas separat i plan 02-04 och 02-11.
- Säkerhetsloggen rensas aldrig. Endast den aktuella minutens flyktiga `denial_buckets`-rad återställs före körningen så att en tidigare lokal provkörning inte ändrar nästa körnings förväntade 20+1-resultat.
- En tillfällig giltig `auth_user_id` kopplas till den syntetiska aktören bara runt organisationseventprovet och återställs i `finally`; medlemskap eller kontolänkar skapas inte.

## Verification

| Kontroll | Resultat |
|---|---|
| `node work/pilot/verify-access.mjs` | PASS, 14/14 fall, 63/63 kontroller |
| Resultatets hemlighetsregex | PASS; inga sessioner, JWT, databas-URL:er eller 64-teckenshashar |
| Utan protected-manifest | BLOCKED, exit 3 |
| Utan `dist-protected/build-mode.json` | BLOCKED, exit 3 |
| Redan startad Worker via `--base-url http://127.0.0.1:5193` | PASS |
| Fixturåterställning | PASS: 10 identiteter, Erik 0 medlemskap, Gustav active, uppdrag öppet, 0 Provkund C |
| `node work/pilot/verify-isolation.mjs` | PASS: 39 nekade, 0 tillåtna, databas oförändrad |
| `node work/pilot/run-sql-tests.mjs` | PASS: Files=3, Tests=137 |
| `node --test lib/access-rules.test.mjs` | PASS: 15/15 |
| `npx tsc --noEmit` | PASS |
| Berörd oxlint och `git diff --check` | PASS |
| `npm run build:protected` | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kommande uppdrag rapporterades som utgånget i live-prövningen**
- **Found during:** Task 1:s fall `uppdrag-utgatt`.
- **Issue:** Postgres-klienten returnerade `date` som ett datumobjekt medan servern jämförde det med en ISO-datumsträng. Sessionlistningen visade `kommande`, men nästa skyddade anrop gav `assignment_expired`.
- **Fix:** Projektera `valid_from` och `valid_to` som text och använd en testad gemensam klassning för `assignment_upcoming`, `assignment_expired` och `assignment_ended`.
- **Files modified:** `web/lib/server/db.ts`, `web/lib/access-rules.ts`, `web/lib/access-rules.test.mjs`.
- **Verification:** 15/15 enhetsprov, tsc, lint, protected-bygge och verkligt API-fall med `assignment_upcoming`.
- **Committed in:** `2c7cec1`.

**2. [Rule 1 - Testbugg] Fas 1:s isoleringsprov tolkade avstängd e-postinloggning som trasig fixtur**
- **Found during:** Planens slutgrind `verify-isolation.mjs`.
- **Issue:** Protected är nu avsiktligt OIDC-only, men verifieraren krävde fortfarande lyckad lösenordsinloggning och gav FAIL trots 38 nekade, 0 tillåtna och oförändrad databas.
- **Fix:** Endast det exakta svaret `Email logins are disabled` räknas som DENIED. Alla andra inloggningsfel förblir SETUP-FAIL.
- **Files modified:** `work/pilot/verify-isolation.mjs`.
- **Verification:** 39 nekade, 0 tillåtna, oförändrad databas och exit 0.
- **Committed in:** `f3947f8`.

**3. [Rule 3 - Blocking] Övergivet preview-lås blockerade första Worker-starten**
- **Found during:** Task 1:s första verkliga Worker-körning.
- **Issue:** `dist-protected/server/.dev.vars` och dess låsfil fanns kvar utan ägande preview-, Wrangler- eller workerd-process.
- **Fix:** Verifierade process- och portläget och tog bort exakt de två genererade restfilerna före omstart.
- **Files modified:** Inga spårade filer.
- **Verification:** Protected-preview startade, hälsan rapporterade `skolplattform_worker`, och full svit passerade.

---

**Total deviations:** 3 auto-fixed (2 buggar, 1 blockerande runtime-rest).
**Impact on plan:** Rättningarna behövdes för korrekta nekandekoder och en sanningsenlig regressionsgrind. Ingen ny produktfunktion eller extern anslutning tillkom.

## Issues Encountered

- Docker-socketen är blockerad i den begränsade exekveringsmiljön. Den redan godkända lokala testkörningen gjordes därför med explicit sandbox-eskalering; målkontrollen verifierade fortfarande loopback, project-id och Worker-roll före databasåtkomst.
- Upprepade lokala prov inom samma minut hade lämnat flyktig throttle-state. Verifieraren rensar nu endast aktuell testminuts `denial_buckets` före fallen; oföränderliga säkerhetshändelser bevaras.
- `spike.json` var modifiererad av den överordnade körningen före planstart och lämnades orörd och ocommittad.

## Known Stubs

Inga. Verifieraren använder riktiga lokala Worker-routes och PostgreSQL-tabeller. Sessionsmintningen är en uttrycklig testmekanism och redovisas inte som ett verkligt OIDC-bevis.

## User Setup Required

None - inga nya externa hemligheter eller tjänstekonton krävs. Docker Desktop och det befintliga lokala protected-målet användes.

## Next Phase Readiness

- Plan 02-10 kan bygga gränssnittet ovanpå API-kontrakt som nu är reproducerbart verifierade oberoende av UI.
- Plan 02-11 behöver fortsatt bevisa den verkliga OIDC-/MFA-kedjan; `access.json` bevisar sessions- och behörighetsbeteendet men påstår inte kommun-IdP eller BankID.

## Self-Check: PASSED

Alla sex angivna käll- och resultatfiler finns. Commits `2c7cec1`, `4913423`, `f3947f8` och `7d24bb6` finns i historiken. Full access-svit, isoleringsprov, pgTAP, enhetsprov, typkontroll, lint och protected-bygge passerade; `spike.json` ingår inte i planens commits.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-18*
