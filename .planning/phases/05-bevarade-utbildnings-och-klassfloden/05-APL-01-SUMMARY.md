---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-01
subsystem: apl-domain
status: implemented_model_verified
completed: 2026-10-16
requires: [05-APL-CONTEXT, 05-APL-CONTRACT]
provides: [structured_v1-types, strict-apl-parsers, gut-minute-domain, canonical-content-hash, sql-handoff]
affects: [05-APL-02, 05-APL-03, 05-APL-04, 05-APL-04A, 05-APL-05, 05-APL-07]
key-files:
  created: [web/lib/apl-plan.ts, web/lib/apl-plan.test.mjs]
  modified: []
tech-stack:
  added: []
  patterns: [pure-domain, strict-closed-contracts, integer-gut-minutes, portable-utf8-hash]
---

# APL-01 – ren modell och fryst kontrakt för SQL, server och UI

`structured_v1` skiljer uttrycklig utbildningsform, planerad omfattning, innehåll och inkluderad APL-tid. Den rena modellen räknar heltalsminuter utan att ändra timplanens befintliga totaltimmar. Den har ingen databas-, UI- eller närvarofunktion.

## Genomfört och kontrollerat

Båda uppgifterna är genomförda. Första RED körde 26 beteendeprov med **0 PASS/26 FAIL**, uttryckligen på saknade domänfunktioner, inte import-/syntaxfel. Samordnaren versionshanterade RED i `48a950a`. Privat första rapport: `/private/tmp/apl-01-red-20261016.tap`.

Slutlig körning från `web/`:

```text
node --test lib/apl-plan.test.mjs lib/gym-timplan.test.mjs lib/programplan-profile.test.mjs lib/planning-year-model.test.mjs lib/programplan-terms.test.mjs
62 PASS, 0 FAIL, 0 skipped (30 nya APL-prov + 32 befintliga regressionsprov)
npx tsc --noEmit: exit 0
npx oxlint lib/apl-plan.ts lib/apl-plan.test.mjs: exit 0
```

Rårapporter: `/private/tmp/apl-01-final-20261016.tap`, `/private/tmp/apl-01-tsc-final-20261016.log`, `/private/tmp/apl-01-lint-final-20261016.log`. Första lintkörning hittade oanvänd import och testets `delete` på array; båda rättades. Ingen appbyggnad, serverstart, SQL-migration, Worker-, OIDC- eller browserkörning gjordes i denna plan.

Oberoende granskare körde föregående slutkandidats 29 APL-prov och fyra riktade reproduktioner. Granskaren beräknade dessutom båda hashvektorerna med en separat Pythonimplementation; exakt samma serialisering och SHA-256. Efter det kompletterades modellen med oberoende avvisning av ogiltig aktiv innehålls-/tidsmatris även när svarshashen stämmer; slutsviten ovan innehåller detta. Faktisk SQL-paritet återstår i APL-07.

## Verksamhetsregler och bevarande

