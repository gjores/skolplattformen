# 03-02 — mandatmodell till databasbevis

2026-09-24. Detta är spårning av databasansvaret i `mandate-policy.test.mjs`, inte ett påstående om att SQL har samma indata/signatur eller att hela fasen är verifierad. SQL härleder kund/identitet/relationer från rader; modellen tar redan serverladdade relationer. Inga klientroller får nya rättigheter. Elevläsfunktionerna är fortfarande privata tills audit är klar.

Förkortningar nedan avser `supabase/tests/phase3_<namn>.test.sql`. Testbeskrivningarna i dessa filer är körbara pgTAP-fall, inte planerade prov.

| Modellfall eller regelgrupp | SQL-bevis och ansvar |
|---|---|
| `principal-school`, `foreign-school`, `no-union-of-assignments` | `matrix`: principal-school. `policy`: ingen union med annat giltigt skolmandat och skoladmin ser endast egen skola. Valet av assignment-ID ingår i SQL-urvalet. |
| `foreign-customer`, `foreign-organizer`, `business-requires-organizer` | `mandates`: främmande skola/kund, elev över huvudmannakund och ärende över elevkund nekar med sammansatta FK. Befintlig access-constraint kräver huvudman för verksamhetsroller. |
| `empty-school`, `unknown-scope`, `unknown-function`, `assignment-profile-mismatch` | `mandates`: okänd profil/scope och tom skolmängd. `matrix`: okänd funktion nekar genom enum. SQL-formkontrollen prövar scope och profil på hela kedjan. |
| `upcoming`, `ended`, `expired`, `blocked-membership` | `mandates`: kommande barn, utgången parent, blockerad medlem och återkallad personalbindning. `boundaries`: framtida mandat administrerbart men inte användbart. `policy`: avslutat lärarmandat och parent. |
| `parent-revoked/weakened/missing/cycle`, `parent-invalid-function/identity/upcoming/expired/customer` | `mandates`: ändrad parentfunktion, minskad skolmängd, cykel, saknat uppdrag och FK-kundkontroll. `matrix` kör full livekontroll efter ändrad funktion/identitet/framtid/sluttid. `policy` nekar gammal kontext efter parentavslut. |
| `teacher-group`, `teacher-mentor`, `teacher-empty`, `teacher-foreign-group` | `policy`: egen grupp och filtrerade group_ids. `matrix`: explicit mentorgrupp och tom grupp. `mandates`: gruppscope över kund/skola och utan mandatskola nekar. Personalrollen och medlemsbindningen provas separat. |
| `school-admin-export`, `teacher-export`, `health-export` | `policy`: skoladmin exporterar endast eget urval; lärare nekar export. `matrix`: elevhälsa nekar export. |
| `health-school/pupil/case`, `health-pupil-other`, `health-case-no-context/other-pupil` | `policy`: tre positiva omfattningar, saknad/fel ärendekontext. `matrix`: annan elev i samma skola och fel elev för rätt ärende. |
| `head-no-pupils`, `customer-admin-no-pupils`, `it-no-pupils`, `health-lead-no-pupils` | `policy`: huvudman nekar elevläsning. `matrix`: kundadmin nekar. `connections`: IT utan elevinsyn. `boundaries`: elevhälsoansvarig utan egen elevläsning. |
| `principal-teacher/revoke`, `head-principal`, `principal-administrator/health` | `policy`: kontrollerad etablering av rektor, lärare, skoladmin, tre elevhälsoomfattningar samt avslut. Samma SQL-funktion härleder parent/tilldelare och binder personal atomärt. |
| `self-escalation`, `head-teacher`, `principal-principal`, `grant-foreign-school/longer-time`, `grant-hidden-foreign-group/pupil/case` | `policy`: självutökning, rektor utser rektor och främmande skola nekar. `mandates`: parentrollmatris och sammansatta scope-FK. `boundaries`: inlösen får inte förlänga förkortad parent. Huvudman kan enligt rollmatrisen bara ge rektor. |
| `health-lead-multischool`, `no-public-health-lead` | `boundaries`: förseedad ledare ger två egna skolor, får inte ge annan roll eller borttagen skola. `matrix`: ingen publik utnämning av elevhälsoansvarig. |
| `future-target-mandate.grant/revoke` | `boundaries`: framtida lärare tilldelas och avslutas före start; giltighetskontrollen nekar användning före start och efter avslut. |
| `principal-support`, `support-too-long/no-purpose/no-approval` | `policy`: rektorsgodkänd separat support. `mandates`: obligatoriska fält och max 60 minuter. `boundaries`: serverhärledd godkännare, förfalskad godkännare nekar, huvudman får inte direktgodkänna support. |
| `support-boundary-*`, `stockholm-inclusive-date-end` | `temporal`: före/vid start, inne i intervallet, sista mikrosekunden före/vid/efter slut; datumgräns vid Stockholms midnatt. Samma faktiska funktionsdefinition används med endast klockinitialiseringen utbytt i rollback-transaktionen. |
| `support-other-pupil`, `support-separate-assignments-do-not-extend-time` | Samma pupil-scopepredicate som det explicita annan-elev-provet i `matrix`; tidskontroll sker för valt ID, och andra mandat kan inte unioneras enligt `policy`. Kombinationen stöds dessutom av modellens separata prov. Ingen separat SQL-rollunion eller supportförlängning finns. |
| `support-no-pupil.export/write/mandate.grant` | `policy`: supportexport nekar. `matrix`: inga generella INSERT/UPDATE/DELETE på mandat-/personalvägar. SQL:s parentrollmatris saknar support som tilldelare; ingen elevskrivfunktion finns. |
| `account-admin-*`, `customer-only-kundadmin/granskare` | `matrix`: båda kontofunktionerna tilldelas med organizer=null och tom skolmängd; kontoadmin nekas elevläsning. `verify-mandate-locks.mjs` använder riktiga kontodelegationer och visar aktuell återkallelse. |
| `it-admin-connection.*` | `connections`: lokal läsning, aktivera/pausa/test, versionskonflikt, främmande skola och inga elevrättigheter. Ingen extern kommunanslutning provas. |
| `fields-are-exact-and-copied`, `foreign-field/empty-field` | `matrix` kontrollerar exakt SQL-returtyp: id/display_name/unit_id/group_ids; `policy` filtrerar grupp-ID. SQL tar ingen klientvald fältlista. Modellens fälturval/kopiering och hantering av tom begäran hör till server-/HTTP-lagret i 03-03/05. |
| `unknown-action`, `real-profile`, `unverified-target`, `invalid-clock` | SQL har typade separata funktionsingångar och intern serverklocka; okänd SQL-profil nekar genom constraint. Val av verifierat lokalt mål/profil och begärd action sker på servern, inte genom en SQL-klocka/klientflagga. Dessa fall är modell-/serverprov, inte ytterligare SQL-payloadfält. |
| `organization-overview`, `audit-minimized/no-pupil-fields`, `customer-only-audit` | Ingen ny organisations-/auditläsning öppnas av 03-02. Befintlig kund-/loggisolering provas i fas2 SQL; fas3:s exakta auditfält och loggning före svar tillhör 03-04/05. Dessa är inte undantagna från fasgrinden. |

