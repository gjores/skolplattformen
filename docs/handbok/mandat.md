---
title: Mandat och avgränsad åtkomst
---

Ett mandat är ett uppdrag med en bestämd räckvidd och en bestämd giltighetstid. Servern prövar mandatet vid varje åtgärd: vem du är, vilket uppdrag du arbetar i, vilket objekt du försöker nå och vilka uppgifter du begär.

**Status:** Verifierat. Flödena på den här sidan är prövade på dator och i telefonläge i den lokala provmiljön med syntetiska uppgifter och granskade i september 2026, inklusive verifiering inifrån dialogerna och support för grupper. Inga verkliga elevuppgifter förekommer, och ingen verklig kommun är ansluten.

## Mandatarbetsytan

Huvudman, rektor och elevhälsoansvarig öppnar arbetsytan **Mandat**. Den listar de giltiga och kommande uppdrag du själv har tilldelat genom ditt aktuella mandat. Varje kort visar mottagare, funktion, omfattning med skolenhet, giltighet och status. För tidsbegränsad support visas också syfte och godkännare.

*Hämta aktuellt läge* läser om listan från servern. Uppdrag som har löpt ut eller avslutats visas inte i listan.

## Tilldela ett uppdrag

1. Välj *Tilldela uppdrag*. Dialogen hämtar det urval ditt eget mandat tillåter: funktioner, mottagare, skolenheter, grupper, elever och ärenden. Du kan inte välja något utanför ditt mandat, och du finns inte själv bland mottagarna.
2. Välj **Uppdrag** och **Mottagare**.
3. Välj **Omfattning** och markera skolor, grupper, elever eller ärenden. Omfattningen går bara att ändra när funktionen har flera möjliga räckvidder, till exempel elevhälsa.
4. Ange giltighet. Uppdraget kan inte gälla längre än ditt eget mandat.
5. Välj *Tilldela uppdraget*. Arbetsytan bekräftar *Uppdraget har tilldelats …* och kortet visas i listan.

Tilldelning kräver ett bevis på verifiering med engångskod. Har du angett engångskoden vid inloggningen de senaste åtta timmarna görs tilldelningen direkt. Annars visar dialogen *Tilldelning kräver verifiering med engångskod.* tillsammans med knappen *Verifiera med engångskod*. Knappen finns i dialogen och nås med Tab eller genom att trycka på den. Verifieringen tar dig till inloggningen och sedan tillbaka till Mandat. Formuläret fylls inte i igen, så gör om tilldelningen.

Saknas ett val markeras fältet och felet står vid fältet, till exempel *Välj mottagare.* eller *Välj minst en grupp.* Det du redan har fyllt i finns kvar när servern avvisar en tilldelning. Dialogen kan skötas helt med tangentbordet: fokus flyttas in i dialogen när den öppnas, Tab stannar i dialogen och Esc stänger den utan att något sparas.

## Avsluta ett uppdrag

Välj *Avsluta uppdrag för …* på kortet. Bekräftelsen namnger personen, funktionen och skolenheten och säger att uppdrag som bygger på mandatet också upphör. Välj *Ja, avsluta uppdraget*. Avslutet gäller direkt vid nästa anrop, även i sessioner som redan är öppna.

Avslut kräver verifiering med engångskod, precis som tilldelning. Saknas beviset visas *Att avsluta uppdrag kräver verifiering med engångskod.* och knappen *Verifiera med engångskod* i bekräftelsedialogen. Efter verifieringen finns uppdraget kvar tills du avslutar det igen.

## Vem får delegera till vem

Mandat delas ut i linjen. Den som delegerar måste själv ha ett giltigt mandat, och mottagaren måste vara en annan person med aktivt medlemskap.

| Delegerar | Kan ge |
|---|---|
| Huvudman | Rektor, för en eller flera av huvudmannens skolenheter |
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

**Lärare** har alltid gruppräckvidd och når elever genom sina undervisnings- eller mentorsgrupper. **Elevhälsa** kan ges skol-, elev- eller ärenderäckvidd, så att insatsen kan avgränsas till just de elever eller ärenden den gäller. **Tidsbegränsad support** ges antingen för en namngiven elev eller för en eller flera grupper på en skola. Övriga verksamhetsfunktioner har skolräckvidd.

## Syntetiskt elevprov

