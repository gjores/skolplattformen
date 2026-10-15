---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-04
type: execute
wave: 3
depends_on: ["NAMED-TIMPLANS-UX-03"]
files_modified: ["supabase/migrations/20261015202000_named_timplan_decisions.sql", "supabase/tests/phase5_named_timplan_decisions.test.sql", "work/pilot/verify-named-timplan-decisions.mjs"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["A-klassens nya timplansversion kan inte ersätta B-klassens plan.", "Namn och versionsnummer syns tillsammans i beslutsunderlaget.", "Samma mandat, källkontroller och revisionskonflikter gäller även vid parallella planer."]
  artifacts: ["supabase/migrations/20261015202000_named_timplan_decisions.sql", "supabase/tests/phase5_named_timplan_decisions.test.sql", "work/pilot/verify-named-timplan-decisions.mjs"]
  key_links: ["Begränsa fastställande och samtidighetslås till rätt serie", "Bevara beslutsunderlag, historik och källbyte"]
---

<objective>
Aktivera oberoende versions- och beslutskedjor i en transaktion.

Resultatet ingår i det avgränsade gapet, inte i ett automatiskt godkännande av hela fas 5.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md
</context>

<tasks>

<task type="auto">
<name>1. Begränsa fastställande och samtidighetslås till rätt serie</name>
<files>supabase/migrations/20261015202000_named_timplan_decisions.sql, supabase/tests/phase5_named_timplan_decisions.test.sql</files>
<action>Uppdatera phase5_plan_decision_command från20261012180100_plan_decision_command_fix.sql: fastställande ersätter endast annan fastställd version inom samma series_id, aldrig annan namngiven plan. Bevara plan_decision_write_permits, programplansgrenen, säkerhetskontroller och källinnehållets hash. Byt först nu de gamla offering/unit-version-, one_open- och one_decidedbegränsningarna till serie+version respektive serie (öppen/fastställd). Explicit säkra att GY är enda nya användarväg för parallella serier; GR/IM gamla defaultkedjor och rättigheter består. Nya namedkommandon behålls stängda utan Workergrant genom04–05; inga separata04schemaändringar installeras i aktiv användarapp före sammanhängande11-verifiering och12-leverans. Serie måste låsas före versionskontroll; samtidiga versioner inom samma serie kan inte båda vinna, olika serier får aldrig ersätta varandra även om gemensamma mandat/källås serialiserar dem.</action>
<verify>Kör03+04 samlat i rollback: A1 och B1 fastställs samtidigt som logiskt tillstånd; A2 ersätter endast A1, B1/celler/beslut/länkar exakta. Dubbel öppen/fastställd inom samma serie nekas. GR/IM och programplansbeslut regresseras. Verkliga tvåsessionslås väntar till installerad11.</verify>
<done>Samma skola/utbildning kan ha två fastställda serier utan att beslutskedjan bryts.</done>
</task>

<task type="auto">
<name>2. Bevara beslutsunderlag, historik och källbyte</name>
<files>supabase/migrations/20261015202000_named_timplan_decisions.sql, supabase/tests/phase5_named_timplan_decisions.test.sql, work/pilot/verify-named-timplan-decisions.mjs</files>
<action>Inventera senaste phase5_plan_decision_detail i20261012200000_plan_decision_vocational.sql, phase5_plan_decision_source_content, phase5_gym_timplan_guard och phase5_plan_decision_items/page/inbox i20261012220000_plan_decision_search.sql. Beslut/read/inbox visar nested series med aktuellt namn och separat historiskt beslutnamn om registrerat; äldre namn okända får inte fabriceras. Omdöpning under inskickat underlag ska göra gammal basisHash/kontrollvy inaktuell utan att redigera tidigare review/history; om root väljer namn fristående från beslutsinnehåll måste det uttryckligt testas och snapshot visas vid beslut. Rekommenderat: inkludera series revision/name i nytt beslutsunderlag och dess hash, snapshot i nya historikhändelser. Ny programkälla ger källändringsstatus separat för varje timplansserie; ingen automatisk rebase eller klassflytt.</action>
<verify>SQLprov för draft→submitted→returned→draft→approved i A och B; rename före approve ger konflikt/readrefresh, gamla beslut/history oförändrade, källändring/currentsource följer båda med bevarad frozenbasis. Auditfel rullar tillbaka hela beslutet.</verify>
<done>Beslutslistan identifierar rätt namngiven plan; användaren kan granska exakt serie/version/källa innan beslut.</done>
</task>

</tasks>

<verification>
Kör03+04 samlat i rollback: A1 och B1 fastställs samtidigt som logiskt tillstånd; A2 ersätter endast A1, B1/celler/beslut/länkar exakta. Dubbel öppen/fastställd inom samma serie nekas. GR/IM och programplansbeslut regresseras. Verkliga tvåsessionslås väntar till installerad11. SQLprov för draft→submitted→returned→draft→approved i A och B; rename före approve ger konflikt/readrefresh, gamla beslut/history oförändrade, källändring/currentsource följer båda med bevarad frozenbasis. Auditfel rullar tillbaka hela beslutet.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- A-klassens nya timplansversion kan inte ersätta B-klassens plan.
- Namn och versionsnummer syns tillsammans i beslutsunderlaget.
- Samma mandat, källkontroller och revisionskonflikter gäller även vid parallella planer.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-04-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
