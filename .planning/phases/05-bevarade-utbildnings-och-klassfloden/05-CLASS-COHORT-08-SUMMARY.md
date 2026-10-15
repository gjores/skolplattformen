---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-08
status: complete
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
verification_scope: isolated_synthetic_sql_worker_oidc_browser
---

# Faktisk verifiering av tidig klassorganisation

Plan08 är genomförd med lokal syntetisk SQL-/Worker-/OIDC-/browserverifiering. Slutlig actual-körning nedan är6/6 PASS med exakt cleanup; tidigare fel och deras bevisgränser består. Nästa plan09 överför samma bygge lokalt. Mänsklig acceptans och full fas5 återstår.

## Databas och bevarande

De tre migrationerna för klassdatum, stabil länkidentitet och klasskommandon är installerade på det isolerade syntetiska målet. Före installation kördes hela matrisen i rollback på en egen historisk fixtur skapad före migration02. Alla gamla rader jämfördes på sina ursprungliga kolumner; inga historiska klassdatum fylldes i och inga äldre avvikelser rättades för provets skull.

Färsk rollback och installerad matris: **436 PASS** — datum/isolationsgränser 124, länkidentitet 68, kommandon 183, kontrakt 3 och tidigare klass-/timplansflöde 58. Kontraktsdelen omfattar faktisk SQL→TypeScript-parsning, riktig DB-roll och 5 534 Unicodeprober. Varje del saknar skips. Detta är inte ensamt ett bevis för samtidighet eller HTTP/OIDC.

Kedjan finns i privata rapporter:

- `class-cohort-08-initial-3.json`: första fulla 436-rollback, SHA256 `6ce12534dce0ebb65f47959fc06bda31fe380d27db0e1dc11bded95e0696ef08`.
- `class-cohort-08-fixture-rollback-3.json`: färsk rollback på den journalförda historiska fixturen, SHA256 `6d82a5d4ef90e3fb895eaadb9ef845e27d3f4c17cefbe2de3e727bc8d17ef174`.
- `class-cohort-08-apply-verify-1.json`: mål-/källbunden läsande förkontroll, SHA256 `04b0d2ce56f76f72e0a0452b94a8d492cc9dcb61dcd82d25cecebf7c485fbcef`.
- `class-cohort-08-apply-1.json`: exakt tre installerade migrationer och bevarade originalprojektioner, SHA256 `6c22e5dc8c0c205f091d03f0d41e53e8dc38e519512089479d8e82581a3dfab5`.
- `class-cohort-08-applied-1.json`: installerad 436-matris PASS men hela körningen **FAIL**, SHA256 `4200f25ebf8b22ad8ef51844eaa3aa31f2a798285eca2fc782dd944a93e13187`.

Alla rapporter ligger under `/private/tmp/`. De binder målets identitet, installerat schema/ACL/journal och använda källor. Första installerade körningen stannade i samtidighetsverktygets assertion: PostgreSQL returnerade ociterade aliaset `batchaudits`, medan JavaScript väntade `batchAudits`; båda hade värdet 1. Exakt egen cleanup passerade med noll verksamhetsrader/sessioner/främmande referenser kvar, oförändrade originalrader och bevarade 92 auditrader/två identitetsankare. Rapporten förblir FAIL.

Tidigare utvecklingsfel i aliaset för `programplan_roles.name` och i samtidighetsfixturens klassnamn är bevarade i separata FAIL-filer. De rättades före installation; återbindningen kontrollerade oförändrat mål, egna PK:n och gamla originalprojektioner. Historisk fixtur återskapas inte efter installation genom avstängda skydd. Fortsatt samtidighet använder en modern fixtur med installerade skydd och redovisar den tidigare fullmatrisens proveniens uttryckligt.

Den första cleanupens egna 92 auditrader har återverifierad exakt PK-mängd/antal/PK-hash. Deras sparade värdehash använde osorterad parallell SQL-läsning; den bevisar därför inte en ny ordningsoberoende värdejämförelse. Varken ursprunglig rapport eller hash ändras. Båda identitetsankarnas sparade värdehash matchar. Återupptagningen kräver en ny kanonisk före/efter-jämförelse av de 92 auditraderna, samtidigt som alla äldre originalprojektioner fortfarande jämförs med den gamla baslinjen. Begränsningen gäller dessa egna provhändelsers värdehash över återupptagningsgränsen, inte en upptäckt ändring av äldre verksamhetsdata.