- 15 granskade hela veckor ger 20 700 GUT-minuter, som är **varav** befintlig total. 14 veckor blockerar bekräftelse. Fem veckor kan fördelas 6 000 + 900 minuter; en vecka 690 + 690 minuter. Koppling till två ämnen dubblar inte perioden.
- `null` APL-plan är äldre/ej strukturerat och betyder inte noll APL. Tom strukturerad plan har noll allokerade minuter men är ofullständig. `classification:'unreviewed'`, bristande fördelning eller osäker omfattning ger ingen härledd skoltid.
- Endast explicit `school_based`, stödd nationell Gy25-yrkesprofil, verifierad fryst källa och nuvarande startgränser får `gy25_school_vocational_v1`. Gy25 före 2025-07-01 och yrkesprovgränsen från 2028-07-02 behåller spärrar. Programdatum och återkallad giltighet beaktas. `sourceSupported` härleds av servern från den verifierade frysta katalogen/källans befintliga kontroller; det är aldrig ett klientfält i kommandot.
- `apprenticeship`, `unknown`, del-/blandveckor och osäker omfattning kan sparas som utkast utan automatisk GUT- eller uppfyllelseberäkning.
- Innehåll utan färdig tidsallokering får sparas. Varje aktiv innehållsnyckel måste tillhöra fryst källa. Kända valblock, alternativ och `meta:*` kan bära utkastinnehåll men räknas inte som verifierad ämnesnivå. En allokering kräver kopplat innehåll, aktiv termin, icke-null heltalstotal och samlad APL-andel högst total × 60. Samma validator ska användas efter föreslagen radtimminskning.
- Datum räknar inte ut hela veckor. Per period gäller endast nödvändig övre gräns: antal olika ISO-veckor som intervallet berör. Samma ISO-vecka kan inte användas för flera uppgivna hela veckor inom gruppen; se kapacitetskontrollen nedan. Rektors uttryckliga granskning krävs ändå.
- Sex terminsintervall och vårstartens varning kommer från `projectGymTimplanYear`. `spring_start_review` är en synlig granskningsvarning och ingen permanent spärr. Datum före faktisk utbildningsstart och allocation i termin utanför periodens datum blockerar. En period får korsa termin/läsår med uttrycklig minutuppdelning. `schoolYear` är läsåret för periodens första datum.
- Hashen gäller innehåll, inte administration. Submit/approve, plan-/källrevision och seriens benämning gör inte i sig rektorshändelsen inaktuell. Relevant ändring av period, innehåll, tid, fryst källa, skola, serie eller kopieringsgranskning ändrar hash. Historiska händelser muteras inte.
- Inga klasskopplingar, medlemmar, elever, källor eller gamla kvitton skrivs av modellen. SS 12000:2024 utgåva 4/OpenAPI 2.1.0 beaktas genom stabila interna identiteter och separat APL-objekt; ingen export eller verklig anslutning är verifierad. APL blir aldrig automatiskt standardens Placement eller Attendance.

## Frysta publika typer och transportformer

De exporterade TypeScript-typerna i `web/lib/apl-plan.ts` är exakt kontrakt. Alla fält är obligatoriska, även nullable/empty list. Extra fält, getter/setter, symboler, främmande prototyper, glesa listor och dubbletter avvisas. UUID normaliseras till gemener. `AplContractError.code` är `invalid_apl_plan`; avgränsade verksamhetsorsaker finns i `reason`.

```text
AplPlan = {
  contractVersion: 'structured_v1',
  educationForm: 'school_based' | 'apprenticeship' | 'unknown',
  classification: 'unreviewed' | 'complete',
  periods: AplPeriod[]
}
AplPeriod = {
  id, name, startsOn: date|null, endsOn: date|null, schoolYear: integer|null,
  extent: {basis:'whole_weeks'|'mixed_weeks'|'unknown', weeks:integer|null, reviewed:boolean, reviewNote},
  contents:[{rowKey,description}], allocations:[{rowKey,termIndex,gutMinutes}]
}
ReadRequest = {planId}
SaveCommand = {
  contractVersion:'structured_v1', action:'save', commandId, planId, expectedRevision,
  plan:AplPlan, copyReviewResolutions:[{id,note}]
}
ConfirmCommand = {
  contractVersion:'structured_v1', action:'confirm', commandId, planId, expectedRevision,
  expectedContentHash, comment
}
ReadReply = {
  contractVersion:'structured_v1', planId, revision, organizerId, program:AplProgram,
  plan:AplPlan|null, copyReview:AplCopyReview[],
  contentHash, confirmations:AplConfirmation[], capabilities:{canSave:boolean,canConfirm:boolean}
}
AplConfirmation = {
  id, planId, unitId, actorId, assignmentId, actorName, at, revision, contentHash, comment
}
Receipt = {
  contractVersion:'structured_v1', commandId, planId, action:'save'|'confirm', revision,
  changed:boolean, replayed:boolean, contentHash, confirmationId:UUID|null
}
CommandReply = {receipt:Receipt, detail:ReadReply}
StatusRequest = {command:SaveCommand|ConfirmCommand}
StatusReply = {state:'not_found',result:null} | {state:'completed',result:CommandReply}
```

