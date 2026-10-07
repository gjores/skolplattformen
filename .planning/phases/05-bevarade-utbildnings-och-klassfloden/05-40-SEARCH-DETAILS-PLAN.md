---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "40-SEARCH-DETAILS"
type: execute
status: planned
wave: 5
depends_on: ["05-38-READ-PERFORMANCE"]
prerequisite_for: ["05-40"]
requirements: [PLANERING-02, PLANERING-03, PLANERING-04]
autonomous: true
files_modified:
  - web/lib/planning-year-contract.ts
  - web/lib/planning-year-contract.test.mjs
  - supabase/migrations/20261006123000_phase5_planning_year_search_details.sql
  - supabase/tests/phase5_planning_year_search_details.test.sql
  - work/pilot/verify-planning-year-search-details.mjs
  - work/pilot/verify-planning-year-search-details.test.mjs
  - work/pilot/phase5-planning-year-search-fixtures.mjs
  - work/pilot/apply-planning-year-search-details.mjs
must_haves:
  truths:
    - "Behörig användare hittar utbildningen genom namn, lokal kod, program, inriktning och kull i hela det serveravgränsade års-/skolurvalet, även efter första sidan."
    - "Program-/inriktningsuppgifter är faktiska sparade koder och verifierade katalogbenämningar; okänd uppgift visas som saknad och ersätts inte med en gissad aktuell programversion."
    - "De två uttryckliga äldre/utökade radkontrakten är strikta. Originalets 93 SQL-prov, 18 SQL/TS-kontrakt och 05-38:s historiska bevis förblir oföränderliga."
    - "Samma mandat, auditpar, felkoder, 28 Worker-entrypoints, verkliga plan-/källidentiteter och alla hela verksamhetsrader består."
  artifacts:
    - path: web/lib/planning-year-contract.ts
      provides: "Två slutna bakåtkompatibla radformer och explicit parsad utbildningsmetadata"
    - path: supabase/migrations/20261006123000_phase5_planning_year_search_details.sql
      provides: "Additiv privat metadata-/sökrättning ovanpå den faktiskt verifierade prestandadefinitionen"
    - path: work/pilot/verify-planning-year-search-details.mjs
      provides: "Källbundet rollbackbevis, faktisk skyddad Worker-sökning och helrads-/auditbevarande"
  key_links:
    - from: public.phase5_planning_year_rows(jsonb)
      to: public.offerings.local_code / program_code / orientation_code
      via: "Den egna verkliga utbildningsraden efter mandat-/skolavgränsning, före sökning/sortering/count/sidindelning"
    - from: web/lib/planning-year-contract.ts
      to: /api/planering/lista och /api/planering/oversikt
      via: "Explicit legacyShape eller legacyShape + exakt searchDetails; inga fria tilläggsfält"
    - from: 05-40-PLAN.md
      to: searchDetails i PlanningRow
      via: "Faktiskt verifierade koder/benämningar för tabellens program-/inriktningsvisning och serverns fritextsökning"
---

# 05-40 — Avgränsad sökrättning före tabellsteget

**Status:** Planerad teknisk rättning av ett färskt verifierat gap i den redan beställda tabellsökningen. Root har granskat och infört den som förutsättning 2026-10-07; inget nytt verksamhetsbeslut krävs. Inte genomförd eller verifierad leverans. Ingen implementation, DB-/API-körning eller användarkontroll följer av att denna fil skrivs. Den pågående prestandaverifieringens källor lämnas orörda. Genomförande börjar först när 05-38-READ-PERFORMANCE har fullständigt tillämpat PASS före UI05-39–43. Detta håller äldre API-/fixturkällor oförändrade fram till den nya källbundna backendverifieringen.

**Färskt gap:** 05-40 uppgift 2 kräver sökning på namn/lokal kod/program/inriktning/kull. Både ursprungliga och föreslagna prestandavarianten av `phase5_planning_year_rows(jsonb)` söker nu endast `educationName`, `cohort` och `schoolName`. `PlanningRow` saknar kod-/program-/inriktningsmetadata. Detta kan inte rättas med klientfiltrering av första sidans 50 rader.

