# Administrationsgränssnitt: research och byggbeslut

5 september 2026. Fokus: elever, individuella studieplaner, undervisningsgrupper, schema och resurser. Formspråket i den första appversionen behålls, medan arbetsytans struktur utgår från administratörens arbete.

## Källor och slutsatser

| Primärkälla | Vad källan stödjer | Beslut för denna iteration |
|---|---|---|
| [Skolverket: Fördelning av elever, individuell studieplan och rätt att fullfölja utbildning](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/stod-for-gymnasieantagning/fordelning-av-elever-individuell-studieplan-och-ratt-att-fullfolja-utbildning) | Studieplanen beskriver elevens utbildningsväg och innehåll. Introduktionsprogram behöver ytterligare uppgifter om mål, längd och insatser. | Skolform och utbildningskull styr språk och innehåll. Visa Gy11/Gy25 separat, och särskilda mål för IM. En grundskoleelev får inte en gymnasial studieplan av misstag. |
| [Skolverket: Studieplanering i Gy25](https://www.skolverket.se/styrning-och-ansvar/anordna-utbildning/anordna-gymnasieutbildning/studieplanering-i-gymnasieskolan-och-anpassade-gymnasieskolan-i-gy25) | Tidigare kurser kan behöva finnas tillsammans med ämnesnivåer i planeringen. Programbyte är mer än att ändra en klassetikett. | Den första implementationen skiljer undervisningsgruppbyte från byte av klass eller program. Planändringar sparas som tydliga utkast, med före/efter och orsak. Ingen automatisk betygsomvandling eller examensvalidering. |
| [Royal Schedule: Funktioner](https://www.royalschedule.com/education/features) | Leverantören beskriver resursplanering, krysschema, krockanalys och koppling via SS12000. Detta är produktinformation, inte ett verifierat integrationsprov. | Schemat behöver visa lärare, lokal och berörd grupp tillsammans. Ändringsförslag kontrolleras för överlapp och kapacitet innan de tillämpas i exemplet. Royal förblir referens; ingen integration påstås vara ansluten. |
| [Royal Schedule: SS12000](https://ss12000.royalschedule.com/) | Sökutdraget beskriver aktiviteter, grupper och resurser. Den fullständiga API-dokumentationen gick inte att läsa i researchverktyget och har inte verifierats. | Separata objekt för elev, klass, undervisningsgrupp och schemapass; gemensamma identifierare och spårbara relationer i alla fyra vyer. |
| [Carbon: Data table](https://carbondesignsystem.com/components/data-table/usage/) | Tabeller stödjer sökning, sortering, radval och gemensamma åtgärder. Åtgärdsfält visas vid urval. | Elevregistret blir arbetsytan. Markering gäller synliga rader och nollställs vid ändrad filtrering. Antal valda och exakt åtgärd visas före tillämpning. |
| [GOV.UK: Check answers](https://design-system.service.gov.uk/patterns/check-answers/) | Användaren ska kunna granska uppgifter, korrigera och bekräfta en ändring. | Gruppbyte och schemaändring visar före/efter, berörda elever, blockerande problem och tydlig slutknapp. Ett förslag visas aldrig som redan genomfört. |

## Vad som ska göra arbetsytan bättre

Elevregistret prioriterar identifiering, klass, utbildning, mentor och datakvalitet. Ett klick öppnar ett elevkort utan att listans filtrering går förlorad. Studieplan och grupper går att nå från samma elev. Den som hanterar flera elever kan välja dem och förbereda ett gemensamt gruppbyte. Sökning går på namn, elev-ID och klass. Uppgifter som kräver åtgärd visas som konkreta avvikelser, inte ett generellt riskpoängtal.

Studieplaneringen visar ett tydligt terminsutdrag med poäng och gruppkoppling. Det är inte en komplett examensprövning. IM visar dessutom utbildningsmål och planerad period. Planutkast innehåller orsak, ändrat innehåll och berörda relationer; den tidigare versionen finns kvar tills ett separat fastställandeflöde har införts.

Gruppvyn sammanför medlemskap, kapacitet, undervisning och schemapass. Klass och undervisningsgrupp är skilda. Ett gruppbyte kan ändra elevens schematillhörighet och studieplanens gruppreferens; ett klassbyte får inte härledas från det. Schemaändringar kontrollerar lärare, lokal, grupp, gemensamma elever och lokalstorlek i det tillgängliga exempelunderlaget.

Den visuella riktningen är en tätare men läsbar administrativ arbetsyta: neutrala tabeller, lågmälda skiljelinjer, blå aktiva val och en fast verktygsrad. Avvikelser får text och handling. Mobilen får staplade elevkort och fullbreddspaneler, inte bara en nedskalad skrivbordstabell.

## Avgränsning och senare validering

Gemensam sessionsdata knyter ihop vyerna. Ingen produktionsdatabas, identitetskontroll, verklig behörighet, registerimport eller anslutning till Royal/SchoolSoft införs i denna iteration. Säker inloggning, varaktig lagring, samtidig redigering, revisionslogg på servern, giltighetsperioder och verksamhetsprövade publiceringsflöden återstår. Kontrollerna gäller känt exempelunderlag, inte alla svenska programregler eller skolans totala schema.

Föreslagna användarprov: hitta elev, kontrollera studieplan, byta grupp för flera elever, förstå en kapacitetskonflikt och flytta ett pass utan att dubbelboka lärare eller lokal. Mät slutförande utan hjälp, fel, återhämtning och tid. Påståendet om ett mycket bra administrationsgränssnitt måste prövas med skoladministratörer, SYV och schemaläggare; det kan inte styrkas enbart med en designskiss.
