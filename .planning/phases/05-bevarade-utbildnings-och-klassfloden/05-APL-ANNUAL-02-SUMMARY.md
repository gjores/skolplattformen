---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-ANNUAL-02
status: implemented_consumer_tests_passed
completed: 2026-10-16
---

# Års-APL: skyddade konsumenter och summering

Worker, APL-projektion, beslut, autofördelning och planeringsöversikt skiljer nu äldre inkluderande terminstimmar från skolminuter med separat års-APL. SQL- och faktisk leveransverifiering redovisas separat; denna sammanfattning bevisar inte installerad funktion.

## Konsumentinventering

| Konsument | Ändring och verifierad betydelse |
|---|---|
| `web/lib/gym-timplan.ts` | Strikt union `GymTimplanLegacy`/`GymTimplanV2`. V2 har `timeModel`, `timeRows`, `timeCopyReview`; ingen fabricerad `hours`. Legacy wire-format oförändrat. |
| `web/lib/server/gym-timplan.ts` | Projekterar V2 från hela verifierade frysta katalogen. Kräver yrkesprogram för V2. Gammal radväg läser aktuell modell och nekar V2 innan legacy-skrivningen. |
| `web/lib/timplan-time-command.ts`, `web/lib/server/timplan-time.ts` | Strikta requests, requestbundna frysta kvitton, minutrad, helplansövergång, kopieringsgranskning och status. Övergångsförslaget stäms av mot aktuellt underlag och registrerad APL utan avrundning. |
| `/api/timplaner/gym/tidsmodell`, `/tidsrad`, `/tidsstatus` | Skyddade routes med aktuell rektors-/administratörsfunktion, MFA, ursprungskontroll, kontextepoch och obligatorisk audit. Ingen aktör eller behörighet tas från request. |
| `web/lib/apl-plan.ts`, servermotsvarighet | Allokering begränsas av årsramen, även vid noll skoltimmar. Perioder lägger inte till timmar. V2-innehållshash är separat version och omfattar skol-/årsminuter samt kopieringsproveniens. Årsramen måste förläggas helt inför bekräftelse. |
| `web/lib/server/plan-decision.ts` | V2-beslutsunderlag utan legacy-timmar; GUT jämför totalen i minuter och kräver fullständighet. Frysta APL-/beslutssnapshot måste avse identiskt innehåll. V1-kvitton behåller sitt gamla kontrakt. |
| `web/lib/server/named-timplan.ts` | Befintlig skapande-/kopieringsadapter använder den gemensamma strikta projektionen; ingen separat summa eller omtolkning infördes. |
| `web/lib/gym-timplan-distribution.ts`, servermotsvarighet | V2 fördelar totalmål minus års-APL enbart på skoltiden i heltalsminuter. Null års-APL förblir obesvarad. Explicit noll och minutrester bevaras vid fyllning. En `save_rows`-transaktion och kontrollerad återläsning. |
| `web/lib/planning-year-contract.ts` | Versionsbundna V2-listceller har `hourValues:null` och separata minutarrayer. Års-/översiktssumma räknar skolterminer plus års-APL en gång och dividerar sist med 60. Samma programkälla jämför fortfarande endast poängram, inte skolornas olika tid. |
| `web/lib/planning-year-model.ts` | Inventerad, ingen ändring nödvändig: projektionen tar redan enbart fryst källa och uttryckliga terminsvärden. Års-APL sprids inte på godtyckliga terminer. |
| `web/lib/server-client.ts` | PUT via befintlig centrala request-funktion, med samma sessions-/ursprungs-/epochhantering som övriga mutationer. |

APL-skrivning på högskoleförberedande program avvisas. Nuvarande läsförmågor visar ingen APL-redigering där. Äldre frysta kvitton kan fortfarande läsas utan att nya programregler retroaktivt ändrar deras innehåll. Ny V2-modell aktiveras endast för stödda yrkesprogram; övriga behåller sin skoltid i befintlig modell.

## Utförda kontroller

- 114/114 domän-/skyddade route-regressioner: `gym-timplan`, `gym-timplan-distribution`, `apl-plan` och respektive serverprov samt `server/plan-decision`. Inkluderar V2-frozen APL, skoltid noll med årsram, kvar att förlägga, kvitto/status, felformat, MFA/rollnekande, auditrollback och nekad legacy-radskrivning.
- 42/42 nya kommandokontrakt-/fördelningsprov och planeringsårskontrakt: exakta minutrester, explicit noll, APL-reservation, maximigränser, ofullständiga årsramar, års-/översiktssumma utan dubbelräkning, strikta preparatory-policy- och responsekontroller.
- `npx tsc --noEmit` passerade vid konsumentavstämningen.
- Avgränsad `oxlint` passerade för samtliga ändrade produktkonsumenter och tre routes.
- Ett gammalt routeprov behövde justerad SQL-anropsidentifiering när skyddet mot V2 lade till en säker läsning före legacy-skrivningen; själva gamla timsvaret och auditförväntan är oförändrade.

Privata provloggar: `/private/tmp/annual-consumers-regression-02.log`, `/private/tmp/annual-consumers-new-tests.log`, `/private/tmp/annual-consumers-tsc-02.log`. De innehåller lokalt syntetiskt provunderlag och versionshanteras inte.

## SS 12000

Årsramar och skolminuter är intern planering, inte närvaro, CalendarEvent eller Placement. Ingen ny klassrelation, identitet eller informationsansvar införs. Befintliga stabila ID:n och skol-/utbildningsscope bevaras. De här proven bevisar inte extern standardanslutning.

## Återstående inför leverans

Samordnad SQL/TS-paritet, full aktuellt produktbygge, faktisk Worker/OIDC och dator-/telefonflöde, granskade skärmbilder samt installerings-/leveransbevis krävs innan detta får anges som levererat. Lägg till SQL-agentens faktiska resultat och slutlig paketverifiering här eller i separat ANNUAL-04-verifiering.
