---
status: awaiting_evidence
trigger: "Root: upprepade 3056-previewavbrott under byggda UI-prov"
created: 2026-10-02
updated: 2026-10-02
scope: debugger source review, explicit built-module loader and integrity tests; root owns runtime, DB, commits and final verification
---

## Current Focus

hypothesis: Två separata problem är avgränsade: dummy-kroppen gav lokala logout-streamfel; Wrangler dev-proxyn kan även efter detta göra andra normala transportavbrott terminala. Protected-förhandsvisningen kör nu samma färdigbyggda paket direkt i Miniflares workerd, utan den extra Wrangler ProxyController-vägen.
test: Slutligt direktbygge023e68b har API43/43, program38/38 och timplan20/20 med58 nollställda egna cleanups, tio granskade bilder och fyra integritetsprov PASS. Vanlig3012 har frisk workerd/DB,40 auditerade läsningar av bevarat provunderlag och fyra verkliga lokala OIDC/MFA-inloggningar PASS.
expecting: Det lokala paketets kompatibilitet, privata vars, assets och servergränser ska vara oförändrade i verifierbara API-/UI-beteenden. Egentliga Workerfel fortsätter ge fel; inga exceptionhandlare undertrycks eller provretry döljer serveravbrott.
next_action: Lokal mitigation är verifierad och överlämnad. Upstreamterminalitetens bredare åtgärd är fortfarande öppen; följ inte upp utan nytt underlag. Historiska FAIL och gamla Wranglerprov bevaras.

## Symptoms

expected: Samma byggda protected-preview på 3056 betjänar desktop- och telefonprojekt tills ägaren stoppar den.
actual: Upprepade serveravbrott. Ett första programplansprov på 40efd8d avbröts enligt UI-agenten efter programplansdesktop12/13. På c320041 passerade programplan30/30 och timplan desktop10/10; servern avslutades därefter vid telefonprojektets första sidladdning.
errors: ECONNREFUSED i browser när porten stängts; föregående serverlogg har tom Wrangler ERROR och generisk buggrapporteringshänvisning. Båda run-mode-toolsessionerna gav exit1 utan fångad separat barnsignal.
reproduction: UI-agentens byggda lokala flöde. Har enligt root inträffat både med pipe och PTY; exakta processignaler/orsaksstack saknas för dessa äldre körningar.
started: Två rapporterade avbrott under aktuella UI-prov; tidigare API-prov och delar av browserflödena passerade.

## Eliminated

- hypothesis: run-mode sätter uttryckligen terminalens logger till None.
  evidence: quiet anger endast WRANGLER_WRITE_LOGS=false och WRANGLER_SEND_METRICS=false. Installerad Wranglers shouldLogToDisk() använder det första bara för diskloggning; getLoggerLevel() härleder terminalnivå från WRANGLER_LOG och default log. Ingen uttrycklig None finns i run-mode. Tom ERROR är därför inte i sig bevis för None.
- hypothesis: Playwrights webServer-livscykel stoppar servern när projekt byts.
  evidence: Båda fas5-konfigurationerna använder extern baseURL, workers1/retries0 och saknar webServer. Lästa timplansbeforeAll/beforeEach/afterEach och browserfixtures saknar spawn/kill eller ändring av varsfiler.

## Evidence

- checked: web/scripts/run-mode.mjs run()/preview().
  found: Node startar Wrangler-bin som barn med stdio inherit; SIGINT/SIGTERM vidarebefordras. Barnsignal reduceras till exitCode1 utan utskrift av signalnamnet. Exklusivt .dev.vars-lås hålls till processens slut, då fil/lås städas.
  implication: Enbart run-mode exit1 skiljer inte signal från vanligt CLI-fel. Varsfilens borttagning efter slut är cleanup och inte bevisad utlösare.