## Faktisk samtidighet

Den separata återupptagningen passerade samtliga sju fall: klass före programplansstart, källås före direkt klass, klass före offeringkalender, identisk batch, ändrad revision före gammal begäran samt gamla snapshots i Repeatable Read och Serializable. Två NOWAIT-konflikter, tre faktiskt observerade blockeringsbarriärer och två samtidiga snapshotfall använder skilda databasanslutningar. Identisk batch ger samma klass-ID:n, två klasser, ett kvitto och en batchaudithändelse.

Slutrapport `/private/tmp/class-cohort-08-resumed-applied-1.json`, SHA256 `1f6c0ae62a9e26d8725d7abf4ab641db52467c7d35e0c5f49c4f8a8410516473`: PASS, stängd databas, exakt cleanup med noll egna verksamhetsrader/sessioner/främmande referenser kvar och oförändrade originalprojektioner. Den nya körningens 54 auditrader och två identitetsankare behålls. Den tidigare körningens 92 auditrader matchar den nya kanoniska före/efter-baslinjen. Fullmatrisens 436 kontroller märks uttryckligen som ärvda från den första installerade körningen.

Root kontrollerade rapportens proveniens, samtliga sju barriärer, aktuella 70 källhashar, cleanup och bevarande separat. `requireAppliedEvidence` passerade dessutom mot det aktuella målets schema/ACL/journal. SQL-verifierarna är versionshanterade i `63fa5ca`, pushade och fjärrverifierade. Faktiskt HTTP/OIDC följer separat.

## Produktkontroller och bygge

Mot produktkällorna i `3f421c56f2fbf959cdde9276b5bd29c9dbe87c7b`:

| Kontroll | Resultat |
| --- | --- |
| Fyra berörda Node-testfiler för klassorganisation och timplanskoppling | 41 PASS, 0 FAIL/skip, exit 0. |
| `npx tsc --noEmit` | PASS, exit 0. |
| `npx oxlint app lib` | PASS, exit 0. |
| `npm run build:protected` i separat checkout | PASS, exit 0. |

Privat kontrollsammanställning: `/private/tmp/class-cohort-08-code-checks.json`. Node-resultatet kommer från faktisk verktygskörning `31e071`; en separat rålogg för just denna körning sparades inte. Typ/lint/build-loggar och produktkällhashar finns i sammanställningen.

Det separata skyddade bygget startades på 3067 och flyttades senare till 3013 utan ombyggnad, med 201 artefaktfiler och samlat SHA256 `4de4f8654bb267c805f44437b11084f6685f0613078a6095a5a9dfa806a854a7`. Byggloggen har SHA256 `b3c848512f6e9f88bd6f6abb28b69b35252f234bd7eba2023463a61efb351829`. Ordinarie 3012 byts först i plan 09 efter avslutad faktisk verifiering.

## Verklig OIDC och Worker/API

Slutlig full körning **30 av30 PASS, exit0**, med fyra separata egna OIDC-konton, riktiga callbacks och serververifierad MFA. Matrisen omfattar tomt programplansutkast, tidig klassbatch utan elever/länkar, DB-/Worker-audit, idempotens och konflikter, huvudmannens läsläge, annan skola/kund, verkligt uppdragsbyte, origin/epok/session, ny engångskod, ändrad källa, vårstart, auditfel med rollback, ett faktiskt borttappat HTTP-svar följt av status/replay, ny programplansversion, tom kullkopia och uttryckligt läsårs-/versionsbyte.

Privat rapport `/private/tmp/class-cohort-08-api-4t4dc3hT/api.json`, SHA256 `c5ab50ce76440cf28e6fb4dcf2016b8bcb0c98d68955c7b541727716549621b9`. Exakt fixturecleanup: `/private/tmp/class-cohort-08-api-4t4dc3hT/fixture-753cde1e-288e-41dc-acbd-aa259ec75f57.json`, SHA256 `4a28b533193cb9f663e8d6142ee28fa69a9b24ff9ff1a51e7c40615a2ef55bc2`. Äldre verksamhetsdata och ankare bevarades, inga pågående eller okända kommandon kvar. Root kontrollerade alla30 namngivna provrader,399 aktuella källhashar före/efter, cleanupreferensen och samma bygge separat. Detta är lokal syntetisk integration, inte en riktig kommunanslutning.

## Återstående verifiering

