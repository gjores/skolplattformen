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

Huvudman, rektor och administratör kommer efter inloggningen till **Start**. Välj **Hitta en elev**, **Planera läsåret** eller **Hantera uppdrag** utifrån vilka uppgifter ditt uppdrag ger tillgång till. Programplaner och timplaner har också egna genvägar. En direktlänk öppnar den valda arbetsytan. Övriga uppdrag öppnar sin arbetsyta direkt. Menyn visar bara det uppdraget får använda, men det är servern som prövar varje åtgärd.

| Uppdrag | Arbetsyta |
|---|---|
| Kundadministration | Kundadministration |
| Granskning | Säkerhetslogg |
| Huvudman, rektor | Start med genvägar till planering och uppdrag |
| Administratör | Start med genvägar till elever och planering |
| Elevhälsoansvarig | Mandat: tilldela och avsluta uppdrag |
| Rektor, lärare, administratör, elevhälsa, tidsbegränsad support | Elever inom uppdragets räckvidd |
| IT-administration | Lokal anslutning |

Rektorn har både Mandat och Elever i menyn. Huvudmannen utser rektor och rektorn tilldelar uppdrag inom sina egna skolenheter. Hur det går till beskrivs i [Mandat och avgränsad åtkomst](mandat.md). Följ läsningar, exporter och nekanden i [Säkerhetsloggen](sakerhetslogg.md).

Arbetsytorna fungerar på telefon i en spalt, utan sidledes rullning. Knappar och val är minst 44 pixlar höga.

## Hitta elever

I **Elever** väljer du skola och läsår. Läsårsväljaren sitter före uppdragsväljaren i sidhuvudet. Läsåret gäller från 1 juli till 30 juni. Listan omfattar elever med en skolplacering som överlappar det valda läsåret och som ditt uppdrag ger dig rätt att läsa.

Sök på namn och välj **Sök elever**, eller tryck Enter. Administratörer kan också söka på födelsedatum eller personnummer. Klassfiltret visas direkt. Välj **Fler filter** för utbildning, årskurs och status. Valda filter syns i en sammanfattning även när du döljer filterpanelen. **Rensa filter** tar bort filtervalen. Under **Om din åtkomst till elevregistret** finns uppdragets räckvidd och eventuella tidsgränser. Listan visar högst 50 elever per sida; välj **Föregående sida** eller **Nästa sida** för att bläddra. På dator visas en tabell och på telefon en kortlista. Namnlika elever skiljs åt med de uppgifter ditt uppdrag får se, till exempel födelsedatum, klass och skola.

Skola, läsår, filter och sida kan återställas med webbläsarens bakåtknapp och ligger kvar vid omladdning. Söktext och elevmarkeringar sparas inte vid omladdning; söktexten finns bara i den öppna arbetsytan. När du går tillbaka från ett elevkort kommer du till samma lista. Markeringar rensas när urvalet ändras. Ett ogiltigt eller otillåtet filter återgår till ett tillåtet starturval med ett generellt besked.

En skyddad elev visas utan särskild skyddsbehörighet bara med anonymt visningsnamn och begränsade skoluppgifter. Personnummer, födelsedatum och hemkommun visas inte, och eleven kan inte ändras eller tas med i en export. Huvudmannen hanterar administratörens skyddsbehörighet för varje skola enligt [Mandat och avgränsad åtkomst](mandat.md).

### Öppna och arbeta med ett elevkort

Välj elevens namn för att öppna elevkortet. Där visas basuppgifter, skola, klass, utbildning, årskurs och hemkommun enligt ditt uppdrag. Administratörer med rätt räckvidd ser även skolplaceringar, klasstillhörighet och hemkommun över tid. Datum visar när placeringar och klasstillhörigheter gäller. En elev som bara har avslutade placeringar kan läsas med sin historik men inte ändras. Administratören kan ändra eleven när det finns en aktuell eller framtida placering på en skola som uppdraget omfattar.

Personnummer är maskerat i elevkortet. Välj **Visa personnummer** när du behöver det; visningen kräver extra verifiering med engångskod när ett aktuellt bevis saknas och registreras i säkerhetsloggen. Personnummer i provmiljön är alltid syntetiskt.

Uppgifterna visar också sitt ursprung, till exempel manuell registrering eller en simulerad källa. Den simulerade källan är syntetisk och inte en riktig kommunanslutning. Om en ny källeverans skiljer sig från en lokal rättelse visas båda som en avvikelse. Rättelsen skrivs inte över automatiskt: välj om den lokala rättelsen eller källans värde ska gälla. Ändringshistoriken visar tidigare värden, tid och uppgiftens ursprung; personnumret återges inte där.

### Arbeta med elevens studieplan

Öppna elevkortet och välj fliken **Studieplan**. Rektor och administratör kan läsa och bereda studieplaner för nationella Gy25-program inom sitt skoluppdrag. När eleven har flera skolplaceringar väljer du utbildningsperioden du vill se. Läsning och ändring kräver verifiering med engångskod. För elever med skyddade personuppgifter kan en administratör med skolans särskilda skyddsbehörighet läsa och bereda planen.

