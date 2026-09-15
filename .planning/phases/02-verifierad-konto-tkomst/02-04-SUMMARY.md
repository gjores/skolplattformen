---
phase: 02-verifierad-konto-tkomst
plan: 04
subsystem: auth-testing
tags: [playwright, keycloak, oidc, totp, gotrue, postgres, sessions]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Lokal Keycloak och avskilt protected-mål"
  - phase: 02-03
    provides: "OIDC-klient, GoTrue-registrering och serverlagrad appsession"
provides:
  - "Browserbevis för profilbundet TOTP-step-up med acr=2 och amr=[pwd,otp]"
  - "Körbevis för GoTrue-länkning, omedelbar medlemsspärr och lokal utloggning"
  - "Godkänd mänsklig kontrollpunkt med uttrycklig åtskillnad mellan lösenordssession och MFA"
affects: [02-05, 02-06, 02-09, 02-11, 02-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vanlig inloggning kan ge låg assurance; känsliga åtgärder kräver separat profilbundet step-up"
    - "Browserprov stänger trace och sparar endast minimerade bevisresultat"

key-files:
  created:
    - web/playwright.protected.config.ts
    - web/e2e/helpers/keycloak.ts
    - web/e2e/helpers/pilot-db.ts
    - web/e2e/phase2-spike.spec.ts
    - work/pilot/results/spike.json
    - .planning/phases/02-verifierad-konto-tkomst/02-04-SUMMARY.md
  modified:
    - web/lib/server/oidc.ts
    - web/lib/server/session.ts
    - web/scripts/verify-phase1.mjs
    - work/pilot/idp-otp.mjs
    - work/pilot/idp/realm-template.json
    - work/pilot/prepare-local.mjs
    - web/package.json
    - .planning/phases/02-verifierad-konto-tkomst/02-VALIDATION.md

key-decisions:
  - "Standardinloggningens acr=1/amr=[pwd] är ett korrekt låg-assurance-bevis och får inte tolkas som MFA"
  - "Administrativa åtgärder ska i 02-06 kräva exakt den körverifierade profilen acr=2/amr=[pwd,otp]"
  - "Direkt Postgres-TCP och den byggda OIDC-vägen godkänns för fortsatt fasarbete; ingen reservväg valdes"

patterns-established:
  - "MFA-bevis verifieras separat från att en appsession existerar"
  - "Spikresultat innehåller utfall och anspråk men inga cookies, tokens, databasadresser eller TOTP-hemligheter"

requirements-completed: [IAM-04, IAM-05]

# Metrics
duration: "tidigare automatiserad körning samt 15 min kontrollpunktsutredning"
completed: 2026-09-15
---

# Fas 2 Plan 04: Körbevis och kontrollpunkt för inloggningsflödet

**En verklig lokal browserkedja bevisar TOTP-step-up, GoTrue-länkning, live-spärr och återkallad utloggning; användaren godkände vägen efter att lösenordssession och MFA-bevis skilts åt uttryckligen.**

## Performance

- **Completed:** 2026-09-15
- **Tasks:** 2 av 2
- **Automatiserade browserprov:** 5 av 5 passerade
- **Checkpoint:** godkänd av användaren 2026-09-15

## Accomplishments

- Den byggda Workern genomförde Keycloak-inloggning och separat TOTP-step-up. Slutbeviset i `spike.json` är `acr=2`, `amr=[pwd,otp]` med färsk `auth_time` och exakt lokal profilversion 1.
- GoTrue skapade användarraden och appens externa identitet fick `auth_user_id`. Samma appcookie gav först 200, sedan 403 `membership_blocked` efter spärr, och lokal utloggning gav 401 även när IdP:n var nere.
- Negativa prov nekade saknad session, återanvänd kod, annan subject, ändrad epok, spärr/logout före callback, användaravbrott och IdP-bortfall utan förhöjt bevis eller verksamhetsmutation.
- Användaren såg kundöversikten för Provkund A och godkände kontrollpunkten. Observationen att ingen engångskod visades vid standardinloggningen utreddes innan godkännandet bokfördes.

## Task Commits

1. **Task 1: Protected Playwright, Keycloakhjälpare och browserspik** — `6f30ab9` (test)
2. **Task 1-fix: Keycloak skickar auth_time i ID-token** — `e2657c4` (fix)
3. **Task 2: Godkänd kontrollpunkt med assurance-observation** — `fc3dfb0` (docs)

## Files Created/Modified

- `web/playwright.protected.config.ts` — separat, hemlighetsfri konfiguration för byggt protected-prov.
- `web/e2e/helpers/keycloak.ts` — interaktiv inloggning, TOTP-registrering och färsk kod utan testtrace.
- `web/e2e/helpers/pilot-db.ts` — målskyddade databasfixturer utan lösenord i argument.
- `web/e2e/phase2-spike.spec.ts` — positiva och negativa browserbevis för identitet, session, spärr och utloggning.
- `work/pilot/results/spike.json` — daterat minimerat PASS-resultat utan autentiseringshemligheter.
- `.planning/phases/02-verifierad-konto-tkomst/02-VALIDATION.md` — C04.1 och C04.2 samt den mänskliga kontrollpunkten dokumenterade.

## Decisions Made

- Kontrollpunkten fortsätter på direkt Postgres-TCP och den byggda OIDC-vägen. `spike-db.json` var PASS, så varken Hyperdrive eller PostgREST med Worker-mintad JWT valdes.
- En vanlig inloggning är inte i sig administrativ MFA. En isolerad färsk webbläsare och sanitiserad databaskontroll visade att lösenord utan OTP skapade en session med `acr=1`, `amr=[pwd]`; sessionen hade inte återanvänt eller felmärkt MFA.
- Detta överensstämmer med D-03: MFA krävs för känsliga administrativa åtgärder. Kundöversikten som användaren såg är den nuvarande läsvägen. Plan 02-06 måste neka administrativa vägar tills samma session genomfört separat step-up med exakt `acr=2`, `amr=[pwd,otp]`, rätt profil och giltig `auth_time`.
- Kontrollpunktens formulering om att standardinloggningen alltid skulle visa en OTP-sida var därför för förenklad. Valideringsresultatet bevarar användarens observation så att den lägre nivån inte senare kan räknas som MFA.

## Deviations from Plan

Ingen arkitektur eller reservväg ändrades. Kontrollpunktens manuella instruktion preciserades genom körd utredning av standardinloggningens faktiska assurance. Ingen appkod ändrades efter kontrollpunkten.

## Issues Encountered

- Användaren fick ingen OTP-fråga vid vanlig inloggning. En helt ny isolerad browser reproducerade beteendet, och databasen visade `acr=1`, `amr=[pwd]`. Det var alltså varken en dold Keycloak-MFA-session eller ett falskt OTP-bevis.
- Den automatiserade spiken går därefter genom den separata step-up-vägen och verifierar `acr=2`, `amr=[pwd,otp]`. Den skillnaden måste vara tydlig i kommande gränssnitt: känsliga åtgärder ska visa "Verifiera med engångskod" och får inte fortsätta automatiskt efter verifieringen.

## Authentication Gates

- Den tidigare manuellt tillagda hosts-raden gjorde den lokala Keycloak-utfärdaren nåbar.
- Ingen ny autentiseringsgrind återstår för plan 02-04.

## Known Stubs

- Serverns `requireMfa` och de känsliga administrativa routes som använder regeln byggs i plan 02-06 och senare. Plan 02-04 bevisar step-up-mekaniken men öppnar inga sådana mutationer.

## Threat Flags

Inga nya nätverks- eller autentiseringsytor infördes vid kontrollpunkten. Utredningen läste endast minimerade bevisfält ur den lokala syntetiska provdatabasen.

## Verification

- Protected Playwright: 5/5 PASS mot byggd Worker.
- `work/pilot/results/spike.json`: lokal profil verifierad, `acr=2`, `amr=[pwd,otp]`, GoTrue-länkning sann, spärr 403, utloggning 401 och inga främmande browservärdar.
- C04.1 och C04.2: PASS 2026-09-15.
- `npx tsc --noEmit` och `npx oxlint app lib scripts e2e`: PASS efter kontrollpunkten.
- `.planning/REQUIREMENTS.md` är oförändrad; full kravverifiering sker först i fasens slutgrind.

## Next Phase Readiness

- Plan 02-05 kan bygga den fulla uppdrags- och säkerhetshändelsemodellen på den godkända sessionsvägen.
- Plan 02-06 måste behandla `acr=1`, `amr=[pwd]` som otillräckligt för alla känsliga administrativa åtgärder och endast acceptera den exakta, färska lokala TOTP-profilen.
- Proven använder syntetiska lokala data. De är ingen verklig kommunanslutning, BankID-verifiering eller elektronisk underskrift.

## Self-Check: PASSED

Kontrollerat 2026-09-15: alla sex centrala skapade filer finns; commits `6f30ab9`, `e2657c4` och `fc3dfb0` finns i Git; C04.1/C04.2, TypeScript, oxlint och `git diff --check` passerar.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-15*
