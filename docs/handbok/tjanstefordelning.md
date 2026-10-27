---
title: Fördela tjänster på skolan
---

I **Tjänstefördelning** fördelar rektor skolans undervisning och specialuppdrag på lärare för ett läsår. Behovet kommer från klassernas timplaner. Lärartiden är ett eget värde som du anger. Lärarna ser fördelningen först när rektor har fastställt och publicerat den.

**Provstatus:** Arbetsgången nedan, med läsårets behov, aktiva lärarval, förslag, flytt, massregistrering och borttagning av tom lärarkolumn, är provad i oktober 2026 mot ett eget skyddat bygge. Provet gjordes med riktig inloggning, en egen databaskopia och bara syntetiska skolor, klasser och lärare. Datorn provades i 1440 × 900 och 1024 × 768 och telefonen i 390 × 664 och 320 × 740 (Safari-motor). Arbetsgången är inte prövad med verkliga användare eller verkliga uppgifter.

## Vem gör vad?

| Funktion | Kan |
| --- | --- |
| Rektor | Planera fördelningen, fastställa och publicera den samt fortsätta ändra inför nästa publicering. |
| Skoladministratör | Planera fördelningen och ta bort opublicerade ändringar. Rektor fastställer och publicerar. |
| Huvudman | Läsa fördelningen skrivskyddat från **Bemanning**. Huvudmannen beslutar inte om skolans fördelning. |
| Lärare med **Egen tjänst** | Läsa sin publicerade tjänst i **Min tjänst**, kvittera och kommentera. Se [Min tjänst](./min-tjanst.md). |

Du behöver ett aktuellt uppdrag för skolan för att läsa eller ändra fördelningen.

## Öppna fördelningen

1. Välj **Tjänstefördelning** under PLANERING i menyn.
2. Välj **Skola** och **Läsår** i planeringsvalet. En fördelning gäller en skola och ett läsår. Med **Alla behöriga skolor** visas texten *Välj en skola i planeringsvalet.*
3. Skolans aktuella behov visas även om ingen tjänst ännu har fördelats. Välj ett behov i matrisen, välj lärare på raden och spara. Du behöver inte skapa en version först.

När du öppnar nästa läsår visas det årets klass–timplanskopplingar och behov. Nya lärarfält är tomma. Sparade val, tider och kommentarer finns kvar när du fortsätter en påbörjad planering; inget ersätts automatiskt med föregående års fördelning.

