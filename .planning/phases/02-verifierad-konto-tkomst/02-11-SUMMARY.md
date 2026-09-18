---
phase: 02-verifierad-konto-tkomst
plan: 11
subsystem: testing
tags: [playwright, keycloak, totp, webkit, cloudflare-worker, accessibility]

requires:
  - phase: 02-verifierad-konto-tkomst
    provides: Skyddade sessioner, kundkontext, administration, granskningslogg och lokal Keycloak-provmiljö från plan 02-04–02-10
provides:
  - Sekventiell browsermatris för skyddad drift på Chrome desktop, iPhone 13 WebKit och byggd Worker
  - Browserbevis för MFA, uppdragskontext, fliklåsning, spärr, kundisolering, audit, inbjudan och tillgänglighet
  - Regressioner för kontextsignalering, dialoglås och 200-procentig text på 320 px
affects: [02-12, verifiering, pilotdrift, IAM-03, IAM-04, IAM-05]

tech-stack:
  added: []
  patterns:
    - Sekventiella Playwright-projekt mot ett förberett syntetiskt protected-mål
    - Separata BrowserContext-inloggningar när cookiejar och kundidentitet måste isoleras
    - UI-bevis kombinerat med skrivskyddade databasassertioner och deterministisk fixturestädning

key-files:
  created:
    - web/e2e/phase2-access.spec.ts
  modified:
    - web/playwright.protected.config.ts
    - web/e2e/helpers/keycloak.ts
    - web/e2e/helpers/pilot-db.ts
    - web/app/context-switch.tsx
    - web/app/globals.css

key-decisions:
  - "Protected-projekten körs med workers=1 eftersom de delar sessions-, audit- och spärrfixturer."
  - "Administrativa browserprov höjer uttryckligen sessionen med TOTP före mutation i stället för att anta att en vanlig lösenordsinloggning har MFA."
  - "Auditprovet binder raden till det organizerId som POST-svaret skapade, så äldre auditposter påverkar inte utfallet."

patterns-established:
  - "Hydreringsvänta: interaktion börjar först när ett känt React-element har __reactProps."
  - "Fixtureåterställning: mutationstester återställer medlemskap och tar bort syntetiska huvudmän i finally."
  - "Plattformsspecifika bevis: test.skip anger uttryckligen vilka scenarier som tillhör phone respektive built."

requirements-completed: [IAM-03, IAM-04, IAM-05]

duration: 1h 15m
completed: 2026-09-18
---

# Phase 2 Plan 11: Skyddad browsermatris Summary

**Sjutton namngivna åtkomstscenarier bevisar skyddad kontoåtkomst, kundisolering, MFA, audit och mobil användbarhet i Chrome, iPhone-WebKit och byggd Worker.**

## Performance

- **Duration:** 1h 15m
- **Started:** 2026-09-18T05:27:00Z
- **Completed:** 2026-09-18T06:42:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Lade till en separat protected-matris med 17 namngivna browserprov och en JSON-rapport som visar 37 godkända körningar, 19 avsiktliga projekthopp, 0 oväntade fel och 0 instabila resultat.
- Bevisade TOTP, uppdragsväljare, kontextbyte, fliklåsning, utloggning, glidande session, spärr i öppen session, samma e-post i två kunder, audit/export och personbunden inbjudan.
- Bevisade minst 44 px pekytor, tangentbordsflöde, 320 px bredd med 200 procent text och byggd Worker utan främmande Supabase-anrop eller läsbar sessionscookie.
- Återställde syntetiska fixturer efter körningen: Gustav är aktiv, inga `E2E-huvudman` finns kvar och identitetsantalet är 10.

## Task Commits

Each task was committed atomically:

1. **Task 1: Projekt och browserprov för session, kontext och flikar** - `f83a0bf` (test)
2. **Task 2: Browserprov för administration, audit, telefon och byggd Worker** - `652be70` (test)

## Files Created/Modified

- `web/playwright.protected.config.ts` - Definierar desktop-, phone- och built-projekten, egna servrar, sekventiell körning och JSON-rapport.
- `web/e2e/phase2-access.spec.ts` - Innehåller fasens 17 namngivna browserprov.
- `web/e2e/helpers/keycloak.ts` - Skapar isolerade browserkontexter och väntar på React-hydrering.
- `web/e2e/helpers/pilot-db.ts` - Räknar auditposter och städar syntetiska huvudmän.
- `web/app/context-switch.tsx` - Signalerar andra flikar först efter att den nya serverkontexten har lästs in.
- `web/app/globals.css` - Håller låskortets knapp klickbar och skyddade rubriker inom 320 px vid 200 procent text.