- checked: web/node_modules/wrangler/bin/wrangler.js.
  found: Ytterligare Node-barn startar wrangler-dist/cli.js med stdin/stdout/stderr inherit och IPC. exit-handlern tar bara code, inte signal, och konverterar null/undefined till exit0. Bin-wrapperns stoppsignaler skickar child.kill().
  implication: Ursprunglig cli-signal kan förloras i ytterligare ett processled. Ingen observerad OOM/SIGKILL kan härledas ur gamla wrapperexitvärden.
- checked: Filtrerad privat /private/tmp/programplan-browser-runtime.log (40efd8d).
  found: Sista relevanta HTTP-raderna är GET /api/health/db200 och GET /200. Därefter tom ERROR, generisk bugghänvisning, toolsessionexit1 enligt runtimeägaren. Ingen exceptiontyp, stack, signal eller errno framgår av den filtrerade diagnostiken.
  implication: Portavbrott observerat, orsak obestämd. Ingen rå privat konfiguration/nyckel har dumpats.
- checked: Filtrerad privat /private/tmp/programplan-final-runtime.log (c320041).
  found: Programplan30/30 och timplan desktop10/10 enligt runtimeägaren. Sista raderna före tom ERROR är GET /api/health/db200, GET /200 och GET av statisk Geist-font200. Telefonens första sidladdning får därefter ECONNREFUSED.
  implication: Fontförfrågan är tidsmässigt nära avbrottet, inte bevis för att font/WebKit orsakade det. Även första avbrottet inträffade före motsvarande full telefonövergång.
- checked: Installerad wrangler-dist/cli.js main()/handleError()/DevEnv.
  found: CLI fångar fel och logger.error skriver message för Error medan stack endast går till debug. DevEnv har interna error/cause/reason-events. Tom lograd kan därför sakna terminalorsak som privat debugloggning skulle ge.
  implication: uncaughtExceptionMonitor behöver inte anropas när CLI fångar felet. Noll monitorcallbacks är inte bevis om inga fångade CLI-/controllerfel.
- checked: UI-agentens första diagnostiska omstart och /private/tmp/phase5-runtime-diagnostic.mjs.
  found: Timplan20/20, cleanup20, 293 bevarade audithändelser/26ankare rapporterades PASS på samma c320041. Preloader hade uncaughtExceptionMonitor och unhandledRejection-listener; inga runtimeDiagnostic-callbacks kördes. Avsiktligt CtrlC-stopp gav exit130 och porten stängdes.
  implication: Grön omstart är faktisk körningsobservation men ingen verifierad rotorsaksfix. unhandledRejection-listener kan principiellt ändra Nodes standardavslut; runtimeägaren tog därför bort den inför nästa fulla evidenskörning.
- checked: UI-agentens neutrala nästa omgång.
  found: Samma c320041, ingen ombyggnad. Privat0600 /private/tmp/programplan-final-runtime-neutral-debug.log; WRANGLER_LOG=debug och endast uncaughtExceptionMonitor plus exitkodlogg. Full20-fallstimplanssvit pågår vid denna dokumentation. Filtrerade läsningen visar hittills ingen terminalorsak/monitorcallback.
  implication: Utfall förs separat i senaste browserrapport. Debugfilen påstår varken slutlig PASS för pågående omgång eller att de äldre avbrotten är åtgärdade.
- checked: Runtime-/DB-ägande.
  found: UI-agenten äger3056 och fixturer; denna debugger har varken startat/stoppat runtime, läst/skrivit DB eller ändrat produktkod. Root samordnar vanlig 3012 och beständigt mänskligt prov.
  implication: Inga parallella process-/databasmutationer från denna undersökning. Ingen ny fasverifiering eller kommunanslutning påstås.

