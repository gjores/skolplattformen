---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-06
subsystem: apl-decision-ui-and-handbook
status: complete
requires: [APL-04, APL-04A]
provides: [saved-apl-decision-evidence, explicit-rector-confirmation-presentation, legacy-completion-flow, apl-planning-handbook]
affects: [APL-05, APL-07, APL-08]
key-files:
  created: [web/e2e/apl-decision.spec.ts, web/playwright.apl-decision.config.ts, web/e2e/fixtures/apl-decision-preview.tsx, web/e2e/fixtures/apl-decision-preview.html]
  modified: [web/app/plan-decision-panel.tsx, web/app/plan-decision-context.tsx, docs/handbok/timplaner.md, docs/handbok/programplaner.md]
---

# APL-06 – sparat APL-underlag inför beslut

Beslutsvy och användarhandbok är implementerade. De avgränsade proven passerar: **26 simulerade browserfall**, **32 modell-/serverprov**, TypeScript, oxlint, handboksbygge och diffkontroll. Beslutsvy och byggd handbok har bildgranskats på dator och telefon. Samordnaren har dessutom oberoende läst produkt-/handboksdiffen och granskat två representativa dator-/telefonbilder utan blockerande fynd. Ingen aktiv 3012, databas, IdP, migration, generisk årsaggregering eller API-produkt ändras inom denna plan. Faktiskt sammanhängande redigerings-/beslutsflöde med Worker/OIDC verifieras senare i APL-08; denna plans preview är uttryckligen simulerad.

## Verksamhetsbeteende

Beslutspanelens **APL inför beslut** visar samma sparade APL-underlag som servern har kontrollerat: utbildningsform, antal perioder, fördelad APL-tid, uppgivna hela veckor per period, veckounderlagets granskningsmarkering, datum/läsår, beskrivna arbetsmoment och periodens inkluderade APL-tid. Summorna är enbart presentation av sparade heltalsminuter med den befintliga `splitAplMinutes`-funktionen. Ingen ny regel-, hash- eller granskningsalgoritm införs. Veckotal summeras inte till ett påstående om verifierad omfattning; uppgiven och granskad information hålls isär. Delveckor visas utan påhittad helveckoomräkning.

Rektors senaste verkliga ansvarshändelse visas med aktör, datum och kommentar. Serverns verifierade `currentConfirmationId` avgör om den gäller sparat innehåll eller behöver förnyas. En administrativ submitrevision ger ingen falsk varning. Texten skiljer uttryckligen rektors förläggningsbekräftelse från huvudmannens fastställande. En beredare kan inte skapa en rektorsbekräftelse här: panelen anropar inga APL-kommandon och erbjuder ingen egen **Bekräfta förläggningen**-knapp. APL-05 äger den enda editorn och bekräftelsevägen.

En enda länk, **Öppna APL-planeringen**, går till `#apl-planering` i den exakt öppnade timplansarbetsytan. APL-05 har fått kontraktet att sätta detta ID och ett fokuserbart ankare på sin sektion. Den befintliga inkorgsnavigeringen behåller exakt plan-ID, skola och version; panelen visar därför hela sparade APL-delen även efter öppning från inkorgen. UI visar arbetsmomentsbeskrivningar i stället för tekniska rowKey-värden; ämnesval och full timmatris nås i samma APL-arbetsyta.

Inkorgen visar timplanens namn samt om APL-underlag och rektorsbekräftelse finns eller behöver kompletteras. Granskningsärenden räknas fortsatt som granskningsärenden, även när huvudmannen behöver återsända dem. Sökfältets hjälptext nämner även timplansnamn. Ingen ny övergripande APL-dashboard eller omtolkning av årssummor införs.

Äldre inskickade planer visar kompletteringsbehov utan att kalla saknat APL noll timmar. Tillåtna return/withdraw-vägar finns kvar; submit/approve erbjuds inte när den verifierade APL-delen inte är klar. Historiskt fastställda/ersatta planer behåller historik och visas med okänd äldre APL-fördelning, utan ny grön status eller retroaktiv uppgift. Programplaner har fortsatt sin egen checklista och får ingen skolvis APL-spärr.

Gemensam `disabled` gäller normala beslutsåtgärder, checklistan, kommentaren och även en redan öppen fastställandedialog. Kommandofunktionen kontrollerar dessutom faktisk beredskap före submit/approve, inte bara knappens disabled-attribut. Pågående omläsning spärrar också dialogens bekräftelse. Befintlig identisk återprövning efter okänt beslutsutfall består; efter ett kvitto läses alltid aktuellt underlag i stället för att ett äldre svar återställs i vyn.

## Handbok

`docs/handbok/timplaner.md` beskriver ett sammanhängande flöde från rätt namngivna timplan till utbildningsform, perioder, ämnesinnehåll, arbetsmoment, total/varav, sparning, rektors bekräftelse och huvudmannens prövning. Den förklarar 23 undervisningstimmar per granskad hel vecka i den stödda skolförlagda profilen, minutfördelning, delveckors/lärlingsformens begränsningar, äldre kompletteringar, kopierat granskningsunderlag och osäkra sparbesked.

