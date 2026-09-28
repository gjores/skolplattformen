---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "05"
subsystem: database
status: complete
completed: 2026-09-28
requires: ["04-04"]
provides: ["Atomiska elevändringar och typade versionskonflikter"]
affects: ["04-06", "04-10", "04-13", "04-21"]
---

# Fas 4 plan 05 — atomiska ändringar och verkliga lås

**Atomiska elevändringar bevarar datumhistorik och ger typade konflikter; 120 SQL-prov och sex verkliga samtidighetsfall passerar i isolerad syntetisk miljö.**

## Genomfört

- `phase4_change_pupil(jsonb)` och sex smala wrappers börjar med den levande aktören, kundlåset och låst elevrad. Endast administratör med aktuell/framtida egen skolplacering och eventuell explicit skyddsbehörighet får ändra. Berörd placering och målskola omprövas separat.
- Basuppgifter, hemkommun, skolbyte, utbildningsbyte, placeringsavslut och klassbyte skriver radversion, fältrevision, ursprung och append-only-historik i samma transaktion. Aktör och tid härleds på servern; payload tillåter ingen egen källa eller aktör.
- Kommunhistorik innehåller stabilt period-ID, kommunkod samt start/slut. Skol-/klass-/utbildningshistorik använder det slutna formatet från 04-04. Skolbyte avslutar tidigare placering/klass dagen före; utbildningsbyte delar placeringen och bevarar även framtida klassrelationer. Klassbyte ändrar aldrig utbildningen. Avvikande klassutbildning ger `class-education-mismatch`.
- Framtida överlapp och klasstid utanför placeringen ger konflikt före första skrivning. Ett avslut som lämnar enbart historik gör eleven fortsättningsvis skrivskyddad enligt D-20.
- Källägda fält nekas. En redan uttryckligt registrerad lokal rättelse kan ändras; fältets externa ägarskap/rättelsemarkering bevaras medan ändringshistoriken anger den faktiska manuella ändringen.
- Konflikter returneras som `{kind:'conflict',details,auditRefs}` enligt befintlig modell och logghjälpare. Överlappande basfält visar tillåtna nuvarande och inskickade värden; personnummerkonflikt innehåller inga nummer. Ändrade datumrelationer kräver omläsning. En gammal version får slå samman ett oberoende basfält först efter låset och kontroll av fältrevisionen.
- Konfliktens aktör/tid gäller överlappande fält, inte en senare oberoende ändring. Levande spärr/skyddsprövning sker före alla konfliktvärden. Skyddad konflikt kräver egen visningslogg via `auditRefs`. Tekniska constraint-/castfel får generiska meddelanden utan elevvärden.

## Internt kontrakt

Success är `{kind:'success',body:{pupilId,version,warnings},auditRefs:[]}`; svaret innehåller inga elevfält. `warnings` är tomt eller innehåller `class-education-mismatch`. Request följer `ChangeRequest` för de sex ovanstående typerna. Skapande och källavvikelsebeslut tillhör 04-06. Samtliga mutationsfunktioner och hjälpare är fortsatt stängda för PUBLIC, anon, authenticated och Worker tills 04-10 har auditerade skrivvägar.

## Verifiering

| Kontroll | Faktiskt resultat |
|---|---|
| RED | Saknad `phase4_change_pupil(jsonb)` belagd efter målskydd, commit `9a71caf` |
| Slutkandidat 150 + periodfixtur i rollback | **PASS 101/101**, exakt TAP-plan/numrering och psql exit 0 |
| Slutkandidat 150 + konfliktfixtur i rollback | **PASS 19/19**, exakt TAP-plan/numrering och psql exit 0 |
| Lokal migration efter 141 | **PASS**, Supabase `migration up --local`, exit 0 och registrerad migrationshistorik |
| `node work/pilot/verify-register-locks.mjs` mot permanent migration | **PASS 6/6**, observerade lås, committad version och egen fixtur städad |
| `node --check work/pilot/verify-register-locks.mjs` | **PASS** |
| Permanent SQL-omprov i orkestratorns fullkörning | **PASS 101/101 periodprov och 19/19 konfliktprov**, exit 0 per fil |

