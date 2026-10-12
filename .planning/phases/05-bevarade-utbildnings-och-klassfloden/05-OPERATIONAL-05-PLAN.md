---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "OPERATIONAL-05"
type: execute
status: completed-local-approved-archive
wave: 1
depends_on: []
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
files_modified:
  - work/pilot/inventory-protected-cleanup.mjs
  - work/pilot/trace-protected-cleanup.mjs
  - work/pilot/archive-approved-fixture-educations.mjs
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-CLEANUP-INVENTORY.md
must_haves:
  truths:
    - "Konkreta kandidatkategorier med antal, beroenden och osäkerheter finns."
    - "Nästa städningshandling är konkret och kan bedömas; ingen data raderas på namnlikhet."
  artifacts:
    - path: work/pilot/inventory-protected-cleanup.mjs
      provides: "Inventera databasen och gör städningen konkret"
    - path: .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-CLEANUP-INVENTORY.md
      provides: "Inventera databasen och gör städningen konkret"
  key_links:
    - "Aktuellt mandat → validerat kontrakt → faktisk skyddad dataväg → synligt beständigt resultat"
---

# Inventera databasen och gör städningen konkret

<objective>
Inventera databasen och gör städningen konkret.
</objective>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-CONTEXT.md
</context>

<tasks>
<task type="auto">
<name>Inventera isolerad databas utan verksamhetsskrivning</name>
<files>work/pilot/inventory-protected-cleanup.mjs, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-CLEANUP-INVENTORY.md</files>
<action>Granska anslutningskod och verifiera lokal avsedd protected-databas. Läs tabeller/relationer för utbildningar, skolkopplingar, program/timplansversioner, källsnapshot, klasser, klasslänkar, beslut och provproveniens i read-only transaktion. Rapportera antal och referensgrafer; skriv inte personuppgifter, hemligheter eller rå personrader till Git. Sök gamla egna fixtur-ID:n/proveniens och ofullständiga grafer men klassificera inte utkast eller saknad koppling automatiskt som skräp.</action>
<verify>Skriptet får inte innehålla INSERT/UPDATE/DELETE/reset mot verksamhetsdata. Jämför läsande sammanställning mot relationer och dokumenterad testproveniens.</verify>
<done>Konkreta kandidatkategorier med antal, beroenden och osäkerheter finns.</done>
</task>

<task type="auto">
<name>Förbered avgränsad städningsuppsättning och bevarande</name>
<files>work/pilot/inventory-protected-cleanup.mjs, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-CLEANUP-INVENTORY.md</files>
<action>För varje säker kandidat ange orsak/ägarskap, exakt påverkan, beroendeordning, privat backup och rollback/postcommit-kontroll. Separera kvarvarande avsiktliga exempel, användararbete, gamla versioner, klasskopplingar och audit. Root kan därefter utföra säkert avgränsad egen provcleanup eller be användaren välja den oklara verksamhetsuppsättningen. Ingen bred radering, ingen återfråga om redan godkänd implementation.</action>
<verify>Granskat konkret manifest och no-op/dry-run; inventeringen har noll förändrade rader; den senare uttryckligt godkända arkiveringen ska ändra exakt sex utbildningsrader och bevara alla övriga rader.</verify>
<done>Nästa städningshandling är konkret och kan bedömas; ingen data raderas på namnlikhet.</done>
</task>

</tasks>

<verification>
Nya riktade beteendeprov och bevarandekontroller enligt uppgifterna. Historiska resultat är endast bakgrund.
</verification>

<success_criteria>
Konkreta kandidatkategorier med antal, beroenden och osäkerheter finns.
Nästa städningshandling är konkret och kan bedömas; ingen data raderas på namnlikhet.
</success_criteria>

<output>
Skriv 05-OPERATIONAL-05-SUMMARY.md med faktiska ändringar, verifieringsbevis och kvarstående gränser.
</output>

## Senare godkänd omfattning och resultat

Användaren valde uttryckligen arkivering av de sex gamla isolerade testutbildningarna. Smalt lokalt administratörsunderhåll med privat backup, full rollback-verifiering och postcommitkontroll har genomförts. Exakt sex utbildningars arkivfält/revision/normal updated_at ändrades; samtliga planer och all historik bevarades. Se SUMMARY och CLEANUP-INVENTORY. Ingen fysisk radering gjordes.
