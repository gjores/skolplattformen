# Tjänstefördelning med många lärare: filtrering och alternativ till matrisen

**Status:** Research och förslag 2026-10-26, utifrån användarprovet av etapp 2. Inget är beslutat eller byggt. Underlaget ska vägas mot D-13 (matrisen är startvy, som i Plan Digital), D-10 (ingen kapacitetsjämförelse i 05.1) och D-25–D-27 (förslag tilldelar aldrig, och läraren väljs aktivt).

## Problemet

Matrisen har en kolumn per lärare och en rad per behov (kurs × klass). En gymnasieskola kan ha cirka 40 lärare och flera hundra behov. Matrisen blir då 40 kolumner bred och nästan tom, eftersom varje rad oftast har en eller två lärare. Användaren måste rulla i sidled för att hitta "sin" lärare och tappar raden. I dag finns filter för klass, ämne och lärare, "bara avvikelser" samt vyerna Per klass, Per lärare och Per kurs/ämne. Lärarfiltret visar dock **en** lärare åt gången, och ämnesfiltret minskar bara antalet rader, inte kolumnerna.

Det rektor egentligen gör är två saker:
1. **För varje behov:** välja lärare.
2. **För varje lärare:** se vad personen har fått och hur mycket.

En matris visar båda samtidigt, men den skalar dåligt eftersom den är gles.

## Hur andra gör