Behovet hämtas bara för klasser som är kopplade till en timplan för läsåret. En gymnasieklass behöver en koppling för **varje** läsår, även i årskurs 2 och 3. Gymnasiets klasser kopplas under timplanens **Klasser och läsår**, där du väljer **Läsår för klassens timplan**, se [Koppla en eller flera klasser till ett läsår](./timplaner.md#koppla-en-eller-flera-klasser-till-ett-läsår). Grundskolans och introduktionsprogrammets klasser kopplas i Timplaner, se [Koppla GR- och IM-klasser](./timplaner.md#koppla-gr--och-im-klasser). Saknar en klass koppling för läsåret visas knapparna **Klasskopplingar för gymnasiet** och **Klasskopplingar för GR och IM**. Välj den som gäller klassen. Läsåret följer med.

## Matris och vyer

**Matris** visar en rad per kurs eller ämne och klass och en kolumn per lärare. Varje klass har en rubrikrad med timplan, version och täckning, till exempel *100 av 100 h · 2 lärare*. Kolumnerna **Behov**, **Fördelat** och **Avvikelse** gäller vald tid: **Hela läsåret**, **HT** eller **VT**. Fotraden visar **Undervisning**, **Specialuppdrag** och **Totalt** per lärare. Under lärarens namn står **Andel här**, lärarens andel på skolan enligt huvudmannens personaluppgifter. Andelen är en upplysning. Appen jämför inte tiden med andelen.

Behovet räknas så här:

- **Gymnasiet (Gy25):** timplanens skoltid för klassens årskurs per termin.
- **Grundskolan:** årskursens årstimmar delas lika på HT och VT.
- **Introduktionsprogram:** timmar per vecka gånger skolans skoldagar per termin enligt den fastställda läsårskalendern. Utan fastställd kalender är behovet okänt.

En klass utan koppling visas som *KLASS · koppling saknas* och texten *Behovet är okänt, inte noll.* Klassen ger inga nollor i behov eller summor.

Övriga vyer:

- **Per klass:** klassens kurser med behov, fördelad tid och alla lärare på varje rad.
- **Per lärare:** lärarens rader, specialuppdrag och summor per termin, andel på skolan och **Schemalagd tid: Underlag saknas**.
- **Specialuppdrag:** alla uppdrag med lärare, grupp och tid.
- **Per kurs/ämne:** raderna grupperade per ämne. Här kopplar du samläsning.

Filtren **Klass**, **Ämne** och **Lärare** samt **Visa bara avvikelser och saknade kopplingar** begränsar matrisen. Skola och läsår står inte i adressen.

Välj ett **kursnamn** i matrisen för att se alla klasser med samma kurs i **Per kurs/ämne**. Kurserna jämförs med kurskod eller ämnesrad, inte bara namn. Därifrån kan du markera rader för en samläsning. **Rensa filter** visar alla kurser igen. Märket **Samläsning** på en rad, och *Samläsning med …* i **Per klass**, öppnar den aktuella samläsningen i **Per kurs/ämne**.

### Lärarkolumner och linser

Med många lärare visar matrisen som standard bara **relevanta lärare**: de som har tid på raderna som syns. Lärare utan undervisning, till exempel en nyss tillagd lärare eller en lärare med bara specialuppdrag, visas när inget filter är valt. Väljer du ämnet Engelska syns alltså bara engelsklärarna. Raden ovanför matrisen visar *Visar 5 av 40 lärare*.

- **Visa alla lärare (40)** visar alla kolumner. **Visa relevanta lärare** går tillbaka.
- **Fäst lärare:** en fäst lärare visas alltid. Du fäster med nålen i lärarens kolumnrubrik, eller med **Fäst lärare**, där du kan söka.
- **Kompakta kolumner** visar initialer och lärarens totala tid. Hela namnet visas när du pekar på eller går till kolumnen.
- **Lins:** **Alla behov**, **Ofördelat** (känt behov som inte är täckt för vald tid, eller en vakant rad) och **Samläsningar**. Linsen gäller tillsammans med övriga filter. Okänt behov räknas inte som ofördelat.
- **Sparade linser:** spara aktuell lins, filter och kolumnval under ett namn. Med **Använd** visas linsen igen, och med **Ta bort lins** tas den bort.

Behöver du en lärare som inte syns, välj cellen i kolumnen **Vakant** och sök läraren i dialogen, eller välj **Visa alla lärare**.

Fästa lärare, kompakta kolumner och sparade linser sparas bara i den här webbläsaren, för ditt konto, skolan och läsåret. De följer inte med till en annan dator och syns inte för andra. Om webbläsaren inte sparar uppgifterna visas matrisen som standard.

## Fördela: bemanna behov i följd

Vyn **Fördela** (på dator) är till för att bemanna många ofördelade behov efter varandra.

- **Kön** till vänster visar ofördelade behov: känt behov som inte är täckt för vald tid, eller en vakant rad. Okänt behov ingår inte. Du kan söka och gruppera per klass eller per ämne. Filtren och linsen ovanför gäller också här.
- **Panelen** till höger visar det valda behovet:
  - behov enligt timplanen och det som redan är fördelat
  - förslag utifrån tidigare planering, med skäl och källa
  - sökning bland alla lärare
  - lärartid HT och VT, förifylld med det som återstår. Du kan ändra tiden innan du väljer.
- För varje lärare visas egen andel på skolan, *Behörighetsunderlag saknas* och lärarens undervisning **nu** och **efter valet** (HT, VT och läsår). Summorna visar fördelad tid, inte ledig tid.
- **Välj** sparar raden direkt, och kön går vidare till nästa behov. Ingen lärare är förvald. Ett behov som är delvis fördelat ligger kvar i kön tills det är täckt. Om behovet har en vakant rad ersätts den av valet.
- **Tangentbord:** <kbd>↑</kbd> och <kbd>↓</kbd> byter behov, <kbd>1</kbd>–<kbd>9</kbd> väljer läraren med den siffran, <kbd>V</kbd> väljer Vakant, <kbd>N</kbd> hoppar över och <kbd>/</kbd> går till sökningen.
- **Samma kurs i andra klasser** visas som information. **Visa alla klasser med kursen** öppnar Per kurs/ämne, där du kan koppla en samläsning.
- Om någon annan har ändrat fördelningen under tiden visas *Underlaget har ändrats*. Dina tider finns kvar. Panelen hämtar aktuellt underlag, och sedan väljer du igen.
- Vill du ändra en sparad rad gör du det i matrisen. Fördela har ingen egen ångra-funktion.

På telefon visar Fördela en lista över ofördelade behov, utan val.

## Tjänsterad: lärartid och avvikelse

Välj en cell i matrisen. Dialogen **Ny tjänsterad** visar timplanens behov med källa, tid som redan är fördelad till andra och **Schemalagd tid: Underlag saknas**.

1. Kontrollera **Lärartid HT** och **Lärartid VT** överst. När behovet är känt förifylls det som återstår efter redan fördelad tid. Ändra vid behov, till exempel till `37,5` timmar. Om behovet är okänt är tidsfälten tomma; ange då tiden själv och skriv `0` om en termin saknar tid. Minst en termin måste ha tid. Skriv eventuell kommentar.
2. Välj lärare. **Raden sparas när du väljer**: ett förslag, en lärare du har sökt fram eller **Vakant**. Ingen lärare är förvald, inte ens om du öppnade raden från en namngiven lärarkolumn. Om tiden är felaktig sparas inget, och felet visas vid fältet.
3. För en sparad rad finns också **Spara tjänsteraden**, för att ändra bara tid eller kommentar utan att byta lärare. Väljer du en annan lärare sparas bytet direkt.

En vanlig tjänsterad behöver ingen separat förhandsvisning.

Förslagen förklarar vilken tidigare planering de bygger på, exempelvis samma klass föregående läsår. Det är inte bevis på vem som faktiskt har undervisat eller vem som är behörig. Samma namn, liknande klassnamn eller en följande kursnivå skapar inte en koppling. Att skriva i sökfältet eller trycka Enter där väljer ingen person; använd personens väljknapp.

Lärarvalet visar egna skoluppdrag, andel och giltighetsdatum. En delårsperiod ska inte tolkas som tillgänglighet under hela året. **Behörighetsunderlag saknas** betyder att appen inte kan bedöma lärarens ämnesbehörighet. Uppgifterna och tidssummorna är inte ett besked om ledig kapacitet.

Om historiska förslag inte kan hämtas visas det. Du kan fortfarande välja lärare manuellt eller välja Vakant om det aktuella behovet och lärarunderlaget går att kontrollera. Kan det aktuella underlaget inte kontrolleras stoppas sparningen.

Efter sparningen läses fördelningen om och fokus går tillbaka till cellen. Behov och lärartid sparas var för sig, så avvikelsen syns även senare. En kurs kan ha flera lärare med var sin rad. När du ändrar en sparad rad bevaras dess val. Om läraren inte längre har ett aktuellt skoluppdrag visas den sparade tilldelningen, men du behöver välja en aktuell lärare eller Vakant. Valet sparar raden.

Du kan också använda **Lägg till lärare i fördelningen** för att lägga till en tom lärarkolumn. En person utan konto kan få rader och uppdrag.

## Flytta uppdrag

1. Välj **Flytta uppdrag** och välj läraren som uppdragen ska flyttas från.
2. Välj mållärare eller Vakant och välj **Bekräfta mållärare**.
3. Markera exakt vilka undervisningsrader och specialuppdrag som ska flyttas.
4. Välj **Förhandsvisa**. Granska före och efter, berörda samläsningar och lärarnas tidssummor.
5. Välj **Spara ändringarna** när förhandsvisningen stämmer.

Hela berörda samläsningar visas. Lärarens grupptid räknas en gång, och andra lärares uppdrag och grupptider bevaras. Använd **Markera lärarens alla rader i samläsningen** när hela lärarens del ska flyttas. Ett ofullständigt eller motstridigt urval måste rättas före sparning.

## Massregistrera

Välj **Massregistrera** och markera behoven du vill fördela. Varje ny rad börjar utan lärare. Välj lärare per rad, eller välj **Lärare för markerade behov** och **Använd valet på markerade behov**. Det gemensamma valet gäller bara de behov som redan är markerade; senare markerade behov har fortfarande tomt lärarfält. Historiska förslag tilldelas aldrig automatiskt till ett helt urval.

Kontrollera tider och kommentarer för varje rad. Specialuppdrag läggs uttryckligen till i urvalet; mentorskap kräver en aktuell klass. Välj **Förhandsvisa**, granska resultatet och välj **Spara ändringarna**. Tidigare sparat arbete i läsåret bevaras.

Flytt och massregistrering får omfatta högst 100 berörda objekt per omgång. Alla medlemmar i en berörd samläsning räknas in, även de som bevaras. Ett stort underlag med mycket text kan också behöva minskas. Appen delar inte upp sparningen automatiskt: spara ett uttryckligt mindre urval och fortsätt sedan med nästa.

## Ta bort en tom lärarkolumn

Öppna **Tomma lärarkolumner**, välj **Ta bort tom lärarkolumn…** och bekräfta. Kolumnen får inte ha kvar undervisningsrader, specialuppdrag eller samläsningstid. Åtgärden tar bara bort kolumnen ur planeringen. Personen finns kvar i **Personal**, och tidigare publiceringar ändras inte.

Om en lärares skoluppdrag har upphört kan det hindra publicering. Flytta eller ändra de kvarvarande uppdragen och ta därefter uttryckligen bort den tomma kolumnen. Appen rensar inte bort planerat innehåll automatiskt.

## Ny lärare som huvudmannen kompletterar

Finns läraren inte i personalen väljer du **Lägg upp ny lärare** och anger förnamn och efternamn, och vid behov ett meddelande till huvudmannen. Läraren läggs upp som ny lärare för skolan, med märket **Ny lärare** i matrisen. Huvudmannen kompletterar anställning och andel i **Personal**, se [Personal och bemanning](./personal-och-bemanning.md).

## Specialuppdrag

Välj **Lägg till specialuppdrag** och ange **Typ** (Mentor, Programansvar, Speciallärare eller Annat uppdrag), **Lärare** eller Vakant, tid för HT och VT och vid behov en kommentar. Bara mentor kan kopplas till en klass. Övriga uppdrag får ingen grupp. Specialuppdrag räknas för sig i lärarens summa **Specialuppdrag** och blandas inte med undervisningen.

## Samläsning

En samläsning är en undervisningsgrupp med elever från flera klasser.

1. Öppna **Per kurs/ämne**.
2. Markera minst två rader i minst två olika klasser. Raderna får gälla olika kurser eller ämnen, men de ska ha **samma lärare** (eller alla vara vakanta).
3. Välj **Koppla till samläsning…**, kontrollera namnet och ange lärartiden för gruppen.
4. Välj **Spara samläsningen**.

Lärartiden räknas en gång för läraren, och båda klasserna visas som täckta.

En samläsning har en lärare för alla klasser. Har de markerade raderna olika lärare, eller både en lärare och vakant, visar dialogen det och **Spara samläsningen** är inaktiv. Byt lärare på raderna eller använd **Flytta uppdrag** först. Två lärare i samma grupp (flerlärarskap) hanteras inte som samläsning.

Dialogen och samläsningens avsnitt i **Per kurs/ämne** varnar när timplanstiden skiljer sig mellan klasserna per termin, och när en klass har APL under läsåret men en annan inte har det. Då kan gruppen inte schemaläggas tillsammans under APL-perioderna. Om APL inte går att avgöra för en klass står det att APL är okänd. Varningarna är stöd för beslutet och hindrar inte att du sparar.

En vanlig radändring i en samläsning behåller lärare och kurs. Använd **Flytta uppdrag** för en granskad flytt till en annan lärare. Vill du ändra kurs eller gruppens sammansättning, ändra eller lös upp samläsningen först. Tid och kommentar på raden ändrar du som vanligt.

En samläsning som inte uppfyller reglerna hindrar **Fastställ och publicera**. Panelen visar punkten, och knappen är inaktiv. Reglerna är att samläsningen har rader i minst två klasser, att alla rader har samma lärare och att lärartid bara gäller den läraren. En äldre samläsning med flera lärare märks **Samläsning · olika lärare** i matrisen. Appen rättar den inte automatiskt. När du har flyttat uppdragen till samma lärare eller löst upp samläsningen kan du publicera.

## Fastställ och publicera

Öppna **Fastställ och publicera** i statusraden. Panelen visar publiceringsläget, eventuella hinder och **Lärarnas återkoppling**.

1. Välj **Fastställ och publicera…**.
2. Bekräfta i dialogen. **Behåll utkastet** har fokus från början.
3. Saknar ditt inloggningsbevis en färsk engångskod visar dialogen *Att fastställa och publicera kräver verifiering med engångskod.* Välj **Verifiera med engångskod**. Efter inloggningen kommer du tillbaka till Tjänstefördelning med samma skola och läsår. Gör om publiceringen.

När beskedet *Version … är fastställd och publicerad* visas ser lärarna versionen i Min tjänst. Historiken visar vem som publicerade och när. Skoladministratören ser texten *Rektor fastställer och publicerar fördelningen* och saknar beslutsknapp.

## Fortsätt planera efter publicering

Fortsätt i samma arbetsyta. Den första vanliga ändringen sparas som opublicerad planering utan att ändra det lärarna redan ser. Statusen visar **Ändringar ännu inte publicerade** och vilken publicering lärarna ser. Först när rektor fastställer och publicerar igen blir ändringarna synliga i Min tjänst och Bemanning.

**Historik** öppnar en tidigare publicering skrivskyddat. Välj publicering under **Historisk publicering** och använd **Tillbaka till planeringen** för att fortsätta arbeta.

## Lärarnas återkoppling

Efter publiceringen kan lärare med Egen tjänst kvittera att de har läst tjänsten och skriva kommentarer. Statusraden visar *Kvitterad av … av … lärare*. Under **Lärarnas återkoppling** står varje lärare med *Kvitterad …* eller *Inte kvitterad*, och kommentarerna med namn och tid. En kvittens betyder att läraren har läst tjänsten, inte att läraren godkänner den. Rektor svarar inte på kommentarer i appen.

## När något går fel

- **Underlaget har ändrats:** någon kan ha ändrat planeringen, skoluppdraget eller förslagsunderlaget sedan du gjorde ditt val. Sparningen stoppas och dina inmatade tider och din kommentar finns kvar. Hämta aktuellt läge och nytt planeringsstöd enligt beskedet, granska underlaget och välj lärare på nytt. I flyttverktyget bekräftar du målläraren igen. Om den gamla raden inte längre finns väljer du uttryckligen en aktuell rad; appen väljer ingen ersättningsrad åt dig.
- **Svaret uteblev:** vyn kontrollerar om ändringen sparades och visar sedan beskedet. Inget skickas om automatiskt. Vanliga ändringar, flytt och massregistrering är spärrade medan sparläget är okänt. Använd **Kontrollera sparstatus** om det erbjuds.
- **Säkerhetsloggen är inte tillgänglig:** åtgärden genomförs inte, och felet visas med en referens. Välj **Hämta igen** när loggen fungerar.
- **Uppdraget tillåter inte läsning:** innehållet töms och texten *Ditt aktuella uppdrag tillåter inte att läsa tjänstefördelningen för den här skolan.* visas.
- **Uppdraget har ändrats i en annan flik:** fliken rensas och du väljer **Ladda om**.

## På telefon

På telefon kan rektor och skoladministratör läsa fördelningen i vyerna Per lärare, Per klass, Specialuppdrag och Per kurs/ämne. Matris, redigering, flytt och massregistrering finns bara på dator. Linsväljaren finns i Per kurs/ämne och Fördela. Fästa lärare och sparade linser finns bara på dator. Fördela visar på telefon bara en lista över ofördelade behov. **Publiceringsstatus** öppnar en läspanel utan publicerings- eller borttagningsknappar. Läraren läser och kvitterar sin publicerade tjänst i Min tjänst. Om fönstret blir smalare under pågående inmatning bevaras formuläret för återgång till datorläget; byt inte skola, läsår eller uppdrag för att fortsätta samma inmatning.

## Begränsningar

- **Ingen schemalagd tid.** **Schemalagd tid** visar *Underlag saknas* tills schemat finns i Skolplattformen.
- **Ingen kapacitetskontroll mot timmar.** Appen jämför inte lärarens tid med tjänstgöringsgrad eller andel och säger inte att någon har för mycket eller för lite.
- **Ingen arbetstidsram eller tjänstebedömning.** Fördelningen är inte en bedömning enligt arbetstidsregler eller avtal.
- **Ingen automatisk årsöverföring.** Nästa läsårs behov planeras med aktiva lärarval. Tidigare planering är förslagsunderlag, inte ett nytt beslut.
- **Ingen verifierad lärarbehörighet.** Skoluppdrag, datum och tidigare planering ersätter inte uppgifter om legitimation och ämnesbehörighet.
- **Ingen överföring till eller från andra system.** Inget skickas till eller hämtas från till exempel tjänstebedömningsappen, ett schemasystem eller ett personalsystem.
