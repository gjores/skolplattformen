---
created: 2026-11-07
title: Modersmål, teckenspråk och minoritetsspråk i valbara block
area: planning
status: pending
phase: "05.2"
requirements: [GROUP-01]
---

**Tas efter VP-15**, enligt användarbeslut 2026-11-07. Ska inte bakas in i VP-11–15.

## Lucka

Programplanen tillåter paket med modersmål och svenskt teckenspråk för hörande i samma block som moderna språk (05-23-CONTEXT), men valplanen bär inte dem i typerna Moderna språk och Språkämne. En elev kan då inte välja dem där, trots att programplanen erbjuder dem.

Luckan kom med VP-01 (2026-11-03), som skrev in `MODY`, `MODG`, `MODO` och `MODF` i stället för att använda språktrapporna i `web/lib/programplan-languages.ts`. De gamla valbara blocken följde trapporna. Inget beslut väljer bort språken, så "äldre lucka" i VP-10-sammanfattningen är missvisande.

Läge enligt koden 2026-11-07, inte provat i appen:

- `MODE` filtreras bort i vyn för alla blocktyper. Valplanen tillåter språk bara på de fyra koderna, så Modersmål 1 på arabiska och på somaliska kan inte skiljas åt.
- Teckenspråk och minoritetsspråk släpps igenom i Individuellt val och Programfördjupning, men inte i Moderna språk och Språkämne.

## Lösning att pröva

Låt valplanen följa `PROGRAMPLAN_LANGUAGE_LADDERS` i modell, vy och databas i stället för den fasta listan. Språkkravet följer varje trappa: modersmål kräver språk, teckenspråk har inget språk och minoritetsspråken har språket givet.

## Kontrollera vid planering

- Språkämne ska avgöras för sig. Programplanens regel för modersmål och teckenspråk gäller blocket Moderna språk, och 4 kap. 1 a § räknar upp språkämnena.
- Regeln att samma kurs är samma ämne, nivå och språk (VP-14) ska gälla även modersmål.
- Grupper och tjänstefördelning ska hålla isär språken på samma kurs.
- Handboken beskriver luckan och ska ändras i samma leverans.
- SS 12000: ange i planen hur språket i undervisningsgruppen förhåller sig till standarden.
