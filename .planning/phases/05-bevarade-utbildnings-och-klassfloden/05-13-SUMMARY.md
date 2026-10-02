---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "13"
status: implementation_verified
completed: 2026-10-02
requirements: [ADMIN-02]
human_verification: pending
subsystem: protected-programplan-ux
requires: [05-11, 05-12]
provides:
  - Direkt läsning av verkligt aktuellt utkast eller senaste plan
  - Ämnen, nivåer, poäng och begriplig nästa handling före tekniska underlag
  - Aktivt guidad källa/start för nya och äldre utkast
worker_build_revision: 0f18e9bb36ad8f40fe4750da6ee8476b43063fc1
commits: [119d618, 8e4b85b, 0b6530f, af9382e, f6f05a7, 9cdb58d, 0f18e9b]
---

# 05-13 — begripligare programplaner

Rättningen utgår från användarens misslyckade begriplighetsprov: ”programplanerdelen är ju fullständigt obegripligt UI. fattar noll.” 05-11:s mekaniska PASS är historik; det ersätter inte denna mänskliga leveranslucka. Den nya vyn visar utbildningens faktiska aktuella plan direkt och börjar med innehåll och nästa handling. Nytt mänskligt begriplighetsprov och timplanshandledningens separata textbedömning är fortfarande öppna. ADMIN-02, full fas 5 och fas 4:s checkpoint är inte godkända.

## Vad användaren möter

Utbildning/skola/kull och kort status följs av en primär nästa handling: Skapa programplan, Gör utkastet redo för ändring, Ändra fördjupning eller Skapa ny version. Ett redan befintligt annat utkast kan öppnas med verkligt draftId. Därefter visas Ämnen och nivåer med sparade ordnade fördjupningsval skilda från referensdelarna Gymnasiegemensamma ämnen, Programgemensamma ämnen och aktuell inriktning. Exakt återfunna ämnes-/nivånamn och gymnasiepoäng prioriteras; okända äldre råval behålls utan gissade namn. Optional-alternativ och saknade nivåuppgifter markeras vid sina referensrader. Ingen totalsumma, automatisk alternativlösning eller omräkning till timmar har införts.

Underlag och tidigare versioner börjar stängt och öppnas med tangentbord. Där finns exakt katalog, SHA, program-/ämnesversion, källänk/hämtdatum, start, revision och begränsningar. Fastställande och fullständig nationell ramkontroll är fortfarande stängda. Nytt eller äldre obundet underlag leder genom aktivt källval till startdatum/val/bekräftelse i befintligt formulär. Inget katalog- eller startval görs automatiskt; bunden grund är fortsatt fryst. Tekniska uppgifter i dialogen ligger under Utkastets underlag.

## Faktiskt urval och skydd

Verkligt draftId väljs före exakt ID för latestVersion; ett explicit äldre versionsval består vid historiksidning och omläsning. Selected summary hålls skild från visad historiksida och hämtas med faktisk paginering även när äldre utkast ligger utanför sidan. ID/utbildning/enhet, revision/version/status, grund och ordnade referenser matchas mellan plan och summary. Utbildningsmetadata/versionantal måste vara oförändrade mellan flera läsningar. Saknat eller tvetydigt underlag ger fel och blir inte en tom äldre valmängd.

Befintliga API-/parser-/servervägar, CAS, MFA, dubbelwrite-spärr, dirty/confirmDiscard, generation/abort/mounted/epoch och sessionsrensning består. Kodlös/malformed400 och502 samt tappat writesvar kräver fortsatt obligatorisk verklig omläsning med bevarat formulär; hasExplicitCode och säkra status/kod-par är oförsvagade. Konflikten jämför namngivna egna och aktuella val; tekniska revisioner/referenser kan öppnas. Ingen blind retry för create/clone eller ändrad grund. Ingen ny SQL, grant, serverroute, utbildningsfunktion eller beslutsfunktion.

Oberoende granskning hittade och rättade ett guidegap: tidigare lyckat katalogval A kunde ligga kvar när tomt/annat val och återval A misslyckades. Fel i den senaste läsningen spärrar nu både Fortsätt och formuläröppning. Färskt fall02 provar exakt lyckat A → tomt503 → A503 → auditerad lyckad omläsning innan Fortsätt. Guideval och fält finns kvar vid fel; inga nya utkast skrivs av källläsningen.

