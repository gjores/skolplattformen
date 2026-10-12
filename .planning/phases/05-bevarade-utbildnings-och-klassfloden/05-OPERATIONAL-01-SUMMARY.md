---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: OPERATIONAL-01
status: complete
requirements: [ADMIN-04, PLANERING-04]
completed: 2026-10-12
---

# Skyddad beständig klass och explicit timplansversion

Beständiga klasser skapas i `school_classes`. En klass kopplas uttryckligen till en fastställd skolbunden timplansversion och ett valt läsår. Klassens kullår härleds från det frysta startdatumet med gränsen 1 juli; timplanens år 1–3 måste stämma med valt läsår. Annan kull, skola, utbildning, ej fastställd målversion, arkivering eller motsägande utbildningsmetadata spärrar skrivning.

Huvudman kan läsa. Rektor och administratör kan skapa och koppla inom verkligt skolmandat. Worker kräver MFA, CSRF och aktuell kontext vid skrivning. Två SQL-entrypoints har Worker-rättighet, övriga hjälpare och kvittotabell är stängda. SQL- och Worker-audit ingår i samma transaktion. Kommandon har egna kvitton bundna till identitet, uppdrag och exakt begäran.

`class_timplans` har tillagda nullable `class_id` och `revision`. Befintliga rader har inte kopplats om eller fått en gissad klassidentitet. Namnbaserade äldre länkar visas som äldre kopplingar och kräver ett uttryckligt kommando med tidigare plan-ID och revision för adoption. Även den tidigare planen måste tillhöra klassens utbildning/skola. En ny fastställd version flyttar inga klasskopplingar. Byte av en koppling ändrar endast valt läsår; andra år stannar på tidigare version.

API: `POST /api/klasser/underlag`, `/skapa`, `/koppla`. Underlaget visar alla länkar till exakt öppnad version över alla läsår, även ersatta versioner, samt aktuella klasser och deras länk för valt läsår. Ingen tyst trunkering: mer än 2000 objekt i en av listorna ger ett tydligt fel. Elevplaceringar ändras inte.

## Färska bevis

- 11/11 Node-kontrakt-/routeprov PASS: strikt indata, exakta svar, mandatroller, MFA, CSRF, revisionskonflikt, auditering och transaktionsrollback vid fel. Körda `node --test web/lib/class-timplan.test.mjs web/lib/server/class-timplan.test.mjs`.
- Riktad lint för nya modell/server/routes och audit/http-filer PASS.
- 56/56 verkliga PostgreSQL-/kontraktprov PASS i rollbacktransaktion, både SA25 och BF25. Inkluderar beständig klass, dublett, återförsök, fel roll/skola, år/kolumn/revision, andra läsåret, auditfel, ny fastställd version med gamla länkar, explicit byte, gammalt kvitto efter ny version, äldre namnlänk och explicit adoption, datumgräns juni/juli samt motsägande nuvarande kullmetadata.
- Privat rollbackbevis `/private/tmp/class-timplans-flow4.json` med känd exit0, källhashar och full återställning av 19 verksamhetstabeller samt schema/funktioner/ACL/index/constraints/triggers/policies/journal.
- DDL-rollback `/private/tmp/class-timplans-ddl-verify.json` PASS, därefter separat installation `/private/tmp/class-timplans-ddl-apply.json` PASS, båda exit0. Migration `20261012210000_class_timplan_flow.sql` installerad och journalförd endast lokalt. Originalradernas tidigare fältvärden bevarade; nya schemafält på äldre klasslänkar är avsiktligt `class_id=null`, `revision=0`.

Första tre SQL-försöken är bevarade: flow1 fann en SQL-variabelkvalificering; flow2 avslöjade att den återanvända testrektorn hade samma skola; flow3 stoppade ett avsiktligt identitetsbundet kvitto som testet försökte spela om med fel aktör. Alla tre hade full rollback och ersätts inte i historiken av flow4 PASS.

## Faktisk lokal Worker och återstående fullkravsgräns

`work/pilot/verify-class-timplan-api.mjs` har prövat faktiskt slutbyggd Worker (0ab2064) med BF25: 18/18 PASS, exit0. Verkliga HTTP-kommandon skapar beständig klass, kopplar, spelar om kvitto, nekar fel roll/skola/MFA/CSRF/epoch/revision, bevarar gammal länk vid ny fastställd version och byter uttryckligen till den nya. Faktisk årslista visar exakt gammal respektive ny version, korrekt år 1 och sparat timtal. Worker-auditfel rullar tillbaka klass och kvitto. Två nya browserkontexter med verklig syntetisk rektorssession (1440 och 390 px) läser klasspanelen och visar rätt klass/läsår/årskurs/version; inga pageerrors eller sidöverströmning. Båda bilder visuellt granskade. Ingen processomstart efter klasskommandot påstås. Originalens 20 verksamhetstabeller, DDL/ACL/journal och källor bevarade, egen fixture städad. Bevis `/private/tmp/class-timplan-api-bf2.json` och motsvarande -1440/-390.png. Även BA25 passerar 18/18 actual API/UI-kontroller, exit0, med full ägd städning och bevarade original/DDL/ACL/källor: `/private/tmp/class-timplan-api-ba.json`. Två BA-bilder (-1440/-390.png) visuellt granskade; sammanlagt fyra verkliga läsande UI-prov/bilder och 36 API/UI-kontroller. Rootens samlade UI-, typ-/app-/handboksbygge och lokal runtimeleverans redovisas i plan06; detta är inget fullständigt ADMIN-04-/fasgodkännande. GR/IM, klassbyte för elever, externa kommunanslutningar och automatisk adoption ingår inte.

Inga commits skapades av klassagenten; root samlar avgränsade leveranser och pushar aktuell gren.

## Oberoende granskningsfynd: vårstart

En oberoende källgranskning efter installationen fann att `offerings.start_year` lagrar startdatumets kalenderår, medan klassens kull och årsprojektion använder akademiskt år. Jämförelsen i 210000 blockerade därför legitima starter januari–juni. Framåtriktad migration `20261012240000_class_start_calendar.sql` rättar endast metadatajämförelsen; klassens akademiska startår och 1 juli-gräns består. Historisk 210000 ändras inte. Den smala verifieraren `verify-class-start-calendar.mjs` prövar hela vårkedjan för SA25 och BF25 samt felaktigt kalenderår. Sex verkliga vårstartsprov PASS (SA25 och BF25: full beslutskedja, klass/läsår 1 och felaktigt kalenderår), följt av separat apply PASS efter 230000. Båda körningar har känd exit0. Privata bevis `/private/tmp/class-start-calendar-verify.json` och `/private/tmp/class-start-calendar-apply.json` binder exakt källa, 20 verksamhetstabellers bevarande och full DDL/ACL/journal. Migration 240000 är installerad/journalförd lokalt; ingen historisk migration skrevs om.

Första faktiska BF-API-försöket (`/private/tmp/class-timplan-api-bf.json`) passerade 12 kontroller och stoppade på en felaktig testförväntan: GY:s års-API använder `application.columnId=null` och `relativeYear`, medan sparad ar1 valideras av SQL och klassunderlaget. Rättad testförväntan; ingen produktändring. Även första försöket städade egna data och bevarade original/DDL/ACL.
