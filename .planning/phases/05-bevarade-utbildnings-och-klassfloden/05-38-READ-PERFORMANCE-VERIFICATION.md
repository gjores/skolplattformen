---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "38-READ-PERFORMANCE"
verified: 2026-10-07T12:58:34Z
status: passed
score: 3/3 must-haves verified
scope: local-synthetic-only
verification_method: independent-source-and-actual-evidence-review
gaps: []
---

# 05-38-READ-PERFORMANCE — avgränsad verifiering

**Resultat: PASS för den interna prestandarättningen.** Samma faktiska årsunderlag kan läsas snabbare över 52 programramar utan ändrat kontrakt, mandat, audit, verksamhetsdata eller Worker-grants. Detta avslutar denna korrektivplan och öppnar dess beroendegrind för fortsatt UI-arbete. Det är inget fullständigt PLANERING-/ADMIN-, browser-, användar- eller fas 5-PASS.

Verifieringen följer GSD:s mål→artefakt→koppling och utgår från [planens tre must_haves](05-38-READ-PERFORMANCE-PLAN.md), faktisk implementation och redan genomförda lokala Worker/Postgres-prov. Ingen ny DB-, API-, browser-, bygg-, Git- eller testsvitskörning utfördes av verifieraren. Rapporternas innehåll, hela källbytes, hashbindningar, katalogdiffar, mätvärden och bevarandekedjor granskades oberoende. Ingen tidigare verifiering för detta korrektiv fanns.

## Mål och verifierade förhållanden

| # | Förhållande från planen | Resultat | Faktiskt stöd |
| --- | --- | --- | --- |
| 1 | Sökning, sortering och sidbyte över 52 programramar har förbättrad uppmätt svarstid med oförändrat årsunderlag/versioner. | VERIFIED | Färska rollback och applied: SQL143/46 samt oförändrade SQL93/kontraktsparitet18. Nio kompletta gamla HTTP-svar och tolv kompletta nya; listan 52/50, sida 2 52/2, sökning 1/1 och ny överblick 52/52. Ordinarie API15/247 PASS. Tidsmålen nedan uppfyllda. |
| 2 | Planidentitet, revision, skol-/källreferens består; en annan/felaktig källa får inte verifierade celler genom återbruk. | VERIFIED | Exakt JSONB-nyckel, endast kanoniska rader/celler i lokal cache, egna plan-/utbildningsfält på träff. Samtliga 46 unika gammal/ny-fall har lika utfallshash och SQLSTATE, inklusive distinkta källor, versions-/skolreferenser, felaktig fördelning, saknat underlag, fryst konflikt/trunkering och båda cachegränserna. |
| 3 | Mandat, auditpar, felkoder, hela verksamhetsrader och exakt 28 Worker-entrypoints består; bara en privat definition och dess nya journalpost ändras. | VERIFIED | Jämförelse av 198 public-funktioner och full tabell-/sekvens-/vy-ACL/RLS/journal visar endast `public.phase5_planning_year_rows(jsonb)` ändrad. En exakt journalpost06122000. Rå ACL och 28-entrypointmängd oförändrade; hjälparen fortsatt `{postgres=X/postgres}`. Original15, tidsstämplar, original/retained audit och identitetsankare bevarade. |

**Poäng: 3/3. Inga blockerande luckor i den avgränsade planen.**

## Artefakter och kopplingar

| Artefakt | Finns/substantiell/kopplad | Granskning |
| --- | --- | --- |
| `supabase/migrations/20261006122000_phase5_planning_year_read_performance.sql` | VERIFIED | En `CREATE OR REPLACE` för den privata rows-signaturen. VOLATILE, SECURITY DEFINER, search_path, ägare och rå ACL består; inga nya tabeller, index, grants, API- eller skrivfunktioner. Journalen innehåller exakt filens bytes. |
| `supabase/tests/phase5_planning_year_read_performance.test.sql` | VERIFIED | Ägd BEGIN/ROLLBACK-fixtur, 46 verkliga gammal/ny-scenarier och 143 TAP-assertioner. Samma positiva JSONB och negativa SQLSTATE; inga skips/TODO. De fyra egna SQL-sessionerna har dokumenterad3h giltighet. |
| `work/pilot/verify-planning-year-read-performance.mjs` | VERIFIED | Faktisk lokal target/build/source-grind, låst SQL-paritet, full katalog-/helradssnapshot, seriella HTTP-mätningar, audit-/sessionslåsbarriär, säker cleanup och separat oförändrad API-runner. |
| `work/pilot/verify-planning-year-read-performance.test.mjs` | VERIFIED | Substantiella negativa grindprov för definition/ägare/ACL/journal, källor, paritet, timing/completion, evidensvägar och ägd transport. Tidigare33 rena PASS är dokumenterade av executor; ingen ny provkörning gjordes i denna verifiering. |
| `work/pilot/apply-planning-year-read-performance.mjs` | VERIFIED | Kräver komplett rollback, lås5520, exakt föregående foundation/grant, baseline och sista fulla audit-/identitetsankare. Tillåter bara förutsagd definition och en journalpost; postcommit-kontroll och kopiering till ägt lokalt mål. |

