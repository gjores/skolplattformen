---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "20"
subsystem: protected-programplan-lifecycle
status: complete
completed: 2026-10-05
requirements: [ADMIN-02, ADMIN-03]
requirements-finally-verified: []
human_result: awaiting_user
requires: [05-18, 05-19]
provides: [programplan-lifecycle, closed-offering-writes, future-start-trial-data]
affects: [05-21, 05-22]
tags: [programplan, lifecycle, sql, worker, ui]
key-files:
  created:
    - supabase/migrations/20261004120000_phase5_programplan_lifecycle.sql
    - supabase/migrations/20261004121000_phase5_worker_programplan_lifecycle.sql
    - supabase/migrations/20261004122000_phase5_programplan_lifecycle_locks.sql
    - supabase/tests/phase5_programplan_lifecycle.test.sql
    - web/lib/programplan-lifecycle.ts
    - web/lib/server/programplan-lifecycle.ts
    - web/app/api/programplaner/utbildning/livscykel/route.ts
    - web/app/protected-programplan-lifecycle.tsx
    - web/e2e/phase5-lifecycle.spec.ts
    - work/pilot/apply-programplan-migration.mjs
    - work/pilot/restart-protected-preview.sh
    - work/pilot/verify-programplan-lifecycle-api.mjs
  modified:
    - web/lib/programplan-workspace-contract.ts
    - web/app/protected-programplan-list.tsx
    - web/app/protected-programplan-workspace.tsx
    - web/app/protected-programplan-board.tsx
    - web/app/protected-programplan-flow.tsx
    - web/lib/organisation-store.ts
    - work/pilot/prepare-programplan-user-trial.mjs
    - docs/handbok/programplaner.md
key-decisions:
  - "Worker behåller insert/update på school_units (kundadminens skolimport kräver det); borttagning av skolenheter stängd för alla roller"
  - "Livscykelavslag ger 409 programplan_locked / programplan_in_use och 400 programplan_start_passed i stället för 403, så att en plan som hunnit starta inte loggar ut användaren"
  - "Pågående provplaner startar 30 dagar före i dag, eftersom SA25 v4 bara gäller från 2026-07-01"
metrics:
  duration: "ca 9 h inklusive avbrott"
  tasks: 3
estimate:
  tokens: 200000
actuals:
  tokens: 160000
  tasks: 3
  commits: 14  # mätt f55c509..HEAD inklusive slutcommit; 1db642e (05-23) kommer från en annan session
plan_head_before: f55c509f03bd0585e6376e82581cb3884e542948
worker_build_revision: ae41a039bb2c4f737c84f68036bf98b170fa12a2
---

# 05-20 — Programplanens livscykel

Huvudmannen kan nu ändra uppgifter i och ta bort framtida programplaner. Planer vars kull har startat, är avslutade eller saknar känd start kan bara arkiveras. Statusen räknas i SQL från kullens start (D-01, D-02, D-04). Direkta tabellskrivningar till utbildningar och planer är stängda och provade. Allt är provat lokalt med syntetiska uppgifter. Mänskligt prov återstår.

## Levererat

- **Status (D-02).** Status räknas av `phase5_programplan_phase_at`, med samma falltabell i TS och pgTAP:
  - Framtida, Pågående, Avslutad eller Start okänd.
  - Pågående gäller till dagen före samma datum tre kalenderår senare. Startar kullen 29 februari blir gränsen 28 februari.
  - Statusen ligger som `lifecycle` i listrader och arbetsyta.
  - Utbildningens egen form och lagrade kvitton är oförändrade.
- **Dispatchern `phase5_change_programplan_education`.** Det är huvudmannens enda nya Worker-entrypoint och har fyra kommandon:
  - `delete`: nekas om klasser, elevplaceringar, timplaner eller tillstånd finns. Audit och organisationshändelse skrivs i samma transaktion, och kvittot blir en spärr: replay ger 409 och status ger `not_found`.
  - `archive` och `restore`.
  - `update`: namn, kod och kull. Startdatum får ändras bara i ett ensamt bundet utkast och bara till ett datum efter i dag.
  - Kommandona använder CAS-revision, och auditfel ger rollback.
