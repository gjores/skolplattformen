---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "OPERATIONAL-04"
type: execute
status: planned
wave: 3
depends_on: ["OPERATIONAL-02"]
requirements: [ADMIN-02, ADMIN-03, ADMIN-04, PLANERING-04]
autonomous: true
files_modified:
  - web/app/protected-gym-timplan-workspace.tsx
  - web/app/protected-programplan-workspace.tsx
  - web/lib/server/gym-timplan.ts
  - web/lib/server/gym-timplan.test.mjs
  - web/lib/gym-timplan.ts
  - web/lib/gym-timplan.test.mjs
must_haves:
  truths:
    - "Nyversion nås direkt och innebörden för befintliga klasser är tydlig."
    - "Varningar motsvarar verkliga ändringar och prestandapåståenden stöds av nya mätningar."
  artifacts:
    - path: web/app/protected-gym-timplan-workspace.tsx
      provides: "Tydlig ny version och korrekt källändringsbesked"
    - path: web/app/protected-programplan-workspace.tsx
      provides: "Tydlig ny version och korrekt källändringsbesked"
  key_links:
    - "Aktuellt mandat → validerat kontrakt → faktisk skyddad dataväg → synligt beständigt resultat"
---

# Tydlig ny version och korrekt källändringsbesked

<objective>
Tydlig ny version och korrekt källändringsbesked.
</objective>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-CONTEXT.md
</context>

<tasks>
<task type="auto">
<name>Gör fortsatt arbete efter fastställande tydligt</name>
<files>web/app/protected-gym-timplan-workspace.tsx, web/app/protected-programplan-workspace.tsx, web/lib/server/gym-timplan.ts, web/lib/server/gym-timplan.test.mjs, web/lib/gym-timplan.ts, web/lib/gym-timplan.test.mjs</files>
<action>Visa Skapa ny version med aktuell källa och eventuellt befintligt utkast. Använd befintliga skyddade klonkommandon och säker omförsöksmodell. Berätta vilka klasser som kvarstår på tidigare version enligt plan 01:s underlag. En ny version är utkast och innehåller inga nya beslut eller flyttade klasslänkar; snabbvägen får inte kringgå mandat, datumgränser eller pågående skrivning.</action>
<verify>Modell/server samt browser: fastställd → nytt utkast → ändra → skicka för beslut; tidigare plan/källsnapshot/beslut/klassbindning består.</verify>
<done>Nyversion nås direkt och innebörden för befintliga klasser är tydlig.</done>
</task>

<task type="auto">
<name>Skilj verklig källändring från enbart beslut/revision</name>
<files>web/app/protected-gym-timplan-workspace.tsx, web/app/protected-programplan-workspace.tsx, web/lib/server/gym-timplan.ts, web/lib/server/gym-timplan.test.mjs, web/lib/gym-timplan.ts, web/lib/gym-timplan.test.mjs</files>
<action>Jämför relevant fryst innehåll mot aktuellt källa på ett strikt servervaliderat sätt. Enbart fastställande av oförändrad programram ska inte kräva nytt timplansunderlag; verkliga nivå-/poäng-/termins-/källändringar ska fortsatt varna och hanteras uttryckligt. Ta fram före/eftermätning av programlistan och uppgiftsinkorgen tillsammans med plan 03; ändra endast belagda flaskhalsar och bevara redigeringens fokusfix.</action>
<verify>Positiv oförändrad fastställning, negativ verklig innehållsändring, nytt plan-ID/version, saknad källa samt tidigare frozen-source-regression. Dokumentera faktisk mätmiljö och svarstider.</verify>
<done>Varningar motsvarar verkliga ändringar och prestandapåståenden stöds av nya mätningar.</done>
</task>

</tasks>

<verification>
Nya riktade beteendeprov och bevarandekontroller enligt uppgifterna. Historiska resultat är endast bakgrund.
</verification>

<success_criteria>
Nyversion nås direkt och innebörden för befintliga klasser är tydlig.
Varningar motsvarar verkliga ändringar och prestandapåståenden stöds av nya mätningar.
</success_criteria>

<output>
Skriv 05-OPERATIONAL-04-SUMMARY.md med faktiska ändringar, verifieringsbevis och kvarstående gränser.
</output>
