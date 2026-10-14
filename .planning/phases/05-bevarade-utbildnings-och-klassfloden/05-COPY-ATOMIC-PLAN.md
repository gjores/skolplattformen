---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: COPY-ATOMIC
type: execute
status: planned
wave: 1
depends_on: ["OPERATIONAL-06"]
requirements: [ADMIN-03]
gap_closure: true
autonomous: true
files_modified:
  - supabase/migrations/20261014100000_phase5_atomic_cohort_copy.sql
  - supabase/migrations/20261014101000_phase5_worker_atomic_cohort_copy.sql
  - web/lib/programplan-copy.ts
  - web/lib/programplan-copy.test.mjs
  - web/lib/server/programplan-copy.ts
  - web/lib/server/programplan-copy.test.mjs
  - web/app/api/programplaner/utbildning/kopiera/route.ts
  - web/app/api/programplaner/utbildning/kopiera/status/route.ts
  - web/app/protected-programplan-workspace.tsx
  - web/e2e/phase5-programplan-frame.spec.ts
  - web/e2e/programplan-copy.spec.ts
  - web/e2e/fixtures/programplan-copy-preview.tsx
  - web/e2e/fixtures/programplan-copy-preview.html
  - web/playwright.programplan-copy.config.ts
  - work/pilot/verify-atomic-cohort-copy.mjs
  - work/pilot/verify-programplan-copy-api.mjs
  - work/pilot/apply-atomic-cohort-copy.mjs
  - docs/handbok/programplaner.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-ATOMIC-SUMMARY.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-ATOMIC-VERIFICATION.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-CLASS-USER-TRIAL.md
  - .planning/STATE.md
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
must_haves:
  truths:
    - "Huvudmannen får en komplett ny kull med ram, terminer och skolor, eller ingen kopia alls."
    - "Sparandet använder exakt den källplan och de revisioner som huvudmannen granskade."
    - "Ett förlorat svar kan återläsas utan dubbletter, delkopior eller efterhandskomplettering."
    - "Original, elever, klasser, timplaner, tidigare beslut och paketuppgifter ändras inte."
    - "Den prövade appen och ett konkret nytt användarprov finns innan mänsklig bedömning efterfrågas."
  artifacts:
    - path: supabase/migrations/20261014100000_phase5_atomic_cohort_copy.sql
      provides: "Atomärt SQL-kommando med läsande status och requestbundet kvitto"
    - path: web/lib/programplan-copy.ts
      provides: "Strikt käll-/målrequest, immutable skapandekvitto och exakt återläsning"
    - path: web/app/protected-programplan-workspace.tsx
      provides: "En samlad kopieringsbegäran med säker återhämtning"
    - path: .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-ATOMIC-VERIFICATION.md
      provides: "Färska positiva, negativa och bevarandeprov med avgränsad kravspårning"
  key_links:
    - "Sparad källplan + utbildningsrevision → låst serverkälla → ram/terminer/skolor i en transaktion"
    - "Samma fulla kopieringsrequest → immutable receipt → replay eller status utan kompletterande writes"
    - "Aktuellt HM-mandat + MFA + CSRF → SQL-CAS + obligatorisk audit → beständigt komplett resultat"
---

<objective>
Slut gapet i ADMIN-03 där kullkopiering består av flera HTTP-skrivningar och statusåterhämtning kan lämna en ofullständig kopia. Leverera en atomär kopia av ram, terminer och skolval till en senare elevkull, med originalet bevarat och säkert återläsbart kommandoresultat.

Planen har tre genomförandedelsteg: backendgrund, skyddad användarväg, slutbevis/leverans. SQL- och TS-kontrakt preciseras först tillsammans; schema-/databasjobb körs seriellt. Oberoende frontendarbete kan ske parallellt efter att kontraktet är fastlagt. Mänskligt prov ligger i en separat överlämning efter denna autonoma plan.
</objective>

<execution_context>
@/Users/petter.gjores/.codex/skills/gsd/agents/executor/SKILL.md
</execution_context>

<context>
@AGENTS.md
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/ROADMAP.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-ATOMIC-CONTEXT.md
@web/app/protected-programplan-workspace.tsx
@web/lib/programplan-education-contract.ts
@web/lib/server/programplan-education.ts
@supabase/migrations/20261002120000_phase5_programplan_education.sql
@supabase/migrations/20261003120000_phase5_programplan_terms.sql
@supabase/migrations/20261004130000_phase5_programplan_units.sql
@web/e2e/phase5-programplan-frame.spec.ts
</context>

