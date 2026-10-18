---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: PLANNING-FLOW-UX-01
type: execute
status: planned
wave: 1
depends_on: []
autonomous: true
files_modified:
  - web/app/protected-programplan-workspace.tsx
  - web/app/protected-programplan-flow.tsx
  - web/app/protected-programplan.css
  - web/e2e/programplan-copy.spec.ts
  - web/e2e/phase5-programplan.spec.ts
must_haves:
  truths:
    - Tabellen och begriplig sparstatus syns före stora kontrollpaneler
    - Kopiera till nästa kull, nivå-/ämnestillägg och klassförberedelse finns kvar
    - Huvudmannen godkänner fortsatt och rektor kan skapa inom egen skola
  artifacts:
    - web/app/protected-programplan-workspace.tsx
    - web/app/protected-programplan-flow.tsx
  key_links:
    - Aktuellt skolmandat och exakt planversion följer genom hela arbetsflödet.
    - Samma kontrakt prövas i modell, skyddad server och faktisk lokal kandidat.
---
<objective>
Gör programplanens ämnen, poäng och nästa steg till huvudytan utan att ändra skolmandat, sparning eller beslut.
</objective>
<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-PLAN.md
@web/app/protected-programplan-workspace.tsx
@web/app/protected-programplan-flow.tsx
@web/app/protected-programplan.css
@web/e2e/programplan-copy.spec.ts
@web/e2e/phase5-programplan.spec.ts
</context>
<tasks>
<task type="auto">
<name>1. Samla sekundära åtgärder och ge tabellen plats</name>
<files>web/app/protected-programplan-workspace.tsx, web/app/protected-programplan-flow.tsx, web/app/protected-programplan.css</files>
<action>Samla kopiering, namn, skolor, arkiv, omläsning och historik under tydliga sekundära öppningar/Fler alternativ. Använd Gå till timplan och Kontrollera planen som verksamhetsord. Flytta detaljer om revision/katalog till information som går att öppna. Sparstatus och väsentliga blockerare får aldrig döljas, och huvudåtgärder ska följa serverns verkliga rättigheter. Behåll dialogfokus, 44px touchmål och alla nivå-/valblocksflöden.</action>
<verify>Typkontroll och riktad UI-granskning; tabell och nästa steg går att hitta på dator/telefon.</verify>
<done>Primärytan fokuserar på programplanen; inga funktioner eller skydd tappas.</done>
</task>
<task type="auto">
<name>2. Pröva bevarat programplansflöde</name>
<files>web/e2e/programplan-copy.spec.ts, web/e2e/phase5-programplan.spec.ts</files>
<action>Uppdatera berörda browserselectors efter slutliga användarord. Testa konkret skapa/ändra, ämnes-/nivåtillägg, spara/reload, kopiera nästa kull, klassförberedelse och programplan→timplan. Behåll negativa skolmandat och blockerade osäkra sparsvar; skriv inte rena textmatchningstest utan verksamhetsbeteende.</action>
<verify>Riktade befintliga browserprov på desktop och phone, bilder granskas.</verify>
<done>FLOW-01:s programdel och bevarade programflöden har färskt avgränsat bevis.</done>
</task>
</tasks>
<verification>Programagent äger filerna exklusivt. Ingen APL-/beslutsregel ändras i denna plan.</verification>
<success_criteria>Tabellen och begriplig sparstatus syns före stora kontrollpaneler; Kopiera till nästa kull, nivå-/ämnestillägg och klassförberedelse finns kvar; Huvudmannen godkänner fortsatt och rektor kan skapa inom egen skola. Bevis och kvarstående begränsningar redovisas, inte antas.</success_criteria>
<output>Skapa 05-PLANNING-FLOW-UX-01-SUMMARY.md med ändringar, verifiering och avvikelser. Avgränsad commit/push görs av ansvarig implementerare efter kontroller; root samordnar delad arbetskopia.</output>
