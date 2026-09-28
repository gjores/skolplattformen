---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "17"
subsystem: register-cutover
status: complete
completed: 2026-09-28
tags: [postgres, migration, retire, probe, routes, worker]
requires: [04-13, 04-15]
provides:
  - Migration som släpper elevprovets läsfunktion och elev-, grupp- och medlemstabeller utan CASCADE och med spärrar mot kvarvarande läsare och förlorade rader
  - SQL-prov (phase4_retire) som visar att ingen parallell elevdatakälla finns kvar och att ärende-/mandatkedjan är hel
  - Protected-bygge utan /api/prov och utan elevprovets klient-, server- och modellkod
affects: [04-16, 04-18, 04-19, 04-20, 04-21]
requirements: [DATA-01, DATA-02]
requirements-addressed: [DATA-01, DATA-02]
requirements-finally-verified: []
tech-stack:
  added: []
  patterns:
    - "Avveckling utan CASCADE: först prosrc-spärr (PL/pgSQL-beroenden syns inte i pg_depend), sedan radspärr mot registret, sedan DROP i beroendeordning och kontroll efter DDL"
    - "Återspelning av historisk migration i pgTAP återskapar avvecklade objekt bara i rollback, fyllda ur registret för befintliga FK-rader"
key-files:
  created:
    - supabase/migrations/20260930100000_phase4_retire_probe.sql
    - supabase/tests/phase4_retire.test.sql
  modified:
    - supabase/tests/phase3_boundaries.test.sql
    - supabase/tests/phase3_connections.test.sql
    - supabase/tests/phase3_mandates.test.sql
    - supabase/tests/phase3_matrix.test.sql
    - supabase/tests/phase3_policy.test.sql
    - supabase/tests/phase4_register.test.sql
  deleted:
    - web/app/api/prov/elev/route.ts
    - web/app/api/prov/export/route.ts
    - web/app/pupil-probe-workspace.tsx
    - web/lib/server/pupil-probe.ts
    - web/lib/pupil-probe-model.ts
    - web/lib/pupil-probe-model.test.mjs
key-decisions:
  - "04-17: phase3_probe_cases, phase3_probe_scope() och phase3_pupil_in_scope() behålls. Ärendetabellen bär fas 3:s ärenden med register-FK, och scopefunktionerna läser bara registret (phase3_probe_scope används av phase4_register_selection)"
  - "04-17: '/api/prov' finns kvar som loggklass i audit-details, så att historiska och försökta anrop klassas i stället för att bli /api/other"
  - "04-17: Fas 3:s API-/browserprov och collect-denials mot /api/prov och elevprovet är övergångsröda och överlämnas till 04-18, som enligt beroendeordningen körs efter 04-17"
duration: 20min
plan_head_before: bd3ae0c02c82ca5c1237bd5102e4e1fb78f9eb77
actuals:
  tokens: 15500
  tasks: 2
  commits: 2
---

# Fas 4 plan 17: Avveckla elevprovet – sammanfattning

**Elevregistret är nu den enda elevdatakällan i databasen och i den skyddade appen. Elevprovets läsfunktion och dess elev-, grupp- och medlemstabeller är borttagna. Det är också dess routes (`/api/prov/elev`, `/api/prov/export`), vy, serverkod och modell. Fas 3:s ärenden, mandatkedjans scopefunktioner och alla historiska säkerhetshändelser finns kvar. Allt är provat lokalt mot det skyddade målet med syntetiska uppgifter.**

## Ändringar

### 04-17-01: SQL-avveckling (commit `2ddc0bd`)
- **Inventering före DDL** på protected-målet (efter `20260929180000`):
  - `pg_constraint`: de tre tabellerna har bara FK sinsemellan och till `organizers`/`school_units`. `mandate_pupils` pekar redan på `pupils`, `mandate_groups` på `school_classes` och `phase3_probe_cases` på `pupils`. `mandate_cases` pekar på `phase3_probe_cases`.
  - `pg_depend`: inga policys, vyer eller triggers på tabellerna.
  - `pg_proc.prosrc`: enda funktionskällan som läser tabellerna är `phase3_read_pupils`, som varit stängd för alla roller sedan 04-03. Tabellerna publiceras inte.
- **Migration `20260930100000_phase4_retire_probe.sql`** sorterar efter senast tillämpade `20260929180000`. Den gör följande i ordning:
  1. Stoppar om någon annan funktion än den gamla läsaren fortfarande läser elevprovet (`2BP01`).
  2. Stoppar om någon provelev, provgrupp eller något provmedlemskap saknar sin registerpost (`23514`).
  3. Återkallar och släpper `phase3_read_pupils(uuid,uuid,boolean)`.
  4. Återkallar och släpper `phase3_probe_group_members`, `phase3_probe_groups` och `phase3_probe_pupils`.
  5. Kontrollerar efteråt att objekten saknas och att fyra FK finns kvar: ärende → elev, ärendemandat → ärende, elevmandat → elev och gruppmandat → klass.

  Ingen CASCADE och ingen egen COMMIT används.
