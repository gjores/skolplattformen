---
created: 2026-09-29
title: Modellera ersättningsbeslut och prisperioder
area: ekonomi
files:
  - web/lib/pupil-register-model.ts
  - .planning/research/HEMKOMMUN-ERSATTNING.md
---

## Problem

Daterad hemkommun och placering räcker inte för att veta vem som ska betala vilket belopp. Pris och beslut kan följa kalenderår och särskilda utbildningsregler.

## Solution

- Modellera betalande motpart, ersättningstyp, beslut/avtal, program/utbildningskod, mottagningsgrund, pris, valuta, enhet och giltighetsperiod med källreferens och revision.
- Håll grundersättning och individuellt beslutade tillägg separata. Prisregler kan vara avtal, kommunbeslut eller tillämplig riksprislista; ingen universell prioritetsordning utan fastställd regelmatris.
- Ange avstämningsdag, sommarregler, delperiod/avrundning, avbrott och retroaktivitet per beslutad process. Hårdkoda inte den 15:e eller årspris/12 som lagregel.
- Godkännandekriterier: giltigt pris vid årsskifte, ändrat program, start före/efter regelövergång, överlapp/saknad tariff som stopp samt tillägg som endast gäller under sitt beslut. Beräkningar i exakta penningenheter.

Underlag: [.planning/research/HEMKOMMUN-ERSATTNING.md](../../research/HEMKOMMUN-ERSATTNING.md).

Status: fångat önskemål/planeringsuppgift. Genomförande och fasplacering återstår; ingen ny kommunanslutning eller utökning av aktiv fas beslutad.
