---
created: 2026-10-29
title: "Låt lärarsökningen omfatta förslag"
area: tjanstefordelning
status: completed
completed: 2026-10-29
verification: synthetic_ui
deployment: not_installed
phase: "05.1"
report_id: B03
priority: P2
related_requirements: [TJANST-01, TJANST-06]
files:
  - web/app/tjanst-allocation.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Problem

Sök ZZZINGEN i Fördela. Anna och Bertil finns kvar som valbara historiska förslag utan att matcha sökningen.

Källa: [UX-rapport B03](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Filtrera alla kandidater med samma sökregel. Om förslag ska vara opåverkade behövs en separat tydligt märkt lista. Bevara förklarade förslag utan förval.

## Verifiering och klart-kriterier

Obefintligt namn ger noll träffar, exakt namn rätt lärare. Enter och siffertangenter får bara välja en synlig, begripligt identifierad kandidat.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** completed — lokalt rättad och komponentverifierad i 05.1-36. Ingen installation, faktisk server-/databasverifiering eller ny krav-/fasacceptans. [Resultat och begränsningar](../../phases/05.1-tjanstefordelning/05.1-36-SUMMARY.md). [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).
