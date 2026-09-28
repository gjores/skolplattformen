# Elevregister – kontrakt för fas 4

Detta är det interna kontraktet för det syntetiska elevregistret. Typer och rena regler finns i `web/lib/pupil-register-model.ts`. Kontraktet beskriver server- och vygränsen; SQL, API och gränssnitt levereras och verifieras i senare delplaner. Detta dokument godkänner inte verklig elevdata eller kommunanslutning.

## Datum, urval och adresser

Alla verksamhetsdatum har format `YYYY-MM-DD` och ska vara verkliga kalenderdatum. Läsåret Y är `[Y-07-01, Y+1-07-01)`. En placerings slutdatum `endsOn` är sista inkluderade dag, `null` betyder tills vidare. Placeringen ingår i läsåret om `startsOn < nästa 1 juli` och `endsOn >= 1 juli` eller saknas. Start efter slut avvisas. Referensdatum för status är dagens datum om det ligger i läsåret, annars läsårets start (D-18). Årskurs är `schoolYear - startYear + 1`; saknat startår ger `null`, inte en gissad årskurs.

`Selection` har exakt `schoolYear: number`, `unitId: UUID`, `classId: UUID|null`, `educationId: UUID|null`, `grade: integer|null`, `status: aktuell|framtida|avslutad|null`, `page: positivt heltal`. URL använder en gång vardera `vy=elever`, `lasar`, `skola`, `klass`, `utbildning`, `ak`, `status`, `sida`. Okända, upprepade eller ogiltiga parametrar avvisas. Modellens serializer kopierar bara tillåtna parametrar. Skol- och filter-ID är opaka UUID; rätt att välja dem prövas separat i SQL. Årtal 1–9998 stöds, eftersom nästa års juli måste kunna representeras. Årskurs kan vara noll eller negativ för ännu inte påbörjad utbildning enligt den beslutade formeln.

Söktext finns **endast i flikens minne**, aldrig i URL, sessionStorage, localStorage eller annan webbläsarlagring. Omladdning återställer URL-urval men rensar fritext. Byte av uppdrag, kontext eller utloggning rensar även minnet. Detta preciserar D-14 i enlighet med UI-SPEC:s skyddsförbud; researchens sessionStorage-exempel gäller inte.

## Läsning och projektion

Alla anrop har stängda scheman: okända requestfält avvisas, okända responsfält kopieras inte. TypeScript-typer ersätter aldrig serverns runtime-validering. POST lista tar `ListRequest={selection: Selection, search: string, caseId: UUID|null}`. Söktext är POST-innehåll och får inte loggas. Kort tar `CardRequest={pupilId: UUID, schoolYear: number, caseId: UUID|null}`; historik tar samma samt `page` (20 händelser/sida). Ärendemandat kräver sitt konkreta caseId i SQL, även vid listning.

`PupilList={pupils,scope,options,capabilities,count,page,pageSize}`. Sida är 1-baserad, storlek 50. `scope` innehåller bara SQL-prövade skolor, grupper och ärenden för aktuellt uppdrag. `options` har skolor, klasser, utbildningar, årskurser och statusvärden från tillåtet scope. Antal, filter och sortering får inte avslöja dolda elever. Sortering är projicerat displayName med stabil sekundär elev-ID. Ingen bredare lista lämnas för klientfiltrering.

`PupilListItem` är en strukturell union utan publik projektionsmarkör: grundformen innehåller ID, displayName (anonymt när mandatet kräver det), skola/klass/utbildning, årskurs, status och åtgärdsflaggor. Endast administrativt mandat får födelsedatum och hemkommun. Inga listor innehåller personnummer. Ingen discriminator, skyddsflagga eller elevspecifik canReadProtected anger om anonymiseringen beror på skydd eller annan begränsning.

`PupilCard` har samma strukturella projektion utan discriminator och de daterade listorna placements/classes samt version. Endast administrativt kort har municipalities/origins/sourceConflicts. Personnummer ingår aldrig i kortsvaret; separat uttrycklig visning returnerar `PersonalNumberResult` efter SQL-prövning och egen logghändelse. Historik returnerar `PupilHistory={entries,count,page,pageSize}` med `HistoryEntry={id,field,before,after,changedBy,changedAt,origin}`. Identitetsfält återges enbart som ändrat-markör i historik och konflikt; gamla personnummer lämnas inte ut.

