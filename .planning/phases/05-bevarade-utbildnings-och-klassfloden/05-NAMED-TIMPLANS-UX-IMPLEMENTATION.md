---
phase: 05-bevarade-utbildnings-och-klassfloden
package: NAMED-TIMPLANS-UX
status: complete_user_reported_acceptance
date: 2026-10-15
gap: CLASS-COHORT-UX-01
requirements: [ADMIN-02, ADMIN-03, ADMIN-04, PLANERING-01, PLANERING-04, PLANERING-05]
---

# Namngivna timplaner och sammanhängande klassflöde

Användarens ”kör på” godkänner [riktningen](05-NAMED-TIMPLANS-UX-CONTEXT.md). Målet är att klasser på samma skola kan använda samma programplan men olika tydligt namngivna timfördelningar, och att användaren förstår skapa, spara, koppla och följa resultat utan chattvägledning. Detta paket hanterar gap CLASS-COHORT-UX-01. Övriga fasgap, tidigare användargodkännanden och historiska 88/100 planer samt 3/8 faser ändras inte automatiskt.

**Aktuellt 2026-10-16:** Alla tolv genomförandeplaner är tekniskt slutförda. Fem migrationer är installerade efter uttryckligt användargodkännande; samma verifierade bygge kör på 3012 med läsande OIDC och bevarandekontroller PASS. [Leveransresultat](05-NAMED-TIMPLANS-UX-12-SUMMARY.md). Användarens ”funkar bra” 2026-10-16 registreras som användarrapporterat godkännande av det levererade flödet; begriplighetsgapet avslutas. Enskilda delsteg och enhet särredovisades inte.

## Avgränsning och genomförandeordning

Discovery är genomförd som riktad kod-/modellinventering av befintlig app; inga nya externa bibliotek eller standardobjekt introduceras. Kodkartan är historisk bakgrund, aktuella migrationsdefinitioner och komponenter nedan är implementationens utgångspunkt. Mockupens automatiska lås vid kullstart och antagandet att fel aldrig blockerar sparning införs inte.

| Plan | Våg | Behöver | Skapar / resultat |
| --- | --- | --- | --- |
| [01](05-NAMED-TIMPLANS-UX-01-PLAN.md) | 1 | Inget nytt kontrakt | Synlig lista över sparade klasser; en självständig presentationsändring. |
| [02](05-NAMED-TIMPLANS-UX-02-PLAN.md) | 1 | Befintligt schema | Additiv stabil serieidentitet, gamla unika begränsningar behålls. |
| [03](05-NAMED-TIMPLANS-UX-03-PLAN.md) | 2 | 02, frysta kommandon nedan | Stängda create-/renamefunktioner, serieavgränsad nästa version. |
| [04](05-NAMED-TIMPLANS-UX-04-PLAN.md) | 3 | 03 | Oberoende beslut och serieunika begränsningar aktiveras tillsammans. |
| [05](05-NAMED-TIMPLANS-UX-05-PLAN.md) | 4 | 04 | Alla namedplan-/klass-/årsprojektioner, inget godtyckligt senastval. |
| [06](05-NAMED-TIMPLANS-UX-06-PLAN.md) | 5 | 05, fryst kontrakt | Rena strikta typer/parsers förbereds parallellt; full plan avslutas efter faktisk SQL-/TSparitet mot05. |
| [07](05-NAMED-TIMPLANS-UX-07-PLAN.md) | 6 | 03,04,05,06 | Skyddad HTTP, exakt grant, faktisk SQL-/TSparitet före aktivering. |
| [08](05-NAMED-TIMPLANS-UX-08-PLAN.md) | 7 | 07,01 | Namn, separat plan/version, sammanhängande navigering och beslut. |
| [09](05-NAMED-TIMPLANS-UX-09-PLAN.md) | 7 | 07 | Flerval med granskad kö, sparbesked och återhämtning per klass. |
| [10](05-NAMED-TIMPLANS-UX-10-PLAN.md) | 8 | 08,09 | Gemensam kontext och årsöverblick med alla planvarianter. |
| [11](05-NAMED-TIMPLANS-UX-11-PLAN.md) | 9 | 10 | Installerad SQL, verklig konkurrens, API/OIDC, dator/telefon. |
| [12](05-NAMED-TIMPLANS-UX-12-PLAN.md) | 10 | 11 | Handbok, exakt lokal artefaktleverans, färdigt begriplighetsprov. |

