---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: RECTOR-PROGRAMPLAN
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - supabase/migrations/20261016100000_rector_programplan_creation.sql
  - web/app/api/programplaner/utbildning/skapa/route.ts
  - web/app/api/programplaner/utbildning/status/route.ts
  - web/app/api/programplaner/utbildning/kopiera/route.ts
  - web/app/api/programplaner/utbildning/kopiera/status/route.ts
  - web/app/protected-programplan-workspace.tsx
  - web/app/protected-programplan-flow.tsx
  - web/lib/server/programplan-education.test.mjs
  - web/e2e/programplan-copy.spec.ts
  - web/e2e/class-cohort.spec.ts
  - docs/handbok/programplaner.md
  - work/pilot/verify-rector-programplan.mjs
  - work/pilot/verify-rector-programplan-api.mjs
  - work/pilot/apply-rector-programplan.mjs
  - work/pilot/deliver-rector-programplan.mjs
  - work/pilot/deliver-rector-programplan.test.mjs
must_haves:
  truths:
    - Rektor kan skapa utbildning med programplansutkast på en skola i aktuellt uppdrag.
    - Rektor kan kopiera en läsbar plan till nästa kull på den aktivt valda egna skolan, även från en gemensam ram med annan ursprungsskola.
    - Rektors kopia är ett eget utkast för endast målskolan och originalet ändras inte.
    - Huvudmannen godkänner; rektor kan inte fastställa eller få bredare livscykel- eller skolvalsmandat.
    - Huvudmannens tidigare skapande och kopiering med originalets skolval består.
    - Okänt svar kan återhämtas med samma kommando utan dubblett och återkallat mandat stoppar både skrivning och kvittoläsning.
  artifacts:
    - supabase/migrations/20261016100000_rector_programplan_creation.sql
    - web/e2e/programplan-copy.spec.ts
    - web/e2e/class-cohort.spec.ts
    - docs/handbok/programplaner.md
    - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-RECTOR-PROGRAMPLAN-SUMMARY.md
  key_links:
    - Serverns aktuella skolmandat styr skapandeknappar och varje SQL-kommando.
    - Aktiv skola följer med rektors kopiekommando och återläsningen av den nya kopian.
    - Samma kommando binds till identitet, kund, skola, källa och immutable kvitto.
    - Utkast skickas via befintligt beslutsflöde till huvudmannens exklusiva godkännande.
---

<objective>
Leverera användarens beställda rektorsskapande och kopiering till nästa elevkull för den egna skolan, med huvudmannens godkännande bevarat. Ändringen ska fungera i den lokala skyddade appen på 3012 och vara verifierad mot faktiska mandat. Paketet är en avgränsad ändring i befintliga flöden; tre ordnade delsteg håller SQL-mandat, produktkoppling och leverans granskningsbara.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-RECTOR-PROGRAMPLAN-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md
@supabase/migrations/20261004122000_phase5_programplan_lifecycle_locks.sql
@supabase/migrations/20261004130000_phase5_programplan_units.sql
@supabase/migrations/20261014100000_phase5_atomic_cohort_copy.sql
@web/lib/server/programplan-education.ts
@web/lib/server/programplan-copy.ts
@web/app/protected-programplan-workspace.tsx
@work/pilot/verify-atomic-cohort-copy.mjs
@work/pilot/verify-programplan-copy-api.mjs
@work/pilot/deliver-named-timplans.mjs
</context>

<tasks>

