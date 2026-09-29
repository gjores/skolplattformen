# Elevregister – kontrakt för fas 4

Detta är det interna kontraktet och beviskartan för det syntetiska elevregistret. Typer och rena regler finns i `web/lib/pupil-register-model.ts`, servervalideringen i `web/lib/server/pupil-register.ts` och databasreglerna i fas 4-migrationerna. SQL, API och gränssnitt finns i nuvarande kod och har prövats i tidigare delplaner mot ett isolerat lokalt mål. En ny fullkörning av fasgrinden måste knyta dem till aktuell revision. Dokumentet godkänner varken verkliga elevdata, kommunanslutning eller pilotdrift.

## Datum, urval och adresser

Alla verksamhetsdatum har format `YYYY-MM-DD` och ska vara verkliga kalenderdatum. Läsåret Y är `[Y-07-01, Y+1-07-01)`. En placerings slutdatum `endsOn` är sista inkluderade dag, `null` betyder tills vidare. Placeringen ingår i läsåret om `startsOn < nästa 1 juli` och `endsOn >= 1 juli` eller saknas. Start efter slut avvisas. Referensdatum för status är dagens datum om det ligger i läsåret, annars läsårets start (D-18). Årskurs är `schoolYear - startYear + 1`; saknat startår ger `null`, inte en gissad årskurs.

`Selection` har exakt `schoolYear: number`, `unitId: UUID`, `classId: UUID|null`, `educationId: UUID|null`, `grade: integer|null`, `status: aktuell|framtida|avslutad|null`, `page: positivt heltal`. URL använder en gång vardera `vy=elever`, `lasar`, `skola`, `klass`, `utbildning`, `ak`, `status`, `sida`. Okända, upprepade eller ogiltiga parametrar avvisas. Modellens serializer kopierar bara tillåtna parametrar. Skol- och filter-ID är opaka UUID; rätt att välja dem prövas separat i SQL. Årtal 1–9998 stöds, eftersom nästa års juli måste kunna representeras. Årskurs kan vara noll eller negativ för ännu inte påbörjad utbildning enligt den beslutade formeln.

Söktext finns **endast i flikens minne**, aldrig i URL, sessionStorage, localStorage eller annan webbläsarlagring. Omladdning återställer URL-urval men rensar fritext. Byte av uppdrag, kontext eller utloggning rensar även minnet. Detta preciserar D-14 i enlighet med UI-SPEC:s skyddsförbud; researchens sessionStorage-exempel gäller inte.

## Läsning och projektion

Alla anrop har stängda scheman: okända requestfält avvisas, okända responsfält kopieras inte. TypeScript-typer ersätter aldrig serverns runtime-validering. POST lista tar `ListRequest={selection: Selection, search: string, caseId: UUID|null}`. Söktext är POST-innehåll och får inte loggas. Kort tar `CardRequest={pupilId: UUID, schoolYear: number, caseId: UUID|null}`; historik tar samma samt `page` (20 händelser/sida). Ärendemandat kräver sitt konkreta caseId i SQL, även vid listning.

`PupilList={pupils,scope,options,capabilities,count,page,pageSize}`. Sida är 1-baserad, storlek 50. `scope` innehåller bara SQL-prövade skolor, grupper och ärenden för aktuellt uppdrag. `options` har skolor, klasser, utbildningar, årskurser och statusvärden från tillåtet scope. Antal, filter och sortering får inte avslöja dolda elever. Sortering är projicerat displayName med stabil sekundär elev-ID. Ingen bredare lista lämnas för klientfiltrering.

`PupilListItem` innehåller ID, displayName (anonymt när mandatet kräver det), skola/klass/utbildning, årskurs, status och åtgärdsflaggor. Endast administrativ fullprojektion får födelsedatum och hemkommun. Inga listor innehåller personnummer. Efter migration `20260929180000_phase4_list_protected_flag.sql` får **enbart administratör med skyddsbehörighet** `protectedIdentity: true` på de skyddade rader som denne får se och ett `protectedIds`-fält för det tillåtna urvalet. Båda markörerna saknas för administratör utan skyddsbehörighet och andra mottagare. Servern avvisar motsägande flaggor, ID-lista och SQL-skyddsreferenser före svar. Ingen elevspecifik `canReadProtected` finns.

