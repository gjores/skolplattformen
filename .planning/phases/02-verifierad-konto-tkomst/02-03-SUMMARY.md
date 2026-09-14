---
phase: 02-verifierad-konto-tkomst
plan: 03
subsystem: worker-auth-session
tags: [cloudflare-workers, postgres-js, oidc, keycloak, gotrue, sessions, rls]

# Dependency graph
requires:
  - phase: 02-01
    provides: "Lokal Keycloak, protected-körläge och privata Worker-bindningar"
  - phase: 02-02
    provides: "Worker-roll, identiteter, medlemskap, appsessioner och RLS"
provides:
  - "Bevisad Postgres-TCP från vinext dev och byggd Worker som skolplattform_worker"
  - "PKCE/state/nonce-validerad OIDC-start och fail-closed GoTrue-registrering"
  - "Opak serverlagrad appsession med glidande 15 minuter och absolut 8 timmar"
  - "Sessionsvy och skyddat kundanrop som prövar medlemskap vid varje anrop"
affects: [02-04, 02-05, 02-06, 02-09, 02-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Postgres-klient skapas och avslutas per Worker-begäran; workerd-I/O återanvänds inte över begäransegränsen"
    - "OIDC-verifiering och GoTrue-registrering är skilda steg; båda måste lyckas före appsession"
    - "Identitetsbevis binds till exakt lokal issuer, klient, audience och profilversion"
    - "Cookien bär bara slumpvärde; rättighet och spärrstatus läses servervägen vid varje anrop"

key-files:
  created:
    - web/lib/server/env.ts
    - web/lib/server/http.ts
    - web/lib/server/oidc.ts
    - web/lib/server/identity-provider.ts
    - web/lib/server/session.ts
    - web/lib/identity-provider.test.mjs
    - web/app/api/health/db/route.ts
    - web/app/api/auth/login/route.ts
    - web/app/api/auth/callback/route.ts
    - web/app/api/auth/logout/route.ts
    - web/app/api/session/route.ts
    - web/app/api/kund/oversikt/route.ts
    - work/pilot/results/spike-db.json
  modified:
    - web/lib/server/db.ts

key-decisions:
  - "Direkt Postgres-TCP behålls eftersom både dev och byggd Worker nådde protected-målet med RLS; reservvägarna behövde inte aktiveras"
  - "Postgres-klienten får inte ligga i modulscope i workerd utan skapas och avslutas inom varje begärans transaktion"
  - "Den lokala tillitsprofilen är version 1 och accepterar endast exakt Keycloak-issuer, klient/audience skolplattform-worker och den planerade LoA 2-profilen"

patterns-established:
  - "Skyddade svar får korrelations-ID, no-store och kontextepok men aldrig token, hash eller auth_user_id"
  - "Step-up binds till befintlig session, identitet, issuer+subject, medlemskap, kund, uppdrag och epok"

requirements-completed: [IAM-04, IAM-05]

# Metrics
duration: 70min
completed: 2026-09-14
---

# Fas 2 Plan 03: Workeranslutning, OIDC och appsession Summary

**Den byggda Workern når protected-databasen med den RLS-begränsade Worker-rollen och har nu en profilbunden OIDC-väg, återkallningsbar opak session samt ett skyddat anrop som nekar samma cookie direkt när medlemskapet spärras.**

## Performance

- **Duration:** cirka 70 min inklusive verkliga dev-, preview- och felprov
- **Completed:** 2026-09-14
- **Tasks:** 3 av 3
- **Files:** 13 skapade och 1 kompletterad

## Accomplishments

- Databasspiken gav PASS i både `vinext dev` på port 5193 och byggd Worker på port 3012. Båda svarade HTTP 200 som `skolplattform_worker` och såg 0 kunder utan sessionskontext, vilket bevisar RLS. Stoppad databas gav säkert HTTP 503 utan anslutningssträng i svar eller logg.
- OIDC-starten använder discovery, PKCE, state och nonce. Den lokala adaptern kräver exakt issuer, klient, audience och profilversion innan den registrerar ID-token hos GoTrue. Registreringsfel stänger inloggningen.
- Appsessionen använder en 32-byte opak httpOnly-cookie, SHA-256 i databasen, 15 minuters glidande livstid och högst 8 timmars absolut livstid. Step-up är bunden till den ursprungliga sessionens identitet och arbetskontext.
- Samma redan utfärdade cookie gav HTTP 200 för Provkund A, HTTP 403 `membership_blocked` direkt efter databasens spärr och HTTP 200 efter kontrollerad återställning. Paret passerade i både dev och byggd Worker.
- Sessionsvyn visar identitet, MFA-anspråk, medlemskap, vald kontext och epok utan `auth_user_id`, tokenhash eller ID-token.

## Task Commits

1. **Task 1: Worker-TCP och beslutsgrind** — `d2233d3` (feat)
2. **Task 2: OIDC, GoTrue-adapter och serverlagrad session** — `aa5cd0c` (feat)
3. **Task 3: Sessionsvy, live-spärr och skyddat kundanrop** — `b928329` (feat)
4. **Avgränsad källkodsfix efter slutscan** — `1484fee` (fix)

## Files Created/Modified

- `web/lib/server/env.ts`, `http.ts`, `db.ts` — stängt protected-kontrakt, säkra HTTP-svar och begäransbunden Postgres-anslutning.
- `web/lib/server/oidc.ts`, `identity-provider.ts` — OIDC-klient och liten lokal Keycloak/GoTrue-adapter med versionsbundet beviskontrakt.
- `web/lib/server/session.ts` — cookieformat, hashning, förseglat login-state, sessionsskapande, läsning, step-up och återkallelse.
- `web/app/api/health/db/route.ts` — TCP- och RLS-hälsa utan känsliga feluppgifter.
- `web/app/api/auth/{login,callback,logout}/route.ts` — OIDC-start, callback och POST-baserad utloggning.
- `web/app/api/session/route.ts`, `web/app/api/kund/oversikt/route.ts` — minimerad sessionsvy och första skyddade kundläsningen.
- `web/lib/identity-provider.test.mjs` — fyra prov av profilkontrakt, felaktiga claims, fail-closed registrering och samma e-post med skilda subjects.
- `work/pilot/results/spike-db.json` — PASS-resultat för dev och preview utan anslutningsuppgifter.

En egen `cloudflare-workers.d.ts` behövdes inte; projektets befintliga `@cloudflare/workers-types` löste importen.

## Decisions Made

- Direkt TCP är vald för fortsatt fasarbete. Båda obligatoriska Worker-vägarna passerade, så Hyperdrive och PostgREST med Worker-mintad JWT förblir oanvända reservvägar.
- Modulcache för OIDC-konfigurationen är säker att återanvända eftersom den inte bär begäransbundet nät-I/O efter discovery. Postgres-klienten skapas däremot per begäran och avslutas uttryckligen.
- GoTrue-sessionens access- och refresh-token sparas inte. GoTrue används endast för identitetsregistrering; appsessionen är den enda driftssessionen.
- TOTP/MFA i den lokala profilen är tekniskt verifieringsunderlag och påstår varken BankID-identitet, beslutsmandat eller elektronisk underskrift.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Avslutade Postgres-klienten inom varje Worker-begäran**
- **Found during:** Task 3:s första fleranropsprov
- **Issue:** Planens modulcachade postgres.js-klient fungerade för första anropet men workerd nekade nästa anrop eftersom dess nät-I/O hade skapats i en annan begäranskontext.
- **Fix:** `sql()` skapar en ny begränsad klient; `withLoginPhase`, `withSessionContext` och hälsorouten avslutar den i `finally`.
- **Files modified:** `web/lib/server/db.ts`, `web/app/api/health/db/route.ts`
- **Verification:** Hela dev-matrisen och byggd Workers 200→403→200 passerade utan cross-request-varning.
- **Committed in:** `b928329`

**2. [Rule 1 - Bug] Tog bort ett oavsiktligt binärt kontrolltecken ur returnTo-regexen**
- **Found during:** Slutlig fil- och stubbscan
- **Issue:** Ett verktygsescape hade skrivit kontrolltecknet som rå byte i källfilen trots att valideringen fungerade, vilket fick Git att klassificera filen som binär.
- **Fix:** Skrev kontrollteckenintervallet som läsbar `\\u0000-\\u001f`-källtext och behöll uttrycklig blockering av backslash.
- **Files modified:** `web/app/api/auth/login/route.ts`
- **Verification:** `file` rapporterar UTF-8-text; TypeScript, oxlint och båda byggena passerar.
- **Committed in:** `1484fee`

---

**Total deviations:** 2 auto-fixade Rule 1-fel.
**Impact on plan:** Rättningarna gör den valda Worker-arkitekturen stabil över flera begäranden och håller login-routen granskningsbar utan att ändra produktomfattning.

## Issues Encountered

- Vinext stoppar en helt främmande `Origin` före route-handlern med plain HTTP 403. Routens egen `assertSameOrigin` verifierades separat med motsägande same-site-header och gav 403 `csrf`; båda lagren nekar anropet.
- Den fullständiga interaktiva Keycloak/TOTP-inloggningen och GoTrue-registreringen i körd kedja ägs fortsatt av plan 02-04:s kontrollpunkt. Här är OIDC-start, callbackens negativa vägar och adapterkontrakt körverifierade; detta är ingen faktisk kommun-IdP- eller BankID-anslutning.

## Authentication Gates

Ingen ny autentiseringsgrind uppstod. Den tidigare godkända hosts-raden och den lokala protected-miljön fanns på plats.

## Known Stubs

Inga stubbar hindrar planens mål. Full browserinloggning, uppdragsmodell, säkerhetslogg och administrativa MFA-regler ligger uttryckligen i efterföljande fas 2-planer.

## Verification

- `work/pilot/results/spike-db.json`: PASS; dev HTTP 200 och preview HTTP 200 som `skolplattform_worker`, `customers=0`.
- Stoppat protected-mål: HTTP 503 `db_unreachable`; serverloggen innehöll endast felklass och korrelations-ID.
- Auth i dev: login 302 med PKCE/state/nonce och Lax-cookie; step-up utan session 401; callback utan login-state 400; logout GET 405, CSRF 403 och same-origin POST 200.
- Auth i byggd Worker: login 302, callback utan login-state 400 och idempotent logout 200.
- Sessioner i dev: 401 utan cookie, 401 okänd cookie, Gustav 200→403→200, Erik 403 `no_context` och sessionsvy 200, utgången 401, återkallad 401; glidande livstid flyttades till mer än 14 minuter.
- Sessioner i byggd Worker: Gustav 200→403→200 med samma cookie och `X-Context-Epoch: 1`.
- `node --test lib/*.test.mjs`: 112/112 PASS, inklusive 4 nya adapterprov.
- `npx tsc --noEmit` och `npx oxlint app lib scripts`: PASS.
- `npm run build:example` och `npm run build:protected`: PASS; senaste exempelmarkör är `mode: example` och senaste protected-markör är `mode: protected`.
- Inga `.dev.vars`, byggkataloger eller målmanifest är ospårade; genererade kataloger förblir ignorerade.

## Next Phase Readiness

- Plan 02-04 kan nu köra den fullständiga browserkedjan med Keycloak, TOTP och GoTrue samt bekräfta faktisk `acr`/`amr`-profil innan administrativa vägar öppnas.
- Plan 02-05 kan lägga uppdrag och säkerhetshändelser ovanpå den verifierade sessions- och kundkontexten.
- Proven använder endast syntetiska lokala data och utgör ingen verklig kommunanslutning, BankID-verifiering eller elektronisk underskrift.

## Self-Check: PASSED

Kontrollerat 2026-09-14: alla 13 skapade filer finns; commits `d2233d3`, `aa5cd0c`, `b928329` och `1484fee` finns i Git; dev- och preview-proven passerar; arbetsytan var ren före denna SUMMARY.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-14*
