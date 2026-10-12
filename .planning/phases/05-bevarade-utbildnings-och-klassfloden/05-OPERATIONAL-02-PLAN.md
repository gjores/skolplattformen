---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "OPERATIONAL-02"
type: execute
status: completed
wave: 2
depends_on: ["OPERATIONAL-01"]
requirements: [ADMIN-04, PLANERING-01, PLANERING-04]
autonomous: true
files_modified:
  - web/app/protected-class-timplans.tsx
  - web/app/protected-gym-timplan-workspace.tsx
  - web/app/protected-class-timplans.css
  - web/e2e/operational-class-timplan.spec.ts
must_haves:
  truths:
    - "Användaren kan genomföra hela klasslänken och se dess beständiga resultat."
    - "ADMIN-04:s centrala kedja har nytt faktiskt beteendebevis."
  artifacts:
    - path: web/app/protected-class-timplans.tsx
      provides: "Välj klass, läsår och fastställd timplansversion"
    - path: web/app/protected-gym-timplan-workspace.tsx
      provides: "Välj klass, läsår och fastställd timplansversion"
  key_links:
    - "Aktuellt mandat → validerat kontrakt → faktisk skyddad dataväg → synligt beständigt resultat"
---

# Välj klass, läsår och fastställd timplansversion

<objective>
Välj klass, läsår och fastställd timplansversion.
</objective>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-CONTEXT.md
</context>

<tasks>
<task type="auto">
<name>Gör klasskopplingen nåbar från timplanen</name>
<files>web/app/protected-class-timplans.tsx, web/app/protected-gym-timplan-workspace.tsx, web/app/protected-class-timplans.css, web/e2e/operational-class-timplan.spec.ts</files>
<action>Visa Koppla klass från fastställd gymnasietimplan och en läsbar lista över klasser, läsår, kolumn och exakt planversion. Tillåt skapande av beständig tom klass med explicit utbildning/skola, eller val av befintlig klass. Använd plan 01:s serverkontrollerade capabilities. Visa befintlig bindning före uttryckligt byte, och tydlig information att en ny planversion inte flyttar klasser. Bevara valt planeringsår och osparat arbete; dölj inte gamla ersatta versioners kopplingar.</action>
<verify>Dator och telefon: skapa klass → koppla → ladda om → öppna exakt plan/år. Prova nekad skrivning och synligt sparfel/konflikt utan att tappa formulär.</verify>
<done>Användaren kan genomföra hela klasslänken och se dess beständiga resultat.</done>
</task>

<task type="auto">
<name>Verifiera årsunderlag och versionsbevarande i användarflödet</name>
<files>web/app/protected-class-timplans.tsx, web/app/protected-gym-timplan-workspace.tsx, web/app/protected-class-timplans.css, web/e2e/operational-class-timplan.spec.ts</files>
<action>Låt provet skapa och fastställa ny timplansversion efter en klasskoppling. Verifiera att ursprunglig koppling och klassens årstimmar fortfarande använder den äldre versionen tills ett uttryckligt nytt val görs. Pröva två skolor som delar utbildning och åtkomst inom aktuellt mandat.</action>
<verify>Riktad browserkedja på dator/telefon med faktisk API/DB; originalrader och elevers placeringar oförändrade.</verify>
<done>ADMIN-04:s centrala kedja har nytt faktiskt beteendebevis.</done>
</task>

</tasks>

<verification>
Nya riktade beteendeprov och bevarandekontroller enligt uppgifterna. Historiska resultat är endast bakgrund.
</verification>

<success_criteria>
Användaren kan genomföra hela klasslänken och se dess beständiga resultat.
ADMIN-04:s centrala kedja har nytt faktiskt beteendebevis.
</success_criteria>

<output>
Skriv 05-OPERATIONAL-02-SUMMARY.md med faktiska ändringar, verifieringsbevis och kvarstående gränser.
</output>