**Verifierade källnamn:** Kolumnen heter `offerings.local_code`, inte `offerings.code`. Övriga fält är `program_code` och `orientation_code`. `organisation-model.ts`/`organisation-store.ts` använder `localCode`, `programCode` och `orientationCode`; äldre `ProgramplanEducationSummary` har redan samma koder. Katalogbenämningar för en historisk plan måste däremot komma ur dess verifierade katalog-/programversion, inte ur ett godtyckligt senaste programuppslag.

**Omfattning:** Åtta implementation-/provfiler, tre sekventiella uppgifter med högst fem filer vardera. Bara befintlig privat `public.phase5_planning_year_rows(jsonb)` ersätts i SQL. Ingen ny RPC, authzprincip, verksamhetsmutation, tabell, index, grant, elevrättighet eller beslutskommando. UI-tabell och handbok genomförs i 05-40/43 efter detta läsunderlag. Krävs en ytterligare SQL-signatur eller annan princip delas arbetet före implementation.

<objective>
Ge 05-40 verkligt sökbara och visningsbara utbildningsdetaljer utan att ändra skol-/års-/plan-/källavgränsningen.
Purpose: Lokal benämning kan skilja sig från programnamn; en kod på senare sida måste hittas av servern och äldre planversioner måste förbli öppningsbara med sina verkliga referenser.
Output: Strikt bakåtkompatibelt läskontrakt, en additiv privat korrektiv migration samt faktiska SQL-/API-/bevarandebevis.
</objective>

<execution_context>
@/Users/petter.gjores/.codex/skills/gsd/agents/executor/SKILL.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-40-PLAN.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-38-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-38-READ-PERFORMANCE-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-FUNCTION-INVENTORY.md
@web/lib/planning-year-contract.ts
@web/lib/planning-year-model.ts
@web/lib/programplan-workspace-contract.ts
@web/lib/organisation-model.ts
@web/lib/organisation-store.ts
@supabase/migrations/20260905120000_huvudman.sql
@supabase/migrations/20261006120000_phase5_planning_year_reads.sql
@supabase/migrations/20261006121000_phase5_worker_planning_year_reads.sql
@supabase/migrations/20261006122000_phase5_planning_year_read_performance.sql
@supabase/tests/phase5_planning_year.test.sql
@work/pilot/verify-planning-year-read-performance.mjs
@work/pilot/verify-planning-year-api.mjs
@work/pilot/phase5-planning-year-fixtures.mjs
</context>

## Föreslaget slutet metadatakontrakt

`PlanningRow` får en uttryckligen parsad valfri egenskap `searchDetails`. Egenskapen är valfri enbart för bakåtkompatibilitet med det befintliga radkontraktet. Den nya SQL-projektionen ska leverera den på varje rad, även för utbildning utan program-/timplan:

```ts
searchDetails?: {
  localCode: string | null;
  programCode: string | null;
  orientationCode: string | null;
  programName: string | null;
  orientationName: string | null;
}
```

Koderna återger den verkliga utbildningens sparade fält. `localCode` är lokal text enligt befintliga gränser, inte en nationell programkod. Program-/inriktningskoder följer befintlig kodparser och valideras för skolformen. Benämningarna får endast hämtas från samma verifierade källas katalog-ID och exakt programkod/version och, för inriktningsnamnet, exakt inriktningskod. Om utbildningens kod inte överensstämmer med den verifierade källan lämnas benämningen `null`; underlagets frysning och utbildningens aktuella metadata blandas inte till en ny källa. Saknad plan/basis eller okänd katalog ger `null`-benämning och verklig sparad kod, ingen latest-katalogfallback.

Detta är presentations- och sökmetadata. Den ersätter inga befintliga `plan`, `source`, `start`, `application` eller `classes`, och får inte användas för behörighet, klassidentitet, planval eller beräkning av poäng/timmar. 05-40 visar koder och, där verifierat, benämningar; saknad uppgift förblir synlig.

