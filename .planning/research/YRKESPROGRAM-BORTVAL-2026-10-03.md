# Yrkesprogram och bortval av nivåer för grundläggande behörighet

*Research 2026-10-03. Status: förslag, inte beslutad leverans. Källor: författningstext hämtad 2026-10-03 från rkrattsbaser.gov.se (skollagen 2010:800, gymnasieförordningen 2010:2039) och programkatalogen i `web/lib/programplan-catalog.generated.json`.*

## Frågan

Behöver programplanerna redan nu hantera yrkesprogram och elevens rätt att välja bort de nivåer som ger grundläggande högskolebehörighet?

## Regler (verifierade mot författningstext)

| Regel | Källa |
|---|---|
| Yrkesprogram ska innehålla det som krävs för grundläggande behörighet. Eleven har rätt att välja bort delar enligt bilaga 2. | Skollagen 16 kap. 3 § |
| Barn- och fritids-, hotell- och turism- och vård- och omsorgsprogrammet omfattar **2 700** poäng. Övriga yrkesprogram omfattar **2 800**. Högskoleförberedande program omfattar 2 500. Karaktärsämnen: 1 500 respektive 1 600 poäng. | Skollagen bilaga 2, not 7 och 9 |
| Yrkesprogrammen ska innehålla Svenska/Svenska som andraspråk nivå 1–3 och Engelska nivå 1–2. Eleven får välja bort Svenska/SvA nivå 2 och 3 samt Engelska nivå 2. | Gymnasieförordningen 4 kap. 23 § |
| Undantag: på BF och VO får Svenska/SvA nivå 2 inte väljas bort (där kan bara nivå 3 väljas bort). På HT får Engelska nivå 2 inte väljas bort. | Gymnasieförordningen 4 kap. 23 §, skollagen bilaga 2 not 1–2 |
| Eleven anmäler bortval till rektor senast vid utgången av terminen före den termin då nivån börjar. | Gymnasieförordningen 4 kap. 23 § |
| Garanterad undervisningstid är 2 720 timmar (2 800 p) eller 2 625 timmar (2 700 p). Den minskas i motsvarande omfattning för den som valt bort nivåer. | Skollagen 16 kap. 18 § |
| Ett bortval räknas inte som reducerat program. | Gymnasieförordningen 9 kap. 6 a § |
| Den individuella studieplanen ska ange ämnen och nivåer som eleven valt eller valt bort. | Gymnasieförordningen 1 kap. 7 § p. 2 |
| Yrkesexamen kräver bara nivå 1 i svenska/SvA och engelska. Ett bortval påverkar alltså inte rätten till yrkesexamen. | Gymnasieförordningen 8 kap. |
| Bortvalda nivåer räknas inte med när man beräknar hur stor del av lärlingsutbildningen som ska vara APL. | Gymnasieförordningen 4 kap. 12 § |
| Skolpengen till enskild huvudman får minskas om kommunen minskar resurserna för bortvalda nivåer. | Gymnasieförordningen 13 kap. 8 § |
| Förlängd undervisning får beslutas för en yrkeselev som riskerar att inte nå behörighetsnivåerna. | Gymnasieförordningen 9 kap. 7 § p. 2 |
| **Från 2028-07-02** ersätts gymnasiearbetet av **yrkesprov** på yrkesprogrammen. Poängsummorna ändras inte. | Skollagen bilaga 2 (lag 2026:1243) |

**Bekräftad av användaren 2026-10-03:** Poängen för bortvalda nivåer ersätts inte med andra ämnen. Elevens program blir kortare. Det stämmer med att den garanterade undervisningstiden minskas och att bortvalet inte räknas som reducerat program.

## Läget i koden

