---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TIMPLAN-HOURS-CHECK
status: ui-verified-simulated-api
verified: 2026-10-18
---

# Timkontroll – avgränsat UI-resultat

Den nya regionen **Räcker timmarna?** visar planerat, miniminivå och saknade timmar separat för GUT och yrkesprogrammets APL. Värden räknas om före sparning och märks preliminära. Otillräckliga utkast kan fortfarande sparas. Högskoleförberedande program visar bara GUT.

Detta är UI-agentens verifiering med verklig ProtectedHome, tabell, journal och kontraktsparsning samt syntetiska API-svar. Server-/SQL-beslutsspärr, aktuella mandat, verklig kandidat och eventuell installation måste redovisas separat av root/backend. Synliga syntetiska blockerare bevisar att UI respekterar API-underlaget, inte att databasen härlett rätt blockerare.

## Genomförda prov

Ny `web/e2e/timplan-hours-check.spec.ts` har sju scenarier, körda med Chromium på dator och iPhone 13/WebKit:

1. Total 2700 h når BF-profilens 2625 h, men APL 300 h visar minst 345 h och saknade 45 h. Rektors skickaknapp spärras av beslutsunderlagets blockerare.
2. Huvudmannen ser blockeraren och godkännandeknappen är inaktiverad.
3. Ändring 300 → 345 h APL räknas direkt innan blur eller sparanrop. Därefter sparas 310 h med 35 h kvar till minimum, kvitto/revision läses och värdet består efter reload.
4. Yrkesplan med APL 345 h men total 2345 h visar saknade 280 h. Osparad skolcell höjer totalen till exakt 2625 h utan att API-sparning skett.
5. Högskoleförberedande plan visar 2000/2180 h och saknade 180 h; osparad skolcell höjer till 2180 h. Ingen APL-kontroll, APL-inmatning eller planspecifik APL-knapp finns.
6. Saknat aktivt fält ger inget grönt besked trots tillräcklig känd summa. Ogiltig inmatning visar Kan inte beräknas.
7. Okänd poängomfattning visar Timkraven behöver granskas utan antagen miniminivå.

En sammanslagen syntetisk rad används för att isolera timkontrollen. Den är inte ett realistiskt programinnehåll eller bevis för behörighets-/studievägskontroll. Oförändrad plan- och revisionsidentitet kontrolleras vid utkastssparningen.

## Resultat och bevis

- **14 PASS**, inga retries, 18,7 sekunder: `/private/tmp/timplan-hours-check-third.log` och `/private/tmp/timplan-hours-check-ui.json`.
- **Typkontroll PASS**: `npx tsc --noEmit`, `/private/tmp/timplan-hours-check-tsc.log`.
- **Riktad lint PASS**: nya test- och configfilen.
- **Sex bilder visuellt granskade**: dator/telefon för låg APL, live yrkes-GUT och live högskoleförberedande GUT. Sökvägar och SHA-256 i `/private/tmp/timplan-hours-check-image-review.json`.
- **Diffkontroll PASS**. Inga äldre prov eller produktfiler ändrades av UI-agenten.

Första körningen hade en felaktig ny förväntan att blockerad godkännandeknapp skulle saknas; produkten visade den korrekt inaktiverad. Andra körningens nya selector fångade den globala APL-sidomenyn även på SA; testet avgränsades till planspecifik ingång. Dessa var testfel, inte dolda produktfel. Loggar och traces finns kvar i `/private/tmp/timplan-hours-check-first-failure` och `/private/tmp/timplan-hours-check-second-failure`.

## Begränsningar

Telefonens planeringshuvud kräver fortsatt vertikal scroll; tabellen har sidscroll. Budgetkorten staplas och deras texter bryts utan konstaterad överlappning. En grön timnivå gäller budgeten, inte genomförd undervisning, individuell rättighet eller färdig APL-förläggning.

SS 12000: denna interna timbudget skapar inte Attendance/Placement. Identifierare och käll-/versionsansvar bevaras. Inget externt standardutbyte har verifierats i denna svit. Planen anger övriga modell-, server-, SQL-, dokumentations- och leveransbevis som root sammanför.
