---
created: 2026-10-29
title: "Förenkla filter och visningsinställningar"
area: tjanstefordelning
status: pending
phase: "05.1"
report_id: F04
priority: P2
related_requirements: [TJANST-01]
files:
  - web/app/tjanst-lens-bar.tsx
  - web/app/tjanst-workspace.tsx
  - web/lib/tjanst-lens.ts
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Problem

Lins, flera filter, avvikelsefilter, sparade linser och kolumninställningar konkurrerar om samma utrymme.

Källa: [UX-rapport F04](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Pröva Visa: Alla behov, Ofördelat och Samläsningar. Visa aktiva filter som borttagbara etiketter. Samla sparade vyer, fästning och kompakta kolumner under Visningsinställningar. Samordna B01.

## Verifiering och klart-kriterier

Kontrollera filterkombinationer, noll träffar, rensning, fästa kolumner, sparade vyer och beständighet per skola/läsår. Dator- och telefonkontroller krävs.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** pending — registrerat för avgränsad planering i fas 05.1. Ingen ny krav-/fasacceptans eller installation. [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).

**Avstämning30 oktober:** delvis hanterad, fortsatt pending. Filter/Visning och aktivt filterantal är genomförda i plan 41; rensning, sparade linser och kolumner har regressioner. Borttagbara etiketter och resterande förenkling av linsval återstår. Alla lärare visas som standard; endast uttryckligt lärarfilter eller eget relevansval begränsar kolumnerna. [Senaste leverans](../../phases/05.1-tjanstefordelning/05.1-41-SUMMARY.md).
