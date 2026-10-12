---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "DECISION-05"
type: execute
status: planned
wave: 5
depends_on: ["DECISION-04"]
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
files_modified:
  - web/e2e/plan-decisions.spec.ts
  - web/playwright.plan-decisions.config.ts
  - docs/handbok/programplaner.md
  - docs/handbok/timplaner.md
  - docs/handbok/planering.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-VERIFICATION.md
  - .planning/STATE.md
  - .planning/REQUIREMENTS.md
must_haves:
  truths:
    - "Hela beslutskedjan är verifierad i byggd app på dator och telefon."
    - "Levererad funktion och verkliga kvarstående begränsningar redovisas var för sig."
  artifacts:
    - path: web/e2e/plan-decisions.spec.ts
      provides: "Slutprov, handbok och genomgång av kvarstående luckor"
    - path: web/playwright.plan-decisions.config.ts
      provides: "Slutprov, handbok och genomgång av kvarstående luckor"
  key_links:
    - "Slutet klientkontrakt → protectedRoute → serverkontroll → låst SQL → beständig återläsning"
---

# Slutprov, handbok och genomgång av kvarstående luckor

<objective>
Hela beslutskedjan är verifierad i byggd app på dator och telefon.
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
<name>1. Prova kedjan och felhantering på dator/telefon</name>
<files>web/e2e/plan-decisions.spec.ts, web/playwright.plan-decisions.config.ts</files>
<action>Kör mot separat byggd Worker och egna syntetiska data. HM fastställer program; R/admin skapar/fyller timutkast, skickar; HM återsänder; R rättar/skickar; HM fastställer. Prova även timutkast före programbeslut, explicit källuppdatering, ny version efter beslut och gamla klasslänkar. Testa dirty/queued/unknown, två flikar, mandatbyte, reload/back, skol-/årsretur, tangentbord och mobil utan horisontell åtgärdsförlust. Kontrollera rätt snapshot och verklig DB-status, inte bara synlig badge.</action>
<verify>npx playwright test --config=playwright.plan-decisions.config.ts; riktade modell/serverprov, tsc, oxlint och separat skyddat appbygge</verify>
<done>Alla positiva steg och relevanta negativa fall passerar på samma slutkälla/bygge med städning/bevaring.</done>
</task>

<task type="auto">
<name>2. Dokumentera, leverera lokalt och granska luckor</name>
<files>docs/handbok/programplaner.md, docs/handbok/timplaner.md, docs/handbok/planering.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-VERIFICATION.md, .planning/STATE.md, .planning/REQUIREMENTS.md</files>
<action>Uppdatera handbok med roll/steg/låsning/återsändning/ny version och skillnad planerad–genomförd tid. Bygg docs. Gör slutgranskning enligt CONTEXT med konkreta kvarstående fynd och rätta avgränsade fel före leverans. Uppdatera lokala 3012 till samma verifierade bygge med tidigare bygge bevarat; läsande verklig lokal OIDC-smoke efter bytet. Dokumentera rätt omfattning i STATE/krav, inte full fas eller kommunacceptans. Commit/pusha bara egna kontrollerade ändringar, verifiera origin enligt AGENTS.</action>
<verify>npm run docs:build; verklig lokal OIDC på 3012; verifierat byggfingeravtryck och origin-commit</verify>
<done>Användaren kan pröva faktisk lokal leverans och läsa vad som eventuellt ännu saknas.</done>
</task>

</tasks>

<verification>
Testa ändrad kod, inte historisk grön status. Node/ts/lint körs i web; work/pilot och docs från roten. SQL och Worker endast mot assertTarget(protected), egna syntetiska data och ingen reset. Alla negativa fall kontrollerar oförändrade verksamhetsrader; säkerhetsaudit bevaras. Nya migreringsnamn nedan reserveras först efter kontroll mot arbetskopia och faktisk journal. Ändra inte äldre migrationer.
</verification>

<success_criteria>
- Hela beslutskedjan är verifierad i byggd app på dator och telefon.
- Levererad funktion och verkliga kvarstående begränsningar redovisas var för sig.
</success_criteria>

<output>
Skriv 05-DECISION-05-SUMMARY.md med faktiska prov, begränsningar och eventuell kontrollerad avvikelse. Ingen full fasacceptans här.
</output>
