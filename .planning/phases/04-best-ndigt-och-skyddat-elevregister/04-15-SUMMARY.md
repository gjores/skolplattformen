---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "15"
subsystem: sql-regression
status: complete
tags: [pgtap, pupil-register, fixtures, audit, regression]
requires:
  - phase: 04-14
    provides: portade fas 3-fixturhjälpare (register_pupil/class/member) och fas 4-läsvägar i SQL-prov
  - phase: 04-23
    provides: Worker-körrätt och ACL-kontrakt för registrets skrivvägar
provides:
  - samtliga 16 SQL-filer gröna mot registret (full SQL-grind PASS)
  - återkörbara fas 3-fixturer (SQL och browserkonton) i elevregistret utan elevprovet
affects: [04-16, 04-18, 04-19, 04-21]
requirements: [DATA-01, DATA-02, STU-01]
requirements-finally-verified: []
tech-stack:
  added: []
  patterns:
    - "Fixtur-SQL med temporära värdetabeller (on commit drop) och samma deterministiska ID som migreringen 20260929110000"
    - "Idempotens per elev: placering/klassmedlemskap skapas bara om eleven saknar sådan rad helt"
    - "Browserfixtur rapporterar bara antal (relationer, skyddsbehörigheter) och avbryter om skyddsbehörighet tillkommer"
key-files:
  created: []
  modified:
    - supabase/tests/phase3_audit.test.sql
    - supabase/tests/phase3_boundaries.test.sql
    - supabase/tests/phase3_connections.test.sql
    - work/pilot/sql/phase3-fixtures.sql
    - work/pilot/phase3-browser-fixtures.mjs
decisions:
  - "04-15: phase3_boundaries/-connections använder samma register-hjälpare som 04-14; alla tidigare assertions är kvar oförändrade, inga kontraktsändringar behövdes"
  - "04-15: phase3-fixtures.sql skriver inte längre i phase3_probe_pupils/-groups/-group_members; befintliga rader i protected-målet lämnas orörda (ingen radering)"
  - "04-15: fixturen skapar placering/klassmedlemskap bara för elev som saknar sådan rad, så att senare registerändringar inte skrivs över eller krockar med periodvillkoren"
  - "04-15: browserfixturen läser in phase4-reference-data.sql efter assertTarget och före fas 3-fixturen"
metrics:
  duration: ca 20 min
  completed: 2026-09-28
  tasks: 2
  files: 5
actuals:
  tokens: 15500
  tasks: 2
  commits: 2
plan_head_before: f81811bc016ce4affbcfd41ad134dbdb49bf3105
---

# Fas 4 plan 15: Porta resterande SQL och lokala fixturer — sammanfattning

**Hela SQL-regressionen är grön igen: 16 av 16 filer och 1161 assertions passerar mot det lokala protected-målet med syntetiska uppgifter. Fas 3:s browserkonton och mandat kan återskapas mot elevregistret utan att det gamla elevprovet används, och två körningar i rad ger samma resultat.**

## Ändringar

### 04-15-01: Audit-, gräns- och anslutningsprov (commit `e5ec614`)

- **`phase3_boundaries` och `phase3_connections`.** Relationsgrunden är portad på samma sätt som i 04-14. Samma elev-, grupp- och ärende-ID skapas i `pupils`, `school_classes`, `pupil_placements` och `pupil_class_memberships` i stället för i `phase3_probe_*`. Ärendena ligger kvar i `phase3_probe_cases`. Alla tidigare assertions finns kvar oförändrade. Bara fixturraderna för elevprovet och planantalet i `phase3_audit` har tagits bort eller ändrats.
- **Nya fas 4-gränser i `phase3_boundaries`** (från 32 till 41 assertions):
  - Elevhälsoansvarig får varken registerlista eller elevkort (`42501`). Den gamla kontrollen mot `phase3_read_pupils` finns kvar.
  - Support med elevscope läser bara den namngivna eleven i mandatskolan, både i kortet och i listan. En annan elev ger `P0002` och en annan skola `42501`.
  - Lärarmandatets grupp är en registerklass och elevmandatet pekar på en registerelev.
  - Fixturen skapar inga rader i `phase3_probe_pupils/-groups/-group_members`.
- **Nya fas 4-gränser i `phase3_connections`** (från 16 till 19 assertions): IT-uppdraget ger varken registerlista eller elevkort (`42501`). Fixturen skapar inga rader i det gamla elevprovet. Anslutningsproven (egen skola, version, konflikt, annan skola och kund, huvudman utan IT-rätt, direkt klient) är oförändrade.
- **`phase3_audit`** (från 13 till 19 assertions):
  - Underhållsrollen saknar läsrätt till `pupils`, läs- och raderingsrätt till `pupil_field_history` och körrätt till `phase4_list_pupils`.
  - Gallring av säkerhetsloggen rör inte registerhistoriken: en 400 dagar gammal historikrad finns kvar efter gallringen.
  - En äldre fas 3-händelse (`object_type='phase3_probe_pupil'`) inom retentionstiden gallras inte och behåller sin objekttyp.
  - Testsvaren innehåller inga elevvärden.

### 04-15-02: Återkörbara fas 3-fixturer (commit `55d2c10`)