Sex faktiska browserfall återstår till slutredovisningen. De får inte ersättas av tidigare komponentprov med simulerade nätanrop. Alla prov ska ha känd cleanup och oförändrade äldre verksamhetsdata.

SS 12000:2024/OpenAPI 2.1.0: intern klassidentitet, giltighet, medlemskap och explicita planlänkar hålls isär enligt paketets mappning. En utbildning per intern klass och okänd äldre giltighet är kvarstående modellbegränsningar. Ingen standardexport eller riktig kommunanslutning verifieras här. Fulla krav, fas 5 och mänsklig acceptans är fortsatt öppna.


Första API-försöket stoppade före inloggning och före första kontrollen: testfixturens gamla oanvända mintade session hindrade ombindningen till det nya egna OIDC-kontot genom en korrekt FK-spärr. API-rapporten är FAIL (0 av 30), `/private/tmp/class-cohort-08-api-EyUwLPx2/api.json`, SHA256 `15f3558da5a75447cda84eaa58dc4504963f2bb5ee81570dccfc858a84812790`. Separat fixturecleanup PASS bevarar äldre verksamhetsdata/ankare och tar bort den egna verksamhetsgrafen, oanvända sessioner och egna IdP-kontot. Detta är ett setupfel i provverktyget, inte ett passerat inloggningsprov.


Andra API-försöket är också FAIL före första inloggningen (0 av 30): lokal Keycloak nekade den oregistrerade callbackadressen på3067. Exakt borttagning av basens12 oanvända, orefererade scaffolding-sessioner passerade med normala FK-skydd. Hela nya provgrafen och de fyra nya IdP-kontona städades med äldre data/ankare bevarade. Rapport `/private/tmp/class-cohort-08-api-PYfuelKk/api.json`, SHA256 `49ea774f4449167b7d6fac43b2ce1ddf487fb7ece1212430347718a237b0986d`.

Root flyttade därefter enbart den egna preview-processen från3067 till den lediga, redan registrerade3013. Ingen klientkonfiguration ändrades och3012 berördes inte. `verifyClassCohortBuild` passerade på3013 med samma201 artefaktfiler, samma SHA256 och samma produktrevision; privat bevis `/private/tmp/class-cohort-08-build-proof-3013.json`. Det är en port-/miljörättning, inte ett nytt produktbygge eller ett passerat OIDC-prov.


Tredje API-försöket passerade riktig OIDC/MFA för fyra roller och ett nytt tomt programplansutkast (2 av30). Klassbatchen svarade200 med två klasser, men nästa provassertion jämförde postgres.js `Result` med en vanlig tom array. Detta prototypsfel i provverktyget gav FAIL innan hela klasskontrollen var klar; det är inte ett slutligt API-PASS. Rapport `/private/tmp/class-cohort-08-api-jwTVsbd3/api.json`, SHA256 `52ff5bf630e9112cb9ae0e13236addac76797f831484b94e05d9e93538244cb3`. Exakt cleanup PASS: fyra egna appsessioner och åtta GoTrue-sessioner bort, noll okända kommandon och äldre data/ankare bevarade. Rättningen projicerar provhjälparens datalistor till vanliga arrayer med oförändrade radvärden.


Fjärde API-försöket passerade tomhets-/kvittokontrollerna men stoppade vid kvitto→underlag-jämförelsen (2 hela kontrollpunkter PASS). Kvittot bevarar begäransordning, medan databasen sorterar underlaget efter sin collation. Fulla rader jämförs därför efter stabilt klass-ID i just denna assertion; kvitto/replay-ordning kontrolleras fortsatt exakt. Inga produktändringar. Rapport `/private/tmp/class-cohort-08-api-WICUYLct/api.json`, SHA256 `a68ef3eb0056e3a654a2c62a0a346868fe9d73a48754b23431d87a739cd09fa7`, förblir FAIL. Exakt cleanup och bevarande passerade även här.


Femte API-försöket passerade23 kontrollpunkter inklusive verkligt uppdragsbyte, behörighetsgränser, MFA, auditrollback och tappat HTTP-svar med status/replay. Det stoppade vid versioneringsprovets felaktiga förutsättning: en programplan som fortfarande är utkast får inte klonas till en ny version. Källan måste först fastställas och sakna kvarvarande utkast. Rapport `/private/tmp/class-cohort-08-api-LS59wpWq/api.json`, SHA256 `d80f793e01c042692e003ccc96f99fad5dec85ac883894800144f757af320506`, förblir FAIL. Cleanup, äldre data/ankare, källor och bygge PASS; noll okända utfall. Provhjälparens befintliga riktiga beslutskedja återanvänds för att fastställa programplanen före kloningen, utan att skapa en timplan i förväg.


