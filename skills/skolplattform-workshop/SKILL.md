---
name: skolplattform-workshop
description: Förbered en workshop när användaren vill utreda en utvecklingsfråga i Skolplattformen med verksamheten, eller använd utfallet för att ta fram lösningsförslag. Leder frågeguide och research, förbereder Workshopportalens agenda och frågor och omsätter återkoppling till prövbara nästa steg i GSD.
---

# Workshopflöde för Skolplattformen

Utgå från användarens beslut att workshoppa frågan. Fortsätt från den information som redan finns i chatten, koden och planeringen. Använd [Workshopportalens överlämning](references/workshopportalen.md) när du skapar underlag eller hämtar resultat.

## Förbered workshop

1. Identifiera utvecklingsfrågan, berörd arbetsuppgift och eventuella tidigare beslut. Vid koppling till en fas, läs `.planning/STATE.md`, relevant fasunderlag och tillämplig del av `.planning/codebase/`. Kontrollera dagens arbetsflöde i koden och använd befintlig research.
2. Ställ de följdfrågor som påverkar upplägget, i en kort omgång åt gången. Be vid behov om ett konkret tillfälle då arbetet fastnade, vilka roller som behöver delta, vad gruppen ska reda ut eller kunna besluta och vilka ramar som redan är beslutade. Gå vidare med research under tiden. Markera antaganden som är lätta att justera.
3. Undersök hur arbetet görs i dag, vad som är känt om behovet och vilken information workshopen behöver få fram. Spåra viktiga iakttagelser till kod, tidigare beslut, verksamhetsunderlag eller aktuella primärkällor. Anteckna datum eller version när det påverkar slutsatsen. För frågor om informationsutbyte, följ projektets regler för SS 12000 och kontrollera relevanta objekt, relationer och ansvar. Låt varje diskussionsfråga bidra till att fylla en kunskapslucka eller ge underlag till ett beslut.
4. Spara `.planning/workshops/<datum>-<kort-namn>/underlag.md` i projektet. Återanvänd samma arbetsreferens, normalt katalognamnet, när workshopen fortsätter. Ta med syfte, konkret scenario, berörda roller, önskat utfall, nuläge med källor, antaganden, avgränsningar och relevant fas eller krav. Föreslå aktiviteter och tidsfördelning som passar mötet. Ge diskussionsfrågorna stabila referenser som `F1` och `F2`. Lägg de deltagaranpassade portaltexterna under egna rubriker i underlaget så att fälten kan fyllas direkt.
5. Leverera filen, de färdiga portaltexterna och status för överlämningen. Om användaren ber dig spara ett utkast och det finns behörig portalåtkomst, använd ordinarie flöde och verifiera att utkast och frågor finns. Vid saknad åtkomst är fälttexterna överlämningen.

## Ta fram lösningar efter workshopen

1. Hitta samma arbetsreferens och hämta tillgängliga anteckningar, portalfrågor, pilotfeedback och uppdrag med användarens behörighet. Godta även användarens sammanfattning. Fråga endast efter utfall som behövs för nästa steg. Om resultat fortfarande saknas, märk framtagna idéer som hypoteser.
2. Spara `utfall-och-losningar.md` tillsammans med underlaget. Knyt iakttagelserna till relevanta frågereferenser och, där de finns, till portalpost eller mötesanteckning. Ange vad som observerades, vad deltagarna föreslog, vad ansvarig faktiskt beslutade och vad som är öppet. Bevara oenighet som påverkar lösningen. Använd avidentifierade sammanfattningar i projektet.
3. Utveckla rimliga lösningsalternativ utifrån iakttagelserna. Beskriv per alternativ vilket arbetsmoment det förbättrar, för vem, vilken insats och vilka beroenden det medför samt hur nyttan skulle kunna prövas. Jämför alternativ när det finns ett verkligt vägval. Rekommendera ett avgränsat första steg med ett konkret scenario och observerbara acceptanskriterier. För en prototyp på användarens begäran, följ Skolplattan och använd syntetiska exempel.
4. När användaren ber om GSD-överlämning, använd befintlig fas eller registrera frågan som fortsatt arbete. För vidare den dokumenterade riktningen med arbetsreferens, beslut, berörda krav och föreslagna verifieringsfall. Ett utkast kan gå vidare till fasdiskussion. Ändra kraven eller genomför en lösning när det stöds av ett beslut och den aktuella beställningen.
