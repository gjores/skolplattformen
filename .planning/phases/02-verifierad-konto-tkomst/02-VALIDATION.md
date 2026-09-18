---
phase: 2
slug: verifierad-konto-tkomst
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-12
updated: 2026-09-15
---

# Fas 2 — Valideringskontrakt

Detta är planerade kontroller, inte körresultat. BankID-beredskapskomplettering 2026-09-13 har passerat oberoende plangranskning av samtliga 12 planer och 32 uppgiftskommandon. Inga nya krav är körverifierade genom detta dokument.

## Miljö och provverktyg

Node25 enligt research (`export PATH="/opt/homebrew/opt/node@25/bin:$PATH"` om installerat), Docker, Supabase CLI och psql. Hosts-raden enligt D-17 kontrolleras; inget skript ändrar /etc/hosts.
Projektrot: /Users/petter.gjores/dev/skolplattform. Paketrot: web/.

`node work/pilot/prepare-local.mjs --target protected --with-idp` etablerar enbart det disponibla lokala målet. Efter varje ny migration görs målskyddad uppgradering med bevarade fixtures enligt02-05, inte reset i en vanlig testkörning. Ingen molnkonfiguration eller --linked.
`run-sql-tests.mjs` skapas i02-01: målskydd före kopiering/DB-anrop; --file <namn.sql> eller alla, --out <json>, exit0/1/3. Saknade beroenden=BLOCKED, aldrig PASS.
Dev5193, byggd preview3012 och API-provpreview3013 ägs av testkörningen. Dela inte mutable fixtures eller .dev.vars mellan parallella prov. PGPASSFILE/stdin för hemligheter, aldrig lösenord i argv.

## Sampling och beroenden

Efter varje task: dess C-kommando nedan plus relevant modellprov. Efter migration: pgTAP. Efter serverändring från02-04: spiket; från02-09: relevanta API-fall. Efter UI-ändring: relevant browserprov. Full verify:phase2 krävs vid slutgrinden och finns först i02-12.
Snabba modellprov bör hållas under60s, browser/build har uppmätt faktisk tid; inget påhittat 2s-SLA. Syntax/grep är tidig feedback, aldrig tillräckligt säkerhetsbevis. Fullgrinden kräver både positiva och negativa beteendeprov.

| Verktyg | Skapas i | Första användning |
|---|---|---|
| Lokal IdP + run-sql-tests | 02-01 task1 | 02-02 |
| Protected build/start | 02-01 task2 | 02-03 |
| phase2_access.test.sql | 02-02 task3 | Samma task efter skapande |
| Protected Playwright + Keycloakhjälpare | 02-04 task1 | Samma task |
| phase2_audit.test.sql | 02-05 task3 | Samma task |
| identity-provider.test.mjs | 02-03 task2 | Samma task, injicerad testtransport |
| auth-assurance.test.mjs | 02-06 task1 | RED→GREEN i samma task |
| access-rules.test.mjs | 02-06 task1 | RED→GREEN i samma task |
| invitation-rules.test.mjs | 02-07 task1 | RED→GREEN i samma task |
| verify-access.mjs | 02-09 task1–2 | Samma task |
| session-channel.test.mjs | 02-10 task1 | RED→GREEN i samma task |
| phase2-access.spec.ts | 02-11 task1–2 | Samma task |
| verify-phase2.mjs + unitprov | 02-12 task1 | Slutgrind |

Wave0 innebär att provverktyget skapas innan användning; inte en redan utförd extra våg.

## Per-Task Verification Map

C-kommandona nedan är exakt taskens <automated>; PLAN innehåller också beteendeassertioner. Tabellen redovisar samtliga 32 tasks.