<task type="auto">
<name>1. Avgränsa databasens skapande- och kopieringsmandat</name>
<files>supabase/migrations/20261016100000_rector_programplan_creation.sql; work/pilot/verify-rector-programplan.mjs</files>
<action>Skapa en ny migration över de senaste funktionsdefinitionerna; ändra inte redan installerade migrationer. Utöka endast selection, create, status, copy och deras nödvändiga auditering till rektor med aktuellt gymnasiemandat. Behåll phase5_programplan_unit(...,true) som strikt huvudmannakontroll för övriga anrop; använd avgränsad kontroll där skapande tillåts. Skapandehändelsen ska registrera verklig rektorsroll, medan övriga organisationshändelser förblir huvudmannens. Rektors kopiering kräver att den begärda egna målskolan finns bland källans kopplade skolor och i aktuellt mandat; skapa endast denna skolkoppling. Huvudmannens ursprungsskolekontroll och fulla skolkopiering består. Kontrollera mål- och källbehörighet även vid status/replay, med befintlig identitetsbindning, låsordning, CAS, immutable kvitton och auditrollback. Ingen generell ändring av läs-/skrivscope, beslut, RLS eller grants. Verifieringsverktyget använder isolerad schema-only-kopia och syntetiska fixturer med verifierad full cleanup.</action>
<verify>Faktisk SQL: rektor skapar och kopierar på egen skola; gemensam källram med annan ursprungsskola kopieras endast till vald egen skola; fel skola/kund/återkallat eller utgånget mandat/skoladministratör nekas. Pröva status/replay efter mandatändring, samma kommando två gånger, ändrad källa, otillåtet datum, auditfel och konkurrerande identiska kopior. Huvudman kan fortfarande skapa och kopiera samtliga originalskolor. Rektor kan inte godkänna, ändra skolval eller arkivera/radera. Jämför originaldata, ACL/RLS och schema före/efter; bara avsedda definitioner får skilja i kandidatinstallationen.</verify>
<done>SQL-matrisen passerar med verkliga databasroller och separata samtidiga transaktioner där relevant. Alla originalrelationer och beslut är bevarade, och cleanup är bekräftad.</done>
</task>

<task type="auto">
<name>2. Koppla API och gränssnitt till det nya mandatet</name>
<files>web/app/api/programplaner/utbildning/skapa/route.ts; web/app/api/programplaner/utbildning/status/route.ts; web/app/api/programplaner/utbildning/kopiera/route.ts; web/app/api/programplaner/utbildning/kopiera/status/route.ts; web/app/protected-programplan-workspace.tsx; web/app/protected-programplan-flow.tsx; web/lib/server/programplan-education.test.mjs; web/e2e/programplan-copy.spec.ts; web/e2e/class-cohort.spec.ts; docs/handbok/programplaner.md</files>
<action>Tillåt rektor i de fyra specifika route-gaterna, behåll mutating/MFA/audit/CSRF och serverns SQL-kontroll. Utgå från faktisk canCreateEducation för knappar och spara, ta bort saveCopy:s exklusiva huvudmannaspärr och skicka aktiv vald skola för rektor; huvudman behåller ursprungsskolan. Visa målskola och att kopian blir utkast för huvudmannens godkännande. Säkerställ att öppning av gemensam ram, årsrad, kopieringsåterhämtning och återläsning behåller rätt skola. Behåll spärr vid osäkert mandat och navigations-/sparskydd; ge inte canCreateEducation betydelsen skolvalsmandat. Uppdatera handbokens behörigheter, nyplansteg och skillnaden mellan rektors egen skolkopia och huvudmannens fulla skolval. Testa beteendet genom riktiga in-/utdata och nekat mandat, inte enbart källsträngar.</action>
<verify>Kör berörda Node-kontrakts-/routeprov, inklusive rektors create/copy/status och oförändrat avslag för administratör. Kör UI på dator och telefon: Ny programplan, framtida datum, spara och återöppna, kopiera från aktiv egen skola, shared-source med annan ursprungsskola, submit och huvudmans approve. Verifiera inget approve- eller Skolor-val för rektor. Prova borttappat svar och samma återförsök. Kör från web: npx tsc --noEmit och npx oxlint app lib; från projektroten npm run docs:build. Bygg skyddad kandidat separat från aktiv web/dist-protected.</verify>
<done>UI visar användbara skapande-/kopieringsval för rektor och rätt målskola; routeprov och dator-/telefonflöde passerar. Handboken matchar ändringen och bygger. Simulerade resultat är uttryckligen märkta.</done>
</task>

