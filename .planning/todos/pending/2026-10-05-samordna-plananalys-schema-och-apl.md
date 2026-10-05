---
created: 2026-10-05
title: Samordna analysen för programplan, timplan och schema samt utred APL
area: planering
status: pending
requirements: [ADMIN-02, ADMIN-04, SCHEMA-01, SCHEMA-03, SCHEMA-07, SCHEMA-08]
files:
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-IMPLEMENTATION.md
  - .planning/research/SCHEMAMODUL-PROJEKT.md
  - web/lib/programplan-analysis.ts
  - web/lib/timplan-analysis.ts
  - web/lib/lasar-model.ts
  - docs/produktunderlag/07-projektbeskrivning-och-design.md
---

## Problem och användarbeslut

Användaren bekräftade 2026-10-05 att analysen ska vara sammanhållen mellan programplan och timplan och senare visa sambandet med schemat. Användaren vill också se över APL och bad att detta registreras i GSD för fortsatt arbete.

Programplanens innehåll och poäng, timplanens undervisningstid och schemats konkreta tillfällen behöver kunna jämföras utan skilda eller motstridiga besked. APL berör samma kedja samt elevens placering och uppföljning. Den nuvarande läsårsmodellen har APL som orsak till gruppavvikelse; det är inte ett komplett APL-flöde. Produktunderlagets mer omfattande placerings-/handledar-/lärandeflöde är ett förslag, inte genomförd funktion.

## Avsikt och kommande arbete

- Ge en gemensam analysöverblick med relevanta detaljer i programplan respektive timplan. Kontrollera innehåll, nivåer, poäng, terminer och undervisningstid samt sambandet mellan dem. Behåll separata beslutsstatusar: fastställd programplan innebär inte färdig timplan.
- Utöka samma analys när schemamodulen finns: jämför timplanens undervisningsbehov med schemalagd tid för rätt klass, undervisningsgrupp och period. Använd faktisk läsårskalender och gruppavvikelser, inte en normalvecka multiplicerad med ett antaget veckotal.
- Bevara exakta versioner, stabila innehålls-/gruppreferenser, skolmandat och tydlig ägare till varje uppgift. Ändrad källa ger synlig avvikelse; tidigare fastställda planer och klasskopplingar skrivs inte om automatiskt.
- Gör avvikelser åtgärdbara med förklaring och länk till rätt rad, termin eller schematillfälle. Skilj egna osparade värden från analys av sparad revision och saknat underlag från bevisat fel.
- Kartlägg APL genom programplan → timplan → schema → elevplacering och uppföljning. Precisera vilka ämnen/nivåer eller delar av dem som förläggs till arbetsplats, perioder, berörda elever/grupper, skolundervisning under perioden och lärarens uppföljning.
- Utred aktuella APL-regler med daterade primärkällor och utbildnings-/kullspecifika profiler, inklusive skillnader mellan skolförlagd yrkesutbildning och lärlingsutbildning. Verifiera beräkningsmetod innan APL räknas in i analys eller beslutsgrund. Gissa inte omräkning mellan veckor, poäng och timmar och undvik dubbelräkning mellan skola och arbetsplats.
- Skilj planerad APL, schemalagd tid, genomförd tid och lärande/bedömningsunderlag. En placering eller närvaroregistrering bevisar inte att ett lärandemål är uppnått. Precisera arbetsplats, handledare, ansvarig lärare och deras avgränsade åtkomst i ett eget genomförandesteg.

## Placering i GSD

Ansvar för den första sammanhållna program-/timplansanalysen ligger i fas 5, med precisering av återstående 05-29/05-31 och slutprov 05-34/05-35 före deras genomförande. Samordna yrkesprofilen med det ännu oplanerade 05-17 och befintlig todo om yrkesprogrammens totalpoäng. En APL-kontrollpunkt i analysen får inte redovisas som ett komplett APL-flöde.

Schemakopplingens kontrakt hör till schemadelprojektets S1 och prov av jämförelse/synk till S4, under SCHEMA-01/03/07/08. Full placering, handledaråtkomst och pedagogisk uppföljning behöver avgränsas och få egna planer/krav innan implementation. Denna todo utökar inte automatiskt pilotens 42 krav eller ändrar aktuell genomförandeordning.

Relaterat: [skapa timplan från programplan](2026-10-03-skapa-timplaner-fran-programplaner.md), [programanalysens luckor](2026-10-04-komplettera-programplanens-analys.md), [yrkesprogrammens totalpoäng](2026-10-03-sakerstall-totalpoang-for-yrkesprogrammens-programplaner.md), [timplanspaketet](../../phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-IMPLEMENTATION.md) och [schemadelprojektet](../../research/SCHEMAMODUL-PROJEKT.md).

## Verifieringsmål, ännu inte genomförda

- En avvikelse mellan programplanens terminsinnehåll och timplanen visas i den gemensamma analysen och leder till rätt redigeringsställe. Separata beslutsstatusar och källversioner är begripliga på dator och telefon.
- Ett syntetiskt fall med 80 planerade timmar och 70 schemalagda timmar visar 10 timmar kvar för samma innehåll, grupp och period. Lov, inställda tillfällen och genomförd tid redovisas enligt sina egna uppgifter.
- En APL-period kopplas till rätt elever och innehåll utan att både skollektioner och arbetsplatstid räknas för samma underlag. Delad grupp och kvarvarande skolundervisning provas.
- Saknad APL-regelprofil eller ofullständiga placeringar ger en tydlig kontrollpunkt, aldrig ett obestyrkt godkännande. Lärande som saknar uppföljningsunderlag blir inte uppfyllt enbart genom registrerad tid.
- Ny planversion, ändrad APL-period och återkallat mandat prövas med bevarad historik och explicita konsekvenser. Full handledar-/placeringsverifiering hör till de egna kommande planerna.

Status: användarbeställd riktning och registrerad todo. Utredning, avgränsade genomförandeplaner, implementation och användarverifiering återstår.