`docs/handbok/programplaner.md` skiljer gemensam programram från skolans namngivna APL-timplan. Programplanen kan beslutas före skolans färdiga APL-förläggning. Båda sidor anger att platser, handledare, närvaro och genomförande ännu inte följs upp. Ingen drift- eller migrationsinformation har lagts i handboken.

Editorfält och knappar är samordnade med APL-05: **Planera APL**, **Lägg till period**, **Granska ändringar**, **Spara APL-plan**, **Bekräfta förläggningen**, **Läs sparstatus**. Slutlig kontroll mot den färdiga integrerade APL-05-editorn och APL-08:s faktiskt körda flöde återstår före release; eventuell skillnad ska rättas i texten. Handboksbygget är lokal verifiering, inte publicering.

## Verifiering och bilder

`npx playwright test -c playwright.apl-decision.config.ts`: **26/26 PASS**, fördelat på **13 Chromium/dator** och **13 WebKit/iPhone 13**. Separat preview på **4188** startas/stoppas av Playwright. Rapport: `/private/tmp/apl-decision-ui.json`.

Proven täcker:

- Huvudmannen öppnar exakt plan/skola/version från inkorgen, läser sparade perioder och rektorshändelse, granskar och fastställer.
- Rektor skickar bekräftat innehåll; den administrativa revisionen gör inte bekräftelsen inaktuell.
- Skoladministratör ser sparat underlag och vägen till APL-editorn men kan inte imitera rektorsbekräftelse.
- Ändrat APL-innehåll visar tidigare rektor och kräver ny bekräftelse. Inget nytt fastställande erbjuds.
- Legacy submitted kan återsändas eller återkallas; historiskt approved visar sitt tidigare namn och beslut utan noll-/komplett-APL-besked.
- Delveckor med sparade 23 h 1 min visas utan helveckoomräkning. Programplanens tidigare beslutsväg fungerar utan skolans APL-blockerare.
- En nytillkommen spärr stoppar en redan öppen approvaldialog, inklusive direkt DOM-klick. Efter avspärrning krävs fortsatt ordinarie granskning.
- 409 ger begriplig omläsning och återställer checklistan. Borttappat svar och explicit legacy-replay återprövar identiskt command-ID/payload och visar därefter aktuell plan.

Bilderna finns under `/private/tmp/apl-decision-ui/`: `apl-decision-evidence.png` och `apl-stale-confirmation.png` för båda projekten. Alla fyra granskades visuellt. Text och knappar är läsbara, perioddetaljerna kan fällas ut och sidan har inget horisontellt spill vid telefonbredd. Telefonen använder en lodrät presentation utan att minska texten till en tabell.

`node --test lib/plan-decision.test.mjs lib/server/plan-decision.test.mjs`: **32/32 PASS**, rapport `/private/tmp/apl06-node.txt`. `npx tsc --noEmit`, `npx oxlint app lib` och riktad lint av nya fixtures/spec/config: PASS. Avgränsad `git diff --check`: PASS.

`npm run docs:build`: PASS, logg `/private/tmp/apl06-docs-build.txt`. Docusaurus gav en icke blockerande varning om sin externa uppdateringskontrolls lokala cache; själva klient-/serverbygget slutfördes. De byggda sidorna öppnades på en tillfällig statisk server **4189**, därefter stängd, med Chromium och WebKit. Den nya korslänken till exakt APL-rubrik och omfattningsbegränsningen kontrollerades. Fyra renderade handboksbilder granskades: `/private/tmp/apl06-docs-{programplan,timplan}-{desktop,phone}.png`.

Tidiga fel särredovisas: första sandboxkörningen kunde inte binda previewporten och kördes därefter med avsedd tillåtelse. Första browserkörningen passerade 8/26 men testfixturens felaktiga ämnesnyckel avvisades av den riktiga parsern; efter rättningen passerade 12/26 och återstående fall stoppades av testfixturens icke kanoniska APL-tidsstämpel. Båda rättades utan produktfallback före slutlig 26/26. Rapporterna bevaras i `/private/tmp/apl-decision-ui-first.json` och `-second.json`. Handbokens första renderingsscript antog en avslutande slash i länken; kontrollen rättades till Docusaurus båda giltiga URL-former före slutligt PASS.

## Bevarande och avgränsning

Rootens oberoende produkt-/handboksläsning fann inga konkreta blockerare. Inga filer utanför planens ägarskap ändrades. Skol-/huvudmanna-/klassidentiteter och giltigheter enligt SS 12000:2024 utgåva 4/OpenAPI 2.1.0 bevaras; detta UI skapar ingen Placement, Attendance, klasskoppling eller extern export. Ett sparat planeringsunderlag och rektors ansvarshändelse presenteras aldrig som faktiskt genomförd APL.

APL-05/07 ansvarar för editor, minuter i timtabell och sammanhängande navigations-/sparspärrar. Denna preview har bara ett uttryckligt testankare för editorn och provar inte en verklig administratörssparning eller rektors APL-kommando. Dessa beteenden ska inte räknas som verifierade av de 26 beslutsfallen. Faktisk Worker/OIDC, säkerhetsgränser vid direkt routeanrop och sammansatt dator-/telefonflöde hör till APL-08; tidigare APL-04/04A:s 28 SQL-/Workerfall är separat bevis. Samordnaren äger commit, push och paketstatus.
