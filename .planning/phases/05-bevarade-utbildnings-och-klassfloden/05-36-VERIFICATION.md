---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "36"
verified: 2026-10-06T21:41:41Z
status: passed
scope: bounded-pure-model-and-read-contract
score: 3/3 must-haves verified
requirements_status: PLANERING-01–05 remain Pending
---

# 05-36 — Oberoende verifiering av läsårsmodell och läskontrakt

**Resultat:** PASS för den avgränsade rena modellen och kontrakten i 05-36. Detta är underlag för kommande datahämtning, inte ett verksamhets-PASS för läsårsplaneringen. Hela fas 5 och PLANERING-01–05 är fortsatt Pending.

Fasens övergripande mål är att behörig personal ska kunna fortsätta skolans planeringsarbete med riktiga medlemskap och beständiga klasskopplingar. Den här kontrollen avser endast 05-36:s förutsättning: rätt läsår, källstyrt årssnitt och kontrollerade läsresultat utan skrivning eller ändrad registerkontext. Ingen tidigare 05-36-VERIFICATION fanns.

## Målsanningar

| Sanning i plan 05-36 | Resultat | Aktuellt bevis |
| --- | --- | --- |
| Verifierad HT-start 2027/2026/2025 ger åk 1/2/3 i 2027/28 utan kullens fritext. | PASS | Modellens prov kontrollerar [0,1], [2,3], [4,5] och kalenderetiketter HT 2027/VT 2028. Fryst timplankälla används även när utbildningens senare startdatum och kulltext avviker. |
| Januari–junistart får rätt startläsår; saknat eller motsägande underlag förblir okänt. | PASS | 2027-01-15 ger 2026/27; aprilstart behåller det verkliga datumet och flaggar befintlig fördelning före start. Stockholmgränsen 30 juni 21:59:59Z/22:00:00Z samt vintermidnatt verifierades. Saknad/legacy/motsägande källa ger diagnos och null relativår. |
| Årets poäng och timmar binds till exakt källa/skola/version, med skilda mått utan dubbelräknade alternativ. | PASS inom läskontraktets gräns | Två skolor med samma programversion räknar poängramen en gång, respektive skolas timmar separat och klassantal för sig. Hela levererade radinventarier kontrolleras mellan referenser. Alternativens medlemsöverlapp, motsägande GR-kartor, null/0, ofullständig fördelning och fel urvals-/revisionssvar prövades. |

**Poäng:** 3/3 målsanningar inom 05-36:s omfattning.

## Artefakter och kopplingar

| Artefakt | Verifierat innehåll och koppling |
| --- | --- |
| `web/lib/planning-year-model.ts` | 126 rader med rena exporter för datum/läsår och GY/GR/IM. Importerar och använder befintliga `isValidDate`, `currentSchoolYear` och `schoolYearRange`; ingen gemensam urvalsstate. Typkopplingen till `GymTimplan.source` används av den frysta källprojektionen. |
| `web/lib/planning-year-contract.ts` | 362 rader med strikta setup-, urvals-, list- och årsöverblicksparsers. Anropar modellen och befintlig `gymRowKey`; GR:s aktiva grupp-/ämnesrader följer befintlig `nationalTimplan`. Poäng, årliga ramtimmar, planerad IM-veckoram och klassantal hålls isär. |
| `web/lib/planning-year-model.test.mjs` | 9 passerade beteendeprov med oberoende förväntade datum/index. |
| `web/lib/planning-year-contract.test.mjs` | 20 passerade beteendeprov, inklusive 50 000 klassreferenser vid tillåten gräns och nekad större mängd. |

Artefakterna finns, är implementerade och anropas av kontraktsmodulen respektive sina beteendeprov. De är avsiktligen ännu inte inkopplade i någon produktionsvy, skyddad API-route eller SQL-funktion. Dessa kopplingar levereras först i efterföljande planer; de ingår inte i 05-36:s uppnådda mål.

## Aktuella kontroller

Verifieraren körde själv följande från `web/` med Node 25.9:

```sh
/opt/homebrew/opt/node@25/bin/node --test \
  lib/planning-year-model.test.mjs lib/planning-year-contract.test.mjs \
  lib/pupil-register-model.test.mjs lib/cohort-model.test.mjs lib/gym-timplan.test.mjs
```

**70/70 PASS**, inga skips eller failures: 9 nya modellprov, 20 nya kontraktsprov och 41 befintliga register-/kull-/gymtimplansprov.

Dessutom kördes **20/20 oberoende verifierarprober PASS** med en separat tillfällig Node-testfil, `/private/tmp/skolplattform-05-36-independent-verifier.mjs`. Proberna använder andra datum, kolumnordningar, timmar och klassantal än implementationens huvudfixturer. De är separat granskningsbevis och ingår inte i repots 70 prov:

