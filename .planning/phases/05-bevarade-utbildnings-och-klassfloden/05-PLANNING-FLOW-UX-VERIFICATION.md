---
phase: 05-bevarade-utbildnings-och-klassfloden
package: PLANNING-FLOW-UX
status: verified_local_delivery
updated: 2026-10-18
---
# Verifiering av enklare planeringsflöde

Produktkandidat: `3a2edf30775580ff9610d742a1fb965c633f3cef`. Ingen full fas-/pilotacceptans följer av paketet; historiska88/100 planer och3/8 faser består.

## Automatiska kontroller

- Modell/server/journal och URL:146 relevanta Node-prov PASS. Typkontroll och full app/lib-lint PASS. Privat logg `planning-flow-node-final.log`, `planning-flow-tsc-final.log`, `planning-flow-lint-final2.log`.
- Programplan/kopiering:26 dator-/telefonprov PASS, klassregression12 PASS. Nya navigation/APL-process22 och äldre beslut26 PASS. Dessa86 UI-prov använder syntetiska API-svar; de bevisar inte faktisk server/databasanslutning.
- Separat skyddat bygge PASS. Aktiv `web/dist-protected` byggdes inte om.
- Handboksbygge PASS, fyra sidor och appens APL-guide uppdaterade.
- SQL07:32 kontroller PASS i egen schema-only databas, inklusive faktisk konkurrens mellan APL-kommandon, två oberoende revisionskontroller, mandat, auditrollback, oförändrade äldre kvitton och fryst timplansbeslut. Samtliga77 ursprungliga publika tabellers rader bevarades av migrationen. Rollback och cleanup fullständiga.
- Installer-/leveransverktyg:78 nya och äldre prov PASS. Oberoende läsande granskning av UI/navigation och SQL/server gav inga blockerande fynd.

## Faktiskt flöde

Kandidatens riktiga OIDC→Worker→PostgreSQL provas separat på dator och telefon, utan simulerad autentisering eller verksamhetssvar. Egna syntetiska skolor/identiteter, inga kopierade aktiva verksamhetsrader. Slutkörning actual03: **14/14 PASS**, sju kontroller per enhet, retries0. UI godkänner timtabell utan perioder, hämtar ämne/årsbudget till vald termin och sparar utan datum. Fullständigt periodunderlag kompletteras via faktisk API; rektor bekräftar och huvudmannen granskar genom UI. Ändrad APL kräver förnyad granskning utan ändrad tabell/hash. Back bevarar exakt plan, högskoleförberedande saknar APL och annat skolmandat/HM-innehållsskrivning nekas. Åtta exakta skärmbilder granskade; alla testkonton, sessionsspår, tillfälliga callbacks och egen runtime/databas städade med verifierad cleanup.

Första actualkörningen klarade fem datorsteg men testet sökte yrkesprogrammets tabell på högskoleförberedande program. Testet rättades till dess skoltidstabell och väntar uttryckligen på redigerbart fält före frånvarokontroller. Andra körningen klarade hela datorflödet men telefonprovet laddade om före UI:s sparbekräftelse och återfick avsiktligt kvarvarande sparjournal. Slutprovet väntar på synlig sparstatus före omladdning. Första felrapporterna och full cleanup bevaras privat; de räknas inte som passerade slutprov.

## Avgränsningar

- Års-APL anger årskurs, inte termin. HT/VT är skoltimmar. Förläggning kräver ett uttryckligt terminsval.
- Hämta återstående APL-tid använder alla lokala perioders fördelning, tillför endast ofördelad årsbudget till vald aktiv termin och ändrar inga sparade timmar förrän användaren granskar och sparar.
- Fullständigt centralt innehåll finns ännu inte i katalogen. Arbetsmoment beskrivs manuellt med ämnesplan som stöd. Veckor och datum härleds inte som juridiskt verifierad APL från budgeten.
- Arbetsplatser, handledare, elevplacering, närvaro och genomförande är fortsatt senare delar. Granskad APL-planering betyder inte genomförd APL.
- Telefonens gemensamma planeringshuvud är högt; tabellen kan behöva sidscroll och APL-väljaren vertikalscroll. Begriplighet behöver fortsatt användarbedömning.
- Ingen ny fullständig faktisk UI-körning av skapande/kullkopiering eller särskild SQL-race med timplansersättning ingår i paketet. Berörda programflöden verifieras med UI-prov och befintliga serverkontrakt bevaras. Separat APL-konkurrrens och fryst timplan provas faktiskt. Ingen verklig kommunanslutning eller SS12000-certifiering påstås.

## Kravspårning

FLOW-01: program-/timplanstabell och kompakt beslut, UI-prov; mänsklig begriplighet kvarstår.
FLOW-02: exakt skola/plan/version, Back/reload och egen APL-vy, UI samt faktisk slutkörning.
FLOW-03–04: tabellgodkännande utan perioder, senare rektorsbekräftelse/HM-granskning, SQL/server samt faktisk slutkörning.
FLOW-05: återstående årsram utan dubbelräkning, modell/SQL/UI samt faktisk slutkörning.
FLOW-06: äldre kvitton, journal, mandat, samtidighet och bevarande, modell/server/SQL samt lokal leverans.
FLOW-07: högskoleförberedande utan APL samt tydlig planering/genomförandegräns, UI/handbok och faktisk slutkörning.

## Lokal installation och leverans

En migration `20261018100000_separate_apl_workflow.sql` installerad efter exakt package-/schema-/rättighetskontroll. Originalkolumnernas data i77 publika tabeller bevarade. Samma testade `3a2edf30775580ff9610d742a1fb965c633f3cef`/213-fils artefakt kör på3012. Appbyte och läsande verkligt rektors-OIDC-prov bevarade76 verksamhetstabeller och privat konfiguration. Slutligt schema `2536a8f757fc001bef68c2c055b89d4334485c4661554eae37f130778c56a4d2`. Artefakt `f944234873cc18f3ae17073a68b154dcf8a80458138b4eba632097aef42ef26e`. Ingen publicering eller extern anslutning. Äldre app är inte säker automatisk rollback efter separata APL-skrivningar.

| Privat bevis | SHA-256 |
|---|---|
| `separate-apl-sql07.json` | `54dcef014bfddf1e64ad0aa4a8ed65abb6027a70dafeb768c614a2c1c7977000` |
| `planning-flow-actual03.json` | `4487b8c51efab0d2484f529eca68145413cbc9e0c9802d863e669a913c8b7b5e` |
| `planning-flow-installed.json` | `267b692a5f5876f0d451a3bc383e01eab739b0d99151ba756e9c96ce541cd1a8` |
| `planning-flow-delivered.json` | `e0e55e186d8abc452e5553b6360ae16fb084b7fb359adcea1ae6e295b3c2bdde` |

Bevisfilerna ligger privat under `/private/tmp/`; innehåller syntetiska identiteter och operativ återhämtningsinformation och versionshanteras inte. Ovanstående hashar avser slutliga granskade bevis. Användarens nya begriplighetsbedömning återstår.
