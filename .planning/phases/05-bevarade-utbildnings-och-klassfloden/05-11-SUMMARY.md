---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "11"
status: implementation_verified
completed: 2026-10-02
requirements: [ADMIN-02]
human_verification: pending
subsystem: protected-programplan-ui
requires: [05-09, 05-10]
provides:
  - Skyddat gymnasieurval och versionsläsning för verkliga huvudman-/rektorsuppdrag
  - Explicit underlag/start, utkast, legacybindning, ordnad fördjupning och låst källkloning
  - Bevarade formulär, faktisk konflikt-/osäkert-svar-omläsning och sessionsrensning
  - Handbok samt färska dator-/telefonbrowserbevis
key-files:
  - web/app/protected-programplan-workspace.tsx
  - web/app/protected-programplan.css
  - web/lib/protected-programplan.ts
  - web/app/protected-home.tsx
  - web/lib/server-client.ts
  - web/app/protected-timplan-workspace.tsx
  - web/e2e/phase5-programplan.spec.ts
  - web/e2e/phase5-timplan.spec.ts
  - work/pilot/phase5-programplan-browser-fixtures.mjs
  - work/pilot/phase5-browser-fixtures.mjs
  - docs/handbok/programplaner.md
worker_build_revision: c3200412f24a5ca797b47bcc2bfcf714d56e5697
commits: [278615c, 579ac03, 7f49314, adb46aa, ba3dc3a, d4fb92f, b4439fc, 73404e0, 1894a51, 53cbc57, 6e69cf9, 74bfb07, 7ce3e37, 40efd8d, c320041]
---

# 05-11 — skyddad programplansvy

Huvudman och rektor kan välja egna befintliga gymnasieutbildningar, läsa planversioner, skapa eller binda utkast, ändra ordnad programfördjupning och kopiera en låst källa till nytt utkast. Listan omfattar också utbildningar utan plan. Katalog och verkligt utbildningsstartdatum väljs uttryckligen; kulltext/startår väljer ingen grund. Bundna versioner behåller sin lagrade katalog/program-/ämnesversion och start. Utbildningsskapande och fastställande är fortsatt stängda. Fullständiga nationella ramar, alternativ och nivåföljd är inte regelgodkända. ADMIN-02 och samlat mänskligt prov 05-11/05-12 är fortsatt Pending.

## Beteende och skyddsgränser

Fem exakta 05-09-kommandon och 05-10:s två urvalsrutter används genom befintlig servertransport. Verkliga server-ID, revision/version, MFA och uppdrag gäller. Det finns inget klientrollval som ger behörighet, ingen direkt databasväg eller ny grant. Ordningen sparas; äldre okända/duplicerade val visas ordagrant och får ingen fabricerad referens. Exakt återfunna bundna val visar ämnes-/nivånamn med kod, version och poäng. Poäng omvandlas inte till undervisningstid.

Konflikt läser verkligt aktuellt underlag och behåller egna fält. Bara kompatibelt ändrings-/bindningsförslag kan uttryckligen skickas igen med ny revision; nya create/clone eller ändrad källa tillåter ingen blind retry. Accepterade, tappade och oklara svar kräver omläsning. Även lyckat writesvar följt av läsfel behåller formuläret och blockerar nytt sparande tills underlaget kan läsas. Workspace-summary och planläsning jämför version/revision/status för att inte visa olika lästidpunkter som en sammanhängande plan.

Session-/uppdragsförlust och epochbyte rensar vy/form och sena svar får inte återställa innehåll. Inga plan-ID eller planfält lagras i URL, localStorage eller sessionStorage. Modal aria-modal, fokus och bakomliggande navigation spärras. Escape/Avbryt bekräftar osparade ändringar; korrekt stängd dialog möjliggör vanlig utloggning.

## Verifiering

- Skyddat appbygge, typkontroll, bred app/lib-lint och båda browserspecs: PASS. Handbokens Docusaurusbygge: PASS.
- Egna programplansval-/kommando-/acknowledgementprov: 7/7 PASS; browserharnessprov: 4/4 PASS. Riktad transport-/program-/timplansomkörning: 33/33 PASS.
- Roots färska ordinarie lib/serveromkörning efter transportfix: 386/386 + 105/105 PASS. Oförändrade kataloggeneratorprov 11/11 och båda generators --check PASS; samlad relevant Nodekontroll 502.
- Faktisk programplansbrowser: **30/30 PASS**, 15 olika fall på Chromium/dator och iPhone/WebKit. Verkligt Worker/SQL, inga retries eller skips. Urval/versioner/sidning, explicit start/källa, bindning/ordning/tom fördjupning, båda kloningsgrunder, ny session, dubbelklick enwrite, tvåsessionskonflikt, konkurrerande nytt utkast, MFA/auditrollback, HTTP400-fältbevarande, accepterad write med tappat/502/kodlöst400-svar, misslyckad omläsning, normal modalavbrytning, faktisk utloggning/sent svar, epoch/utgången session/mandatåterkallelse.
- Faktisk timplansbrowser: **20/20 PASS** på samma c320041bygge, Chromium/dator och iPhone/WebKit, inga retries/skips. Befintliga flöden består och fall08 öppnar rätt skyddad programplansvy. Fall10 bevisar bibehållen IM-vägledning vid accepterade writes följda av abort/läsfel, kodlöst502 och kodlöst400, med exakt en write, verklig audit och lagrade revisioner. Slutprovet använder endast neutral uncaughtExceptionMonitor/exitdiagnostik; ingen unhandledRejection-listener och noll monitorhändelser.

