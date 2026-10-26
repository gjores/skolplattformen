---
created: 2026-10-21
title: Bemanning bryter datumet i ”Publicerad version 2, 2026-10-21” vid bindestrecket
area: tjänstefördelning
files:
  - web/app/bemanning-workspace.tsx
  - web/e2e/tjanst-actual.spec.ts
---

## Problem

Fynd från det faktiska provet i 05.1-09 (skärmbild i `/private/tmp/tjanst-actual-evidence/`): i huvudmannens vy Bemanning radbryts statusraden ”Publicerad version 2, 2026-10-21” mitt i datumet, vid ett bindestreck. Datumet blir svårt att läsa. Felet är kosmetiskt och ändrar inga uppgifter.

## Solution

- Håll ihop datumet, till exempel med `white-space: nowrap` på datumdelen eller med icke-brytande bindestreck (U+2011). Samma metod som för ”Andel här 100 %” (hårt mellanslag) i 05.1-09.
- Kontrollera andra datum i tjänstefördelningens vyer (panelens historik, Min tjänst, Personal) på samma sätt.
- Pröva på telefon (390 och 320 px) och lägg till en kontroll i `tjanst-actual.spec.ts` att datumet ligger på en rad.

Status: gap fångat. Ingen kod är ändrad.

## Löst 2026-10-26

Åtgärdat i [05.1-26](../../phases/05.1-tjanstefordelning/05.1-26-SUMMARY.md) och provat med simulerat UI och faktiskt prov på kandidat 6b1a906. Ännu inte installerat på 3012.
