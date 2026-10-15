---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-04"
type: execute
status: planned
wave: 4
depends_on: ["CLASS-COHORT-03"]
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - supabase/migrations/20261015102000_class_cohort_commands.sql
  - supabase/tests/phase5_class_cohort_commands.test.sql
  - work/pilot/verify-class-cohort-commands.mjs
must_haves:
  truths:
    - "Rektor eller administratör med skolmandat kan skapa tomma klasser före fastställd timplan."
    - "Dubbelklick och förlorat svar kan återhämtas utan dubbla klasser eller osäker delskapning."
  artifacts:
    - path: supabase/migrations/20261015102000_class_cohort_commands.sql
      provides: "Tidig klassorganisation med atomiska kvitton"
  key_links:
    - "Aktuellt skolmandat → exakt utbildning/kull → stabilt klass-ID → uttrycklig läsårs-/versionskoppling"
---

# Tidig klassorganisation med atomiska kvitton

<objective>
Rektor eller administratör med skolmandat kan skapa tomma klasser före fastställd timplan.
</objective>

<execution_context>
@/Users/petter.gjores/.codex/skills/gsd/workflows/execute-plan/SKILL.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-IMPLEMENTATION.md
@supabase/migrations/20261012210000_class_timplan_flow.sql
@supabase/migrations/20261014100000_phase5_atomic_cohort_copy.sql
@web/lib/server/authz.ts
</context>

<tasks>
<task type="auto">
<name>Läs skolans befintliga klasser för exakt utbildning</name>
<files>supabase/migrations/20261015102000_class_cohort_commands.sql, supabase/tests/phase5_class_cohort_commands.test.sql</files>
<action>Inför phase5_class_cohort_underlag(offering_id,unit_id). Skolscope prövas mot aktuell actor/session, kund, huvudman, offering_units och just vald skola i mandate_units; generell åtkomst till en annan skola i samma utbildning räcker inte. HM läser men canManage=false; rektor/admin får skriva inom oförändrat mandat. Underlaget returnerar offeringId/unitId, utbildningsnamn, exakt utbildningsstart/firstSchoolYear eller null + blockers, educationRevision, sourceToken för ID-sorterad källversions-/revisions-/datumsnapshot enligt IMPLEMENTATION samt klasser med id/name/cohortStartYear/startsOn/endsOn/validitySource. Klasslistan återanvänder school_classes, max 2000; tomt resultat skiljs från nekad läsning. Arkiverad/oklar utbildning kan läsas men inte få nya klasser. En ny planversion visar samma klasstruktur.</action>
<verify>Rollback-SQL prövar HM read-only, rektor/admin rätt skola, annan skola i samma offering, annan kund, ändrat uppdrag, tom lista och blockerad källa. Inga elevfält i svar.</verify>
<done>Underlaget kräver ingen fastställd timplan och visar enbart klasser i exakt behörig utbildning/skola.</done>
</task>

<task type="auto">
<name>Skapa namngivna klasser och återläs exakt begäran</name>
<files>supabase/migrations/20261015102000_class_cohort_commands.sql, supabase/tests/phase5_class_cohort_commands.test.sql</files>
<action>Inför phase5_class_cohort_command(jsonb) och phase5_class_cohort_status(jsonb) med kontrakt i IMPLEMENTATION. Bekräftad lista 1–20 uttryckliga namn, inga genererade klasser från tomt sökresultat. Alla namn och datum kontrolleras före INSERT; hela listan är en transaktion med per-klass audit och immutable requestbundet kvitto. Återanvänd klass-ID från kvitto endast vid samma actor+assignment+exakt request; återpröva aktuellt mandat även för replay/status. Samma commandId annan payload är konflikt. status är läsande och visar found/not_found utan att skapa; not_found efter faktiskt säkerställd läsning medger omförsök av exakt samma request. Lås sourceToken/lifecycle revision och kontrollera mot aktuell databas; högst 20 klasser per kommando, totalt högst 2000. Inga timplanskopplingar, elever, uppdrag eller ändrat offering_id skapas. Privata receipts får RLS, inga tabellgrants, immutable update/delete/truncate-skydd. Endast tre publika RPC-entrypoints ges Worker execute; hjälpare stängda, anon/authenticated/service_role nekade. Ny klass måste ha bekräftat startsOn lika med verifierat utbildningsstartdatum, endsOn=null och validitySource=education_start. Inget redigerbart giltighetsdatum i denna etapp. Den gamla timplansbundna create-vägen använder plan02:s gemensamma nya-rader-guard så nya klasser aldrig får legacy-null; gamla receipts förblir oförändrade.</action>
<verify>SQL: batch två klasser, ogiltig andra klass ger noll rader, dublettnamn, två utbildningar samma år med olika namn, avvisat samma skola/namn/startläsår även över olika utbildningar, replay, nytt payload/gammalt ID, actor/assignment-byte, MFA-/sessionbortfall, auditfel, receipts immutable, source revision-byte, samtidig request, status utan mutation och inga nya klass-/elev-/timplansrelationer vid fel.</verify>
<done>Varje begäran skapar exakt avsedd lista en gång eller ingenting; status bevisar samma begäran.</done>
</task>

</tasks>

<verification>
Den tidiga enkla rollback-anslutningen provar låsregler, atomik och nekanden, inte faktisk konkurrens mellan sessioner. Samtidig startändring/klasskapning och samtidiga requests måste provas med två riktiga anslutningar/HTTP i plan08 efter isolerad apply; markera tills dess dessa fall ej körda.
Kör IMPLEMENTATION:s konkreta rollback-harness med CLASS_COHORT_STAGE=04; föregående ännu ej installerade paketmigrationer appliceras endast inne i samma rollback.
Kör planens riktade kontroller mot aktuella källor. Bevara tidigare elev-/klass-/versionsdata; skriv endast syntetisk egen fixtur i avsedd isolerad miljö. Se SS12000-bilagan: SS 12000:2024, OpenAPI 2.1.0; intern en-utbildning-per-klass och legacydatum/namnnyckel är begränsningar, inte verifierat standardstöd. Ingen verklig kommunanslutning provas här.
</verification>

<success_criteria>
Rektor eller administratör med skolmandat kan skapa tomma klasser före fastställd timplan.
Dubbelklick och förlorat svar kan återhämtas utan dubbla klasser eller osäker delskapning.
</success_criteria>

<output>
Skriv .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-04-SUMMARY.md med faktiskt resultat, kommandon/exitkoder, bevisreferenser, kvarstående gränser och SS12000-bedömning. Uppdatera paketets status proportionerligt. Versionshantera endast denna plans avgränsade ändringar; pusha aktuell gren och verifiera avsedd fjärrcommit enligt AGENTS.md.
</output>

## Genomförandeprecisering 2026-10-15

En tredje avgränsad provfil, `work/pilot/verify-class-cohort-commands.mjs`, sparar reproducerbar syntetisk setup och rollback med unik privat rapport och käll-/data-/schema-/ACL-hashar. Plan02–03:s helpers återanvänds efter granskning. Den ersätter engångskörvägen utan att installera beständiga migrationer. Det frysta kontraktet i IMPLEMENTATION gäller för SQL och TypeScript parallellt.