Gemensam Worker-buildrevision är **c3200412f24a5ca797b47bcc2bfcf714d56e5697**. Programbrowserstartens faktiska HEAD är samma; en planeringscommit avancerade HEAD till 0b6a118 före telefonprojektet. Båda projektens föreprov jämförde samtliga styrda filer mot samma bygge, inklusive gemensam server-client och osparatskydd, och vägrade smutsiga/ändrade källor. Observerade HEAD redovisas separat; en ny planeringscommit ändrar inte runtimebyggets identitet.

## Nödvändiga rättningar och städning

GSD Rule1: server-client:s generiska bad_request-reserv kunde dölja kodlöst 502 eller malformed/kodlöst400 efter committad write. Transporten behåller därför hasExplicitCode, endast sant för avkodad objektkropps eget strängfält. Program- och befintligt timplanssparande kräver detta samt etablerade säkra par 400/bad_request, 403/mfa_required och 500/audit_unavailable; övriga skrivfel är osäkra och kräver faktisk omläsning. Vanligt explicit400 behåller redigerbart formulär. Befintliga timplansfall08/10 utökas avgränsat för öppnad skyddad programnavigation och verkliga IM-writes med tappat/kodlöst svar och bibehållen IM-vägledning.

Safari gav native-select26px trots min-height; uttrycklig48pxhöjd rättades och telefonflödet kontrollerar minst44pxkontroller, tangentbord och frånvaro av vågrätt överflöde.

Alla30 slutliga programfixturer städade sin egna exakta syntetiska kund-/session-/plan-/utbildnings-/mandatgraf samt egna triggers/functions till noll. **679 audit events och36 refererade identitetsankare** bevaras. Inga tillfälliga SQLgrants införs av browserfixturerna. Alla20 slutliga timplansfixturer verifierar noll egna grafrester och bevarar **300 audit events och26 identitetsankare**. Timplanscleanup rättades avgränsat till att bevara auditrefererade identiteter och kontrollera alla egna grafdelar. Detta verifierar nya omgångar; tidigare borttagna ankare återställs inte och äldre cleanup blir inte retroaktivt kontrollerad.

Två fixturer från en första misslyckad explorativ modaltestomgång städades separat med exakt marker/UUID-/utbildningsägarskap, max2matchningar, noll egna verksamhets/sessionrester och bibehållen audit/ankare. Bevis: phase5-11-cleanup-repair.json. En senare avbruten omgång hade11 gröna fall och13 städade seedade fixturer; en synkron unloadassert rättades till väntan på Reacts verkliga dirty-hook. Därefter avslutades Wrangler med tom ERROR, så återstående fall kunde inte starta. Orsaken kan inte beläggas med run-mode:s avstängda loggning. Minimerat separat FAIL-bevis phase5-11-browser-interrupted.json och nollresterinspektion bevaras. Den slutliga c320041-omgången startades om utan retries/skips och passerade30/30.

## Bevis och återstående mänskligt prov

Minimerade bevis finns i work/pilot/results/phase5-11-browser.json, phase5-11-timplan-browser.json, phase5-11-visual-index.json och separata cleanup-/avbrottsrapporter. Tolv programbilder och full PlaywrightJSON är lokalt arkiverade i **web/outputs/phase5-11/programplan/** före timplansomkörningen. Fyra slutliga timplansbilder och dess fulla JSON ligger i **web/outputs/phase5-11/timplan/**. Bilder visar läsning, dialog, äldre kloning, konflikt, MFA och läsfel på båda skärmprofilerna. FullPagebilder av fixerad modal visar aktuellt rullat utsnitt; de bedöms tillsammans med faktiska scroll-/fokus-/kontrollassertions, inte som ensam evidens för hela formuläret.

Proven använder lokalt mintade riktiga sessionsbevis och syntetiska data, inte interaktiv IdP eller faktiskt skolbeslut. Negativa transport-/läsvägar simuleras runt faktiska Worker/SQL-writes; lyckad write, audit och lagrad revision kontrolleras. beforeunload dispatch är en simulerad registreringskontroll, inte fysisk mobilunload. Normal Escape/Avbryt och utloggning samt sena svar/epochförlust är verkliga browserflöden. Mänsklig begriplighet, fysisk telefon och samlat05-11/12-verksamhetsprov återstår.

Root äger bestående provunderlag på användarens befintliga syntetiska skola11, separat prepare-programplan-user-trial.mjs och 05-PROGRAMPLAN-USER-TRIAL.md. Root rapporterar SQLförberedelse och idempotens PASS för fyra utbildningar (utan plan, äldre obundet utkast, bundet utkast och äldre låst källa) med SA25v4/SASAP och uttrycklig2026-08-17start. Detta är inte samma kunder som browserfixturerna. 3056 har stoppats med CtrlC och faktisk portstängning kontrollerats efter slutproven. Root kompletterar faktisk Worker-läsning på3012; denna SUMMARY påstår inget mänskligt godkännande.

En första samordnad timplansomgång passerade desktop10/10 men fick därefter samma previewavbrott vid första telefonens sidladdning; alla11 seedade fixturer städades. Detta separata FAIL-bevis finns i phase5-11-timplan-browser-interrupted.json. En diagnostisk omkörning passerade20/20 men använde en möjlig beteendepåverkande unhandledRejection-listener; den hålls separat som phase5-11-timplan-browser-instrumented.json och är inte slutgrind. Den sista hela20/20omgången ovan tog bort lyssnaren. Den intermittenta lokala previeworsaken utreds read-only av rootens debugger i .planning/debug/phase5-preview-exit.md (5776089, awaiting_evidence); en lyckad omstart påstås inte förklara tidigare avbrott eller ge orsaks-PASS. Readinessbedömningen lämnas till root.