## Databasfall utöver den rena modellen

- `mandates`: hårda FK, normala/okända värden, personal–medlemsbindning, staff-roll/skolmängd, FORCE RLS och faktiska anon/authenticated/Worker-nekanden.
- `policy`/`boundaries`: versionerade inbjudningar, riktig issuer/subject, engångsinlösen, normaliserade nullfält, avslutad eller försvagad utfärdare samt rollback utan förändrade rader.
- `matrix`: direkta generella mandat-/inbjudnings-/personalskriver är återkallade efter serverväxlingen.
- `verify-mandate-locks.mjs`: tre riktiga tvåanslutningsordningar. Avslut först → väntande kontroll nekar efter commit. Läsning först → avslut väntar på lästransaktionen och nästa läsning nekar. Återrullat avslut → väntande kontroll tillåts.

## Fixturer och verifieringsgräns

SQL-filerna äger separata UUID-prefix och issuer och rullar tillbaka egna data. `work/pilot/sql/phase3-fixtures.sql` är API-runnerns relationsgrund med två kunder/två skolor per kund. `verify-access.mjs` laddar den efter målverifiering och etablerar de identitets-/mandatkombinationer som API-proven behöver via egna slump-ID:n. Detta uppfyller planens behov utan att dubblera permanenta testmandat i fixturefilen.

Inget ovan ersätter browserprov, auditkällornas bevis, verklig kommunanslutning eller fasens samlade verifiering. Databasleveransen kan slutföras separat från dessa senare planers godkännandestatus.