- **Untis (lektionsmatris):** rader och kolumner visar två av klass, lärare och ämne, och cellen visar det tredje. Axlarna kan bytas. Filter på ett ämne med lärare i kolumnerna visar **bara de lärare som undervisar i ämnet**. Lektioner med platshållarlärare ("?") kan markeras, och det finns lärarförslag och kopiering till Excel. Kolumnordningen kan dras om fritt. Dokumentationen visar ingen särskild lösning för många lärare. ([Untis: Lesson matrix](https://webhelp.untis.at/HTML/WebHelp/uk/untis/upunterrichtsmatrix.htm), [kortbeskrivning](https://webhelp.untis.at/HTML/WebHelp/uk/untis/uperklaerung_anhand_der_datei_de.htm), [fler funktioner](https://webhelp.untis.at/HTML/WebHelp/uk/untis/upfunktionen_der_menueleiste.htm))
- **Tes E10 (Staff allocations):** huvudskärmen för att fördela personal på grupper och analysera belastning. Den kan **filtreras på ämnesavdelning (faculty)** och visar då avdelningens lärare och deras grupper. ([Tes E10 staff allocations](https://help.tes.com/support/solutions/articles/75000134200-e10-staff-allocations-overview))
- **aSc TimeTables:** en lektion utan lärare visas i rosa. Man markerar lektionen och skriver lärarens första bokstav eller väljer i en lista, alltså **behovsförst med tangentbord**. ([aSc hjälp](https://help.asctimetables.com/text.php?id=610))
- **Resursplaneringsverktyg** (till exempel ClickUp Workload): en **belastningsvy per person** i stället för en matris över personer och projekt. Underlaget är leverantörsmaterial och inte belägg för användbarhet. ([ONES-översikt](https://ones.com/blog/resource-allocation-jira-alternatives/))
- **Svenska rutiner** (Sveriges Lärare och Vimmerby gymnasium) arbetar utifrån timplanen och jämför innevarande och kommande läsår. Det bekräftar att **kontinuitet från föregående år** är kärnan i arbetet. ([Södertälje-mall](https://www.sverigeslarare.se/contentassets/5638ffc9c16b4ec0b735880a8c9583ed/20260129-ombudstraff1_tjp.pdf), [Vimmerby](https://www.sverigeslarare.se/contentassets/f83dcb8fa0cc40079e7d94dc2017f37e/kopia-av-principer-for-tjanstefordelning-och-schema-vimmerby-gymnasium-1.docx))

Inget verktyg jag hittade har en genomtänkt lösning för många lärare. De förlitar sig på filter.

## Förslag

### 1. Matrisen som lins, med automatiskt relevanta kolumner (snabb förbättring)

- **Relevanta lärare** (standard): visa bara kolumner för lärare som har uppdrag i de rader som syns, plus **fästa** lärare och en kolumn för **Vakant**. När du filtrerar på Engelska krymper matrisen till engelsklärarna (Untis-mönstret, men automatiskt). En knapp, **Visa alla lärare (40)**, återställer.
- **Fäst lärare:** rektor fäster de lärare hen arbetar med just nu. Fästningen sparas per användare och läsår.
- **Lärare för en rad:** när en cell eller ett behov är markerat visas radens förslag och sökning i panelen (finns redan i dialogen). Den rätta läraren behöver alltså inte vara en kolumn.
- **Kompakta kolumner:** initialer och summa i rubriken, med fullt namn vid fokus och hovring. Behovsdelen är fäst till vänster.
- **Sparade linser:** "Ofördelat", "Ändrat sedan publicering", "Samläsningar", "Mitt ämnesområde". Linserna kombinerar filter och kolumnval.

Detta kräver ingen ny datamodell och bevarar D-13.

### 2. Fördelningsläge: behovsförst med kandidatpanel (rekommenderat som arbetsyta)

Ett läge bredvid matrisen, där matrisen blir överblicken och fördelningsläget arbetsytan:

- **Vänster:** en kö med behov, i första hand ofördelade, grupperade per klass eller ämne och med sök och tangentbord (som aSc).
- **Höger** för markerat behov: kandidater rangordnade efter förslagsskäl (samma klass i fjol, samma kurs, egen andel och giltighet), var och en med lärarens **nuvarande summa HT/VT/år**. Där visas också samläsningsmöjligheter, det vill säga samma kurskod i andra klasser (koppling till todo om kursklick).
- **Aktivt val med en tangent eller ett klick.** Raden sparas och kön går vidare till nästa behov. Ingen automatisk tilldelning (D-25–D-27).
- 40 lärare blir då ett problem för en lista och inte för ett rutnät. Det skalar till hundratals.

Visningen av summor är ingen kapacitetsjämförelse: den visar fördelad tid, inte "ledig tid" (D-10). En stapel mot andel eller riktvärde vore en ny funktion som kräver beslut.

### 3. "Fortsätt fjolårets tjänst" per lärare (det banbrytande, stor tidsvinst)

Det mesta av en tjänstefördelning är kontinuitet. I stället för att välja rad för rad kan rektor välja en **lärare** och få se **fjolårets uppdrag projicerade på årets behov**, till exempel att samma kull nu går i år 2 och samma kurskod har en ny nivå. Varje projicerad rad visar källa, matchningsskäl och osäkerhet (ny klass, nivån finns inte, ändrad tid).

- Rektor kryssar i och förhandsvisar, och sparar sedan som explicit massregistrering. Allt som är osäkert lämnas okryssat.
- Samma sak per klass: "fortsätt klassens lärarlag".
- Detta bygger på befintliga förslag, förhandsvisning och journal. Det är **aktiva val med granskning**, men det rör D-25–D-27, så användaren behöver bekräfta att ett sådant uttryckligt per-lärare-val är förenligt med beslutet om aktivt val.

### 4. Lärarremsa i stället för 40 kolumner (alternativ visualisering)

En smal, fäst lista över alla lärare (namn + summa), sorterbar och filtrerbar på ämne, som fungerar som **släppyta**. Dra ett behov till en lärare, eller markera ett behov och tryck på en lärare. Remsan visar direkt hur summan ändras. Det ger matrisens "per lärare"-överblick utan glesheten.

### 5. Bytbara axlar (Untis)

Vyn **Lärare × klass** med kurser i cellen passar för att granska ett ämneslag. Som en lins är den billig att lägga till.

### Tillägg 2026-10-26: smart, förklarad lärarrekommendation

Användaren vill att kandidatpanelen väger flera skäl: behörighet (05.4), har haft kursen eller ämnet tidigare, har klassen i andra ämnen, mentorskap, undervisar redan kursen i en annan klass (samläsning), och andel och giltighet. Varje skäl visas med källa, okänt skiljs från negativt, och inget tilldelas automatiskt. Se todo [smart-lararrekommendation-per-tjansterad](../todos/pending/2026-10-26-smart-lararrekommendation-per-tjansterad.md). Det gör fördelningsläget (2) och "fortsätt fjolårets tjänst" (3) betydligt starkare.

## Rekommendation

1. **Nu (liten plan):** relevanta kolumner som standard, fästa lärare, kompakta kolumner och sparade linser i matrisen.
2. **Nästa (egen plan, skisser först):** fördelningsläget (2) med kandidatpanel och lärarsummor, plus lärarremsan (4) som snabbtilldelning.
3. **Därefter, efter beslut om aktivt val:** "Fortsätt fjolårets tjänst" (3) per lärare och per klass.

Behåll matrisen som överblick och utskrift (D-13) men gör den inte till enda arbetsytan.

## Öppna frågor och beroenden

- **Ämneslag och ämnesområde** finns inte i datamodellen. "Relevanta lärare" kan härledas ur nuvarande och fjolårets uppdrag. Ett uttryckligt ämneslag kräver en ny uppgift (och avstämning mot SS 12000, där organisationsenheter eller grupper eventuellt motsvarar det).
- Lärarbehörighet saknas (fas 05.4). När den finns blir kandidatpanelen mycket starkare.
- Undervisningsgrupper för valbara kurser (todo) påverkar hur behovsraderna ser ut.
- Telefon: läsläge enligt D-15. Linser och sparade vyer bör fungera där för granskning.
- Varje alternativ behöver skisser och ett kort användarprov med en realistisk skola med cirka 40 lärare (syntetiskt), innan planering.