- Stockholm vintermidnatt och juliövergång; aprilstart 2028-04-15 i läsår 2027/28 med oförändrade sex terminsindex.
- Saknad, motsägande och legacy startkälla utan fritextfallback.
- Två skolor: 100 gemensamma årspoäng, 30 + 60 egna årstimmar och tre unika klasser.
- Explicit noll jämfört med null; ofördelade poäng gör även årstimmarna ofullständiga.
- Nekat olika originalradinventarium för samma programkälla, alternativa medlemspermutationer och separat medlemsrad som dubbelräknar alternativet.
- Verifierad GR-originalordning [ak9,ak7,ak8]: åk 8 använder index 2; två olika åk-kolumner räknar 70 + 60 timmar med en unik klass.
- Nekade motsägande kartor för samma GR-planversion; okänd karta behåller bindning men ger null årstimmar.
- Saknat klass-ID behåller verifierad årsbindning men ger null komplett klassantal.
- NO/SO-medlemsrader i högre årskurs och blockrader i lågstadiet; inaktiva positiva celler räknas inte dubbelt och ger ofullständigt mått. Okänd rad bevaras med diagnos.
- Bytt senare-sidas revisionsfingeravtryck nekas; getter på svarsraden nekas utan att exekveras.
- IM:s planerade veckoram behåller undervisningsrad och praktik som 4 + 3 veckotimmar utan automatisk årsomräkning; tomt gymurval ger verklig nollsumma.

Orkestreraren rapporterade dessutom aktuellt PASS för `npx tsc --noEmit` och `npx oxlint lib`. Verifieraren har inte räknat dessa som ytterligare beteendeprov.

## Fynd under granskningen och rättningar

Granskningen började med reproducerade luckor, som rättades före den sista omkörningen:

1. Ofördelade gympoäng kunde lämna årstimmarna markerade kompletta. De gör nu båda måtten ofullständiga, med `missing-points` och `missing-hours`.
2. Samma plan/källversion kunde bära olika radinventarier eller olika verifierade originalkartor. Referenser kontrollerar nu hela levererade inventariet, källans poängfördelning och skolplanens timmar/karta.
3. Alternativrader i omvänd medlemsordning eller tillsammans med en separat medlemsrad kunde dubbelräknas. Överlapp inom samma programdel nekas nu.
4. Olöst legacyklass-ID kunde inte representeras utan att årsbindningen förlorades. Bindningen får nu finnas med namngiven klasslucka och ofullständigt klassmått.
5. GR:s inaktiva NO/SO-block-/medlemsceller kunde dubbelräknas. De aktiva raderna summeras nu separat; inaktiva positiva värden och okända rader ger kontrollpunkt och ofullständiga timmar.

Inga blockerande fynd kvarstår inom den avgränsade planen efter rättningarna. Inga TODO-/placeholder-/loggimplementationer hittades i de två nya modulerna.

## Bindande integrationsgräns och kravstatus

`complete` betyder att det levererade kanoniska ramunderlaget är känt. Parsers kan kontrollera form, inbördes referenskonsistens och summeringar, men autenticerar inte verkliga mandat, databasidentiteter eller inventariets fullständighet mot originalet. Två skolor kan exempelvis få samma trunkerade inventarium utan att jämförelsen ensam upptäcker utelämnade rader.

Producenten i 05-37 måste därför läsa inom dagens verkliga kund-/skolmandat, lösa faktiska plan-/käll-ID och klassidentiteter och leverera hela det kontrollerade frysta radinventariet. Saknade förväntade rader/celler ska finnas som null och diagnos; de får inte filtreras bort för att ge en komplett summa. GR:s originalkolumnkarta måste ha verifierad proveniens; nuvarande utbildningsordning är inte bevis. Ett påstått `verified-original` i godtycklig indata är inte någon självständig verifiering av databasen.

IM:s mått är **planerad veckoram inklusive annan aktivitet**, exempelvis praktik/mentor. Det är inte bevis på undervisningstid eller uppfyllt minimum. Årsramar är inte personalbehov, genomförd tid, kalender eller en enskild elevs utbildning. Ingen rättslig regelprofil byggs eller godkänns i denna plan.

| Krav | Status efter 05-36 |
| --- | --- |
| PLANERING-01 | Pending. Delade datumregler finns; session-/uppdragsstate, URL/retur och separat registerurval återstår. |
| PLANERING-02 | Pending. Rena källprojektioner och diagnoser verifierade; riktiga scoped läsresultat och verksamhetsvyer återstår. |
| PLANERING-03 | Pending. Kontrollerade filter, sidstorlek, svars-eko, fingeravtryck och payloadgränser finns; verklig serversökning/sortering/count återstår. |
| PLANERING-04 | Pending. Modellens index, originalkartor, dedupnycklar och mått verifierade; skyddade läs-/skrivflöden och UI-bevarande återstår. |
| PLANERING-05 | Pending. Ingen SQL-/Worker-/dator-/telefonverifiering eller framtida modulverifiering utfördes för läsårsplaneringen. |

Ingen mänsklig UI-verifiering krävs för denna rena modellleverans. Mänsklig begriplighet och produktens dator-/telefonflöden prövas när de senare vyerna finns. Ingen databas, server, browser, app-/handboksbyggnad eller ordinarie förhandsvisning ändrades av verifieraren. Orelaterade arbetskopieändringar lämnades orörda; verifieraren gjorde ingen commit.

_Verifierad 2026-10-06 av oberoende Codex-verifierare enligt GSD-verifier._
