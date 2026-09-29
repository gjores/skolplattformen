---
created: 2026-09-29
title: Skapa granskningsbart ersättningsunderlag per hemkommun
area: ekonomi
files:
  - web/lib/pupil-register-model.ts
  - .planning/research/HEMKOMMUN-ERSATTNING.md
---

## Problem

Ersättningen måste bygga på giltiga perioder och beslut, inte på en dagens elevlista som ändras efter fakturering.

## Solution

- Skapa underlag för beslutad avstämningsperiod från hemkommun-, skolplacerings- och utbildningsperioder samt giltigt ersättningsbeslut och pris.
- Visa beräkningsgrund, datum, tariffversion, delbelopp och avvikelser med spårning till källans revision. Hantera byte av kommun/skola/program, avbrott och sommar enligt beslutade regler.
- Stoppa oklara betalare, luckor/överlapp, saknade priser och möjliga dubbelanspråk. Manuell avvikelselösning ska ha skäl och historik.
- Godkännandekriterier: samma indata ger samma belopp, samtidiga registerändringar ger omprövning före attest, omkörning skapar inget dubbelt krav och syntetiska gränsfall är beräknade med ekonomiansvarig. Beroenden: beslut, prismodell och behörighetsregler.

Underlag: [.planning/research/HEMKOMMUN-ERSATTNING.md](../../research/HEMKOMMUN-ERSATTNING.md).

Status: fångat önskemål/planeringsuppgift. Genomförande och fasplacering återstår; ingen ny kommunanslutning eller utökning av aktiv fas beslutad.
