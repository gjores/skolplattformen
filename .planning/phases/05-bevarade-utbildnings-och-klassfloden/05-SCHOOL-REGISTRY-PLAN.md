---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: SCHOOL-REGISTRY
requirements: [ADMIN-01]
type: execute
status: awaiting_user
wave: 1
depends_on: [COPY-ATOMIC]
autonomous: true
gap_closure: true
files_modified:
  - supabase/migrations/20261014120000_phase5_school_registry.sql
  - supabase/migrations/20261014121000_phase5_worker_school_registry.sql
  - supabase/tests/phase5_school_registry.test.sql
  - web/lib/school-registry.ts
  - web/lib/school-registry.test.mjs
  - web/lib/server/school-registry.ts
  - web/lib/server/school-registry.test.mjs
  - web/lib/server/school-registry-upstream.ts
  - web/lib/server/audit-details.ts
  - web/app/api/skolor/route.ts
  - web/app/api/skolor/register/route.ts
  - web/app/api/skolor/register/spara/route.ts
  - web/app/api/skolor/register/status/route.ts
  - web/app/protected-school-workspace.tsx
  - web/app/protected-school-workspace.css
  - web/app/protected-home.tsx
  - web/e2e/school-registry.spec.ts
  - web/e2e/fixtures/school-registry-preview.tsx
  - web/e2e/fixtures/school-registry-preview.html
  - web/e2e/fixtures/school-registry-manual.tsx
  - web/e2e/fixtures/school-registry-manual.html
  - web/playwright.school-registry.config.ts
  - docs/handbok/kundadministration.md
  - docs/handbok/mandat.md
  - work/pilot/verify-school-registry.mjs
  - work/pilot/verify-school-registry.test.mjs
  - work/pilot/verify-school-registry-api.mjs
  - work/pilot/apply-school-registry.mjs
  - work/pilot/activate-school-registry.mjs
  - work/pilot/activate-school-registry.test.mjs
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-SUMMARY.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-VERIFICATION.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-USER-TRIAL.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
must_haves:
  truths:
    - "Huvudmannen kan söka på kod eller eget organisationsnummer, granska en skolträff och uttryckligen lägga till den."
    - "En behörig uppdatering ändrar registerfakta men bevarar lokalt tillsatt rektor, lokala årskurser, elevregisterkälla och levande mandat."
    - "Förändrad källa eller skola kräver ny granskning; ett tappat svar kan återläsas utan dubblett."
    - "Import ger ingen automatisk åtkomst till planering eller rektorsuppdrag."
    - "Användaren får en prövad vy och ett konkret, ärligt avgränsat användarprov."
  artifacts:
    - path: web/lib/school-registry.ts
      provides: Strikta gemensamma uppslags-, list-, revisions- och kvittokontrakt
    - path: supabase/migrations/20261014120000_phase5_school_registry.sql
      provides: Stängd atomär import och registeruppdatering med mandat, CAS, replay och audit
    - path: web/app/protected-school-workspace.tsx
      provides: Huvudmannens skolenhetslista och granskad enskild import/uppdatering
  key_links:
    - "Levande uppdrag → serverhärledd kund/huvudman → jämförelse mot registrets organisationsnummer"
    - "Granskat uppslag → fingerprint och lokal revision → låst atomär sparning"
    - "Fryst full request → beständigt kvitto → läsande status och exakt återläsning"
---

<objective>
Slut ADMIN-01:s faktiska skyddade import-/uppdateringsgap. Genomför tre avgränsade arbetspaket med separata kontrollerade commits: SQL/kontrakt/server, huvudmannavy/handbok, faktisk verifiering/leverans. Mänsklig acceptans ligger i en separat provöverlämning efter denna autonoma plan. Ingen prestandaombyggnad, kundadministrationsomskrivning eller automatisk mandatändring ingår.
</objective>

<execution_context>
@/Users/petter.gjores/.codex/skills/gsd/agents/executor/SKILL.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-CONTEXT.md
@web/lib/server/skolverket.ts
@web/lib/server/authz.ts
@web/lib/server/mandates.ts
@web/app/api/kund/skolenhet/route.ts
@web/app/api/kund/mandat/urval/route.ts
@web/app/protected-home.tsx
@supabase/migrations/20260913200000_phase2_access_model.sql
@supabase/migrations/20261014100000_phase5_atomic_cohort_copy.sql
</context>

