---
created: 2026-09-14T11:40:18.497503+00:00
title: SPAR-synk för elever och vårdnadshavare
updated: 2026-09-29
area: integration
files:
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
---

## Problem

Användaren behöver synk med SPAR för elever och vårdnadshavare, så att relevanta personuppgifter kan hållas aktuella i skolplattformen.

## Solution

- Utred SPAR:s tillgängliga uppgifter, anslutningsvillkor och uppdateringsmöjligheter för den tänkta kunden.
- Fastställ vilka elev- och vårdnadshavaruppgifter som ska synkas, med vilket intervall och vilken källa som ansvarar för varje uppgift.
- Verifiera särskilt om och hur vårdnadshavarrelationer kan hämtas; anta inte att SPAR tillhandahåller alla nödvändiga relationer. Identifiera kompletterande källa vid behov.
- Planera säker matchning, ändringshistorik, konflikt- och felhantering samt hantering av skyddade personuppgifter och ändrade vårdnadsförhållanden.
- Samordna med elevregistret och kommunintegrationerna. Prova med syntetiska data före en separat verifierad verklig anslutning.

## Förtydligande 2026-09-29

Användaren bad att framtida synk mot SPAR eller Skatteverket ska finnas i GSD:s todo-lista efter genomgången av fas 4:s källavvikelser. Utred vilken faktisk tjänst och anslutningsväg som kan användas; SPAR och andra tjänster från Skatteverket ska inte behandlas som utbytbara eller som redan beslutade anslutningar.

- När synken lämnar ett annat värde än en lokal rättelse ska behörig administratör kunna se skillnaden och uttryckligen välja att behålla den lokala rättelsen eller använda källans värde enligt beslutat skrivansvar.
- Koppla den framtida anslutningen till registrets befintliga ursprung, avvikelsehantering och historik. Verifiera återkommande leveranser, fel och behörigheter med syntetiska uppgifter före faktisk anslutning.
- Fas 4:s simulerade källa är provunderlag, inte en byggd eller godkänd SPAR-/Skatteverksanslutning.

Status: fångat behov för kommande planering. Ingen SPAR-anslutning är byggd eller verifierad, och befintliga fasers omfattning ändras inte genom denna todo.
