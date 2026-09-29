---
phase: "04"
slug: "best-ndigt-och-skyddat-elevregister"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-28"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Underlag: `04-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node 25), pgTAP 1.3.3 via `work/pilot/run-sql-tests.mjs`, API-provskript i `work/pilot/`, Playwright 1.63.0 (`web/playwright.protected.config.ts`) |
| **Config file** | `web/playwright.protected.config.ts`, `supabase/tests/`, `work/pilot/verify-target.mjs` |
| **Quick run command** | `cd web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && node --test lib/pupil-register-model.test.mjs lib/server/pupil-register.test.mjs` |
| **Full suite command** | `cd web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && npm run verify:phase4` (ny, fail-closed, byggd på `verify-phase3.mjs`) |
| **Estimated runtime** | ~5 s snabbprov; fasgrind flera minuter |

---

## Sampling Rate

- **After every task commit:** berörd modellfil med `node --test`, `npx tsc --noEmit`, `npx oxlint app lib`; vid SQL-ändring berörd pgTAP-fil via `run-sql-tests.mjs --file`.
- **After every plan wave:** alla `lib/*.test.mjs lib/server/*.test.mjs`, alla SQL-filer, `verify-register.mjs` för vågens fall.
- **Before `/gsd-verify-work`:** `npm run verify:phase4` grön.
- **Max feedback latency:** 30 s för snabbprov.

---

## Per-Task Verification Map

Verifieringskartan nedan visar körda och återstående kontroller. Plan 04-01–04-21 samt 04-23–04-25 är genomförda; resultat finns här och i plan-/vågrapporterna. 04-21:s dokumentationsbygge och förnyade fulla fasgrind är PASS på `8923529`, lokalt syntetiskt. Mänskligt användarprov i 04-22 och separat fasverifiering återstår. `<automated>` i respektive plan är den körbara källan. Testunderlaget skapas i sin ägarplan innan funktionen ändras, inte som en separat påstått färdig våg 0.