- Katalogen markerar programmen med `VOCATIONAL_PROGRAM` och `NATIONAL_RECRUITMENT_FOR_LOCAL_SPECIALIZATION`. Svenska 1–3 och Engelska 1–2 finns redan i den gymnasiegemensamma delen.
- Skolverkets underlag anger **inte** vilka nivåer som får väljas bort. `optional: true` på SVEN/SVEA betyder att eleven läser **antingen** svenska **eller** svenska som andraspråk. Det är inte en markering för bortval. Använd därför inte samma fält för bortval.
- `programTotal()` i `web/lib/programplan-table.ts` returnerar `null` för alla yrkesprogram. Analysen visar därför ”Poängramen kan inte kontrolleras” (`programplan-analysis.ts`). Bilaga 2 anger summan per program, så luckan kan stängas för de tolv nationella yrkesprogrammen.
- Kontrollräkning med 2 700/2 800 ger rimliga ramar för programfördjupning. Exempel: EE 400–800 beroende på inriktning, FT 800, RL 900, VO 200, BF 500. Alla ramar är positiva och jämna hundratal. Siffrorna behöver stämmas av mot Skolverkets programstrukturer innan de används i prov.
- För riksrekryterande yrkesutbildningar (DS, FI, FL, FO, GL, GU, MA, SJ, SM, TA, YR) anger bilaga 2 ingen poängsumma. YR har till exempel en annan gymnasiegemensam del. Där bör ramen fortsatt visas som okontrollerad tills summan är verifierad.
- `organisation-model.ts` skapar gymnasiearbetet (`GYAR…`) likadant för alla program. Detta påverkar elevkullar som börjar efter 2028-07-02, men övergångsbestämmelserna är inte undersökta.
- Elevens egna val (STUDY-01) är ett v2-krav. Programplanen gäller utbildningen, inte den enskilda eleven.

## Rekommendation

**Fånga regeln i programplanen nu, men inte elevens bortval.**

Gör nu (liten, avgränsad ändring inom fas 5 / ADMIN-02):
1. Lägg till en regeltabell med programkod och poängsumma för de tolv nationella yrkesprogrammen. Ange skollagen bilaga 2 som källa. Då kontrolleras ramen för programfördjupning på samma sätt som för högskoleförberedande program.
2. Lägg till en regeltabell med de nivåer som får väljas bort per program, inklusive undantagen för BF, VO och HT. Ange gymnasieförordningen 4 kap. 23 § som källa. Visa nivåerna i planen som ”Ingår. Eleven kan välja bort nivån.” Nivåerna ska ändå ingå i planen och få plats i timplanen, eftersom skolan måste erbjuda dem.
3. Analysen kan ge information om att skolan behöver planera undervisning för hela elevkullen. Antalet elever som läser nivåerna blir känt först när bortvalen kommer in. Anmälningstiden är terminen före den termin då nivån börjar.

Vänta med (STUDY-01, v2):
- Elevens anmälan och bortval, rektors registrering, tidsfristen och historiken.
- Elevens poäng och garanterade undervisningstid efter bortval, examenskontroll och förlängd undervisning.
- Effekter på grupper och tjänstefördelning (GROUP-01) samt ersättning.

Därför bör regeln fångas nu:
- Det är billigt. Det är två statiska tabeller med källhänvisning, och den befintliga referensen `ProgramplanLevelRef` (ämne + nivåkod) räcker för att ett framtida bortval ska kunna peka på exakt nivå i en fastställd plan. Ingen datamodell behöver byggas om.
- Utan poängsumman kan planen för yrkesprogram inte kontrolleras. Det är en verklig lucka i dagens programplan.
- Utan markeringen kan en administratör tro att Svenska 2–3 och Engelska 2 kan tas bort ur utbildningen. Det är fel: nivåerna ska erbjudas, och det är eleven som får välja bort dem.
- Kopiering till nästa elevkull bevaras, eftersom regeln hör till programmet och inte till eleven.

Risker och öppna frågor:
- ~~Bekräfta tolkningen att bortvalda poäng inte ersätts.~~ Bekräftad 2026-10-03.
- Riksrekryterande utbildningar: användaren vet inte hur de fungerar. Enligt gymnasieförordningen 5 kap. får Skolverket besluta om avvikande struktur, innehåll och examensmål, men inte om en annan omfattning av de gymnasiegemensamma ämnena än bilaga 2 anger. Bortvalsrätten följer därför troligen med, men poängsumman beror på Skolverkets beslut om respektive utbildning. Katalogen visar dessutom avvikelser: YR25 har 800 i stället för 900 gymnasiegemensamma poäng. Visa ramen som okontrollerad tills summan per utbildning är verifierad hos Skolverket.
- Yrkesprov från 2028-07-02: användaren tycker att förändringen är bra. Gymnasiearbetet på yrkesprogrammen ska bytas mot yrkesprov för elevkullar som omfattas. Undersök övergångsbestämmelserna innan plan för elevkull 2028 skapas.
- Gymnasial lärlingsutbildning: APL-beräkningen påverkas. Det hör till senare flöden.

## Förslag till nästa steg

Om användaren vill: skapa en kort GSD-plan i fas 5, till exempel 05-17 ”Yrkesprogrammens poängsumma och nivåer som kan väljas bort”, med modellprov för BF/VO/HT-undantagen och EE/FT-summorna, en uppdatering av analysens text och en handbokssida om regeln. Annars läggs punkterna som todo under STUDY-01.
