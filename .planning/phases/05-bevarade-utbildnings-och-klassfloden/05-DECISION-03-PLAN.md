---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "DECISION-03"
type: execute
status: planned
wave: 3
depends_on: ["DECISION-02"]
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
files_modified:
  - web/lib/server/plan-decision.ts
  - web/lib/server/plan-decision.test.mjs
  - web/app/api/planbeslut/underlag/route.ts
  - web/app/api/planbeslut/utfora/route.ts
  - web/app/api/planbeslut/status/route.ts
  - web/lib/server/audit-details.ts
  - supabase/migrations/20261012171000_worker_plan_decisions.sql
  - work/pilot/verify-plan-decision-api.mjs
  - work/pilot/phase5-plan-decision-fixtures.mjs
must_haves:
  truths:
    - "Klientens beslut prövas igen mot serverns aktuella mandat, revision och analys."
    - "Okänt svar kan återläsas säkert utan blind omskrivning."
  artifacts:
    - path: web/lib/server/plan-decision.ts
      provides: "Skyddade besluts-API och faktisk Worker-preflight"
    - path: web/lib/server/plan-decision.test.mjs
      provides: "Skyddade besluts-API och faktisk Worker-preflight"
  key_links:
    - "Slutet klientkontrakt → protectedRoute → serverkontroll → låst SQL → beständig återläsning"
---

# Skyddade besluts-API och faktisk Worker-preflight

<objective>
Klientens beslut prövas igen mot serverns aktuella mandat, revision och analys.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-CONTEXT.md
@web/lib/server/gym-timplan.ts
@web/lib/programplan-analysis.ts
</context>

<tasks>
<task type="auto">
<name>1. Koppla slutna rutter och serveranalys</name>
<files>web/lib/server/plan-decision.ts, web/lib/server/plan-decision.test.mjs, web/app/api/planbeslut/underlag/route.ts, web/app/api/planbeslut/utfora/route.ts, web/app/api/planbeslut/status/route.ts, web/lib/server/audit-details.ts</files>
<action>protectedRoute med tillåtna HM/R/admin-läsningar, kommandospecifik server/SQL-rollkontroll, mutating/MFA/CSRF och required audit. Låst DB-underlag matchar serveranalys och expected fingerprint innan mutation. Felreplies fail closed, 409 för stale plan/analys; skol-/kundfel röjer inte metadata. Slutna auditactions, minimerad motivering i verksamhetshistorik. Om filantalet växer ytterligare, dela transport och analys innan implementation.</action>
<verify>node --test lib/server/plan-decision.test.mjs; npx tsc --noEmit</verify>
<done>Positiva och negativa rutter är provade och generiska äldre API öppnas inte.</done>
</task>

<task type="auto">
<name>2. Pröva verklig Worker innan permanenta grants</name>
<files>supabase/migrations/20261012171000_worker_plan_decisions.sql, work/pilot/verify-plan-decision-api.mjs, work/pilot/phase5-plan-decision-fixtures.mjs</files>
<action>Egen syntetisk fixturgraf via assertTarget(protected); dokumentera aktuell käll/build/ACL och originaltabeller. Tillfälliga exakt angivna grants återställs i finally. Kör positiva programbeslut och skolans submit/return/resubmit/decide, fel roller/kund/skola, CSRF/MFA, stale revision, auditfel och tappat svar med kvitto. Verifiera originaldata/klasslänkar bevarade, städa endast egen graf och behåll audit. Öppna separat minsta exakta Worker-grants först efter passerad preflight, kör sluturval igen.</action>
<verify>node work/pilot/verify-plan-decision-api.mjs --preflight; därefter permanent grantsmigration och slutprov</verify>
<done>Både skyddad Worker och riktig lokal DB passerar; mockprov redovisas separat.</done>
</task>

</tasks>

<verification>
Testa ändrad kod, inte historisk grön status. Node/ts/lint körs i web; work/pilot och docs från roten. SQL och Worker endast mot assertTarget(protected), egna syntetiska data och ingen reset. Alla negativa fall kontrollerar oförändrade verksamhetsrader; säkerhetsaudit bevaras. Nya migreringsnamn nedan reserveras först efter kontroll mot arbetskopia och faktisk journal. Ändra inte äldre migrationer.
</verification>

<success_criteria>
- Klientens beslut prövas igen mot serverns aktuella mandat, revision och analys.
- Okänt svar kan återläsas säkert utan blind omskrivning.
</success_criteria>

<output>
Skriv 05-DECISION-03-SUMMARY.md med faktiska prov, begränsningar och eventuell kontrollerad avvikelse. Ingen full fasacceptans här.
</output>
