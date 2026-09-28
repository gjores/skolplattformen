---
title: Mandat och avgränsad åtkomst
---

Ett mandat är ett uppdrag med en bestämd räckvidd och en bestämd giltighetstid. Servern prövar mandatet vid varje åtgärd: vem du är, vilket uppdrag du arbetar i, vilket objekt du försöker nå och vilka uppgifter du begär.

**Status:** Lokal provmiljö med syntetiska uppgifter. De tidigare mandatflödena granskades i september 2026. Skyddsbehörighetens dialog har prövats på dator och i telefonstorlek; se begränsningen för elevläsning nedan. Inga verkliga elevuppgifter förekommer, och ingen verklig kommun är ansluten.

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

## Skyddsbehörighet för administratör

Huvudmannen öppnar **Hantera skyddsbehörighet** i arbetsytan **Mandat**. Rektor kan ge det vanliga administratörsuppdraget, men kan inte ge skyddsbehörigheten.

1. Välj **Skola** och **Administratörsuppdrag**. Endast giltiga uppdrag på skolorna i ditt eget mandat visas.
2. Kontrollera aktuell status och välj **Ge skyddsbehörighet** eller **Återkalla skyddsbehörighet**.
3. Kontrollera mottagare och skola och välj **Bekräfta tilldelning** eller **Bekräfta återkallelse**. Dialogen hämtar sedan aktuellt läge från servern.

Rätten gäller bara det valda administratörsuppdraget på den valda skolan. Den följer inte automatiskt personen till ett annat uppdrag eller eleven till en annan skola. Återkallelse gäller vid nästa skyddade anrop. Rätten gäller inte heller om administratörens eller den tilldelande huvudmannens uppdragskedja har upphört eller spärrats. Huvudmannen får ingen egen elevinsyn genom att tilldela rätten.

Ändringen kräver verifiering med engångskod. Saknas ett giltigt bevis finns **Verifiera med engångskod** inne i dialogen. Efter verifieringen öppnar du dialogen och väljer åtgärden igen. Osparade val lagras inte under inloggningen.

**Ångra val** avbryter bekräftelsen utan att ändra behörigheten. Om du stänger dialogen eller byter val med en obekräftad ändring får du först bekräfta att den ska kastas. Vid ett sparfel finns valen kvar. Om säkerhetsloggen inte kan skrivas sparas ingen behörighetsändring.

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

## Tillgång till elevuppgifter

Arbetsytan **Elever** visar elevlistan inom ditt uppdrags räckvidd. Skola, läsår och filter styr urvalet. Elevkort och elevexport är ännu inte öppnade i arbetsytan. Hanteringen av administratörens skyddsbehörighet visar inga elever. Se [Hitta elever](anvandning.md#hitta-elever).

När elevuppgifter visas prövar servern alltid ditt aktuella mandat och begränsar uppgifterna till dess räckvidd. Huvudman och IT får ingen elevinsyn genom sina ordinarie funktioner. Medicinska elevhälsojournaler ingår inte.

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

Supportens elevläsning omfattas av det tillfälliga stoppet ovan. Uppdragets start, sluttid och räckvidd gäller fortfarande; ett utgånget uppdrag ger ingen åtkomst. Support har ingen export.

## IT-administration

IT-funktionen ser arbetsytan **Lokal anslutning** i stället för Mandat. Välj skola och använd *Pausa anslutningen* eller *Aktivera anslutningen*. *Kör syntetiskt test* bekräftar *Det syntetiska testet lyckades. Ingen verklig kommunanslutning har testats.* När anslutningen är pausad svarar testet att den måste aktiveras först. Ändringar och test kräver verifiering med engångskod.

Har någon annan hunnit ändra anslutningen skriver servern inte över den ändringen.

IT-funktionen ger ingen elevinsyn. Den når bara anslutningens läge, aldrig elevuppgifter, och arbetsytan Syntetiskt elevprov finns inte i menyn.

## Minsta nödvändiga uppgifter

Vilka elevuppgifter som får visas beror på ditt aktuella uppdrag och den åtgärd du utför. Skyddsbehörighetens dialog visar bara administratörsuppdrag, skolor och behörighetens status. Den visar inga elevuppgifter.

## När åtkomst nekas

Nekanden är avsiktligt lika oavsett orsak, så att svaret inte avslöjar om ett objekt finns. Ett känt objekt-ID från en annan kund ger samma svar som ett obefintligt. Vanliga skäl är att uppdraget inte gäller idag, att objektet ligger utanför räckvidden, att åtgärden inte ingår i funktionen eller att delegeringskedjan brutits. Se [Regler i systemet](regler.md) för hela listan.

## Elevhälsans medicinska journaler

Medicinska journaler inom elevhälsan ingår inte i plattformen och omfattas inte av mandaten ovan. De har eget huvudmannaskap, egen sekretess och egna krav, och rektorsuppdraget öppnar dem inte.
