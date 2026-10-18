---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TIMPLAN-APL-AUTO
status: delivered-awaiting-user
verified: 2026-10-18
---

# Autofördelning av skoltimmar och års-APL

Användarens komplettering ger ett granskningsbart timförslag med tillräcklig total undervisningstid och APL-ram. För stödda Gy25-yrkesprogram med års-APL är **Föreslå APL-timmar** förvalt. GUT anger startvärdet för totalen och APL föreslås till minst 345 timmar, eller mer om befintlig APL redan överstiger den nivån. APL ingår i totalen; återstoden fördelas på skola HT/VT.

Förvalet omfattar specificerade programgemensamma yrkesämnen, inriktning och programfördjupning. Användaren kan ändra urval och APL-total samt granska varje ämnes årsfördelning före sparandet. Fördelningen följer poängvikten, använder hela minuter och bevarar summan exakt. Befintlig APL minskas aldrig, även i ämnen utanför urvalet. Fyll-läget bevarar också angivna skoltimmar inklusive noll. Om de inte lämnar utrymme för föreslagen APL behöver användaren höja totalen eller uttryckligen välja att fördela om skoltimmarna.

## Modell, skydd och avgränsningar

Valfritt APL-förslag skickas genom befintlig atomisk matrisoperation. Servern härleder samma förslag från aktuell timplan, kontrollerar rätt roll, skolenhet och revision och jämför sparat/återläst resultat. Gamla anrop utan APL-val fungerar fortsatt. Äldre timmodell behöver övergå till års-APL före det nya förslaget. APL:s separata versionsräknare förväxlas inte längre med timplansrevisionen i äldre autofördelning/övergång.

Högskoleförberedande program får ingen APL-funktion. Okänd programram, för låg GUT-total, mindre än 345 APL-timmar, olämpliga/okända radval eller rader utan någon undervisningstid ger inget komplett APL-förslag. Manuella utkast kan fortsatt vara ofullständiga; tidigare inskicknings-/beslutsspärrar består.

Förslaget väljer inte centralt innehåll, arbetsmoment, arbetsplats, termin eller datum för APL. Årsbudgeten återanvänds i den senare APL-processen där detta planeras. Urvalet av yrkesämnen är en försiktig produktregel för startförslag, ingen rättslig begränsning av manuell APL-planering. Tillräcklig timbudget bevisar inte genomförda veckor, lärlingsomfattning eller individuell rättighet. Regelbaslinjen är samma som i [timkontrollens verifiering](05-TIMPLAN-HOURS-CHECK-VERIFICATION.md).

SS 12000:2024 utgåva 4/OpenAPI 2.1.0: interna budgetar skapar inga Attendance/Placement-objekt. Identifierare, käll-/versionsansvar och befintliga klassrelationer bevaras. Inget externt standardutbyte verifieras i denna förändring.

## Kontroller hittills

- 45 modell-/server-/kontraktsprov PASS. Nya fall omfattar exakt totalsumma, 345-gräns, befintlig APL över gränsen, bevarad skolnolla, urval, minutavrundning, kapacitet, nollrader och oberoende revisioner. Logg: `/private/tmp/apl-auto-model-server.log`.
- Typkontroll och full app/lib-lint PASS. Ett oanvänt namn i det nya servertestet togs bort efter lintanmärkningen.
- Separat skyddat bygge PASS, produktrevision `29b870fd2e7d5049254ae5fe43999194f883ef52`. Aktivt bygge har inte byggts om på plats.
- [UI-/handboksresultat](05-TIMPLAN-APL-AUTO-UI-SUMMARY.md) redovisas separat. Visuell granskning ledde till normal checkboxbredd och läsbar tabellbredd med sidscroll på telefon. En följdrättning begränsar sidscroll till tabellen; den slutliga dialogbredden kontrolleras även automatiskt.

22 nya och 24 befintliga UI-prov passerar. Efter sista CSS-rättningen passerar två riktade dator-/telefonprov och sju slutbilder är granskade. Handboksbygget passerar. 53 kontroller av leveransverktyg och relaterade skydd passerar.

Första faktiska Workerprovet sparade rätt timbudget men stannade på en ny testselectors äldre bekräftelsetext. Provet behålls som misslyckat; OIDC-, runtime- och snapshotstädning slutfördes. Förväntan rättades till aktuell V2-text före nästa körning. Faktiskt slutligt Worker-/OIDC-/databasprov och eventuell lokal appöverföring redovisas i slutverifieringen. Ingen migration krävs. Full fas-/pilotacceptans och historiska 88/100 planer samt 3/8 faser ändras inte.

## Slutresultat

Faktiskt slutprov **17/17 PASS**, sex bilder granskade och all egen teststädning slutförd. Exakt testad `29b870f` kör nu på3012 efter läsande OIDC-efterprov och kontroll att alla76 verksamhetstabeller är oförändrade. Ingen migration behövdes. Se [slutverifieringen](05-TIMPLAN-APL-AUTO-VERIFICATION.md) för artefakt- och bevishashar. Ny mänsklig begriplighetsbedömning återstår.