- **Behålls avsiktligt:**
  - `phase3_probe_cases` med `phase4_case_school_scope`-triggern.
  - `phase3_probe_scope()`, som är körbar för Worker och läser `school_classes`.
  - `phase3_pupil_in_scope()`, som läser `pupil_placements` och inte är någon RPC.
  - Säkerhetshändelser med objekttypen `phase3_probe_pupil`/`phase3_probe_case`.
- **Tillämpning:** först `assertTarget('protected')`, sedan en torrkörning i en återrullad transaktion och därefter kopiering till målets workdir och `supabase --workdir … migration up --local`. Målet slutar nu på `20260930100000`. Ingen fjärrdatabas, ingen `reset.mjs` och ingen `--include-all` användes.
- **Nytt prov `phase4_retire.test.sql` (27 assertions):**
  - Tabellerna och läsaren saknas, och ingen funktionskälla, vy eller policy läser elevprovet.
  - Ingen `phase3_read*` är körbar för Worker eller klientroller.
  - Faktisk Worker får `42883`/`42P01`, alltså att objektet saknas.
  - FK-kedjan och triggern är hela, och scopefunktionerna läser registret.
  - Historiska objekttyper kan lagras och läsas.
- **Portade SQL-prov:** varje påstående om ett avvecklat objekt ersattes med ett frånvaroprov. Inga andra assertions togs bort eller försvagades.
  - `phase3_boundaries`, `phase3_connections`, `phase3_matrix`, `phase3_policy`: ersättningarna är 1:1.
  - `phase3_mandates`: 39 RLS- och behörighetsrader för de tre tabellerna blev 3 frånvaroprov. Worker får nu `42P01` i stället för `42501`. Proven för anon/authenticated är oförändrade (`42501`), eftersom rollerna saknar schemaåtkomst och nekas före namnuppslaget.
  - `phase4_register`: `old Worker pupil reader removed`. Återspelningen av `20260929110000` återskapar de historiska tabellerna och en läsare med tom kropp, bara i rollback, så att den versionshanterade migrationen kan köras oförändrad. Tabellerna fylls ur registret med exakt de prov-ID som befintliga mandat- och ärenderader kräver. Proven efter återspelningen heter nu `replay: …`, eftersom de gäller de återskapade objekten.

### 04-17-02: Borttagen kod (commit `78f1e18`)
- Referenssökningen i `web/` (utanför `node_modules`/bygge) visade att ingen appkod importerar `pupil-probe-workspace`, `lib/server/pupil-probe.ts` eller `pupil-probe-model`. De sex filerna togs bort.
- `'/api/prov'` finns kvar i `audit-details.ts` ROUTES som loggklass. Det är den enda träffen i bygget.

## Krav → prov (lokalt, syntetiskt)

| Uppgift / krav | Kommando | Resultat |
|---|---|---|
| Baslinje före migrationen | `node work/pilot/run-sql-tests.mjs --out …/phase4-retire-baseline.json` | PASS 16/16 filer |
| 04-17-01 RED | `run-sql-tests.mjs --file phase4_retire.test.sql` före migrationen | **FAIL 12/29** (väntat): tabellerna, läsaren och FK:er till gamla tabeller fanns |
| 04-17-01: DATA-01, DATA-02 | `node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase4-retire-sql.json` | **PASS 17/17 filer, 1216 assertions** (före: 16/16, 1224; −36 i `phase3_mandates`, +1 i `phase4_register`, +27 i `phase4_retire`) |
| Historik orörd | räkning före och efter migrationen | `phase3_probe_pupil` 723, `phase3_probe_case` 69, totalt 20 750 säkerhetshändelser, 4 ärenden. Oförändrat |
| 04-17-02: DATA-01, DATA-02 | `cd web && npx tsc --noEmit && npx oxlint app lib && npm run build:protected` | **PASS**: tsc och oxlint utan fel, bygget utan fel, och routetabellen visar bara `/api/elever/*` för elevdata |
| Nodprov | `node --test lib/*.test.mjs lib/server/*.test.mjs` | **PASS 395/395** (399 − 4 borttagna elevprovsfall) |
| Bygget saknar gamla vägen | sökning i `dist-protected` efter `api/prov`, `phase3_read_pupils`, `readProbePupils`, `PupilProbeWorkspace`, `probeCsv` | Enda träffen är loggklassen `'/api/prov'` i audit-details |
| `/api/prov` ger 404 | byggd protected-Worker (`preview:protected`, 127.0.0.1:3012) | GET `/api/prov`, `/api/prov/elev`, `/api/prov/elev?elev=…`, `/api/prov/export` och POST `/api/prov/export`, `/api/prov/elev` gav **404**. Jämförelse: POST `/api/elever/lista` 401 och `/api/health/db` 200 |
| Gammal RPC saknas | `phase4_retire` | `to_regprocedure` är null, och faktisk Worker får `42883` |

