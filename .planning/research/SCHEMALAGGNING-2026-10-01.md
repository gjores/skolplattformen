# Automatisk schemaläggning: produkter, motorer och provplan

Researchdatum: 2026-10-01. Status: offentligt produkt- och teknikunderlag för framtida planering. Användaren vill undersöka automatisk schemaläggning som en framtida USP och en möjlig stegvis introduktion av Rust. Användaren kan ordna tillgång till Royal Schedule eller SchoolSoft AI Schema. Inga produkter har provats inloggat, inga leverantörer har kontaktats och ingen integration eller prestanda är verifierad. Pågående fas 5 och befintliga godkända krav ändras inte av underlaget.

Senare användarinriktning 2026-10-01: [sammanhängande schemadelprojekt](SCHEMAMODUL-PROJEKT.md) ska planera programplaner, timplaner, studieplaner, roller/regler och valbara moduldelar tillsammans. Rust och Jev eller liknande AI ska ingå i själva schemamodulen. Delprojektets S1-kontrakt och kompatibilitet i återstående fas 5 beaktas nu; produktprovningen nedan är ett underlag för senare motor-/adapterval. Ingen implementation eller ny verifiering tillkom genom detta förtydligande.

## Bedömning

Börja med att prova Royal Schedule på en isolerad provskola. Jämför sedan en egen beräkningsmotor med samma undervisningsbehov och regler. Valet mellan extern produkt och egen motor bör avgöras av schemakvalitet, ändringsarbete, integrationsrättigheter och kostnad. En hel omskrivning av backenden behövs inte för denna undersökning.

Det finns tre skilda förmågor att bedöma: schemaberäkning, arbete med och publicering av schemat samt en samtalsassistent för frågor och förberedda ändringar. Ett API som hämtar ett färdigt schema belägger inte att vår app kan beställa själva beräkningen.

## Jämförelse av färdiga produkter

Leverantörernas beskrivningar nedan är dokumenterade erbjudanden, inte egna användartester. Tider och kvalitetslöften i marknadsföringen har inte använts som jämförbara mätresultat.