`PupilCard` har daterade `placements`/`classes` samt version. Endast administrativt fullkort har `protectedIdentity`, `municipalities`, `origins` och `sourceConflicts`; anonymt kort saknar dem. Personnummer ingår aldrig i kortsvaret; separat uttrycklig visning returnerar `PersonalNumberResult` efter SQL-prövning och egen logghändelse. Historik returnerar `PupilHistory={entries,count,page,pageSize}` med `HistoryEntry={id,field,before,after,changedBy,changedAt,origin,resolution?}`. Identitetsfält återges utan före-/eftervärde i historik och konflikt; gamla personnummer lämnas inte ut.

`Capabilities` innehåller `canEdit`, `canExport`, `canRevealPersonalNumber`, `canReadHistory`, `canReadProtected`. `canReadProtected` förekommer bara som generell mandatcapability på listan, aldrig på elevraden. Endast boolean true för känd flagga ger rättighet i vyn; saknad, okänd eller annan typ ger inget. Flaggorna är serverns UI-besked, inte ett behörighetsbevis vid nästa anrop. **D-17:** Huvudmannen ensam ger och återkallar skyddsbehörighet per skola via `/api/kund/skyddsbehorighet`; beslutet loggas. **D-19:** Administratör utan sådan behörighet får anonym elev utan födelsedatum, hemkommun eller åtgärder. **D-20:** Bara pågående eller framtida placering på administratörens skola ger ändringsrätt; enbart avslutade medger läsning/historik.

## Ursprung och ändring

`FieldOrigin={source,actorId,changedAt,localCorrection}` där source är `manual|ss12000|spar|simulated`; aktör och tid hämtas på servern. `OriginField` är den stängda mängden `displayName|personalNumber|protectedIdentity|municipality|placement|education|class`. `PupilCard.origins` är en partiell mapp över endast tillåtna fält. Nuvarande appflöde är manuellt; `ss12000` och `spar` är reserverade källnamn, inte anslutna leverantörer. Den simulerade källan körs bara mot målskyddad lokal databas. Källägt fält kan inte godtyckligt ändras i appen. Ny leverans som skiljer sig från lokal rättelse skapar en `pupil_source_values`-avvikelse utan tyst överskrivning; val av `local` eller `source` får historik, revision och säkerhetshändelse.

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

## Verkliga API-vägar och lagring

| Metod och URI | Begäran/svar | Särskild kontroll |
|---|---|---|
| `GET /api/elever/urval` | Inga queryparametrar; tillåtna referensval utan elevrader | Mandat och logg |
| `POST /api/elever/lista` | `{selection,search,caseId}` → `PupilList` | Same-origin; SQL prövar mandat och rader |
| `GET /api/elever/elev?pupilId=…&schoolYear=…[&caseId=…]` | Projekterat elevkort | Inget personnummer |
| `GET /api/elever/historik?pupilId=…&schoolYear=…&page=…[&caseId=…]` | 20 händelser per sida | Administratör och logg |
| `POST /api/elever/personnummer` | `{pupilId,schoolYear,caseId}` → `{pupilId,personalNumber}` | Aktivt val, same-origin, MFA, egen logg |
| `POST /api/elever/andra` | `ChangeRequest` → ny version eller 409-konflikt | Same-origin, MFA, aktuellt mandat och databaslås |
| `POST /api/elever/export` | `{mode:'preview'\|'download',export:ExportSelection}` → antal/fält eller CSV | Same-origin; nedladdning kräver MFA och ny SQL-prövning |
| `GET/POST /api/kund/skyddsbehorighet` | Lista eller `{action:'grant',assignmentId,unitId}` / `{action:'revoke',permissionId}` | Endast huvudman; skrivning kräver MFA |

SQL-registret lagrar stabilt `pupils.id` fristående från inloggningsidentitet, daterade `pupil_placements`, `pupil_class_memberships`, `pupil_home_municipalities`, `school_classes`, fältursprung och append-only-historik. Kund-/huvudmannycklar och sammansatta relationer hindrar koppling över fel skola eller utbildning; överlappande perioder avvisas i databasen. `offerings.start_year` härleds endast från etablerad gymnasieetikett, aldrig genom gissning av annan fritext. Klassbyte ändrar inte utbildning automatiskt. Baslinjeprovet kontrollerar också gymnasieutbildning, kurs-/nivåtillägg, kullkopiering och explicita klass–timplanskopplingar i ett separat disponibelt mål.

