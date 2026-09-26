---
title: Regler i systemet
---

Sammanställning av de regler servern tillämpar. Reglerna prövas på servern vid varje åtgärd — gränssnittet döljer knappar, men det är prövningen som avgör.

## Funktioner och vad de får göra

| Funktion | Får göra | Får inte |
|---|---|---|
| Kundadministration | Bygga organisationen, bjuda in, spärra, avsluta uppdrag | Läsa elevuppgifter |
| Granskning | Läsa och exportera kundens säkerhetslogg | Läsa elevuppgifter |
| Huvudman | Läsa organisationen, utse rektor | Automatisk insyn i elevärenden |
| Rektor | Läsa elever inom sina skolenheter, delegera uppdrag | Gå utanför sina skolenheter |
| Administratör | Läsa och exportera elever inom räckvidden | Delegera uppdrag |
| Lärare | Läsa elever i sina undervisnings- och mentorsgrupper | Nå elever utanför grupperna, exportera |
| Elevhälsa | Läsa elever inom tilldelad räckvidd | Nå elever utanför räckvidden, exportera, delegera |
| Elevhälsoansvarig | Delegera elevhälsouppdrag | Läsa elevuppgifter på eget mandat |
| IT-administration | Se, aktivera, pausa och prova anslutningen | All elevinsyn |
| Tidsbegränsad support | Läsa en namngiven elev under angiven tid | Exportera, delegera, ändra; allt efter sluttiden |

## Uppdragets giltighet

Ett uppdrag har ett startdatum och kan ha ett slutdatum, och kan dessutom ha en exakt start- och sluttid. Uppdraget är valbart och användbart bara när

- medlemskapet är aktivt och inte spärrat,
- dagens datum ligger inom giltighetstiden,
- uppdraget inte är avslutat,
- och eventuell start- och sluttid omsluter tidpunkten.

Ett uppdrag som är **kommande** eller **avslutat** visas i uppdragsväljaren men går inte att välja. Giltigheten prövas vid varje anrop, så ett uppdrag som löper ut under en pågående session stoppar nästa åtgärd.

## Delegeringskedjan

Ett delegerat mandat pekar på det mandat det kom ifrån. Hela kedjan prövas varje gång: brister ett led — det är avslutat, spärrat, utgånget eller ändrat så att barnet blivit vidare än föräldern — nekas åtgärden även om det egna uppdraget ser giltigt ut.

En person kan inte delegera till sig själv, och en kedja kan aldrig gå i cirkel.

## Varför en åtgärd nekas

| Situation | Vad som hänt |
|---|---|
| Inget uppdrag valt | Arbetskontexten saknas |
| Uppdraget gäller inte | Kommande, avslutat, utgånget eller spärrat medlemskap |
| Kedjan brister | Ett mandat högre upp i linjen gäller inte längre |
| Fel kund eller huvudman | Objektet tillhör en annan organisation än uppdraget |
| Åtgärden ingår inte | Funktionen har inte rätt att utföra just den åtgärden |
| Utanför räckvidden | Skolenheten, gruppen, eleven eller ärendet ligger utanför mandatet |
| Uppgifterna är för många | Fler fält begärdes än åtgärden tillåter |
| Delegeringen tillåts inte | Mottagaren, räckvidden eller tiden ryms inte i det egna mandatet |
| Säkerhetsloggen är otillgänglig | Händelsen kan inte sparas, så inget innehåll lämnas ut och ingen ändring genomförs |

Nekandet avslöjar inte om objektet finns. Ett känt objekt-ID från en annan kund ger samma svar som ett obefintligt.

## Identitet

En person identifieras av utfärdaren och ett stabilt konto-ID hos utfärdaren. E-post och namn är visningsuppgifter. Två konton med samma e-postadress kopplas aldrig automatiskt ihop, och behörigheter ärvs aldrig genom en delad e-postadress.

## Kundgräns

Kund och huvudman är skilda nivåer. En kund kan ha flera huvudmän, och varje huvudman flera skolenheter. Åtkomst begränsas alltid till den kund uppdraget tillhör — i vyer, sökningar, exporter och filvägar.

## Extra verifiering

Administrativa åtgärder kräver ett färskt bevis på extra verifiering från inloggningen. Beviset prövas mot förväntad utfärdare, mottagare, metod och ålder, gäller i upp till åtta timmar och är knutet till sessionen och uppdraget. Samma anspråk från en annan utfärdare godtas inte. Efter verifieringen krävs en ny bekräftelse av själva åtgärden. Se [Inloggningsmetoder](inloggningsmetoder.md).
