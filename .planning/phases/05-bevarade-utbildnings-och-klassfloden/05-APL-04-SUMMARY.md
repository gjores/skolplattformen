---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-04
subsystem: protected-apl-api
status: complete
requires: [APL-01, APL-02, APL-03]
provides: [protected-apl-routes, independent-frozen-apl-projection, bounded-apl-requests, exact-apl-worker-entrypoints]
affects: [APL-04A, APL-05, APL-07, APL-08]
key-files:
  created: [web/lib/server/apl-plan.ts, web/lib/server/apl-plan.test.mjs, web/app/api/timplaner/gym/apl/lasa/route.ts, web/app/api/timplaner/gym/apl/kommando/route.ts, web/app/api/timplaner/gym/apl/status/route.ts, supabase/migrations/20261016122000_apl_worker_access.sql, work/pilot/verify-apl-plan-access.mjs]
  modified: []
---

# APL-04 – skyddad APL-API och frysta sparbesked

Tre POST-vägar och en oberoende serverprojektion är implementerade. De avgränsade Node-serverproven passerar 18/18, TypeScript och riktad oxlint passerar. Faktisk PostgreSQL-Worker-/serverparitet och exakt ACL-inventering passerar 28 kontroller i en egen schema-only-testdatabas. Fem felinjicerade svar efter verklig SQL-skrivning bevisar transaktionsrollback före lyckat serversvar. Ingen aktiv databas, 3012, permanent installation, generell authz-kod eller global planeringsstatus ändras av detta arbete.

## Servergräns

- `/api/timplaner/gym/apl/lasa` tillåter huvudman, rektor och administratör med aktuellt mandat. Läsning kräver inte nytt MFA-bevis.
- `/api/timplaner/gym/apl/kommando` tillåter rektor och administratör att förbereda APL. Bekräftelse av förläggningen kräver uttryckligen rektor även i serverhelpern. Mutationen kräver samma ursprung, färskt MFA-bevis och obligatorisk Worker-audit.
- `/api/timplaner/gym/apl/status` tillåter rektor/administratör att återfinna sitt exakta kommando utan nytt MFA-bevis. Status för en rektorsbekräftelse tillåts endast rektor, även om kvittot ännu inte finns. SQL kontrollerar aktör/uppdrag och exakt request; status är ingen allmän kvittoläsning för huvudmannen.
- Alla tre vägar använder `protectedRoute`, aktuellt kontext-epoch, samma ursprung och obligatorisk audit i samma transaktion som projektionen. Svaret har `no-store`. Skolmandat kontrolleras i befintlig faktisk SQL-scope; sessionens enda `unitId` används inte som en ersättning för ett mandat över flera skolor.

`aplRequest` läser högst 2 MiB faktiska UTF-8-byte innan JSON och domänkontrakt tolkas. Gränsen gäller även utan eller med felaktigt lågt `Content-Length`. Överskridande avbryter läsaren och ger 400 med den fasta orsaken `payload_too_large`; domänmodellens kombinerade teoretiska maxgränser är inte löfte om att varje sådan kombination ryms i en HTTP-begäran. Detta gäller även statusfrågans fullständiga ursprungliga kommando. Ogiltig JSON/UTF-8, extra fält, aktörsfält och ändrad/saknad kontraktsversion stoppas före operationens SQL.

SQL-fel minimeras till befintliga HTTP-felkoder. En uttrycklig lista tillåter APL:s revisions-/kommando-/innehållskonflikt och rättningsorsaker; råa SQL-texter, details och okända hints lämnas aldrig ut. Känd anslutningsförlust blir `db_unreachable`/503. Obligatorisk audit eller trasig serverprojektion behåller befintliga `audit_unavailable`/500. Ingen generell ändring av authz-felstatus införs för att anpassa plantexten.

## Återanvändbar verifiering för APL-04A

`projectAplFrozenBasis(value, expectedPlanId)` returnerar `{basis,context}` efter exakt outer-shape, full fryst gymtimplan/katalogverifiering och oberoende härledning av programmetadata. `sourceSupported` beräknas från samma frysta källa med administrativa status-/arkiveringsmarkörer neutraliserade (`utkast`, `archived:false`). Ingen aktuell databas- eller repokatalog ersätter kvittots källa.

