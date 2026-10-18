---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TIMPLAN-APL-AUTO
status: ui-verified-simulated-api
---

# Autofördelning av års-APL – UI och handbok

UI-agentens avgränsade del använder verklig ProtectedHome, produktdialog och kontraktsparsning med syntetiskt API. Den simulerade skrivningen använder den rena förslagsfunktionen; oberoende assertions kontrollerar totalsumma, APL-ram, årsfördelning, payload, bevarade värden och revisioner. Detta är inte bevis för servermandat, atomisk SQL eller faktisk lokal leverans.

## Verifierade scenarier

Elva fall körs på dator/Chromium och telefon/iPhone 13 WebKit:

- Tom yrkestimplan ger förval på 345 APL-timmar inom 2625 totalt, med två valda yrkesämnen. Förhandsvisning per år och ämne granskas innan skrivning. Varje ämne får 57:30 timmar per år i det jämnt viktade provunderlaget; grundämnet får noll APL. Alla aktiva APL-celler fylls och resultatet består efter reload.
- Avbryt lämnar hela planen oförändrad.
- Redan fyllda skoltimmar som inte rymmer målet kräver uttryckligt omfördelningsval; ogiltigt förslag skriver inget.
- Befintliga 400 APL-timmar bevaras när ramen höjs till 450. Tidigare APL-nollor i valda ämnen kan ökas, medan en uttrycklig skolnolla bevaras i läget Fyll bara tomma celler.
- För låg total, APL under 345 och tomt ämnesval spärrar granskning/sparande.
- Högskoleförberedande plan har inga APL-val och behåller skolautofördelningens anropsform.
- Äldre yrkestabell kräver byte för automatiskt års-APL-förslag men behåller äldre timfördelning.
- Legacy läser separat APL-revision 3 och använder timplansrevision 7; fel timplansbindning spärrar förslaget. V2 behöver ingen separat periodläsning och skriver inga APL-periodkommandon.
- Okänd programomfattning respektive inga användbara yrkesämnen stoppar uttryckligt APL-förslag.
- Avmarkerat APL-förslag lämnar årsramens null-värden oförändrade och fördelar bara skoltid.

Syntetiska rader isolerar fördelningsbeteendet. De är inte ett realistiskt program eller bevis för ämnenas pedagogiska lämplighet.

## Handbok

`docs/handbok/timplaner.md` beskriver total, APL-total, ämnesval, granskning, bevarade timmar och skillnaden mellan skolnollor och uttryckligt ökade APL-nollor. Den skiljer automatiskt APL-förslag från enbart skolautofördelning, legacy och högskoleförberedande program. `docs/handbok/apl-planering.md` länkar vidare från tabellplaneringen. Perioder, innehåll och genomförande anges fortsatt som senare moment.

`npm run docs:build` PASS i `/private/tmp/timplan-apl-distribution-docs.log`. Inga tekniska testkonton eller driftanvisningar har lagts in i handboken.

## Slutlig UI-verifiering

- Nya prov: 22 PASS, inga retries, senaste fullkörning 33,6 sekunder. `/private/tmp/timplan-apl-distribution-css-final.log`; rapport och artefakter bevarade som `/private/tmp/timplan-apl-distribution-22-pass.json` och `/private/tmp/timplan-apl-distribution-22-pass`.
- Befintlig skolautofördelning: 24 PASS, inga ändrade assertions, 17,5 sekunder. `/private/tmp/timplan-apl-distribution-legacy.log`.
- Typkontroll och riktad lint PASS; `/private/tmp/timplan-apl-distribution-tsc-final.log`.
- Första två körningarna stannade på nya fixtureförväntningar: mismatchat SA-käll-ID samt saknad total innan profilspecifik kontroll. De rättades; trace/loggar finns kvar under `/private/tmp/timplan-apl-distribution-first-failure` och `second-failure`.
- Bildgranskning upptäckte först en för bred checkbox och därefter att bredare förhandsvisningstabell expanderade dialogen på telefon. Root rättade båda. Efter sista CSS-rättningen: riktat dator-/telefonprov 2 PASS på 7,8 sekunder i `/private/tmp/timplan-apl-distribution-overflow-fixed.log`. En ny assertion kontrollerar att hela dialogen ryms horisontellt; telefonprovet sidrullar endast APL-tabellen och visar även Åk 3.
- Sju slutliga bildfiler granskades: val, förhandsvisning och sparandeknappar på dator/telefon samt tabellens tredje år på telefon. Text och hela Spara-knappen ryms; ämnes-/årstabellen kan sidrullas. Bildmanifest med SHA-256: `/private/tmp/timplan-apl-distribution-image-review.json`.

SS 12000: förslaget är en intern budget och skapar inte Attendance eller Placement. Plan-, skol-, utbildnings- och radidentiteter samt källansvar bevaras. Ingen extern standardanslutning eller genomförd APL är verifierad här. Root sammanför modell/server/SQL/OIDC och eventuell exakt lokal leverans i huvudsammanfattningen.
