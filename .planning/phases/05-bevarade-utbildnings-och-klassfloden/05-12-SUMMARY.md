---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "12"
status: complete
completed: 2026-10-01
requirements: [ADMIN-02]
source_commit: 04f2eaa
build_commit: 2477d57bf97b2e27097f13cdd0115e0645e5e335
human_verification: pending
---

# 05-12 — regelhandledning i timplansvyn

Den öppnade timplanen visar nu **Innan du ändrar undervisningstiden**, med ett skolformsanpassat **Regler och ansvar**-avsnitt och daterade Skolverketlänkar. Grundskolans text förklarar klocktimmar, stadie-/ämnesramar, skolans val och beslutsansvar. Introduktionsprogrammens text förklarar garanterad veckotid och relationen till utbildningsplanen och elevens individuella studieplan. Celländringsdialogen påminner om helheten. Sparning framställs aldrig som fullständig regelkontroll.

Ingen databas, rättighet, fastställanderoute eller automatisk nationell ramvalidering ändrades. GR-vägledningen avgränsas till ordinarie timplan från 2024/2025; appen väljer inte regelversion från elevkullens etikett. IM:s samtliga rader summeras inte som bevis på garanterad undervisningstid. Fullständig avvikelseberäkning/serverkontroll kvarstår i den ursprungliga todon.

## Färska bevis

- Källor: Skolverkets timplan, skolans val och undervisningstid/ansvar, kontrollerade 2026-10-01. Oberoende GSD-läsgranskning av rättsliga sakpåståenden och faktisk inkoppling genomförd.
- Typkontroll PASS; riktad lint för ändrade UI-/browserfiler PASS. Samtidig API-implementation gav ett separat övergående lintfel i programplankontraktet som dess executor rättade; inget godkänt lintresultat här döljer det.
- Befintlig skyddad timplansmodell 9/9 PASS; skyddat bygge på 2477d57 PASS.
- Byggd Worker/PostgreSQL-browser: **20/20 PASS**, 10 Chromium desktop och 10 WebKit telefon, inga skip, retries eller flaky-fall. Sessionscookies är lokalt mintade syntetiska provbevis, inte nytt interaktivt IdP-prov.
- Nytt fall provar tangentbordsöppning, källlänkar, GR/IM-byte, båda ändringspåminnelserna och IM efter faktiskt committad celländring med tappat transportsvar och misslyckad omläsning. Befintliga fall bevarar audit, konflikt, MFA, osparat skydd, session/epok, pagination, läsvyer och försiktigt transportsvar.
- Dator-/telefonbilder för GR/IM visuellt granskade; sammanfattningens pekyta minst 44 px, inget globalt horisontellt overflow.
- Handboken uppdaterad; Docusaurusbygge PASS. Ingen publicering.

Maskinrapport: `work/pilot/results/phase5-12-guidance.json`, med byggrevision, källhashar och browserstatistik. Rå browserrapport/bildbilagor ligger ignorerat i `web/test-results/phase5-timplan.json`. Browserfixturens källinventarium utökades med den nya komponenten så gammalt bygge inte får användas som bevis. Alla egna testfixturer och triggers städades; säkerhetsloggar bevaras enligt befintlig cleanup. Provserver 3056 avslutades ordnat, förhandsvisning 3012 hålls tillfälligt avstängd för den pågående API-grinden.

## Granskningsrättningar och nästa grind

Oberoende granskning hittade att en IM-dialog kunde få GR-text när konfliktomläsning tillfälligt tar bort planen. Skolformen bevaras nu i det avgränsade cellutkastet och det nya browserfallet prövar verkligt omläsningsfel. GR-texten förtydligades dessutom med skolans vals 600 timmar och bevarad totaltid, så 20 procent inte kan tolkas som en generell minskning av undervisningstiden.

Användarens tidigare besked om godkända timplansprov gäller tidigare vyn. Förståelsebedömning av den nya handledningen ska ingå i nästa mänskliga grind tillsammans med programplansvyn i 05-11; den tillskrivs inte automatiska prov. Fas 5/ADMIN-02 och fas 4:s checkpoint är fortsatt öppna.
