---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: DECISION-03
status: completed
requirements: [ADMIN-02, ADMIN-04]
---

# Skyddad beslutskedja och verkligt API-prov

2026-10-12. De slutna rutterna är `/api/planbeslut/underlag`, `/api/planbeslut/andra` och `/api/planbeslut/inkorg`. Servern analyserar det aktuella låsta underlaget med den vanliga program- och timplansmodellen. Klientens godkännande ersätter inte kontroll av mandat, skola, revision, innehåll, obligatoriska kontrollpunkter eller säkerhetsloggning. Återanvänt kommando återger sitt beständiga beslutskvitto; samma nyckel med annat innehåll avvisas.

## Verifierat mot riktig lokal databas

`work/pilot/verify-plan-decision-flow.mjs` passerade 34/34 kontroller både med rättningen i en rollbacktransaktion och efter installation av migrationerna 180000/180100. SQL-underlagen gick även genom den riktiga oberoende TypeScript-projektionen. Två egna syntetiska kunder användes. Hela transaktionen återställdes.

Provet omfattar båda kedjorna utkast → inskickad → återsänd med skäl → redigering → inskickad → fastställd, fel kund/skola/roll, obligatoriska kontroller, gamla revisioner från en andra flik, idempotent upprepning, otillåten återanvändning av kommandonyckel, låst inskickat/fastställt innehåll och oföränderlig historik. En timplan med fryst programkälla från utkast fungerar efter att samma oförändrade programinnehåll fastställts. Ett injicerat fel i databasens säkerhetsloggning återställde plan, timmar, granskning, historik, kvitton och skrivtillstånd atomiskt. Befintlig beslutshistorik och klasskopplingar förblev oförändrade.

## Verifierat genom riktig skyddad Worker

`work/pilot/verify-plan-decision-api.mjs --preflight --dev-worker` passerade 19/19 kontroller mot den isolerade lokala skyddade Workern. Det är verklig HTTP och PostgreSQL med egna syntetiska sessioner; det är inte en mockad API-kedja. Provet omfattar båda fullständiga returkedjorna, huvudmannens fastställande, administratörens tillåtna timplansinskickning och nekade programbeslut, skolavgränsning, MFA, CSRF, gammal sessionskontext, revisionskonflikt, idempotens med parvis DB-/Worker-audit, innehållslås och inkorgens borttagning av färdigbehandlade planer.

Ett särskilt fel efter databasbeslutet i Workerns slutliga säkerhetsloggning gav HTTP 500 och återställde även själva beslutet. Därefter kunde samma oförändrade underlag fastställas normalt. Säkerhetsloggen behölls med sina syntetiska identitetsankare; provets affärsdata, sessioner, tillfälliga triggers och funktioner städades.

Tillfälligt öppnades exakt de tre besluts-RPC:erna. De stängdes igen före slutkontrollerna. Full fingerprint för publika funktioner, rättigheter, policies, triggers och migrationsjournal var identisk före och efter. Alla bevakade källhashar var identiska, inklusive rättningsmigration 180100. Ingen återställning av databasen, global auditavstängning eller verklig kunddata användes.

## Exakt bevarande och begränsningar

Hela rader och tidsstämplar jämfördes för dessa 15 befintliga verksamhetstabeller: `offerings`, `offering_units`, `point_plans`, `point_plan_events`, `timplans`, `timplan_cells`, `timplan_events`, `class_timplans`, `school_classes`, `pupil_placements`, `programplan_shape_upgrades`, `programplan_unit_packages`, `programplan_packages`, `gym_timplan_receipts`, `programplan_education_receipts`. Dessutom jämfördes de fyra nya tabellerna `plan_decision_reviews`, `plan_decision_history`, `plan_decision_receipts`, `plan_decision_write_permits`. Samtliga var exakt återställda efter API-provet. Detta är inte ett påstående om radbevarande av samtliga publika tabeller; säkerhetsloggen fick de förväntade verifieringshändelserna.

API-provet använde en riktig utvecklings-Worker med frysta, hashkontrollerade källor. Det verifierar inte självt det slutbyggda distributionspaketet, inloggning via verklig extern identitetsleverantör eller samtidiga kommandon på två fysiska databasanslutningar. CAS provades med inaktuella revisioner. Inga klasskopplingar flyttades; en ny skyddad klasskopplingsfunktion ingår inte i denna leverans. Verifierad nationell beslutsprofil är högskoleförberedande Gy25; yrkesprogram, GR och IM öppnades inte genom detta arbete.

Permanenta lokala Worker-grants genom `20261012181000_plan_decision_worker.sql` hanteras separat med `work/pilot/enable-plan-decision-api.mjs`, som kräver denna lyckade verkliga preflight, oförändrade källhashar och exakt aktuell databasfingerprint. Aktivering och efterföljande slutprov dokumenteras av leveranssteget. Full ADMIN-02/04 eller fasacceptans påstås inte här.

## Kontrollerade avvikelser

De tidiga planutkasten använde andra rutt- och migrationsnamn; ovan anges de faktiskt implementerade namnen. Etablerade isolerade program-/gymnasiefixturer återanvändes i stället för att skapa en parallell fixturmodell. Ett verkligt PL/pgSQL-namnfel upptäcktes och korrigerades framåtriktat i 180100 utan ändring av den redan installerade 180000. Workerns avsiktliga textbaserade CSRF-avslag krävde en rättning i testhjälpens svarstolkning, inte i behörighetskontrollen.

## Efter lokal aktivering

Leveranssteget aktiverade de tre exakta RPC:erna genom 181000 efter den godkända API-preflighten. Därefter passerade `supabase/tests/phase5_plan_decision_contract.test.sql` 11/11 kontroller i en ny rollbacktransaktion: status/revisionsändring lämnar källinnehållet identiskt, byte av plan/katalog/terminsfördelning ändrar det, publika klientroller saknar alla beslutsanrop, Worker saknar privata helpers och direkt tabell-DML, skrivtillstånd är tomma och källans rader samt skolkopplingar har aktiva låstriggers. Full DDL/ACL/journal-fingerprint och samtliga 19 bevakade tabeller var oförändrade efter provet. Slutbyggd API-körning och lokal OIDC-ingång följs i leveransens separata verifiering.