| Task | Våg | Krav | Kommando | Resultat |
|---|---|---|---|---|
| 02-01-1 | 1 | IAM-01, IAM-04 | C01.1 | pending |
| 02-01-2 | 1 | IAM-01, IAM-04 | C01.2 | pending |
| 02-01-3 | 1 | IAM-01, IAM-04 | C01.3 | pending |
| 02-02-1 | 2 | IAM-05, ACL-01 | C02.1 | pending |
| 02-02-2 | 2 | IAM-05, ACL-01 | C02.2 | pending |
| 02-02-3 | 2 | IAM-05, ACL-01 | C02.3 | pending |
| 02-03-1 | 3 | IAM-04, IAM-05 | C03.1 | pending |
| 02-03-2 | 3 | IAM-04, IAM-05 | C03.2 | pending |
| 02-03-3 | 3 | IAM-04, IAM-05 | C03.3 | pending |
| 02-04-1 | 4 | IAM-04, IAM-05 | C04.1 | passed 2026-09-14 — 5/5 browserprov; slutligt step-up-bevis `acr=2`, `amr=[pwd,otp]` |
| 02-04-2 | 4 | IAM-04, IAM-05 | C04.2 | godkänt 2026-09-15 — standardinloggning observerad utan OTP; sessionen bar korrekt endast `acr=1`, `amr=[pwd]`, medan separat step-up gav profilbundet OTP-bevis |
| 02-05-1 | 5 | IAM-03, ACL-01, AUDIT-01 | C05.1 | pending |
| 02-05-2 | 5 | IAM-03, ACL-01, AUDIT-01 | C05.2 | pending |
| 02-05-3 | 5 | IAM-03, ACL-01, AUDIT-01 | C05.3 | pending |
| 02-06-1 | 6 | IAM-03, IAM-04, IAM-05, AUDIT-01 | C06.1 | pending |
| 02-06-2 | 6 | IAM-03, IAM-04, IAM-05, AUDIT-01 | C06.2 | pending |
| 02-06-3 | 6 | IAM-03, IAM-04, IAM-05, AUDIT-01 | C06.3 | pending |
| 02-07-1 | 7 | IAM-01, IAM-05 | C07.1 | pending |
| 02-07-2 | 7 | IAM-01, IAM-05 | C07.2 | pending |
| 02-07-3 | 7 | IAM-01, IAM-05 | C07.3 | pending |
| 02-08-1 | 7 | AUDIT-01, ACL-01 | C08.1 | pending |
| 02-08-2 | 7 | AUDIT-01, ACL-01 | C08.2 | pending |
| 02-08-3 | 7 | AUDIT-01, ACL-01 | C08.3 | pending |
| 02-09-1 | 8 | IAM-01, IAM-05, ACL-01, AUDIT-01 | C09.1 | pending |
| 02-09-2 | 8 | IAM-01, IAM-05, ACL-01, AUDIT-01 | C09.2 | pending |
| 02-10-1 | 9 | IAM-03, IAM-04 | C10.1 | pending |
| 02-10-2 | 9 | IAM-03, IAM-04 | C10.2 | pending |
| 02-10-3 | 9 | IAM-03, IAM-04 | C10.3 | pending |
| 02-11-1 | 10 | IAM-03, IAM-04, IAM-05 | C11.1 | pending |
| 02-11-2 | 10 | IAM-03, IAM-04, IAM-05 | C11.2 | pending |
| 02-12-1 | 11 | IAM-01, IAM-03, IAM-04, IAM-05, ACL-01, AUDIT-01 | C12.1 | passed 2026-09-18 — full `verify:phase2` PASS på revision `89055a9`: 168 modellprov, 137 pgTAP, 39 nekade direkta vägar, 14/14 API-fall (63 kontroller), fas 1 browser 26/0 och protected browser 37/0 |
| 02-12-2 | 11 | IAM-01, IAM-03, IAM-04, IAM-05, ACL-01, AUDIT-01 | C12.2 | pending |

## Kravbevis för slutgrinden

