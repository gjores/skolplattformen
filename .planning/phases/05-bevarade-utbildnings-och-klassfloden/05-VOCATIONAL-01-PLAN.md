---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "VOCATIONAL-01"
type: tdd
status: planned
wave: 1
depends_on: []
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
files_modified:
  - web/lib/programplan-profile.ts
  - web/lib/programplan-profile.test.mjs
  - web/lib/programplan-table.ts
  - web/lib/programplan-table.test.mjs
  - web/lib/programplan-analysis.ts
  - web/lib/server/gym-timplan.ts
  - web/lib/server/plan-decision.ts
  - web/lib/server/plan-decision.test.mjs
  - .planning/research/VOCATIONAL-RULES-2026-10-12.md
must_haves:
  truths:
    - "Yrkesprogrammets korrekta poängram visas och hindrar ofullständiga planer."
    - "En komplett yrkesprogramplan kan ligga till grund för skolans timplan."
    - "Fel programtyp eller elevkull kan inte fastställas genom en generell fallback."
  artifacts:
    - path: web/lib/programplan-profile.ts
      provides: "Verifierad yrkesprofil från programplan till beslut"
    - path: web/lib/programplan-profile.test.mjs
      provides: "Verifierad yrkesprofil från programplan till beslut"
  key_links:
    - "Versionsbunden katalog → programprofil → SQL/server → rolluppgift → beständigt beslut"
---

# Verifierad yrkesprofil från programplan till beslut

<objective>
Verifierad yrkesprofil från programplan till beslut.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-VOCATIONAL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-VERIFICATION.md
</context>

<tasks>
<task type="auto">
<name>Verifiera profiler och prova gränser före implementation</name>
<files>web/lib/programplan-profile.ts, web/lib/programplan-profile.test.mjs, .planning/research/VOCATIONAL-RULES-2026-10-12.md</files>
<action>Verifiera aktuella primärkällor för varje nationell Gy25-yrkesprogramkod, totalpoäng, garanterad undervisningstid, APL och behörighetsnivåer. Dokumentera datum och länkar. Skriv explicita profiler och tester för samtliga koder samt falsk kategori, okänd kod, äldre/ogiltig start. Återanvänd inte legacyvärden som källa. Bevara HE-profilen.</action>
<verify>Profiltester körs mot verkliga katalogposter, inklusive båda poängramarna och negativa fall.</verify>
<done>Varje stödd kod har spårbar källa; okänd kombination är stängd.</done>
</task>

<task type="auto">
<name>Anslut profil till ram, källövergång och serverbeslut</name>
<files>web/lib/programplan-table.ts, web/lib/programplan-table.test.mjs, web/lib/programplan-analysis.ts, web/lib/server/gym-timplan.ts, web/lib/server/plan-decision.ts, web/lib/server/plan-decision.test.mjs</files>
<action>Låt samma verifierade profil styra programram och oberoende servervalidering av total/minimitid. Behåll fryst kataloghash, kanoniska rader, alla aktiva terminsfält, alternativa val och giltighetsdatum. Yrkesprofilens nödvändiga manuella kontroller ska speglas i SQL och strikt serverkontrakt. Inga elevspecifika bortval härleds från programramen.</action>
<verify>Kör berörda programram-, analys-, gymserver- och beslutserverprov. Pröva exakt minimigräns, en timme/poäng för lite, ofullständiga terminer och gamla HE-regressioner.</verify>
<done>Skapande och beslut bygger på samma profil och avvisar samma ofullständiga underlag.</done>
</task>

</tasks>

<verification>
Kontrollera beteendet och bevarandet enligt respektive uppgift; historiska godkända prov ersätter inte färska kontroller.
</verification>

<success_criteria>
Yrkesprogrammets korrekta poängram visas och hindrar ofullständiga planer.
En komplett yrkesprogramplan kan ligga till grund för skolans timplan.
Fel programtyp eller elevkull kan inte fastställas genom en generell fallback.
</success_criteria>

<output>
Skriv 05-VOCATIONAL-01-SUMMARY.md med faktisk kod, verifieringsbevis och kvarstående gränser.
</output>