Första actual-körningen stannade i IdP-fixtursetup före inloggning eller UI: en15-sekunders fetch-timeout efter att ett eget konto journalförts. 0PASS/1FAIL/5ejkörda, exit1; det är inget UI-resultat. `/private/tmp/class-cohort-08-actual-xEdBzFdG/playwright.json`, SHA256 `9bc1824f4e146fcddd4be8272c9369416d1af7b1e30a4a869f77627729f997eb`. Separat fixturecleanup PASS, SHA256 `835dc382a1775ecaba30bf73fb3caf58a031fb66584ad2c673e9c8a50a0fe477`: exakt eget konto/provgrafer bort, inga sessions-/kommando-oklarheter och originaldata bevarade. Efter tre läsande IdP-hälsosvar200 inom3–15ms startades en oförändrad omkörning med nya privata utdata; ingen timeoutgräns eller produktkod ändrades.

API/OIDC-verifierarna är versionshanterade i `46c9b3c`, pushade och fjärrverifierade. Committen ändrade inget filinnehåll under actual-körningen.


Andra oförändrade actual-försöket upprepade samma setup-timeout före appidentitet/callback/UI (0PASS/1FAIL/5ejkörda, exit1). `/private/tmp/class-cohort-08-actual-Hk4q471X/playwright.json`, SHA256 `fb6600867d5a678c4b6a760ba1828dfb89b93661dede5c4de2b60e178fffac8b`; fixturecleanup SHA256 `c84054944eb772efaa461cb6e9e2bb1aa482328421eb354ba09b4ceea6ce097e`, PASS med originaldata/ankare och inga okända utfall. Ingen ytterligare blind omkörning: en privat metadata-probe avgränsar IdP-operationen i Playwrights Node-process, utan produktändring eller UI-anspråk.


En avgränsad probe i Playwrights Node-process passerade samtliga egna IdP-kontooperationer på1,4sekunder: skapande201/18ms, lookup200/10ms, lösenord204/32ms och borttagning204/20ms. Exakt egen cleanup med efterlookup0; inga verksamhetsfixturer eller UI-prover ingick. Privat metadata SHA256 `81e019636557de8369afb557919d036af1d926e8df05d99fb8f609ffc00c59f5`, journal SHA256 `85e67f4d3cba31be110d51f8c32a18a959a5ce7c59302449745704d31964cb70`. Proben reproducerade inte felet och fastställde ingen orsak. Nästa actualomgång använder samma källor och tidsgränser med privat tidsmätning av operationskategorier; inga token, header eller kroppar loggas.


Tredje actual-körningen passerade hela IdP-setupen utan timeout men hittade ett faktiskt UI-fel: efter lyckat skapande av ny utbildning visades klasspanelen hopfälld, trots avsedd automatisk öppning. A01 stannade före klassarbetet; 0 PASS/1 FAIL/5 ej körda. Rapport `/private/tmp/class-cohort-08-actual-UNiHEUN2/playwright.json`, SHA256 `5b3e529f6d293cefd9327d83477c01bd4f6322d1d78ff13408fce748f25ded64`. Fixturecleanup PASS, SHA256 `0d3a52934a9c5afadd69070882a3b229722a28490ff4ea70834fe8a536db565b`, inga pågående eller okända kommandon. De tidigare IdP-timeouterna är inte förklarade av detta UI-fel. Produkträttning och ny verifiering krävs före lokal leverans.


## Rättning efter faktiskt UI-fynd

Commit `88145bcec46317929dcd9383d3fe8c80195e6415` överför en tillfällig engångsavsikt genom den verifierade skolbytesommonteringen. Avsikten är bunden till aktuell sessionskontext och exakt utbildning, plan och skola. Den förbrukas när rätt klasspanel monterats och rensas vid annan navigation. Gör senare återöppnas inte av en senare ommontering. Inga mandat, skrivkontrakt, URL-format eller beständiga lagringsnycklar ändras. Rättningen är pushad och fjärrverifierad.