- checked: UI-agentens avslutade neutrala fullsvit och privata exitmonitoruppgifter.
  found: Neutral timplan20/20PASS, cleanup20 med alla egna rester0, 300 bevarade audithändelser/26ankare. Preview67898 stoppades därefter avsiktligt med CtrlCexit130;3056stängd. Privat neutraldebuglogg har enbart fyra exitmonitorposter130 för de stoppade Node-processleden och inga uncaughtMonitor-/unhandled-handler-events. Äldre instrumenterad20PASS hålls separat och används inte som slutgrind.
  implication: Färskt fullständigt timplansbrowserbevis på oförändrat bygge med neutral monitor, ingen behovsstyrd produktfix. DB/runtime är släppt till root. De två äldre avbrottens terminalorsak kvarstår obestämd.

## Resolution

root_cause: Senaste terminalmekanism är belagd: installerad Wrangler ProxyWorker skickar ett avvisat same-origin fetch (`Network connection lost`) som terminalt DevEnv-fel; castErrorCause tappar yttermessage. Vår lokala logoutvägs onödiga olästa JSON-kropp är belagd request-stream-utlösare genom separata sexfallsprov: await-only12fel, kroppslöst0fel. De sex kontrollproven reproducerade inte fataliteten; ingen universell koppling mellan varje streamfel och terminalexit påstås. Äldre avbrottsstackar saknas och får inte automatiskt likställas.
fix: Root14810ba tar bort onödig body på POST-utloggning och78b17fb stärker provets väntan på faktiskt svar/navigation. Efter nytt separat proxyavbrott infördesff728d3 direkt protected-preview; färdiga loaderbygget8d98e17 läser samma Wranglerconfig/privata vars, konverterar V4-options korrekt till installerad Miniflare5 och tillhandahåller alla116 byggda ES-moduler med index.js först. Extra Wrangler ProxyWorker/ProxyController startas inte. Serverrevokering/audit/Origin/MFA och faktiska Workerfel behålls. Inga felhandlare undertrycks, inga dependencies uppgraderas. Bredare Wranglerfråga är öppen.
verification: phase5-16-logout-transport.json är PASS med source/build14810ba, lokala syntetiska sexfallsomgångar utan retry eller runtimeomstart. Kroppslöst har6 logout200,6 nollställda fixture-cleanups, originaltoken401, avslutad IdP-navigation och0 stream-/network-/ProxyController-fel. Slutliga direktprov på023e68b: API43, program38, timplan20, tio granskade bilder och vanlig3012/inloggning PASS. Den generella upstreamdiagnosen markeras inte resolved.
files_changed: [.planning/debug/phase5-preview-exit.md, web/scripts/preview-worker-modules.mjs, web/scripts/preview-worker-modules.test.mjs]

## Ny observation vid pedagogikprov, 2026-10-02

Root observerade samma typ av avbrott på e077e81: vanlig 3056 utan preload avslutades med exit1 efter GET/200, tom Wrangler ERROR och generell bugghänvisning. Programmatrisen stannade på9 PASS/3 FAIL/18 SKIP;10 cleanupbilagor är noll och254 audit/12 ankare bevarade. Full rårapport och FAIL-sammanfattning är arkiverade i phase5-13-pedagogy/interrupted-programplan och phase5-13-pedagogy-programplan-interrupted.json. Ursprunglig CLI-/workerd-signal eller fångad exceptionstack saknas även för detta avbrott.

Root startade därefter samma oförändrade bygge med WRANGLER_LOG=debug till privat fil, utan preload eller ändrad exceptionhantering. Ny fullprogram 30+tim 20 PASS, cleanup 50. Avsiktligt CtrlC gav130. Vanlig 3012 startades utan debug/preload och klarade startsida/hälsa/IdP samt bevarande current-läsning av fyra exempel för två mandat,16 auditpar. Den nya körningen reproducerade inte terminalfelet och belägger ingen rotorsaksfix. Status förblir awaiting_evidence; tre observerade avbrott hålls skilda från gröna slutprov.

## Ny terminalstack vid delat utbildningsflöde, 2026-10-02

