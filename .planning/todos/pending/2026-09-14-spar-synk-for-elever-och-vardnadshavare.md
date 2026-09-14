---
created: 2026-09-14T11:40:18.497503+00:00
title: SPAR-synk för elever och vårdnadshavare
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

Status: fångat behov för kommande planering. Ingen SPAR-anslutning är byggd eller verifierad, och befintliga fasers omfattning ändras inte genom denna todo.