<tasks>
<task type="auto">
  <name>1. Lägg till exakt två strikta radformer och bevisa äldre kontraktskompatibilitet</name>
  <files>web/lib/planning-year-contract.ts, web/lib/planning-year-contract.test.mjs</files>
  <action>Inför typen och parsern för searchDetails. Behåll samma skydd mot getters, symboler, prototyper, extra fält, felaktiga arrayer och alla befintliga mandat-/års-/käll-/diagnos-/summakontroller. Identifiera radformen först genom det kontrollerade plain object och Object.hasOwn(searchDetails); godta därefter exakt den ursprungliga 19-fältsformen eller dessa 19 fält plus searchDetails. Det utökade objektet måste ha exakt fem namngivna metadatanycklar, rätt null-/text-/kodtyper och relevanta skolformsgränser. Present-but-undefined, partiella metadatanycklar, fria nationella koder, extra fält eller rå katalogpayload nekas. Allmänt optional-keys-läge eller borttagning av strict shape är förbjudet. När äldre form parsas ska utdata behålla exakt äldre form och utelämna searchDetails; den får inte automatiskt kompletteras med ett nytt nullobjekt. Nya formens utdata behåller enbart parsade fält. Lägg rena prov för båda formerna i lista/översikt och same-source-/års-/klass-/summeringsgränser, nullmetadata, båda skolformerna GR/IM utan påhittat GY-program, samt negativa getter/extra/partiell/felaktigmetadata. De 18 historiska SQL/TS-kontrakten fortsätter att använda oförändrade originalshape när originaldefinitionen körs; parsern måste kunna läsa dem utan generell shape-relaxation. Inga historiska prover eller rapporter ändras. Bygg ett separat skyddat Worker-bygge av versionshanterad parser/adapter före en tillämpning som kan skicka utökad form. Kör faktisk befintlig SQL/API-läsning med detta bygge för att visa att äldre form fortfarande ger 200 och korrekt auditpar. Ingen publik kandidatdefinition behöver öppnas temporärt för att göra parserbeviset.</action>
  <verify>I web/: node --test lib/planning-year-contract.test.mjs lib/server/planning-year.test.mjs; npx tsc --noEmit; npx oxlint app lib; npm run build:protected. Node-prov bevisar kontrakt, inte SQL-/mandatbeteende. Kontrollera actual workerd/build-/källlikhet på ägd isolerad port före uppgift 2; ordinarie 3012 lämnas oförändrad.</verify>
  <done>Äldre exakt radshape och nya exakt deklarerade metadata är parsade och byggbara; de 18 historiska kontrakten kräver ingen ändring eller godtycklig fältacceptans.</done>
</task>

