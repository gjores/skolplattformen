---
phase: 03-mandat-och-skyddade-datavagar
plan: "02"
subsystem: database
status: partial
requirements: [ACL-02, ACL-03, ACL-04, ACL-05]
provides: ["Scope-FK och explicit personalbindning", "Livekedja och kontrollerade mutationer/inbjudningar", "Samordnad privilegieväxling", "SQL- och samtidighetsbevis för genomförd del"]
affects: ["03-02 slutprov", "03-03", "03-04", "03-05", "03-06"]
completed: null
last_updated: 2026-09-24
---

# Fas 3 plan 02 — PARTIAL

**Databasens mandatvägar och den samordnade privilegieväxlingen är genomförda. 410 SQL-prov och ett verkligt tvåanslutningsprov passerar. Full namngiven mandatmatris, slutliga API-fixturer och samlad server-/API-verifiering återstår; inget ACL-krav markeras klart.**

## Levererat

- 09:00/10:00: nya enumvärden i separat transaktion, mandatfält, skol-/grupp-/elev-/ärendescope, syntetiska elevresurser och lokal anslutningskonfiguration. Sammansatta FK håller kund/huvudman/skola ihop. Nya tabeller har FORCE RLS och inga direkta Worker-/klienträttigheter. Befintliga rader har bevarats.
- 11:00/12:00: separata interna kedje-/personalpredikat. `staff_assignment_bindings` binder personaluppdrag till exakt medlemskap; namn, e-post och äldre `assignments.profile_id` används inte som identitetsbevis. Rektor/lärare kräver rätt personalroll och alla mandatets skolor i `assignment_units`.
- 13:00–17:00: `phase3_mandate_is_valid` kombinerar form, scope, medlems-/kundstatus, aktuella föräldrar, tilldelarroll, identitet, giltighet och personalbindning. Max 64 led; cykler och saknade led nekar. Framtida mottagarmandat kan tilldelas men inte användas i förtid. Tidskontrollen läser färsk serverklocka efter låsväntan. Äldre kundadmin/granskare stöds; äldre verksamhetsmandat utan explicit scope nekar.
- `phase3_grant_mandate(jsonb)` härleder kund, huvudman, parent/tilldelare och supportgodkännare från det valda serveruppdraget. Personalbindning och skolkopplingar skapas atomärt. `phase3_revoke_mandate(uuid)` prövar aktuellt överordnat mandat; en snäv separat gren låter kundadmin avsluta äldre kontoroller inom kunden, aldrig egen identitet eller verksamhetsroller.
- `phase3_mandate_context()` lämnar valt mandat och föräldrar i modellens format; SQL `undervisning` mappas till `teaching`. `phase3_list_mandates()` visar direkt underställda, fortfarande administrerbara mandat, inklusive framtida.
- `phase3_read_pupils(uuid,uuid,boolean)` filtrerar kund/skola/grupp/elev/ärende före resultat. Lärarens `group_ids` begränsas till tilldelade grupper. Export tillåts bara skoladministratör. **Funktionen saknar fortfarande Worker-EXECUTE: elevvägen ska inte öppnas före obligatorisk audit i 03-04/05.**
- Inbjudningar har versionerat payload och tilldelar-ID. Utfärdandet provar samma verkliga SQL-regler i en rollback-subtransaktion, som inte lämnar identiteter, medlemskap eller personalrader. Datum fryses vid utfärdandet. Inlösen binder faktisk issuer/subject, prövar utfärdaren på nytt och skapar mandat atomärt. TTL högst 30 dygn bevarar befintligt kontrakt. Endast leverantörens gamla `leverantor:cli`-bootstrap får sakna utfärdarmandat, och då enbart för kundadmin/granskare. Gamla webbinbjudningar utan spårbart utfärdarmandat nekar.
- 19:00 samordnades med rootens omskrivna servervägar: återkallad INSERT/UPDATE/DELETE på access_assignments/invitations/assignments/assignment_units samt EXECUTE på äldre appoint_school_principal. `assignment_is_valid(a)` slår upp verkligt uppdrag via ID och använder full livekontroll. Worker får bara avsedda kontrollerade funktioner; privata hjälpfunktioner och elevläsning förblir stängda. Session-/medlemsradlås kompletteras med kundadvisory före uppdragskontroll.

IT-funktionens 18:00-migration och dess 13 prov ägs/versionshanteras av root inom 03-03; de ingår i SQL-regressionen nedan.

## Faktisk verifiering

2026-09-23: schemagrund/personalbindning gav 213 riktade och 350 totala SQL-prov PASS.

2026-09-24, efter nya migrationer och serverkoordinerad cutover:

