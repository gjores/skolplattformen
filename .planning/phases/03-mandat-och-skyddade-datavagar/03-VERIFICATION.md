---
phase: 03-mandat-och-skyddade-datavagar
verified: 2026-09-27T20:22:48Z
status: passed
score: 12/12 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-01-PLAN.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-01-SUMMARY.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-02-PLAN.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-02-SUMMARY.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-03-PLAN.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-03-SUMMARY.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-04-PLAN.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-04-SUMMARY.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-05-PLAN.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-05-SUMMARY.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-06-PLAN.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-06-SUMMARY.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-07-PLAN.md
  - .planning/phases/03-mandat-och-skyddade-datavagar/03-07-SUMMARY.md
  - supabase/migrations/20260924130000_phase3_mandate_policy.sql
  - supabase/migrations/20260924190000_phase3_mandate_cutover.sql
  - supabase/migrations/20260924200000_phase3_audit_retention.sql
  - supabase/migrations/20260926100000_phase3_pupil_probe_worker_read.sql
  - supabase/migrations/20260927090000_phase3_support_groups.sql
  - web/app/api/context/route.ts
  - web/app/api/inbjudan/losen/route.ts
  - web/app/api/kund/anslutning/route.ts
  - web/app/api/kund/inbjudan/route.ts
  - web/app/api/kund/mandat/route.ts
  - web/app/api/kund/rektor/route.ts
  - web/app/api/kund/uppdrag/avsluta/route.ts
  - web/app/api/prov/elev/route.ts
  - web/app/api/prov/export/route.ts
  - web/app/mandate-workspace.tsx
  - web/app/protected-home.tsx
  - web/e2e/phase3-mandates.spec.ts
  - web/lib/access-rules.ts
  - web/lib/mandate-policy.ts
  - web/lib/server/audit-details.ts
  - web/lib/server/authz.ts
  - web/lib/server/db.ts
  - web/lib/server/events.ts
  - web/lib/server/mandates.ts
  - web/lib/server/pupil-probe.ts
  - web/scripts/verify-phase3.mjs
  - work/pilot/collect-denials.mjs
  - work/pilot/results/phase3-summary.json
  - work/pilot/verify-mandates.mjs
covered_digest: "v1:sha256:01cab19ed29ae9d389c325732a49df0a5cdc38d0e631dc5ff9e3a0422e88a36a"
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 0
  total: 0
  not_honored: []
human_verification:
  - test: "Logga in som p3.elevhalsa.skola, p3.elevhalsa.elev och p3.elevhalsa (ärende) i previewn (http://127.0.0.1:3000) och öppna Syntetiskt elevprov."
    expected: "Skolscope visar skolans elever men ingen export; elevscope visar exakt den tilldelade eleven; ärendescope visar ingen lista, bara eleven via det tilldelade ärendet. Omfattningen är begriplig i vyn."
    why_human: "Beteendet är automatiskt bevisat (API health-school/-pupil/-case, mandatbrowser 3 projekt), men checkpointen 03-07 bad uttryckligen om bedömning av elevhälsoavgränsningen och användarens godkännande 2026-09-27 nämner den inte."
  - test: "Logga in som p3.it, pausa den lokala anslutningen, prova den, aktivera och prova igen."
    expected: "Provet nekas vid paus och ger syntetiskt OK när anslutningen är aktiv. Menyn saknar elevprov, och inga elevuppgifter visas."
    why_human: "Automatiskt bevisat (it-admin 7/7, browser 'IT pausar och provar anslutning utan elevinsyn'), men ingick i checkpointens instruktion och nämndes inte i godkännandet."
  - test: "Granska loggfelssituationen och säkerhetsloggen: låt pilotansvarig visa det automatiska loggfelsprovet (eller spärra loggskrivningen lokalt enligt phase3-workspace-specen) och logga sedan in som p3.granskare."
    expected: "Vid loggfel visas 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.' med referens och inga elevuppgifter. Granskaren ser lärarens läsning, administratörens export och nekandet, utan elevnamn i vy eller CSV."
    why_human: "Felmeddelandets tydlighet och granskarens arbetsflöde är en användarbedömning. Checkpointen 03-07 bad uttryckligen om granskning av loggfelssituationen; godkännandet nämner den inte."
---