- checked: Privat filtrerad debuglogg från build/source 19df712, utan preload eller förändrade exceptionhandlare.
  found: Desktopens utloggning200 följs av två `Can't read from request stream after response has been sent`-fel (loggrad781–783). Telefonens utloggning200 har samma två fel (1647–1649), därefter `Network connection lost`, `Error inside ProxyWorker` och Wranglerexit1. Inga konfigurationer, bindings eller tokens lagras här.
  implication: Senaste avbrottets terminalorsak är nu fångad. Samma streamvarning på desktop var inte i sig terminal; utlösaren kräver avgränsat experiment.
- checked: Installerad wrangler-dist/cli.js ProxyWorker, ProxyController.onProxyWorkerMessage, castErrorCause och DevEnv.handleErrorEvent.
  found: Avvisad fetch mot oförändrad userWorker-origin skickar typ error till ProxyController. Den rekonstruerade Error saknar message men har ursprungligt plain-object cause. `Error inside ProxyWorker` faller utanför två icke-terminala undantag och blir DevEnv error; CLI avslutar. Fångad cause är `Network connection lost`.
  implication: Tom tidigare ERROR förklaras av installerad kod. Denna terminala mekanism behöver ingen applikationsbehörighets-, SQL- eller MFA-failure för att inträffa.
- checked: Browsercase12 och ProtectedShell.logout().
  found: Klienten rensar arbetsytan synkront innan POST /api/auth/logout. Provet väntar enbart på tom arbetsyta och lämnar testet utan att verifiera avslutad utloggning eller navigation. Logout skickar `{}` trots att route inte läser kropp. Teardown kan därför sammanfalla med kvarvarande request-/navigationströmmar.
  implication: Konkreta falsifierbara hypoteser, inte ännu bevisad orsak: (1) för tidig testteardown, (2) oläst onödig requestkropp, (3) oberoende proxyavbrott under subresource-navigation. Root bör ändra en variabel per experiment och behålla avsiktligt fördröjd läsning/epoch-prov.