- **`work/pilot/sql/phase3-fixtures.sql`:**
  - Kund, huvudman, identiteter, uppdrag, skolor och mandatskolor har samma rader som tidigare.
  - Elever, klasser, placeringar och klassmedlemskap skapas i registret. De får samma deterministiska ID som migreringen `20260929110000` (`phase4_probe_uuid`).
  - Läsåret härleds från `app_today()`, med start 1 juli det aktuella läsåret.
  - Personnummer tas från lediga syntetnummer i samma ordning som migreringen använder.
  - Hela körningen sker i en transaktion. Saknas syntetnummer stoppas körningen med tydligt fel.
  - Inget raderas. En elev som redan har en placering eller ett klassmedlemskap får ingen ny rad.
  - Samma fil används av `verify-mandates.mjs` och `verify-access.mjs`. De skripten har inte körts här.
- **`work/pilot/phase3-browser-fixtures.mjs`:**
  - Läser in `phase4-reference-data.sql` efter `assertTarget('protected')`.
  - Kontrollerar att lärarens mandat pekar på registerklassen, att elevhälsans elevmandat pekar på registereleven och att eleven har en aktuell placering i mandatskolan.
  - Räknar giltiga skyddsbehörigheter för kunden före och efter körningen och avbryter om antalet har ökat.
  - Utdata innehåller bara antal (`relations`, `protectedPermissions`).
  - Lösenordsfilen och manifestet är fortfarande 0600 och gitignorerade.

## Krav och prov

Alla körningar gick mot det lokala protected-målet, efter `assertTarget('protected')` och med syntetiska uppgifter.

| Krav | Kontroll | Faktiskt resultat |
|------|----------|-------------------|
| DATA-01, STU-01 | `run-sql-tests --file phase3_boundaries.test.sql` | **PASS 41/41** (före: avbrott på rad 16, `Case school scope denied`, 0 assertions) |
| DATA-01 | `run-sql-tests --file phase3_connections.test.sql` | **PASS 19/19** (före: samma avbrott, 0 assertions) |
| DATA-01, DATA-02 | `run-sql-tests --file phase3_audit.test.sql` | **PASS 19/19** (före: 13/13) |
| 04-15-01: DATA-01, DATA-02, STU-01 | `node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase4-all-sql.json` | **PASS: 16/16 filer, 1161 assertions**, exitkod 0. Före planen: FAIL med 1095 assertions och 2 avbrutna filer. Kördes igen efter fixturskrivningen med samma resultat. |
| 04-15-02: DATA-01, STU-01 | `node work/pilot/phase3-browser-fixtures.mjs --target protected` två gånger i följd | **PASS**: exitkod 0 båda gångerna och identisk utdata. `relations` gav pupils 2, placements 2, classes 2, classMemberships 2, cases 2 och assignments 10. `protectedPermissions` var 0. Totalt 4 fas 3-elever, 4 placeringar och 4 utbildningar både före och efter. `phase3_probe_pupils` hade kvar sina 4 historiska rader och fick inga nya. |
| Fixturens nyinstallationsväg | Fixturen kördes i rollback med nya ID och ny issuer | Den skapade 4 elever, 4 placeringar med start 1 juli det aktuella läsåret, 4 klassmedlemskap, 4 klasser och 4 ärenden, och 0 rader i elevprovet. Allt rullades tillbaka. |
| Kodkvalitet | `oxlint work/pilot/phase3-browser-fixtures.mjs`, `node --check` | PASS |

Rapporterna i `work/pilot/results/phase4-*.json` är gitignorerade. De innehåller bara filnamn, status och exitkod. Ingen migration har ändrats, ingen `reset.mjs` har körts och ingen fjärrdatabas eller verklig anslutning har använts. Inga säkerhetsloggar har raderats eller skrivits om.

## Avvikelser från planen

- **Inga kontraktsändringar.** Till skillnad från 04-14 behövde inga tidigare assertions vändas eller ändras. Alla gamla fall passerade direkt efter portningen av relationsgrunden. De nya fas 4-assertionerna är tillägg.
- **[Rule 1, egen fixtur] Typning.** Min första version av fixturen gav `offering_kind`-typfel i `select distinct`. Det upptäcktes i rollback-körningen och rättades med uttrycklig typkonvertering innan något skrevs.
- **[Rule 1, egen provlogik] Planantal.** Planantalet i `phase3_audit` räknades först fel (20 i stället för 19) och rättades före commit.
- **Grenskydd.** Precis som för 04-14 och 04-23 gjordes commits sekventiellt på `master`, enligt orkestratorns instruktion och projektets `branching_strategy: none`. Pin-skyddet passerade före varje skrivning och commit.

## Kvarstående

- `verify-mandates.mjs` och `verify-access.mjs` läser in den portade `phase3-fixtures.sql`. `verify-mandates.mjs` lägger dessutom själv in tillfälliga rader i `phase3_probe_pupils/-groups` (`setupTemporary`). Deras API-fall och övergången från `/api/prov` till `/api/elever` ägs av API-/browserregressionen (04-18) och har inte körts här.
- Proven visar SQL-kontraktet och fixturernas återkörbarhet. De ersätter inte E2E (04-16), API-/browserregressionen (04-18), UI-grinden (04-19) eller slutgrinden (04-21).
- Inga krav är markerade som slutverifierade här. Fasverifiering och `gsd-verify-work` återstår.
- Alla prov gäller syntetiska uppgifter i ett lokalt mål. Ingen verklig registeranslutning, IdP-anslutning eller kommunanslutning är prövad eller godkänd.

## Commits

- `e5ec614` test(04-15): porta audit-, gräns- och anslutningsprov till elevregistret
- `55d2c10` feat(04-15): gör fas 3-fixturerna återkörbara mot elevregistret

## Self-Check: PASSED

- FOUND: de fem ändrade filerna och denna SUMMARY.
- FOUND: `e5ec614` och `55d2c10`, 2 commits uppmätta från `f81811b`.
- Båda uppgifternas verifieringskommandon kördes och gav PASS.