# Fas 3: Mandat och skyddade datavägar — verifieringsrapport

**Fasmål:** Varje personalroll kan utföra sitt tillåtna uppdrag, och pilotens åtkomst går att granska utan att alternativa datavägar kringgår skydd eller loggning.
**Verifierad:** 2026-09-27T20:22:48Z
**Status:** human_needed
**Omverifiering:** Nej, första verifieringen.
**Omfattning:** Lokalt och syntetiskt (protected-målet på 127.0.0.1:56321, lokal Keycloak). Verklig IdP, kommunanslutning, fysisk telefon, verkliga supportsyften och verklig lagringstid är öppna beslut. Inget framgångskriterium kräver dem, så de räknas inte som luckor i fas 3.

## Metod och egna körningar

SUMMARY-filernas påståenden har inte använts som bevis. Följande kördes eller lästes direkt i denna verifiering:

| Kontroll | Resultat |
|---|---|
| Kodgranskning av authz, pupil-probe, prov/elev, prov/export, kund/mandat, kund/rektor, context, db.ts, audit-details och migrationerna för policy, cutover, worker-read och supportgrupper | Stämmer med kontraktet (se sanningarna nedan) |
| `node work/pilot/run-sql-tests.mjs --out <scratch>` (alla 10 SQL-filer, lokalt protected-mål, rollback) | **PASS**, 565 prov |
| `node --test lib/*.test.mjs lib/server/*.test.mjs scripts/verify-phase3.test.mjs ../work/pilot/collect-denials.test.mjs` | **PASS**, 337/337 |
| `npx tsc --noEmit`, `npx oxlint app lib` | **PASS** (exit 0) |
| Källträdets fingeravtryck, beräknat nu med grindens egen funktion | `sha256:33ac730e…4123`, **identiskt** med den committade grinden på 278f235 |
| `git diff 278f235 HEAD` | Bara planering, docs/pilot och resultatfiler. Ingen app-, SQL- eller provkod har ändrats efter den gröna grinden |
| `work/pilot/results/phase3-summary.json` | PASS, alla 25 obligatoriska steg PASS, sex krav PASS, revision 278f235, scope `local-synthetic-only` |
| `work/pilot/results/phase3-api.json` | 26/26 fall, 139 kontroller, 0 misslyckade, Worker byggd från 278f235 |
| `work/pilot/results/phase3-denials.json` | PASS: REST, RPC, Storage och SQL; avbrott för Kong, Storage och Postgres; inga blockerare |

API- och browserproven kördes inte om här. De skriver i den lokala databasen och tar cirka 30 minuter. Grindens resultat godtas som bevis eftersom källträdets fingeravtryck nu är byte-identiskt med det som passerade.

## Måluppfyllelse

### Observerbara sanningar

