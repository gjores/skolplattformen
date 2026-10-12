---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "DECISION-01"
type: tdd
status: completed
wave: 1
depends_on: []
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
files_modified:
  - web/lib/plan-decision-rules.ts
  - web/lib/plan-decision-rules.test.mjs
  - .planning/research/PLAN-DECISION-RULES-2026-10-12.md
  - web/lib/plan-decision-contract.ts
  - web/lib/plan-decision-contract.test.mjs
must_haves:
  truths:
    - "Beslut använder belagd program- och timprofil med tydliga blockerande kontroller."
    - "Utkast kan fortfarande sparas; okänd profil kan inte fastställas."
  artifacts:
    - path: web/lib/plan-decision-rules.ts
      provides: "Verifierade beslutsprofiler och slutna kontrakt"
    - path: web/lib/plan-decision-rules.test.mjs
      provides: "Verifierade beslutsprofiler och slutna kontrakt"
  key_links:
    - "Slutet klientkontrakt → protectedRoute → serverkontroll → låst SQL → beständig återläsning"
---

# Verifierade beslutsprofiler och slutna kontrakt

<objective>
Beslut använder belagd program- och timprofil med tydliga blockerande kontroller.
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
<name>1. Verifiera och prova beslutsregler</name>
<files>web/lib/plan-decision-rules.ts, web/lib/plan-decision-rules.test.mjs, .planning/research/PLAN-DECISION-RULES-2026-10-12.md</files>
<action>Läs aktuella primärkällor för nationella program, Gy25 och undervisningstid. Spara källor/giltighet och vilka profiler som faktiskt styrks. Implementera ren analys över exakt sparad programram/terminer respektive fryst timkälla/timmar. Testa full ram, ofördelat, explicit noll, nivåordning, okänd profil, fel giltighet, dubbelräknade alternativ samt saknade obligatoriska kontroller. TDD: skriv negativa och positiva fall före implementation. Befintlig analyseProgramplan.ready ger ingen beslutsrätt.</action>
<verify>node --test lib/plan-decision-rules.test.mjs</verify>
<done>Deterministiska fel och obligatoriska kontroller blockerar; risk/info gör det inte. Alla stödda profiler har primärkällstöd.</done>
</task>

<task type="auto">
<name>2. Bind kommandon till granskat underlag</name>
<files>web/lib/plan-decision-contract.ts, web/lib/plan-decision-contract.test.mjs</files>
<action>Definiera separat union program-submit/return/fastställ, tim-submit/return/decide med commandId, planId, expectedRevision, expectedWorkflowRevision, exakt underlagsfingeravtryck och begränsade kontrollkvitteringar/motivering. Läsreply innehåller status, servercapabilities, analys och historik; kvittoreply identifierar exakt utfall. Tillåt aldrig ready/actor/datum från klient. Behåll befintliga decisionReady:false-kontrakt.</action>
<verify>node --test lib/plan-decision-contract.test.mjs</verify>
<done>Fel fält, status, id, revision, kontroll-id eller ändrad payload avvisas.</done>
</task>

</tasks>

<verification>
Testa ändrad kod, inte historisk grön status. Node/ts/lint körs i web; work/pilot och docs från roten. SQL och Worker endast mot assertTarget(protected), egna syntetiska data och ingen reset. Alla negativa fall kontrollerar oförändrade verksamhetsrader; säkerhetsaudit bevaras. Nya migreringsnamn nedan reserveras först efter kontroll mot arbetskopia och faktisk journal. Ändra inte äldre migrationer.
</verification>

<success_criteria>
- Beslut använder belagd program- och timprofil med tydliga blockerande kontroller.
- Utkast kan fortfarande sparas; okänd profil kan inte fastställas.
</success_criteria>

<output>
Skriv 05-DECISION-01-SUMMARY.md med faktiska prov, begränsningar och eventuell kontrollerad avvikelse. Ingen full fasacceptans här.
</output>
