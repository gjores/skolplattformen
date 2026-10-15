---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-08"
type: execute
status: executing
wave: 7
depends_on: ["CLASS-COHORT-07"]
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - work/pilot/verify-class-cohort.mjs
  - work/pilot/verify-class-cohort-api.mjs
  - work/pilot/apply-class-cohort.mjs
  - web/e2e/class-cohort-actual.spec.ts
  - web/playwright.class-cohort-actual.config.ts
  - work/pilot/verify-class-timplans.mjs
  - work/pilot/phase5-class-cohort-oidc-fixtures.mjs
  - supabase/tests/phase5_class_cohort_dates.test.sql
  - work/pilot/verify-class-cohort-link-identity.mjs
  - work/pilot/resume-class-cohort-concurrency.mjs
must_haves:
  truths:
    - "Hela tidiga klassflödet fungerar med syntetiska data genom verklig Worker och databas."
    - "Gamla klasser, elever, medlemskap och versionslänkar är oförändrade efter migration och prov."
  artifacts:
    - path: work/pilot/verify-class-cohort.mjs
      provides: "Faktiska SQL-, Worker- och browserbevis"
  key_links:
    - "Aktuellt skolmandat → exakt utbildning/kull → stabilt klass-ID → uttrycklig läsårs-/versionskoppling"
---

# Faktiska SQL-, Worker- och browserbevis

<objective>
Hela tidiga klassflödet fungerar med syntetiska data genom verklig Worker och databas.
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
@work/pilot/verify-target.mjs
@work/pilot/apply-class-timplans.mjs
@work/pilot/verify-class-timplan-api.mjs
@work/pilot/verify-programplan-copy-api.mjs
</context>

<tasks>
<task type="auto">
<name>Verifiera migrationer och gränser på isolerad databas</name>
<files>work/pilot/verify-class-cohort.mjs, work/pilot/apply-class-cohort.mjs</files>
<action>Bygg målskyddade verifierings-/apply-skript enligt assertTarget och befintliga apply-class-timplans/verify-class-timplans. Verifiering provar 02–04-migrationerna i rollback före explicit lokal apply; sparade privata bevis binder migrations-/källhashar, målfingeravtryck, ACL, före/efter-data och exitkod. Inventera aktuella tabeller/kolumner och hash:a gamla projektioner vid additiva kolumner; radera eller fixa aldrig äldre avvikelser för att få PASS. Applicering får ske endast på avsedd isolerad syntetisk målmiljö. Verifiera alla SQL-matriser samt rollscope, batch-rollback, kvitton, samtidighet och auditfel. Egen fixtur städas exakt; audit och nya ankare bevaras. Kör även tidigare klass-/vårstart-/kopieringsfall där kontrakt påverkats. Efter målskyddad isolerad apply krävs två verkliga separata DB-anslutningar eller parallella HTTP-sessioner för samtidig utbildningsstartändring/klasskapning och dubbla identiska requests. Använd explicita synkroniseringsbarriärer så överlapp faktiskt inträffar; bevisa antingen nekad ena operation med rätt konflikt eller serialiserad korrekt framgång och exakt antal klasser. Tidigare enanslutnings-rollback räknas inte som konkurrensbevis.</action>
<verify>node work/pilot/verify-class-cohort.mjs --out /private/tmp/class-cohort-sql.json; node work/pilot/apply-class-cohort.mjs --verify --evidence /private/tmp/class-cohort-sql.json --out /private/tmp/class-cohort-apply-check.json; inför --apply först verifierad evidens från samma mål och källor. Skripten ska implementera dessa explicita argument.</verify>
<done>Färska verkliga SQL-resultat och bevarandebevis finns; inga okända effekter eller främmande cleanup.</done>
</task>

