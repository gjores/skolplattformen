---
created: 2026-10-29
title: "Samla sekundära verktyg och tillägg"
area: tjanstefordelning
status: done
completed: 2026-10-30
phase: "05.1"
report_id: F03
priority: P2
related_requirements: [TJANST-01, TJANST-02, TJANST-06, TJANST-07]
files:
  - web/app/tjanst-workspace.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Problem

Sex åtgärdsknappar återkommer i redigerbara vyer, inklusive två närliggande läraråtgärder.

Källa: [UX-rapport F03](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Samla Befintlig lärare, Ny lärare och Specialuppdrag under Lägg till. Samla flytt, massregistrering, tomma kolumner och uppdatering under Verktyg. Bevara förhandsvisning och tydliga benämningar.

## Verifiering och klart-kriterier

Pröva att varje befintlig åtgärd kan hittas och nås med tangentbord; prova kompletta flytt- och massregistreringsflöden inklusive felvägar efter ändrad navigation.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** klar i05.1-41; installerad på 3012 som 785b4ff. UI 274/års134/domän 56/faktiskt prov 88PASS inom [redovisad avgränsning](../../phases/05.1-tjanstefordelning/05.1-41-SUMMARY.md). Ingen formell krav-/fasacceptans.
