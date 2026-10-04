# Valbara paket i programfördjupning och individuellt val

*Research 2026-10-04. Status: förslag, inte beslutad leverans. Bygger vidare på todo [skolgemensamma programfördjupningspaket](../todos/pending/2026-10-02-gemensamma-programfordjupningspaket-over-flera-programplaner.md). Kod läst på `9a8024c`. Regler kontrollerade mot gymnasieförordningen (rkrattsbaser.gov.se, hämtad 2026-10-03) och Skolverkets sidor om studieplanering i Gy25 och om programmens delar (hämtade 2026-10-04).*

## Användarbeslut 2026-10-04

> Slutliga beslut D-01–D-15 finns i [05-21-CONTEXT.md](../phases/05-bevarade-utbildnings-och-klassfloden/05-21-CONTEXT.md). Där de skiljer sig från förslagen i detta dokument gäller beslutet. Två exempel: svenska/SvA är inget valbart block, och varje skola väljer paketen.

- **B-01 Benämning:** Platsen i planen där eleven väljer heter **valbart block** i gränssnitt och handbok. Ordet ”modul” används inte. ”Valblock” i den här texten betyder valbart block. Innehållet heter tills vidare **valpaket**, eftersom användaren inte har ändrat det ordet.
- **B-02 Omfattning:** **Individuellt val ingår i första leveransen** tillsammans med programfördjupningen. Svenska/SvA och Moderna språk/Språkämne/Naturvetenskapligt ämne hanteras som valbara block i samma leverans, enligt tillägget nedan.
- **B-03 Mandat:** **Huvudman, rektor och skoladministratör** får skapa valpaket, inom sitt aktuella mandat. Rektor och skoladministratör arbetar inom sina skolenheter, och huvudmannen inom sin organisation. Servern kontrollerar mandatet. Att skapa ett paket är inte samma sak som att fastställa en programplan; fastställandet följer det befintliga beslutsflödet. Rättsligt beslutar huvudmannen om utbudet (4 kap. 6–7 §), och rektor och skoladministratör arbetar inom det uppdraget.
- **Öppet:** ska fel nivåordning vara risk (förslag, enligt Skolverkets vägledning) eller fel som i dag? Inte besvarat.

**Samspel med 05-20 (en plan på flera skolor, D-03):**
- Valpaket ägs av huvudmannen och har en tillgänglighet per skolenhet. Paket som rektor eller skoladministratör skapar blir tillgängliga på deras skola.
- Ett valbart block i en plan som är kopplad till flera skolor får bara använda paket som är tillgängliga på alla de skolorna. Annars ska analysen ge fel och tala om vilka skolor som saknar paketet.
- Om en skola kopplas till planen efter att paketen valts ska samma kontroll göras.
- Detta är ett förslag som följer av D-03, inte ett användarbeslut.

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

## Tillägg 2026-10-04: valblock behövs även i gymnasiegemensamma och programgemensamma delar

Användaren såg att SA bara summerar till 2 000 poäng. Kontrollerat med `programplanTermRows` för alla tre inriktningar på SA25: de 500 poäng som saknas är exakt de ställen där det nationella underlaget kräver ett val, och de får i dag inga rader.

| Valplats i katalogen | Poäng | Program | Tillåtna val |
|---|---|---|---|
| Svenska eller svenska som andraspråk | 300 | Alla 29 | SVEN 1–3 eller SVEA 1–3. Byte tillåts efter avslutad nivå (4 kap. 11 §). |
| Moderna språk (`MOSP`, inga nivåer) | 200 | EK, HU, NA, SA, SM | Två nivåer i följd på trappan nybörjare 1 → grund 1 → fortsättning 1 → fortsättning 2 → fördjupning 1–3 (MODY, MODG, MODO, MODF). |
| Språkämne (`SPRK`) | 300 | HU/språk | Lista i 4 kap. 1 a § |
| Ett naturvetenskapligt ämne (`NAVE`) | — | NA/naturvetenskap och samhälle | Lista i 4 kap. 1 a § |

Alla planer saknar alltså minst 300 poäng (svenska). EK, HU, NA, SA och SM saknar 500 poäng.

**Moderna språk enligt SKOLFS 2024:628 (bilaga 1):** Gy11:s Moderna språk 1–7 motsvaras av nybörjare nivå 1, grund nivå 1, fortsättning nivå 1–2 och fördjupning nivå 1–3. Varje språk är ett eget språkämne inom en gemensam ämnesplan, så nivåkoden (till exempel `MODO1000X`) anger inte vilket språk det gäller. Enligt 4 kap. 9 § ska undervisningen utgå från grundskolans nivå om eleven har betyg i språket. Enligt 4 kap. 10 § ska franska, spanska och tyska erbjudas både som fortsättningsspråk och som nytt språk. Enligt 4 kap. 10 a och 17 § kan svenskt teckenspråk för hörande eller modersmål ersätta moderna språk.

**Rekommendation:** Gör valblocket till ett allmänt begrepp i alla delar av planen, inte bara i programfördjupning och individuellt val.
- **Svenska/SvA:** valblock som skapas automatiskt ur katalogen, med två alternativ och samma terminsram.
- **Moderna språk:** valblock på 200 poäng där skolan anger paket per språk och spår, till exempel ”Spanska fortsättning (fortsättning 1 + 2)” och ”Spanska nybörjare (nybörjare 1 + grund 1)”. Kontrollen ska kräva att franska, spanska och tyska finns i båda spåren, eller visa det som ”att kontrollera” om huvudmannen erbjuder dem vid en annan skola. Paketet behöver ett eget fält för språk, eftersom katalogen saknar det. Hur Skolverket och UHR kodar språket i betygsunderlag för Gy25 är inte kontrollerat.
- **SPRK och NAVE:** valblock med alternativ ur listan i 4 kap. 1 a §.

Det gör att lucka 4 i `PROGRAMPLAN-ANALYS-LUCKOR-2026-10-04.md` kan rättas med samma mekanism som valpaketen, i stället för en separat lösning som senare måste göras om.

## Föreslagen ordning

1. **Valblock som grundbegrepp**, med Svenska/SvA (automatiskt) och Moderna språk/SPRK/NAVE. Då summerar planerna till programmets totala poäng (lucka 4).
2. **Valpaket och valblock i programfördjupningen**, regeln ”välj exakt ett”, terminsram och analys. Inget elevval. Detta uppfyller paket-todons verifiering med samma paket i två planer.
   Enligt B-02 ingår även **valbara block för individuellt val**, med skolans utbud och kontroll av rättigheterna i 4 kap. 7 §.
3. *(tidigare steg 3, nu en del av steg 2)*
4. **Elevens val** i studieplanen (STUDY-01, v2), inklusive kombinationer per elev och ”välj X poäng”.

## Beslut som behövs från användaren

B-01–B-03 är besvarade, se ovan. Kvar: nivåordningens kategori.
