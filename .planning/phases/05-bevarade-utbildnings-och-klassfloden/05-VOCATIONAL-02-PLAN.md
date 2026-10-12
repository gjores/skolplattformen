---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "VOCATIONAL-02"
type: execute
status: completed
wave: 2
depends_on: ["VOCATIONAL-01"]
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
files_modified:
  - supabase/migrations/20261012200000_vocational_plan_decisions.sql
  - supabase/tests/phase5_vocational_decision_contract.test.sql
  - work/pilot/verify-vocational-plan-decisions.mjs
  - work/pilot/apply-vocational-plan-decisions.mjs
must_haves:
  truths:
    - "Databasen kan inte godta yrkesplaner som servern avvisar."
    - "Återsändning kräver huvudman, inskickad plan och motivering."
    - "Äldre beslut, timplansunderlag och klasskopplingar bevaras."
  artifacts:
    - path: supabase/migrations/20261012200000_vocational_plan_decisions.sql
      provides: "Samma yrkesregler i låst och auditerad SQL"
    - path: supabase/tests/phase5_vocational_decision_contract.test.sql
      provides: "Samma yrkesregler i låst och auditerad SQL"
  key_links:
    - "Versionsbunden katalog → programprofil → SQL/server → rolluppgift → beständigt beslut"
---

# Samma yrkesregler i låst och auditerad SQL

<objective>
Samma yrkesregler i låst och auditerad SQL.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-VOCATIONAL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-VERIFICATION.md
</context>

<tasks>
<task type="auto">
<name>Inför framåtriktad och behörighetsbevarande SQL</name>
<files>supabase/migrations/20261012200000_vocational_plan_decisions.sql</files>
<action>Ersätt endast berörda definitioner för källberedskap, beslutsspärrar och detaljprojektion, med exakt programprofil från plan 01. Versionssätt beslutsregelns basisHash så gamla öppna beslutsskärmar ger konflikt. Bevara kommandofix 180100, scopes, låsordning, CAS, replay, mandat, MFA-gräns och atomisk audit. Ett gammalt kvitto med tidigare check-ID:n ska återspelas identiskt efter regeländringen; aktuell profil får inte eftervalidera bort ett redan lyckat kvitto. Färska kommandon ska kräva aktuella kontroller. Nya interna hjälpare ska vara stängda för PUBLIC och Worker; inga nya publika skrivgrants behövs. Return ska fortfarande endast gälla submitted och kräva kommentar.</action>
<verify>Statisk diff och transaktionellt SQL-prov med rollback, inklusive befintliga HE-fall.</verify>
<done>Framåtmigration ändrar regler utan verksamhetsdatamigrering eller behörighetsutvidgning.</done>
</task>

<task type="auto">
<name>Pröva databasparitet, bevarande och exakt installation</name>
<files>supabase/tests/phase5_vocational_decision_contract.test.sql, work/pilot/verify-vocational-plan-decisions.mjs, work/pilot/apply-vocational-plan-decisions.mjs</files>
<action>Återanvänd granskade beslutsverktygens mål-/advisorylock-/fingerprintmönster. Testa båda yrkesramar, alla profiler, poäng/tid, program före timplan, upprepade return/resubmit, felroll/skola, samtidighetskonflikt, auditfel och immutable historik. SQL/TS ska projicera samma blockerare/kontroller. Hasha de 15 etablerade verksamhetstabellerna plus fyra beslutstabeller; bevara DDL/ACL/journal utom uttrycklig migration. Använd endast egna syntetiska provgrafer.</action>
<verify>Rollback körning PASS före apply; efter apply verifieras exakt journal, funktioner, grants och oförändrade originalrader inklusive tidsstämplar.</verify>
<done>Installerad ändring har färskt faktiskt bevis och inga originalplaner är ändrade.</done>
</task>

</tasks>

<verification>
Kontrollera beteendet och bevarandet enligt respektive uppgift; historiska godkända prov ersätter inte färska kontroller.
</verification>

<success_criteria>
Databasen kan inte godta yrkesplaner som servern avvisar.
Återsändning kräver huvudman, inskickad plan och motivering.
Äldre beslut, timplansunderlag och klasskopplingar bevaras.
</success_criteria>

<output>
Skriv 05-VOCATIONAL-02-SUMMARY.md med faktisk kod, verifieringsbevis och kvarstående gränser.
</output>