`projectAplFrozenRead(value, basisValue, expectedPlanId, authority)` returnerar `{body,basis,context}`. `AplProjectionAuthority` är `Pick<SessionContext,'identityId'|'assignmentId'|'organizerId'|'accessFunction'>` från den färskt kontrollerade skyddade kontexten. Helpern använder APL-01:s verkliga parsers, allokeringsvalidering och innehållshash. Plan-ID, revision, huvudman, program, granskningsposter, skolbundna händelser och hela kvittots frysta innehåll måste stämma.

`canSave`, `canConfirm` och underlagets `gymTimplan.canPlan` jämförs exakt mot faktisk roll, fryst planstatus och arkivering. Kapabiliteter från SQL är inte egen behörighetsauktoritet. Äldre händelser får tillhöra en annan rektor; ett nytt confirm-resultat och uttryckliga kopieringsresolutioner måste däremot matcha requestaktörens identitet och uppdrag, även vid återhämtning. Bekräftelser granskas dessutom med den oberoende fullständiga APL-projektionens `readyForConfirmation`.

Ett APL-kommandokvitto kräver dessutom att dess verifierade frysta snapshot är redigerbart (`canSave`, samt `canConfirm` för bekräftelse). APL-kommandon ändrar inte planstatus. Därför kan ett internt sammanhängande snapshot av en fastställd plan vara giltigt för läsning men aldrig vara ett giltigt spar-/bekräftelsekvitto. Kontrollen gäller också status och replay; den senare aktuella planens fastställande ändrar inte det historiska kvittots då redigerbara snapshot.

`readAplPlan(tx,input,authority)`, `commandAplPlan(tx,input,authority)` och `readAplStatus(tx,input,authority)` returnerar `{body,event}`. Routes tillför inte nya publika wrapperfält. Read är `AplReadReply`, command är `AplCommandReply` och status är `AplStatusReply`. Kommandots/resultatets matchning, revisionsdelta, semantic no-op, sparad plan, innehållshash och bekräftelse-ID kontrolleras innan transaktionen får committas. En status-/replayprojektion använder enbart det lagrade ögonblicket; aktuell plan läses separat och skrivs aldrig över från ett gammalt kvitto.

## Minsta databasåtkomst

Aktiveringsmigrationen tilldelar Worker `EXECUTE` endast på `phase5_apl_plan_read(uuid)`, `phase5_apl_plan_command(jsonb)` och `phase5_apl_plan_status(jsonb)`. Samma tre funktioner förblir stängda för public/anon/authenticated/service_role. Inga tabell-, sequence- eller hjälpargrants tillkommer i migrationen. Den installeras endast med båda föregående APL-migrationer och motsvarande Worker-version; den isolerade runnern har verifierat exakt denna ACL-differens och oförändrade övriga definitioner.

## Genomförda kontroller

`node --test lib/server/apl-plan.test.mjs`: **18/18 PASS**. Testerna använder riktiga routes, `protectedRoute`, MFA-/ursprungs-/epochkontroller, katalogverifiering, parsers och domänprojektion. DB-anrop, sessionhämtning och transaktionslagring är kontrollerade doubles. De bevisar inte riktig Worker, OIDC-inloggning eller faktisk PostgreSQL-rollback.

Proven täcker tre läsroller och flera skolor, explicit legacy/null, historisk fastställd plan, rektor/administratörs save/no-op, rektorsbekräftelse, roll- och MFA-nekanden före SQL, faktiskt fresh context i stället för äldre rollhint, återkallat uppdrag, främmande ursprung, inaktuellt epoch, requestkontrakt, storleksgräns exakt vid 2 MiB och över gränsen i flera chunks med saknat/falskt Content-Length.

Felinjicerade SQL-svar omfattar full katalog, frysta rader, främmande plan/huvudman/period, fel minutantal, okänd rowKey, inaktiv termin, falskt `sourceSupported`, falska capabilities, innehållshash, command-ID, revision, bekräftelseaktör/-uppdrag/-skola, kopieringsresolutionens aktör, version och saknade fält. Även ett felaktigt allokeringsresultat med matchande request och nyberäknad hash avvisas av oberoende validering. Status/replay verifieras med en senare separat ändring i aktuell plan och får aldrig läsa eller återställa den planen. `not_found` får inte bära basis och completed kräver korrekt fryst basis och replay-kvitto.