| Krav | Obligatoriska beteendeprov |
|---|---|
| IAM-01 | OIDC+MFA+exakt issuer/subject-bunden engångsinbjudan ger endast kundadmin; fel subject/issuer, domän/orgnr, expired/replay och samtidig inlösen ger inget nytt mandat. |
| IAM-03 | Giltiga/framtida/avslutade egna uppdrag och verklig kund/huvudman/skolmetadata; kontextbyte samt stale-epoch/race nekas före data. |
| IAM-04 | Logout med gammal cookie och IdP-bortfall, idle/absolut livstid, alla flikar inklusive fallback/pageshow/sent svar rensade. |
| IAM-05 | API-spärr återkallar (401); separat DB-spärr utan revokering nekar nästa anrop(403). Avslut/giltighet nekar gammal token; MFA/kundgräns. |
| ACL-01 | RLS och relationsconstraints, främmande ID jämfört obefintligt, list/sök/CSV samt stängda PostgREST/GraphQL/Storage-vägar. |
| AUDIT-01 | Aktör och faktiskt uppdrag från server, exakt en event per skrivning, immutable logg, kundgranskning/export, rollback vid loggfel och loggflödningsskydd. |

## Beredskap för senare stark identitetskontroll — tillägg 2026-09-13

| Behov | Ägare och bevis | Status |
|---|---|---|
| Lokal leverantör isolerad, stabil intern identities.id, ingen länkning via e-post/auth_user_id | 02-02 DDL/pgTAP; 02-03 adapterprov; 02-09 samma-epost; 02-11 browser | planerat |
| MFA binds till exakt issuer/client/audience + versionerad lokal profil; ingen generell BankID-/personidentitetsnivå | 02-03 verifierad mapping; 02-04 spik; 02-06 auth-assurance.test; 02-09 mfa-kravs med proof-profile/issuer/audience/time/amr | planerat |
| Step-up binds session/identity/kund/uppdrag/epoch; logout/spärr/byte/avbrott nekar; ingen automatisk POST | 02-03 callback; 02-04 negativt spik; 02-06 live uppdragskontroll; 02-10 återbekräftelse; 02-11 scenario 16–17 | planerat |
| Skyddad proof-proveniens och resultat; klientförfalskning nekas | 02-06 events/deny; 02-09 audit-assertioner; 02-11 scenario 17 | planerat |

Full BankID-integration, val av tillitsnivå för känsliga beslut, verifierad kontolänkning, bindning till beslutsunderlag/version och elektronisk underskrift är separata senare leveranser. Inga sådana flöden får anses aktiverade eller verifierade av dessa lokala prov. 02-12 måste kräva ovanstående namngivna beteendeprov, inte bara testantal/exitkod.

## Manual-Only Verifications

| Plan | Task | Bedömning | Förvillkor | Resultat |
|---|---|---|---|---|
| 02-04 | 2 | Spikets inloggning och tydlighet; reservbeslut vid verkligt tekniskt hinder | Aktuella spike-db/spike-resultat, förberedd visning | godkänt 2026-09-15 — kundöversikten visades; användaren noterade korrekt att standardinloggningen inte frågade efter OTP. Databasbevis visade låg assurance (`acr=1`, `amr=[pwd]`), inte återanvänt eller felmärkt MFA. Känsliga åtgärder ska kräva separat step-up enligt D-03/02-06. |
| 02-12 | 2 | Uppdragsbyte, inbjudan/spärr, granskarlogg, mobil och tangentbord | Full verify:phase2 PASS, förberedd vy/testkonto | pending |

Fysisk telefonåtkomst är separat från automatiskt WebKit-telefonprov: nåbar issuer/origin måste först vara provad. Inget godkännande antas. Checkpoint ersätter inte efterföljande fasverifiering.

## Multi-Source Coverage Audit

