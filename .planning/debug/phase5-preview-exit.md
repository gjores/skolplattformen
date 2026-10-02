---
status: awaiting_evidence
trigger: "Root: upprepade 3056-previewavbrott under byggda UI-prov"
created: 2026-10-02
updated: 2026-10-02
scope: read-only cause analysis with root-owned isolated preview tests; no root-cause fix
---

## Current Focus

hypothesis: Ursprungligt terminalt Wrangler/workerd-fel eller ursprunglig processignal är ännu inte fångad. Ingen faktisk rotorsak är belagd.
test: Senaste e077e81-omgången är full program 30/30 +tim 20/20 PASS med privat debugnivå och ingen preload/felhanteringsändring; vanlig 3012 utan debug/preload och current-läsning är separat PASS. Tre observerade avbrott har ännu ingen belagd terminalorsak.
expecting: Färska gröna sviter och frisk3012 kan verifiera aktuellt användarprov; de bevisar inte att de tidigare avbrottens orsak är åtgärdad.
next_action: Vid nytt avbrott, samla ursprunglig exit code/signal per process och filtrerad exception/cause/stack från privat diagnostik. Till dess bevara denna separat öppna fråga; märk inte fixed/resolved.

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

root_cause: Obestämd. Den exakta ursprungliga exception/cause/stack eller exit-signal som avslutade Wrangler/workerd vid de två äldre avbrotten saknas.
fix: Ingen produktfix tillämpad. Rekommenderad diagnostik är ursprunglig signal/exit i varje processled samt privata debugstackar; skriv aldrig konfiguration, tokens eller nycklar till GSD.
verification: Rootens aktuella readiness bör omfatta vanlig 3012 utan preload: health/db runtime workerd/roll skolplattform_worker, GET/200, egna skol-/sessionsbundna HM-/rektorsprogramplanslista+underlag med väntade ID/version/katalog och obligatorisk audit, följt av ny health. Senaste fulla sviter redovisas separat; de gör inte denna diagnos resolved.
files_changed: [.planning/debug/phase5-preview-exit.md]

## Ny observation vid pedagogikprov, 2026-10-02

Root observerade samma typ av avbrott på e077e81: vanlig 3056 utan preload avslutades med exit1 efter GET/200, tom Wrangler ERROR och generell bugghänvisning. Programmatrisen stannade på9 PASS/3 FAIL/18 SKIP;10 cleanupbilagor är noll och254 audit/12 ankare bevarade. Full rårapport och FAIL-sammanfattning är arkiverade i phase5-13-pedagogy/interrupted-programplan och phase5-13-pedagogy-programplan-interrupted.json. Ursprunglig CLI-/workerd-signal eller fångad exceptionstack saknas även för detta avbrott.

Root startade därefter samma oförändrade bygge med WRANGLER_LOG=debug till privat fil, utan preload eller ändrad exceptionhantering. Ny fullprogram 30+tim 20 PASS, cleanup 50. Avsiktligt CtrlC gav130. Vanlig 3012 startades utan debug/preload och klarade startsida/hälsa/IdP samt bevarande current-läsning av fyra exempel för två mandat,16 auditpar. Den nya körningen reproducerade inte terminalfelet och belägger ingen rotorsaksfix. Status förblir awaiting_evidence; tre observerade avbrott hålls skilda från gröna slutprov.