`StatusReply.completed` måste ha `receipt.replayed:true`. Status kräver hela kommandot, inte bara request-ID. `AplProgram` har exakt `code, version, category, startDate, endDate, canceledDate, sourceSupported`. Läsvarets `program` och `organizerId` verifieras mot fryst serverbasis; UI kan därmed bygga `AplContext` tillsammans med befintlig `GymTimplan` och `copyReview` utan att gissa programprofil. Aktör/uppdrag kommer uteslutande från den autentiserade serverkontexten. Kapabiliteter är serverbevisad befogenhet, inte påstående att underlaget är komplett. Klienten kombinerar dem med modellens brister och pågående-/osparat-skydd; DB måste själv kontrollera verklig rektor och komplett underlag.

Sparsvaret får inte innehålla ny rektorshändelse med revision högre än kommandots `expectedRevision`. Confirm-svaret måste ha ny senast ordnad händelse med rätt kvitto-ID, revision, kommentar och innehållshash. Rektorshändelser ordnas stigande på unik revision. Planens revision kan därefter öka av administrativa beslut utan att gammalt fryst kvitto skrivs om.

Gränser: högst 100 perioder, 200 innehållskopplingar och 1 200 allokeringar per period, sammanlagt 20 000 allokeringar; högst 160 uppgivna hela veckor per period, terminsindex 0–5, 0–120 000 minuter per allocation. Totalceller behåller befintligt 0–2 000 heltalstimmar/null. Namn högst 120 Unicodekodpunkter, lokala beskrivningar/noteringar 2 000, aktörsnamn 200. Text är redan trimmad och saknar kontroll-/format-/surrogattecken. Årtal 2000–2100 eller null; giltiga ISO-datum eller null. Tidpunkter är exakt UTC med millisekunder, `YYYY-MM-DDTHH:mm:ss.sssZ`. Revision är SQL int, kommandoexpected högst 2147483646.

`extent.basis !== 'whole_weeks'` kräver `weeks:null` och `reviewed:false`. Ogranskat helt veckounderlag får ha `weeks:null`; granskad omfattning kräver positivt helt veckotal och icke-tom granskningsnotering. Bekräftelsekommentaren är icke-tom. Ofullständiga periodnamn/datum/innehåll kan sparas men blockerar full granskning.

## Kopieringsgranskning: inget bortfall och ingen permanent blockerare

Plan APL-03 behöver bevara det som inte kan kopieras till aktiva rader/terminer. Detta konkretiseras i **serverägd** lista, som finns i läskontext/svar men aldrig i användarens ersättningsplan:

```text
AplCopyReview = {
  id, sourcePlanId, sourceVersion, sourcePeriodId, sourcePeriodName,
  reason:'missing_row'|'inactive_term'|'insufficient_total'|'unverified_source',
  contents:[{rowKey,description}], allocations:[{rowKey,termIndex,gutMinutes}],
  resolution:null|{actorId,assignmentId,at,note}
}
AplContext = {organizerId, plan:GymTimplan, program:AplProgram, copyReview:AplCopyReview[]}
```

Varje förlustpost bevarar ursprungliga minuter och innehåll även om radnyckeln saknas i nya källan. Den räknas inte som aktiv ny allokering och kan aldrig tvinga in en ogiltig matris. Ohanterad post blockerar bekräftelse. Användaren rättar aktiva perioder/tider och skickar uttryckliga `{id,note}`; SQL kontrollerar under låset att posterna finns på exakt plan och är ohanterade, skriver serverns aktör/uppdrag/tid och bevarar hela ursprungsposten. Redan hanterade/okända/dubbla ID:n eller tom notering nekas. Ingen möjlighet att skicka eller radera förlusthistoriken finns i `SaveCommand`.

En resolution är en verklig innehållsändring även när `AplPlan` i övrigt är identisk. Noteringen är inte en override av brister: felaktig periodsumma, för liten total eller otillräckligt veckotal blockerar fortfarande. Högst 1 000 granskningsposter/resolutions. Nya versioner/namngivna kopior får nya period-/gransknings-ID:n, inga gamla rektorsbeslut och inga överförda resolutioner. Nya kopieringsbortfall och tidigare **ohanterade** bortfall bevaras som ohanterade poster; redan hanterad historik finns kvar oförändrad i ursprungsplanen.

## Fryst privat SQL-envelope och historisk replay