Tvåanslutningsskriptet använder två verkliga anslutningar plus en observerande anslutning. `pg_blocking_pids` och `pg_locks` verifierar väntan på just den andra anslutningen:

- Oberoende basfält → faktisk advisory-väntan, sparning mot committad version utan förlust.
- Samma basfält → faktisk advisory-väntan, typad konflikt med committad version.
- Datumrelation → faktisk advisory-väntan, konflikt och krav på omläsning.
- Samtidig medlemsblockering → faktisk advisory-väntan, `42501` efter commit utan konfliktvärden.
- Återkallad skyddsbehörighet → faktisk advisory-väntan, `P0002` efter commit utan konfliktvärden.
- Separat elevradlås → faktisk `transactionid`-väntan på A:s låsta elevrad, sedan konflikt mot den committade elevversionen.

Rapporten ligger i gitignorerade `work/pilot/results/phase4-register-locks.json` och innehåller inga elevvärden. Läsåret härleds från serverns `app_today` med juli-gränsen.

## Avvikelser och provsäkerhet

1. **Rule 3 — TAP vid sparpunkter:** Vid utökningen upptäcktes att scenariernas `ROLLBACK TO` även återställde pgTAP:s resultattabell. Periodprovet använder därför explicit `plan(101)` från början och extern TAP-räkning för samtliga utsända assertions, utan den felaktiga avslutande `finish()`-räkningen. Kandidatprovet kräver planantal, obruten numrering, inga `not ok` och psql exit 0. Inga misslyckade assertions ignoreras.
2. Den vanliga SQL-köraren fick lokala TCP-timeouter före provstart. Samma versionshanterade SQL kördes därför via Docker-intern psql **efter `assertTarget('protected')`**, i rollbacktransaktion. Målskyddet kringgicks inte. Senare Supabase-migration och verkliga Node-databasanslutningar passerade.
3. Samtidighetsprovets cleanup gäller bara en ny slump-ID-kund och dess egna rader, med kontroll av kund-ID/provnamn före radering. Den separata privilegierade cleanup-transaktionen använder `SET LOCAL session_replication_role=replica` för att ta bort just provets append-only-historik. Applikationen får aldrig detta undantag; inga säkerhetsloggar eller befintliga provkunder raderas.
4. Källägarskap prövas bara för ändrade fält. En registerägd placering blockerar därför inte ändring av en separat appägd klass; placeringsversion/datum prövas fortfarande.

## Kravspårning och kvarstående gränser

STU-01/02/03 → period-, mandat- och utbildningsbevarande SQL-prov. STU-04 → källägarskap, explicit rättelse och korrekt proveniens. STU-06 → fältrevision, typad konflikt, oförändrad historik vid nekande och verkligt låsprov.

HTTP409-loggning och rollback vid loggfel verifieras i skriv-API-plan 04-10; SQL-planen ensam öppnar ingen väg för användaren. Full fasgrind, användarprov och faktisk kommunanslutning godkänns inte av dessa lokala prov. Äldre övergångsröda fas 3-fixturer ägs av 04-14/15. Hela SQL-regressionens slutresultat redovisas i orkestratorns vågrapport; denna plans 120 SQL-prov passerade även mot den permanent tillämpade migrationen.

## Commits

- `9a71caf` — RED-fixturer för atomiska ändringar och konflikter.
- `2a04591` — atomiska mutationer, datumhistorik, levande mandat och 101 periodprov.
- `9ed86d8` — 19 konfliktprov och sex verkliga samtidighetsfall.

Global STATE/ROADMAP/VALIDATION och vågrapport ägs av orkestratorn. Inga orelaterade lokala ändringar ingår.