## Färska källkontroller

- Riktade urvals-/modell-/kontraktprov: 25/25 PASS, varav 10 egna programplanshjälparprov. Ny urvalslogik omfattar utkast utanför historiksidan, senaste plan utan utkast, explicit äldre val, saknad/tvetydig/inaktuell metadata, exakt summary och exakt namnmatchning.
- Browserharnessprov: 4/4 PASS. Runnerns syntaxkontroll PASS.
- TypeScript och bred app/lib-lint samt programplansspec: PASS efter guidefixen.
- Skyddat appbygge: PASS på 0f18e9b. Docusaurus handboksbygge: PASS med handbokskälla af9382e, oförändrad genom 0f18e9b.
- Server/SQL/kataloggeneratorer är oförändrade. 05-11:s 386 ordinarie lib + 105 server + 11 generatorprov (502 totalt) är historiska och räknas inte som en ny 05-13omkörning.

## Browserbevis

Programplansmatris **30/30 PASS**: 15 fall på dator/Chromium och iPhone/WebKit, inga retries, skips eller ramverksfel. Direkt planläsning, stängt/tangentbordsöppnat Underlag, referensluckor, aktiv guide/källa/start, verkliga create/bind/replace/clone, ordning/tomt, ny sessionscookie, dubbelklick exakt enwrite, konkurrerande utkast, tvåsessionskonflikt och annan fryst grund, MFA/auditrollback, explicit400-fältbevarande, accepterad write + abort/502/kodlös400 + obligatorisk read, misslyckad omläsning, dirty/Escape/fokus/sent svar, epoch/session/mandatförlust samt historiksidning/aktuellt äldre utkast och okända äldre val är kontrollerade. Underlagsvalets felväg provas med faktiska auditerade Worker-läsningar innan browserintercept ersätter svaret.

Timplansregression **20/20 PASS** på samma bygge, 10 fall i vardera Chromium och iPhone/WebKit, inga retries/skips/errors. De befintliga positiva/negativa cell-, CAS-, MFA-, audit-, epoch-, mandat-, sessions-, osparat- och handledningsproven består. Gateway-/tappat-svar-fall 09/10 väntar nu på den verkliga obligatoriska POST/lasa för exakt planId med status 200 innan oförändrad5s UIassert; samtliga write-/audit-/data-/revisionsasserts kvarstår.

Gemensam Worker-buildrevision är **0f18e9bb36ad8f40fe4750da6ee8476b43063fc1**. Programbrowserns start- och båda föreprov-HEAD är samma revision. Senare planerings-/helpercommits ändrar inte byggidentiteten; föreprov vägrar smutsiga eller ändrade styrda app/lib/server/e2e/handbokskällor. Observerade HEAD redovisas separat i rapporterna.

Alla30 programfixturer verifierar noll egna verksamhets-/session-/mandat-/trigger-/funktionsrester. **889 audithändelser och 36 refererade identitetsankare** bevaras. Browserfixturerna inför inga tillfälliga SQL-grants. Alla 20 timplansfixturer verifierar också noll egna grafrester och bevarar **303 audithändelser och 26 refererade identitetsankare**. Den kompletterande valda-guidegranskningen använde två separata egna läsfixturer: inga mutationskommandon, noll egna grafrester, **15 audithändelser och 2 ankare** bevarade. Beständiga användarprov och deras tidigare ändringar har inte resetats eller skrivits om.

## Bilder och begränsningar