<task type="auto">
  <name>2. Skriv additiv metadata-/sökrättning och bevisa rollback/paritet på verkliga underlag</name>
  <files>supabase/migrations/20261006123000_phase5_planning_year_search_details.sql, supabase/tests/phase5_planning_year_search_details.test.sql, work/pilot/verify-planning-year-search-details.mjs, work/pilot/verify-planning-year-search-details.test.mjs, work/pilot/phase5-planning-year-search-fixtures.mjs</files>
  <action>Utgå från faktiskt tillämpad och hashverifierad 06122000-definition, aldrig från en pågående eller bara föreslagen performancefil. Migrationen CREATE OR REPLACE endast rows(jsonb), med oförändrad ägare, VOLATILE, SECURITY DEFINER, search_path och rå owner-only ACL. Lägg searchDetails på varje verklig rad efter scopekontroll. Utöka serverns fritext med faktiska local_code/program_code/orientation_code och de verifierade benämningarna; behåll namn/kull/skola, befintlig trim-/längd-/kontrollteckensgräns och parameteriserad textmatchning. Använd explicit coalesce per nullable fält så att en saknad inriktning inte nollar hela söktexten. Ingen SQL-sträng från klienten, wildcardtolkning eller databasmutation följer av fritexten. Matcha före count/sort/sidindelning över hela behöriga urvalet. Den exakta programcachekeyn, 128-key-/50 000-cellgränserna, fallback och frysta timplansvägen består. Katalogbenämningar får återbrukas endast under samma verifierade key; introducera inte en dyr ny full resolver per skol-/planrad eller en global/sessionsbaserad cache. Planernas och utbildningarnas egna referenser får aldrig hämtas från en annan cachepost. De nya metadata ingår i hela resultatets selectionRevision så att ändrad lokal kod eller benämning ger 409 vid fortsatt gammal sida; befintliga sorteringsnycklar och tie-breakers består.

  Skapa en separat ägd fixturewrapper/harness; originalets 05-37/38/performance-migrationer, provfiler, runners och rapporter lämnas oförändrade. Nya runnern binder aktuell grund till fullständigt 05-38-final och performance-applied-final/API-final, deras egna historiska källhashar och den faktiskt tillämpade katalogen/journalen. Historiska sourcehashar kontrolleras mot den versionshanterade revision de bevisar; planens två avsedda kontraktsfiler binds separat till nya bytes/nytt bygge. Ett äldre PASS får inte tvingas att matcha ett avsiktligt nytt kontrakt genom att skriva om dess rapport eller stänga av dess källa-/bygggrind. Kontrollera att de gamla källskillnaderna är precis planens redovisade kontraktsändringar och den nya additiva migrationen.

  Owned dataset ska innehålla minst 52 GY-programramar med lika namn, flera skolor/två kunder, en unik lokal kod enbart efter första sidan, program- och inriktningskod som inte förekommer i namn/kull/skola, olika verkliga program/inriktningar, nullkoder/benämningar, saknad program-/timplan och gamla/frysta källversioner. Prova små/stora bokstäver, program- och inriktningsbenämning, kombination med år/skola/årskurs/status/kullrelation/arkiv, sort/50+2-sidor/tomresultat samt list-/översiktsparitet. Prova lokal kod med %/_/apostrof som vanlig text enligt serverns substringregel och att främmande kund/skola aldrig påverkar count/metadata. Kandidaten körs enbart i kontrollerad rollback här: verklig exakt gammal/ny kärnparitet krävs efter att enbart avsedd searchDetails har jämförts separat; sökfallens avsiktliga nya träffar redovisas som konkreta before/after-fall, inte som påstådd oförändrad söksemantik. Revisionens avsiktliga ändring redovisas och valideras, övriga identiteter, celler, klasser, totalsummor, felkoder och auditkrav är exakta. Prova hela 93 oförändrade original-SQL-matrisen och 18 oförändrade kontraktsfall både runt den ursprungliga definitionen i rollback och den nya kända formen; återkalla enbart tre planning-RPC-grants inne i den historiska closed-ACL-transaktionen, och bevisa att exakt samma råa ACL/28 mängd kommer tillbaka efter rollback. Ingen skippning, positiv mock, definierad testcache eller generell bortfiltrering av svarsfält får ge PASS. Rena gateprov ska neka ändrad metadata-/cachekey, fel katalogproveniens, partiell setup, fel extra fält, saknat faktisk sökfall, fel journal/ACL/source/build och ofullständigt städningsbevis.</action>
  <verify>Från rot: node --test work/pilot/verify-planning-year-search-details.test.mjs; node work/pilot/verify-planning-year-search-details.mjs --target protected --mode rollback --base-url http://127.0.0.1:3060 --out work/pilot/results/phase5-40-search-details-rollback.json. Faktiska DB-/API-/cleanupsteg är sekventiella och körs bara mot ägt skyddat syntetiskt mål. SQL-prov kan jämföra kandidat i uncommitted rollback; Worker-provet före apply visar aktuell äldre DB-form med det nya bakåtkompatibla bygget.</verify>
  <done>Exakt förutsagd privat definitionshash och noll oavsiktliga diffar är bevisade; hela gamla kärnan/93/18 består och nya SQL-sökfallen är verkliga. Ny parser/Worker fungerar mot äldre verklig DB-form. Alla ursprungsrader/auditankare/grants/journal är bevarade efter ägd cleanup.</done>
