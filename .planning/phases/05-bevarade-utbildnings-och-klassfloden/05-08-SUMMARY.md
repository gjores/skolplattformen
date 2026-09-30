---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "08"
status: complete
completed: 2026-09-30
requirements: [ADMIN-02]
source_commit: b0bf476bbe16a245a5e49cc1821f198b36cad72d
catalog_id: sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace
---

# 05-08 — oföränderlig katalog och stängda programplansutkast

Databasen kan nu faktiskt lagra den verifierade katalogen och läsa, binda, ändra, skapa och klona programplansutkast med verklig session, levande skolmandat, förväntad revision/version och obligatorisk DB-audit. API, Worker-rättigheter, UI och fastställande är fortsatt stängda. Teknisk referenslösning tillåter ett ofullständigt utkast men ger aldrig beslut: nationella alternativ, ramar, nivåföljd och timmar måste fortfarande verifieras. ADMIN-02 och hela fas 5 förblir öppna.

## Genomförande och commits

| Uppgift | Resultat | Commit |
| --- | --- | --- |
| Plan | Låst utkast-/katalog-/lås-/auditkontrakt, med separat API-gräns. | 4dc38dc |
| 05-08-01 | DB-format/korsreferens/SHA-prövning, immutable INSERT-seed och importsäker offlinegenerator med 4 prov. | c357f64 |
| 05-08-02 | Fem stängda sessions-/mandatbundna kommandon, legacy-bindning, revision/CAS, nytt utkast/kloning och atomisk verksamhetshistorik/audit. | 244d1e2 |
| 05-08-03 | Verkliga anslutningar/låsväntan, full diagnos-/valparitet, säker ägd cleanup och internt kontrakt. | bf278d8 |
| Regression | Äldre loggprov prövar nu avsiktligt stängd direkt Worker-historik samt bevarad auth.users-semantik för gamla händelser. | b0bf476 |

Tre nya framåtmigrationer 20260930160000/161000/162000 tillämpades atomärt endast på assertTarget('protected')-verifierad disponibel lokal databas efter separata återställda preflightprov. Ingen reset, fjärrmigration eller ändring i redan tillämpad migration. Den sparade katalogen har samma fa42…2ace-identitet, 907 ämnen och 29 program som 05-07. SQLcanonicaliseraren bevarar arrays; seedgeneratorn använder verifierad normaliserad form med explicita datum-null. Inga äldre modeller eller originalsnapshot ändrade. De fem orelaterade arbetskopieändringarna lämnades utanför commits.

## Färska prov

| Kontroll | Resultat |
| --- | --- |
| Katalog-pgTAP | 60/60 PASS |
| Utkast-pgTAP | 108/108 PASS |
| Timplan / Worker-session / list-kolumn | 77/27/59 PASS |
| Mandat / mandat-audit / registerkonflikt / äldre logg | 243/19/19/20 PASS |
| Sammanlagt riktad SQL | 632/632 PASS |
| Modell/server/generator + harnesssäkerhet | 455/455 + 5/5 PASS, inga skip |
| Typkontroll, lint, båda bytekontroller | PASS |
| TS/SQL-underlagsparitet | 42/42 PASS: alla 29 program + 13 negativa |
| Verkliga separata anslutningar | 6/6 observerade låsväntansfall PASS |
| Yttre SQL-caller-rollback | PASS, inga kvarvarande data-/historik-/auditändringar |
| Ursprungliga verksamhetsfält | Samma hash före/efter för planer, utbildningar och historia |
| Oberoende GSD-läsgranskning | 6/6 must-haves PASS, inga kvarstående kodblockerare |

Samtidiga replace/bind/clone-kommandon ger en lyckad ändring och 40001 för den äldre begäran. Clone skapar enbart en nästa utkastversion utan att ändra källans beslut/historik. Ett verkligt planradlås ger transactionid-väntan och stale revision nekas efter väntan. Återkallat givarmandat och utgången session efter kundlåsväntan ger 42501 med oförändrad plan/audit. Lås konstateras via pg_blocking_pids/pg_locks; prov är inga konstgjorda väntemockar.