Endast detta paket körs; äldre fasplaner återstartas inte. Plan01 och02 äger skilda filer; 03 och06 skilda filer; 08 och09 skilda produktkomponenter/testfiler. 06:s rena namn-/kommandodomän kan förberedas direkt eftersom kontraktet nedan är fryst. Att den är färdig innebär inte att 06:s parserintegration eller andra planer är verifierade. Samordnaren hanterar paketstatus, avgränsade commits och push, så parallella agenter inte blandar ändringar.

Varje plan har högst två uppgifter med kontrollbart resultat. 06/07 har flera befintliga konsumenter som måste uppdateras sammanhängande; dela internt per kontraktsfamilj om kontexten kräver det, utan att märka hela planen klar före paritet. Inga parallella mutationer av samma testdatabas/fixtur. Ingen ny användarbekräftelse krävs före det redan beställda genomförandet.

## Frysta modell- och kontraktsval

### Serie, planversion och namn

- `timplan_series` har stabilt UUID, organizer/offering/unit, aktuellt `name`, `normalized_name`, revision, `legacy_default` och registertider. En gammal offering/unit-kedja blir en serie. Alla befintliga timplanversions-ID:n, versionsnummer, celler, beslut, kvitton och klasslänkar består.
- `timplans.series_id` binder versionen till serien. Nullable `name_at_creation` är namnet när en ny version skapas; äldre versioners namn är okänt och får inte fabriceras. Aktuell benämning och historisk benämning märks som olika uppgifter. Nya beslut sparar namn vid beslut append-only; gamla beslut/hashar skrivs inte om.
- Namn är fria verksamhetsnamn, inte identiteter. Normalisering trimmar endast vanliga U+0020 i kanterna. 1–80 Unicodekodpunkter; Unicode Cc/Cf/Cs inklusive ensamma surrogater förbjudna. Ingen NFC eller kollaps av inre blanksteg. SQL `lower(name)` är auktoritet för unikhet inom offering/unit; klienten gissar inte PostgreSQL:s locale. Namnparitet prövas med faktiska Unicodefall.
- En öppen respektive en fastställd version per serie, versionsnummer unikt per serie. Ny separat plan börjar på version1; ny version härleder serie från verifierad predecessor. Samma programplan kan ligga till grund för flera serier. Fastställd timplan behåller fryst programplansunderlag och separat currentSource; inget automatiskt källbyte.
- Alla gamla skolformers kedjor kan få teknisk serieidentitet i backfill. Nya parallella namngivna planer erbjuds endast för stödd gymnasiekedja i detta paket. GR/IM:s beteende och regler utökas inte.
- Mer matematik ändrar endast den valda timplanens timceller. Programramens poäng och andra timplaners timmar består. Befintliga totals-/regel-/terminkontroller och beslutskedja gäller; inga nya rättsliga antaganden hämtas ur mockupen.

### Frysta TypeScript-/JSONformer

`TimplanSeries = { id: uuid, name: string, revision: integer }`. Scope härleds och verifieras från den omgivande planens offering/unit/customer; en serie får inte förekomma i motstridiga skol-/utbildningsscope.

Ny separat plan, POST `/api/timplaner/gym/planer/skapa`:

```text
{ commandId, sourcePlanId, expectedSourceRevision, expectedEducationRevision,
  unitId, name, copyFromPlanId: uuid|null, expectedCopyFromRevision: integer|null }
```

Kopieparet måste vara både null eller båda satta. Kopian är samma offering/unit, egen ny serie/version1 och oförändrat original. Ny version använder befintliga `GymTimplanCreateRequest` och endpoint; `predecessorPlanId` är versionens källa och bestämmer serien. Null-predecessor tillåter endast äldre entydig initial-defaultväg; flera serier kräver explicit planval. Detta är två skilda kommandon, ingen tvetydig modeflagga.

Namnbyte, POST `/api/timplaner/gym/planer/namn`:

```text
{ commandId, planId, seriesId, expectedSeriesRevision, name }
```

Äldre kvitton skrivs aldrig om: gamla endpointen replayar exakt gamla kvittensfält, ny serieinfo läses separat från verifierad plan. Nya endpointen har egna requestbundna kvitton med serieinfo; gamla commandId kan inte bli ny write.

