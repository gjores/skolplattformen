# Öppna API:er från Skolverket — vad projektet kan använda

5 september 2026. Underlaget bygger på egna anrop mot API:erna denna dag. Kontrollen kan köras om med `python3 work/skolverket-api/probe.py`. Anropen är läsande. Ingen integration är byggd; detta är ett beslutsunderlag.

## Sammanfattning

Fyra av Skolverkets API:er är öppna, svarar utan nyckel och är fritt användbara. Ett av dem — Syllabus — motsvarar direkt det första objektet i projektets informationsmodell, **Styrdokumentsversion**, som i dag inte finns i koden alls. Ämnen, nivåer, kurser, poäng, giltighetstider, centralt innehåll och betygskriterier finns där med stabila koder och versionshistorik.

De öppna API:erna löser däremot inget av det som administrationsvyerna hanterar i dag. Elever, undervisningsgrupper, schemapass, närvaro och betyg finns inte i någon öppen nationell källa; de kommer från huvudmannens egna system via SS 12000. Skillnaden är viktig: de öppna API:erna ger **referensdata om utbildningens innehåll**, inte **verksamhetsdata om personer**.

## Verifierat den 5 september 2026

| API | Bas | Kontroll | Resultat |
|---|---|---|---|
| Syllabus | `api.skolverket.se/syllabus/v1` | `GET /subjects?schooltype=gy` | 200, 880 ämnen, 425 kB, 0,16 s |
| Syllabus | | `GET /subjects?schooltype=gr` | 200, 27 ämnen, 5 kB |
| Syllabus | | `GET /programs?schooltype=gy` | 200, 56 program med inriktningar, 24 kB |
| Syllabus | | `GET /subjects/GRGRSVE01/versions` | 200, 15 versioner |
| Skolenhetsregistret | `api.skolverket.se/skolenhetsregistret/v1` | `GET /skolenhet` | 200, 10 647 enheter, 1,3 MB |
| Planned educations | `api.skolverket.se/planned-educations/v3` | `GET /school-units` | 200 endast med `Accept: application/vnd.skolverket.plannededucations.api.v3.hal+json`, annars 406 |
| Susa-navet | — | — | Ej kontrollerat i denna omgång |

Övrigt verifierat: ingen autentisering krävs, `access-control-allow-origin: *` på Syllabus, OpenAPI-beskrivning finns på `/syllabus/v3/api-docs` respektive `/planned-educations/v3/api-docs`. Skolverket anger CC0 för Syllabus-datat, alltså fri användning utan attributionskrav. Svarstiderna ovan är enstaka mätningar från en utvecklardator, inte ett tillgänglighetslöfte. Skolverket publicerar inga hastighetsgränser på dokumentationssidan; frånvaro av publicerad gräns är inte ett besked om att gräns saknas.

Skolenhetsregistret finns i två versioner. Skolverket rekommenderar v2 och har uppgett att v1 ska avvecklas. Rätt sökvägar i v2 är `/v2/school-units/{kod}`, `/v2/school-units?municipality_code={kommunkod}` och `/v2/organizers/{orgnr}`; svaren följer JSON:API-liknande form med `data.attributes` och huvudmannen som ett inkluderat objekt. Ingen av versionerna skickar CORS-huvuden, så webbläsaren behöver en egen läsväg.

## Den viktigaste kopplingen: typeOfSyllabus motsvarar projektets Regime

