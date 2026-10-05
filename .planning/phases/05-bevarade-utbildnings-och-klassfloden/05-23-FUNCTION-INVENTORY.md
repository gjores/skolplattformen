# 05-23 — SQL-funktionsinventering

## Steg A

Read-only inventering av det isolerade syntetiska målet `protected`, 2026-10-05. `pg_get_functiondef` hämtades före ändringarna; källor i äldre migrationer användes inte som aktuell definition. Ingen beständig migration, journaländring eller dataändring gjordes av SQL-executorn.

Samtliga sex journalberoenden finns: `20261004120000`, `20261004121000`, `20261004122000`, `20261004130000`, `20261004140000`, `20261004141000`. Exakt 16 fas 5-funktioner får köras av Worker. Fas 5 är stängd för PUBLIC, anon och authenticated.

| Funktion/signatur | Klassifikation | SHA-256 av definition före ändring |
|---|---|---|
| `phase5_programplan_term_rows(reference jsonb)` | Ersatt med samma signatur | `9ba5d5218be209d0b3e7f07c94d103e5fd525138c1be98c5d2d1c17ea85ec852` |
| `phase5_programplan_validate_basis(reference jsonb, offering offerings, previous_choices text[])` | Ersatt med samma signatur | `44f4e25174a91fa0d5abfd1cdec64a2843da6d2593c2a752da62cda19b0aa604` |
| `phase5_resolve_programplan_basis(reference jsonb)` | Ersatt med samma signatur | `fb952c8ce63e5b5879c8a1c9d7ce6e167ea1b26cb330d547164a6da70545a05b` |

Resolvern utökas med v2-form och blockdiagnoser. Terminsraderna utökas med alternativa svenskrader och blockramar; legacy behåller tidigare rader. Underlagsvalidatorn behåller exakt utbildnings-/inriktningspinning och tidigare specialiseringsval, och använder den uppdaterade resolvern för v2-validering. De tre ersatta funktionernas ACL är oförändrad: postgres och service_role hade EXECUTE; Worker och klientroller hade inte EXECUTE.

Nya interna hjälpare: `phase5_programplan_choice_blocks(jsonb)`, `phase5_programplan_choice_block_diagnostics(jsonb)` och `phase5_programplan_alternative_groups(jsonb)`. Alla är stängda för PUBLIC, anon, authenticated, Worker och service_role. Inga nya grants.

SQL har ingen befintlig nivåordningsdiagnos: de aktuella tre definitionerna analyserar inte årskurs-/terminsordning. D-13 genomförs därför senare i steg B:s TS-analys.

### Verksamhetskontrollsummor före

MD5 av samtliga hela JSONB-rader, sorterade med C-kollation; `string_agg` använder tom avskiljare. Kontrollsummorna identifierar hela befintliga verksamhetsmängden och innehåller inga personuppgifter.

| Tabell | Rader | MD5 |
|---|---:|---|
| `point_plans` | 18 | `16b350d5d9a7b5beb3609d0eb6e6201d` |
| `point_plan_events` | 43 | `3d6914ae41030102d6cd666cde0cfa1d` |
| `offerings` | 32 | `e51caf123ca4e36dba20fa8d69c52d2b` |
| `offering_units` | 117 | `dd527a96570560672a967f3887612c3a` |
| `timplans` | 4 | `7b0075f553817ec886592d3efd694fc2` |
| `timplan_cells` | 46 | `2df60780ec954cf7baa3266a25a97f0a` |
| `class_timplans` | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| `school_classes` | 6 | `73c0af1bc99a66cc0d2931b8da8bcb87` |
| `pupil_placements` | 68 | `aa23ef97ff2a5b0230880445dcce4296` |

### Provbevis

- RED på oförändrat schema: 73 pgTAP-fall, 71 förväntat fallerade eftersom v2 och intern blockresolver saknades. JSON och logg ligger i `/private/tmp/phase5-23-a/red.json` och `red.log`.
- GREEN i en automatisk rollback-transaktion: 312/312 pgTAP-fall. 29 program och samtliga 70 inriktningskombinationer, tre tidigare lästa exakta legacy-SA-radlistor, alla tre SA-inriktningar med 2 500 p, blockdiagnoser, utbildningspinning och stängda nya hjälpare.
- TS/SQL-paritet i separat rollback-transaktion: 142/142 vektorer (70 kombinationer × legacy/v2 plus `constructor`/`prototype`), inklusive diagnostik och olösta val, inte bara radnycklar/poäng.
- Efter samtliga rollbackprov: de tre definitionernas SHA-256, journalberoendena och exakt 16 Worker-entrypoints är oförändrade. Under arbetet tillkom en utbildning, en plan, två planhändelser och en skolkoppling från ett annat aktivt flöde. Dessa återställdes inte. Read-only delmängdsprov med `created_at <= 2026-10-05T11:56:46.647Z` ger exakt originalantal och originalfullhash för alla fyra tabellerna; de övriga fem fullmängdshasharna är också identiska. En separat repeatable-read rollbackomgång bevisar dessutom oförändrade hela verksamhetsrader genom migrationen och samtliga 312 prov. Klientroller är fortsatt stängda.
- Migrationsparser: 7/7 Node-prov, inklusive vägran av grants, senare steg, sökvägar och journalrättning för steg A.

Detta är rollbackbevis. Faktisk tillämpning, journalföring och Worker-/webbläsarbevis utförs och redovisas separat av samordnaren.


### Steg A — separat numerisk rättning

Slutgranskning fann att ett giltigt JSON-heltal skrivet `200.0` kunde kasta `22P02` när texten konverterades direkt till integer. Ursprunglig migration `20261004150000` var redan tillämpad och ändras inte. Separat rättningsmigration: `20261004150100_phase5_programplan_block_numeric.sql`.

Aktuellt `pg_get_functiondef` lästes read-only före rättningen: `phase5_programplan_choice_block_diagnostics(jsonb)`, SHA-256 `abe98b67a92edba38839c371cb23d440905b0ffac048eefdcd3c9fc2318ff480`, ACL endast postgres. Rättningen ändrar bara den redan validerade summandens konvertering till `numeric::integer`. Funktionen förblir stängd för klienter, Worker och service_role. Verktyget kräver tidigare migration `20261004150000` och exakt 16 Worker-entrypoints.

RED: 3/326 fallerade på aktuellt schema (200.0, 200.00 och splittrad IV med 100.0); GREEN: 326/326 i rollback. Rå JSON med exponent, bråk, noll, negativa tal, för stora tal, sträng, null och boolesk form prövades också. Konsistent repeatable-read kontroll visar hela verksamhetsmängden oförändrad genom rättning och tester. Parser 8/8. Minimerat bevis: `work/pilot/results/phase5-23-a-numeric.json`. Faktisk tillämpning återstår hos samordnaren.