Rows→`phase5_gym_timplan_source`→`phase5_planning_year_gym_cells` är kopplad: första fullständiga nyckeln går genom befintlig validering; träff återbrukar endast dess verifierade kanoniska inventory/celler. Nyckeln är exakt JSONB `[catalogId, basisReference, term_distribution]`, inklusive hela strukturer och arrayordning. Cache finns endast inom anropet, med högst128 nycklar/50000 celler och ordinarie väg efter gräns. Varje plans ID/version/revision/status/katalog och utbildningsfält byggs från dess egna scoped rader. Saknad basis och timplansgrenen/fryst källa behåller ordinarie väg.

Apply→fullrollback är käll-/katalogbunden. Coordinator→oförändrad `verify-planning-year-api.mjs` kör alla15 fall i den dedikerade API-slutrapporten. De 93 historiska originalassertionerna körs med tillfällig återkallelse av enbart de tre planning-läsgrants inom rollback; full rå ACL och 28-entrypointmängd återställs efteråt.

## Faktiska rapporter och bevarad kedja

| Rapport | Resultat | SHA256 för rå fil |
| --- | --- | --- |
| [Full rollback](../../../work/pilot/results/phase5-38-read-performance-rollback.json) | PASS/complete; SQL143/46, original93/18, nio HTTP-svar, full cleanup. | `3aff40df4a93bd8a12a1c26921e82609377bc53127db2fe7ab8413d598f52799` |
| [Exakt apply](../../../work/pilot/results/phase5-38-read-performance-apply.json) | PASS/complete; en definition/journal, noll oavsiktliga diffar. | `16988ee015fa0c32d80fe78f6941fb77bfe575f1a6a356b41255f549803550c1` |
| [Full applied-final](../../../work/pilot/results/phase5-38-read-performance-final.json) | PASS/complete; färsk SQL143/46, original93/18, tolv HTTP-svar, API15/247, full cleanup. | `f0b4957345763ee0d37d3f9705434bbc4ca10a2a6bc8b09a134d4fe1261e938c` |
| [Dedikerad oförändrad API-final](../../../work/pilot/results/phase5-38-read-performance-api-final.json) | Alla15 fall och247 kontroller PASS, 28 entries, original15/audit/identiteter bevarade. | `ae65c816977116fa8bd9da8f8f87ca7644fc4e3f67395ffc34d88e876b1aaafe` |

Applied-final binder API-bilagan med **SHA256(JSON.stringify(apiFinal))**, vilket verifierats till `abee479fc198fed92a93bc22b8587f0d0f69207917ec29ddbae8332ffb1ff793`. Detta är avsiktligt annan representation än den formaterade råfilens hash ovan, ingen avvikelse.

Fulla katalogfingeravtryck:

- Före apply: `3392eac0c33f415a3b2cb04e414d20bf42001a231da1918134b1a97ef80a3ef3`.
- Efter apply/applied-baseline/slut: `106b3f26f9872ad6fcdc938fed70b104c3608f8cace966ed38a8f25cc101dbe7`.
- Båda verifieringskörningarnas före-/efterkatalog är exakt lika inom sin körning. Apply-baseline matchar fullrollback; apply-resultatet matchar applied-final.
- Historisk rows-definition: `11b720970b78486bb7a51f6d54c490ad1758da09c20b8d4aae9c3423d99a1b44`.
- Korrektivets faktiska `pg_get_functiondef`: `78eb6d6f3352af3a26c9596e2f3381059fed38cc87f2c927d18b305e09c03339`.

