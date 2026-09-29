---
title: Säkerhetslogg
---

Säkerhetsloggen visar vad som faktiskt hänt i kundens skyddade miljö. Den skrivs av servern, inte av webbläsaren: aktör och uppdrag härleds ur den prövade sessionen och kan inte väljas av den som utför åtgärden.

**Provstatus:** Läsning, filtrering och export av logghändelser, spår av elevregisterläsningar och stopp när en händelse inte kan loggas har prövats i en lokal miljö med syntetiska uppgifter, september 2026. Gallring och kontinuitetskontroll är byggda och delvis prövade. Inga verkliga elevuppgifter eller kommunanslutningar ingår.

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

Beständiga ändringar loggas: inbjudningar och inlösen, spärrar och hävda spärrar, rektorsutnämningar, tilldelade och avslutade uppdrag, organisationsändringar samt ändringar och test av den lokala anslutningen. Även **nekade försök** loggas, liksom inloggning, utloggning och kontextbyte.

I elevregistret loggas läsning av listan, elevkortet och ändringshistoriken. Export och nekade försök loggas också. Raden visar vem som agerade, vilket uppdrag som användes, när det skedde och resultatet; vid en listläsning visas antalet elever i svaret. Säkerhetsloggen innehåller inte elevnamn, personnummer, födelsedatum, hemkommun eller andra elevvärden. Ändringshistoriken i elevkortet är ett separat verksamhetsspår och innehåller tidigare värden och deras ursprung; personnummer visas inte där.

Loggen skrivs innan svaret lämnas. Kan händelsen inte sparas får användaren inget elevinnehåll eller någon export och ingen ändring genomförs. I stället visas *Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.* med en referens.

För att följa en händelse filtrerar du på datum och väljer åtgärd i fältet **Åtgärd**. Korrelationen är samma referens som användaren ser vid ett fel. Under *Detaljer* finns hela korrelations-id:t.

## Exportera

*Exportera CSV* laddar ned de säkerhetsloggshändelser som filtret visar. Exporten registreras i loggen med samma spårbarhet som övriga händelser. Därefter bekräftas *CSV-exporten har laddats ner och registrerats i loggen.* Säkerhetsloggens export innehåller inga elevvärden. En elevregisterexport är en separat åtgärd från elevvyn och får endast lämnas ut efter att servern har prövat och loggat den.

## Skydd och gallring

Loggen är skriven för att inte kunna ändras i efterhand av vanliga verksamhetsanvändare. Underhåll sker med en egen, avgränsad behörighet som ingen appfunktion har.

Den syntetiska provmiljön gallrar händelser äldre än 30 dagar per kund. Bevarandetider för en verklig kund är ett öppet beslut som följer kundens egen informationshantering — se [Integration och gränser](integration.md).
