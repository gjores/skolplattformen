---
created: 2026-10-21
title: Fokus återgår ibland inte till cellen efter sparad tjänsterad
area: tjänstefördelning
files:
  - web/app/tjanst-workspace.tsx
  - web/app/tjanst-matrix.tsx
  - web/e2e/tjanst-actual.spec.ts
---

## Problem

I en utvecklingskörning av det faktiska provet i 05.1-09 hamnade fokus inte på matriscellen efter att en tjänsterad sparats (kontrollen `toBeFocused` vid spar-fallet). Felet gick inte att återskapa i fyra riktade försök, och kontrollen passerar i alla senare körningar, även den slutliga. Maskinen var då hårt belastad (load 100+). Felet är troligen tidsberoende.

UI-SPEC kräver att fokus går tillbaka till cellen eller knappen som öppnade dialogen. En tangentbords- eller skärmläsaranvändare som tappar fokus hamnar annars överst på sidan och måste leta sig tillbaka.

Trolig orsak, inte bevisad: `close()` i `tjanst-workspace.tsx` sparar cellen i `pendingFocus` och anropar `applyFocus` i nästa bildruta. Efter sparningen läses fördelningen om, och under läsningen är innehållet `inert`.
- Om bildrutan kommer före läsningen får cellen fokus och `pendingFocus` töms. När innehållet sedan blir `inert` tappar cellen fokus, och efter läsningen finns inget kvar att återställa.
- Om matrisen ritar om cellen som ett nytt element blir det gamla elementet frånkopplat, och fokus går till rubriken i stället.

## Solution

- Återskapa felet deterministiskt, till exempel genom att fördröja läsningen eller bildrutan i ett komponentprov.
- Återställ fokus först när omläsningen är klar. Hitta cellen igen med en stabil nyckel (lärare, ämnesrad, klass) i stället för att hålla en referens till det gamla elementet.
- Behåll kontrollen i `tjanst-actual.spec.ts` och lägg till ett komponentprov med fördröjd läsning.

Status: gap fångat. Ingen kod är ändrad.

## Löst 2026-10-26

Åtgärdat i [05.1-26](../../phases/05.1-tjanstefordelning/05.1-26-SUMMARY.md) och provat med simulerat UI och faktiskt prov på kandidat 6b1a906. Ännu inte installerat på 3012.