| Källa | ID/omfattning | Planer | Täckning |
|---|---|---|---|
| GOAL | Verifierad kontoåtkomst, isolering, spärr och audit | 01–12 | COVERED |
| REQ | IAM-01 | 01,07,09,12 | COVERED |
| REQ | IAM-03 | 05,06,10,11,12 | COVERED |
| REQ | IAM-04 | 01,03,04,06,10,11,12 | COVERED |
| REQ | IAM-05 | 02–04,06,07,09,11,12 | COVERED |
| REQ | ACL-01 | 02,05,08,09,12 | COVERED |
| REQ | AUDIT-01 | 05,06,08,09,12 | COVERED |
| CONTEXT | D-01/02/03/16/17 lokal IdP, identitet, MFA, Worker, hosts | 01–04,06,07,09 | COVERED |
| CONTEXT | D-04/05/06 etablering, kund, avgränsad administration | 02,05,07–09 | COVERED |
| CONTEXT | D-07/08/09 väljare, rensning, giltighet | 05,06,10,11 | COVERED |
| CONTEXT | D-10/11/12/13 server/spärr/audit | 02–09,12 | COVERED |
| CONTEXT | D-14/15 metadataisolering, backendfritt exempel | 01,05,08–12 | COVERED |
| CONTEXT | D-18 ärvt UI, inget nytt UI-SPEC | 10,11 | COVERED |
| RESEARCH | Worker TCP/GoTrue/claims öppna tekniska frågor | 01–04 | COVERED via obligatoriskt spik |
| RESEARCH | Cookie/CSRF/nonce, RLS/atomicitet/backfill, audit/CSV, flikar | 03–11 | COVERED |
| RESEARCH | BankID-beredskap: lokal adapter, proof-profil, kontextbundet step-up, audit utan signaturbevis | 02–04,06,07,09–12 | COVERED, ny granskning väntar |
| RESEARCH | Lokal setup, hemligheter, sanningsenlig slutgrind | 01,09,12 | COVERED |

Verklig kommunanslutning/SCIM och senare mandat/elevregister ligger kvar i sina beslutade faser. Lokala simuleringar uppfyller inte IAM-02/IAM-06.

## Validation Sign-Off

- [x] Alla tasks har automatisk kontroll/förvillkor och namngivna beroenden.
- [x] Ingen skip/blocked räknas som ett verifierat krav.
- [ ] Oberoende planchecker godkänner helheten.
- [x] Kontrollerna genomförda efter implementation — full lokal `verify:phase2` PASS 2026-09-18; användarbedömning och separat fasverifiering återstår.
- [ ] Faktiska användarsvar dokumenterade.

Approval: approved — oberoende gsd-plan-checker godkände BankID-beredskapskompletteringen 2026-09-13. wave_0_complete är false tills infrastrukturen faktiskt genomförts.

## Exakta C-kommandon


### C01.1

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform && grep -qxF '.dev.vars' web/.gitignore && grep -qxF '.dev.vars.*' web/.gitignore && grep -qxF '/dist-protected/' web/.gitignore && node -e "const r=require('./work/pilot/idp/realm-template.json'); if(r.realm!=='skolplattform-test'||r.users.length!==10||!r.duplicateEmailsAllowed||r.loginWithEmailAllowed) process.exit(1); const c=r.clients.find(c=>c.clientId==='skolplattform-worker'); if(!c||c.secret!=='__CLIENT_SECRET__'||!c.redirectUris.includes('http://127.0.0.1:5193/api/auth/callback')) process.exit(1); if(!JSON.stringify(r).includes('__TOTP_SECRET__')||!JSON.stringify(r).includes('oidc-amr-mapper')) process.exit(1)" && ! grep -q 'sudo ' work/pilot/prepare-local.mjs && grep -q 'host.docker.internal' work/pilot/prepare-local.mjs && grep -q 'exit(3)' work/pilot/prepare-local.mjs && grep -q 'quay.io/keycloak/keycloak:26.7.3' work/pilot/prepare-local.mjs && grep -q 'skip_nonce_check = true' work/pilot/prepare-local.mjs && grep -q 'requireIdp' work/pilot/verify-target.mjs && (node work/pilot/prepare-local.mjs --target baseline --with-idp; test $? -eq 1) && ! git -C . ls-files --error-unmatch web/.dev.vars >/dev/null 2>&1
```

### C01.2

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && node --test lib/runtime-mode.test.mjs && npx tsc --noEmit && npx oxlint app lib scripts && grep -q '"openid-client": "6.8.8"' package.json && grep -q '"postgres": "3.4.9"' package.json && grep -q '"otpauth": "9.5.2"' package.json && grep -q '"build:protected"' package.json && grep -q 'dist-protected' scripts/run-mode.mjs && (node scripts/run-mode.mjs preview --mode protected --port 3012 </dev/null; c=$?; test $c -eq 2 -o $c -eq 3) && ! test -e .dev.vars
```

