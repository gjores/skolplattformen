---
created: 2026-10-07
title: Släpp Gy11 i Skolplattformen
area: programplan
status: pending
related_requirements: [ADMIN-02, ADMIN-03, LLEG-03, PLANERING-02]
phase: "05 och senare"
files:
  - web/lib/syllabus.ts
  - web/lib/admin-model.ts
  - web/app/admin-workspace.tsx
  - web/scripts/fetch-syllabus.mjs
  - web/lib/syllabus.test.mjs
  - web/lib/programplan-catalog.test.mjs
  - web/lib/admin-model.test.mjs
  - docs/programplansgrund-kontrakt.md
---

## Användarbeslut

2026-10-07: Gy11 kan släppas helt. Gy25 är enda läroplan i Skolplattformen.

## Vad som gäller

- Plan Digital hanterar Gy11 och Gy25 som skilda program och har dubbletter av kurser med olika koder. Skolplattformen behöver ingen kursekvivalens mellan Gy11 och Gy25.
- Gy11-förekomsten i koden är liten (sju filer i `web/`, ingen i `supabase/`): typen `Regime` i `syllabus.ts`, demoeleverna i `admin-model.ts` och två etiketter i `admin-workspace.tsx`. `fetch-syllabus.mjs` tar redan inte med utgångna Gy11-program. Ett bortval i koden är därför litet, men tester och dokument som nämner Gy11 behöver gås igenom.
- LLEG-03 nämner Gy11/Gy25 och ska förenklas till Gy25.
- Katalogartefaktet (05-07) och programplansgrunden bygger på en snapshot 2026-09-05. Kontrollera att bortvalet inte ändrar resolvern för I-val, där Plan Digital blandar kurskoder från båda läroplanerna.

## Förslag på steg

1. Kontrollera vilka Skolverksobjekt som har typen Gy11 och om något Gy25-program refererar till dem (I-val).
2. Ta bort Gy11 ur `Regime` och demodata. Uppdatera tester och dokument. Bevara historiska SUMMARY-filer som historik.
3. Dokumentera begränsningen: elever och klasser som ännu läser Gy11 (2024-kullen under 26/27) hanteras inte av Skolplattformen. De ligger kvar i Plan Digital tills läsår 27/28.

## Öppna frågor

- Finns det elever som läser om eller kompletterar Gy11-kurser efter juni 2027? Kontrollera Skolverkets övergångsregler.
- Vilka Gy11-kurser finns kvar i IVAL26 och ska de försvinna ur I-val i Skolplattformen?

**Status: pending.** Slutsatsen att 2024-kullen läser Gy11 och 2025-kullen Gy25 bygger på kurskoderna i Plan Digital, inte på Skolverket.
