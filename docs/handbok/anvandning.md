---
title: Logga in och arbeta
---

Den skyddade provmiljön kontrollerar varje åtgärd på servern. Din inloggning avgör vem du är; ditt uppdrag avgör vad du får göra. Uppgifterna är syntetiska.

**Status:** Verifierat för inloggning, uppdragsval, kontextbyte, extra verifiering och utloggning. Mandatens innehåll beskrivs i [Mandat och avgränsad åtkomst](mandat.md).

## Logga in

Startsidan visar *Logga in för att arbeta i den skyddade provmiljön*. Inloggningen sker hos den lokala testleverantören — ingen kommunanslutning är godkänd i denna fas. Lyckas inte inloggningen visas en felkod att uppge för pilotansvarig.

Du identifieras av utfärdaren och ett stabilt konto-ID hos den. E-postadress och namn är visningsuppgifter och används aldrig för att knyta ihop konton. Samma person hos två kunder får två skilda medlemskap.

## Välja uppdrag

Sidhuvudet visar vilket uppdrag du arbetar i. Har du flera väljer du bland dem i uppdragsväljaren. Väljaren visar:

- **Giltiga uppdrag** — valbara, gäller idag.
- **Kommande uppdrag** — syns med startdatum men går inte att välja.
- **Avslutade uppdrag** — syns med slutdatum men går inte att välja.

Har du inga uppdrag som gäller idag öppnas ingen arbetsyta. Du kan bara logga ut. Giltigheten prövas av servern vid varje anrop, inte bara när du väljer — ett uppdrag som löper ut mitt i din session stoppar nästa åtgärd.

## Byta uppdrag och flera flikar

Uppdraget byts i sidhuvudet utan ny inloggning. Vid byte rensas innehållet i arbetsytan så att inget från föregående uppdrag ligger kvar.

Har du plattformen öppen i flera flikar låses de övriga med meddelandet *Kontexten ändrades i en annan flik* eller *Du har loggats ut i en annan flik*, och innehållet rensas. Ladda om fliken för att fortsätta i den aktuella kontexten. Har du osparade ändringar varnas du innan bytet genomförs.

## Extra verifiering

Känsliga administrativa åtgärder — inbjudan, spärr, avslut av uppdrag och etablering — kräver att du styrker din identitet en extra gång med engångskod. Kravet prövas mot beviset från inloggningen, inte mot något appen själv utfärdar.

Efter verifieringen måste du bekräfta åtgärden på nytt. Det är avsiktligt: en extra verifiering är inget tyst godkännande av åtgärden. Avbryter du flödet genomförs ingenting.

## Lösa in en inbjudan

Har du fått en personbunden engångslänk öppnar du den och loggar in först. Länken går bara att lösa in av den person och hos den utfärdare den utfärdades för, och den går bara att använda en gång. När den är inlöst visas vilken kund medlemskapet gäller och vilka funktioner du fått.

## Logga ut

Utloggning avslutar sessionens skyddade åtkomst. Nästa anrop från den avslutade sessionen nekas, även om webbläsaren har kvar sina uppgifter. Öppna flikar låses och rensas.
