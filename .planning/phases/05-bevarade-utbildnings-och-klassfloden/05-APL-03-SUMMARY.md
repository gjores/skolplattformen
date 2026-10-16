---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-03
subsystem: apl-decisions-copying
status: complete
requires: [APL-01, APL-02]
provides: [versioned-decision-envelope, immutable-decision-sidecar, apl-decision-readiness, explicit-apl-structure-copy]
affects: [APL-04A, APL-05, APL-07]
key-files:
  created: [supabase/migrations/20261016121000_apl_plan_decisions.sql, work/pilot/verify-apl-plan-decisions.mjs]
  modified: []
---

# APL-03 – beslut, historiska kvitton och uttrycklig kopiering

Produkt-SQL och den faktiska isolerade verifieringen är klara: 33 kontroller och tre samtidighetsfall PASS. Ingen aktiv databas, användarens 3012 eller tidigare migrationsfil har ändrats av produktarbetet. Inga nya Workergrants införs. Migrationen behöver levereras tillsammans med APL-04A:s versionsmedvetna server, inte ensam till den äldre Worker-versionen.

## Produktförändring

Beslutsunderlaget för en nationell yrkestimplan innehåller strukturerad APL-planering, aktuella brister och koppling till rektors senaste innehållsbundna bekräftelse. Ny submit/approve kräver både de tidigare program-/timkontrollerna och APL-underlaget. `apl.ready` betyder komplett APL-planering med aktuell rektorsbekräftelse; det ersätter inte de övriga beslutsblockerarna. Programplanens APL-checklista och högskoleförberedande timplaners kontroller består. Endast huvudmannen får fastställa.

Äldre utkast och återsända yrkestimplaner behöver kompletteras före nytt inskickande. Ett redan inskickat äldre ärende kan fortfarande återsändas eller återkallas utan APL-underlag. Godkända/ersatta äldre planer får inga nya övergripande kompletteringsblockerare eller nya inkorgsuppgifter; APL-delen visar fortsatt saknat strukturerat underlag. Installation ändrar ingen status, revision eller historisk rad.

Nya beslutskvitton har privata versions- och underlagsmetadata i `apl_plan_decision_receipts`. Befintliga `plan_decision_receipts.result`, request, hash och historik skrivs aldrig om. Samma gamla kommando återger exakt sitt lagrade result efter färsk mandatkontroll, utan att lägga till APL, nya checks eller dagens serienamn. Även historiska resultat utan `series` förblir exakt lika. Ett nytt versionsmärkt kvitto som saknar sin sidopost avvisas; det får aldrig falla tillbaka till äldre kontrakt.

Beslutens gamla CAS-hash och seriebindning behålls och binds för yrkestimplan dessutom till APL-innehållshash och aktuell rektorshändelses ID. Aktörsberoende kapabiliteter ingår inte i detta tillägg. Submit/approve höjer fortfarande administrativa revisioner men ändrar inte rektors innehållshash. Den senaste rektorshändelsen räknas som aktuell endast om dess hash matchar aktuellt innehåll; en senare innehållsändring ger ett uttryckligt krav på ny granskning.

Inkorgens `task` beskriver vem som kan agera. Ett inskickat ärende förblir därför `review` för huvudmannen även om APL kräver komplettering, så återsändning går att hitta. Separat `item.apl.ready`/`blockers` hindrar att review felaktigt visas som godkännandeklart. Befintliga count-, filter-, paginerings- och namnsökningsregler återanvänder samma items; inga godkända/ersatta planer läggs in i denna arbetslista.

## Fryst transportkontrakt till APL-04A

`phase5_plan_decision_detail(kind,id)` är en privat underlagsfunktion och returnerar följande **exakta raw keys** för nya läsningar:

```text
contractVersion, apl, series, kind, planId, offeringId, unitId,
educationName, schoolName, version, stage, nextActor,
revision, decisionRevision, basisHash, actions, blockers, checks, history,
sourceInfo, source, catalog, hours
```

`contractVersion` är alltid `apl_decision_v1`. Alla tidigare fält och nullable-värden behåller sin betydelse. `source`, `catalog` och `hours` är samma raw-underlag som tidigare för serverns oberoende projektion. `apl` är null för programplaner och andra timplansprofiler. För yrkestimplan är det exakt:

```text
{
 detail: AplReadReply,
 blockers: string[],
 currentConfirmationId: UUID|null,
 ready: boolean
}
```