Publika svar innehåller inte hela katalogen. För att servern ska kunna kontrollera ett historiskt kvitto mot ursprungliga timmar/källor måste SQL spara mer än publika svaret:

```text
{
  contractVersion:'apl_sql_v1',
  basis: null | {
    organizerId,
    gymTimplan: <hela raw-svaret från phase5_read_gym_timplan>,
    copyReview:AplCopyReview[]
  },
  result: ReadReply | CommandReply | StatusReply
}
```

Raw `gymTimplan` har exakt fälten `id, offeringId, unitId, schoolName, version, revision, status, source, catalog, currentSource, currentSourceBasis, hours, canPlan, archived, series, nameAtCreation`. Det inkluderar hela frysta programkällan, katalogartefakten och timmatrisen, inte klientprojektionens `rows`. Spara denna basis **i samma transaktion efter kommandots ändring** tillsammans med fulla svaret. Endast `StatusReply.not_found` har `basis:null` och omvänt. `parseAplSqlEnvelope` validerar endast ytterformen; operationens verifierare väljs av serverkod, aldrig ett klientstyrt legacyfält.

APL-04 måste köra befintlig `projectGymTimplan` mot denna frysta raw-basis, härleda exakt `AplProgram` ur verifierad katalog och programreferens, och sedan `verifyAplReadReply` mot den erhållna `AplContext`. Funktionen kontrollerar aktiva innehålls-/allokeringsinvarianter, exakt revision/skola, hash och kopieringsgranskning. En rätt hash gör inte en omöjlig sparad matris acceptabel. Vanlig shape-parser ensam är **inte** detta verifieringsbevis. Replay får aldrig hämta dagens timmatris/källunderlag som ersättning för fryst basis. Mandat kontrolleras däremot på nytt innan varje läsning/replay.

## Exakt kanonisk payload och SHA-256

`aplContentHashPayload` returnerar följande positionsbestämda arrayer; inga objekt finns i payload:

```text
[
 'apl_content_v1',
 [organizerId,unitId,offeringId,planId,seriesId,planVersion],
 [sourcePlanId,sourceVersion,catalogId,startedOn,programCode,orientationCode,
  programVersion,programCategory,programStartDate,programEndDate,programCanceledDate,sourceSupported],
 [[rowKey,points,part,rowKind,[six pointTerms],[six hours/null]], ...],
 null | ['structured_v1',educationForm,classification,
   [[periodId,name,startsOn,endsOn,schoolYear,[basis,weeks,reviewed,reviewNote],
     [[rowKey,description],...],[[rowKey,termIndex,gutMinutes],...]],...]],
 [[copyReviewId,sourcePlanId,sourceVersion,sourcePeriodId,sourcePeriodName,reason,
   [[rowKey,description],...],[[rowKey,termIndex,gutMinutes],...],
   null|[resolutionActorId,resolutionAssignmentId,resolutionAt,resolutionNote]],...]
]
```

Rader/innehåll sorteras på UTF-8-byteordning för rowKey, perioder/granskningsposter på normaliserat UUID, allokeringar på rowKey följt av numeriskt terminsindex. PostgreSQL använder motsvarande `COLLATE "C"`. Varken klientens inmatningsordning eller JSON-objektens nyckelordning påverkar resultatet. Ingen Unicode-NFC-normalisering eller godtycklig trimning sker vid hashing. Plan-/serie-/skol-/utbildnings-/radvisningsnamn, status och administrativa revisioner exkluderas. Periodnamn och lokala arbetsmomentsbeskrivningar är däremot granskat innehåll och ingår.

Serialisering innan UTF-8 SHA-256:

| Typ | Serialisering |
| --- | --- |
| null | `n` |
| true/false | `t` respektive `f` |
| heltal | `i` + decimal heltalsrepresentation + `;` |
| sträng | `s` + antal UTF-8-byte + `:` + oförändrad sträng |
| array | `a` + elementantal + `:` + varje elements serialisering sammanfogad utan extra avskiljare |

Stränglängd här är **octet_length**, inte char_length/JavaScript length. SQL får inte använda `jsonb::text` som hashinput: dess blanksteg/escaping är ett annat protokoll. Output är `sha256:` + 64 gemena hextecken.

