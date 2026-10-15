---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-01"
type: execute
status: planned
wave: 1
depends_on: []
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - web/app/protected-class-timplans.tsx
  - web/app/protected-class-timplans.css
  - web/e2e/operational-class-timplan.spec.ts
  - work/pilot/verify-class-timplans.mjs
must_haves:
  truths:
    - "Användaren skiljer valt planeringsår, utbildningsstart och klassens tillämpningsläsår."
    - "Ett år före kullstart kan inte användas för koppling; giltigt tidigare läsår inom kullen finns kvar."
  artifacts:
    - path: web/app/protected-class-timplans.tsx
      provides: "Begripligt läsår för klassens timplan"
  key_links:
    - "Aktuellt skolmandat → exakt utbildning/kull → stabilt klass-ID → uttrycklig läsårs-/versionskoppling"
---

# Begripligt läsår för klassens timplan

<objective>
Användaren skiljer valt planeringsår, utbildningsstart och klassens tillämpningsläsår.
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
@web/lib/class-timplan.ts
@web/lib/gym-timplan.ts
@supabase/migrations/20261012240000_class_start_calendar.sql
</context>

<tasks>
<task type="auto">
<name>Förklara datum och begränsa det operativa årsvalet</name>
<files>web/app/protected-class-timplans.tsx, web/app/protected-class-timplans.css</files>
<action>Visa plan.source.startedOn som fryst utbildningsstart, data.plan.startYear som första läsår och det ursprungliga schoolYear som valt planeringsår. Skriv ut Årskurs 1–3 tillsammans med respektive läsår. Det operativa kopplingsvalet innehåller endast serverunderlagets tre giltiga år; ett URL-/planeringsår utanför intervallet visas som en separat läsande upplysning med uttryckligt val av giltigt år, aldrig tyst omskrivning av planeringskontext eller automatisk sparning. Behåll alla befintliga versionslänkar i den läsande listan. Saknat/motsägande underlag spärrar skrivning. Behåll serverns årsspärr, revision, uppdragsbyte och osäkert sparsvar. Gör läsårsetiketterna konsekventa på dator och telefon.</action>
<verify>Riktade UI-prov med höststart, januari/vårstart, 30 juni/1 juli, URL-år före/efter intervallet, giltigt äldre år, null start samt motsägande källa. Kontrollera tangentbord, fokus och telefonbredd.</verify>
<done>Användaren ser varför 2027/28 är giltigt för start 2027-08-01 även när planeringsåret är 2028/29; ogiltigt år visas inte som tillåten koppling.</done>
</task>

<task type="auto">
<name>Lägg ett faktiskt negativt prov före kullstart</name>
<files>web/e2e/operational-class-timplan.spec.ts, work/pilot/verify-class-timplans.mjs</files>
<action>Utöka befintligt syntetiskt klassprov med schoolYear=firstYear-1 och försök att kringgå UI via phase5_class_command. Läs före/efter så att nekandet bevisar oförändrade länkar och elever. Bevara juli-gränsens tidigare fall och separera mockat UI-bevis från faktisk SQL-körning. Kör bara mot assertTarget-verifierad isolerad skyddad miljö, granska skriptets skrivningar och använd rollback. Befintlig main försöker återapplicera migrationen och får inte köras på installerat schema: inför ett uttryckligt --applied-läge som verifierar installerade funktionsdefinitioner/fingeravtryck, kör scenarierna i rollback utan migrations-DDL och kräver --out. Behåll separat ursprungligt migrationsläge för avsedd basdatabas.</action>
<verify>node work/pilot/verify-class-timplans.mjs --applied --out /private/tmp/class-cohort-year-before-start.json; kör riktad operational-class-timplan.spec.ts enligt aktuell Playwright-konfiguration. Protokollför kommandon, exitkod och källrevision.</verify>
<done>SQL nekar år före start utan mutation och UI-fallen passerar på dator/telefon.</done>
</task>

</tasks>

<verification>
Kör planens riktade kontroller mot aktuella källor. Bevara tidigare elev-/klass-/versionsdata; skriv endast syntetisk egen fixtur i avsedd isolerad miljö. Se SS12000-bilagan: SS 12000:2024, OpenAPI 2.1.0; intern en-utbildning-per-klass och legacydatum/namnnyckel är begränsningar, inte verifierat standardstöd. Ingen verklig kommunanslutning provas här.
</verification>

<success_criteria>
Användaren skiljer valt planeringsår, utbildningsstart och klassens tillämpningsläsår.
Ett år före kullstart kan inte användas för koppling; giltigt tidigare läsår inom kullen finns kvar.
</success_criteria>

<output>
Skriv .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-01-SUMMARY.md med faktiskt resultat, kommandon/exitkoder, bevisreferenser, kvarstående gränser och SS12000-bedömning. Uppdatera paketets status proportionerligt. Versionshantera endast denna plans avgränsade ändringar; pusha aktuell gren och verifiera avsedd fjärrcommit enligt AGENTS.md.
</output>