- checked: Primärkällorna [upstream15317](https://github.com/cloudflare/workers-sdk/issues/15317) och [upstream15203](https://github.com/cloudflare/workers-sdk/issues/15203).
  found: Båda öppna rapporterna beskriver samma terminala ProxyWorker-signatur.15317 visar tom-Error-kodvägen;15203 har reducerat assets+POST-body-fall och separata kroppslösa kontrollprov. Ingen verifierad släppt fix identifierades.
  implication: Upstream stöder diagnosen men bevisar inte denna apps exakta requestutlösare. Uppgradering eller felundertryckning ska inte göras på antagande.

- checked: Primärkällorna [upstream15451](https://github.com/cloudflare/workers-sdk/issues/15451) och [upstream15819](https://github.com/cloudflare/workers-sdk/issues/15819), inklusive senare kommentarer.
  found:15451 beskriver normal redirect/requestabort som terminal proxyutlösare; senare kommentar säger att networkidle inte hjälpte eftersom felet inträffade på själva redirecthoppet.15819 har kontrollerade kroppsläsnings-/servicebinding-/rawTCP-jämförelser: oläst kropp genom servicebinding leder till snabb reset även inom64KiB-grace; läst kropp är kontroll som håller förbindelsen. Nyare workerd20260923 och Wrangler4.136.3 rapporteras fortfarande berörda.
  implication: Varken godtycklig uppgradering eller networkidle är verifierad fix. Det stärker hypotesen om oläst dummy-kropp i lokal logoutväg, men vår app kräver fortfarande eget experiment. Källornas tester är olika plattformar och ska inte presenteras som vårt verifieringsbevis.
- checked: Förberett avgränsat reproduktionsverktyg i /private/tmp/phase5-preview-stream-repro.
  found: Root-ägd pure synthetic Worker på3058, ingen databas/behörighet/konfiguration från appen. Hammer jämför POST med{} eller utan kropp, statiskasset405 som upstreampositivkontroll respektive no-input/api/logout.300förfrågningar,3samtidiga, alla svar läses och aktuell health sammanfattas. Syntaxkontroller passerar; inget runtimeexperiment utfört av denna debugger.
  implication: Verktyget kan ge separat proxybevis vid behov, men negativt enkelt API-prov falsifierar inte appspecifik navigation/clone/teardown-hypotes.

- checked: Rootens kontrollerade await-only-omgång på build/source78b17fb.
  found: Telefoncase12 kördes6/6 PASS utan retry eller runtimeomstart. Varje prov väntade verkligt logout200, färdig kropp och färdig navigation. Preview var fortsatt frisk, men privatlogg innehöll fortfarande12 identiska request-stream-varningar, alltså2 per utloggning. Ingen `Network connection lost` fångades i den omgången.
  implication: Korrekt testväntan belägger slutförd utloggning och avgränsad stabilitet; den löser inte det olästa request-stream-problemet. Ingen universell fix eller förebyggd fatalitet är bevisad av6 gröna prov.
- checked: Rootens separata mitigationscommit14810ba (historisk observation före A/B-verifiering).
  found: Klientens no-input-utloggning skickar undefined i stället för{}, vilket server-client redan behandlar som ingen requestkropp/Content-Type. Samma POST-metod, Origin/cookie, revokering och audit behålls. Provet ska kräva postDataNULL och att originalets sessionsbevis får401 på skyddad läsning efter färdig logout.
  implication: Avgränsad transportändring som tar bort onödig kropp, utan serverfelundertryckning, MFA-/CSRF-bypass eller dependencyuppgradering. Root bygger och jämför samma6 prov; utfall återstår.

- checked: [Avslutat faktiskt A/B-bevis](../../work/pilot/results/phase5-16-logout-transport.json), source/build14810ba, läst av debugger efter rootens avslutade omgång.
  found: Await-only-kontrollen78b17fb har6 PASS,6logout200 men12 streamfel. Separat kroppslös14810ba har6 PASS,6 cleanups med egna rester0,6logout200, originaltoken401 och avslutad IdP-navigation;0 request-stream-fel,0 Network connection lost och0 ProxyController-fel. Varken retry eller runtimeomstart inom respektive sexfallsomgång.
  implication: Att vänta på verklig logout räckte inte för streamfelet; att ta bort no-input-endpointens dummy-kropp tog bort den lokala utlösaren i samma avgränsade prov. Detta är verifierad lokal transportmitigation, inte verifierad fix av all Wranglerhantering av klientaborter. Runtime hålls av root för full38+20-svit; pureHTTP-proben behövde inte köras.

## Direkt byggd förhandsvisning efter nytt proxyavbrott

- checked: Rootens fulla programplansförsök på14810ba efter avslutad kroppslös sexfallsjämförelse.
  found: Runtime avslutades åter med Network connection lost/terminal ProxyController. Rapporten listade38fall,17PASS,4FAIL och17ej körda; senaste logout-streamfel var0.
  implication: Lokal kroppslös mitigation är fortfarande belagd för streamvarningarna men löser inte Wranglers bredare fatalitet. Ingen tidigare grön sexfallsomgång får beskrivas som generell proxyfix. Root bevarar denna FAIL som separat historik.
- checked: ff728d3 direct-preview-ansats och installerade Wrangler/Miniflare API-typer/kod.
  found: unstable_getMiniflareWorkerOptions returnerar V4-options, medan installerad Miniflare5 behöver convertV4MiniflareOptions. Konverteraren avvisar modulesRules och scriptPath ensam ger bara main-modulen, utan byggets116 relativa chunks. Två tidiga schemastarter misslyckades innan produktanrop; detta avgränsades till runtimeadapterformat.
  implication: Loader måste explicit representera hela färdigbyggda paketet; det räcker inte att radera en unsupported nyckel. Inga produktbehörighets-/databasfel härleds ur schemafelen.
- checked: Aktuell preview-worker och ny preview-worker-modules, uttryckligen tilldelad av root.
  found: Loader räknar alla116 .js/.mjs-filer under byggd serverrot, huvudsaklig index.js först. Alla privata dotfiler/dotkataloger, JSON-konfiguration och CSS-metadata utelämnas. Utanför-entrypoint, saknad/privat/unsupported entrypoint och symlänkar avvisas. Enbart färdigbundlade ES-moduler stöds för aktuellt bygge; workerd avvisar importer vars moduler inte tillhandahålls. Samma konverterade kompatibilitetsdatum/nodeflag, privata vars, assets och externa Worker-options förs vidare.
  implication: Direkt lokal workerd kör verklig byggd kod utan extra terminal dev-proxy. Detta är byte av previewtransport, inte omskrivning av produkter/API eller global felundertryckning. Ej stödda framtida modulformat kräver explicit loaderanpassning.
- checked: Fyra modulintegritetsprov, node --test web/scripts/preview-worker-modules.test.mjs.
  found:4/4PASS: exakt main först och alla chunks i Miniflaremanifestet; privata vars/config ej laddade; utanför/saknad/privat/unsupported entrypoint och symlink avvisade; V4-konvertering bevarar kompatibilitetsdatum, nodeflag, syntetiska vars, assetsbinding och extern Workerreferens. Testkontrollen kör inte runtime eller databas. Två första testassertionsfel gällde /tmp:s macOS-realpath och V5-assetsbindingens plats i env; fixture/assertions korrigerades utan att guards försvagades.
  implication: Proverna verifierar den nya adaptergränsens integritet. Faktisk funktion/behörighet i nya runtime kräver separat API och browser, som root äger.
- checked: Rootens faktiska direktstart på build8d98e17.
  found:3056 är uppe; DB-health200 ger runtimeworkerd och roll skolplattform_worker. Assets konverteras med samma byggkonfiguration. Fullbrowser körs nu på samma runtime; initialdesktop8PASS rapporterad men slutbevis ännu inte färdigt.
  implication: Körbarhet och faktisk Worker/DB-anknytning är verifierad startobservation. Inget fullfas-, mänskligt UI- eller generell upstreamgodkännande påstås medan resterande prover pågår.


## Slutlig lokal verifiering — 2026-10-02

Rootens slutliga bygge `023e68b126ffccfdab952abe1d2274a70e8e266d` kör samma byggda produkt genom direkt workerd. Full programplansmatris38/38 och timplansmatris20/20 PASS utan retries, överhopp eller serveromstart under sviterna. Cleanup58/58 har alla egna verksamhetsrester noll; audithändelser/ankare bevarade. Utbildnings-API43/43 har oförändrade tidigare verksamhetshashar, exakt trettonfas5grants och två städade egna provgrafer. Fyra loaderintegritetsprov PASS.

Tio slutliga dator-/telefonbilder har faktiskt granskats efter mobilknapparnas separata CSS-rättning. Diagnostisk3056 stoppades avsiktligt med CtrlC130, och vanlig3012 startades utan debug/preload. Hälsa200 visar workerd och skolplattform_worker. Nio befintliga syntetiska utbildningar för två roller lästes genom40 obligatoriska auditpar utan verksamhetsändring; IdP/OTP-CORS och fyra verkliga lokala roll-/provkodsinloggningar PASS. Provrapporter finns i `work/pilot/results/phase5-16-sharedflow-*.json`.

Detta verifierar den lokala direkta förhandsvisningen och avgränsad logouttransport. Det innebär ingen allmän rättning av Wranglers dev-proxy, ingen faktisk kommunanslutning och inget mänskligt godkännande av begripligheten. Tidigare avbrutna omgångar är kvar som FAIL-historik.
