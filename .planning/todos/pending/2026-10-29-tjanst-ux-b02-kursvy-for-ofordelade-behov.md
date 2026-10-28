---
created: 2026-10-29
title: "Visa ofördelade behov i kursvyn"
area: tjanstefordelning
status: pending
phase: "05.1"
report_id: B02
priority: P2
related_requirements: [TJANST-01, TJANST-03]
files:
  - web/app/tjanst-views.tsx
  - web/app/tjanst-workspace.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Problem

Klick på ofördelad Matematik 1c i Matris leder till Per kurs/ämne med Inga tjänsterader ännu. Det kända behovet på 100 h i TE26A syns inte i innehållet.

Källa: [UX-rapport B02](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Låt kursvyn visa klassernas behov även utan sparade tjänsterader och erbjuda en väg till Fördela. Visa alla klasser med kursen ska omfatta ofördelade klasser.

## Verifiering och klart-kriterier

Öppna ofördelad, delvis fördelad och fördelad kurs. Kontrollera att kända behov, klasser och nästa handling finns utan ett tidigare lärarval.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** pending — registrerat för avgränsad planering i fas 05.1. Ingen ny krav-/fasacceptans eller installation. [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).
