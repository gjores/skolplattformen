# Fas 3 — gemensamt genomförandekontrakt

Planeringsbeslut 2026-09-22. Namn nedan är föreslagna implementationer, inte befintliga funktioner eller kundgodkänd driftpolicy. `synthetic-v1` får endast väljas i verifierat lokalt protected-mål. Ingen verklig elevåtkomst öppnas av profilen. Läs användarbesluten i CONTEXT före detta kontrakt.

## Kontrollerad kodbas

Kod läst vid denna revidering: `web/lib/server/{db,session,authz}.ts`, session/context/callback-routes, kund/rektor, inbjudan/losen, access-rules, protected-home, migrationerna för fas 2, `work/pilot/{run-sql-tests,verify-access,verify-target,prepare-local}.mjs` och `web/playwright.protected.config.ts`. Kodkartans historik ersätter inte dessa källor. Inga nya produktprov kördes.

`access_assignments` är identitetsmandat; `assignments` och `assignment_units` är separat verksamhetspersonal. Kund/rektor tillåter i nuläget kundadmin och sätter app_role=huvudman; det måste ersättas. AccessFunction saknar nya roller, medan appRole-översättning också finns i session.ts, authz.ts och auth/callback. Nya funktioner ska behållas som accessFunction men ha appRole=null; de får inte ärva äldre bred RLS via ett låtsat appRole.

## Datakontrakt — plan 02

Utöka enum med `elevhalsa`, `elevhalsoansvarig`, `it`, `support`. Alla relationer har UUID, customer_id och sammansatta FK som förhindrar korsande kund/skola. Okänd profil, scope eller åtgärd nekar. Nya tabeller har FORCE RLS och inga rättigheter för anon/authenticated/PUBLIC; Worker får endast nödvändiga läsningar och kontrollerade funktionsanrop.

- `access_assignments`: lägg till `parent_assignment_id`, `issued_by_assignment_id`, `staff_assignment_id`, `profile_id`, `scope_kind` (school/group/pupil/case), `profession` (begränsad enum/metadata), `starts_at`, `ends_at`, `approved_by_assignment_id`, `purpose_code`. Support kräver alla tids-/godkännande-/syftesfält och exakt en skola. Befintliga datum behålls för kompatibilitet; giltighet är skärningen av datum och halvöppet tidsintervall `[starts_at, ends_at)`. Ingen klientklocka styr beslut.
- `mandate_units(assignment_id, customer_id, unit_id)` anger explicit skolmängd. Rektor får inte ge utanför sina egna aktuella mandat/skolor. Elevhälsoansvarig seedas med explicit skolmängd; ingen publik utnämningsväg införs. Kontrollera giltig kedja till roten vid varje skyddat anrop, neka cykler och avslutat/försvagat överordnat mandat. Lås i stabil ordning och prova samtidighet.
- `phase3_probe_pupils(id, customer_id, unit_id, display_name)`, `phase3_probe_groups(id, customer_id, unit_id)`, `phase3_probe_group_members(group_id,pupil_id,customer_id,unit_id)` och `phase3_probe_cases(id,pupil_id,customer_id,unit_id)`: endast syntetiska basfält. Inga anteckningar/journalfält.
- `mandate_groups(assignment_id, group_id, customer_id, unit_id, kind)` med undervisning/mentor, `mandate_pupils(assignment_id,pupil_id,customer_id,unit_id)` och `mandate_cases(assignment_id,case_id,customer_id,unit_id)` definierar scope. Ett case ger bara sin elevs basfält i just det fallet; det ger ingen lista över andra ärenden. Ett tomt scope ger noll behörighet.
- `staff_assignment_id` refererar public.assignments inom samma huvudman. Rektor/lärare binds uttryckligen till mottagarens membership, aldrig namn/e-postmatchning. Skolrelationer i assignment_units och identitetsmandat uppdateras atomärt genom en kontrollerad SQL-funktion. Befintlig personalrad utan bindning ger ingen inloggningsrätt. Direkt skrivning och äldre appoint_school_principal måste göra samma kontroll eller vara återkallade för Worker; inget parallellt mandatssystem får ge högre rättighet.
- `invitations` får `issued_by_assignment_id` och versionerat mandatpayload med endast godkända scopefält. Bind issuer/subject som tidigare och pröva tilldelarens aktuella kedja, skola och tid vid både utfärdande och inlösen. Inlösen får inte återuppliva eller förlänga mandat. Kundadmins nuvarande kundadmin/granskare-kontoadministration är en separat tillåten matrisgren och ger inte rätt att utfärda verksamhetsmandat.
- `local_connection_configs(customer_id, unit_id, enabled, version, updated_by_assignment_id, updated_at)` är lokal syntetisk administration. Ingen server-URL, credential eller elevpayload lagras här.

