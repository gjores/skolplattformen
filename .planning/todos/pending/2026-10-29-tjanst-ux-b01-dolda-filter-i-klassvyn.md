---
created: 2026-10-29
title: "Visa klassens underlag utan dolda filter"
area: tjanstefordelning
status: pending
phase: "05.1"
report_id: B01
priority: P1
related_requirements: [TJANST-01]
files:
  - web/app/tjanst-workspace.tsx
  - web/app/tjanst-views.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Problem

Välj Matematik i Matris och gå till Per klass för TE26A. Behovet visas som 100 h och fördelat 0 h, trots att hela klassen har 300 h respektive 200 h. Ämnesfiltret och rensningen är dolda.

Källa: [UX-rapport B01](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Visa hela vald klass eller märk delmängden som Visat urval med synliga aktiva filter och rensning. Undvik omärkta delsummeringar.

## Verifiering och klart-kriterier

Pröva samtliga filter och linser före byte till olika klasser, inklusive noll träffar. Full klass eller tydligt märkt delmängd ska visas konsekvent.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** pending — registrerat för avgränsad planering i fas 05.1. Ingen ny krav-/fasacceptans eller installation. [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).
