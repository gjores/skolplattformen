---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-UX-01
type: execute
wave: 1
depends_on: []
status: complete
autonomous: true
files_modified:
  - web/lib/apl-plan.ts
  - web/lib/apl-plan.test.mjs
  - web/lib/apl-plan-journal.test.mjs
  - supabase/migrations/20261016130000_apl_term_intent.sql
  - work/pilot/verify-apl-term-intent.mjs
must_haves:
  truths:
    - Terminsavsikt utan datum eller ämnen kan sparas och läsas i faktisk SQL.
    - Gamla hashvärden, journaler och kvitton bevaras exakt.
    - Datumkravet för rektorsbekräftelse består.
  artifacts:
    - web/lib/apl-plan.ts
    - supabase/migrations/20261016130000_apl_term_intent.sql
  key_links:
    - parse till canonical hash till SQL write och read
    - separat copy_structure INSERT till beständig terminsavsikt
---

<objective>
Gör terminsavsikt beständig med minsta bakåtkompatibla modell- och SQL-tillägg. APLUX-01, 02 och 04. Ingen aktiv installation i denna plan.
</objective>
<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-CONTEXT.md
@web/lib/apl-plan.ts
@web/lib/apl-plan-journal.ts
@supabase/migrations/20261016120000_apl_planning.sql
@supabase/migrations/20261016121000_apl_plan_decisions.sql
</context>
<tasks>
<task type="auto">
<name>Frys gamla bytes och inför valfri terminsavsikt</name>
<files>web/lib/apl-plan.ts, web/lib/apl-plan.test.mjs, web/lib/apl-plan-journal.test.mjs</files>
<action>Skriv först riktade fall för nytt valfritt plannedTermIndex 0..5, terminsutkast utan contents/allocations/datum, ogiltiga värden och getter/extra nycklar. Frys gammal canonical payload/contentHash och gammal journal/requestHash före ändringen. Inför fältet och nionde markerade komponent endast när det finns, enligt kontexten. Äldre parsning och oförändrad omsparning ska inte injicera nytt fält. Bekräftelse utan datum fortsätter vara blockerad. Ändrat terminsval ska ändra hash och kräva ny bekräftelse. Inga nya rättsliga eller generella datum-/terminsregler.</action>
<verify>Från web: node --test lib/apl-plan.test.mjs lib/apl-plan-journal.test.mjs, npx tsc --noEmit och riktad oxlint. Visa gammal exakt hash/recovery och nya giltiga/ogiltiga fall.</verify>
<done>Bakåtkompatibla representationer och nytt fält är modellverifierade.</done>
</task>
<task type="auto">
<name>Additiv lagring och båda kopierings-/sparvägarna</name>
<files>supabase/migrations/20261016130000_apl_term_intent.sql</files>
<action>Kontrollera ledigt migrationsnummer. Lägg nullable planned_term_index med CHECK 0..5 utan backfill. Läs senaste funktionskroppar och ändra endast phase5_apl_plan_parse, phase5_apl_plan_value, phase5_apl_hash_payload, phase5_apl_plan_command och phase5_apl_copy_structure där det behövs. Båda INSERT-vägarna tar med fältet; SQL-null utelämnar JSON-nyckeln. Bevara fulla mandat/lås/CAS/audit/permit/replay-grenar och gamla hashpayloads. Inga nya Workergrants, direkta tabellgrants eller RLS-undantag. Befintliga bekräftelseblockerare lämnas oförändrade.</action>
<verify>Inventera exakt ny kolumn och ersatta funktioner. Ingen DML/backfill eller oväntad ACL-ändring. Faktisk PostgreSQL verifieras i nästa task.</verify>
<done>En framåtriktad delta-migration finns; installerade migrationer ändras inte.</done>
</task>
<task type="auto">
<name>Faktisk SQL-paritet och originalbevarande</name>
<files>work/pilot/verify-apl-term-intent.mjs</files>
<action>Återanvänd befintligt ägt schema-only/syntetiskt runnerupplägg utan export av aktiva verksamhetsrader. Basen har redan tre installerade APL-migrationer: återinstallera dem inte. Gamla seedAplFull/approvedClassFixture försöker fastställa BF-timplan utan APL och är därför olämpliga. Använd den nya gemensamma UX-fixturen med godkänd programplan och BF-timplansutkast; komplett gammal bekräftelse/beslut byggs genom befintlig giltig APL-kedja, aldrig backdatering eller regelkringgående. Skapa före-deltamigrationsfixturer för gamla perioder, aktuell bekräftelse, APL-kommandokvitto och beslutskvitto. Prova efter isolerad migration: exakt gammalt read/replay/hash, ny tom terminsperiod, no-op, terminsändring, ny version/namngiven kopia, flerminperiod, vårstart, ogiltigt index, fel mandat, stale CAS och auditfel efter skrivning. Jämför SQL/TS canonical bytes och bekräftelsestatus, observera faktisk samtidighet för två skrivare och säkerställ ingen förlorad uppdatering. Alla ursprungliga kolumner/rader/tidsstämplar/ACL/kvitton jämförs före/efter. Källhashar och full ägd cleanup ingår; första felrapporter bevaras.</action>
<verify>Kör den nya runnern med explicit isolerat mål enligt dess CLI. Faktisk SQL, paritet, originalbevarande och cleanup ska alla PASS; mockad adapter räcker inte.</verify>
<done>Fältet sparas/återläses/kopieras utan fabricerade data. Historik, gamla hashvärden och mandat är bevarade. Aktiv databas orörd.</done>
</task>
</tasks>
<verification>SS 12000-gräns: endast intern planeringsavsikt, inga nya externa objekt eller faktiska giltighetsdatum. Bevisa hela parse→hash→write→read→copy→replay.</verification>
<success_criteria>APLUX-01/02/04 har modell- och faktisk SQL-evidens. UI/HTTP/leverans återstår.</success_criteria>
<output>Skriv 05-APL-UX-01-SUMMARY.md med faktisk verifiering och delta-inventering. Scoped commit/push enligt AGENTS; ingen runtime- eller aktiv DDL-ändring.</output>