### C01.3

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform && grep -q '^## Skyddad provmiljö' docs/pilot/README.md && grep -q 'host.docker.internal' docs/pilot/README.md && grep -q 'prepare-local.mjs --target protected --with-idp' docs/pilot/README.md && grep -q 'idp-otp.mjs --user anna.admin' docs/pilot/README.md && grep -q 'fas 7' docs/pilot/README.md && grep -q 'OB-02' docs/pilot/README.md && grep -c 'example.test' docs/pilot/README.md | awk '{exit ($1>=10)?0:1}' && ! grep -qiE 'skolfederation.*(godkänd|verifierad|klar)' docs/pilot/README.md
```

### C02.1

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform && f=supabase/migrations/20260913100000_phase2_worker_core.sql && test -f $f && grep -q 'create role skolplattform_worker login nobypassrls noinherit' $f && grep -q 'create table public.app_sessions' $f && grep -q "unique (issuer, subject)" $f && ! grep -qE 'auth_user_id uuid unique' $f && ! grep -qiE '^\s*(delete from|truncate|drop table)' $f && grep -q "current_setting('app.fake_today', true)" $f && grep -c 'to skolplattform_worker' $f | awk '{exit ($1>=10)?0:1}' && (node work/pilot/prepare-local.mjs --target protected >/tmp/prep.log 2>&1; c=$?; test $c -eq 0)
```

### C02.2

```sh
cd /Users/petter.gjores/dev/skolplattform && node work/pilot/run-sql-tests.mjs
```

### C02.3

```sh
cd /Users/petter.gjores/dev/skolplattform && node work/pilot/run-sql-tests.mjs
```

### C03.1

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib scripts && test -f app/api/health/db/route.ts && grep -q 'fetch_types: false' lib/server/db.ts && grep -q "set_config('app.phase', 'login', true)" lib/server/db.ts && grep -q 'for update of s' lib/server/db.ts && ! grep -q 'DATABASE_URL' app/api/health/db/route.ts && test -f ../work/pilot/results/spike-db.json && node -e "const r=require('../work/pilot/results/spike-db.json'); if(JSON.stringify(r).includes('postgresql://')) process.exit(1); process.exit(r.status==='PASS'?0:r.status==='BLOCKED'?3:1)"
```

### C03.2

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib scripts && node --test lib/identity-provider.test.mjs && grep -q 'grant_type=id_token' lib/server/identity-provider.ts && grep -q "provider: 'keycloak'" lib/server/identity-provider.ts && grep -q 'idp_registration_failed' app/api/auth/callback/route.ts && grep -q 'on conflict (issuer, subject)' app/api/auth/callback/route.ts && grep -q 'SameSite=Lax' lib/server/session.ts && ! grep -q 'SameSite=Strict' lib/server/session.ts && grep -q 'export async function POST' app/api/auth/logout/route.ts && grep -q 'assertSameOrigin' app/api/auth/logout/route.ts && grep -q "scope: 'openid profile email'" lib/server/oidc.ts && grep -q 'allowInsecureRequests' lib/server/oidc.ts && (curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: https://annan.example' -H 'Sec-Fetch-Site: cross-site' http://127.0.0.1:5193/api/auth/logout | grep -qx 403)
```