**Testad rollbackgräns:** när SQL-doublen först har registrerat en mutation och därefter svarskontrollen eller obligatorisk Worker-audit misslyckas återställer transaktionsdoublen samtliga registrerade mutationer och lyckade auditposter. Svaret innehåller inga APL-data. Den separata faktiska SQL-körningen nedan verifierar rollback efter projektionsfel. Obligatorisk yttre Worker-audit är här prövad med transaktionsdouble och behöver fortsatt faktisk HTTP-verifiering.

`npx tsc --noEmit --incremental false`: PASS. Riktad `npx oxlint lib/server/apl-plan.ts lib/server/apl-plan.test.mjs app/api/timplaner/gym/apl`: PASS. En första lintkörning hittade obundna metodreferenser i testets DB-double; den gjordes till arrow-funktion före slutkörningen. Rootens läsgranskning hittade att statusroute initialt tillät huvudman trots SQL:s snävare kommandoägande; route och serverguard rättades och ett separat prov lades till. Egen eftergranskning lade till kravet att kommandokvittots frysta status verkligen är redigerbar. Ett riktat prov verifierar både nytt/replay/status för save och confirm med ett separat giltigt men fastställt lässnapshot. Efter denna ändring passerade 18/18 serverprov, TypeScript och riktad lint.

## Faktisk SQL- och åtkomstverifiering

`node work/pilot/verify-apl-plan-access.mjs --out /private/tmp/apl-access-final.json`: **PASS 2026-10-16, 28 kontroller**. Rapporten är privat och versionshanteras inte. Körningen använder en egen strukturidentisk schema-only-kopia, `dataCopied:false`, med tomt authschema och enbart syntetiska BF-/SA-underlag. Fixturedata och äldre beslutsreceipts skapas före APL-migrationerna. De tre migrationerna installeras först inom en transaktion som rullas tillbaka: alla **65 ursprungliga tabeller med 337 rader**, fullständiga tidsstämplar/kvitton och schema/ACL återställs exakt. Därefter installeras migrationerna endast i samma ägda testdatabas för serverproven. Testdatabasen och privata målresurser är borttagna, `cleanup:complete`. **79 källhashar** var oförändrade genom slutkörningen.

Aktiveringsmigrationens fulla ACL-differens är exakt tre nytillkomna `EXECUTE` för `skolplattform_worker`, utan grant option: `phase5_apl_plan_read(uuid)`, `phase5_apl_plan_command(jsonb)` och `phase5_apl_plan_status(jsonb)`. Inget grant tas bort. När endast dessa tre ACL-fält normaliseras är hela schemastrukturen identisk före/efter: noll ändrade tabeller, kolumner, ägare, policies, hjälpar- eller funktionsdefinitioner. Alla originalrader är oförändrade av installationen. Direkta Worker-anrop till APL-tabell, receipt-sidecar och intern värdehelper nekas med `42501`.

SQL körs med en faktisk PostgreSQL-inloggning där både `session_user` och `current_user` är `skolplattform_worker`. Verkliga serverhelpers, domänparsers och katalogprojektion används i samma databastransaktion. Syntetiska sessioner och uppdrag sätts via befintlig verifieringshelper; serverns auktoritetsargument hämtas genom exakt fixturekoppling till identitet/kund/uppdrag. Det är inte en faktisk `protectedRoute`-/MFA-/OIDC-inloggning. Node-loaderns enda runtimeersättning är en tom import av Cloudflare-bindningar; privat miljökonfiguration återställs efter körningen.

Verifierade flöden:

