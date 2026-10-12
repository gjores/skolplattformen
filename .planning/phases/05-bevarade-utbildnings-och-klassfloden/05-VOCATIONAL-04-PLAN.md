---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "VOCATIONAL-04"
type: execute
status: completed
wave: 3
depends_on: ["VOCATIONAL-01", "VOCATIONAL-02", "VOCATIONAL-03"]
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
files_modified:
  - work/pilot/verify-vocational-plan-decision-api.mjs
  - docs/handbok/programplaner.md
  - docs/handbok/timplaner.md
  - docs/handbok/regler.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-VOCATIONAL-VERIFICATION.md
  - .planning/STATE.md
  - .planning/REQUIREMENTS.md
must_haves:
  truths:
    - "Yrkesprogrammens hela kedja fungerar genom faktisk skyddad Worker."
    - "Lokala appen och handboken beskriver samma verifierade beteende."
    - "Kvarstående gränser är synliga utan att äldre krav märks färdiga i förtid."
  artifacts:
    - path: work/pilot/verify-vocational-plan-decision-api.mjs
      provides: "Faktisk Worker, handbok och lokal leverans"
    - path: docs/handbok/programplaner.md
      provides: "Faktisk Worker, handbok och lokal leverans"
  key_links:
    - "Versionsbunden katalog → programprofil → SQL/server → rolluppgift → beständigt beslut"
---

# Faktisk Worker, handbok och lokal leverans

<objective>
Faktisk Worker, handbok och lokal leverans.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-VOCATIONAL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-VERIFICATION.md
</context>

<tasks>
<task type="auto">
<name>Kör verklig HTTP-kedja och negativa säkerhetsfall</name>
<files>work/pilot/verify-vocational-plan-decision-api.mjs</files>
<action>Utöka befintligt faktiskt Worker-prov med en komplett yrkesplan av varje verifierad poängram och yrkesspecifika kontroller. Gör program submit→return med kommentar→rätta→submit→approve, skapa/fyll timplan→submit→return→rätta→submit→approve. Läs rollernas inkorg efter varje övergång; kontrollera låsta slutversioner, tom kommentar, fel roll/skola, MFA/CSRF, revisionkonflikt, replay av gamla kvitton efter ändrade kontroll-ID:n och auditrollback. Bevara original15 + beslut4, egen cleanup och auditankare. Fingerprint ska inkludera ny profil/migration och slutliga källfiler.</action>
<verify>Faktisk lokal workerd/skolplattform_worker och databas krävs; rent mockprov räknas inte. Slutlig byggd Worker kör samma gränser efter installation.</verify>
<done>Båda yrkesramarna har verkliga genomgående bevis; originaldata/ACL bevarade.</done>
</task>

<task type="auto">
<name>Dokumentera och leverera samma prövade produkt</name>
<files>docs/handbok/programplaner.md, docs/handbok/timplaner.md, docs/handbok/regler.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-VOCATIONAL-VERIFICATION.md, .planning/STATE.md, .planning/REQUIREMENTS.md</files>
<action>Beskriv stödda yrkesprogram, programmets ram, undervisningstid/manuella kontroller, inskickad återsändning och rättningsansvar. Kör relevanta Node-prov, tsc, oxlint, separat protected bygge och docs:build i lämplig turordning. Leverera bytekontrollerat bygge till 3012 med bevarat tidigare bygge, läsande lokal OIDC för HM/R/admin på dator/telefon. Scopade commits/push utan orelaterad smuts. Redovisa faktiskt verifierad nivå och kvarvarande individuell studieplan/APL-organisation/GR/IM/klasskoppling separat.</action>
<verify>Alla relevanta kontroller har känd exit0; installerad build och fjärrgren verifieras mot avsedd commit.</verify>
<done>Användaren kan öppna lokala appen och genomföra yrkesflödet. Ingen verklig kommunanslutning eller fullfasacceptans påstås.</done>
</task>

</tasks>

<verification>
Kontrollera beteendet och bevarandet enligt respektive uppgift; historiska godkända prov ersätter inte färska kontroller.
</verification>

<success_criteria>
Yrkesprogrammens hela kedja fungerar genom faktisk skyddad Worker.
Lokala appen och handboken beskriver samma verifierade beteende.
Kvarstående gränser är synliga utan att äldre krav märks färdiga i förtid.
</success_criteria>

<output>
Skriv 05-VOCATIONAL-04-SUMMARY.md med faktisk kod, verifieringsbevis och kvarstående gränser.
</output>
