---
phase: 03-mandat-och-skyddade-datavagar
plan: "02"
subsystem: database
status: partial
requirements: [ACL-02, ACL-03, ACL-04, ACL-05]
provides: ["Stängd mandat- och relationsgrund", "Intern kedjeprövning utan Worker-rättigheter", "213 SQL-prov av genomförd del"]
affects: ["03-02 fortsättning", "03-03", "03-05", "03-06"]
completed: null
last_updated: 2026-09-23
---

# Fas 3 plan 02 — PARTIAL

**Stängd schemagrund, intern kedjeprövning och separat personalbindning är verifierade; den kompletta mandatvägen och planens båda uppgifters slutvillkor återstår. Inget ACL-krav markeras klart.**

## Levererat och versionshanterat

- `d8d3237`: separata migrationer för nya enumvärden (09:00) och schemagrund (10:00). Enumvärden commit:as innan efterföljande migration använder dem. Befintliga rader bevaras.
- Separat 11:00-migration: `phase3_mandate_chain_is_valid(uuid)` är en intern, stabil invokerfunktion utan EXECUTE för PUBLIC, anon, authenticated eller Worker. Commit: `17e104f`.
- `access_assignments` har profil, scope, parent/tilldelare/godkännare, profession, syfte och tidsfält. Befintligt `staff_assignment_id` återanvänds. Hårda constraints nekar okända värden, felaktiga/oändliga tidsintervall, support över 60 minuter, saknat supportsyfte/godkännande samt kundkorsande referenser.
- Nio nya tabeller för skol-/grupp-/elev-/ärendescope, syntetiska resurser och lokal anslutningskonfiguration har sammansatta kund-/huvudman-/skol-FK, FORCE RLS och inga Worker- eller klienträttigheter. Extra `organizer_id` på skolrelationerna behövs för integritet mot befintliga skolnycklar.
- `phase3-fixtures.sql` innehåller två syntetiska kunder, två skolor per kund och explicita elev/grupp/ärenderelationer. Den är endast en relationsgrund, inte färdiga API-fixturer för hela matrisen. SQL-testet innehåller egna rollback-fixturer och laddar inte filen externt.
- En tillfällig trigger nekar Worker att skapa, ändra eller omvandla fas 3-mandat. `assignment_is_valid` nekar samtliga rader med fas 3-profil. Positivt prov visar att befintlig fas 2-giltighet bevaras.

## Kedjefunktionens exakta gräns

Prövar verksamhetsmandat genom parentkedjan: aktiv medlem/öppen kund, aktuell giltighet, kund/huvudman, parentrollmatris, skilda identiteter, skolsubset och underordnad giltighet inom parent. Avslutad/försvagad parent, cykel eller saknad rad nekar. Loopen nekar vid 64 besökta uppdrag. Funktionens rotroller är huvudman, förseedad elevhälsoansvarig och IT.

Detta är **inte full modellöverensstämmelse eller ett behörighetsbeslut**. Kundadmin/granskare ingår inte i denna verksamhetskedja. Funktionen prövar inte staff-bindning, `issued_by_assignment_id`, professions-/objektscope, sessionslås, MFA eller audit. Ingen serverväg anropar funktionen. Skolscope kan i nuläget förseedas även på profile-null uppdrag av postgres; det aktiverar ingen ny dataväg. Exakt samtidighet och exakta sekundgränser behöver kompletterande prov; körda tidsprov visar påbörjat intervall respektive passerad sluttid.

## Faktisk verifiering 2026-09-23

