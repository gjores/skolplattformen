# Valbara paket i programfördjupning och individuellt val

*Research 2026-10-04. Status: förslag, inte beslutad leverans. Bygger vidare på todo [skolgemensamma programfördjupningspaket](../todos/pending/2026-10-02-gemensamma-programfordjupningspaket-over-flera-programplaner.md). Kod läst på `9a8024c`. Regler kontrollerade mot gymnasieförordningen (rkrattsbaser.gov.se, hämtad 2026-10-03) och Skolverkets sidor om studieplanering i Gy25 och om programmens delar (hämtade 2026-10-04).*

## Behov

Vissa skolor vill erbjuda valbara block (”moduler”) i programfördjupningen och i det individuella valet. Eleven väljer då till exempel ett av tre paket om 300 poäng i stället för att alla läser samma nivåer.

**Ordval:** ”Modul” används redan i produkten för köpbara delar (MODUL-01–04). Förslag: kalla skolans paket för **valpaket** och platsen i programplanen för **valblock**. Användaren beslutar.

## Regler som styr modellen

| Regel | Följd för modellen | Källa |
|---|---|---|
| Huvudmannen beslutar vilka ämnen och nivåer som erbjuds som programfördjupning, inom Skolverkets lista för programmet. | Valpaket i programfördjupning får bara innehålla nivåer från programmets lista i katalogen. Att skapa och erbjuda paket är ett huvudmannabeslut, eller ett delegerat beslut. | Gymnasieförordningen 4 kap. 5–6 § |
| Skolan kan erbjuda ”ett färdigt paket” eller ett ”friare val” inom programfördjupningen. | Både fasta paket och valblock är tillåtna. | Skolverket, Gymnasieprogrammens olika delar |
| Huvudmannen beslutar om utbudet för individuellt val. Eleven har rätt till en nivå till i idrott och hälsa, minst en nivå i ett estetiskt ämne och, på yrkesprogram, nivåerna för grundläggande behörighet. | Utbudet för individuellt val är skolans och hämtas från hela ämneskatalogen, inte bara programmets lista. Utbudet ska innehålla de tre rättigheterna. | Gymnasieförordningen 4 kap. 7 § |
| En elev som läser svenska får inte välja svenska som andraspråk på motsvarande nivå som individuellt val, och tvärtom. | Kan bara kontrolleras vid elevens val. | Gymnasieförordningen 4 kap. 7 a §, 11 § |
| Individuellt val, programfördjupning och utökat program får inte innehålla nivåer som är jämförbara med, alternativa till eller överlappar studievägens övriga nivåer. | Varje paket ska kontrolleras mot planens fasta nivåer och mot varje möjlig kombination av paket. | Gymnasieförordningen 4 kap. 8 § |
| Antagning sker till program, inriktning, särskild variant eller lärlingsutbildning. Eleverna får fördelas på undervisningsgrupper med hänsyn till kända kommande val. | Valpaket är elevval efter antagningen, inte egna antagningsalternativ. | Gymnasieförordningen 7 kap. 2 och 6 § |
| En avvikelse på minst 300 poäng från den nationella inriktningen och programfördjupningen är en särskild variant och kräver godkännande. | Paket som bara använder programmets nationella programfördjupningsnivåer är ingen avvikelse. | Gymnasieförordningen 5 kap. 1 § |
| Den individuella studieplanen ska ange de ämnen och nivåer som eleven valt eller valt bort. | Elevens paketval hör hemma i studieplanen (STUDY-01), inte i programplanen. | Gymnasieförordningen 1 kap. 7 § |
| Att en nivå ”bygger på” en annan är Skolverkets vägledning och inte juridiskt bindande. Avsikten är att sådana nivåer inte ska löpa helt parallellt. | Ordningen mellan nivåer bör vara en **risk**, inte ett fel. Det gäller både inom paket och i dagens kontroll av nivåordningen. | Skolverket, Studieplanering i Gy25 |

## Rekommenderad modell: tre lager

1. **Skolans valpaket (utbud).** Ett paket hör till en skolenhet. Det har namn, beskrivning och typ (programfördjupning eller individuellt val) och en ordnad lista med nivåreferenser (`ProgramplanLevelRef`). Varje ändring ger en ny version, och gamla versioner ändras aldrig. Samma version kan erbjudas i flera programplaner. Paketet har ingen terminsplacering, eftersom olika planer kan placera det olika.
2. **Programplanens valblock (erbjudande).** Programfördjupningen består av **fasta nivåer** (dagens `specializationRefs`) plus **valblock**. Ett valblock har:
   - id, namn och poäng,
   - en regel, i första versionen bara ”välj exakt ett paket”,
   - alternativ i form av paketreferenser med id och version,
   - en **terminsram** med poäng per termin.
   Varje alternativ fördelar sina nivåer inom ramen, så att poängen per termin blir lika för alla alternativ. Det ger ett parallellt schemafönster (jfr valgrupper i `SCHEMALAGGNING-2026-10-01.md`, S03). Individuellt val blir på samma sätt ett eller flera valblock om totalt 200 poäng, som pekar på skolans utbud för individuellt val.