Koden har i dag `Regime = 'Gy25' | 'Gy11' | 'Grundskola'` i [admin-model.ts:2](web/lib/admin-model.ts#L2) som en etikett utan koppling till en källa. Skolverket gör samma uppdelning maskinläsbart:

| Projektets Regime | typeOfSyllabus | Beskrivning i API:et | Antal (gy) |
|---|---|---|---|
| Gy25 | `GRADE_SUBJECT_SYLLABUS` | Ämne med nivåer | 569 |
| Gy11 | `SUBJECT_SYLLABUS` | Ämne med kurser | 311 |
| Grundskola | `COURSE_SYLLABUS` | Kursplan för grundskolan (2011/Lgr22) | 27 (skolform gr) |

Exemplet i koden blir konkret. Gruppen `ma1b` med ämnestexten "Matematik, nivå 1b" och regime Gy25 ([admin-model.ts:96](web/lib/admin-model.ts#L96)) motsvarar i Skolverkets data ämnet `MATE` "Matematik" med nivån `MATE1B00X` "Nivå 1b", 100 poäng, skolfs 2023:130. Gruppen `ma2` "Matematik 2b" med regime Gy11 motsvarar kursen `MATMAT02b` i ämnet `MAT`, som har `endDate` 2030-06-30 och `canceledSkolfs` — utfasningen syns alltså i datat. Att båda i dag är fritext betyder att ingen kontroll kan upptäcka om en studieplansrad hänvisar till något som inte längre gäller för elevens utbildningskull.

Datat rymmer också det som en riktig planeringsvy behöver: `purpose`, `centralContent` per nivå eller kurs, och `knowledgeRequirements` med stegen E, D, C, B, A som HTML. Ett arbetsområde i undervisningsvyn skulle kunna peka på en identifierad nivå i en identifierad version i stället för på en textsträng.

Grundskolans kursplaner har ingen `courses`-lista utan `centralContents` och `knowledgeRequirements` uppdelade per årskursintervall, plus `gradeScale`. Grundskola och gymnasium behöver därför olika läsvägar i samma modell — samma slutsats som dokumenten redan drar för studieplaner.

## Vad varje API kan användas till

**Syllabus** ger styrdokumentsversioner: ämnen, nivåer, kurser, poäng, giltighet, centralt innehåll, betygskriterier, program och inriktningar. Detta är den enda av de fyra källorna som direkt kan ersätta hårdkodat innehåll i projektet i dag — i studieplaner, gruppadministration och arbetsområden.

**Skolenhetsregistret** ger skolenhetskod, huvudman, kommun, rektor, adress, skolformer och status. Nyttan ligger i uppstart och konfiguration av en huvudman: skolenhetskoden är den nationella identifieraren som SS 12000, DNP och statistik alla hänvisar till. Registret innehåller personuppgifter om rektorer och ska inte kopieras in i produkten bredare än behovet.

**Planned educations** ger utbildningsutbud per skolenhet samt statistik och SALSA-värden. Det hör hemma i eventuella jämförelse- eller kvalitetsvyer, inte i den dagliga administrationen. Det kräver rätt `Accept`-header.

**Susa-navet** ger utbildningstillfällen inom alla nationella utbildningsformer. Ej kontrollerat; relevansen för denna produkt ser låg ut i nuläget.

## Vad öppna API:er inte löser

Elevregistret, gruppmedlemskapen, schemapassen, närvaron och betygen i projektet har ingen öppen nationell motsvarighet. För dem gäller:

- **SS 12000:2020** är standarden för utbyte av person, grupp, aktivitet, kalenderhändelse och placering mellan skolans system. Den distribueras av SIS, inte som ett öppet API, och en OpenAPI-beskrivning ingår i standarden. Skolverkets referensimplementation för digitala nationella prov ligger öppet på GitHub och genomför en delmängd. Standarden är alltså läsbar och kan implementeras, men varje motpart avgör vilken profil och version som faktiskt stöds — detta är den punkt där dokument 07 redan varnar för att "öppet API" inte är ett integrationsavtal.
- **Digitala nationella prov** kräver provisionering enligt Skolverkets SS 12000-delmängd och avtal med Skolverket. Det är inte öppen data.
- **Identitet och behörighet** hämtas inte från Skolverket utan från huvudmannens katalog, i praktiken Skolfederation eller motsvarande.

## Förslag till arkitektur

Hämta inte styrdokument vid varje sidvisning. Informationsmodellen kräver att ett beslutsunderlag går att återfinna i den version som användes: "Ett föränderligt länkmål utan versionssäkring räcker inte som långsiktigt beslutsunderlag." Ett direktanrop från webbläsaren mot Skolverket uppfyller inte det, även om CORS tillåter det.

Rimlig lösning i den nuvarande kodbasen:

1. Ett hämtningsskript i `web/scripts/` som laddar ner valda skolformer och skriver en daterad ögonblicksbild som JSON i projektet, tillsammans med hämtningsdatum, `apiVersion` och `skolfs`-referens per post.
2. Ett smalt läslager i `web/lib/` som exponerar det appen behöver — ämne, nivå eller kurs, poäng, giltighetsperiod, regime — och som inte läcker Skolverkets HTML-fält in i modellen. Fulltext för centralt innehåll och betygskriterier hämtas separat och bara för de ämnen som faktiskt används.
3. Kodfält i modellen: `PlanItem` får ämneskod, nivå- eller kurskod och styrdokumentsversion; `Group` får samma för sitt `moduleId`. Regime härleds ur `typeOfSyllabus` i stället för att skrivas in för hand.
4. Kontroller som utnyttjar det nya: en studieplansrad vars kurs har passerat `endDate` för elevens utbildningskull ska visas som ogiltig, och ett gruppbyte till en grupp i en annan styrdokumentsordning ska blockeras med rätt skäl i stället för på en strängjämförelse.

Ögonblicksbilden är cirka 450 kB för gymnasiets ämneslista och 5 kB för grundskolans. Fulltexten för alla gymnasiekurser är cirka 610 kB. Det är hanterbart att versionera i projektet för de skolformer exemplet använder.

## Etapper

1. **Ämnes- och nivåkatalog med koder.** *Byggd 5 september 2026.* `web/scripts/fetch-syllabus.mjs` skriver en daterad ögonblicksbild till `web/lib/syllabus-snapshot.ts` (907 ämnen för gy och gr, cirka 290 kB, 31 kB komprimerad). `web/lib/syllabus.ts` är läslagret. Grupper och studieplansrader bär nu ämneskod, nivå- eller kurskod och styrdokumentsversion; namn, poäng och regelverk läses ur katalogen. Kontrollerna fångar okänd kod, nyare katalogversion, passerad giltighetstid, ämne upphävt före elevens utbildningsstart och avvikande poäng. Fulltexten för centralt innehåll och betygskriterier ingår inte.
2. **Styrdokumentsversion som eget objekt.** Versionsreferens per studieplansrad och arbetsområde, med synlig källa och skolfs-nummer. Detta är objekt ett i informationsmodellen.
3. **Centralt innehåll och betygskriterier i undervisningsvyn.** Ett arbetsområde kan hänvisa till innehåll i rätt version. Här behövs försiktighet: dokumenten är tydliga med att kriterier inte får bli obligatoriska kryssrutor.
4. **Skolenhet och huvudman vid uppstart.** *Byggd 5 september 2026.* Huvudmannen slår upp skolenheten i Skolenhetsregistret v2 (`/v2/school-units/{kod}`, `/v2/school-units?municipality_code=`, `/v2/organizers/{orgnr}`) via appens läsväg `web/app/api/skolenhet/route.ts`, eftersom registret saknar CORS-huvuden. Registrets programlista jämförs med utbudet. Personuppgifter utöver rektorsnamn förs inte vidare.
5. **Programkatalog för studieplaner.** Program och inriktningar ur Syllabus ersätter fritextfältet `program`. *Delvis byggd:* poängplanen för SA25 och EK25 ligger i ögonblicksbilden och används av timplansmodulen; studieplanens `program`-fält är fortfarande text.

Timplansmodulen (`web/lib/timplan-model.ts`) visar gränsen för de öppna API:erna: gymnasiets poängplan kommer ur Syllabus, men grundskolans timplan och garanterad undervisningstid finns bara i författningstext (Skolförordningen bilaga 1, Skollagen 16 kap. 18 § och 17 kap. 6 §) och ligger därför som daterade konstanter med källhänvisning.

Statistik- och jämförelsedata från Planned educations bör ligga utanför denna följd tills det finns en vy som faktiskt behöver dem.

## Kontroller före genomförande

För varje objekt som hämtas ska originalkälla, skrivansvar, giltighet, konfliktregel och avveckling fastställas, enligt dokument 12. För dessa API:er gäller särskilt: Skolverket är originalkälla för styrdokument och skolenhetsuppgifter och plattformen får inte skriva om dem lokalt; en ögonblicksbild ska ha datum och API-version; ett ämne som utgår ska inte tyst försvinna ur en pågående elevs plan; och en felad hämtning ska ge ett synligt fel, inte en tom katalog som ser giltig ut.

Att API:erna svarade denna dag säger inget om driftgarantier. Innan produktionsanvändning behöver Skolverkets villkor, aviseringsvägar för ändringar och avvecklingsplanen för Skolenhetsregistret v1 läsas i sin helhet.

## Källor

- [Skolverket: Öppna data](https://www.skolverket.se/om-skolverket/oppna-data)
- [Skolverket: API för läroplaner, kurs- och ämnesplaner (Syllabus)](https://www.skolverket.se/om-skolverket/webbplatser-och-tjanster/oppna-data/api-for-laroplaner-kurs--och-amnesplaner-syllabus)
- [Skolverket: API för skolenhetsregistret](https://www.skolverket.se/om-skolverket/oppna-data/api-for-skolenhetsregistret)
- [Skolverket: API för skolor, utbildningar och statistik (Planned education)](https://www.skolverket.se/om-skolverket/oppna-data/api-for-skolor-utbildningar-och-statistik-planned-education)
- [Skolverket: API för utbildningstillfällen (Susa-navet)](https://www.skolverket.se/om-skolverket/oppna-data/api-for-utbildningstillfallen-susa-navet)
- [Swagger: Syllabus API](https://api.skolverket.se/syllabus/swagger-ui/index.html)
- [Swagger: Skolenhetsregistret](https://api.skolverket.se/skolenhetsregistret/swagger-ui/index.html)
- [SIS: SS 12000:2020](https://www.sis.se/produkter/informationsteknik-kontorsutrustning/tillampning-av-informationsteknik/it-tillampningar-inom-utbildning/ss-120002020/)
- [Skolverket: SS 12000 referens-API för digitala nationella prov](https://github.com/skolverket/dnp-ss12000-reference-api)
