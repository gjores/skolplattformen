---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TIMPLAN-HOURS-CHECK
status: delivered-awaiting-user
verified: 2026-10-18
---

# Timkrav redan i tabellen – verifierad lokal leverans

Användarens komplettering är implementerad och levererad på3012. **Räcker timmarna?** visar planerat, miniminivå och saknade timmar för GUT och yrkes-APL. Utkast kan sparas under gränsen. Server och SQL stoppar inskickning/godkännande när års-APL understiger20700minuter, även om totalen räcker. Befintlig GUT-spärr består. Perioder krävs fortfarande först i senare APL-process.

## Regel- och modellgräns

Minst15APL-veckor och23GUT-timmar per vecka ger planeringsramen345h för nationella yrkesprogram. [Skolverkets APL-regler](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/arbetsplatsforlagt-larande-apl-och-larlingsutbildning) kontrollerade2026-10-18; [GUT-regler](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/undervisningstid-larotider-och-schema) ligger bakom befintliga programprofiler. Detta visar tillräcklig budget, inte fullgjorda veckor, lärlingsomfattning eller individuell rättighet. Inga fasta ämnes-/årskursminima införs. Okända eller ej stödda ramar får inget positivt kontrollbesked.

Högskoleförberedande program saknar APL-kontroll. Äldre yrkestimplaner behöver uttrycklig övergång till separat års-APL före nytt beslut. Historiska beslut och frysta kvitton ändras inte. Beslutshashens regelmarkör ändras för nya timplansbeslut, så en förhandsvy från tidigare regler inte kan återanvändas för ett nytt beslut. Programplanens godkännanderegler är oförändrade.

SS12000:2024 utgåva4/OpenAPI2.1.0 behandlas enligt [planens avstämning](05-TIMPLAN-HOURS-CHECK-PLAN.md): interna budgetminima, inga nya externa objekt eller relationer. Identifierare, skolmandat, käll-/versionsansvar och klasskopplingar bevaras. Ingen faktisk standardanslutning verifieras här.

## Kontroller

- Modell/budget/autofördelning:21 Node-prov PASS, `/private/tmp/timplan-hours-node.log`.
- Beslutsserver:28 PASS, inklusive oberoende minimitid och historiskt replay.
- Skyddade installations-/leveransverktyg:4 PASS.
- Typkontroll, full app/lib-lint, separat skyddat bygge och handboksbygge PASS.
- UI med syntetiska API-svar:14 PASS, dator/telefon, sex bilder granskade. Se [UI-resultatet](05-TIMPLAN-HOURS-CHECK-SUMMARY.md).
- Egen schema-only PostgreSQL:17 PASS. Gränser0/20699/20700/20701min, sparbart underskott, submit/approve, redan inskickad otillräcklig ram, V1-övergång, SA utanAPL, Workerroll, historiska kvitton, full återställning och observerad samtidig minskning/inskickning.
- Byggd Worker med riktig lokal OIDC och egen syntetisk databas:18 PASS, nio vardera på dator/telefon, inga retries. Två nya HTTP-negativer per enhet och hela tidigare beslut→senareAPL-flödet. Alla åtta bilder granskade. OIDC-, runtime- och snapshotstädning complete.

Tidiga SQL-provkörningar stoppade på fel i nya syntetiska fixtures (aktörsmappning, arrayöverföring och fel antagande om SA:s tidsmodell). SQL03/actual01 stoppade på PostgreSQL-debuggerfelet `pldbgapi2` före den nya migrationen. Körningarna bevarades och städades; slutliga seriella SQL06/actual02 passerar. Ingen global debuggerinställning ändrades och ingen produktspärr försvagades.

## Installerat

Endast `20261018120000_timplan_minimum_apl_budget.sql` installerad. Den ersätter beslutsfunktionen; inga tabeller eller verksamhetsrader förändras. Exakta struktur-/ACL-kontroller och innehållsjämförelse för79originaltabeller PASS.

3012 kör exakt testad **bc1378ebb71f4d136027e13043e2262505de1f89**,213filer, artefaktSHA256 `6f027a8c46b0f95ea89a302b549137606c8f27a0a4805771446932bac383b7a2`. Databasfingeravtryck `1ae3b9682cb04cf0d711712f7059d93561ec60f78e9bca28d0aa3222bdc7f04d`. Läsande verklig OIDC efter appbyte PASS och76verksamhetstabeller bevarade. Aktivt bygge byggdes aldrig om på plats.

Privata bevis ligger i `/private/tmp/` och checkas inte in:

| Bevisfil utan ändelse | SHA-256 |
| --- | --- |
| timplan-apl-minimum-sql06 | 1a459b9a7b9fd90cb3ca52b2c3b7393827a6a7c1066e64f7cc4c25db3d21eef0 |
| timplan-minimum-actual02 | 1710970e36cd2f4a96e9912830700a6317c4e8d5e9389834be8261c660b5ce7b |
| timplan-minimum-installed | f0dbf01b56fb939f0d2059a4929ca9be4a15105c8e086b09f445ed848ee91d3f |
| timplan-minimum-delivered | a6d12ba7019162fdde38c7a9b64d8532315c742a2760cf6ff4a59c6d79a7ea45 |

Produkten committades i112781c/bc1378e; verktyg och prov i34d835d/19e2aff/853ab29. Leveransverktyg för en framtida uppdatering behöver uttryckligen stödja det nya tidigare-bevisformatet `timplan-minimum-local-delivery`; denna leverans använder tidigare `planning-flow-local-delivery` utan att ändra dess källor.

## Återstående bedömning

Användaren kan ladda om3012 och kontrollera tydligheten. Telefonens gemensamma planeringshuvud är fortsatt högt och timtabellen kan behöva sidscroll. Inget nytt mänskligt begriplighetsgodkännande är antaget. Fulla fas-/pilotkrav och historiska88/100planer samt3/8faser består.
