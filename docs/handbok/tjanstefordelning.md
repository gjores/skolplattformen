---
title: Fördela tjänster på skolan
---

I **Tjänstefördelning** fördelar rektor skolans undervisning och specialuppdrag på lärare för ett läsår. Behovet kommer från klassernas timplaner. Lärartiden är ett eget värde som du anger. Lärarna ser fördelningen först när rektor har fastställt och publicerat den.

**Provstatus:** Arbetsgången nedan är provad i oktober 2026 mot ett eget skyddat bygge med riktig inloggning, egen databaskopia och bara syntetiska skolor, klasser och lärare, på dator (1440 × 900 och 1024 × 768) och telefon (390 × 844 och 320 × 740). Den är inte prövad med verkliga användare eller verkliga uppgifter.

## Vem gör vad?

| Funktion | Kan |
| --- | --- |
| Rektor | Förbereda fördelningen, fastställa och publicera den och skapa en ny version. |
| Skoladministratör | Förbereda fördelningen och ta bort ett opublicerat utkast. Rektor fastställer och publicerar. |
| Huvudman | Läsa fördelningen skrivskyddat från **Bemanning**. Huvudmannen beslutar inte om skolans fördelning. |
| Lärare med **Egen tjänst** | Läsa sin publicerade tjänst i **Min tjänst**, kvittera och kommentera. Se [Min tjänst](./min-tjanst.md). |

Servern prövar varje åtgärd. En dold knapp är bara en bekvämlighet: ett direktanrop utan rätt uppdrag nekas.

## Öppna fördelningen

1. Välj **Tjänstefördelning** under PLANERING i menyn.
2. Välj **Skola** och **Läsår** i planeringsvalet. En fördelning gäller en skola och ett läsår. Med **Alla behöriga skolor** visas texten *Välj en skola i planeringsvalet.*
3. Saknas fördelning visas *Ingen tjänstefördelning för läsåret … ännu*. Välj **Lägg till lärare i fördelningen**. Då skapas utkastet version 1 och du väljer den första läraren.