- Rektor, administratör och huvudman får korrekta läskapabiliteter; rektor för annan skola nekas. Rektor och administratör sparar ändrat innehåll; huvudmannens save och administratörens rektorsbekräftelse nekas.
- Save, explicit `not_found`, exakt replay och status passerar verklig SQL och oberoende serverprojektion. Rektors bekräftelse återläses med exakt händelse-ID och aktör. Ett gammalt sparbesked är identiskt efter senare fastställande, medan aktuell läsning korrekt stänger redigering.
- Fyra faktiska save-svar förvanskas efter avslutad SQL-operation: saknad kontraktsversion, falsk kapabilitet, fel innehållshash respektive fel minutallokering. Även ett faktiskt submit-svar utan obligatorisk APL-del avvisas. Varje fall kräver **exakt en observerad callback efter SQL-svaret** och det uttryckliga felet `AuditUnavailable`; en godtycklig 500/503 räknas inte. Samtliga public-raders hash, inklusive revision, kvitton, händelser och SQL-audit, är exakt lika före/efter respektive rollback.
- Nya beslut använder APL-04A:s verkliga underlags-/kommandohelpers genom submit, approve och historisk replay. Rektors innehållshash är stabil genom statusbytet. Äldre receipts läses via explicit legacy; ett före namngivning konstruerat syntetiskt receipt utan `series` och `history.nameAtDecision` verifieras separat. Det läggs in som en ny äldre-form-fixture före migrationen och är inget påstående om verkliga historiska användardata.
- Äldre inskickad BF utan strukturerad APL kan inte godkännas på nytt, men inkorg/lista behåller granskningsuppgiften och återsändning fungerar. Programplansbeslut och SA-timplanens submit/approve fungerar med explicit `apl:null`.

**Avvikelse och första fel:** den separata återanvändbara runnern tillkommer utöver planens ursprungliga fillista för att bevisa faktisk SQL-/serverparitet och full ACL-differens utan att ändra slutverifierade 02-/03-runners. Första körningen stoppade i runnerns jämförelse av postgres `Result`-arrayprototyp med en vanlig klonad array; efter symmetrisk normalisering passerade andra körningen. Ingen SQL-produktändring krävdes. Efter den avgränsade serverförstärkningen av kvittots redigerbarhet kördes hela slutprovet igen och passerade. `node --check`, riktad `web/node_modules/.bin/oxlint work/pilot/verify-apl-plan-access.mjs` och `git diff --check`: PASS.

## Bevarande och kvarstående prov

SS 12000:2024 utgåva 4/OpenAPI 2.1.0 beaktas enligt APL-kontraktet: stabila organisations-, skol-, plan- och periodidentiteter samt giltighet/källansvar bevaras i strikt verifierat fryst underlag. APL är fortsatt ett internt planobjekt utan verifierad full extern motsvarighet. API:t skapar ingen Placement, Attendance, klasskoppling, elevförflyttning eller standardexport. Inget externt informationsutbyte verifieras här.

APL-04A äger parallellt versionsmedvetna beslut och klientjournal. APL-05/07 äger UI-flödet. Faktisk HTTP i Worker-runtime, OIDC/MFA och användarbeteende återstår enligt APL-08; verklig PostgreSQL-Workerroll och Node-serverhelpers är verifierade ovan. Full fas- eller kravacceptans följer inte av Node-proven. Samordnaren äger commit, push och samlad planeringsstatus.

## Komplettering från APL-07: källprofil för kullstart 2028

Det faktiska kopieringsprovet visade att SQL korrekt gav `sourceSupported:false` för en yrkeskull från 2028-07-02, medan serverns frysta projektion enbart använde den allmänna källberedskapen. Det gjorde att läsning av ett korrekt markerat underlag avvisades. `aplSourceProfileSupported` härleder nu samma profil- och datumvillkor oberoende av den inkommande stödflaggan, och kombineras med verifierad källberedskap i servern och den isolerade kommandorunnern. Begränsningen för yrkeskullar från detta datum kvarstår; underlaget kan läsas utan att det felaktigt anges som beslutsklart. Ingen migration ändrades.

Nytt serverprov var först RED (500 i stället för 200). Efter rättningen passerar 71/71 riktade modell-, APL-server- och beslutsserverprov, TypeScript och riktad produktlint. Ett korrekt omhashat men falskt påstående om källstöd avvisas fortfarande. Datumgränser, okänd profil, programmens slut-/annulleringsdatum och högskoleförberedande program provas separat. Den uppdaterade faktiska SQL-/serverpariteten redovisas i APL-07; äldre resultat ovan är bevis för respektive dåvarande källversion.

Efter rättningen passerar även hela faktiska åtkomst-/serverprovet igen: `/private/tmp/apl-access-profile-fixed.json`, 28 kontroller, exakt tre Worker-grants och fem observerade projektionsfel efter skrivning med full rollback, `cleanup:complete`. APL-07 samlar de förnyade kopierings- och samtidighetsbevisen.
