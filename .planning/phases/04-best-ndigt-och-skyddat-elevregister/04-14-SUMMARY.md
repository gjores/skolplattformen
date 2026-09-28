---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "14"
subsystem: sql-regression
status: complete
tags: [pgtap, pupil-register, mandates, regression, temporal]
requires:
  - phase: 04-06
    provides: registerscheman, migrerat elevprov, fas 4-läsvägar och källskydd
provides:
  - fyra äldre fas 3-SQL-fixturer portade till det beständiga registret
  - skolbyte, placerings-/medlemskapsgränser och kedjeavslut prövade mot registrets daterade placeringar
affects: [04-15, 04-18, 04-21]
tech-stack:
  added: []
  patterns:
    - "Fixturhjälpare i pg_temp (register_pupil/class/member) med deterministiska ID via phase4_probe_uuid"
    - "Elevläsning i SQL-prov via phase4_list_pupils per egen mandatskola, phase4_pupil_card och exportpreview"
    - "app.fake_today endast transaktionslokalt i rollbackfixtur för placeringsdatum"
key-files:
  created: []
  modified:
    - supabase/tests/phase3_mandates.test.sql
    - supabase/tests/phase3_matrix.test.sql
    - supabase/tests/phase3_policy.test.sql
    - supabase/tests/phase3_temporal.test.sql
decisions:
  - "04-14: Äldre fas 3-fixturer skapar inga rader i phase3_probe_pupils/-groups/-group_members; samma elev-/grupp-/ärende-ID skapas i registret"
  - "04-14: Provet 'phase3_read_pupils öppen för Worker' vänds avsiktligt till stängd; motsvarande positiva Worker-läsning prövas via phase4_list_pupils"
  - "04-14: Samtidig dubbel klasstillhörighet finns inte i registret; filtreringsprovet använder en tidigare klassperiod i stället"
metrics:
  duration: ca 35 min
  completed: 2026-09-28
  tasks: 2
  files: 4
actuals:
  tokens: 13100
  tasks: 2
  commits: 2
plan_head_before: d9319568426b4fb36a5b1edc69d730f0ae1b1223
---

# Fas 4 plan 14: Porta första delen av SQL-regressionen — sammanfattning

**Fyra äldre fas 3-fixturer (mandat, matris, policy, datum) körs nu mot det beständiga elevregistret med samma fallnamn. Elevläsningen går via fas 4:s lista, kort och exportpreview, och ett mandat vid den gamla skolan följer inte med eleven efter ett skolbyte.**

## Ändringar

- **Relationsgrund.** De fyra filerna skapar inte längre rader i `phase3_probe_pupils`, `phase3_probe_groups` eller `phase3_probe_group_members`. Samma elev-, grupp- och ärende-ID skapas i stället i `pupils`, `school_classes`, `pupil_placements` och `pupil_class_memberships`. Utbildning, placering och medlemskap får deterministiska ID via `phase4_probe_uuid`, med samma schema som migrering `20260929110000`. Placeringen börjar 1 juli det aktuella läsåret. Personnummer tas ur `synthetic_pupil_numbers`. Ärendena ligger kvar i `phase3_probe_cases`, som nu har FK till registrets elev.
- **Läsanrop.** Varje `phase3_read_pupils()` har ersatts:
  - Listan: `phase4_list_pupils` anropas för varje egen mandatskola. Om aktören saknar mandatskola anropas listan utan skola, och anropet ska då nekas.
  - En enskild elev: `phase4_pupil_card`. En elev utanför behörigheten ger `P0002`.
  - Export: preview i `phase4_export_pupils`. Andra roller än administratör får `42501`.
- **Semantisk mappning.** Ett tidigare antal rader motsvarar nu elev-ID från listan. Att en direkt elevläsning gav 0 rader motsvarar nu att kortet ger `P0002`. Nekad export (`42501`) och nekad kontext (`42501`) är oförändrade. `group_ids` motsvarar nu kortets `classes`, som för gruppscope filtreras till mandatets grupper.

## Krav och prov

| Krav | Fil | Resultat (lokalt protected-mål, syntetiska data) |
|------|-----|--------------------------------------------------|
| DATA-01, STU-01 | `phase3_mandates.test.sql` | **PASS 279/279** (`phase4-regression-mandates.json`) |
| DATA-01, STU-01 | `phase3_matrix.test.sql` | **PASS 56/56** (`phase4-regression-matrix.json`) |
| DATA-01, STU-01 | `phase3_policy.test.sql` | **PASS 105/105** (`phase4-regression-policy.json`) |
| DATA-01, STU-01 | `phase3_temporal.test.sql` | **PASS 34/34** (`phase4-regression-temporal.json`) |
| Full SQL-regression | alla 16 filer | **FAIL**: 1081 assertions passerade (tidigare 607). Kvar är bara `phase3_boundaries` och `phase3_connections`, som avbryts före första assertion med `Case school scope denied`. De ägs av 04-15. Rapport: `phase4-wave7-04-14-all-sql.json`. |

Innan portningen avbröts alla fyra filerna på rad 16–17 (`Case school scope denied`) med 0 assertions. Samtliga körningar gick via `run-sql-tests.mjs` efter `assertTarget('protected')` i rollbacktransaktion. Ingen migration ändrades, inget reset-/skrivskript kördes och ingen verklig anslutning användes. Rapporterna i `work/pilot/results/` är gitignorerade och innehåller bara fil, status och exitkod.

Alla tidigare testnamn finns kvar, med ett avsiktligt undantag som beskrivs nedan. Inga assertions har tagits bort eller hoppats över. Nya fall:

- **Mandat:**
  - FK-nekanden i registret: elev över kund, placering vid annan huvudmans skola, klass med annan skolas utbildning, medlemskap över skolgräns. Varje nekande är kontrollerat mot rätt villkorsnamn.
  - Stängd tabellgräns och FORCE RLS för fyra registertabeller.
  - Faktiska roller nekas `pupils`.
  - Mandat- och ärendenycklar pekar inte längre på elevprovet.
- **Matris:**
  - Annan skolas lista och elevkort nekas.
  - Ett elevmandat utan placering i mandatskolan ger ingen läsning.
  - Skolbyte till nästa läsår. Gammal rektor, gammalt elevmandat och gammalt gruppmandat följer inte eleven. Den nya skolan ser eleven, men inte den gamla skolans läsår.
  - Listan innehåller exakt de tillåtna fälten.
  - Den gamla läsaren saknar datakälla för registerelever.
- **Policy:**
  - Registret nekar två samtidiga klassmedlemskap (`23P01`).
  - Skolscope ser båda klassperioderna, gruppscope bara mandatets.
  - Annan skolas ärende ger inget kort.
  - En faktisk Worker nekas `phase3_read_pupils` men läser sin egen skola via `phase4_list_pupils`. Den nekas annan skola.
- **Datum:** Med `app.fake_today` sätts datumet bara transaktionslokalt.
  - Placeringens slutdag räknas med, och dagen efter är placeringen avslutad.
  - En ny placering är framtida dagen före start och aktuell från startdagen.
  - Gruppscope gäller den sista medlemsdagen och upphör dagen efter.
  - Överlapp på slutdagen nekas.
  - D-20: pågående placering ger ändringsrätt. En elev med bara avslutad placering kan läsas men inte ändras.
  - En avslutad rektor stänger administratörens och lärarens registerläsning omedelbart. Läsningen fungerar igen när kedjan återställs.

## Avvikelser från planen

### Avsiktliga kontraktsändringar

**1. Worker-EXECUTE på `phase3_read_pupils` provas som stängd**
- **Fil:** `phase3_policy.test.sql`
- **Före:** `phase3_read_pupils öppen för Worker efter verifierad obligatorisk audit (03-05)` förväntade `true`.
- **Nu:** Migrering 110 stänger den gamla läsaren. Planen kräver att den testas som nekad. Fallet heter nu `phase3_read_pupils stängd för Worker efter fas 4-cutover (tidigare öppen efter 03-05)` och förväntar `false`.
- **Positivt motsvarande fall:** `phase4_list_pupils` är öppen för Worker och stängd för anon/authenticated. En faktisk Worker-läsning av egen skola lyckas och annan skola nekas.

**2. Dubbel gruppmedlemskap blir tidigare klassperiod**
- **Fil:** `phase3_policy.test.sql`, fallet `grupp-ID filtreras till lärarens mandat`.
- **Före:** Eleven låg samtidigt i två grupper.
- **Nu:** Registrets uteslutningsvillkor tillåter bara en klass åt gången, och det beteendet är avsett. Klass 399 läggs därför på elevens föregående placering. Syftet är oförändrat: lärarens kort visar bara mandatgruppen, medan skolscope ser båda perioderna. Att samtidig dubbel tillhörighet nekas prövas separat.

**3. Fältprovet i matrisen kompletteras**
- `fields-are-exact: SQLreturen innehåller bara fyra basfält` finns kvar oförändrat för den gamla läsaren.
- Nytt fall: `fields-are-exact-register` prövar registerlistans exakta fältmängd för rektor.

### Automatiskt hanterat

Inga fel behövde rättas i produktkoden. Två antaganden i nya prov var fel och rättades innan de committades:
- Rektor utan administratörsrätt får också placeringsdetaljer, men bara för sin skola. Provet kontrollerar nu skolgränsen.
- Nyckelordningen i fältprovet jämförs nu med `collate "C"`.

### Observation för senare planer

`mandate_pupils` FK binder numera bara elev och kund, inte skola (migrering 110). Skydd mot felaktig skola ges i stället vid läsningen: `phase4_scope` kräver placering i mandatskolan. Matrisprovet `health-pupil-unplaced` visar att ett sådant mandat inte ger någon läsning.

### Protected-branch-kontroll

GSD:s kontroll klassar `master` som skyddad gren. Orkestratorn angav ändå sekventiell körning med vanliga commits i huvudarbetskopian, samma som för 04-10. Pin-skyddet passerade före varje commit.

## Kvarstående

- **Full SQL-grind:** fortfarande röd tills 04-15 har portat `phase3_boundaries` och `phase3_connections`.
- **Förbehåll för fasgrinden:** Portningen visar SQL-kontraktet mot registret. Den ersätter inte API-/browserregressionen i 04-18 eller slutgrinden i 04-21.
- **Krav:** markeras inte slutverifierade här. Samlad fasverifiering och `gsd-verify-work` återstår.
- **Verklig drift:** Proven gäller bara syntetiska data i det lokala målet. Ingen verklig registeranslutning eller kommunanslutning är prövad eller godkänd.
- **Worker-EXECUTE:** Enligt 04-10 är den fortfarande stängd för ändrings-, käll-, personnummer- och exportfunktionerna. Det påverkas inte av denna plan.

## Commits

- `fbafa2c` test(04-14): porta mandat- och matrisprov till elevregistret
- `0e0e921` test(04-14): porta policy- och datumprov till registrets placeringsmodell

## Self-Check: PASSED

- Filerna finns: de fyra fixturerna och denna SUMMARY.
- Commits `fbafa2c` och `0e0e921` finns i historiken.
- Uppgifternas verifieringskommandon gav PASS. Full regression redovisas som FAIL med exakt de två filer som 04-15 äger.
