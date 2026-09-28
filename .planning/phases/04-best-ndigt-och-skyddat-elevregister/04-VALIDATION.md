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

Verifieringskartan nedan anger planerade kontroller. 04-01, 04-02, 04-03, 04-04, 04-05, 04-07, 04-08, 04-09 och 04-11 är genomförda; resultat nedan och i vågrapporterna. Full SQL-regression efter våg 5 är FAIL (15 filer, 537 passerade assertions inklusive separat omprov av äldre auditfixturens pgTAP-förberedelse): sex äldre fas 3-fixturer behöver portning enligt 04-14/15; se 04-WAVE-05-SUMMARY.md. Övriga resultat är väntande. `<automated>` i respektive plan är den körbara källan. Testunderlaget skapas i sin ägarplan innan funktionen ändras, inte som en separat påstått färdig våg 0.

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
| 04-06-01 | STU-04, STU-06 | `node work/pilot/run-sql-tests.mjs --file phase4_register.test.sql --out work/pilot/results/phase4-source.json` | Ej kört |
| 04-06-02 | STU-04, STU-06 | `node work/pilot/phase4-simulated-source.mjs --target protected && node work/pilot/run-sql-tests.mjs --file phase4_register.test.sql --out work/pilot/results/phase4-source-cli.json` | Ej kört |
| 04-07-01 | STU-06, DATA-01, DATA-02 | `cd web && node --test lib/server/mandates.test.mjs` | GREEN 6/6 mandatprov; se 04-07-SUMMARY |
| 04-07-02 | STU-06, DATA-01, DATA-02 | `cd web && node --test lib/server-client.test.mjs lib/server/mandates.test.mjs && npx tsc --noEmit` | GREEN 22/22 klient-/mandatprov + typkontroll; se 04-07-SUMMARY |
| 04-08-01 | DATA-01, DATA-02 | `cd web && node --test lib/server/events.test.mjs` | GREEN 7/7 metadataprov; se 04-08-SUMMARY |
| 04-08-02 | DATA-01, DATA-02 | `cd web && node --test lib/server/pupil-register-audit.test.mjs lib/server/events.test.mjs` | GREEN 16/16 loggprov, simulerad transaktionsgräns; se 04-08-SUMMARY |
| 04-09-01 | STU-01, STU-02, STU-05, DATA-01 | `cd web && node --test lib/server/pupil-register.test.mjs && npx tsc --noEmit` | PASS 10 adapterprov, 18 modellprov och typkontroll |
| 04-09-02 | STU-01, STU-02, STU-05, DATA-01 | `cd web && node --test lib/server/pupil-register.test.mjs lib/server/pupil-register-audit.test.mjs && npx tsc --noEmit && npx oxlint app lib` | PASS 10 adapterprov + 9 auditprov, typkontroll/lint; dessutom 5/5 verkliga OIDC/Worker/DB-fall och 146/146 projektions-/ACL-prov efter migration 141 |
| 04-10-01 | STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02 | `cd web && node --test lib/server/pupil-register.test.mjs && npx tsc --noEmit` | Ej kört |
| 04-10-02 | STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02 | `cd web && node --test lib/server/pupil-register.test.mjs lib/server/pupil-register-audit.test.mjs && npx tsc --noEmit` | Ej kört |
| 04-11-01 | DATA-01 | `cd web && node --test lib/server/protected-permission.test.mjs && npx tsc --noEmit` | PASS 7/7 snabbprov + 8 verkliga API-/rollfall; se 04-11-SUMMARY |
| 04-11-02 | DATA-01 | `cd web && npx tsc --noEmit && npx oxlint app lib` | PASS typ/lint, dialog på dator + telefon, byggd Worker; samlat 04-19 återstår |
| 04-12-01 | STU-01, STU-02, STU-05, DATA-01 | `cd web && npx tsc --noEmit && npx oxlint app lib` | Ej kört |
| 04-12-02 | STU-01, STU-02, STU-05, DATA-01 | `cd web && node --test lib/pupil-register-model.test.mjs lib/server-client.test.mjs && npx tsc --noEmit` | Ej kört |
| 04-13-01 | STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02 | `cd web && npx tsc --noEmit && npx oxlint app lib` | Ej kört |
| 04-13-02 | STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02 | `cd web && node --test lib/server-client.test.mjs lib/pupil-register-model.test.mjs && npx tsc --noEmit` | Ej kört |
| 04-14-01 | DATA-01, STU-01 | `node work/pilot/run-sql-tests.mjs --file phase3_mandates.test.sql --out work/pilot/results/phase4-regression-mandates.json && node work/pilot/run-sql-tests.mjs --file phase3_matrix.test.sql --out work/pilot/results/phase4-regression-matrix.json` | Ej kört |
| 04-14-02 | DATA-01, STU-01 | `node work/pilot/run-sql-tests.mjs --file phase3_policy.test.sql --out work/pilot/results/phase4-regression-policy.json && node work/pilot/run-sql-tests.mjs --file phase3_temporal.test.sql --out work/pilot/results/phase4-regression-temporal.json` | Ej kört |
| 04-15-01 | DATA-01, DATA-02, STU-01 | `node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase4-all-sql.json` | Ej kört |
| 04-15-02 | DATA-01, DATA-02, STU-01 | `node work/pilot/phase3-browser-fixtures.mjs --target protected && node work/pilot/phase3-browser-fixtures.mjs --target protected` | Ej kört |
| 04-16-01 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `node work/pilot/phase4-browser-fixtures.mjs --target protected` | Ej kört |
| 04-16-02 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `node --test work/pilot/verify-register.test.mjs && node work/pilot/verify-register.mjs --out work/pilot/results/phase4-api.json` | Ej kört |
| 04-17-01 | DATA-01, DATA-02 | `node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase4-retire-sql.json` | Ej kört |
| 04-17-02 | DATA-01, DATA-02 | `cd web && npx tsc --noEmit && npx oxlint app lib && npm run build:protected` | Ej kört |
| 04-18-01 | DATA-01, DATA-02 | `node work/pilot/verify-mandates.mjs --out work/pilot/results/phase4-mandates-regression.json && node work/pilot/verify-access.mjs --out work/pilot/results/phase4-access-regression.json` | Ej kört |
| 04-18-02 | DATA-01, DATA-02 | `cd web && npx playwright test --config playwright.phase3.config.ts phase3-workspace --list && npx playwright test --config playwright.phase3.config.ts phase3-workspace && npx playwright test --config playwright.protected.config.ts phase3-mandates --list && npx playwright test --config playwright.protected.config.ts phase3-mandates --project=protected-desktop --project=protected-phone --project=protected-built` | Ej kört |
| 04-19-01 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `cd web && npx playwright test --config playwright.protected.config.ts phase4-register --project=protected-desktop --project=protected-phone --project=protected-built` | Ej kört |
| 04-19-02 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `cd web && npx playwright test --config playwright.protected.config.ts phase4-register --project=protected-phone` | Ej kört |
| 04-20-01 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `cd web && node --test scripts/verify-phase4.test.mjs && npm run verify:phase4` | Ej kört |
| 04-20-02 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `cd web && npm run verify:phase4` | Ej kört |
| 04-21-01 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `npm run docs:build` | Ej kört |
| 04-21-02 | STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02 | `npm run docs:build && cd web && npm run verify:phase4` | Ej kört |

