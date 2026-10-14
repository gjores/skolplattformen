---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: SCHOOL-REGISTRY
requirements: [ADMIN-01]
status: ready_for_execution
created: 2026-10-14
---

# Huvudmannens skolimport och registeruppdatering

Användaren har bett oss fortsätta fas 5 tills nästa mänskliga prov behövs. ADMIN-01 är redan ett godkänt krav: huvudmannen ska kunna lägga till skola med skolenhetskod eller organisationsnummer, ta in adress och skolform och bevara lokalt tillsatt rektor vid uppdatering. Detta inför ingen ny kravomröstning. Klassens uttryckliga versionsbyte har separat användarrapporterat godkännande; kullkopiering/mobilprov och full fasacceptans får inget nytt godkännande här. Långsam planinläsning är en separat backloggpunkt.

## Verifierat nuläge vid planering

- `web/lib/server/skolverket.ts` har koduppslag med 10 sekunders timeout, redirect-spärr och reducerad registermodell. Organisationsnummerlistning finns i den äldre publika `web/app/api/skolenhet/route.ts`; dess JSON-form är befintligt implementationsunderlag, inte ett nytt bevis mot myndighetens tjänst.
- `web/app/api/kund/skolenhet/route.ts` tillåter endast kundadmin, väljer huvudman via body, avvisar befintlig skola och kör INSERT. Den är inte huvudmannens ADMIN-01-väg.
- Senaste `import_school_unit` i `20260913200000_phase2_access_model.sql` skapar skola, skolformer, snapshot och organisationshändelse. Den kan även utse rektor; den vägen ska inte återanvändas för automatisk registeruppdatering.
- `school_units.head_master` är registrets upplysning. Lokal rektor finns separat i assignments/assignment_units och verklig åtkomst i access_assignments/mandate_units. Dessa begrepp får aldrig slås samman.
- `school_unit_types.grades` är lokal konfiguration. Registryprogram ligger i `programmes`. Skolans `pupil_register_source` beskriver separat elevregister, inte Skolverkets uppslag.
- Nuvarande programplansåtkomst kräver `mandate_units` även för huvudman. Skolimport får därför inte automatiskt lägga till verksamhetsmandat.
- `protected-home.tsx` saknar huvudmannens skolenhetsvy. Kundadministration ska förbli en separat funktion.

## Avgränsade val

En ny huvudmannavy **Skolor** listar skolor och erbjuder **Sök i Skolenhetsregistret**. Sök med åtta siffrors skolenhetskod eller huvudmannens registrerade organisationsnummer. Organisationsnummer normaliseras men måste motsvara den huvudman som det aktuella serververifierade uppdraget hör till. Saknat nummer ger en tydlig spärr; det får inte fyllas i automatiskt från användarens sökning.

Organisationssökning ger en lista att välja ur. Varje vald skola hämtas i detalj och granskas separat innan **Lägg till skolenhet** eller **Uppdatera registeruppgifter**. Ingen massimport eller automatisk import vid sökning. Även koduppslag och nytt uppslag vid sparning måste matcha huvudmannens organisationsnummer. Annan huvudmans registerträff ger ingen rätt att importera.

Uppdatering ändrar endast registerägda fakta: namn, kommun, registerstatus, adress/ort, registerkälla/tid samt registerprogram för skolformer som finns i svaret. ID, kod, huvudman, lokal rektor, lokala årskurser, elevregisterkälla, verkliga mandat och alla utbildnings-/klass-/planrelationer bevaras. Skolformer som saknas i ett senare registerutdrag raderas inte automatiskt; vyn skiljer registrets aktuella skolformer från kvarvarande lokala och visar att lokal konfiguration behålls. Sådan skillnad är ingen automatisk rätt att upphäva planer eller mandat.

Nya skolor skapas utan lokalt rektorsuppdrag eller utökade mandat. Befintliga mandat förblir oförändrade. Åtkomst till planering och tilldelning av rektor går fortsatt via det särskilda mandatflödet. List-/uppdateringsbehörighet får inte tyst bredda en huvudmans befintliga skolenhetsmandat: befintliga skolor avgränsas till aktuellt mandat; en ny import kan återvisas genom sitt kvitto utan att bli automatiskt planeringsbar. Exakt listning av egna nya importkvitton ska redovisas i verifieringen.

