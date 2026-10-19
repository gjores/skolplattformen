---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: PLANNING-YEAR-SHARED-GRIM
status: sql_rollback_pass_awaiting_install_approval
created: 2026-10-19
depends_on: PLANNING-BROWSER-FIXES (517f1b8)
---

# Delad GR/IM-utbildning i årslistan på tillagd skola

Kvarstående modellkonflikt från [05-PLANNING-BROWSER-FIXES-PLAN.md](05-PLANNING-BROWSER-FIXES-PLAN.md). En rektor på en skola som fått en grundskole- eller IM-utbildning via `offering_units` ser sin egen timplan bara via **Välj aktuell utkastmatris**, inte i årslistan eller årsöversikten.

## Verifierat nuläge (kod 09cf048)

- Senaste `phase5_planning_year_rows`: [20261016161000_timplan_time_v2_integration.sql:908](../../../supabase/migrations/20261016161000_timplan_time_v2_integration.sql). Rad 922 avgränsar GY via `offering_units` men GR/IM via `o.unit_id=u.id`. Mandatgränsen ligger i `join mandate_units m on m.unit_id=u.id and m.assignment_id=a.id` (rad 920).
- Timplanskandidaterna (`phase5_named_timplan_candidates`, [20261015203000:17](../../../supabase/migrations/20261015203000_named_timplan_reads.sql)) kräver redan `t.unit_id = planeringsskolan`. Klasser och klasskopplingar avgränsas också till planeringsskolan.
- Utkastlistan är `phase5_list_timplans` ([20261004141000](../../../supabase/migrations/20261004141000_phase5_timplan_units.sql)), inte `phase5_timplan_list`. Den kräver mandat på `t.unit_id`. Läsningen `phase5_timplan_scope` ([20261005110000:37](../../../supabase/migrations/20261005110000_phase5_gym_timplan_transition.sql)) gör samma sak. FK `timplans_offering_unit_linkage_fkey` binder varje timplan till en rad i `offering_units`.
- Programplansvyn tillåts bara för gymnasiet (`phase5_planning_year_validate`), så ändringen påverkar bara timplansvyn för GR/IM.

## Behövs backfill?

Nej. `offering_units` fick en rad per befintlig utbildning när tabellen skapades (20261004130000). Triggern `offering_primary_unit_insert` skapar raden för nya utbildningar, `offering_primary_unit_update` låser `offerings.unit_id` och `offering_units_primary_guard` stoppar borttagning av huvudskolan.

En läsande kontroll i en `begin read only … rollback`-transaktion mot den lokala skyddade pilotdatabasen gjordes 2026-10-19. Resultat: 6 GR, 1 IM och 31 GY, 0 utbildningar utan huvudskolerad, 0 delade GR/IM-rader i dag, 0 GR/IM-timplaner på tillagd skola och 0 timplaner utan länk. Alla tre triggerna är aktiva. Baslinjedatabasen saknar `offering_units` och berörs inte. Migrationen gör därför ingen backfill. Den avbryter i stället (fail-closed) om någon utbildning saknar huvudskolerad.

## Ändring

1. **Ny additiv migration** `supabase/migrations/20261019150000_planning_year_shared_grim_units.sql`:
   - Förkontroll: `raise exception` om någon `offerings`-rad saknar `offering_units` för `(id, unit_id, organizer_id)`.
   - `create or replace function public.phase5_planning_year_rows(jsonb)`. Den är ordagrant lika med definitionen från 20261016161000, med ett undantag: hela `case`-uttrycket på rad 922 ersätts med `exists(select 1 from public.offering_units ou where ou.offering_id=o.id and ou.unit_id=u.id)` för alla skolformer. Kommentaren ändras till att `offering_units` är relationen utbildning–skola för alla skolformer.
   - Inga nya tabeller, kolumner, grants eller dataändringar. `create or replace` behåller ACL:er; provet bekräftar det.
2. **Klient**: bara kommentaren i [protected-timplan-workspace.tsx:104](../../../web/app/protected-timplan-workspace.tsx) uppdateras. Beteendet behålls, så en uttryckligt vald utkastmatris kräver fortfarande ingen årsrad.
3. **Handbok** `docs/handbok/timplaner.md:193`: sista meningen om ursprunglig skola tas bort efter installation, och det ska framgå att årslistan visar skolans egen timplan. Kör `npm run docs:build`.

Förväntat beteende:
- Rektor på tillagd skola B ser rader för (utbildning, B) med B:s egna timplaner.
- Huvudman med mandat för flera skolor får en rad per skola som har en timplan.
- Ingen rad visar en annan skolas timplan eller klasser. I timplansvyn skapas inga rader för saknade planer, så en skola utan egen timplan får ingen tom rad.

## SS 12000-avstämning

SS 12000:2024, OpenAPI 2.1.0, enligt [05-CLASS-COHORT-SS12000.md](05-CLASS-COHORT-SS12000.md). Specifikationen hämtades inte på nytt.

| Internt | SS 12000 | Behandling |
| --- | --- | --- |
| `school_units.id` | `Organisation` (skolenhet), `OrganisationReference.id` | Raden hör till planeringsskolan som har mandat. Ingen skolidentitet härleds från `offerings.unit_id`. |
| `offerings` + `offering_units` | Ingen direkt mappning antas; närmast `Programme` och dess koppling till `Organisation` | `offering_units` blir enda relationen utbildning–skolenhet i årsläsningen, som för GY. `offerings.unit_id` är bara huvudskola, ingen exklusiv organisation. |
| Klass/klasskoppling | `Group` (`groupType: Klass`), `Group.organisation` | Oförändrat: `school_classes.unit_id` och `class_timplans.unit_id` måste vara planeringsskolan. |
| Timplan, årsrad | Utanför standardens objekt | Lokal planeringsmodell. Ingen export eller import påverkas. |

