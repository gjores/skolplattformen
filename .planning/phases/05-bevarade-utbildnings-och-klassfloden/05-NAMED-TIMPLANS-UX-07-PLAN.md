---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-07
type: execute
wave: 6
depends_on: ["NAMED-TIMPLANS-UX-03", "NAMED-TIMPLANS-UX-04", "NAMED-TIMPLANS-UX-05", "NAMED-TIMPLANS-UX-06"]
files_modified: ["web/lib/server/named-timplan.ts", "web/lib/server/named-timplan.test.mjs", "web/app/api/timplaner/gym/planer/skapa/route.ts", "web/app/api/timplaner/gym/planer/namn/route.ts", "web/lib/server/gym-timplan.ts", "web/lib/server/gym-timplan.test.mjs", "web/lib/server/plan-decision.ts", "web/lib/server/plan-decision.test.mjs", "web/lib/server/planning-year.ts", "web/lib/server/class-timplan.ts", "supabase/migrations/20261015204000_worker_named_timplans.sql"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["Rektor/skoladministratör kan skapa och namnge plan inom befintlig skola.", "Obehöriga och gamla underlag nekas utan delskrivning.", "HTTPsvaret skiljer exakt sparad version från seriens aktuella namn."]
  artifacts: ["web/lib/server/named-timplan.ts", "web/lib/server/named-timplan.test.mjs", "web/app/api/timplaner/gym/planer/skapa/route.ts", "web/app/api/timplaner/gym/planer/namn/route.ts", "web/lib/server/gym-timplan.ts", "web/lib/server/gym-timplan.test.mjs", "web/lib/server/plan-decision.ts", "web/lib/server/plan-decision.test.mjs", "web/lib/server/planning-year.ts", "web/lib/server/class-timplan.ts", "supabase/migrations/20261015204000_worker_named_timplans.sql"]
  key_links: ["Nya skyddade create-/renamevägar och exakt grant", "Samordna serverprojektioner och gamla versionsvägen"]
---

<objective>
Koppla skyddad HTTP till namngivna timplaner med oförändrat mandat och strikt svarskontroll.

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
<name>1. Nya skyddade create-/renamevägar och exakt grant</name>
<files>web/lib/server/named-timplan.ts, web/lib/server/named-timplan.test.mjs, web/app/api/timplaner/gym/planer/skapa/route.ts, web/app/api/timplaner/gym/planer/namn/route.ts, supabase/migrations/20261015204000_worker_named_timplans.sql</files>
<action>Lägg POST /api/timplaner/gym/planer/skapa och /namn enligt06:s kontrakt. Använd protectedRoute mutating:true,mfa:true,audit:required,functions rektor/administrator och nuvarande sessions-/kund-/skolkontext. SQL är slutlig mandat-/käll-/unikhetsauktoritet. Ge skolplattform_worker endast de två nya entrypoints som behövs; helpers/serietabell/kvitton är stängda. Project/validera varje SQLresultat inne i samma transaktion före commit. Namnkonflikt och revision/source-konflikt blir tydliga svenska409besked med bibehållen maskning av obehörig scope. Definiera strikta svar: create reply enligt befintligt GymCreateReply plus series, plan enligt nytt GymTimplan; rename reply={planId,series,replayed}, verifiera requestens plan/serie/name/revision. Kvitto är bundet till exaktrequest och återförs vid samma commandId även efter nätavbrott.</action>
<verify>Serverprov: roller, fel kund/skola, återkallat mandat/MFA, CSRF/JSONshape, duplicate name, auditfail, felaktig SQLresponse samt requestreplay och osäkert nätutfall. SQLgrantinventering före/efter, ingen direkt tabellwrite.</verify>
<done>Nya APIvägar har samma skydd som tidigare timplansskapande och kan återhämta exakt samma kommando.</done>
</task>

<task type="auto">
<name>2. Samordna serverprojektioner och gamla versionsvägen</name>
<files>web/lib/server/gym-timplan.ts, web/lib/server/gym-timplan.test.mjs, web/lib/server/plan-decision.ts, web/lib/server/plan-decision.test.mjs, web/lib/server/planning-year.ts, web/lib/server/class-timplan.ts</files>
<action>Uppdatera gymserverns råprojektion och befintliga createversionsväg, plan-decision DETAIL_KEYS/projectSource och planerings-/klassadaptrar för06:s explicit nya shapes. Vid aktiverad nySQL får saknadseries inte tyst falla tillbaka till legacy. Ny copyFrom-matris bedöms mot frysta rader/terminer; servern ändrar aldrig poäng. Namnrevision i beslutshash ska säkert fångas som konflikt. Inga nya rollgrants, lärarmandat eller huvudmannaklassmandat. Behåll gamla endpointen för gamla explicita versionskommandon; nullpredecessor får inte skapa en godtycklig serie.</action>
<verify>Kör nya serverprov plus gym-timplan, class-timplan, plan-decision och planning-year serversviter, npx tsc --noEmit och npx oxlint app lib. Simulerade DB/sessionprov redovisas som sådana; verklig HTTP/OIDC i11.</verify>
<done>Alla skyddade konsumenter tolkar samma serie/källa/version och råa olagliga SQLsvar avbryter transaktionen.</done>
</task>

</tasks>

<verification>
Serverprov: roller, fel kund/skola, återkallat mandat/MFA, CSRF/JSONshape, duplicate name, auditfail, felaktig SQLresponse samt requestreplay och osäkert nätutfall. SQLgrantinventering före/efter, ingen direkt tabellwrite. Kör nya serverprov plus gym-timplan, class-timplan, plan-decision och planning-year serversviter, npx tsc --noEmit och npx oxlint app lib. Simulerade DB/sessionprov redovisas som sådana; verklig HTTP/OIDC i11.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- Rektor/skoladministratör kan skapa och namnge plan inom befintlig skola.
- Obehöriga och gamla underlag nekas utan delskrivning.
- HTTPsvaret skiljer exakt sparad version från seriens aktuella namn.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-07-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
