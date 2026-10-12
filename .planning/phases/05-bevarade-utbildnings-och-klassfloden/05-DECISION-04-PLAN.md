---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "DECISION-04"
type: execute
status: completed
wave: 4
depends_on: ["DECISION-03"]
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
files_modified:
  - web/app/protected-plan-decisions.tsx
  - web/app/protected-programplan-workspace.tsx
  - web/app/protected-programplan-sheet.tsx
  - web/app/protected-gym-timplan-workspace.tsx
  - web/lib/gym-timplan.ts
  - web/lib/server/gym-timplan.ts
  - web/lib/protected-plan-decisions.ts
  - web/lib/protected-plan-decisions.test.mjs
must_haves:
  truths:
    - "Användaren ser nuvarande status, nästa ansvarig handling och skäl till varje spärr."
    - "Återsändning, fastställande och ny version fungerar utan förlorade timmar eller flyttade klasskopplingar."
  artifacts:
    - path: web/app/protected-plan-decisions.tsx
      provides: "Tydliga beslut och nästa steg i arbetsytorna"
    - path: web/app/protected-programplan-workspace.tsx
      provides: "Tydliga beslut och nästa steg i arbetsytorna"
  key_links:
    - "Slutet klientkontrakt → protectedRoute → serverkontroll → låst SQL → beständig återläsning"
---

# Tydliga beslut och nästa steg i arbetsytorna

<objective>
Användaren ser nuvarande status, nästa ansvarig handling och skäl till varje spärr.
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
<name>1. Visa beslutskedjan där planen redigeras</name>
<files>web/app/protected-plan-decisions.tsx, web/app/protected-programplan-workspace.tsx, web/app/protected-programplan-sheet.tsx, web/app/protected-gym-timplan-workspace.tsx</files>
<action>Återanvänd arbetsytorna och visa Utkast→Inskickad för godkännande→Fastställd för timplan samt Återsänd med motivering. Programplan: Granska och fastställ för HM samt Skicka för granskning för behörig skolpersonal, separat reviewstatus utan nya point_plans-statusvärden. En granskningsdialog visar rätt utbildning/skola/version, sparad revision, källprogramplan, poäng/timmar per år och konkreta kontroller. Inga osparade/köade/okända skrivningar får beslutas. Visa vem/vilket uppdrag och när beslutet fattades genom tillåten historik. Formuleringen Timplan skapad skiljs från Fastställd.</action>
<verify>npx tsc --noEmit; npx oxlint app lib</verify>
<done>Rätt roll får rätt åtgärd, och varje stopp säger vad användaren behöver göra.</done>
</task>

<task type="auto">
<name>2. Återhämta och bevara navigationskontext</name>
<files>web/lib/gym-timplan.ts, web/lib/server/gym-timplan.ts, web/lib/protected-plan-decisions.ts, web/lib/protected-plan-decisions.test.mjs</files>
<action>Inför klienthjälpare som binder begäran till plan+skola+mandat och ignorerar sena svar från gammal kontext. Tappat svar återläses med ursprungligt commandId; 409 bevarar egna input och kräver färsk granskning. Återsänd status är redigerbar i SQL/projection/klient. Vid faktiskt ändrat källinnehåll visar nästa steg jämförelse och explicit ny timversion via befintlig create; enbart programfastställandets revisionsändring stoppar inte en innehållsidentisk källa; kopiera endast exakt oförändrade radnycklar. År/sida/filter/back och nyversionens gamla klasskopplingar består.</action>
<verify>node --test lib/protected-plan-decisions.test.mjs lib/gym-timplan.test.mjs lib/server/gym-timplan.test.mjs</verify>
<done>Ingen tyst success, databortfall eller automatisk flytt till annan version/skola.</done>
</task>

</tasks>

<verification>
Testa ändrad kod, inte historisk grön status. Node/ts/lint körs i web; work/pilot och docs från roten. SQL och Worker endast mot assertTarget(protected), egna syntetiska data och ingen reset. Alla negativa fall kontrollerar oförändrade verksamhetsrader; säkerhetsaudit bevaras. Nya migreringsnamn nedan reserveras först efter kontroll mot arbetskopia och faktisk journal. Ändra inte äldre migrationer.
</verification>

<success_criteria>
- Användaren ser nuvarande status, nästa ansvarig handling och skäl till varje spärr.
- Återsändning, fastställande och ny version fungerar utan förlorade timmar eller flyttade klasskopplingar.
</success_criteria>

<output>
Skriv 05-DECISION-04-SUMMARY.md med faktiska prov, begränsningar och eventuell kontrollerad avvikelse. Ingen full fasacceptans här.
</output>