<task type="auto">
<name>Kör slutbyggd Worker och verkliga webbläsarflöden</name>
<files>work/pilot/verify-class-cohort-api.mjs, web/e2e/class-cohort-actual.spec.ts</files>
<action>Kör relevant Node-grind, typ/lint och ett skyddat produktionsbygge efter sista produktändringen. Använd verklig lokal OIDC/MFA och byggd Worker med isolerade syntetiska roller/egen fixtur; UI-mock räknas inte som dessa bevis. Gå programplansutkast → Gör senare → återöppna → två tomma klasser → omstart/återläsning → fastställd timplan → uttrycklig klass/läsår/version. Pröva HM nej, annan skola/kund, år före start, vårstart, namnkollision, nya versioner utan nya klasser, kopia utan klass-/elev-ID:n, source revision och uppdragsbyte samt förlorat HTTP-svar och requestbunden status. Dator och telefon ska båda genomföra nytt flöde. Dokumentera runtime/buildrevision och bildgranskning; innehåll och tidigare godkända flöden behöver endast riktad regressionskontroll.</action>
<verify>cd web && node --test lib/class-cohort.test.mjs lib/class-timplan.test.mjs lib/server/class-cohort.test.mjs lib/server/class-timplan.test.mjs; npx tsc --noEmit; npx oxlint app lib; npm run build:protected. Kör därefter node work/pilot/verify-class-cohort-api.mjs --out /private/tmp/class-cohort-api.json från roten och riktad class-cohort-actual.spec.ts med aktuell konfiguration. Inga skips eller mockade nätanrop i actual-spec.</verify>
<done>Samma skyddade bygge är prövat genom faktisk Worker på dator/telefon, och bevarande-/cleanup-resultat är kända.</done>
</task>

</tasks>

<verification>
Kör planens riktade kontroller mot aktuella källor. Bevara tidigare elev-/klass-/versionsdata; skriv endast syntetisk egen fixtur i avsedd isolerad miljö. Se SS12000-bilagan: SS 12000:2024, OpenAPI 2.1.0; intern en-utbildning-per-klass och legacydatum/namnnyckel är begränsningar, inte verifierat standardstöd. Ingen verklig kommunanslutning provas här.
</verification>

<success_criteria>
Hela tidiga klassflödet fungerar med syntetiska data genom verklig Worker och databas.
Gamla klasser, elever, medlemskap och versionslänkar är oförändrade efter migration och prov.
</success_criteria>

<output>
Skriv .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-08-SUMMARY.md med faktiskt resultat, kommandon/exitkoder, bevisreferenser, kvarstående gränser och SS12000-bedömning. Uppdatera paketets status proportionerligt. Versionshantera endast denna plans avgränsade ändringar; pusha aktuell gren och verifiera avsedd fjärrcommit enligt AGENTS.md.
</output>

## Genomförandeprecisering efter plan01/02

Plan01:s äldre `--applied` verifierar åtta klassfunktioner mot klassmigrationen och kalenderfixen. När plan03 ersätter identifierade länkfunktioner ska regressionsverktyget verifiera de senaste tillämpliga migrationskällorna, inte godta ett äldre funktionsfingeravtryck. Samma verktygs nya klassfixturer behöver explicit kalenderstart innan klassbildning enligt plan02; inga historiska rader eller kvitton ska fyllas i. Därför ingår `verify-class-timplans.mjs` som femte avgränsad provfil i plan08. Återanvänd plan02:s versionshanterade datumsetup och redovisa dess tidigare rollback-bevis separat från samtidighetsproven.

## Verifierad OIDC-fixturavgränsning

En sjätte provfil, `phase5-class-cohort-oidc-fixtures.mjs`, behövs för verkliga egna OIDC-konton och exakt städning av nya kvitton/callback-sessioner. Befintliga gym-/programplansfixturer mintar DB-sessioner och kan därför inte ensamma bevisa OIDC/MFA. Adaptern återanvänder deras egna verksamhetsfixturer men skapar enbart slumpnamngivna Keycloak-konton; befintliga konton/mandat ändras inte. Login går genom riktig callback och serverns MFA-bedömning. Privata manifest-/TOTP-nycklar ändras/städas endast för egna konton under exklusivt körlås.

Basens cleanup känner inte `class_cohort_commands` och kör replica vid radering av uppdrag. Adaptern måste före delete bevisa exakta egna actor/assignment/request/command-ID:n, radera enbart dessa receipts och riktiga egna callback-sessioner, därefter kontrollera noll kvarvarande främmande referenser. Alla gamla kvitton, gamla audit-/identitetsankare samt nya auditerade identitetsankare bevaras med hash/count före/efter. Nya GoTrue-authankare och sessioner omfattas uttryckligen; inga råa lösenord/tokens/personfält hamnar i Git eller rapportsammanfattning. Okänt HTTP-utfall måste lösas före cleanup. Detta motiverade filundantag verifierar den redan beslutade faktiska inloggningen utan att bygga om generiska fixturer.