### C03.3

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib scripts && grep -q 'membership_blocked' app/api/kund/oversikt/route.ts && grep -q 'no_context' app/api/kund/oversikt/route.ts && grep -q 'X-Context-Epoch' lib/server/http.ts && ! grep -q 'id_token_hint' app/api/session/route.ts && (curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5193/api/session | grep -qx 401) && (curl -s -o /dev/null -w '%{http_code}' -b 'sp_session=ogiltig' http://127.0.0.1:5193/api/kund/oversikt | grep -qx 401)
```

### C04.1

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib scripts e2e && grep -q 'preview:protected' playwright.protected.config.ts && ! grep -q 'protected' playwright.config.ts && grep -q '"e2e:protected"' package.json && test -f ../work/pilot/results/spike.json && node -e "const r=require('../work/pilot/results/spike.json'); const s=JSON.stringify(r); if(/sp_session=|eyJ[A-Za-z0-9_-]{20,}|postgresql:\/\//.test(s)) process.exit(1); if(r.blocked.statusAfter!==403||r.logout.sessionAfter!==401||!r.login.localProfileVerified||!r.gotrue.authUserIdSet) process.exit(1)"
```

### C04.2

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform && grep -E '02-04 \| 2 .*\| (godkänt|Reservväg|Avvikelse)' .planning/phases/02-verifierad-konto-tkomst/02-VALIDATION.md
```

### C05.1

```sh
cd /Users/petter.gjores/dev/skolplattform && node work/pilot/run-sql-tests.mjs
```

### C05.2

```sh
cd /Users/petter.gjores/dev/skolplattform && node work/pilot/run-sql-tests.mjs
```

### C05.3

```sh
cd /Users/petter.gjores/dev/skolplattform && node work/pilot/run-sql-tests.mjs
```

### C06.1

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && node --test lib/access-rules.test.mjs lib/auth-assurance.test.mjs && npx tsc --noEmit && npx oxlint lib && grep -c "^test(" lib/access-rules.test.mjs | awk '{exit ($1>=12)?0:1}' && ! grep -qE "from '(react|\./server|postgres|openid-client)" lib/access-rules.ts
```

### C06.2

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib && grep -q 'export async function protectedRoute' lib/server/authz.ts && grep -q 'requireSameOrigin' lib/server/authz.ts && grep -q 'hasMfaProof' lib/server/authz.ts && grep -q 'insert into public.security_events' lib/server/events.ts && grep -q 'denied_suppressed' lib/server/events.ts && grep -q 'DENIAL_LIMIT_PER_MINUTE = 20' lib/server/events.ts && grep -q "set_config('app.access_function'" lib/server/db.ts && grep -q "request.jwt.claims" lib/server/db.ts && grep -q "assignment_is_valid" lib/server/db.ts
```

### C06.3

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib && grep -q 'context_epoch + 1' app/api/context/route.ts && grep -q 'context_changed' app/api/context/route.ts && grep -q 'requireSameOrigin' app/api/context/route.ts && grep -q 'protectedRoute' app/api/kund/oversikt/route.ts && grep -q 'assignmentState' app/api/session/route.ts && grep -q "action: 'login'" app/api/auth/callback/route.ts && grep -q "'logout'" app/api/auth/logout/route.ts && (curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'Sec-Fetch-Site: cross-site' -H 'Origin: https://annan.example' -d '{"assignmentId":"00000000-0000-4000-8000-000000000000"}' http://127.0.0.1:5193/api/context | grep -qx 403)
```

### C07.1

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && (cd web && node --test lib/invitation-rules.test.mjs && npx tsc --noEmit && npx oxlint lib) && test -f work/pilot/invite.mjs && grep -q "leverantor:cli" work/pilot/invite.mjs && grep -q 'invitation_issued' work/pilot/invite.mjs && (node work/pilot/invite.mjs --target baseline --subject 30000000-0000-4000-8000-000000000006 --verification-reference local-fixture --person x --issuer http://a --grants kundadmin --customer-name y >/dev/null 2>&1; test $? -eq 1) && TOKEN=$(node work/pilot/invite.mjs --target protected --subject 30000000-0000-4000-8000-000000000006 --verification-reference local-fixture --person "Prov Person" --issuer http://host.docker.internal:8180/realms/skolplattform-test --grants kundadmin --customer-name "Provkund Tmp" --print-only-token) && test ${#TOKEN} -eq 43
```

### C07.2

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib && grep -q 'invitation_invalid' app/api/inbjudan/losen/route.ts && grep -q 'for update' app/api/inbjudan/losen/route.ts && grep -q 'invitation_redeemed' app/api/inbjudan/losen/route.ts && grep -q 'emailMismatch' app/api/inbjudan/losen/route.ts && grep -q 'mfa: true' app/api/kund/inbjudan/route.ts && grep -q "functions: \['kundadmin'\]" app/api/kund/inbjudan/route.ts && ! grep -q 'organizationNumber' app/api/inbjudan/losen/route.ts && (curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H 'Sec-Fetch-Site: same-origin' -d '{"organizationNumber":"5599999901"}' http://127.0.0.1:5193/api/inbjudan/losen | grep -qx 401)
```

### C07.3

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib && grep -q 'mfa: true' app/api/kund/medlemskap/sparr/route.ts && grep -q 'revoked_at = now()' app/api/kund/medlemskap/sparr/route.ts && grep -q 'customer_id = current_customer_id()' app/api/kund/medlemskap/sparr/route.ts && grep -q 'membership_blocked' app/api/kund/medlemskap/sparr/route.ts && grep -q 'ended_by' app/api/kund/uppdrag/avsluta/route.ts && grep -q 'assignment_ended' app/api/kund/uppdrag/avsluta/route.ts && grep -q "functions: \['kundadmin', 'granskare'\]" app/api/kund/medlemmar/route.ts
```

### C08.1

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib && grep -q "functions: \['granskare'\]" app/api/logg/route.ts && grep -q 'log_exported' app/api/logg/route.ts && grep -q 'text/csv' app/api/logg/route.ts && grep -q 'customer_id = current_customer_id()' app/api/logg/route.ts && grep -q 'Content-Disposition' app/api/logg/route.ts
```

### C08.2

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib && grep -q 'organizer_created' app/api/kund/huvudman/route.ts && grep -q 'mfa: true' app/api/kund/huvudman/route.ts && grep -q "set_config('app.organizer_id'" app/api/organisation/route.ts && grep -q 'not_found' app/api/organisation/route.ts && grep -q 'customer_id = current_customer_id()' app/api/organisation/route.ts
```

### C08.3

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib && grep -q 'export async function fetchRegistryUnit' lib/server/skolverket.ts && grep -q "from '../../../lib/server/skolverket.ts'" app/api/skolenhet/route.ts && grep -q 'import_school_unit' app/api/kund/skolenhet/route.ts && grep -q "set_config('app.app_role', 'huvudman', true)" app/api/kund/skolenhet/route.ts && grep -q 'appoint_school_principal' app/api/kund/rektor/route.ts && grep -q 'principal_appointed' app/api/kund/rektor/route.ts && ! grep -qiE 'actorRole|x-app-role' app/api/kund/rektor/route.ts app/api/kund/skolenhet/route.ts
```

### C09.1

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && test -f work/pilot/verify-access.mjs && grep -q "assertTarget('protected')" work/pilot/verify-access.mjs && grep -q 'dist-protected/build-mode.json' work/pilot/verify-access.mjs && grep -q "createHash('sha256')" work/pilot/verify-access.mjs && grep -q 'exit(3)' work/pilot/verify-access.mjs && (cd web && npx oxlint ../work/pilot/verify-access.mjs) && (cd web && npm run build:protected >/dev/null 2>&1) && node work/pilot/verify-access.mjs --case sparr --case uppdrag-avslut --case uppdrag-utgatt --case session --case csrf --case mfa-kravs --out /tmp/access-t1.json && node -e "const r=require('/tmp/access-t1.json'); if(/sp_session=|postgresql:\/\//.test(JSON.stringify(r))) process.exit(1); process.exit(r.status==='PASS'?0:1)"
```

### C09.2

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && (cd web && npx oxlint ../work/pilot/verify-access.mjs) && node work/pilot/verify-access.mjs && node -e "const r=require('./work/pilot/results/access.json'); const names=r.cases.map(c=>c.name); for (const n of ['sparr','uppdrag-avslut','uppdrag-utgatt','session','csrf','mfa-kravs','inbjudan','frammande-id','samma-epost','aktor-forfalskning','logg','logg-flod']) if(!names.includes(n)) process.exit(1); if(/sp_session=|eyJ[A-Za-z0-9_-]{20,}|postgresql:\/\/|[0-9a-f]{64}/.test(JSON.stringify(r))) process.exit(1); process.exit(r.status==='PASS'?0:1)"
```

### C10.1

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && node --test lib/session-channel.test.mjs && npx tsc --noEmit && npx oxlint lib && grep -q "'skolplattform-session'" lib/session-channel.ts && grep -q 'X-Context-Epoch' lib/server-client.ts && grep -q "credentials: 'same-origin'" lib/server-client.ts && grep -q 'useUnsavedChanges' lib/unsaved-changes.tsx && grep -c "^test(" lib/session-channel.test.mjs | awk '{exit ($1>=8)?0:1}'
```

### C10.2

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib && grep -q "runtime.mode === 'protected'" app/page.tsx && grep -q 'Kontexten ändrades i en annan flik' app/protected-home.tsx && grep -q 'Skyddad provmiljö' app/protected-home.tsx && grep -q 'og-unit-switch' app/context-switch.tsx && grep -q 'optgroup' app/context-switch.tsx && grep -q 'Stängt i denna fas' app/protected-home.tsx && grep -q 'Fas 2: skyddad provmiljö' app/globals.css && grep -q 'location.hash' app/inbjudan/page.tsx && ! grep -q 'localStorage' app/protected-home.tsx && node --test lib/*.test.mjs && npm run build:example >/dev/null && npx playwright test --project desktop --grep "provmiljön är märkt|båda exempelskolorna" 2>&1 | tail -3 | grep -q passed
```

### C10.3

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint app lib && grep -q 'Verifiera med engångskod' app/kund-workspace.tsx && grep -q 'Engångslänk' app/kund-workspace.tsx && grep -q 'api/kund/medlemskap/sparr' app/kund-workspace.tsx && grep -q 'api/kund/rektor' app/kund-workspace.tsx && grep -q 'Organisationsnumret ger ingen behörighet' app/kund-workspace.tsx && grep -q 'format=csv' app/logg-workspace.tsx && grep -q 'Exporten registreras som en händelse' app/logg-workspace.tsx && ! grep -q 'window.alert' app/kund-workspace.tsx app/logg-workspace.tsx && grep -q 'KundWorkspace' app/protected-home.tsx && grep -q 'LoggWorkspace' app/protected-home.tsx
```

### C11.1

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint e2e && grep -q 'protected-phone' playwright.protected.config.ts && grep -q 'dev:protected:test' playwright.protected.config.ts && git diff --quiet HEAD -- playwright.config.ts && grep -c "^  test(" e2e/phase2-access.spec.ts | awk '{exit ($1>=8)?0:1}' && grep -q 'Kontexten ändrades i en annan flik' e2e/phase2-access.spec.ts && npx playwright test -c playwright.protected.config.ts --project protected-desktop --grep "startsidan|engångskod|väljaren|kontextbyte|låser|utloggning|frånvaro|osparat" 2>&1 | tail -3 | grep -q passed
```

### C11.2

```sh
set -o pipefail; cd /Users/petter.gjores/dev/skolplattform/web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npx tsc --noEmit && npx oxlint e2e && grep -c "^  test(" e2e/phase2-access.spec.ts | awk '{exit ($1>=15)?0:1}' && grep -q 'Verifiera med engångskod' e2e/phase2-access.spec.ts && grep -q "cecilia@example.test" e2e/phase2-access.spec.ts && grep -q 'organizer_created' e2e/phase2-access.spec.ts && grep -q 'boundingBox' e2e/phase2-access.spec.ts && npm run build:protected >/dev/null 2>&1 && npm run e2e:protected 2>&1 | tail -3 | grep -q passed && node -e "const r=require('./test-results/phase2-e2e.json'); process.exit(r.stats.unexpected===0&&r.stats.expected>=30?0:1)"
```

### C12.1

```sh
cd /Users/petter.gjores/dev/skolplattform/web && node --test scripts/verify-phase2.test.mjs && npm run verify:phase2
```

### C12.2

```sh
cd /Users/petter.gjores/dev/skolplattform && node -e "const fs=require('fs'); const r=JSON.parse(fs.readFileSync('work/pilot/results/phase2-summary.json')); if(r.status!=='PASS')process.exit(1)"
```
