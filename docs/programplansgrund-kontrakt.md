# Versionsbundet underlag för programplaner

Internt kontrakt för fas 5, plan 05-07–05-08. Detta dokument hör inte till användarhandboken. Katalogreferenser är en grund för kommande skyddade programplanskommandon, inte ett godkännande av en utbildning eller dess samlade nationella ram.

## Källa och återfinnbart innehåll

`web/lib/syllabus-snapshot.ts` är befintlig versionshanterad snapshot från 2026-09-05. Offlinegeneratorn skapar `web/lib/programplan-catalog.generated.json`; den hämtar inga nya uppgifter och ändrar inte originalet.

[Skolverkets Syllabus-dokumentation](https://www.skolverket.se/om-skolverket/oppna-data/api-for-laroplaner-kurs--och-amnesplaner) beskriver program, ämnen och versioner med giltighetsdatum. En ny katalogversion får inte tyst ersätta en plans tidigare underlag. Det är projektets säkerhetsregel att en saknad historisk version stoppar referenslösningen; detta är inte en automatisk rättslig bedömning av äldre utbildning.

Aktuella offentliga API-anrop 2026-09-30 jämförde endast SA25, EK25 och ES25:s programversion/startdatum med snapshoten. Se `work/pilot/results/phase5-07-source-check.json`. Kontroll av tre programs metadata bevisar inte att hela snapshoten är dagens kompletta katalog. Framtida uppdateringar ska skapa återfinnbara artefakter och får inte skriva över befintliga planers identitet.

## Körbar kedja

`web/lib/programplan-catalog.ts` innehåller rena funktioner:

- `projectProgramplanCatalog(snapshot)` skapar det slutna katalogpayloadet.
- `canonicalCatalogJson(payload)` ger kanonisk JSON för fingerprint.
- `parseProgramplanBasisReference(value)` prövar det slutna referensformatet.
- `verifyProgramplanCatalog(value)` prövar format, korsreferenser och SHA-256 och ger en djupt fryst, verifierad kataloginstans.
- `resolveProgramplanBasis(catalog, reference)` återfinner källbundet underlag eller returnerar blockeringsorsaker.

Resolvern kräver den verifierade instansen från `verifyProgramplanCatalog`. Ett vanligt katalogobjekt, en kopia eller en TypeScript-konvertering kan inte ersätta verifieringen: privat instansregistrering ger `unverified_catalog` för sådant underlag. Verifiering klonar det slutna innehållet innan asynkron hashkontroll, så efterföljande ändring av indata påverkar inte instansen.

Payloadet innehåller exakt `schemaVersion: 1`, `source: {url, apiVersion, fetched}`, `subjects` och `programs`. Artefaktet har dessutom `catalogId`. ID-formatet är `sha256:` följt av 64 gemena hextecken. SHA-256 beräknas över kanonisk JSON i UTF-8 utan själva `catalogId`. Objektfält och katalogmängder ordnas deterministiskt; betydelsebärande block-/nivåordning bevaras. Inga aktuella tidsstämplar eller slumpvärden ingår.

Hashkontrollen använder den slutna normaliserade projektionen: saknade giltighetsfält får explicita `null`, katalogens ämnen/program sorteras efter kod och ämnets skolformer sorteras. Generatorns `--check` prövar dessutom den exakta filserialiseringen med avslutande radbrytning. Equivalent metadataform är alltså samma innehållsidentitet, medan versionshanterat artefakt måste vara byteidentiskt.

Källprojektionen bevarar ämnes-/programkod, exakt version, skolformer/ordning/kategori, namn, giltighetsmetadata, block, inriktningar, optional-markeringar samt kurs-/nivåreferenser och poäng. Råa ämnesblockpoäng ska inte likställas med summan av nivåernas poäng. En dubbel eller tvetydig katalogreferens stoppar projektionen; `Map` får inte tyst välja sista förekomsten.

`web/scripts/build-programplan-catalog.mjs` exporterar `createCatalogArtifact(snapshot)` och `runCatalogGenerator({check, outputFile?, snapshot?})`. Import kör inte huvudprogrammet. Direktanrop bygger artefaktet; `--check` jämför utan att skriva och ger fel vid saknat eller avvikande artefakt.

## Slutet referensformat

`ProgramplanBasisReference` har exakt följande fält:

```ts
{
  catalogId: string;
  programRef: { code: string; version: number };
  orientationCode: string | null;
  startedOn: string;
  specializationRefs: {
    subjectCode: string;
    subjectVersion: number;
    itemCode: string;
    points: number;
  }[];
}
```

`startedOn` är ett känt kalenderdatum från utbildningens underlag. Fri kulltext, serverns dagens datum eller `start_year` ensamt får inte omvandlas till ett sådant bevis. Programplansversion, nationell programversion och ämnesversion är skilda identiteter.

Referensen får inte innehålla roll, kund, skolmandat, status, egna källnamn eller påstådd totalram. Förväntade typer, heltal, kalenderdatum, sträng-/mängdgränser och varje nästlat objekts nycklar prövas utan koercion eller trunkering. Giltiga typer ger inte behörighet att läsa eller ändra ett verksamhetsobjekt.

Faktiska formatgränser: koder är högst 96 tecken och börjar med en bokstav; endast bokstäver, siffror, `_` och `-` tillåts, och prototypnycklar nekas. Namn är 1–1000 tecken, käll-URL högst 2000 utan användaruppgifter, API-version/SKOLFS högst 100. Version är heltal 1–100000 och poäng heltal 0–10000. Datum är verkliga kalenderdatum i exakt `YYYY-MM-DD`. Referensen har högst 200 valda nivåer. Katalogen har högst 20000 ämnen, 1000 program, 1000 poster per ämnes-/blocklista, 100 inriktningar och 20 skolformer; dubbletter nekas. Dessa gränser omsluter den sparade katalogen, utan att trunkera inkommande innehåll eller utgöra nationella ramregler. Endast vanliga objekt eller objekt med null-prototyp och egna datafält accepteras; extra fält, symbolfält och getters/setters nekas även när fälten inte är uppräkningsbara.

Gymnasiets referensgrund gäller här Gy25 och GY. En Gy11-kurs, grundskolereferens eller annan skolform omtolkas inte till en Gy25-nivå. Programkod och programversion måste finnas exakt i den bundna katalogen. Inriktningen måste tillhöra programmet; `null` är bara tillåtet när katalogunderlaget inte kräver någon inriktning. En okänd inriktning får inte försvinna och dess poäng får inte bli extra programfördjupning.

Varje vald fördjupningsnivå måste finnas i samma programs alternativ, med exakt ämneskod, ämnesversion, itemkod och poäng. Dubbletter och redan fasta nivåer får inte bli en ny fördjupning. Ingen nivåföljd gissas ur itemkodens första siffra.

## Referenslösning och olösta val

Resultatet har `status: 'resolved' | 'blocked'`, `catalogId`, `programRef`, `diagnostics`, `unresolvedChoices`, `basis` samt de konstanta markeringarna `decisionReady: false` och `writeReady: false`.

`basis` är återfunnet katalogunderlag med nationella block, versionsbundna nivåer, verkliga fördjupningsalternativ och valda nivåer. `resolved` betyder endast att de angivna referenserna kunde återfinnas; det betyder inte att planen kan fastställas eller skrivas.

Svenska och svenska som andraspråk bevaras som alternativ. Ingen väljs implicit. Ett block utan nivålista redovisas som olöst underlag och får inte en uppfunnen itemkod. Exempelvis kan modern språkreferens finnas på programnivå utan motsvarande komplett nivåval i snapshoten. Sådana val måste få ett eget verifierat underlag innan framtida besluts-/skrivgrind kan godkänna en full plan.

Referensgrunden fabricerar varken generell 2500-poängsram, fördjupningsrest, antal studieår eller garanterade undervisningstimmar. Programkategori och råa källblock behålls så att nästa implementation kan validera rätt regler för rätt utbildning. Avvikande program tas inte bort ur katalogen för att göra prov gröna.

`diagnostics[].code` anger stopporsaken. Fel format kastas som `ProgramplanContractError` i de rena parserfunktionerna och översätts till blockerande resultat i resolver/adaptern. Resolverns `basis` är `null` vid blockerande diagnostik.

| Kod | Betydelse |
| --- | --- |
| `unpinned_basis`, `unknown_education_start` | Exakt underlagsbindning respektive uttrycklig start saknas. |
| `invalid_basis_reference`, `invalid_catalog_id` | Referensens form eller innehållsidentitet är ogiltig. |
| `unverified_catalog`, `catalog_mismatch`, `catalog_integrity_failed` | Kataloginstansen har inte verifierats, ID matchar inte, eller hash stämmer inte med innehållet. |
| `program_not_found`, `orientation_not_found`, `orientation_required` | Program/inriktning saknas eller kräver ett uttryckligt val. |
| `historical_version_missing` | Efterfrågad exakt version eller version för utbildningsstarten saknas. |
| `validity_metadata_missing`, `version_not_applicable_at_start`, `version_canceled_before_start` | Saknade giltighetsdata eller datumavvikelse för vald start. |
| `unsupported_regime`, `unsupported_school_type` | Annan styrdokumentsordning eller skolform än den avgränsade Gy25/GY-grunden. |
| `subject_not_found`, `wrong_subject`, `item_not_found`, `points_mismatch` | Vald nivå saknas eller matchar inte ämne/poäng. |
| `duplicate_selected_level`, `fixed_level_duplicate`, `not_specialization_option` | Dubbelval, redan fast nivå eller nivå utanför programmets fördjupningsalternativ. |
| `invalid_catalog`, `duplicate_catalog_code`, `catalog_reference_missing`, `catalog_reference_mismatch` | Artefaktets slutna format eller korsreferenser är ogiltiga. |
| `catalog_unavailable` | Serveradaptern kunde inte verifiera katalogen; ingen framgång returneras. |

`unresolvedChoices` bevarar `optional_subject`, `subject_levels_unresolved` och `program_rules_unverified`, med block/ämne/poäng eller kategori. De är information om saknat fullständigt beslutsunderlag även vid tekniskt `resolved`. `prerequisiteEvidence: 'not_present_in_snapshot'` anger att nivåföljd/förkunskapsregler inte är belagda här.

## Serverintern integritetskontroll

`web/lib/server/programplan-basis.ts` exporterar `createVerifiedProgramplanCatalog(value)` och `validateProgramplanCatalogBasis(value)`. Den första använder den gemensamma verifieraren för både slutet artefaktformat och överensstämmelse mellan innehåll och fingerprint, och ger en fryst kopia. Den andra kontrollerar referensen och använder samma resolver med repoartefaktet. Endast verifierad oföränderlig katalog får cachelagras; ingen aktör eller behörighet cachelagras här.

Importen ansluter inte till databasen, läser inga privata miljövärden och hämtar inga externa uppgifter. Adaptern öppnar ingen publik route eller UI-vy. Databasgrunden i 05-08 är separat och har inga nya Worker-rättigheter. En klientvald katalogreferens blir inte betrodd utbildningsdata för att denna validator returnerar `resolved`.

## Sluten databasgrund för utkast (05-08)

Tre framåtriktade migrationer lagrar katalogen och inför programplansutkast. `programplan_catalogs` har enbart `catalog_id` och `payload`. Databasen prövar det slutna normaliserade formatet, korsreferenserna och samma kanoniska SHA-256 som offlinegeneratorn. Arrays omordnas inte i SQL; seedgeneratorn ska därför användas för den verifierade lagringsformen. UPDATE, DELETE och TRUNCATE nekas. En ny katalog är en ny innehållsidentitet och skriver inte över en tidigare katalog.

`web/scripts/build-programplan-catalog-sql.mjs` skapar seedmigrationen från det verifierade artefaktet utan nätverk, databas, tidsstämplar eller upsert. `--check` jämför exakta bytes utan att skriva.

`phase5_resolve_programplan_basis(jsonb)` återger exakt sex fält: `status`, `catalogId`, `programRef`, `diagnostics`, `unresolvedChoices` och `decisionReady: false`. Det är ett avgränsat referensresultat, utan hela katalogunderlaget eller skrivmandat. Diagnostik och olösta val jämförs innehållsmässigt med TypeScript-resolvern. Vid fel innan bindningen kunnat parsas kan SQL sakna vald katalog och returnera `catalogId: null`; TypeScript har redan fått en verifierad kataloginstans. Saknat katalog-ID i databasen ger `catalog_unavailable`; TypeScript med annan vald instans ger `catalog_mismatch`. Ingen implicit standardkatalog väljs.

`point_plans` får `revision`, nullable `catalog_id` och nullable `basis_reference`. Befintliga planer börjar med revision 0 och obundet underlag. Ingen utbildningsstart eller katalogversion härleds från gammalt hämtdatum eller fri kulltext. En bunden versions katalog, program, inriktning, utbildningsstart och identitet fryses; endast utkastets ordnade fördjupningsreferenser kan ändras med förväntad revision.

De fem interna kommandona är:

- `phase5_read_programplan(plan_id)` läser en plan inom levande skolmandat och skriver obligatorisk DB-audit.
- `phase5_bind_programplan_draft(plan_id, expected_revision, basis_reference)` binder ett obundet utkast uttryckligt. Gamla fördjupningskoder måste återfinnas i exakt samma ordning.
- `phase5_replace_programplan_specialization(plan_id, expected_revision, specialization_refs)` ersätter det bundna utkastets fördjupning atomärt och ökar revisionen.
- `phase5_create_programplan_draft(offering_id, expected_latest_version, basis_reference)` skapar nästa version utan att ändra en tidigare plan. Högst ett öppet utkast tillåts.
- `phase5_clone_programplan_draft(source_plan_id, expected_source_revision, expected_latest_version, explicit_legacy_basis default null)` kopierar en tidigare fastställd/ersatt källas underlag till ett nytt utkast. Obunden källa kräver uttryckligt underlag; källans identitet, beslut och historik bevaras.

Kommandona återger samma slutna projektion med tolv fält: `id`, `offeringId`, `unitId`, `schoolName`, `education`, `version`, `revision`, `status`, `decidedOn`, `catalogId`, `basisReference`, `resolution`. Aktörens privata uppgifter ingår inte. SQL låser faktisk session, därefter kund och utbildning/plan, och prövar aktuell session och mandatkedja efter väntan. Huvudman och rektor får arbeta med utkast inom sina levande skolmandat. Klientens rollfält ger inget mandat.

Ny verksamhetshistorik använder verklig skyddad identitet, session, medlemskap och uppdrag i separata kolumner. Äldre historik och dess `auth.users`-koppling lämnas kvar. Alla kommandon kräver korrelations-ID och sessionskopplad DB-audit i samma transaktion; loggfel återställer data, revision och verksamhetshistorik. Säkerhetsloggen innehåller minimala objekt-/åtgärdsuppgifter, inte råa planer.

Alla nya tabell-/funktionsrättigheter är stängda för PUBLIC, anon, authenticated och Worker. Workers gamla direkta programplans-/historikrättigheter stängs också; de tre befintliga timplanskommandona behåller sina rättigheter. SQL-proven är lokala syntetiska databasprov och bevisar varken HTTP-session, MFA eller Worker-audit.

## Nästa avgränsning

Nästa plan behöver koppla dessa interna utkastkommandon till skyddad server/API med levande sessionskontroll, MFA enligt befintlig policy, strikt indata/svarsprojektion och obligatorisk Worker-audit i samma yttre transaktion. Full preflight och återställning av tillfälliga provrättigheter ska föregå några permanenta nya Worker-grants. Därefter kan ett tydligt användarflöde öppnas och provas på dator och telefon.

Fastställande har inget kommando här. Huvudmannen ska senare kunna fastställa direkt ur utkast; timplanens förslag/återsändning införs inte för programplaner. Fullständiga nationella alternativ, ramar, nivåföljd och timregler måste först ha verifierat underlag. Teknisk `resolved` med olösta val är tillåten som utkast men ger aldrig `decisionReady: true`. ADMIN-02 är fortsatt Pending; kullkopiering, klasskoppling, fas 4:s mänskliga checkpoint och separat fasverifiering återstår.

## Verifiering

Från `web/`:

```sh
node --test lib/programplan-catalog.test.mjs scripts/build-programplan-catalog.test.mjs lib/server/programplan-basis.test.mjs
node scripts/build-programplan-catalog.mjs --check
node --test lib/*.test.mjs lib/server/*.test.mjs scripts/build-programplan-catalog.test.mjs
npx tsc --noEmit
npx oxlint app lib scripts/build-programplan-catalog.mjs
node scripts/build-programplan-catalog-sql.mjs --check
```

Generator-/parserprov ska täcka faktisk källsnapshot, exakt fingerprint, modifierat innehåll med gammalt ID, fel program/inriktning/version/start/ämne/item/poäng, dubbletter, okända fält och bevarade alternativ. Ordinarie organisations-/timplans-/kull-/lagerprov verifierar att den äldre vägen är oförändrad. Syntetiska referensprov är inga mandatprov eller kommunala acceptansprov. Nytt användarbeteende öppnas inte här, så tidigare browserbevis för 05-06 är historik och inget bevis för denna validator.

Databas- och samtidighetsproven körs från projektroten med målskydd mot endast den disponibla lokala `protected`-miljön:

```sh
node work/pilot/run-sql-tests.mjs --file phase5_programplan_catalog.test.sql
node work/pilot/run-sql-tests.mjs --file phase5_programplan_drafts.test.sql
node --test work/pilot/verify-programplan-locks.test.mjs
node work/pilot/verify-programplan-locks.mjs
```

Samtidighetsprovet använder verkliga separata anslutningar och konstaterad låsväntan. Det städar bara sin egen syntetiska verksamhetsgraf. Säkerhetsloggar och de identiteter loggarna refererar till behålls som auditankare och redovisas i resultatet.

## Skyddad transport för utkast (05-09)

Fem POST-rutter finns under `/api/programplaner`: `lasa`, `binda`, `fordjupning`, `skapa` och `klona`. De använder motsvarande fem SQL-kommandon ovan. `web/lib/programplan-contract.ts` är det gemensamma rena formatkontraktet; serveradaptern ligger i `web/lib/server/programplan-planning.ts`. Inga fria kund-, roll-, skol-, sessions- eller statusfält accepteras.

Huvudman och rektor får läsa inom sitt levande skolmandat. Samma roller får skriva utkast med giltigt MFA-bevis och begäran från samma webbplats. En färsk låst session, uppdragskedja och kontextversion prövas för varje operation. Klientens typkontroll, roll eller underlagsreferens ger aldrig behörighet. API:t är fortfarande avgränsat till lokal skyddad syntetisk provmiljö.

Svaren bevarar exakt SQL:s tolvfältsschema. `resolution` har enbart `status`, `diagnostics`, `unresolvedChoices` och `decisionReady: false`. Ett obundet äldre underlag förblir uttryckligt blockerat; svaret innehåller inte dess gamla råa fördjupningskoder. Det kräver en separat mandatbunden läsprojektion i nästa arbetsyteplan. Ingen katalog, full nationell matris eller beslutberedskap härleds från ett tekniskt lyckat svar.

Bindning och ändring ska återge samma plan-ID och nästa revision. Skapande och kloning ger nästa planversion och revision 0; kloning ger ett nytt ID. Underlag och ordnade val måste motsvara begäran. Felaktig SQL-projektion, ID-/revisionsavvikelse eller okänd diagnostik stoppar svar inom transaktionen. Versionskonflikt ger minimerat 409; SQL-feltext eller konkurrerande planvärden lämnas aldrig ut.

Varje lyckad operation skriver DB- och Worker-händelse i samma yttre transaktion före svar. Båda binder verklig identitet, session, medlemskap, uppdrag, kund, plan, åtgärd och korrelation. Clone-DB-händelsen innehåller endast serverkontrollerat `sourcePlanId`; Worker loggar inga referenser, poäng, namn eller fria planvärden. Auditfel återställer verksamhet, revision, historia och framgångshändelser. Ett nekande loggas separat och lämnar ingen verksamhetsframgång. Alla svar har `Cache-Control: no-store`.

Migration `20261001110000_phase5_worker_programplan_execute.sql` öppnar enbart de fem bevisade signaturerna till Worker. PUBLIC, anon, authenticated, katalogtabell, direkta plan-/historiktabeller och interna helpers förblir stängda. De tre tidigare timplanskommandona består, totalt exakt åtta phase5-signaturer. Preflightens tillfälliga grants återställs och hela funktionernas ACL jämförs före permanent grant. Cleanup behåller append-only säkerhetsloggar och nödvändiga identitetsankare.

Full preflight och slutprov finns i `work/pilot/results/phase5-09-api-preflight.json` och `phase5-09-api.json`. Provmatrisen använder byggd Worker, verklig PostgreSQL och lokalt mintade sessioner med testrealmens bevisprofil. Detta bevisar assurancekontroll i servervägen, inte interaktiv IdP-inloggning eller verklig kommunanslutning. SQL-låsprov är separata bevis utan HTTP-MFA. Utbildnings-/list-/UI- och fastställandeflöden ingår inte i 05-09.

## Kompatibilitet för framtida schema och modulutbyte

`offeringId`, `unitId`, planens `id`, `version` och `revision` identifierar verksamhet och sparat tillstånd. `catalogId`, `programRef.version` och `subjectVersion` är separata nationella innehållsidentiteter. Ingen av dessa versioner får ersätta en annan.

`startedOn` är uttryckligt underlagsbundet startdatum. `cohort` är en fri etikett och ger inget datum, kalender-ID, klass-ID eller kullkopplingsbevis. `points` är gymnasiepoäng; API:t producerar inga schemaminuter eller garanterade undervisningstimmar. Bindningens giltighet och exakta versioner fryses och bevaras; ett senare utbyteskontrakt behöver egen giltighets- och enhetsmodell.

Utkaständring tillhör aktuellt huvudmanna-/rektorsmandat. Den ger inget schemapublicerings-, studieplans-, AI- eller modulköpsmandat. En ny planversion ombinder ingen befintlig klasskoppling. Delprojektets S1 behöver senare precisera gemensamma utbyteskontrakt, ändringsansvar och konsekvensanalys; 05-09 inför inga konkurrerande planmodeller eller nya schemaåtkomster.