<tasks>
<task type="auto">
<name>1. Inför huvudmannens skyddade registerkontrakt och atomära SQL-kommando</name>
<files>web/lib/school-registry.ts, web/lib/school-registry.test.mjs, web/lib/server/school-registry.ts, web/lib/server/school-registry.test.mjs, web/lib/server/school-registry-upstream.ts, web/lib/server/audit-details.ts, web/app/api/skolor/route.ts, web/app/api/skolor/register/route.ts, web/app/api/skolor/register/spara/route.ts, web/app/api/skolor/register/status/route.ts, supabase/migrations/20261014120000_phase5_school_registry.sql, supabase/migrations/20261014121000_phase5_worker_school_registry.sql, supabase/tests/phase5_school_registry.test.sql</files>
<action>Fastställ TypeScript-exporterna i school-registry.ts först så att UI-arbetet kan börja parallellt. Följ exakt femfältig request och fyra routes i CONTEXT. Lägg avgränsad organisationssökning i den nya serveradaptern school-registry-upstream.ts som återanvänder befintlig registerreducering med strikt schema, timeout, redirect-spärr, maxantal, stabil sortering, felklassning och fortsatt detaljerat koduppslag. Kontrollera organisationsnummer i alla kod-/organisationsuppslag och igen vid sparning mot levande serverhärledd huvudman. Acceptera aldrig klientens skoldata, kund-ID, huvudmans-ID, lokal rektor eller mandat som auktoritet. Läsande listning ger bara mandatbundna skolor samt egna importerade skolor från identitetsbundna kvitton inom samma aktuella huvudman; egna importskolor utan mandat märks canUpdate=false. Andra omandaterade skolor får inte läcka via listning eller befintlig-kod-konflikt. Import kräver faktisk HM-roll hos huvudmannen, update kräver dessutom aktuellt skolmandat. Reuse etablerade session-/kundlås och fulla levande uppdragskedjan; roll-GUC räcker inte.

Implementera stängd SQL-grund med två exakta entrypoints enligt CONTEXT och ett separat kvitto med RLS och inga direkta klient-/Worker-tabellgrants. Lås huvudman/skola och commandId i stabil ordning. Kontrollera full request och tenant-/identitetsbindning före kvittoåtergivning; status/replay når inte extern tjänst och status skapar aldrig skola/snapshot. Nya kommandon kräver nyligen serverhämtade registerdata med rätt orgnummer och rätt fingerprint samt aktuell lokal revision. Skapa/update, skolformsupsert, provenance snapshot, kvitto och obligatorisk DB/Worker-audit tillhör samma transaktion. SQL validates shape/metadata även vid direktanrop. Behåll befintliga skolformer som saknas i källan, behåll alla grades, uppdatera endast registerprogram för inkommande former och exponera separat aktuellt registerurval. Rör inte pupil_register_source, assignments, assignment_units, access_assignments, mandate_units eller utbildnings-/elev-/planrelationer. Registrerad headMaster visas aldrig som lokalt utsedd rektor. Skriv inga råa registerpayloads eller namn i säkerhetsaudit; snapshot stannar i den skyddade provenienstabellen. Nya helpergrants är stängda; endast två entrypoints aktiveras efter faktisk preflight. Bevara äldre kundadminväg oförändrad.</action>
<verify>Riktade Node-prov på parsers och injicerad registertransport: fel kod/orgnummer, saknat/mismatchande registerhuvudman, timeout/redirect/malformed/översize/404, gammal preview, strikt body, receipt replay utan upstream, lokal konflikt och serverns SQLparametrar. SQL rollback: import/update/replay/status, samma request annan identitet/kund, stale request/token, utgånget/avslutat HM eller skolmandat, okänd schoolID, audit-/snapshotfel, samtidiga samma kod/UUID. Bevisa inga delrader/dubbletter och oförändrad lokal rektor, grades, pupil_register_source, mandat och plan-/klassgrafer. Kontrollera canUpdate=false för egen import utan skolmandat och att annan omandaterad skola inte blir synlig. Befintliga auditankare, DDL/ACL/journal och fulla äldre rader bevaras.</verify>
<done>Stricta kontrakt/server och stängd atomär grund har färska positiva, negativa, race- och bevarandebevis. Befintliga mandates har inte expanderats. Uppdateringens kvarvarande lokala skolformer är synliga som avgränsning.</done>
</task>

