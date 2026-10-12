---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "DECISION-02"
type: execute
status: planned
wave: 2
depends_on: ["DECISION-01"]
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
files_modified:
  - supabase/migrations/20261012170000_plan_decision_foundation.sql
  - supabase/tests/phase5_plan_decisions.test.sql
  - work/pilot/apply-plan-decision-migration.mjs
  - work/pilot/apply-plan-decision-migration.test.mjs
must_haves:
  truths:
    - "Rätt mandat kan besluta exakt granskad version; direkta otillåtna övergångar nekas."
    - "Källor, historik, kvitton och klasskopplingar bevaras genom hela beslutskedjan."
  artifacts:
    - path: supabase/migrations/20261012170000_plan_decision_foundation.sql
      provides: "Atomiska program- och timplansbeslut"
    - path: supabase/tests/phase5_plan_decisions.test.sql
      provides: "Atomiska program- och timplansbeslut"
  key_links:
    - "Slutet klientkontrakt → protectedRoute → serverkontroll → låst SQL → beständig återläsning"
---

# Atomiska program- och timplansbeslut

<objective>
Rätt mandat kan besluta exakt granskad version; direkta otillåtna övergångar nekas.
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
<name>1. Inför stängda beslut och lagringsskydd</name>
<files>supabase/migrations/20261012170000_plan_decision_foundation.sql, supabase/tests/phase5_plan_decisions.test.sql</files>
<action>Inför separata RPC för auditerat beslutsunderlag, beslut och kvittostatus. Återanvänd aktuell actor/scope/livscykel och låsordning; kontrollera levande mandat efter väntan. Programinsändning/återsändning lagras i separat reviewrecord med workflowrevision så befintliga planstatusparsrar består. Alla befintliga utkastskrivningar nekas för inskickat underlag genom DB-guard. Program utkast→faststalld endast HM, direkt från granskat utkast eller inskickat underlag; ersätt föregående fastställda atomiskt. Tim utkast/atersand→forslag R/admin; forslag→atersand/faststalld HM. Return kräver saklig kort kommentar. Uppdatera guards/cellskydd så inskickade och fastställda versioner inte kan redigeras, men återsända kan rättas. Beräkna regler från låst sparad data, inte klientrapport; använd TS/SQL-paritetsfall. Kvitto+verksamhetshistorik+DB-audit ingår i samma transaktion och interna aktörer ersätter auth.users-antaganden. Bevara immutabel gym_basis. Serverns kanoniska källinnehållshash skiljer innehållsändring från programfastställandets rena revision/statusändring; oförändrat innehåll kan beslutas utan att gym_basis skrivs om. Faktisk källändring kräver explicit ny version. Utkast-till-timplan består. Inga klasslänkar uppdateras. Alla nya funktioner stängda för PUBLIC/anon/authenticated/Worker.</action>
<verify>SQL-prov via run-sql-tests.mjs; positiva övergångar, roll/kund/skola/återkallat mandat, CAS/låsväntan, payloadbyte/replay, auditrollback, källändring och full före/efterbevaring.</verify>
<done>Inget beslut kan kringgå analys eller mandat, och återförsök dubblerar inte beslut.</done>
</task>

<task type="auto">
<name>2. Installera reproducerbart i lokalt skyddat mål</name>
<files>work/pilot/apply-plan-decision-migration.mjs, work/pilot/apply-plan-decision-migration.test.mjs</files>
<action>Bygg på apply-gym-timplan-migration.mjs och verify-target.mjs. Namngiven migration, checksumma, faktisk journal/definition/ACL före och efter, rollbackprov och atomisk journalering; inga generiska fria SQL-filer eller reset. Kontrollera genom riktade verifieringstester att fel mål/checksumma/okänd migration stoppar före mutation.</action>
<verify>node --test work/pilot/apply-plan-decision-migration.test.mjs; lokal rollback följd av exakt apply</verify>
<done>Foundation är verifierad lokalt och inga Worker-grants har öppnats utan API-preflight.</done>
</task>

</tasks>

<verification>
Testa ändrad kod, inte historisk grön status. Node/ts/lint körs i web; work/pilot och docs från roten. SQL och Worker endast mot assertTarget(protected), egna syntetiska data och ingen reset. Alla negativa fall kontrollerar oförändrade verksamhetsrader; säkerhetsaudit bevaras. Nya migreringsnamn nedan reserveras först efter kontroll mot arbetskopia och faktisk journal. Ändra inte äldre migrationer.
</verification>

<success_criteria>
- Rätt mandat kan besluta exakt granskad version; direkta otillåtna övergångar nekas.
- Källor, historik, kvitton och klasskopplingar bevaras genom hela beslutskedjan.
</success_criteria>

<output>
Skriv 05-DECISION-02-SUMMARY.md med faktiska prov, begränsningar och eventuell kontrollerad avvikelse. Ingen full fasacceptans här.
</output>