| # | Sanning | Status | Bevis |
|---|---|---|---|
| 1 | SC1: Huvudmannen utser rektor; rektor kan inte skapa rektorsmandat för sig själv eller andra (ACL-03) | ✓ VERIFIED | `kund/rektor` kräver `huvudman` + MFA och går via `phase3_grant_mandate`. `phase3_mandate_is_valid` tillåter bara barnet `rektor` under föräldern `huvudman` och nekar samma identitet. Den gamla `appoint_school_principal` är återkallad för Workern (cutover). API principal-chain: rektor och kundadmin får 403/403/403, direkt RPC ger 42501 och direkt INSERT ger 42501. Browser: "huvudman utser rektor" × 3 projekt |
| 2 | SC2: Rektor ger och avslutar läraruppdrag bara inom egna skolor och tider; huvudman nekas (ACL-02) | ✓ VERIFIED | Kedjeprövningen kräver att barnets skolor och giltighet ryms inom förälderns. API: annan skola och huvudman som tilldelare ger 403/403, avslutet ger 200. `self-escalation` ger större skolmängd 403. `parent-revoked` nekar underordnade direkt utan bakgrundsjobb. `invitation-recheck` 5/5. Browser: "rektor ger och avslutar läraruppdrag" |
| 3 | SC3: Lärare och skoladministratör följer matrisen; okänd eller saknad rättighet nekas även vid direkt anrop (ACL-04) | ✓ VERIFIED | Urvalet görs i SQL (`phase3_read_pupils` → `phase3_pupil_in_scope`) före svaret. Export kräver `administrator` både i routen och i SQL. API teacher-group (egen grupp, mentorsgrupp, 404 för främmande), school-admin (egen skola, export no-store) och foreign-object. Direkt REST, RPC, SQL och Storage nekas. Modellprov för unknown-action, foreign-field och unknown-scope ingår i 337 PASS |
| 4 | SC4: IT hanterar anslutningen utan elevinsyn; support upphör vid sluttid och går att följa (ACL-05) | ✓ VERIFIED | API it-admin 7/7: pausa, aktivera och prova; 409 vid gammal version; elevväg, export och delegering 403. support-boundary: före start, vid och efter sluttid nekas utan innehåll; syfte, högst 60 minuter och rektorsgodkännande krävs. support-groups 9/9 (användarbeslutet 2026-09-27): en skola, grupper utan elev, gruppmedlemskap styr och sluttiden nekar. Browser täcker både elev- och gruppsupport |
| 5 | SC5: Säkerhetsfunktionen följer elevläsningar, exporter och nekanden, även via alternativa vägar. Pilotansvarig kan kontrollera åtkomst, minimering, lagringstid och loggbortfall (AUDIT-02, AUDIT-03) | ✓ VERIFIED | `protectedRoute` skriver `logEvent` i samma transaktion före `responseFromResult`; loggfel ger `AuditUnavailable`, rollback och 500 utan innehåll. audit-read-fail, audit-export-fail, audit-deny-fail och audit-write-rollback är alla PASS. audit-flood: 28 nekanden ger 28 händelser utan undertryckning. audit-minimization: 238 händelser utan namn eller fritext, allowlistade nycklar och granskaren begränsad till egen kund. audit-retention: gränsen före, vid och efter 30 dygn är korrekt, och ingen approll kan radera. Källbevis för de fyra direktvägarna och tre avbrott. Browser: granskaren följer läsning, export och nekande; loggfel stoppar läsningen |
| 6 | 03-01: Varje föreslagen åtgärd ger uttryckligt tillåt eller neka; saknade rättigheter ger nej | ✓ VERIFIED | `decideMandate` i `web/lib/mandate-policy.ts` (290 rader) och 668 rader prov med positiva och negativa namngivna fall. Ingår i 337 PASS |
| 7 | 03-02: Databasen nekar mandat som överskrider tilldelarens skolor, tid eller delegationsrätt | ✓ VERIFIED | `phase3_mandate_is_valid` prövar kedjan med tid, skolor, kund, huvudman, självutökning och cykel. FK binder `mandate_groups` till mandatets skolor. `assignment_is_valid` delegerar sedan cutover till fas 3-prövningen. SQL 565 PASS |
| 8 | 03-03: Huvudman utser rektor; rektor tilldelar personal och godkänner avgränsad support; IT får ingen generell elevinsyn | ✓ VERIFIED | Se 1, 2 och 4. Inlösen går via `phase3_redeem_invitation`, som prövar mandatet igen. Sessionen prövar aktuell kedja vid varje anrop (`db.ts` → `assignment_is_valid` → `phase3_mandate_is_valid`) |
| 9 | 03-04: Skyddad läsning lämnar inget innehåll vid loggfel; även nekade alternativa vägar är spårbara | ✓ VERIFIED | Se 5. Innehållet minimeras med slutna värdescheman i `audit-details.ts` |
| 10 | 03-05: Personal kan pröva tillåten elevläsning och rektor hantera mandat i en märkt syntetisk arbetsyta | ✓ VERIFIED | `mandate-workspace.tsx` hämtar `/api/kund/mandat`. `mandate-grant-dialog.tsx` postar till `kund/mandat` och `kund/rektor`. Browsersviterna fas3-arbetsyta (18) och fas3-mandat (45) är PASS |
| 11 | 03-06: Varje faskrav har färska maskinella bevis; saknade eller gamla resultat ger inte godkänt | ✓ VERIFIED | `verify-phase3.mjs` kontrollerar revision, fingeravtryck, obligatoriska steg, exakt fallmängd och tillåtna hopp. Grindens enhetsprov med saknade, gamla och falskt gröna delrapporter ingår i 337 PASS. Körningen på 4fb5773 gav faktiskt FAIL, så grinden gav inte ett falskt PASS |
| 12 | 03-07: Användaren kan granska mandatflöden och spårbarhet med synliga skillnader mellan syntetiskt prov och verklig drift | ✓ VERIFIED | Användaren godkände det förnyade provet 2026-09-27. `docs/pilot/phase3-mandates.md` skiljer implementation, syntetiskt bevis och ej beslutad verklig drift. Handbokens sidor anger syntetisk status. docs-bygget är PASS i grinden |