Fryst liten vektor:

```text
payload = ["APL-å",23,null,true,false,["é",690]]
serialized = a6:s6:APL-åi23;ntfa2:s2:éi690;
SHA = sha256:b54eabd4a0ee5d100187de548a9cde8fa8402391e02ef338914515e14a62230c
```

Full vektor använder `aplTestContext()` och `aplTestPlan()` i testfilen:
`sha256:712b6f8b5c78706128cda90bcb56d3d5c9fa11329d38f5073f3c9d574a371907`.
Båda förväntade hashvärdena är inlåsta i tester. Kompletta payload/serialized/hash finns även i privat handoff `/private/tmp/apl-01-sql-hash-vectors.json`. APL-07 ska bevisa samma vektorer i faktisk SQL, inte bara återanvända TypeScriptresultatet.

## Kapacitetsgräns för uppgivna hela veckor

Förutom datumöverlapp och varje periods egen ISO-övre gräns gör modellen en **nödvändig kapacitetskontroll**, inte en fullveckoberäkning. Beräkna ISO-måndagsindex för varje komplett intervall med `basis:whole_weeks` och veckotal. Sortera på sista ISO-veckan, sedan första. För varje intervall reserveras så många ännu lediga veckonycklar som det uttryckligen uppgivna veckotalet, med tidigast lediga nyckel först. Om intervallet saknar tillräckligt många lediga nycklar blockeras underlaget. Ingen kalenderlängd blir automatiskt uppgiven/granskad omfattning.

Detta fångar både 15 enskilda datum i tre veckor och två korta separata perioder i samma vecka även om en tredje period har stor datumrymd. Enbart total union eller min–max-spann missar det senare. Delade kantveckor kan fortfarande godtas när det finns tillräckligt många olika veckor. Algoritmens arbete begränsas av period-/veckotalsgränserna, inte datumavståndet; SQL bör använda samma princip.

## Revision, audit, no-op och replay

| Situation | Planrevision | Obligatorisk händelse/audit |
| --- | --- | --- |
| Save ändrar plan eller hanterar minst en pending copyReview | +1 exakt en gång | `apl_plan_saved`; requestbundet kvitto |
| Save är semantiskt oförändrat, även vid omordnade listor | oförändrad | `apl_plan_unchanged`; requestbundet kvitto |
| Ny giltig confirm | +1 exakt en gång | ny oföränderlig rektorshändelse + `apl_placement_confirmed`; kvitto |
| Exakt replay efter nytt mandatbevis | oförändrad | ingen ny mutation, rektorshändelse eller kommandoaudit; samma frysta resultat med `replayed:true` |

No-op är fortfarande ett CAS-skyddat kommando under samma timplanslås. Auditfel ska rulla tillbaka även kvittot. Requestidentitet binds av DB till aktör, uppdrag, plan, request-ID och exakt normaliserat kommando; semantisk lika plan med annan requestpayload är inte samma replay. Ny confirm av samma innehåll med nytt request-ID är en ny uttrycklig ansvarshändelse; den byter inte själva innehållshashen. SQL får inte härleda rektorsmandat från `canPlan`.

## Avvikelser och nästa beroende

Granskningen hittade och rättade tre riktiga modellbrister före leverans: kalenderkapacitet kunde dubbelräknas i korta separata perioder; äldre `meta:individualChoice` kunde passera som ämnesnivå; save-svar kunde smuggla in en ny bekräftelse. Dessutom preciserades kopieringsbortfall och fryst SQL-basis för att APL-03/04 ska kunna bevara data och verifiera historisk replay utan ogiltiga aktiva rader. Dessa är säkerhets-/bevarandekompletteringar inom det redan planerade kontraktet, inte nya produktetapper.

Nästa beroende är APL-02, med detta handoff som exakt modellkontrakt. APL1-01–04/06 har rena modell-/kontraktsbevis, men SQL-paritet, riktig auktorisering, atomisk audit, beständighet, faktisk användarupplevelse och lokal leverans är fortfarande öppna. Ingen full fas eller ursprungligt pilotkrav stängs av denna modellplan. Samordnaren äger slutlig commit/push och GSD-status.
