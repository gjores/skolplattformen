---
created: 2026-09-29
title: Välj hemkommun från sökbar kommunlista
area: elevregister
files:
  - web/app/pupil-dialogs.tsx
  - web/app/pupil-card.tsx
  - web/lib/pupil-register-model.ts
  - .planning/research/HEMKOMMUN-ERSATTNING.md
---

## Problem

Användaren vill 2026-09-29 kunna välja kommun från en lista. Nuvarande dialog kräver kommunkod i fritext.

## Solution

- Ersätt kodinmatningen med sökbart val av kommunnamn, med kod som stöd. Lagra fortsatt fyrsiffrig kommunkod som text.
- Utgå från daterad officiell SCB-förteckning; planera uppdatering och historiska/inaktiva koder utan att förstöra tidigare hemkommunperioder.
- Visa begripliga kommunnamn i kort, perioder och bekräftelse där användaren redan har åtkomst. Kommunnamnet får inte kringgå anonymisering eller källägarskap.
- Bevara startdatum, historik, konflikter och mandat; validera vald kod på servern. Okänd äldre kod ska synliggöras som avvikelse utan automatisk omskrivning.
- Godkännandekriterier: hitta kommun på namn och kod, bevara 0180 som text, tangentbord och telefon, korrekt historik efter kommunbyte och inget kommunröjande för obehöriga. Uppdatera berörd handbok och kör dokumentationsbygge vid genomförande.

Källa: [SCB:s kommunförteckning](https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/lan-och-kommuner/).

Underlag: [.planning/research/HEMKOMMUN-ERSATTNING.md](../../research/HEMKOMMUN-ERSATTNING.md).

Status: fångat önskemål/planeringsuppgift. Genomförande och fasplacering återstår; ingen ny kommunanslutning eller utökning av aktiv fas beslutad.