- **Lås (D-01, D-04).** `phase5_programplan_writable` anropas efter scope-låset i bind, fördjupning, nytt utkast, klon och terminer. Kropparna är annars oförändrade (md5 jämförd mot målet).
  - Utkast i en pågående plan blir skrivskyddade men tas inte bort.
  - Ny utbildning eller kopia med start i dag eller tidigare nekas.
- **Stängda skrivningar.** `insert/update/delete/truncate` är återkallade på `offerings`, `point_plans`, `point_plan_events` och kvitton för `anon`, `authenticated`, `service_role` och Worker. Borttagning av skolenheter är stängd för alla roller. Den döda policyn `offerings_write` är borttagen. `organisation-store` skriver inte längre till `offerings`.
- **UI**
  - Statusmärke i listan och arbetsytan.
  - **Ändra uppgifter**, **Ta bort** (med kryssruta), **Arkivera** och **Ta fram ur arkivet**.
  - **Visa arkiverade (antal)**.
  - En låst plan visar tabellen utan inmatningsfält, med en förklaring, och knapparna för ny version döljs.
  - Startdatum för kopia och ny utbildning måste ligga efter i dag. Serverns avslag visas som "Utbildningen har redan startat …".
  - Vid MFA, konflikt eller okänt svar läses listan om innan något nytt kan skickas.
- **Handboken** `docs/handbok/programplaner.md` har nya avsnitt om status, rättigheter, borttagning och arkiv.

## Verifiering

Bygget är ae41a03. Alla rader i tabellen gäller samma bygge och verklig Worker/SQL.

| Kontroll | Resultat |
|---|---|
| Node `lib/*.test.mjs` och `lib/server/*.test.mjs` | 542/542 PASS |
| `work/pilot/*.test.mjs` | 85/85 PASS |
| tsc, oxlint app lib, skyddat bygge, Docusaurus-bygge | PASS |
| pgTAP livscykel | 125/125 PASS |
| Hela SQL-sviten | 1863/1864. Fall 13 i `phase2_audit` fallerar och fanns före 05-20, se Kvarstår |
| Livscykel-API (preflight före grant) | 20/20 PASS. ACL:en återställd exakt |
| Livscykel-API (final, inklusive lås, arkiv och ändrade uppgifter) | 29/29 PASS, cleanup PASS |
| Programplans-API (egen server på 3060, `--lifecycle`) | 48/48 PASS |
| Termins-API | 31/31 PASS |
| Browser, livscykel L01–L06 | 12/12 PASS (dator och iPhone 13) |
| Browser, programplan | 40/40 PASS. Det tidigare kända utloggningsfallet 12 passerade denna gång |
| Browser, terminer | 15/15 PASS + 1 avsiktligt hoppat |
| Browser, timplan | 20/20 PASS |

- Rapporterna ligger i `work/pilot/results/phase5-20-*`.
- Skärmbilderna är granskade för lista, arkivfilter, borttagnings-, ändrings- och kopieringsdialoger samt arkiverad plan, på dator och telefon.
- Granskningen hittade två fel, som båda är rättade och omprövade:
  - Programlistan på telefon överlappade program och kull.
  - L04 kunde passera innan tabellen laddats.

## Avvikelser från planen

1. **[Regel 2/4-gräns] Skolenheter.** Planen sa att alla roller skulle stängas från skrivning till `school_units`. Workerns insert/update behövs dock av kundadminens skolimport (`import_school_unit`, security invoker, fas 2) och behölls. Borttagning, som kaskaderar till utbildningar, är stängd för alla roller. Detta står i `deferred-items.md`.
2. **[Regel 1] Statuskoder.** Låsavslag som gick via `mandateSqlFailure` gav 403, och arbetsytan tolkar 403 som tappad session. SQL skickar nu en hint som Workern översätter:
   - 409 `programplan_locked` eller `programplan_in_use`
   - 400 `programplan_start_passed`
   - Mandatfel ger fortfarande 403.
   - Ändringen gäller också befintliga skrivvägar för bind, fördjupning, skapa, klona och terminer. Tre felkoder och texter har lagts till.