| Uppgift | Krav | Planerat kommando | Status |
|---|---|---|---|
| 04-01-01 | STU-01, STU-02, STU-03, STU-05, STU-06 | `cd web && node --test lib/pupil-register-model.test.mjs` | RED verifierad, därefter GREEN 17/17; se 04-01-SUMMARY |
| 04-01-02 | STU-01, STU-02, STU-03, STU-05, STU-06 | `cd web && node --test lib/pupil-register-model.test.mjs && npx tsc --noEmit` | GREEN 17/17 + typkontroll; se 04-01-SUMMARY |
| 04-02-01 | STU-01, STU-02, STU-03, STU-04 | `node work/pilot/run-sql-tests.mjs --file phase4_periods.test.sql --out work/pilot/results/phase4-periods.json` | GREEN 43/43 period-/relationsprov; se 04-02-SUMMARY |
| 04-02-02 | STU-01, STU-02, STU-03, STU-04 | `node work/pilot/run-sql-tests.mjs --file phase4_register.test.sql --out work/pilot/results/phase4-register-schema.json` | GREEN 78/78 registerprov; se 04-02-SUMMARY |
| 04-03-01 | STU-01, DATA-01 | `node work/pilot/run-sql-tests.mjs --file phase4_register.test.sql --out work/pilot/results/phase4-migration.json` | GREEN 100/100 inklusive faktisk före/efter-migrering; se 04-03-SUMMARY |
| 04-03-02 | STU-01, DATA-01 | `node work/pilot/run-sql-tests.mjs --file phase4_protected.test.sql --out work/pilot/results/phase4-permission.json` | GREEN 69/69 skyddsbehörighetsprov; nya entrypoints ännu stängda för Worker |
| 04-04-01 | STU-02, STU-05, DATA-01, DATA-02 | `node work/pilot/run-sql-tests.mjs --file phase4_protected.test.sql --out work/pilot/results/phase4-projection.json` | PASS 140/140; se 04-04-SUMMARY |
| 04-04-02 | STU-02, STU-05, DATA-01, DATA-02 | `node work/pilot/run-sql-tests.mjs --file phase4_export.test.sql --out work/pilot/results/phase4-export.json` | PASS 20/20; se 04-04-SUMMARY |
| 04-05-01 | STU-01, STU-02, STU-03, STU-04, STU-06 | `node work/pilot/run-sql-tests.mjs --file phase4_periods.test.sql --out work/pilot/results/phase4-period-mutations.json` | PASS 101/101 SQL efter permanent migration 150; kandidat först prövad i rollback |
| 04-05-02 | STU-01, STU-02, STU-03, STU-04, STU-06 | `node work/pilot/run-sql-tests.mjs --file phase4_conflicts.test.sql --out work/pilot/results/phase4-conflicts.json && node work/pilot/verify-register-locks.mjs` | PASS 19/19 SQL och 6/6 verkliga samtidighetsfall; kundlås och separat elevradlås observerade |
| 04-06-01 | STU-04, STU-06 | `node work/pilot/run-sql-tests.mjs --file phase4_register.test.sql --out work/pilot/results/phase4-source.json` | PASS 150/150 bevarade register- och källprov efter migration 163; se 04-06-SUMMARY |
| 04-06-02 | STU-04, STU-06 | `node work/pilot/phase4-simulated-source.mjs --target protected && node work/pilot/run-sql-tests.mjs --file phase4_register.test.sql --out work/pilot/results/phase4-source-cli.json` | PASS CLI 3/3 med observerade verkliga lås (upprepad leverans och gammalt beslut); registeromprov PASS 150/150 |
| 04-07-01 | STU-06, DATA-01, DATA-02 | `cd web && node --test lib/server/mandates.test.mjs` | GREEN 6/6 mandatprov; se 04-07-SUMMARY |
| 04-07-02 | STU-06, DATA-01, DATA-02 | `cd web && node --test lib/server-client.test.mjs lib/server/mandates.test.mjs && npx tsc --noEmit` | GREEN 22/22 klient-/mandatprov + typkontroll; se 04-07-SUMMARY |
| 04-08-01 | DATA-01, DATA-02 | `cd web && node --test lib/server/events.test.mjs` | GREEN 7/7 metadataprov; se 04-08-SUMMARY |
| 04-08-02 | DATA-01, DATA-02 | `cd web && node --test lib/server/pupil-register-audit.test.mjs lib/server/events.test.mjs` | GREEN 16/16 loggprov, simulerad transaktionsgräns; se 04-08-SUMMARY |
| 04-09-01 | STU-01, STU-02, STU-05, DATA-01 | `cd web && node --test lib/server/pupil-register.test.mjs && npx tsc --noEmit` | PASS 10 adapterprov, 18 modellprov och typkontroll |
| 04-09-02 | STU-01, STU-02, STU-05, DATA-01 | `cd web && node --test lib/server/pupil-register.test.mjs lib/server/pupil-register-audit.test.mjs && npx tsc --noEmit && npx oxlint app lib` | PASS 10 adapterprov + 9 auditprov, typkontroll/lint; dessutom 5/5 verkliga OIDC/Worker/DB-fall och 146/146 projektions-/ACL-prov efter migration 141 |
| 04-10-01 | STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02 | `cd web && node --test lib/server/pupil-register.test.mjs && npx tsc --noEmit` | PASS 20/20 + typkontroll, simulerad DB-gräns; se 04-10-SUMMARY |
| 04-10-02 | STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02 | `cd web && node --test lib/server/pupil-register.test.mjs lib/server/pupil-register-audit.test.mjs && npx tsc --noEmit` | PASS 33/33 + typkontroll, simulerad DB-gräns; verklig DB blockerad av stängd Worker-körrätt; öppnad och Worker-provad i 04-23 |
| 04-11-01 | DATA-01 | `cd web && node --test lib/server/protected-permission.test.mjs && npx tsc --noEmit` | PASS 7/7 snabbprov + 8 verkliga API-/rollfall; se 04-11-SUMMARY |
| 04-11-02 | DATA-01 | `cd web && npx tsc --noEmit && npx oxlint app lib` | PASS typ/lint, dialog på dator + telefon, byggd Worker; samlat 04-19 återstår |
| 04-12-01 | STU-01, STU-02, STU-05, DATA-01 | `cd web && npx tsc --noEmit && npx oxlint app lib` | PASS slutlig typkontroll/lint; 13 unika registerbrowserfall över riktade körningar + auth 2/2 GREEN och verkligt utloggningsomprov 1/1; se 04-WAVE-06-SUMMARY |
| 04-12-02 | STU-01, STU-02, STU-05, DATA-01 | `cd web && node --test lib/pupil-register-model.test.mjs lib/server-client.test.mjs && npx tsc --noEmit` | PASS 35/35 modell/transport + typkontroll; bootstrap SQL 20/20, adapter/route 13/13 |
| 04-13-01 | STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02 | `cd web && npx tsc --noEmit && npx oxlint app lib` | PASS typkontroll/lint (slutrevision 7a36d96); riktat browserprov 9/9 dator + telefon 390/320 px mot byggd Worker utan lyckade mutationer, listregression 13/13; sparning med MFA ej browserprovad (p3.admin saknar engångskod); samlat 04-19 återstår; se 04-13-SUMMARY |
| 04-13-02 | STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02 | `cd web && node --test lib/server-client.test.mjs lib/pupil-register-model.test.mjs && npx tsc --noEmit` | PASS 41/41 modell/transport + typkontroll; alla node-prov 389/389; export/MFA i dialog browserprovat till mfa_required, konfliktvy (409) endast typ-/modellprovad; se 04-13-SUMMARY |
| 04-14-01 | DATA-01, STU-01 | `node work/pilot/run-sql-tests.mjs --file phase3_mandates.test.sql --out work/pilot/results/phase4-regression-mandates.json && node work/pilot/run-sql-tests.mjs --file phase3_matrix.test.sql --out work/pilot/results/phase4-regression-matrix.json` | PASS mandates 279/279, matrix 56/56 mot registret; se 04-14-SUMMARY |
| 04-14-02 | DATA-01, STU-01 | `node work/pilot/run-sql-tests.mjs --file phase3_policy.test.sql --out work/pilot/results/phase4-regression-policy.json && node work/pilot/run-sql-tests.mjs --file phase3_temporal.test.sql --out work/pilot/results/phase4-regression-temporal.json` | PASS policy 105/105, temporal 34/34 mot registret; se 04-14-SUMMARY |
| 04-15-01 | DATA-01, DATA-02, STU-01 | `node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase4-all-sql.json` | PASS 2026-09-28: 16/16 filer, 1161 assertions (boundaries 41, connections 19, audit 19); före: FAIL, 1095 assertions, 2 avbrutna filer |
| 04-15-02 | DATA-01, DATA-02, STU-01 | `node work/pilot/phase3-browser-fixtures.mjs --target protected && node work/pilot/phase3-browser-fixtures.mjs --target protected` | PASS 2026-09-28: båda körningarna exit 0 med identisk utdata (registerrelationer 2/2/2/2/2, 10 aktiva uppdrag, 0 skyddsbehörigheter); inga nya elevprovsrader |
| 04-16-01 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `node work/pilot/phase4-browser-fixtures.mjs --target protected` | PASS 2026-09-29 mot skyddat lokalt mål; syntetiska namn/datum/roller, 55 sidrader och riktig huvudmannastyrd skyddsbehörighet; se 04-16-SUMMARY |
| 04-16-02 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `node --test work/pilot/verify-register.test.mjs && node work/pilot/verify-register.mjs --out work/pilot/results/phase4-api.json` | PASS 2026-09-29: kontrakt 3/3, API 18/18 mot byggd protected-Worker; faktisk Kong-källkorrelation, återkallad session och skyddsbehörighet mellan preview/hämtning; riktat Keycloak-/CSV-browserprov 1/1; tsc/oxlint PASS. Fasens slutgrind återstår |
| 04-17-01 | DATA-01, DATA-02 | `node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase4-retire-sql.json` | PASS (commit 2ddc0bd, migration 20260930100000 tillämpad lokalt på protected-målet): nytt `phase4_retire` RED 12/29 före migrationen, sedan GREEN; hela SQL-regressionen 17/17 filer, 1216 assertions (baslinje före: 16/16, 1224; −36 behörighetsrader för avvecklade tabeller i `phase3_mandates`, +1 i `phase4_register`, +27 i `phase4_retire`). Historiska händelser orörda (723 `phase3_probe_pupil`, 69 `phase3_probe_case`, 20 750 totalt före och efter) |
| 04-17-02 | DATA-01, DATA-02 | `cd web && npx tsc --noEmit && npx oxlint app lib && npm run build:protected` | PASS (commit 78f1e18): tsc och oxlint utan fel, nodprov 395/395 (399 − 4 borttagna elevprovsfall), build:protected utan fel och routetabellen saknar `/api/prov`. Byggd protected-Worker: GET/POST `/api/prov`, `/api/prov/elev`, `/api/prov/export` ger 404, medan POST `/api/elever/lista` ger 401 utan session. Fas 3:s API-/browserprov mot `/api/prov` är övergångsröda tills 04-18 |
| 04-18-01 | DATA-01, DATA-02 | `node work/pilot/verify-mandates.mjs --out work/pilot/results/phase4-mandates-regression.json && node work/pilot/verify-access.mjs --out work/pilot/results/phase4-access-regression.json` | PASS 2026-09-29: mandat 26/26, access 16/16; faktisk källrapport fyra direktprov och tre omstarts-/återhämtningsprov PASS. Historiska fas 3-rapporter orörda; se 04-18-SUMMARY |
| 04-18-02 | DATA-01, DATA-02 | `cd web && npx playwright test --config playwright.phase3.config.ts phase3-workspace --list && npx playwright test --config playwright.phase3.config.ts phase3-workspace && npx playwright test --config playwright.protected.config.ts phase3-mandates --list && npx playwright test --config playwright.protected.config.ts phase3-mandates --project=protected-desktop --project=protected-phone --project=protected-built` | PASS 2026-09-29: färsk fixture, arbetsyta 18/18 dator/telefon, mandatbrowser 45/45 dator/telefon/byggd app, tsc/oxlint PASS. Intermittent supporttext till 04-19; se 04-18-SUMMARY |
| 04-19-01 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `cd web && npx playwright test --config playwright.protected.config.ts phase4-register --project=protected-desktop --project=protected-phone --project=protected-built` | PASS 2026-09-29: 13 namngivna fall × 3 projekt = 39/39, utan hopp; lokal syntetisk Keycloak/Worker/DB. Första försöket 38/39 vid tillfälligt byggt serveravbrott, sedan riktat omprov 2/2 och full sammanhängande omkörning 39/39; se 04-19-SUMMARY |
| 04-19-02 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `cd web && npx playwright test --config playwright.protected.config.ts phase4-register --project=protected-phone` | PASS 2026-09-29: separat WebKit-enhetsläge 13/13, 390×844 och 320×740; ingen fysisk telefon; se 04-19-SUMMARY |
| 04-20-01 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `cd web && node --test scripts/verify-phase4.test.mjs && npm run verify:phase4` | PASS 2026-09-29 på e5d7a61: grindens 6 rena validatorprov PASS; full slutrapport PASS med 395 modell-/serverprov, 29 grind-/registerprov, 17 SQL-filer, fyra baslinjeflöden, access 16/16, mandat 26/26, register-API 18/18, lås 6/6, källbevis och browser 39/39 utan hopp. Se 04-20-SUMMARY |
| 04-20-02 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `cd web && npm run verify:phase4` | PASS 2026-09-29: åtta kravkedjor PASS i `phase4-summary.json` på e5d7a61 med oförändrat källfingeravtryck; intern beviskarta i `docs/pilot/phase4-register.md`. Endast lokala syntetiska automatbevis; handbok/UAT/fasverifiering återstår |
| 04-21-01 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `npm run docs:build` | PASS 2026-09-29: Docusaurus byggde de fyra granskade handbokssidorna; se 04-21-SUMMARY |
| 04-21-02 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `npm run docs:build && cd web && npm run verify:phase4` | PASS 2026-09-29 på `8923529`: full grind med 395 modell-/serverprov, 29 grindprov, SQL 17/17 (1 216 kontroller), baslinje 4/4, access 16/16, mandat 26/26 (139 kontroller), källbevis, register-API 18/18, lås 6/6, browser 39/39 och åtta automatiska kravkedjor; lokalt syntetiskt. Docs-bygget kördes separat före grinden mot samma handboksversion. Se 04-21-SUMMARY |
| 04-23-01 | STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02 | `node work/pilot/run-sql-tests.mjs --file phase4_register.test.sql --out work/pilot/results/phase4-23-register.json && node work/pilot/run-sql-tests.mjs --file phase4_periods.test.sql --out work/pilot/results/phase4-23-periods.json && node work/pilot/run-sql-tests.mjs --file phase4_export.test.sql --out work/pilot/results/phase4-23-export.json && node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase4-23-all-sql.json` | PASS efter RED: register 162/162, periods 101/101, export 22/22 mot protected-målet efter migration `20260929170000`; full SQL FAIL endast `phase3_boundaries`/`phase3_connections` (04-15), 14/16 filer ok, alla fas 4-filer PASS; se 04-23-SUMMARY |
| 04-23-02 | STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02 | `node work/pilot/phase4-worker-execute-probe.mjs --target protected --out work/pilot/results/phase4-23-worker-probe.json` | PASS 9/9 fall (slutkörning på d7ca458, Worker-bygge c69361e), lokalt mintade sessioner med testrealmens bevisprofil; icke-deterministiskt Wrangler-avbrott på nekat anrop i 5 av 11 körningar under planen (deferred-items) |
| 04-24-01 | DATA-01, DATA-02 | `node work/pilot/run-sql-tests.mjs --file phase4_protected.test.sql --out work/pilot/results/phase4-24-protected.json && node work/pilot/run-sql-tests.mjs --file phase4_export.test.sql --out work/pilot/results/phase4-24-export.json && node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase4-24-all-sql.json && cd web && node --test lib/server/pupil-register.test.mjs lib/server/pupil-register-audit.test.mjs && npx tsc --noEmit` | PASS (migration 20260929180000 tillämpad efter 170000; 04-17:s 20260930100000 ej tillämpad): RED före migration phase4_protected 10/203 (b och c); export låst redan grön. Efter: phase4_protected 203/203, phase4_export 28/28, full SQL 16/16 filer 1224 assertions; nod pupil-register + audit 36/36 (behörig form RED först); tsc utan fel. Lokalt, syntetiskt |
| 04-24-02 | DATA-01, DATA-02 | `cd web && node --test lib/pupil-register-model.test.mjs lib/server-client.test.mjs lib/server/pupil-register.test.mjs && npx tsc --noEmit && npx oxlint app lib && npm run build` | PASS: modellprov RED 2/26 före, sedan 26/26; model + server-client + pupil-register 70/70; tsc, oxlint och npm run build utan fel |
| 04-24-03 | DATA-01, DATA-02 | `cd web && npm run build:protected && npx playwright test --config playwright.phase4-protected.config.ts && npx playwright test --config playwright.phase4-card.config.ts && npx playwright test --config playwright.phase4-list.config.ts` | PASS (bygge 2e0b5af): phase4-protected-export 3/3 två gånger (dator 1440×900, iPhone 13 WebKit 390 px, 320×740); regression phase4-card 9/9 och phase4-list 13/13; 0 Worker-fel. Nedladdning ej browserprovad (p3.admin saknar engångskod); WebKit-enhetsläge, inte fysisk telefon |
| 04-25-01 | DATA-01, DATA-02 | `node --test work/pilot/phase4-worker-stability.test.mjs && node work/pilot/phase4-worker-stability.mjs --target protected --runs 20 --flood-runs 5 --flood-calls 200 --baseline --out work/pilot/results/phase4-25-baseline.json` | MEASURED (baslinje, oförändrad kod, bygge 84ce7fb): 16 av 25 körningar AVBROTT – 11/20 prov (55 %), 5/5 nekandeflöden; alla direkt efter nekande med oläst kropp, wrangler död vid nästa anrop 16/16. Nodprov 7/7. Kontrollflöden: tillåtna 0/5, WRANGLER_LOG=debug 8/13, inspektör 3/3 (0 undantag), tillfällig felloggning 4/8 |
| 04-25-02 | DATA-01, DATA-02 | `cd web && node --test lib/server/deny-path.test.mjs lib/server/pupil-register.test.mjs lib/server/events.test.mjs lib/server/mandates.test.mjs lib/server/protected-permission.test.mjs && npx tsc --noEmit && npx oxlint app lib` | PASS: deny-path RED 0/5 före rättningen (endast kroppsegenskapen fallerade), GREEN 5/5 efter ee00e31; de fem filerna 49/49, tsc och oxlint utan fel |
| 04-25-03 | DATA-01, DATA-02 | `node work/pilot/phase4-worker-stability.mjs --target protected --runs 20 --flood-runs 5 --flood-calls 200 --out work/pilot/results/phase4-25-stability.json && node work/pilot/phase4-worker-execute-probe.mjs --target protected --out work/pilot/results/phase4-25-worker-probe.json && cd web && node --test lib/*.test.mjs lib/server/*.test.mjs && npx tsc --noEmit && npx oxlint app lib && npm run build` | PASS 25/25 (bygge ee00e31): 20 provkörningar à 9/9 och 5 nekandeflöden à 200 anrop, 0 avbrott, alla nekanden loggade; 04-23:s prob PASS 9/9; nodsvit 394/394; tsc, oxlint och npm run build utan fel. Lokalt, syntetiskt |