<task type="auto">
<name>2. Lägg till skolenhetsvy med uttrycklig granskning och säker återhämtning</name>
<files>web/app/protected-school-workspace.tsx, web/app/protected-school-workspace.css, web/app/protected-home.tsx, web/e2e/school-registry.spec.ts, web/e2e/fixtures/school-registry-preview.tsx, web/e2e/fixtures/school-registry-preview.html, web/e2e/fixtures/school-registry-manual.tsx, web/e2e/fixtures/school-registry-manual.html, web/playwright.school-registry.config.ts, docs/handbok/kundadministration.md, docs/handbok/mandat.md</files>
<action>Ny huvudmannameny Skolenheter, separat från Kundadministration. Visa bara aktuell serverlista och canUpdate. Sök på skolenhetskod eller förifyllt aktuellt organisationsnummer; organisationslistan väljer en skola i taget. Detaljkort visar namn/kod/adress/kommun/status/registrets skolformer och källa. Uppdatering jämför nuvarande registeruppgifter med det nya underlaget och visar tydligt att utsedd rektor, lokala årskurser och uppdrag behålls; visa källa separat från lokal skolformsuppsättning när de skiljer sig. Ha tydliga Lägg till skolenhet/Uppdatera registeruppgifter och inga writes från sökning. Import utan verksamhetsmandat förklarar nästa verksamhetssteg via Mandat utan att lova automatisk tilldelning.

Sparning fryser femfältig request och UUID. Vid osäkert svar visa Läs sparstatus och blockera ny sparning/navigering tills saved/not_found; retry återanvänder exakt request. Saved följs av återläsning, och läsfel efter saved ska ge återhämtningsknapp utan ny import. Stale revision eller källa kräver omläsning och ny granskning. Epoch/uppdragsbyte rensar gammal data, sena svar får inte ersätta nytt urval. Följ befintlig MFA/session/CSRF-felhantering, formulärfokus och mobilkort. Uppdatera handbokstext med endast användarbeteende och faktisk käll-/mandatgräns. Fixturepreview ligger isolerat under e2e och importeras aldrig av skyddad produktapp. Den fristående manualfixturen använder samma produktkomponent men hanterar samtliga registeranrop i minnet, med synlig simuleringsmärkning och återställningsknapp. Inga produktionsflaggor, sessionscookies eller verkliga API-/databasvägar används där.</action>
<verify>Dator/telefon: kod- och orgsökning, välj en av flera träffar, ny import, befintlig update, mismatch/saknat orgnummer, ändrad källa/revision, kvarvarande lokala former, registerpayload med rektorsupplysning som inte tas över, utan ändrad lokal rektor, tappat svar→status, not_found→samma requestretry, sparat men omläsningsfel, sen träff efter nytt urval, byte av uppdrag, tangentbord/fokus och ingen horisontell sidöverströmning. UI-prov med fixtures etiketteras som sådana. Typkontroll och app/lib-lint passerar.</verify>
<done>Huvudmannen kan begripligt granska och bekräfta en skola i taget, förstå bevarade lokala uppgifter och återhämta osäkert utfall utan dubblering. Handboken beskriver verifierat beteende.</done>
</task>

<task type="auto">
<name>3. Pröva faktisk väg, aktivera exakt och lämna ett ärligt avgränsat användarprov</name>
<files>work/pilot/verify-school-registry.mjs, work/pilot/verify-school-registry.test.mjs, work/pilot/verify-school-registry-api.mjs, work/pilot/apply-school-registry.mjs, work/pilot/activate-school-registry.mjs, work/pilot/activate-school-registry.test.mjs, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-SUMMARY.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-VERIFICATION.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-USER-TRIAL.md, .planning/STATE.md, .planning/ROADMAP.md, .planning/REQUIREMENTS.md</files>
<action>ROOT äger seriella målskrivande verifieringar, migrationsapply och runtimeleverans. Granska verktygen före målåtkomst. Kör SQLrollback, riktade Nodeprov, typ/lint, protected appbygge och docs:build. Utför byggd Worker HTTP-prov för verklig session/roll/MFA/CSRF/audit, lista och negativa källmatchningar. Kör core-serverkommandot med verklig isolerad DB och injicerad syntetisk registertransport för positiv import/update/CAS/replay samt återhämtning. Redovisa klart om dessa positiva prov inte gått genom publik upstream och byggd HTTP-route. Transportinjektion får finnas i testad serverfunktionsparameter, aldrig som produktionsstyrd endpoint/flagga. Läsande verklig Skolverketskontraktskontroll ska använda officiell tjänst och ge inget kommunanslutningspåstående. Om den ordinarie syntetiska huvudmannen saknar en matchande publik registerträff får fel organisationsnummer aldrig accepteras. Faktisk Worker-verifiering använder en separat ägd syntetisk kund med offentlig registerreferens och avgränsad städning; det innebär inget verkligt företrädarskap. Positiva HTTP-/registerprov ska redovisas som sådana först efter faktisk lyckad körning.

