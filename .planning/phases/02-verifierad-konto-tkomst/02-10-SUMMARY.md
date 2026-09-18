---
phase: 02-verifierad-konto-tkomst
plan: 10
subsystem: protected-ui
tags: [react, typescript, broadcastchannel, context-epoch, keycloak, accessibility]

# Dependency graph
requires:
  - phase: 02-09
    provides: verifierade skyddade API-kontrakt, lokal IdP och sessions-/kontextlager
provides:
  - skyddad startsida med inloggning, uppdragsval och utloggning
  - epokstyrd rensning och låsning i alla flikar vid kontextbyte och utloggning
  - kundadministration och granskarlogg mot serverlagret med explicit MFA-step-up
affects: [02-11, 02-12, protected-ui, pilot-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [context-epoch request cancellation, BroadcastChannel with storage-event fallback, unsaved-change registry]

key-files:
  created:
    - web/lib/session-channel.ts
    - web/lib/session-channel.test.mjs
    - web/lib/server-client.ts
    - web/lib/unsaved-changes.tsx
    - web/app/protected-home.tsx
    - web/app/context-switch.tsx
    - web/app/kund-workspace.tsx
    - web/app/logg-workspace.tsx
    - web/app/inbjudan/page.tsx
  modified:
    - web/app/page.tsx
    - web/app/globals.css

key-decisions:
  - "Ett enda uppdrag totalt visas som en statisk kontextetikett; annars visas väljaren med giltiga, kommande och avslutade uppdrag."
  - "Loggexport går genom samma serverklient som övriga API-anrop och laddas ned som Blob efter epokverifiering."
  - "MFA är ett uttryckligt step-up-flöde; en nekad verksamhetsåtgärd sparas eller spelas aldrig upp automatiskt."

patterns-established:
  - "Epokgräns: varje skyddat API-anrop bär aktuell X-Context-Epoch, avbryts vid byte och sena svar från föregående epok ignoreras."
  - "Flikrensning: BroadcastChannel-signaler innehåller endast kontrollmetadata och låst vy tar bort allt verksamhetsinnehåll ur DOM."

requirements-completed: [IAM-03, IAM-04]

# Metrics
duration: 30min
completed: 2026-09-18
---

# Phase 02 Plan 10: Skyddad arbetsyta och administration Summary

**Epokskyddad React-arbetsyta med uppdragsval, fliksynk, kundadministration, granskarlogg och explicit TOTP-step-up på dator och telefon**

## Performance

- **Duration:** 30 min
- **Started:** 2026-09-18T05:25:00Z
- **Completed:** 2026-09-18T05:55:42Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Öppnade det skyddade driftläget med serververifierad session och arbetskontext, inloggning, utloggning och uppdragsval utan att ändra exempelläget.
- Rensar skyddat klienttillstånd i alla flikar vid kontextbyte eller utloggning med epok, avbrutna anrop, BroadcastChannel och en metadatafri storage-event-reservväg.
- Gav kundadministratören fungerande medlems-, uppdrags-, inbjudnings-, huvudmanna-, skolenhets- och rektorsflöden samt granskaren filterbar logg och epokskyddad CSV-export.
- Anpassade väljare, navigering, dialoger och detaljvisning för tangentbord och telefon med minst 44 px pekytor och synligt 3 px fokus.

## Task Commits

Varje task committades avgränsat:

1. **Task 1: Sessionskanal, serverklient och osparade ändringar (RED)** - `e7a78d0` (test)
2. **Task 1: Sessionskanal, serverklient och osparade ändringar (GREEN)** - `7f5c0d3` (feat)
3. **Task 2: Skyddad startsida, uppdragsval och fliksynk** - `d890011` (feat)
4. **Task 3: Kundadministration och granskarlogg** - `2ed4389` (feat)

## Files Created/Modified

- `web/lib/session-channel.ts` - Ren epok- och låslogik samt BroadcastChannel/storage-event-signalering.
- `web/lib/session-channel.test.mjs` - Elva prov för epok, utloggning, fallback och samtliga serverfelkoder.
- `web/lib/server-client.ts` - Same-origin-klient med epokheader, avbrott, sen-svarsblockering, låssignaler och Blob-export.
- `web/lib/unsaved-changes.tsx` - Gemensamt register för formulärutkast, `beforeunload` och bekräftelse före byte.
- `web/app/protected-home.tsx` - Inloggning, sidhuvud, rollstyrd navigation, återvalidering och fliklås.
- `web/app/context-switch.tsx` - Valbara giltiga uppdrag samt gråmarkerade kommande och avslutade uppdrag.
- `web/app/inbjudan/page.tsx` - Fragmentbaserad inlösen med tillfällig token under inloggnings-/step-up-rundan.
- `web/app/kund-workspace.tsx` - Kundöversikt och alla planerade administrativa arbetsflöden med tydliga konsekvensdialoger.
- `web/app/logg-workspace.tsx` - Filterbar säkerhetslogg, tillgänglig detaljvisning och CSV-export.
- `web/app/page.tsx` - Startar den skyddade arbetsytan i `protected`-läge och bevarar exempelläget.
- `web/app/globals.css` - Responsiva skyddade vyer, pekytor och fokusringar.

## Decisions Made

- Kontextväljaren ersätts bara av etikett när användaren har exakt ett uppdrag totalt. Därmed syns kommande och avslutade alternativ även när bara ett uppdrag gäller idag.
- Granskarens CSV-export använder serverklientens Blob-väg så att samma epokskydd gäller för export som för vanlig visning.
- `mfa_required` stänger den aktuella bekräftelsedialogen och visar ett separat erbjudande om engångskod. Användaren måste efter step-up öppna och bekräfta åtgärden igen.
- Inbjudningstoken finns endast tillfälligt i `sessionStorage` under inloggning eller step-up och tas bort direkt när sidan läser den.

## Verification

- `node --test lib/*.test.mjs`: **168 passed**.
- `npx tsc --noEmit`: **passed**.
- `npx oxlint app lib scripts e2e`: **passed**.
- `npm run build:example`: **passed**.
- `npm run build:protected`: **passed**.
- `npx playwright test`: **26 passed, 1 skipped** på befintlig fullsvit.
- `npm run e2e:protected`: **5 passed** mot lokal syntetisk Keycloak/Supabase, inklusive TOTP, spärrning, utloggning och negativa callbackfall.
- Skyddad SSR utan cookie visade inloggning och inget `Exempelskola`-innehåll.
- Hanna: två giltiga uppdrag, kontextbyte låste annan flik och utloggning låste annan flik utan verksamhetsinnehåll i DOM.
- Frida: ett giltigt, ett kommande och ett avslutat uppdrag med rätt inaktiverade alternativ. Anna: statisk etikett vid ett enda uppdrag totalt.
- Ivar: spärrförsök utan TOTP gav synligt erbjudande om engångskod och ingen automatisk återuppspelning. Bertil: 28 loggrader och fungerande Blob-baserad CSV-export.
- WebKit 390 × 844: 33 synliga interaktiva kontroller, **0** med pekyta under 44 px.

Browserkontrollerna använde endast den lokala, syntetiska pilotmiljön. De utgör inte en verifierad kommunanslutning.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Första svaret kunde avvisas när klienten lärde sig sin första epok**
- **Found during:** Task 1 (serverklient)
- **Issue:** Adoption av den första svarsepoken ökade generationsräknaren och gjorde att samma svar klassades som sent.
- **Fix:** Skilde på den generation anropet accepterar och den epok som antas från svaret.
- **Files modified:** `web/lib/server-client.ts`
- **Verification:** Sessionsladdning och efterföljande skyddade anrop passerade browser- och fullsvit.
- **Committed in:** `2ed4389`

**2. [Rule 1 - Bug] Ogiltig kontext kunde skapa dubbla uppdragsväljare och utloggningsknappar**
- **Found during:** Task 2 (skyddad startsida)
- **Issue:** Sidhuvudet och tomtillståndet renderade kontroller med samma ID samtidigt.
- **Fix:** Behöll väljaren i sidhuvudet och visar extra utloggning endast när det helt saknas giltiga uppdrag.
- **Files modified:** `web/app/protected-home.tsx`
- **Verification:** Hanna-, Frida- och Anna-flödena gav en entydig kontrolluppsättning.
- **Committed in:** `d890011`

**3. [Rule 1 - Bug] Äldre responsiv tabellregel dolde kundadministrationens handlingskolumn**
- **Found during:** Task 3 (kundadministration)
- **Issue:** Den globala femte-kolumnregeln från exempelläget gömde skyddade åtgärder även på större skärmar.
- **Fix:** Lade en avgränsad override för `.admin-table.protected-table`.
- **Files modified:** `web/app/globals.css`
- **Verification:** Handlingskolumnen var synlig och användbar i desktopkontrollen.
- **Committed in:** `2ed4389`

**4. [Rule 1 - Bug] MFA-dialogen kunde dölja erbjudandet om step-up**
- **Found during:** Task 3 (kundadministration)
- **Issue:** Den öppna muteringsdialogen låg kvar ovanpå förälderns status efter `mfa_required`.
- **Fix:** Stänger och nollställer aktuell dialog innan step-up-erbjudandet visas, utan att lagra POST-anropet.
- **Files modified:** `web/app/kund-workspace.tsx`
- **Verification:** Ivar såg "Verifiera med engångskod" efter spärrförsök och ingen mutation spelades upp.
- **Committed in:** `2ed4389`

**5. [Rule 1 - Bug] Lyckad CSV-status rensades av efterföljande omladdning**
- **Found during:** Task 3 (granskarlogg)
- **Issue:** Omladdningen av loggen nollställde exportbekräftelsen direkt efter nedladdning.
- **Fix:** Sätter exportstatus efter att den registrerade logghändelsen har lästs in igen.
- **Files modified:** `web/app/logg-workspace.tsx`
- **Verification:** Bertils CSV laddades ned och bekräftelsen låg kvar efter omladdning.
- **Committed in:** `2ed4389`

**6. [Rule 1 - Accessibility] Mobil navigationsknapp och native-väljare underskred 44 px**
- **Found during:** Task 3 (telefonverifiering)
- **Issue:** WebKit mätte sidomenyknappen till 28 × 28 px och native-väljare till 23 px höjd.
- **Fix:** Gav de skyddade kontrollerna uttrycklig minsta storlek och mobilbredd.
- **Files modified:** `web/app/globals.css`
- **Verification:** WebKit 390 × 844 mätte 33 kontroller och ingen under 44 px.
- **Committed in:** `2ed4389`

---

**Total deviations:** 6 auto-fixed (6 bug/correctness, varav 1 tillgänglighetsfel)
**Impact on plan:** Ändringarna krävdes för korrekt epokhantering, entydiga kontroller, synliga arbetsflöden och fasens mobil-/tillgänglighetskrav. Ingen ny produktomfattning lades till.

## Issues Encountered

- Lokal webbläsarautomation och pilotportar behövde köras utanför filsandboxen eftersom lyssning annars gav `EPERM`. Den isolerade lokala testmiljön startade korrekt och samtliga verifieringar slutfördes.
- Den befintliga fullsviten skriver React-varningar om nycklar i äldre `OrganisationWorkspace`/`TimplanView`. De fanns utanför planens filer och påverkade inte utfallet.

## Known Stubs

Inga målhindrande stubbar hittades. Navigationsmålen för elev- och planeringsfunktioner visar avsiktligt "Stängt i denna fas" enligt planen tills mandat och elevregister verifieras i fas 3–4.

## User Setup Required

None - no external service configuration required. Verifieringen använder projektets befintliga lokala syntetiska pilotmiljö.

## Next Phase Readiness

- Plan 02-11 kan automatisera de nu manuellt genomgångna browserkontrakten för kontext, fliklås, administration och mobil pekyta.
- Plan 02-12 kan använda samma epok- och step-up-mönster i avslutande fasverifiering.
- Inga blockerare kvarstår för nästa plan.

## Self-Check: PASSED

- Samtliga 11 planerade filer finns.
- Task-commits `e7a78d0`, `7f5c0d3`, `d890011` och `2ed4389` finns i historiken i rätt TDD-ordning.
- Kraven IAM-03 och IAM-04 täcks av verifierade UI- och browserflöden.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-18*
