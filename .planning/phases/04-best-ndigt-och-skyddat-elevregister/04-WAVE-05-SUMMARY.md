---
phase: 04
wave: 5
status: complete
full_sql_status: fail
completed_plans: [04-05, 04-09]
next_plans: [04-06, 04-12]
---

# Fas 4 — våg 5

Atomiska elevändringar och auditerade läs-API:er är genomförda. Nio av fasens 22 planer är klara. Se 04-05-SUMMARY och 04-09-SUMMARY för kravspårning, kontrakt och commits.

## Verifierat

- 368/368 modell- och serverprov PASS. Typkontroll, lint och skyddat appbygge PASS. Slutbyggets revision är 0149ea0.
- Fem verkliga lokala OIDC-/Worker-/databasfall PASS: lista, elevkort och historik får en committad huvudlogg före svar; fel på huvudlogg eller särskild skyddslogg ger innehållslöst fel. Skyddad elev anonymiseras utan skolbunden behörighet, beviljad/återkallad behörighet slår igenom, huvudman/IT nekas elevläsning och lärare får begränsad projektion utan administrativ historik. Personnummer/auditRefs lämnas inte i svaren. Same-origin, okänd elev och otillåtna requestfält prövas också.
- Första API-försöket stoppades i lokal OIDC-callback före registeranrop. Omkörningen passerade alla fem fall utan ändrad appkod. Tillfälliga databasrättigheter återställdes och verifierades innan migration 141 tillämpades permanent. Loggfel och syntetiska skyddsändringar återställdes av proven.
- API-rapporten finns lokalt i web/test-results/phase4-reads.json. Bygg- och Node-loggar finns i /tmp/skolplattform-wave5-build-final.log och /tmp/skolplattform-wave5-node.log.

- Efter permanent migration 141 passerade 146/146 projektions- och behörighetsprov. Den vanliga SQL-transporten fick först timeout; ett efterföljande prov belade ett fel i den nya testhjälparens behörighet. Efter rättad förberedelse av request före rollbyte passerade exakt samma fixtur via målskyddad Docker/psql. Inga applikationsrättigheter utökades för testhjälparen.

- Kandidatmigrationen för ändringar passerade 101 datum-/periodprov och 19 konfliktprov i rollback. Prov med flera återställningspunkter fick en explicit TAP-plan eftersom databasens interna testresultattabell annars återställdes; den externa kontrollen kräver samtliga utsända assertions, obruten numrering och korrekt antal. Samma 101+19 prov passerade även efter permanent migration 150.

- Sex verkliga samtidighetsfall PASS efter permanent migration 150: oberoende basfält sparas, samma fält och datumrelationer ger konflikt med committad version, spärrat medlemskap och återkallat skydd stoppar värdebärande svar. Fem fall observerade kundens advisory-lås; separat elevradfall observerade transactionid-väntan. Provets egna slump-ID-data städades enligt avgränsningen i 04-05-SUMMARY; inga säkerhetsloggar eller befintliga provkunder raderades.

## Full SQL-regression är fortfarande röd

Alla 15 filer kördes. Första Docker-körningen gav 524 passerade assertions och sju avbrutna filer. Ett äldre loggprov förutsatte pgTAP-förberedelsen som Supabase CLI normalt gör. Med samma förberedelse inom provets rollback-transaktion passerade dess 13/13 kontroller. Slutresultatet över alla filer är **537 passerade assertions och sex FAIL-filer**, inte en påstådd obruten grön helkörning.

De sex tidigare kända felen är `Case school scope denied` före assertions i phase3_boundaries, phase3_connections, phase3_mandates, phase3_matrix, phase3_policy och phase3_temporal. Ägare är 04-14/15. Inga filer hoppades över. Full fasgrind är inte PASS och inga ytterligare krav markeras slutverifierade.

Minimerade rapporter finns lokalt i work/pilot/results/phase4-register-locks.json och phase4-wave5-sql-final.json. Den senare länkar båda SQL-försöken. Alla databasprov kördes seriellt med målskydd. API-testernas källor finns i web/e2e/phase4-reads.spec.ts och web/playwright.phase4-reads.config.ts (commit 447d6d9).

## Avgränsning

Ingen ny registervy införs i denna våg. UI-kontroller och berörd handbok följer gränssnittsplanerna. Gamla elevprovet är fortsatt stängt. Bara tre auditerade läsfunktioner öppnas; export, visning av personnummer och mutationer väntar på respektive skriv-/export-API. Alla uppgifter är syntetiska i verifierat lokalt mål. Ingen reset, publicering eller verklig kommunanslutning genomfördes.

## Nästa steg

Våg 6 omfattar 04-06 (lokal rättelse mot simulerad källa) och 04-12 (elevlista, läsår och säkert urval på dator och telefon). Samlade användarprov och slutlig fasverifiering återstår.