## Decisions Made

- Protected-projekten använder en arbetare. Det gör session-, spärr- och auditfixturer deterministiska mellan desktop, phone och built.
- Vanlig lösenordsinloggning behandlas som lösenordsinloggning. Tester som utför en skyddad mutation gör en explicit step-up med TOTP.
- Auditkontrollen identifierar den nyss skapade huvudmannen via svarets objekt-ID. Den kräver därmed rätt auditobjekt även när historiska poster finns kvar.
- WebKits telefonprov förstorar rottexten till 200 procent eftersom Playwrights WebKit-projekt saknar Chromes CDP-baserade sidzoom.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kontextbytet låste avsändarfliken**
- **Found during:** Task 1
- **Issue:** BroadcastChannel-signalen skickades innan avsändarfliken hade läst in den nya epoken och kunde därför tolkas som ett främmande kontextbyte.
- **Fix:** Flyttade signaleringen tills efter `onChanged` hade slutförts.
- **Files modified:** `web/app/context-switch.tsx`
- **Verification:** Kontextbyte och fliklåsning passerar i både desktop och phone.
- **Committed in:** `f83a0bf`

**2. [Rule 1 - Bug] Låskortets omladdningsknapp låg under dialogens overlay**
- **Found during:** Task 1
- **Issue:** Låslagrets kort hade lägre staplingsnivå än overlayn, som fångade klicket på `Ladda om`.
- **Fix:** Gav låskortet en staplingsnivå ovanför overlayn.
- **Files modified:** `web/app/globals.css`
- **Verification:** Browserprovet klickar `Ladda om` och når den nya kontexten i båda plattformarna.
- **Committed in:** `f83a0bf`

**3. [Rule 1 - Bug] Säkerhetsloggens rubrik skapade sidledsrullning med 200 procent text**
- **Found during:** Task 2
- **Issue:** Rubrikbehållarens minsta innehållsbredd gjorde sidan bredare än 320 px vid förstoring.
- **Fix:** Tillät rubrikbehållaren att krympa och radbröt långa rubriker i den responsiva protected-vyn.
- **Files modified:** `web/app/globals.css`
- **Verification:** Phone-provet har ingen horisontell overflow vid 320 px och 200 procent text.
- **Committed in:** `652be70`

---

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs)
**Impact on plan:** Rättningarna behövdes för det planerade browserbeteendet och ändrade inte åtkomstmodellen eller fasens omfattning.

## Issues Encountered

- Vinexts devserver lämnar privata `.dev.vars`- och låsfiler efter att Playwright avslutat serverprocessen. Filerna rensades mellan isolerade körningar och versionshanterades inte.
- En delskal använde Node 20 trots projektets krav på Node 22 eller senare. Samtliga slutliga kontroller kördes med `/opt/homebrew/opt/node@22/bin` först i `PATH`.
- Auditprovet såg historiska `organizer_created`-poster från tidigare projekt. Provet binder nu raden till det objekt-ID som den egna POST-begäran skapade.

## Verification

- `npm run build:protected` - PASS.
- `npm run e2e:protected` - 37 PASS, 19 avsiktliga skip, 0 oväntade, 0 flaky; desktop 15/15, phone 16/16, built 6/6 tillämpliga scenarier.
- `node work/pilot/verify-access.mjs` - PASS i samtliga 14 serverkategorier.
- `npm run build:example && npx playwright test` - fas 1 fortsatt grön med 26 PASS och 1 avsiktligt phone-only skip.
- `node --test lib/*.test.mjs` - 168 PASS.
- `npx tsc --noEmit` och `npx oxlint app lib e2e/...` - PASS.
- `web/playwright.config.ts` är oförändrad.

## Known Stubs

None.

## User Setup Required

None - proven använder den lokala syntetiska pilotmiljön och utgör inte en verklig kommunanslutning.

## Next Phase Readiness

- IAM-03, IAM-04 och IAM-05 har automatiserat browserevidens på avsedda plattformar och kan sammanställas i plan 02-12.
- Inga blockerare återstår i plan 02-11.

## Self-Check: PASSED

- Samtliga sex skapade eller modifierade källfiler finns.
- Task-commits `f83a0bf` och `652be70` finns i historiken.
- Summaryn passerar `git diff --check`.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-18*