<tasks>
<task type="auto">
<name>1. Skapa stängt atomärt kopieringskommando och pröva rollback/idempotens</name>
<files>supabase/migrations/20261014100000_phase5_atomic_cohort_copy.sql, supabase/migrations/20261014101000_phase5_worker_atomic_cohort_copy.sql, work/pilot/verify-atomic-cohort-copy.mjs, work/pilot/apply-atomic-cohort-copy.mjs</files>
<action>Använd samordnat kontrakt: create-kommandots sex fält plus sourcePlanId, expectedSourceRevision och expectedEducationRevision; fastställ SQL-signaturen med TS-implementeraren före ändring. Låt en ny entrypoint ta request plus strikt boolean status_only. Begäran ska innehålla commandId, källplan-ID och förväntade plan-/utbildningsrevisioner, målskola, namn, elevkull, lokal kod och full v2-basisReference med ny start. Bind källplan-ID, båda revisionerna och hela canonical requesten i befintlig programplan_education_receipts. Lås auktoriserad källa/skolor, kontrollera CAS och start samt härled kopieinnehåll serverledes; använd befintlig basisuppgradering/validering och befintliga create/terms/units-kommandon inom samma transaktion när det är säkert. Bevara initial_result som det befintliga skapandesvarets oföränderliga revision-0-snapshot; utöka requesten med de tre källfälten. Returnera kvittot först efter att terminer och skolor är komplett kopierade inom samma transaktion. Aktuell slutrevision och fullständigt innehåll återläses via exakt nytt plan-ID. Identisk replay/status får läsa det initiala resultatet utan att kräva att originalets revision fortfarande är oförändrad; återkontrollera nuvarande mandat. Ändrad request eller främmande kvitto ska aldrig återanvändas. Status true får aldrig skapa. Håll den nya entrypointen stängd, bevara befintliga grants och definiera separat exakt aktiveringsmigration. Ingen direkt tabellrättighet eller ny paket-/klass-/timplansväg. Verifieringsverktyget ska bevara journal/DDL/ACL, hela äldre verksamhetstabeller inklusive tidsstämplar, audit och identitetsankare; använd en yttre rollback för provgrafer och riktad återställning av endast egna tillfälliga grants. Läs verktyg före målåtkomst; inga reset-/massraderingsskript.</action>
<verify>Färsk SQL-matris på avsedd isolerad målmiljö: full kopia, tom terminsfördelning, en/flera skolor, legacyuppgradering, sen/ogiltig start, fel basisReference, stale plan-/utbildningsrevision, annan källa under samma commandId, replay, läsande not_found/created-status, annan identitet/kund/mandat, parallellt samma commandId och injicerat termins-/skol-/auditfel. Varje fel lämnar noll nya erbjudanden/planer/länkar/kvitton/historikrader. Originalets hela graf och äldre audit/ACL/journal matchar före/efter; process och DB avslutas känt. En observerad låsvänta visar att konkurrerande källändring inte ger blandad kopia.</verify>
<done>SQL-grunden har färska rollback-/bevarande-/konfliktbevis, exakt kontrakt dokumenterat och endast den nya entrypointens grant väntar på faktisk Worker-preflight.</done>
</task>

<task type="auto">
<name>2. Anslut strikt serverkontrakt och byt klienten till en enda kopiering</name>
<files>web/lib/programplan-copy.ts, web/lib/programplan-copy.test.mjs, web/lib/server/programplan-copy.ts, web/lib/server/programplan-copy.test.mjs, web/app/api/programplaner/utbildning/kopiera/route.ts, web/app/api/programplaner/utbildning/kopiera/status/route.ts, web/app/protected-programplan-workspace.tsx, web/e2e/phase5-programplan-frame.spec.ts, web/e2e/phase5-programplan.spec.ts, docs/handbok/programplaner.md</files>
<action>Implementera strikta parsers för kopieringens exakta nio requestfält. Resultatet är det oföränderliga initiala skapandesvaret; validera det med befintlig skapandeparser mot en explicit sexfältsprojektion av kopieringsrequesten. Revision 0 hör till skapandeögonblicket och får aldrig användas som påstådd aktuell revision efter terminskopiering. Validera full v2-basisReference och bind kommandot till käll-ID/revisioner och målidentitet. Båda POST-routes använder protectedRoute, endast huvudman, MFA, CSRF och obligatorisk audit; status skickar samma request men SQL status_only=true. TS verifierar catalog/basis enligt befintlig skyddad källa utan att acceptera klientunderlag som auktoritet. Byt saveCopy/openCreatedCopy från skapa/terminer/skolor till ett fryst kopieringskommando och fullrequest-status. Efter confirmed created/replay/status återläser openEducation alla uppgifter för exakt skapad plan, inklusive verklig revision, terminer och skolor. Ta bort kompletterande HTTP-skrivningar och separat terminsläsning som kan misslyckas tyst. Osäkert svar låser requesten och spärrar andra writes/navigation tills läsande status avgör utfallet; behåll formuläret och samma commandId. Stale källa kräver omläsning och uttryckligt nytt kommando efter granskning. Efter confirmed created/replay/status öppnas exakt nytt version1-utkast; inget eftersteg behövs. Visa komplett framgång först efter strikt kvitto-/resultatkontroll och exakt återläsning; servertransaktionen garanterar att kvittot inte beskriver en delkopia. Behåll mandat-/osparat-/fokus-/tangentbords-/mobilskydd. Uppdatera F03 och befintliga positiva kopieprov till den samlade endpointen samt handboken med verifierat beteende och ingen kopiering av timplaner, elever, klasser, tidigare beslut eller skolutbud.</action>
<verify>Riktade Node-prov för parser/resultatbindning och serverns faktiska SQL-anrop: fel source/revision/basis/start, främmande/ändrat kvitto, mfa/mandat/audit, status true och fullrequest både routes. Browser på dator/telefon: komplett tvåskolskopia; källkonflikt; tappat kopiesvar→created-status; status not_found→samma commandId-retry; statusfel→spärr utan nytt create; aldrig terminer-/units-POST; fokus/tangentbord och inga horisontella överflöden. Isolerade fixturprov etiketteras tydligt. npx tsc --noEmit och npx oxlint app lib i web/ passerar.</verify>
<done>Klient/server har en samlad skyddad kopieringsväg och säkert oföränderligt kommando vid okänt utfall, med handbok och riktade felprov.</done>
</task>

