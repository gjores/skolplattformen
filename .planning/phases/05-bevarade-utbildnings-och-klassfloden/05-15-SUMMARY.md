---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "15"
subsystem: protected-programme-education
status: complete
completed: 2026-10-02
requirements: [ADMIN-02]
requires: [05-14]
provides:
  - Mandatbundna GY-skolor och exakta program-/inriktningsval från verifierad lagrad helkatalog.
  - Atomisk ny utbildning och första programplansutkastet för huvudman.
  - Beständigt eget UUID-kvitto, återläsning och säkert omtag efter okänt svar.
affects: [05-16]
---

# 05-15: skyddat gemensamt utbildningsunderlag och atomiskt skapande

Huvudmannen kan skapa en gymnasieutbildning och dess första programplansutkast i samma transaktion. Rektor får samma program-/inriktningsunderlag inom sitt aktuella skolmandat och fortsätter arbeta med befintliga utbildningar. Ingen ny rektorsrättighet införs.

## Leverans och beslut

Tre strikta POST-kontrakt och motsvarande skyddade routes har införts: `val`, `utbildning/skapa` och `utbildning/status`. Val börjar med verkliga GY-skolor även när de saknar utbildningar. Katalog och programversion väljs uttryckligen. Servern verifierar hela det lagrade katalogpayloadets SHA-256 innan ett mindre programs ämnesprojektion når klienten. Projektionen får aldrig verifieringskapabilitet eller användas som behörighetskälla. Exakta identiteter, inriktning, startdatum och ordnade ämnesnivåreferenser följer med.

Ny utbildning kräver aktuell huvudmansrelation, GY-skolform, kund-/huvudman-/skolmandat, samma ursprung, kontext-epoch och MFA. SQL återkontrollerar session och mandat efter verkliga låsväntan. Skapandet följer etablerad session → kund → skola/objekt-låsordning. Utbildningens status blir `planerad`, skolform `gymnasium`, startår härleds från det uttryckliga startdatumet och katalogdatumet från det lagrade underlaget. Befintlig basisvalidator och utkastskommandot prövar program, inriktning, historisk version, datum och nivåval innan transaktionen kan committa.

Den privata tabellen `programplan_education_receipts` binder kommando-UUID till verklig identitet, kund, huvudman, skola, normaliserad request, utbildnings-ID, plan-ID och det oföränderliga ursprungsresultatet. En ändrad session eller korrelation skapar inte en ny utbildning. Samma kommando/request återger samma ursprungsresultat; ändrad request eller separat exakt dubblett avvisas. Kvitto återläses bara genom aktuell behörig huvudmansrelation till den ursprungliga skolan. En annan kunds/aktörs UUID ger avgränsad frånvaro. Även samma identitet med ett annat aktuellt skolmandat nekas den tidigare skolans kvitto och replay.

Skapandet ger en historikhändelse med riktig identitet/session/medlemskap/uppdrag. Gamla auth.users-baserade historikoperationer behåller sina tidigare regler. Valets DB-audit och utkastets DB-händelse/audit ligger i samma transaktion som utbildningens DB-audit, privat kvitto och obligatoriska Worker-audit. Logg- eller kvittofel lämnar ingen utbildning, plan eller kvitto. Worker får bara tre nya EXECUTE-grants efter full API-preflight; samtliga tabeller och helpers förblir stängda.

## Verifierade resultat

Slutligt skyddat Worker-bygge: `529afa4366b40a3ccfa69d93f9fc9cf54e5e5656`. Tidigare programme/workspace-regression kördes på `74f7ce6362cde5cd1b871e810e2190a4e7e5f398`; den styrda app-/serverkoden är identisk i det senare bygget. Root har dessutom kompletterat enbart den verifierade syntetiska provskolans saknade GY-metadata och verifierar dess användarberedskap separat i 05-16. Senare harness-/beviscommits ändrar inte den kontrollerade byggkoden. Samlad källa, SHA-256 per relevant fil och rapportlänkar finns i `work/pilot/results/phase5-15-backend-verification.json`.

| Prov | Resultat och faktisk gräns |
|---|---|
| Ny SQL-grund | 50/50 pgTAP, 0 fel, inom yttre rollback mot verifierat isolated protected-mål. Roll/session/medlemskap/kund/mandat, ogiltig grund, audit-/kvittofel, replay/dubblett och samma identitet med fel aktuellt skolmandat prövade. |
| Nya samtidiga anslutningar | 4/4: samma UUID återger ett ID-par, annat UUID med exakt dubblett konflikterar, status väntar till skapandet committar och återkallat mandat under observerad låsväntan nekas. `pg_blocking_pids` och faktiska blockerar-/väntar-PID bevarade i rapporten. |
| Befintliga SQL-lås/regressionsgrund | 7/7, med faktisk väntan där relevant; 42/42 katalogparitetsfall. Exakt tretton Worker-funktioner, egna fixtures städade, audit och identitetsankare bevarade. |
| Byggd Worker, ny API-preflight | 43/43. Bara avsedda tillfälliga grants; exakt ursprunglig ACL återställd i finally. Båda egna fixturegraferna städade, tidigare verksamhetshashar oförändrade. |
| Byggd Worker, ny slut-API | 43/43 efter separat grant-migration på slutligt 529afa4-bygge. Faktisk första utbildning och första utkastet skapades på en tidigare helt tom GY-skola. Även faktisk senare planändring prövad: vanlig planläsning visar revision 1 medan skapandekvittot behåller ursprunglig revision 0. Nuvarande skolmandat kontrolleras vid kvittoläsning/replay. |
| Tidigare programplans-API | 48/48 på samma byggda Worker, explicit trettonfunktionsprofil, obligatorisk audit/rollback och egna cleanup; tidigare verksamhet oförändrad. |
| Tidigare arbetsytans läs-API | 38/38 på samma bygge/profil, inklusive verklig sessionsutgång efter observerad utbildningslåsväntan; tidigare verksamhet oförändrad. |
| Tidigare timplans-API | 39/39 på senare 529afa4-bygge med identisk styrd app/serverkod, trettonfunktionsprofil och eget cleanup; samordnat av root i `phase5-15-timplan-api-regression.json`. |
| Riktade kontrakt-/server-/harnessprov | 80/80 Node, 0 fel. Typkontroll och full app/lib-lint PASS; skyddat bygge PASS, genomfört av root som äger runtimekoordinationen. |

