---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-07
type: execute
wave: 5
depends_on: ["APL-04", "APL-04A"]
files_modified: ["work/pilot/verify-apl-plan.mjs", "work/pilot/apl-plan-fixtures.mjs", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-VERIFICATION.md"]
autonomous: true
status: complete
gap: APL-01
must_haves:
  truths: ["Installerade SQL-funktioner ger samma APL-resultat som domänmodellen.", "Samtidiga ändringar kan inte skapa dubbla eller motsägelsefulla underlag.", "Migrationen bevarar syntetiska förhandsplaner, timmar, klasslänkar och historiska beslut."]
  artifacts: ["work/pilot/verify-apl-plan.mjs", "work/pilot/apl-plan-fixtures.mjs", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-VERIFICATION.md"]
  key_links: ["Exakta migrationsbytes → isolerat schema → verifierad funktions-/ACLdifferens", "Två verkliga transaktioner → bevisat låsöverlapp → konflikt/replay", "Installerad SQL-resultat → TypeScriptkontrakt och regelparitet"]
---

<objective>
Pröva hela migrations- och kommandokedjan i separat privat testdatabas med syntetiska fixturer. Denna plan verifierar inte användarens verkliga data och utför ingen aktiv installation.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md
@work/pilot/verify-named-timplans.mjs
@work/pilot/named-timplan-snapshot.mjs
@work/pilot/verify-target.mjs
@web/lib/apl-plan.ts
</context>

<tasks>

<task type="auto">
<name>1. Verifiera rollback, installation och full kontraktsparitet</name>
<files>work/pilot/verify-apl-plan.mjs; work/pilot/apl-plan-fixtures.mjs; .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-VERIFICATION.md</files>
<action>Återanvänd granskade schema-only-/målskyddshjälpare med egen namngiven journal och tillåtet isolerat mål. Exportera inga verksamhets-, auth- eller identitetsrader från aktiva databasen. Syntetiska förhandsfixturer omfattar legacy draft/submitted/approved/replaced, gamla kvitton, två namngivna planer, två klasser, olika läsår och skilda kunder. Kör paketet samlat först med rollback och sedan installerat. Jämför gamla kolumnprojektioner inklusive tidsstämplar, timceller, klass-/medlemsrelationer, beslut/kvitton, ACL och auditankare. Prova alla APL1-kontraktsfall mot både SQL och TS, inklusive felaktig projektion som måste orsaka rollback. Gamla approved receipts ska vara byteidentiska efter replay. Full egen cleanup journalförs och kontrolleras.</action>
<verify>Runner med explicit mål och exitkod; inga okända/skippade matrisfall får döljas bakom totalsiffraPASS. Dokumentera migrationshashar, källhashar, före/efterfingeravtryck och exakta tillåtna DDL/grant-differenser. Kontrollera att inga råa identiteter/hemligheter hamnar i Git.</verify>
<done>Rollback och installerat syntetiskt bevaring passerar; det är uttryckligen inte bevis på faktisk migration av användarens originaldata.</done>
</task>

<task type="auto">
<name>2. Pröva verklig samtidighet, mandat och beslutskompatibilitet</name>
<files>work/pilot/verify-apl-plan.mjs; work/pilot/apl-plan-fixtures.mjs; .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-VERIFICATION.md</files>
<action>Kör minst två separata databasanslutningar med bevisat överlapp för save/save, save/radtimmar, rektorsbekräftelse/save, submit/save, approve/save, samma commandId och ny version/källändring. Prova mandatändring under kö och efter lyckat kommando inför status/replay. Matrisen omfattar rektor/admin/HM/lärare, fel skola/kund, utgångna uppdrag, arkiverat och fryst/ersatt. Fail-closed vid auditfel, för stora requests, främmande period-ID:n och rader utan aktiv term. Bevara annanserie/läsår och historiska beslut. Inga tester mot användarens klassrader och ingen DB/IdP-omstart; städa endast egna fixturer och processer.</action>
<verify>Bevisa vilken transaktion vann, observerat väntelås/överlapp, förlorarens konflikt eller identiska replay och frånvaro av delskrivning. Samma request-ID med olika innehåll måste nekas. Samtliga roller provas i databasens verkliga skyddsväg, inte genom klientrollbyte.</verify>
<done>Integritets- och mandatkraven är styrkta med verklig installerad SQL och samtidiga sessioner.</done>
</task>

</tasks>

<verification>
APL1-01–06/08 har faktisk SQL-verifiering med SS 12000-relevanta relationer bevarade. Historiska fel och återhämtningar sparas separat från sista resultatet.
Inventera aktuella definitioner vid start; äldre kodkartor och tidigare PASS är bakgrund. Läs kontraktets SS 12000-avstämning och bevara stabila skol-/klass-ID:n, giltighet och källansvar; inget externt standardutbyte verifieras av denna plan.
</verification>

<success_criteria>
- Installerade SQL-funktioner ger samma APL-resultat som domänmodellen.
- Samtidiga ändringar kan inte skapa dubbla eller motsägelsefulla underlag.
- Migrationen bevarar syntetiska förhandsplaner, timmar, klasslänkar och historiska beslut.
- Uppgifternas verifiering är redovisad på faktisk provnivå; avvikelser och första fel döljs inte.
</success_criteria>

<output>
Skriv 05-APL-07-SUMMARY.md i samma katalog med ändrade filer, utförda kontroller, bevarande, avvikelser och nästa beroende. Samordnaren hanterar avgränsad commit/push och paketstatus.
</output>
