---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-03A"
type: execute
status: planned
wave: 4
depends_on: ["CLASS-COHORT-03"]
requirements: [ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - web/lib/server/http.ts
  - web/lib/session-channel.ts
  - web/lib/server/audit-details.ts
  - web/lib/server/mandate-route.ts
  - web/lib/server/class-timplan.test.mjs
must_haves:
  truths:
    - "Användaren får ett begripligt och säkert besked när klassnamn eller utbildningsstart står i konflikt."
    - "Samma felkod är typad, auditerad och visad utan främmande verksamhetsdata."
  artifacts:
    - path: web/lib/session-channel.ts
      provides: "Svenska felbesked för klassorganisationens konflikter"
  key_links:
    - "SQL-hint → Deny/ErrorCode → säker audit → ApiError.message"
---

# Begripliga felkoder genom hela API-kedjan

<objective>Gör de nya konfliktbeskeden säkra och fungerande i befintliga datavägar före UI-anslutning.</objective>
<execution_context>
@/Users/petter.gjores/.codex/skills/gsd/workflows/execute-plan/SKILL.md
</execution_context>
<context>
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-IMPLEMENTATION.md
@web/lib/server/class-timplan.ts
</context>
<tasks>
<task type="auto">
<name>Anslut typade konfliktbesked</name>
<files>web/lib/server/http.ts, web/lib/session-channel.ts, web/lib/server/audit-details.ts, web/lib/server/mandate-route.ts</files>
<action>Inför class_name_year_conflict och class_cohort_start_locked i ErrorCode och auditkodernas slutna allowlist. Mappa endast specifika 40001-hints i mandateOperation innan generell SQL-mappning. Anslut svenska besked i session-channel: klassnamnet är upptaget för berörd skola/kull eller läsår; utbildningsstart kan inte ändras när klasser finns, skapa ny kull för annan start. Underlag som ändrats kan använda befintlig conflict; oklar start använder befintlig class_plan_not_ready med begriplig text. Felkod för upptaget namn får samma säkra besked oavsett vilken annan utbildning som äger raden. Inga främmande namn/ID:n eller rå SQL-fel lämnas ut. Behåll generisk behörighetsmaskning och fail-closed audit.</action>
<verify>TypeScript-kontroll och riktade route-/messageText-/sanitizeAuditDetails-prov; spåra faktisk fail→ApiError/messageText.</verify>
<done>Båda konfliktkoderna fungerar typmässigt, i audit och i klientmeddelandet.</done>
</task>
<task type="auto">
<name>Pröva felkedjan från databas till klient</name>
<files>web/lib/server/class-timplan.test.mjs</files>
<action>Utöka befintlig routeharness med de två SQL-hints, generell konflikt och okänd hint; importera och prova messageText samt sanitizeAuditDetails för samma koder. Bevisa säker 409 och svensk text, ingen SQL-/scope-läcka, samt att auditfel fortfarande blockerar. Startlås genom lifecycle-route bekräftas i plan08:s verkliga API-prov. Kontraktsfallen ska testa observerbart beteende, inte bara förekomst av en sträng.</action>
<verify>cd web och kör node --test lib/server/class-timplan.test.mjs samt npx tsc --noEmit och npx oxlint app lib.</verify>
<done>Nya fel kan användas av plan06 utan att läggas till ad hoc i ytterligare filer.</done>
</task>
</tasks>
<verification>Riktade prov enligt ovan. Läs SS12000-bilagan: felkedjan ändrar inga objektmappningar eller externa rättigheter.</verification>
<success_criteria>Säkert felbesked visas genom befintliga API-felkanalen med audit och typkontroll bevarade.</success_criteria>
<output>Skriv 05-CLASS-COHORT-03A-SUMMARY.md; avgränsad commit/push och verifierad fjärrcommit enligt AGENTS.md.</output>
