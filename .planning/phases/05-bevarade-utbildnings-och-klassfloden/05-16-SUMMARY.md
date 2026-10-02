---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "16"
subsystem: protected-programplan-ui
status: complete
completed: 2026-10-02
requirements: [ADMIN-02]
requires: [05-15]
human_result: awaiting_user
worker_build_revision: 023e68b126ffccfdab952abe1d2274a70e8e266d
---

# 05-16 — samma programflöde för nytt och befintligt

05-15/05-16 genomförda automatiskt på skyddat bygge `023e68b`. Samma program → inriktning → programfördjupning används för befintligt rektorsarbete och huvudmannens nya gymnasieutbildning/utkast. Fulla programbrowser 38/38 och timplan 20/20, cleanup 58/58, ny API 43/43 och 128 riktade Node-prov PASS. Typ/lint/skyddat bygge och handbok PASS; tio dator-/telefonbilder granskade. Vanlig 3012 kör direkt workerd; nio bevarade exempel för R/HM lästa med 40 auditpar och fyra verkliga lokala OIDC/MFA-inloggningar PASS. Ny mänsklig begriplighetsbedömning väntar. ADMIN-02/full fas 5, nationella beslut, paket, kullkopiering och klasskoppling är öppna.

## Leverans

Historiska frontendflödet från fas1-baslinje har jämförts och verksamhetsordningen återförts till skyddad app. Välj program, därefter inriktning och utbildning/kull, och fyll på fördjupning med ämnesgrupperade kryssval. Programgrund/inriktning visas i kompakta tabeller; begreppshjälp och tekniska versioner är sekundära. Program utan inriktning visar detta direkt. Samma arbetsyta och fördjupningsväljare används för huvudmannens verkliga nya utbildning och första utkast. Rektor får inga nya skapanderättigheter.

Alla utbildningssidor ingår i urvalet. Befintligt val öppnar exakt utbildnings-ID med fasta grunduppgifter. Äldre värden, katalogversion, startdatum och ordnade nivåreferenser bevaras. Val är lokala fram till granskning och uttrycklig sparning. Tillbaka/avbryt gör ingen verksamhetsskrivning. Nytt skapande använder 05-15:s atomiska kommando och stabila UUID; status med samma kommando återläses vid okänt svar. Osparatskydd, mandat/epoch, MFA, obligatorisk audit, CAS och sena svar prövas i fullmatrisen.

## Bevis

| Kontroll | Verifierat resultat |
|---|---|
| Programplansbrowser | 19 fall × dator/telefon = 38/38, inga retries/skips; alla egna rester inklusive kvitton/utbildningshändelser noll. |
| Timplansregression | 10 fall × dator/telefon = 20/20 på samma Worker-bygge; alla egna rester noll. |
| Ny utbildnings-API på slutlig runtime | 43/43 med exakt trettonfunktionsprofil, riktiga skrivningar/replay/audit/rollback, tidigare verksamhet hashidentisk och två egna fixturegrafer städade. |
| Node/typ/lint | App/klient 99, harness 25, preview-integritet 4 = 128 PASS; typ/lint PASS. |
| Bygge/handbok | Skyddat bygge PASS. Uppdaterad handbok byggd med Docusaurus; källtext oförändrad sedan den lyckade dokumentationsbyggnaden. |
| Visuell granskning | Tio faktiskt renderade bilder: program/inriktning, grund, kryssval och granskning för befintligt/nytt utan inriktning på dator/WebKit. Ingen write eller horisontellt överflöde. |
| Beständigt mänskligt underlag | 9 utbildningar × R/HM, 6 programprojektioner per roll, 40 obligatoriska DB/Worker-auditpar, verksamhetsrader identiska före/efter. Inga användarval återställda. |
| Verklig lokal inloggning | 4/4 OIDC/MFA med roll-/provkodsknappar på dator/telefon; varje egen session återkallad, audit bevarad. Detta är automatiskt syntetiskt IdP-prov, inte mänsklig begriplighet. |

Samlat maskinbevis: `work/pilot/results/phase5-16-sharedflow-verification.json`. Backendens SQL50, nya observerade lås4, gamla lås7/paritet42 och äldre API48/38/39 beskrivs i 05-15-SUMMARY. De äldre API-resultaten är bevis på dåvarande Wrangler-runtime med oförändrad programplans-/timplansserverkod, inte omkörningar på direktpreview. Nytt API43 och UI58 gäller det faktiska slutliga direktbygget.

## Avvikelser och bevarade FAIL

- Provskola11 saknade verklig GY-metadata. Endast verifierad syntetisk skola kompletterades additivt; två befintliga mandat kontrollerades och tolv tidigare utbildnings-/planrader bevarades. Ingen mandat-/planreparation eller reset.
- Äldre timplansfall08 förväntade en direkt utbildningslista. Det prövar nu program/inriktning genom verklig route; egna GR/GY-fixturtyper och cleanup kompletterades. Separata Playwright-outputkataloger bevarar båda sviternas råbevis.
- 529afa4 hade program38 PASS men tim18/20 FAIL. 19df712 avbröts av preview (31 PASS,2 FAIL,5 ej körda;32 egna cleanups noll). 14810ba avbröts också (17 PASS,4 FAIL,17 ej körda;20 cleanups noll). 8d98e17 hade36 PASS och två felaktiga IdP-originassertions, cleanup38 noll. Råbevis arkiverade i ignored `web/outputs/phase5-16-sharedflow/`.
- Fångad terminalorsak: Wranglers ProxyWorker gör tappad nätverksanslutning till fatal serverexit. Avslutad testutloggning inväntas; kroppslös utloggning tog bort tolv observerade streamfel i avgränsat A/B. Bredare proxyfel kvarstod. Protected-preview kör därför samma byggda Worker direkt genom Miniflare/workerd med samma privata konfiguration, assets, kompatibilitet och 116 explicita servermoduler. Ingen global felhanterare undertrycker exceptions. Två initiala adapterfel korrigerades (V4-konvertering/explicita moduler); fyra integritetsprov och faktiskt API43/browser58 verifierar slutlig väg. Upstreamfrågan är fortfarande öppen, se `.planning/debug/phase5-preview-exit.md`.
- Bildgranskningen av 0874769 upptäckte ärvd sticky-stil från tidigare dialog: sparknappar täckte mobilt innehåll. Inlineformulär använder nu statiska knappar efter innehållet. Fulla browserprov och tio nya bilder på slutligt bygge kontrollerar rättningen; tidigare funktionell PASS används inte som visuell acceptans.
- Browserhjälpen läser navigationens faktiska tillstånd i stället för en övergående position under animering. Logoutprovet följer testprofilens faktiska IdP-origin och verifierar att originaltoken nekas efter serverns återkallelse.

## Överlämning

Vanlig skyddad app, lokal IdP och provkodsknapp kör. Nytt användarprov beskrivs i 05-PROGRAMPLAN-USER-TRIAL. Tidigare mänskligt resultat är FAIL och bevaras; det nya är ännu oprövat. Nyutbildningens osparade kommando finns i komponentminne: uttryckligt bekräftad navigation/omladdning kan lämna det. Paket över flera programplaner är fortsatt pending todo. Nationellt fastställande, elevval, gymnasiearbete, generellt GR/IM-skapande, kullkopiering och klasskoppling införs inte här.