**Poäng:** 12/12 sanningar verifierade (0 med obekräftat beteende).

### Nödvändiga artefakter

| Artefakt | Status | Detaljer |
|---|---|---|
| `docs/pilot/mandatmatris.md` | ✓ (inaktuell rad) | Supportraden säger fortfarande "exakt en elev" (se varningar) |
| `web/lib/mandate-policy.ts` + test | ✓ | Innehållsrik och prövad |
| `supabase/migrations/20260922100000_phase3_mandates.sql` + kedje-, bindnings- och policymigrationer | ✓ | 19 fas 3-migrationer, tillämpade lokalt |
| `supabase/tests/phase3_*.test.sql`, `work/pilot/sql/phase3-fixtures.sql` | ✓ | 7 fas 3-filer, PASS |
| `web/lib/server/mandates.ts`, `access-rules.ts`, `kund/mandat`, `kund/inbjudan`, `kund/rektor`, `kund/uppdrag/avsluta` | ✓ | Kopplade till protectedRoute och SQL |
| `supabase/migrations/20260922200000_phase3_audit.sql` | ℹ️ annat namn | Levererad som `20260924200000_phase3_audit_retention.sql` och `20260924210000_phase3_audit_maintenance_operator.sql` (redovisat i 03-04-SUMMARY) |
| `web/lib/server/authz.ts`, `events.ts`, `collect-denials.mjs`, `docs/pilot/loggpolicy.md` | ✓ (inaktuell status i loggpolicy.md) | Se varningar |
| `pupil-probe.ts`, `prov/elev`, `prov/export`, `mandate-workspace.tsx`, `protected-home.tsx` | ✓ | Kopplade och prövade |
| `verify-mandates.mjs`, `verify-phase3.mjs` + test, `package.json` verify:phase3 | ✓ | |
| `web/e2e/phase3-mandates.spec.ts`, `playwright.protected.config.ts`, `docs/pilot/phase3-mandates.md`, `03-VALIDATION.md` | ✓ | 15 titlar × 3 projekt och testMatch i toppnivån och i alla tre projekt |

### Nyckelkopplingar

GSD-verktygets automatiska kopplingskontroll matchar bokstavliga sökvägar och missar därför relativa importer. Kopplingarna kontrollerades manuellt:

| Från | Till | Status | Detaljer |
|---|---|---|---|
| mandate-policy.test.mjs | mandate-policy.ts | WIRED | `import { decideMandate } from './mandate-policy.ts'` |
| access_assignments | assignments/assignment_units | WIRED | `staff_assignment_bindings` med FK (`20260922120000`) och `phase3_staff_binding_is_valid` i kedjeprövningen |
| inbjudan/losen | mandatkontroll | WIRED (via SQL) | `phase3_redeem_invitation` prövar mandatet igen; API-fallet invitation-recheck är PASS |
| context/route + db.ts | live-giltighet | WIRED | `assignment_is_valid` → `phase3_mandate_is_valid` sedan cutover; kontextbyte tar kundlås |
| kund/rektor | utnämning | WIRED (alternativ) | `phase3_grant_mandate` i stället för `appoint_school_principal`; den gamla vägen är återkallad (42501-prov) |
| authz.ts | events.ts | WIRED | `logEvent(tx, …)` före `responseFromResult`, `logDenied` i `denyResponse` |
| collect-denials.mjs | Docker-loggar | WIRED | `docker logs` per verifierad källa; rotation eller lucka ger BLOCKED |
| mandate-workspace.tsx | /api/kund/mandat | WIRED | GET i arbetsytan, POST i dialogen |
| prov/elev → pupil-probe.ts → phase3_probe_pupils | | WIRED | Scope i SQL före svaret |
| verify-phase3.mjs | verify-mandates.mjs | WIRED | `REQUIRED_CASES` importeras; ändrad falluppsättning ger fel |
| package.json | verify-phase3.mjs | WIRED | `"verify:phase3": "node scripts/verify-phase3.mjs"` |
| playwright.protected.config.ts | phase3-mandates.spec.ts | WIRED | testMatch i toppnivån och i protected-desktop, -phone och -built |
| docs/handbok | docusaurus.config.js | WIRED | `path: '../docs/handbok'`, docs-bygget PASS |

