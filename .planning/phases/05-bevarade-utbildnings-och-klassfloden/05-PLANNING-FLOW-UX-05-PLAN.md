---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: PLANNING-FLOW-UX-05
type: execute
status: planned
wave: 4
depends_on: [PLANNING-FLOW-UX-01, PLANNING-FLOW-UX-04]
autonomous: true
files_modified:
  - web/app/protected-home.tsx
  - web/lib/protected-plan-location.ts
  - web/lib/protected-plan-location.test.mjs
  - web/app/protected-gym-timplan-workspace.tsx
  - web/app/protected-apl-workspace.tsx
  - web/app/protected-apl-plan.tsx
  - web/app/plan-decision-panel.tsx
  - web/app/protected-gym-timplan.css
must_haves:
  truths:
    - Program-/timplansytorna visar tabeller i fokus och APL-perioder ligger separat
    - Efter godkänd timtabell finns ett begripligt nästa steg till APL
    - Reload och Back behåller exakt skola, timplan och version
  artifacts:
    - web/app/protected-home.tsx
    - web/lib/protected-plan-location.ts
  key_links:
    - Aktuellt skolmandat och exakt planversion följer genom hela arbetsflödet.
    - Samma kontrakt prövas i modell, skyddad server och faktisk lokal kandidat.
---
<objective>
Gör Timplaner till en tabellarbetsyta och flytta periodplanering/granskning till APL-planering med bevarad säker navigation.
</objective>
<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-PLAN.md
@web/app/protected-home.tsx
@web/lib/protected-plan-location.ts
@web/lib/protected-plan-location.test.mjs
@web/app/protected-gym-timplan-workspace.tsx
@web/app/protected-apl-workspace.tsx
@web/app/protected-apl-plan.tsx
@web/app/plan-decision-panel.tsx
@web/app/protected-gym-timplan.css
</context>
<tasks>
<task type="auto">
<name>1. Inför separat skyddad APL-destination</name>
<files>web/app/protected-home.tsx, web/lib/protected-plan-location.ts, web/lib/protected-plan-location.test.mjs, web/app/protected-gym-timplan-workspace.tsx, web/app/protected-apl-workspace.tsx</files>
<action>Lägg sidebar APL-planering efter Timplaner och URL vy=apl-planering. Återanvänd säker PlanLocation med internt view=timplaner och process=apl om det bevarar parsers och kontext. Ny arbetsyta läser exakt plan, monterar bara APL och visar tillbaka till timplan. Äldre #apl-planering-länkar styr till ny destination med samma plan. Inga APL-perioder i timplansworkspace; klasskoppling och beslut öppnas sekundärt. Separata APL-listan får inte klientfiltrera en sida och behålla fel total: återanvänd full listväljare tydligt märkt Välj timplan, med icke-valbara högskoleförberedande rader, eller verifiera serverfilter före LIMIT/count.</action>
<verify>Location Node samt browser: explicit plan/versionsbyte, skola/läsår, reload, Back, direktlänk, fel scope, osparat och osäkert write över navigation.</verify>
<done>En tydlig separat process finns utan tappad kontext eller dolda/raderade gamla APL-uppgifter.</done>
</task>
<task type="auto">
<name>2. Presentera tabellbeslut och separat APL-status begripligt</name>
<files>web/app/protected-apl-plan.tsx, web/app/plan-decision-panel.tsx, web/app/protected-gym-timplan.css</files>
<action>Anpassa APL-editorn till separata revisionsfält och godkänd timplans APL-capabilities. Timtabellens beslut öppnas i kort dialog/sektion och talar om godkännande av timmar/årsram, inte genomförd APL. Visa Fortsätt till APL-planering för yrkesplan efter godkännande och separat ofärdig/behöver granskas/bekräftad status samt aktuell huvudmannagranskning. Rektors bekräftelse öppnar huvudmannens Granska APL; ändrat innehåll visar att båda behöver förnyas. Behåll legacyövergång, timfördelning, klasskopplingar, namn, nya versioner samt synlig spara/sparfel. Perioder, utbildningsform, veckor/datum, innehåll och detaljerad handledning finns endast i APL-processen. Ny högskoleförberedande plan saknar APLknappar/fält.</action>
<verify>Desktop/phone: timtabell20+20+60 kvar100, inga periodformulär; godkänn utan period; öppna APL/spara40/kvar20; återvänd oförändrad fastställd tabell; tydlig kvarvarande APLstatus; tangenter/fokus/44px/horisontell tabellscroll.</verify>
<done>FLOW-01/02/04/05/07 uppfylls i UI och tydlig skillnad mellan planerad tabell och APLförläggning visas.</done>
</task>
</tasks>
<verification>Root äger dessa filer. Ingen automatisk ny process eller dold APL-skrivning skapas genom navigation.</verification>
<success_criteria>Program-/timplansytorna visar tabeller i fokus och APL-perioder ligger separat; Efter godkänd timtabell finns ett begripligt nästa steg till APL; Reload och Back behåller exakt skola, timplan och version. Bevis och kvarstående begränsningar redovisas, inte antas.</success_criteria>
<output>Skapa 05-PLANNING-FLOW-UX-05-SUMMARY.md med ändringar, verifiering och avvikelser. Avgränsad commit/push görs av ansvarig implementerare efter kontroller; root samordnar delad arbetskopia.</output>
