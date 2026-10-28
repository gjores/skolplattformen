---
created: 2026-10-29
title: "Gör publiceringshinder synliga och handlingsbara"
area: tjanstefordelning
status: pending
phase: "05.1"
report_id: F06
priority: P2
related_requirements: [TJANST-04]
files:
  - web/app/tjanst-publish-panel.tsx
  - web/app/tjanst-workspace.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Problem

Det syntetiska hindret syns först i öppnad panel. Listan ger ingen direkt väg till den felande raden.

Källa: [UX-rapport F06](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Visa antal hinder i statusraden och en väg till vad som återstår. Länka till berört objekt där underlaget identifierar det. Skilj blockerande fel från vanliga planeringsavvikelser.

## Verifiering och klart-kriterier

Pröva noll, ett och flera hinder, okänt målobjekt samt rättad rad och omläsning. Bevara rektors uttryckliga publiceringsbeslut och kontrollera faktiska servermandat i berört flöde.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** pending — registrerat för avgränsad planering i fas 05.1. Ingen ny krav-/fasacceptans eller installation. [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).