### Dataflöde (nivå 4)

| Artefakt | Data | Källa | Verkliga data | Status |
|---|---|---|---|---|
| Syntetiskt elevprov | `pupils`, `scope` | `phase3_read_pupils` / `phase3_probe_scope` (security definer, egen mandatprövning) | Ja, syntetiska fixtures i DB | ✓ FLOWING |
| Mandatlista | `mandates` | `phase3_list_mandates()` med obligatorisk audit | Ja | ✓ FLOWING |
| Säkerhetslogg (granskare) | händelser | `security_events`, begränsade till egen kund | Ja (audit-minimization) | ✓ FLOWING |

### Beteendekontroller

| Beteende | Kommando | Resultat | Status |
|---|---|---|---|
| SQL-gränser, delegation, gallring och direkta privilegier | `node work/pilot/run-sql-tests.mjs --out <scratch>` | 10 filer, 565 prov | ✓ PASS |
| Modell-, server-, grind- och kollektorprov | `node --test …` (se ovan) | 337/337 | ✓ PASS |
| Typer och lint | `npx tsc --noEmit`, `npx oxlint app lib` | exit 0 | ✓ PASS |
| Källträdet oförändrat sedan den gröna grinden | `sourceTreeFingerprint()` | identiskt med grinden | ✓ PASS |

### Proben

| Prob | Resultat | Status |
|---|---|---|
| `collect-denials.mjs --probe --outage storage,kong,db` (i grinden 11:47 UTC) | status PASS, blockers [] | PASS (committat resultat, inte omkört: provet startar om Kong, Storage och Postgres) |

### Kravtäckning

| Krav | Källplaner | Beskrivning | Status | Bevis |
|---|---|---|---|---|
| ACL-02 | 01, 02, 03, 06, 07 | Rektor tilldelar och avslutar läraruppdrag inom egna skolor och tider; huvudman nekas | ✓ SATISFIED (lokalt syntetiskt) | Sanning 2 |
| ACL-03 | 01, 02, 03, 06, 07 | Huvudman utser rektor; rektor kan inte ge rektorsmandat | ✓ SATISFIED (lokalt syntetiskt) | Sanning 1 |
| ACL-04 | 01, 02, 03, 05, 06, 07 | Uppdragsmatris; okänt nekas | ✓ SATISFIED (lokalt syntetiskt) | Sanning 3, elevhälsans tre scope |
| ACL-05 | 01, 02, 03, 05, 06, 07 | IT utan elevinsyn; support separat, tidsbegränsad och spårbar | ✓ SATISFIED (lokalt syntetiskt) | Sanning 4 |
| AUDIT-02 | 04, 05, 06, 07 | Spåra läsningar, exporter och nekanden, även via direktvägar | ✓ SATISFIED (lokalt syntetiskt, asynkron lokal kollektor) | Sanning 5 |
| AUDIT-03 | 04, 06, 07 | Begränsad åtkomst, minimering, lagringstid och loggbortfall | ✓ SATISFIED (syntetisk lagringstid 30 dygn; verklig lagringstid är kundbeslut) | Sanning 5 |

Alla sex ID:n i ROADMAP och REQUIREMENTS.md (Phase 3) finns i minst en plan. Inga föräldralösa krav. Markeringen i REQUIREMENTS.md bör ange syntetisk nivå och ska inte beskrivas som verklig kommunanslutning.

### Beslutstäckning

`check.decision-coverage-verify`: inga spårbara `<decisions>`-block i 03-CONTEXT.md (0/0). Beslutspunkterna kontrollerades manuellt:
- Elevhälsans skol-, elev- och ärendescope utan automatisk teamrätt: honoreras
- Rektor tilldelar elevhälsa och elevhälsoansvarig delegerar över sin uttryckliga skolmängd: honoreras (seedad; vem som utser är ett öppet beslut)
- IT utan elevinsyn och rektorsgodkänd support med tidsgräns: honoreras
- Loggpolicyn med stopp vid loggfel och konfigurerbar lagringstid: honoreras
- 2026-09-27, engångskod vid inloggning för konton med registrerad kod: `loa-2-otp` + `conditional-user-configured`, `acr_values`; browser visar acr 2 för rektor och acr 1 för lärare
- 2026-09-27, support för en elev eller en eller flera grupper på en skola: migration 20260927090000 och support-groups 9/9