1. Välj **Skapa utkast** för att börja. Studieplanen utgår från skolplaceringen och kan upprättas även när klassen saknar timplanskoppling. När kullens fastställda programplan ger en entydig period fylls den i för ämnesnivån eller gymnasiearbetet. Perioden går från den första till den sista terminen med poäng på raden. Öppna **Ändra övriga uppgifter** för att komplettera exempelvis val och uppgifter om fjärrundervisning. Välj **Spara utkast** när du är klar.
2. Kontrollera de förifyllda perioderna och komplettera vid behov. Ange till exempel **HT 2028** när du känner till terminen. När undervisningsperioden är känd kan du ersätta terminen med ett exakt datum. Fastställda terminsgränser i läsårskalendern kan användas som stöd. Välj **Spara ändringar** en gång för raderna du har ändrat. Sparade individuella perioder står kvar när programplanen ändras.
3. Följ upp studieplanens innehåll i skolans samtal med eleven. Rektor väljer **Gör gällande** för ett färdigt utkast, anger från vilket datum versionen ska gälla och väljer **Bekräfta gällande**. Om en uppgift behöver kompletteras visas den i beskedet så att du kan fortsätta i utkastet.
4. När rektor sparar periodändringar direkt i den gällande planen visas de på samma studieplan. Administratörens ändringar sparas som utkast för rektor. Välj **Visa historik** för att se en tidigare version eller vad som gällde på ett valt datum.

När en entydig period finns från elevens undervisningsgrupp kan du välja **Använd gruppens datum** på raden. Vid flera förslag kan du välja **Använd datumförslag** för att lägga in perioderna tillsammans. Kontrollera förslagen i tabellen före sparandet. Gruppens datum används som planerad period.

I tabellen visas planerade datum, faktiska datum och status. Öppna radens detaljer för att se källan till en registrerad händelse. Vid en rättelse eller ett undantag väljer du **Rätta eller registrera studiehändelse** och anger det faktiska datumet. En nivå som väntar på start visas som **Kommande**. Den registrerade starten ger **Påbörjad** och det registrerade avslutet ger **Avslutad** eller **Avbruten**. Välj **Behöver följas upp** för att visa nivåer vars exakta planerade slutdatum har passerat och som behöver kontrolleras.

Rektor kan använda **Registrera beslut** för att föra in ett redan fattat beslut. För reducerat program anger du beslutsreferensen inom åtgärdsprogrammet, datum och omfattning. Ange vilka nivåer som berörs när de framgår av beslutet. Nivåerna visas som **Reducerad** under beslutets giltighet. Om nivåerna ännu saknas visas omfattningen i planens beslutsavsnitt. Registrerade studiedatum finns kvar.

En registrerad studiehändelse visas direkt när du arbetar med den senaste gällande planen. Om du arbetar i ett utkast sparas händelsen där. Registrerade beslut sparas i utkastet tills rektor gör det gällande. Om svaret på ett sparande uteblir väljer du **Kontrollera sparandet**. Om uppgifterna har ändrats sedan du öppnade studieplanen väljer du **Hämta aktuell version**.

#### Skapa studieplansutkast för en klass

Gå till **Elever**, välj skola, läsår och klass och öppna **Skapa studieplansutkast…**. Rektor och administratör kan använda åtgärden inom sitt skoluppdrag med verifierad inloggning.

1. Välj **Elever i klassen den** och sedan **Förhandsgranska**. Datumet styr vilka elever som ingår. För en kommande kull kan du välja klassens startdag. Entydiga planerade studieperioder fylls i från kullens fastställda programplan.
2. Granska vilka som kan få ett utkast och välj bort elever som ska vänta. Förhandsgranskningen visar klassens daterade urval även om elevlistan har flera sidor. Elever med en befintlig studieplan behåller den. En rad kan visa att ett val kan kompletteras senare på elevkortet.
3. Välj **Skapa utkast** med det angivna antalet. Du ser utfallet per elev under **Sparresultat**. Välj **Öppna elevkort** för att fortsätta med en sparad eller befintlig studieplan. Gå igenom innehållet med eleven inför att rektor gör planen gällande.

Om underlaget har ändrats kan du välja **Förhandsgranska på nytt**. Om svaret på sparandet uteblir kan du välja **Kontrollera sparandet**. Efter omladdning öppnar du klassens studieplansutkast igen för att läsa det senaste sparresultatet. Välj **Fortsätt skapa utkast** om elever återstår.

#### Förhandsgranska en klass- eller gruppändring

Välj **Jämför förändring** i studieplanen. Ange **Jämförelsedatum** och välj **Hämta alternativ**. Välj vilken klass eller grupp eleven föreslås byta till, vilken grupp eleven föreslås börja i eller vilket gruppmedlemskap som ska avslutas. Vid gruppbyte är jämförelsedatumet den önskade första dagen i den nya gruppen. När eleven föreslås börja i en grupp fyller du även i **Sista dag i gruppen**. Vid avslut är jämförelsedatumet elevens sista dag i gruppen.

Välj **Visa jämförelse**. Jämförelsen visar vilken version av studieplanen den utgår från och vilka nivåer som berörs. För gruppmedlemskap visas datum före och efter den föreslagna ändringen. **Samma nivå** visar att nivån är densamma vid bytet. **Behöver följas upp** visar att till exempel grupp, ämnesnivå eller språk behöver kontrolleras. Om målklassen hör till en annan utbildning visas **Utbildningen behöver granskas**.

Jämförelsen är ett läsunderlag. Genomför och bekräfta ändringen under **Byt klass** på elevkortet eller i **Undervisningsgrupper**, enligt ditt uppdrag.

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