Överordnat avslut nekar omedelbart i live-kontrollen, även om underordnad sessionscookie fortfarande finns. Avslut ska inte kräva bakgrundsjobb. Återkallad staff-bindning får inte lämna giltigt access-mandat. SQL-prov inkluderar bindning, korsande FK, gamla RPC:er, direkt INSERT/UPDATE, ändrat parent och samtidighet.

## Server och HTTP — plan 03/05

`mandates.ts` laddar valt aktuellt uppdrag från transaktionen och anropar modellens `decideMandate`; SQL gör samma kontroll. Beslutets kontrakt är `{allowed, reasonCode, assignmentId, allowedFields}`; ingen union av flera uppdrag. Serverns unit/customer kan aldrig tas från rollval eller headers. Serverprov testar samma namngivna policyfall med kontrollerad databasadapter; SQL- och API-prov bevisar verklig koppling senare.

`GET /api/kund/mandat` lämnar bara den valda aktörens administrerbara uppdrag, scope och tillåtna åtgärder. `POST` tar mottagande membershipId, function, unitIds, scope med relevanta ID:n, giltighet och (för support) syfteskod. Servern sätter tilldelare/godkännare. `POST /api/kund/uppdrag/avsluta` återanvänder samma kontroll. `POST /api/kund/rektor` kräver huvudman och uttrycklig mottagarbindning; rektor/kundadmin kan inte låtsas huvudman. Felaktigt format ger 400, otillåten åtgärd 403, främmande eller saknat objekt samma 404 utan metadata. Behåll CSRF, MFA, epoch och sessionslås.

IT-rollen får `GET /api/kund/anslutning` inom sitt tilldelade skolscope och `PATCH {unitId, enabled, expectedVersion}` för aktivera/pausa lokal konfiguration; fel version ger 409 utan överskrivning. `POST {unitId, action:'test'}` gör en lokal deterministisk validering och returnerar `synthetic_ok` eller `paused`. Alla ändringar kräver MFA/CSRF och audit; testanrop loggas också. Inga utgående nätverksanrop och ingen elevläsning. Detta bevisar lokal administration, inte en kommunanslutning. Kundens verkliga anslutningsadministration är senare fasarbete.

Elevprovet stöder listning, direkt pupilId och caseId som separata tillåtna läsvägar; SQL filtrerar före svar/antal. Elevhälsofall måste bära sitt caseId genom policy och SQL. Export använder samma urval/fältlista som läsning, buffereras och returneras först efter loggcommit; ingen stream startar inne i transaktionen. Behåll no-store. Loggfel ger generiskt 503/500 med korrelation, inga elevbytes eller lyckad mutation. GET/session och POST/context visar giltighet från samma SQL-funktion som db.withSessionContext, inklusive sekundprecision, och returnerar aldrig nya rollnamn som gamla appRole.

## Auditens källor och gränser — plan 04

1. Worker: `protectedRoute → withSessionContext → logEvent → transaction commit → responseFromResult`. Audit är obligatorisk för elevlistning, enskild läsning, export, mutation och anslutningstest. `logDenied` sker separat efter rollback, varje försök får händelse; slopa bucket-undertryckning. Vid fel i nekandelogg lämnas endast generiskt fel. Vanlig Worker får varken DELETE/UPDATE audit eller gallringsfunktion.
2. Direkta HTTP-vägar: lokal Kong-accesslogg är källan för faktiskt mottagna `/rest/v1/*`, `/rest/v1/rpc/*` och `/storage/v1/*` anrop och status. Storage-serverns logg kompletterar om gateway accepterar anrop men Storage nekar. Namn identifieras via Docker inspect och det `projectId` som assertTarget verifierar, inte godtyckliga containernamn. `configure-audit-source.mjs` ska aktivera strukturerad accesslogg med servergenererat request-id, tid, status och fast routekategori i den disponibla stacken; inga Authorization/cookie/query/body eller rå elev-ID i loggformatet. Alla relevanta ingressanrop registreras, även tomt svar som RLS kan ge; klientens resultat är bara jämförelsematerial.
3. Direkt SQL: Postgres-serverns fel-/anslutningslogg är källan, med PID/session-id, verifierad databasroll, tid och SQLSTATE. Stäng direkta privilegier så anrop till skyddade tabeller/RPC ger permissionsfel; tomma RLS-resultat ensamma bevisar inte nekandeloggning. Lokal konfigurator stänger statement/bind-parameterloggning och väljer prefix med SQLSTATE/roll/PID. Kollektorn ignorerar fria feltexter/SQL och sparar bara allowlistade fält. Autentiseringsfel saknar verifierad aktör och får actor=null. Privilegierade DBA-åtgärder är administrationsgräns, inte en väg att göra tillgänglig för appanvändare.

