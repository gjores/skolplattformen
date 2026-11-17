---
title: Förbered schemat
---

I **Schema** arbetar du på två ytor som visar samma utkast: **Förbered** och **Lägg schema**. I Förbered går du igenom förutsättningarna innan du tar fram ett schemaförslag. I Lägg schema arbetar du med veckan, passen och villkoren när ett förslag finns.

Du behöver ett aktuellt uppdrag som rektor eller skoladministratör för skolan, och stark inloggning. Arbetsytan är gjord för dator med stor skärm.

## Börja i Förbered

Förbered visas först när skolan inte har något schemaförslag för läsåret. Skolans klasser, grupper, ämnen, lärare och undervisningar läses från tjänstefördelningen, timplanerna, läsårskalendern och elevgrupperna. Inget schema räknas fram när du öppnar ytan.

Överst står **Nästa uppgift**. Den pekar på det första området där en uppgift saknas, och annars på det första området som ingen har gått igenom. Du väljer själv ordning; inget område är låst.

Kan underlaget inte läsas visas ett besked och knappen **Läs underlaget igen**. Villkoren går att ändra under tiden.

## Checklistan

Checklistan har sju punkter. Varje punkt visar de aktuella värdena, vad appen har kontrollerat och en knapp som tar dig till området.

| Punkt | Här anger eller ser du |
| --- | --- |
| Underlag | Tjänstefördelningens version, läsårskalendern, antal undervisningar och undervisningar utan lärare. |
| Lektioner och block | Antal lektioner per undervisning, passlängder och samtidighetsblock från valmodulerna. |
| Salar | Salregistret och varje undervisnings salbehov. |
| Lärartider och fasta tider | Spärrad och tillåten tid per lärare, längsta dag, låsta pass och aktiviteter med fast tid. |
| Aktiviteter och nationella prov | Skolans återkommande aktiviteter, till exempel mentorstid. |
| Regler och önskemål | Skoldag, lunch, raster, spärrar och marginaler. |
| Mål för schemat | Vad schemamotorn väger: elevernas och lärarnas håltid, sena pass och samma ämne samma dag. |

Kryssa i **Genomgånget** när du har gått igenom ett område. Bocken är ditt eget ställningstagande. Appens kontroll bockar aldrig av något.

- Ändras innehållet i ett avbockat område visar raden **Ändrat sedan genomgången**. Gå igenom området igen och kryssa i på nytt.
- Genomgången sparas i den webbläsare du använder. En kollega, eller du själv i en annan webbläsare, ser den inte.

## Salar

### Salregistret

1. Gå till området **Salar** och välj **Lägg till sal**.
2. Ange salens namn, saltyp, antal platser och utrustning. Skilj utrustning med kommatecken.
3. Välj **Lägg till salen**.

Varje sal får ett fast ID. Du kan byta namn på en sal eller ta bort en annan sal utan att lagda pass hamnar i fel sal.

- **Allmän sal** är saltypen för salar som kan användas av undervisning utan särskilda krav.
- Lämna **Platser** tomt om antalet är okänt. Kapaciteten kontrolleras då inte för den salen. Ett tomt fält betyder inte att salen rymmer alla.
- En borttagen sal försvinner ur salbehov som pekade på den. Ett krav som bara gällde den salen blir obesvarat.

Har skolan salar som bara är namn från äldre villkor visas de i en ruta med knappen **För över salnamnen till salregistret**. Namnen gäller som förut tills du väljer det. Överföringen behåller namnen, villkoren och vilka salar passen ligger i. Saltyp och platser anger du efteråt.

### Salbehov

Varje undervisning har ett salbehov. Välj undervisning i formuläret och ett av lägena:

| Läge | Betydelse |
| --- | --- |
| Obesvarat | Inget salbehov är angivet. Passen läggs utan sal och räknas inte som klara. |
| Lämplig allmän sal | Vilken allmän sal som helst med plats för gruppen. |
| Särskilda salskrav | Saltyp, utrustning eller bestämd sal. Alla krav måste uppfyllas av samma sal. |
| Sal behövs inte | Undervisningen sker till exempel utomhus eller på arbetsplats. Du anger undervisningsform. |

Under **Salbehovet gäller** väljer du om värdet gäller bara den valda undervisningen eller hela ämnet. Ett värde för ämnet ärvs av ämnets undervisningar. Ett värde för en enskild undervisning är ett eget undantag och går före ämnets.

Listan **Lämpliga och olämpliga salar** visar varje sal och varför en sal faller bort, till exempel *Saknar dragskåp* eller *18 platser, gruppen har 22 elever*. Finns ingen sal som uppfyller alla krav visas ett **Hinder** med kraven i klartext. Passen läggs då utan sal tills du ändrar salbehovet eller salregistret.

Inget ändras förrän du väljer **Spara salbehov**. **Avbryt** återställer formuläret.

Är elevantalet eller salens platser okända står *Kapaciteten är inte kontrollerad*. Salen sorteras inte bort, men appen har inte kontrollerat att gruppen får plats.

### Ändra många salbehov samtidigt

