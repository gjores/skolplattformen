---
slug: /
title: Skolplattformens handbok
---

Handboken beskriver vad du kan göra i plattformen, vilka regler systemet tillämpar och var gränserna går. Den utvecklas tillsammans med funktionerna i samma projekt.

## Två sätt att köra plattformen

Plattformen startar alltid i ett uttryckligt läge. Sidhuvudet visar vilket läge du arbetar i.

| Läge | Vad det är | Inloggning |
|---|---|---|
| Exempelläge | Fiktiva skolor och elever i webbläsarens minne. Ingen databas, inga riktiga uppgifter. | Ingen |
| Skyddad provmiljö | Serverkontrollerad åtkomst med uppdrag, spärrar och säkerhetslogg. Syntetiska uppgifter. | Lokal testleverantör |

Saknas läge, eller anges ett okänt läge, öppnas ingen arbetsyta alls. Det är avsiktligt: arbetsytan ska aldrig starta på en gissning.

## Börja här

- [Exempelläget](exempelmiljo.md): planera utbildningar, timplaner och läsår utan inloggning.
- [Logga in och arbeta](anvandning.md): inloggning, uppdrag, kontextbyte och extra verifiering.
- [Kundadministration](kundadministration.md): inbjudningar, medlemmar, spärrar och organisationens uppbyggnad.
- [Mandat och avgränsad åtkomst](mandat.md): vem får se vad, och varför.
- [Säkerhetslogg](sakerhetslogg.md): följa ändringar och exportera underlag.
- [Regler i systemet](regler.md): funktioner, giltighet, räckvidd och nekandeskäl.
- [Integration och gränser](integration.md): vad som krävs innan en kommun kan ansluta.
- [Skriva i handboken](utveckling.md): hur dokumentationen redigeras och byggs.

## Vad som är prövat

Varje sida anger vad som är verifierat och vad som återstår. Tre statusord används genomgående:

- **Verifierat** — funktionen är prövad mot syntetiska uppgifter i den lokala provmiljön och resultatet är granskat.
- **Byggt** — funktionen finns i koden men hela användarflödet är inte färdigprövat.
- **Öppet** — beslutet eller anslutningen är inte fattad.

En verifierad lokal provmiljö är inget godkännande för verkliga elevuppgifter och ingen verklig kommunanslutning. Skolverkets registeruppslag tillför skoluppgifter men ger ingen rätt att företräda en huvudman.