`detail` är hela APL-01/02:s strikta lässvar, även när `detail.plan` är null. Den senare situationen är äldre/ej strukturerat underlag, inte noll APL. `blockers` är SQL:s `phase5_apl_confirmation_blockers` plus ett meddelande om senaste rektorshändelse saknas eller har annan innehållshash. `ready` är sant exakt när denna lista är tom. `currentConfirmationId` är den sista händelsens ID om dess innehållshash stämmer, annars null. Händelsen behöver inte ha samma revision som dagens timplan, eftersom administrativa beslut inte ändrar det bekräftade innehållet. Historiska händelser är skrivskyddade och uppstod genom verkligt rektorsmandat; senare utgång av mandatet skriver inte om själva ansvarshändelsen.

`phase5_plan_decision_basis(kind,id)` och `phase5_plan_decision_command(input)` returnerar ett privat SQL-envelope:

```text
{
 contractVersion: 'apl_decision_sql_v1',
 resultContract: 'legacy'|'apl_decision_v1',
 replayed: boolean,
 result: <exakt raw decision detail>,
 aplBasis: null|AplFrozenBasis
}
```

`AplFrozenBasis` är exakt APL-01/02:s `{organizerId,gymTimplan,copyReview}` med hela raw-katalogen/källan/timmatrisen. Nya läsningar och kommandon använder `resultContract:'apl_decision_v1'`. `aplBasis` är icke-null exakt när `result.apl` är icke-null; programplan/övrig profil har null. Basis-läsning har `replayed:false`. Nytt kommando sparar result och fryst basis i samma transaktion som status, historik och obligatorisk audit.

Kommandoåterhämtning efter aktuell mandatkontroll sker före dagens CAS/checks/blockers. Med sidopost återges det nya frysta result/basis med `replayed:true`. Utan sidopost tillåts **endast** ett äldre result som saknar både `contractVersion` och `apl`; svaret har då `resultContract:'legacy'`, `aplBasis:null`, `replayed:true`. Ett saknat/felaktigt fält i ett nytt svar är ett verifieringsfel, aldrig klientvald legacy-dispatch. Varje ny receipt-insert kräver dessutom `apl_decision_v1` genom trigger; gamla rader berörs inte. Ingen separat beslutsstatus-RPC införs.

Beslutad transportkonkretion för APL-04A: efter betrott SQL-envelope och verifierad legacy-dispatch märker servern sin **publika projektion** med `contractVersion:'legacy'`. Inga APL-fält, nya checks eller dagens serienamn läggs till i den projektionen. Nya publika detaljer kräver `contractVersion:'apl_decision_v1'` och obligatoriskt `apl`. Omärkta nya HTTP-svar får ingen fallback. Byteidentiskt bevarande avser DB-kvittot och det privata råa `result`, inte föregångarens hela offentliga HTTP-payload, eftersom det offentliga svaret får uttrycklig transportmetadata. Detta implementeras och verifieras i APL-04A.

APL-04A ska oberoende projicera den frysta timplanen/katalogen, verifiera `AplReadReply`, beräkna APL-blockerare och kontrollera händelsebindningen innan commit. Även raw decision `source`/`catalog`/`hours` måste bindas till exakt samma snapshot som `aplBasis.gymTimplan`; två var för sig giltiga underlag räcker inte. Legacy-verifieraren ska kontrollera det lagrade äldre svaret enligt dess kontrakt utan dagens APL-krav. Äldre resultat kan sakna både `series` och historikens `nameAtDecision`. Ny command-request har fortfarande exakt befintliga fält; klienten får inget kontraktsversionsfält för att välja kontrollnivå.

Råa APL-blockerlistor behåller per-period-/per-allokeringsordning och kan därför innehålla samma text flera gånger. Stora giltiga utkast kan också överskrida den äldre decisionparserns gräns 100 blockerare. APL-04A behöver en avgränsad gräns härledd från APL-kontraktets period-/relationsgränser och stöd för råa dubbletter. Jämför den verifierade råa listan först; eventuell deduplicering är en senare presentationsåtgärd. Detta är inte tillstånd att acceptera godtyckliga saknade eller extra blockerare.

Varje nytt item från items/inbox/page har tidigare itemfält inklusive `series` och dessutom obligatoriskt:

```text
apl: null | {
 state: 'legacy'|'structured_v1',
 ready: boolean,
 blockers: string[]
}
```

`state` kommer enbart från `detail.plan === null`; `ready`/`blockers` är samma APL-del som i detaljen. De yttre inbox/page-formerna och task-enumerationerna ändras inte. `decisionCount` räknar fortfarande granskningsärenden, inklusive sådana som kan återsändas men inte fastställas.

För relevant yrkestimplan blir beslutshashen SHA-256 av APL:s portabla kanoniska serialisering av:

```text
['apl_decision_v1', tidigareBeslutsHashMedSerie, apl.detail.contentHash, currentConfirmationId]
```

Detta är separat från rektors innehållshash. Den tidigare beslutshashen innehåller fortfarande revision/status för CAS. Nya programplans- och övriga timplanshashar behåller föregående beräkning.