<task type="auto">
<name>3. Verifiera faktisk Worker, aktivera exakt och leverera till nytt användarprov</name>
<files>work/pilot/verify-programplan-copy-api.mjs, work/pilot/apply-atomic-cohort-copy.mjs, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-ATOMIC-SUMMARY.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-ATOMIC-VERIFICATION.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-CLASS-USER-TRIAL.md, .planning/STATE.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md</files>
<action>Kör relevanta befintliga modell/serverprov i web/, typ/lint, ett separat protected appbygge och docs:build. Genom byggd Worker mot isolerad verklig databas, med ägda syntetiska identiteter/sessioner, kör preflight med tillfälligt exakt grant i återställbar verktygsväg. Visa komplett positiv kopiering, exakt status/replay/ändrad request och nekad roll/MFA/CSRF samt oförändrad källgraf. Kör migrationsapply/grant först efter accepterad preflight; kontrollera exakt definition, journal och endast avsedd grant. Kör kort actual API-slutprov igen genom samma bygge och faktiskt kopieringsflöde på dator/telefon; riktade källkonflikt-/svarsförlustprov får kombineras med SQL-felinjektion men redovisas separat. Serialisera alla målskrivande fixturejobb och avsluta/städa endast egna grafer med bevarad äldre audit/identitet. Registrera första fel, kända avslut, katalog-/journal-/ACL-/verksamhetsbevarande och exakt source/build. Gör selektiva avgränsade commits och stående tillåten push på aktuell gren; kontrollera remote commit. Leverera exakt samma bytekontrollerade bygge på 3012 med tidigare bygge bevarat, health och läsande OIDC-prov. Skriv separat användarprov: huvudman kopierar till senare kull, granskar ram/terminer/skolor och original; rektor/admin granskar klassens läsår och explicita fastställda timplansversion samt att ny version inte flyttar gammal länk. Status awaiting_user; lämna mänsklig bedömning och full krav-/fasacceptans öppna.</action>
<verify>Färsk faktisk Worker-preflight och slutkontroll har kända exit0, fullrequest-replay/status och negativa säkerhetsgränser PASS; original hela rader/tidsstämplar/klass-/elev-/timplans-/besluts-/paketgrafer och äldre ACL/audit/identiteter bevarade. SQLgrant/journal och prövat/lokalt bygge stämmer exakt. Dator-/telefonprov och handbok passerar. Git remote har den kontrollerade aktuella grenens commit. Nytt konkret mänskligt prov finns och är ännu inte godkänt.</verify>
<done>Avgränsad ADMIN-03-lucka har spårbara färska bevis och prövad lokal app. Användaren behöver nu bedöma kullkopiering och klass-/år-/versionsflödet; ingen fullfasstatus har satts till klar.</done>
</task>
</tasks>

<verification>
Separera strikt: Node/mock, SQL-rollback, faktisk Worker/DB och mänskligt prov. Positiv historisk F03 ersätter inga nya negativa atomaritetsbevis. Kontrollera källutbildningens och källplanens hela rader, historik, skolkopplingar och paket samt alla äldre elever/klasser/timplaner/beslut. Kontrollera kvittots hela request och initiala resultat, status utan skapande, auditrollback, grant/journal och rena egna provavslut. Inga nya globala testomkörningar behövs när relevanta färska kontroller passerat utan kvarstående frågetecken.
</verification>

<success_criteria>
En kopieringsbegäran skapar ram, terminer och skolor helt eller inte alls. Fel och okända HTTP-utfall skapar inga delkopior/dubbletter; status är läsande och fullrequestbundet. HM/MFA/CSRF/CAS/audit är verifierade i verklig skyddad väg. Original och förbjudna kopiedata bevaras. Samma prövade bygge är levererat och konkret användarprov väntar; full fas 5, ADMIN-02/03/04, övriga skolformer och historisk 05-22-avvikelse får inget tyst slutgodkännande.
</success_criteria>

<output>
Skriv 05-COPY-ATOMIC-SUMMARY.md, 05-COPY-ATOMIC-VERIFICATION.md och 05-COPY-CLASS-USER-TRIAL.md med verkliga körningar, första fel, bevarandebevis och mänskligt status awaiting_user. Uppdatera endast aktuell kravspårning/GSD-status; historiska bevis och totalsiffror räknas inte om utan en separat kontrollerad inventering.
</output>