- `assertTarget('protected')` före varje migration/runner; endast lokalt protected-mål. Ingen reset, inga fjärrdata, inga portändringar.
- `node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase3-schema-regression.json`: **410 PASS**, sex filer: 52 isolering, 67 fas2-access, 19 fas2-audit, 213 schema/personal, 46 policy/mutation/inbjudan och 13 IT.
- Policyproven visar positiva rektors-/lärar-/skoladmin-/supportmandat och tre elevhälsoomfattningar, negativ självutökning/roll/skola, gruppfältfiltrering, ingen union med annat mandat, avslutad parent, issuer/subject/engångstoken samt verklig Worker-inlösen.
- `node work/pilot/verify-mandate-locks.mjs`: **PASS**. Två riktiga Worker-anslutningar: ett kontrollanrop observeras vänta på kundlåset; efter avslutets commit nekas det med 42501. Runnern skapar slump-UUID-fixturer och rensar bara dessa. Minimerat resultat sparas i `phase3-mandate-locks.json`.
- `git diff --check`: PASS före commit. Serverbygge och HTTP-regression ägs av root och är inte bevisade av denna SQL-sammanfattning.

Ingen verklig elevdata eller kommunanslutning har använts. SQL-resultatens PASS betyder bara att de faktiskt upptäckta fallen passerade, inte att saknade matrisfall är godkända.

## Upptäckt och rättad avvikelse

Rootgranskning fann tvetydig SQL-parameter `assignment_id` i objektscope. Ett nytt prov med två skilda giltiga mandat reproducerade att andra uppdrag breddade elevurvalet (RED, fyra fel före avbrutet prov). Ny 15:00-migration ersatte referenserna med `$1/$2/$3`. Samma prov och hela sviten blev gröna. Redan tillämpad 13:00-migration ändrades inte retroaktivt.

Fas2-provet som tidigare godkände den gamla rektors-RPC:n provar nu att den nekas trots huvudman i GUC. Händelsetriggerns aktörs-/rollprov finns kvar separat; antal fas2-access ökade från 66 till 67. Ett gammalt klockprov kontrollerar nu att manipulerad provklocka inte aktiverar ett framtida mandat, eftersom livekontrollen använder faktisk serverklocka.

## Kvar innan 03-02 får markeras klar

1. Komplettera den fulla namngivna SQL-matrisen: elevhälsoansvarigs skolmängd, explicit supportgodkännare, exakt start/slut på kontrollerad klocka, ändrad scope/tid mellan utfärdande och inlösen, framtida tilldelning/avslut och fler samtidighetsordningar. Befintliga prov täcker delar men är inte komplett motsvarighet till alla modellfall.
2. Utöka `phase3-fixtures.sql` från relationsgrund till hela API-falluppsättningen med identiteter/uppdrag. SQL-testet har egna rollback-fixturer; API-runnern får inte anta att alla dessa finns beständigt.
3. Granska samlad server-/SQL-växling och kör relevanta API-fall. Elevläsning ska förbli utan Worker-GRANT tills audit före svar/commit är implementerad och verifierad.
4. Revidera den historiska 11:00-kedjefunktionen/12:00-personalpredikatets dokumentation vid slutstädning: de är interna delpredikat, full giltighet avgörs av 13/17-versionen, inte av dem var för sig.

Fortsätt i **nya migrationer efter 20260924190000**. STATE/ROADMAP ägs av root. Användarens config.json/spike.json lämnades orörda. Ingen UI/handbok ändrades av databasdelen.

## Commits

- `d8d3237`, `17e104f`, `24887d3`: schemagrund, intern kedja och första PARTIAL-status.
- `5a1dc66`, `bfc815b`: explicit personalbindning och dess verifiering.
- `df87ca6`: fullare livepolicy, kontrollerade mutationer/inbjudningar, parameterfix, samordnad cutover och SQL-/samtidighetsbevis.

## Kompletterande gränsprov 2026-09-24

Senaste fulla SQL-körning: **442 PASS i sju filer** (`phase3-schema-regression.json`). Ny `phase3_boundaries.test.sql` ger 32 prov inklusive egna etableringsfall: elevhälsoansvarig tilldelar inom två skolor men saknar egen elevläsning, minskad skolmängd och självutökning nekar; supportgodkännare/tilldelare härleds från rektor och kan inte väljas av klient; framtida uppdrag kan tilldelas/avslutas utan förtida åtkomst; inlösen återprövar minskad skolmängd och förkortad giltighet även när utfärdaren fortfarande är aktuell. Nekad inlösen lämnar token orörd. Inbjudningsproven omfattar nu även servernormaliserade nullfält/tomma listor.

API-provens beständiga fixturer blottlade tidigare delade UUID/issuer-nycklar och globalt mandatantal i SQL-proven. SQL-filerna har nu egna UUID-prefix och issuer, och mandatantalet avser provets egen kund. Ingen beständig API-fixtur raderades eller återställdes. Mellanliggande körningar med fixturkollisioner var FAIL; slutkörningen ovan är grön. Inga nya migrationer behövdes.

Luckorna i punkt 1 ovan är därmed till stor del prövade; **exakt styrd start/slutgräns och fler samtidighetsordningar kvarstår**, liksom full spårning till hela modellmatrisen. API-provens aktuella resultat dokumenteras separat av root. Planstatus förblir PARTIAL tills den samlade kontrollen är färdig.