`Capabilities` innehåller `canEdit`, `canExport`, `canRevealPersonalNumber`, `canReadHistory`, `canReadProtected`. `canReadProtected` förekommer bara som generell mandatcapability på listan, aldrig på elevraden. Endast boolean true för känd flagga ger rättighet i vyn; saknad, okänd eller annan typ ger inget. Flaggorna är serverns UI-besked, inte ett behörighetsbevis vid nästa anrop. D-17: huvudmannen ger skyddsbehörighet per skola. D-19: administratör utan sådan behörighet får anonym elev utan åtgärder. D-20: bara pågående eller framtida placering på administratörens skola ger ändringsrätt; enbart avslutade medger läsning/historik.

## Ursprung och ändring

`FieldOrigin={source,actorId,changedAt,localCorrection}` där source är `manual|ss12000|spar|simulated`; aktör och tid hämtas på servern. `OriginField` är den stängda mängden `displayName|personalNumber|protectedIdentity|municipality|placement|education|class`. `PupilCard.origins` är en partiell mapp över endast tillåtna fält. Manuellt appägande gäller nu; extern/simulerad källa är en förberedelse, ingen anslutning.

`ChangeRequest` har gemensamt `pupilId,schoolYear,caseId,expectedVersion` samt `kind,payload`:

| kind | payload |
|---|---|
| basics | displayName?, personalNumber?, protectedIdentity? (minst ett fält) |
| municipality | municipalityCode, startsOn, endsOn |
| transfer | placementId, unitId, educationId, startsOn, endsOn |
| education | placementId, educationId, startsOn |
| end-placement | placementId, endsOn |
| class | placementId, classId, startsOn, endsOn |
| resolve-source | conflictId, choice: local\|source |

`expectedVersion` är positiv heltalsversion. Ändring av klass byter aldrig utbildning; avvikande utbildningskoppling varnas separat. SQL serialiserar sammanhängande periodändring, versionskontroll, ursprung och historik. Klienten får inte välja aktör, ursprungstid eller version för lagring. Som förberedelse för nyskapande finns typen `CreatePupilRequest` (ingen skapavy eller API-väg införs i denna delplan) med minimala basuppgifter, första skolplacering, klass och hemkommunsperiod; intern elev-ID genereras av servern och är oberoende av inloggningskonto.

## Konflikt och export

409-konfliktens `ConflictDetails` har `kind=fields`, `currentVersion,changedBy,changedAt,fields[]` där varje element är ett uttryckligt tillåtet konfliktfält med `submitted` och `current`. Tillåtna fält är displayName, protectedIdentity, municipalityCode, unitId, educationId, classId, startsOn, endsOn. Identitetskonflikt har i stället `kind=identity` och `field=personalNumber` utan värden; numret visas bara genom den särskilda visningsvägen. Periodkonflikt har `kind=period`, samma metadata, `period=placement|class|municipality` och `reason=overlap|outside-placement`. Historiska identitetsvärden och godtyckliga SQL-detaljer ingår aldrig. Runtime-parsern avvisar extra nycklar och felaktiga typer. Aktör/tid och värden projiceras först efter SQL:s förnyade mandatprövning; konfliktobjekt får inte användas som läsväg runt skyddet.

`ExportSelection` väljer antingen `mode=ids,ids[]` eller `mode=filter,selection,search`. Båda har `schoolYear,caseId,fields[],protectedIds[],includePersonalNumber`. fields tillåter id, displayName, birthDate, unitName, className, educationName, grade, status, municipalityCode. Personnummer kan bara begäras via den separata booleska flaggan. `protectedIds` är uttryckligen valda skyddade elever, inte en allmän inkludera-allt-flagga. Vid filterläge måste schoolYear matcha selection.schoolYear. Preview och download tar samma urval; download prövar alltid aktuellt mandat och samtliga fält/spärrar igen. Preview ger endast tillåtet count och fields samt includePersonalNumber, aldrig antal bortfiltrerade skyddade elever. CSV återanvänder `audit-export.ts` för cellescaping och formelskydd och skrivs med BOM, semikolon och CRLF. CSV-byggaren tar redan serverprojicerade rader och utför ingen egen behörighetsprövning.

## Syntetiska identiteter

Endast exakt `TEST-YYYYMMDD-NNNK` accepteras. Kalenderdatumet måste vara giltigt och kontrollsiffran K beräknas med Luhn över `YYMMDDNNNK` (de tio sista sifferpositionerna). Prefixet gör strängen tydligt fiktiv; vanliga 10/12-siffriga personnummer avvisas även om kontrollsiffran stämmer. Både klient och SQL måste använda samma stängda allowlist från 04-02. Modellens validator tar listan uttryckligen och misslyckas stängt om värdet saknas. Klientkontroll ersätter aldrig SQL-kontroll. Inga backendkopplingar läggs till i exempelläget.
