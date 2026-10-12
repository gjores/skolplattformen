---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: OPERATIONAL-03
status: completed
requirements: [ADMIN-02, PLANERING-03, PLANERING-05]
updated: 2026-10-12
---

# Sökbara beslut och tydliga beslutsskeden

Inkorgen visar egna uppgifter först och har sökning, plantyp, beslutsskede, egna/väntande uppgifter och sidor om 50 rader. Alla tillåtna uppgifter nås även när de är fler än 500. Antal träffar redovisas separat från hela uppdragets globala Att göra- och beslutsräknare. Bakgrundsladdning bevarar sökfältet; gammalt uppdrags innehåll döljs direkt vid kontextbyte och försenade svar får inte återställa det.

Programplaner kan filtreras på Inväntar beslut och Tillbaka för rättning. Raderna visar beslutsskede och nästa ansvariga roll även om planen inte finns bland inkorgens första 500 objekt. Planens faktiska status är fortfarande utkast tills fastställande; beslutsskede är ett separat begrepp. Filtren följer planeringslänkens URL och valideras på servern före antal och sidindelning.

`GET /api/planbeslut/inkorg` är kompatibel med tidigare klienter, med egna uppgifter först före gränsen 500. Den nya skyddade `POST /api/planbeslut/lista` ger hela urvalet med strikt sök-/filter-/sidkontrakt och ofiltrerade globala räknare. Servern kräver verkligt mandat, tillåten roll, korrekt ursprung och auditering. Inga skrivkommandon eller rättigheter att besluta har lagts till.

SQL beräknar kända roll-/skederutter utan att bygga hela katalog- och beslutsunderlaget för varje rad. Övriga rutter använder samma detaljregler som tidigare; identiska programunderlag kan dela en avgränsad beräkning. Den bevarade klassläsningen använder exakt `class_id` för nya länkar efter 210000 och bibehåller namn-/tvetydighetsregler för äldre länkar. Ingen klasskoppling adopteras eller flyttas automatiskt.

## Färska verifieringsbevis

- 84/84 riktade Node-prov PASS för beslutskontrakt, serverrutter, planeringskontrakt och URL. Bland annat sida efter 500, noll träffar med oförändrade globala räknare, felaktig indata, ursprung, roll, audit och separata programstatus/beslutsskeden. Logg: `web/outputs/operational-decision-node.log`.
- Riktad lint PASS. Samlat typkontroll-/byggresultat redovisas av root i plan06, inte som ett separat verifierat resultat här.
- Åtta nya UI-prov på dator/telefon PASS i rootens samlade körning: huvudman/rektor/administratör med 520 uppgifter, sidbyte, sökning bortom 500, egna uppgifter, noll träffar, ofiltrerad global indikator samt programlistans två beslutsskeden och URL. Det första agentprovet kolliderade med rootens samtidiga Playwright-artifaktrensning; det senare rootprovet verifierade samtliga åtta. Äldre dialogtextkontroller rättades av root separat.
- 45/45 verkliga PostgreSQL-/TypeScript-prov PASS i isolerad rollbacktransaktion. Fyra rollers nya rutter jämfördes med tidigare detaljregler. Tre roller prövades dessutom med 520 extra programplaner, hela urvalet, egna först, sökning efter gränsen, filtrerade/globala antal, sida två och sista sida, två programskedefilter, annan skola, ogiltig indata och exakta funktionsrättigheter. Full återställning av 19 verksamhetstabeller och schema/ACL/journal. Bevis: `/private/tmp/operational-decisions-rollback-final2.json` och motsvarande `.log`, känd exit0.
- Separat DDL-rollback PASS och därefter lokal installation PASS, båda känd exit0: `/private/tmp/operational-decisions-ddl-verify.json` och `/private/tmp/operational-decisions-ddl-apply.json`. Migration `20261012220000_plan_decision_search.sql` är installerad och journalförd lokalt. Kontroll omfattade 20 verksamhetstabeller, inklusive nya klasskommandokvitton, samt full schemafingerprint. Endast tre avsedda funktionskroppar ersattes och två avsedda funktioner tillkom med begränsade rättigheter. Verksamhetsrader bevarades.