</task>

<task type="auto">
  <name>3. Applicera exakt privat rättning och verifiera nya sökningar på faktisk Worker</name>
  <files>work/pilot/apply-planning-year-search-details.mjs, work/pilot/verify-planning-year-search-details.mjs, work/pilot/verify-planning-year-search-details.test.mjs</files>
  <action>Tillåt enbart 20261006123000_phase5_planning_year_search_details.sql efter komplett källbundet rollback/93/18-/parserbygge-bevis. Kräv migration 06122000 som senaste exakta föregångare samt exakt 06120000/06121000/06122000-journal, aktuellt privata helper-/övrigt katalogfingeravtryck, samma 28 Worker-entrypoints och 15 ursprungliga verksamhetstabellers helradshashar. Inom samma migrationslås får enbart rows(jsonb)-definitionen ändras till den förutsagda pg_get_functiondef-hashen och en exakt journalpost läggas till. Alla övriga public-definitioner, ägare, råa funktion-/tabell-/sekvens-/vy-ACL, RLS, originalverksamhet inklusive tidsstämplar, säkerhetsaudit och identitetsankare består. Kopiera filen bara till det ägda lokala målets migrationskatalog. Det separat byggda Worker-bygget måste fortfarande motsvara adapter/routes/kontrakt/modell/sourcebytes som prövats; versionshanterade verktygs-/GSD-commits kan tillkomma utan att produktkällgrinden kringgås.

  Kör därefter faktiskt GETurval och POSTlista/oversikt mot precis den journalförda definitionen. Varje lyckad planning-läsning ska ha required DB-/Worker-auditpar (urval två händelser, lista/översikt även setup-paret: fyra händelser) och no-store. Alla namngivna kod-/benämnings-/scope-/kombinations-/sid-/revisionfall från uppgift 2 ska nu verifieras genom real HTTP, inklusive träff enbart från senare sida, 401/403/400/409 och DB-/Worker-auditfel 503 utan datapayload eller ok-audit. Kör befintliga 05-38-API-matrisen oförändrad som aktuell separat regression; dess nya rapport beskriver det nya bygget och dess källor, gamla 05-38-PASS skrivs inte om. Samma äldre GY-/GR-/IM-/programread-gränser består. Kontrollera att 52-radersläsning/sökning/sida2 fortfarande klarar performance-rättningens faktiska mål (median högst 5 sekunder, alla mätningar under 10 sekunder och actual HTTP30s oförändrat); jämför med avgränsat dokumenterad prestandabaslinje och redovisa eventuell ökad katalogkostnad. Bevara alla första FAIL/PARTIAL och serialiserad cleanup av nya syntetiska verksamhetsrader med hela original-/audit-/ankarbevis. Vid försämring eller saknad metadata/benämningsproveniens öppnas ett konkret gap; 05-40 får inte beskriva kod-/program-/inriktningssökning som färdig.

  Efter avgränsat fullständigt PASS uppdaterar root funktionsinventering, STATE, 05-40:s dependency samt aktuella GSD-plan-/kravspår. Historisk 05-37-definition, 93/18-proven och 05-38-/performance-rapporter består med sina ursprungliga källor och status. PLANERING/ADMIN/hela fas 5 och mänskligt användarprov förblir öppna tills UI och slutprov är klara.</action>
  <verify>Från rot: kontrollerad apply med --migration 20261006123000_phase5_planning_year_search_details.sql --evidence work/pilot/results/phase5-40-search-details-rollback.json --out work/pilot/results/phase5-40-search-details-apply.json; node work/pilot/verify-planning-year-search-details.mjs --target protected --mode applied --base-url http://127.0.0.1:3060 --out work/pilot/results/phase5-40-search-details-final.json. Befintlig API-runner får en dedikerad phase5-40-search-details-api-final.json; inga äldre rapportvägar återanvänds. Relevanta TypeScript-/lint-/byggkontroller från uppgift 1 redovisas med faktiska revisioner, ingen ny appbyggnad enbart för rapporttext.</verify>
  <done>Nuvarande faktiska API kan söka alla begärda utbildningsdetaljer över hela behöriga urvalet med korrekt metadata, pagination/revision/audit. Bara avsedd privat definition och ny journalpost ändrade; samma 28 grants, gamla kärnflöden och hela originaldata består. 05-40 har tillräckligt verkligt läsunderlag för tabellimplementation.</done>
