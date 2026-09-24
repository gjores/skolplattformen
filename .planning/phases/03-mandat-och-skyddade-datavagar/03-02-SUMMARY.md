---
phase: 03-mandat-och-skyddade-datavagar
plan: "02"
subsystem: database
status: complete
requirements: [ACL-02, ACL-03, ACL-04, ACL-05]
provides: ["Scope-FK och explicit personalbindning", "Livekedja och kontrollerade mutationer/inbjudningar", "Samordnad privilegieväxling", "SQL- och samtidighetsbevis för genomförd del"]
affects: ["03-02 slutprov", "03-03", "03-04", "03-05", "03-06"]
completed: 2026-09-24
last_updated: 2026-09-24
---

# Fas 3 plan 02 — genomförd

**Planens båda databasuppgifter är genomförda. Slutkörningen ger 510 SQL-prov PASS, inklusive 18 exakta tidsprov och 37 kompletterande matrisprov; tre verkliga samtidighetsordningar passerar. Detta slutför 03-02, inte fasens ACL-/auditkrav eller verklig drift.**

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

## Planens slutvillkor och nästa gräns

1. Aktuellt mandat krävs i kontrollerade databasvägar: kund/skola, delegation, personalbindning, parent, giltighet och självutökning är verifierade. Bred Worker-skrivning och äldre rektors-RPC är stängda.
2. Databasens matrisansvar är spårat i `03-02-SQL-MATRIX.md`, med positiva/negativa fall, oförändrade rader vid nekande och isolerade rollback-fixturer. Exakta tidsgränser och tre samtidighetsordningar är nu verifierade.
3. API-fixturkravet uppfylls av `phase3-fixtures.sql` som relationsgrund och `verify-access.mjs` som efter målverifiering skapar egna slump-ID:n för provens mandat/identiteter. Ett komplett extra permanent mandatregister i fixturefilen behövs inte.
4. Fältbegäran, lokal profilgrind och audit-/HTTP-policyn verifieras i sina server-/auditplaner. Privata elevläsfunktioner får fortfarande inga Worker-rättigheter före audit. Spårningskartan markerar den gränsen uttryckligen; inget senare fasprov räknas bort.

Historiska 11:00/12:00-funktioner är interna delpredikat, medan full livegiltighet avgörs av 13/17 och den publika wrappern i 19. Inga tidigare tillämpade migrationer har skrivits om. STATE/ROADMAP ägs av root; användarens config/spike lämnades orörda.

## Commits

- `d8d3237`, `17e104f`, `24887d3`: schemagrund, intern kedja och första PARTIAL-status.
- `5a1dc66`, `bfc815b`: explicit personalbindning och dess verifiering.
- `df87ca6`: fullare livepolicy, kontrollerade mutationer/inbjudningar, parameterfix, samordnad cutover och SQL-/samtidighetsbevis.

## Kompletterande gränsprov 2026-09-24

Senaste fulla SQL-körning: **442 PASS i sju filer** (`phase3-schema-regression.json`). Ny `phase3_boundaries.test.sql` ger 32 prov inklusive egna etableringsfall: elevhälsoansvarig tilldelar inom två skolor men saknar egen elevläsning, minskad skolmängd och självutökning nekar; supportgodkännare/tilldelare härleds från rektor och kan inte väljas av klient; framtida uppdrag kan tilldelas/avslutas utan förtida åtkomst; inlösen återprövar minskad skolmängd och förkortad giltighet även när utfärdaren fortfarande är aktuell. Nekad inlösen lämnar token orörd. Inbjudningsproven omfattar nu även servernormaliserade nullfält/tomma listor.

API-provens beständiga fixturer blottlade tidigare delade UUID/issuer-nycklar och globalt mandatantal i SQL-proven. SQL-filerna har nu egna UUID-prefix och issuer, och mandatantalet avser provets egen kund. Ingen beständig API-fixtur raderades eller återställdes. Mellanliggande körningar med fixturkollisioner var FAIL; slutkörningen ovan är grön. Inga nya migrationer behövdes.

Vid denna mellanleverans återstod exakt tidsgräns, fler samtidighetsordningar och matrisens spårning. De är slutförda nedan; API-provens resultat dokumenteras separat av root.


## Slutverifiering 2026-09-24

- `phase3_temporal.test.sql`: **18 PASS**, före/vid start, sista mikrosekunden före/vid/efter exklusivt slut, parentgräns och Stockholms midnatt. Provet läser den verkliga funktionsdefinitionen och byter endast klockinitialiseringen i en rollback-transaktion. Runtimefunktionen, dess privilegier och serverklocka ändras inte beständigt; ingen produktbakdörr eller extra migration infördes.
- `phase3_matrix.test.sql`: **37 PASS**, bland annat mentorgrupp, tomt scope, annan elev i samma skola, fel ärendeelev, full parentkontroll, kundkontoroller, stängda direkta skriver och exakt SQL-returtyp.
- `verify-mandate-locks.mjs`: **3/3 PASS** med riktiga Worker-anslutningar och observerat advisory-lås. Avslut först/commit nekar väntande kontroll; läsning först gör att avslut väntar och nästa kontroll nekar; återkallat avslut/rollback låter väntande kontroll lyckas. Alla egna slump-ID-fixturer rensades.
- Planens namngivna `phase3_mandates.test.sql`: **213 PASS**, omkörd.
- Sista `run-sql-tests.mjs --out work/pilot/results/phase3-schema-regression.json`: **510 PASS i tio filer**, inklusive den separat ägda auditplanens 13 aktuella SQL-prov. Två mellanliggande helkörningar var FAIL när auditplanens nya migration/prov ännu höll på att färdigställas; slutkörningen inkluderar och passerar dem.
- `03-02-SQL-MATRIX.md` binder modellens regelgrupper till SQL-invarianter eller uttryckligt server-/auditansvar. Detta är inte ett obestyrkt påstående om identiska modell-/SQL-signaturer eller full fasverifiering.

Inga nya produktmigrationer behövdes för slutproven. Ingen app-/handboksändring ingår i denna slutleverans. Båda uppgifterna i 03-02 har verifieringsbevis; planstatus är complete medan senare planer och fasens gemensamma verifiering återstår.