Oberoende jämförelse av rollback-baseline och applied-baseline visar exakt samma funktionsmängd/ägare/volatilitet/securityDefiner/config/rå ACL och samma tabell-/sekvens-/vy-ACL/RLS. Endast rows-definitionen skiljer. Hela gamla journalen består med en tillagd post `20261006122000 / phase5_planning_year_read_performance`, en statement med SHA256 `83c12579fc275b4353f014ea749ca2af297e4825d04bd0c26a9311d219ffc997`.

Apply:s före-/efteraudit och identitetshelrader är lika och föreankarna matchar fullrollbackens sista all-anchor-snapshot. Alla15 originalhelradshashar är lika inom rollback, apply, applied och API; apply/final-baslinjerna matchar också över kedjan. HTTP-fixturens cleanup bevarar originalaudit/originalidentiteter samt samtliga nytillkomna auditrader och auditerade identitetsankare. Ägda verksamhetsrader/sessioner/triggers återstår inte; foreign business/session-counts är noll och retained foreign-ankare valideras. Completion/cleanup är inte deferred i något accepterat fullbevis.

## Uppmätt före/efter

Tider i sekunder, avrundade till tre decimaler. Tre seriella actual Worker-svar per grupp, setup utanför mätningen.

| Fall | Gamla råtider | Nya råtider | Median före→efter | Förbättring |
| --- | --- | --- | --- | --- |
| Lista52/50 | 16,274;17,972;16,238 | 2,120;2,153;1,507 | 16,274→2,120 | 7,677× |
| Sök1/1 | 21,904;20,642;20,658 | 1,404;1,358;1,357 | 20,658→1,358 | 15,209× |
| Sida2,52/2 | 16,156;19,300;16,907 | 1,436;1,383;1,416 | 16,907→1,416 | 11,940× |
| Överblick52/52 | Ingen gammal jämförelse krävs | 1,790;1,560;1,461 | Ny median1,560 | Eftermål PASS |

Alla jämförbara medianer är minst3× snabbare och högst5s; alla tolv nya svar är under10s. Alla21 prover är faktisk HTTP200/PASS, no-store, komplett count/radmängd och helradsbevaring. Revisionerna är stabila inom respektive urval; sida2 använder samma fullmängdsrevision som sida1. Separata syntetiska fixturer före/efter har egna identiteter och därför olika revisionsvärden, vilket inte påstås vara en produktkontraktsändring.

Varje timinganrop har exakt fyra OK-auditrader: selection DB+Worker och list/overview DB+Worker, samma correlation/actor/membership/assignment/session/customer, collection-objekt och null objekt-ID. Dessa fält kontrollerades även oberoende från de sparade eventen. Alla prover har ägd DB-transaktion avslutad och sessionslås frigjort genom FOR UPDATE/ROLLBACK-barriär. Detta är DB-completionbevis, inget generellt bevis om transportdrain.

**Accepterad policy är `complete-http-baseline`.** `timings.policy` och `reusableExplicitNamedSqlComponents` är null i rollback och final. Inga censurerade svar, lower-bound-beräkningar eller återanvända SQL-delbevis har använts. Både gammal/ny fullmatris143/46 och original93/18 kördes färskt i båda omgångarna.

Testtransporten är öppet dokumenterad som `owned-local-http-connection-close`: endast coordinatorns tre egna sessioner och åtta allowlistade lokala fixturroutes, originalsetup15s/planning30s, oförändrade method/body/signal/epoch och acceptanskriterier. Originalfetch återställs före cleanup i finally. Detta är en kontrollerad lokal mätmiljö, ingen kausal förklaring till äldre transportfel eller generell svarstidsgaranti för produkt/browser/pilot.

## Källor, bygge och historik

Alla35 performancekällors **hela bytes lästes före eventuell SEARCH-integrering** och deras SHA256 matchade rollback/apply/final exakt; API-rapportens28 källor är samma verifierade delmängd. Noll avvikelser. Dessa bevis ska senare bindas historiskt till sina verifierade revisioner, inte omtolkas mot senare SEARCH-parserbytes.

