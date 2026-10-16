---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-04
type: execute
wave: 4
depends_on: ["APL-01", "APL-03"]
files_modified: ["web/lib/server/apl-plan.ts", "web/lib/server/apl-plan.test.mjs", "web/app/api/timplaner/gym/apl/lasa/route.ts", "web/app/api/timplaner/gym/apl/kommando/route.ts", "web/app/api/timplaner/gym/apl/status/route.ts", "supabase/migrations/20261016122000_apl_worker_access.sql"]
autonomous: true
status: planned
gap: APL-01
must_haves:
  truths: ["Sparat besked bygger på serverns kvitto och återläsning.", "Återladdning efter okänt svar återanvänder exakt request och samma kommando.", "Nya och historiska beslutsunderlag kan läsas säkert utan dold legacyfallback."]
  artifacts: ["web/lib/server/apl-plan.ts", "web/app/api/timplaner/gym/apl/kommando/route.ts", "supabase/migrations/20261016122000_apl_worker_access.sql"]
  key_links: ["protectedRoute MFA/CSRF/audit → APL-server → stängda SQL-kontrakt", "SQL-projektion → fryst katalog och oberoende TypeScriptvalidering → commit", "Status/replay → färskt mandat och oförändrat requestbundet kvitto"]
---

<objective>
Exponera en sammanhängande skyddad APL-API med strikt SQL-/TypeScriptparitet och säker återhämtning. Beslutsparsers och journal ägs parallella 04A; UI och samlatSQL-prov väntar på båda.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md
@web/lib/server/authz.ts
@web/lib/server/db.ts
@web/lib/server/gym-timplan.ts
@web/lib/named-timplan-journal.ts
@web/lib/server/plan-decision.ts
@supabase/migrations/20261015204000_worker_named_timplans.sql
</context>

<tasks>

<task type="auto">
<name>1. Implementera skyddad API och exakt aktiveringsmigration</name>
<files>web/lib/server/apl-plan.ts; web/lib/server/apl-plan.test.mjs; web/app/api/timplaner/gym/apl/lasa/route.ts; web/app/api/timplaner/gym/apl/kommando/route.ts; web/app/api/timplaner/gym/apl/status/route.ts; supabase/migrations/20261016122000_apl_worker_access.sql</files>
<action>Använd befintlig protectedRoute med MFA, CSRF för mutationer och required audit. Servern validerar exakt fryst källa och full APL-projektion före commit; klientcapabiliteter är visningsdata. Felaktig SQL-projektion får inte döljas av legacyfallback. Granska kontraktsstorlekar för bounded payload och tydliga400/403/409/503. Läs/status kontrollerar aktuellt mandat och immutabla kvitton; exponera inga främmande plan-ID:n. Sista migrationen ger Worker execute enbart för de tre avsedda entrypoints, inga tabellgrants eller hjälpargrants. Alla tre migrationer och Worker installeras sammanhängande i isolerat testmål; ingen aktivering i ordinarie miljö här.</action>
<verify>Node-serverprov för positiv read/save/confirm, nekade roller/skolor, CSRF/MFA, felaktig projektion, borttagna APL-fält/förfalskad kontraktsversion i nya requests/svar, auditfel och konflikt. Jämför installerade SQL-svar från 02/03 mot TS-parsers; verklig HTTP återstår08. Kontrollera grants med exakt differens, inte enbart att ett önskat grant finns.</verify>
<done>API:t använder faktisk serverbehörighet och fail-closed-paritet utan nya generella databasrättigheter.</done>
</task>

<task type="auto">
<name>2. Verifiera oberoende serverprojektion och minsta Workeråtkomst</name>
<files>web/lib/server/apl-plan.ts; web/lib/server/apl-plan.test.mjs; supabase/migrations/20261016122000_apl_worker_access.sql</files>
<action>Granska read/command/status i samma skyddade transaktion som audit och fryst katalog. Ett lagrat APL-kvitto ska granskas som det ögonblick som sparades, medan aktuellt planinnehåll återläses separat; senare ändringar får inte skrivas tillbaka från kvittot. Pröva serverns oberoende avvisning av felaktig minutallokering, främmande period/rowKey, falsk capability, fel contenthash och förfalskad kontraktsversion. Verifiera exakt tre Workergrants och noll nya tabell-/hjälpargrants; ordinarie roles kan inte anropa säkerhetsdefinerhjälpare direkt. Samordnaren integrerar04A:s parallella beslut/journal först efter bådas egna kontroller.</action>
<verify>Node-serverprov med verkliga parsers och felinjicerade SQL-svar; installerad SQL-/TypeScriptparitet från 02/03 och faktisk ACLinventering i isolerat mål. Kör node --test lib/server/apl-plan.test.mjs från web samt npx tsc --noEmit. Faktisk HTTP sker i 08, inte i dessa serverprov.</verify>
<done>Nya API-ytor stänger vid trasigt underlag och har exakt avsedd Workeråtkomst.</done>
</task>

</tasks>

<verification>
APL1-04/05/08 har validerade kontrakts- och routebevis. Inga unitmockar benämns faktisk Worker/OIDC.
Inventera aktuella definitioner vid start; äldre kodkartor och tidigare PASS är bakgrund. Läs kontraktets SS 12000-avstämning och bevara stabila skol-/klass-ID:n, giltighet och källansvar; inget externt standardutbyte verifieras av denna plan.
</verification>

<success_criteria>
- Sparat besked bygger på serverns kvitto och återläsning.
- Återladdning efter okänt svar återanvänder exakt request och samma kommando.
- Nya och historiska beslutsunderlag kan läsas säkert utan dold legacyfallback.
- Uppgifternas verifiering är redovisad på faktisk provnivå; avvikelser och första fel döljs inte.
</success_criteria>

<output>
Skriv 05-APL-04-SUMMARY.md i samma katalog med ändrade filer, utförda kontroller, bevarande, avvikelser och nästa beroende. Samordnaren hanterar avgränsad commit/push och paketstatus.
</output>