### Provkvalitet

| Provfil | Krav | Hoppade | Cirkulärt | Nivå | Bedömning |
|---|---|---|---|---|---|
| mandate-policy.test.mjs | ACL-02–05 | 0 | nej | värde | OK |
| supabase/tests/phase3_*.sql | ACL-02–05, AUDIT-03 | 0 | nej | beteende (rollback) | OK |
| verify-mandates.mjs (26 fall) | alla | 0 | nej, källbevis från serverloggar och inte klientens egna rapporter | beteende | OK |
| phase3-mandates.spec.ts (15 × 3) | alla | 0 (grinden kräver noll) | nej | beteende end-to-end med riktig OIDC | OK |
| verify-phase3.test.mjs | grinden | 0 | nej | negativa fall | OK |

Fas 1- och fas 2-browserns hopp (1 respektive 19) är redovisade projekthopp ur `DESIGNED_SKIPS` och stäms av mot statistiken.

### Antimönster och varningar

| Fil | Mönster | Allvar | Påverkan |
|---|---|---|---|
| Access-regressionens Worker (port 3013) | Avbröts tre gånger (deferred-items 2, 6, 7): HTTP 500 och därefter `fetch failed`. Grindkörningen på 4fb5773 gav FAIL. Orsaken är inte fastställd | ⚠️ Varning | Påverkar inte måluppfyllelsen. Produktkoden var densamma i PASS-körningen: 278f235 ändrade bara provskriptets loggning. Felet stänger och läcker inget, eftersom inga data lämnas. Fristående körningar gav 16/16. Grindens reproducerbarhet är dock inte fullständig, och ett oförklarat 500 i en skyddad Worker bör utredas före pilotdrift. Workerns logg sparas nu privat för nästa gång |
| `docs/pilot/loggpolicy.md` | Statusen 2026-09-26 säger att elevläsning och export fortfarande är stängda och att AUDIT-02/03 väntar på 03-06 | ⚠️ Varning | Inaktuellt för pilotansvarig. Aktuellt läge finns i `docs/pilot/phase3-mandates.md` |
| `docs/pilot/audit-sources.md` rad 50 | "Worker-proven har ännu inte körts om på den återskapade stacken (plan 03-06)" | ⚠️ Varning | Inaktuellt; de kördes i 03-06 och 03-07 |
| `docs/pilot/mandatmatris.md` | Supportraden säger "exakt en elev inom exakt en skola" | ⚠️ Varning | Motsäger användarbeslutet 2026-09-27 om gruppsupport. Koden, handboken och phase3-mandates.md är rätt |
| `web/lib/access-rules.ts` `invalidAssignmentCode` | Support före starttid ger felkoden `assignment_expired` (deferred-items 1) | ℹ️ Info | Behörigheten är rätt men meddelandet missvisande. Webben startar alltid support "från nu" |
| `docs/handbok/*.md` | Statusrader säger "Granskningen återstår" | ℹ️ Info | Uppdateras när verifieringen är avslutad |
| 03-VALIDATION.md | `nyquist_compliant: false` | ℹ️ Info | Ingen blockerare |

Inga `TBD`, `FIXME` eller `XXX` och inga inaktiverade prov i fasens filer.

### Öppna beslut (inte luckor i fas 3)

- Verklig IdP och kommunanslutning. API-provens sessionsbevis mintas lokalt; OIDC-kedjan visas bara mot den lokala Keycloak.
- Fysisk telefon. Telefonbeviset är WebKit i iPhone 13-storlek, eftersom stacken bara nås på localhost.
- Verkliga supportsyften och tidsgränser (nu `synthetic-troubleshooting`, högst 60 minuter) och verklig lagringstid (nu syntetiskt 30 dygn).
- Vem som utser elevhälsoansvarig, elevhälsoansvarigs egen elevinsyn och professionernas rättigheter.
- Registrering av engångskod för konton utan kod (deferred-items 8) och återställning av osparad tilldelning efter step-up.
- Kollektorn för direktvägar är asynkron och lokal och ger ingen synkron driftgaranti.