- `assertTarget('protected')` kördes före varje tillämpning; endast lokalt `skolplattform-pilot-protected`. `supabase migration up --local` tillämpade de fyra nya migrationerna. Ingen reset, inga rader raderade utanför rollback-proven och inga portar ändrade.
- `node work/pilot/run-sql-tests.mjs --file phase3_mandates.test.sql --out work/pilot/results/phase3-sql-mandates.json`: **213 PASS**.
- `node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase3-schema-regression.json`: **350 PASS**, varav 137 befintliga fas 1/2-prov och 213 nya prov.
- Proven omfattar constraints, kund-/skol-FK, aktuellt minskat parentscope, giltighet, blockerad medlem, självutökning, försvagad parent, cykel, faktisk Worker-nekning, anon/authenticated-nekning och oförändrad rad efter nekad ändring.
- Ingen API-, browser-, appbyggnads- eller full mandatmatrisverifiering gjordes i denna del. Inga verkliga uppgifter eller kommunanslutningar användes.

## Återstående arbete i 03-02

1. Bygg full livegiltighet och kontrollerade tilldelnings-/avslutsfunktioner med låsordning/samtidighetsprov, inkoppling av staff–membership-bindningen och atomiska `assignment_units`. Pröva aktuell parent även vid mutation.
2. Inför kontrollerade inbjudningar med tilldelare och versionerat payload; pröva kedja/scope/tid vid utfärdande och inlösen. Kontoadministration ska vara separat.
3. Byt servervägar och återkalla bred Worker-INSERT/UPDATE på access_assignments/invitations, personalvägar och gamla RPC tillsammans. **Befintliga fas 2-rättigheter/RPC finns kvar**; denna leverans stänger bara de nya fas 3-vägarna.
4. Koppla färdig livekontroll till `assignment_is_valid` först när kompletta prov visar nekande standard. Ersätt interimstriggern då kontrollerade funktioner finns. Lägg nödvändiga läs-/funktionsprivilegier först därefter.
5. Komplettera samtliga SQL-matrisfall och API-fixturer: lärargrupp, tre elevhälsoomfattningar, supportgodkännare, framtida/utgångna uppdrag, staffåterkallelse, inbjudningar och samtidighet. SQL använder `undervisning`/`mentor`; servern behöver explicit mappning till modellens gruppkind.

Fortsätt i **nya migrationer efter 20260922120000**; redan tillämpade migrationer ska inte ändras retroaktivt. STATE/ROADMAP ägs av orchestrator. config.json och spike.json lämnades orörda. Avgränsningen följer användarens kvotstopp, inte godkännande av ofärdig funktion. Ingen handbok/UI ändrad, därför inget dokumentationsbygge i denna databasdel.


## Fortsättning inom utökad kvot — personalbindning

Commit `5a1dc66`, separat migration `20260922120000_phase3_staff_bindings.sql`, skapar `staff_assignment_bindings` med explicit personaluppdrag–medlemskap–kund–huvudman. Sammansatta FK nekar korsande medlemskund och huvudmannakund. Tabellen har FORCE RLS och saknar app-/klientprivilegier. `assignments.profile_id` (äldre auth-profil) används inte för matchningen; `access_assignments.profile_id` är en separat textprofil för mandatpolicyn.

`phase3_staff_binding_is_valid(uuid)` är ett separat internt predikat utan EXECUTE för Worker/PUBLIC/klientroller. Det kräver rektor/lärare, samma aktiva medlemskap, rätt personalroll och att mandatets samtliga uttryckliga skolor finns i `assignment_units`. Saknad eller återkallad bindning nekar. Det ger inget självständigt behörighetsbeslut: kedja, datum, kundstatus, objektsscope, session och audit måste fortfarande kombineras i kommande skyddade väg. Det är avsiktligt inte inkopplat i `assignment_is_valid`.

28 tillkommande prov omfattar positiva rektors-/lärarbindningar, annan mottagare, fel personalroll, saknad/otillräcklig skolkoppling, blockerad medlem, korsande kund, återkallelse och stängda privilegier. Slutresultatet ovan är omkört efter 12:00-migrationen: **213 riktade och 350 totala SQL-prov PASS**. Ingen objektscopefunktion, mutationsväg eller serverkoppling tillkom i denna fortsättning.