Mät fulla baseline-rader inklusive lokal rektor, mandat, skolformer/grades, audit/identiteter, DBdefinitions-/ACL-/journal innan prover. Städa endast egen syntetisk graf och bevara auditankare. Mät historiskt saknade ankare som baseline, kräv noll nya. Första felresultat bevaras. Separat tillfällig exakt grantpreflight följs av återställning, granskad foundation/grantapply och färsk slutkontroll. Bevara och verifiera gamla grants. Leverera samma bytekontrollerade bygge på 3012, med frisk health och läsande kontroll att tidigare planering/exempel och huvudmannens navigation består.

Om ordinarie syntetiska huvudman saknar publik registermotsvarighet: lämna ordinarie appens verkliga lista/felhantering tillgänglig och starta den separata lokala manualfixturen på http://127.0.0.1:5198/e2e/fixtures/school-registry-manual.html, med permanent synlig rubrik Avskilt användarprov och texten Simulerade registeruppgifter; inga vanliga skolor ändras. Den demonstrerar samma komponent med tydligt märkt syntetiskt underlag, lokal rektor, grades och exempeluppdatering. Mänskligt prov av denna vy är användbarhetsbedömning, inte verifiering av riktig registeranslutning eller DBpersistens. Ge exakta URL:er/roller/steg och be användaren bedöma kod/orgval, granskning, bevarad rektor och mobil. Registrera eventuellt återstående actual HTTP/upstreamgräns, full ADMIN-01 och fasacceptans öppet. Commita selektivt och pusha aktuell gren enligt stående tillstånd, verifiera fjärrrevision och undvik orelaterad arbetskopia.</action>
<verify>Varje bevisnivå har faktisk körning och känd exitstatus. SQL/coreDB/HTTP/mockUI/fullupstream får separata statusar. Underlag och mandat oförändrade utanför ägd graf, noll nya auditankargap. Exakt migration/grant och prövat bygge matchar leverans. Dator/telefon, typ/lint/app/handbok passerar för ändringen. Användaren får testbar konkret vy med rätt sanningsnivå och inga påstådda nya godkännanden.</verify>
<done>ADMIN-01:s kod är implementerad och relevant automatiskt prövad, begränsningar synliga, prövad app levererad och mänskligt prov awaiting_user. Full fas 5, historiska avvikelser och verklig kommunanslutning stängs inte automatiskt.</done>
</task>
</tasks>

<verification>
Prioritera gränserna mellan registerfakta och lokala beslut, mellan servermandat och användarens sökval samt mellan bekräftad sparning och okänt transportutfall. Behåll tidigare provresultat som historik. Kör inte om hela äldre fasens sviter när avgränsade färska kontroller räcker; bredare kontroll motiveras av faktiska ändringar eller fel. Database fixtures körs seriellt. UI kan utvecklas parallellt med backend efter kontraktslåsning; varje agent har exklusivt filägande och ROOT samordnar integration/runtime.
</verification>

<success_criteria>
Godkänt ADMIN-01-beteende är genomförbart genom huvudmannens skyddade väg: en vald skola från eget organisationsnummer eller matchande kod, registerfakta med adress/skolform och bevarad lokal rektor. Ingen rättighetsutökning följer automatiskt, inga delimporter/dubbletter vid fel, inga tysta ändringar av lokala konfigurationer. Bevis och kvarvarande miljögränser är spårbara innan användarbedömning.
</success_criteria>

<output>
Skriv SUMMARY, VERIFICATION och separat USER-TRIAL. Uppdatera aktuell GSD-status och ADMIN-01-spårning med faktiskt genomförande, avgränsningar och awaiting_user. Historiska totalsiffror ändras inte utan inventering.
</output>
