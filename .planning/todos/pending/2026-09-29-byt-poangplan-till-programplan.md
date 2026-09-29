---
created: 2026-09-29
title: Byt användartermen poängplan till programplan
area: ui
files:
  - web/app/page.tsx
  - web/app/organisation-workspace.tsx
  - web/app/protected-home.tsx
  - web/app/timplan-view.tsx
  - docs/handbok/
---

## Problem

Användaren korrigerade 2026-09-29 terminologin: det ska heta programplaner, inte poängplaner. Det nuvarande gränssnittet använder fel verksamhetsord.

## Solution

- Byt synlig användarterm konsekvent till programplan/programplaner i navigation, rubriker, dialoger, meddelanden, tillgänglighetsnamn och handbok.
- Samordna med den samlade UI-genomgången och fas 5:s nya vyer; använd programplan i nytillkommen användartext.
- Bevara regler, planversioner, beslut och lagrade kopplingar. Ett namnbyte i gränssnittet kräver inte i sig ändrade databasfält eller interna API-namn.
- Pröva berörda användarflöden och bygg handboken vid genomförandet. Äldre interna bevisdokument kan behålla dåvarande namn som historik.

Status: beslutad användarterm, namnbytet är ännu inte genomfört. Användaren angav att ändringen ska göras senare.