Create reply är befintlig `GymTimplanCreateReply` plus `series`; adapter validerar även full `GymTimplan`. Rename reply är `{planId,series,replayed}`, bundet till request. Alla kommandon får requestbundna kvitton och kontroll av aktuellt mandat även vid replay.

| Läsobjekt | Ny metadata | Integritetskrav |
| --- | --- | --- |
| GymTimplan | `series`, `nameAtCreation: string|null` | series krävs i nya formen, versionsnamn inte samma som aktuellt namn efter rename. |
| GymTimplanSummary | `series` | Unik planID och unik `(series.id,version)`, inte unik version per skola. |
| ClassPlanUnderlag.plan | `series` | Målplanens serie/scope verifieras. |
| ClassPlanUnderlag.classes[].link | `series` | Även annan plan får begripligt namn/version; `linkedClasses` behöver ingen duplication av parentserien. |
| ClassPlanLinkReply | Oförändrad | Exact planId/classId/schoolYear/revision är fortfarande kvittots bindning. |
| PlanDecisionItem / Detail | `series: TimplanSeries|null` | Null vid programplan, objekt vid stödd gymtimplan. Nya detail/history har `nameAtDecision: string|null` per historikhändelse; äldre history får uttrycklig legacyform. |
| PlanningRow | `series: TimplanSeries|null`, `schoolTimplans: PlanningSchoolTimplan[]` | GYtimplan får serie, programplan/legacyGR kan null. schoolTimplans ersätter singular schoolTimplan i nya formen. |
| PlanningSchoolTimplan | `series` | Varje ref innehåller exakt planID/version och frozen source, inga godtyckliga arrayindexval. Flera relevanta versioner inom samma serie tillåts; unikhet gäller planID samt serieID+version, inte en ref per serie. |

Befintliga pureparsers får stödja uttryckligt gamla kända shapes utan metadata och nya strikta shapes med metadata. Frånvarande, null och felaktig serie får inte blandas ihop. Den nya serveradaptern kräver metadata från paketets aktiverade SQL; annars ska transaktionen/läsningen avvisas, så ett glömt projekteringsfält inte döljas av legacygrenen. Nuvarande fixtures kan därmed bevara dokumenterade äldre kontrakt utan att sänka nya produktkrav.

Namnbyte ingår i nytt beslutsunderlags hash med seriens revision/namn. Ett inskickat underlag blir inaktuellt inför beslut om namnet ändras; UI kräver omläsning. Detta ändrar inga tidigare sparade beslut eller deras historiska namn/hashar.

### Flerval är en tydligt redovisad kö

Första leveransen återanvänder befintliga atomiska enklasskommandon seriellt efter en gemensam granskning. Det är inte en allt-eller-inget-batch. Varje klass har ett på förhand genererat commandId och förväntade revisioner, beständig scopebunden journal och status sparad/kvar/konflikt/okänd. Stoppa vid konflikt eller okänt utfall; retry återanvänder exakt request. Redan sparade klasser återställs aldrig automatiskt. Nytt urval eller nya förväntade revisioner kräver ny granskning. Kvitterade men senare ändrade länkar visas som konflikt och skrivs inte tillbaka. En klass har fortsatt en explicit timplansversion per läsår; flera klasser kan dela samma plan.

## Faktisk inventering och planägarskap

