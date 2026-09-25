---
title: Mandat och avgränsad åtkomst
---

Ett mandat är ett uppdrag med en bestämd räckvidd och en bestämd giltighetstid. Servern prövar mandatet vid varje åtgärd: vem du är, vilket uppdrag du arbetar i, vilket objekt du försöker nå och vilka uppgifter du begär.

**Status:** Byggt. Reglerna finns i databasen och serverlagret och är prövade med syntetiska uppgifter; hela användarflödet på dator och telefon är ännu inte färdigverifierat. Inga verkliga elevuppgifter förekommer.

## Mandatarbetsytan

Rektor och motsvarande funktioner ser sina tilldelade mandat i arbetsytan **Mandat**. *Hämta aktuellt läge* läser om listan från servern. Varje rad kan avslutas med *Avsluta uppdrag för …*, vilket kräver en bekräftelse. Ett avslutat uppdrag upphör att gälla vid nästa anrop.

## Vem får delegera till vem

Mandat delas ut i linjen. Den som delegerar måste själv ha ett giltigt mandat, och mottagaren måste vara en annan person med aktivt medlemskap.

| Delegerar | Kan ge |
|---|---|
| Huvudman | Rektor |
| Rektor | Lärare, administratör, elevhälsa, tidsbegränsad support |
| Elevhälsoansvarig | Elevhälsa |
| Kundadministration | Kundadministration, granskning |

Ett delegerat mandat kan aldrig bli vidare än den som gav det:

- skolenheterna måste rymmas inom givarens skolenheter,
- giltighetstiden måste rymmas inom givarens giltighetstid,
- verksamhetsmandat måste ha minst en skolenhet.

## Räckvidd

Räckvidden avgör vilka objekt mandatet når.

| Räckvidd | Innebörd |
|---|---|
| Skola | Hela skolenheten |
| Grupp | Angivna undervisnings- eller mentorsgrupper |
| Elev | Namngivna elever |
| Ärende | Ett angivet ärende för en angiven elev |

**Lärare** har alltid gruppräckvidd och når elever genom sina undervisnings- eller mentorsgrupper. **Elevhälsa** kan ges skol-, elev- eller ärenderäckvidd, så att insatsen kan avgränsas till just de elever eller ärenden den gäller. Övriga verksamhetsfunktioner har skolräckvidd.

## Tidsbegränsad support

Supportmandat är avsiktligt smalt och kan bara ges av rektor. Det gäller

- en skolenhet och en namngiven elev,
- med angiven start- och sluttid,
- i högst en timme,
- med angivet ändamål,
- godkänt av den rektor som gav det.

När sluttiden passerats nekas nästa anrop. Support är ingen stående åtkomst.

## IT-administration

IT-funktionen ser arbetsytan **Lokal anslutning** i stället för Mandat. Där kan anslutningen aktiveras, pausas och prövas med ett syntetiskt test. IT-funktionen ger ingen elevinsyn: den når bara anslutningens läge, aldrig elevuppgifter.

## Minsta nödvändiga uppgifter

Servern lämnar bara ut de fält åtgärden faktiskt kräver, och bara om de begärts uttryckligen. En elevläsning ger identitet, visningsnamn, skolenhet och grupptillhörighet — inte hela elevbilden. Begärs ett fält utanför det tillåtna nekas hela anropet i stället för att svaret tystas ned.

## När åtkomst nekas

Nekanden är avsiktligt lika oavsett orsak, så att svaret inte avslöjar om ett objekt finns. Ett känt objekt-ID från en annan kund ger samma svar som ett obefintligt. Vanliga skäl är att uppdraget inte gäller idag, att objektet ligger utanför räckvidden, att åtgärden inte ingår i funktionen eller att delegeringskedjan brutits. Se [Regler i systemet](regler.md) för hela listan.

## Elevhälsans medicinska journaler

Medicinska journaler inom elevhälsan ingår inte i plattformen och omfattas inte av mandaten ovan. De har eget huvudmannaskap, egen sekretess och egna krav, och rektorsuppdraget öppnar dem inte.
