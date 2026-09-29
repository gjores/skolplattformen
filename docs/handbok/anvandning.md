---
title: Logga in och arbeta
---

Den skyddade provmiljön kontrollerar varje åtgärd på servern. Din inloggning avgör vem du är; ditt uppdrag avgör vad du får göra. Uppgifterna är syntetiska.

**Provstatus:** Inloggning, uppdragsval, kontextbyte, extra verifiering, utloggning och arbetsytorna för mandat, lokal anslutning och elevregister har prövats i en lokal miljö med syntetiska uppgifter. Elevflödet har automatiskt prövats i datorläge, telefonstorlek och byggd app samt i ett separat telefonlikt webbläsarläge, september 2026. Det är inte ett användarprov med verkliga elever, fysisk telefon eller kommunanslutning. Mandatens innehåll beskrivs i [Mandat och avgränsad åtkomst](mandat.md).

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

Sök på namn och välj **Sök elever**, eller tryck Enter. Administratörer kan också söka på födelsedatum eller personnummer. Filtrera på klass, utbildning, årskurs och status. Listan visar högst 50 elever per sida; välj **Föregående sida** eller **Nästa sida** för att bläddra. På dator visas en tabell och på telefon en kortlista. Namnlika elever skiljs åt med de uppgifter ditt uppdrag får se, till exempel födelsedatum, klass och skola.

Skola, läsår, filter och sida kan återställas med webbläsarens bakåtknapp och ligger kvar vid omladdning. Söktext och elevmarkeringar sparas inte vid omladdning; söktexten finns bara i den öppna arbetsytan. När du går tillbaka från ett elevkort kommer du till samma lista. Markeringar rensas när urvalet ändras. Ett ogiltigt eller otillåtet filter återgår till ett tillåtet starturval med ett generellt besked.

En skyddad elev visas utan särskild skyddsbehörighet bara med anonymt visningsnamn och begränsade skoluppgifter. Personnummer, födelsedatum och hemkommun visas inte, och eleven kan inte ändras eller tas med i en export. Huvudmannen hanterar administratörens skyddsbehörighet för varje skola enligt [Mandat och avgränsad åtkomst](mandat.md).

### Öppna och arbeta med ett elevkort

Välj elevens namn för att öppna elevkortet. Där visas basuppgifter, skola, klass, utbildning, årskurs och hemkommun enligt ditt uppdrag. Administratörer med rätt räckvidd ser även skolplaceringar, klasstillhörighet och hemkommun över tid. Datum visar när placeringar och klasstillhörigheter gäller. En elev som bara har avslutade placeringar kan läsas med sin historik men inte ändras. Administratören kan ändra eleven när det finns en aktuell eller framtida placering på en skola som uppdraget omfattar.

Personnummer är maskerat i elevkortet. Välj **Visa personnummer** när du behöver det; visningen kräver extra verifiering med engångskod när ett aktuellt bevis saknas och registreras i säkerhetsloggen. Personnummer i provmiljön är alltid syntetiskt.

Uppgifterna visar också sitt ursprung, till exempel manuell registrering eller en simulerad källa. Den simulerade källan är syntetisk och inte en riktig kommunanslutning. Om en ny källeverans skiljer sig från en lokal rättelse visas båda som en avvikelse. Rättelsen skrivs inte över automatiskt: välj om den lokala rättelsen eller källans värde ska gälla. Ändringshistoriken visar tidigare värden, tid och uppgiftens ursprung; personnumret återges inte där.

### Exportera ett elevurval

Välj **Exportera urval…** när du uttryckligen behöver en fil. Välj markerade elever eller alla elever i det aktuella urvalet, och välj vilka uppgifter som ska tas med. Personnummer följer bara med om du särskilt markerar **Ta med personnummer**. Servern prövar urvalet och uppgifterna igen innan filen lämnas ut. Exporten kräver extra verifiering när ett aktuellt bevis saknas och registreras i säkerhetsloggen. En markering i listan laddar inte ned någon fil.

Alla uppgifter i den här provmiljön är syntetiska. Varken en verklig elevkälla eller en kommun är ansluten, och provresultaten innebär inte att tjänsten är godkänd för verkliga elevuppgifter.

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
