---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "02"
subsystem: pupil-register-database
tags: [postgresql, pgtap, rls, periods, synthetic-data]
requires: [04-01]
provides: [stängt registerschema, databasgaranterade perioder, kommunreferens, kanonisk syntetnummerlista]
affects: [04-03, 04-04, 04-05, 04-09, 04-20]
tech-stack:
  added: [btree_gist]
  patterns: [sammansatta kundnycklar, inkluderande periodslut, append-only-historik]
key-files:
  created:
    - supabase/migrations/20260929100000_phase4_register_schema.sql
    - supabase/tests/phase4_periods.test.sql
    - supabase/tests/phase4_register.test.sql
    - work/pilot/sql/phase4-reference-data.sql
  modified: []
completed: 2026-09-28
requirements-completed: []
---

# Fas 4 plan 02: Stängt registerschema och verifierade referenser

Tio nya tabeller ger stabil elevidentitet, separata daterade skol-/klass-/hemkommunsrelationer, ursprung och historik, utan att öppna någon appåtkomst.

## Genomförande och revisioner

- **04-02-01 — `aec3c92`:** pupils, school_classes, pupil_placements, pupil_class_memberships, pupil_home_municipalities, pupil_field_state, pupil_field_history, pupil_source_values samt kommun- och syntetnummerreferenser. Ny migration tillämpad med `migration up --local` efter `assertTarget('protected')`; inga äldre migrationer ändrades och ingen reset utfördes.
- **04-02-02 — `20f78c0`:** 290 unika fyrsiffriga kommunkoder med namn från SCB och 512 uttryckligen fiktiva TEST-identiteter. Båda referenserna lästes in endast efter separat målskydd. Registerprov verifierar identitet, kundgränser, historik och nekad direktåtkomst.
- GiST-exclusion på varje elevs placering, klass och hemkommun använder `daterange(starts_on,ends_on,'[]')`. Slutdagen ingår, en dags period är giltig, null slut är öppet och luckor tillåts. Felaktiga, saknade, omvända och oändliga datum nekas.
- Sammansatta nycklar knyter kund → huvudman → skola/utbildning och elev. Klassrelationens explicita `placement_id` knyts till samma elev, kund och skola; klassen kan ha en annan utbildning utan att byta elevens utbildning.
- Alla nya tabeller har FORCE RLS och saknar rättigheter för PUBLIC, anon, authenticated och skolplattform_worker. Historiken nekar UPDATE, DELETE och TRUNCATE med separat trigger, även om senare kod skulle få mer rättigheter.
- `offerings.start_year` är nullable integer. Endast den entydiga etablerade gymnasieetiketten `Elever som börjar HT YYYY` återfylls; annan text/skolform lämnas null. `copy_offering_cohort` och `class_timplans` är orörda.

## Referenskälla och identitetskontrakt

SCB:s **Län och kommuner i kodnummerordning**, hämtad 2026-09-28, med länk och datum i SQL-filens kommentar. Alla 290 kod-/namnpar kontrollerades direkt mot hämtad officiell HTML; sidan länkar till 2026 års lista. Källan är https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/lan-och-kommuner/lan-och-kommuner-i-kodnummerordning/.

Exakt `TEST-YYYYMMDD-NNNK` med längd 18, giltigt kalenderdatum och Luhn över YYMMDDNNNK. Födelsedatum är genererat och kan inte lagras fristående från numret. FK mot `synthetic_pupil_numbers` ger den stängda allowlistan; formatkontroll ensam ger ingen rätt att lagra. Listan är kanonisk för senare server-/klientflöden och alla 512 värden provades mot 04-01:s gemensamma TypeScript-validator. Ingen separat hårdkodad klientlista tillkom. Vanliga 10-/12-siffriga personnummer nekas.

## Verifiering och kravspårning

Node 25.9.0 användes via `/opt/homebrew/opt/node@25/bin/node`. Endast det målskyddade lokala protected-målet, med syntetiska elever. SQL-fixturerna återställs med rollback; referenslistorna finns kvar i målet.

| Kontroll | Faktiskt resultat | Delbevis |
|---|---|---|
| Periodprov före migration | Förväntat rött: tabellen synthetic_pupil_numbers saknades | Provfil skapad före schema |
| `run-sql-tests.mjs --file phase4_periods.test.sql` | **43/43 PASS** | STU-02–03: inkluderande slut, angränsning, öppet slut, lucka, överlapp och korsande kund/skola/elev/utbildning |
| `run-sql-tests.mjs --file phase4_register.test.sql` | **78/78 PASS** | STU-01: stabilt ID efter nummerändring, kundunikhet, ingen konto-/sessions-FK; STU-04: stängd append-only-historik; nekade approller |
| SQL-listans värden genom gemensam TypeScript-validator | **512/512 PASS** | Identiskt format, kalenderdatum och Luhn mellan referensdata och modell |
| Kommunlistan mot officiell HTML | **290/290 kod-/namnpar PASS** | Spårbar referenskälla |
| `run-sql-tests.mjs --out work/pilot/results/phase4-wave2-sql-all.json` | **686/686 PASS, 12 filer** | 565 tidigare prov från fas 1–3 och 121 nya registerprov |

Minimerade rapporter ligger lokalt under `work/pilot/results/phase4-*.json`; orkestratorn har lagt dessa i rotens ignore. Tillfälliga migrations-/laddningsskript flyttades till `/tmp` efter användning.

## Avvikelser och miljö

Ingen omfattningsändring. Förgranskningen lade till den explicita placeringsnyckel som 04-01:s klasskontrakt förutsätter. PostgreSQL fick flera tillfälliga anslutnings-/hälsokontrolltimeouter under hög maskinlast. Målskyddet stoppade körningarna; efter minskad last gick samma målskydd och ordinarie lokala migrationsväg igenom. Ingen målskyddsregel kringgicks, ingen tjänst återställdes och ingen gammal migration redigerades.

## Fortsättning och begränsningar

Detta är databasgrunden. API, behörighetsprövade registerfunktioner, användarvyer, konflikthantering, källleveranser och faktisk återinloggning/omläsning via appen återstår i senare planer. En klassperiods tidsmässiga inneslutning i placeringen kontrolleras i mutationsplanen; denna plan garanterar rätt placeringsrelation och nekar överlapp. Ursprungs-/källtabeller är ännu inte en genomförd extern anslutning eller verifierad konfliktfunktion. Kraven är inte slutverifierade. Full fasgrind, användarprov och separat gsd-verify-work kvarstår; verklig drift och kommunanslutning godkänns inte av dessa syntetiska prov.