`pupil_field_history` är verksamhetshistorik: fält, tillåtna före-/eftervärden, ursprung, aktör, tid, revision och eventuellt avvikelsebeslut. `security_events` är en separat append-only-säkerhetslogg med minimerade referenser för läsning, nekande, visning, ändring och export; den innehåller inte råa elevvärden. Obligatorisk loggning sker inom svarens och skrivningarnas transaktionsgräns. Loggfel stoppar både svar och skrivning. CSV buffras i minnet och lämnas först efter committad händelse; ingen elevfil skrivs till disk av exportvägen.

Migration `20260929110000_phase4_register_migrate_probe.sql` förde tidigare syntetiska prov-ID och relationer till registret och band om elev-, grupp- och ärendemandat. `20260930100000_phase4_retire_probe.sql` kontrollerar att provraderna återfinns och att okända beroenden saknas innan de gamla elev-/grupp-/medlemstabellerna och `phase3_read_pupils` tas bort. `/api/prov`, `/api/prov/elev` och `/api/prov/export` finns inte i den byggda skyddade Workern och ger 404. Gamla `phase3_probe_cases`, de registerpekande mandatkopplingarna och historiska `security_events` behålls; loggens äldre objekttyper är därför väntade och skrivs inte om.

## Syntetiska identiteter

Endast exakt `TEST-YYYYMMDD-NNNK` accepteras. Kalenderdatumet måste vara giltigt och kontrollsiffran K beräknas med Luhn över `YYMMDDNNNK` (de tio sista sifferpositionerna). Prefixet gör strängen tydligt fiktiv; vanliga 10/12-siffriga personnummer avvisas även om kontrollsiffran stämmer. Både klient och SQL använder en stängd allowlist via `synthetic_pupil_numbers`. Modellens validator tar listan uttryckligen och misslyckas stängt om värdet saknas. Den lokala listan är begränsad och är inte en generell importlösning. Klientkontroll ersätter aldrig SQL-kontroll. `CreatePupilRequest` finns som typ och parser, men ingen skapvy eller skap-API-väg är öppnad.

## Krav och aktuella bevis

Fasgrinden `cd web && npm run verify:phase4` skriver `work/pilot/results/phase4-summary.json` med `kind: phase4-summary`, provad revision och källfingeravtryck. Den fulla SQL-rapporten måste innehålla **alla sju** aktuella fas 4-filer: `phase4_register`, `phase4_periods`, `phase4_protected`, `phase4_conflicts`, `phase4_export`, `phase4_selection` och `phase4_retire` (alla med suffix `.test.sql`), plus övriga SQL-regressioner. API-rapporten måste innehålla alla 18 namngivna fall från `verify-register.mjs`. De tre färska webbläsarrapporterna i `web/test-results/phase4-gate-*.json` måste tillsammans innehålla alla 13 fall i `phase4-register.spec.ts` i vart och ett av projekten `protected-desktop`, `protected-phone` och `protected-built`, utan hopp; varje projekt får en ny lokal förhandsvisning och återställd syntetisk fixtur. Saknad provmiljö eller bevis är `BLOCKED`, inte `PASS`; ett riktat delurval uppfyller aldrig fullgrinden. Övriga gitignorerade detaljrapporter ligger under `work/pilot/results/`; grinden kontrollerar att de hör till samma aktuella revision och målprofil.

