---
created: 2026-10-21
title: Pröva tilldelningsdialogen för Egen tjänst i Mandat faktiskt
area: mandat
files:
  - web/app/mandate-grant-dialog.tsx
  - web/app/mandate-workspace.tsx
  - web/e2e/tjanst-actual.spec.ts
  - work/pilot/tjanst-oidc-fixtures.mjs
---

## Problem

I det faktiska provet i 05.1-09 får self-läraren P1 mandatet Egen tjänst direkt i testdatan, med samma SQL-funktion som dialogen använder. Ingen användare har tilldelat mandatet genom dialogen i Mandat mot en riktig server. Dialogen har bara komponentprov mot simulerade API-svar (05.1-07). Det är alltså inte visat att huvudmannen kan ge en lärare Egen tjänst genom gränssnittet, med bindning till personen, engångskod och logg.

## Solution

- Lägg till ett faktiskt fall i `tjanst-actual.spec.ts`: huvudmannen öppnar Mandat, ger en syntetisk lärare utan mandat Egen tjänst med bindning till personen, verifierar med engångskod och ser mandatet i listan. Läraren loggar sedan in och landar i Min tjänst.
- Pröva också att dialogen inte erbjuder grupper, elever eller ärenden för Egen tjänst (beslut A 2026-10-19), och att en obehörig roll får 403.
- Kör på dator och telefon enligt mönstret i `verify-tjanst-actual.mjs` och redovisa ej körda fall som ej körda.

Kan tas med i användarprovet i 05.1-10, men ersätter inte ett automatiskt faktiskt prov.

Status: gap fångat. Ingen kod är ändrad.