Konflikten löses genom att årsläsningen följer samma relation som utkastlista, läsning och skrivning. Ingen tyst avvikelse kvarstår. Inget externt informationsutbyte är verifierat.

## SQL-prov

Nytt `supabase/tests/phase5_planning_year_shared_grim.test.sql` (pgTAP, egen syntetisk fixtur, `rollback`). `phase5_planning_year.test.sql` och `…_read_performance.test.sql` ändras inte, eftersom verifieringsskript låser deras hashar. Fall:

1. GR-utbildning med huvudskola A, delad till B. B-rektorns timplan finns på B. B-rektorns årslista och översikt visar raden (utbildning, B, B:s plan).
2. Samma för IM (veckokolumn).
3. B-rektorn får ingen rad för A och ingen av A:s timplaner, klasser eller summor. A-rektorn får ingen rad för B.
4. En tredje rektor med mandat på C, där utbildningen inte ges, får ingen rad. Med `unitId` = B i frågan ger hen 42501, eftersom `phase5_planning_year_validate` kräver mandat på vald skola.
5. En huvudman med mandat för A och B får en rad per skola. Totalsummorna dubbelräknar inte.
6. Klassbunden GR-rad på B: `class_timplans`/`school_classes` på B räknas, och en A-klass med samma namn räknas inte.
7. Skolan B utan egen timplan ger ingen rad, inte heller en `missing-plan`-rad.
8. GY oförändrad: en delad GY-utbildning visas i programplansvyn på A och B för huvudmannen och bara på B för rektor B. GY-uttrycket i funktionen är dessutom ordagrant detsamma, vilket `diff` mot 20261016161000 visar.
9. A-rektorn ger 42501 när hen väljer skola B, på samma sätt som C-rektorn (fall 4).

Köraren [verify-planning-year-shared-grim.mjs](../../../work/pilot/verify-planning-year-shared-grim.mjs) prövar också följande, i en transaktion som alltid rullas tillbaka:

- Provet faller på sina påståenden före migrationen.
- Förkontrollen stoppar migrationen när en utbildning saknar huvudskolerad (savepoint).
- Bara `phase5_planning_year_rows` ändras. ACL:en, övriga funktioner i `public` och antalet rader i offerings, offering_units och timplans är oförändrade.
- Databasen är identisk efter rollback.

## Webbläsarprov

- Vid installation får `web/e2e/phase5-timplan.spec.ts` fall 11 ett tillägg (inte före, eftersom fallet annars faller på nuvarande databas): `/api/planering/oversikt` för skola 31 visar utbildning 40 med plan 55, och årslistan i UI:t visar raden. Fixturen `sharedSchool` räcker. Övriga fall ändras inte.
- Regression, sekventiellt på dator och telefon: phase5-timplan, phase5-planning-year (lists, other, context, gym) och phase5-gym-timplan.
- `node --test lib/*.test.mjs`, `npx tsc --noEmit`, `npx oxlint app lib`, skyddat bygge.

## Genomförande och godkännanden

1. **Klart:** migrationen, SQL-provet och köraren är skrivna. `diff` visar att funktionskroppen bara skiljer sig på scope-raden och kommentaren.
2. **Klart, godkänt 2026-10-19 ("ja gör så"):** migrationen och SQL-provet kördes mot den skyddade lokala pilotdatabasen i en transaktion som rullades tillbaka. Ingen ändring består.
3. **Kräver separat godkännande:** installera migrationen i den skyddade lokala pilotdatabasen. Lägg till tillägget i fall 11 och uppdatera klientkommentaren (`protected-timplan-workspace.tsx:104`) och handboken. Kör webbläsarproven och byt därefter appen på 3012.

Klart när: alla SQL-fall PASS i isolerad körning, webbläsarproven gröna på dator och telefon, handboken uppdaterad och STATE noterad. Det är lokalt syntetiskt bevis, inget pilot- eller IdP-bevis.

## Resultat 2026-10-19: SQL-prov med rollback

`node work/pilot/verify-planning-year-shared-grim.mjs` mot det skyddade lokala målet gav **PASS**:

- Alla 9 körarkontroller gick igenom.
- pgTAP **22/22** efter migrationen.
- Före migrationen föll 10 av 22. Det var just fallen för delad GR/IM, vilket visar att provet fångar felet.
- Källhashar: migration `fcfbc83e…cecc8`, prov `250792c8…40ce`.

Rapporten ligger i sessionens scratchpad som `run4.json`, SHA256 `fe38a661ab2cf390fff44fdc5603c93db00b293b6e70a391458b529f1d9055e1`.

Två tidigare körningar föll på provfel, inte på produktfel:

1. Huvudmannen saknade mandat på skola C och fick därför inte utse rektor där.
2. Jag hade räknat två förväntade IM-summor fel: 12 och 19 i stället för 14 och 21.

Båda rättades i provet. Inget av dem räknas som PASS.

Detta är lokalt syntetiskt bevis. Migrationen är inte installerad, och inga webbläsarprov är körda för ändringen.