`collect-denials.mjs` läser källor direkt via Docker/process-API i minnet, normaliserar och skriver bara minimerat resultat. Testklientens JSON får aldrig vara loggkälla. Källans request-id/cursor är primär korrelation; attackerlevererat X-Correlation-Id är opålitligt. Vid SQL används serverns PID/session och ett serialiserat provfönster, inte ett klientpåstått person-ID. Registrera källa, källa-event-id, tid, route/SQLSTATE, observerad roll eller null, utfall, täckningsintervall. Dubbletter dedupliceras på käll-id, inte tid/aktör. Rå Docker-/SQL-utdata ska inte skrivas till Git eller testresultat.

Kollektorproven måste omfatta verkliga nekanden från varje källa, 25 Worker-nekanden, källavbrott, omstart, cursorlucka och återhämtning utan tyst bortfall. Ingen provad möjlighet att läsa en källa är belagd ännu. Om lokal container inte kan ge nödvändiga strukturerade källhändelser är plan 04 BLOCKED och kräver reviderad ingress/loggimplementation före fortsatt säkerhetsgodkännande. Att behålla direktvägar stängda är nödvändigt men uppfyller inte AUDIT-02 på egen hand. Full grind får aldrig godkänna audit genom att undanta en saknad källa.

Fail-closed betyder synkront stopp före elevsvar/mutationscommit i Worker. En asynkron Docker-kollektor är endast syntetiskt bevis för stängda alternativa vägar; den ger inte synkron driftsgaranti. Avbrott ger röd grind och fortsatt stängda direktvägar. Verklig drift kräver verifierad logginfrastruktur för sin faktiska ingress; denna plan öppnar ingen sådan drift.

Gallring: konfiguration per kund/profil, synthetic-v1=30 dygn. Separat snäv maintenance-roll/funktion får radera endast äldre än serverberäknad cutoff, aldrig ändra audit. Granskare ser endast kundens logg; anonym direktvägshändelse utan säkert kund-id syns endast i lokal säkerhetsrapport, inte hos godtycklig kund. Testa cutoff före/vid/efter och inga DELETE/UPDATE-rättigheter för Worker/granskare.

## Körbara provkontrakt och beroenden

Befintlig `run-sql-tests.mjs` stöder `--file` och `--out` och upptäcker alla .sql i supabase/tests. Den laddar inte work/pilot/sql-fixtures. Kör från roten efter lokalt mål och migrationer:

```
node work/pilot/run-sql-tests.mjs --file phase3_mandates.test.sql --out work/pilot/results/phase3-sql-mandates.json
node work/pilot/run-sql-tests.mjs --file phase3_audit.test.sql --out work/pilot/results/phase3-sql-audit.json
```

Nya runnergränssnitt som ska byggas i respektive plan:

```
node work/pilot/configure-audit-source.mjs --target protected
node work/pilot/collect-denials.mjs --probe --out work/pilot/results/phase3-denials.json
node work/pilot/verify-mandates.mjs --out work/pilot/results/phase3-api.json
```

Alla kör assertTarget('protected') före anslutning; vägra okända flaggor/fjärrmål. `--probe` skapar endast syntetiska nekande försök i lokalt mål och verifierar insamlade källhändelser självständigt. verify-mandates laddar phase3-fixtures.sql i det verifierade målet, startar byggd Worker på ledig loopbackport och stänger den i finally likt verify-access. Stöd upprepad `--case <namn>` för felsökning; full grind kräver exakt hela falluppsättningen:

`principal-chain`, `teacher-group`, `school-admin`, `health-school`, `health-pupil`, `health-case`, `support-boundary`, `it-admin`, `self-escalation`, `parent-revoked`, `invitation-recheck`, `foreign-object`, `concurrent-revoke`, `direct-rest`, `direct-rpc`, `direct-storage`, `direct-sql`, `audit-read-fail`, `audit-export-fail`, `audit-write-rollback`, `audit-deny-fail`, `audit-flood`, `audit-source-outage`, `audit-minimization`, `audit-retention`.

Varje fall har positiva kontrollanrop och negativa gränser, faktisk serverhändelse när audit krävs och status PASS/FAIL/BLOCKED. Saknad fixture eller saknat fall får aldrig rapporteras PASS. API-klockans supportgräns provas med kontrollerad serverfixture; modellen/SQL prövar exakt gränstid deterministiskt. Ingen publik möjlighet att ställa serverklockan.

Plan 06 verifierar nya API-prov och sammanställarens enhetstester. Den fullständiga grinden är först körbar i 07. Där utökas Playwrights globala och projektspecifika testMatch till phase3-mandates; desktop/phone och byggd Worker måste alla ge faktiska fall. Kontrollera upptäckten med `cd web && npm run e2e:protected -- --list phase3-mandates.spec.ts` innan körning. Slutgrinden kräver modell + serverenhetstester, SQL, API, aktuella fas 1/2-regressioner, browser, tsc, lint, normalt/skyddat bygge och `npm run docs:build` från roten. Fingeravtryck måste inkludera även work/pilot, SQL och browserkonfiguration, inte bara web-kod. Inga tidigare rapporter får fylla saknade steg.
