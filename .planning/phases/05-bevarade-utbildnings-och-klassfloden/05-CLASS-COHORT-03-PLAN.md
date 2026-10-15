---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-03"
type: execute
status: complete
wave: 3
depends_on: ["CLASS-COHORT-02"]
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - supabase/migrations/20261015101000_class_cohort_link_identity.sql
  - supabase/tests/phase5_class_cohort_link_identity.test.sql
  - work/pilot/verify-class-cohort-link-identity.mjs
must_haves:
  truths:
    - "Klassens stabila ID styr identifierade kopplingar och gamla länkar flyttas inte."
    - "En namnkollision mellan kullar ger ett begripligt stopp utan att en annan klass länkas."
  artifacts:
    - path: supabase/migrations/20261015101000_class_cohort_link_identity.sql
      provides: "Identifierade länkar och ärliga namnkollisioner"
  key_links:
    - "Aktuellt skolmandat → exakt utbildning/kull → stabilt klass-ID → uttrycklig läsårs-/versionskoppling"
---

# Identifierade länkar och ärliga namnkollisioner

<objective>
Klassens stabila ID styr identifierade kopplingar och gamla länkar flyttas inte.
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
@web/lib/cohort-store.ts
@supabase/migrations/20260908120000_cohorts_classes.sql
@supabase/migrations/20261012210000_class_timplan_flow.sql
</context>

<tasks>
<task type="auto">
<name>Gör skyddade klassuppslag ID-först utan ny primärnyckel</name>
<files>supabase/migrations/20261015101000_class_cohort_link_identity.sql, supabase/tests/phase5_class_cohort_link_identity.test.sql</files>
<action>Behåll class_timplans äldre PK(unit_id,class_name,start_year) och school_classes namn/startår-unikhet i detta paket. Ändra identifierad läsning, låsning och uppdatering till class_id + tillämpningsår. Legacyuppslag får endast avse null class_id, rätt skola och timplan vars offering_id är samma som klassens; adoption kräver uttrycklig previousPlanId + expectedLinkRevision och entydigt klassval. En legacyrad från annan kull ska aldrig visas som den nya klassens länk. Före INSERT prövas namn/läsår-PK-kollision; en annan klass eller utbildning ger 40001 hint class_name_year_conflict. Serialisera konkurrerande skapningar och konvertera även relevant unique violation till samma säkra konflikt. Ingen automatisk namnändring, klassflytt, radering eller adoption. Kontrollera kända starts_on/ends_on mot tillämpningsläsårets överlapp; null legacy bevaras och betecknas okänt, utan retroaktiv datumskrivning.</action>
<verify>SQL-matris: två kullar med samma klassnamn och överlappande tillämpningsår ger konflikt/ingen mutation; två olika namn fungerar; äldre korrekt adoption kräver exakt kvitto; annan offering nekas; ny planversion lämnar alla tidigare läsår kvar. Pröva klassgiltighetens ändgränser och medlemskapshash.</verify>
<done>Ingen identifierad klass länkas via en annan klass namn; känd äldre PK-begränsning är deterministisk och synlig.</done>
</task>



<task type="auto">
<name>Kontrollera äldre vägar och bevarandebevis</name>
<files>supabase/tests/phase5_class_cohort_link_identity.test.sql</files>
<action>Utöka provmatrisen med befintliga identifierade länkar, gamla receipts och äldre explicit adoption, inklusive olika klass-ID som delar namn i skilda kullar. Kontrollera att gammal demoadapter fortfarande kan läsa/spara sin legacy-form under samma befintliga mandat, att identifierade länkar inte kan raderas genom legacy-vägen och att inga relationer byter offering/klass vid ny version. Detta prov ändrar inte demo- eller produktmandat.</action>
<verify>Kör paketets rollback-körväg i IMPLEMENTATION med migration02/03 och båda SQL-prov; bevara hash av gamla data, ACL och medlemskap.</verify>
<done>Äldre skyddade kopplingar och demoavgränsning består med känt namnkollisionsresultat.</done>
</task>
</tasks>

<verification>
Kör IMPLEMENTATION:s konkreta rollback-harness med CLASS_COHORT_STAGE=03; föregående ännu ej installerade paketmigrationer appliceras endast inne i samma rollback.
Kör planens riktade kontroller mot aktuella källor. Bevara tidigare elev-/klass-/versionsdata; skriv endast syntetisk egen fixtur i avsedd isolerad miljö. Se SS12000-bilagan: SS 12000:2024, OpenAPI 2.1.0; intern en-utbildning-per-klass och legacydatum/namnnyckel är begränsningar, inte verifierat standardstöd. Ingen verklig kommunanslutning provas här.
</verification>

<success_criteria>
Klassens stabila ID styr identifierade kopplingar och gamla länkar flyttas inte.
En namnkollision mellan kullar ger ett begripligt stopp utan att en annan klass länkas.
</success_criteria>

<output>
Skriv .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-03-SUMMARY.md med faktiskt resultat, kommandon/exitkoder, bevisreferenser, kvarstående gränser och SS12000-bedömning. Uppdatera paketets status proportionerligt. Versionshantera endast denna plans avgränsade ändringar; pusha aktuell gren och verifiera avsedd fjärrcommit enligt AGENTS.md.
</output>

## Genomförandeprecisering 2026-10-15

Reproducerbar syntetisk setup och rollback sparas i `work/pilot/verify-class-cohort-link-identity.mjs` som tredje avgränsad provfil, med återanvändning av plan02:s källbundna setup. Privat unik rapport krävs; källor, originaldata, ACL och schema jämförs. Inga beständiga migrationer installeras här.

Aktuell protected-miljö har sedan tidigare indragna direkta tabellrättigheter för demoadaptern. Legacyformatet provas därför med avgränsad syntetisk migrationsfixtur, medan verkliga klient-/Worker-nekanden och oförändrad ACL verifieras separat. Proven ska inte påstå fungerande direkt demoadapter i protected och inga rättigheter får öppnas för att få ett sådant prov att passera. Detta är en precisering mot aktuell behörighetsmodell, inte ändrat verksamhetsmandat.
