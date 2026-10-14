---
created: 2026-10-14
title: Kortare väntetid vid inläsning av programplaner och timplaner
area: planning
status: pending
phase: 05
---

# Användarrapporterat problem

Användaren upplever att programplaner och timplaner tar mycket lång tid att läsa in i den lokala appen på port 3012 och bad 2026-10-14 att detta läggs i backloggen. Den bifogade skärmbilden visar utbildningsöversikten med sökfält, filter och beskedet ”Läser planeringsunderlaget...”. Timplanernas väntetid är rapporterad i text. Exakt varaktighet, roll, datamängd och grundorsak är ännu inte uppmätta.

# Uppföljning

- Mät tiden till användbar översikt och öppnad plan separat för programplaner och timplaner, inklusive första besök, återbesök samt byte av skola och planeringsår.
- Följ hela läskedjan från användarens val till visad vy; särskilj databas-, API- och klienttid samt upprepade eller sekventiella anrop.
- Jämför med tidigare avgränsade förbättringar i 05-38-READ-PERFORMANCE och 05-OPERATIONAL-VERIFICATION. Historiska mätningar visar inte att dagens upplevda väntetid är acceptabel eller att orsaken är densamma.
- Åtgärda identifierade flaskhalsar och ge begriplig återkoppling under väntan. Behörighetskontroller, aktuella versioner och skydd mot inaktuella svar ska bevaras.
- Redovisa jämförbara före-/eftermätningar för samma data och roller, inklusive långsamma anrop. Verifiera berörda flöden på dator och telefon och låt användaren bedöma väntetiden igen.

Registrerad som backlogg enligt användarens önskemål. Ingen prestandarättning eller ny verifiering är genomförd med denna notering. Pågående kopie-/klassprov är fortsatt öppet; rapporten utgör inget godkännande av provet.
