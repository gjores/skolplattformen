---
title: Kundadministration
---

Kundadministratören bygger upp kundens organisation och hanterar vilka personer som har åtkomst. Funktionen ger däremot ingen insyn i elevuppgifter — sådan åtkomst kräver ett eget verksamhetsmandat.

**Status:** Verifierat.

## Översikt

Startvyn visar kundens uppbyggnad: huvudmän, skolenheter, medlemmar och öppna inbjudningar. Härifrån når du de övriga flikarna.

## Bjuda in personer

Nya personer får en **personbunden engångslänk**. När du skapar inbjudan anger du vilken person den gäller och vilka funktioner den ger. Länken visas en gång och kopieras till mottagaren via en egen kanal.

Inbjudan kan bara lösas in

- av den person den utfärdades för,
- hos den utfärdare som angavs,
- före utgångstiden,
- och exakt en gång.

Stämmer något av detta inte avvisas inlösen. Ett organisationsnummer, en e-postdomän eller ett uppslag i Skolenhetsregistret ger aldrig i sig någon behörighet.

Via inbjudan tilldelas endast **kundadministration** och **granskning**. Verksamhetsmandat som rektor och lärare delas inte ut här utan delegeras i linjen — se [Mandat och avgränsad åtkomst](mandat.md).

## Medlemmar och spärrar

Medlemslistan visar kundens personer och deras status. Du kan **spärra** ett medlemskap och **häva spärren** igen. En spärr kräver angiven orsak.

Spärren slår igenom vid nästa skyddade anrop. Det gäller även en person som redan är inloggad: en giltig session ger ingen fortsatt åtkomst när medlemskapet är spärrat.

Du kan också **avsluta ett enskilt uppdrag** utan att spärra hela medlemskapet. Då upphör just den arbetskontexten medan personens övriga uppdrag är kvar.

## Huvudmän och skolenheter

**Lägg till huvudman** skapar en huvudman under kunden. Kund och huvudman är skilda nivåer: en kommun kan ha flera nämnder och en koncern flera bolag under samma avtal.

**Skolenheter** läggs till per huvudman. Uppgifterna hämtas från Skolverkets skolenhetsregister och tas över som skolans grund. Registret verifierar skolans uppgifter — det verifierar inte att någon får företräda huvudmannen.

**Utse rektor** knyter en rektor till en skolenhet. Huvudmannen utser rektor; rektorn tilldelar i sin tur läraruppdrag inom sina egna skolenheter.

## Huvudmannens skolor

Huvudmannen använder **Skolor** i menyn för att hämta skoluppgifter från Skolverkets skolenhetsregister. Det aktuella uppdraget styr vilken huvudman och vilka befintliga skolor som är tillgängliga.

1. Sök med **Skolenhetskod** eller huvudmannens **Organisationsnummer**. Vid organisationssökning väljer du en skola i träfflistan.
2. Granska namn, adress, kommun, status och skolformer.
3. Välj **Lägg till skolenhet** för en ny skola, eller **Uppdatera registeruppgifter** för en befintlig skola som du har mandat för.

Skolan måste höra till den aktuella huvudmannens organisationsnummer i registret. Saknas organisationsnummer behöver kundadministratören komplettera huvudmannens uppgifter. En registerträff ger aldrig i sig rätt att företräda huvudmannen.

Vid uppdatering bevaras **lokalt tillsatt rektor**, lokala årskurser, befintliga uppdrag, utbildningar, planer, klasskopplingar och elevregisteranslutning. Skolformer som finns lokalt men saknas i det nya registerunderlaget tas inte bort automatiskt; skillnaden visas vid granskningen. Rektor utses separat via [Mandat](mandat.md).

En importerad skola ger inga nya verksamhetsmandat. Den kan visas i din lista som importerad, men ett skolmandat behövs för fortsatt arbete med skolan.

### Om sparandet avbryts

Om svaret på sparandet saknas väljer du **Läs sparstatus**. Vänta med att lämna vyn eller göra en ny import tills resultatet är känt. Om inget sparande hittas kan du välja **Försök spara igen** för samma granskade uppgifter.

Om underlaget har ändrats hämtar du ett nytt underlag och granskar det på nytt. Om sparandet är bekräftat men listan inte kunde läsas väljer du **Läs om listan**; skapa inte skolan igen.

## Vad som loggas

Varje inbjudan, inlösen, spärr, hävd spärr, avslutat uppdrag och organisationsändring skrivs till [säkerhetsloggen](sakerhetslogg.md) med serververifierad aktör, uppdrag, tid och resultat. Även nekade försök loggas.