SQL-proven ligger i `work/pilot/verify-operational-decisions.mjs`, inte den ursprungligen föreslagna separata `.test.sql`-filen: samma verktyg verifierar verkligt SQL-resultat mot TypeScript-kontrakt och dokumenterar rollback. Två föregående försök finns kvar som misslyckade försök med full återställning: det första slog i timeout i den gamla projektionen för 520 objekt; det andra hade ett felaktigt antagande om att två befintliga rektorsfixturer hade olika skolor. Negativprovet korrigerades till en faktiskt annan skola. Inget av dessa försök räknas som PASS.

## Uppmätt lästid

Samma små syntetiska SQL-underlag före → efter, millisekunder: huvudman 258 → 241, rektor 243 → 4, andra rektorskontexten 248 → 4, administratör 304 → 270. Vid 520 extra programplaner avbröts den gamla rektorsprojektionen efter 10 sekunders statementtimeout (uppmätt 10 405 ms); den nya tog 509 ms. Nya huvudmans- och administratörsprojektionerna tog 623 respektive 878 ms. Ett tidigare försök med den gamla stora projektionen överskred även 120 sekunder. Dessa begränsade mätningar ersätter inte HTTP-mätning på mer varierade underlag.

Verklig HTTP-föremätning mot lokal port3012 är klar med tre riktiga OIDC-inloggningar och tre läsningar per roll. Oförändrade 20 verksamhetstabeller och 14 befintliga planer verifierades. Medianer: huvudman 4 510 ms, rektor 4 942 ms, administratör 10 689 ms. Globala egna uppgifter: 4/11/3, varav huvudmannens fyra var beslut. Privat bevis `/private/tmp/operational-decisions-http-before.json`; inga kontouppgifter, sessionshemligheter eller planidentifierare skrivs till rapporten.

Verklig HTTP-eftermätning mot det nya lokala bygget på port3012 är PASS med känd exit0. Tre OIDC-roller, 21 kontroller av nya API:et, oförändrade beslutsrutter/räknare och exakt samma 20 verksamhetshashar som före. Kontrollerna omfattar sid-API jämfört med befintlig inkorg, inskickat/återsänt, egna/väntande, noll träffar med bevarad global räknare, otillåtet extrafält och främmande ursprung. Privata bevis `/private/tmp/operational-decisions-http-after.json` och `.log`.

| Roll | Före, median | Efter, median |
| --- | ---: | ---: |
| Huvudman | 4 510 ms | 3 597 ms |
| Rektor | 4 942 ms | 974 ms |
| Administratör | 10 689 ms | 3 254 ms |

Varje median bygger på tre riktiga HTTP-läsningar på samma 14 planer, under samma mandat, med bevarade rutter och tabellhashar. Nya HTTP-sök-/filteranrop är verifierade på dessa 14; gränsen över 500 är verifierad i verklig SQL-/TypeScript-projektion och simulerad UI-transport, inte genom en beständig 520-raders HTTP-fixtur. Stora SQL-prov lämnar inga testdata i den lokala miljön.

## Kvarstående gränser

Huvudmannens och administratörens inkorgsläsning tar fortfarande cirka 3–4 sekunder i median i denna lokala mätning; första huvudmannaläsningen tog 7 319 ms. Rollerna behöver oftare det mer kostsamma befintliga detaljunderlaget. Förbättringen är uppmätt men detta är inte ett påstående om omedelbar laddning eller ett generellt prestandagaranti. Vidare optimering bör utgå från en separat mätning av dessa varierade underlag och bevara samma blockerar- och mandatregler.

Rotens plan06 redovisar den samlade lokala leveransen, handboken och full UI-/byggkontroll. Denna verifierade delplan godkänner inte hela ADMIN-02, PLANERING-03/05 eller fas05 och innebär ingen extern kommunanslutning eller driftsättning. Produktkoden samlades och pushades av root i commit `0ab2064`; agenten skapade inga egna commits.