## Fryst kontraktsriktning

- `GET /api/skolor`: skyddad aktuell lista och serverhärledd huvudman med organisationsnummer; inga kund-/huvudmansval i request.
- `POST /api/skolor/register`: strikt uppslag av kod eller organisationsnummer; kräver verkligt HM-uppdrag, same-origin och obligatorisk audit. Listval följs av detaljuppslag.
- `POST /api/skolor/register/spara` och `/status`: samma exakta femfältiga request `{commandId, code, operation: 'import' | 'update', expectedRevision: string | null, registryFingerprint: string}`. Import kräver null revision; update kräver aktuell opak revision. Båda kräver HM/MFA/CSRF och audit.
- `registryFingerprint` är SHA-256 över deterministiskt normaliserade, visade registerfakta, inklusive registerhuvudman; inte lokal hämtningstid. Servern hämtar om och jämför före ett nytt kommando.
- `expectedRevision` är en opak SQL-genererad snapshot-token av lokala registerfält och skolformer; konvertera inte en mikrosekundstidsstämpel via JavaScript Date. Lås och kontrollera samma token före uppdatering.
- `phase5_school_registry_list() returns jsonb` och `phase5_school_registry_save(request jsonb, registry_data jsonb, registry_payload jsonb, status_only boolean) returns jsonb` är de nya Worker-entrypoints. Privata hjälpare hålls stängda. Grundmigration och exakt Worker-grant är separata.
- Immutabelt kvitto binder full request, identitet, kund och huvudman till sparat skol-ID/resultat. Status ger `saved` eller `not_found` och ändrar inga verksamhetsrader. Replay/status kräver fortsatt aktuellt mandat men inget nätuppslag, ingen ny CAS och ingen ny källversion. Ny sparning läser kvitto först och hämtar registret bara när inget tidigare resultat finns.
- Efter bekräftat kvitto läses aktuell lista/skola om. Vid borttappat svar hålls samma request/UUID låst; inget nytt kommando skapas innan status är avgjord. Förändrad källa/revision kräver ny granskning.

## Provgränser

SQL-rollback, modell-/adapterprov, faktisk Worker/DB och webbläsarprov redovisas var för sig. Syntetiska registertransporter används endast i isolerad testinjektion; ingen valbar produktionsflagga eller falsk publik Skolverketsanslutning byggs. Publik tjänsts aktuella kontrakt behöver separat läsande verifiering mot officiell källa före påstående om verkligt uppslag. Syntetisk lokal huvudman kan sakna träff i det publika registret; mänskligt prov måste då erbjudas i tydligt märkt isolerad fixture eller begränsas ärligt till vad miljön kan visa. Inga falska associationsnummer eller nya verkliga kundkopplingar införs för att kringgå spärren.

Historiska 05-22-metadataavvikelser och 1 827 gamla auditposter utan identitetsankare är fortsatt separata öppna frågor. Nya prov måste bevara äldre rader/auditankare och tillföra noll nya saknade ankare. Full ADMIN-01/fasacceptans ges först efter verifierat avgränsat beteende och mänsklig bedömning.

## Precisering vid kontraktslåsning

Serverkontraktet importerar eller exponerar inte upstream headMaster. Vid import lämnas school_units.head_master null; vid update bevaras det befintliga fältet. Ingen rektorsuppgift från registerpayload blir lokalt beslut. Requesten har exakt fem fält. Egna nya importskolor kan visas genom identitetsbundna kvitton men har canUpdate=false tills verkligt skolmandat finns.

ROOT har separat läsande verifierat att den offentliga tjänsten svarar för en känd skola och att just den offentliga registerreferensens organisationsnummer inte redan används i den lokala testdatabasen. Ett faktiskt fullvägsprov kan därför göras i en ägd isolerad syntetisk kund/huvudman med en offentlig registerreferens, utan påstående om verkligt företrädarskap. Provgrafen ska vara tydligt syntetisk och städas avgränsat; den får inte permanent reservera organisationsnumret för en kommande riktig kund. Mänsklig provmiljö väljs först efter denna kontrollerade verifiering.
