---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "OPERATIONAL-01"
type: execute
status: planned
wave: 1
depends_on: []
requirements: [ADMIN-04, PLANERING-04]
autonomous: true
files_modified:
  - web/lib/class-timplan.ts
  - web/lib/class-timplan.test.mjs
  - web/lib/server/class-timplan.ts
  - web/lib/server/class-timplan.test.mjs
  - web/app/api/klasser/underlag/route.ts
  - web/app/api/klasser/skapa/route.ts, web/app/api/klasser/koppla/route.ts
  - supabase/migrations/20261012210000_class_timplan_flow.sql
  - supabase/tests/phase5_class_timplan_flow.test.sql
must_haves:
  truths:
    - "Validerade, mandatbundna kommandon och stabilt ID utan flytt av tidigare kopplingar."
    - "API-kontrakt redo för plan 02 och faktiska bevis skiljda från mockprov."
  artifacts:
    - path: web/lib/class-timplan.ts
      provides: "Beständig klass och skyddad klass–timplanskoppling"
    - path: web/lib/class-timplan.test.mjs
      provides: "Beständig klass och skyddad klass–timplanskoppling"
  key_links:
    - "Aktuellt mandat → validerat kontrakt → faktisk skyddad dataväg → synligt beständigt resultat"
---

# Beständig klass och skyddad klass–timplanskoppling

<objective>
Beständig klass och skyddad klass–timplanskoppling.
</objective>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-CONTEXT.md
</context>

<tasks>
<task type="auto">
<name>Definiera och säkra klasskommandon</name>
<files>web/lib/class-timplan.ts, web/lib/class-timplan.test.mjs, web/lib/server/class-timplan.ts, web/lib/server/class-timplan.test.mjs, web/app/api/klasser/underlag/route.ts, web/app/api/klasser/skapa/route.ts, web/app/api/klasser/koppla/route.ts, supabase/migrations/20261012210000_class_timplan_flow.sql, supabase/tests/phase5_class_timplan_flow.test.sql</files>
<action>Lägg strikt kontrakt för beständig klass, klasskapande samt exakt skol-/läsårs-/timplansversions-/kolumnkoppling. Avstämt kontrakt: ClassPlanUnderlag innehåller plan med nullable fryst startYear, schoolYear, canManage, blockers, classes med länkar/legacy samt linkedClasses för alla läsår. POST /klasser/underlag, /skapa, /koppla. Huvudman läser; rektor/admin skapar och kopplar inom aktuellt skolmandat. Lägg nullable class_id/revision på befintliga länkar och privat immutable class_plan_commands för kvitton. Explicit legacy-adoption kräver tidigare plan/revision. Servern härleder korrekt åk1–3 från fryst startedOn och läsårsgräns 1 juli, aldrig klassnamn eller gissad kull. Återanvänd school_classes, offering_units och skolbundna timplans-ID:n; migrera inte befintliga namnkopplingar automatiskt till godtyckligt klass-ID. Läsning visar legacykoppling ärligt. Skrivningar kräver aktuellt servermandat, MFA, CSRF, request-ID/revision, atomisk audit och rollrättigheter förenliga med befintlig skolplanering. Tillåt endast fastställd målversion, rätt skola/utbildning och giltig kolumn/år; behåll gamla bindningar när en ny planversion skapas eller fastställs.</action>
<verify>Riktade Node-prov och rollback-SQL provar ny klass, befintlig klass, dublett, fel kund/skola/utbildning, fel roll, utkastmål, revisionskonflikt och auditfel.</verify>
<done>Validerade, mandatbundna kommandon och stabilt ID utan flytt av tidigare kopplingar.</done>
</task>

<task type="auto">
<name>Koppla faktiskt skyddat API och bevarandebevis</name>
<files>web/lib/class-timplan.ts, web/lib/class-timplan.test.mjs, web/lib/server/class-timplan.ts, web/lib/server/class-timplan.test.mjs, web/app/api/klasser/underlag/route.ts, web/app/api/klasser/skapa/route.ts, web/app/api/klasser/koppla/route.ts, supabase/migrations/20261012210000_class_timplan_flow.sql, supabase/tests/phase5_class_timplan_flow.test.sql</files>
<action>Exponera minsta antal behövda Worker-entrypoints via befintlig protectedRoute. Verifiera separat stängda SQL-hjälpare/grants, old-data-hash inklusive tidsstämplar och faktiska Worker-kommandon; testa idempotent omförsök och känd konflikt. Läsårsprojektionen ska läsa den explicita länkens version och kolumn; skapa inga elever/placeringar. Stäm av svarskontrakt med root före UI.</action>
<verify>Faktisk lokal syntetisk API-kedja inklusive negativt skolscope, ny planversion och återläsning efter omstart; egen fixtur städas och säkerhetsaudit bevaras.</verify>
<done>API-kontrakt redo för plan 02 och faktiska bevis skiljda från mockprov.</done>
</task>

</tasks>

<verification>
Nya riktade beteendeprov och bevarandekontroller enligt uppgifterna. Historiska resultat är endast bakgrund.
</verification>

<success_criteria>
Validerade, mandatbundna kommandon och stabilt ID utan flytt av tidigare kopplingar.
API-kontrakt redo för plan 02 och faktiska bevis skiljda från mockprov.
</success_criteria>

<output>
Skriv 05-OPERATIONAL-01-SUMMARY.md med faktiska ändringar, verifieringsbevis och kvarstående gränser.
</output>
