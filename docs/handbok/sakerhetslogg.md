---
title: Säkerhetslogg
---

Säkerhetsloggen visar vad som faktiskt hänt i kundens skyddade miljö. Den skrivs av servern, inte av webbläsaren: aktör och uppdrag härleds ur den prövade sessionen och kan inte väljas av den som utför åtgärden.

**Status:** Verifierat för läsning, filtrering och export. Gallring och kontinuitetskontroll är byggda och delvis prövade.

## Vem får läsa

Loggen läses av den som har funktionen **granskning** hos kunden. Granskaren ser sin egen kunds händelser — aldrig någon annan kunds. Granskningsfunktionen ger ingen åtkomst till elevuppgifter.

## Läsa loggen

Vyn **Säkerhetslogg** filtreras på datum från och till, och kan smalnas av på åtgärd. Knappen *Visa* hämtar träffarna.

Varje rad visar:

| Kolumn | Innehåll |
|---|---|
| Tid | När åtgärden utfördes |
| Åtgärd | Vad som gjordes |
| Resultat | Om åtgärden gick igenom eller nekades |
| Aktör | Personens konto-ID hos utfärdaren |
| Uppdrag | Vilken funktion och vilket uppdrag som användes |
| Objekt | Vad åtgärden gällde |
| Korrelation | Id som binder ihop stegen i ett och samma anrop |
| Detaljer | Minimerad beskrivning av utfallet |

Detaljfältet är avsiktligt kortfattat. Loggen är ett spår över vem som gjorde vad — den är ingen kopia av innehållet som behandlades.

## Vad som loggas

Beständiga ändringar loggas: inbjudningar och inlösen, spärrar och hävda spärrar, tilldelade och avslutade uppdrag, organisationsändringar och anslutningsändringar. Även **nekade försök** loggas, liksom inloggning, utloggning och kontextbyte.

Läsningar av elevinnehåll får en egen loggningsstrategi när elevregistret öppnas i en senare fas.

## Exportera

*Exportera CSV* laddar ned de träffar filtret visar. Exporten är i sig en åtgärd och registreras i loggen med samma spårbarhet som övriga händelser.

## Skydd och gallring

Loggen är skriven för att inte kunna ändras i efterhand av vanliga verksamhetsanvändare. Underhåll sker med en egen, avgränsad behörighet som ingen appfunktion har.

Den syntetiska provmiljön gallrar händelser äldre än 30 dagar per kund. Bevarandetider för en verklig kund är ett öppet beslut som följer kundens egen informationshantering — se [Integration och gränser](integration.md).
