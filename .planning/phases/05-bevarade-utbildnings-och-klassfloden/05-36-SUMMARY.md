---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "36"
subsystem: planning-year
status: complete
completed: 2026-10-06
requirements-addressed: [PLANERING-01, PLANERING-02, PLANERING-03, PLANERING-04]
requirements-finally-verified: []
key-files:
  created: [web/lib/planning-year-model.ts, web/lib/planning-year-model.test.mjs, web/lib/planning-year-contract.ts, web/lib/planning-year-contract.test.mjs]
commits: [1a940b3, 7cd309d]
plan_head_before: bced7b224d700c196122bb802d5729004a39589d
---

# 05-36 — Läsårsmodell och kontrollerade läskontrakt

**Status:** ren modell och strikta läskontrakt genomförda och verifierade mot syntetiska underlag. 70 riktade Node-prov, typkontroll och lint PASS. Inga nya SQL-/API-/UI-vägar är införda. Nästa plan är 05-37. PLANERING-01–05, full fas 5 och pilotens återstående krav är fortsatt Pending.

## Levererat

- `planning-year-model.ts` delar registermodellens datumvalidering, läsårsintervall och 1 juli-regel, men har inga register-/planeringsval eller skrivvägar. Årsramen är 2000–2100, inklusive etiketten 2100/01. Servertidsstämplar kräver uttrycklig tidszon och omvandlas till Europe/Stockholm.
- Gymnasiets källstyrda projektion tar den öppnade programversionens startunderlag eller gymtimplanens frysta `source.startedOn`. 2027/28 ger HT-start 2027→åk1/index0–1, 2026→åk2/index2–3 och 2025→åk3/index4–5. Alla sex terminer behåller sina ursprungliga index och kalenderetiketter. Fritextkull och dagens förändrade utbildningsdatum används inte.
- 2027-01-15 hör till startläsår 2026/27. Januari/april behåller faktisk startdag; berörd fördelning före starten ger `allocation-before-start` och granskningsindex, utan att flytta värden. Null, ogiltig/tvetydig start eller obestyrkt legacy-år ger namngiven diagnos och null årssnitt. Verifierat akademiskt år får användas endast med uttrycklig proveniens. Future/finished har null relativår; ingen automatisk treårsprojektion för IM.
- GR utgår från bindningens tillämpningsläsår och `akN`, inte klassens namn/startår. Positioner är kända bara när plan-ID/version matchar en verifierad ursprunglig ordnad kolumnkarta (`frozen-plan`/`verified-original`). Explicit okänd karta behåller bindning och årskurs men ger null index/timmar och `canTargetYearCell:false`. Dagens `[8,7,9]` bevisar inte den gamla `[7,8,9]`-matrisen.
- Setup innehåller kund, serverdatum/aktuellt läsår, dokumenterad årsram och dagens skolor/läsförmågor. Inget `school_years`-, elevregister- eller kalenderberoende finns. Listurvalet har begränsad sökning, skolform, status, kullrelation, arkiv, årskurs, sortering/riktning, sida och resultatfingeravtryck. `relevant` omfattar nya, fortsättande och okända kullar; framtida/avslutade är uttryckliga filter.
- Sidan har 50 rader. Sida2+ kräver samma SHA-256-resultatrevision, och svaret ska exakt eka hela urvalet. Överblicken gäller hela sitt urval, sida1, högst 10 000 rader. Varje svar begränsas till 50 000 celler och 50 000 klassreferenser, med högst 2 000 celler/1 000 klassreferenser per rad. Extra/ärvda/dolda fält, accessorer, symboler, glesa arrayer, fel typ, dubbletter och fel käll-/klass-/skolreferenser nekas.
- Poäng räknas unikt per programplan-ID/version + årsindex + kanonisk rad. Timmar räknas per skolans timplan-ID/version + skola + årsindex/kolumn + rad. Samma källas hela poänginventarium måste vara konsekvent mellan skolorna; en timversion måste ha samma kolumnkarta och cellinventarium i alla sina rader. Alternativens medlemsnivåer får inte överlappa varandra eller en separat fast rad inom samma programdel.
- Måtten har `value`, `known` och `complete`. Sparad 0 är komplett 0; tom cell ger null slutvärde och bara en uttrycklig känd delsumma. Ofullständiga poäng gör även årstimmarna ofullständiga. GR:s NO/SO använder befintlig matrissemantik: grupp i åk1–3, medlemsämnen i åk4–9. Inaktiva positiva timmar och okända rader bevaras i underlaget, räknas inte i ramen och ger en namngiven lucka.
- Klass-ID:n måste matcha kund/skola/utbildning. Flera klasser multiplicerar inte ramens timmar. En belagd årsbindning med olöst legacy-identitet får behålla verklig planversion/årskolumn, tom ID-lista och `missing-class`/`ambiguous-class`; klassantalet är då null med separat känt antal. Prognos märks per rad och med `hasForecast` i totalsvaret.
- GR/gym använder årsramar; IM använder **planerad veckoram**, inklusive annan aktivitet som praktik/mentor. Veckoramen är inte styrkt undervisningstid eller prövning av IM:s minimiregel; den befintliga separata analysprofilen används till detta. Inga timmar konverteras till års-, minut- eller personaltid.