</task>
</tasks>

## Risker och tydliga gränser

- **Kontrakt kontra historik:** Att bara lägga fält i SQL ger 503 mot det äldre strikta Worker-bygget. Ordningen är parser som godtar två exakta former → verifierat nytt bygge mot gammal DB-form → rollback-SQL-bevis → kontrollerad apply → verkligt nytt API. Äldre input ska ge äldre outputshape; originalets 18 parserfall ändras inte. Ett godtyckligt optional-keys-argument är ingen acceptabel lösning.
- **Verklig kolumn:** Lokal kod är `local_code`. Ett antaget `code`-fält skulle ge tom metadata eller SQL-fel.
- **Historisk/förändrad källa:** Aktuell utbildningskod och fryst källversion är olika uppgifter. Benämningen ska verifieras mot den exakta källkatalogen och koderna; en ändrad eller okänd referens ger saknat namn, aldrig en ny tolkning av gamla celler.
- **Null och legacytext:** Nullable inriktning får inte förstöra hela söktexten. Lokal kod ska prövas med befintliga textgränser; den får inte pressas genom den nationella kodregexen. Felaktigt källfält får inte tyst backfyllas eller repareras i databasen för att få PASS.
- **Urvalsrevision:** Metadata ingår i resultatets hash. En befintlig klientrevision kan bli stale efter tillämpning; samma skyddade 409/läs-om-första-sidan gäller. Hashen får inte undanta metadata för att dölja denna förändring.
- **Bevisens källor:** Nytt parserbygge kan inte påstås vara samma bytes som äldre 05-38/performance-bevis. Gamla bevis binds till sina Git-källor, nya bevis till de nya källorna; inget gammalt PASS får skrivas om eller få en lättad validator.
- **Svarstid:** Benämningsuppslag får inte återinföra upprepade fulla katalogresolvers över 52 rader. Den tillämpade prestandarättningens exakta key och skyddsgränser består och uppmätt ny svarstid redovisas.
- **Verksamhetsdata och pilotstatus:** Bara ägda syntetiska metadata varieras i prov. Verkliga lokala koder eller skol-/personuppgifter kopieras inte till planeringsfiler. Detta bevisar inte en kommunanslutning, pilotdrift eller färdig användarupplevelse.

<verification>
Discovery nivå 0: faktisk offeringmodell/store/äldre listkontrakt, PlanningRow-parser, privata sökpredikat och 05-40:s ordalydelse är lästa. Inga externa beroenden behövs. Alla DB-/Worker-/städningsprov körs seriellt med aktuellt bygg-/source-/journalbevis och alla fulla originalrader; inga positiva API-mocks eller personpayloads loggas. Nytt UI provas först i 05-40 på dator/telefon och handboken/slutlig begriplighet hanteras i 05-43.
</verification>

<success_criteria>
05-40 kan implementera den redan beställda sökningen för lokal kod/program/inriktning och visa faktiska detaljer utan att hämta alla sidor eller gissa metadata. Strikta äldre/utökade kontrakt, verklig servermatchning och oförändrade mandat/audit/28grants/hela originaldata är verifierade. Genomförande och faktisk verifiering återstår.
</success_criteria>

<output>
Efter genomförande: 05-40-SEARCH-DETAILS-SUMMARY.md och VERIFICATION.md, dedikerade rollback/apply/API/final-/tids-/cleanupbevis samt separat uppdaterad funktionsinventering och GSD-dependency. Versionshantera avgränsat och pusha enligt AGENTS.md efter relevant kontroll; inga andra pågående källor blandas in. Planeringen är införd inom användarens uppdrag att fortsätta till konkret användarprov; implementation och commit görs först när föregångaren är genomförd.
</output>
