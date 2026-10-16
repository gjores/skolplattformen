---
phase: 05-bevarade-utbildnings-och-klassfloden
package: APL
stage: 1
status: sql_verified_ui_simulated
updated: 2026-10-16
---

# APL etapp 1 – samlad verifieringsmatris

**Slutstatus2026-10-16:** APL-07 PASS65 kontroller/12 observerade överlapp,65 originaltabeller/530 ursprungliga syntetiska rader bevarade,99 oförändrade aktuella källhashar, full rollback/cleanup. Se [APL-07](05-APL-07-SUMMARY.md). APL-05 UI44, APL-06 UI26 och slutlig Node91 PASS. Faktisk HTTP/OIDC, installation och mänsklig acceptans återstår. Matrisens äldre pågår-noteringar nedan ersätts av detta slutbevis för SQL, inte för verklig integration.

Denna fil skiljer körda delprov, pågående samlad SQL-verifiering och återstående användar-/leveransprov. Ingen aktiv installation eller full fasacceptans följer av en syntetisk SQL-körning.

## Provgräns

APL-07 använder en egen schema-only-kopia med syntetiska kunder, uppdrag, skolor, BF-/SA-planer, två namngivna serier, två klasser, flera läsår och en syntetisk elevs placering/klassmedlemskap. Den aktiva databasens verksamhets-, auth- och identitetsrader kopieras inte. Gamla plan-/kvitto-/audit-/relationsrader jämförs i sin helhet, inklusive tidsstämplar, efter installation/rollback och efter nya kommandon. Privata rapporter innehåller strukturfingeravtryck, full schema-/ACLstruktur, radhashar, källhashar och observerade backendlås.

`actual_worker` betyder faktisk PostgreSQL-inloggning som `skolplattform_worker` med syntetiska session-GUC:er och databasens mandatkontroller. `private_helper` betyder ägaruppsatt försvarstest med produkttriggers kvar. Det bevisar inte en HTTP/OIDC-inloggning. Felaktig SQL→serverprojektion och rollback verifieras dessutom i APL-04:s särskilda actual-Worker/serverprov.

## Matris och spårbarhet

| Område | Lokala krav | Bevis | Status |
| --- | --- | --- | --- |
| Strikt kontrakt, heltalsminuter, hash/Unicode | APL1-01/02/03/05 | APL-01 Node; APL-02 SQL/TS inklusive 5 680 nyckelprober | PASS; aktuella delrapporter ärvda i APL-07 |
| Roller, annat mandat/skola/kund, utgång/återkallelse | APL1-05 | APL-02/04 samt APL-07 ROLE/MANDATE | PASS enligt APL-07 |
| Osäker form/omfattning, delveckor och otillräcklig granskning | APL1-01/02/03 | APL-07 RULE/BOUND | PASS enligt APL-07 |
| Save/save, radtid, bekräftelse, submit/approve och nytt versionsutkast | APL1-04/05/06 | APL-07 RACE, separata anslutningar med observerade blockerare | PASS enligt APL-07 |
| Samma kommando/samma eller ändrat innehåll | APL1-05 | APL-07 RACE-01/02; APL-02 kvitto/status | PASS enligt APL-07 |
| Mandatändring under väntelås och efter tidigare framgång | APL1-05 | APL-07 MANDATE | PASS enligt APL-07 |
| Kopiering, nytt period-ID, oförändrad källa och granskningsposter | APL1-02/03/06 | APL-03 samt APL-07 COPY | PASS enligt APL-07 |
| Flera perioders samlade cellgräns, overifierad källa, 1 000-punktsgräns | APL1-03/06 | APL-07 defensiva helperprov med aktiva guards | PASS efter rättning dce00a5 |
| Äldre draft/submitted/approved/replaced, beslut och byteidentiska receipts | APL1-04/05/06 | APL-03/04 samt APL-07 LEGACY | PASS enligt APL-07 |
| Rollback, originalrader, schema och exakt tre nya Workergrants | APL1-05/06/08 | APL-07 PRESERVE + delad strukturvalidator | PASS i samlat slutprov |
| Verklig SQL-skrivning följd av projektionsfel/auditfel | APL1-05 | APL-04 fem observerade post-write rollbackfall; APL-07 AUDIT | PASS efter profilfix; APL-04/07 |
| UI, dator/telefon, journal, docs, HTTP/OIDC och lokal leverans | APL1-05/07/08 | APL-05/06/08 | Separata planer; ingen acceptans hävdas här |

## Första fel och återhämtning

- `/private/tmp/apl-full-first.json`: aktuella 02- och 03-matriser passerade 46 respektive 33 kontroller med två respektive tre observerade överlapp. Därefter nekade SQL korrekt en ny förhandsfixture eftersom återanvänd äldre returhelper skickade tom motivering. Fixturen rättades till explicit returkommentar. Cleanup slutförd.
- `/private/tmp/apl-full-second.json`: full paketinstallation/rollback, exakt ACL-/strukturkontroll och två defensiva helcellsprov passerade. Därefter upptäcktes en verklig SQL/TS-skillnad för en BF-källa med start hösten 2028: SQL:s beslutskällkontroll gav `sourceSupported:false`, medan TypeScript enbart använde strukturell readiness. Kopieringen bevarade förluster, men den oberoende hashläsningen stängde säkert. Avgränsad produktfix samordnas; inget lyckat slutprov påstås före omkörning. Cleanup slutförd.

## SS 12000 och återstående acceptans

SS 12000:2024 utgåva 4/OpenAPI 2.1.0 beaktas genom bevarande av stabila skol-/organisations-/klassidentiteter, datum, placering och medlemsrelationer. APL är ett separat internt planeringsobjekt. Ingen faktisk extern anslutning, standardexport, elevplacering eller närvaroregistrering skapas eller verifieras av denna matris. Mänsklig acceptans och installation av användarens riktiga miljö är separata steg.