- **DATA-01:** Det finns ingen parallell läsväg till elevuppgifter: ingen tabell, ingen SQL-funktion och ingen Worker-route. Mandat och ärenden pekar på registret.
- **DATA-02:** `/api/prov/export` är borttagen. Exporten går bara via `/api/elever/export` (04-10/04-24).
- Kraven markeras **inte** slutverifierade här.

## Avvikelser från planen

1. **[Rule 3] SQL-prov utanför `files_modified`.** Sex befintliga SQL-prov påstod saker om de avvecklade objekten och stoppade sviten (inga planrader eller fel assertions). De portades till frånvaroprov enligt ovan. Nytt prov: `phase4_retire.test.sql`. Commit `2ddc0bd`.
2. **[Rule 1, provlogik] Klientrollsprov i det nya provet.** Min första version väntade `42P01` för anon/authenticated. Rollerna saknar schemaåtkomst och får `42501` före namnuppslaget, både före och efter avvecklingen. Proven ersattes med ett tredje Worker-prov, och klientrollerna täcks av `to_regclass`/`has_function_privilege`. Produktkoden är oförändrad.
3. **[Rule 1, provlogik] Återspelningens FK-validering.** De gamla FK som återskapas i `phase4_register` validerade befintliga mandatrader i målet (97 elevmandat och 217 gruppmandat på fas 3-fixturens ID) mot de nu tomma återskapade tabellerna. Fixturen fyller därför tabellerna ur registret med exakt de ID som FK kräver. Inga nya personer skapas, och allt rullas tillbaka.
4. **Grenpolicy.** GSD-protokollets HEAD-kontroll klassar `master` som skyddad. Orkestreraren angav sekventiell körning på huvudarbetskatalogen, och projektet har `branching_strategy: none`. Tidigare planer i fasen committade på `master`. Commits gjordes därför på `master`, och push sker enligt AGENTS.md.

## Kvarstående luckor och begränsningar

- **Övergångsröda konsumenter (04-18):** `work/pilot/verify-mandates.mjs`, `work/pilot/verify-access.mjs`, `web/e2e/phase3-mandates.spec.ts` och `web/e2e/phase3-workspace.spec.ts` anropar `/api/prov/*` eller skriver i de borttagna tabellerna. De har inte körts här och är röda tills 04-18 portar dem.
- **`collect-denials.mjs` saknas i 04-18:s `files_modified`.** Dess `direct-rest`/`direct-rpc` pekar på objekt som inte finns och har inte körts efter avvecklingen. SQL-direktprovet ger fortfarande `42501`, vilket är kontrollerat mot målet. Förslaget är att 04-18 riktar proven mot `public.pupils` och `rpc/phase4_list_pupils`. Detaljer finns i `deferred-items.md`.
- Interna dokument (`docs/pilot/phase3-mandates.md`, `docs/pilot/audit-sources.md`) beskriver fortfarande elevprovet. Handboken berörs inte.
- CSS-regeln `.probe-workspace` i `globals.css` saknar användare och lämnades, eftersom planen avgränsade borttagningen till sex filer.
- 404-provet gjordes utan session. Routen finns inte i bygget, så en session ändrar inte utfallet, men ett inloggat anrop är inte provat.
- Syntetiska prov i ett lokalt mål. Ingen verklig drift, IdP-anslutning eller kommunanslutning är prövad eller godkänd. 04-16, 04-18–04-22, gsd-verify-work och fasverifieringen återstår.

## Commits

- `2ddc0bd` feat(04-17): avveckla elevprovets SQL-läsning och tabeller
- `78f1e18` feat(04-17): ta bort elevprovets routes, vy, serverkod och modell

## Self-Check: PASSED

- FOUND: supabase/migrations/20260930100000_phase4_retire_probe.sql, supabase/tests/phase4_retire.test.sql
- GONE: web/app/api/prov/elev/route.ts, web/app/api/prov/export/route.ts, web/app/pupil-probe-workspace.tsx, web/lib/server/pupil-probe.ts, web/lib/pupil-probe-model.ts, web/lib/pupil-probe-model.test.mjs
- FOUND: `2ddc0bd` och `78f1e18`, 2 commits uppmätta från `bd3ae0c`