## Faktisk TDD och verifiering

Detaljerade faktiska räknare, falsifierade provnamn och slutkällornas SHA-256 finns i [05-36-TEST-EVIDENCE.json](05-36-TEST-EVIDENCE.json). Första modulladdningen misslyckades när respektive fil ännu saknades; detta räknas inte som enskilda beteendeprov. Därefter kördes exporterade RED-stommar före implementation.

| Körning | Faktiskt resultat |
| --- | --- |
| Modellstomme: datum/Stockholm, tre kullar, januari/april, legacy/källkonflikt, fryst timplan, GR bindning/originalkarta, IM | 9 prov, 0 PASS / 9 FAIL |
| Modellens kompletterande gränsprov: `24:00:00` och `0001-01-01` | 9 prov, 7 PASS / 2 FAIL före rättning |
| Modell + befintligt register/kull/gym | 50/50 PASS efter rättning |
| Kontraktsstomme | 13 prov, 2 negativa PASS / 11 FAIL; de två PASS betydde enbart att stommen nekade allt |
| Inkompletta poäng/timmar | 13 prov, 12 PASS / 1 FAIL före rättning |
| Motsägande inventarium/karta och tomt gymurval | 15 prov, 13 PASS / 2 FAIL före rättning |
| GR kanoniska rader, olöst klass-ID/klassantal och överlappande alternativ; ändrad klassmåttsform | 18 prov, 10 PASS / 8 FAIL före rättning |
| Samlat `relevant`-filter | 19 prov, 18 PASS / 1 FAIL före implementation |
| Slutlig modell/kontrakt/register/kull/gym | **70/70 PASS**, 0 skips: modell 9, kontrakt 20, befintliga 41 |
| `npx tsc --noEmit` i web/, Node 25.9 | PASS |
| `npx oxlint lib` i web/ | PASS; tidigare sparse/control-regex/unbound-method/string-spread-fynd rättade och bevarade i evidensen |

Slutkommandot är `node --test lib/planning-year-model.test.mjs lib/planning-year-contract.test.mjs lib/pupil-register-model.test.mjs lib/cohort-model.test.mjs lib/gym-timplan.test.mjs`. Två-skolfallet har oberoende förväntat 100 poäng, 180 timmar och 4 klasser; samma GR-plan/åk8+9 ger 230 timmar och 1 unikt klass-ID. Kontrakten jämför de levererade totalsvaren med en egen deduplicerad beräkning. [Oberoende GSD-verifiering](05-36-VERIFICATION.md) redovisar upptäckta luckor, rättningar och leveransgräns.

## Producentkrav till 05-37/38

**Bindande gräns för kommande SQL:** parserns `complete` anger att alla levererade kanoniska ramceller är kända. Klientbiblioteket kan inte bevisa att en server har levererat hela den verkliga ursprungsramen, autenticera en godtycklig UUID eller fastställa ett mandat. 05-37 ska läsa och kontrollera hela den verkliga frysta radinventeringen, exakt program-/timversion, dagens scope och verkliga årsbindningar. Saknade förväntade rader ska finnas som null/namngiven lucka, aldrig filtreras bort för att få en komplett summa. Två skolor med samma identiskt trunkerade källa är ingen styrkt hel ram. Detta ska falsifieras i faktisk SQL/paritet innan Workergrants öppnas i 05-38.

Grundskolans gamla originalkolumnkarta har ännu inte blivit bevisad/backfillad; okänd representation är levererad. Resolvern ska kontrollera klassidentitet i databasen, utan att exportera namnnycklar eller ändra gamla bindningar. Ofullständig/olöst identitet får inte bli ett verifierat nollantal. Regelprövning, kalenderstatus och full nationell/individuell garantikontroll hör till sina egna steg.

## Avvikelser och nästa steg

Granskningen gav nödvändiga preciseringar av ofullständig summering, konsekvent inventarium, NO/SO, alternativöverlapp och okänt klassantal inom denna rena kontraktsleverans. Inga nya bibliotek, databasmigrationer, verksamhetsändringar eller skrivbehörigheter infördes. App-/handboksbygge och browserprov behövdes inte; inget användarbeteende ändrades och 3012 berördes inte. Historiska E-resultat är separat tidigare bevis.

Commit 1a940b3 genomför uppgift 1; 7cd309d genomför uppgift 2 och granskningens modellförtydliganden. Plan- och statusdokument versionshanteras separat. Nästa plan är **05-37 — stängd SQL-läsgrund**, därefter 05-38:s verkliga Workerprov. Beslutsgapet rektor→huvudman, mobilknapparna i 05-41, yrkesram 05-17, äldre omplanering och fas 4-checkpoint kvarstår.