Nya API- och browserfixtures skapar endast egna syntetiska kunder. Kvitton och utbildningshändelser raderas före plan-/utbildningsraderna i owned cleanup. GY-rader raderas uttryckligen före skolor eftersom fixturestädningen använder `session_replication_role=replica`; säkerhetsaudit och dess identitetsankare raderas aldrig. Slutrapportens nya API behåller 112 egna audithändelser och två för den främmande owned-fixturen. Ingen mänsklig kund-/utbildnings-/planrad skrivs av dessa prov.

Browser och det gemensamma UI:t samordnas separat av root i 05-16; deras rapporter ska läsas tillsammans med denna backendgrund. Detta dokument uppgraderar inte ADMIN-02 eller hela fas 5 till verifierad.

## Avvikelser och tidigare FAIL

- **[Rule 1 — SQL-fel]** Det första lokala SQL-anropet hittade en tvetydig parameterreferens `unit_id`. Parametern och utbildningsnamn/kull i dubblettfrågan kvalificerades uttryckligen innan lås- och API-proven.
- **[Rule 1 — requestgräns]** Nullval måste skickas som SQL NULL, inte JSONB `null`; serverns initiala programval rättades och beteendeprov visar faktisk nullparameter.
- **[Rule 1 — fixture]** Första SQL-sviten använde inriktningskoden `SAMED`, som saknas i det exakta SA25-underlaget. Exakt `SAMJK` användes. Den utökade sviten passerar fullständigt.
- **[Rule 1 — fixture]** Första API-preflight blev 42/43 FAIL därför att provet försökte ändra en huvudmans tilldelning till kundadmin med huvudman fortfarande angiven. Databasens constraint stoppade fixtureändringen. En separat riktig kundnivåtilldelning ersatte försöket; därefter passerade samtliga 43. Den första FAIL-rapporten och loggen bevaras i ignored `web/outputs/phase5-15-education-api/first-fixture-fail.*`.
- **[Rule 1 — fixture]** En utökad SQL-omgångs sex globala radräkningar såg samtidiga egna API-provskapanden. Räkningarna avgränsades till SQL-fixturens egen kund/huvudman; samtliga 50 passerar. FAIL-råloggen bevaras i ignored `web/outputs/phase5-15-education-api/sql-global-count-fixture-fail.txt`.
- **[Rule 2 — städning]** Nya kvitton/utbildningshändelser och GY-fixturrader lades till i explicit owned cleanup. Äldre mock cleanup-resultat och ACL-profiler uppdaterades proportionerligt; historiska åtta-/tiofunktionsprofiler finns kvar som uttryckliga äldre val och `--education` anger tretton.

Ingen ny arkitekturfråga behöver användargodkännande: beständigt skapandekvitto och atomiskt utbildningsskapande ingår redan i användarens godkända gemensamma flöde och 05-15-planen. Ingen autentiseringsgrind inträffade; lokalt mintade testprofilssessioner används bara inom verifierad syntetisk provmiljö.

## Commits

- `74ceb50` — exakta kontrakt, servermappning och skyddade routes.
- `575ac93` — stängd SQL-grund, privat kvitto, historik, låsprov och preflight-/regressionsharness.
- `3a6e4ce` — korrekt kundadmin-fixtur och skärpta aktuellt-skolmandatprov.
- `ff4186f` — tre exakta grants efter full preflight och korrekt own scope för SQL-radräkningar.
- `134cf72` — faktiskt senare planändringsprov för oföränderligt kvitto och nuvarande skolmandat.
- `579d82a` — faktisk första utbildning på tom GY-skola och direktanropsguard för testharness.

UI-/browsercommits ägs av root/05-16 och blandas inte i denna avgränsade leverans.

## Kvarvarande gränser

Prov med verklig byggd Worker och PostgreSQL mot syntetiska data är genomförda. Interaktiv IdP-inloggning, verklig kommunanslutning och pilotdrift har inte verifierats genom dessa API-sessioner. Nationellt besluts-/regelgodkännande, fastställande, gemensamma paket, elevval, automatisk klasskoppling och kopiering till nästa kull införs inte här. Efter 05-16 återstår användarens nya begriplighetsprov av det gemensamma UI:t; tidigare 05-14 bedömdes som rörigt och är inte mänskligt godkänt.
