---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-04
type: execute
wave: 2
depends_on: ["TJANST-01", "TJANST-02"]
files_modified: ["supabase/migrations/20261016130000_tjanst_personal_avtal.sql", "work/pilot/verify-tjanst-personal-avtal.mjs"]
autonomous: true
status: planned
gap: TJANST-T1T2
must_haves:
  truths: ["Personalresurser, anställningar och flera avtalsprofiler sparas beständigt utan nya användarkonton.", "Huvudmannen väljer avtal; rektor arbetar inom sin skola och de avtalsprofiler som faktiskt gäller.", "Profilbyte och periodändring lämnar historiska versioner intakta och kan återhämtas efter tappat svar."]
  artifacts: ["supabase/migrations/20261016130000_tjanst_personal_avtal.sql", "work/pilot/verify-tjanst-personal-avtal.mjs"]
  key_links: ["Levande session/mandat → kund/skola → versionerat personal-/avtalskommando", "Anställningsperiod → en budgetidentitet → flera skolandelar", "commandId + exakt request + aktör → immutable kvitto + atomisk audit"]
---

<objective>
Skapa additiv SQL för personal, anställning, tidsperioder och huvudmannens avtalsval. Alla nya entrypoints förblir stängda tills09; egenidentitetsbindning och self-mandat ägs04A.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/CONCERNS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@web/lib/tjanst-personal.ts
@web/lib/tjanst-avtal.ts
@supabase/migrations/20261015102000_class_cohort_commands.sql
@work/pilot/verify-target.mjs
</context>

<tasks>
<task type="auto">
<name>1. Skapa versionsbunden personal-/avtalslagring med stängda direkta vägar</name>
<files>supabase/migrations/20261016130000_tjanst_personal_avtal.sql</files>
<action>Inventera aktuellt schema, senare funktionsdefinitioner och ledigt migrationsnamn före implementation. Skapa tjanst_-tabeller enligt01/02 och kontraktet för personalresurs, externa ID/källor, anställning, perioder, gemensam periodbudget, skolandelar, avtalsfamilj/version, huvudmannens tillämpliga profilval, lokala överenskommelser, revisioner och requestkvitton. Källbelagda mallar införs som mallar utan att koppla någon verklig huvudman automatiskt. Använd sammansatt kund-/föräldraintegritet, explicita giltighetsvillkor, begränsade textfält och skydd för historiskt refererade versioner. Budgetramens identitet ska delas av skolandelarna och kapaciteten får inte dupliceras av ytterligare skola. Direkt tabell-/helperåtkomst nekas PUBLIC,anon,authenticated,service_role och skolplattform_worker enligt befintligt skyddsmönster; ingen ny bred RLS-policy. Gamla uppdrag, identiteter, elever, klasser och timplaner skrivs inte om.04A äger explicit self-bindning och åtkomstscope; inga namnmatchningar, nya authkonton eller nya lärarmandat här.</action>
<verify>Granska FK, unikhet, periodvillkor och full grant-differens. DDL körs först med rollback i explicit validerad isolerad schema-only-databas med syntetiska förhandsrader; jämför tidigare tabellrader inklusive tidsstämplar, funktioner och ACL. Ingen reset eller dataexport från användarens aktiva miljö.</verify>
<done>Person och avtal kan lagras med stabila identiteter utan åtkomstutvidgning eller historikförlust.</done>
</task>

<task type="auto">
<name>2. Implementera sex stängda personal-/avtalsentrypoints och kommandoprov</name>
<files>supabase/migrations/20261016130000_tjanst_personal_avtal.sql; work/pilot/verify-tjanst-personal-avtal.mjs</files>
<action>Implementera public.tjanst_personal_read/command/status(jsonb) och tjanst_avtal_read/command/status(jsonb), exakt01/02-parsers. Huvudmannen förvaltar giltiga avtalsprofiler/ramar; rektor bereder egna skolans resurser och använder endast tillämpliga profiler; administrator följer kontraktets uttryckliga beredningsrätt och får ingen avtals-/beslutsrätt. Kontrollera aktuellt mandat efter relevanta lås, inte enbart klientroll. CAS skyddar revisioner; commandId binds till exakt request, identitet, uppdrag och scope. Samma ID med annat innehåll nekar, replay/status prövar färskt mandat och återger historiskt kvitto utan att återställa dagens data. Audit och skrivning är samma transaktion; auditfel rullar tillbaka. Avtalsbyte som används i tjänsteplan kräver ny version/period och markerar berört underlag för omprövning genom revisionsreferensen. Runnern har explicit målvalidering, endast egna syntetiska fixturer och säker cleanup; inga hemligheter eller personuppgifter i resultat.</action>
<verify>Faktisk SQL: HM med två avtal, rektor egna skolan, fel kund/skola, rektor nekad profilaktivering, lärare nekad personlista, avslutat mandat, samtidig ändring, konflikt/replay, auditfel, främmande förälder, periodöverlappar och olika skolandelar i samma budget. Kör node work/pilot/verify-tjanst-personal-avtal.mjs mot runnerns dokumenterade isolerade mål. Alla sex entrypoints ska fortfarande sakna Workergrant.</verify>
<done>Person-/avtalssparning och återhämtning fungerar transaktionellt med riktiga SQL-bevis och stängd aktivering.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
Lokal kravspårning: TJ1-01/02/09.
Behöver:01/02:s frysta typer och testvektorer. Skapar: personal-/avtalsSQL som04A/05/07 behöver. TID-04/07/08 prövas på SQL-nivå; full installerad paritet och HTTP09 återstår. Bevara SS12000-relevanta Person-/Organisation-/Duty-identiteter, giltighet och skrivansvar; ingen anslutning påstås.
</verification>

<success_criteria>
- Sex entrypoints använder korrekt mandat, CAS, atomisk audit och requestbundet kvitto.
- Flera avtal och skolandelar kan användas utan dubbla budgetramar.
- Nya tabeller och funktioner förblir stängda för ordinarie direkta klientvägar.
</success_criteria>

<output>
Skriv 05-TJANST-04-SUMMARY.md med schema-/funktionsinventering, låsordning, testresultat och exakt avsedd aktivering. Samordnaren hanterar commit/push.
</output>
