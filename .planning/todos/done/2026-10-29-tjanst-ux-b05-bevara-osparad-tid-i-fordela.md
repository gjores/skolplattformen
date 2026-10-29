---
created: 2026-10-29
title: "Bevara osparad tid vid byte av vy"
area: tjanstefordelning
status: completed
completed: 2026-10-29
verification: synthetic_ui
deployment: not_installed
phase: "05.1"
report_id: B05
priority: P1
related_requirements: [TJANST-01, TJANST-06]
files:
  - web/app/tjanst-allocation.tsx
  - web/app/tjanst-workspace.tsx
  - web/lib/unsaved-changes.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Problem

Ändra HT från 50 till 37 i Fördela, byt till Per lärare och tillbaka. Tiden är åter 50 utan varning och osparat-signalen är false. Inget sparkommando skickades; fyndet gäller osparad inmatning.

Källa: [UX-rapport B05](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Bevara inmatning per behov i arbetsytan och anslut ändrade tider till skyddet för osparat arbete. Erbjud medveten återställning.

## Verifiering och klart-kriterier

37 ska finnas kvar efter vybyte. Pröva också behovsbyte, skola/läsår, storleksbyte och lämnad arbetsyta samt sparfel och uttrycklig återställning.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** completed — lokalt rättad och verifierad med syntetiska komponentprov i 05.1-35. Ingen installation, faktisk databasverifiering eller ny krav-/fasacceptans. [Genomförande och begränsningar](../../phases/05.1-tjanstefordelning/05.1-35-SUMMARY.md). [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).
