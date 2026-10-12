---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: OPERATIONAL-01
status: implemented_sql_verified_api_pending
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

## Återstår före lokal produktleverans

`work/pilot/verify-class-timplan-api.mjs` är skrivet men ännu inte kört. Det ska pröva faktiskt slutbyggd Worker inklusive riktiga klasskommandon, beslutad ny timplansversion, explicit byte och Worker-auditfel. Riktiga API-resultat, rootens UI-prov på dator/telefon, samlat typ-/app-/handboksbygge och lokal runtimeleverans redovisas i plan06. Detta dokument ger ännu inget sådant PASS och inget fullständigt ADMIN-04-/fasgodkännande. GR/IM, klassbyte för elever, externa kommunanslutningar och automatisk adoption ingår inte.

Inga commits skapades av klassagenten; root samlar avgränsade leveranser och pushar aktuell gren.