Färsk komponentregression genom det riktiga skyddade skalet: 56 klassprov och 18 kopieprov på dator/telefon PASS, utan skips eller retries. Detta omfattar samma skola, skolbyte, Gör senare, senare panel-/arbetsyteommontering och fördröjd målläsning följd av manuell skol-/årsnavigation. Typkontroll och full app/lib-lint PASS. Oberoende kodgranskning och roots kontroll av rårapporter och fyra källhashar PASS. Privat sammanställning `/private/tmp/class-cohort-autoopen-final.NjYutn/verification.json`, SHA256 `b0abad744aeea669d078298408ea1b0208b55bc93f91278bcc61bd2520cf57d3`. Proven använder simulerade API-svar.

Nytt separat skyddat bygge av `88145bc` passerade. Samtliga 201 byggfiler har samlat SHA256 `5dcc159ddd73095f0ed34a64a0d681b1c1d3477325709643ae1c7784572ce51c`. Endast den egna provprocessen på3013 har bytts, med verifierad processidentitet, hälsa och privat målbindning. Privat bygg-/bytesbevis ligger i `/private/tmp/class-cohort-fixed-548857d1-c713-4a3e-a18d-d2d487948230/`. Den tidigare API30-körningen är ett historiskt delbevis på det äldre provbygget; färsk API30 och actual6 krävs mot den rättade kandidaten. Ordinarie3012 är fortsatt oförändrad.


Färsk full Worker/API-körning mot `88145bc`: **30 av 30 PASS, exit0**, med verklig OIDC/MFA och exakt cleanup. Rapport `/private/tmp/class-cohort-08-fixed-api-s4mkplid/api.json`, SHA256 `10405a19279922e9b6c0131daacb554a5a62ef18415bd5dca055eaa5c337151d`. Roots separata läsande `requireClassCohortApiEvidence` passerade mot aktuella källor, samma nya bygge och befintligt SQL-bevis/schema/journal. Äldre verksamhetsdata och ankare bevarade; noll okända kommandoutfall. Privata produktkontroller har sammanställts på nytt i `class-cohort-08-fixed-code-checks.json`; Node41 återanvänds med samtliga åtta källhashar återkontrollerade, typ/lint är färska efter rättningen.


Första actualomgången på det rättade bygget passerade autoöppning, tidiga klasser och återläsning, men stannade på en felaktig testlocator för klassväljaren vid timplanskoppling. Rårapport `/private/tmp/class-cohort-08-fixed-actual-0g1k72am/playwright.json`, SHA256 `7f33aba62c452453e2026a289a3a901344f83cead014ea23db2f67bea7ccd12a`: 0 hela fall PASS, 1 FAIL, 5 ej körda. Cleanup PASS, SHA256 `746a026e618b1c8b8acb4ad101b18ec49135b8ad925552c7382f5fc8f4f5e493`. En avgränsad statisk browserprobe gav exakt etikettmatchning0 men exakt comboboxroll/namn1; provet använder nu samma rollbaserade locator som de befintliga klasskopplingsproven. Inga produktändringar. Ny spec-SHA256 `f6f56b75860ff7aade22edffcce556edb05c767156b52f67196250ed59445bda`, riktad lint PASS; API-beviset körs om för att binda den nya provkällan.

Handboksgranskningen rättade även ett utkastpåstående om förvalt första läsår: verifierad plan01 behåller ett giltigt planeringsår som förslag och kräver uttryckligt giltigt årsval om det ligger utanför utbildningens tre läsår. Det är den implementerade skillnaden mellan planeringsår och tillämpningsläsår; ingen ändring av produktens årsval gjordes.


Efter locatorrättningen passerade färsk API30 återigen, rapport SHA256 `99c360ae8ec4202b84477228ed4bcd0adc69ee7792530bcb0f0161a74b974634`. Actualomgången `/private/tmp/class-cohort-08-fixed-actual-v44r241n/playwright.json`, SHA256 `a11a1e280d1ca1f96469387a991a457a31c6f442d1e263dc368e4a23cee46f4d`, gav A01/A02 på dator PASS men A03 FAIL, med tre telefonfall ej körda. Alla tre fixturcleanups PASS med äldre verksamhetsdata/ankare och noll okända kommandon. Fem datorbilder granskades utan blockerande överlappning i klasskontrollerna; dessa är delbevis och ersätter inte slutlig sexfallsomgång.