`04-22` är en separat mänsklig checkpoint efter full grön grind. Slutlig kravverifiering följer därefter genom gsd-verify-work. Saknad miljö eller underkänt prov är aldrig PASS.

### Krav till bevis

| Krav | Huvudsakliga bevisplaner |
|---|---|
| STU-01 | 04-02, 04-09, 04-16, 04-19, 04-21 |
| STU-02, STU-03 | 04-05, 04-13, 04-16, 04-19, 04-21 |
| STU-04 | 04-06, 04-13, 04-16, 04-19, 04-21 |
| STU-05 | 04-04, 04-12, 04-16, 04-19, 04-21 |
| STU-06 | 04-05, 04-07, 04-13, 04-16, 04-19, 04-21 |
| DATA-01 | 04-03, 04-04, 04-08, 04-11, 04-16–19, 04-21, 04-24 |
| DATA-02 | 04-04, 04-10, 04-13, 04-16, 04-19, 04-21, 04-23, 04-24 |

Samlad kravgrind inför handboksarbetet: 04-20; granskad handbok och förnyad fullgrind: 04-21. 04-25 ger inget eget kravbevis. Den gör nekade anrop mot lokal Worker tillförlitliga, vilket 04-16 och 04-18–04-21 förutsätter. Äldre behörighets- och bevarandefall måste köras om, inte tillgodoräknas historiska gröna resultat.

---

## Wave 0 Requirements

- [x] `web/lib/pupil-register-model.test.mjs` — 17/17, 04-01-SUMMARY
- [ ] `web/lib/server/pupil-register.test.mjs`
- [x] utökat `web/lib/server/events.test.mjs` (`/api/elever` i `ROUTES`, nya detaljnycklar)
- [ ] `supabase/tests/phase4_{register,periods,protected,conflicts,export}.test.sql` + uppdaterade fas 3-fixturer
- [ ] `work/pilot/sql/phase4-fixtures.sql`, `work/pilot/phase4-browser-fixtures.mjs`
- [ ] `work/pilot/verify-register.mjs`, `work/pilot/verify-register-locks.mjs`
- [x] `web/e2e/phase4-register.spec.ts` (protected-desktop, -phone, -built; 39/39, 04-19)
- [x] `web/scripts/verify-phase4.mjs` + `.test.mjs`, `npm run verify:phase4` — 04-21-SUMMARY, förnyad full lokal syntetisk PASS på 8923529

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Arbetsflöde sökning → ändring → omläsning på dator och telefon | STU-01–06 | AGENTS.md kräver användarprov av UI-ändring | Mänsklig checkpoint i sista planen |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
