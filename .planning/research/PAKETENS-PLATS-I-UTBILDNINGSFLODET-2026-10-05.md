# Paketens plats i utbildningsflödet

Datum: 2026-10-05. Status: **arkitektur- och verksamhetsförslag efter användarens begärda omprövning**, inte godkänd ombyggnad. Användaren ifrågasätter om paketen hör hemma i programplanen och vill bedöma kopplingen till studieplaner och tjänstefördelning. Tidigare genomförda A/B/C/D och deras provresultat består; de bevisar funktion enligt den tidigare beställningen, inte att placeringen är den bästa. Ingen produktkod, databas, handbok eller befintlig plan har ändrats i denna översyn.

## Bedömning

Pakethanteringen bör ha sin huvudsakliga arbetsyta i **skolans utbud och elevval**. Programplanen behöver fortsatt beskriva det valbara utrymmet: typ, poäng och planerad terminsram. Den enskilda elevens val ska bli konkret innehåll i studieplanen. Tjänstefördelningen använder därefter undervisningsbehovet från dessa nivåer och deras perioder.

Utbudet behöver förberedas före elevvalen. Att vänta med all pakethantering tills grupper och lärare ska tilldelas skulle göra det svårt att informera elever, planera resurser och kontrollera vad skolan kan erbjuda. Bemanning och gruppstorlek behöver därför kunna planeras med uppskattade elevantal och sedan stämmas av mot faktiska val. Detta är ett iterativt flöde, inte en spärr där all tjänstefördelning måste vänta på sista elevvalet.

Förslaget gäller både **plats i appen** och **genomförandeordning**: behåll ramen i den aktuella programplansleveransen; utveckla det fulla operativa utbudet tillsammans med STUDY-01/GROUP-01 och SCHEMA-01. Ett namnbyte eller flyttad knapp räcker inte som slutlig lösning.

## Föreslagna ansvarsgränser

| Del | Fråga användaren besvarar | Eget innehåll |
|---|---|---|
| Programplan | Vilket innehåll och vilket valbart utrymme ingår i utbildningen? | Fasta nivåer, blockets typ/poäng, terminsram och beslutade planversioner. Fasta programfördjupningsnivåer förblir fasta. |
| Skolans utbud | Vilka alternativ planerar skolan att erbjuda för en viss elevkull/valperiod? | Återanvändbara paketversioner, tillåtna utbildningar/block, erbjudandeperiod, valomgång och utbudsbeslut. |
| Elevval och studieplan | Vilka alternativ har eleven önskat och vilka ämnen/nivåer ska eleven faktiskt läsa? | Önskemål och bekräftat val som skilda uppgifter, exakta paket-/planreferenser, konkreta studierader, avvikelser och historik. |
| Undervisningsgrupper och tjänstefördelning | Hur organiserar och bemannar vi undervisningsbehovet? | Ämne/nivå, språk vid behov, period, undervisningstid, kapacitet, datumsatta elevmedlemskap och läraruppdrag. |
| Schema | När och var genomförs undervisningen? | Verifierat behov, grupper, lärare, rum, kalender och konkreta lektionstillfällen. |

Timplanen är undervisningstidens underlag genom flödet. Gymnasiepoäng är inte lärartimmar. Alternativa paket ska inte summeras som om varje elev läser alla alternativen.

## Föreslaget användarflöde

1. Huvudman/rektor arbetar med programplanens fasta innehåll och valbara ramar enligt aktuellt mandat. Moderna språk, HU/NA:s val och IV får ramrader så att poängen är kompletta, även innan det konkreta utbudet för en valomgång är färdigt.
2. I **Skolans utbud** väljer användaren skola och valperiod/elevkull. Återanvändbara paket skapas eller hämtas från biblioteket och kopplas till tillåtna block. Samma IV-utbud kan användas av flera program. Färdigt paket och enstaka nivå kan båda vara alternativ; första leveransens valregel behöver inte breddas samtidigt.
3. Utbudet görs tillgängligt för elevval efter kontroll och behörigt beslut. Preliminärt utbud, öppet val och bekräftat erbjudande ska kunna skiljas åt. Den exakta besluts-/publiceringsvägen behöver planeras; paketets nuvarande skapanderätt ger inte i sig en ny verksamhetsrätt att besluta utbud.
4. Elevens önskemål prövas mot just elevens studieväg och tidigare studier. Ett bekräftat val skapar konkreta nivåer i studieplanen med spårbar hänvisning till paketversion och valomgång. Paketnamnet får inte ersätta de nationella nivåidentiteterna.
5. Valen ger summerat undervisningsbehov per nivå, språk, skola och period. Skolan skapar eller justerar grupper och bemanning. Prognos och faktiskt bekräftat antal hålls isär.

Exempel: ett IV-alternativ Fotografi 100 p kan erbjudas för både SA och EK. Om eleverna läser samma exakta nivå på samma skola och under förenliga perioder kan de samlas i samma undervisningsgrupp. Varje elev får sin egen 100-poängsrad och gruppkoppling. Ett paket med två nivåer kan däremot behöva flera undervisningsgrupper över tid. **Paket är inte samma objekt som undervisningsgrupp.**

En gemensam terminsram är inte bevis för att alternativen måste gå samtidigt på veckoschemat. Samtidighet bör vara en uttrycklig regel för en valomgång/grupporganisation om skolan behöver ett gemensamt valfönster. Terminsplacering, undervisningstimmar och veckoschema är skilda uppgifter.

## Vad den aktuella implementationen visar