3. **Elevens val (studieplan, STUDY-01, senare).** Valet pekar på planversion, valblock och paketversion. Det har sista dag för val och historik. Här prövas kontroller som beror på eleven, till exempel svenska eller svenska som andraspråk och det tidigare bortval eleven gjort.

Ett ”friare val” uttrycks i första versionen som paket med en enda nivå, där eleven väljer ett. ”Välj 200 poäng bland åtta nivåer” kräver kontroll av förkunskaper per elev. Det skjuts till elevvalet.

## Kontroller i analysen

Fel som stoppar ”klar för beslut”:
- Fasta nivåer plus valblockens poäng är inte lika med ramen för programfördjupning.
- Ett alternativ har fler eller färre poäng än valblocket.
- En nivå i ett programfördjupningspaket finns inte i programmets lista. Det blockeras redan av katalogen.
- En nivå finns redan bland de fasta nivåerna, eller överlappar dem enligt 4 kap. 8 §. För överlappningen behöver Skolverkets föreskrift hittas först; se `PROGRAMPLAN-ANALYS-LUCKOR-2026-10-04.md`, punkt 3.
- En kombination av alternativ från olika valblock ger samma nivå två gånger eller överlappar. Antalet kombinationer är litet (antalet paket per block multiplicerat). Lägg ändå in ett tak, till exempel 1 000 kombinationer.
- Ett alternativs terminsfördelning stämmer inte med valblockets terminsram.
- Utbudet för individuellt val saknar idrott och hälsa, ett estetiskt ämne eller, på yrkesprogram, behörighetsnivåerna.

Risk:
- Ordningen mellan nivåer inom ett alternativ eller mot de fasta nivåerna.
- Ett valblock med bara ett alternativ. Det är i praktiken fasta nivåer.
- Alternativ som kräver olika mycket undervisningstid. Det kontrolleras i timplanen enligt 4 kap. 22 §, eftersom elevens garanterade undervisningstid annars beror på valet.

## Passform i dagens kod

- `point_plans.basis_reference.specializationRefs` blir planens fasta nivåer. Valblocken läggs som ett nytt, versionsbundet fält, till exempel `basis_reference.specializationBlocks` och `individualChoiceBlocks`, med paketreferenser.
- Basvalideringen finns i två lager: SQL (`phase5_programplan_validate_basis`, `phase5_programplan_term_rows`) och TS (`resolveProgramplanBasis`, `programplanTermRows`). Båda behöver utökas på samma sätt, med kontraktstest som håller dem i takt.
- Terminsrader får nycklar per valblock och alternativ, till exempel `block:<blockId>:<paketId>@<version>:<ämne>:<version>:<nivå>`, plus en ramrad per valblock. Dagens rad för individuellt val (`meta:individualChoice`, 200 p) ersätts av valblockens ramar när utbud finns.
- Valpaket blir en egen skolavgränsad tabell med versioner, egna kommandon, revision och audit, enligt det befintliga mönstret för programplaner. Mandatet följer delegeringstodon för programplanearbete.
- Kopiering till nästa elevkull behåller samma paketversion. En ny version uppdaterar aldrig befintliga planer automatiskt. Fastställda planer ändras inte.
- Timplanen som skapas ur programplanen (todo 2026-10-03) får en rad per valblock med undervisningstid för ramen. Alternativen blir undervisningsgrupper i schemadelprojektet.

## Föreslagen ordning

1. Rätta först att Svenska/SvA och ämnen utan nivåer saknar terminer (lucka 4 i luckanalysen). Valblock bygger på samma terminsmodell.
2. **Valpaket och valblock i programfördjupningen**, regeln ”välj exakt ett”, terminsram och analys. Inget elevval. Detta uppfyller paket-todons verifiering med samma paket i två planer.
3. **Valblock för individuellt val** med skolans utbud och kontroll av rättigheterna i 4 kap. 7 §.
4. **Elevens val** i studieplanen (STUDY-01, v2), inklusive kombinationer per elev och ”välj X poäng”.

## Beslut som behövs från användaren

- Benämning: valpaket/valblock eller något annat i stället för ”modul”.
- Ska individuellt val ingå i samma första leverans, eller komma efter programfördjupningen?
- Vem får skapa valpaket? Huvudman enligt 4 kap. 6 §, eller också rektor efter delegering?
- Ordningen mellan nivåer: risk enligt Skolverkets vägledning (förslag), eller fel som i dag?
