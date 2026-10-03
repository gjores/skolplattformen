---
created: 2026-10-03
title: Säkerställ rätt totalpoäng för varje programplan på yrkesprogrammen
area: programplaner
files:
  - web/lib/programplan-table.ts
  - web/lib/programplan-catalog.ts
  - web/lib/server/programplan-planning.ts
  - web/lib/organisation-model.ts
  - web/app/protected-programplan-workspace.tsx
  - docs/handbok/programplaner.md
---

## Problem

Användaren vill undersöka hur vi säkerställer att varje programplan på yrkesprogrammen får rätt totalpoäng. Det är ännu inte utrett vilka poängdelar som räknas (gymnasiegemensamma ämnen, programgemensamma ämnen, inriktning, programfördjupning, individuellt val och gymnasiearbete). Det är heller inte utrett var summan kontrolleras och hur avvikelser visas. Undersökningen gäller också ämnesbetyg, nivåer och poängvärden från katalogen, och vad som händer när katalogversion, inriktning eller utbildningsstart ändras.

## Solution

- Kartlägg hur totalpoängen beräknas i dag (`programplan-table.ts`, katalog och serverplanering) och om kontrollen görs i klienten, på servern eller båda.
- Fastställ regelkällan per yrkesprogram och katalogversion: förväntad totalpoäng, minsta och högsta poäng per del, och om utökat program eller reducerat program ska hanteras. Regler som saknas markeras som okontrollerade, aldrig som godkända.
- Föreslå en kontroll på servern som körs när en plan sparas eller fastställs. Den ska ge ett begripligt besked om avvikelser, per del och totalt, utan att tyst justera planen.
- Bedöm påverkan på befintliga utkast, fastställda planer, kullkopiering och kurs-/nivåtillägg. Gymnasiets befintliga flöden ska bevaras.
- Uppdatera handboken när beteendet är verifierat.

## Verification

- Varje syntetiskt yrkesprogram i provdata får rätt summa per del och totalt enligt angiven regelkälla. En plan med fel totalpoäng stoppas eller markeras med begripligt besked både på servern och i vyn.
- Byte av katalogversion eller inriktning räknas om utan att fastställda planer skrivs om.
