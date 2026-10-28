---
created: 2026-10-29
title: "Ge fördelningsarbetet större plats"
area: tjanstefordelning
status: pending
phase: "05.1"
report_id: F01
priority: P2
related_requirements: [TJANST-01]
files:
  - web/app/tjanst-workspace.tsx
  - web/app/tjanst.css
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Problem

Standardläget har 26 kontroller före matrisen. Matrisen börjar vid cirka 739 px på 1440×900 och 788 px på 1024×768.

Källa: [UX-rapport F01](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Korta introduktionen och samla filter och verktyg. Sikta på att första behovet med relevant val syns direkt på liten dator. Samordna med F03 och F04.

## Verifiering och klart-kriterier

Mät före/efter i full app inklusive sidomeny och planeringskontext på 1440×900, 1024×768 och telefon. Kontrollera läsbarhet, fokus och rullning.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** pending — registrerat för avgränsad planering i fas 05.1. Ingen ny krav-/fasacceptans eller installation. [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).
