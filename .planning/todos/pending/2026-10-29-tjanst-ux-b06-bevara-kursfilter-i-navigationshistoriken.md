---
created: 2026-10-29
title: "Bevara kursfiltret vid omladdning och navigation"
area: tjanstefordelning
status: pending
phase: "05.1"
report_id: B06
priority: P2
related_requirements: [TJANST-01]
files:
  - web/app/tjanst-workspace.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Problem

Efter klick på Matematik 1c syns kursfiltret, men history.state.tjanst.filter.course är tomt. Omladdning tappar kursavgränsningen.

Källa: [UX-rapport B06](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Uppdatera vy, filter och historiktillstånd som en gemensam övergång. Bevara principen att person- och klassval inte skrivs i URL.

## Verifiering och klart-kriterier

Kontrollera omladdning, Bakåt och Framåt efter kursklick och länk till samläsning. Samma urval ska visas och sparas i historiktillståndet.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** pending — registrerat för avgränsad planering i fas 05.1. Ingen ny krav-/fasacceptans eller installation. [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).