| Krav | SQL/modell | API och namngivet fall | Webbläsare och namngivet fall | Rapport |
|---|---|---|---|---|
| **STU-01** stabil elev och omläsning | `phase4_register`, migrering/`phase4_retire` | `register-reload`, `retired-probe` | `namnlika elever hittas igen efter utloggning utan sökord i adress eller lagring` | `phase4-all-sql.json`, `phase4-api.json`, `phase4-summary.json` |
| **STU-02** daterad placering | `phase4_periods`, `phase4_register` | `placement-change`, `historical-readonly` | `elevkort visar perioder, ursprung och historik utan oombedd personnummerläsning`; `avslutad historisk placering kan läsas men inte ändras` | samma fullrapporter |
| **STU-03** klass utan tyst utbildningsbyte | `phase4_periods` | `class-change` | `klass, utbildning och hemkommun får varsin period och ursprung` | samma fullrapporter |
| **STU-04** källansvar och rättelse | `phase4_register`, `phase4_conflicts` | `source-discrepancy`; separat `phase4-simulated-source.mjs` | `lokal rättelse möter simulerad källa och båda explicita val loggas` | samma fullrapporter och separat källprov |
| **STU-05** sökning och säkert urval | `phase4_selection`, `phase4_protected`, urvalsmodell | `search-filter`, `register-reload` | `namnlika elever hittas igen efter utloggning utan sökord i adress eller lagring` | samma fullrapporter |
| **STU-06** samtidig ändring | `phase4_conflicts` | `concurrent-edit`; låsfall `different-fields`, `same-field`, `period`, `membership-block`, `protection-revoked`, `pupil-row-lock` | `två administratörer löser fältkonflikt och hämtar om periodkonflikt` | fullrapporter och `phase4-register-locks.json` |
| **DATA-01** skydd utan sidoläckage | `phase4_protected`, `phase4_retire`, fas 3:s mandat-/policyprov | `protected-admin`, `protected-teacher`, `protected-unauthorized`, `protected-direct`, `protected-grant-revoke`, `audit-register-read-fail`, `retired-probe` | `huvudmannens beviljande och återkallelse styr skyddad vy och anonym rad`; `personnummer kräver aktivt val och rensas när elevkortet stängs`; sena 409-svaret | SQL/API/browser samt mandat-, access- och källrapporter |
| **DATA-02** urvalsstyrd loggad export | `phase4_export`, `phase4_protected`, `phase4_retire` | `export-selection`, `export-direct-denied`, `export-personnummer`, `audit-register-write-rollback` | `export kräver uttryckliga val och ger nedladdning samt säkerhetslogg`; `sena exportsvar efter utloggning i annan flik skapar ingen fil eller Blob`; loggfelsfallet | SQL/API/browser samt access- och källrapporter |

Gemensam skyddsregression omfattar portade `verify-mandates` och `verify-access` samt direkta och återhämtningsbaserade källnekanden. `verify-baseline-db.mjs` kontrollerar gymnasiets utbildning, kurs-/nivåtillägg, kullkopiering och klass–timplan **endast** mot det separata disponibla `baseline`-målet. Dess gamla anonyma demoinloggning får aldrig användas mot `protected` eller verkliga elever.

## Verifieringsstatus och öppna frågor

Kodens funktion är implementerad. Den samlade grinden **PASS** 2026-09-29 på revision `e5d7a61b9866d56e22101dc10c01841c84e00e90` med oförändrat källfingeravtryck: 395 modell-/serverprov, 29 grind-/registerprov, 17 SQL-filer, fyra baslinjeflöden, åtkomst 16/16, mandat 26/26, register-API 18/18, sex låsfall, källbaserade nekandebevis och webbläsare 39/39 utan hopp. Alla åtta krav fick syntetiskt automatbevis i `phase4-summary.json`. Rapporten är lokal och gitignorerad; en senare kodändring kräver ny körning. Den automatiska grinden är inte mänsklig acceptans. WebKit-enhetsläge vid 390/320 px är inte prov på fysisk telefon; utvecklingsservern skrev modulimportvarningar utan röda användarfall. Mänsklig UAT hör till 04-22; separat `gsd-verify-work` avgör slutlig fas- och kravstatus efter återstående planer. Kraven i `.planning/REQUIREMENTS.md` står därför fortfarande som väntande.

Verklig pilot kräver separat beslutat källansvar och kontrakt för kommun-/elevregisterleverantör, fullständiga nummer- och kommunreferenser, faktisk skydds- och behörighetsorganisation, drift/återställning, personuppgiftsrutiner och godkända anslutningsprov i avsedd miljö. Ingen simulerad källleverans, lokal SQL-svit eller skyddad Worker i testmiljön visar att en verklig kommun är ansluten.