A03:s HTTP-väntare startades före interaktiv MFA med25sekunders timeout, medan hjälparen kan behöva invänta nästa30sekundersperiod för en oanvänd TOTP. Ingen ny step-up-callback hade slutförts när väntaren föll. Exakt tidsorsak mättes inte separat. Testet fångar nu svar från före inloggningsklicket, men börjar den begränsade HTTP-väntan efter avslutad faktisk MFA. Därmed tappas inga tidiga retursvar och produkttiderna ändras inte. Inga produktändringar. Spec-SHA256 `5240734713a19254582c5e3704de87b000e1e9a601dc964c263116cb093ec186`; riktad lint och färsk typkontroll PASS. Färskt API-/actualbevis krävs fortsatt före leverans.


Nästa API-omgång passerade30/30 på samma88145bc, `/private/tmp/class-cohort-08-fixed-api-emvmgzlg/api.json`, SHA256 `250c084e3b3858380851c2463d0abbddf7b9bf5c46dede6fd65555e34d0454ad`; roots separata käll-/mål-/cleanupkontroll PASS. Actual `/private/tmp/class-cohort-08-fixed-actual-68se7yxz/playwright.json`, SHA256 `ac4213fcb62f0f303d484ede9318180eeab540d2e03585c4e1114ba498afa3cc`, passerade samtliga tre datorfall. Telefonens A01 nådde alla verksamhetsassertioner och tre bilder men efterkontrollen stoppade före första cleanupmutation: fyra callbackbegäranden saknade avslut i browserobservatören. Råresultat3PASS/1FAIL/2ejkörda. De egna två kundgraferna, sessionerna och fyra IdP-kontona behålls under körlåset tills separat exakt återhämtning verifierats. Inga nya prov eller lokal leverans får föregå den återhämtningen.

Sju datorbilder har granskats; tre telefonbilder finns men är ännu inte granskade. Den misslyckade telefonfixturen sparade inte hela sin ursprungliga ankarbaslinje. Föregående datorfixturs avslutande62-tabellssnapshot finns från omedelbart före telefonprovet; den omfattar verksamhet/sessioner, men inte samtliga identitets-/auditankare. Separat återhämtning måste därför redovisa sin egen före/efter-kontroll och denna historiska bevisgräns. Originalets FAIL och `realOidcCallback=false` ska bevaras.


### Exakt återhämtning efter telefonens observerfel

Läsande inventering band båda kundgraferna till den misslyckade fixturens scope, åtta kända begäran-/aktör-/uppdrags-/svarsmatchade kvitton, två verkliga appsessioner och fyra lyckade serverlogin-auditer. Alla62 historiska verksamhets-/sessionstabeller matchade föregående desktopbaslinje när exakt egna rader undantogs. Första rollbackprovet stoppade före borttagning på fyra inkommande `auth.mfa_amr_claims`-referenser. Dessa tillhör exakt de fyra egna GoTrue-sessionerna. Databaskatalogen visade endast dessa och refresh-tokenreferenser till auth.sessions.

Efter komplettering passerade full rollback och samma exakt bundna apply. `/private/tmp/class-cohort-phone-recovery-apply-1.json`, SHA256 `61d0905bc10364e401033110f4c775e9d093bd63ca4b8670602b6f2df08f1560`: PASS, känd commit, fyra egna IdP-användare bort och körlåset borttaget. De två egna kundgraferna inklusive två klasser/en länk/en timplan och åtta kvitton,14 appsessioner (två OIDC+tolv kontrollerade foreign-fixtursessioner),fyra authsessioner/fyra refresh tokens/fyra MFA-claims städades i en atomär transaktion. Samtliga62 ursprungliga tabellhashar återställda; alla fem ankar-/audittabeller exakt bevarade mot återhämtningens baslinje.244 övriga MFA-claims bevarades mot en ny separat baseline; någon historisk före-telefon-jämförelse för dessa claims påstås inte. Tidigare orphanclaims ändrades inte. Originalets telefon-FAIL kvarstår.

Vid återupptagningen svarade3012 inte längre. De ursprungliga byggfilerna jämfördes bytevis mot tidigare leveransbevis, inga gamla previewprocesser/listeners fanns, och kvarvarande privata runtimefiler flyttades till privat backup. Samma f4987b6 startades åter utan ombyggnad; process/hälsa/artefakt PASS i `/private/tmp/class-cohort-original-preview-restore/restore.json`. Kandidaten88145bc på3013 är oförändrad.


