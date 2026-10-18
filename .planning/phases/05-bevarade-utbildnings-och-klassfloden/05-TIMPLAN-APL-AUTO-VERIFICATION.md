---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TIMPLAN-APL-AUTO
status: delivered-awaiting-user
verified: 2026-10-18
---

# APL i autofördelningen – verifiering

[Plan](05-TIMPLAN-APL-AUTO-PLAN.md), [beteende och modellgränser](05-TIMPLAN-APL-AUTO-SUMMARY.md) och [UI-/handboksresultat](05-TIMPLAN-APL-AUTO-UI-SUMMARY.md) hör ihop. Detta är ett avgränsat delbevis inom fas 5/ADMIN-02; klassrelationer inom ADMIN-04 ändras inte. Historiska 88/100 planer och 3/8 faser består.

## Verifierat

- 45 modell-/server-/kontraktsprov PASS: exakt timsumma, minst 345 APL-timmar inom GUT-totalen, urval, årsvikter, minutavrundning, befintlig APL och skolnollor, kapacitet, nollrader, legacy och revisionsbindning.
- 53 prov av leveransverktyg och relaterade skydd PASS.
- 22 nya UI-prov med simulerat API och 24 oförändrade skolautofördelningsprov PASS. Efter sista mobilrättningen ytterligare två riktade dator-/telefonprov PASS; sju slutbilder granskade. Sidscroll är begränsad till ämnestabellen och sparknappen ryms.
- Typkontroll, full app/lib-lint, separat skyddat bygge och handboksbygge PASS.
- Faktisk byggd Worker, PostgreSQL och lokal OIDC: **17/17 PASS**, utan retries. Sex browserkontroller på dator/telefon visar förslag, sparning, omladdning och inskick utan APL-perioder. Elva API-kontroller täcker felaktiga val, högskoleförberedande program, bevarad tid, GUT-/beslutsgrind, otillåtna roller/kontext, mandat, MFA, atomisk återställning vid rad-/auditfel och samtidighet med exakt en 200 och en 409.
- Alla sex faktiska browserbilder är granskade och hashkontrollerade. OIDC-, runtime- och snapshotstädning är complete. Egna syntetiska data i schema-only-testdatabas; inga aktiva verksamhetsrader kopierades.

Första faktiska körningen stoppade efter korrekt sparning på en gammal spartext i det nya testet. Den är fortsatt FAIL, bevarad och fullständigt städad. Aktuell V2-text infördes i testet och hela nästa körning passerar. Inga produktgrindar eller äldre testförväntningar försvagades.

## Exakt kandidat

Produktrevision `29b870fd2e7d5049254ae5fe43999194f883ef52`, 213 filer. Artefakt SHA-256 `8b0b83b6401333cd234b6d7787bdfd23f363c7fc2385c144a370aa462f6a8387`.

Schemafingeravtryck före/efter faktisk provning: `1ae3b9682cb04cf0d711712f7059d93561ec60f78e9bca28d0aa3222bdc7f04d`. Inga migrationer ingår i förändringen.

Privat actualbevis: `/private/tmp/timplan-apl-auto-actual02.json`, SHA-256 `43661054ceeac8afb5d2849529c3d5fde7d6c19bdd1ac4102492d8cf54184d70`. Bevis med operativa identifierare och bilder checkas inte in.

## Lokal leverans

3012 kör exakt kandidaten ovan efter byte från `bc1378e`. Förkontroll och appöverföring PASS; riktig läsande OIDC efter bytet PASS. Innehållsjämförelse för samtliga 76 verksamhetstabeller PASS och databasschemat är oförändrat. Inga migrationer eller verksamhetsskrivningar utfördes. Aktivt bygge byggdes inte om på plats.

Privata bevis:

| Fil utan ändelse i `/private/tmp/` | SHA-256 |
| --- | --- |
| timplan-apl-auto-preflight | a09fc15b2bc70bfb9eb33cc209291c7b873099352d2a7b24d95388787f5197ee |
| timplan-apl-auto-delivered | 8c9d5864582a3f3a20577a4303fed68d7e06302c08722bebdaa26626e58dca98 |

Senaste runtimebevisets format är `code-local-delivery`, paket `timplan-apl-auto`. Vid nästa appöverföring behöver verktyget uttryckligen kunna verifiera detta tidigare-bevisformat och samma faktiska process/artefakt; ett äldre leveransbevis får inte återanvändas som om det gällde den nya processen.

## Gränser

Timförslaget är ett granskningsbart startunderlag. Det bedömer inte centralt innehåll eller arbetsplatsens lämplighet och skapar inga perioder eller datum. 345 timmar är befintlig planeringsram för skolförlagda yrkesprogram, inte ett intyg om APL-genomförande eller lärlingsomfattning. Okända/ej stödda profiler får inget automatiskt tillräcklighetsbesked. Äldre timmodeller kräver uttrycklig övergång för nya års-APL-förslag.

SS 12000:2024 utgåva 4/OpenAPI 2.1.0: intern budget, inga nya Attendance/Placement-objekt eller verifierat externt informationsutbyte. Identifierare och käll-/versionsansvar bevaras. Full fas-/pilotacceptans och ny mänsklig bedömning av begripligheten återstår.
