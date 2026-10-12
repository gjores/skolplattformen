---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: VOCATIONAL-02
status: implemented_sql_verified_and_installed_locally
completed: 2026-10-12
requirements: [ADMIN-02, ADMIN-04]
---

# Yrkesprofiler i skyddad databas och beslutskedja

Framåtmigrationen `20261012200000_plan_decision_vocational.sql` är installerad och journalförd i den isolerade lokala provmiljön. Den ersätter tre befintliga funktionsdefinitioner för timplanskällans fullständighet, beslutsspärrar och beslutsunderlag. En ny intern profilfunktion är stängd för PUBLIC, anon, authenticated, service_role och Worker. Befintliga migreringar, kommandofix 180100 och externa funktionssignaturer är oförändrade.

Profilen hämtas från planens frysta katalog med exakt programkod, kategori och version. Samtliga tolv yrkesprogram stöds med 2700/2625 respektive 2800/2720, och högskoleförberedande Gy25 behåller 2500/2180. Källrader jämförs med kanoniska databasrader; grundbehörighetsnivåer måste vara fullständiga och svenskans alternativ räknas en gång. Båda plantyper kräver bekräftad grundbehörighet och APL vid inskickning och fastställande. Yrkesstart från 2028-07-02 kan planeras men spärras för beslut eftersom modellen saknar yrkesprov.

Efter huvudmannens återsändning väntar huvudmannen på en ny inskickning. Rektor får rättningsuppgiften för programplan; rektor och skoladministratör får rättningsuppgiften för timplan. Direktfastställande av vanligt programutkast består, medan huvudmannen inte kan fastställa en återsänd programplan utan ny inskickning. Beslutshistorik och obligatorisk motivering består.

## Färsk verifiering

**101/101 faktiska SQL/oberoende TypeScript-kontroller PASS**, känd exit 0. Provet körde i en rollbacktransaktion:

- Frysta källor och timplansskapandets fullständighetskontroll för alla tolv yrkesprogram samt kontrakt för HE-profilen.
- Hela BF25- och BA25-kedjan: skapa programplan, skapa fryst timplansutkast, skicka in, återsänd med kommentar, rätta, skicka igen och fastställ båda planerna.
- Saknad APL-/behörighetsbekräftelse, en timme under garantin, saknad behörighetsnivå, fel roll/skola, gammal revisions-/innehållsbild och tom returkommentar nekas. Exakt 2625/2720 accepteras.
- Huvudmannen kan inte fastställa återsänd programplan; inkorgen visar väntan på rektor.
- Gammalt lyckat HE-kvitto skapat före migrationen återspelas exakt efter migrationen och godtas av nya Worker-projektionen. Ett nytt kommando med gammal innehållshash nekas.
- Blockerade startdatum behåller rätt yrkesprofil och fyra granskningskontroller; läsningen visar begripliga spärrar.
- Auditfel rullar tillbaka beslut, timmar, granskningsstatus, historik och kvitton. Låsta versioner, gamla timplanskällor och explicita klasslänkar bevaras.

Separat **DDL-rollback PASS**, sedan **apply PASS** med exakt samma källhashar och databasbaslinje. Alla kompletta rader/tidsstämplar i 15 etablerade verksamhetstabeller och fyra beslutstabeller är lika före/efter. Övriga funktionsdefinitioner, ägare, råa ACL, tabellkolumner, constraints, index, triggers, policies och journal kontrolleras; enda permanenta skillnaden är den uttryckliga funktionsmigrationen med journalrad. Inga Workergrants läggs till.

Privata råbevis ligger i `/private/tmp/` och innehåller inga publicerade testhemligheter:

| Bevis | Status | SHA-256 |
| --- | --- | --- |
| `vocational-flow-final2.json` | PASS | `62a5861f72e87ecc9681c6b6cf6e7be1b78fd7202e560fdb49db5b630eb19269` |
| `vocational-ddl-verify.json` | PASS | `03b98f5444164c36b1a3d2751634f77fa20ee0cc3ac3b43a65818c0bb8d8b3e0` |
| `vocational-ddl-apply.json` | PASS | `ecb8f97b6d70a541c38cce777acb94b09eb56c61c5fdf0b022b7f6865c7e60b4` |

## Avvikelser och gränser

Planens föreslagna filnamn blev `20261012200000_plan_decision_vocational.sql` och `phase5_vocational_plan_decisions.test.sql`. Ett första rollbackförsök stoppade före scenarioändringar eftersom den egna äldre kvittofixturen saknade sin syntetiska utbildning; rollback och bevarandekontroller passerade. Fixturen rättades. Två tidigare positiva körningar (96 respektive 101 kontroller) följdes av det slutliga 101-provet med extra datumregression; endast ovanstående exakta sista källa ligger till grund för installation.

Huvudmannens vänteläge efter retur är en av root godkänd proportionerlig korrekthetsrättning: den tidigare inkorgen erbjöd åter godkännande direkt efter egen retur. Det kräver ingen ny action, tabell eller API-form.

Faktiska Worker-API-prov, roll-UI, slutbygge och lokala 3012-leveransen redovisas separat i plan 04. SQL-provet påstår ingen extern IdP-/kommunanslutning, ingen verklig elevdatamigrering och ingen fullständig fasacceptans. APL-längd, lärlingsandel och dubblering är manuella beslutsbekräftelser; någon automatisk APL-kalender införs inte. Individuella bortval och yrkesprov från 2028 är fortsatt separata avgränsningar.
