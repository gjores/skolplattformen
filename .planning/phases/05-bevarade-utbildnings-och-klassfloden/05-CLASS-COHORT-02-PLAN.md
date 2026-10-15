---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-02"
type: execute
status: planned
wave: 2
depends_on: ["CLASS-COHORT-01"]
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - supabase/migrations/20261015100000_class_cohort_dates.sql
  - supabase/tests/phase5_class_cohort_dates.test.sql
must_haves:
  truths:
    - "Nya klasser får verifierad giltighetsstart utan att gamla datum eller medlemskap gissas."
    - "När klasser finns kan utbildningsstart inte ändras bakom klassorganisationen."
  artifacts:
    - path: supabase/migrations/20261015100000_class_cohort_dates.sql
      provides: "Klassens giltighet och låst utbildningsstart"
  key_links:
    - "Aktuellt skolmandat → exakt utbildning/kull → stabilt klass-ID → uttrycklig läsårs-/versionskoppling"
---

# Klassens giltighet och låst utbildningsstart

<objective>
Nya klasser får verifierad giltighetsstart utan att gamla datum eller medlemskap gissas.
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
@supabase/migrations/20261004120000_phase5_programplan_lifecycle.sql
@supabase/migrations/20261004154000_phase5_programplan_unit_packages.sql
@supabase/migrations/20261004140000_phase5_offering_unit_linkage.sql
@supabase/migrations/20261012180000_plan_decision_flow.sql
</context>

<tasks>
<task type="auto">
<name>Utöka befintlig klassmodell additivt</name>
<files>supabase/migrations/20261015100000_class_cohort_dates.sql</files>
<action>Lägg nullable starts_on och ends_on samt validity_source på school_classes med riktiga date-kontroller, änddatum inkluderande och inte före startdatum. Nya klasser får starts_on lika med exakt verifierad utbildningsstart, ends_on=null och validity_source=education_start; äldre rader får starts_on/ends_on=null och validity_source=legacy_unknown utan gissad backfill. Ingen datumredigering eller avslutsfunktion införs. Lägg nullable created_at/updated_at utan now()-backfill: nya lokala klassrader får faktisk registreringstid från gemensam trigger, äldre okända tidsstämplar förblir null. Separera dessa metadata från starts_on. Vid senare faktisk tillåten klassändring får updated_at uppdateras, aldrig fabricera created_at. Äldre rader behåller null och samma ID, namn, start_year, offering_id och elever. start_year behåller betydelsen kullens första läsår; starts_on är klassens egen giltighet, inte medlemskapets datum. Lägg sluten hjälpare för ett entydigt utbildningsstartdatum: kräv samstämmiga giltiga startedOn i bundna programplansversioner för samma offering samt förenlighet med offerings.start_year som kalenderår. Återanvänd inte phase5_programplan_starts_on:s min/fallback som bevis på exakt källa. Saknat eller motstridigt underlag ger blockerad ny klassbildning men oförändrad äldre läsning. Ingen extern ID-kolumn eller ny gruppmodell behövs. Käll-/insert-kravet för känt utbildningsdatum gäller paketets lokala gymnasieklasser inklusive gamla gym-timplan create. Andra skolformers befintliga klassvägar får behålla null/legacy_unknown och ska inte kräva Gy25-programplan; lägg regression för grundskola och introduktionsprogram. Medlemskapsdatumskontrollen gäller varje klass som faktiskt har känt datum, oberoende av skolform.</action>
<verify>Kör IMPLEMENTATION:s konkreta rollback-harness med CLASS_COHORT_STAGE=02. Rollback-SQL: additiv migration bevarar hash av alla tidigare kolumner/rader; separata klass-/medlemskapsdatum, null legacy, giltig öppen sluttid, ogiltig datumordning och motsägande programplansdatum.</verify>
<done>Klassgiltighet är en separat uppgift med oförändrad historik och uttryckligen okända legacydatum.</done>
</task>

<task type="auto">
<name>Skydda startdatum genom samtliga skrivvägar</name>
<files>supabase/migrations/20261015100000_class_cohort_dates.sql, supabase/tests/phase5_class_cohort_dates.test.sql</files>
<action>Lägg DB-skydd på relevanta offering-/point_plans-skrivningar så att befintlig klass låser utbildningsstart oavsett lifecycle-update, direkt programplansändring, ny version eller annan aktuell RPC. Samma datum och vanliga innehållsändringar tillåts; annan start kräver ny kull. Återanvänd befintlig låsordning kund/skola/utbildning/plan och serialisera mot klasskapande. Ingen datumändring får först hinna skapa en klass på gammalt underlag. Bevara skolborttagningsspärr från offering_units-länkningen. Ge 40001 med specifik hint class_cohort_start_locked för serverns begripliga besked. Ändra inga historiska migrationer och öppna inga tabellrättigheter. Lägg gemensamt INSERT/UPDATE-skydd på pupil_class_memberships så alla befintliga registervägar, även utbildningsbyte, nekar period före känd klass-start och efter känt inkluderande slutdatum; hantera öppet medlemskap med känt klass-slut konsekvent som otillåten överhängande period. Äldre klasser med okänd giltighet behåller befintligt beteende, historiska medlemskap ändras inte. Lås klassraden vid kontroll. Nya klassrader via det gamla phase5_class_command(create) ska få samma verifierade starts_on/proveniens genom gemensam insert-trigger eller kommandobrygga; gamla kvitton/replays returneras oförändrade och historiska rader skrivs inte om.</action>
<verify>Direkta SQL-/RPC-prov: ändrat datum inom samma läsår, ändrat kalenderår, ny planversion annat datum, oförändrat datum, kopiering till ny offering, samtidig startändring/klasskapande och försök ta bort skola med klass. Verifiera nekande eller full atomisk framgång och oförändrade främmande rader. Testa även registermutation för både klassbyte och utbildningsbyte med före/på/efter start, öppet medlemskap och legacy-null; gammalt create skapar känt datum och gammal receipt återspelas utan historikändring.</verify>
<done>Startdatum kan inte glida genom alternativ skrivväg; kopiering till ny kull fungerar utan gamla klass-ID:n.</done>
</task>

</tasks>

<verification>
Den tidiga enkla rollback-anslutningen provar låsregler, atomik och nekanden, inte faktisk konkurrens mellan sessioner. Samtidig startändring/klasskapning och samtidiga requests måste provas med två riktiga anslutningar/HTTP i plan08 efter isolerad apply; markera tills dess dessa fall ej körda.
Kör planens riktade kontroller mot aktuella källor. Bevara tidigare elev-/klass-/versionsdata; skriv endast syntetisk egen fixtur i avsedd isolerad miljö. Se SS12000-bilagan: SS 12000:2024, OpenAPI 2.1.0; intern en-utbildning-per-klass och legacydatum/namnnyckel är begränsningar, inte verifierat standardstöd. Ingen verklig kommunanslutning provas här.
</verification>

<success_criteria>
Nya klasser får verifierad giltighetsstart utan att gamla datum eller medlemskap gissas.
När klasser finns kan utbildningsstart inte ändras bakom klassorganisationen.
</success_criteria>

<output>
Skriv .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-02-SUMMARY.md med faktiskt resultat, kommandon/exitkoder, bevisreferenser, kvarstående gränser och SS12000-bedömning. Uppdatera paketets status proportionerligt. Versionshantera endast denna plans avgränsade ändringar; pusha aktuell gren och verifiera avsedd fjärrcommit enligt AGENTS.md.
</output>
