---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-11
type: execute
wave: 9
depends_on: ["NAMED-TIMPLANS-UX-10"]
files_modified: ["work/pilot/verify-named-timplans.mjs", "work/pilot/apply-named-timplans.mjs", "work/pilot/verify-named-timplans-api.mjs", "work/pilot/named-timplan-oidc-fixtures.mjs", "web/playwright.named-timplans-actual.config.ts", "web/e2e/named-timplans-actual.spec.ts", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-VERIFICATION.md"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["Två namngivna samtidiga fastställda planer från samma programplan fungerar i verklig lokal Worker.", "A får mer matematik utan att B eller programplanens poäng ändras.", "Dator/telefon samt avbrott/konflikt återhämtas utan skada på användarens befintliga data."]
  artifacts: ["work/pilot/verify-named-timplans.mjs", "work/pilot/apply-named-timplans.mjs", "work/pilot/verify-named-timplans-api.mjs", "work/pilot/named-timplan-oidc-fixtures.mjs", "web/playwright.named-timplans-actual.config.ts", "web/e2e/named-timplans-actual.spec.ts", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-VERIFICATION.md"]
  key_links: ["Full migrations-/databevaring och verklig samtidighet", "Faktisk HTTP och browser från samma kandidatartefakt"]
---

<objective>
Verifiera hela kedjan mot installerad isolerad SQL, riktig Worker/OIDC och dator/telefon.

Resultatet ingår i det avgränsade gapet, inte i ett automatiskt godkännande av hela fas 5.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md
</context>

<tasks>

<task type="auto">
<name>1. Full migrations-/databevaring och verklig samtidighet</name>
<files>work/pilot/verify-named-timplans.mjs, work/pilot/apply-named-timplans.mjs, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-VERIFICATION.md</files>
<action>Återanvänd lästa verify-target, actualclasscohort-fixturer och data/DDL/ACLfingeravtryck; egen exklusiv körjournal. Tunga DDL/rollback/concurrencyprov körs i en privat separat tillfällig schemakopia med granskade syntetiska fixturer, aldrig mot den aktiva användardatabasen där sessions-/auditwrites kan blockeras eller deadlocka. Endast schema-only-export med verifierad målidentitet tillåts. Ingen liveverksamhetsrad, auth-/identitetsrad eller hemlighet exporteras. Kopian fylls enbart med granskade syntetiska fixturer, hålls privat och får eget explicit tillåtet testmål. Avsluta endast egna testprocesser/databas efter bevisad cleanup; ingen liveDB/IdPomstart. Kandidatens skrivande API/browserfixturer använder samma isolerade testmål. Aktiva målets slutliga korta schemaapply i12 sker först efter syntetiska schemakopiebevis och full bevarandekontroll. Kör först alla paketmigrationer samlat i rollback och bevisa gamla verksamhetsprojektioner, beslut, klasslänkar, medlemskap, gamla auditankare och rättigheter bevarade. Granska exaktadditiv apply och installera endast i det separata privata testmålet; ingen DB/IdPrestart/reset. Dokumentera schema-backfill som enda godkända originalutökning, inga gamla tidsstämplar ändras. Efter apply kör installeradmatris och minst tvåriktiga anslutningar med bevisat överlapp: samma-serie nextversion, olika-serier version/approve, rename/approve, samma namn/newseries, samma commandId, källbyte/create och classlink/update. Förloraren ska ge konflikt/replay utan delskrivning; inga falska samtidigtprov med enanslutning.</action>
<verify>Runnerresultat med exitkod, källhashar, DDL/ACL/journalföre-efter, exakta gamla kolumnprojektioner och full egen cleanup. Alla namngivna matrisfall ska vara PASS eller konkret olöst, första fel bevaras. Självständig kontroll av schema/ACL/bevarande innan HTTP.</verify>
<done>Installerat schema stöder oberoende serier och bevarar testdatabasens syntetiska förhandsrader; originalbevarande återstår att kontrollera vid faktisk apply i12; verkliga konkurrensfall är observerade.</done>
</task>

<task type="auto">
<name>2. Faktisk HTTP och browser från samma kandidatartefakt</name>
<files>work/pilot/verify-named-timplans-api.mjs, work/pilot/named-timplan-oidc-fixtures.mjs, web/playwright.named-timplans-actual.config.ts, web/e2e/named-timplans-actual.spec.ts, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-VERIFICATION.md</files>
<action>Bygg separat skyddad kandidat, bind sourcehash/buildmanifest till samtliga verifierade filer, kör riktig Worker och lokal OIDC/MFA mot egen isoleradfixtur. Huvudfall: två tommaklasser, samma programplan/skola, Grundfördelning och Utökad matematik båda v1 fastställda; A får fler matematik utan B-/poängändring; båda klasser kan sedan bindas tillsammaplan. A2/rename ändrar ej B1 eller annanårslink; sourcebyte visas separat; flerval avbrott efterförsta, exakt replay och reload utan dubbeltresultat. Prova roller/maskning/revocation/MFA/auditfail via faktiskHTTP. Chromiumdesktop + WebKittelefon, retries0; granska verkliga skärmbilder av planval, granskning, sparatresultat, partialrecovery ochårsvarianter. Samma hashade artefakt måste användas hela slutprovet. Fixturecleanup tar endast egna rader, användarklasser ingår inte i testdatabasen. Kör relevanta Node-/server-/UIregressioner, tsc, oxlint, skyddat appbygge och dokumentera omfattning utan att ärvda resultat blir nya prov.</action>
<verify>Faktiska API/SQL/browserbevis med source/buildhashar, råutdata privat, dator/telefonseparat, exactcleanup och originalfingeravtryck. Ingen simuleradroute får etikett actual. Kvarvarande historiska integritets-/prestandaproblem redovisas utan att fylla dem med antaganden.</verify>
<done>Namngivna planer och begripligt klassflöde fungerar på samma verkliga kandidat, med verifierat mandat och bevarande.</done>
</task>

</tasks>

<verification>
Runnerresultat med exitkod, källhashar, DDL/ACL/journalföre-efter, exakta gamla kolumnprojektioner och full egen cleanup. Alla namngivna matrisfall ska vara PASS eller konkret olöst, första fel bevaras. Självständig kontroll av schema/ACL/bevarande innan HTTP. Faktiska API/SQL/browserbevis med source/buildhashar, råutdata privat, dator/telefonseparat, exactcleanup och originalfingeravtryck. Ingen simuleradroute får etikett actual. Kvarvarande historiska integritets-/prestandaproblem redovisas utan att fylla dem med antaganden.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- Två namngivna samtidiga fastställda planer från samma programplan fungerar i verklig lokal Worker.
- A får mer matematik utan att B eller programplanens poäng ändras.
- Dator/telefon samt avbrott/konflikt återhämtas utan skada på användarens befintliga data.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-11-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>

Bevisgräns: Automatisk approval review avvisade full-data-snapshot. Denna plan exporterar därför inga liverader. Syntetisk migrationsframgång får aldrig beskrivas som att användarens originaldata migrerats eller bevarats; sådan kontroll görs separat i12.

Genomförandeprecisering: Verklig callback använder även GoTrue för identitetsregistrering.11 startar därför en egen lokal GoTrue-container med samma installerade bild, bunden endast till helperns privata schemakopiedatabas. Authmigrationsversioner härleds ur bildens offentliga SQL-filnamn, inte liverader. En smal lokal proxy på56331 vidarebefordrar endast verkligt id_token-anrop till denna tjänst; ingen authmock. Serverns lokala målskydd får denna enda extra kombination:127.0.0.1:56322/named_timplan_<32hex> tillsammans med127.0.0.1:56331. Vanliga postgresdatabasen kan inte använda extra authporten. Negativa gränsprov tillkommer. Egna tillfälliga Keycloak-användare och exakt egen redirect journalförs och tas bort efter provet; befintliga användare/hemlighetsfiler används inte för testinloggning. Ingen DB/IdP-omstart.