1. Välj **Tabell** under Salbehov per undervisning.
2. Sök eller filtrera fram undervisningarna.
3. Kryssa i raderna, eller välj **Markera alla filtrerade** och kryssa ur undantagen.
4. Välj ändring: **Sätt salbehov**, **Lägg till salalternativ**, **Ersätt salalternativ**, **Ta bort salalternativ** eller **Ta bort eget undantag**.
5. Välj **Förhandsgranska ändringen**. Du ser hur många undervisningar som ändras, hur många som redan har värdet, vilka som hoppas över och varför, och vilka filtrerade rader som är omarkerade.
6. Välj **Ändra … undervisningar**, eller **Avbryt**.

Bara rader som syns i filtret kan vara valda. Ändringen gäller de valda undervisningarna som egna undantag; ämnets värde för andra undervisningar ändras inte. Hela ändringen är ett steg i **Ångra**.

## Förutsättningar just nu

Kortet svarar på fyra frågor, var för sig:

1. **Finns uppgifterna?** Vad som saknas. En saknad uppgift räknas inte som fritt utrymme.
2. **Hur stort är utrymmet?** Kända hinder, till exempel undervisningar utan lämplig sal. Antal möjliga tider och salar räknas inte före ett förslag.
3. **Vad har prövats?** Inte prövat, kontrollerat eller förslag beräknat.
4. **Hur bra blev kandidaten?** Tid, sal, kapacitet och håltid efter ett förslag.

**Kontrollera underlaget** söker hinder utan att lägga något schema. Kontrollen bevisar inte att hela schemat går att lägga.

**Ta fram schemaförslag** räknar fram ett förslag och tar dig till Lägg schema. Saknas uppgifter säger kortet vilka. Förslaget blir då ofullständigt: det som saknas läggs utan sal eller lärare och redovisas som lucka.

## Tid, sal och kapacitet

Ett förslag redovisas med tre besked i stället för en samlad status:

| Besked | Betydelse |
| --- | --- |
| Tid | Hur många pass som har fått en tid. |
| Sal | Hur många pass som ska ha sal och har fått en, hur många som saknar salbehov och hur många som inte har någon lämplig sal. |
| Kapacitet | Om platserna räcker, är för få eller inte är kontrollerade. |

Att alla pass har tid betyder inte att salarna är klara.

## Tilldela salar och behåll tiderna

När schemat redan har tider men pass saknar sal, eller har en sal som kontrollen har underkänt, visas **Tilldela salar och behåll tiderna** i Lägg schema.

1. Välj **Förhandsgranska salarna**. Du ser vilka pass som får sal, med nuvarande och föreslagen sal, och vilka pass som inte får plats.
2. Läs **Hinder**. Varje hinder säger vilka salar passet får ligga i och vad som upptar dem.
3. Välj **Använd salarna för … pass**, eller **Avbryt**.

- Ingen dag, starttid eller längd ändras. Låsta pass och pass med datumändring rörs inte.
- Schemamotorns kontroll prövar hela schemat med de föreslagna salarna innan du kan använda dem.
- **Använd** är ett steg i Ångra som återställer alla salar på en gång. **Avbryt** lämnar schemat orört.
- Ändras schemat eller salbehoven efter förhandsgranskningen måste du förhandsgranska igen.
- Pass som inte får plats står kvar som de är. Flytta berörda pass i veckan, ändra salbehoven eller lägg till salar.

När ett pass som ska ha sal saknar en, väljer kontrollen själv den första tillåtna salen, även om den är upptagen. Det syns då som en regelavvikelse för salen, och passet räknas in i Tilldela salar.

## Valt pass

Klicka på ett pass i veckan, eller välj det med tangentbordet och tryck Retur. Panelen under veckan visar passets tid, längd, lärare, sal och salbehov. Klicket ändrar ingenting.

1. Under **Pröva ny tid** väljer du dag och starttid. Med **−** och **+** går du till närmaste möjliga starttid före eller efter.
2. Under listorna står vad som händer vid den valda tiden, till exempel vilka pass som krockar.
3. Välj **Flytta hit** för att flytta passet, eller **Avbryt**.

Medan ett pass är valt visar veckan möjliga starttider som sammanhängande fält: fri tid, går med ett byte, bryter ett önskemål eller regelbrott. Ett fält säger bara läget. Orsakerna kan skilja sig inom fältet, så läs beskedet i panelen för den exakta starttiden.

## Före första förslaget

Du kan göra detta utan att något schema har räknats fram:

- lägga till egna villkor för klass, grupp, ämne och lärare
- välja antal lektioner per undervisning
- ändra villkor i tabell
- lägga till aktiviteter
- registrera salar och salbehov.

**Ångra** står överst och säger vad den avser, till exempel *Ångra: salbehov för Kemi*.

## Begränsningar

- **Önskad sal** sparas och visas men vägs inte av schemamotorn.
- Val av nationella prov finns inte. Provtid räknas inte in i ämnenas tid.
- Egna samtidighetsblock mellan utvalda pass går inte att registrera. Block från valmodulerna följer med från underlaget.
- Målen för schemat går inte att prioritera om.
- Appen kan inte avgöra om en lärare utan tidsvillkor har svarat. Läraren räknas som tillgänglig hela skoldagen.
- Lunch i matsal med sittningar och platser finns inte.
