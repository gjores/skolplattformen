---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "VOCATIONAL-03"
type: execute
status: planned
wave: 1
depends_on: []
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
files_modified:
  - web/app/plan-decision-panel.tsx
  - web/app/plan-decision-context.tsx
  - web/app/plan-decision.css
  - web/e2e/usability.spec.ts
  - web/e2e/fixtures/usability-preview.tsx
must_haves:
  truths:
    - "Huvudmannen kan skicka tillbaka en inskickad plan med tydlig motivering."
    - "Rektor och skoladministratör ser rättningsuppgiften och återkopplingen direkt."
    - "Fastställda planer erbjuder ingen återsändningsåtgärd."
  artifacts:
    - path: web/app/plan-decision-panel.tsx
      provides: "Tydligt vem som ska besluta eller rätta"
    - path: web/app/plan-decision-context.tsx
      provides: "Tydligt vem som ska besluta eller rätta"
  key_links:
    - "Versionsbunden katalog → programprofil → SQL/server → rolluppgift → beständigt beslut"
---

# Tydligt vem som ska besluta eller rätta

<objective>
Tydligt vem som ska besluta eller rätta.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-VOCATIONAL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-VERIFICATION.md
</context>

<tasks>
<task type="auto">
<name>Gör återkoppling och rolluppgifter omedelbart begripliga</name>
<files>web/app/plan-decision-panel.tsx, web/app/plan-decision-context.tsx, web/app/plan-decision.css</files>
<action>Använd knappen Skicka tillbaka för rättning. Kräv ett tydligt fält för vad som måste ändras, presentera senaste relevanta återsändningskommentar direkt vid returned, med avsändare och tid samt bibehållen full historik. Visa vem som ska rätta respektive besluta för programplan och timplan. Behåll global Att göra, exakt versionsöppning och aktuellt mandat. Efter return/resubmit ska både detalj och inkorg hämtas färskt. Osäkert skrivsvar återanvänder samma commandId; ingen optimistisk ny beslutsversion.</action>
<verify>Pröva huvudman submitted→returned och rektor/admin returned→submitted, inklusive tom kommentar, andra återgången och fastställd version.</verify>
<done>Återsändning skapar synlig rättningsuppgift hos rätt roll; godkända beslut är fortsatt låsta.</done>
</task>

<task type="auto">
<name>Verifiera dator, telefon och roller</name>
<files>web/e2e/usability.spec.ts, web/e2e/fixtures/usability-preview.tsx</files>
<action>Utöka befintliga fokuserade UI-prov med yrkesexempel, alla tre roller och två på varandra följande återsändningar. Kontrollera senaste kommentar, väntande beslutsantal, ny uppgift efter rollbyte, inga gamla uppgifter efter återhämtning, knappstorlek och att lång svensk återkoppling ryms på telefon. Isolerade browserprov ska uttryckligen redovisas som syntetiska API-svar.</action>
<verify>Playwright för dator och telefon; ingen överbredd, inga pageerrors eller oväntade anrop.</verify>
<done>Samma tydliga beslutskedja fungerar för båda planerna och alla berörda roller.</done>
</task>

</tasks>

<verification>
Kontrollera beteendet och bevarandet enligt respektive uppgift; historiska godkända prov ersätter inte färska kontroller.
</verification>

<success_criteria>
Huvudmannen kan skicka tillbaka en inskickad plan med tydlig motivering.
Rektor och skoladministratör ser rättningsuppgiften och återkopplingen direkt.
Fastställda planer erbjuder ingen återsändningsåtgärd.
</success_criteria>

<output>
Skriv 05-VOCATIONAL-03-SUMMARY.md med faktisk kod, verifieringsbevis och kvarstående gränser.
</output>