| Område | Aktuell källa / funktioner | Ägare och nödvändig förändring |
| --- | --- | --- |
| Tabell/index | `20260905170000_timplan_lasar.sql`; `20261004141000_phase5_timplan_units.sql` | 02 additiv metadata; 04 ersätter offering/unit-version/open/decided med seriescope. |
| Gym-guards/skapande | `20261012180000_plan_decision_flow.sql`: `phase5_gym_timplan_guard`, `phase5_gym_timplan_cells_guard`, `phase5_create_gym_timplan`, `phase5_write_gym_timplan_row` | 02 inventerar backfill/insert; 03 serieavgränsar version/predecessor; 04 skyddar livscykel. Skriv inte om gammal migrationsfil. |
| Gym scope/source/read | `20261005110000_phase5_gym_timplan_transition.sql`: scope/source/underlag/read; senaste `phase5_gym_timplan_result` i `20261012230000_gym_source_content.sql` | 03 skapar genom verifierad källa; 05 projicerar serie, frozen source och currentSource. |
| Källkrav | `20261012130000_gym_timplan_requires_programplan.sql`, `20261012200000_plan_decision_vocational.sql` | 03/04 bevarar krav på explicit programkälla och faktiskt stödd programprofil. |
| Beslutsskrivning | `20261012180100_plan_decision_command_fix.sql`: `phase5_plan_decision_command` ersätter idag alla fastställda offering/unit-planer | 04 begränsar till serie, bevarar programplansgren och writepermits. |
| Beslutsunderlag/sök | `20261012200000_plan_decision_vocational.sql`: detail/sourceblockers; `20261012220000_plan_decision_search.sql`: items/page/inbox; source_content i beslutspaket | 04 projicerar namn/snapshot/hash, 07 strikt server DETAIL_KEYS och projectSource. |
| Klass-ID/länkar | `20261015101000_class_cohort_link_identity.sql`: `phase5_class_underlag`, `phase5_class_command`, `validate_class_timplan`; `20261012240000_class_start_calendar.sql` | 05 läsmetadata, oförändrad klass/läsår/version/integritet; 09 granskad kö. |
| Årsrader/skolgenväg | senaste `phase5_planning_year_rows` i `20261012160000_programplan_school_timplan.sql`; tidigare created-only/search/performance bevaras | 05 alla serier och plural skolgenväg, inga offering/unit-limit1 eller klasslänkfilter som döljer annanserie. |
| Årstotal/sort/revision | `20261006120000_phase5_planning_year_reads.sql`: metrics/sorted/revision/totals/list/overview; privat readperformance/searchkorrigeringar | 05 perserie/deduplicering, namn i sökning/revision, stabil paginering och komplett okändsemantik. |
| Kullkopiering | `20261014100000_phase5_atomic_cohort_copy.sql`: `phase5_copy_programplan_education`; äldre `copy_offering_cohort` och dess senare definitioner inventeras före ändring | 03 ingen silent latest över flera serier, inga gamla klass-/medlems-/besluts-ID:n i ny kull. Skyddad programramkopiering behåller godkänd omfattning; ej beställt bulkbyte av timplaner. |
| Gym API | `web/lib/server/gym-timplan.ts`, `/api/timplaner/gym/{underlag,lasa,skapa,rad}` | 07 befintlig versionväg plus nya namedplanroutes; endast exakt nya Workergrants. |
| Beslut/API/läsårsserver | `web/lib/server/{plan-decision,planning-year,class-timplan}.ts` och deras befintliga routes | 07 gemensam nyprojektion, befintlig authz/audit och transaktionsvalidering. |
| Pureparsers | `web/lib/{gym-timplan,class-timplan,plan-decision,planning-year-contract}.ts` | 06 identitet/unikhet/scope, noggrann explicit legacyövergång. |
| UI | `protected-class-cohorts`, `protected-class-timplans`, `protected-gym-timplan-workspace`, `protected-programplan-workspace`, `plan-decision-panel`, `planning-context`, `protected-plan-list`, `protected-planning-overview` | 01/08/09/10 enligt filägarskap i planerna. |

Inventera vid utförande alla senare CREATE OR REPLACE-definitioner och direkta insertvägar med `rg`; tabellen är färsk kodkontroll, ingen garanti att arbetskopian inte ändras parallellt. Funktionsdefinition, signatur, grants, trigger och varje konsument måste matcha före slutlig apply. Inga globala sök/ersättningar på offering_id-villkor.

## Migrerings- och verifieringsgräns

02 lämnar gamla unika begränsningar kvar och gör gamla inserts entydiga genom legacy_default-serien; inga nya Workerentrypoints. 03:s nya funktioner är fortsatt stängda och ytterligare parallell serie kan ännu nekas av gamla index. 04 aktiverar serieunika begränsningar tillsammans med säker beslutskedja. 03–07 installeras inte var för sig i användarens aktiva app. Paketets installerade försök görs sammanhängande i privat separat schemakopia med granskade syntetiska fixturer i11. Tunga DDL/rollback/concurrencyprov får inte belasta den aktiva användardatabasen med långvariga lås; dess sessions-/auditwrites måste kunna fortgå. Endast schema-only-export med explicit målvalidering tillåts; inga verksamhetsrader, auth-/identitetsrader eller hemligheter exporteras från aktiva målet. Den separata databasen fylls enbart med granskade syntetiska fixturer och hålls privat; kandidatens skrivande API/browserprov pekar på samma isolerade mål. Slutlig kort kontrollerad schemaapply i aktiva lokalmålet görs i12 efter bevis från schemakopian med syntetiska fixturer, med fulla originalfingeravtryck och ingen DB/IdPomstart. En nySQL/oldWorkerblandning får inte bli användarleverans. Nya namedkommandon saknar Workergrant fram till sammanhängande07/11-aktivering; 04:s schemaändring rullas inte separat ut i aktiv app. 12 flyttar endast bevisat samma artefakt till3012 efter kontrollerad migration och återställbar byggnad.