Berörd kod är läst, inklusive `web/lib/programplan-packages.ts`, `web/lib/programplan-analysis.ts`, `web/app/protected-programplan-packages.tsx` och `web/app/protected-programplan-workspace.tsx`. Den äldre kodkartan beskriver inte automatiskt det nuvarande skyddade läget.

- `programplan_packages` och DTO:n `ProgramplanValpaket` skiljer redan oföränderligt paketinnehåll från skolans användning. Katalogreferenser, versioner, mandat och audit är användbar grund även vid en annan placering i appen.
- `ProgramplanUnitPackages` och skrivkontraktet binder däremot erbjudna alternativ och deras fördelning direkt till `planId + unitId + blockId`. Här finns ännu inte en egen valomgång med period, elevönskemål och bekräftade val.
- UI hämtar biblioteket och skolans paketval inne i programplansarbetsytan. Skolans operativa utbud blir därför en uppgift som användaren möter under planens ramfördelning.
- Analysen blandar kontroll av programramen med kontroll av erbjudna alternativ och IV-utbud. Saknade paket kan blockera planens nuvarande klarstatus. Vid en uppdelning behöver ramens färdigstatus och utbudets färdigstatus skiljas åt; utbudsbrister ska fortsätta synas i rätt arbetsflöde.
- Äldre `web/lib/admin-model.ts` har exempelmodeller för studieplansrader/grupper. `page.tsx` monterar separat `ProtectedHome` i skyddat läge. Exempelmodellerna är inte en färdig beständig koppling från dagens paket till studieplan/tjänstefördelning; STUDY-01 och GROUP-01 är fortsatt öppna.
- Språkalternativ använder C:s inbäddade språkform, medan D:s generella ämnespaket har biblioteksversioner. Ett framtida utbud måste hantera båda med spårbar identitet och utan att fabricera nya historiska referenser.

Det tekniska arbetet behöver alltså inte kastas bort. Det som bör omprövas är var skapande/erbjudande sker och vilket objekt som äger en faktisk valomgång.

## Konsekvenser för fortsatt GSD-arbete

**Föreslagen ordning, ännu inte godkänd:**

1. Gör programplanen begriplig som utbildningens innehåll och ram. Paketbibliotek och skolutbud får en egen ingång; ramraden kan visa en kort sammanfattning och länka till relevant utbud.
2. Behåll befintliga paket, versioner och plan-/skolkopplingar läsbara. Migrera inte dem genom radering eller automatisk ombindning. Flyttad UI och ändrad lagringsägare är separata, kontrollerbara steg.
3. Precisera kontraktet för valomgång, period/elevkull, erbjudna paketversioner, önskemål/bekräftat val och studieplansrader innan det fulla elevvalsflödet byggs.
4. Förbered tjänstefördelningens prognos/gruppbehov i samma kontraktsarbete. Verifiera nivå- och periodkopplingar, delade grupper mellan program och konsekvenser av ett omval. Ett gruppbyte får inte skriva om elevens valda utbildningsinnehåll utan rätt studieplansflöde.

05-23 E är hittills planerad som slutverifiering av den tidigare beställda placeringen. Den ska inte tolkas som ett beslut om att denna placering är slutlig efter användarens nya fråga. A/B/C/D:s resultat bevaras; det behövs ett ställningstagande till förslaget innan E:s omfattning ändras eller en ombyggnad genomförs.

05-27/05-28 är ännu planerade och förutsätter en fryst kopia av skolans paketrevision när en timplan skapas. Om ett konkret årsutbud senare kan ändras oberoende av programramen måste detta beroende granskas före genomförande: utbildningens/timplanens beslutade källunderlag och en senare valomgångs erbjudanden får inte bli samma föränderliga objekt. Tidigare timplaner får fortfarande inte skrivas om. 05-29:s krav att verifiera undervisningstid för varje alternativväg ska bevaras.

STUDY-01/GROUP-01 är senare krav och schemadelprojektets genomförandeplacering är ännu öppen. Förslaget innebär inte att dessa nu ingår i nästa v1-plan eller att pilotens 42 krav ändras.

## Kontrollerat regelunderlag

Gymnasieförordningen 1 kap. 7 § anger att den individuella studieplanen ska redovisa valda/bortvalda ämnen och nivåer. 4 kap. 6–7 §§ placerar beslutet om erbjuden programfördjupning och individuellt val hos huvudmannen. Det stödjer åtskillnaden mellan erbjudande och elevens innehåll. Förordningen föreskriver inte en viss appmeny eller att ett lokalt paket ska vara en undervisningsgrupp. Menyplacering, valomgång och arbetsordning ovan är vår arkitekturbedömning.

Primärkälla kontrollerad 2026-10-05: [Gymnasieförordning (2010:2039), 1 kap. 7 § och 4 kap. 6–8 §§](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/gymnasieforordning-20102039_sfs-2010-2039/).

Interna underlag: [tidigare paketresearch](VALPAKET-PROGRAMFORDJUPNING-IV-2026-10-04.md), [schemadelprojektet](SCHEMAMODUL-PROJEKT.md), [05-23:s tidigare beslut](../phases/05-bevarade-utbildnings-och-klassfloden/05-23-CONTEXT.md) och [D-verifieringen](../phases/05-bevarade-utbildnings-och-klassfloden/05-23-D-VERIFICATION.md). Den äldre researchens antaganden om gemensamt flerskoleutbud och obligatoriskt parallellt schema är inte i sig aktuella beslut.