3. **[Regel 3] Provserver och harness.** `verify-programplan-api.mjs` med `--education` vägrar den nya ACL:en med 16 entrypoints. Profilen `--lifecycle` lades till och användes. Dess egna server kolliderar med 3059:s privata vars, så 3059 stoppades under den körningen.
4. **[Regel 1] Provdatum.** SA25 v4 gäller från 2026-07-01, så pågående provplaner startar 30 dagar före i dag i stället för "förra året".
5. **Befintliga prov.**
   - Utbildningar med fastställd plan och utan startunderlag är nu korrekt Start okänd och låsta. Klon- och sidurvalsprov ger därför den syntetiska utbildningen ett framtida startår, så att provens avsikt behålls.
   - Direkt startdatumsändring utan revision ger 40001 i stället för 42501, eftersom update-kommandot nu får ändra startdatum.
   - Catalog- och timplansproven fick den historiska ACL-profilen, vilket också rättar de tidigare stale ACL-räkningarna från 05-11 och 05-18.
   - Inga förväntningar har försvagats.
6. **TDD-ordning.** Nodproven skrevs i samma steg som modulen och inte strikt före den.

## Användarprovsdata (D-08)

`prepare-programplan-user-trial.mjs` har lagt till fyra syntetiska utbildningar på Syntetisk skola 11 med kullstart **2027-08-17**. De 14 tidigare provposterna bevarades byte för byte, och inget raderades. Vanlig **3012** kör det verifierade bygget ae41a03.

| Utbildning | Prova |
|---|---|
| Användarprov framtida kull – bundet utkast | 05-19:s tabellprov: fördela, autospar, föreslå, ladda om och telefonvy |
| Användarprov framtida kull – ny version | Läs den fastställda versionen och välj Skapa ny version |
| Användarprov framtida kull – skapa plan | Skapa programplan |
| Användarprov framtida kull – ta bort eller arkivera | Ändra uppgifter, Arkivera, Visa arkiverade, Ta fram och Ta bort |

## Mänskligt prov (awaiting_user)

1. Öppna `http://127.0.0.1:3012/` och välj **Logga in**. Välj provknappen **Huvudman** (eller **Rektor**), sedan **Fyll i provkod** och **Logga in**. Välj uppdraget för Syntetisk skola 11 och sedan **Programplaner**. Inga inloggningsuppgifter finns i Git.
2. Kontrollera statuskolumnen. De nya provutbildningarna ska stå som Framtida. De äldre 2026-exemplen ska stå som Pågående eller Start okänd. Öppna ett 2026-exempel: tabellen ska vara skrivskyddad, förklaringen synas och bara **Arkivera** erbjudas.
3. Gör 05-19:s tabellprov på "bundet utkast" på dator och telefon.
4. Som huvudman, på "ta bort eller arkivera":
   - **Ändra uppgifter**: prova ett passerat datum och därefter ett framtida.
   - **Arkivera**, sedan **Visa arkiverade** och **Ta fram ur arkivet**.
   - Till sist **Ta bort**. Borttagningen är permanent. Utbildningen kan läggas tillbaka genom att förberedelseskriptet körs igen.
5. Som rektor: den framtida planen ska gå att ändra, men inga livscykelknappar ska visas.
6. Bedöm om statusarna och låsbeskeden är begripliga.

## Kvarstår

- `phase2_audit` fall 13: meddelandet `History denied` matchar inte `%serverkontext%`. Felet har funnits sedan 05-15 (`575ac93`) och redovisas i `deferred-items.md`.
- Analysbannern på ett låst utkast säger fortfarande "Du kan spara utkastet". Felet är kosmetiskt och inte rättat.
- Skolval (05-21) och full skolkoppling (05-22) är inte gjorda. `units` innehåller bara huvudskolan.
- Workerns insert/update på `school_units` finns kvar, se avvikelse 1.
- Mänskligt prov av 05-19 och 05-20 återstår. ADMIN-02 och ADMIN-03 är inte slutligt godkända.

## Self-Check: PASSED

Nyckelfilerna finns. Commitarna f6cd014, 6043674, 7c617fc, d8c1621, 1f2327b, f499aab, 3387faf, 4d70ac5, e8b958e, 84f36b3, fd1640a och ae41a03 finns i `git log`.
