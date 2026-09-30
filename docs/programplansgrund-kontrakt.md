# Versionsbundet underlag för programplaner

Internt kontrakt för fas 5, plan 05-07. Detta dokument hör inte till användarhandboken. Katalogreferenser är en grund för kommande skyddade programplanskommandon, inte ett godkännande av en utbildning eller dess samlade nationella ram.

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

Importen ansluter inte till databasen, läser inga privata miljövärden och hämtar inga externa uppgifter. Ingen publik route, UI-vy eller ny SQL/Worker-rättighet finns i denna plan. En klientvald katalogreferens blir inte betrodd utbildningsdata för att denna validator returnerar `resolved`.

## Nästa SQL-plan

Inventeringen finns i `.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-07-INVENTORY.md`. `point_plans` saknar revision, fingerprint och explicit program-/ämnesversionsgrund. `catalog_fetched` är endast ett datum. Äldre actor-FK till `auth.users` är inte den aktuella skyddade sessionens aktör.

Nästa genomförandeplan behöver:

1. Föra över ett exakt maskinartefakt som oföränderligt, versionshanterat referensunderlag till databasen och verifiera samma SHA-256/innehåll där. Appens validator får inte ensam godkänna SQL-skrivning.
2. Binda varje ny programplansversion till katalog-ID, programversion, explicit utbildningsstart, ämnesversioner och lösta nationella alternativ. Identiteten fryses för versionen. Nytt underlag kräver uttryckligt versions-/migreringskommando.
3. Hantera befintliga obundna poster som `unpinned_basis`. Gissa inte katalogversion ur hämtdatum eller utbildningsstart ur kulltext. Inventering, explicit rättning och separat audit måste föregå bindning; äldre beslut och utbildnings-ID ska bevaras.
4. Härleda kund, aktör, medlemskap, uppdrag, skola och levande mandat från faktisk serverkontrollerad session. Kontrollera relationerna även i SQL-transaktionen och neka främmande kund/skola samt återkallat mandat.
5. Låsa programplansobjekt och jämföra förväntad revision. Huvudman/rektor får utforma utkast; endast huvudman fastställer direkt ur utkast. Timplanens förslag/återsändning införs inte som ny programplansprocess.
6. Ersätta tidigare fastställd version och fastställa ny version atomärt med obligatorisk sessionskopplad DB-/Worker-audit. Loggfel eller delskrivningsfel återställer hela kommandot. Inga råa katalog-/planinnehåll behöver skrivas i säkerhetsloggen.
7. Pröva exakta källreferenser samt fullständiga nationella alternativ, ramar och beslutsregler för varje öppnad programkategori. Olösta val eller ej belagd kategori/ram stoppar öppnande.
8. Hålla nya entrypoints stängda tills full SQL-/sessions-/API-preflight och kompensation av tillfälliga grants har verifierats; därefter endast exakt avgränsade Worker-rättigheter. Ingen gammal demoväg återöppnas.

Detta är krav på nästa implementation, inte påståenden om redan implementerade SQL-funktioner. De befintliga tre fas 5-entrypointsen för GR/IM-timplan ändras inte. ADMIN-02 är fortsatt Pending; fas 4:s mänskliga checkpoint och separat fasverifiering kvarstår.

## Verifiering

Från `web/`:

```sh
node --test lib/programplan-catalog.test.mjs scripts/build-programplan-catalog.test.mjs lib/server/programplan-basis.test.mjs
node scripts/build-programplan-catalog.mjs --check
node --test lib/*.test.mjs lib/server/*.test.mjs scripts/build-programplan-catalog.test.mjs
npx tsc --noEmit
npx oxlint app lib scripts/build-programplan-catalog.mjs
npm run build:protected
```

Generator-/parserprov ska täcka faktisk källsnapshot, exakt fingerprint, modifierat innehåll med gammalt ID, fel program/inriktning/version/start/ämne/item/poäng, dubbletter, okända fält och bevarade alternativ. Ordinarie organisations-/timplans-/kull-/lagerprov verifierar att den äldre vägen är oförändrad. Syntetiska referensprov är inga mandatprov eller kommunala acceptansprov. Nytt användarbeteende öppnas inte här, så tidigare browserbevis för 05-06 är historik och inget bevis för denna validator.
