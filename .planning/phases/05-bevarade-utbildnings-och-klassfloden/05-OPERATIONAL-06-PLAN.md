---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "OPERATIONAL-06"
type: execute
status: planned
wave: 4
depends_on: ["OPERATIONAL-01", "OPERATIONAL-02", "OPERATIONAL-03", "OPERATIONAL-04", "OPERATIONAL-05"]
requirements: [ADMIN-02, ADMIN-03, ADMIN-04, PLANERING-01, PLANERING-03, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - docs/handbok/timplaner.md
  - docs/handbok/programplaner.md
  - docs/handbok/planering.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-VERIFICATION.md
  - .planning/STATE.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
must_haves:
  truths:
    - "Kedjan och negativa gränser har spårbara lokala syntetiska bevis."
    - "Användaren får uppdaterad app, ärlig teststatus och konkret nästa steg för eventuell osäker datarensning."
  artifacts:
    - path: docs/handbok/timplaner.md
      provides: "Samlad verifiering, handbok och lokal leverans"
    - path: docs/handbok/programplaner.md
      provides: "Samlad verifiering, handbok och lokal leverans"
  key_links:
    - "Aktuellt mandat → validerat kontrakt → faktisk skyddad dataväg → synligt beständigt resultat"
---

# Samlad verifiering, handbok och lokal leverans

<objective>
Samlad verifiering, handbok och lokal leverans.
</objective>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-CONTEXT.md
</context>

<tasks>
<task type="auto">
<name>Verifiera hela kedjan och dokumentera användarbeteende</name>
<files>docs/handbok/timplaner.md, docs/handbok/programplaner.md, docs/handbok/planering.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-VERIFICATION.md, .planning/STATE.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md</files>
<action>Kör relevanta Node-/SQL-/API-prov, tsc, oxlint, separat protected bygge och docs:build. Verifiera HE samt yrkesramar, program→timplan→beslut→klass/år, ny version utan flytt, återkoppling och hela sök/pagingvägen. Faktiska browserprov på dator/telefon och minst tre roller. Bevara befintliga verksamhetstabeller/tidsstämplar, audit, ACL och gamla beslut; dokumentera SQL apply exakt och serialisera fixturejobb. Uppdatera endast granskad handbok om verifierade nya handlingar.</action>
<verify>Kända processavslut och färska bevis; första fel och begränsningar redovisas, ingen mock räknas som faktiskt API.</verify>
<done>Kedjan och negativa gränser har spårbara lokala syntetiska bevis.</done>
</task>

<task type="auto">
<name>Leverera prövad lokal app och redovisa städningsläget</name>
<files>docs/handbok/timplaner.md, docs/handbok/programplaner.md, docs/handbok/planering.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-VERIFICATION.md, .planning/STATE.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md</files>
<action>Gör selektiva commits och push aktuell gren enligt stående mandat; verifiera remote. Installera samma byteverifierade bygge på 3012 med tidigare bygge bevarat och läsande OIDC-prov. Uppdatera SUMMARY/VERIFICATION/STATE/kravspårning med faktisk implementation och kvarstående gap. Rapportera inventeringens konkreta städningsval när definitionen fortfarande kräver användaren; färdigställ oberoende produktarbete först. Markera inte hela fas 5 eller verklig kommunintegration godkänd.</action>
<verify>Installerad revision/källfiler och remote stämmer; faktisk lokal navigation/pass och databevarande.</verify>
<done>Användaren får uppdaterad app, ärlig teststatus och konkret nästa steg för eventuell osäker datarensning.</done>
</task>

</tasks>

<verification>
Nya riktade beteendeprov och bevarandekontroller enligt uppgifterna. Historiska resultat är endast bakgrund.
</verification>

<success_criteria>
Kedjan och negativa gränser har spårbara lokala syntetiska bevis.
Användaren får uppdaterad app, ärlig teststatus och konkret nästa steg för eventuell osäker datarensning.
</success_criteria>

<output>
Skriv 05-OPERATIONAL-06-SUMMARY.md med faktiska ändringar, verifieringsbevis och kvarstående gränser.
</output>