<task type="auto">
<name>3. Verifiera verkligt flöde och leverera samma lokala kandidat</name>
<files>work/pilot/apply-rector-programplan.mjs; work/pilot/deliver-rector-programplan.test.mjs; work/pilot/verify-rector-programplan-api.mjs; work/pilot/deliver-rector-programplan.mjs; .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-RECTOR-PROGRAMPLAN-SUMMARY.md; .planning/STATE.md</files>
<action>Återanvänd granskade OIDC-/Worker-/bevarandehjälpare efter kontroll, med exakt aktuella källor, migration och kandidatbytes. Prova rektors skapande och kopiering via verklig skyddad API-inloggning, status/retry och inskick, samt huvudmannens godkännande. Prova främmande skola/kund, återkallat mandat, MFA/CSRF, rektors nekat fastställande och oförändrat huvudmannaflöde. Prova den verkliga kandidatens berörda användarflöde på dator och telefon. Använd endast egna syntetiska fixturer och verifiera cleanup; ändra inga användarklasser. Förkontrollera lokal målmiljö och befintlig runtime, installera den verifierade migrationen och leverera exakt samma provade artefakt till 3012. Bevara tidigare app för återställning, gör efterkontroll av dataintegritet och läsande OIDC. Permanent DB-installation och appbyte ska bindas till bevis; avbryt vid oklar commit och undersök, kör inte blint igen. Dokumentera faktiskt resultat, begränsningar och lokal revision; samordnaren gör avgränsad commit/push och verifierar fjärr-SHA.</action>
<verify>Faktiska SQL-/API-/browserrapporter passerar och refererar samma källor/build; databevarande före/efter, kvitton, status, MFA och cleanup är kontrollerade. Efter leverans verifieras aktiv 3012-artefakt mot kandidaten, hälsa och läsande skolavgränsad åtkomst. Kontrollera originalets planer/skolor/klasser/timmar/beslut samt oförändrade grants. Git diff --check och avgränsad filgranskning före commit/push.</verify>
<done>Rektor kan använda det beställda flödet på 3012, huvudmannen godkänner fortfarande, bevarandekontrollerna passerar och genomförandet finns spårbart i GSD och Git. Ingen ytterligare verksamhetsgodkännandefråga införs.</done>
</task>

</tasks>

<verification>
Behörighetsmatrisen måste pröva positivt och negativt på SQL och verkligt API. Det är otillräckligt att bara visa en ny knapp. Skilj skapande från godkännande och läsbar gemensam källa från skrivmandat över dess andra skolor. Ingen originalpost får ändras av kopieringen. Rektor ska behålla status/retry-säkerheten från huvudmannens flöde. SS 12000-avstämningen i kontexten gäller; bevarade standardrelevanta relationer är verifieringskrav, men provet bevisar inte externt informationsutbyte.
</verification>

<success_criteria>
Rektor skapar och kopierar på sin aktuella skola, kan skicka utkastet för beslut och kan inte godkänna det. Huvudman kan godkänna och behåller sitt tidigare flöde. Kopiering från en gemensam ram skapar endast rektorns egen skolkopia. Återkallat mandat och främmande skola stoppas även vid direkt API/SQL och kvittoläsning. Samma verifierade kandidat kör lokalt med bevarade data, uppdaterad handbok och konkret verifieringsredovisning.
</success_criteria>

<output>
Skriv 05-RECTOR-PROGRAMPLAN-SUMMARY.md med resultat per nivå, aktuella käll-/artefakthashar, databevarande, städning, eventuella avvikelser och leveransrevision. Samordnaren uppdaterar STATE.md utan att återöppna tidigare godkännanden eller deklarera hela fasen färdig.
</output>
