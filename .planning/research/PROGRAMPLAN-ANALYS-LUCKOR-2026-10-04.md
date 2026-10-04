# Programplanens analys: luckor mot regelverket

*Research 2026-10-04. Status: förslag, inte beslutad leverans. Kod läst på `25a9538` (`web/lib/programplan-analysis.ts`, `programplan-terms.ts`, `programplan-catalog.ts`, `app/protected-programplan-board.tsx`). Regler kontrollerade mot gymnasieförordningen 4 kap. (rkrattsbaser.gov.se, hämtad 2026-10-03) och programkatalogen.*

## Redan täckt

- Ramen för programfördjupning på högskoleförberedande program: över ramen och outnyttjat utrymme.
- Inriktning saknas.
- Samma nivå vald två gånger, eller en vald nivå som redan ingår i planen (`duplicate_selected_level`, `fixed_level_duplicate`).
- Programmets och ämnenas giltighet mot startdatumet (`dateDiagnostic`: version saknas, inte tillämplig eller upphävd före start).
- Alla nivåer har terminer. Högre nivå får inte ligga i ett tidigare läsår än lägre nivå. Ojämnt läsår ger en risk. Gymnasiearbetet före åk 3 ger en risk.
- Startdatum saknas.

## Luckor

### Bör ge fel och stoppa ”klar för beslut”

| # | Lucka | Regel | Läge i koden |
|---|---|---|---|
| 1 | Inriktningens nivåer i åk 1, utom på ES/FR/IN/NB | Gymnasieförordningen 4 kap. 2 § | Todo 2026-10-04 |
| 2 | Yrkesprogrammens poängsumma okänd, så ramen kontrolleras inte | Skollagen bilaga 2 | 05-17 i färdplanen |
| 3 | **Jämförbara, alternativa eller överlappande nivåer** i programfördjupningen. Exempel: ES25 med inriktningen Modedesign har Modedesign nivå 1b som fast nivå, men programfördjupningen erbjuder fortfarande nivå 1a1 och 1a2. De kan väljas utan anmärkning. | Gymnasieförordningen 4 kap. 8 § | `specializationOptions` filtrerar bara bort identiska nivåkoder |
| 4 | **Svenska/Svenska som andraspråk (300 p) och ämnen utan nivåer, till exempel Moderna språk (200 p på SA), fördelas aldrig på terminer.** Planen kan ändå bli klar för beslut. Kontrollen av läsårens balans räknar inte med dem, och en timplan skapad ur programplanen saknar dem. | Fullständigt program; underlag för 4 kap. 22 § | `programplanTermRows` filtrerar bort `optional` och ämnen utan nivåer. Tavlan säger bara ”Ingår men fördelas inte här”. |

Uppdaterat 2026-10-04: rättas bäst med valblock, se tillägget i `VALPAKET-PROGRAMFORDJUPNING-IV-2026-10-04.md`. Alla planer saknar 300 p (svenska); EK/HU/NA/SA/SM saknar 500 p. Tidigare förslag: Svenska och Svenska som andraspråk har samma nivåer. De kan få en gemensam rad per nivå (”Svenska / Svenska som andraspråk nivå 1”), så att placeringen gäller båda alternativen. Ämnen utan nivåer, som Moderna språk, kan placeras som en poängram på samma sätt som individuellt val.

Förslag för 3: Skolverket ska enligt 4 kap. 8 § meddela föreskrifter om vilka nivåer som är jämförbara, alternativa eller överlappande. De föreskrifterna är inte lokaliserade. SKOLFS 2024:628 i lydelse 2025:495 gäller i stället motsvarigheten mellan Gy11-kurser och Gy25-nivåer. Där framgår till exempel att 1b motsvarar 1a1 + 1a2. Hitta Skolverkets källa innan en regeltabell byggs. Gissa inte utifrån nivåkoderna.

### Risk

| # | Lucka | Regel | Läge i koden |
|---|---|---|---|
| 5 | Nivåernas ordning kontrolleras bara per läsår. Nivå 2 i Åk 1 HT och nivå 1 i Åk 1 VT passerar. | Nivåerna bygger på varandra | `firstYear`/`lastYear` räknar läsår, inte terminer |
| 6 | Kontrollen av gymnasiearbetet hänvisar till ”Gymnasieförordningen 4 kap.”. Där finns ingen regel om när gymnasiearbetet ska ligga; 4 kap. 4 § gäller bara ansvarig lärare. Från 2028-07-02 ersätts gymnasiearbetet dessutom av yrkesprov på yrkesprogrammen. | — | Fel källhänvisning |

Förslag för 5: Om den högre nivån börjar innan den lägre har börjat är det fel. Om nivåerna överlappar i samma termin är det en risk, eftersom parallell läsning kan vara ett medvetet val. Användaren bestämmer kategorierna.

### Att kontrollera (huvudmannens utbud, kan inte prövas med dagens data)

| # | Fråga | Regel |
|---|---|---|
| 7 | Individuellt val: eleven har rätt att läsa en nivå till i idrott och hälsa och minst en nivå i ett estetiskt ämne. På yrkesprogram har eleven också rätt till nivåerna för grundläggande behörighet. Planen innehåller i dag bara en ram på 200 poäng. | Gymnasieförordningen 4 kap. 7 § |
| 8 | APL i minst 15 veckor på yrkesprogram. Rektor beslutar vilka nivåer som förläggs till arbetsplats och hur de fördelas över läsåren. | Gymnasieförordningen 4 kap. 12 § |
| 9 | Franska, spanska och tyska ska erbjudas både som fortsättningsspråk och som nytt språk. Gäller program med Moderna språk. | Gymnasieförordningen 4 kap. 10 § |
| 10 | Programfördjupningen på yrkesprogram bör leda till en yrkesutgång. Yrkesutgångar finns inte i katalogen. | Gymnasieförordningen 1 kap. (definition), Skolverkets examensmål |
| 11 | Humanistiska programmets inriktning språk och naturvetenskapsprogrammets inriktning naturvetenskap och samhälle har en uttömmande lista över tillåtna ämnen. Kontrollera att katalogens alternativ följer listan. | Gymnasieförordningen 4 kap. 1 a § |

## Rekommenderad ordning

1. Punkt 4 (Svenska och ämnen utan nivåer på terminer). Den påverkar timplanen som skapas ur programplanen och bör åtgärdas innan det flödet byggs.
2. Punkt 1 och 2 tillsammans med 05-17: statiska regeltabeller med källhänvisning.
3. Punkt 5 och 6: små ändringar i analysen.
4. Punkt 3 när Skolverkets föreskrift är hittad.
5. Punkt 7–11 som information i analysen tills individuellt val, APL och yrkesutgångar har egen data.