Fjorton faktiska programbilder och full PlaywrightJSON är arkiverade i **web/outputs/phase5-13/programplan/** före timplansomgången. Alla14 bilder har visuellt granskats: direkt läsning, guide, redigering, äldre kloning, konflikt, MFA och obligatorisk omläsning på båda profilerna. Ämnesnamn/nivåer/poäng och en handling kommer först, referensluckor är tydliga och inget sidöverflöde syns. Telefonmodalens bottenåtgärder är läsbara. Modalbilder visar aktuellt rullat utsnitt och bedöms ihop med faktiska scroll/fokus/44px-knapp/48px-inputkontroller, inte som ensamt bevis för alla kontroller samtidigt. Telefonens valfält visar nu korta ”Skolverket · hämtat 2026-09-05”; utbildning/inriktning står ovanför och exakt program/hämtdatum visas först efter lyckad aktuell läsning. Två kompletterande faktiska selected-guidebilder på samma bygge visar läsbart datum på dator och telefon, utan mutation. Dessa och fyra slutliga timplanshandledningsbilder har också granskats visuellt. Telefonens guide kan kräva fortsatt rullning till Fortsätt; ordinarie matris provar verkligt klick och modalens efterföljande handlingar.

Proven använder lokalt mintade riktiga sessionsbevis och egna syntetiska kunder. Negativa transportfel simuleras kring faktisk Worker/SQL/audit; detta är inte interaktiv IdP eller ett skolbeslut. beforeunload dispatch kontrollerar registrering och är inte fysisk mobilunload. Fysisk telefon och mänsklig begriplighet återstår. Tidigare05-11-previewavbrotts orsaksutredning förblir separat awaiting_evidence; ingen orsaksfix påstås.

## Historisk första omgång och testens avgränsade synk

Första f6f05a7-programomgången 30/30 PASS och timplansomgången 18/20 FAIL bevaras separat under **web/outputs/phase5-13/initial-f6f05a7/** med fulla JSON/bilder och de två felkontexterna. De minimerade rapporterna har suffix `-initial.json`; tidigare 05-11-bevis är orörda. Telefonens timfall 10 och 09 startade 5s UIassert medan den verkliga sparningen/obligatoriska omläsningen fortfarande pågick. Privat Workerlogg visade fördröjda lokala 1–16s anrop; faktisk rotorsak är inte belagd. Ingen previewkrasch observerades. Alla 20 fixturer städades med 283 audithändelser/26 ankare bevarade.

Rättningen synkar endast dessa två faktiska svarskedjor mot rätt plans /lasa200 före samma UIassert. Ingen retry, skip, bred timeoutökning eller produkt-/auth-/SQLändring infördes. Dessutom kortades telefonens guideplaceholder/option med synlig program-/datumcaption. Nytt versionshanterat 0f18e9b-bygge och helt nya fulla 30+20-omgångar passerade; detta är slutbeviset.

## Handbok och nytt mänskligt prov

Handboken beskriver faktiska uppgifter och slutliga knappnamn: öppna utbildning, läs ämnen/sparade val, välj nästa handling, följ källa/start och spara. Det interna 05-PROGRAMPLAN-USER-TRIAL börjar nu med att öppna utbildningen och beskriva vad som ingår och vad som kan ändras. De fyra befintliga exemplen används beroende på faktisk kvarvarande status; ingen initialbild återskapas. Root äger slutlig vanlig 3012-start, hälsa och bevarande Worker-läsning av användarens tidigare planstatus/val samt löpande push. Separat lokal OTP-hjälp ersätter inte programprovens noMfa-gräns.

## Slutbevis och runtime-handoff

- `work/pilot/results/phase5-13-ux-browser.json`: fulla 30 PASS, rätt source/build, cleanup30.
- `work/pilot/results/phase5-13-timplan-browser.json`: fulla 20 PASS, samma source/build, cleanup20.
- `work/pilot/results/phase5-13-visual-index.json`: slutliga 16 program-/4 tim-bildvägar och visuell granskning.
- `work/pilot/results/phase5-13-selected-guide-visual.json`: två faktiska auditerade guideval, inga mutationskommandon, exakt cleanup.
- `work/pilot/results/phase5-13-{ux-browser,timplan-browser,visual-index}-initial.json`: första hela historiska omgången.

Normal 3056-preview utan diagnostisk preload, session 51789, stoppad rent med CtrlC/exit 130. Fetch bekräftade stängd port. DB/runtime är överlämnade till root för vanlig 3012 och den bevarande current-verifieraren. Ingen README-/STATE-/ROADMAP-/PROJECT-status eller beständig verksamhetsbild har ändrats av denna executor. Mänskligt begriplighetsresultat förblir pending; root kompletterar faktisk 3012/current-readiness separat.