Befintliga actual-konfigurationer har fasta testMatch. En sjunde liten fil, `web/playwright.class-cohort-actual.config.ts`, väljer den nya actual-specen med `PHASE5_BASE_URL`, dator/telefon, workers1, retries0 och ingen Vite-webServer. Trace är av för att inte spara inloggningshemligheter. Konfigurationen binds i verifieringsbeviset.

## Historisk fixtur och färska applybevis

Den fulla 02→03→04-matrisen behöver egna historiska rader skapade före migration02: legacydatum, gammalt länkkvitto och tvetydiga gamla namnnycklar. De får inte fabriceras efter apply genom avstängda skydd. Två ytterligare avgränsade provfiler ingår därför: `phase5_class_cohort_dates.test.sql` använder en exakt tillåten Worker-signaturlista för de tre04-ingångarna när de finns (alla andra funktions-/rollnekanden består), och `verify-class-cohort-link-identity.mjs` exporterar befintlig pre02-setup samt `secondCohort` för återanvändning. Inga assertions hoppas över.

Implementera och dokumentera kedjan: initial rollback → explicit `--prepare-applied-fixture` med privat ID/request/rowmanifest → färsk rollback på samma beständiga fixtur → `apply --verify` → `apply --apply` med färska bevis → `--applied` full02→03→04-matris i rollback → riktiga tvåsessionsprov → exakt egen cleanup. Varje steg kontrollerar målfingerprint, källhashar och manifest; ett bevis från före den beständiga fixturen får inte användas för apply. Privat manifest och rapport skapas exklusivt med0600 och innehåller aldrig riktiga elevdata.

Inventera gamla kolumner och jämför varje gammal rad projicerad på dessa kolumner före/efter DDL. Kontrollera separat null/legacy_unknown för gamla klassers tillagda fält och tom ny kvittotabell vid apply. Schema/ACL/policy/journal binds före, förväntat efter och installerat med exakt tre journalposter. Cleanup tar enbart manifestets egna graf efter främmande referenskontroll och bevarar audit/identitetsankare. Både egen fixtur och gamla rader följs med exakta originalprojektioner.

Samtidighetsproven använder olika `pg_backend_pid`, egna sessionskontexter och bevisat överlapp genom `pg_blocking_pids`/aktivitetskontroll eller exakt NOWAIT-konflikt medan den första transaktionen fortfarande är öppen. Prova klass först/källstart först, offeringkalenderändring, identisk batch som replay samt gammal sourceToken efter källrevision. Varje fall har en egen offering när start ska kunna ändras. RR-/Serializable-nekanden särredovisas och ersätter inte samtidighetsprov.

## Avgränsad återupptagning efter installerad matris

Den första installerade körningens fulla436 matris-/isolations-/regressionskontroller passerade. Ett ociterat SQL-alias i samtidighetsverktyget gav därefter `batchaudits` i stället för förväntade `batchAudits`; värdet var1 i båda fallen. Körningen redovisas fortsatt som FAIL. Exakt cleanup passerade, egna verksamhetsrader/sessioner är borta och originalrader bevarades. Den historiska pre02-fixturen får inte återskapas genom avstängda skydd.

En avgränsad tionde provfil, `resume-class-cohort-concurrency.mjs`, får därför återanvända en modern egen `approvedClassFixture` under installerade skydd och köra om alla sju samtidighetsfall. Den ska binda föregående fullmatris och dess faktiskt passerade städning till originalrapportens SHA och den frysta verifierarkällan. Produkt, migrationer och SQL-tester måste vara oförändrade; den tidigare matrisens körkod kontrolleras mot frysta källan. Slutrapporten särredovisar tidigare fullmatris och ny samtidighet, med nytt mål-/schema-/källbevis och exakt städning. Validatorn för efterföljande API-prov ska även kontrollera denna proveniens. Inga gamla FAIL-filer skrivs över och inga nya fullmatrisresultat fabriceras.

