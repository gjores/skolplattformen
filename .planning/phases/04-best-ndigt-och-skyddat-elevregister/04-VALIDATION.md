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

Fylls i av planerna (Task ID → kommando). Kravkarta från research:

| Requirement | Test Type | Automated Command | File Exists | Status |
|-------------|-----------|-------------------|-------------|--------|
| STU-01 | API + browser + pgTAP | `verify-register.mjs --case register-reload`; `phase4_register.test.sql` | ❌ W0 | ⬜ pending |
| STU-02 | modell + pgTAP + API | `pupil-register-model.test.mjs`; `phase4_periods.test.sql`; `--case placement-change` | ❌ W0 | ⬜ pending |
| STU-03 | pgTAP + API + browser | `phase4_periods.test.sql`; `--case class-change` | ❌ W0 | ⬜ pending |
| STU-04 | pgTAP + API + browser | `phase4_register.test.sql`; `phase4-simulated-source.mjs`; `--case source-discrepancy` | ❌ W0 | ⬜ pending |
| STU-05 | modell + API + browser | `pupil-register-model.test.mjs`; `--case search-filter` | ❌ W0 | ⬜ pending |
| STU-06 | modell + pgTAP + två anslutningar + browser | `verify-register-locks.mjs`; `phase4_conflicts.test.sql`; `--case concurrent-edit` | ❌ W0 | ⬜ pending |
| DATA-01 | pgTAP + API + browser | `phase4_protected.test.sql`; `--case protected-*` | ❌ W0 | ⬜ pending |
| DATA-02 | modell + pgTAP + API + browser | `phase4_export.test.sql`; `--case export-*` | ❌ W0 | ⬜ pending |
| Fas 3-regression | SQL + API + browser | `run-sql-tests.mjs` (alla), `verify-mandates.mjs` (portade fall) | ✅ måste portas | ⬜ pending |
| Bevarandeflöden | DB-regression | `node work/pilot/verify-baseline-db.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/lib/pupil-register-model.test.mjs`
- [ ] `web/lib/server/pupil-register.test.mjs`
- [ ] utökat `web/lib/server/events.test.mjs` (`/api/elever` i `ROUTES`, nya detaljnycklar)
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