- Rollback sourceCommit: `3d1ac4a263178719ce11719326a8707f96349ca1`.
- Applied-final sourceCommit: `86b13d683f6db37a522d770962c959a58c94f3ef`.
- Oförändrad API-runner sourceCommit: `adf9b7e48fc4704f1a0aad14744a9190d3288937`.
- Samma faktiska skyddade Worker-build i hela kedjan: `d59ec10f5b4469ce4e14e1e12a591aca2363a30b` på den ägda lokala3060-vägen. Runtime/source-grindarna i coordinator och återbrukad browser-target verifierar versionshanterade, byteidentiska runtimekällor; senare verktygs-/dokumentcommits kräver ingen påstådd produktombyggnad.

| Källpin | SHA256 |
| --- | --- |
| Immutable05-37 foundation | `e014d63bca3a1f71d41054216f97c1b02f6cdf93f2e45baff40fe7afd7c2aa71` |
| Immutable original93 SQL | `be8d975aa43a07fa6712c3b333709e8344ee50debf65f26200ce10649d80bd34` |
| Ny performance-SQL | `83c12579fc275b4353f014ea749ca2af297e4825d04bd0c26a9311d219ffc997` |
| Ny SQL-provkälla | `51f7a27b234678f04d6805614c7d0bd597a3e3cfec297d1109afbbd851969b62` |
| Coordinator | `60751ac7b7ea548b2c63901bb937df3e1072ba3e80a393cc646bf0cdfe2eafd1` |
| Coordinatorns rena prov | `4b60d6e07c69539cdbc66af1ebd9d414509fe91f546f38bda0edc81ba064e185` |
| Applyverktyg | `1175dfc526d6a56083f3778044d1ddbf00e65958e63beb99843809171220f099` |

[Failure-history](../../../work/pilot/results/phase5-38-read-performance-failure-history.json) och alla20 hashrefererade rapporter/diagnoser lästes; samtliga råfilshashar matchar historikens pins. Första fulla FAIL (`phase5-38-read-performance-rollback-fail-1791356837808.json`, SHA256 `3270c0082bd898081b20494a205676ce9812182a19f310ef33269d42946270d4`) är fortsatt FAIL/completefalse. Även senare HTTP-, expiry- och completion-FAIL består. Diagnoser/återhämtning med notFullPlanProof används inte som fullplanbevis. Äldre failure-history-status beskriver dåvarande pendingläge och behöver ett separat aktuellt metadataresultat av root; gamla rapporter eller deras utfall ska inte skrivas om.

## Krav, rester och nästa grind

| Krav | Avgränsat stöd | Full status |
| --- | --- | --- |
| PLANERING-02 | Årsprojektion/GR-/IM-/GY-underlag och okända/negativa fall har oförändrad faktisk SQL/API-paritet. | Pending; UI och samlat prov återstår. |
| PLANERING-03 | Serverurval/sök/sort/52 och50+2 har verifierad prestandarättning. | Pending; SEARCH-koder/metadata och tabell-UI har egna planer. |
| PLANERING-04 | Exakta versioner/skolor/frysta källor, okänd GR-map och hela originalrader består. | Pending; faktisk UI/spar-/klassverifiering återstår. |
| PLANERING-05 | Verklig lokal SQL/Worker/audit-/bevarandekedja verifierad för korrektivet. | Pending; dator/telefon, handbok och samlat releaseprov återstår. |

Ingen blockerande stub, positiv produktmock, förenklad matris, vidgad grant eller ändrad verksamhetsregel hittades i korrektivets fem artefakter. Rena testdoubles hör till negativa validatorprov; de ersätter inte de redovisade actual SQL-/HTTP-/API-bevisen.

Planen anger inget särskilt mänskligt prov för denna interna rättning. Mänsklig begriplighet/upplevd hastighet, UI05-39–43, SEARCH-korrektivets egen verifiering och verklig kommun-/pilotanslutning har separata återstående gränser. ADMIN-02/03/04, hela fas5, tidigare05-22 metadata PARTIAL, yrkes-/beslutsgrindar och användarens färdigmarkera/godkänna-gap avslutas inte här. Ordinarie3012 är inte uppdaterad av denna verifiering.

Root återstår att färdigställa SUMMARY/funktionsinventering/STATE/planstatus och versionshantera/pusha resultaten. **Det avgränsade performanceberoendet är verifierat; senare integrationer måste använda dess historiska källpins och egna färska bevis.**
