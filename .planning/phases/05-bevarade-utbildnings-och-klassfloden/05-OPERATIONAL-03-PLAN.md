---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "OPERATIONAL-03"
type: execute
status: completed
wave: 1
depends_on: []
requirements: [ADMIN-02, PLANERING-03, PLANERING-05]
autonomous: true
files_modified:
  - web/lib/plan-decision.ts
  - web/lib/plan-decision.test.mjs
  - web/lib/server/plan-decision.ts
  - web/lib/server/plan-decision.test.mjs
  - web/app/api/planbeslut/lista/route.ts
  - web/app/plan-decision-context.tsx
  - web/app/plan-decision.css
  - web/lib/planning-year-contract.ts
  - web/lib/planning-year-contract.test.mjs
  - web/app/protected-plan-list.tsx
  - web/lib/protected-plan-location.ts
  - web/lib/protected-plan-location.test.mjs
  - web/e2e/usability.spec.ts
  - supabase/migrations/20261012220000_plan_decision_search.sql
  - work/pilot/verify-operational-decisions.mjs
  - work/pilot/apply-operational-decisions.mjs
  - work/pilot/verify-operational-decisions-http.mjs
must_haves:
  truths:
    - "Alla tillåtna uppgifter nås; egna/väntande och globala räknare är korrekta för varje roll."
    - "Användaren ser direkt vilka planer väntar på vem och hittar samtliga uppgifter."
  artifacts:
    - path: web/lib/plan-decision.ts
      provides: "Sökbara beslut och tydliga beslutsskeden"
    - path: web/lib/plan-decision.test.mjs
      provides: "Sökbara beslut och tydliga beslutsskeden"
  key_links:
    - "Aktuellt mandat → validerat kontrakt → faktisk skyddad dataväg → synligt beständigt resultat"
---

# Sökbara beslut och tydliga beslutsskeden

<objective>
Sökbara beslut och tydliga beslutsskeden.
</objective>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-CONTEXT.md
</context>

<tasks>
<task type="auto">
<name>Ge inkorgen fullständig sökning och sidindelning</name>
<files>web/lib/plan-decision.ts, web/lib/plan-decision.test.mjs, web/lib/server/plan-decision.ts, web/lib/server/plan-decision.test.mjs, web/app/api/planbeslut/lista/route.ts, web/app/plan-decision-context.tsx, web/app/plan-decision.css, web/lib/planning-year-contract.ts, web/lib/planning-year-contract.test.mjs, web/app/protected-plan-list.tsx, web/lib/protected-plan-location.ts, web/lib/protected-plan-location.test.mjs, web/e2e/usability.spec.ts, supabase/migrations/20261012220000_plan_decision_search.sql, work/pilot/verify-operational-decisions.mjs, work/pilot/apply-operational-decisions.mjs, work/pilot/verify-operational-decisions-http.mjs</files>
<action>Behåll befintlig GET-kompatibilitet där rimligt och globala actionCount/decisionCount för uppdraget. Lägg validerad sökning, beslutsskede, plantyp, egen/väntande uppgift och stabil serverordning med egna uppgifter först före sidindelning. Beräkna filtrerat totalantal separat från globala räknare. Inget bortom första 500 får bli onåbart. Undvik full katalog-/beslutsprojektion per rad när samma korrekthet kan uppnås med avgränsat gemensamt underlag; mandat och blockerarregler måste ge samma resultat som detaljvyn. Mät verklig HTTP/SQL före och efter på identiska syntetiska data.</action>
<verify>Kontraktsprov, SQL/TS-paritet och faktisk API med fler än 500 rader, sida 2, stabil ordning, noll träffar, fel skola/kund/roll och förändrat urval.</verify>
<done>Alla tillåtna uppgifter nås; egna/väntande och globala räknare är korrekta för varje roll.</done>
</task>

<task type="auto">
<name>Visa beslutsskede i listor och inkorg utan onödiga avbrott</name>
<files>web/lib/plan-decision.ts, web/lib/plan-decision.test.mjs, web/lib/server/plan-decision.ts, web/lib/server/plan-decision.test.mjs, web/app/api/planbeslut/lista/route.ts, web/app/plan-decision-context.tsx, web/app/plan-decision.css, web/lib/planning-year-contract.ts, web/lib/planning-year-contract.test.mjs, web/app/protected-plan-list.tsx, web/lib/protected-plan-location.ts, web/lib/protected-plan-location.test.mjs, web/e2e/usability.spec.ts, supabase/migrations/20261012220000_plan_decision_search.sql, work/pilot/verify-operational-decisions.mjs, work/pilot/apply-operational-decisions.mjs, work/pilot/verify-operational-decisions-http.mjs</files>
<action>Lägg sökfält, tydliga skedefilter Inväntar beslut/Tillbaka för rättning och sidkontroller i inkorgen. Ge Programplaner samma serverstyrda beslutsskedefilter; blanda inte planstatus utkast med inskickandeskede. Låt URL/kontext behålla urval utan att ändra elevregistrets läsår; återställ page när filter ändras. Bakgrundsuppdatering ska inte riva användarens fokus eller söktext. Globala indikatorn får aldrig visa filtrerat antal som hela uppdragets antal.</action>
<verify>Dator/telefon för HM/rektor/admin med sökning, eget först, nästa sida, rollbyte och return → rättning → nytt inskickande. Relevanta befintliga beslutstester måste fortsatt passera.</verify>
<done>Användaren ser direkt vilka planer väntar på vem och hittar samtliga uppgifter.</done>
</task>

</tasks>

<verification>
Nya riktade beteendeprov och bevarandekontroller enligt uppgifterna. Historiska resultat är endast bakgrund.
</verification>

<success_criteria>
Alla tillåtna uppgifter nås; egna/väntande och globala räknare är korrekta för varje roll.
Användaren ser direkt vilka planer väntar på vem och hittar samtliga uppgifter.
</success_criteria>

<output>
Skriv 05-OPERATIONAL-03-SUMMARY.md med faktiska ändringar, verifieringsbevis och kvarstående gränser.
</output>