Den första cleanupens hash av de egna 92 auditraderna byggdes över en osorterad parallell SQL-läsning. PK-mängd, antal och PK-hash kan återverifieras exakt, men den sparade ordningsberoende värdehashen kan inte användas för en ny säker radvärdesjämförelse. Detta redovisas som en bevisbegränsning, inte som verifierad värdelikhet. De ursprungliga äldre verksamhetsprojektionerna och båda egna identitetsankarnas sparade värdehash ska fortfarande matcha. Återupptagningen sparar en kanoniskt sorterad aktuell baseline för de 92 auditraderna och kräver exakt bevarande av den genom den nya körningen. Ursprunglig FAIL, cleanupresultat och hashvärden ändras inte.


## Avgränsad rättning från faktiskt prov 2026-10-15

A01 i den första körningen som nådde UI hittade att klasssteget inte öppnas efter skapande när verifierad skola ändrar arbetsytans React-nyckel. Den lokala öppningsavsikten förloras vid ommontering. Tidigare komponentharness publicerade inget skolbyte och kunde därför inte fånga felet. Rapporten förblir FAIL; inget produkt-PASS eller lokal leverans följer.

Rättningen ska föra en engångsavsikt mellan den verifierade målöppningen och den nya arbetsytan, bunden till aktuell kontext samt exakt utbildning/plan/skola. Avsikten konsumeras när rätt klasspanel monterats och rensas vid annan navigation eller sessionsbyte. Inga nya URL-parametrar, beständig lagring, mandat eller automatiska skrivningar tillkommer. Gör senare får inte ångras av en senare ommontering.

Berörda produktfiler: `web/app/protected-home.tsx`, `web/app/protected-programplan-workspace.tsx` och `web/app/protected-class-cohorts.tsx`; komplettera berörd browserharness/regression så verklig skolbytesommontering ingår. Verifiera riktat på dator/telefon, typkontroll och lint, följt av nytt separat skyddat bygge samt färska fulla Worker/API- och actual-prov mot samma nya bygge. Befintligt SQL-bevis återanvänds bara om dess verifierade källor/schema/journal fortfarande matchar. Handbokstexten behåller det avsedda automatiska klasssteget, men får inte anges lokalt levererad före plan09.

SS 12000-bedömning: rättningen gäller tillfälligt visningstillstånd, utanför standardens informationsobjekt. Stabil utbildnings-/klassidentitet, skolmandat och datummappning ändras inte; den exakta målbindningen ska förhindra att öppningsavsikten följer till en annan skola eller utbildning.


## Provverktygets callback- och återhämtningsbevis

Telefonens första faktiska fall stoppade i cleanup på saknad callbackobservation. Separat exakt återhämtning ska binda den avbrutna fixturen, kända kvitton och serverauditerade inloggningar till en atomär städtransaktion, först verifierad med rollback. Föregående desktopbaslinje täcker62 verksamhets-/sessionstabeller; återhämtningens egen före/efter-baslinje för identitets-/auditankare redovisas som en separat tidsgräns. Originalets FAIL får inte skrivas om.

Efter återhämtningen ska OIDC-adaptern spara privat hållbar baseline och callbackmetadata före respektive mutation. Varje autentiseringsomgång behöver faktiskt observerat svar; ingen302 får härledas från endast cookie eller MFA. Den exakta städningen ska även omfatta auth.mfa_amr_claims för egna GoTrue-sessioner, med separat bevarande av alla äldre claims. Nya fixturprov får63-tabellsbaseline; äldre62-tabellsrapporter ändras inte. Dessa ändringar gäller provverktyg, inte behörigheter eller SS12000-objekt.

Den minimala verkliga diagnosen reproducerade att WebKit inte exponerar callbackens Response trots fungerande serverinloggning. Bevismodellen kompletteras därför uttryckligen: privat fsyncad audit-ID-baslinje före varje auth-trigger, exakt en observerad callbacknavigation, faktisk browserretur, cookie/API-verifierad egen identitet/session och exakt en ny unik worker-login-audit. Step-up kräver oförändrad session/epok och accepterad MFA. Saknad HTTPstatus är null; observerat felstatus nekas alltid. Detta är sammansatt OIDC-bevis, inte uppmätt302. Negativa rena tester täcker saknade/dubbla/felaktiga/återanvända bevis före ny faktisk API/browserkörning.
