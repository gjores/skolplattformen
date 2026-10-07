---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "38-READ-PERFORMANCE"
type: execute
status: in_progress
wave: 4
depends_on: ["05-38"]
prerequisite_for: ["05-39"]
requirements: [PLANERING-02, PLANERING-03, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - supabase/migrations/20261006122000_phase5_planning_year_read_performance.sql
  - supabase/tests/phase5_planning_year_read_performance.test.sql
  - work/pilot/verify-planning-year-read-performance.mjs
  - work/pilot/verify-planning-year-read-performance.test.mjs
  - work/pilot/apply-planning-year-read-performance.mjs
must_haves:
  truths:
    - "Användaren kan söka, sortera och byta sida över alla 52 prövade programramar med uppmätt förbättrad svarstid, utan ändrat årsunderlag eller bortfiltrerade versioner."
    - "Varje plan behåller sin verkliga identitet, revision och skol-/källreferens; ett felaktigt underlag kan inte få en annan plans verifierade celler."
    - "Samma mandat, auditpar, felkoder, verksamhetsrader och exakt 28 Worker-entrypoints består; endast en privat hjälpares definition och dess nya journalpost ändras."
  artifacts:
    - path: supabase/migrations/20261006122000_phase5_planning_year_read_performance.sql
      provides: "Additiv ersättning av en befintlig privat läshjälpare med begränsat återbruk inom ett anrop"
    - path: supabase/tests/phase5_planning_year_read_performance.test.sql
      provides: "Exakt gammal/ny SQL-paritet och negativa återbruksfall på samma egna underlag"
    - path: work/pilot/verify-planning-year-read-performance.mjs
      provides: "Käll-/målgrindar, rollbackbevis, faktisk HTTP-tidsmätning och ordinarie API-matris med separat evidens"
    - path: work/pilot/apply-planning-year-read-performance.mjs
      provides: "Kontrollerad apply efter rollbackparitet, med exakt en avsedd definitionsdiff"
  key_links:
    - from: public.phase5_planning_year_rows(jsonb)
      to: public.phase5_gym_timplan_source(uuid) och public.phase5_planning_year_gym_cells(jsonb,uuid)
      via: "Befintlig fullständig validering för varje distinkt exakt katalog-/underlags-/termfördelningsnyckel"
    - from: work/pilot/apply-planning-year-read-performance.mjs
      to: work/pilot/results/phase5-38-read-performance-rollback.json
      via: "Källhashbunden gammal/ny paritet och oförändrade råa ACL, övriga definitioner, tabeller och journal"
    - from: work/pilot/verify-planning-year-read-performance.mjs
      to: work/pilot/verify-planning-year-api.mjs
      via: "Oförändrad faktisk API-matris efter tillämpning, plus egen read-only kontroll av den nya SQL-definitionen och tidsmätning"
---

# 05-38 — Avgränsad rättning av programlistans svarstid

**Status:** Påbörjad 2026-10-07 efter komplett faktisk 05-38 preflight/slutmatris15/247 PASS. Genomförs före 05-39. Inga nya milstolpekrav eller verksamhetsbeslut tillkommer. Användarens beställning att fortsätta tills användarprov behövs omfattar denna nödvändiga rättning.

**Aktuell provrättning 2026-10-07:** Omkörningen07:59–09:00UTC fick FAIL: de ägda SQL-fixturernas1h giltighet tog slut efter cache-cellgränsfallet; kvarvarande gamla fall och alla kandidatfall nekades42501. Även60min-watchdog flaggades. Ingen timing/original93 kördes i denna omgång. Full katalog/rå ACL/journal, alla15 helrader och originalaudit/identiteter bestod. Faktisk separat rollbackdiagnos12 bekräftar fresh00000/expired42501 på båda definitionerna; ytterligare aktuellt prov visar explicitPZ003 från den nya fixturgrinden. Endast korrektivets fyra syntetiska SQL-sessioner får3h giltighet och expired probe aborterar utanför negativfallscatch. SQL-processens separata resurstak blir120min med aktivt, exakt ägt backendstopp vid avbrott; HTTP30s och ordinarie sessioner ändras inte. Nytt fullständigt143/46- och93/18-bevis krävs med denna testkälla. Den äldre4f231…-rapporten är historik och kan inte återbrukas över den ändrade testhashen. Reserven är inte aktiverad.

**Tidigare mellanstatus 2026-10-07:** Hela rollback-matrisen143/46 och oförändrade original93/18 PASS efter den dokumenterade SQL-/fixturrättningen. Fullrapporten är fortsatt FAIL: första HTTP-baslinjeläsningen fick timeout30s, nio lyckade mätningar saknas. Alla15 hela originaltabeller/tidsstämplar, rå ACL28, katalog/journal och audit/identiteter bevarade. Separat faktisk diagnos gav samma timeout, därefter200/52/50 på28,675s med korrekt audit/no-store/bevarande/städning efter `ANALYZE public.programplan_catalogs`; endast plannerstatistik ändrad, ingen bevisad kausalitet eller fullplans-PASS. Alla felrapporter bevaras i failure-history. Den efterföljande expiry-omkörningen och provrättningen redovisas ovan. Ingen permanent tillämpning har gjorts.

**Färskt fynd:** På vaken dator tar faktisk Worker-läsning av 52 kanoniska programramar cirka 17 sekunder per HTTP-anrop, även vid upprepade sök-/listfrågor. Två frysta gymtimplaner tar cirka 0,4 sekunder. Detta är uppmätta lokala observationer från pågående 05-38, ingen allmän prestandagaranti. Spara slutliga exakta mätningar med byggrevision, datum och SQL-fingeravtryck innan rättningen bedöms.

**Avgränsning:** Fem implementation-/provfiler för en befintlig privat funktion. Ingen API-, UI-, authz-, tabell-, index-, grant- eller skrivfunktion ändras. Originalmigrationerna 05-37/38 och de 93 ursprungliga SQL-proven är oföränderliga. Källinventering/SUMMARY/VERIFICATION uppdateras som GSD-resultat efter utförandet. Krävs fler DB-funktioner eller förändrat kontrakt delas arbetet före implementation.

**Villkorad reservförberedelse 2026-10-07:** Om den oförändrade fullkörningen åter visar enbart gammal HTTP-timeout, får en ny explicit verifieringsprecisering granskas: ärligt censurerade gamla 30s-observationer med okänd svarstid/svarskropp, bevisat avslutad ägd DB-transaktion/auditpar och konservativ förbättringsundregräns. Oförändrade, rapporthash-/Git-källbundna SQL143/46- och 93/18-delbevis kan då återbrukas öppet, med färska bevarandebaslinjer och utan att gamla FAIL skrivs om. Kandidat-/SQL-/runtimebytes måste bestå; ett nytt motsägande SQL-resultat hindrar återbruk. Endast isolerad reservkod och rena grindprov får förberedas nu. Nuvarande fullkörning, nio lyckade gamla HTTP-svar och övriga accepterade kriterier gäller oförändrat tills resultatet är bedömt och en konkret eventuell planprecisering är dokumenterad. Ingen reservväg ger dagens plan-PASS i förväg.

<objective>
Minska programlistans upprepade katalogupplösning så att kommande sökbara tabeller kan användas, med exakt bevarat underlag och skydd.
Purpose: Nuvarande programväg anropar katalog-/radräkning via source, gym_cells och validate_terms för varje plan och skola. Fixturens 52 programramar har endast tre distinkta fullständiga underlagsnycklar; verifierat återbruk inom anropet kan minska detta arbete utan att dela mandat eller planidentiteter.
Output: En additiv privat definitionsrättning, källbundna gammal/ny-prov, kontrollerad apply och faktisk API-matris med före-/eftertider.
</objective>

<execution_context>
@/Users/petter.gjores/.codex/skills/gsd/agents/executor/SKILL.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-38-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-37-FUNCTION-EVIDENCE.json
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-FUNCTION-INVENTORY.md
@supabase/migrations/20261006120000_phase5_planning_year_reads.sql
@supabase/migrations/20261006121000_phase5_worker_planning_year_reads.sql
@supabase/migrations/20261005110000_phase5_gym_timplan_transition.sql
@supabase/migrations/20261004150000_phase5_programplan_choice_blocks.sql
@supabase/migrations/20261003120000_phase5_programplan_terms.sql
@supabase/tests/phase5_planning_year.test.sql
@work/pilot/verify-planning-year-foundation.mjs
@work/pilot/verify-planning-year-api.mjs
@work/pilot/apply-planning-year-grants.mjs
@work/pilot/phase5-planning-year-fixtures.mjs
</context>

<tasks>
<task type="auto">
  <name>1. Skriv additiv privat definitionsrättning och exakta återbruksprov</name>
  <files>supabase/migrations/20261006122000_phase5_planning_year_read_performance.sql, supabase/tests/phase5_planning_year_read_performance.test.sql</files>
  <action>Utgå från den faktiskt tillämpade definitionen av public.phase5_planning_year_rows(jsonb). Ny migration får endast CREATE OR REPLACE denna signatur och behåller VOLATILE, SECURITY DEFINER, search_path, ägare och rå proacl. Utöka programplan-SELECT i befintlig tp-loop med katalog-ID, basis_reference och term_distribution från samma verkliga point_plan; ge övriga UNION-grenar typade nullfält. I GY-programgrenen används en lokal PL/pgSQL-cache, högst 128 nycklar och 50 000 lagrade celler, med ordinarie uncached väg när gränsen nås. Nyckeln jämför exakt JSONB [catalogId, hela basisReference, hela distribution], inklusive startedOn, programRef/version, orientationCode, specializationRefs och choiceBlocks samt deras arrayordning. Första nyckeln kör befintlig source och gym_cells(source,NULL) utan ändringar; cacheposten lagrar endast deras verifierade kanoniska rader/celler. Cacheträff får inte anropa den dyra source-/termupplösningen igen: projicera varje aktuell plans identitet/revision/status och utbildnings-/skolmetadata från dess egna DB-rader och återbruk endast canonical inventory/cells. Saknad/nullbasis går genom ordinarie väg. Timplansgrenen inklusive frysta source-/timkontroller är oförändrad. Bevara hela efterföljande mandatkontroll, start-/årsprojektion, klasskoppling, diagnoser, gränser, konfliktkontroll, filter, sortering och revisionsunderlag; ingen pushdown eller trunkering före filter/sort. Inga GUC-, temporärtabell-, sessions- eller klientstyrda cachevärden. SQL-prov ska jämföra gammal/ny funktion över samma egna data för samtliga requestkombinationer som API-matrisen använder, inklusive alla år, sidor, skolformer, filter och sorteringsnycklar. Lägg särskilt till samma key med olika plan-ID/version/revision och skolor; distinkt katalog/start/inriktning/val/block/distribution; malformed/extra/duplicerade distributionsrader, ogiltigt datum eller version; cachegräns/fallback; saknad plan/basis; motsägande delade källrevisioner och två identiskt trunkerade frysta timplaner. Jämför exakta JSONB-resultat eller samma SQLSTATE för varje negativt fall. Ändra inte tidigare prov för att få PASS.</action>
  <verify>Granska den additiva SQL-filens enda CREATE OR REPLACE/signatur mot originalet och verifiera oföränderliga originalhashar. De nya SQL-proven körs först med uppgift 2:s rollback-harness; inget permanent apply här.</verify>
  <done>Endast programramars dyra kanoniska upplösning återbrukas inom ett anrop, på exakt fullständig key och med begränsat minne. Prov beskriver exakt dataparitet och att felaktig/distinkt källa inte får en annan plans verifierade celler.</done>
</task>

<task type="auto">
  <name>2. Bevisa gammal/ny paritet, hela bevarandet och faktisk tidsbaslinje före apply</name>
  <files>work/pilot/verify-planning-year-read-performance.mjs, work/pilot/verify-planning-year-read-performance.test.mjs</files>
  <action>Bygg en begränsad coordinator med --target protected --mode rollback|applied --base-url --out, strict lokalt mål och säkra evidensvägar. Läs bara miljön genom assertTarget; återbruk befintlig ägd fixtur och baseline-/cleanupfunktioner. Kräv 05-38 komplett faktisk slut-PASS med 28 exakta Worker-entrypoints och källbundna bevis. Bekräfta exakt SHA-256 för tillämpad 05-37 och 05-38 mot filer/journal samt att ingen senare journal eller kolliderande korrektiv signatur finns. 05-37 SQL-hash är e014d63bca3a1f71d41054216f97c1b02f6cdf93f2e45baff40fe7afd7c2aa71; ursprungligt SQL-prov är be8d975aa43a07fa6712c3b333709e8344ee50debf65f26200ce10649d80bd34. Spara varje public-funktions fulla definition/rå ACL, tabell-/sekvens-/vy-ACL/RLS och hela journalen samt 15 fullständiga verksamhetstabellers helradshashar inklusive tidsstämplar. Inom en rollbacktransaktion med migrationskundlås och egna fixturer fångas gamla helper/RPC-resultat och SQLSTATE, kandidatdefinitionen tillämpas, samma requests prövas och exakt likhet krävs. Gamla definitionen får återställas inom denna transaktion vid behov; inga nya permanenta hjälpare eller grants skapas. Kör även originalets oförändrade 93 SQL-prov i separat kontrollerad rollback: dess historiska closed-ACL-assertion uppfylls endast genom tillfällig återkallelse av just tre planning-RPC-grants inom samma rollback; efteråt bevisas exakt återställd rå ACL/28-entrypointmängd. Använd originalets verkliga kontraktsparitet/negativfall, utan att kringgå lås eller privilegier. Mät minst tre seriella gamla listanrop på den vakna actual Worker med 52 underlag, sökfråga och sida 2; logga tid/count/revision/auditstatus utan affärspayload. Setup och fixture writes hålls utanför mätperioden; jämför affärsrader före/efter varje läsning. Spara SQL-paritetsmatris, full mängd och identifierad enda definitionsdiff, sourcehashar, före-/efterfingeravtryck, baseline-tider, ägd cleanup och alla första FAIL/PARTIAL. Rena Node-prov måste neka ändrad key/definition/source/journal/ACL, ofullständig paritet, saknade fall, delvis setup och felaktigt bevarandebevis.</action>
  <verify>Från rot: node --test work/pilot/verify-planning-year-read-performance.test.mjs; node work/pilot/verify-planning-year-read-performance.mjs --target protected --mode rollback --base-url http://127.0.0.1:3060 --out work/pilot/results/phase5-38-read-performance-rollback.json. Återbruk verifierad isolerad Worker-port eller dokumentera annan ägd port. SQL/API/cleanup körs seriellt, aldrig mot ordinarie 3012.</verify>
  <done>Alla gamla/nya resultat och negativa SQLSTATE matchar exakt; 93 oförändrade originalprov PASS, rollback bevisad, alla originaldefinitioner/grants/journal/hela verksamhetsrader och auditankare är återställda/bevarade. Före-tider för den faktiska 52-raders HTTP-vägen är dokumenterade. Endast fulla källbundna PASS kan auktorisera apply.</done>
</task>

<task type="auto">
  <name>3. Applicera exakt privat rättning och prova samma API-matris med uppmätta eftertider</name>
  <files>work/pilot/apply-planning-year-read-performance.mjs, work/pilot/verify-planning-year-read-performance.mjs, work/pilot/verify-planning-year-read-performance.test.mjs</files>
  <action>Apply tillåter bara 20261006122000_phase5_planning_year_read_performance.sql och komplett uppgift 2-evidens. Inom samma DB-transaktion/lås krävs oförändrade källhashar, exakt journalförd foundation+grant som senaste föregångare (20261006121000), samma preflightfingeravtryck/affärshashar, 28 Worker-entrypoints och korrekt originalhash för rows-hjälparen. Tillämpa exakt SQL, jämför fulla definitioner/rå ACL/tableACL/RLS/helrader och tillåt endast rows(jsonb)-definitionens förutsagda hashdiff. Journalför bara den nya filens exakta bytes. Alla 14 planning-signaturer och alla andra public-funktioner/grants ska bestå; hjälparen ska fortsatt vara stängd för PUBLIC/anon/authenticated/service_role/Worker. Efter commit kontrolleras exakt journalpost och ny definition, och migrationen kopieras till enbart det ägda lokala målets migrationskatalog. Coordinatorns applied-läge kräver read-only proof att faktisk DB kör just den nya helperdefinitionen/journalen samt att Worker/adapter/kontrakt/modell är samma verifierade bygge/källor; ingen GUC eller testmarkör får ersätta detta. Kör oförändrad full 05-38 API-matris och relevant gym-/GR-/IM-/programread-regression via befintlig runner med separat resultatprefix phase5-38-read-performance-api-final, samt nya SQL-paritets-/fallbackprov i rollback runt den tillämpade definitionen. Mät samma vakna 52-raders list-/sök-/sidfall minst tre gånger efteråt, även översikten; setup utanför mätningen, korrekta count/50+2-rader/stabila revisioner/auditpar och hela affärsrader bevisas. Målet för de jämförbara listfallen är minst tre gånger snabbare median och median högst fem sekunder, alla mätningar under tio sekunder; API:s befintliga 30s-gräns höjs inte. Redovisa alla råa tidsvärden och förhållanden; om målet inte nås dokumenteras gapet och 05-39 fortsätter inte förrän rättningen eller en ny avgränsad plan hanterar det. Ingen auditdeduplicering, positiv mock eller ofullständig matris godtas. Slutrapporten skiljer avsedd definitions-/journaldiff från noll oavsiktliga diffar och bevarar samtliga första FAIL.</action>
  <verify>Från rot: node --test work/pilot/verify-planning-year-read-performance.test.mjs; node work/pilot/apply-planning-year-read-performance.mjs --migration 20261006122000_phase5_planning_year_read_performance.sql --evidence work/pilot/results/phase5-38-read-performance-rollback.json --out work/pilot/results/phase5-38-read-performance-apply.json; node work/pilot/verify-planning-year-read-performance.mjs --target protected --mode applied --base-url http://127.0.0.1:3060 --out work/pilot/results/phase5-38-read-performance-final.json. Befintlig API-runner körs seriellt av coordinator med dedikerad fil, inte genom en förändrad eller reducerad matris.</verify>
  <done>Samma faktiska API-beteende, mandat och auditpar PASS; tidsmålet för 52 programramar är uppmätt. Precis en befintlig privat definition och dess journalpost ändrade, övriga definitioner/rå ACL/tabellrättigheter/verksamhetsrader/auditankare oförändrade. Därefter kan 05-39 börja.</done>
</task>
</tasks>

<verification>
Discovery nivå 0: färsk SQL-kedja source → term_rows → resolve/choice_blocks, gym_cells → term_rows/validate_terms är läst och befintliga lokala migrations-/fixturgrindar återbrukas. Inga externa beroenden införs. Tre uppgifter har strikt beroende 1 → 2 → 3; alla faktiska DB-/HTTP-prov körs seriellt. Läshastighet ändrar inte autentisering, målgräns, elevregistermandat eller verksamhetsregler. Någon manuell användarkontroll behövs inte för denna interna rättning; användarprov sker efter konkret UI-leverans enligt 05-39–43.
</verification>

<success_criteria>
52-radersfallet har källbunden uppmätt tidsförbättring och exakt data-/felparitet. Alla 93 ursprungsprov och samma 05-38 HTTP-matris består utan skips eller lättade gränser. Fulla PLANERING-/ADMIN-krav, mänsklig begriplighet och verklig pilotanslutning markeras inte färdiga av denna rättning.
</success_criteria>

<output>
Skapa 05-38-READ-PERFORMANCE-SUMMARY.md och motsvarande VERIFICATION.md, de fyra dedikerade rollback/apply/API/final-rapporterna och uppdaterad funktionsinventering med både historisk oföränderlig 05-37-definition och faktiskt nuvarande korrektiv hash. STATE/planinventering/dependency uppdateras av root efter kontroll. Versionshantera och pusha avgränsat enligt AGENTS.md med verifierat origin-HEAD. Inga gamla migrationsfiler eller tidigare evidens skrivs om.
</output>