| Produkt | Dokumenterat arbetssätt | Betydelse för vår utvärdering |
| --- | --- | --- |
| Royal Schedule | Import via filer/Excel/API, tjänstefördelning och villkor, analys av underlaget, automatisk placering, manuella ändringar och publicering/export. | Första provkandidat. Undersök hur mycket förarbete som krävs och om vi kan integrera beräkningen eller behöver använda leverantörens arbetsyta. [Produktbeskrivning](https://www.royalschedule.com/education/). |
| SchoolSoft AI Schema | SchoolSoft anger att tjänstefördelningen hämtas från deras register och justeras med skolans villkor. Produkten är framtagen tillsammans med Royal Schedule. | Din koppling mellan namnen stämmer. Kontrollera vilken produktvariant kontot ger, vilka tillval som ingår och vilken integration som erbjuds vår egen plattform. [SchoolSofts produktbeskrivning](https://schoolsoft.se/produkter/ai-schema/). |
| Skola24 Schema | Demohjälpen visar tjänstefördelning till lektioner, automatisk och manuell placering, flexibla starttider, perioder, lunch/rastvillkor och parallella grupper. Den beskriver en Windowsapplikation med ClickOnce och Edge. | Bra jämförelse för svenska skolflöden. Bekräfta aktuell distributionsform inför prov på Mac. Demodatabas behöver tilldelas; hjälpen är ingen bekräftelse på egen tillgång. [Demohjälp](https://www.skola24.com/support/testdatabas-fran-skola24/testdatabas-skola24-schema/). |
| TimeEdit AutoPilot | Aktiviteter granskas före automatisk schemaläggning. Villkorsprofiler innehåller hårda och mjuka regler; resultat visar oplacerade aktiviteter och villkor som orsakat problem. | Jämför framför allt regler, resultatförklaringar och resursval. Svenskt gymnasieflöde och användning som separat motor behöver provas och bekräftas. [AutoPilot](https://www.academy.timeedit.com/products/autopilot). |
| aSc TimeTables | Automatisk generator, manuell bearbetning, webbläsarversion för flera operativsystem och Windowsversion som kan användas utan nät. Webbplatsen beskriver även en AI-panel för frågor och tillåtna ändringar. | Bra jämförelse för generator och redigering på Mac. Provversionens export är begränsad och utskrifter har vattenmärke enligt leverantören. [Produkt och provversion](https://asctimetables.com/). |

Royal beskriver fixering och parkering av lektioner, perioder, varierande lektionslängd, analys av undervisningstid samt synkhistorik. Automatisk körning kan skriva över det aktuella schemat; provningen bör därför utgå från kopior. CoPlan är enligt funktionsöversikten ett separat tillval med samtalsstöd, sökning och ändringar som förbereds för användarens granskning. RePlan är ett separat tillval för vikariearbete. Exakt tillgång beror på installation, behörighet och produktvariant. [Royals funktionsöversikt](https://royalschedule.com/en/education/all-features/).

## Vad är känt om integration och algoritmer?

### Royal: offentlig specifikation gäller schemadata

Den hämtade OpenAPI-roten anger version 2.0.0, implementation av SS12000:2020 och Bearer/JWT. Den listar personer, tjänster, grupper, aktiviteter, kalenderhändelser, rum och resurser. Kalenderdelen beskriver GET-listning, GET per ID och POST för uppslag; POST betyder här inte att en ny lektion skapas. Ingen väg för att starta schemaberäkning finns i den granskade rotfilen. Prenumerationer och borttagna entiteter är kommenterade där, vilket inte belägger tillgängliga webhooks eller borttagsflöden. [API-dokumentation](https://ss12000.royalschedule.com/), [granskad rotfil](https://ss12000.royalschedule.com/api/openapi.yaml), [kalenderdel](https://ss12000.royalschedule.com/api/paths/calendarEvents.yaml).

Slutsats: ett dokumenterat API för schemadata finns. Ett partner-API för själva beräkningen, dess villkor och möjlighet att använda vår egen arbetsyta är fortfarande öppna frågor. Frånvaron i denna specifikation betyder inte att ett sådant erbjudande saknas. Vi har inte gjort autentiserade API-anrop. Specifikationens versionsnummer är inte bevis för stöd för varje del av standarden eller en senare standardutgåva.

### Skola24: skiljer grunddata från export

Leverantören beskriver Integration Grunddata för elevdata och API Bas/Plus för export av schema och frånvaro i SS12000-format. Det belägger inte ett API som driver schemageneratorn från vår app. [Skola24s integrationsbeskrivning](https://www.skola24.com/produkter/plattformen/).

### aSc: ovanligt tydlig algoritmbeskrivning, äldre uppgift om tjänstegräns

Den publicerade hjälpen beskriver en egen algoritm med backtracking, heuristiker, optimerade datastrukturer, flertrådning och C++. Samma hjälpartikel säger att en generator som fristående indata–utdata-tjänst inte erbjuds och hänvisar till användarens validering, regeljustering, arbete i schemat och export. Artikeln är äldre än dagens produktwebbplats; ett aktuellt partnererbjudande måste bekräftas. Det går inte att härleda dagens hela implementation från den historiska beskrivningen. [aScs algoritm- och integrationshjälp](https://help.asctimetables.com/text.php?id=803&lang=en).

### Vad ordet AI faktiskt säger

Automatisk optimering och språkbaserad assistans är olika förmågor, även om båda kan marknadsföras som AI. De granskade källorna belägger inte Royals eller TimeEdits exakta beräkningsalgoritm, träningsdata eller användning av språkmodeller i placeringsmotorn. Det finns alltså inte stöd för att slå fast vare sig att deras schemaberäkning använder en språkmodell eller att produkterna saknar AI. Vår utvärdering ska pröva beteende och kvalitet, inte dra slutsatser av namnet.

## Verktyg för en egen motor

| Verktyg | Dokumenterade egenskaper | Vad vi själva behöver bygga eller utreda |
| --- | --- | --- |
| FET | Skolschemaprogram med viktade tids- och resursvillkor och elevgrupper som kan överlappa. Licens GNU AGPLv3. Utvecklaren beskriver `fet-cl`, som tar en XML-fil och lämnar scheman i XML/HTML. | Formatöversättning, jobbhantering, resultatkontroll och vår arbetsyta. Licensens tillämpning på tänkt integration behöver bedömas före produktval. Nuvarande binär och körbeteende är inte provade. [Funktioner](https://lalescu.ro/liviu/fet/features.html), [utvecklarens beskrivning av kommandoversionen, 2023](https://lalescu.ro/liviu/fet/forum/index.php?topic=5779.0). |
| Google OR-Tools / CP-SAT | Generell optimeringsmotor för heltalsvillkor och målfunktioner. Skiljer giltig lösning från bevisat optimal lösning, bevisad omöjlighet, ogiltig modell och okänt resultat. Körningar kan tidsbegränsas. | Skolans hela modell, mål, konfliktförklaringar, redigering, jobbhantering och publicering. Officiella exempel använder Python, C++, Java och C#; en eventuell Rustkoppling behöver egen verifiering. [CP-SAT](https://developers.google.com/optimization/cp/cp_solver), [tidsgränser](https://developers.google.com/optimization/cp/cp_tasks). |

FET är en skolprodukt med en användbar kommandoversion. CP-SAT är ett generellt verktyg, inte en färdig skolprodukt. De fyller olika roller i en utvärdering. Ingen motor är installerad eller benchmarkad i detta arbete.

## Förslag till avgränsad backendstruktur

Kodläst nuläge: React/TypeScript med Vinext/Vite, TypeScript-API i Cloudflare Workers/workerd och PostgreSQL i Supabase. Skyddade datavägar använder databastransaktioner, serverkontrollerade mandat och säkerhetslogg. Relevant källkod finns i `web/package.json`, `web/vite.config.ts` och `web/lib/server/db.ts`. Den befintliga exempelvyn för schema är inte en automatisk beräkningsmotor.

Föreslagen ansvarsfördelning, inte beslutad implementation:

1. Plattformen skapar ett versionsbundet beräkningsunderlag från undervisningsbehov, grupper, läraruppdrag, resurser, perioder och kalender. Timplan/programplan är underlag för undervisningsbehov; poäng får inte automatiskt behandlas som schemaminuter.
2. En separat tjänst kör beräkningen som ett bakgrundsjobb med status, avbrott och tidsgräns. Rust kan användas för tjänsten utan att resten av appen skrivs om. Motorval och språkval görs var för sig.
3. Resultatet anger placerade och oplacerade lektioner, villkorsutfall och vilket underlag det bygger på. En fristående kontroll verifierar obligatoriska regler.
4. Schemaläggaren jämför förslag, ser ändringar, låser placeringar och granskar konflikter. Förändrat underlag gör ett äldre förslag inaktuellt tills det har kontrollerats igen.
5. Plattformens befintliga behörighetskontroller styr godkännande och publicering. Beräkningstjänsten behöver inget generellt skrivmandat till elevregistret.

En språkassistent kan föreslå regler och förklara skillnader, men förslagen måste bli uttryckliga, validerade ändringar som går att granska. Prioritera förklaringar som går att följa till faktiska regler och resurser.

Rusts roll behöver prövas med mätningar. Underlaget ger inget belägg för att dagens TypeScript-API är en flaskhals eller att ett språkbyte ensamt gör schemat bättre. En första prototyp bör köra samma regelmodell och mäta både beräkning och integration. Rust som fristående process och Rust/Wasm i Workers är skilda driftalternativ; kompatibilitet och resursgränser återstår att utreda.

## Provplan för Royal Schedule / AI Schema

Använd en tilldelad provorganisation med syntetiska uppgifter. Första passet kartlägger produktvariant, importformat, behörigheter och tillval. Därefter byggs ett litet begripligt underlag: två klasser, fyra lärare, tre rum och tolv lektionspass under fem dagar. Lägg till fallen nedan ett i taget och spara en kopia före varje beräkning. Dessa är föreslagna provvillkor, inte nationella lagkrav.

| ID | Prov | Förväntat resultat / observation |
| --- | --- | --- |
| S01 | Skapa grundschema med lektioner på 45, 60 och 90 minuter. | Alla obligatoriska pass får plats utan dubbelbokning. Kontrollera undervisningsminuter per aktivitet, inte bara antal pass. |
| S02 | Gör en lärare tillgänglig endast tisdag 09–10 och ge samma lärare två obligatoriska 60-minuterspass den veckan. | Ett komplett giltigt schema är omöjligt. Verktyget visar kvarstående problem eller oplacerade pass; ingen dubbelbokning eller tyst regeluppluckring. Ett timeoutresultat räcker inte som bevis för omöjlighet. |
| S03 | Två valgrupper ska gå parallellt. Lägg därefter en syntetisk elev i båda grupperna. | Parallellitet kan uttryckas. Det ändrade medlemskapet ger en konflikt som går att förstå. Observera om kontrollen sker på klass-, grupp- eller individnivå. |
| S04 | En lärare arbetar i två byggnader med 20 minuters restid. Ett pass kräver det enda laboratoriet; ett annat kräver större rumskapacitet. | Resurs- och tidsmarginalerna respekteras, eller stödets begränsning dokumenteras. |
| S05 | Ange obligatorisk lunch/rast och två konkurrerande önskemål, exempelvis få håltimmar och ledig fredag för en lärare. | Obligatoriska regler bevaras. Det framgår vilka önskemål som inte uppfyllts och hur prioritet kan ändras. |
| S06 | Fixera fyra placeringar. Ändra sedan en lärares tillgänglighet och beräkna om. | Fixeringarna bevaras om de fortfarande är giltiga. Mät hur många andra pass som flyttas och om ett omöjligt lås förklaras. |
| S07 | Flytta ett pass manuellt till en upptagen tid och ändra därefter dess längd. | Begriplig konfliktkontroll och kontroll av minuter. Pröva ångra, granskning och kopia/version utan verklig publicering. |
| S08 | Lägg till en lovdag, en enstaka inställd lektion och en period som bara gäller en del av terminen. | Skillnaden mellan veckomönster och faktiska tillfällen syns; beräknad undervisningstid följer kalendern. |
| S09 | Importera samma provunderlag två gånger, ändra ett namn och ta bort en resurs. Exportera om tillgång finns. | Kartlägg ID-matchning, dubbletter, lokala rättelser, borttag och vad som faktiskt följer med tillbaka. Att passera en filkontroll bevisar inte full integration. |
| S10 | Be eventuell CoPlan-assistent förklara en konflikt och föreslå en flytt. | Förklaringen stämmer med reglerna. Det går att granska och avvisa ändringar; obligatoriska regler kontrolleras efter godkännande. Om tillvalet saknas: ej provat. |

Efter första passet föreslås ett större underlag med sex klasser, tolv lärare, åtta rum och cirka 150 pass samt valgrupper. Dokumentera produktversion, data- och regelversion, inställningar, tid till första användbara förslag, total körningstid, oplacerade pass, regelbrott, håltimmar, skoldagens längd och antal flyttade pass efter ändring. Kör samma underlag minst tre gånger. Leverantörens interna poäng kan inte jämföras direkt med en annan motors poäng; räkna gemensamma verksamhetsmått från resultaten. Tid som användaren behöver för import och rättning räknas separat från maskinens beräkningstid.

## Frågor att besvara före integrationsval

- Kan ett behörigt partnersystem starta, följa och avbryta beräkningsjobb med egna indata, eller erbjuds bara import/export av data?
- Får beräkningen användas under vår egen produkt och arbetsyta? Vilka licenser, tillval och kostnader gäller?
- Vilka regler kan överföras via API, och vilka måste sättas manuellt i leverantörens gränssnitt?
- Vad omfattar det faktiska SS12000-kontraktet: version, entiteter, läsning/skrivning, stabila ID:n, historik, ändringar och borttag?
- Hur hanteras låsningar, ändrad indata, köer, samtidiga körningar, tidsgränser och delvis placerade scheman?
- Vilka kundgränser, roller, loggar, driftplatser och dataflöden gäller för beräkning och eventuell assistent?
- Hur kan vi ta ut vårt underlag, våra regler och våra resultat vid ett framtida byte?

Frågorna är förberedda inför provning och eventuell leverantörsdialog. Inga svar från leverantör har erhållits. Royal-provningen med det lilla underlaget kan ske när tillgång finns. Gemensamt kontrakt/mandat och vidare Rust-/motor-/AI-arbete följer den senare användarinriktningen och ordningen i [schemadelprojektet](SCHEMAMODUL-PROJEKT.md).