Minimal verklig WebKit-diagnos `/private/tmp/class-cohort-webkit-real-6kifzjch/report.json`, SHA256 `40ad4b8f4bba9481ca2c6c554941cffbaf0bf28b35ba215e517db2461a1bf93a`, reproducerade saknad callbackresponse i båda inloggningarna. Varje callbackrequest observerades av både page/context som samma Request, men ingen response/requestfinished/redirectedTo följde och `request.response()` gav timeout. Faktisk browserretur, sessioncookie, två auditerade serverlogin samt enroll följt av verklig OTP fungerade. Diagnosen förblir FAIL för HTTP-observermålet; separat normal-FK-cleanup PASS med63 oförändrade verksamhets-/sessionstabeller och alla äldre/nya ankarvärden bevarade genom städningen. Inga medlemskap, uppdrag eller affärsunderlag skapades.

Åtta fristående syntetiska redirectprober hade observerade302; de bevisar därför ingen generell WebKit-begränsning eller orsak till felet i den verkliga kedjan. Kompletterad per-inloggningsverifiering planeras mot exakt ny serveraudit och cookie-/identitetsbunden session, med uttryckligt separat proofKind och null HTTPstatus när browsern inte lämnar ett Response. Ingen misslyckad rapport ska märkas om och ingen HTTPstatus ska fabriceras.


### Förnyad full API-matris efter callbackrättningen

Den nya per-omgångskontrollen och explicita `prepareStepUp` före båda API/UI-triggerna är kodgranskade av root och separat granskare.40 rena validatorfall PASS mot den faktiska repomodulen, inklusive saknade/dubbla/felaktiga/återanvända bevis, fel HTTPstatus och fel MFA/session/epok. Färsk typkontroll och riktad provverktygs-/spec-lint PASS. Privat rootkontroll `/private/tmp/class-cohort-callback-root-checks.json`.

Färsk full API30 **PASS, exit0** på samma88145bc/201filer: `/private/tmp/class-cohort-08-fixed-api-pp1zm5ii/api.json`, SHA256 `955db4a6343bd4b68fafe918cc5d76e27044bed3f7191f05e6d7231719e0d63b`. Roots separata validator-/fixturgranskning PASS,400 oförändrade källhashar, nio unikt auditbundna callbacks och63 oförändrade verksamhets-/sessionstabeller inklusive MFA-claims. Alla äldre ankare bevarade, inga okända kommandon eller pågående requests. Den faktiska browsermatrisen måste fortfarande passera separat före08 avslutas.

## Slutlig faktisk browsergrind — 2026-10-15

Körning `/private/tmp/class-cohort-08-fixed-actual-40ktgzc1`: A01/A02/A03 × Chromium-dator/WebKit-telefon **6/6 PASS**, exit0, inga errors, skips, retries eller flaky resultat. Rårapport `playwright.json` SHA256 `9d2c0f9a92106729e9c4251f5170d9fcf6940425f5b8a6339be9f5428efb97bc`. Verklig lokal OIDC, Worker och databas; ingen ersatt HTTP-transport.

Alla sex fixturer har PASS, samma400 källhashar före/efter, samma201 byggfiler, bevarade63 verksamhets-/sessionstabeller och ursprungliga ankare, samt noll okända/pågående kommandon. Endast egna journalbundna provobjekt och sessioner städades; audit och identitetsankare bevarades. Root kontrollerade råresultat, referenshashar, aktuella källor och cleanup separat.

Sju datorbilder granskades av separat agent och sju telefonbilder av root. Klassgranskning, återlästa klasser, vårstart, HM-läsläge, tom kopierad kull, explicit läsår/version och MFA-returens uttryckliga omförsök är läsbara. Telefonens fokushopplänk överlagrar viss rubrik/metadata i fullsidesbilderna; ingen felfri UI eller fysisk telefonacceptans påstås. Privata bildrapporter binder varje PNG med hash och observation.

Samlad grind `acceptance.json` i samma katalog, SHA256 `e4b9780373485ac5d100039196a80895e9319bb20d75c36f1db20e4b97474c33`, binder SQL, aktuell API30, Node41+callback40, typ/lint/bygge, browser6 och14 granskade bilder. Produktrevision88145bc är oförändrad. Plan09 och människans nya klassprov återstår; redan godkänd kullkopiering ska inte efterfrågas igen.