## Mänsklig verifiering

Användaren godkände det förnyade provet 2026-09-27 ("allt verkar funka bra"). Svaret omfattade uttryckligen rektorns engångskod vid inloggning, tilldelning av lärare, support för grupp och elev, supportens vy, p3.larare med bara lösenord och p3.huvudman. Checkpointen 03-07 bad också om bedömning av elevhälsans avgränsning, IT:s pausa/aktivera och loggfelssituationen. De tre delarna har fullt automatiskt bevis: API, riktig OIDC-browser i tre projekt och en injicerad loggfelssituation i browsern. Användaren har dock inte bedömt dem uttryckligen. Kontrollerna är korta och kräver ingen ny kod:

### 1. Elevhälsans avgränsning

**Prov:** Logga in som p3.elevhalsa.skola, p3.elevhalsa.elev och p3.elevhalsa (ärende) och öppna Syntetiskt elevprov.
**Förväntat:** Skolscope visar skolans elever utan export. Elevscope visar bara den tilldelade eleven. Ärendescope visar ingen lista, bara eleven via ärendet.
**Varför människa:** Checkpointens instruktion; det automatiska beviset visar funktionen men inte att vyn är begriplig.

### 2. IT pausar och aktiverar

**Prov:** Logga in som p3.it. Pausa, prova, aktivera och prova igen.
**Förväntat:** Provet nekas vid paus och ger OK när anslutningen är aktiv. Inget elevprov i menyn.
**Varför människa:** Ingick i checkpointen men inte i godkännandet.

### 3. Loggfel och säkerhetsloggen

**Prov:** Se loggfelsmeddelandet (spärra loggskrivningen lokalt som i phase3-workspace-specen, eller visa det automatiska provet) och logga in som p3.granskare.
**Förväntat:** Tydligt meddelande med referens och inga elevuppgifter. Granskaren ser läsning, export och nekande utan elevnamn.
**Varför människa:** Tydligheten i felmeddelanden och granskarens arbetsflöde är en användarbedömning som checkpointen uttryckligen bad om.

Om användaren redan har bedömt dessa delar i det förnyade provet räcker en bekräftelse. Då kan fasen markeras som godkänd.

## Sammanfattning

Fasmålet är uppnått i den lokala syntetiska miljön. Alla fem framgångskriterier och sju planbundna sanningar har kod, databasprövning och körbart bevis. Egen körning gav SQL 565 PASS och modell-, server- och grindprov 337 PASS. Den gröna fasgrinden på 278f235 har samma källfingeravtryck som dagens träd. Inga blockerande luckor hittades.

Kvar är tre korta användarbekräftelser ur checkpointen 03-07 och dokumentvård: inaktuella statusrader i `docs/pilot/loggpolicy.md` och `docs/pilot/audit-sources.md` och supportraden i `docs/pilot/mandatmatris.md`. Dessutom bör det oförklarade Worker-avbrottet i access-regressionen utredas innan grinden räknas som helt reproducerbar.

---

_Verifierad: 2026-09-27T20:22:48Z_
_Verifierare: Claude (gsd-verifier)_


## Mänsklig verifiering — genomförd 2026-09-28

De tre punkter som gav `human_needed` är bekräftade av användaren i den lokala syntetiska miljön (se `03-HUMAN-UAT.md`):

1. Elevhälsans avgränsning till skola, elev och ärende — godkänd.
2. IT:s pausa/aktivera och syntetiskt test, utan elevinsyn — godkänd.
3. Loggfelssituationen — godkänd live: utan skrivrätt till säkerhetsloggen visades felbeskedet med referens och inga elevuppgifter; även inloggning nekades (fail-closed). Skrivrätten återställdes direkt.

Status ändrad till **passed**. Omfattningen är fortsatt lokal och syntetisk; verklig IdP/kommunanslutning, fysisk telefon, verkliga supportsyften och lagringstid är öppna beslut. Två fynd från provet (inloggning från localhost, förhandsvisning som avvisade sin egen inloggningskaka) ligger i `deferred-items.md`.
