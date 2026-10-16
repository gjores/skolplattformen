---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-02
type: execute
wave: 2
depends_on: ["APL-01"]
files_modified: ["supabase/migrations/20261016120000_apl_planning.sql", "work/pilot/verify-apl-plan-commands.mjs"]
autonomous: true
status: in_progress
gap: APL-01
must_haves:
  truths: ["APL-planen sparas atomärt för exakt skolans timplansversion.", "Endast aktuellt skolmandat kan läsa eller bereda underlaget; en faktisk rektor beslutar förläggningen.", "Ett förlorat svar kan återhämtas utan dubbletter eller delvis sparade perioder."]
  artifacts: ["supabase/migrations/20261016120000_apl_planning.sql", "work/pilot/verify-apl-plan-commands.mjs"]
  key_links: ["Verifierad session → aktuellt mandat → skol-/utbildningsscope → låst timplan", "APL-kommando + expectedRevision → timplansrevision + innehåll + audit + immutable kvitto i samma transaktion", "Status/replay → aktuell mandatkontroll + samma identitet och exakta request"]
---

<objective>
Skapa additiv, initialt stängd SQL för versionsbundet APL-underlag. Aktivera inte nya Workergrants och installera inte i användarens aktiva databas.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md
@supabase/migrations/20261005110000_phase5_gym_timplan_transition.sql
@supabase/migrations/20261015201000_named_timplan_commands.sql
@supabase/migrations/20261015102000_class_cohort_commands.sql
@web/lib/server/authz.ts
</context>

<tasks>

<task type="auto">
<name>1. Skapa lagring och integritetsregler utan bakåtskrivning</name>
<files>supabase/migrations/20261016120000_apl_planning.sql</files>
<action>Utgå från 01:s färdiga parser-/hashhandoff; skapa inga egna JSON-shapes eller enumvärden. Inventera senare CREATE OR REPLACE-definitioner och verifiera ledigt migrationsnamn. Implementera kontraktets lagring för plan, period, innehåll, tidsallokering, rektorshändelse och requestbundet kvitto med stabila UUID. Alla objekt binds till exakt plan/skola/kund; rowKey/termin måste tillhöra planens frysta innehåll. Använd samma timplansrevision och låsordning som timcellerna. Gamla hours/planer/beslut/kvitton får inte omräknas eller få nya tidsstämplar. Legacy förekommer som explicit saknat underlag; utbildningsformen är okänd tills vald. RLS, grants och triggergränser ska neka direkt tabellåtkomst för ordinarie roller, service_role och Worker enligt befintligt skyddsmönster. Nya hjälpare/RPC är fortsatt stängda. Bevara klass-/organisations-ID:n och giltighet enligt SS 12000-avstämningen; skapa inget Placement-objekt.</action>
<verify>Granska DDL, FK, scope, grants och triggers. Installera endast i validerad privat schema-only-kopia med syntetiska förhandsrader; jämför originalsiffror, tidsstämplar, gamla ACL och händelser före/efter rollback. Ingen dataexport eller reset av användarmiljön.</verify>
<done>Lagring kan bära strukturerat underlag utan att tolka om gamla timmar eller tilldela nytt mandat.</done>
</task>

<task type="auto">
<name>2. Implementera atomisk läsning, sparning, rektorshändelse och kvitto</name>
<files>supabase/migrations/20261016120000_apl_planning.sql; work/pilot/verify-apl-plan-commands.mjs</files>
<action>Implementera phase5_apl_plan_read(uuid), phase5_apl_plan_command(jsonb) och phase5_apl_plan_status(jsonb) med strikt kontrakt. Beredning följer befintligt rektor/administrator-mandat; förläggningsbeslut kräver faktisk rektor på skolan; huvudman får ingen ny editbehörighet. En hel APL-plan sparas atomärt, med expectedRevision och commandId bundet till identitet, scope och exakt request. Rektorsbekräftelse binder kanoniskt innehåll, aktör och uppdrag. Spara ofullständigt granskningsunderlag men returnera uttryckliga blockerare; inga godtyckliga veckor från datum. Samma kommando ger samma immutable kvitto efter aktuell mandatkontroll. Återkallat/utgånget mandat nekar även status/replay. Auditfel och ogiltigt serversvar rullar tillbaka allt. Runnern använder endast egna syntetiska fixturer och kan köras mot ett explicit isolerat mål.</action>
<verify>Faktisk SQL: giltig spara/läs/återläs, rektorsbeslut, administrator nekad beslut, HM nekad skrivning, annan skola/kund, återkallat mandat, stale CAS, ändrat payload med samma ID, replay, trasig audit och felaktig relation. Två separata anslutningar provar överlappande save/save och save/rad; förloraren ger konflikt utan delskrivning. Fullare paketmatris sker i 07.</verify>
<done>Skyddade kommandon och återhämtning fungerar i isolerad SQL; inga nya entrypoints är aktiverade i användarmiljön.</done>
</task>

</tasks>

<verification>
APL1-02/03/04/05/06 har SQL-grund. Tillämplig standard är SS 12000:2024/OpenAPI 2.1.0; egna APL-objekt införs utan påstått standardutbyte.
Inventera aktuella definitioner vid start; äldre kodkartor och tidigare PASS är bakgrund. Läs kontraktets SS 12000-avstämning och bevara stabila skol-/klass-ID:n, giltighet och källansvar; inget externt standardutbyte verifieras av denna plan.
</verification>

<success_criteria>
- APL-planen sparas atomärt för exakt skolans timplansversion.
- Endast aktuellt skolmandat kan läsa eller bereda underlaget; en faktisk rektor beslutar förläggningen.
- Ett förlorat svar kan återhämtas utan dubbletter eller delvis sparade perioder.
- Uppgifternas verifiering är redovisad på faktisk provnivå; avvikelser och första fel döljs inte.
</success_criteria>

<output>
Skriv 05-APL-02-SUMMARY.md i samma katalog med ändrade filer, utförda kontroller, bevarande, avvikelser och nästa beroende. Samordnaren hanterar avgränsad commit/push och paketstatus.
</output>