## Båda kopieringsvägarna

`phase5_named_timplan_copy_rows(target_plan,source_basis,copy_plan)` har samma timkopiering och carriedRows/resetRows som tidigare, med en enda extra hook efter hela målmatrisen: `phase5_apl_copy_structure(copy_plan,target_plan)`. Därmed omfattas både namngiven uttrycklig kopia och ny version via `phase5_create_gym_timplan`. Skaparna behåller revision 0 och sina befintliga reply-/receiptformer.

Helpern kräver samma skola/utbildning, aktuellt skolmandat, låsta käll-/målplaner och ett nytt tomt utkast före skaparnas händelse/kvitto. Källa kan redan ha blivit ersatt av versionshandlingen. Ett avgränsat transaktions-/backend-/målplansbundet permit tillåter bara initieringen. Kopiering utan källa eller från legacy APL initierar inget APL-underlag.

Strukturerad kopia får nya period-ID:n, `classification:'unreviewed'`, ogranskad omfattning och tom granskningsnotering. Datum, uppgivna veckor, utbildningsform och arbetsmomentsbeskrivningar bevaras som underlag. Inga rektorshändelser, huvudmannabeslut eller gamla resolutioner kopieras. Giltiga aktiva relationer följer med endast när faktisk ny terminstotal är sparad och tillräcklig.

Förlorade innehålls- och tidskopplingar grupperas per ursprungsperiod och orsak i serverägda pending copyReview-poster med egna ID:n. Saknad rad, inaktiv termin, otillräcklig/ofördelad total och overifierad källa behålls uttryckligt. Cellens hela samlade APL-andel bedöms tillsammans: om den inte ryms flyttas samtliga berörda allokeringar till granskning, utan godtyckligt val utifrån periodordning. Tidigare ohanterade förlustposter följer med som nya ohanterade poster med bevarat ursprung; hanterad historik ligger kvar i originalet. Gränsen 1 000 poster kontrolleras före målskrivning. APL-02:s parser och allokeringsvalidator kontrollerar den färdiga målplanen.

En faktisk strukturerad kopia skriver obligatorisk audit `apl_plan_copied` med källplanens ID, inom samma skaptransaktion. Auditfel rullar tillbaka skapandet. Ingen extra planrevision införs. Originalets timmar, klass-/läsårslänkar och andra seriers status förändras inte av APL-hooken. Den skyddade kullkopieringen av programplaner ändras inte.

## Produktgranskning och verifieringsgräns

Avgränsad diffkontroll passerar. Medhjälparens statiska jämförelse visar att timkopieringsfunktionen är byteidentisk med föregångaren bortsett från `CREATE OR REPLACE` och den enda avslutande hooken. Oberoende läsgranskning fann inga kvarstående säkerhets-/bevarandeblockerare. Den nya innehållsläsningen i inkorgen är begränsad till yrkestimplaner så övriga profilers tidigare snabbgren består. En hittad operatorprecedensrisk i sammanfogningen av APL-blockerare rättades med explicit parentes före andra SQL-körningen; första körningen passerade DDL/bevarande men nådde ett 22023-fel vid legacy submit, medan den rättade körningen passerade detta fall. Faktisk samlad mandat-/beslutsmatris, originalbevarande och samtidighet redovisas av samordnaren nedan; en statisk kontroll ersätter inte dem.

SS 12000:2024 utgåva 4/OpenAPI 2.1.0 beaktas genom bevarade stabila skol-/organisations-/klassidentiteter, versionsbundna timplanslänkar och separat internt APL-underlag. Ingen Placement, närvaro, elevflytt eller extern standardanslutning införs eller verifieras. HTTP/Worker/OIDC och UI ligger i senare planer.

## Faktisk verifiering

`work/pilot/verify-apl-plan-decisions.mjs --out /private/tmp/apl-decisions-final.json` passerade 2026-10-16: **33 kontroller och tre faktiskt observerade överlapp**. Körningen använde en ägd schema-only-kopia av den lokala skyddade miljön samt repots katalog och syntetiska BF-/SA-fixturer. Ingen verksamhets- eller auth-rad kopierades från originalmiljön; ingen aktiv databas eller server ändrades.

BF-fixturernas legacy draft/returned/submitted/approved/replaced och deras riktiga gamla beslutskvitton skapades före APL-migrationerna. Provet verifierade:

- Migrationens oförändrade originalrader, inklusive timmar, status, revisioner, beslut, kvitton, tidsstämplar och befintliga funktionsrättigheter. Alla nya hjälpfunktioners EXECUTE-rättigheter är stängda för anon/authenticated/service_role/Worker.
- Kompletteringskrav för nytt submit/approve, läsbar approved/replaced-historik utan retroaktiv uppgift, fungerande return/withdraw och exakt legacy-replay efter färsk mandatkontroll. Återkallat faktiskt rektorsmandat nekas även för ett tidigare genomfört kvitto.
- Samma APL-status i detail/items/inbox/page, med bevarad huvudmannauppgift för återsändning, rätt antal och sökning på serienamn.
- Strukturerad APL, faktisk rektorsbekräftelse, submit/approve och oförändrad rektorshash vid rent administrativt beslut. Submitted/approved kan inte redigeras; withdraw → innehållsändring → ny bekräftelse → submit gör ett gammalt approve-payload inaktuellt. Rektor får inte fastställa.
- Nytt kvitto med exakt fryst APL-underlag även efter senare ändring. Decision-underlagets source/catalog/hours jämförs också med samma frysta APL-basis, och den faktiska TypeScript-projektionen verifierar APL-lässvar och hash.
- Två namngivna godkända serier, två klass-/läsårslänkar och godkännande av endast A:s nästa version. B:s kompletta plan-/APL-rader och båda ursprungliga klasslänkarna består.
- Både uttrycklig namedcopy och ny version från godkänd respektive utkastkälla får egna period-ID:n, revision 0 och nytt granskningsbehov utan gamla rektorshändelser. Ny plan utan kopieringskälla får inget härlett APL-underlag. Originalets timmar förblir exakta.
- Riktiga programplanskommandon ändrar ett block-ID och två terminsfördelningar. Kopieringen bevarar exakt 20 760 syntetiska bortfallsminuter med ursprungliga rowKey/term/minuter/innehållstexter i `missing_row`, `inactive_term` och `insufficient_total`. Summan inkluderar 60 minuter på en ännu oklassificerad fördjupningsram i ett utkast; den är inte ett godkänt APL-upplägg. Inga ogiltiga aktiva relationer följer med. Olösta poster ärvs med egna ID:n, medan uttrycklig resolution höjer revisionen och löst historik stannar i originalet.
- Obligatoriska auditfel rullar tillbaka beslut, ny serie/kopia och ny version inklusive föregångarens status. SA-timplan och BF-/SA-programplan kan fortsatt skickas och fastställas enligt tidigare kontroller.

Samtidighetsproven använder skilda PostgreSQL-backends och observerar `pg_blocking_pids` innan det hållna kommandot släpps:

| Faktiskt överlapp | Verifierat resultat |
| --- | --- |
| Save före copy | Copy väntar på transactionid-lås och får 40001. Ingen ny plan, serie, klasslänk eller kopieringsreceipt återstår. |
| Copy före save | Save väntar på transactionid-lås; båda kommandona lyckas. Kopian innehåller den konsekventa tidigare strukturen, medan den senare sparningen ändrar källutkastet. |
| Approve före APL-save med ändrad innehållstext | Sparförsöket väntar på advisory-lås och får 42501 efter godkännandet. Inget APL-kvitto skapas. Detta bevisar statuslåset vid verkligt överlapp; en redan submitted plan är även före approve låst för innehållsredigering. |

Alla 65 ursprungliga public-tabellers kompletta radfingeravtryck och schema/ACL återställdes efter rollback. Efter de separat committade samtidighetsproven återfanns samtliga **495 ursprungliga syntetiska rader exakt**, inklusive gamla kvitton och tidsstämplar. Det installerade testschemat förblev oförändrat under proven. Alla **68 källhashar** var oförändrade från start till slut, och den ägda testdatabasens cleanup slutfördes. `node --check`, oxlint och avgränsad `git diff --check` passerade utan varning.

Tidigare försök bevaras som avvikelsehistorik: första körningen passerade DDL/bevarande men nådde 22023 vid legacy submit; produktens blocker-konkatenering parentessattes före nästa körning. Andra och tredje körningarna stoppades av runnerns egna felaktiga antaganden om `class_timplans.organizer_id` respektive `class_timplans.id`; frågorna använder nu verkligt timplan-ID och full JSON-sort. Fjärde körningen passerade 32 kontroller. En separat läsgranskning hittade därefter tre assertionsluckor (exakta bortfallstupler, utebliven förlorarserie och ändrad payload i approve/save). De rättades före slutkörningen ovan.

Verifieringsgränser: flera perioders gemensamma cellkapacitet i själva kopiehelpern, `unverified_source` och gränsen 1 000 granskningsposter har granskats i kod men har inga separata SQL-fall i denna runner. Skyddad kopiering till nästa kull är oförändrad och läsgranskad, men återkördes inte här. APL-02:s direkta timcellsskydd har inte duplicerats i denna matris. HTTP/Worker/OIDC, hela versionsparsern i APL-04A, UI och permanent installation ingår inte i detta PASS.