`04-22` är en separat mänsklig checkpoint efter full grön grind. Slutlig kravverifiering följer därefter genom gsd-verify-work. Saknad miljö eller underkänt prov är aldrig PASS.

### Krav till bevis

| Krav | Huvudsakliga bevisplaner |
|---|---|
| STU-01 | 04-02, 04-09, 04-16, 04-19 |
| STU-02, STU-03 | 04-05, 04-13, 04-16, 04-19 |
| STU-04 | 04-06, 04-13, 04-16, 04-19 |
| STU-05 | 04-04, 04-12, 04-16, 04-19 |
| STU-06 | 04-05, 04-07, 04-13, 04-16, 04-19 |
| DATA-01 | 04-03, 04-04, 04-08, 04-11, 04-16–19 |
| DATA-02 | 04-04, 04-10, 04-13, 04-16, 04-19 |

Samlad kravgrind: 04-20; handbok och förnyad slutgrind: 04-21. Äldre behörighets- och bevarandefall måste köras om, inte tillgodoräknas historiska gröna resultat.

---

## Wave 0 Requirements

- [x] `web/lib/pupil-register-model.test.mjs` — 17/17, 04-01-SUMMARY
- [ ] `web/lib/server/pupil-register.test.mjs`
- [x] utökat `web/lib/server/events.test.mjs` (`/api/elever` i `ROUTES`, nya detaljnycklar)
- [ ] `supabase/tests/phase4_{register,periods,protected,conflicts,export}.test.sql` + uppdaterade fas 3-fixturer
- [ ] `work/pilot/sql/phase4-fixtures.sql`, `work/pilot/phase4-browser-fixtures.mjs`
- [ ] `work/pilot/verify-register.mjs`, `work/pilot/verify-register-locks.mjs`
- [ ] `web/e2e/phase4-register.spec.ts` (protected-desktop, -phone, -built)
- [ ] `web/scripts/verify-phase4.mjs` + `.test.mjs`, `npm run verify:phase4`

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
