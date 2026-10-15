---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-06"
type: execute
status: planned
wave: 5
depends_on: ["CLASS-COHORT-03A", "CLASS-COHORT-04", "CLASS-COHORT-05"]
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - web/lib/server/class-cohort.ts
  - web/lib/server/class-cohort.test.mjs
  - web/app/api/klasser/organisation/underlag/route.ts
  - web/app/api/klasser/organisation/skapa/route.ts
  - web/app/api/klasser/organisation/status/route.ts
must_haves:
  truths:
    - "Direkta anrop har samma skolmandat som det synliga klassarbetet."
    - "Sparstatus hämtas säkert utan nya klasser eller utlämnade främmande kvitton."
  artifacts:
    - path: web/lib/server/class-cohort.ts
      provides: "Skyddat API för klassorganisation"
  key_links:
    - "Aktuellt skolmandat → exakt utbildning/kull → stabilt klass-ID → uttrycklig läsårs-/versionskoppling"
---

# Skyddat API för klassorganisation

<objective>
Direkta anrop har samma skolmandat som det synliga klassarbetet.
</objective>

<execution_context>
@/Users/petter.gjores/.codex/skills/gsd/workflows/execute-plan/SKILL.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-IMPLEMENTATION.md
@web/lib/server/authz.ts
@web/lib/server/class-timplan.ts
</context>

<tasks>
<task type="auto">
<name>Anslut tre begränsade Worker-rutter</name>
<files>web/lib/server/class-cohort.ts, web/app/api/klasser/organisation/underlag/route.ts, web/app/api/klasser/organisation/skapa/route.ts, web/app/api/klasser/organisation/status/route.ts</files>
<action>Använd protectedRoute och samma transaktions-/auditmönster som class-timplan. Underlag: HM/rektor/admin, mutating:false, required audit. Skapa: rektor/admin, mutating:true, MFA och CSRF, required audit. Status: rektor/admin, läsande required audit, aktuellt mandat; inga skrivomförsök via status och ingen ny klass vid MFA-statuskontroll. Strikt requestparse före SQL, exakt en rad och strikt svarparse i transaktionen; felaktigt DB-svar ska fail-closed. Exponera begripliga 409 för stale source/lifecycle, namn/läsår och datumlås; inga databasdetaljer i klientfel.</action>
<verify>Riktade routeprov och TypeScript; bekräfta alla tre SQL-signaturer mot plan04.</verify>
<done>UI kan läsa, skapa och utreda en osäker begäran via skyddade operationer utan nya rättigheter.</done>
</task>

<task type="auto">
<name>Pröva routegränser och kvittofel</name>
<files>web/lib/server/class-cohort.test.mjs</files>
<action>Prova CSRF/origin, session/uppdragsbyte, HM-skrivförsök, rektor annan skola, MFA före mutation, malformed request, SQL-konflikt, auditfel, fel reply och status från annan aktör. Mockprov bevisar adapterkontraktet; reservera faktisk Worker/SQL-verifiering för plan08.</action>
<verify>cd web && node --test lib/class-cohort.test.mjs lib/server/class-cohort.test.mjs lib/server/class-timplan.test.mjs; npx tsc --noEmit; npx oxlint app lib.</verify>
<done>Nekade eller osäkra svar kan inte bli success och alla säkerhetsgränser är testade.</done>
</task>

</tasks>

<verification>
Kör planens riktade kontroller mot aktuella källor. Bevara tidigare elev-/klass-/versionsdata; skriv endast syntetisk egen fixtur i avsedd isolerad miljö. Se SS12000-bilagan: SS 12000:2024, OpenAPI 2.1.0; intern en-utbildning-per-klass och legacydatum/namnnyckel är begränsningar, inte verifierat standardstöd. Ingen verklig kommunanslutning provas här.
</verification>

<success_criteria>
Direkta anrop har samma skolmandat som det synliga klassarbetet.
Sparstatus hämtas säkert utan nya klasser eller utlämnade främmande kvitton.
</success_criteria>

<output>
Skriv .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-06-SUMMARY.md med faktiskt resultat, kommandon/exitkoder, bevisreferenser, kvarstående gränser och SS12000-bedömning. Uppdatera paketets status proportionerligt. Versionshantera endast denna plans avgränsade ändringar; pusha aktuell gren och verifiera avsedd fjärrcommit enligt AGENTS.md.
</output>