Användarens befintliga syntetiska klasser/länkar är deras arbete och används inte som skrivfixturer. Före apply: fulla gamla verksamhetstabellprojektioner inklusive tidsstämplar, beslut, kvitton, audit-/identitetsankare samt DDL/ACL/journal. Endast dokumenterad additiv metadata är tillåten förändring av gamla planrader. Testdata är egna unika fixturer med hållbar journal; exakt cleanup, ingen reset/IdP-/DBomstart. Råresultat/tokens/personuppgifter hålls privat utanför Git. Första fel och återhämtningar bevaras som historik.

Prova migrationsrollback, installerad SQL och verkliga parallella sessioner separat. SQL-/TSparitet, routeunitmock, faktisk HTTP/OIDC och browser är olika bevisnivåer. Kandidatens exakta source/buildmanifest används för både desktop/phone och lokal leverans. Tidigare godkända prov är regressionbakgrund, inte ny verifiering. Fortsatt begriplighetsacceptans efter färdigt UI är en användarbedömning, inte ännu en bekräftelse av att börja.

## SS 12000 och kravspårning

Tillämplig avstämning är [SS 12000:2024/OpenAPI 2.1.0](05-CLASS-COHORT-SS12000.md), med där dokumenterad specifikationskälla/hash. Paketet gör ingen ny juridisk tolkning eller standardexport. Intern timplansserie/version har ingen antagen direkt motsvarighet i Group. Klassens `Group.id`, organisation, displayName och giltighet, personrelationer samt medlemskapsperioder bevaras; serie-ID eller plannamn får inte ersätta klass-/organisations-ID. Externa ID:n och käll-/skrivansvar förblir separata integrationskontrakt. Alla writes görs med befintliga mandat; ingen ny huvudmannarätt till klasshantering.

| Krav / gap | Planer | Verifierbart resultat |
| --- | --- | --- |
| ADMIN-02 | 02–08,11 | Explicit programkälla/poäng kvar; separata skolplaner och egna beslut, ingen annanseries ändring. |
| ADMIN-03 | 03,11 | Ny kull behåller godkänd kopieringsgräns, inga gamla klass-/elev-/länk-/besluts-ID:n. |
| ADMIN-04 | 01,05–09,11 | Tvåklasser-till-enplan, annanserie, uttryckligt läsår/versionsbyte, återhämtning och bevarad annanårslink. |
| PLANERING-01/04 | 05–10,11 | Gemensam skol-/årskontext och alla relevanta namedplanvarianter synliga med rätt mått. |
| PLANERING-05 / UX-gap | 01,08–12 | Dator/telefon, handbok, faktisk kandidatkörning, lokal leverans och separat mänsklig begriplighetsbedömning. |
| SS 12000-avstämning | 02–11 | Stabila grupp-/organisationsrelationer och perioder bevarade; inget påstått verkligt standardutbyte. |

Gapets stängningsvillkor kvarstår i [UX-gapet](05-CLASS-COHORT-UX-GAP.md). Tekniska PASS kan avsluta implementation och lokal verifiering, men gapet får inte stängas innan det nya sammanhängande flödet är begripligt för användaren utan chattbaserad stegledning.


### Säker begränsning för isolerad verifiering

Automatisk approval review avvisade full-data-snapshot. Därför gäller endast schema-only-export och granskade syntetiska fixturer i en separat privat databas. Ingen liverowexport får göras som testförberedelse. Bevarandeprov där visar endast att syntetiska förhandsrader bevaras; de bevisar inte att användarens originaldata är migrerade eller bevarade. Originalbevarande fastställs separat före/efter den kontrollerade faktiska schemaapplyn i plan12, med privata fingeravtryck och utan dataexport. Inga databastester startas innan schema02:s avsedda testmål är klart och validerat.
