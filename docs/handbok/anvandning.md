---
title: Logga in och arbeta
---

Den skyddade provmiljön kontrollerar varje åtgärd på servern. Din inloggning avgör vem du är; ditt uppdrag avgör vad du får göra. Uppgifterna är syntetiska.

**Status:** Verifierat för inloggning, uppdragsval, kontextbyte, extra verifiering, utloggning och arbetsytorna för mandat och lokal anslutning. Prövat på dator och i telefonläge i den lokala provmiljön med syntetiska uppgifter och granskat i september 2026. Ingen verklig kommun är ansluten. Mandatens innehåll beskrivs i [Mandat och avgränsad åtkomst](mandat.md).

## Logga in

Startsidan visar *Logga in för att arbeta i den skyddade provmiljön*. Inloggningen sker hos den lokala testleverantören med lösenord. Har ditt konto en registrerad engångskod anger du också koden direkt efter lösenordet. Ingen kommunanslutning är godkänd i denna fas. Lyckas inte inloggningen visas en felkod att uppge för pilotansvarig. Se [Inloggningsmetoder](inloggningsmetoder.md) för vad plattformen godtar som bevis.

Du identifieras av utfärdaren och ett stabilt konto-ID hos den. E-postadress och namn är visningsuppgifter och används aldrig för att knyta ihop konton. Samma person hos två kunder får två skilda medlemskap.

## Välja uppdrag

Sidhuvudet visar vilket uppdrag du arbetar i. Har du flera väljer du bland dem i uppdragsväljaren. Väljaren visar:

- **Giltiga uppdrag** — valbara, gäller idag.
- **Kommande uppdrag** — syns med startdatum men går inte att välja.
- **Avslutade uppdrag** — syns med slutdatum men går inte att välja.

Har du inga uppdrag som gäller idag öppnas ingen arbetsyta. Du kan bara logga ut. Giltigheten prövas av servern vid varje anrop, inte bara när du väljer — ett uppdrag som löper ut mitt i din session stoppar nästa åtgärd.

## Arbetsytan för ditt uppdrag

Efter inloggningen öppnas den arbetsyta som hör till ditt uppdrag. Menyn visar bara det uppdraget får använda, men det är servern som prövar varje åtgärd.

| Uppdrag | Arbetsyta |
|---|---|
| Kundadministration | Kundadministration |
| Granskning | Säkerhetslogg |
| Huvudman, rektor, elevhälsoansvarig | Mandat: tilldela och avsluta uppdrag |
| Rektor, lärare, administratör, elevhälsa, tidsbegränsad support | Elever inom uppdragets räckvidd |
| IT-administration | Lokal anslutning |

Rektorn har både Mandat och Elever i menyn. Huvudmannen utser rektor och rektorn tilldelar uppdrag inom sina egna skolenheter. Hur det går till beskrivs i [Mandat och avgränsad åtkomst](mandat.md). Följ läsningar, exporter och nekanden i [Säkerhetsloggen](sakerhetslogg.md).

Arbetsytorna fungerar på telefon i en spalt, utan sidledes rullning. Knappar och val är minst 44 pixlar höga.

## Hitta elever

I **Elever** väljer du skola och läsår. Läsårsväljaren sitter före uppdragsväljaren i sidhuvudet. Läsåret gäller från 1 juli till 30 juni. Listan omfattar elever med en skolplacering som överlappar det valda läsåret och som ditt uppdrag ger dig rätt att läsa.

Skriv i sökfältet och välj **Sök elever**, eller tryck Enter. Klass, utbildning, årskurs och status hämtas från servern; ändrade filter hämtar ett nytt urval. Listan visar högst 50 elever per sida. På dator visas en tabell och på telefon en kortlista. Namnlika elever särskiljs med de uppgifter ditt uppdrag får se.

Filtren kan återställas med webbläsarens bakåtknapp och vid omladdning. Söktext sparas bara i den öppna arbetsytans minne och rensas vid omladdning. Markeringar rensas när urvalet ändras. Ett ogiltigt eller otillåtet filter återgår till ett tillåtet starturval med ett generellt besked.

En skyddad elev visas utan särskild skyddsbehörighet bara med anonymt visningsnamn och begränsade skoluppgifter. Raden ger ingen möjlighet att ändra eller exportera eleven. Huvudmannen hanterar administratörens skolbundna skyddsbehörighet enligt [Mandat och avgränsad åtkomst](mandat.md).

**Begränsning:** Elevkort, ändringsdialoger, visning av personnummer och elevexport öppnas i kommande steg. Listans markering innebär inte att en export har genomförts. Miljön innehåller endast syntetiska uppgifter.

## Byta uppdrag och flera flikar

Uppdraget byts i sidhuvudet utan ny inloggning. Vid byte rensas innehållet i arbetsytan så att inget från föregående uppdrag ligger kvar.

Har du plattformen öppen i flera flikar låses de övriga med meddelandet *Kontexten ändrades i en annan flik* eller *Du har loggats ut i en annan flik*, och innehållet rensas. Det gäller även elevlistan, söktext och markerade elever. Ladda om fliken för att fortsätta i den aktuella kontexten. Har du osparade ändringar varnas du innan bytet genomförs.

## Extra verifiering

Känsliga administrativa åtgärder kräver ett bevis på att du har styrkt din identitet med engångskod. Det gäller inbjudan, spärr, tilldelning och avslut av uppdrag, ändring av den lokala anslutningen och etablering. Kravet prövas mot beviset från inloggningen, inte mot något appen själv utfärdar.

Har du angett engångskoden vid inloggningen har du redan beviset och gör åtgärderna direkt. Beviset gäller i upp till åtta timmar och är knutet till din session och ditt uppdrag. Är det äldre, eller saknas det, nekas åtgärden och *Verifiera med engångskod* visas där beskedet står, även inne i en öppen dialog. Efter verifieringen kommer du tillbaka till arbetsytan. Det du hade fyllt i en dialog sparas inte.

Efter verifieringen måste du bekräfta åtgärden på nytt. Det är avsiktligt: en extra verifiering är inget tyst godkännande av åtgärden. Avbryter du flödet genomförs ingenting. Vad som krävs för att ett bevis ska godtas beskrivs i [Inloggningsmetoder](inloggningsmetoder.md).

## Lösa in en inbjudan

Har du fått en personbunden engångslänk öppnar du den och loggar in först. Länken går bara att lösa in av den person och hos den utfärdare den utfärdades för, och den går bara att använda en gång. När den är inlöst visas vilken kund medlemskapet gäller och vilka funktioner du fått.

## Logga ut

Utloggning avslutar sessionens skyddade åtkomst. Nästa anrop från den avslutade sessionen nekas, även om webbläsaren har kvar sina uppgifter. Öppna flikar låses och rensas.