Arbetsytan **Syntetiskt elevprov** visar hur räckvidden fungerar med syntetiska elever. Den finns för rektor, lärare, administratör, elevhälsa och tidsbegränsad support. Överst står uppdraget och omfattningen. Vid gruppräckvidd visas också vilka grupper uppdraget gäller. Listan innehåller bara de elever servern har lämnat ut för ditt uppdrag. Ingen större lista hämtas och filtreras i webbläsaren.

| Uppdrag | Vad du ser |
|---|---|
| Lärare | Eleverna i dina grupper, inte andra elever på skolan |
| Administratör | Skolenhetens elever. *Exportera urvalet (CSV)* laddar ned samma urval |
| Elevhälsa, skolräckvidd | Skolenhetens elever |
| Elevhälsa, elevräckvidd | Endast de tilldelade eleverna |
| Elevhälsa, ärenderäckvidd | Ingen lista. Välj ett tilldelat ärende och *Visa ärendets elev* |
| Tidsbegränsad support, elev | Den namngivna eleven, med godkännare, syfte och sluttid |
| Tidsbegränsad support, grupper | Eleverna i de tilldelade grupperna, inte andra elever på skolan, med godkännare, syfte och sluttid |

Bara administratören kan exportera.

Elever utanför räckvidden syns inte, och ett direkt anrop om dem ger samma svar som om eleven inte fanns. Varje läsning och export registreras i säkerhetsloggen. Går loggen inte att skriva visas *Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.* med en referens, och ingen elevuppgift visas.

## Tidsbegränsad support

Supportmandat är avsiktligt smalt och kan bara ges av rektor. Det gäller

- en skolenhet,
- antingen en namngiven elev eller en eller flera grupper på skolenheten,
- med angiven start- och sluttid,
- i högst en timme,
- med angivet ändamål,
- godkänt av den rektor som gav det.

Rektor tilldelar support i samma dialog. Välj *Tidsbegränsad support* och mottagare. Under **Omfattning** väljer du *En namngiven elev* och markerar exakt en elev, eller *En eller flera grupper på en skola* och markerar grupperna. Grupper på olika skolor kan inte kombineras i samma supportuppdrag. Välj sedan **Varaktighet från nu**: 15, 30 eller 60 minuter. Syftet är i provmiljön alltid syntetisk felsökning. Rektor som tilldelar registreras som godkännare.

Support för grupper når de elever som är med i grupperna när supporten läser. En elev som lämnar gruppen syns inte längre.

Supportpersonen ser godkännare, syfte och sluttid ovanför eleven. Vid sluttiden töms vyn och ersätts av *Uppdraget har upphört vid sin sluttid.* Servern nekar också nästa anrop. Support är ingen stående åtkomst, och det finns ingen export.

## IT-administration

IT-funktionen ser arbetsytan **Lokal anslutning** i stället för Mandat. Välj skola och använd *Pausa anslutningen* eller *Aktivera anslutningen*. *Kör syntetiskt test* bekräftar *Det syntetiska testet lyckades. Ingen verklig kommunanslutning har testats.* När anslutningen är pausad svarar testet att den måste aktiveras först. Ändringar och test kräver verifiering med engångskod.

Har någon annan hunnit ändra anslutningen skriver servern inte över den ändringen.

IT-funktionen ger ingen elevinsyn. Den når bara anslutningens läge, aldrig elevuppgifter, och arbetsytan Syntetiskt elevprov finns inte i menyn.

## Minsta nödvändiga uppgifter

Servern lämnar bara ut de fält åtgärden faktiskt kräver, och bara om de begärts uttryckligen. En elevläsning ger identitet, visningsnamn, skolenhet och grupptillhörighet — inte hela elevbilden. Begärs ett fält utanför det tillåtna nekas hela anropet i stället för att svaret tystas ned.

## När åtkomst nekas

Nekanden är avsiktligt lika oavsett orsak, så att svaret inte avslöjar om ett objekt finns. Ett känt objekt-ID från en annan kund ger samma svar som ett obefintligt. Vanliga skäl är att uppdraget inte gäller idag, att objektet ligger utanför räckvidden, att åtgärden inte ingår i funktionen eller att delegeringskedjan brutits. Se [Regler i systemet](regler.md) för hela listan.

## Elevhälsans medicinska journaler

Medicinska journaler inom elevhälsan ingår inte i plattformen och omfattas inte av mandaten ovan. De har eget huvudmannaskap, egen sekretess och egna krav, och rektorsuppdraget öppnar dem inte.
