---
created: 2026-09-29
title: Koppla ersättning till ekonomisystem och avstämning
area: integration
files:
  - .planning/research/HEMKOMMUN-ERSATTNING.md
---

## Problem

Ett underlag blir inte betalt genom en lyckad export. Kommunens process kan kräva e-faktura, elevrapportering eller avstämning av initierad utbetalning.

## Solution

- Fastställ ekonomisystemets ägarskap över fakturanummer, kontering, reskontra och bokföring samt kommunens mottagaridentitet, referens och matchningskrav.
- För fakturaflöde: utred ekonomisystemets Peppol BIS Billing 3-stöd, validering och kreditnotor. Pröva e-fakturalagens tillämplighet för den konkreta transaktionen; kommun som betalare räcker inte för slutsatsen.
- För utbetalningsflöde: importera/rapportera enligt beslutat kontrakt och matcha utbetalning mot underlaget. Skilj export, teknisk mottagning, accepterad faktura, betalning och differens.
- Använd stabil överföringsnyckel, säkra återförsök och avvikelsekö så nätverksavbrott inte skapar dubbla fakturor. Första steg kan vara granskad överföring av underlag till befintligt ekonomisystem.
- Godkännandekriterier: syntetiskt omförsök, fel mottagare, avvisad faktura, kredit och delbetalning; verklig anslutning verifieras separat med vald partner. Beroenden: processbeslut, säkerhet och attest/rättelse.

Underlag: [.planning/research/HEMKOMMUN-ERSATTNING.md](../../research/HEMKOMMUN-ERSATTNING.md).

Status: fångat önskemål/planeringsuppgift. Genomförande och fasplacering återstår; ingen ny kommunanslutning eller utökning av aktiv fas beslutad.