Behovet hämtas bara för klasser som är kopplade till en timplan för läsåret. Gymnasiets klasser kopplas i timplanens avsnitt om klasser. Grundskolans och introduktionsprogrammets klasser kopplas i Timplaner, se [Koppla GR- och IM-klasser](./timplaner.md#koppla-gr--och-im-klasser). Har ingen klass på skolan en timplan för läsåret visas *Ingen klass på skolan har en timplan för läsåret …* med knappen **Öppna klasskopplingar**.

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

## Tjänsterad: lärartid och avvikelse

Välj en cell i matrisen. Dialogen *Ny tjänsterad* visar timplanens behov med källa (timplan, version och ämnesrad), tid som redan är fördelad till andra och **Schemalagd tid: Underlag saknas**. **Lärartid HT** och **Lärartid VT** är förifyllda med behovet minus det som redan är fördelat. Ändra tiden i timmar, till exempel `37,5`. Avvikelsen räknas om medan du skriver. Välj **Spara tjänsteraden**.

Efter sparningen läses fördelningen om och fokus går tillbaka till cellen. Behov och lärartid sparas var för sig, så avvikelsen syns även senare. En kurs kan ha flera lärare. Varje lärare får då en egen rad, och täckningen summerar dem.

Saknas läraren i matrisen väljer du **Lägg till lärare i fördelningen**. Listan visar personer med andel på skolan och nya lärare som skolan har lagt upp. En person utan konto kan få rader och uppdrag.

## Ny lärare som huvudmannen kompletterar

Finns läraren inte i personalen väljer du **Lägg upp ny lärare** och anger förnamn och efternamn, och vid behov ett meddelande till huvudmannen. Läraren läggs upp som ny lärare för skolan, med märket **Ny lärare** i matrisen. Huvudmannen kompletterar anställning och andel i **Personal**, se [Personal och bemanning](./personal-och-bemanning.md).

## Specialuppdrag

Välj **Lägg till specialuppdrag** och ange **Typ** (Mentor, Programansvar, Speciallärare eller Annat uppdrag), **Lärare** eller Vakant, tid för HT och VT och vid behov en kommentar. Bara mentor kan kopplas till en klass. Övriga uppdrag får ingen grupp. Specialuppdrag räknas för sig i lärarens summa **Specialuppdrag** och blandas inte med undervisningen.

## Samläsning

En samläsning är en undervisningsgrupp med elever från flera klasser.

1. Öppna **Per kurs/ämne**.
2. Markera minst två rader i minst två olika klasser. Raderna får gälla olika kurser eller ämnen.
3. Välj **Koppla till samläsning…**, kontrollera namnet och ange lärartiden för gruppen.
4. Välj **Spara samläsningen**.

Lärartiden räknas en gång för läraren, och båda klasserna visas som täckta.

En rad i en samläsning behåller lärare och kurs. Vill du ändra något av dem, ändra eller lös upp samläsningen först. Tid och kommentar på raden ändrar du som vanligt.

En samläsning som inte uppfyller reglerna hindrar **Fastställ och publicera**. Panelen visar punkten, och knappen är inaktiv. Reglerna är att samläsningen har rader i minst två klasser och att lärartid bara gäller lärare som har en rad i gruppen. När du har ändrat eller löst upp samläsningen kan du publicera.

## Fastställ och publicera

Öppna **Fastställ och publicera** i statusraden. Panelen visar steget, eventuella hinder, **Versionshistorik** och **Lärarnas återkoppling**.

1. Välj **Fastställ och publicera…**.
2. Bekräfta i dialogen. **Behåll utkastet** har fokus från början.
3. Saknar ditt inloggningsbevis en färsk engångskod visar dialogen *Att fastställa och publicera kräver verifiering med engångskod.* Välj **Verifiera med engångskod**. Efter inloggningen kommer du tillbaka till Tjänstefördelning med samma skola och läsår. Gör om publiceringen.

När beskedet *Version … är fastställd och publicerad* visas ser lärarna versionen i Min tjänst. Historiken visar vem som publicerade och när. Skoladministratören ser texten *Rektor fastställer och publicerar fördelningen* och saknar beslutsknapp.

## Ny version och äldre versioner

En publicerad version går inte att ändra. Välj **Ändra i ny version**. Då skapas ett utkast, och statusraden visar *Lärarna ser version …, publicerad …* tills du publicerar det nya utkastet.

Under **Visa version** kan du öppna en äldre publicerad version. Den visas i sin helhet men skrivskyddad, med texten om vilken version lärarna ser.

## Lärarnas återkoppling

Efter publiceringen kan lärare med Egen tjänst kvittera att de har läst tjänsten och skriva kommentarer. Statusraden visar *Kvitterad av … av … lärare*. Under **Lärarnas återkoppling** står varje lärare med *Kvitterad …* eller *Inte kvitterad*, och kommentarerna med namn och tid. En kvittens betyder att läraren har läst tjänsten, inte att läraren godkänner den. Rektor svarar inte på kommentarer i appen.

## När något går fel

- **Någon annan har ändrat:** sparas samma rad från två flikar får den andra *Fördelningen har ändrats av någon annan. Din ändring har inte sparats.* Din inmatning står kvar. Välj **Hämta aktuellt läge** och gör om ändringen.
- **Svaret uteblev:** vyn kontrollerar om ändringen sparades och visar sedan beskedet. Inget skickas om automatiskt.
- **Säkerhetsloggen är inte tillgänglig:** åtgärden genomförs inte, och felet visas med en referens. Välj **Hämta igen** när loggen fungerar.
- **Uppdraget tillåter inte läsning:** innehållet töms och texten *Ditt aktuella uppdrag tillåter inte att läsa tjänstefördelningen för den här skolan.* visas.
- **Uppdraget har ändrats i en annan flik:** fliken rensas och du väljer **Ladda om**.

## På telefon

På telefon kan rektor och skoladministratör läsa fördelningen i vyerna Per lärare, Per klass, Specialuppdrag och Per kurs/ämne. Matris, åtgärdsrad och beslutsknappar finns bara på dator.

## Begränsningar

- **Ingen schemalagd tid.** **Schemalagd tid** visar *Underlag saknas* tills schemat finns i Skolplattformen.
- **Ingen kapacitetskontroll mot timmar.** Appen jämför inte lärarens tid med tjänstgöringsgrad eller andel och säger inte att någon har för mycket eller för lite.
- **Ingen arbetstidsram eller tjänstebedömning.** Fördelningen är inte en bedömning enligt arbetstidsregler eller avtal.
- **Inga årsrutiner ännu.** Förlänga från föregående läsår, flytta en tjänst till en annan person och massregistrera kommer i etapp 2.
- **Ingen överföring till eller från andra system.** Inget skickas till eller hämtas från till exempel tjänstebedömningsappen, ett schemasystem eller ett personalsystem.