PgTAP använder verkliga mandatkedjor och sessionsrader, samt avgränsad syntetisk privilegierad setup för äldre historik och en framtida bunden beslutad källa. Det sistnämnda är en clone-fixtur, inte ett öppnat/verifierat fastställandekommando. Format, fel version/start/inriktning/item/poäng, Gy11/GR, ordning, index, kund/skola/roll, trasiga FK-medlemskundrelationer, logg-/historikfel och efterföljande anroparfel prövas med faktiska data-/revisions-/historik-/auditasserts. Read- och create-auditfel ger också rollback; ingen framgång maskeras.

Paritetsjämförelsen behåller alla diagnostikobjekt och olösta val men normaliserar deras ordning. Vid malformed/obundet indata saknar SQL vald katalog och ger null-ID, medan TS redan har verifierad instans; denna förklarade metadataavvikelse är explicit prövad. Inga orsaker/readiness göms. Saknat DB-katalog-ID ger catalog_unavailable och ingen defaultkatalog.

## Bevarande och säkerhetsgräns

Befintlig plan är fortfarande obunden med revision 0, och samtliga ursprungliga plan-/utbildnings-/historikfält är byteidentiska efter kanonisk JSON-hash. Inga gamla beslut, ID:n eller kurs-/nivåval skrivs om. Legacy-bindning kräver full explicit referens och exakt tidigare ordnad valmängd; en obunden beslutad källa klonas utan att själv bindas.

Ny point_plan_events-historia behöver faktisk skyddad aktör. Inom planens omfattning tillkom därför separata identity/session/membership/assignment-kolumner och en tabellspecifik actortrigger; den globala gamla triggerfunktionen och äldre auth.users-actor-FK bevarades. Workers gamla direkta SELECT/DML på point_plans/point_plan_events stängdes efter kodkontroll av att inga skyddade serverroutes använder dem. Inga nya funktioner/tabeller/grants öppnades, och Worker har exakt de tre tidigare timplanskommandona. Första fas 2-auditregressionen misslyckades eftersom det gamla provet fortfarande försökte direktinsert som Worker; slutprovet testar spärren och gammal actorsemantik separat, 20/20 PASS. Ingen rättighet återöppnades för att få provet grönt.

Ägd cleanup lämnar noll egna kunder, sessioner, planer, utbildningar och mandat. Säkerhetsloggar raderas aldrig: 3 programplans-DB-händelser och 1 refererad identitet behålls som auditankare, uttryckligt redovisat i rapporten. Identifieraren/issuer randomiseras så nya prov kan köras utan kollision med bevarade ankare.

## Bevis och nästa steg

Samlad maskinrapport: work/pilot/results/phase5-08-foundation.json; katalog-, utkast-, regression- och låsrapporter refereras där. Låsprovet kördes vid HEAD244d1e2 mot arbetskopians senare committade harness; alla fem källhashar matchar slutkoden. Rapporten redovisar körrevision och slutrevision separat utan att skriva om den historiska körningen. Nya SQL-filer har varit frysta sedan tillämpningen.

Inga app-/serverroute-/UI-ändringar finns här, så appbygge, browserprov och handboksbygge kördes inte om. Tidigare 05-06/05-07-bevis är historik. Det interna kontraktet beskriver faktisk SQL och nästa gräns, inte nya användarinstruktioner.

Nästa avgränsade plan är skyddad programplans-API med levande session/MFA, strikta kontrakt och obligatorisk Worker-audit i samma yttre transaktion. Full SQL/API-preflight och exakt återställning av tillfälliga provrättigheter krävs före några permanenta Worker-grants. UI, fullständiga nationella beslutregler och huvudmannens direkta fastställande, kullkopiering och klasskoppling återstår. Fas 4:s mänskliga checkpoint/datumanmärkning och separat fasverifiering kvarstår. Ingen riktig kommunanslutning eller pilotdrift är verifierad.
